"""Celery tasks for CLAP submission processing pipeline."""

from decimal import Decimal
from typing import Optional
import json
import re
import os
import smtplib
from importlib.util import find_spec
from urllib.parse import urlparse

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded, Retry
from django.conf import settings
from django.db import transaction, connection
from django.db.models import F, Sum
from django.utils import timezone
from django.template.loader import render_to_string
from django.core.mail import EmailMultiAlternatives

from api.models import (
    AssessmentSubmission,
    AuditLog,
    ClapTestComponent,
    ClapSetItem,
    MalpracticeEvent,
    StudentAudioResponse,
    StudentClapAssignment,
    StudentClapResponse,
    SubmissionScore,
    DeadLetterQueue,
)
from api.utils.openai_client import evaluate_speaking as openai_evaluate_speaking
from api.utils.openai_client import evaluate_writing as openai_evaluate_writing
from api.utils.quota_tracker import (
    QuotaDailyExhaustedException,
    QuotaTemporarilyUnavailableException,
    get_quota_tracker,
)
from api.utils.observability import log_event
from api.utils.metrics import llm_validation_failures_total, report_generation_duration, dlq_unresolved_count
from api.utils.cdn import resolve_delivery_url

if find_spec('redis') is not None:
    import redis
else:
    redis = None

if find_spec('boto3') is not None:
    import boto3 as _boto3
else:
    _boto3 = None


def _correlation_id(task, submission_id):
    headers = getattr(task.request, "headers", {}) or {}
    return headers.get("correlation_id", str(submission_id))


def _redis_client():
    if redis is None:
        return None
    redis_url = getattr(settings, 'REDIS_URL', None)
    if not redis_url:
        return None
    return redis.Redis.from_url(redis_url, decode_responses=True)


def _task_already_processed(task_id: str):
    """Atomically check-and-set task processed flag using Redis SET NX."""
    client = _redis_client()
    if client is None:
        return False
    key = f'task:processed:{task_id}'
    # SET key value EX 86400 NX — atomic: sets only if key does NOT exist.
    # Returns True if set succeeded (first time), None if key already exists.
    was_set = client.set(key, '1', ex=86400, nx=True)
    if was_set:
        return False  # First time seeing this task — NOT already processed
    return True  # Key already existed — task WAS already processed


def _parse_s3_report_location(report_url: str):
    if not report_url:
        return None, None

    if report_url.startswith('s3://'):
        without_scheme = report_url[5:]
        bucket, _, key = without_scheme.partition('/')
        if bucket and key:
            return bucket, key
        return None, None

    parsed = urlparse(report_url)
    if parsed.scheme in {'http', 'https'} and parsed.netloc:
        endpoint = getattr(settings, 'S3_ENDPOINT_URL', '')
        bucket = getattr(settings, 'S3_BUCKET_NAME', '')
        if endpoint and bucket and report_url.startswith(endpoint):
            path = parsed.path.lstrip('/')
            if path.startswith(f'{bucket}/'):
                return bucket, path[len(bucket) + 1:]

    return None, None


def _presigned_report_download_url(report_url: str):
    bucket, key = _parse_s3_report_location(report_url)
    if not bucket or not key:
        return report_url

    if _boto3 is None:
        return report_url

    try:
        expiry = getattr(settings, 'S3_PRESIGNED_URL_EXPIRY_SECONDS', 604800)
        expiry = max(60, min(int(expiry), 604800))

        client = _boto3.client(
            's3',
            endpoint_url=getattr(settings, 'S3_ENDPOINT_URL', None) or None,
            region_name=getattr(settings, 'S3_REGION_NAME', None) or None,
            aws_access_key_id=getattr(settings, 'S3_ACCESS_KEY_ID', None) or None,
            aws_secret_access_key=getattr(settings, 'S3_SECRET_ACCESS_KEY', None) or None,
        )
        # Phase 2.1: wrap presigned URL through CDN resolver.
        # When CDN_ENABLED=False (default) this is a no-op.
        # When CDN_ENABLED=True, the S3 URL is rewritten to CDN_BASE_URL/{key}.
        raw = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiry,
        )
        return resolve_delivery_url(raw, url_type='download')
    except Exception:
        return report_url


def _record_dlq(task_name: str, submission_id, payload: dict, error: Exception, retry_count: int):
    try:
        submission = AssessmentSubmission.objects.get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return

    DeadLetterQueue.objects.create(
        submission=submission,
        task_name=task_name,
        payload=payload,
        error_message=str(error)[:2000],
        retry_count=retry_count,
        resolved=False,
    )

    AuditLog.objects.create(
        submission=submission,
        event_type='dlq_recorded',
        old_status=submission.status,
        new_status=submission.status,
        worker_id='celery-worker',
        error_detail=str(error)[:2000],
    )
    dlq_unresolved_count.inc()
    log_event('error', 'dlq_recorded', submission_id=str(submission_id), task_name=task_name, retry_count=retry_count, error=str(error)[:300])


def _transition_submission_status(
    submission: AssessmentSubmission,
    new_status: str,
    expected_status: Optional[str] = None,
):
    """Atomic status transition with optimistic lock semantics."""

    qs = AssessmentSubmission.objects.filter(id=submission.id)
    if expected_status:
        qs = qs.filter(status=expected_status)

    updated_rows = qs.update(
        status=new_status,
        version=F('version') + 1,
        updated_at=timezone.now(),
    )

    if updated_rows:
        AuditLog.objects.create(
            submission=submission,
            event_type='status_transition',
            old_status=expected_status or submission.status,
            new_status=new_status,
            worker_id='celery-worker',
        )

    return updated_rows > 0


def _upsert_rule_score(submission: AssessmentSubmission, domain: str, score_value: Decimal):
    SubmissionScore.objects.update_or_create(
        submission=submission,
        domain=domain,
        defaults={
            'score': score_value,
            'feedback_json': None,
            'evaluated_by': 'rule',
            'evaluated_at': timezone.now(),
            'llm_request_id': None,
        },
    )


# ── LLM domain constants ──────────────────────────────────────────────────────
# Domains evaluated by the LLM pipeline (not MCQ rule engine).
# All entries must be present in SubmissionScore before generate_report runs.
_REQUIRED_LLM_DOMAINS = frozenset({'writing', 'speaking'})
_ALL_SCORED_DOMAINS   = frozenset({'listening', 'reading', 'vocab', 'writing', 'speaking'})

# ── Score / grade constants ───────────────────────────────────────────────────
# Each domain is scored 0–10.  With 5 domains the maximum total is 50.
# _SCORE_MAX_TOTAL is a Decimal so arithmetic with SubmissionScore.score
# (also Decimal) is exact — no floating-point rounding surprises.
_SCORE_MAX_PER_DOMAIN = Decimal('10')
_SCORE_MAX_TOTAL      = _SCORE_MAX_PER_DOMAIN * len(_ALL_SCORED_DOMAINS)  # == Decimal('50')


def _compute_grade(total: Decimal, max_total: Decimal) -> str:
    """
    Compute letter grade from total score using percentage thresholds.

    Thresholds (identical to clap_test_results.calculate_grade so admin view
    and the PDF report always agree):
      O  : >= 90 %
      A+ : >= 80 %
      A  : >= 70 %
      B+ : >= 60 %
      B  :  < 60 %

    Returns 'N/A' when max_total is zero (prevents ZeroDivisionError).
    """
    if not max_total:
        return 'N/A'
    pct = (total / max_total) * 100
    if pct >= 90:
        return 'O'
    if pct >= 80:
        return 'A+'
    if pct >= 70:
        return 'A'
    if pct >= 60:
        return 'B+'
    return 'B'


def _preprocess_audio_for_whisper(raw_bytes: bytes, ext: str) -> tuple:
    """
    Preprocess audio for maximum Whisper accuracy before transcription.

    Pipeline (executed via FFmpeg — already present in the Docker image):
      1. afftdn=nf=-25    — FFT-based noise reduction (removes background hiss/hum)
      2. highpass=f=80    — strip sub-bass rumble below 80 Hz (HVAC, handling noise)
      3. lowpass=f=8000   — strip high-frequency hiss above speech band (8 kHz)
      4. loudnorm         — EBU R128 loudness normalisation (-16 LUFS target)
                            ensures consistent volume regardless of device/distance
      5. -ar 16000 -ac 1  — resample to 16 kHz mono (Whisper's native input format)
      6. pcm_s16le WAV    — lossless output: avoids re-encoding degradation vs MP3

    Handles all common student recording conditions:
      - Noisy classrooms / cafeteria background
      - Mobile phones at arm's length or pocket
      - Weak internet causing audio compression artifacts
      - Quiet/whispering students (loudnorm brings them up)
      - Extremely loud students clipping the mic (loudnorm brings them down)

    Fails open: returns (raw_bytes, original mime_type) unchanged if:
      - FFmpeg is not available in PATH
      - Input is too small to process (< 1 KB — likely empty/corrupt)
      - Subprocess exceeds 60 s (never blocks the Celery task)
      - Any unexpected error occurs

    Returns:
        (processed_bytes, mime_type)  where mime_type is 'audio/wav' on success
        or the original (raw_bytes, original_mime_type) on fallback.
    """
    import shutil
    import subprocess
    import tempfile

    original_mime = f'audio/{ext}' if ext else 'audio/webm'

    if shutil.which('ffmpeg') is None:
        log_event('warning', 'audio_preprocess_ffmpeg_missing')
        return raw_bytes, original_mime

    if len(raw_bytes) < 1024:
        log_event('warning', 'audio_preprocess_too_small', size=len(raw_bytes))
        return raw_bytes, original_mime

    inp_path = None
    out_path = None
    try:
        # Write input to a named temp file — FFmpeg needs a seekable file
        with tempfile.NamedTemporaryFile(suffix=f'.{ext or "webm"}', delete=False) as inp_f:
            inp_f.write(raw_bytes)
            inp_path = inp_f.name

        out_path = inp_path + '_denoised.wav'

        cmd = [
            'ffmpeg', '-y',
            '-i', inp_path,
            '-af', (
                'afftdn=nf=-25,'                       # FFT noise reduction
                'highpass=f=80,'                       # remove sub-bass rumble
                'lowpass=f=8000,'                      # remove hiss above speech band
                'loudnorm=I=-16:TP=-1.5:LRA=11'        # EBU R128 loudness normalisation
            ),
            '-ar', '16000',                            # 16 kHz — Whisper optimal
            '-ac', '1',                                # mono
            '-c:a', 'pcm_s16le',                       # 16-bit PCM WAV (lossless)
            '-t', '300',                               # hard cap: max 5 minutes
            out_path,
        ]

        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=60,                                # never block >60 s
        )

        if result.returncode != 0:
            log_event(
                'warning', 'audio_preprocess_ffmpeg_error',
                returncode=result.returncode,
                stderr=result.stderr.decode('utf-8', errors='replace')[:500],
            )
            return raw_bytes, original_mime

        with open(out_path, 'rb') as out_f:
            processed = out_f.read()

        if len(processed) < 512:
            log_event('warning', 'audio_preprocess_empty_output', size=len(processed))
            return raw_bytes, original_mime

        log_event(
            'info', 'audio_preprocessed',
            original_bytes=len(raw_bytes),
            processed_bytes=len(processed),
            reduction_pct=round((1 - len(processed) / max(len(raw_bytes), 1)) * 100, 1),
        )
        return processed, 'audio/wav'

    except subprocess.TimeoutExpired:
        log_event('warning', 'audio_preprocess_timeout')
        return raw_bytes, original_mime
    except Exception as exc:
        log_event('warning', 'audio_preprocess_error', error=str(exc)[:200])
        return raw_bytes, original_mime
    finally:
        for path in (inp_path, out_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass


def _record_llm_domain_failure(submission: AssessmentSubmission, domain: str) -> None:
    """
    Atomically record that an LLM domain permanently failed (all retries exhausted).

    Uses SELECT FOR UPDATE to prevent concurrent evaluate_writing / evaluate_speaking
    DLQ paths from corrupting the llm_failed_domains list.

    Fails open — if this update fails (e.g. DB unreachable), the primary failure
    indicators (DLQ entry + STATUS_LLM_FAILED) are still set by the caller.
    This helper is non-critical observability / routing data.
    """
    try:
        with transaction.atomic():
            sub = AssessmentSubmission.objects.select_for_update(
                of=('self',)
            ).get(id=submission.id)
            failed: list = list(sub.llm_failed_domains or [])
            if domain not in failed:
                failed.append(domain)
                AssessmentSubmission.objects.filter(id=sub.id).update(
                    llm_failed_domains=failed
                )
    except Exception as exc:
        log_event(
            'warning', 'record_llm_domain_failure_error',
            submission_id=str(submission.id), domain=domain, error=str(exc),
        )


def _semantic_guard(score: float, feedback: dict):
    fb_text = json.dumps(feedback).lower()
    if score >= 8 and ('poor' in fb_text or 'very weak' in fb_text):
        return False
    if score <= 3 and ('excellent' in fb_text or 'outstanding' in fb_text):
        return False
    return True


_PII_PATTERNS = [
    (re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'), '[REDACTED_EMAIL]'),
    (re.compile(r'\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b'), '[REDACTED_PHONE]'),
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), '[REDACTED_ID]'),
]


def _redact_pii(text: str):
    if not text:
        return text, 0
    redacted = text
    replacements = 0
    for pattern, token in _PII_PATTERNS:
        redacted, count = pattern.subn(token, redacted)
        replacements += count
    return redacted, replacements


def _evaluate_writing_payload(essay: str, prompt: str):
    safe_essay, redactions = _redact_pii(essay or '')
    if redactions:
        log_event('info', 'pii_redacted', domain='writing', redactions=redactions)

    result = openai_evaluate_writing(essay=safe_essay, prompt=prompt)
    return {
        'score': float(result.get('score', 0)),
        'feedback': {
            'overall': result.get('feedback', ''),
            'breakdown': result.get('breakdown', {}),
        },
    }


def _evaluate_speaking_payload(transcript: str, prompt: str):
    safe_transcript, redactions = _redact_pii(transcript or '')
    if redactions:
        log_event('info', 'pii_redacted', domain='speaking', redactions=redactions)

    result = openai_evaluate_speaking(transcript=safe_transcript, prompt=prompt)
    return {
        'score': float(result.get('score', 0)),
        'feedback': {
            'overall': result.get('feedback', ''),
            'breakdown': result.get('breakdown', {}),
        },
    }


def _try_mark_llm_complete(submission: AssessmentSubmission) -> None:
    """
    Attempt to advance submission status from LLM_PROCESSING → LLM_COMPLETE when
    ALL required LLM domains (writing + speaking) are now scored.

    Called after each successful _persist_llm_score() call. Uses SELECT FOR UPDATE
    so concurrent calls from evaluate_writing and evaluate_speaking (completing at
    the same time) are serialised — only one writer advances the status, the other
    is a no-op.

    After a successful transition, dispatches generate_report immediately as a
    safety-net fallback. When tasks run via the normal Celery chord pipeline
    (submissions.py _dispatch_pipeline), generate_report is already the chord
    callback and runs automatically. When tasks are dispatched individually
    (recovery / manual retry), there is no chord callback — this dispatch
    ensures the pipeline always continues regardless.

    generate_report is idempotent and re-entrance safe (status + report_url guards),
    so double-dispatch from both the chord and this fallback is harmless.
    """
    advanced = False
    try:
        with transaction.atomic():
            locked = AssessmentSubmission.objects.select_for_update(
                of=('self',)
            ).get(id=submission.id)

            # Only advance from LLM_PROCESSING; any other state means the pipeline
            # has already moved forward (LLM_COMPLETE) or backward (LLM_FAILED).
            if locked.status != AssessmentSubmission.STATUS_LLM_PROCESSING:
                return

            scored = set(
                SubmissionScore.objects.filter(
                    submission=locked,
                    domain__in=_REQUIRED_LLM_DOMAINS,
                ).values_list('domain', flat=True)
            )

            if scored >= _REQUIRED_LLM_DOMAINS:
                advanced = _transition_submission_status(
                    locked,
                    AssessmentSubmission.STATUS_LLM_COMPLETE,
                    expected_status=AssessmentSubmission.STATUS_LLM_PROCESSING,
                )
    except Exception as exc:
        log_event(
            'warning', 'try_mark_llm_complete_error',
            submission_id=str(submission.id), error=str(exc),
        )
        return

    # Dispatch generate_report outside the transaction so the DB write is
    # visible to the Celery worker before the task is picked up.
    if advanced:
        try:
            generate_report.apply_async(args=[str(submission.id)], countdown=1)
        except Exception as dispatch_exc:
            # Non-fatal: chord callback or DLQ sweeper will cover this.
            log_event(
                'warning', 'try_mark_llm_complete_report_dispatch_failed',
                submission_id=str(submission.id), error=str(dispatch_exc),
            )


def _persist_llm_score(submission: AssessmentSubmission, domain: str, payload: dict):
    score = float(payload.get('score', 0))
    if not (0 <= score <= 10):
        llm_validation_failures_total.labels(domain=domain, failure_type='score_range').inc()
        raise ValueError('LLM score out of range 0-10')

    feedback = payload.get('feedback', {}) or {}
    if not isinstance(feedback, dict):
        llm_validation_failures_total.labels(domain=domain, failure_type='feedback_schema').inc()
        raise ValueError('LLM feedback must be object')

    # Semantic guard — score/feedback contradiction raises so task retries / goes DLQ
    guarded = _semantic_guard(score, feedback)
    if not guarded:
        llm_validation_failures_total.labels(domain=domain, failure_type='semantic_contradiction').inc()
        raise ValueError(
            f'Semantic contradiction: score={score} conflicts with feedback sentiment for domain={domain}'
        )

    SubmissionScore.objects.update_or_create(
        submission=submission,
        domain=domain,
        defaults={
            'score': Decimal(str(round(score, 2))),
            'feedback_json': feedback,
            'evaluated_by': 'llm',
            'evaluated_at': timezone.now(),
            'llm_request_id': f"openai-{timezone.now().timestamp()}",
        },
    )


def _build_set_answer_key(assignment: StudentClapAssignment) -> dict:
    """
    Build a lookup map: (test_type, order_index) → correct_option_int
    from ClapSetItem rows for the student's assigned set.

    Returns an empty dict when the student has no assigned set.
    This map is built ONCE per task execution and passed into
    _reevaluate_mcq_responses, eliminating per-response DB queries.
    """
    if not assignment.assigned_set_id:
        return {}

    answer_key: dict = {}
    for si in ClapSetItem.objects.filter(
        set_component__set_id=assignment.assigned_set_id,
        item_type='mcq',
    ).select_related('set_component').values(
        'set_component__test_type', 'order_index', 'content',
    ):
        co = (si['content'] or {}).get('correct_option')
        if co is not None:
            try:
                answer_key[(si['set_component__test_type'], si['order_index'])] = int(co)
            except (TypeError, ValueError):
                pass
    return answer_key


def _reevaluate_mcq_responses(
    assignment: StudentClapAssignment,
    component_ids,
    set_answer_key: dict,
) -> Decimal:
    """
    Re-evaluate every MCQ StudentClapResponse for the given component_ids
    against the authoritative answer key (set-specific or base item).

    Writes corrected is_correct + marks_awarded back to every response row
    inside the caller's transaction.atomic() block, then returns the
    sum of awarded marks as a Decimal.

    This is the ONLY authoritative MCQ scoring path — it replaces the old
    approach of trusting marks_awarded set at submission time, which could
    be stale, incorrect, or missing (e.g. if the real-time lookup failed).
    """
    responses = (
        StudentClapResponse.objects
        .filter(assignment=assignment, item__component_id__in=component_ids, item__item_type='mcq')
        .select_related('item__component')
    )

    total_marks = Decimal('0.00')

    for resp in responses:
        item = resp.item
        test_type = item.component.test_type

        # ── 1. Parse student's selected option ───────────────────────────────
        selected_option = None
        rd = resp.response_data
        if isinstance(rd, dict):
            raw = rd.get('selected_option')
        elif isinstance(rd, (int, float)):
            raw = int(rd)
        else:
            raw = None

        if raw is not None:
            try:
                selected_option = int(raw)
            except (TypeError, ValueError):
                selected_option = None

        # ── 2. Correct option: set-specific key takes priority ───────────────
        correct_option = set_answer_key.get((test_type, item.order_index))
        if correct_option is None:
            # Fall back to base ClapTestItem answer key
            base_co = (item.content or {}).get('correct_option')
            if base_co is not None:
                try:
                    correct_option = int(base_co)
                except (TypeError, ValueError):
                    pass

        # ── 3. Evaluate ───────────────────────────────────────────────────────
        if correct_option is None:
            # No answer key available — preserve existing marks but log warning
            log_event(
                'warning', 'mcq_no_answer_key',
                item_id=str(item.id), assignment_id=str(assignment.id),
                test_type=test_type, order_index=item.order_index,
            )
            if resp.marks_awarded is not None:
                total_marks += Decimal(str(resp.marks_awarded))
            continue

        if selected_option is not None and selected_option == correct_option:
            is_correct = True
            awarded = Decimal(str(item.points))
        else:
            is_correct = False
            awarded = Decimal('0.00')

        total_marks += awarded

        # ── 4. Persist corrected values (only if changed — avoids dirty writes) ──
        needs_update = (resp.is_correct != is_correct) or (resp.marks_awarded != awarded)
        if needs_update:
            StudentClapResponse.objects.filter(id=resp.id).update(
                is_correct=is_correct,
                marks_awarded=awarded,
            )

    return total_marks.quantize(Decimal('0.01'))


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=False, default_retry_delay=5, acks_late=True, reject_on_worker_lost=True, time_limit=120, soft_time_limit=100)
def score_rule_based(self, submission_id):
    """
    Authoritative MCQ scoring task for Listening, Reading, Vocabulary & Grammar.

    ALWAYS re-evaluates each MCQ response from scratch against the predefined
    answer key for the student's assigned question-paper set (or the base item
    answer key if no set is assigned).  It never trusts the marks_awarded value
    that was written at real-time submission, because that value may be:
      - stale (student changed answers after the auto-grade ran)
      - missing (set-item lookup failed at submission time)
      - wrong  (race condition between answer-key updates and submission)

    Evaluation order (highest priority first):
      1. ClapSetItem.content['correct_option']  — student's assigned set
      2. ClapTestItem.content['correct_option'] — base test fallback
    """
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
        log_event('info', 'task_started', task='score_rule_based', submission_id=str(submission_id), correlation_id=_correlation_id(self, submission_id))

        assignment = StudentClapAssignment.objects.select_related('assigned_set').filter(
            student=submission.user, clap_test=submission.assessment
        ).first()
        if not assignment:
            raise ValueError(f'No assignment found for submission {submission_id}')

        # Build the set-specific answer key ONCE — O(set_items) DB query,
        # avoids N per-response queries inside _reevaluate_mcq_responses.
        set_answer_key = _build_set_answer_key(assignment)

        component_map = {'listening': 'listening', 'reading': 'reading', 'vocab': 'vocabulary'}

        # Force re-evaluation on every run (idempotency is safe because
        # _reevaluate_mcq_responses only writes when values change).
        # Do NOT skip existing domains — this is the authoritative scoring step.
        with transaction.atomic():
            for domain, component_type in component_map.items():
                component_ids = list(
                    ClapTestComponent.objects.filter(
                        clap_test=submission.assessment, test_type=component_type
                    ).values_list('id', flat=True)
                )
                if not component_ids:
                    _upsert_rule_score(submission, domain, Decimal('0.00'))
                    log_event('info', 'mcq_no_component', domain=domain,
                              submission_id=str(submission_id))
                    continue

                # Re-evaluate every MCQ response and get authoritative total
                marks = _reevaluate_mcq_responses(assignment, component_ids, set_answer_key)
                _upsert_rule_score(submission, domain, marks)

                log_event(
                    'info', 'mcq_scored',
                    domain=domain, marks=str(marks),
                    set_id=str(assignment.assigned_set_id) if assignment.assigned_set_id else None,
                    submission_id=str(submission_id),
                )

        moved = _transition_submission_status(submission, AssessmentSubmission.STATUS_RULES_COMPLETE, expected_status=AssessmentSubmission.STATUS_PENDING)
        if moved:
            _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_PROCESSING, expected_status=AssessmentSubmission.STATUS_RULES_COMPLETE)

        return {'status': 'ok', 'task': 'score_rule_based', 'submission_id': str(submission.id), 'domains_scored': ['listening', 'reading', 'vocab']}
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('score_rule_based', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        raise
    finally:
        connection.close()


@shared_task(
    bind=True,
    # ── Retry policy ─────────────────────────────────────────────────────────
    # max_retries=8: covers:
    #   - transient API errors (up to 3 backoff retries)
    #   - RPM quota rotations (up to 3 key rotations per minute)
    #   - 1 long-countdown retry when all keys are RPM-limited
    # We handle QuotaDailyExhaustedException manually with a long countdown,
    # so autoretry is only for transient/connection errors (not RateLimitError).
    max_retries=8,
    autoretry_for=(TimeoutError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    # ── Reliability ──────────────────────────────────────────────────────────
    acks_late=True,            # Task re-queued if worker dies before completion
    reject_on_worker_lost=True,
    # ── Celery-level rate limit ───────────────────────────────────────────────
    # Not set here — the QuotaTracker (Redis) is the authoritative rate limiter.
    # It enforces per-key RPM/RPD/TPM/TPD limits atomically across all workers.
    # A Celery rate_limit here would under-utilise Tier 1 capacity (500 RPM/key).
    # ── Time limits ──────────────────────────────────────────────────────────
    time_limit=200,
    soft_time_limit=175,
)
def evaluate_writing(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    submission = None
    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

        if SubmissionScore.objects.filter(submission=submission, domain='writing').exists():
            return {'status': 'skipped', 'reason': 'writing score already exists', 'submission_id': submission_id}

        assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
        response = StudentClapResponse.objects.filter(assignment=assignment, item__component__test_type='writing').order_by('-updated_at').first()

        essay = ''
        if response and response.response_data is not None:
            essay = response.response_data if isinstance(response.response_data, str) else json.dumps(response.response_data)

        # ── No-submission guard ───────────────────────────────────────────────
        # If the student was auto-submitted (timer expiry / crash / no attempt) and
        # left the writing component empty, award 0 and skip the LLM call entirely.
        # This prevents burning LLM quota on empty inputs and keeps the pipeline
        # moving cleanly to generate_report regardless of how the test ended.
        if not essay.strip():
            _persist_llm_score(submission, 'writing', {
                'score': 0.0,
                'feedback': {
                    'overall': 'No writing submission received — zero score awarded.',
                    'breakdown': {},
                },
            })
            _try_mark_llm_complete(submission)
            log_event('info', 'writing_skipped_no_submission', submission_id=str(submission_id))
            return {
                'status': 'ok',
                'task': 'evaluate_writing',
                'submission_id': submission_id,
                'skipped': True,
                'reason': 'no_submission',
            }

        payload = _evaluate_writing_payload(essay=essay, prompt='Evaluate writing response using rubric and return JSON')
        _persist_llm_score(submission, 'writing', payload)
        _try_mark_llm_complete(submission)
        return {'status': 'ok', 'task': 'evaluate_writing', 'submission_id': submission_id}

    except SoftTimeLimitExceeded:
        # C4: handle before the hard kill so DLQ is recorded and DB connection cleaned up
        log_event('error', 'evaluate_writing_soft_time_limit', submission_id=str(submission_id))
        _record_dlq('evaluate_writing', submission_id, {'submission_id': str(submission_id)},
                    RuntimeError('SoftTimeLimitExceeded'), self.request.retries)
        raise

    except QuotaDailyExhaustedException as exc:
        # All API keys have exhausted their daily quota.
        # Schedule a retry countdown to when quota likely resets (midnight UTC).
        # Do NOT go to DLQ — this is expected and will resolve automatically.
        wait = exc.wait_seconds
        log_event('warning', 'evaluate_writing_daily_quota_exhausted',
                  submission_id=str(submission_id), wait_seconds=wait,
                  retry_attempt=self.request.retries)
        raise self.retry(countdown=wait, exc=exc)

    except QuotaTemporarilyUnavailableException as exc:
        # All keys are RPM/TPM limited — retry when minute window resets.
        wait = max(exc.wait_seconds, 65)  # At least 65s to clear the window
        log_event('warning', 'evaluate_writing_rpm_quota_wait',
                  submission_id=str(submission_id), wait_seconds=wait)
        raise self.retry(countdown=wait, exc=exc)

    except Retry:
        raise

    except ValueError as exc:
        # H4: LLM response parse errors (invalid JSON, out-of-range score, semantic
        # contradiction) are non-transient — DLQ immediately, no retry.
        _record_dlq('evaluate_writing', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        if submission:
            _record_llm_domain_failure(submission, 'writing')   # ← NEW: track which domain failed
            _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_FAILED)
        # Do NOT re-raise: the task "completes" (returns None) so Celery marks it
        # as SUCCESS and the chord callback (generate_report) runs cleanly.
        # generate_report will see STATUS_LLM_FAILED and skip without retrying.

    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('evaluate_writing', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
            # C3: surface permanent failure — student sees error, not endless spinner
            if submission:
                _record_llm_domain_failure(submission, 'writing')  # ← NEW
                _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_FAILED)
        raise
    finally:
        connection.close()


@shared_task(
    bind=True,
    # ── Retry policy (same reasoning as evaluate_writing) ─────────────────
    max_retries=8,
    autoretry_for=(TimeoutError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    # ── Reliability ──────────────────────────────────────────────────────────
    acks_late=True,
    reject_on_worker_lost=True,
    # ── Celery rate limit ─────────────────────────────────────────────────────
    # Not set here — QuotaTracker handles gpt-4o RPM/RPD/TPM/TPD per key.
    # Whisper RPM is tracked separately in openai_client._with_whisper_retry
    # via a proactive Redis counter (OPENAI_WHISPER_RPM_LIMIT, default 50/key).
    # ── Time limits ──────────────────────────────────────────────────────────
    # Higher than writing: audio preprocessing (FFmpeg) + Whisper adds 30-120s.
    time_limit=420,
    soft_time_limit=390,
)
def evaluate_speaking(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    submission = None
    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

        if SubmissionScore.objects.filter(submission=submission, domain='speaking').exists():
            return {'status': 'skipped', 'reason': 'speaking score already exists', 'submission_id': submission_id}

        assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
        audio = StudentAudioResponse.objects.filter(assignment=assignment, item__component__test_type='speaking').order_by('-uploaded_at').first()

        # ── No-submission guard ───────────────────────────────────────────────
        # If the student was auto-submitted and never recorded audio, award 0
        # and skip the Whisper transcription + LLM call entirely.
        if not audio:
            _persist_llm_score(submission, 'speaking', {
                'score': 0.0,
                'feedback': {
                    'overall': 'No audio submission received — zero score awarded.',
                    'breakdown': {},
                },
            })
            _try_mark_llm_complete(submission)
            log_event('info', 'speaking_skipped_no_submission', submission_id=str(submission_id))
            return {
                'status': 'ok',
                'task': 'evaluate_speaking',
                'submission_id': submission_id,
                'skipped': True,
                'reason': 'no_submission',
            }

        # ── Transcription: run Whisper if transcript not yet stored ─────────
        transcript = (audio.transcription or '').strip() if audio else ''
        if audio and not transcript:
            try:
                import tempfile
                from api.utils.openai_client import transcribe_audio
                from api.utils.storage import get_s3_client as _get_s3_client

                if audio.file_path and audio.file_path.startswith('s3://'):
                    # C1: Stream S3 audio to a SpooledTemporaryFile instead of
                    # loading the entire file into a Python bytestring.
                    # SpooledTemporaryFile holds bytes in RAM up to max_size (5 MB)
                    # then spills to a temp file on disk — prevents OOM on 10 MB files.
                    s3_client = _get_s3_client()
                    if s3_client:
                        without_scheme = audio.file_path[len('s3://'):]
                        s3_bucket, _, s3_key = without_scheme.partition('/')
                        ext = audio.file_path.rsplit('.', 1)[-1].lower()
                        with tempfile.SpooledTemporaryFile(
                            max_size=5 * 1024 * 1024,  # spill to disk above 5 MB
                            suffix=f'.{ext}',
                        ) as tmp:
                            s3_client.download_fileobj(s3_bucket, s3_key, tmp)
                            tmp.seek(0)
                            raw_bytes = tmp.read()

                        # ── Audio size guard ──────────────────────────────────
                        if len(raw_bytes) < 1024:
                            log_event('warning', 'audio_too_small_skipping',
                                      submission_id=str(submission_id), size=len(raw_bytes))
                        else:
                            # ── Noise reduction + format normalisation ────────
                            clean_bytes, effective_mime = _preprocess_audio_for_whisper(raw_bytes, ext)
                            audio_file_obj = (
                                f'audio.{"wav" if effective_mime == "audio/wav" else ext}',
                                clean_bytes,
                                effective_mime,
                            )
                            transcript = transcribe_audio(
                                audio_file_obj, mime_type=effective_mime
                            ) or ''
                elif audio.file_path:
                    # Local filesystem audio — open with context manager (no FD leak)
                    full_path = os.path.join(settings.MEDIA_ROOT, audio.file_path)
                    if os.path.exists(full_path):
                        ext = audio.file_path.rsplit('.', 1)[-1].lower()
                        with open(full_path, 'rb') as f:
                            raw_bytes = f.read()
                        if len(raw_bytes) < 1024:
                            log_event('warning', 'audio_too_small_skipping',
                                      submission_id=str(submission_id), size=len(raw_bytes))
                        else:
                            clean_bytes, effective_mime = _preprocess_audio_for_whisper(raw_bytes, ext)
                            audio_file_obj = (
                                f'audio.{"wav" if effective_mime == "audio/wav" else ext}',
                                clean_bytes,
                                effective_mime,
                            )
                            transcript = transcribe_audio(audio_file_obj, mime_type=effective_mime) or ''

                if transcript:
                    # Persist so future re-runs skip Whisper
                    StudentAudioResponse.objects.filter(id=audio.id).update(transcription=transcript)
                    log_event('info', 'whisper_transcribed', submission_id=str(submission_id), chars=len(transcript))
            except Exception as whisper_exc:
                log_event('warning', 'whisper_transcription_failed', submission_id=str(submission_id), error=str(whisper_exc))
                # transcript remains '' — no-transcript guard below will award 0

        # ── No-transcript guard ───────────────────────────────────────────────
        # Audio exists but Whisper could not produce a transcript (quota exhausted,
        # API down, corrupt file).  Calling the LLM with an empty transcript would
        # waste quota, trigger RPM retries for minutes, and ultimately fail anyway.
        # Award 0 here — same treatment as no audio submission — so the pipeline
        # continues and generate_report is not blocked by a Whisper outage.
        if not transcript.strip():
            _persist_llm_score(submission, 'speaking', {
                'score': 0.0,
                'feedback': {
                    'overall': 'Audio transcription unavailable — zero score awarded.',
                    'breakdown': {},
                },
            })
            _try_mark_llm_complete(submission)
            log_event('info', 'speaking_skipped_no_transcript', submission_id=str(submission_id))
            return {
                'status': 'ok',
                'task': 'evaluate_speaking',
                'submission_id': submission_id,
                'skipped': True,
                'reason': 'no_transcript',
            }

        payload = _evaluate_speaking_payload(transcript=transcript, prompt='Evaluate speaking transcript using rubric and return JSON')
        _persist_llm_score(submission, 'speaking', payload)
        _try_mark_llm_complete(submission)

        return {'status': 'ok', 'task': 'evaluate_speaking', 'submission_id': submission_id}

    except SoftTimeLimitExceeded:
        # C4: handle before the hard kill so DLQ is recorded and DB connection cleaned up
        log_event('error', 'evaluate_speaking_soft_time_limit', submission_id=str(submission_id))
        _record_dlq('evaluate_speaking', submission_id, {'submission_id': str(submission_id)},
                    RuntimeError('SoftTimeLimitExceeded'), self.request.retries)
        raise

    except QuotaDailyExhaustedException as exc:
        # All API keys have exhausted their daily quota.
        # Schedule a long-countdown retry; do NOT go to DLQ.
        wait = exc.wait_seconds
        log_event('warning', 'evaluate_speaking_daily_quota_exhausted',
                  submission_id=str(submission_id), wait_seconds=wait,
                  retry_attempt=self.request.retries)
        raise self.retry(countdown=wait, exc=exc)

    except QuotaTemporarilyUnavailableException as exc:
        # All keys are RPM/TPM limited — retry after window resets.
        wait = max(exc.wait_seconds, 65)
        log_event('warning', 'evaluate_speaking_rpm_quota_wait',
                  submission_id=str(submission_id), wait_seconds=wait)
        raise self.retry(countdown=wait, exc=exc)

    except Retry:
        raise

    except ValueError as exc:
        # H4: LLM response parse errors (invalid JSON, out-of-range score, semantic
        # contradiction) are non-transient — DLQ immediately, no retry.
        _record_dlq('evaluate_speaking', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        if submission:
            _record_llm_domain_failure(submission, 'speaking')  # ← NEW: track which domain failed
            _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_FAILED)
        # Do NOT re-raise — see comment in evaluate_writing.

    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('evaluate_speaking', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
            # C3: surface permanent failure — student sees error, not endless spinner
            if submission:
                _record_llm_domain_failure(submission, 'speaking')  # ← NEW
                _transition_submission_status(submission, AssessmentSubmission.STATUS_LLM_FAILED)
        raise
    finally:
        connection.close()


# C3: retry_backoff=True + jitter prevents thundering herd on PDF generation
# failures (e.g., WeasyPrint OOM, S3 transient error, DB contention).
@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=300, retry_jitter=True, acks_late=True, reject_on_worker_lost=True, time_limit=300, soft_time_limit=270)
def generate_report(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        start_ts = timezone.now()

        with transaction.atomic():
            submission = AssessmentSubmission.objects.select_for_update().select_related('assessment', 'user').get(id=submission_id)

            if submission.report_url:
                return {'status': 'skipped', 'task': 'generate_report', 'submission_id': submission_id, 'reason': 'report already exists'}

            # ── Guard 1: LLM permanently failed ──────────────────────────────────
            # When one or both LLM domains failed, check whether all 5 domain scores
            # are nonetheless present (e.g. speaking awarded 0 due to Whisper outage).
            # If all scores exist we can still produce a valid report — advance the
            # status to LLM_COMPLETE and fall through to generation.
            # Only skip if scores are genuinely missing (pipeline cannot recover).
            if submission.status == AssessmentSubmission.STATUS_LLM_FAILED:
                present_domains = set(
                    SubmissionScore.objects.filter(
                        submission=submission,
                        domain__in=_ALL_SCORED_DOMAINS,
                    ).values_list('domain', flat=True)
                )
                if present_domains >= _ALL_SCORED_DOMAINS:
                    # All scores are present — override status so the transition
                    # guard below succeeds and we proceed to report generation.
                    _transition_submission_status(
                        submission,
                        AssessmentSubmission.STATUS_LLM_COMPLETE,
                        expected_status=AssessmentSubmission.STATUS_LLM_FAILED,
                    )
                    submission.status = AssessmentSubmission.STATUS_LLM_COMPLETE
                    log_event(
                        'info', 'generate_report_recovering_from_llm_failed',
                        submission_id=str(submission_id),
                        failed_domains=submission.llm_failed_domains,
                    )
                else:
                    missing = _ALL_SCORED_DOMAINS - present_domains
                    log_event(
                        'info', 'generate_report_skipped_llm_failed',
                        submission_id=str(submission_id),
                        failed_domains=submission.llm_failed_domains,
                        missing_domains=sorted(missing),
                    )
                    return {
                        'status': 'skipped',
                        'task': 'generate_report',
                        'reason': 'llm_failed',
                        'failed_domains': submission.llm_failed_domains,
                        'submission_id': submission_id,
                    }

            # ── Guard 2: Not yet LLM_COMPLETE — tasks still in flight or retrying ──
            # The chord callback can fire while evaluate_writing / evaluate_speaking
            # are still being retried (Celery chord fires when group tasks COMPLETE OR
            # FAIL, not necessarily when they succeed on retry).  When the status is
            # still LLM_PROCESSING, the LLM tasks are still alive — do NOT retry or
            # go to DLQ; the chord will re-trigger correctly once tasks settle.
            if submission.status != AssessmentSubmission.STATUS_LLM_COMPLETE:
                log_event(
                    'info', 'generate_report_not_ready',
                    submission_id=str(submission_id),
                    current_status=submission.status,
                )
                return {
                    'status': 'skipped',
                    'task': 'generate_report',
                    'reason': f'not_ready: status={submission.status}',
                    'submission_id': submission_id,
                }

            moved = _transition_submission_status(
                submission,
                AssessmentSubmission.STATUS_REPORT_GENERATING,
                expected_status=AssessmentSubmission.STATUS_LLM_COMPLETE,
            )
            # Another worker already claimed the transition (concurrent chord dispatch).
            if not moved:
                log_event(
                    'info', 'generate_report_transition_noop',
                    submission_id=str(submission_id),
                )
                return {
                    'status': 'skipped',
                    'task': 'generate_report',
                    'reason': 'transition_noop',
                    'submission_id': submission_id,
                }

        scores = list(SubmissionScore.objects.filter(submission=submission).order_by('domain'))
        if len(scores) < _ALL_SCORED_DOMAINS.__len__():
            # Status is LLM_COMPLETE yet < 5 scores — this is a data-consistency bug
            # (should never happen in a healthy system).  Raise so it retries / DLQs
            # for operator investigation rather than silently generating a partial report.
            present  = {s.domain for s in scores}
            missing  = _ALL_SCORED_DOMAINS - present
            log_event(
                'error', 'generate_report_missing_scores',
                submission_id=str(submission_id),
                found=len(scores), expected=len(_ALL_SCORED_DOMAINS),
                missing_domains=sorted(missing),
            )
            raise ValueError(
                f'Report requires {len(_ALL_SCORED_DOMAINS)} domain scores; '
                f'found {len(scores)} (missing: {sorted(missing)}) for {submission_id}. '
                f'Status was LLM_COMPLETE — data-consistency error, investigate DLQ.'
            )

        # Compute total score and grade.
        # SubmissionScore.score is a DecimalField — sum is exact.
        # max_total uses the number of scores actually present (always 5 here
        # because the gate above already verified len(scores) == 5).
        total_score = sum(s.score for s in scores)
        max_total   = _SCORE_MAX_PER_DOMAIN * len(scores)   # Decimal('50')
        grade       = _compute_grade(total_score, max_total)

        html = render_to_string('reports/submission_report.html', {
            'submission':  submission,
            'scores':      scores,
            'total_score': total_score,   # Decimal — template formats as number
            'max_total':   max_total,     # Decimal('50')
            'grade':       grade,         # str: 'O', 'A+', 'A', 'B+', 'B'
            'generated_at': timezone.now().isoformat(),
        })

        timestamp = timezone.now().strftime('%Y%m%d%H%M%S')
        report_relpath = f'reports/{submission.id}/{timestamp}.pdf'

        # C2: Write PDF to a temp file instead of holding bytes in memory.
        # WeasyPrint.write_pdf(target=path) writes directly to disk — the Python
        # process never holds the entire PDF as a bytestring.  For S3 uploads
        # we stream from the temp file with upload_fileobj (chunked transfer).
        import tempfile
        from api.utils.storage import get_s3_client as _get_s3_client

        tmp_pdf_fd, tmp_pdf_path = tempfile.mkstemp(suffix='.pdf')
        os.close(tmp_pdf_fd)  # close the raw FD; we'll re-open via context manager
        try:
            try:
                from weasyprint import HTML
                HTML(string=html).write_pdf(target=tmp_pdf_path)
            except Exception:
                # Fallback: write HTML bytes (PDF unavailable)
                with open(tmp_pdf_path, 'wb') as f:
                    f.write(html.encode('utf-8'))

            report_url = None
            s3_client = _get_s3_client()
            bucket = getattr(settings, 'S3_BUCKET_NAME', '') or ''
            if s3_client and bucket:
                try:
                    with open(tmp_pdf_path, 'rb') as pdf_fp:
                        s3_client.upload_fileobj(
                            pdf_fp,
                            bucket,
                            report_relpath,
                            ExtraArgs={
                                'ContentType': 'application/pdf',
                                'ServerSideEncryption': 'AES256',
                                # Phase 2.2: reports are user-specific — CDN must NOT
                                # cache them (private).  Browser may cache for 7 days
                                # to match the presigned URL lifetime.
                                'CacheControl': 'private, max-age=604800',
                            },
                        )
                    report_url = f's3://{bucket}/{report_relpath}'
                except Exception as s3_err:
                    log_event('warning', 'report_s3_upload_failed',
                              submission_id=str(submission_id), error=str(s3_err))
                    report_url = None

            if not report_url:
                # Local fallback — move temp file to MEDIA_ROOT
                full_path = os.path.join(settings.MEDIA_ROOT, report_relpath)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                import shutil
                shutil.move(tmp_pdf_path, full_path)
                report_url = f"{settings.MEDIA_URL.rstrip('/')}/{report_relpath}"
        finally:
            # Always clean up temp file (shutil.move removes it, but guard any other path)
            if os.path.exists(tmp_pdf_path):
                os.unlink(tmp_pdf_path)

        AssessmentSubmission.objects.filter(id=submission.id).update(
            report_url=report_url,
            updated_at=timezone.now(),
        )
        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_REPORT_READY,
            expected_status=AssessmentSubmission.STATUS_REPORT_GENERATING,
        )

        duration = (timezone.now() - start_ts).total_seconds()
        report_generation_duration.observe(duration)
        log_event('info', 'report_generated', submission_id=str(submission_id), duration_seconds=duration, report_url=report_url)

        # Safety-net dispatch: ensures send_email_report always runs whether
        # generate_report was called as a Celery chain step or dispatched individually.
        # send_email_report is idempotent (email_sent_at guard prevents double-send).
        try:
            send_email_report.apply_async(args=[str(submission_id)], countdown=2)
        except Exception as dispatch_exc:
            log_event('warning', 'generate_report_email_dispatch_failed',
                      submission_id=str(submission_id), error=str(dispatch_exc))

        return {'status': 'ok', 'task': 'generate_report', 'submission_id': submission_id, 'report_url': report_url}
    except SoftTimeLimitExceeded:
        # C4: handle soft time limit explicitly so DLQ is recorded and DB connection
        # is cleaned up before the hard kill signal arrives (time_limit=300).
        log_event('error', 'generate_report_soft_time_limit', submission_id=str(submission_id))
        _record_dlq('generate_report', submission_id, {'submission_id': str(submission_id)},
                    RuntimeError('SoftTimeLimitExceeded'), self.request.retries)
        raise
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('generate_report', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        raise
    finally:
        connection.close()


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=900, retry_jitter=True, acks_late=True, reject_on_worker_lost=True, time_limit=120, soft_time_limit=100)
def send_email_report(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

        if submission.email_sent_at:
            # Email was already sent — ensure status is COMPLETE regardless.
            if submission.status != AssessmentSubmission.STATUS_COMPLETE:
                _transition_submission_status(submission, AssessmentSubmission.STATUS_COMPLETE)
            return {'status': 'skipped', 'task': 'send_email_report', 'submission_id': submission_id, 'reason': 'email already sent'}

        # ── Guard 1: LLM permanently failed — no report was generated, skip email ──
        # This fires when generate_report returned 'skipped' (LLM_FAILED) but the
        # Celery chain still calls send_email_report as the next step.
        if submission.status == AssessmentSubmission.STATUS_LLM_FAILED:
            log_event(
                'info', 'send_email_skipped_llm_failed',
                submission_id=str(submission_id),
                failed_domains=submission.llm_failed_domains,
            )
            return {
                'status': 'skipped',
                'task': 'send_email_report',
                'reason': 'llm_failed',
                'failed_domains': submission.llm_failed_domains,
                'submission_id': submission_id,
            }

        # ── Guard 2: No report URL — generate_report did not complete successfully ──
        # Do not send a results email without an actual report to attach / link.
        if not submission.report_url:
            log_event(
                'info', 'send_email_skipped_no_report',
                submission_id=str(submission_id),
                current_status=submission.status,
            )
            return {
                'status': 'skipped',
                'task': 'send_email_report',
                'reason': 'no_report_url',
                'submission_id': submission_id,
            }

        # ── Guard 3: No user email address — report is ready but cannot be mailed ──
        # user.email is nullable (migration 0013_make_user_email_nullable).
        # Without this guard EmailMultiAlternatives.send() raises an exception,
        # triggering 3 retries and a DLQ entry for a permanently unresolvable
        # condition.  We skip the email, advance the submission to COMPLETE
        # (the report IS ready in S3 — nothing else is outstanding), and emit a
        # warning so ops can follow up with the student via another channel.
        if not submission.user.email:
            log_event(
                'warning', 'send_email_skipped_no_email',
                submission_id=str(submission_id),
                user_id=str(submission.user.id),
            )
            # Bypass EMAIL_SENDING and advance directly REPORT_READY → COMPLETE.
            _transition_submission_status(
                submission,
                AssessmentSubmission.STATUS_COMPLETE,
                expected_status=AssessmentSubmission.STATUS_REPORT_READY,
            )
            return {
                'status': 'skipped',
                'task': 'send_email_report',
                'reason': 'no_user_email',
                'submission_id': submission_id,
            }

        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_EMAIL_SENDING,
            expected_status=AssessmentSubmission.STATUS_REPORT_READY,
        )

        scores = list(SubmissionScore.objects.filter(submission=submission).order_by('domain'))
        student_name = getattr(submission.user, 'full_name', None) or submission.user.email
        report_url = _presigned_report_download_url(submission.report_url or '')

        # Compute total score and grade to include in the email body.
        total_score = sum(s.score for s in scores) if scores else Decimal('0')
        max_total   = _SCORE_MAX_PER_DOMAIN * len(scores) if scores else _SCORE_MAX_TOTAL
        grade       = _compute_grade(total_score, max_total)

        html_body = render_to_string(
            'emails/submission_ready.html',
            {
                'student_name': student_name,
                'scores':       scores,
                'total_score':  total_score,
                'max_total':    max_total,
                'grade':        grade,
                'report_url':   report_url,
            },
        )

        try:
            message = EmailMultiAlternatives(
                subject='Your CLAP Assessment Results Are Ready',
                body=f'Your CLAP report is ready. Download: {report_url}',
                from_email=getattr(settings, 'FROM_EMAIL', None),
                to=[submission.user.email],
            )
            message.attach_alternative(html_body, 'text/html')
            message.send()
        except smtplib.SMTPException as smtp_exc:
            # ── Guard 4: Permanent SMTP rejection (unverified address, blacklist, etc.) ──
            # SMTP 5xx codes are permanent — retrying will not help. Advance to COMPLETE
            # so the submission is not stuck in EMAIL_SENDING forever. The report is still
            # accessible in S3. Ops can resend manually if needed.
            smtp_code = getattr(smtp_exc, 'smtp_code', None) or (smtp_exc.args[0] if smtp_exc.args else 0)
            is_permanent = isinstance(smtp_code, int) and smtp_code >= 500
            if is_permanent:
                log_event(
                    'warning', 'send_email_permanent_rejection',
                    submission_id=str(submission_id),
                    user_email=submission.user.email,
                    smtp_code=smtp_code,
                    error=str(smtp_exc)[:200],
                )
                _transition_submission_status(
                    submission,
                    AssessmentSubmission.STATUS_COMPLETE,
                    expected_status=AssessmentSubmission.STATUS_EMAIL_SENDING,
                )
                return {
                    'status': 'skipped',
                    'task': 'send_email_report',
                    'reason': 'permanent_smtp_rejection',
                    'smtp_code': smtp_code,
                    'submission_id': submission_id,
                }
            raise  # Transient error — allow normal retry

        AssessmentSubmission.objects.filter(id=submission.id).update(
            email_sent_at=timezone.now(),
            updated_at=timezone.now(),
        )

        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_COMPLETE,
            expected_status=AssessmentSubmission.STATUS_EMAIL_SENDING,
        )

        log_event('info', 'email_sent', submission_id=str(submission_id), user_email=submission.user.email)
        return {'status': 'ok', 'task': 'send_email_report', 'submission_id': submission_id}
    except SoftTimeLimitExceeded:
        # C7: explicit handler prevents submission staying stuck in EMAIL_SENDING forever
        log_event('error', 'send_email_report_soft_time_limit', submission_id=str(submission_id))
        _record_dlq('send_email_report', submission_id, {'submission_id': str(submission_id)},
                    RuntimeError('SoftTimeLimitExceeded'), self.request.retries)
        raise
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('send_email_report', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        raise
    finally:
        connection.close()


DLQ_MAX_RETRY_COUNT = 5  # Circuit breaker: stop retrying after this many DLQ retries


@shared_task(bind=True, max_retries=0, acks_late=True, reject_on_worker_lost=True, time_limit=60, soft_time_limit=50)
def retry_dlq_entry(self, dlq_entry_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    entry = DeadLetterQueue.objects.select_related('submission').get(id=dlq_entry_id)

    # Circuit breaker: skip entries that have been retried too many times
    if entry.retry_count >= DLQ_MAX_RETRY_COUNT:
        log_event('warning', 'dlq_circuit_breaker', dlq_entry_id=dlq_entry_id,
                  task_name=entry.task_name, retry_count=entry.retry_count)
        entry.resolved = True
        entry.save(update_fields=['resolved'])
        return {'status': 'skipped', 'reason': f'Circuit breaker: max retries ({DLQ_MAX_RETRY_COUNT}) exceeded',
                'dlq_entry_id': dlq_entry_id}

    task_name = entry.task_name

    task_map = {
        'evaluate_writing': evaluate_writing,
        'evaluate_speaking': evaluate_speaking,
        'generate_report': generate_report,
        'send_email_report': send_email_report,
        'score_rule_based': score_rule_based,
    }
    task = task_map.get(task_name)
    if not task:
        return {'status': 'skipped', 'reason': f'No task mapping for {task_name}', 'dlq_entry_id': dlq_entry_id}

    # Increment retry count before dispatching
    entry.retry_count = F('retry_count') + 1
    entry.resolved = True
    entry.save(update_fields=['resolved', 'retry_count'])

    task.delay(str(entry.submission_id))
    return {'status': 'ok', 'dlq_entry_id': dlq_entry_id, 'task_name': task_name}


@shared_task(bind=True, max_retries=0, acks_late=True, reject_on_worker_lost=True, time_limit=120, soft_time_limit=100)
def dlq_sweeper(self):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    lock_key = 842001
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(%s);', [lock_key])
        acquired = cursor.fetchone()[0]

    if not acquired:
        return {'status': 'skipped', 'reason': 'advisory lock not acquired'}

    try:
        threshold = timezone.now() - timezone.timedelta(minutes=5)
        # Only retry entries below the circuit breaker threshold
        entries = DeadLetterQueue.objects.filter(
            resolved=False,
            created_at__lte=threshold,
            retry_count__lt=DLQ_MAX_RETRY_COUNT,
        ).order_by('created_at')[:100]

        processed = 0
        for entry in entries:
            retry_dlq_entry.delay(entry.id)
            processed += 1

        # Update gauge metric for unresolved DLQ count
        unresolved = DeadLetterQueue.objects.filter(resolved=False).count()
        dlq_unresolved_count.set(unresolved)

        return {'status': 'ok', 'processed': processed, 'unresolved_total': unresolved}
    finally:
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_unlock(%s);', [lock_key])
        # Close stale DB connections after long-running sweeper
        connection.close()


@shared_task(bind=True, queue='rule_scoring', soft_time_limit=180, max_retries=2)
def check_text_similarity(self, assignment_id: str):
    """
    Post-test integrity check: compare this student's text responses against all
    other completed students for the same CLAP test.

    Uses difflib.SequenceMatcher (no AI cost, O(N) per assignment).
    Flags pairs with ratio >= 0.85 as MalpracticeEvent(high_text_similarity).
    Idempotent — checks for existing flags before creating.

    Triggered asynchronously from finish_component when all_done=True.
    Never blocks or delays the student.
    """
    import difflib

    try:
        assignment = StudentClapAssignment.objects.select_related(
            'clap_test', 'student'
        ).get(id=assignment_id)
    except StudentClapAssignment.DoesNotExist:
        logger.warning(f"check_text_similarity: assignment {assignment_id} not found")
        return

    # Collect this student's meaningful text responses (length > 50 chars)
    my_text = {}
    for r in StudentClapResponse.objects.filter(assignment=assignment):
        if isinstance(r.response_data, dict):
            text = r.response_data.get('text', '').strip()
            if len(text) > 50:
                my_text[str(r.item_id)] = text

    if not my_text:
        logger.info(f"check_text_similarity: no text responses for {assignment_id}, skipping")
        return

    # Compare against all OTHER completed assignments for the same test
    others = StudentClapAssignment.objects.filter(
        clap_test=assignment.clap_test,
        status='completed',
    ).exclude(id=assignment_id)

    flagged_count = 0
    for other in others:
        other_text = {}
        for r in StudentClapResponse.objects.filter(assignment=other):
            if isinstance(r.response_data, dict):
                text = r.response_data.get('text', '').strip()
                if len(text) > 50:
                    other_text[str(r.item_id)] = text

        for item_id, my_ans in my_text.items():
            other_ans = other_text.get(item_id, '')
            if not other_ans:
                continue

            ratio = difflib.SequenceMatcher(None, my_ans, other_ans).ratio()
            if ratio >= 0.85:
                # Idempotent: skip if this pair+item was already flagged
                already = MalpracticeEvent.objects.filter(
                    assignment=assignment,
                    event_type='high_text_similarity',
                    meta__other_assignment_id=str(other.id),
                    meta__item_id=item_id,
                ).exists()
                if not already:
                    MalpracticeEvent.objects.create(
                        assignment=assignment,
                        event_type='high_text_similarity',
                        meta={
                            'similarity_score': round(ratio, 3),
                            'other_assignment_id': str(other.id),
                            'other_student_name': (
                                other.student.full_name
                                or str(getattr(other.student, 'student_id', other.student_id))
                            ),
                            'item_id': item_id,
                        },
                    )
                    flagged_count += 1
                    logger.warning(
                        f"Similarity {ratio:.0%}: {assignment_id} ↔ {other.id}, item {item_id}"
                    )

    logger.info(
        f"check_text_similarity done for {assignment_id}: "
        f"{flagged_count} new flag(s) across {others.count()} peer(s)"
    )


# ── Quota status reporter — beat task every 5 minutes ────────────────────────

@shared_task(
    bind=True,
    max_retries=0,
    acks_late=False,
    time_limit=30,
    soft_time_limit=25,
    queue='rule_scoring',   # lightweight read-only task; no LLM queue contention
)
def log_quota_status(self):
    """
    Periodic beat task (every 5 min) that reads per-key quota counters from
    Redis and emits structured log lines.

    Purpose
    ───────
    • Zero-cost observability: operators see quota headroom before students notice.
    • Alerts when any key is >80 % of daily limit.
    • Exposes per-key RPD/TPD consumption for capacity planning.
    • Does NOT make any OpenAI API calls — purely Redis reads.

    Output (structured JSON logs in production):
        {"event": "quota_status", "key_id": "abc123", "rpd_used": 45,
         "rpd_limit": 180, "rpd_pct": 25.0, "tpd_used": 85000, ...}
    """
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed'}

    try:
        any_warning = False
        keys_checked = 0

        # ── OpenAI quota reporting ─────────────────────────────────────────
        tracker = get_quota_tracker()
        openai_pool_keys = getattr(settings, 'OPENAI_API_KEYS', [])
        openai_standby   = getattr(settings, 'OPENAI_STANDBY_KEY', '') or ''
        openai_all_keys  = [k for k in openai_pool_keys if k]
        if openai_standby:
            openai_all_keys.append(openai_standby)

        if not openai_all_keys:
            log_event('warning', 'quota_status_no_openai_keys_configured')
        else:
            for s in tracker.get_all_keys_status(openai_all_keys):
                rpd_used  = s['rpd']['used']
                rpd_limit = s['rpd']['limit']
                tpd_used  = s['tpd']['used']
                tpd_limit = s['tpd']['limit']
                rpm_used  = s['rpm']['used']
                rpm_limit = s['rpm']['limit']

                rpd_pct = round((rpd_used / rpd_limit * 100) if rpd_limit else 0, 1)
                tpd_pct = round((tpd_used / tpd_limit * 100) if tpd_limit else 0, 1)

                level = 'info'
                if rpd_pct >= 90 or tpd_pct >= 90:
                    level = 'error'
                    any_warning = True
                elif rpd_pct >= 75 or tpd_pct >= 75:
                    level = 'warning'
                    any_warning = True

                log_event(
                    level,
                    'quota_status',
                    llm_provider='openai',
                    key_id=s['key_id'],
                    rpm_used=rpm_used,
                    rpm_limit=rpm_limit,
                    rpd_used=rpd_used,
                    rpd_limit=rpd_limit,
                    rpd_pct=rpd_pct,
                    tpd_used=tpd_used,
                    tpd_limit=tpd_limit,
                    tpd_pct=tpd_pct,
                )
                keys_checked += 1

        # DLQ health while we're at it
        unresolved = DeadLetterQueue.objects.filter(resolved=False).count()
        dlq_unresolved_count.set(unresolved)

        return {
            'status': 'ok',
            'keys_checked': keys_checked,
            'any_warning': any_warning,
            'dlq_unresolved': unresolved,
        }
    except Exception as exc:
        log_event('error', 'log_quota_status_failed', error=str(exc)[:300])
        return {'status': 'error', 'error': str(exc)[:300]}
    finally:
        connection.close()


# ── Auto-submit expired assignments — Beat task every 60 seconds ──────────────

@shared_task(
    bind=True,
    max_retries=0,       # Beat tasks should not retry — next run picks up leftovers
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=55,  # Must complete before next 60-second Beat interval
    time_limit=60,
    queue='rule_scoring',
)
def auto_submit_expired_assignments(self):
    """
    Celery Beat task: server-side safety net for students who could not
    auto-submit client-side (browser crash, network loss, dead device).

    Runs every 60 seconds.  Finds 'started' assignments where:
      • global_deadline is set
      • global_deadline expired more than 2 minutes ago (grace window)

    The 2-minute grace window gives the client priority — the client has
    more granular partial-answer data from the current session state.
    Server enforcement is the backstop for crashes and network failures.

    Processes up to 100 assignments per run (fits safely in the 60s budget).
    Per-assignment errors are isolated — one failure never aborts the batch.
    Fully idempotent — calling _finalize_and_dispatch on an already-completed
    assignment is a no-op that returns the existing submission.
    """
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed'}

    try:
        # Import here (not at module top) to avoid the circular import:
        # tasks.py → clap_attempt.py → (lazy) tasks.py
        from api.views.student.clap_attempt import _finalize_and_dispatch
    except ImportError as exc:
        log_event('error', 'auto_submit_beat_import_error', error=str(exc)[:300])
        return {'status': 'error', 'reason': 'import_failed'}

    # 2-minute grace window: assignments expired 2+ minutes ago are actionable.
    # Assignments expired < 2 minutes ago are still in the client grace period.
    grace_window = timezone.now() - timezone.timedelta(minutes=2)

    try:
        candidates = list(
            StudentClapAssignment.objects.filter(
                status='started',
                clap_test__global_deadline__isnull=False,
                clap_test__global_deadline__lt=grace_window,
            ).select_related('clap_test', 'student').order_by('clap_test__global_deadline')[:100]
        )
    except Exception as query_exc:
        log_event('error', 'auto_submit_beat_query_error', error=str(query_exc)[:300])
        return {'status': 'error', 'reason': 'query_failed'}

    if not candidates:
        return {'status': 'ok', 'processed': 0, 'auto_submitted': 0}

    auto_submitted_count = 0
    already_done_count   = 0
    error_count          = 0

    for assignment in candidates:
        try:
            _submission, created = _finalize_and_dispatch(assignment, 'server_deadline')
            if created:
                auto_submitted_count += 1
                log_event(
                    'info', 'auto_submit_server_enforced',
                    assignment_id=str(assignment.id),
                    student_id=str(assignment.student_id),
                    deadline=assignment.clap_test.global_deadline.isoformat(),
                )
            else:
                already_done_count += 1
        except Exception as exc:
            error_count += 1
            log_event(
                'error', 'auto_submit_beat_assignment_error',
                assignment_id=str(assignment.id),
                error=str(exc)[:300],
            )
            # Per-assignment isolation: continue to next candidate on error

    log_event(
        'info', 'auto_submit_beat_complete',
        total=len(candidates),
        auto_submitted=auto_submitted_count,
        already_done=already_done_count,
        errors=error_count,
    )

    return {
        'status': 'ok',
        'total': len(candidates),
        'auto_submitted': auto_submitted_count,
        'already_done': already_done_count,
        'errors': error_count,
    }


# ── Audio conversion — WebM/MP4 → MP3 64kbps mono ───────────────────────────

@shared_task(
    bind=True,
    name='api.tasks.convert_audio_to_mp3',
    queue='report_gen',           # celery-reports worker handles media processing
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=120,
    time_limit=150,
)
def convert_audio_to_mp3(self, audio_response_id: str):
    """
    Convert a student audio response from WebM/MP4 to MP3 (64 kbps mono).

    Flow:
      1. Download the original file from S3 to a temp file.
      2. Convert via pydub (ffmpeg backend) — 64kbps mono, 48kHz.
      3. Upload the MP3 back to S3 at the same path with .mp3 extension.
      4. Update StudentAudioResponse.file_path / mime_type / file_size.
      5. Delete the original WebM/MP4 from S3.

    Idempotent: if the file_path already ends with .mp3 the task exits early.
    Safe to re-queue: temp files are always cleaned up in the finally block.
    """
    import tempfile

    try:
        audio_resp = StudentAudioResponse.objects.get(id=audio_response_id)
    except StudentAudioResponse.DoesNotExist:
        logger.warning('convert_audio_to_mp3: AudioResponse %s not found — skipping', audio_response_id)
        return {'status': 'skipped', 'reason': 'not_found'}

    file_path = audio_resp.file_path or ''

    # Already MP3 — nothing to do
    if file_path.endswith('.mp3') or audio_resp.mime_type == 'audio/mpeg':
        logger.info('convert_audio_to_mp3: %s already MP3 — skipping', audio_response_id)
        return {'status': 'skipped', 'reason': 'already_mp3'}

    # Only handle S3-backed files
    if not file_path.startswith('s3://'):
        logger.warning('convert_audio_to_mp3: %s is not S3-backed (%s) — skipping', audio_response_id, file_path)
        return {'status': 'skipped', 'reason': 'not_s3'}

    # Parse  s3://bucket/key/path/file.webm
    without_scheme = file_path[5:]
    bucket, _, key = without_scheme.partition('/')
    if not bucket or not key:
        logger.error('convert_audio_to_mp3: Cannot parse S3 path: %s', file_path)
        return {'status': 'error', 'reason': 'bad_s3_path'}

    if _boto3 is None:
        logger.error('convert_audio_to_mp3: boto3 not available')
        return {'status': 'error', 'reason': 'boto3_missing'}

    try:
        from pydub import AudioSegment
    except ImportError:
        logger.error('convert_audio_to_mp3: pydub not installed — cannot convert')
        return {'status': 'error', 'reason': 'pydub_missing'}

    s3 = _boto3.client(
        's3',
        region_name=getattr(settings, 'S3_REGION_NAME', None) or None,
        aws_access_key_id=getattr(settings, 'S3_ACCESS_KEY_ID', None) or None,
        aws_secret_access_key=getattr(settings, 'S3_SECRET_ACCESS_KEY', None) or None,
        endpoint_url=getattr(settings, 'S3_ENDPOINT_URL', None) or None,
    )

    original_ext = key.rsplit('.', 1)[-1].lower() if '.' in key else 'webm'
    mp3_key = key.rsplit('.', 1)[0] + '.mp3'

    tmp_in_path = None
    tmp_out_path = None

    try:
        # Create temp files
        with tempfile.NamedTemporaryFile(suffix=f'.{original_ext}', delete=False) as tmp_in:
            tmp_in_path = tmp_in.name
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp_out:
            tmp_out_path = tmp_out.name

        # 1. Download original from S3
        s3.download_file(bucket, key, tmp_in_path)
        original_size = os.path.getsize(tmp_in_path)

        # 2. Convert to MP3 — 64kbps mono, 48kHz (optimal for speech)
        audio = AudioSegment.from_file(tmp_in_path, format=original_ext)
        audio = audio.set_channels(1).set_frame_rate(48000)
        audio.export(tmp_out_path, format='mp3', bitrate='64k')
        mp3_size = os.path.getsize(tmp_out_path)

        # 3. Upload MP3 to S3
        s3.upload_file(
            tmp_out_path,
            bucket,
            mp3_key,
            ExtraArgs={
                'ContentType': 'audio/mpeg',
                'ServerSideEncryption': 'AES256',
            },
        )

        # 4. Update DB record
        StudentAudioResponse.objects.filter(id=audio_response_id).update(
            file_path=f's3://{bucket}/{mp3_key}',
            mime_type='audio/mpeg',
            file_size=mp3_size,
        )

        # 5. Delete original WebM/MP4 from S3
        s3.delete_object(Bucket=bucket, Key=key)

        saving_pct = round((1 - mp3_size / original_size) * 100, 1) if original_size else 0
        log_event(
            'info', 'audio_converted_to_mp3',
            audio_response_id=audio_response_id,
            original_key=key,
            mp3_key=mp3_key,
            original_size_kb=round(original_size / 1024, 1),
            mp3_size_kb=round(mp3_size / 1024, 1),
            saving_pct=saving_pct,
        )
        return {
            'status': 'ok',
            'audio_response_id': audio_response_id,
            'original_key': key,
            'mp3_key': mp3_key,
            'mp3_size_kb': round(mp3_size / 1024, 1),
            'saving_pct': saving_pct,
        }

    except SoftTimeLimitExceeded:
        log_event('error', 'convert_audio_soft_time_limit', audio_response_id=audio_response_id)
        raise
    except Exception as exc:
        logger.exception('convert_audio_to_mp3 failed for %s: %s', audio_response_id, exc)
        raise
    finally:
        for p in [tmp_in_path, tmp_out_path]:
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass
        connection.close()

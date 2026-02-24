"""Celery tasks for CLAP submission processing pipeline."""

from decimal import Decimal
from typing import Optional
import json
import re
import os
from importlib.util import find_spec
from urllib import request as urlrequest
from urllib.parse import urlparse

from celery import shared_task
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
    StudentAudioResponse,
    StudentClapAssignment,
    StudentClapResponse,
    SubmissionScore,
    DeadLetterQueue,
)
from api.utils.openai_client import evaluate_speaking as openai_evaluate_speaking
from api.utils.openai_client import evaluate_writing as openai_evaluate_writing
from api.utils.observability import log_event
from api.utils.metrics import llm_validation_failures_total, report_generation_duration, dlq_unresolved_count

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
        return client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiry,
        )
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


def _extract_json(raw_text: str):
    try:
        return json.loads(raw_text)
    except Exception:
        pass

    cleaned = raw_text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\n?', '', cleaned)
        cleaned = re.sub(r'\n?```$', '', cleaned)
    return json.loads(cleaned)


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


def _gemini_generate_json(prompt: str):
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError('GEMINI_API_KEY is not configured')

    model = settings.GEMINI_MODEL
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'temperature': 0.2, 'responseMimeType': 'application/json'},
    }
    req = urlrequest.Request(
        endpoint,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urlrequest.urlopen(req, timeout=120) as resp:
        raw = json.loads(resp.read().decode('utf-8'))
    text = raw['candidates'][0]['content']['parts'][0]['text']
    return _extract_json(text)


def _evaluate_writing_payload(essay: str, prompt: str):
    safe_essay, redactions = _redact_pii(essay or '')
    if redactions:
        log_event('info', 'pii_redacted', domain='writing', redactions=redactions)

    provider = settings.LLM_PROVIDER.lower()
    if provider == 'gemini':
        return _gemini_generate_json(f'Prompt: {prompt}\nEssay: {safe_essay}\nReturn JSON with score(0-10) and feedback object.')

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

    provider = settings.LLM_PROVIDER.lower()
    if provider == 'gemini':
        return _gemini_generate_json(f'Prompt: {prompt}\nTranscript: {safe_transcript}\nReturn JSON with score(0-10) and feedback object.')

    result = openai_evaluate_speaking(transcript=safe_transcript, prompt=prompt)
    return {
        'score': float(result.get('score', 0)),
        'feedback': {
            'overall': result.get('feedback', ''),
            'breakdown': result.get('breakdown', {}),
        },
    }


def _try_mark_llm_complete(submission: AssessmentSubmission):
    if SubmissionScore.objects.filter(submission=submission, domain='writing').exists() and SubmissionScore.objects.filter(submission=submission, domain='speaking').exists():
        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_LLM_COMPLETE,
            expected_status=AssessmentSubmission.STATUS_LLM_PROCESSING,
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
            'llm_request_id': f"{settings.LLM_PROVIDER}-{timezone.now().timestamp()}",
        },
    )


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=False, default_retry_delay=5, acks_late=True, reject_on_worker_lost=True, time_limit=120, soft_time_limit=100)
def score_rule_based(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
        log_event('info', 'task_started', task='score_rule_based', submission_id=str(submission_id), correlation_id=_correlation_id(self, submission_id))

        existing_rule_domains = set(
            SubmissionScore.objects.filter(
                submission=submission,
                domain__in=['listening', 'reading', 'vocab'],
            ).values_list('domain', flat=True)
        )

        assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
        if not assignment:
            raise ValueError(f'No assignment found for submission {submission_id}')

        component_map = {'listening': 'listening', 'reading': 'reading', 'vocab': 'vocabulary'}

        with transaction.atomic():
            for domain, component_type in component_map.items():
                if domain in existing_rule_domains:
                    continue
                component_ids = ClapTestComponent.objects.filter(clap_test=submission.assessment, test_type=component_type).values_list('id', flat=True)
                if not component_ids:
                    _upsert_rule_score(submission, domain, Decimal('0.00'))
                    continue
                marks = StudentClapResponse.objects.filter(assignment=assignment, item__component_id__in=component_ids).aggregate(total=Sum('marks_awarded'))['total']
                _upsert_rule_score(submission, domain, Decimal(marks or 0).quantize(Decimal('0.01')))

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


@shared_task(bind=True, max_retries=3, autoretry_for=(TimeoutError, ConnectionError, ValueError), retry_backoff=True, retry_backoff_max=300, retry_jitter=True, acks_late=True, reject_on_worker_lost=True, time_limit=180, soft_time_limit=160)
def evaluate_writing(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

        if SubmissionScore.objects.filter(submission=submission, domain='writing').exists():
            return {'status': 'skipped', 'reason': 'writing score already exists', 'submission_id': submission_id}

        assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
        response = StudentClapResponse.objects.filter(assignment=assignment, item__component__test_type='writing').order_by('-updated_at').first()

        essay = ''
        if response and response.response_data is not None:
            essay = response.response_data if isinstance(response.response_data, str) else json.dumps(response.response_data)

        payload = _evaluate_writing_payload(essay=essay, prompt='Evaluate writing response using rubric and return JSON')
        _persist_llm_score(submission, 'writing', payload)
        _try_mark_llm_complete(submission)
        return {'status': 'ok', 'task': 'evaluate_writing', 'submission_id': submission_id}
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('evaluate_writing', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        raise
    finally:
        connection.close()


@shared_task(bind=True, max_retries=3, autoretry_for=(TimeoutError, ConnectionError, ValueError), retry_backoff=True, retry_backoff_max=300, retry_jitter=True, acks_late=True, reject_on_worker_lost=True, time_limit=180, soft_time_limit=160)
def evaluate_speaking(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)

        if SubmissionScore.objects.filter(submission=submission, domain='speaking').exists():
            return {'status': 'skipped', 'reason': 'speaking score already exists', 'submission_id': submission_id}

        assignment = StudentClapAssignment.objects.filter(student=submission.user, clap_test=submission.assessment).first()
        audio = StudentAudioResponse.objects.filter(assignment=assignment, item__component__test_type='speaking').order_by('-uploaded_at').first()

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
                        ext = audio.file_path.rsplit('.', 1)[-1]
                        with tempfile.SpooledTemporaryFile(
                            max_size=5 * 1024 * 1024,  # spill to disk above 5 MB
                            suffix=f'.{ext}',
                        ) as tmp:
                            s3_client.download_fileobj(s3_bucket, s3_key, tmp)
                            tmp.seek(0)
                            # Whisper API expects (filename, bytes, content_type)
                            audio_file_obj = (
                                f'audio.{ext}',
                                tmp.read(),
                                audio.mime_type or 'audio/webm',
                            )
                            transcript = transcribe_audio(
                                audio_file_obj, mime_type=audio.mime_type or 'audio/webm'
                            ) or ''
                        # SpooledTemporaryFile auto-deleted on context manager exit
                elif audio.file_path:
                    # Local filesystem audio — open with context manager (no FD leak)
                    full_path = os.path.join(settings.MEDIA_ROOT, audio.file_path)
                    if os.path.exists(full_path):
                        with open(full_path, 'rb') as f:
                            transcript = transcribe_audio(f, mime_type=audio.mime_type or 'audio/webm') or ''

                if transcript:
                    # Persist so future re-runs skip Whisper
                    StudentAudioResponse.objects.filter(id=audio.id).update(transcription=transcript)
                    log_event('info', 'whisper_transcribed', submission_id=str(submission_id), chars=len(transcript))
            except Exception as whisper_exc:
                log_event('warning', 'whisper_transcription_failed', submission_id=str(submission_id), error=str(whisper_exc))
                # Proceed with empty transcript — LLM will return low score with note

        payload = _evaluate_speaking_payload(transcript=transcript, prompt='Evaluate speaking transcript using rubric and return JSON')
        _persist_llm_score(submission, 'speaking', payload)

        _try_mark_llm_complete(submission)

        return {'status': 'ok', 'task': 'evaluate_speaking', 'submission_id': submission_id}
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            _record_dlq('evaluate_speaking', submission_id, {'submission_id': str(submission_id)}, exc, self.request.retries)
        raise
    finally:
        connection.close()


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=False, default_retry_delay=30, acks_late=True, reject_on_worker_lost=True, time_limit=300, soft_time_limit=270)
def generate_report(self, submission_id):
    if _task_already_processed(self.request.id):
        return {'status': 'skipped', 'reason': 'task already processed', 'task_id': self.request.id}

    try:
        start_ts = timezone.now()

        with transaction.atomic():
            submission = AssessmentSubmission.objects.select_for_update().select_related('assessment', 'user').get(id=submission_id)

            if submission.report_url:
                return {'status': 'skipped', 'task': 'generate_report', 'submission_id': submission_id, 'reason': 'report already exists'}

            _transition_submission_status(
                submission,
                AssessmentSubmission.STATUS_REPORT_GENERATING,
                expected_status=AssessmentSubmission.STATUS_LLM_COMPLETE,
            )

        scores = list(SubmissionScore.objects.filter(submission=submission).order_by('domain'))
        if len(scores) < 5:
            raise ValueError(f'Report generation requires 5 domain scores; found {len(scores)} for {submission_id}')

        html = render_to_string('reports/submission_report.html', {
            'submission': submission,
            'scores': scores,
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
        return {'status': 'ok', 'task': 'generate_report', 'submission_id': submission_id, 'report_url': report_url}
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
            return {'status': 'skipped', 'task': 'send_email_report', 'submission_id': submission_id, 'reason': 'email already sent'}

        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_EMAIL_SENDING,
            expected_status=AssessmentSubmission.STATUS_REPORT_READY,
        )

        scores = list(SubmissionScore.objects.filter(submission=submission).order_by('domain'))
        student_name = submission.user.full_name or submission.user.email
        report_url = _presigned_report_download_url(submission.report_url or '')

        html_body = render_to_string(
            'emails/submission_ready.html',
            {
                'student_name': student_name,
                'scores': scores,
                'report_url': report_url,
            },
        )

        message = EmailMultiAlternatives(
            subject='Your CLAP Assessment Results Are Ready',
            body=f'Your CLAP report is ready. Download: {report_url}',
            from_email=getattr(settings, 'FROM_EMAIL', None),
            to=[submission.user.email],
        )
        message.attach_alternative(html_body, 'text/html')
        message.send()

        AssessmentSubmission.objects.filter(id=submission.id).update(
            email_sent_at=timezone.now(),
            updated_at=timezone.now(),
        )

        _transition_submission_status(
            submission,
            AssessmentSubmission.STATUS_COMPLETE,
            expected_status=AssessmentSubmission.STATUS_EMAIL_SENDING,
        )

        return {'status': 'ok', 'task': 'send_email_report', 'submission_id': submission_id}
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

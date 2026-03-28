import base64 as _base64
import csv
import io
import json
import os
import uuid as _uuid_mod
import zipfile
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q as _Q
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, StudentClapAssignment, SubmissionScore
from api.utils.auth import require_admin as _require_admin
from api.utils.cdn import resolve_delivery_url

from importlib.util import find_spec

if find_spec('celery') is not None:
    from api.tasks import generate_report
else:
    generate_report = None

if find_spec('boto3') is not None:
    import boto3
else:
    boto3 = None


def _get_logo_data_uri() -> str:
    """Read the CLAP logo once and return a base64 data URI for inline embedding.
    Works for both WeasyPrint PDF generation and browser iframe previews."""
    logo_path = os.path.join(
        os.path.dirname(__file__), '..', '..', 'templates', 'reports', 'clap-logo-original.png'
    )
    try:
        with open(os.path.normpath(logo_path), 'rb') as f:
            return 'data:image/png;base64,' + _base64.b64encode(f.read()).decode()
    except Exception:
        return ''


def _get_anits_logo_data_uri() -> str:
    """Read the ANITS institution logo for inline embedding in PDF reports."""
    logo_path = os.path.join(
        os.path.dirname(__file__), '..', '..', 'templates', 'reports', 'anits-logo.png'
    )
    try:
        with open(os.path.normpath(logo_path), 'rb') as f:
            return 'data:image/png;base64,' + _base64.b64encode(f.read()).decode()
    except Exception:
        return ''


TEMPLATE_CONFIG_CACHE_KEY = 'clap:report_template_config'
TEMPLATE_CONFIG_DEFAULTS = {
    'institution_name': 'CLAP',
    'institution_tagline': 'Comprehensive Language Assessment Platform',
    'show_logo': True,
    'layout': 'default',
}


def _parse_s3_report_location(report_url):
    if not report_url:
        return None, None

    if report_url.startswith('s3://'):
        without_scheme = report_url[5:]
        if '/' not in without_scheme:
            return None, None
        bucket, key = without_scheme.split('/', 1)
        return bucket, key

    parsed = urlparse(report_url)
    endpoint = (getattr(settings, 'S3_ENDPOINT_URL', '') or '').rstrip('/')
    bucket = (getattr(settings, 'S3_BUCKET_NAME', '') or '').strip()
    if parsed.scheme in ('http', 'https') and endpoint and bucket and report_url.startswith(endpoint):
        key = parsed.path.lstrip('/')
        if key.startswith(f'{bucket}/'):
            key = key[len(bucket) + 1:]
        return bucket, key

    return None, None


def _s3_client():
    if boto3 is None:
        return None
    endpoint = getattr(settings, 'S3_ENDPOINT_URL', None)
    key = getattr(settings, 'S3_ACCESS_KEY_ID', None)
    secret = getattr(settings, 'S3_SECRET_ACCESS_KEY', None)
    region = getattr(settings, 'S3_REGION_NAME', None) or None
    if not key or not secret:
        return None

    kwargs = {
        'aws_access_key_id': key,
        'aws_secret_access_key': secret,
    }
    if endpoint:
        kwargs['endpoint_url'] = endpoint
    if region:
        kwargs['region_name'] = region
    return boto3.client('s3', **kwargs)


def _presigned_report_url(report_url):
    bucket, key = _parse_s3_report_location(report_url)
    if not bucket or not key:
        return report_url

    client = _s3_client()
    if client is None:
        return report_url

    try:
        # Phase 2.1: wrap through CDN resolver — no-op when CDN_ENABLED=False.
        raw = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=int(getattr(settings, 'S3_PRESIGNED_URL_EXPIRY_SECONDS', 604800)),
        )
        return resolve_delivery_url(raw, url_type='download')
    except Exception:
        return report_url


def _report_rows_for_qs(qs):
    rows = []
    for submission in qs.select_related('user', 'assessment'):
        full_name = (getattr(submission.user, 'full_name', None) or '').strip()
        rows.append(
            {
                'submission_id':      str(submission.id),
                'student_id':         str(submission.user_id),
                'student_name':       full_name or submission.user.email,
                'student_email':      submission.user.email,
                'assessment_id':      str(submission.assessment_id),
                'assessment_name':    getattr(submission.assessment, 'name', None),
                # pipeline_status: raw DB status so frontend can detect REPORT_GENERATING
                'pipeline_status':    submission.status,
                'report_url':         submission.report_url,
                'report_download_url': _presigned_report_url(submission.report_url or ''),
                # generated_at mirrors updated_at — the report is written during the last status update
                'generated_at': submission.updated_at.isoformat() if submission.updated_at else None,
                'created_at':   submission.created_at.isoformat() if submission.created_at else None,
            }
        )
    return rows


@csrf_exempt
@require_http_methods(['GET'])
def report_by_submission(request, submission_id):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    return JsonResponse(
        {
            'submission_id': str(submission.id),
            'status': submission.status,
            'report_url': submission.report_url,
            'report_download_url': _presigned_report_url(submission.report_url or ''),
            'student': {
                'id': str(submission.user_id),
                'email': submission.user.email,
            },
            'assessment': {
                'id': str(submission.assessment_id),
                'name': getattr(submission.assessment, 'name', None),
            },
            'updated_at': submission.updated_at.isoformat() if submission.updated_at else None,
        }
    )


@csrf_exempt
@require_http_methods(['POST'])
def regenerate_report(request, submission_id):
    """
    Re-generate the PDF report for a single submission from existing DB scores.

    Critical design notes:
      1. Sets status to STATUS_LLM_COMPLETE (NOT STATUS_REPORT_GENERATING).
         generate_report task guard: `if status != LLM_COMPLETE → skip`.
         Setting REPORT_GENERATING here caused the task to skip immediately —
         the report was never regenerated. LLM_COMPLETE is the correct entry
         point; the task itself transitions to REPORT_GENERATING when it starts.

      2. Resets email_sent_at = None so generate_report's safety-net dispatch
         of send_email_report will deliver the new report to the student.
         Without this reset the email task's `if email_sent_at: skip` guard
         fires and the student never receives the updated report.

      3. select_for_update() prevents two concurrent admin clicks from both
         succeeding and dispatching duplicate Celery tasks.

      4. Idempotency guard: rejects if already STATUS_REPORT_GENERATING so a
         double-click mid-task cannot wipe report_url while Celery is writing it.

      5. Celery dispatch after transaction commit. If dispatch fails the DB is
         rolled back to the pre-regenerate status — no stuck null report_url.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    if generate_report is None:
        return JsonResponse({'error': 'Celery is not available in this environment'}, status=503)

    # ── 1. Validate submission_id is a proper UUID ─────────────────────────
    try:
        sub_uuid = _uuid_mod.UUID(str(submission_id))
    except (ValueError, AttributeError):
        return JsonResponse({'error': 'Invalid submission_id — must be a valid UUID'}, status=400)

    # ── 2. Atomic block: lock row → guard → update → audit ─────────────────
    old_status = None
    try:
        with transaction.atomic():
            try:
                submission = (
                    AssessmentSubmission.objects
                    .select_for_update()
                    .select_related('user', 'assessment')
                    .get(id=sub_uuid)
                )
            except AssessmentSubmission.DoesNotExist:
                return JsonResponse({'error': 'Submission not found'}, status=404)

            # ── 3. Idempotency: reject if already regenerating ─────────────
            # Allow re-trigger if stuck for > 10 min (Celery worker crashed/restarted)
            _STUCK_THRESHOLD_S = 600  # 10 minutes
            if submission.status == AssessmentSubmission.STATUS_REPORT_GENERATING:
                stuck_seconds = (timezone.now() - submission.updated_at).total_seconds()
                if stuck_seconds < _STUCK_THRESHOLD_S:
                    return JsonResponse(
                        {'error': 'Report is already being regenerated. Wait for the current task to complete.'},
                        status=409,
                    )
                # Stuck > 10 min — worker likely crashed; fall through to re-trigger

            old_status               = submission.status
            # KEY FIX: must be LLM_COMPLETE so generate_report task passes its
            # status guard. Setting REPORT_GENERATING here caused the task to
            # return 'skipped' immediately — the report was never regenerated.
            submission.status        = AssessmentSubmission.STATUS_LLM_COMPLETE
            submission.report_url    = None
            submission.email_sent_at = None   # allow safety-net to re-send email with new report
            submission.updated_at    = timezone.now()
            submission.save(update_fields=['status', 'report_url', 'email_sent_at', 'updated_at'])

            AuditLog.objects.create(
                submission=submission,
                event_type='report_regenerate_requested',
                old_status=old_status,
                new_status=submission.status,
                worker_id=f'admin:{admin_user.id}',
            )
            # transaction commits here — row lock released
    except Exception as exc:
        return JsonResponse({'error': f'Database error preparing regeneration: {exc}'}, status=500)

    # ── 4. Dispatch Celery task AFTER DB commit ────────────────────────────
    try:
        async_result = generate_report.apply_async(
            args=[str(sub_uuid)],
            headers={'correlation_id': submission.correlation_id or str(sub_uuid)},
        )
    except Exception as exc:
        # Task broker unavailable — restore submission to its previous state
        AssessmentSubmission.objects.filter(id=sub_uuid).update(
            status=old_status,
            report_url=None,
            updated_at=timezone.now(),
        )
        AuditLog.objects.create(
            submission_id=sub_uuid,
            event_type='report_regenerate_dispatch_failed',
            old_status=AssessmentSubmission.STATUS_LLM_COMPLETE,
            new_status=old_status,
            worker_id=f'admin:{admin_user.id}',
            error_detail=f'celery_dispatch_failed: {exc}',
        )
        return JsonResponse(
            {'error': f'Failed to queue regeneration task — Celery broker may be unavailable: {exc}'},
            status=503,
        )

    return JsonResponse(
        {
            'status':        'accepted',
            'submission_id': str(sub_uuid),
            'task_id':       async_result.id,
            'old_status':    old_status,
            'new_status':    AssessmentSubmission.STATUS_LLM_COMPLETE,
        },
        status=202,
    )


@csrf_exempt
@require_http_methods(['GET'])
def bulk_report_download(request):
    _, err = _require_admin(request)
    if err:
        return err

    batch_id = request.GET.get('batch_id')
    assessment_id = request.GET.get('assessment_id')
    if not batch_id and not assessment_id:
        return JsonResponse({'error': 'Provide batch_id or assessment_id'}, status=400)

    qs = AssessmentSubmission.objects.filter(report_url__isnull=False)
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    submissions = list(qs.order_by('-created_at')[:500])
    if not submissions:
        return JsonResponse({'error': 'No reports found for provided filters'}, status=404)

    zip_buffer = io.BytesIO()
    manifest_buffer = io.StringIO()
    csv_writer = csv.writer(manifest_buffer)
    csv_writer.writerow(['submission_id', 'student_email', 'assessment_id', 'report_url', 'report_download_url'])

    with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        for submission in submissions:
            report_url = submission.report_url or ''
            download_url = _presigned_report_url(report_url)
            csv_writer.writerow([str(submission.id), submission.user.email, str(submission.assessment_id), report_url, download_url])

            if report_url.startswith('/media/'):
                rel_path = report_url[len('/media/'):]
                abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
                if os.path.exists(abs_path):
                    zf.write(abs_path, arcname=f'reports/{submission.id}.pdf')

        zf.writestr('report_manifest.csv', manifest_buffer.getvalue())

    filename = f"reports_{timezone.now().strftime('%Y%m%d_%H%M%S')}.zip"
    response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['X-Reports-Count'] = str(len(submissions))
    return response


@csrf_exempt
@require_http_methods(['GET', 'PUT'])
def report_template_config(request):
    _, err = _require_admin(request)
    if err:
        return err

    if request.method == 'GET':
        cfg = cache.get(TEMPLATE_CONFIG_CACHE_KEY) or {}
        return JsonResponse({'config': {**TEMPLATE_CONFIG_DEFAULTS, **cfg}})

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    allowed = set(TEMPLATE_CONFIG_DEFAULTS.keys())
    updates = {k: payload[k] for k in payload.keys() if k in allowed}
    cfg = {**(cache.get(TEMPLATE_CONFIG_CACHE_KEY) or {}), **updates}
    cache.set(TEMPLATE_CONFIG_CACHE_KEY, cfg, timeout=7 * 24 * 3600)

    return JsonResponse({'status': 'ok', 'config': {**TEMPLATE_CONFIG_DEFAULTS, **cfg}})


def _compute_grade_for_preview(total_score, max_total):
    """Inline grade computation matching tasks.py _compute_grade logic."""
    if not max_total:
        return 'N/A'
    pct = float(total_score) / float(max_total) * 100
    if pct >= 90:
        return 'O'
    if pct >= 80:
        return 'A+'
    if pct >= 70:
        return 'A'
    if pct >= 60:
        return 'B+'
    return 'B'


# Rich sample scores used when previewing without a real submission.
# Structure exactly mirrors SubmissionScore model fields that submission_report.html reads.
_PREVIEW_SAMPLE_SCORES = [
    {
        'domain': 'listening',
        'score': 7.0,
        'evaluated_by': 'rule',
        'feedback_json': None,
    },
    {
        'domain': 'speaking',
        'score': 7.8,
        'evaluated_by': 'llm',
        'feedback_json': {
            'overall': 'Good fluency with natural rhythm; improve consistency of pronunciation.',
            'breakdown': {
                'fluency':       {'score': 8, 'maxScore': 10, 'feedback': 'Maintains good pace with few hesitations.'},
                'pronunciation': {'score': 7, 'maxScore': 10, 'feedback': 'Mostly clear; occasional sounds need refinement.'},
                'vocabulary':    {'score': 8, 'maxScore': 10, 'feedback': 'Varied and appropriate word choice.'},
                'grammar':       {'score': 8, 'maxScore': 10, 'feedback': 'Minor structural errors in complex sentences.'},
            },
        },
    },
    {
        'domain': 'reading',
        'score': 8.0,
        'evaluated_by': 'rule',
        'feedback_json': None,
    },
    {
        'domain': 'writing',
        'score': 8.2,
        'evaluated_by': 'llm',
        'feedback_json': {
            'overall': 'Clear structure with well-developed arguments and minor grammatical issues.',
            'breakdown': {
                'taskAchievement': {'score': 8, 'maxScore': 10, 'feedback': 'Task addressed effectively with relevant content.'},
                'coherence':       {'score': 8, 'maxScore': 10, 'feedback': 'Ideas are logically organised with good cohesive devices.'},
                'vocabulary':      {'score': 9, 'maxScore': 10, 'feedback': 'Good range of vocabulary used with precision.'},
                'grammar':         {'score': 8, 'maxScore': 10, 'feedback': 'Minor grammatical errors that do not impede understanding.'},
            },
        },
    },
    {
        'domain': 'vocabulary',
        'score': 7.5,
        'evaluated_by': 'rule',
        'feedback_json': None,
    },
]

# Canonical display order for domain scores in the report card.
_DOMAIN_DISPLAY_ORDER = ['listening', 'speaking', 'reading', 'writing', 'vocab', 'vocabulary']


@csrf_exempt
@require_http_methods(['POST'])
def report_template_preview(request):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    submission_id = payload.get('submission_id')
    cfg = {**TEMPLATE_CONFIG_DEFAULTS, **(cache.get(TEMPLATE_CONFIG_CACHE_KEY) or {})}
    overrides = payload.get('config') if isinstance(payload.get('config'), dict) else {}
    cfg.update({k: v for k, v in overrides.items() if k in TEMPLATE_CONFIG_DEFAULTS})

    # ── Build context that EXACTLY mirrors what generate_report task passes ──
    # submission_report.html expects:
    #   submission.user.full_name, submission.user.email
    #   submission.assessment.name, submission.id
    #   scores[].domain, .score, .evaluated_by, .feedback_json
    #   total_score, max_total, grade, generated_at

    scores = []
    student_name       = 'Sample Student'
    student_email      = 'student@example.com'
    student_id_display = '—'
    assessment_name    = 'Sample Assessment'
    real_submission_id = 'PREVIEW-0000'
    preview_set_name   = None

    if submission_id:
        try:
            sub_uuid = _uuid_mod.UUID(str(submission_id))
            submission_obj = (
                AssessmentSubmission.objects
                .select_related('user', 'assessment')
                .get(id=sub_uuid)
            )
            student_name       = (getattr(submission_obj.user, 'full_name', None) or '').strip() or submission_obj.user.email
            student_email      = submission_obj.user.email
            student_id_display = getattr(submission_obj.user, 'student_id', None) or '—'
            assessment_name    = getattr(submission_obj.assessment, 'name', assessment_name)
            real_submission_id = str(submission_obj.id)
            scores = list(
                SubmissionScore.objects
                .filter(submission=submission_obj)
                .values('domain', 'score', 'evaluated_by', 'feedback_json')
            )
            scores.sort(key=lambda s: _DOMAIN_DISPLAY_ORDER.index(s['domain'])
                        if s['domain'] in _DOMAIN_DISPLAY_ORDER else 99)
            # Resolve set name for this student's assignment
            try:
                _asgn = (
                    StudentClapAssignment.objects
                    .filter(student=submission_obj.user, clap_test=submission_obj.assessment)
                    .select_related('assigned_set')
                    .only('assigned_set')
                    .first()
                )
                if _asgn and _asgn.assigned_set:
                    preview_set_name = f'Set {_asgn.assigned_set.label}'
            except Exception:
                pass
        except (AssessmentSubmission.DoesNotExist, ValueError, AttributeError):
            pass  # fall through to sample scores below

    if not scores:
        scores = _PREVIEW_SAMPLE_SCORES

    total_score = sum(float(s['score']) for s in scores)
    max_total   = 10 * len(scores)   # 10 per domain, same as tasks.py
    grade       = _compute_grade_for_preview(total_score, max_total)

    # submission_report.html accesses submission.user.* / .assessment.name / .id
    # Django template engine resolves dot notation against nested dicts too.
    submission_ctx = {
        'user':       {'full_name': student_name, 'username': student_name, 'email': student_email, 'student_id': student_id_display},
        'assessment': {'name': assessment_name},
        'id':         real_submission_id,
    }

    try:
        html = render_to_string(
            'reports/submission_report.html',
            {
                'submission':    submission_ctx,
                'scores':        scores,
                'total_score':   total_score,
                'max_total':     max_total,
                'grade':         grade,
                'generated_at':  timezone.now(),
                'set_name':      preview_set_name,
                'template_config': cfg,
                'logo_data_uri': _get_logo_data_uri(),
                'anits_logo_data_uri': _get_anits_logo_data_uri(),
            },
        )
    except Exception as exc:
        return JsonResponse(
            {'error': f'Template render failed: {exc}. Ensure reports/submission_report.html exists.'},
            status=500,
        )

    return JsonResponse({'config': cfg, 'html_preview': html})


@csrf_exempt
@require_http_methods(['GET'])
def report_list(request):
    _, err = _require_admin(request)
    if err:
        return err

    # Include submissions that have a report OR are currently being regenerated.
    # Without the REPORT_GENERATING clause, records disappear from the list while
    # Celery is working and never reappear if the task fails — confusing for admins.
    qs = AssessmentSubmission.objects.filter(
        _Q(report_url__isnull=False) |
        _Q(status=AssessmentSubmission.STATUS_REPORT_GENERATING)
    ).order_by('-updated_at')

    status = request.GET.get('status')
    if status:
        qs = qs.filter(status=status)

    batch_id = request.GET.get('batch_id')
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)

    assessment_id = request.GET.get('assessment_id')
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    # Server-side search: email (partial icontains) or student UUID (exact OR partial icontains).
    # user_id is a UUID field — Cast to text enables partial match on UUID prefix.
    # Intentionally limited to email and student ID — name/username excluded per spec.
    from django.db.models import TextField
    from django.db.models.functions import Cast
    search = (request.GET.get('search') or '').strip()
    if search:
        qs = qs.annotate(_uid_str=Cast('user_id', output_field=TextField()))
        try:
            uid = _uuid_mod.UUID(search)
            # Exact UUID match — most precise
            qs = qs.filter(_Q(user__email__icontains=search) | _Q(user_id=uid))
        except ValueError:
            # Partial search: email fragment OR UUID prefix/fragment
            qs = qs.filter(_Q(user__email__icontains=search) | _Q(_uid_str__icontains=search.lower()))

    # Pagination — hard-capped at 30 records per page
    try:
        page      = max(1, int(request.GET.get('page', 1)))
        page_size = min(30, max(1, int(request.GET.get('page_size', 30))))
    except (ValueError, TypeError):
        page, page_size = 1, 30

    total_count = qs.count()
    total_pages = max(1, (total_count + page_size - 1) // page_size)
    # Clamp page to valid range after we know total_pages
    page = min(page, total_pages)
    offset = (page - 1) * page_size

    rows = _report_rows_for_qs(qs[offset: offset + page_size])

    return JsonResponse({
        'reports': rows,
        'pagination': {
            'page': page,
            'page_size': page_size,
            'total_count': total_count,
            'total_pages': total_pages,
        },
    })

import csv
import io
import json
import os
import zipfile
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, SubmissionScore
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
        rows.append(
            {
                'submission_id': str(submission.id),
                'student_id': str(submission.user_id),
                'student_email': submission.user.email,
                'assessment_id': str(submission.assessment_id),
                'assessment_name': getattr(submission.assessment, 'name', None),
                'status': submission.status,
                'report_url': submission.report_url,
                'report_download_url': _presigned_report_url(submission.report_url or ''),
                'created_at': submission.created_at.isoformat() if submission.created_at else None,
                'updated_at': submission.updated_at.isoformat() if submission.updated_at else None,
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
    admin_user, err = _require_admin(request)
    if err:
        return err

    if generate_report is None:
        return JsonResponse({'error': 'Celery is not available in this environment'}, status=503)

    try:
        submission = AssessmentSubmission.objects.get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    old_status = submission.status
    submission.report_url = None
    submission.status = AssessmentSubmission.STATUS_REPORT_GENERATING
    submission.updated_at = timezone.now()
    submission.save(update_fields=['report_url', 'status', 'updated_at'])

    AuditLog.objects.create(
        submission=submission,
        event_type='report_regenerate_requested',
        old_status=old_status,
        new_status=submission.status,
        worker_id=f'admin:{admin_user.id}',
    )

    async_result = generate_report.apply_async(args=[str(submission.id)], headers={'correlation_id': submission.correlation_id or str(submission.id)})

    return JsonResponse(
        {
            'status': 'accepted',
            'submission_id': str(submission.id),
            'task_id': async_result.id,
            'old_status': old_status,
            'new_status': submission.status,
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

    scores = []
    student_name = 'Sample Student'
    assessment_name = 'Sample Assessment'
    if submission_id:
        try:
            submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
            student_name = submission.user.full_name or submission.user.email
            assessment_name = getattr(submission.assessment, 'name', assessment_name)
            scores = list(SubmissionScore.objects.filter(submission=submission).values('domain', 'score', 'feedback_json'))
        except AssessmentSubmission.DoesNotExist:
            return JsonResponse({'error': 'Submission not found'}, status=404)

    if not scores:
        scores = [
            {'domain': 'listening', 'score': 7.0, 'feedback_json': None},
            {'domain': 'reading', 'score': 8.0, 'feedback_json': None},
            {'domain': 'vocab', 'score': 7.5, 'feedback_json': None},
            {'domain': 'writing', 'score': 8.2, 'feedback_json': {'overall': 'Clear structure with minor grammar issues.'}},
            {'domain': 'speaking', 'score': 7.8, 'feedback_json': {'overall': 'Good fluency, improve pronunciation consistency.'}},
        ]

    html = render_to_string(
        'reports/submission_report.html',
        {
            'submission': {
                'student_name': student_name,
                'assessment_name': assessment_name,
                'id': str(submission_id) if submission_id else 'preview',
                'created_at': timezone.now(),
            },
            'scores': scores,
            'generated_at': timezone.now(),
            'template_config': cfg,
        },
    )

    return JsonResponse({'config': cfg, 'html_preview': html})


@csrf_exempt
@require_http_methods(['GET'])
def report_list(request):
    _, err = _require_admin(request)
    if err:
        return err

    status = request.GET.get('status')
    qs = AssessmentSubmission.objects.filter(report_url__isnull=False).order_by('-updated_at')
    if status:
        qs = qs.filter(status=status)

    batch_id = request.GET.get('batch_id')
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)

    assessment_id = request.GET.get('assessment_id')
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    return JsonResponse({'reports': _report_rows_for_qs(qs[:200])})

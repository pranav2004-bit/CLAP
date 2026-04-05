import json
import logging
from importlib.util import find_spec
from urllib.parse import urlparse

from django.conf import settings
from django.db import IntegrityError
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, SubmissionScore
from api.serializers import SubmissionCreateSerializer, SubmissionStatusSerializer
from api.utils.jwt_utils import get_user_from_request
from api.utils.metrics import submissions_total
from api.utils.observability import log_event
from api.utils.cdn import resolve_delivery_url

if find_spec('redis') is not None:
    import redis
else:
    redis = None

if find_spec('celery') is not None:
    from celery import chain, chord, group

    from api.tasks import (
        evaluate_speaking,
        evaluate_writing,
        generate_report,
        score_rule_based,
        send_email_report,
    )
else:
    chain = chord = group = None
    evaluate_speaking = evaluate_writing = generate_report = score_rule_based = send_email_report = None

logger = logging.getLogger(__name__)


def _redis_client():
    from api.utils.redis_client import get_redis_client
    return get_redis_client()


def _idempotency_cache_key(user_id, idempotency_key):
    return f'submission:idempotency:{user_id}:{idempotency_key}'


def _rate_limit_keys(user):
    ts_bucket = timezone.now().strftime('%Y%m%d%H')
    user_key = f'submission:ratelimit:user:{user.id}:{ts_bucket}'
    inst_scope = getattr(user, 'batch_id', None) or 'global'
    global_key = f'submission:ratelimit:institution:{inst_scope}:{ts_bucket}'
    return user_key, global_key


_RATE_LIMIT_UNAVAILABLE = {
    'error': 'Service temporarily unavailable. Please retry in a moment.',
    'retry_after': 30,
}


def _check_rate_limit(user, redis_client):
    if redis_client is None:
        # FAIL CLOSED: when Redis is down, reject submissions rather than allow
        # unlimited traffic. This prevents a Redis outage from becoming an
        # uncontrolled submission flood that exhausts DB / LLM API quotas.
        logger.warning('Redis unavailable — rate limiting fail-closed, rejecting submission')
        return False, _RATE_LIMIT_UNAVAILABLE

    user_limit = getattr(settings, 'SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR', 500)
    global_limit = getattr(settings, 'SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR', 5000)

    user_key, global_key = _rate_limit_keys(user)

    try:
        pipe = redis_client.pipeline()
        pipe.incr(user_key)
        pipe.expire(user_key, 3600)
        pipe.incr(global_key)
        pipe.expire(global_key, 3600)
        user_count, _, global_count, _ = pipe.execute()
    except Exception as e:
        # FAIL CLOSED: Redis pipeline error — reject rather than silently allow.
        # Ops can temporarily increase limits or restart Redis to recover.
        logger.error('Rate limit Redis pipeline error (fail-closed): %s', e)
        return False, _RATE_LIMIT_UNAVAILABLE

    if user_count > user_limit:
        return False, {'error': 'Rate limit exceeded for user submissions', 'scope': 'user', 'limit': user_limit}
    if global_count > global_limit:
        return False, {'error': 'Rate limit exceeded for institution submissions', 'scope': 'institution', 'limit': global_limit}
    return True, None


def _dispatch_pipeline(submission_id, correlation_id=None):
    if chain is None:
        logger.warning('Celery is unavailable; skipping pipeline dispatch for %s', submission_id)
        return False

    pipeline = chain(
        score_rule_based.si(str(submission_id)),
        chord(
            group(
                evaluate_writing.si(str(submission_id)),
                evaluate_speaking.si(str(submission_id)),
            ),
            generate_report.si(str(submission_id)),
        ),
        send_email_report.si(str(submission_id)),
    )
    pipeline.apply_async(headers={'correlation_id': correlation_id or str(submission_id)})
    return True


def _parse_s3_report_location(report_url):
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


def _report_download_url(submission):
    raw_url = submission.report_url or ''
    bucket, key = _parse_s3_report_location(raw_url)

    if not bucket or not key:
        return raw_url

    if find_spec('boto3') is None:
        return raw_url

    try:
        import boto3

        expiry = getattr(settings, 'S3_PRESIGNED_URL_EXPIRY_SECONDS', 604800)
        expiry = max(60, min(int(expiry), 604800))

        client = boto3.client(
            's3',
            endpoint_url=getattr(settings, 'S3_ENDPOINT_URL', None) or None,
            region_name=getattr(settings, 'S3_REGION_NAME', None) or None,
            aws_access_key_id=getattr(settings, 'S3_ACCESS_KEY_ID', None) or None,
            aws_secret_access_key=getattr(settings, 'S3_SECRET_ACCESS_KEY', None) or None,
        )
        # Phase 2.1: wrap through CDN resolver — no-op when CDN_ENABLED=False.
        raw = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expiry,
        )
        return resolve_delivery_url(raw, url_type='download')
    except Exception:
        logger.exception('Failed generating presigned report URL for submission %s', submission.id)
        return raw_url


@csrf_exempt
@require_http_methods(["POST"])
def create_submission(request):
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    serializer = SubmissionCreateSerializer(data=payload, context={'user': user})
    if not serializer.is_valid():
        return JsonResponse({'errors': serializer.errors}, status=400)

    idempotency_key = serializer.validated_data['idempotency_key']
    redis_client = _redis_client()
    cache_key = _idempotency_cache_key(user.id, idempotency_key)

    allowed, error_payload = _check_rate_limit(user, redis_client)
    if not allowed:
        return JsonResponse(error_payload, status=429)

    if redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            submissions_total.labels(status='duplicate_cached').inc()
            log_event('info', 'submission_duplicate_cached', submission_id=cached, user_id=str(user.id))
            return JsonResponse({'submission_id': cached, 'cached': True}, status=202)

    # ── Auto-submit dedup guard ───────────────────────────────────────────────
    # If the Beat task or client auto-submit endpoint already created a submission
    # for this assignment via _finalize_and_dispatch(), return it rather than
    # creating a duplicate pipeline run.
    #
    # The auto-submit idempotency key is: f'auto:{assignment_id}:{attempt_number}'
    # attempt_number is incremented by grant_retest for each retest, so the key
    # is unique per attempt.  We must read the CURRENT attempt_number from the
    # assignment row (not assume 1) so retests resolve to their own submission.
    _assignment_for_dedup = serializer.validated_data.get('assignment')
    if _assignment_for_dedup:
        _attempt_number = getattr(_assignment_for_dedup, 'attempt_number', 1) or 1
        _existing_auto = AssessmentSubmission.objects.filter(
            idempotency_key=f'auto:{_assignment_for_dedup.id}:{_attempt_number}'
        ).first()
        if _existing_auto:
            if redis_client:
                redis_client.setex(cache_key, 86400, str(_existing_auto.id))
            submissions_total.labels(status='auto_submit_dedup').inc()
            log_event(
                'info', 'submission_auto_submit_dedup',
                submission_id=str(_existing_auto.id), user_id=str(user.id),
            )
            return JsonResponse({
                'submission_id': str(_existing_auto.id),
                'status': _existing_auto.status,
                'pipeline_dispatched': False,
            }, status=202)

    try:
        submission = AssessmentSubmission.objects.create(
            user=user,
            assessment=serializer.validated_data['assessment'],
            idempotency_key=idempotency_key,
            status=AssessmentSubmission.STATUS_PENDING,
            correlation_id=serializer.validated_data.get('correlation_id') or None,
        )
        correlation_id = serializer.validated_data.get('correlation_id') or str(submission.id)
        dispatched = _dispatch_pipeline(submission.id, correlation_id=correlation_id)
    except IntegrityError:
        existing = AssessmentSubmission.objects.get(idempotency_key=idempotency_key)
        if redis_client:
            redis_client.setex(cache_key, 86400, str(existing.id))
        submissions_total.labels(status='duplicate_db').inc()
        log_event('info', 'submission_duplicate_db', submission_id=str(existing.id), user_id=str(user.id))
        return JsonResponse({'submission_id': str(existing.id), 'cached': True}, status=202)

    if redis_client:
        redis_client.setex(cache_key, 86400, str(submission.id))

    submissions_total.labels(status='accepted').inc()
    log_event(
        'info',
        'submission_created',
        submission_id=str(submission.id),
        user_id=str(user.id),
        correlation_id=correlation_id,
        pipeline_dispatched=dispatched,
    )

    return JsonResponse(
        {
            'submission_id': str(submission.id),
            'status': submission.status,
            'pipeline_dispatched': dispatched,
        },
        status=202,
    )


@csrf_exempt
@require_http_methods(["GET"])
def submission_status(request, submission_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        submission = AssessmentSubmission.objects.get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    if user.role == 'student' and submission.user_id != user.id:
        return JsonResponse({'error': 'Forbidden'}, status=403)

    data = SubmissionStatusSerializer(submission).data
    return JsonResponse(data)


@csrf_exempt
@require_http_methods(["GET"])
def submission_results(request, submission_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        submission = AssessmentSubmission.objects.select_related('assessment', 'user').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    if user.role == 'student' and submission.user_id != user.id:
        return JsonResponse({'error': 'Forbidden'}, status=403)

    scores = SubmissionScore.objects.filter(submission=submission).order_by('domain')
    score_rows = [
        {
            'domain': score.domain,
            'score': float(score.score),
            'feedback': score.feedback_json,
            'evaluated_by': score.evaluated_by,
            'evaluated_at': score.evaluated_at.isoformat() if score.evaluated_at else None,
        }
        for score in scores
    ]

    report_download_url = _report_download_url(submission)

    log_event('info', 'submission_results_viewed', submission_id=str(submission.id), user_id=str(user.id))

    return JsonResponse(
        {
            'submission_id': str(submission.id),
            'assessment_id': str(submission.assessment_id),
            'status': submission.status,
            'report_url': submission.report_url,
            'report_download_url': report_download_url,
            'email_sent_at': submission.email_sent_at.isoformat() if submission.email_sent_at else None,
            'scores': score_rows,
            'generated_at': timezone.now().isoformat(),
        }
    )


@csrf_exempt
@require_http_methods(["GET"])
def submission_history(request):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    # A3: prefetch_related('scores') eliminates the N+1 query that previously
    # fired 1 + (50×2) = 101 DB queries for a 50-row history page.
    qs = (
        AssessmentSubmission.objects
        .filter(user_id=user.id)
        # Exclude superseded submissions (invalidated when a retest was granted).
        # Students should only see their current attempt's submissions, not the
        # historical records from attempts that were wiped and restarted.
        .exclude(status__startswith='SUPERSEDED_')
        .select_related('assessment')
        .prefetch_related('scores')
        .order_by('-created_at')
    )

    assessment_id = request.GET.get('assessment_id')
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    rows = []
    for sub in qs[:50]:
        scores_list = list(sub.scores.all())   # uses prefetch cache — no extra DB hit
        overall_score = None
        max_score = None
        if scores_list:
            vals = [float(s.score) for s in scores_list]
            overall_score = round(sum(vals), 2)          # total marks, not average
            max_score = len(scores_list) * 10             # each domain is out of 10

        rows.append({
            'submission_id': str(sub.id),
            'assessment_id': str(sub.assessment_id),
            'assessment_name': getattr(sub.assessment, 'name', None),
            'status': sub.status,
            'overall_score': overall_score,
            'max_score': max_score,
            'created_at': sub.created_at.isoformat() if sub.created_at else None,
            'report_download_url': _report_download_url(sub),
        })

    return JsonResponse({'rows': rows, 'count': len(rows)})

import json
import time
import logging
from datetime import timedelta
from importlib.util import find_spec

from django.db.models import Count
from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, DeadLetterQueue
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)

if find_spec('redis') is not None:
    import redis
else:
    redis = None

if find_spec('celery') is not None:
    from api.tasks import retry_dlq_entry
else:
    retry_dlq_entry = None


def _require_admin(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None


def _redis_client():
    if redis is None:
        return None

    from django.conf import settings

    redis_url = getattr(settings, 'REDIS_URL', None)
    if not redis_url:
        return None
    return redis.Redis.from_url(redis_url, decode_responses=True)


def _queue_depths(client):
    from django.conf import settings

    queues = list(getattr(settings, 'CLAP_CELERY_QUEUES', ()))
    if not client or not queues:
        return []

    depths = []
    for queue in queues:
        try:
            depth = client.llen(queue)
        except Exception:
            depth = None
        depths.append({'queue_name': queue, 'depth': depth})
    return depths


@csrf_exempt
@require_http_methods(["GET"])
def submission_status_overview(request):
    _, err = _require_admin(request)
    if err:
        return err

    status_counts = {
        row['status']: row['count']
        for row in AssessmentSubmission.objects.values('status').annotate(count=Count('id'))
    }
    for status, _ in AssessmentSubmission.STATUS_CHOICES:
        status_counts.setdefault(status, 0)

    # Map granular pipeline statuses to the 4 frontend summary buckets
    processing_statuses = {
        AssessmentSubmission.STATUS_RULES_COMPLETE,
        AssessmentSubmission.STATUS_LLM_PROCESSING,
        AssessmentSubmission.STATUS_LLM_COMPLETE,
        AssessmentSubmission.STATUS_REPORT_GENERATING,
        AssessmentSubmission.STATUS_REPORT_READY,
        AssessmentSubmission.STATUS_EMAIL_SENDING,
    }
    total = sum(status_counts.values())
    pending    = status_counts.get(AssessmentSubmission.STATUS_PENDING, 0)
    processing = sum(status_counts.get(s, 0) for s in processing_statuses)
    completed  = status_counts.get(AssessmentSubmission.STATUS_COMPLETE, 0)
    failed     = status_counts.get(AssessmentSubmission.STATUS_LLM_FAILED, 0)

    return JsonResponse({
        # Flat fields the frontend reads directly
        'total':       total,
        'pending':     pending,
        'processing':  processing,
        'completed':   completed,
        'failed':      failed,
        # Full breakdown for detailed views
        'total_submissions': total,
        'status_counts':     status_counts,
    })


@csrf_exempt
@require_http_methods(["GET"])
def submission_list(request):
    _, err = _require_admin(request)
    if err:
        return err

    qs = AssessmentSubmission.objects.select_related('user', 'assessment', 'user__batch').order_by('-created_at')

    status = request.GET.get('status')
    if status:
        qs = qs.filter(status=status.upper())

    student_id = request.GET.get('student_id')
    if student_id:
        qs = qs.filter(user_id=student_id)

    batch_id = request.GET.get('batch_id')
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)

    assessment_id = request.GET.get('assessment_id')
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    created_from = request.GET.get('created_from')
    if created_from:
        qs = qs.filter(created_at__gte=created_from)

    created_to = request.GET.get('created_to')
    if created_to:
        qs = qs.filter(created_at__lte=created_to)

    # Pagination — max 30 per page
    import math
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (ValueError, TypeError):
        page = 1
    page_size = 30
    total_count = qs.count()
    total_pages = max(1, math.ceil(total_count / page_size))
    offset = (page - 1) * page_size

    rows = []
    for sub in qs[offset: offset + page_size]:
        assessment_name = (
            getattr(sub.assessment, 'name', None)
            or getattr(sub.assessment, 'title', None)
            or str(sub.assessment)
        )
        rows.append({
            'id':              str(sub.id),
            'status':          sub.status,
            # Flat fields — matches what the frontend reads directly
            'user_email':      sub.user.email,
            'user_name':       sub.user.full_name or sub.user.username or sub.user.email,
            'student_id':      sub.user.student_id or '',
            'assessment_name': assessment_name,
            'report_url':      sub.report_url,
            'email_sent_at':   sub.email_sent_at.isoformat() if sub.email_sent_at else None,
            'created_at':      sub.created_at.isoformat() if sub.created_at else None,
            'updated_at':      sub.updated_at.isoformat() if sub.updated_at else None,
        })

    return JsonResponse({
        'submissions': rows,
        'total_count': total_count,
        'page':        page,
        'page_size':   page_size,
        'total_pages': total_pages,
    })


@csrf_exempt
@require_http_methods(["GET"])
def submission_detail(request, submission_id):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        sub = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    events = AuditLog.objects.filter(submission=sub).order_by('created_at')

    assessment_name = (
        getattr(sub.assessment, 'name', None)
        or getattr(sub.assessment, 'title', None)
        or str(sub.assessment)
    )

    return JsonResponse({
        'id':              str(sub.id),
        'status':          sub.status,
        'version':         sub.version,
        'correlation_id':  sub.correlation_id,
        # Flat fields — matches what the frontend reads directly
        'user_email':      sub.user.email,
        'user_name':       sub.user.full_name or sub.user.username or sub.user.email,
        'student_id':      sub.user.student_id or '',
        'assessment_name': assessment_name,
        'report_url':      sub.report_url,
        'email_sent_at':   sub.email_sent_at.isoformat() if sub.email_sent_at else None,
        'created_at':      sub.created_at.isoformat() if sub.created_at else None,
        'updated_at':      sub.updated_at.isoformat() if sub.updated_at else None,
        # audit_log key matches what the frontend reads
        'audit_log': [
            {
                'id':           event.id,
                'event_type':   event.event_type,
                'old_status':   event.old_status,
                'new_status':   event.new_status,
                'worker_id':    event.worker_id,
                'error_detail': event.error_detail,
                'timestamp':    event.created_at.isoformat() if event.created_at else None,
            }
            for event in events
        ],
    })


@csrf_exempt
@require_http_methods(["GET"])
def dlq_dashboard_widget(request):
    _, err = _require_admin(request)
    if err:
        return err

    unresolved_qs = DeadLetterQueue.objects.filter(resolved=False).order_by('created_at')
    unresolved_count = unresolved_qs.count()
    oldest = unresolved_qs.first()

    now = timezone.now()
    oldest_age_seconds = None
    if oldest and oldest.created_at:
        oldest_age_seconds = int((now - oldest.created_at).total_seconds())

    entries = []
    for item in unresolved_qs[:20]:
        entries.append({
            'id': item.id,
            'submission_id': str(item.submission_id),
            'task_name': item.task_name,
            'retry_count': item.retry_count,
            'created_at': item.created_at.isoformat() if item.created_at else None,
            'age_seconds': int((now - item.created_at).total_seconds()) if item.created_at else None,
            'quick_actions': {
                'retry': f'/api/admin/submissions/dlq/{item.id}/quick-action?action=retry',
                'resolve': f'/api/admin/submissions/dlq/{item.id}/quick-action?action=resolve',
            },
        })

    return JsonResponse({
        'unresolved_count': unresolved_count,
        'oldest_unresolved': {
            'id': oldest.id if oldest else None,
            'created_at': oldest.created_at.isoformat() if oldest and oldest.created_at else None,
            'age_seconds': oldest_age_seconds,
            'age_minutes': round(oldest_age_seconds / 60, 2) if oldest_age_seconds is not None else None,
        },
        'sla': {
            'warning_after_minutes': 5,
            'critical_after_minutes': 30,
            'warning': oldest_age_seconds is not None and oldest_age_seconds >= int(timedelta(minutes=5).total_seconds()),
            'critical': oldest_age_seconds is not None and oldest_age_seconds >= int(timedelta(minutes=30).total_seconds()),
        },
        'entries': entries,
    })


@csrf_exempt
@require_http_methods(["POST"])
def dlq_quick_action(request, dlq_id):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        entry = DeadLetterQueue.objects.get(id=dlq_id)
    except DeadLetterQueue.DoesNotExist:
        return JsonResponse({'error': 'DLQ entry not found'}, status=404)

    action = (request.GET.get('action') or '').strip().lower()
    if action not in {'retry', 'resolve'}:
        return JsonResponse({'error': 'action must be retry or resolve'}, status=400)

    if action == 'resolve':
        if entry.resolved:
            return JsonResponse({'status': 'already_resolved', 'dlq_id': dlq_id})
        entry.resolved = True
        entry.save(update_fields=['resolved'])
        return JsonResponse({'status': 'resolved', 'dlq_id': dlq_id})

    if retry_dlq_entry is None:
        return JsonResponse({'error': 'Celery unavailable'}, status=503)

    task = retry_dlq_entry.delay(dlq_id)
    return JsonResponse({'status': 'queued', 'dlq_id': dlq_id, 'task_id': task.id}, status=202)


@csrf_exempt
@require_http_methods(["GET"])
def pipeline_health(request):
    _, err = _require_admin(request)
    if err:
        return err

    redis_client = _redis_client()
    queue_depths = _queue_depths(redis_client)

    unresolved_qs = DeadLetterQueue.objects.filter(resolved=False).order_by('created_at')
    unresolved_dlq = unresolved_qs.count()
    oldest = unresolved_qs.first()
    oldest_age_seconds = None
    if oldest and oldest.created_at:
        oldest_age_seconds = int((timezone.now() - oldest.created_at).total_seconds())

    # Check actual Redis connection connection
    redis_connected = False
    if redis_client:
        try:
            redis_client.ping()
            redis_connected = True
        except Exception:
            redis_connected = False

    # Check actual Celery workers
    celery_active = False
    if find_spec('celery') is not None:
        try:
            from clap_backend.celery import app as celery_app
            i = celery_app.control.inspect()
            active_workers = i.ping()
            celery_active = bool(active_workers)
        except Exception:
            celery_active = False

    return JsonResponse({
        'queue_depths': queue_depths,
        'queue_depth': sum(q['depth'] for q in queue_depths if q['depth'] is not None),
        'dlq': {
            'unresolved_count': unresolved_dlq,
            'oldest_entry_id': oldest.id if oldest else None,
            'oldest_age_seconds': oldest_age_seconds,
        },
        'dlq_count': unresolved_dlq,
        'celery_available': find_spec('celery') is not None,
        'celery_active': celery_active,
        'redis_available': redis_client is not None,
        'redis_connected': redis_connected,
    })


def _compute_health_payload():
    """Compute the pipeline health snapshot — same logic as pipeline_health view."""
    redis_client = _redis_client()
    queue_depths = _queue_depths(redis_client)

    unresolved_qs = DeadLetterQueue.objects.filter(resolved=False).order_by('created_at')
    unresolved_dlq = unresolved_qs.count()
    oldest = unresolved_qs.first()
    oldest_age_seconds = None
    if oldest and oldest.created_at:
        oldest_age_seconds = int((timezone.now() - oldest.created_at).total_seconds())

    redis_connected = False
    if redis_client:
        try:
            redis_client.ping()
            redis_connected = True
        except Exception:
            pass

    celery_active = False
    if find_spec('celery') is not None:
        try:
            from clap_backend.celery import app as celery_app
            active_workers = celery_app.control.inspect().ping()
            celery_active = bool(active_workers)
        except Exception:
            pass

    return {
        'queue_depths':      queue_depths,
        'queue_depth':       sum(q['depth'] for q in queue_depths if q['depth'] is not None),
        'dlq': {
            'unresolved_count':  unresolved_dlq,
            'oldest_entry_id':   oldest.id if oldest else None,
            'oldest_age_seconds': oldest_age_seconds,
        },
        'dlq_count':         unresolved_dlq,
        'celery_available':  find_spec('celery') is not None,
        'celery_active':     celery_active,
        'redis_available':   redis_client is not None,
        'redis_connected':   redis_connected,
        'timestamp':         timezone.now().isoformat(),
    }


@csrf_exempt
@require_http_methods(["GET"])
def pipeline_health_stream(request):
    """
    Server-Sent Events (SSE) endpoint for real-time pipeline health.

    Replaces the 15-second polling setInterval in the admin dashboard.
    The server pushes an update every 10 seconds instead of the client
    making repeated HTTP requests — zero wasted round trips when nothing changes.

    Auth: JWT passed as ?token=<jwt> query param (EventSource cannot set headers).
    Nginx: X-Accel-Buffering: no disables proxy buffering for streaming.

    SSE event format:
        data: {"celery_active": true, "redis_connected": true, ...}\n\n
        : heartbeat\n\n   (every 10 s, keeps connection alive through proxies)
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        # SSE requires a regular response for auth errors (not a stream)
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    _PUSH_INTERVAL_S  = 10   # push health data every 10 s
    _HEARTBEAT_S      = 10   # interleaved heartbeat comment

    def event_stream():
        try:
            while True:
                try:
                    payload = _compute_health_payload()
                    yield f"data: {json.dumps(payload)}\n\n"
                except Exception as exc:
                    logger.error('SSE health snapshot failed: %s', exc, exc_info=True)
                    yield f": error computing health\n\n"

                # Sleep in small increments so GeneratorExit is caught promptly
                for _ in range(_PUSH_INTERVAL_S):
                    time.sleep(1)
                    yield f": heartbeat\n\n"

        except GeneratorExit:
            # Client closed the connection — clean exit, no error log needed
            pass

    response = StreamingHttpResponse(
        event_stream(),
        content_type='text/event-stream; charset=utf-8',
    )
    # Prevent caching at every layer
    response['Cache-Control']      = 'no-cache, no-store, must-revalidate'
    response['X-Accel-Buffering']  = 'no'   # disable Nginx proxy buffering
    response['Connection']         = 'keep-alive'
    return response

from datetime import timedelta
from importlib.util import find_spec

from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, DeadLetterQueue
from api.utils.jwt_utils import get_user_from_request

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

    return JsonResponse({
        'total_submissions': sum(status_counts.values()),
        'status_counts': status_counts,
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
        qs = qs.filter(status=status)

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

    rows = []
    for sub in qs[:200]:
        rows.append({
            'id': str(sub.id),
            'status': sub.status,
            'student': {
                'id': str(sub.user_id),
                'email': sub.user.email,
                'full_name': sub.user.full_name,
                'batch_id': str(sub.user.batch_id) if sub.user.batch_id else None,
            },
            'assessment': {
                'id': str(sub.assessment_id),
                'title': sub.assessment.title,
            },
            'report_url': sub.report_url,
            'email_sent_at': sub.email_sent_at.isoformat() if sub.email_sent_at else None,
            'created_at': sub.created_at.isoformat() if sub.created_at else None,
            'updated_at': sub.updated_at.isoformat() if sub.updated_at else None,
        })

    return JsonResponse({'submissions': rows})


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

    return JsonResponse({
        'id': str(sub.id),
        'status': sub.status,
        'version': sub.version,
        'correlation_id': sub.correlation_id,
        'student': {
            'id': str(sub.user_id),
            'email': sub.user.email,
            'full_name': sub.user.full_name,
        },
        'assessment': {
            'id': str(sub.assessment_id),
            'title': sub.assessment.title,
        },
        'report_url': sub.report_url,
        'email_sent_at': sub.email_sent_at.isoformat() if sub.email_sent_at else None,
        'created_at': sub.created_at.isoformat() if sub.created_at else None,
        'updated_at': sub.updated_at.isoformat() if sub.updated_at else None,
        'audit_events': [
            {
                'id': event.id,
                'event_type': event.event_type,
                'old_status': event.old_status,
                'new_status': event.new_status,
                'worker_id': event.worker_id,
                'error_detail': event.error_detail,
                'created_at': event.created_at.isoformat() if event.created_at else None,
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

    return JsonResponse({
        'queue_depths': queue_depths,
        'dlq': {
            'unresolved_count': unresolved_dlq,
            'oldest_entry_id': oldest.id if oldest else None,
            'oldest_age_seconds': oldest_age_seconds,
        },
        'celery_available': find_spec('celery') is not None,
        'redis_available': redis_client is not None,
    })

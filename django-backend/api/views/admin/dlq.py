import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import DeadLetterQueue
from importlib.util import find_spec

if find_spec('celery') is not None:
    from api.tasks import retry_dlq_entry
else:
    retry_dlq_entry = None
from api.utils.jwt_utils import get_user_from_request


@csrf_exempt
@require_http_methods(["GET"])
def dlq_list(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    qs = DeadLetterQueue.objects.select_related('submission').order_by('-created_at')
    resolved = request.GET.get('resolved')
    if resolved in ('true', 'false'):
        qs = qs.filter(resolved=(resolved == 'true'))

    rows = [
        {
            'id': e.id,
            'submission_id': str(e.submission_id),
            'task_name': e.task_name,
            'error_message': e.error_message,
            'retry_count': e.retry_count,
            'resolved': e.resolved,
            'created_at': e.created_at.isoformat() if e.created_at else None,
        }
        for e in qs[:200]
    ]
    return JsonResponse({'entries': rows})


@csrf_exempt
@require_http_methods(["POST"])
def dlq_retry(request, dlq_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if retry_dlq_entry is None:
        return JsonResponse({'error': 'Celery unavailable'}, status=503)

    retry_dlq_entry.delay(dlq_id)
    return JsonResponse({'status': 'queued', 'dlq_id': dlq_id})


@csrf_exempt
@require_http_methods(["POST"])
def dlq_bulk_retry(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    payload = json.loads(request.body or '{}')
    ids = payload.get('ids', [])
    if retry_dlq_entry is None:
        return JsonResponse({'error': 'Celery unavailable'}, status=503)

    for dlq_id in ids:
        retry_dlq_entry.delay(dlq_id)
    return JsonResponse({'status': 'queued', 'count': len(ids)})


@csrf_exempt
@require_http_methods(["POST"])
def dlq_resolve(request, dlq_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    DeadLetterQueue.objects.filter(id=dlq_id).update(resolved=True)
    return JsonResponse({'status': 'resolved', 'dlq_id': dlq_id})


@csrf_exempt
@require_http_methods(["GET"])
def dlq_detail(request, dlq_id):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        e = DeadLetterQueue.objects.get(id=dlq_id)
    except DeadLetterQueue.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    return JsonResponse({
        'id': e.id,
        'submission_id': str(e.submission_id),
        'task_name': e.task_name,
        'payload': e.payload,
        'error_message': e.error_message,
        'retry_count': e.retry_count,
        'resolved': e.resolved,
        'created_at': e.created_at.isoformat() if e.created_at else None,
    })

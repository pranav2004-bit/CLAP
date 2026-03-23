import json
import math

from django.db import transaction
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

# ── Constants ─────────────────────────────────────────────────────────────────

_PAGE_SIZE     = 30
_BULK_RETRY_MAX = 100   # Safety cap — prevents accidental mass task dispatch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_admin(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None


def _serialize_entry(e):
    return {
        'id':            e.id,
        'submission_id': str(e.submission_id),
        'task_name':     e.task_name,
        'error_message': e.error_message,
        'retry_count':   e.retry_count,
        'resolved':      e.resolved,
        'created_at':    e.created_at.isoformat() if e.created_at else None,
    }


# ── Views ─────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["GET"])
def dlq_list(request):
    """Paginated DLQ list — max 30 per page, server-side resolved filter."""
    _, err = _require_admin(request)
    if err:
        return err

    qs = DeadLetterQueue.objects.select_related('submission').order_by('-created_at')

    # Server-side resolved filter — avoids loading all rows into memory
    resolved_param = request.GET.get('resolved', '')
    if resolved_param == 'true':
        qs = qs.filter(resolved=True)
    elif resolved_param == 'false':
        qs = qs.filter(resolved=False)
    # Empty string → return all (for summary counts)

    # Pagination
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (ValueError, TypeError):
        page = 1

    total_count = qs.count()
    total_pages = max(1, math.ceil(total_count / _PAGE_SIZE))
    offset      = (page - 1) * _PAGE_SIZE

    rows = [_serialize_entry(e) for e in qs[offset: offset + _PAGE_SIZE]]

    # Summary counts — always accurate regardless of filter
    unresolved_count = DeadLetterQueue.objects.filter(resolved=False).count()
    resolved_count   = DeadLetterQueue.objects.filter(resolved=True).count()

    return JsonResponse({
        'entries':          rows,
        'total_count':      total_count,
        'unresolved_count': unresolved_count,
        'resolved_count':   resolved_count,
        'page':             page,
        'page_size':        _PAGE_SIZE,
        'total_pages':      total_pages,
    })


@csrf_exempt
@require_http_methods(["POST"])
def dlq_retry(request, dlq_id):
    """Re-queue a single DLQ entry. Idempotent — skip if already resolved."""
    _, err = _require_admin(request)
    if err:
        return err

    if retry_dlq_entry is None:
        return JsonResponse({'error': 'Celery unavailable'}, status=503)

    try:
        entry = DeadLetterQueue.objects.get(id=dlq_id)
    except DeadLetterQueue.DoesNotExist:
        return JsonResponse({'error': 'DLQ entry not found'}, status=404)

    if entry.resolved:
        return JsonResponse({'status': 'already_resolved', 'dlq_id': dlq_id})

    retry_dlq_entry.delay(dlq_id)
    return JsonResponse({'status': 'queued', 'dlq_id': dlq_id})


@csrf_exempt
@require_http_methods(["POST"])
def dlq_bulk_retry(request):
    """Re-queue multiple unresolved DLQ entries. Capped at 100 per call."""
    _, err = _require_admin(request)
    if err:
        return err

    if retry_dlq_entry is None:
        return JsonResponse({'error': 'Celery unavailable'}, status=503)

    # Safe JSON parse — returns 400 on malformed body
    try:
        payload = json.loads(request.body or b'{}')
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    ids = payload.get('ids', [])

    # Type safety — ids must be a list of integers
    if not isinstance(ids, list):
        return JsonResponse({'error': '`ids` must be a list'}, status=400)

    # Sanitize — accept only positive integers, silently drop garbage
    clean_ids = []
    for i in ids:
        try:
            clean_ids.append(int(i))
        except (TypeError, ValueError):
            pass

    # Safety cap — prevent accidental mass dispatch
    if len(clean_ids) > _BULK_RETRY_MAX:
        return JsonResponse(
            {'error': f'Cannot retry more than {_BULK_RETRY_MAX} entries at once'},
            status=400,
        )

    # If no IDs provided, retry ALL unresolved entries (up to cap)
    if not clean_ids:
        clean_ids = list(
            DeadLetterQueue.objects
            .filter(resolved=False)
            .values_list('id', flat=True)
            .order_by('created_at')[:_BULK_RETRY_MAX]
        )

    # Only retry unresolved entries — skip already-resolved ones silently
    valid_ids = list(
        DeadLetterQueue.objects
        .filter(id__in=clean_ids, resolved=False)
        .values_list('id', flat=True)
    )

    for dlq_id in valid_ids:
        retry_dlq_entry.delay(dlq_id)

    return JsonResponse({'status': 'queued', 'count': len(valid_ids)})


@csrf_exempt
@require_http_methods(["POST"])
def dlq_resolve(request, dlq_id):
    """Mark a DLQ entry as resolved. Returns 404 if not found."""
    _, err = _require_admin(request)
    if err:
        return err

    with transaction.atomic():
        updated = DeadLetterQueue.objects.filter(id=dlq_id).update(resolved=True)

    if updated == 0:
        return JsonResponse({'error': 'DLQ entry not found'}, status=404)

    return JsonResponse({'status': 'resolved', 'dlq_id': dlq_id})


@csrf_exempt
@require_http_methods(["GET"])
def dlq_detail(request, dlq_id):
    """Full detail for a single DLQ entry including payload."""
    _, err = _require_admin(request)
    if err:
        return err

    try:
        e = DeadLetterQueue.objects.get(id=dlq_id)
    except DeadLetterQueue.DoesNotExist:
        return JsonResponse({'error': 'DLQ entry not found'}, status=404)

    return JsonResponse({
        'id':            e.id,
        'submission_id': str(e.submission_id),
        'task_name':     e.task_name,
        'payload':       e.payload,
        'error_message': e.error_message,
        'retry_count':   e.retry_count,
        'resolved':      e.resolved,
        'created_at':    e.created_at.isoformat() if e.created_at else None,
    })

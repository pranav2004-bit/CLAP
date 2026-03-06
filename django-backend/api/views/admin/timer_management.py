"""
Enterprise Live Timer Management — Admin API
==============================================
Provides server-authoritative, deadline-based timer control for live CLAP tests.

Architecture:
  - global_deadline (UTC timestamp) is the single source of truth for all clients.
  - Extending adds minutes to the deadline atomically (select_for_update).
  - Students poll /student/clap-assignments/{id}/global-timer every 5-30 s.
  - Client computes: timeLeft = max(0, deadline - (Date.now() + clockOffset))
  - clockOffset is calibrated from X-Server-Time response header on every poll.

All mutations are audit-logged to timer_extension_log (immutable JSON array on ClapTest).
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
import json
import logging

from api.models import ClapTest, StudentClapAssignment, ClapTestComponent
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_effective_duration(test: ClapTest) -> int | None:
    """
    Returns the effective total duration in minutes:
    - admin-set global_duration_minutes (if set), OR
    - sum of all ClapTestComponent durations.
    Returns None if nothing is configured.
    """
    if test.global_duration_minutes is not None:
        return test.global_duration_minutes
    total = sum(
        (c.duration_minutes or 0)
        for c in ClapTestComponent.objects.filter(clap_test=test)
    )
    return total or None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["POST"])
def start_live_timer(request, test_id):
    """
    POST /admin/clap-tests/{test_id}/start-live-timer

    Initialize global_deadline for a live test session.
    Idempotent by default — will not reset an already-running timer unless
    body contains {"force": true}.

    Body (optional): { "force": bool, "reason": str }

    Response: { success, message, deadline_utc, server_time_utc, duration_minutes }
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    force  = bool(body.get('force', False))
    reason = str(body.get('reason', 'Live timer started by admin'))[:200]

    with transaction.atomic():
        try:
            test = ClapTest.objects.select_for_update().get(id=test_id)
        except ClapTest.DoesNotExist:
            return JsonResponse({'error': 'Test not found'}, status=404)

        # Guard: do not reset a running timer unless explicitly forced
        if test.global_deadline and not force:
            now = timezone.now()
            remaining = max(0, int((test.global_deadline - now).total_seconds()))
            return JsonResponse({
                'already_started': True,
                'message': 'Timer is already running. Pass force=true to reset.',
                'deadline_utc': test.global_deadline.isoformat(),
                'server_time_utc': now.isoformat(),
                'remaining_seconds': remaining,
            })

        effective_duration = _compute_effective_duration(test)
        if not effective_duration:
            return JsonResponse(
                {'error': 'No timer duration configured. '
                          'Set global_duration_minutes in the Configure tab first.'},
                status=400
            )

        now      = timezone.now()
        deadline = now + timedelta(minutes=effective_duration)

        log_entry = {
            'action':           'start',
            'duration_minutes': effective_duration,
            'deadline_utc':     deadline.isoformat(),
            'by':               user.email,
            'at':               now.isoformat(),
            'reason':           reason,
            'forced':           force,
        }

        test.global_deadline       = deadline
        test.timer_extension_log   = [log_entry]
        test.save(update_fields=['global_deadline', 'timer_extension_log'])

    logger.info(
        f"[TIMER] Live timer STARTED for test {test_id} by {user.email}. "
        f"Duration: {effective_duration}m. Deadline: {deadline.isoformat()}"
    )
    return JsonResponse({
        'success':          True,
        'message':          f'Live timer started. Test ends at {deadline.isoformat()} UTC',
        'deadline_utc':     deadline.isoformat(),
        'server_time_utc':  now.isoformat(),
        'duration_minutes': effective_duration,
    })


@csrf_exempt
@require_http_methods(["POST"])
def extend_timer(request, test_id):
    """
    POST /admin/clap-tests/{test_id}/extend-timer

    Atomically extends the live deadline by N minutes.
    Uses SELECT FOR UPDATE to prevent race conditions with concurrent calls.

    Body: { extend_minutes: int (1–180), reason?: str }

    Safety checks:
      - extend_minutes must be 1-180.
      - New deadline must be > now + 60 s (prevents accidental near-zero extension).
      - Audit-logged immutably in timer_extension_log.

    Response: { success, old_deadline_utc, new_deadline_utc, server_time_utc,
                extend_minutes, extension_count, total_extensions_minutes }
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        body = json.loads(request.body or '{}')
        extend_minutes = int(body.get('extend_minutes', 0))
    except (ValueError, TypeError, json.JSONDecodeError):
        return JsonResponse({'error': 'Invalid request body'}, status=400)

    if extend_minutes < 1 or extend_minutes > 180:
        return JsonResponse({'error': 'extend_minutes must be between 1 and 180'}, status=400)

    reason = str(body.get('reason', 'Timer extended by admin'))[:500]

    with transaction.atomic():
        try:
            test = ClapTest.objects.select_for_update().get(id=test_id)
        except ClapTest.DoesNotExist:
            return JsonResponse({'error': 'Test not found'}, status=404)

        now = timezone.now()

        if not test.global_deadline:
            return JsonResponse(
                {'error': 'Timer not started. Call start-live-timer first.'},
                status=400
            )

        old_deadline = test.global_deadline
        new_deadline = old_deadline + timedelta(minutes=extend_minutes)

        # Sanity: new deadline must give at least 30 seconds to students
        if (new_deadline - now).total_seconds() < 30:
            return JsonResponse(
                {'error': 'Extension would result in a deadline in the past or too close to now.'},
                status=400
            )

        remaining_before = max(0, int((old_deadline - now).total_seconds()))

        log_entry = {
            'action':                   'extend',
            'extend_minutes':           extend_minutes,
            'old_deadline_utc':         old_deadline.isoformat(),
            'new_deadline_utc':         new_deadline.isoformat(),
            'remaining_before_seconds': remaining_before,
            'by':                       user.email,
            'at':                       now.isoformat(),
            'reason':                   reason,
        }

        extension_log = list(test.timer_extension_log or [])
        extension_log.append(log_entry)

        test.global_deadline     = new_deadline
        test.timer_extension_log = extension_log
        test.save(update_fields=['global_deadline', 'timer_extension_log'])

    extension_count = len([e for e in extension_log if e.get('action') == 'extend'])
    total_ext_mins  = sum(e.get('extend_minutes', 0) for e in extension_log if e.get('action') == 'extend')

    logger.info(
        f"[TIMER] Timer EXTENDED for test {test_id} by {user.email}. "
        f"+{extend_minutes}m. New deadline: {new_deadline.isoformat()}. "
        f"Reason: {reason}"
    )

    return JsonResponse({
        'success':                True,
        'message':                f'Timer extended by {extend_minutes} minutes',
        'old_deadline_utc':       old_deadline.isoformat(),
        'new_deadline_utc':       new_deadline.isoformat(),
        'server_time_utc':        now.isoformat(),
        'extend_minutes':         extend_minutes,
        'extension_count':        extension_count,
        'total_extensions_minutes': total_ext_mins,
        'remaining_seconds':      max(0, int((new_deadline - now).total_seconds())),
    })


@csrf_exempt
@require_http_methods(["GET"])
def live_timer_status(request, test_id):
    """
    GET /admin/clap-tests/{test_id}/live-timer-status

    Admin real-time dashboard for the live timer.
    Returns deadline, remaining time, active student count, extension history.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        test = ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return JsonResponse({'error': 'Test not found'}, status=404)

    now = timezone.now()

    # Student counts
    qs = StudentClapAssignment.objects.filter(clap_test=test)
    active_count    = qs.filter(status__in=['started', 'assigned']).count()
    completed_count = qs.filter(status='completed').count()
    total_assigned  = qs.count()

    # Timer stats
    remaining_seconds = None
    is_expired        = False
    if test.global_deadline:
        delta             = (test.global_deadline - now).total_seconds()
        remaining_seconds = max(0, int(delta))
        is_expired        = delta < 0

    extension_log   = list(test.timer_extension_log or [])
    extension_count = len([e for e in extension_log if e.get('action') == 'extend'])
    total_ext_mins  = sum(e.get('extend_minutes', 0) for e in extension_log if e.get('action') == 'extend')
    effective_dur   = _compute_effective_duration(test)

    response = JsonResponse({
        'test_id':                   str(test.id),
        'test_name':                 test.name,
        'global_duration_minutes':   test.global_duration_minutes,
        'effective_duration_minutes': effective_dur,
        'global_deadline':           test.global_deadline.isoformat() if test.global_deadline else None,
        'server_time_utc':           now.isoformat(),
        'remaining_seconds':         remaining_seconds,
        'is_expired':                is_expired,
        'timer_started':             test.global_deadline is not None,
        'extension_count':           extension_count,
        'total_extensions_minutes':  total_ext_mins,
        'extension_log':             extension_log,
        'active_students':           active_count,
        'completed_students':        completed_count,
        'total_assigned':            total_assigned,
    })
    response['Cache-Control'] = 'no-store'
    response['X-Server-Time'] = now.isoformat()
    return response

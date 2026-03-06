"""
Enterprise Live Timer — Student Polling Endpoint
================================================
Students poll this endpoint every 5–30 seconds (adaptive interval).
Returns the server-authoritative deadline so clients can compute
timeLeft without trusting their local clock.

Every response includes:
  - X-Server-Time header → client calibrates clockOffset = serverTime - Date.now()
  - ETag based on (deadline, extension_count) → 304 Not Modified when unchanged

Clock-offset calibration prevents "timer running fast/slow" on misconfigured
client machines — critical for 2000+ concurrent exam users.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from api.models import StudentClapAssignment
from api.utils.jwt_utils import get_user_from_request

import logging

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def global_timer_status(request, assignment_id):
    """
    GET /student/clap-assignments/{assignment_id}/global-timer

    Server-authoritative timer status for a live CLAP test.

    Called by the student exam hub page every 5–30 s (adaptive).
    The frontend computes:
        timeLeft = max(0, deadline - (Date.now() + clockOffset))
    where clockOffset = Date.parse(X-Server-Time) - Date.now()

    Response shape:
    {
        deadline_utc:       "2026-03-05T10:30:00+00:00" | null,
        server_time_utc:    "2026-03-05T10:00:00+00:00",
        remaining_seconds:  1800 | null,
        is_expired:         false,
        extension_count:    0,
        assignment_status:  "started",
        timer_active:       true,
        global_duration_minutes: 60
    }

    Security: only the authenticated student who owns this assignment may call this.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.select_related('clap_test').get(
            id=assignment_id, student=user
        )
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    test = assignment.clap_test
    now  = timezone.now()

    # Compute extension count from audit log
    extension_log   = list(test.timer_extension_log or [])
    extension_count = len([e for e in extension_log if e.get('action') == 'extend'])

    # Compute remaining time
    remaining_seconds = None
    is_expired        = False
    if test.global_deadline:
        delta             = (test.global_deadline - now).total_seconds()
        remaining_seconds = max(0, int(delta))
        is_expired        = delta < 0

    timer_active = (
        test.global_deadline is not None
        and not is_expired
        and assignment.status not in ('completed', 'expired')
    )

    data = {
        'deadline_utc':             test.global_deadline.isoformat() if test.global_deadline else None,
        'server_time_utc':          now.isoformat(),
        'remaining_seconds':        remaining_seconds,
        'is_expired':               is_expired,
        'extension_count':          extension_count,
        'assignment_status':        assignment.status,
        'timer_active':             timer_active,
        'global_duration_minutes':  test.global_duration_minutes,
    }

    response = JsonResponse(data)

    # ETag: based on (deadline_timestamp, extension_count) so clients can
    # detect changes with If-None-Match (optional optimisation).
    if test.global_deadline:
        etag = f'"{int(test.global_deadline.timestamp())}-{extension_count}"'
        response['ETag'] = etag

    # Critical: always include server time header for clock-offset calibration
    response['Cache-Control'] = 'no-store'
    response['X-Server-Time'] = now.isoformat()
    return response

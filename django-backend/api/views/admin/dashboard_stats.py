"""
Admin dashboard stats and analytics endpoints.

GET /api/admin/stats/dashboard   — real-time KPI cards + recent activity
GET /api/admin/stats/analytics   — time-series + domain averages + score distribution

Both endpoints accept an optional ?test_id=<uuid> query parameter.
When supplied the response is scoped to that single CLAP test only.
Without it, data is aggregated globally across all tests (default behaviour).

Design principles (production / high-concurrency):
  - All queries are read-only aggregations — no locks taken, safe under any
    concurrency level; thousands of simultaneous admin polls have no interference.
  - Score distribution is computed with a single DB-level CASE/WHEN GROUP BY —
    no Python-side iteration over potentially millions of rows.
  - total_subs / complete_subs are derived from a single aggregate() call to
    avoid an extra round-trip.
  - Cache-Control: no-store on every response so CDNs / reverse proxies never
    serve stale data to concurrent admin sessions in different locations.
  - All user-supplied query params are strictly validated before use.
  - NULL scores are excluded from bucketing to prevent float(None) crashes.
"""

import uuid as _uuid
from datetime import timedelta

from django.db.models import Avg, Case, CharField, Count, Q, Value, When
from django.db.models.functions import TruncDay
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import (
    AssessmentSubmission,
    AuditLog,
    ClapTest,
    DeadLetterQueue,
    StudentClapAssignment,
    SubmissionScore,
    User,
)
from api.utils.auth import require_admin as _require_admin


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PERIOD_DAYS: dict[str, int] = {
    'last24h': 1,   # today 00:00 → now (calendar day, not rolling 24 h)
    'week':    7,
    'month':  30,
    'quarter': 90,
}

# Score is stored on a 0-10 scale.
# Buckets map to percentage equivalents (score/10 * 100):
#   score ≤ 2  →  0–20 %
#   score ≤ 4  → 21–40 %
#   score ≤ 6  → 41–60 %
#   score ≤ 8  → 61–80 %
#   score > 8  → 81–100 %
_SCORE_BUCKET_ANNOTATION = Case(
    When(score__lte=2, then=Value('0-20')),
    When(score__lte=4, then=Value('21-40')),
    When(score__lte=6, then=Value('41-60')),
    When(score__lte=8, then=Value('61-80')),
    default=Value('81-100'),
    output_field=CharField(),
)

_BUCKET_ORDER = ('0-20', '21-40', '41-60', '61-80', '81-100')


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _no_cache_json(payload: dict, status: int = 200) -> JsonResponse:
    """
    Return a JsonResponse that must never be cached by any proxy or browser.
    Essential for real-time polling endpoints consumed by concurrent admins.
    """
    resp = JsonResponse(payload, status=status)
    resp['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp['Pragma'] = 'no-cache'
    return resp


def _safe_round(value, digits: int = 2):
    """Round a float/Decimal, returning None if the value is absent."""
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Query-param helpers
# ---------------------------------------------------------------------------

def _resolve_test_filter(request):
    """
    Parse optional ?test_id=<uuid> query param.

    Returns (clap_test_or_None, error_response_or_None):
      • absent  → (None, None)   caller proceeds with global scope
      • invalid UUID format → (None, 400 response)
      • UUID not found in DB   → (None, 404 response)
      • valid   → (ClapTest instance, None)
    """
    raw = (request.GET.get('test_id') or '').strip()
    if not raw:
        return None, None

    try:
        tid = _uuid.UUID(raw)
    except ValueError:
        return None, _no_cache_json(
            {'error': 'Invalid test_id — must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'},
            status=400,
        )

    try:
        test = ClapTest.objects.only('id', 'name', 'test_id').get(pk=tid)
    except ClapTest.DoesNotExist:
        return None, _no_cache_json({'error': 'CLAP test not found'}, status=404)

    return test, None


def _validate_period(raw: str) -> tuple[str, int] | None:
    """
    Validate the ?period= param.
    Returns (period_name, days) or None for invalid values.
    """
    clean = (raw or 'month').strip().lower()
    days = PERIOD_DAYS.get(clean)
    if days is None:
        return None
    return clean, days


def _test_payload(test) -> dict | None:
    """Serialise a ClapTest FK to an embeddable dict (or None for global scope)."""
    if test is None:
        return None
    return {
        'id':      str(test.id),
        'test_id': test.test_id,   # may be None for tests without a short ID
        'name':    test.name,
    }


# ---------------------------------------------------------------------------
# GET /api/admin/stats/dashboard
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['GET'])
def dashboard_stats(request):
    """
    Real-time KPI counts aggregated directly from the live database.

    Designed for 30-second polling from the admin dashboard.
    All queries are read-only aggregations — safe under any concurrency.

    Optional query params:
      ?test_id=<uuid>   scope all KPIs to a single CLAP test
    """
    _, err = _require_admin(request)
    if err:
        return err

    selected_test, err = _resolve_test_filter(request)
    if err:
        return err

    # ── Students ───────────────────────────────────────────────────────────
    # When scoped to a test, "students" = those assigned to that test.
    # distinct=True prevents double-counting students with multiple assignments
    # (e.g. retests).
    if selected_test is not None:
        _student_base = User.objects.filter(
            studentclapassignment__clap_test=selected_test,
            role='student',
        )
        student_agg = _student_base.aggregate(
            total=Count('id', distinct=True),
            active=Count('id', filter=Q(is_active=True), distinct=True),
        )
    else:
        student_agg = User.objects.filter(role='student').aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(is_active=True)),
        )

    # ── Assignments ────────────────────────────────────────────────────────
    assignment_qs = StudentClapAssignment.objects
    if selected_test is not None:
        assignment_qs = assignment_qs.filter(clap_test=selected_test)

    assignment_agg = assignment_qs.aggregate(
        total=Count('id'),
        started=Count('id', filter=Q(status='started')),
        completed=Count('id', filter=Q(status='completed')),
    )

    # ── Submissions ─────────────────────────────────────────────────────────
    # AssessmentSubmission.assessment FK points to ClapTest (db_column='assessment_id')
    in_pipeline = [
        AssessmentSubmission.STATUS_RULES_COMPLETE,
        AssessmentSubmission.STATUS_LLM_PROCESSING,
        AssessmentSubmission.STATUS_LLM_COMPLETE,
        AssessmentSubmission.STATUS_REPORT_GENERATING,
        AssessmentSubmission.STATUS_REPORT_READY,
        AssessmentSubmission.STATUS_EMAIL_SENDING,
    ]
    sub_qs = AssessmentSubmission.objects
    if selected_test is not None:
        sub_qs = sub_qs.filter(assessment=selected_test)

    sub_agg = sub_qs.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status=AssessmentSubmission.STATUS_PENDING)),
        processing=Count('id', filter=Q(status__in=in_pipeline)),
        complete=Count('id', filter=Q(status=AssessmentSubmission.STATUS_COMPLETE)),
        failed=Count('id', filter=Q(status=AssessmentSubmission.STATUS_LLM_FAILED)),
    )

    # ── Average score ──────────────────────────────────────────────────────
    # Exclude NULL scores (rows created before evaluation completes).
    score_qs = SubmissionScore.objects.filter(score__isnull=False)
    if selected_test is not None:
        score_qs = score_qs.filter(submission__assessment=selected_test)

    avg_result = score_qs.aggregate(avg_score=Avg('score'))
    avg_score = _safe_round(avg_result.get('avg_score'))

    # ── DLQ — always global (pipeline health is not per-test) ──────────────
    dlq_unresolved = DeadLetterQueue.objects.filter(resolved=False).count()

    # ── Submission status breakdown — ALL statuses (drives pipeline widget) ─
    # Returned as a list so the frontend renders every status that actually
    # exists in the DB — including SUPERSEDED_LLM_PROCESSING and any future
    # statuses added to the pipeline — keeping the total always consistent.
    status_breakdown = [
        {'status': s['status'], 'count': s['count']}
        for s in (
            sub_qs
            .values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
    ]

    # ── Recent activity (last 10 audit events) ────────────────────────────
    recent_qs = AuditLog.objects.order_by('-created_at')
    if selected_test is not None:
        recent_qs = recent_qs.filter(submission__assessment=selected_test)

    recent_qs = recent_qs.values(
        'event_type', 'created_at', 'old_status', 'new_status', 'submission_id',
    )[:10]

    recent_activity = [
        {
            'event_type':    r['event_type'],
            'created_at':    r['created_at'].isoformat() if r['created_at'] else None,
            'old_status':    r['old_status'],
            'new_status':    r['new_status'],
            'submission_id': str(r['submission_id']) if r['submission_id'] else None,
        }
        for r in recent_qs
    ]

    return _no_cache_json({
        'selected_test': _test_payload(selected_test),
        'students': {
            'total':  student_agg['total']  or 0,
            'active': student_agg['active'] or 0,
        },
        'assignments': {
            'total':     assignment_agg['total']     or 0,
            'started':   assignment_agg['started']   or 0,
            'completed': assignment_agg['completed'] or 0,
        },
        'submissions': {
            'total':      sub_agg['total']      or 0,
            'pending':    sub_agg['pending']    or 0,
            'processing': sub_agg['processing'] or 0,
            'complete':   sub_agg['complete']   or 0,
            'failed':     sub_agg['failed']     or 0,
        },
        'avg_score':        avg_score,
        'dlq_unresolved':   dlq_unresolved,
        'status_breakdown': status_breakdown,
        'recent_activity':  recent_activity,
        'generated_at':     timezone.now().isoformat(),
    })


# ---------------------------------------------------------------------------
# GET /api/admin/stats/analytics?period=week|month|quarter[&test_id=<uuid>]
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['GET'])
def analytics_stats(request):
    """
    Time-series and aggregated data for the analytics dashboard.

    Query params:
      ?period=week|month|quarter  (default: month — invalid values → HTTP 400)
      ?test_id=<uuid>             (optional — scopes all metrics to one test)

    Designed for 60-second polling. All queries are read-only aggregations.

    Score distribution is computed entirely in the database via a single
    CASE/WHEN GROUP BY query — no Python-side row iteration, no memory
    pressure regardless of dataset size.
    """
    _, err = _require_admin(request)
    if err:
        return err

    selected_test, err = _resolve_test_filter(request)
    if err:
        return err

    period_result = _validate_period(request.GET.get('period', 'month'))
    if period_result is None:
        return _no_cache_json(
            {'error': f"Invalid period. Valid values: {', '.join(PERIOD_DAYS)}"},
            status=400,
        )
    period, days = period_result
    now = timezone.now()
    if period == 'last24h':
        # Calendar-day scope: today 00:00:00 UTC → now
        # "today night 12 am to next day night 12 am"
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=days)

    # ── Base querysets — optionally scoped to a single test ────────────────
    sub_base   = AssessmentSubmission.objects
    score_base = SubmissionScore.objects.filter(score__isnull=False)
    if selected_test is not None:
        sub_base   = sub_base.filter(assessment=selected_test)
        score_base = score_base.filter(submission__assessment=selected_test)

    # ── Submissions trend (daily count within selected period) ─────────────
    trend_qs = (
        sub_base
        .filter(created_at__gte=start)
        .annotate(day=TruncDay('created_at'))
        .values('day')
        .annotate(count=Count('id'))
        .order_by('day')
    )
    submissions_trend = [
        {
            'date':  t['day'].date().isoformat() if t['day'] else None,
            'count': t['count'],
        }
        for t in trend_qs
    ]

    # ── Domain averages (all-time within scope) ────────────────────────────
    domain_avg_qs = (
        score_base
        .values('domain')
        .annotate(avg=Avg('score'))
        .order_by('domain')
    )
    domain_averages = [
        {
            'domain': d['domain'],
            'avg':    _safe_round(d['avg']) or 0.0,
        }
        for d in domain_avg_qs
    ]

    # ── Score distribution — single DB-level CASE/WHEN GROUP BY ───────────
    # One query, no Python iteration, scales to tens of millions of rows.
    dist_qs = (
        score_base
        .annotate(bucket=_SCORE_BUCKET_ANNOTATION)
        .values('bucket')
        .annotate(count=Count('id'))
    )
    # Merge into an ordered dict so all five buckets always appear (even if empty)
    buckets: dict[str, int] = dict.fromkeys(_BUCKET_ORDER, 0)
    for row in dist_qs:
        if row['bucket'] in buckets:
            buckets[row['bucket']] = row['count']

    score_distribution = [{'range': k, 'count': v} for k, v in buckets.items()]

    # ── Total / complete counts — single aggregate call ────────────────────
    sub_counts = sub_base.aggregate(
        total=Count('id'),
        complete=Count('id', filter=Q(status=AssessmentSubmission.STATUS_COMPLETE)),
    )
    total_subs    = sub_counts['total']    or 0
    complete_subs = sub_counts['complete'] or 0
    completion_rate = (
        _safe_round((complete_subs / total_subs * 100), 1)
        if total_subs > 0 else 0.0
    )

    # ── Status breakdown ──────────────────────────────────────────────────
    status_breakdown = [
        {'status': s['status'], 'count': s['count']}
        for s in (
            sub_base
            .values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
    ]

    return _no_cache_json({
        'selected_test':     _test_payload(selected_test),
        'period':            period,
        'period_days':       days,
        'submissions_trend': submissions_trend,
        'domain_averages':   domain_averages,
        'score_distribution': score_distribution,
        'status_breakdown':  status_breakdown,
        'completion_rate':   completion_rate,
        'total_submissions': total_subs,
        'complete_submissions': complete_subs,
        'generated_at':      timezone.now().isoformat(),
    })

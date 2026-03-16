"""
Admin dashboard stats and analytics endpoints.

GET /api/admin/stats/dashboard   — real-time KPI cards + recent activity
GET /api/admin/stats/analytics   — time-series + domain averages + score distribution

All aggregations run in a small, bounded number of DB queries using Django ORM
aggregation functions (Count, Avg, TruncDay). Safe for concurrent access — these
are read-only queries with no locks.
"""

from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDay
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import (
    AssessmentSubmission,
    AuditLog,
    DeadLetterQueue,
    StudentClapAssignment,
    SubmissionScore,
    User,
)
from api.utils.auth import require_admin as _require_admin


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_round(value, digits=2):
    """Round float or return None safely."""
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _score_bucket(score_on_10):
    """Map a 0-10 score to a percentage bucket label."""
    pct = (score_on_10 / 10.0) * 100
    if pct <= 20:
        return '0-20'
    elif pct <= 40:
        return '21-40'
    elif pct <= 60:
        return '41-60'
    elif pct <= 80:
        return '61-80'
    else:
        return '81-100'


# ---------------------------------------------------------------------------
# GET /api/admin/stats/dashboard
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['GET'])
def dashboard_stats(request):
    """
    Returns real-time KPI counts aggregated from the live database.

    Designed for 30-second polling from the admin dashboard. All queries are
    read-only aggregations — safe under any concurrency level.
    """
    _, err = _require_admin(request)
    if err:
        return err

    # ── Students ───────────────────────────────────────────────────────────
    student_agg = User.objects.filter(role='student').aggregate(
        total=Count('id'),
        active=Count('id', filter=Q(is_active=True)),
    )

    # ── Assignments ────────────────────────────────────────────────────────
    assignment_agg = StudentClapAssignment.objects.aggregate(
        total=Count('id'),
        started=Count('id', filter=Q(status='started')),
        completed=Count('id', filter=Q(status='completed')),
    )

    # ── Submissions ────────────────────────────────────────────────────────
    in_pipeline_statuses = [
        AssessmentSubmission.STATUS_RULES_COMPLETE,
        AssessmentSubmission.STATUS_LLM_PROCESSING,
        AssessmentSubmission.STATUS_LLM_COMPLETE,
        AssessmentSubmission.STATUS_REPORT_GENERATING,
        AssessmentSubmission.STATUS_REPORT_READY,
        AssessmentSubmission.STATUS_EMAIL_SENDING,
    ]
    sub_agg = AssessmentSubmission.objects.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status=AssessmentSubmission.STATUS_PENDING)),
        processing=Count('id', filter=Q(status__in=in_pipeline_statuses)),
        complete=Count('id', filter=Q(status=AssessmentSubmission.STATUS_COMPLETE)),
        failed=Count('id', filter=Q(status=AssessmentSubmission.STATUS_LLM_FAILED)),
    )

    # ── Average score ──────────────────────────────────────────────────────
    avg_result = SubmissionScore.objects.aggregate(avg_score=Avg('score'))
    avg_score = _safe_round(avg_result.get('avg_score'))

    # ── DLQ ───────────────────────────────────────────────────────────────
    dlq_unresolved = DeadLetterQueue.objects.filter(resolved=False).count()

    # ── Recent activity (last 10 audit events) ────────────────────────────
    recent_qs = (
        AuditLog.objects
        .select_related('submission__user', 'submission__assessment')
        .order_by('-created_at')
        .values(
            'event_type',
            'created_at',
            'old_status',
            'new_status',
            'submission_id',
        )[:10]
    )
    recent_activity = []
    for r in recent_qs:
        recent_activity.append({
            'event_type': r['event_type'],
            'created_at': r['created_at'].isoformat() if r['created_at'] else None,
            'old_status': r['old_status'],
            'new_status': r['new_status'],
            'submission_id': str(r['submission_id']) if r['submission_id'] else None,
        })

    return JsonResponse({
        'students': {
            'total': student_agg['total'] or 0,
            'active': student_agg['active'] or 0,
        },
        'assignments': {
            'total': assignment_agg['total'] or 0,
            'started': assignment_agg['started'] or 0,
            'completed': assignment_agg['completed'] or 0,
        },
        'submissions': {
            'total': sub_agg['total'] or 0,
            'pending': sub_agg['pending'] or 0,
            'processing': sub_agg['processing'] or 0,
            'complete': sub_agg['complete'] or 0,
            'failed': sub_agg['failed'] or 0,
        },
        'avg_score': avg_score,
        'dlq_unresolved': dlq_unresolved,
        'recent_activity': recent_activity,
        'generated_at': timezone.now().isoformat(),
    })


# ---------------------------------------------------------------------------
# GET /api/admin/stats/analytics?period=week|month|quarter
# ---------------------------------------------------------------------------

PERIOD_DAYS = {
    'week': 7,
    'month': 30,
    'quarter': 90,
}


@csrf_exempt
@require_http_methods(['GET'])
def analytics_stats(request):
    """
    Returns time-series and aggregated data for the analytics dashboard.

    ?period=week|month|quarter  (default: month)

    Designed for 60-second polling. All queries are read-only aggregations.
    """
    _, err = _require_admin(request)
    if err:
        return err

    period = request.GET.get('period', 'month')
    days = PERIOD_DAYS.get(period, 30)
    start = timezone.now() - timedelta(days=days)

    # ── Submissions trend (count per day in the selected period) ───────────
    trend_qs = (
        AssessmentSubmission.objects
        .filter(created_at__gte=start)
        .annotate(day=TruncDay('created_at'))
        .values('day')
        .annotate(count=Count('id'))
        .order_by('day')
    )
    submissions_trend = [
        {
            'date': t['day'].date().isoformat() if t['day'] else None,
            'count': t['count'],
        }
        for t in trend_qs
    ]

    # ── Domain averages (all-time) ─────────────────────────────────────────
    domain_avg_qs = (
        SubmissionScore.objects
        .values('domain')
        .annotate(avg=Avg('score'))
        .order_by('domain')
    )
    domain_averages = [
        {
            'domain': d['domain'],
            'avg': _safe_round(d['avg']) or 0.0,
        }
        for d in domain_avg_qs
    ]

    # ── Score distribution (percentage buckets) ────────────────────────────
    buckets = {'0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0}
    # Use chunked iteration to avoid loading all scores into memory at once
    for score_val in SubmissionScore.objects.values_list('score', flat=True).iterator(chunk_size=500):
        bucket = _score_bucket(float(score_val))
        buckets[bucket] = buckets.get(bucket, 0) + 1

    score_distribution = [
        {'range': k, 'count': v}
        for k, v in buckets.items()
    ]

    # ── Completion rate ────────────────────────────────────────────────────
    total_subs = AssessmentSubmission.objects.count()
    complete_subs = AssessmentSubmission.objects.filter(
        status=AssessmentSubmission.STATUS_COMPLETE
    ).count()
    completion_rate = _safe_round((complete_subs / total_subs * 100), 1) if total_subs else 0.0

    # ── Status breakdown (for pie chart) ──────────────────────────────────
    status_breakdown_qs = (
        AssessmentSubmission.objects
        .values('status')
        .annotate(count=Count('id'))
        .order_by('status')
    )
    status_breakdown = [
        {'status': s['status'], 'count': s['count']}
        for s in status_breakdown_qs
    ]

    return JsonResponse({
        'period': period,
        'period_days': days,
        'submissions_trend': submissions_trend,
        'domain_averages': domain_averages,
        'score_distribution': score_distribution,
        'status_breakdown': status_breakdown,
        'completion_rate': completion_rate,
        'total_submissions': total_subs,
        'complete_submissions': complete_subs,
        'generated_at': timezone.now().isoformat(),
    })

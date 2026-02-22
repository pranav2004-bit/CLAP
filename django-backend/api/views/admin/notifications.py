import json
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db.models import Q
from django.http import JsonResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, DeadLetterQueue, User
from api.utils.jwt_utils import get_user_from_request


def _require_admin(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None


def _pipeline_summary(window_hours=24):
    now = timezone.now()
    window_start = now - timedelta(hours=window_hours)

    submissions_qs = AssessmentSubmission.objects.filter(created_at__gte=window_start)
    total_submissions = submissions_qs.count()
    completed_submissions = submissions_qs.filter(status=AssessmentSubmission.STATUS_COMPLETE).count()
    failed_like_submissions = submissions_qs.filter(status__icontains='FAILED').count()

    unresolved_dlq_qs = DeadLetterQueue.objects.filter(resolved=False)
    unresolved_dlq = unresolved_dlq_qs.count()
    oldest_unresolved = unresolved_dlq_qs.order_by('created_at').first()
    oldest_unresolved_age_minutes = None
    if oldest_unresolved and oldest_unresolved.created_at:
        oldest_unresolved_age_minutes = round((now - oldest_unresolved.created_at).total_seconds() / 60, 2)

    recent_failure_events = AuditLog.objects.filter(
        created_at__gte=window_start,
    ).filter(
        Q(event_type__icontains='fail') | Q(event_type__icontains='error') | Q(event_type__icontains='dlq')
    ).order_by('-created_at')[:50]

    return {
        'window_hours': window_hours,
        'window_start': window_start.isoformat(),
        'window_end': now.isoformat(),
        'submissions': {
            'total': total_submissions,
            'completed': completed_submissions,
            'failed_like': failed_like_submissions,
        },
        'dlq': {
            'unresolved_count': unresolved_dlq,
            'oldest_unresolved_id': oldest_unresolved.id if oldest_unresolved else None,
            'oldest_unresolved_age_minutes': oldest_unresolved_age_minutes,
        },
        'recent_failure_events': [
            {
                'id': event.id,
                'submission_id': str(event.submission_id),
                'event_type': event.event_type,
                'detail': event.error_detail,
                'created_at': event.created_at.isoformat() if event.created_at else None,
            }
            for event in recent_failure_events
        ],
    }


def _tiered_alerts(summary):
    alerts = []
    unresolved = summary['dlq']['unresolved_count']

    if unresolved > 50:
        alerts.append({'tier': 'P1', 'channel': 'pagerduty', 'message': f'Unresolved DLQ count is {unresolved} (>50)'})
    elif unresolved > 10:
        alerts.append({'tier': 'P2', 'channel': 'slack', 'message': f'Unresolved DLQ count is {unresolved} (>10)'})

    oldest_age = summary['dlq']['oldest_unresolved_age_minutes']
    if oldest_age is not None and oldest_age > 30:
        alerts.append({'tier': 'P1', 'channel': 'pagerduty', 'message': f'Oldest unresolved DLQ age is {oldest_age} minutes (>30)'})
    elif oldest_age is not None and oldest_age > 5:
        alerts.append({'tier': 'P2', 'channel': 'slack', 'message': f'Oldest unresolved DLQ age is {oldest_age} minutes (>5)'})

    failures = len(summary['recent_failure_events'])
    if failures > 25:
        alerts.append({'tier': 'P2', 'channel': 'slack', 'message': f'{failures} failure-like audit events in last {summary["window_hours"]}h'})

    return alerts


@csrf_exempt
@require_http_methods(["GET"])
def in_app_alerts(request):
    _, err = _require_admin(request)
    if err:
        return err

    window_hours = int(request.GET.get('window_hours', '24'))
    summary = _pipeline_summary(window_hours=window_hours)
    alerts = _tiered_alerts(summary)

    return JsonResponse({
        'summary': summary,
        'alerts': alerts,
        'count': len(alerts),
    })


@csrf_exempt
@require_http_methods(["POST"])
def send_daily_summary(request):
    admin_user, err = _require_admin(request)
    if err:
        return err

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    window_hours = int(payload.get('window_hours', 24))
    summary = _pipeline_summary(window_hours=window_hours)
    alerts = _tiered_alerts(summary)

    to_emails = payload.get('to_emails')
    if not isinstance(to_emails, list) or not to_emails:
        to_emails = list(User.objects.filter(role='admin', is_active=True).values_list('email', flat=True))

    if not to_emails:
        return JsonResponse({'error': 'No active admin recipients found'}, status=400)

    html_body = render_to_string(
        'emails/submission_ready.html',
        {
            'student_name': 'Admin Team',
            'scores': [],
            'report_url': '',
        },
    )

    plain_lines = [
        f"CLAP Daily Pipeline Summary ({summary['window_hours']}h)",
        f"Submissions total: {summary['submissions']['total']}",
        f"Submissions completed: {summary['submissions']['completed']}",
        f"Submissions failed-like: {summary['submissions']['failed_like']}",
        f"Unresolved DLQ count: {summary['dlq']['unresolved_count']}",
        f"Oldest unresolved age (minutes): {summary['dlq']['oldest_unresolved_age_minutes']}",
        f"Alert count: {len(alerts)}",
    ]
    if alerts:
        plain_lines.append('Alerts:')
        plain_lines.extend([f"- [{a['tier']}] {a['message']}" for a in alerts])

    message = EmailMultiAlternatives(
        subject='CLAP Daily Pipeline Summary',
        body='\n'.join(plain_lines),
        from_email=getattr(settings, 'FROM_EMAIL', None),
        to=to_emails,
    )
    message.attach_alternative(html_body, 'text/html')
    message.send()

    sample_submission = AssessmentSubmission.objects.order_by('-created_at').first()
    if sample_submission:
        AuditLog.objects.create(
            submission=sample_submission,
            event_type='admin_daily_summary_sent',
            old_status=None,
            new_status=None,
            worker_id=f'admin:{admin_user.id}',
            error_detail=f'recipients={len(to_emails)}; window_hours={window_hours}; alerts={len(alerts)}',
        )

    return JsonResponse(
        {
            'status': 'sent',
            'recipient_count': len(to_emails),
            'window_hours': window_hours,
            'alerts_count': len(alerts),
        },
        status=202,
    )

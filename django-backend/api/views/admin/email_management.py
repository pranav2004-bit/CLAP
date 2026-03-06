import json

from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog
from api.utils.auth import require_admin as _require_admin

from importlib.util import find_spec

if find_spec('celery') is not None:
    from api.tasks import send_email_report
else:
    send_email_report = None

BOUNCE_EVENT_MARKERS = ('bounce', 'bounced', 'complaint')


def _latest_email_event_map(submission_ids):
    if not submission_ids:
        return {}

    event_q = Q()
    for marker in BOUNCE_EVENT_MARKERS:
        event_q |= Q(event_type__icontains=marker)

    latest = (
        AuditLog.objects.filter(submission_id__in=submission_ids)
        .filter(event_q)
        .order_by('submission_id', '-created_at')
    )

    result = {}
    for event in latest:
        if event.submission_id not in result:
            result[event.submission_id] = {
                'event_type': event.event_type,
                'detail': event.error_detail,
                'created_at': event.created_at.isoformat() if event.created_at else None,
            }
    return result


def _email_delivery_status(submission, latest_event):
    if submission.email_sent_at:
        if latest_event and 'complaint' in latest_event['event_type'].lower():
            return 'complaint'
        if latest_event and ('bounce' in latest_event['event_type'].lower() or 'bounced' in latest_event['event_type'].lower()):
            return 'bounced'
        return 'sent'

    if submission.status == AssessmentSubmission.STATUS_EMAIL_SENDING:
        return 'pending'

    if latest_event and 'complaint' in latest_event['event_type'].lower():
        return 'complaint'
    if latest_event and ('bounce' in latest_event['event_type'].lower() or 'bounced' in latest_event['event_type'].lower()):
        return 'bounced'

    return 'pending'


@csrf_exempt
@require_http_methods(['GET'])
def email_delivery_status(request):
    _, err = _require_admin(request)
    if err:
        return err

    qs = AssessmentSubmission.objects.select_related('user', 'assessment').order_by('-updated_at')

    student_id = request.GET.get('student_id')
    if student_id:
        qs = qs.filter(user_id=student_id)

    batch_id = request.GET.get('batch_id')
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)

    assessment_id = request.GET.get('assessment_id')
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    rows = list(qs[:300])
    latest_events = _latest_email_event_map([s.id for s in rows])

    desired_status = (request.GET.get('delivery_status') or '').strip().lower()
    response_rows = []
    for submission in rows:
        event = latest_events.get(submission.id)
        delivery_status = _email_delivery_status(submission, event)
        if desired_status and delivery_status != desired_status:
            continue

        response_rows.append(
            {
                'submission_id': str(submission.id),
                'student': {
                    'id': str(submission.user_id),
                    'email': submission.user.email,
                    'name': submission.user.full_name,
                },
                'assessment': {
                    'id': str(submission.assessment_id),
                    'name': getattr(submission.assessment, 'name', None),
                },
                'pipeline_status': submission.status,
                'delivery_status': delivery_status,
                'email_sent_at': submission.email_sent_at.isoformat() if submission.email_sent_at else None,
                'latest_email_event': event,
                'updated_at': submission.updated_at.isoformat() if submission.updated_at else None,
            }
        )

    return JsonResponse({'rows': response_rows, 'count': len(response_rows)})


@csrf_exempt
@require_http_methods(['POST'])
def resend_email(request, submission_id):
    admin_user, err = _require_admin(request)
    if err:
        return err

    if send_email_report is None:
        return JsonResponse({'error': 'Celery is not available in this environment'}, status=503)

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    if not submission.report_url:
        return JsonResponse({'error': 'Cannot send email: report_url is missing'}, status=400)

    old_status = submission.status
    submission.status = AssessmentSubmission.STATUS_REPORT_READY
    submission.email_sent_at = None
    submission.updated_at = timezone.now()
    submission.save(update_fields=['status', 'email_sent_at', 'updated_at'])

    AuditLog.objects.create(
        submission=submission,
        event_type='admin_email_resend_requested',
        old_status=old_status,
        new_status=submission.status,
        worker_id=f'admin:{admin_user.id}',
        error_detail='manual_resend_single',
    )

    result = send_email_report.apply_async(args=[str(submission.id)], headers={'correlation_id': submission.correlation_id or str(submission.id)})

    return JsonResponse(
        {
            'status': 'accepted',
            'submission_id': str(submission.id),
            'task_id': result.id,
            'old_status': old_status,
            'new_status': submission.status,
        },
        status=202,
    )


@csrf_exempt
@require_http_methods(['POST'])
def bulk_resend_email(request):
    admin_user, err = _require_admin(request)
    if err:
        return err

    if send_email_report is None:
        return JsonResponse({'error': 'Celery is not available in this environment'}, status=503)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    batch_id = payload.get('batch_id')
    assessment_id = payload.get('assessment_id')
    if not batch_id and not assessment_id:
        return JsonResponse({'error': 'Provide batch_id or assessment_id'}, status=400)

    only_failed = bool(payload.get('only_failed', False))

    # H3: Safety guard — default to dry_run=True so admins must explicitly opt-in.
    # This prevents accidental bulk-spam on 500 students from a single API call.
    dry_run = bool(payload.get('dry_run', True))

    qs = AssessmentSubmission.objects.select_related('user').filter(report_url__isnull=False)
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    rows = list(qs.order_by('-updated_at')[:500])
    latest_events = _latest_email_event_map([s.id for s in rows])

    # H3: dry_run preview — return what would be dispatched without actually sending
    if dry_run:
        would_dispatch = [str(s.id) for s in rows]
        return JsonResponse({
            'status': 'dry_run',
            'would_dispatch_count': len(would_dispatch),
            'would_dispatch': would_dispatch[:20],  # Preview first 20
            'note': 'No emails sent. Pass dry_run=false to execute.',
        }, status=200)

    dispatched = []
    skipped = []
    for submission in rows:
        event = latest_events.get(submission.id)
        status = _email_delivery_status(submission, event)
        if only_failed and status not in {'bounced', 'complaint'}:
            skipped.append({'submission_id': str(submission.id), 'reason': f'delivery_status={status}'})
            continue

        old_status = submission.status
        submission.status = AssessmentSubmission.STATUS_REPORT_READY
        submission.email_sent_at = None
        submission.updated_at = timezone.now()
        submission.save(update_fields=['status', 'email_sent_at', 'updated_at'])

        AuditLog.objects.create(
            submission=submission,
            event_type='admin_email_resend_requested',
            old_status=old_status,
            new_status=submission.status,
            worker_id=f'admin:{admin_user.id}',
            error_detail='manual_resend_bulk',
        )

        task = send_email_report.apply_async(args=[str(submission.id)], headers={'correlation_id': submission.correlation_id or str(submission.id)})
        dispatched.append({'submission_id': str(submission.id), 'task_id': task.id})

    return JsonResponse({'status': 'accepted', 'dispatched': dispatched, 'skipped': skipped}, status=202)


@csrf_exempt
@require_http_methods(['GET'])
def bounce_complaint_logs(request):
    _, err = _require_admin(request)
    if err:
        return err

    qs = AuditLog.objects.select_related('submission', 'submission__user', 'submission__assessment').order_by('-created_at')

    event_q = Q()
    for marker in BOUNCE_EVENT_MARKERS:
        event_q |= Q(event_type__icontains=marker)
    qs = qs.filter(event_q)

    created_from = request.GET.get('created_from')
    if created_from:
        qs = qs.filter(created_at__gte=created_from)

    created_to = request.GET.get('created_to')
    if created_to:
        qs = qs.filter(created_at__lte=created_to)

    rows = []
    for event in qs[:500]:
        rows.append(
            {
                'audit_id': event.id,
                'submission_id': str(event.submission_id),
                'event_type': event.event_type,
                'detail': event.error_detail,
                'student_id': str(event.submission.user_id),
                'student_email': event.submission.user.email,
                'assessment_id': str(event.submission.assessment_id),
                'assessment_name': getattr(event.submission.assessment, 'name', None),
                'created_at': event.created_at.isoformat() if event.created_at else None,
            }
        )

    return JsonResponse({'rows': rows, 'count': len(rows)})

import json
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def email_event_webhook(request):
    """Webhook receiver for SES/SendGrid bounce/complaint events."""

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    submission_id = payload.get('submission_id')
    event_type = payload.get('event_type', 'email_event')
    detail = payload.get('detail', '')

    if submission_id:
        try:
            submission = AssessmentSubmission.objects.get(id=submission_id)
            AuditLog.objects.create(
                submission=submission,
                event_type=event_type,
                old_status=submission.status,
                new_status=submission.status,
                worker_id='email-webhook',
                error_detail=str(detail)[:2000],
            )
        except AssessmentSubmission.DoesNotExist:
            logger.warning('Webhook submission not found: %s', submission_id)

    return JsonResponse({'status': 'ok'})

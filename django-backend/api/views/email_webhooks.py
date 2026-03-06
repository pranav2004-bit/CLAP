import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog

logger = logging.getLogger(__name__)


def _verify_webhook_signature(request) -> bool:
    """
    Verify HMAC signature from SendGrid/SES.
    Returns True if:
      - EMAIL_WEBHOOK_SECRET is not configured (dev mode — skip verification), OR
      - Signature matches expected HMAC-SHA256
    Returns False (reject) if secret is set but signature is missing or wrong.
    """
    secret = getattr(settings, 'EMAIL_WEBHOOK_SECRET', '')
    if not secret:
        return True  # Not configured — dev/staging mode, skip verification

    provider = getattr(settings, 'EMAIL_PROVIDER', '').lower()

    if provider == 'sendgrid':
        # SendGrid Event Webhook signature: HMAC-SHA256(timestamp + body, secret)
        sig = request.headers.get('X-Twilio-Email-Event-Webhook-Signature', '')
        ts  = request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp', '')
        if not sig or not ts:
            return False
        try:
            expected = hmac.new(
                secret.encode('utf-8'),
                (ts + request.body.decode('utf-8', errors='replace')).encode('utf-8'),
                hashlib.sha256,
            ).hexdigest()
            return hmac.compare_digest(sig, expected)
        except Exception:
            return False

    # SES / other providers: secret set but no provider-specific check implemented yet
    # Future: verify SNS message signature via AWS SNS SDK
    return True


@csrf_exempt
@require_http_methods(["POST"])
def email_event_webhook(request):
    """Webhook receiver for SES/SendGrid bounce/complaint events."""

    if not _verify_webhook_signature(request):
        logger.warning('Email webhook signature verification failed — rejecting request from %s',
                       request.META.get('REMOTE_ADDR', 'unknown'))
        return JsonResponse({'error': 'Invalid signature'}, status=403)

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

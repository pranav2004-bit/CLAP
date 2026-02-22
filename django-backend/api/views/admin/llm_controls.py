import json
from importlib.util import find_spec

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, SubmissionScore
from api.utils.jwt_utils import get_user_from_request

if find_spec('celery') is not None:
    from celery import group
    from api.tasks import evaluate_speaking, evaluate_writing
else:
    group = None
    evaluate_speaking = evaluate_writing = None


RETRIGGER_DOMAINS = {
    'writing': ['writing'],
    'speaking': ['speaking'],
    'both': ['writing', 'speaking'],
}


@csrf_exempt
@require_http_methods(["POST"])
def retrigger_llm_evaluation(request, submission_id):
    admin_user = get_user_from_request(request)
    if not admin_user or admin_user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if evaluate_writing is None or evaluate_speaking is None:
        return JsonResponse({'error': 'Celery is not available in this environment'}, status=503)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    scope = (payload.get('scope') or 'both').strip().lower()
    if scope not in RETRIGGER_DOMAINS:
        return JsonResponse({'error': 'scope must be one of: writing, speaking, both'}, status=400)

    reason = (payload.get('reason') or '').strip()

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    target_domains = RETRIGGER_DOMAINS[scope]

    with transaction.atomic():
        deleted_count, _ = SubmissionScore.objects.filter(
            submission=submission,
            domain__in=target_domains,
        ).delete()

        old_status = submission.status
        if old_status != AssessmentSubmission.STATUS_LLM_PROCESSING:
            submission.status = AssessmentSubmission.STATUS_LLM_PROCESSING
            submission.updated_at = timezone.now()
            submission.save(update_fields=['status', 'updated_at'])

        AuditLog.objects.create(
            submission=submission,
            event_type='llm_retrigger_requested',
            old_status=old_status,
            new_status=submission.status,
            worker_id=f'admin:{admin_user.id}',
            error_detail=f'scope={scope}; reason={reason}' if reason else f'scope={scope}',
        )

    sigs = []
    if 'writing' in target_domains:
        sigs.append(evaluate_writing.si(str(submission.id)))
    if 'speaking' in target_domains:
        sigs.append(evaluate_speaking.si(str(submission.id)))

    headers = {'correlation_id': submission.correlation_id or str(submission.id)}
    if len(sigs) == 2:
        async_result = group(sigs).apply_async(headers=headers)
        task_ids = [child.id for child in async_result.results]
    else:
        async_result = sigs[0].apply_async(headers=headers)
        task_ids = [async_result.id]

    return JsonResponse(
        {
            'status': 'accepted',
            'submission_id': str(submission.id),
            'scope': scope,
            'cleared_scores': deleted_count,
            'task_ids': task_ids,
        },
        status=202,
    )

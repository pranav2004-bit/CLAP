import json

from django.db import transaction
from django.db.models import Avg, Count, Q
from importlib.util import find_spec

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, DeadLetterQueue, SubmissionScore
from api.utils.jwt_utils import get_user_from_request

from importlib.util import find_spec

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

PROMPT_BY_DOMAIN = {
    'writing': 'Evaluate writing response using rubric and return JSON',
    'speaking': 'Evaluate speaking transcript using rubric and return JSON',
}


def _require_admin(request):
    admin_user = get_user_from_request(request)
    if not admin_user or admin_user.role != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return admin_user, None


@csrf_exempt
@require_http_methods(["POST"])
def retrigger_llm_evaluation(request, submission_id):
    admin_user, err = _require_admin(request)
    if err:
        return err
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


@csrf_exempt
@require_http_methods(["GET"])
def llm_trace_by_submission(request, submission_id):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    scores = {
        score.domain: score
        for score in SubmissionScore.objects.filter(submission=submission, domain__in=['writing', 'speaking'])
    }

    domains = []
    for domain in ['writing', 'speaking']:
        score = scores.get(domain)
        domains.append(
            {
                'domain': domain,
                'prompt': PROMPT_BY_DOMAIN[domain],
                'llm_request_id': score.llm_request_id if score else None,
                'score': float(score.score) if score else None,
                'raw_response': score.feedback_json if score else None,
                'evaluated_at': score.evaluated_at.isoformat() if score and score.evaluated_at else None,
            }
        )

    audits = AuditLog.objects.filter(
        submission=submission,
        event_type__in=['llm_retrigger_requested', 'status_transition', 'dlq_recorded'],
    ).order_by('-created_at')[:50]

    return JsonResponse(
        {
            'submission': {
                'id': str(submission.id),
                'status': submission.status,
                'correlation_id': submission.correlation_id,
                'student_id': str(submission.user_id),
                'assessment_id': str(submission.assessment_id),
            },
            'llm_trace': domains,
            'audit_events': [
                {
                    'event_type': a.event_type,
                    'old_status': a.old_status,
                    'new_status': a.new_status,
                    'worker_id': a.worker_id,
                    'error_detail': a.error_detail,
                    'created_at': a.created_at.isoformat() if a.created_at else None,
                }
                for a in audits
            ],
        }
    )


@csrf_exempt
@require_http_methods(["GET"])
def llm_analytics(request):
    _, err = _require_admin(request)
    if err:
        return err

    qs = SubmissionScore.objects.filter(domain__in=['writing', 'speaking'])
    domain_stats = (
        qs.values('domain')
        .annotate(
            evaluations=Count('id'),
            avg_score=Avg('score'),
        )
        .order_by('domain')
    )

    llm_dlq = DeadLetterQueue.objects.filter(task_name__in=['evaluate_writing', 'evaluate_speaking'])
    validation_failures = llm_dlq.filter(
        Q(error_message__icontains='schema')
        | Q(error_message__icontains='json')
        | Q(error_message__icontains='validation')
    ).count()

    retriggers = AuditLog.objects.filter(event_type='llm_retrigger_requested').count()

    return JsonResponse(
        {
            'domains': [
                {
                    'domain': row['domain'],
                    'evaluations': row['evaluations'],
                    'avg_score': float(row['avg_score'] or 0),
                }
                for row in domain_stats
            ],
            'retrigger_requests': retriggers,
            'llm_dlq': {
                'total': llm_dlq.count(),
                'unresolved': llm_dlq.filter(resolved=False).count(),
                'validation_failures': validation_failures,
            },
            'generated_at': timezone.now().isoformat(),
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def manual_score_from_dlq(request, dlq_id):
    admin_user, err = _require_admin(request)
    if err:
        return err

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    domain = (payload.get('domain') or '').strip().lower()
    score = payload.get('score')
    feedback = payload.get('feedback')
    reason = (payload.get('reason') or '').strip()

    if domain not in {'writing', 'speaking'}:
        return JsonResponse({'error': 'domain must be writing or speaking'}, status=400)

    try:
        score_value = float(score)
    except Exception:
        return JsonResponse({'error': 'score must be numeric'}, status=400)

    if score_value < 0 or score_value > 10:
        return JsonResponse({'error': 'score must be between 0 and 10'}, status=400)

    if not reason:
        return JsonResponse({'error': 'reason is required'}, status=400)

    try:
        dlq_entry = DeadLetterQueue.objects.select_related('submission').get(id=dlq_id)
    except DeadLetterQueue.DoesNotExist:
        return JsonResponse({'error': 'DLQ entry not found'}, status=404)

    submission = dlq_entry.submission
    if not submission:
        return JsonResponse({'error': 'DLQ entry is not attached to a submission'}, status=400)

    with transaction.atomic():
        score_obj, _ = SubmissionScore.objects.update_or_create(
            submission=submission,
            domain=domain,
            defaults={
                'score': score_value,
                'feedback_json': feedback if isinstance(feedback, dict) else {'overall': str(feedback or '')},
                'evaluated_by': 'llm',
                'evaluated_at': timezone.now(),
                'llm_request_id': f'manual-dlq-{admin_user.id}-{dlq_entry.id}',
            },
        )

        dlq_entry.resolved = True
        dlq_entry.save(update_fields=['resolved'])

        llm_domains = set(
            SubmissionScore.objects.filter(submission=submission, domain__in=['writing', 'speaking']).values_list('domain', flat=True)
        )
        old_status = submission.status
        if llm_domains == {'writing', 'speaking'} and submission.status == AssessmentSubmission.STATUS_LLM_PROCESSING:
            submission.status = AssessmentSubmission.STATUS_LLM_COMPLETE
            submission.updated_at = timezone.now()
            submission.save(update_fields=['status', 'updated_at'])

        AuditLog.objects.create(
            submission=submission,
            event_type='llm_manual_score_from_dlq',
            old_status=old_status,
            new_status=submission.status,
            worker_id=f'admin:{admin_user.id}',
            error_detail=f'dlq_id={dlq_entry.id}; domain={domain}; reason={reason}',
        )

    return JsonResponse(
        {
            'status': 'ok',
            'dlq_id': dlq_entry.id,
            'submission_id': str(submission.id),
            'domain': domain,
            'score': float(score_obj.score),
            'resolved': True,
        }
    )

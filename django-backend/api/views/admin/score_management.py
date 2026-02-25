import csv
import io
import json

from django.db.models import Avg
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone

from api.models import AssessmentSubmission, SubmissionScore, AuditLog
from api.utils.jwt_utils import get_user_from_request


def _require_admin(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None


@csrf_exempt
@require_http_methods(["GET"])
def scores_by_submission(request, submission_id):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    rows = []
    for score in SubmissionScore.objects.filter(submission=submission).order_by('domain'):
        rows.append({
            'domain': score.domain,
            'score': float(score.score),
            'feedback': score.feedback_json,
            'evaluated_by': score.evaluated_by,
            'evaluated_at': score.evaluated_at.isoformat() if score.evaluated_at else None,
            'llm_request_id': score.llm_request_id,
        })

    assessment = submission.assessment
    assessment_title = (
        getattr(assessment, 'title', None)
        or getattr(assessment, 'name', None)
        or str(assessment)
    )

    return JsonResponse({
        'submission': {
            'id': str(submission.id),
            'status': submission.status,
            'student_id': str(submission.user_id),
            'student_email': submission.user.email,
            'assessment_id': str(submission.assessment_id),
            'assessment_title': assessment_title,
        },
        'scores': rows,
    })


@csrf_exempt
@require_http_methods(["GET"])
def scores_by_batch(request, batch_id):
    _, err = _require_admin(request)
    if err:
        return err

    qs = SubmissionScore.objects.filter(submission__user__batch_id=batch_id)
    aggregates = qs.values('domain').annotate(avg_score=Avg('score')).order_by('domain')

    return JsonResponse({
        'batch_id': str(batch_id),
        'domain_averages': [
            {'domain': row['domain'], 'avg_score': float(row['avg_score'] or 0)}
            for row in aggregates
        ],
        'submissions_count': AssessmentSubmission.objects.filter(user__batch_id=batch_id).count(),
    })


@csrf_exempt
@require_http_methods(["GET"])
def scores_by_assessment(request, assessment_id):
    _, err = _require_admin(request)
    if err:
        return err

    subs = AssessmentSubmission.objects.select_related('user').filter(assessment_id=assessment_id).order_by('-created_at')
    rows = []
    for sub in subs[:500]:
        domain_scores = {
            s.domain: float(s.score)
            for s in SubmissionScore.objects.filter(submission=sub)
        }
        rows.append({
            'submission_id': str(sub.id),
            'student_id': str(sub.user_id),
            'student_email': sub.user.email,
            'status': sub.status,
            'scores': domain_scores,
            'created_at': sub.created_at.isoformat() if sub.created_at else None,
        })

    return JsonResponse({'assessment_id': str(assessment_id), 'rows': rows})


@csrf_exempt
@require_http_methods(["POST"])
def override_score(request, submission_id):
    admin_user, err = _require_admin(request)
    if err:
        return err

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    domain = (payload.get('domain') or '').strip().lower()
    score = payload.get('score')
    reason = (payload.get('reason') or '').strip()
    feedback = payload.get('feedback')

    if domain not in {'listening', 'reading', 'vocab', 'writing', 'speaking'}:
        return JsonResponse({'error': 'Invalid domain'}, status=400)
    if score is None:
        return JsonResponse({'error': 'score is required'}, status=400)
    try:
        score_value = float(score)
    except Exception:
        return JsonResponse({'error': 'score must be numeric'}, status=400)
    if not 0 <= score_value <= 10:
        return JsonResponse({'error': 'score must be between 0 and 10'}, status=400)
    if not reason:
        return JsonResponse({'error': 'reason is required for override'}, status=400)

    try:
        submission = AssessmentSubmission.objects.get(id=submission_id)
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    score_obj, _ = SubmissionScore.objects.update_or_create(
        submission=submission,
        domain=domain,
        defaults={
            'score': score_value,
            'feedback_json': feedback if isinstance(feedback, dict) else {'overall': str(feedback or '')},
            'evaluated_by': 'llm',
            'evaluated_at': timezone.now(),
            'llm_request_id': f'admin-override-{admin_user.id}',
        },
    )

    AuditLog.objects.create(
        submission=submission,
        event_type='score_override',
        old_status=submission.status,
        new_status=submission.status,
        worker_id=f'admin:{admin_user.id}',
        error_detail=f'domain={domain}; reason={reason}',
    )

    return JsonResponse({
        'status': 'ok',
        'submission_id': str(submission.id),
        'domain': domain,
        'score': float(score_obj.score),
        'reason': reason,
    })


@csrf_exempt
@require_http_methods(["GET"])
def export_scores(request):
    _, err = _require_admin(request)
    if err:
        return err

    scope = (request.GET.get('scope') or '').strip().lower()
    qs = AssessmentSubmission.objects.select_related('user', 'assessment').order_by('-created_at')

    if scope == 'batch':
        batch_id = request.GET.get('batch_id')
        if not batch_id:
            return JsonResponse({'error': 'batch_id is required for scope=batch'}, status=400)
        qs = qs.filter(user__batch_id=batch_id)
    elif scope == 'assessment':
        assessment_id = request.GET.get('assessment_id')
        if not assessment_id:
            return JsonResponse({'error': 'assessment_id is required for scope=assessment'}, status=400)
        qs = qs.filter(assessment_id=assessment_id)

    created_from = request.GET.get('created_from')
    if created_from:
        qs = qs.filter(created_at__gte=created_from)
    created_to = request.GET.get('created_to')
    if created_to:
        qs = qs.filter(created_at__lte=created_to)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        'submission_id', 'assessment_id', 'assessment_title', 'student_id', 'student_email',
        'status', 'listening', 'reading', 'vocab', 'writing', 'speaking', 'created_at'
    ])

    for sub in qs[:5000]:
        score_map = {s.domain: float(s.score) for s in SubmissionScore.objects.filter(submission=sub)}
        assessment = sub.assessment
        assessment_title = (
            getattr(assessment, 'title', None)
            or getattr(assessment, 'name', None)
            or str(assessment)
        )
        writer.writerow([
            str(sub.id),
            str(sub.assessment_id),
            assessment_title,
            str(sub.user_id),
            sub.user.email,
            sub.status,
            score_map.get('listening', ''),
            score_map.get('reading', ''),
            score_map.get('vocab', ''),
            score_map.get('writing', ''),
            score_map.get('speaking', ''),
            sub.created_at.isoformat() if sub.created_at else '',
        ])

    response = HttpResponse(buffer.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="scores_export.csv"'
    return response

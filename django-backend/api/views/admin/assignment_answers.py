"""
Admin Assignment Answers Preview
GET /api/admin/clap-tests/<test_id>/assignments/<assignment_id>/answers

Returns a student's submitted answers for all 5 test components,
including the correct answer key so the admin can cross-check.

For MCQ (Listening / Reading / Vocabulary):
  - question text, all options, student's selected index,
    correct option index (from the student's assigned set if applicable),
    is_correct flag, marks awarded vs max marks

For Writing / Speaking:
  - question prompt, student's text response (or audio transcription),
    LLM feedback if available
"""

import logging
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from api.models import (
    ClapTest, ClapTestComponent, ClapTestItem, ClapSetItem,
    StudentClapAssignment, StudentClapResponse,
    SubmissionScore, AssessmentSubmission,
)
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(['GET'])
def assignment_answers(request, test_id, assignment_id):
    """
    GET /api/admin/clap-tests/<test_id>/assignments/<assignment_id>/answers
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return JsonResponse({'error': 'Test not found'}, status=404)

    try:
        assignment = StudentClapAssignment.objects.select_related(
            'student', 'assigned_set'
        ).get(id=assignment_id, clap_test_id=test_id)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    student = assignment.student

    # ── Fetch LLM feedback from SubmissionScore ───────────────────────────────
    llm_feedback: dict[str, dict] = {}   # domain → {score, feedback_json}
    sub = AssessmentSubmission.objects.filter(
        user_id=assignment.student_id,
        assessment_id=test_id,
    ).order_by('-created_at').first()

    if sub:
        for sc in SubmissionScore.objects.filter(submission=sub):
            llm_feedback[sc.domain] = {
                'score':    float(sc.score),
                'feedback': sc.feedback_json,
            }

    # ── Build response map: item_id → StudentClapResponse ────────────────────
    responses_qs = StudentClapResponse.objects.filter(
        assignment=assignment
    ).select_related('item__component')
    response_map = {str(r.item_id): r for r in responses_qs}

    # ── Build set-item answer map if student has an assigned set ──────────────
    # Maps (test_type, order_index) → ClapSetItem for quick lookup
    set_item_map: dict[tuple, 'ClapSetItem'] = {}
    if assignment.assigned_set_id:
        for si in ClapSetItem.objects.filter(
            set_component__set_id=assignment.assigned_set_id
        ).select_related('set_component'):
            set_item_map[(si.set_component.test_type, si.order_index)] = si

    # ── Per-component answers ─────────────────────────────────────────────────
    components_data = []
    for comp in ClapTestComponent.objects.filter(clap_test_id=test_id).order_by('id'):
        items_data = []
        for item in ClapTestItem.objects.filter(component=comp).order_by('order_index'):
            resp = response_map.get(str(item.id))
            content = item.content or {}

            # Correct option: prefer set-specific answer key
            set_item = set_item_map.get((comp.test_type, item.order_index))
            if set_item and 'correct_option' in (set_item.content or {}):
                correct_option_idx = set_item.content['correct_option']
                answer_source = 'set'
            else:
                correct_option_idx = content.get('correct_option')
                answer_source = 'base'

            # Student's selected answer
            selected_option_idx = None
            if resp and resp.response_data is not None:
                rd = resp.response_data
                if isinstance(rd, dict):
                    selected_option_idx = rd.get('selected_option')
                elif isinstance(rd, (int, float)):
                    selected_option_idx = int(rd)

            # Strip correct_option from the content copy shown (keep options list)
            display_content = {k: v for k, v in content.items() if k != 'correct_option'}

            item_row = {
                'item_id':              str(item.id),
                'order_index':          item.order_index,
                'item_type':            item.item_type,
                'points':               item.points,
                'content':              display_content,
                # MCQ-specific
                'correct_option_index': correct_option_idx,
                'answer_source':        answer_source,   # 'set' or 'base'
                'selected_option_index': selected_option_idx,
                'is_correct':           resp.is_correct if resp else None,
                'marks_awarded':        float(resp.marks_awarded) if resp and resp.marks_awarded is not None else None,
                # Subjective / speaking
                'response_text':        resp.response_data if resp and isinstance(resp.response_data, str) else None,
            }
            items_data.append(item_row)

        # LLM feedback for writing/speaking
        score_domain = 'vocab' if comp.test_type == 'vocabulary' else comp.test_type
        llm = llm_feedback.get(score_domain, {})

        components_data.append({
            'test_type':    comp.test_type,
            'title':        comp.title,
            'max_marks':    comp.max_marks,
            'llm_score':    llm.get('score'),
            'llm_feedback': llm.get('feedback'),
            'items':        items_data,
        })

    return JsonResponse({
        'student_id':         student.student_id or '',
        'student_name':       student.full_name or '',
        'assigned_set_label': assignment.assigned_set_label or '',
        'status':             assignment.status,
        'submission_status':  sub.status if sub else None,
        'components':         components_data,
    })

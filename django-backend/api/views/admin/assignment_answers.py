"""
Admin Assignment Answers Preview
GET /api/admin/clap-tests/<test_id>/assignments/<assignment_id>/answers

Returns a student's submitted answers for all test components, including
the correct answer key so the admin can cross-check.

Set-aware content resolution
────────────────────────────
For students assigned to a set, every item's question text, options list,
item_type, and points come from the ClapSetItem — NOT the structural
ClapTestItem slot.  The structural slot intentionally stores content={}
(it is only a positional placeholder that carries the FK for StudentClapResponse).

Without this resolution, the preview would show '—' for every question and
an empty options list for every MCQ item, even when the student submitted
correct answers, because the structural slot's content is always empty.

Priority (mirrors student_test_items and score_rule_based):
  1. ClapSetItem.content  (student's assigned set — question text, options,
                           correct_option, points, item_type)
  2. ClapTestItem.content (base/master editor — legacy tests without sets)

For MCQ (Listening / Reading / Vocabulary):
  - question text, all options, student's selected index,
    correct option index (from the student's assigned set if applicable),
    is_correct flag, marks awarded vs max marks

For Writing / Speaking:
  - question prompt, student's text response (or audio transcription),
    LLM feedback if available

SUPERSEDED submissions
──────────────────────
After a retest is granted, the original submission is marked SUPERSEDED_xxx.
The LLM feedback query excludes SUPERSEDED entries so the preview always
shows the feedback for the student's CURRENT (latest active) attempt.
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
    # Exclude SUPERSEDED submissions (created by retest grant) so the preview
    # always shows the latest active attempt's feedback, not a prior attempt.
    llm_feedback: dict[str, dict] = {}   # domain → {score, feedback_json}
    sub = (
        AssessmentSubmission.objects
        .filter(
            user_id=assignment.student_id,
            assessment_id=test_id,
        )
        .exclude(status__startswith='SUPERSEDED_')
        .order_by('-created_at')
        .first()
    )

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

    # ── Build set-item map if student has an assigned set ─────────────────────
    # Key: (test_type, order_index) → ClapSetItem
    # This is the same lookup key used by score_rule_based and student_test_items,
    # ensuring the admin preview always shows the same question content and answer
    # key that the student actually saw and that was used for scoring.
    set_item_map: dict[tuple, 'ClapSetItem'] = {}
    if assignment.assigned_set_id:
        for si in ClapSetItem.objects.filter(
            set_component__set_id=assignment.assigned_set_id
        ).select_related('set_component'):
            key = (si.set_component.test_type, si.order_index)
            # Last write wins on collision (duplicate order_index edge case).
            set_item_map[key] = si

    # ── Per-component answers ─────────────────────────────────────────────────
    components_data = []
    for comp in ClapTestComponent.objects.filter(clap_test_id=test_id).order_by('id'):
        items_data = []
        for item in ClapTestItem.objects.filter(component=comp).order_by('order_index'):
            resp = response_map.get(str(item.id))

            # ── Content resolution: set item takes priority over base item ────
            #
            # The structural ClapTestItem slot ALWAYS has content={} for set-based
            # tests — it is an empty positional placeholder, not a real question.
            # All question text, options, correct_option, points, and item_type live
            # in ClapSetItem.content.  Using item.content here (the old behaviour)
            # means every question shows '—' and every MCQ options list is empty.
            #
            set_item = set_item_map.get((comp.test_type, item.order_index))

            if set_item:
                # Set-based flow — get everything from the student's assigned set
                raw_content        = (set_item.content or {}).copy()
                effective_item_type = set_item.item_type or item.item_type
                effective_points    = set_item.points if set_item.points is not None else item.points
            else:
                # Base/legacy flow — content lives directly on ClapTestItem
                raw_content        = (item.content or {}).copy()
                effective_item_type = item.item_type
                effective_points    = item.points

            # ── Correct answer key (MCQ) ──────────────────────────────────────
            # Pop correct_option from raw_content so it is never sent to the
            # frontend as part of the plain content dict.  We expose it only
            # through the explicit 'correct_option_index' field below.
            correct_option_idx = raw_content.pop('correct_option', None)
            answer_source = 'base'

            if set_item and correct_option_idx is not None:
                # Correct option came from the set item → answer_source = 'set'
                answer_source = 'set'
            elif set_item and correct_option_idx is None:
                # Set item exists but doesn't carry a correct_option
                # (e.g. subjective/text_block) — fall back to base item if any
                correct_option_idx = (item.content or {}).get('correct_option')
                answer_source = 'base'

            # ── Student's selected answer ─────────────────────────────────────
            # Parse response_data → integer option index.
            # Mirrors _reevaluate_mcq_responses in tasks.py: handles both
            # dict {"selected_option": N} and bare int N, plus a try/int()
            # safety net for string-encoded integers stored by older clients.
            selected_option_idx = None
            if resp and resp.response_data is not None:
                rd = resp.response_data
                if isinstance(rd, dict):
                    raw = rd.get('selected_option')
                elif isinstance(rd, (int, float)):
                    raw = int(rd)
                else:
                    raw = None  # unrecognised type — treat as no selection

                if raw is not None:
                    try:
                        selected_option_idx = int(raw)
                    except (TypeError, ValueError):
                        selected_option_idx = None

            # display_content no longer contains correct_option (already popped).
            # For set-based tests this is the REAL content (question + options).
            # For base tests this is the base item content as before.
            display_content = raw_content

            item_row = {
                'item_id':               str(item.id),
                'order_index':           item.order_index,
                'item_type':             effective_item_type,  # set item type takes priority
                'points':                effective_points,      # set item points take priority
                'content':               display_content,       # real content, not empty {}
                # MCQ-specific
                'correct_option_index':  correct_option_idx,
                'answer_source':         answer_source,   # 'set' or 'base'
                'selected_option_index': selected_option_idx,
                # True when a StudentClapResponse record exists for this item.
                # Use this — NOT selected_option_index — to distinguish "not answered"
                # from "answered but couldn't parse".
                'has_response':          resp is not None,
                # For MCQ items: unanswered = 0 marks (shows "0/N" in preview).
                # For W/S items: None = pending LLM evaluation (shows nothing).
                'is_correct':           resp.is_correct if resp else (False if effective_item_type == 'mcq' else None),
                'marks_awarded':        (
                    float(resp.marks_awarded) if resp and resp.marks_awarded is not None
                    else (0.0 if effective_item_type == 'mcq' else None)
                ),
                # Subjective / speaking text
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

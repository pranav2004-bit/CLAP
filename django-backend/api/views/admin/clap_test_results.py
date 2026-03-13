"""
Admin CLAP Test Results View
GET /api/admin/clap-tests/<uuid>/results
Returns paginated student results for a specific CLAP test
with per-component marks, grade, duration, search, and sort.

Scoring sources (priority order):
  1. SubmissionScore  — authoritative; set by the pipeline after evaluation
                        (rule-based for L/R/V, LLM for W/S)
  2. StudentClapResponse.marks_awarded — live fallback when the pipeline
                        hasn't run yet (MCQ answers scored at submission time)

This dual-source approach ensures:
  - Writing / Speaking marks are never shown as 0 (they come from SubmissionScore)
  - Total and Grade are always populated once evaluation is complete
  - MCQ marks are visible immediately after submission, before pipeline runs
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Avg, Q, Prefetch, Count, Case, When, IntegerField
from django.core.paginator import Paginator
import logging

from api.models import (
    ClapTest, ClapTestComponent, StudentClapAssignment,
    StudentClapResponse, MalpracticeEvent,
    AssessmentSubmission, SubmissionScore,
)
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)

# SubmissionScore stores rule-based domain as 'vocab'; ClapTestComponent uses 'vocabulary'
_SCORE_DOMAIN_TO_TEST_TYPE = {
    'listening': 'listening',
    'reading':   'reading',
    'vocab':     'vocabulary',
    'writing':   'writing',
    'speaking':  'speaking',
}
_TEST_TYPE_TO_SCORE_DOMAIN = {v: k for k, v in _SCORE_DOMAIN_TO_TEST_TYPE.items()}


def calculate_grade(total_score, max_possible):
    """
    Grade calculation for CLAP tests (total out of max_possible).
    O: >= 90%, A+: >= 80%, A: >= 70%, B+: >= 60%, B: < 60%
    """
    if total_score is None or max_possible is None or max_possible == 0:
        return None
    pct = (total_score / max_possible) * 100
    if pct >= 90:
        return 'O'
    elif pct >= 80:
        return 'A+'
    elif pct >= 70:
        return 'A'
    elif pct >= 60:
        return 'B+'
    else:
        return 'B'


@csrf_exempt
@require_http_methods(["GET"])
def clap_test_results_handler(request, test_id):
    """
    GET /api/admin/clap-tests/<uuid>/results
    Returns paginated student assignment results for a CLAP test.

    Query params:
      - page (int, default 1)
      - page_size (int, default 20, max 100)
      - status (optional filter: assigned/started/completed/expired/test_deleted)
      - search (optional: search by student_id or full_name)
      - sort_by (optional: 'total_score' or 'student_id')
      - sort_order (optional: 'asc' or 'desc', default 'desc')
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        try:
            clap_test = ClapTest.objects.get(id=test_id)
        except ClapTest.DoesNotExist:
            return JsonResponse({'error': 'CLAP test not found'}, status=404)

        # ── Component metadata ────────────────────────────────────────────────
        components = list(ClapTestComponent.objects.filter(clap_test_id=test_id))
        component_max = {comp.test_type: comp.max_marks for comp in components}
        max_possible = sum(comp.max_marks for comp in components)

        # ── Bulk-fetch SubmissionScore for every student in this test ─────────
        # Keyed by user_id (str) → { domain: float_score, 'submission_id': ...,
        #                             'submission_status': ... }
        # Multiple submissions per user are possible (retests); take latest.
        submission_score_map: dict[str, dict] = {}
        for sub in (
            AssessmentSubmission.objects
            .filter(assessment_id=test_id)
            .prefetch_related('scores')
            .order_by('created_at')   # ascending → latest wins
        ):
            uid = str(sub.user_id)
            entry = submission_score_map.setdefault(uid, {
                'submission_id': str(sub.id),
                'submission_status': sub.status,
            })
            entry['submission_id'] = str(sub.id)
            entry['submission_status'] = sub.status
            for sc in sub.scores.all():
                entry[sc.domain] = float(sc.score)

        # ── Base queryset for assignments ─────────────────────────────────────
        base_qs = StudentClapAssignment.objects.filter(clap_test_id=test_id)

        summary_agg = base_qs.aggregate(
            total_assigned=Count('id'),
            completed_count=Count(Case(When(status='completed', then=1), output_field=IntegerField())),
            started_count=Count(Case(When(status='started', then=1), output_field=IntegerField())),
            not_started_count=Count(Case(When(status='assigned', then=1), output_field=IntegerField())),
            avg_score=Avg(Case(
                When(status='completed', total_score__isnull=False, then='total_score'),
                output_field=IntegerField(),
            )),
        )

        # ── Prefetches ────────────────────────────────────────────────────────
        response_prefetch = Prefetch(
            'responses',
            queryset=StudentClapResponse.objects.select_related('item__component'),
        )
        malpractice_prefetch = Prefetch(
            'malpractice_events',
            queryset=MalpracticeEvent.objects.only('event_type'),
        )

        assignments_qs = base_qs.select_related('student').prefetch_related(
            response_prefetch, malpractice_prefetch
        )

        # ── Filters ───────────────────────────────────────────────────────────
        search = request.GET.get('search', '').strip()
        if search:
            assignments_qs = assignments_qs.filter(
                Q(student__student_id__icontains=search) |
                Q(student__full_name__icontains=search)
            )

        status_filter = request.GET.get('status')
        if status_filter:
            assignments_qs = assignments_qs.filter(status=status_filter)

        sort_by = request.GET.get('sort_by', '')
        sort_order = request.GET.get('sort_order', 'desc')
        order_prefix = '' if sort_order == 'asc' else '-'

        if sort_by == 'total_score':
            assignments_qs = assignments_qs.order_by(f'{order_prefix}total_score')
        elif sort_by == 'student_id':
            assignments_qs = assignments_qs.order_by(f'{order_prefix}student__student_id')
        else:
            assignments_qs = assignments_qs.order_by('-completed_at', '-started_at', '-assigned_at')

        # ── Pagination ────────────────────────────────────────────────────────
        page = max(int(request.GET.get('page', 1)), 1)
        page_size = min(max(int(request.GET.get('page_size', 20)), 1), 100)
        paginator = Paginator(assignments_qs, page_size)
        page_obj = paginator.get_page(page)

        results = []
        for assignment in page_obj:
            student = assignment.student
            uid = str(assignment.student_id)
            sub_data = submission_score_map.get(uid, {})

            # ── Component marks ───────────────────────────────────────────────
            # L/R/V (MCQ domains): computed directly by summing ALL StudentClapResponse
            #   marks_awarded for MCQ items in each component.
            #   - marks_awarded is written per-response by submit_response (real-time)
            #     and corrected by _reevaluate_mcq_responses (Celery + startup rescore).
            #   - This is IDENTICAL to the source used by the answers preview, so the
            #     results table and preview are always 100% consistent.
            #   - Does NOT depend on SubmissionScore or AssessmentSubmission existing —
            #     works for every completed assignment regardless of pipeline state.
            #
            # W/S (LLM domains): sourced exclusively from SubmissionScore because these
            #   are produced by the LLM evaluation pipeline and cannot be recomputed here.
            _MCQ_TYPES = frozenset(('listening', 'reading', 'vocabulary'))
            component_marks = {
                'listening':  None,
                'speaking':   sub_data.get('speaking'),
                'reading':    None,
                'writing':    sub_data.get('writing'),
                'vocabulary': None,
            }

            for resp in assignment.responses.all():
                if resp.item.item_type != 'mcq':
                    continue
                test_type = resp.item.component.test_type
                if test_type not in _MCQ_TYPES:
                    continue
                # First MCQ response seen for this component: initialise accumulator to 0
                if component_marks[test_type] is None:
                    component_marks[test_type] = 0.0
                if resp.marks_awarded is not None:
                    component_marks[test_type] = round(
                        component_marks[test_type] + float(resp.marks_awarded), 2
                    )

            # ── Total & Grade ─────────────────────────────────────────────────
            scored_values = [v for v in component_marks.values() if v is not None]
            computed_total = round(sum(scored_values), 2) if scored_values else None
            grade = calculate_grade(computed_total, max_possible)

            # ── Duration ─────────────────────────────────────────────────────
            duration_minutes = None
            if assignment.started_at and assignment.completed_at:
                delta = assignment.completed_at - assignment.started_at
                duration_minutes = round(delta.total_seconds() / 60, 1)

            # ── Integrity ─────────────────────────────────────────────────────
            events = list(assignment.malpractice_events.all())
            integrity_flags = {
                'tab_switches':     sum(1 for e in events if e.event_type == 'tab_switch'),
                'fullscreen_exits': sum(1 for e in events if e.event_type == 'fullscreen_exit'),
                'paste_attempts':   sum(1 for e in events if e.event_type == 'paste_attempt'),
                'similarity_flags': sum(1 for e in events if e.event_type == 'high_text_similarity'),
            }

            results.append({
                'student_id':            student.student_id or '',
                'status':                assignment.status,
                'assigned_set_label':    assignment.assigned_set_label or '',
                'total_score':           computed_total,
                'max_possible_score':    max_possible,
                'listening_marks':       component_marks['listening'],
                'speaking_marks':        component_marks['speaking'],
                'reading_marks':         component_marks['reading'],
                'writing_marks':         component_marks['writing'],
                'vocabulary_marks':      component_marks['vocabulary'],
                'component_max':         component_max,
                'grade':                 grade,
                'duration_minutes':      duration_minutes,
                'started_at':            assignment.started_at.isoformat() if assignment.started_at else None,
                'completed_at':          assignment.completed_at.isoformat() if assignment.completed_at else None,
                'malpractice_count':     len(events),
                'integrity_flags':       integrity_flags,
                # Pipeline submission info (used for Report column)
                'submission_id':         sub_data.get('submission_id'),
                'submission_status':     sub_data.get('submission_status'),
                # assignment id — needed for the Answers Preview endpoint
                'assignment_id':         str(assignment.id),
            })

        avg_score_val = summary_agg['avg_score']

        return JsonResponse({
            'test_id':            str(clap_test.test_id) if clap_test.test_id else str(clap_test.id),
            'test_name':          clap_test.name,
            'max_possible_score': max_possible,
            'component_max':      component_max,
            'summary': {
                'total_assigned': summary_agg['total_assigned'],
                'completed':      summary_agg['completed_count'],
                'started':        summary_agg['started_count'],
                'not_started':    summary_agg['not_started_count'],
                'average_score':  round(float(avg_score_val), 1) if avg_score_val is not None else None,
            },
            'results': results,
            'pagination': {
                'page':        page,
                'page_size':   page_size,
                'total_count': paginator.count,
                'total_pages': paginator.num_pages,
            },
        })

    except ValueError:
        return JsonResponse({'error': 'Invalid page or page_size parameter'}, status=400)
    except Exception as e:
        logger.error(f'Error fetching test results: {e}', exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)

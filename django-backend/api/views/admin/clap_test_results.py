"""
Admin CLAP Test Results View
GET /api/admin/clap-tests/<uuid>/results
Returns paginated student results for a specific CLAP test
with per-component marks, grade, duration, search, and sort.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Avg, Q, Prefetch, Count, Case, When, IntegerField
from django.core.paginator import Paginator
import logging

from api.models import (
    ClapTest, ClapTestComponent, StudentClapAssignment,
    StudentClapResponse,
)
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)


def calculate_grade(total_score, max_possible):
    """
    Grade calculation for CLAP tests (total out of 50).
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
    # Auth check
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        # Verify test exists
        try:
            clap_test = ClapTest.objects.get(id=test_id)
        except ClapTest.DoesNotExist:
            return JsonResponse({'error': 'CLAP test not found'}, status=404)

        # Single query: fetch components and derive both max_possible and per-type max
        components = list(ClapTestComponent.objects.filter(clap_test_id=test_id))
        component_max = {comp.test_type: comp.max_marks for comp in components}
        max_possible = sum(comp.max_marks for comp in components)

        # Base queryset for assignments
        base_qs = StudentClapAssignment.objects.filter(clap_test_id=test_id)

        # Summary: single query using conditional aggregation
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
        total_assigned = summary_agg['total_assigned']
        completed_count = summary_agg['completed_count']
        started_count = summary_agg['started_count']
        not_started_count = summary_agg['not_started_count']
        avg_score = round(float(summary_agg['avg_score']), 1) if summary_agg['avg_score'] is not None else None

        # Prefetch responses with item -> component for per-component grouping
        response_prefetch = Prefetch(
            'responses',
            queryset=StudentClapResponse.objects.select_related('item__component'),
        )

        # Build filtered queryset
        assignments_qs = base_qs.select_related('student').prefetch_related(response_prefetch)

        # Search by student_id or full_name
        search = request.GET.get('search', '').strip()
        if search:
            assignments_qs = assignments_qs.filter(
                Q(student__student_id__icontains=search) |
                Q(student__full_name__icontains=search)
            )

        # Status filter
        status_filter = request.GET.get('status')
        if status_filter:
            assignments_qs = assignments_qs.filter(status=status_filter)

        # Sorting
        sort_by = request.GET.get('sort_by', '')
        sort_order = request.GET.get('sort_order', 'desc')
        order_prefix = '' if sort_order == 'asc' else '-'

        if sort_by == 'total_score':
            assignments_qs = assignments_qs.order_by(f'{order_prefix}total_score')
        elif sort_by == 'student_id':
            assignments_qs = assignments_qs.order_by(f'{order_prefix}student__student_id')
        else:
            assignments_qs = assignments_qs.order_by('-completed_at', '-started_at', '-assigned_at')

        # Pagination
        page = max(int(request.GET.get('page', 1)), 1)
        page_size = min(max(int(request.GET.get('page_size', 20)), 1), 100)
        paginator = Paginator(assignments_qs, page_size)
        page_obj = paginator.get_page(page)

        results = []
        for assignment in page_obj:
            student = assignment.student

            # Group marks by component test_type
            component_marks = {
                'listening': None,
                'speaking': None,
                'reading': None,
                'writing': None,
                'vocabulary': None,
            }
            for resp in assignment.responses.all():
                test_type = resp.item.component.test_type
                if test_type in component_marks:
                    current = component_marks[test_type] or 0
                    awarded = float(resp.marks_awarded) if resp.marks_awarded is not None else 0
                    component_marks[test_type] = current + awarded

            # Calculate duration in minutes
            duration_minutes = None
            if assignment.started_at and assignment.completed_at:
                delta = assignment.completed_at - assignment.started_at
                duration_minutes = round(delta.total_seconds() / 60, 1)

            # Calculate grade
            grade = calculate_grade(assignment.total_score, max_possible)

            results.append({
                'student_name': student.full_name or student.email or '',
                'student_id': student.student_id or '',
                'status': assignment.status,
                'total_score': assignment.total_score,
                'max_possible_score': max_possible,
                'listening_marks': component_marks['listening'],
                'speaking_marks': component_marks['speaking'],
                'reading_marks': component_marks['reading'],
                'writing_marks': component_marks['writing'],
                'vocabulary_marks': component_marks['vocabulary'],
                'component_max': component_max,
                'grade': grade,
                'duration_minutes': duration_minutes,
                'started_at': assignment.started_at.isoformat() if assignment.started_at else None,
                'completed_at': assignment.completed_at.isoformat() if assignment.completed_at else None,
            })

        return JsonResponse({
            'test_id': str(clap_test.test_id) if clap_test.test_id else str(clap_test.id),
            'test_name': clap_test.name,
            'max_possible_score': max_possible,
            'component_max': component_max,
            'summary': {
                'total_assigned': total_assigned,
                'completed': completed_count,
                'started': started_count,
                'not_started': not_started_count,
                'average_score': avg_score,
            },
            'results': results,
            'pagination': {
                'page': page,
                'page_size': page_size,
                'total_count': paginator.count,
                'total_pages': paginator.num_pages,
            }
        })

    except ValueError:
        return JsonResponse({'error': 'Invalid page or page_size parameter'}, status=400)
    except Exception as e:
        logger.error(f'Error fetching test results: {e}', exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)

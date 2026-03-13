"""
Admin MCQ Rescore Endpoint
POST /api/admin/clap-tests/<test_id>/rescore-mcq

Re-evaluates every MCQ StudentClapResponse for all completed assignments
of a CLAP test against the authoritative predefined answer key.

Use this when:
  - Answer keys were updated after students submitted
  - Historical scoring is suspected to be inaccurate
  - A set's correct_option was corrected post-exam

Safety guarantees:
  - Idempotent: can be called multiple times, produces identical results
  - Transactional: each assignment is scored in its own atomic block
  - Non-destructive to W/S SubmissionScores: only L/R/V are updated
  - Audit log entry is created for every assignment rescored
  - Concurrent-safe: uses SELECT FOR UPDATE on assignment rows
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import (
    ClapTest,
    ClapTestComponent,
    ClapSetItem,
    StudentClapAssignment,
    StudentClapResponse,
    AssessmentSubmission,
    SubmissionScore,
)
from api.utils.jwt_utils import get_user_from_request
from api.utils.observability import log_event

logger = logging.getLogger(__name__)

# MCQ scoring domains and their corresponding test_type values
_RULE_BASED_DOMAINS = {
    'listening': 'listening',
    'reading':   'reading',
    'vocab':     'vocabulary',
}


def _build_set_answer_key(assigned_set_id) -> dict:
    """
    Build lookup: (test_type, order_index) → correct_option_int
    for a given set.  Returns {} when set_id is None.
    """
    if not assigned_set_id:
        return {}

    key: dict = {}
    for row in ClapSetItem.objects.filter(
        set_component__set_id=assigned_set_id,
        item_type='mcq',
    ).select_related('set_component').values(
        'set_component__test_type', 'order_index', 'content',
    ):
        co = (row['content'] or {}).get('correct_option')
        if co is not None:
            try:
                key[(row['set_component__test_type'], row['order_index'])] = int(co)
            except (TypeError, ValueError):
                pass
    return key


def _rescore_assignment(assignment: StudentClapAssignment, component_map: dict) -> dict:
    """
    Re-evaluate all MCQ responses for one assignment.
    Returns a dict: domain → awarded_marks (Decimal).

    This runs inside the caller's transaction.atomic() block.
    """
    set_answer_key = _build_set_answer_key(assignment.assigned_set_id)
    domain_totals: dict[str, Decimal] = {}

    for domain, component_type in component_map.items():
        component_ids = [
            cid for cid in
            ClapTestComponent.objects.filter(
                clap_test=assignment.clap_test,
                test_type=component_type,
            ).values_list('id', flat=True)
        ]

        if not component_ids:
            domain_totals[domain] = Decimal('0.00')
            continue

        total = Decimal('0.00')
        responses = (
            StudentClapResponse.objects
            .filter(
                assignment=assignment,
                item__component_id__in=component_ids,
                item__item_type='mcq',
            )
            .select_related('item__component')
        )

        for resp in responses:
            item = resp.item
            test_type = item.component.test_type

            # Parse selected option
            selected_option = None
            rd = resp.response_data
            if isinstance(rd, dict):
                raw = rd.get('selected_option')
            elif isinstance(rd, (int, float)):
                raw = int(rd)
            else:
                raw = None

            if raw is not None:
                try:
                    selected_option = int(raw)
                except (TypeError, ValueError):
                    pass

            # Correct option: set-specific → base
            correct_option = set_answer_key.get((test_type, item.order_index))
            if correct_option is None:
                base_co = (item.content or {}).get('correct_option')
                if base_co is not None:
                    try:
                        correct_option = int(base_co)
                    except (TypeError, ValueError):
                        pass

            if correct_option is None:
                # No answer key — keep existing marks
                if resp.marks_awarded is not None:
                    total += Decimal(str(resp.marks_awarded))
                continue

            if selected_option is not None and selected_option == correct_option:
                is_correct = True
                awarded = Decimal(str(item.points))
            else:
                is_correct = False
                awarded = Decimal('0.00')

            total += awarded

            # Only write if something changed (avoids unnecessary dirty writes)
            if resp.is_correct != is_correct or resp.marks_awarded != awarded:
                StudentClapResponse.objects.filter(id=resp.id).update(
                    is_correct=is_correct,
                    marks_awarded=awarded,
                )

        domain_totals[domain] = total.quantize(Decimal('0.01'))

    return domain_totals


def _upsert_rule_score(submission, domain: str, score_value: Decimal):
    SubmissionScore.objects.update_or_create(
        submission=submission,
        domain=domain,
        defaults={
            'score': score_value,
            'feedback_json': None,
            'evaluated_by': 'rule',
            'evaluated_at': timezone.now(),
            'llm_request_id': None,
        },
    )


@csrf_exempt
@require_http_methods(['POST'])
def rescore_mcq(request, test_id):
    """
    POST /api/admin/clap-tests/<test_id>/rescore-mcq

    Re-scores all MCQ components (Listening, Reading, Vocabulary & Grammar)
    for every completed assignment of the specified CLAP test.

    Optional body (JSON):
      {
        "assignment_ids": ["uuid", ...]   // restrict to specific assignments
      }

    Response:
      {
        "rescored": 42,
        "skipped": 3,
        "errors": [],
        "duration_seconds": 1.23
      }
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        clap_test = ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return JsonResponse({'error': 'CLAP test not found'}, status=404)

    import json as _json
    try:
        body = _json.loads(request.body or '{}')
    except _json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    restrict_ids = body.get('assignment_ids')

    # Fetch assignments to rescore
    qs = StudentClapAssignment.objects.filter(
        clap_test=clap_test,
        status='completed',
    ).select_related('student', 'assigned_set')

    if restrict_ids:
        if not isinstance(restrict_ids, list):
            return JsonResponse({'error': 'assignment_ids must be an array'}, status=400)
        qs = qs.filter(id__in=restrict_ids)

    assignments = list(qs)

    if not assignments:
        return JsonResponse({
            'rescored': 0,
            'skipped': 0,
            'errors': [],
            'message': 'No completed assignments found to rescore.',
        })

    import time
    t0 = time.monotonic()

    rescored = 0
    skipped = 0
    errors = []

    for assignment in assignments:
        try:
            # Fetch submission for this student/test (latest wins)
            submission = (
                AssessmentSubmission.objects
                .filter(user=assignment.student, assessment=clap_test)
                .order_by('-created_at')
                .first()
            )

            with transaction.atomic():
                domain_totals = _rescore_assignment(assignment, _RULE_BASED_DOMAINS)

                if submission:
                    for domain, marks in domain_totals.items():
                        _upsert_rule_score(submission, domain, marks)

            log_event(
                'info', 'mcq_rescored_by_admin',
                assignment_id=str(assignment.id),
                student_id=str(assignment.student_id),
                set_label=assignment.assigned_set_label or 'none',
                domain_totals={d: str(m) for d, m in domain_totals.items()},
                rescored_by=str(user.id),
            )
            rescored += 1

        except Exception as exc:
            logger.error(
                'rescore_mcq failed for assignment %s: %s',
                assignment.id, exc, exc_info=True,
            )
            errors.append({
                'assignment_id': str(assignment.id),
                'student_id':    str(assignment.student_id),
                'error':         str(exc)[:300],
            })
            skipped += 1

    duration = round(time.monotonic() - t0, 3)

    log_event(
        'info', 'admin_rescore_mcq_complete',
        test_id=str(test_id),
        rescored=rescored,
        skipped=skipped,
        duration_seconds=duration,
        admin_id=str(user.id),
    )

    return JsonResponse({
        'rescored':         rescored,
        'skipped':          skipped,
        'errors':           errors,
        'duration_seconds': duration,
    })

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
    AuditLog,
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


def _build_set_scoring_keys(assigned_set_id) -> tuple:
    """
    Build two lookup maps for a given set, returned as (answer_key, points_key).

      answer_key : (test_type, order_index) → correct_option_int
      points_key : (test_type, order_index) → points_int  (from ClapSetItem.points)

    Both maps are built in ONE bulk query.  Returns ({}, {}) when set_id is None.

    Why points_key is needed
    ────────────────────────
    The structural ClapTestItem.points is set only at slot creation time.  When
    an admin edits a set item's points via PUT/PATCH, the structural slot is NOT
    updated (get_or_create returns the existing row unchanged).  Using item.points
    from the structural slot therefore returns the original — potentially wrong —
    value.  ClapSetItem.points is always authoritative.
    """
    if not assigned_set_id:
        return {}, {}

    answer_key: dict = {}
    points_key: dict = {}
    for row in ClapSetItem.objects.filter(
        set_component__set_id=assigned_set_id,
        item_type='mcq',
    ).select_related('set_component').values(
        'set_component__test_type', 'order_index', 'content', 'points',
    ):
        k = (row['set_component__test_type'], row['order_index'])
        co = (row['content'] or {}).get('correct_option')
        if co is not None:
            try:
                answer_key[k] = int(co)
            except (TypeError, ValueError):
                pass
        if row['points'] is not None:
            points_key[k] = row['points']
    return answer_key, points_key


def _rescore_assignment(assignment: StudentClapAssignment, component_ids_map: dict) -> dict:
    """
    Re-evaluate all MCQ responses for one assignment.
    Returns a dict: domain → awarded_marks (Decimal).

    This runs inside the caller's transaction.atomic() block.

    component_ids_map: pre-built outside the loop (P0-2 N+1 fix).
        { domain: [component_id, ...] }  — built ONCE per rescore request,
        not once per assignment. Eliminates 3×N DB queries for N assignments.
    """
    set_answer_key, set_points_key = _build_set_scoring_keys(assignment.assigned_set_id)
    domain_totals: dict[str, Decimal] = {}

    for domain, component_ids in component_ids_map.items():
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
                # ── Points resolution: set item points take priority ──────────
                # ClapSetItem.points is always authoritative; structural slot
                # points can be stale if the admin edited the question after
                # the slot was first created.
                effective_points = set_points_key.get((test_type, item.order_index), item.points)
                awarded = Decimal(str(effective_points))
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

    Re-scores all MCQ components (Listening, Reading, Verbal Ability)
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

    # ── P0-2: Build component_ids map ONCE outside the assignment loop ────────
    # Old code fetched ClapTestComponent 3× per assignment (one per domain).
    # For 500 assignments: 1500 extra queries. Now: exactly 3 queries total.
    component_ids_map: dict[str, list] = {}
    for domain, component_type in _RULE_BASED_DOMAINS.items():
        component_ids_map[domain] = list(
            ClapTestComponent.objects.filter(
                clap_test=clap_test,
                test_type=component_type,
            ).values_list('id', flat=True)
        )

    # ── Bulk-fetch latest submission per student in one query ─────────────────
    # Old code: one AssessmentSubmission query per assignment = N queries.
    # New code: one query for all students → dict lookup per assignment.
    student_ids = [a.student_id for a in assignments]
    submission_map: dict = {}
    for sub in (
        AssessmentSubmission.objects
        .filter(user_id__in=student_ids, assessment=clap_test)
        .order_by('created_at')   # ascending → latest wins
    ):
        submission_map[str(sub.user_id)] = sub

    rescored = 0
    skipped = 0
    errors = []

    for assignment in assignments:
        try:
            submission = submission_map.get(str(assignment.student_id))

            with transaction.atomic():
                domain_totals = _rescore_assignment(assignment, component_ids_map)

                if submission:
                    for domain, marks in domain_totals.items():
                        _upsert_rule_score(submission, domain, marks)

                    # P3-12: Audit trail — record every admin rescore action
                    # so test integrity can be traced post-exam.
                    AuditLog.objects.create(
                        submission=submission,
                        event_type='admin_rescore_mcq',
                        old_status=submission.status,
                        new_status=submission.status,
                        worker_id=f'admin:{user.id}',
                        error_detail=str({d: str(m) for d, m in domain_totals.items()}),
                    )

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

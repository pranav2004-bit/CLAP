"""
Admin CLAP Test Assignment Views

assign_clap_test  — publishes a test using its EXISTING batch (never changes batch_id).
                    Batch is configured once via the Edit tab; Start/Stop never touches it.
                    Uses INCREMENTAL SYNC — NEVER deletes existing assignments so that
                    set distribution, completed attempts, and in-progress sessions are
                    always preserved across Start/Stop cycles.

unassign_clap_test — drafts the test, clears the live timer, preserves batch_id.
                     PRESERVES all StudentClapAssignment rows (including assigned_set_id)
                     so that re-starting the test keeps the distribution intact.

Why incremental sync instead of delete + recreate
──────────────────────────────────────────────────
The old code did:
    StudentClapAssignment.objects.filter(clap_test_id=test_id).delete()   # ← NUCLEAR
    StudentClapAssignment.objects.bulk_create([...no assigned_set_id...])

This wiped set distribution (assigned_set_id) every time the admin clicked
"Start Test".  Any of the following actions would silently reset all students
to "Unassigned":
  • Clicking "Start Test" a second time (e.g. to enrol a late student)
  • Stop Test → Start Test cycle
  • Admin session timeout → re-login → click Start

With incremental sync:
  • Existing assignments are NEVER deleted unless the student was removed from
    the batch AND has not yet started the test (safe to remove — no data loss).
  • New students (added to batch after initial start) get a fresh assignment row.
  • All existing fields — assigned_set_id, assigned_set_label, status,
    total_score, attempt_number, retest fields — are fully preserved.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
import logging

from api.models import ClapTest, User, StudentClapAssignment
from api.utils import error_response

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def assign_clap_test(request, test_id):
    """
    POST /api/admin/clap-tests/{id}/assign

    Publishes the CLAP test and incrementally syncs StudentClapAssignment rows
    with the test's already-configured batch.

    Batch is NEVER changed here — set via the Edit tab before clicking Start Test.

    Incremental sync rules (all inside a single atomic + select_for_update):
      1. Students IN batch but WITHOUT an assignment  → bulk_create (new enrolments)
      2. Students IN batch WITH an existing assignment → untouched (preserves
         assigned_set_id, status, scores, retest data — everything)
      3. Students NOT IN batch but WITH an assignment that is SAFE to remove
         (status='assigned', never started) → deleted (batch removals)
      4. Students NOT IN batch but WITH a live/completed assignment
         (status ∈ started | completed | expired) → LEFT INTACT with a warning
         log; admin must handle via the Results / Retest screen

    Concurrency safety
    ──────────────────
    SELECT FOR UPDATE on ClapTest serialises concurrent Start clicks from
    multiple admin sessions.  Only one runs at a time; the second operates on
    already-synced data (no-op bulk_create, no-op deletions).

    Returns 400 if no batch is configured on the test.
    """
    user = None
    try:
        from api.utils.jwt_utils import get_user_from_request
        user = get_user_from_request(request)
        if not user or user.role != 'admin':
            return JsonResponse({'error': 'Unauthorized'}, status=401)
    except Exception:
        pass  # jwt_utils import may vary; admin-only middleware handles auth

    try:
        with transaction.atomic():
            try:
                # Lock the row to serialise concurrent Start clicks
                test = ClapTest.objects.select_for_update().get(id=test_id)
            except ClapTest.DoesNotExist:
                return error_response('CLAP test not found', status=404)

            # Guard: batch must be configured via Edit tab before starting
            if not test.batch_id:
                return error_response(
                    'No batch assigned to this test. '
                    'Please configure a batch via the Edit tab first.',
                    status=400
                )

            # Publish the test — batch_id is intentionally NOT updated here
            ClapTest.objects.filter(id=test_id).update(
                status='published',
                updated_at=timezone.now()
            )

            # ── Load current batch students (active only) ──────────────────
            # is_active=True keeps this in sync with the batch page headcount.
            batch_students = list(
                User.objects.filter(
                    batch_id=test.batch_id, role='student', is_active=True
                ).values('id', 'email')
            )
            batch_student_ids = {str(s['id']) for s in batch_students}

            # ── Load existing assignments for this test (ALL statuses) ─────
            # select_for_update() ensures no concurrent mutation during sync.
            existing_assignments = {
                str(a.student_id): a
                for a in StudentClapAssignment.objects.select_for_update().filter(
                    clap_test_id=test_id
                )
            }
            existing_student_ids = set(existing_assignments.keys())

            # ── Rule 1: New enrolments — in batch, no assignment yet ───────
            new_student_ids = batch_student_ids - existing_student_ids
            new_assignments = [
                StudentClapAssignment(
                    student_id=sid,
                    clap_test_id=test_id,
                    # assigned_set_id intentionally omitted (NULL default) —
                    # admin will run distribute-sets to assign a set.
                    # All other fields use model defaults (status='assigned', etc.)
                )
                for sid in new_student_ids
            ]
            if new_assignments:
                # ignore_conflicts=True: race-safe for the unique_together
                # (student, clap_test) constraint.
                StudentClapAssignment.objects.bulk_create(
                    new_assignments, ignore_conflicts=True
                )
                logger.info(
                    'assign_clap_test: added %d new assignment(s) for test=%s batch=%s admin=%s',
                    len(new_assignments), test_id, test.batch_id,
                    user.email if user else 'unknown',
                )

            # ── Rule 3: Batch removals — NOT in batch, assignment exists ──
            # Only remove if status='assigned' (never started — no data loss).
            # Completed / started / expired rows are left intact; they hold
            # scores, submission data, and active sessions.
            removed_from_batch = existing_student_ids - batch_student_ids
            safe_to_remove = []
            skipped_active = []
            for sid in removed_from_batch:
                a = existing_assignments[sid]
                if a.status == 'assigned':
                    safe_to_remove.append(sid)
                else:
                    # Started, completed, or expired — do NOT delete
                    skipped_active.append(sid)

            if safe_to_remove:
                StudentClapAssignment.objects.filter(
                    clap_test_id=test_id,
                    student_id__in=safe_to_remove,
                    status='assigned',   # Double-check — never delete live data
                ).delete()
                logger.info(
                    'assign_clap_test: removed %d safe assignment(s) '
                    '(students no longer in batch) for test=%s admin=%s',
                    len(safe_to_remove), test_id,
                    user.email if user else 'unknown',
                )

            if skipped_active:
                logger.warning(
                    'assign_clap_test: %d student(s) removed from batch but kept '
                    'because their assignment is active/completed (test=%s). '
                    'Handle via Results / Retest screen. student_ids=%s',
                    len(skipped_active), test_id, skipped_active,
                )

            # Final headcount for the response (includes kept + new)
            final_count = StudentClapAssignment.objects.filter(
                clap_test_id=test_id
            ).count()

        logger.info(
            'assign_clap_test: test=%s batch=%s published. '
            'total_assignments=%d new=%d removed=%d skipped_active=%d admin=%s',
            test_id, test.batch_id, final_count,
            len(new_assignments), len(safe_to_remove), len(skipped_active),
            user.email if user else 'unknown',
        )

        return JsonResponse({
            'message': 'CLAP test published successfully',
            'batch_id': str(test.batch_id),
            'total_assignments': final_count,
            'new_assignments_added': len(new_assignments),
            'assignments_removed': len(safe_to_remove),
            'active_kept': len(skipped_active),
        })

    except Exception as error:
        logger.error(
            'assign_clap_test server error test_id=%s: %s', test_id, error, exc_info=True
        )
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )


@csrf_exempt
@require_http_methods(["POST"])
def unassign_clap_test(request, test_id):
    """
    POST /api/admin/clap-tests/{id}/unassign

    Stops the CLAP test (status → draft) and clears the live timer.

    PRESERVES all StudentClapAssignment rows.
    ──────────────────────────────────────────
    Previously this deleted all assignments, which meant:
      • Re-starting the test wiped the set distribution (assigned_set_id)
      • All in-progress/completed data was orphaned

    Now Stop Test only drafts the test — students can no longer see it in their
    portal (because the test status is 'draft', not 'published'), but all
    assignment data (set assignments, scores, attempt history) is retained.

    When admin clicks Start Test again, assign_clap_test uses incremental sync:
    • Existing assignments (with assigned_set_id) are untouched → distribution preserved
    • Only brand-new batch students get fresh assignment rows

    batch_id is NEVER cleared — preserved for the next Start.
    """
    user = None
    try:
        from api.utils.jwt_utils import get_user_from_request
        user = get_user_from_request(request)
        if not user or user.role != 'admin':
            return JsonResponse({'error': 'Unauthorized'}, status=401)
    except Exception:
        pass

    try:
        with transaction.atomic():
            try:
                test = ClapTest.objects.select_for_update().get(id=test_id)
            except ClapTest.DoesNotExist:
                return error_response('CLAP test not found', status=404)

            preserved_batch_id = str(test.batch_id) if test.batch_id else None

            # Draft the test — batch_id preserved, timer cleared atomically.
            # Assignments are intentionally NOT deleted — see module docstring.
            ClapTest.objects.filter(id=test_id).update(
                status='draft',
                global_deadline=None,       # clear live timer
                timer_extension_log=[],     # clear audit log for next session
                updated_at=timezone.now()
            )

            # Count existing assignments for the response (informational only)
            assignment_count = StudentClapAssignment.objects.filter(
                clap_test_id=test_id
            ).count()

        logger.info(
            'unassign_clap_test test_id=%s preserved_batch=%s '
            'assignments_preserved=%d admin=%s',
            test_id, preserved_batch_id, assignment_count,
            user.email if user else 'unknown',
        )

        return JsonResponse({
            'message': 'CLAP test stopped successfully',
            'preserved_batch_id': preserved_batch_id,
            # Renamed from 'assignments_removed' to 'assignments_preserved'
            # to reflect the new behaviour (data is kept, not deleted).
            'assignments_preserved': assignment_count,
        })

    except Exception as error:
        logger.error(
            'unassign_clap_test server error test_id=%s: %s', test_id, error, exc_info=True
        )
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )

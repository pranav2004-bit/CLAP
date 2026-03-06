"""
Admin CLAP Test Assignment Views

assign_clap_test  — publishes a test using its EXISTING batch (never changes batch_id).
                    Batch is configured once via the Edit tab; Start/Stop never touches it.
unassign_clap_test — drafts the test, clears the live timer, preserves batch_id.
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

    Publishes the CLAP test and (re-)creates StudentClapAssignment rows for
    every student in the test's already-configured batch.

    Batch is NEVER changed here — it is the admin's responsibility to set the
    batch via the Edit tab before clicking Start Test.  This guarantees that
    Start / Stop operations are idempotent with respect to batch ownership.

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
                # Lock the row to prevent concurrent start races
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

            # Recreate student assignments from the already-configured batch
            StudentClapAssignment.objects.filter(clap_test_id=test_id).delete()
            students = User.objects.filter(batch_id=test.batch_id, role='student')
            if students.exists():
                assignments = [
                    StudentClapAssignment(
                        student_id=student.id,
                        clap_test_id=test_id
                    )
                    for student in students
                ]
                StudentClapAssignment.objects.bulk_create(assignments, ignore_conflicts=True)
                logger.info(
                    'assign_clap_test test_id=%s batch_id=%s students_assigned=%d admin=%s',
                    test_id, test.batch_id, len(assignments),
                    user.email if user else 'unknown'
                )
            else:
                logger.warning(
                    'assign_clap_test test_id=%s batch_id=%s no_students_in_batch',
                    test_id, test.batch_id
                )

        return JsonResponse({
            'message': 'CLAP test published successfully',
            'batch_id': str(test.batch_id),
            'students_assigned': students.count() if students.exists() else 0,
        })

    except Exception as error:
        logger.error('assign_clap_test server error test_id=%s: %s', test_id, error, exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )


@csrf_exempt
@require_http_methods(["POST"])
def unassign_clap_test(request, test_id):
    """
    POST /api/admin/clap-tests/{id}/unassign

    Stops the CLAP test (status → draft), removes all active StudentClapAssignment
    rows, and atomically clears the live timer (global_deadline, timer_extension_log).

    batch_id is NEVER cleared — the batch assignment is preserved so the admin
    can click Start Test again without reconfiguring the batch.
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

            # Draft the test — batch_id preserved, timer cleared atomically
            ClapTest.objects.filter(id=test_id).update(
                status='draft',
                global_deadline=None,       # clear live timer
                timer_extension_log=[],     # clear audit log for next session
                updated_at=timezone.now()
            )

            # Remove active student access
            deleted_count, _ = StudentClapAssignment.objects.filter(
                clap_test_id=test_id
            ).delete()

        logger.info(
            'unassign_clap_test test_id=%s preserved_batch=%s assignments_removed=%d admin=%s',
            test_id, preserved_batch_id, deleted_count,
            user.email if user else 'unknown'
        )

        return JsonResponse({
            'message': 'CLAP test stopped successfully',
            'preserved_batch_id': preserved_batch_id,
            'assignments_removed': deleted_count,
        })

    except Exception as error:
        logger.error('unassign_clap_test server error test_id=%s: %s', test_id, error, exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )

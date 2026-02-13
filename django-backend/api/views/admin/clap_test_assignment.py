"""
Admin CLAP Test Assignment Views
Maintains exact behavior from Next.js app/api/admin/clap-tests/[id]/assign and unassign routes
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
import json
import logging

from api.models import ClapTest, User, StudentClapAssignment
from api.utils import error_response

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def assign_clap_test(request, test_id):
    """
    POST /api/admin/clap-tests/[id]/assign
    Assign CLAP test to a batch
    Matches Next.js POST function behavior
    """
    try:
        body = json.loads(request.body)
        batch_id = body.get('batch_id')
        
        if not batch_id:
            return error_response(
                'Batch ID is required for assignment',
                status=400
            )
        
        # Check if test exists
        try:
            existing_test = ClapTest.objects.get(id=test_id)
        except ClapTest.DoesNotExist:
            return error_response('CLAP test not found', status=404)
        
        with transaction.atomic():
            # Update the batch_id to assign the test and set status to published
            ClapTest.objects.filter(id=test_id).update(
                batch_id=batch_id,
                status='published',
                updated_at=timezone.now()
            )
            
            # Remove existing assignments
            StudentClapAssignment.objects.filter(clap_test_id=test_id).delete()
            
            # Add new assignments for the batch
            students = User.objects.filter(batch_id=batch_id, role='student')
            
            if students.exists():
                assignments = [
                    StudentClapAssignment(
                        student_id=student.id,
                        clap_test_id=test_id
                    )
                    for student in students
                ]
                StudentClapAssignment.objects.bulk_create(assignments, ignore_conflicts=True)
        
        return JsonResponse({
            'message': 'CLAP test assigned successfully',
            'assigned_to_batch': batch_id
        })
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )


@csrf_exempt
@require_http_methods(["POST"])
def unassign_clap_test(request, test_id):
    """
    POST /api/admin/clap-tests/[id]/unassign
    Remove batch assignment from CLAP test
    Matches Next.js POST function behavior
    """
    try:
        # Check if test exists
        try:
            existing_test = ClapTest.objects.get(id=test_id)
        except ClapTest.DoesNotExist:
            return error_response('CLAP test not found', status=404)
        
        previous_batch = str(existing_test.batch_id) if existing_test.batch_id else None
        
        with transaction.atomic():
            # Remove the batch assignment (set batch_id to null) and set status to draft
            ClapTest.objects.filter(id=test_id).update(
                batch_id=None,
                status='draft',
                updated_at=timezone.now()
            )
            
            # Remove all student assignments for this test
            StudentClapAssignment.objects.filter(clap_test_id=test_id).delete()
        
        return JsonResponse({
            'message': 'CLAP test unassigned successfully',
            'previous_batch': previous_batch
        })
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )

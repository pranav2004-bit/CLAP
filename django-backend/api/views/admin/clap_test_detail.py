"""
Admin CLAP Test Detail Views
Maintains exact behavior from Next.js app/api/admin/clap-tests/[id]/route.ts
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
import json
import logging

from api.models import ClapTest, ClapTestComponent, Batch, User, StudentClapAssignment
from api.utils import error_response

logger = logging.getLogger(__name__)


@csrf_exempt
def clap_test_detail_handler(request, test_id):
    """
    Combined handler for CLAP test detail operations
    Routes to appropriate function based on HTTP method
    """
    if request.method == 'GET':
        return get_clap_test(request, test_id)
    elif request.method == 'PATCH':
        return update_clap_test(request, test_id)
    elif request.method == 'DELETE':
        return delete_clap_test(request, test_id)
    else:
        return error_response('Method not allowed', status=405)


@csrf_exempt
def get_clap_test(request, test_id):
    """
    GET /api/admin/clap-tests/[id]
    Get single CLAP test with components and batch
    Matches Next.js GET function behavior
    """
    try:
        # Fetch CLAP test with related data
        try:
            clap_test = ClapTest.objects.select_related('batch').prefetch_related('components').get(id=test_id)
        except ClapTest.DoesNotExist:
            logger.error('Error fetching CLAP test: not found')
            return error_response('CLAP test not found', status=404)
        
        # Transform data
        transformed_test = {
            'id': str(clap_test.id),
            'name': clap_test.name,
            'batch_id': str(clap_test.batch_id) if clap_test.batch_id else None,
            'batch_name': clap_test.batch.batch_name if clap_test.batch else 'Unknown Batch',
            'status': clap_test.status,
            'is_assigned': bool(clap_test.batch_id),
            'created_at': clap_test.created_at.isoformat() if clap_test.created_at else None,
            'tests': [
                {
                    'id': str(comp.id),  # Return actual component UUID
                    'name': comp.title,
                    'type': comp.test_type,
                    'status': comp.status,
                    'duration': comp.duration_minutes,
                    'max_marks': comp.max_marks
                }
                for comp in clap_test.components.all()
            ]
        }
        
        return JsonResponse({'clapTest': transformed_test})
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response('Internal server error', status=500)


@csrf_exempt
def update_clap_test(request, test_id):
    """
    PATCH /api/admin/clap-tests/[id]
    Update CLAP test name or batch assignment
    Matches Next.js PATCH function behavior
    """
    try:
        body = json.loads(request.body)
        name = body.get('name')
        batch_id = body.get('batch_id')
        status = body.get('status')
        
        # Validate input
        if not name and not batch_id and not status:
            return error_response(
                'Test name, batch_id, or status is required',
                status=400
            )
        
        # Check if test exists
        try:
            existing_test = ClapTest.objects.get(id=test_id)
        except ClapTest.DoesNotExist:
            return error_response('CLAP test not found', status=404)
        
        # Prepare update data
        update_data = {'updated_at': timezone.now()}
        if name:
            update_data['name'] = name
        if batch_id:
            update_data['batch_id'] = batch_id
        if 'status' in body:
            update_data['status'] = body.get('status')
        
        # Update the test
        ClapTest.objects.filter(id=test_id).update(**update_data)
        
        # If batch was changed, update student assignments
        if batch_id and batch_id != str(existing_test.batch_id):
            with transaction.atomic():
                # Remove old assignments
                StudentClapAssignment.objects.filter(clap_test_id=test_id).delete()
                
                # Add new assignments for the new batch
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
        
        # Fetch updated test
        updated_test = ClapTest.objects.select_related('batch').get(id=test_id)
        
        test_data = {
            'id': str(updated_test.id),
            'name': updated_test.name,
            'batch_id': str(updated_test.batch_id) if updated_test.batch_id else None,
            'status': updated_test.status,
            'created_at': updated_test.created_at.isoformat() if updated_test.created_at else None,
            'updated_at': updated_test.updated_at.isoformat() if updated_test.updated_at else None
        }
        
        return JsonResponse({
            'message': 'CLAP test updated successfully',
            'clapTest': test_data
        })
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )


@csrf_exempt
def delete_clap_test(request, test_id):
    """
    DELETE /api/admin/clap-tests/[id]
    Soft delete CLAP test (preserves all data)
    Matches Next.js DELETE function behavior
    """
    try:
        # Check if test exists
        try:
            existing_test = ClapTest.objects.get(id=test_id)
        except ClapTest.DoesNotExist:
            return error_response('CLAP test not found', status=404)
        
        # Soft delete in a transaction
        with transaction.atomic():
            # Soft delete: Update status to 'deleted'
            ClapTest.objects.filter(id=test_id).update(
                status='deleted',
                updated_at=timezone.now()
            )
            
            # Update student assignments to mark them as from deleted test
            StudentClapAssignment.objects.filter(
                clap_test_id=test_id,
                status__in=['assigned', 'started']
            ).update(status='test_deleted')
        
        return JsonResponse({
            'message': 'CLAP test deleted successfully',
            'preserved_data': {
                'student_results': 'preserved',
                'test_components': 'preserved',
                'assignments': 'marked_as_inactive'
            }
        })
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )

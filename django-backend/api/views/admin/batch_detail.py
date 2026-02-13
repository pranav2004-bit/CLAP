"""
Admin Batch Detail Views
Maintains exact behavior from Next.js app/api/admin/batches/[id]/route.ts
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
import logging

from api.models import Batch, User
from api.utils import success_response, error_response

logger = logging.getLogger(__name__)


@csrf_exempt
def batch_detail_handler(request, batch_id):
    """
    Combined handler for batch detail operations
    Routes to appropriate function based on HTTP method
    """
    if request.method == 'PATCH':
        return toggle_batch_status(request, batch_id)
    elif request.method == 'DELETE':
        return hard_delete_batch(request, batch_id)
    elif request.method == 'GET':
        # This shouldn't happen as GET goes to /students endpoint
        return error_response('Method not allowed', status=405)
    else:
        return error_response('Method not allowed', status=405)


@csrf_exempt
def toggle_batch_status(request, batch_id):
    """
    PATCH /api/admin/batches/[id]
    Soft delete/restore batch by toggling is_active
    
    IMPORTANT BEHAVIOR:
    - When deleting (is_active=False): Deactivates all student accounts in the batch
    - When restoring (is_active=True): Reactivates all student accounts in the batch
    - All historical data (tests, scores, reports) is PRESERVED in database
    - Students cannot login when batch is deleted, but all their data remains intact
    """
    try:
        logger.info('PATCH /api/admin/batches/:id called')
        
        body = json.loads(request.body)
        logger.info(f'Request body: {body}')
        logger.info(f'Batch ID: {batch_id}')
        
        is_active = body.get('is_active')
        
        # Validate is_active is boolean
        if not isinstance(is_active, bool):
            logger.info('Invalid is_active value')
            return error_response(
                'is_active must be a boolean value',
                status=400
            )
        
        # Update batch
        updated_count = Batch.objects.filter(id=batch_id).update(is_active=is_active)
        
        if updated_count == 0:
            logger.error('Database error: Batch not found')
            return error_response('Failed to update batch', status=400)
        
        # CRITICAL: Update all students in this batch
        # When batch is deleted (is_active=False), deactivate all student accounts
        # When batch is restored (is_active=True), reactivate all student accounts
        # This prevents deleted batch students from logging in
        # All historical data (tests, scores, reports, assignments) is preserved
        students_updated = User.objects.filter(
            batch_id=batch_id,
            role='student'
        ).update(is_active=is_active)
        
        logger.info(f'Updated {students_updated} student accounts to is_active={is_active}')
        
        # Fetch updated batch
        batch = Batch.objects.get(id=batch_id)
        
        batch_data = {
            'id': str(batch.id),
            'batch_name': batch.batch_name,
            'start_year': batch.start_year,
            'end_year': batch.end_year,
            'is_active': batch.is_active,
            'created_at': batch.created_at.isoformat(),
            'updated_at': batch.updated_at.isoformat()
        }
        
        logger.info(f'Batch updated successfully: {batch_data}')
        action = 'restored' if is_active else 'deleted'
        student_action = 'reactivated' if is_active else 'deactivated'
        
        return JsonResponse({
            'message': f'Batch {action} successfully. {students_updated} student accounts {student_action}.',
            'batch': batch_data,
            'students_affected': students_updated
        })
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )


@csrf_exempt
def hard_delete_batch(request, batch_id):
    """
    DELETE /api/admin/batches/[id]
    Hard delete batch (actual deletion)
    Checks for students first - prevents deletion if students exist
    Matches Next.js DELETE function behavior
    """
    try:
        logger.info('DELETE /api/admin/batches/:id called')
        
        # First check if batch has students
        students_in_batch = User.objects.filter(
            batch_id=batch_id
        ).values('id')[:1]
        
        if students_in_batch:
            return error_response(
                'Cannot delete batch with existing students. Please reassign or delete students first.',
                status=400
            )
        
        # Delete the batch
        deleted_count, _ = Batch.objects.filter(id=batch_id).delete()
        
        if deleted_count == 0:
            logger.error('Database error: Batch not found')
            return error_response('Failed to delete batch', status=400)
        
        logger.info('Batch deleted successfully')
        return JsonResponse({'message': 'Batch deleted successfully'})
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Internal server error',
            status=500
        )


@csrf_exempt
def get_batch_students(request, batch_id):
    """
    GET /api/admin/batches/[id]/students
    Get all students in a specific batch
    Matches Next.js behavior
    """
    try:
        search = request.GET.get('search', '')
        
        # Build query
        query = User.objects.filter(
            role='student',
            batch_id=batch_id
        ).select_related('batch')
        
        # Apply search filter if provided
        if search:
            query = query.filter(student_id__icontains=search)
        
        students = query.order_by('-created_at')
        
        # Transform data
        students_data = []
        for student in students:
            student_dict = {
                'id': str(student.id),
                'email': student.email,
                'role': student.role,
                'full_name': student.full_name,
                'username': student.username,
                'student_id': student.student_id,
                'is_active': student.is_active,
                'profile_completed': student.profile_completed,
                'batch_id': str(student.batch_id) if student.batch_id else None,
                'created_at': student.created_at.isoformat(),
                'batches': {
                    'id': str(student.batch.id),
                    'batch_name': student.batch.batch_name
                } if student.batch else None
            }
            students_data.append(student_dict)
        
        return JsonResponse({'students': students_data})
        
    except Exception as error:
        logger.error(f'Server error: {error}', exc_info=True)
        return error_response('Internal server error', status=500)

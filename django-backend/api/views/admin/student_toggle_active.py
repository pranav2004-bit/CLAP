"""
Student Toggle Active Status Endpoint
Handles enabling/disabling student accounts
"""

import json
import logging
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from api.models import User
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)


def success_response(message, data=None, status=200):
    """Standard success response"""
    response = {'message': message}
    if data:
        response.update(data)
    return JsonResponse(response, status=status)


def error_response(error, status=400):
    """Standard error response"""
    return JsonResponse({'error': error}, status=status)


def _require_admin(request):
    """Verify the request comes from an admin user."""
    admin_user = get_user_from_request(request)
    if not admin_user or admin_user.role != 'admin':
        return None, error_response('Unauthorized', status=401)
    return admin_user, None


@csrf_exempt
@require_http_methods(["PATCH"])
def toggle_student_active(request, student_id):
    """
    PATCH /api/admin/students/<student_id>/toggle-active

    Toggles the is_active status of a student account.
    - Active → Inactive (disable account)
    - Inactive → Active (enable account)

    Returns the updated student data.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err
    try:
        logger.info(f'Toggle active status for student: {student_id}')
        
        # Find the student
        try:
            student = User.objects.get(id=student_id, role='student')
        except User.DoesNotExist:
            logger.warning(f'Student not found: {student_id}')
            return error_response('Student not found', status=404)
        
        # Check if student is deleted
        if student.student_id.startswith('DELETED_'):
            logger.warning(f'Cannot toggle deleted student: {student_id}')
            return error_response('Cannot toggle status of deleted student', status=400)
        
        # Toggle the is_active status
        student.is_active = not student.is_active
        student.save()
        
        action = 'enabled' if student.is_active else 'disabled'
        logger.info(f'Student {student.student_id} {action} successfully')
        
        # Return updated student data
        student_data = {
            'id': str(student.id),
            'email': student.email,
            'student_id': student.student_id,
            'full_name': student.full_name,
            'is_active': student.is_active,
            'profile_completed': student.profile_completed,
            'batch': {
                'id': str(student.batch.id),
                'batch_name': student.batch.batch_name,
                'start_year': student.batch.start_year,
                'end_year': student.batch.end_year
            } if student.batch else None,
            'created_at': student.created_at.isoformat()
        }
        
        return success_response(
            f'Student account {action} successfully',
            {'student': student_data}
        )
        
    except Exception as e:
        logger.error(f'Error toggling student active status: {str(e)}', exc_info=True)
        return error_response(f'Failed to toggle student status: {str(e)}', status=500)

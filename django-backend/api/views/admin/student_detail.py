"""
Admin Student Detail Views
Maintains exact behavior from Next.js app/api/admin/students/[id]/route.ts

STUDENT STATES:
1. ACTIVE: is_active=True, normal student_id - Can login, visible
2. INACTIVE: is_active=False, normal student_id - Cannot login, visible, can be re-enabled
3. DELETED: is_active=False, student_id="DELETED_xxx" - Cannot login, hidden, data preserved

DELETE is permanent (no restoration). Creates new account if same student_id is used.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import logging
import uuid

from api.models import User
from api.utils import success_response, error_response
from api.utils.auth import require_admin as _require_admin

logger = logging.getLogger(__name__)


@csrf_exempt
def student_detail_handler(request, student_id):
    """
    Combined handler for student detail operations
    Routes to appropriate function based on HTTP method
    """
    admin_user, err = _require_admin(request)
    if err:
        return err
    if request.method == 'GET':
        return get_student(request, student_id)
    elif request.method == 'PUT':
        return update_student(request, student_id)
    elif request.method == 'PATCH':
        return toggle_student_status(request, student_id)
    elif request.method == 'DELETE':
        return delete_student(request, student_id)
    else:
        return error_response('Method not allowed', status=405)


@csrf_exempt
def get_student(request, student_id):
    """
    GET /api/admin/students/[id]
    Matches Next.js GET function behavior
    """
    try:
        student = User.objects.filter(id=student_id, role='student').first()
        
        if not student:
            return error_response('Student not found', status=404)
        
        student_data = {
            'id': str(student.id),
            'email': student.email,
            'role': student.role,
            'full_name': student.full_name,
            'username': student.username,
            'student_id': student.student_id,
            'is_active': student.is_active,
            'profile_completed': student.profile_completed,
            'batch_id': str(student.batch_id) if student.batch_id else None,
            'created_at': student.created_at.isoformat()
        }
        
        return JsonResponse({'student': student_data})
        
    except Exception as error:
        logger.error(f'Error fetching student: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Failed to fetch student', status=500)


@csrf_exempt
def update_student(request, student_id):
    """
    PUT /api/admin/students/[id]
    Updates student details (name, email, etc.)
    """
    try:
        body = json.loads(request.body)
        full_name = body.get('full_name')
        email = body.get('email')
        student_id_field = body.get('student_id')
        
        # Build update data
        update_data = {}
        if full_name:
            update_data['full_name'] = full_name
        if email:
            update_data['email'] = email
        if student_id_field:
            update_data['student_id'] = student_id_field
        
        # Update student
        updated_count = User.objects.filter(
            id=student_id,
            role='student'
        ).update(**update_data)
        
        if updated_count == 0:
            return error_response('Student not found', status=404)
        
        # Fetch updated student
        student = User.objects.get(id=student_id)
        
        student_data = {
            'id': str(student.id),
            'email': student.email,
            'role': student.role,
            'full_name': student.full_name,
            'username': student.username,
            'student_id': student.student_id,
            'is_active': student.is_active,
            'profile_completed': student.profile_completed,
            'batch_id': str(student.batch_id) if student.batch_id else None,
            'created_at': student.created_at.isoformat()
        }
        
        return JsonResponse({'student': student_data})
        
    except Exception as error:
        logger.error(f'Error updating student: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Failed to update student', status=500)


@csrf_exempt
def toggle_student_status(request, student_id):
    """
    PATCH /api/admin/students/[id]
    Toggles student active/inactive status (NOT delete)
    
    - Active → Inactive: Student cannot login but remains visible
    - Inactive → Active: Student can login again
    
    This is for temporary deactivation, not deletion.
    """
    try:
        body = json.loads(request.body)
        is_active = body.get('is_active')
        
        if not isinstance(is_active, bool):
            return error_response('is_active must be a boolean', status=400)
        
        # Update student status
        updated_count = User.objects.filter(
            id=student_id,
            role='student'
        ).update(is_active=is_active)
        
        if updated_count == 0:
            return error_response('Student not found', status=404)
        
        # Fetch updated student
        student = User.objects.get(id=student_id)
        
        student_data = {
            'id': str(student.id),
            'email': student.email,
            'role': student.role,
            'full_name': student.full_name,
            'username': student.username,
            'student_id': student.student_id,
            'is_active': student.is_active,
            'profile_completed': student.profile_completed,
            'batch_id': str(student.batch_id) if student.batch_id else None,
            'created_at': student.created_at.isoformat()
        }
        
        action = 'activated' if is_active else 'deactivated'
        logger.info(f'Student {action}: {student.student_id}')
        
        return JsonResponse({
            'message': f'Student {action} successfully',
            'student': student_data
        })
        
    except Exception as error:
        logger.error(f'Error toggling student status: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Failed to update student status', status=500)


@csrf_exempt
def delete_student(request, student_id):
    """
    DELETE /api/admin/students/[id]
    
    PERMANENT DELETE - Hides student from interface
    
    IMPORTANT BEHAVIOR:
    - Student record is PRESERVED in database (all data intact)
    - Student_id is prefixed with "DELETED_" + unique hash
    - is_active is set to False (cannot login)
    - Student is HIDDEN from interface (list excludes DELETED_ prefix)
    - All historical data PRESERVED (tests, scores, reports)
    - NO RESTORATION - If same student_id is created, it's a NEW account
    
    Example:
    - Original: student_id="STU001"
    - After delete: student_id="DELETED_STU001_a1b2c3d4"
    - New student can use "STU001" (creates fresh account)
    """
    try:
        logger.info(f'Deleting student: {student_id}')
        
        # Get student
        student = User.objects.filter(
            id=student_id,
            role='student'
        ).first()
        
        if not student:
            logger.error(f'Student not found: {student_id}')
            return error_response('Student not found', status=404)
        
        original_student_id = student.student_id
        
        # Mark as deleted by prefixing student_id with "DELETED_" + unique hash
        # This allows the original student_id to be reused for a NEW account
        unique_hash = uuid.uuid4().hex[:8]
        deleted_student_id = f"DELETED_{original_student_id}_{unique_hash}"
        
        # Update student
        student.student_id = deleted_student_id
        student.is_active = False
        student.save()
        
        logger.info(f'Student deleted successfully: {original_student_id} → {deleted_student_id}')
        logger.info('Student data preserved in database, hidden from interface')
        logger.info(f'Original student_id "{original_student_id}" is now available for new accounts')
        
        return JsonResponse({
            'message': 'Student account deleted successfully',
            'note': f'All historical data preserved. Student ID "{original_student_id}" can be reused for new accounts.'
        })
        
    except Exception as error:
        logger.error(f'Error deleting student: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Failed to delete student', status=500)

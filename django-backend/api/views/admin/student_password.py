"""
Admin Student Password Reset View
Maintains exact behavior from Next.js app/api/admin/students/[id]/reset-password/route.ts
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
import logging
import bcrypt

from api.models import User
from api.utils import error_response
from api.utils.auth import require_admin_or_sub_admin as _require_admin

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def reset_student_password(request, student_id):
    """
    POST /api/admin/students/[id]/reset-password
    Reset student password to default (CLAP@123)
    Matches Next.js POST function behavior
    """
    admin_user, err = _require_admin(request)
    if err:
        return err
    try:
        # Hash default password
        default_password = settings.DEFAULT_PASSWORD
        password_hash = bcrypt.hashpw(
            default_password.encode('utf-8'),
            bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
        ).decode('utf-8')
        
        # Update student password
        updated_count = User.objects.filter(
            id=student_id,
            role='student'
        ).update(password_hash=password_hash)
        
        if updated_count == 0:
            raise Exception('Student not found')
        
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
        
        return JsonResponse({
            'message': 'Password reset successfully',
            'student': student_data
        })
        
    except Exception as error:
        logger.error(f'Error resetting password: {error}', exc_info=True)
        return error_response('Failed to reset password', status=500)

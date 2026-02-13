"""
Student Portal Views
Maintains exact behavior from Next.js app/api/student/* routes
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import json
import logging
import bcrypt

from api.models import User
from api.utils import error_response
from django.conf import settings

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def get_student_profile(request):
    """
    GET /api/student/profile
    Get student's own profile
    Matches Next.js GET function behavior
    """
    try:
        user_id = request.headers.get('x-user-id')
        
        if not user_id:
            return error_response('User ID required', status=401)
        
        try:
            profile = User.objects.get(id=user_id, role='student')
        except User.DoesNotExist:
            raise Exception('Student not found')
        
        profile_data = {
            'id': str(profile.id),
            'full_name': profile.full_name,
            'email': profile.email,
            'username': profile.username,
            'student_id': profile.student_id,
            'profile_completed': profile.profile_completed,
            'is_active': profile.is_active
        }
        
        return JsonResponse({'profile': profile_data})
        
    except Exception as error:
        logger.error(f'Error fetching profile: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Failed to fetch profile',
            status=500
        )


@csrf_exempt
@require_http_methods(["PUT"])
def update_student_profile(request):
    """
    PUT /api/student/profile
    Update student's own profile
    Matches Next.js PUT function behavior
    """
    try:
        user_id = request.headers.get('x-user-id')
        body = json.loads(request.body)
        username = body.get('username')
        email = body.get('email')
        
        if not user_id:
            return error_response('User ID required', status=401)
        
        # Check if username is already taken
        if username:
            existing_user = User.objects.filter(
                username=username
            ).exclude(id=user_id).first()
            
            if existing_user:
                return error_response('Username already taken', status=400)
        
        # Prepare update data
        update_data = {}
        if username:
            update_data['username'] = username
        if email:
            update_data['email'] = email
        
        # Mark profile as completed if username and email are provided
        if username and email:
            update_data['profile_completed'] = True
        
        # Update profile
        User.objects.filter(id=user_id, role='student').update(**update_data)
        
        # Fetch updated profile
        profile = User.objects.get(id=user_id)
        
        profile_data = {
            'id': str(profile.id),
            'full_name': profile.full_name,
            'email': profile.email,
            'username': profile.username,
            'student_id': profile.student_id,
            'profile_completed': profile.profile_completed,
            'is_active': profile.is_active
        }
        
        return JsonResponse({'profile': profile_data})
        
    except Exception as error:
        logger.error(f'Error updating profile: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Failed to update profile',
            status=500
        )


@csrf_exempt
@require_http_methods(["POST"])
def change_student_password(request):
    """
    POST /api/student/change-password
    Student changes their own password
    Matches Next.js POST function behavior
    """
    try:
        user_id = request.headers.get('x-user-id')
        body = json.loads(request.body)
        current_password = body.get('currentPassword')
        new_password = body.get('newPassword')
        
        if not user_id:
            return error_response('User ID required', status=401)
        
        if not current_password or not new_password:
            return error_response(
                'Current password and new password are required',
                status=400
            )
        
        # Get current user with password hash
        try:
            user = User.objects.get(id=user_id, role='student')
        except User.DoesNotExist:
            raise Exception('Student not found')
        
        # Verify current password
        is_valid_password = bcrypt.checkpw(
            current_password.encode('utf-8'),
            user.password_hash.encode('utf-8')
        )
        
        if not is_valid_password:
            return error_response('Current password is incorrect', status=400)
        
        # Hash new password
        new_password_hash = bcrypt.hashpw(
            new_password.encode('utf-8'),
            bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
        ).decode('utf-8')
        
        # Update password
        User.objects.filter(id=user_id).update(
            password_hash=new_password_hash
        )
        
        # Fetch updated user
        updated_user = User.objects.get(id=user_id)
        
        user_data = {
            'id': str(updated_user.id),
            'full_name': updated_user.full_name,
            'email': updated_user.email,
            'username': updated_user.username,
            'student_id': updated_user.student_id
        }
        
        return JsonResponse({
            'message': 'Password changed successfully',
            'user': user_data
        })
        
    except Exception as error:
        logger.error(f'Error changing password: {error}', exc_info=True)
        return error_response(
            str(error) if str(error) else 'Failed to change password',
            status=500
        )
@csrf_exempt
def student_profile_handler(request):
    """
    Dispatcher for /api/student/profile
    Handles GET and PUT requests
    """
    if request.method == 'GET':
        return get_student_profile(request)
    elif request.method == 'PUT':
        return update_student_profile(request)
    else:
        return error_response('Method not allowed', status=405)

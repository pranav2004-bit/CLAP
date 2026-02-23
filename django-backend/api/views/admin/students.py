"""
Admin Student Management Views
Maintains exact behavior from Next.js app/api/admin/students/route.ts

IMPORTANT STUDENT STATES:
1. ACTIVE (is_active=True, normal student_id): Visible, can login
2. INACTIVE (is_active=False, normal student_id): Visible, cannot login, can be re-enabled
3. DELETED (is_active=False, student_id starts with "DELETED_"): Hidden, cannot login, data preserved

DELETED students are NOT restored. Creating a new student with same ID creates a fresh account.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.conf import settings
import json
import logging
import bcrypt

from api.models import User, Batch
from api.utils import success_response, error_response
from api.utils.auth import require_admin as _require_admin

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def list_students(request):
    """
    GET /api/admin/students

    Returns ACTIVE and INACTIVE students (not DELETED)
    - Active students: is_active=True, can login
    - Inactive students: is_active=False, cannot login, can be re-enabled
    - Deleted students: Hidden (student_id starts with "DELETED_"), data preserved
    """
    admin_user, err = _require_admin(request)
    if err:
        return err
    try:
        search = request.GET.get('search', '')
        status = request.GET.get('status', '')
        batch_id = request.GET.get('batch_id', '')
        
        # Show ACTIVE and INACTIVE students (exclude DELETED)
        # Deleted students have student_id starting with "DELETED_"
        query = User.objects.filter(
            role='student'
        ).exclude(
            student_id__startswith='DELETED_'  # Hide deleted students
        ).select_related('batch')
        
        if search:
            # Match Next.js OR query with ilike
            query = query.filter(
                Q(full_name__icontains=search) |
                Q(email__icontains=search) |
                Q(student_id__icontains=search)
            )
        
        if status:
            # Filter by active/inactive status
            query = query.filter(is_active=(status == 'active'))
        
        if batch_id:
            # Filter by batch
            query = query.filter(batch_id=batch_id)
        
        students = query.order_by('-created_at')
        
        # Transform data to match Next.js response structure
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
                'created_at': student.created_at.isoformat() if student.created_at else None,
                'batches': {
                    'id': str(student.batch.id),
                    'batch_name': student.batch.batch_name
                } if student.batch else None
            }
            students_data.append(student_dict)
        
        return JsonResponse({'students': students_data})
        
    except Exception as error:
        logger.error(f'Error fetching students: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Failed to fetch students', status=500)


@csrf_exempt
@require_http_methods(["POST"])
def create_student(request):
    """
    POST /api/admin/students

    Creates a NEW student account OR restores a deleted one.
    - If student_id already exists (active or inactive): Returns error
    - If student_id exists but is deleted: RESTORES the deleted account
    - If student_id doesn't exist: Creates new account

    IMPORTANT: Deleted students are RESTORED instead of creating duplicates.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err
    try:
        body = json.loads(request.body)
        logger.info(f'Received student creation request: {body}')
        
        student_id = body.get('student_id')
        batch_id = body.get('batch_id')
        
        if not student_id:
            logger.info('Missing student_id')
            return error_response('Student ID is required', status=400)
        
        # Check if student_id already exists (excluding deleted ones)
        existing_active_student = User.objects.filter(
            student_id=student_id
        ).exclude(
            student_id__startswith='DELETED_'  # Ignore deleted students
        ).first()
        
        if existing_active_student:
            # Student ID already in use (active or inactive)
            logger.info(f'Student ID already exists: {student_id}')
            return error_response(f'Student ID "{student_id}" already exists. Please use a different ID.', status=400)
        
        # Check if this student was previously deleted
        deleted_student = User.objects.filter(
            student_id__startswith=f'DELETED_{student_id}_'
        ).first()
        
        if deleted_student:
            # RESTORE the deleted student
            logger.info(f'Restoring deleted student: {student_id}')
            
            # Restore the student by removing DELETED_ prefix
            deleted_student.student_id = student_id
            deleted_student.is_active = True
            deleted_student.profile_completed = False
            
            # Update batch if provided
            if batch_id:
                deleted_student.batch_id = batch_id
            
            # Reset password to default
            default_password = settings.DEFAULT_PASSWORD
            password_hash = bcrypt.hashpw(
                default_password.encode('utf-8'),
                bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
            ).decode('utf-8')
            deleted_student.password_hash = password_hash
            
            deleted_student.save()
            
            student_data = {
                'id': str(deleted_student.id),
                'email': deleted_student.email,
                'student_id': deleted_student.student_id,
                'role': deleted_student.role,
                'is_active': deleted_student.is_active,
                'profile_completed': deleted_student.profile_completed,
                'batch_id': str(deleted_student.batch_id) if deleted_student.batch_id else None,
                'created_at': deleted_student.created_at.isoformat() if deleted_student.created_at else None,
                'restored': True  # Flag to indicate this was a restoration
            }
            
            logger.info(f'Student restored successfully: {student_data}')
            return JsonResponse({
                'student': student_data,
                'message': f'Student "{student_id}" was previously deleted and has been restored with password CLAP@123'
            }, status=201)
        
        # Student ID is available - create NEW student account
        
        # Hash default password - match Next.js bcrypt behavior
        default_password = settings.DEFAULT_PASSWORD
        password_hash = bcrypt.hashpw(
            default_password.encode('utf-8'),
            bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
        ).decode('utf-8')
        
        # Generate dummy email based on student_id
        dummy_email = f'{student_id}@clap-student.local'
        
        # Prepare insert data
        insert_data = {
            'email': dummy_email,
            'student_id': student_id,
            'password_hash': password_hash,
            'role': 'student',
            'is_active': True,
            'profile_completed': False
        }
        
        # Add batch_id if provided
        if batch_id:
            insert_data['batch_id'] = batch_id
        
        logger.info(f'Inserting student data: {insert_data}')
        
        # Create student
        student = User.objects.create(**insert_data)
        
        student_data = {
            'id': str(student.id),
            'email': student.email,
            'student_id': student.student_id,
            'role': student.role,
            'is_active': student.is_active,
            'profile_completed': student.profile_completed,
            'batch_id': str(student.batch_id) if student.batch_id else None,
            'created_at': student.created_at.isoformat() if student.created_at else None,
            'restored': False
        }
        
        logger.info(f'Student created successfully: {student_data}')
        return JsonResponse({
            'student': student_data,
            'message': f'Student "{student_id}" created successfully with password CLAP@123'
        }, status=201)
        
    except Exception as error:
        logger.error(f'Error creating student: {error}', exc_info=True)
        return error_response(str(error) if str(error) else 'Failed to create student', status=500)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def students_handler(request):
    """
    Combined handler for GET and POST requests to /api/admin/students
    Routes to appropriate function based on request method
    """
    if request.method == "GET":
        return list_students(request)
    elif request.method == "POST":
        return create_student(request)

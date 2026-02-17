"""
Audio Upload Views
Handles audio recording submission and retrieval for CLAP tests
"""

import os
from datetime import datetime
from django.http import JsonResponse, FileResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
import logging

from api.models import (
    StudentClapAssignment, ClapTestItem,
    StudentAudioResponse, StudentClapResponse
)
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def submit_audio_response(request, assignment_id):
    """
    Submit audio recording for a test item
    Validates: auth, file format, size, test session ownership

    POST /api/student/clap-assignments/{assignment_id}/submit-audio

    Form data:
    - audio: File (required)
    - item_id: UUID (required)
    - duration: Float (required, seconds)
    - mime_type: String (required)
    """
    # 1. Authentication
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    # 2. Validate assignment ownership
    try:
        assignment = StudentClapAssignment.objects.get(
            id=assignment_id,
            student=user
        )
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    # 3. Validate item ownership
    item_id = request.POST.get('item_id')
    if not item_id:
        return JsonResponse({'error': 'item_id required'}, status=400)

    try:
        item = ClapTestItem.objects.get(id=item_id)
        if item.component.clap_test_id != assignment.clap_test_id:
            return JsonResponse({
                'error': 'Item does not belong to this assignment'
            }, status=400)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Item not found'}, status=404)

    # 4. Validate audio file
    audio_file = request.FILES.get('audio')
    if not audio_file:
        return JsonResponse({'error': 'Audio file required'}, status=400)

    # 4a. Validate MIME type
    mime_type = audio_file.content_type
    if mime_type not in settings.AUDIO_ALLOWED_MIMETYPES:
        return JsonResponse({
            'error': f'Invalid audio format: {mime_type}',
            'allowed_formats': settings.AUDIO_ALLOWED_MIMETYPES
        }, status=400)

    # 4b. Validate file size
    if audio_file.size > settings.AUDIO_UPLOAD_MAX_SIZE:
        return JsonResponse({
            'error': f'File too large: {audio_file.size} bytes',
            'max_size': settings.AUDIO_UPLOAD_MAX_SIZE
        }, status=400)

    # 4c. Validate file extension
    file_ext = audio_file.name.split('.')[-1].lower()
    if file_ext not in settings.AUDIO_ALLOWED_EXTENSIONS:
        return JsonResponse({
            'error': f'Invalid file extension: {file_ext}',
            'allowed_extensions': settings.AUDIO_ALLOWED_EXTENSIONS
        }, status=400)

    # 5. Get duration metadata
    try:
        duration = float(request.POST.get('duration', 0))
        if duration <= 0:
            return JsonResponse({'error': 'Invalid duration'}, status=400)
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Invalid duration format'}, status=400)

    # 6. Generate secure file path
    now = datetime.now()
    student_id = str(user.id)

    relative_path = os.path.join(
        'audio_responses',
        str(now.year),
        f"{now.month:02d}",
        student_id,
        f"{assignment_id}_{item_id}_{now.strftime('%Y%m%d_%H%M%S')}.{file_ext}"
    )

    full_path = os.path.join(settings.MEDIA_ROOT, relative_path)

    # 7. Create directory if not exists
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    # 8. Delete old file if re-submission
    try:
        old_audio = StudentAudioResponse.objects.get(
            assignment=assignment,
            item=item
        )
        old_audio.delete_file()
        old_audio.delete()
    except StudentAudioResponse.DoesNotExist:
        pass

    # 9. Save file atomically
    try:
        with open(full_path, 'wb+') as destination:
            for chunk in audio_file.chunks():
                destination.write(chunk)
    except Exception as e:
        logger.error(f"Error saving audio file: {e}")
        return JsonResponse({'error': 'Failed to save file'}, status=500)

    # 10. Create database records
    try:
        # Create or update StudentClapResponse
        response, _ = StudentClapResponse.objects.update_or_create(
            assignment=assignment,
            item=item,
            defaults={
                'response_data': {
                    'type': 'audio',
                    'submitted': True
                },
                'updated_at': timezone.now()
            }
        )

        # Create audio record
        audio_response = StudentAudioResponse.objects.create(
            assignment=assignment,
            item=item,
            response=response,
            file_path=relative_path,
            file_size=audio_file.size,
            mime_type=mime_type,
            duration_seconds=duration,
            recorded_at=timezone.now()
        )

        return JsonResponse({
            'success': True,
            'message': 'Audio submitted successfully',
            'audio_response': {
                'id': str(audio_response.id),
                'file_url': audio_response.get_file_url(),
                'duration': float(audio_response.duration_seconds),
                'uploaded_at': audio_response.uploaded_at.isoformat()
            }
        }, status=201)

    except Exception as e:
        # Cleanup file if database operation fails
        if os.path.exists(full_path):
            os.remove(full_path)
        logger.error(f"Error creating audio response: {e}")
        return JsonResponse({'error': 'Failed to save audio response'}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def retrieve_audio_file(request, audio_response_id):
    """
    Retrieve audio file with authentication
    Only allows access if user owns the assignment or is admin

    GET /api/student/audio-responses/{audio_response_id}/file
    """
    # 1. Authentication
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    # 2. Get audio response
    try:
        audio_response = StudentAudioResponse.objects.select_related(
            'assignment__student'
        ).get(id=audio_response_id)
    except StudentAudioResponse.DoesNotExist:
        return JsonResponse({'error': 'Audio not found'}, status=404)

    # 3. Authorization check - allow if: student owns it OR user is admin
    if user.role != 'admin' and audio_response.assignment.student_id != user.id:
        return JsonResponse({'error': 'Unauthorized'}, status=403)

    # 4. Validate file exists
    full_path = os.path.join(settings.MEDIA_ROOT, audio_response.file_path)
    if not os.path.exists(full_path):
        return JsonResponse({'error': 'File not found'}, status=404)

    # 5. Serve file
    response = FileResponse(
        open(full_path, 'rb'),
        content_type=audio_response.mime_type
    )
    response['Content-Disposition'] = f'inline; filename="recording.{audio_response.file_path.split(".")[-1]}"'
    return response

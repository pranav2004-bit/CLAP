"""
Admin Audio Upload Views
Handles file uploads for audio_block items
"""

import os
import json
from datetime import datetime
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from api.models import ClapTestItem, AdminAudioFile
from api.utils.jwt_utils import get_user_from_request


@csrf_exempt
@require_http_methods(["POST"])
def upload_audio_file(request, item_id):
    """
    Upload audio file for audio_block item
    POST /api/admin/clap-items/{item_id}/upload-audio
    """
    # Authentication
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)

    if user.role != 'admin':
        return JsonResponse({'error': 'Admin access required'}, status=403)

    # Verify item exists and is audio_block type
    try:
        item = ClapTestItem.objects.get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    if item.item_type != 'audio_block':
        return JsonResponse({'error': 'Item must be of type audio_block'}, status=400)

    # Verify play_limit is set
    if not item.content.get('play_limit') or item.content.get('play_limit', 0) < 1:
        return JsonResponse({'error': 'play_limit must be set to at least 1 before uploading audio'}, status=400)

    # Get uploaded file
    if 'audio' not in request.FILES:
        return JsonResponse({'error': 'No audio file provided'}, status=400)

    audio_file = request.FILES['audio']

    # Validate MIME type
    mime_type = audio_file.content_type
    if mime_type not in settings.AUDIO_ALLOWED_MIMETYPES:
        return JsonResponse({
            'error': f'Invalid audio format. Allowed: {", ".join(settings.AUDIO_ALLOWED_MIMETYPES)}'
        }, status=400)

    # Validate file size
    if audio_file.size > settings.AUDIO_UPLOAD_MAX_SIZE:
        max_size_mb = settings.AUDIO_UPLOAD_MAX_SIZE / (1024 * 1024)
        return JsonResponse({
            'error': f'File too large. Maximum size: {max_size_mb}MB'
        }, status=400)

    # Validate file extension
    original_filename = audio_file.name
    file_ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    if file_ext not in settings.AUDIO_ALLOWED_EXTENSIONS:
        return JsonResponse({
            'error': f'Invalid file extension. Allowed: {", ".join(settings.AUDIO_ALLOWED_EXTENSIONS)}'
        }, status=400)

    # Get optional duration from request
    duration = request.POST.get('duration')
    duration_seconds = None
    if duration:
        try:
            duration_seconds = float(duration)
        except ValueError:
            pass

    # Delete old audio file if exists
    try:
        old_audio = AdminAudioFile.objects.get(item=item)
        old_audio.delete_file()
        old_audio.delete()
    except AdminAudioFile.DoesNotExist:
        pass

    # Generate file path
    now = datetime.now()
    relative_path = os.path.join(
        'admin_audio',
        str(now.year),
        f"{now.month:02d}",
        f"{item_id}_{now.strftime('%Y%m%d_%H%M%S')}.{file_ext}"
    )

    full_path = os.path.join(settings.MEDIA_ROOT, relative_path)

    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    # Save file
    try:
        with open(full_path, 'wb') as f:
            for chunk in audio_file.chunks():
                f.write(chunk)
    except Exception as e:
        return JsonResponse({'error': f'Failed to save file: {str(e)}'}, status=500)

    # Create database record
    try:
        admin_audio = AdminAudioFile.objects.create(
            item=item,
            uploaded_by=user.id,
            file_path=relative_path,
            file_size=audio_file.size,
            mime_type=mime_type,
            duration_seconds=duration_seconds,
            original_filename=original_filename
        )

        # Update item content to mark audio file uploaded
        item.content['has_audio_file'] = True
        item.save()

        return JsonResponse({
            'success': True,
            'audio': {
                'id': str(admin_audio.id),
                'file_url': admin_audio.get_file_url(),
                'file_size': admin_audio.file_size,
                'duration': float(admin_audio.duration_seconds) if admin_audio.duration_seconds else None,
                'uploaded_at': admin_audio.uploaded_at.isoformat()
            }
        }, status=201)

    except Exception as e:
        # Cleanup file if database operation fails
        if os.path.exists(full_path):
            os.remove(full_path)
        return JsonResponse({'error': f'Database error: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_audio_file(request, item_id):
    """
    Delete audio file for audio_block item
    DELETE /api/admin/clap-items/{item_id}/audio
    """
    # Authentication
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)

    if user.role != 'admin':
        return JsonResponse({'error': 'Admin access required'}, status=403)

    # Verify item exists
    try:
        item = ClapTestItem.objects.get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    # Get audio file record
    try:
        admin_audio = AdminAudioFile.objects.get(item=item)
    except AdminAudioFile.DoesNotExist:
        return JsonResponse({'error': 'No audio file found for this item'}, status=404)

    # Delete physical file
    admin_audio.delete_file()

    # Delete database record
    admin_audio.delete()

    # Update item content to mark audio file removed
    item.content['has_audio_file'] = False
    item.save()

    return JsonResponse({
        'success': True,
        'message': 'Audio file deleted'
    }, status=200)

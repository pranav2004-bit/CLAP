"""
Admin Audio Upload Views
Handles file uploads for audio_block items.

Storage routing (controlled by STORAGE_PROVIDER env var):
  'aws' / 'supabase' -> file uploaded to S3 via api.utils.storage
  ''                 -> file saved to local MEDIA_ROOT (dev only)
"""

import os
from datetime import datetime
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from api.models import ClapTestItem, AdminAudioFile
from api.utils.jwt_utils import get_user_from_request
from api.utils.storage import upload_to_storage

import logging

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def upload_audio_file(request, item_id):
    """
    Upload audio file for audio_block item.
    POST /api/admin/clap-items/{item_id}/upload-audio

    Supports both S3 (aws/supabase) and local filesystem storage.
    Storage backend is selected by STORAGE_PROVIDER in settings.
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
        return JsonResponse(
            {'error': 'play_limit must be set to at least 1 before uploading audio'},
            status=400,
        )

    # Get uploaded file
    if 'audio' not in request.FILES:
        return JsonResponse({'error': 'No audio file provided'}, status=400)

    audio_file = request.FILES['audio']

    # Validate MIME type
    mime_type = audio_file.content_type
    if mime_type not in settings.AUDIO_ALLOWED_MIMETYPES:
        return JsonResponse(
            {'error': f'Invalid audio format. Allowed: {", ".join(settings.AUDIO_ALLOWED_MIMETYPES)}'},
            status=400,
        )

    # Validate file size
    if audio_file.size > settings.AUDIO_UPLOAD_MAX_SIZE:
        max_size_mb = settings.AUDIO_UPLOAD_MAX_SIZE / (1024 * 1024)
        return JsonResponse(
            {'error': f'File too large. Maximum size: {max_size_mb}MB'},
            status=400,
        )

    # Validate file extension
    original_filename = audio_file.name
    file_ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    if file_ext not in settings.AUDIO_ALLOWED_EXTENSIONS:
        return JsonResponse(
            {'error': f'Invalid file extension. Allowed: {", ".join(settings.AUDIO_ALLOWED_EXTENSIONS)}'},
            status=400,
        )

    # Get optional duration from request
    duration = request.POST.get('duration')
    duration_seconds = None
    if duration:
        try:
            duration_seconds = float(duration)
        except ValueError:
            pass

    # Delete old audio file if one exists for this item
    try:
        old_audio = AdminAudioFile.objects.get(item=item)
        old_audio.delete_file()   # Handles both S3 and local via model method
        old_audio.delete()
    except AdminAudioFile.DoesNotExist:
        pass

    # ── Build the object key / relative path ─────────────────────
    now = datetime.now()
    object_key = os.path.join(
        'admin_audio',
        str(now.year),
        f"{now.month:02d}",
        f"{item_id}_{now.strftime('%Y%m%d_%H%M%S')}.{file_ext}",
    ).replace('\\', '/')   # S3 keys must use forward slashes on all platforms

    # ── Try S3 upload first; fall back to local disk ──────────────
    storage_provider = getattr(settings, 'STORAGE_PROVIDER', '').lower()
    file_path = None

    if storage_provider in ('aws', 'supabase'):
        try:
            # Phase 2.2: admin listening audio is a shared asset — all students on
            # the same test hear the same file.  Mark it publicly CDN-cacheable for
            # 24 hours (s-maxage) so CDN edge nodes can cache it and reduce S3 egress.
            # Per-student auth is enforced in the playback view before the redirect.
            file_path = upload_to_storage(
                audio_file, object_key, mime_type,
                cache_control='public, max-age=86400, s-maxage=86400',
            )
        except RuntimeError as exc:
            logger.error('Admin audio S3 upload failed for item %s: %s', item_id, exc)
            return JsonResponse({'error': f'Storage error: {exc}'}, status=500)

    if file_path is None:
        # Local disk fallback (dev or S3 not configured)
        full_path = os.path.join(settings.MEDIA_ROOT, object_key)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        try:
            # Rewind in case upload_to_storage read the buffer
            if hasattr(audio_file, 'seek'):
                audio_file.seek(0)
            with open(full_path, 'wb') as dest:
                for chunk in audio_file.chunks():
                    dest.write(chunk)
        except Exception as exc:
            logger.error('Admin audio local save failed for item %s: %s', item_id, exc)
            return JsonResponse({'error': f'Failed to save file: {exc}'}, status=500)
        # Store the relative path (consistent with existing local convention)
        file_path = object_key

    # ── Create database record ────────────────────────────────────
    try:
        admin_audio = AdminAudioFile.objects.create(
            item=item,
            uploaded_by=user.id,
            file_path=file_path,           # 's3://bucket/key' or relative local path
            file_size=audio_file.size,
            mime_type=mime_type,
            duration_seconds=duration_seconds,
            original_filename=original_filename,
        )

        # Mark item as having an audio file
        item.content['has_audio_file'] = True
        item.save()

        return JsonResponse(
            {
                'success': True,
                'audio': {
                    'id': str(admin_audio.id),
                    'file_url': admin_audio.get_file_url(),
                    'file_size': admin_audio.file_size,
                    'duration': (
                        float(admin_audio.duration_seconds)
                        if admin_audio.duration_seconds
                        else None
                    ),
                    'uploaded_at': admin_audio.uploaded_at.isoformat(),
                    'storage': 's3' if file_path.startswith('s3://') else 'local',
                },
            },
            status=201,
        )

    except Exception as exc:
        # Cleanup: remove the uploaded file if the DB write fails
        if file_path and not file_path.startswith('s3://'):
            full_path = os.path.join(settings.MEDIA_ROOT, file_path)
            if os.path.exists(full_path):
                os.remove(full_path)
        logger.error('Admin audio DB create failed for item %s: %s', item_id, exc)
        return JsonResponse({'error': f'Database error: {exc}'}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_audio_file(request, item_id):
    """
    Delete audio file for audio_block item.
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

    # Delete physical file (handles both S3 and local via model method)
    admin_audio.delete_file()

    # Delete database record
    admin_audio.delete()

    # Mark item as no longer having an audio file
    item.content['has_audio_file'] = False
    item.save()

    return JsonResponse({'success': True, 'message': 'Audio file deleted'}, status=200)

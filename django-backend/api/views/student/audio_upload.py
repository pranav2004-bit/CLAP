"""
Audio Upload Views
Handles audio recording submission and retrieval for CLAP tests.
Supports both direct multipart uploads and presigned S3 uploads.
"""

import json
import os
from datetime import datetime
from importlib.util import find_spec

from django.conf import settings
from django.http import FileResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import ClapTestItem, StudentAudioResponse, StudentClapAssignment, StudentClapResponse
from api.utils.jwt_utils import get_user_from_request

import logging

logger = logging.getLogger(__name__)

if find_spec('boto3') is not None:
    import boto3
else:
    boto3 = None


def _s3_client():
    if boto3 is None:
        return None

    key = getattr(settings, 'S3_ACCESS_KEY_ID', None) or None
    secret = getattr(settings, 'S3_SECRET_ACCESS_KEY', None) or None
    bucket = getattr(settings, 'S3_BUCKET_NAME', None) or None
    if not key or not secret or not bucket:
        return None

    kwargs = {
        'aws_access_key_id': key,
        'aws_secret_access_key': secret,
    }
    endpoint = getattr(settings, 'S3_ENDPOINT_URL', None) or None
    region = getattr(settings, 'S3_REGION_NAME', None) or None
    if endpoint:
        kwargs['endpoint_url'] = endpoint
    if region:
        kwargs['region_name'] = region
    return boto3.client('s3', **kwargs)


def _validate_assignment_and_item(user, assignment_id, item_id):
    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return None, None, JsonResponse({'error': 'Assignment not found'}, status=404)

    if not item_id:
        return None, None, JsonResponse({'error': 'item_id required'}, status=400)

    try:
        item = ClapTestItem.objects.get(id=item_id)
        if item.component.clap_test_id != assignment.clap_test_id:
            return None, None, JsonResponse({'error': 'Item does not belong to this assignment'}, status=400)
    except ClapTestItem.DoesNotExist:
        return None, None, JsonResponse({'error': 'Item not found'}, status=404)

    return assignment, item, None


@csrf_exempt
@require_http_methods(["POST"])
def get_audio_upload_url(request, assignment_id):
    """
    Generate a presigned S3 upload URL for student speaking audio.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    item_id = payload.get('item_id')
    mime_type = payload.get('mime_type', '')
    extension = payload.get('extension', '').lower().strip()
    file_size = int(payload.get('file_size') or 0)

    assignment, item, err = _validate_assignment_and_item(user, assignment_id, item_id)
    if err:
        return err

    if mime_type not in settings.AUDIO_ALLOWED_MIMETYPES:
        return JsonResponse({'error': f'Invalid audio format: {mime_type}', 'allowed_formats': settings.AUDIO_ALLOWED_MIMETYPES}, status=400)

    if extension not in settings.AUDIO_ALLOWED_EXTENSIONS:
        return JsonResponse({'error': f'Invalid file extension: {extension}', 'allowed_extensions': settings.AUDIO_ALLOWED_EXTENSIONS}, status=400)

    if file_size <= 0 or file_size > settings.AUDIO_UPLOAD_MAX_SIZE:
        return JsonResponse({'error': 'Invalid file size', 'max_size': settings.AUDIO_UPLOAD_MAX_SIZE}, status=400)

    client = _s3_client()
    bucket = getattr(settings, 'S3_BUCKET_NAME', '')
    if not client or not bucket:
        return JsonResponse({'error': 'S3 presigned upload is not configured'}, status=503)

    now = datetime.now()
    object_key = os.path.join(
        'audio_responses',
        str(now.year),
        f'{now.month:02d}',
        str(user.id),
        f"{assignment_id}_{item.id}_{now.strftime('%Y%m%d_%H%M%S')}.{extension}",
    )

    try:
        upload_url = client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': bucket,
                'Key': object_key,
                'ContentType': mime_type,
            },
            ExpiresIn=min(max(300, int(getattr(settings, 'S3_PRESIGNED_URL_EXPIRY_SECONDS', 900))), 3600),
        )
    except Exception as exc:
        logger.exception('Failed generating presigned upload URL')
        return JsonResponse({'error': f'Failed to generate upload URL: {exc}'}, status=500)

    return JsonResponse(
        {
            'upload_url': upload_url,
            'object_key': object_key,
            'bucket': bucket,
            'headers': {'Content-Type': mime_type},
            'mode': 's3_presigned',
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def submit_audio_response(request, assignment_id):
    """
    Submit audio recording metadata for a test item.
    Supports:
    - multipart file upload (legacy): audio file in request.FILES
    - presigned S3 upload flow: s3_object_key in payload/form
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    item_id = request.POST.get('item_id') if request.content_type and 'multipart/form-data' in request.content_type else None
    if not item_id:
        try:
            payload = json.loads(request.body or '{}')
        except json.JSONDecodeError:
            payload = {}
        item_id = payload.get('item_id')
    else:
        payload = {}

    assignment, item, err = _validate_assignment_and_item(user, assignment_id, item_id)
    if err:
        return err

    duration_raw = request.POST.get('duration') if request.POST else payload.get('duration')
    try:
        duration = float(duration_raw or 0)
        if duration <= 0:
            return JsonResponse({'error': 'Invalid duration'}, status=400)
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Invalid duration format'}, status=400)

    s3_object_key = (request.POST.get('s3_object_key') if request.POST else payload.get('s3_object_key')) or None
    mime_type = (request.POST.get('mime_type') if request.POST else payload.get('mime_type')) or ''

    file_path = None
    file_size = 0

    audio_file = request.FILES.get('audio') if request.FILES else None
    if s3_object_key:
        if not mime_type:
            return JsonResponse({'error': 'mime_type required for S3 submissions'}, status=400)
        if mime_type not in settings.AUDIO_ALLOWED_MIMETYPES:
            return JsonResponse({'error': f'Invalid audio format: {mime_type}'}, status=400)
        file_path = f"s3://{settings.S3_BUCKET_NAME}/{s3_object_key}"
        file_size = int(payload.get('file_size') or request.POST.get('file_size') or 0)
    elif audio_file:
        mime_type = audio_file.content_type
        if mime_type not in settings.AUDIO_ALLOWED_MIMETYPES:
            return JsonResponse({'error': f'Invalid audio format: {mime_type}', 'allowed_formats': settings.AUDIO_ALLOWED_MIMETYPES}, status=400)

        if audio_file.size > settings.AUDIO_UPLOAD_MAX_SIZE:
            return JsonResponse({'error': f'File too large: {audio_file.size} bytes', 'max_size': settings.AUDIO_UPLOAD_MAX_SIZE}, status=400)

        file_ext = audio_file.name.split('.')[-1].lower()
        if file_ext not in settings.AUDIO_ALLOWED_EXTENSIONS:
            return JsonResponse({'error': f'Invalid file extension: {file_ext}', 'allowed_extensions': settings.AUDIO_ALLOWED_EXTENSIONS}, status=400)

        now = datetime.now()
        file_path = os.path.join(
            'audio_responses',
            str(now.year),
            f"{now.month:02d}",
            str(user.id),
            f"{assignment_id}_{item_id}_{now.strftime('%Y%m%d_%H%M%S')}.{file_ext}",
        )
        full_path = os.path.join(settings.MEDIA_ROOT, file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        try:
            with open(full_path, 'wb+') as destination:
                for chunk in audio_file.chunks():
                    destination.write(chunk)
        except Exception as exc:
            logger.error(f'Error saving audio file: {exc}')
            return JsonResponse({'error': 'Failed to save file'}, status=500)

        file_size = int(audio_file.size)
    else:
        return JsonResponse({'error': 'Audio file or s3_object_key required'}, status=400)

    try:
        old_audio = StudentAudioResponse.objects.get(assignment=assignment, item=item)
        if old_audio.file_path and not old_audio.file_path.startswith('s3://'):
            old_audio.delete_file()
        old_audio.delete()
    except StudentAudioResponse.DoesNotExist:
        pass

    try:
        response, _ = StudentClapResponse.objects.update_or_create(
            assignment=assignment,
            item=item,
            defaults={'response_data': {'type': 'audio', 'submitted': True}, 'updated_at': timezone.now()},
        )

        audio_response = StudentAudioResponse.objects.create(
            assignment=assignment,
            item=item,
            response=response,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            duration_seconds=duration,
            recorded_at=timezone.now(),
        )

        return JsonResponse(
            {
                'success': True,
                'message': 'Audio submitted successfully',
                'audio_response': {
                    'id': str(audio_response.id),
                    'file_url': audio_response.get_file_url(),
                    'duration': float(audio_response.duration_seconds),
                    'uploaded_at': audio_response.uploaded_at.isoformat(),
                    'storage': 's3' if file_path.startswith('s3://') else 'local',
                },
            },
            status=201,
        )
    except Exception as exc:
        if audio_file and file_path and not file_path.startswith('s3://'):
            full_path = os.path.join(settings.MEDIA_ROOT, file_path)
            if os.path.exists(full_path):
                os.remove(full_path)
        logger.error(f'Error creating audio response: {exc}')
        return JsonResponse({'error': 'Failed to save audio response'}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def retrieve_audio_file(request, audio_response_id):
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        audio_response = StudentAudioResponse.objects.select_related('assignment__student').get(id=audio_response_id)
    except StudentAudioResponse.DoesNotExist:
        return JsonResponse({'error': 'Audio not found'}, status=404)

    if user.role != 'admin' and audio_response.assignment.student_id != user.id:
        return JsonResponse({'error': 'Unauthorized'}, status=403)

    if audio_response.file_path.startswith('s3://'):
        return JsonResponse({'error': 'S3-backed audio cannot be streamed via this endpoint directly'}, status=400)

    full_path = os.path.join(settings.MEDIA_ROOT, audio_response.file_path)
    if not os.path.exists(full_path):
        return JsonResponse({'error': 'File not found'}, status=404)

    response = FileResponse(open(full_path, 'rb'), content_type=audio_response.mime_type)
    response['Content-Disposition'] = f'inline; filename="recording.{audio_response.file_path.split(".")[-1]}"'
    return response

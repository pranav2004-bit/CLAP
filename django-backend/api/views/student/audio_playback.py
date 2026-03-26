"""
Student Audio Playback Views
Handles playback tracking and file retrieval for audio_block items
"""

import os
import json
from datetime import datetime
from django.conf import settings
from django.http import JsonResponse, FileResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from api.models import ClapTestItem, AdminAudioFile, StudentClapAssignment, StudentClapResponse
from api.utils.jwt_utils import get_user_from_request


@csrf_exempt
@require_http_methods(["GET"])
def retrieve_audio_file(request, item_id):
    """
    Retrieve audio file for audio_block item (authenticated)
    GET /api/student/clap-items/{item_id}/audio?assignment_id={uuid}
    """
    # Authentication
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)

    if user.role != 'student':
        return JsonResponse({'error': 'Student access required'}, status=403)

    # Get assignment_id from query params
    assignment_id = request.GET.get('assignment_id')
    if not assignment_id:
        return JsonResponse({'error': 'assignment_id required'}, status=400)

    # Verify assignment belongs to user
    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found or not yours'}, status=403)

    # Verify item exists and belongs to assignment's test
    try:
        item = ClapTestItem.objects.get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    # Verify item belongs to assignment's test
    if item.component.clap_test_id != assignment.clap_test_id:
        return JsonResponse({'error': 'Item does not belong to this assignment'}, status=403)

    # Verify item is audio_block type
    if item.item_type != 'audio_block':
        return JsonResponse({'error': 'Item is not an audio block'}, status=400)

    # Get audio file
    try:
        admin_audio = AdminAudioFile.objects.get(item=item)
    except AdminAudioFile.DoesNotExist:
        return JsonResponse({'error': 'Audio file not found'}, status=404)

    # Check playback limit.
    # play_limit=0 means "not configured / unlimited" — never block in that case.
    # The old code lacked this guard: 0 >= 0 is True, so every audio fetch on an
    # unconfigured item returned 403 "Playback limit reached".
    play_limit = item.content.get('play_limit', 0)
    if play_limit > 0:
        try:
            response = StudentClapResponse.objects.get(assignment=assignment, item=item)
            play_count = response.response_data.get('play_count', 0) if response.response_data else 0
            if play_count >= play_limit:
                return JsonResponse({'error': 'Playback limit reached', 'code': 'PLAY_LIMIT_REACHED'}, status=403)
        except StudentClapResponse.DoesNotExist:
            # No response yet — playback allowed
            pass

    # Serve file — route based on storage backend
    if admin_audio.file_path.startswith('s3://'):
        # Stream through Django instead of redirecting to S3.
        # A browser fetch() follows the 302 redirect to S3, but S3 presigned
        # URLs are cross-origin and blocked by CORS unless the bucket has an
        # explicit AllowedOrigins CORS rule for every frontend domain.
        # Streaming through Django sidesteps S3 CORS entirely — the browser
        # only ever talks to the Django origin it already trusts.
        # Auth checks (assignment ownership, play-limit) already ran above.
        from api.utils.storage import get_s3_client
        client = get_s3_client()
        if not client:
            return JsonResponse({'error': 'S3 client not configured'}, status=503)
        try:
            without_scheme = admin_audio.file_path[len('s3://'):]
            bucket, _, key = without_scheme.partition('/')
            s3_obj = client.get_object(Bucket=bucket, Key=key)
            content_type = admin_audio.mime_type or s3_obj.get('ContentType', 'audio/mpeg')
            response = StreamingHttpResponse(
                s3_obj['Body'].iter_chunks(chunk_size=65536),
                content_type=content_type,
            )
            response['Content-Disposition'] = 'inline'
            response['Cache-Control'] = 'no-store'
            return response
        except Exception as exc:
            return JsonResponse({'error': f'Failed to fetch audio: {exc}'}, status=500)

    # Local filesystem audio — shared listening asset, safe to cache publicly.
    # A2: explicit file handle management — close on exception to prevent FD leak.
    file_path = os.path.join(settings.MEDIA_ROOT, admin_audio.file_path)
    if not os.path.exists(file_path):
        return JsonResponse({'error': 'Audio file not found on server'}, status=404)

    fh = None
    try:
        fh = open(file_path, 'rb')
        response = FileResponse(fh, content_type=admin_audio.mime_type)
        response['Content-Disposition'] = 'inline'
        # Phase 2.2: admin listening audio is the same bytes for every student;
        # browsers may cache it for 24 h.  CacheControlMiddleware's /api/ no-store
        # default is skipped because we explicitly set the header here.
        response['Cache-Control'] = 'public, max-age=86400'
        # Django closes fh when streaming is complete; we hand ownership to FileResponse
        return response
    except Exception as exc:
        if fh is not None:
            fh.close()  # Close explicitly so FD is not leaked on error path
        return JsonResponse({'error': f'Failed to serve file: {exc}'}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def track_playback(request, item_id):
    """
    Track audio playback completion and increment counter
    POST /api/student/clap-items/{item_id}/track-playback
    Body: {"assignment_id": "uuid", "playback_completed": true}
    """
    # Authentication
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)

    if user.role != 'student':
        return JsonResponse({'error': 'Student access required'}, status=403)

    # Parse request body
    try:
        body = json.loads(request.body)
        assignment_id = body.get('assignment_id')
        playback_completed = body.get('playback_completed')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if not assignment_id:
        return JsonResponse({'error': 'assignment_id required'}, status=400)

    if not playback_completed:
        return JsonResponse({'error': 'playback_completed must be true'}, status=400)

    # Verify assignment belongs to user
    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found or not yours'}, status=403)

    # Verify item exists and belongs to assignment's test
    try:
        item = ClapTestItem.objects.get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    if item.component.clap_test_id != assignment.clap_test_id:
        return JsonResponse({'error': 'Item does not belong to this assignment'}, status=403)

    # Get play limit
    play_limit = item.content.get('play_limit', 0)
    if play_limit < 1:
        return JsonResponse({'error': 'Play limit not configured'}, status=400)

    # Get or create response
    response, created = StudentClapResponse.objects.get_or_create(
        assignment=assignment,
        item=item,
        defaults={'response_data': {}}
    )

    # Initialize response_data if needed
    if not response.response_data:
        response.response_data = {}

    # Get current play count
    play_count = response.response_data.get('play_count', 0)

    # Check if limit already reached
    if play_count >= play_limit:
        return JsonResponse({'error': 'Playback limit already reached'}, status=403)

    # Increment counter
    response.response_data['play_count'] = play_count + 1
    response.response_data['last_played_at'] = datetime.now().isoformat()
    response.response_data['limit_reached'] = (response.response_data['play_count'] >= play_limit)
    response.response_data['type'] = 'audio_playback'

    response.save()

    # Return updated status
    return JsonResponse({
        'success': True,
        'play_count': response.response_data['play_count'],
        'play_limit': play_limit,
        'limit_reached': response.response_data['limit_reached'],
        'remaining_plays': max(0, play_limit - response.response_data['play_count'])
    }, status=200)


@csrf_exempt
@require_http_methods(["GET"])
def get_playback_status(request, item_id):
    """
    Get current playback status for student
    GET /api/student/clap-items/{item_id}/playback-status?assignment_id={uuid}
    """
    # Authentication
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)

    if user.role != 'student':
        return JsonResponse({'error': 'Student access required'}, status=403)

    # Get assignment_id from query params
    assignment_id = request.GET.get('assignment_id')
    if not assignment_id:
        return JsonResponse({'error': 'assignment_id required'}, status=400)

    # Verify assignment belongs to user
    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found or not yours'}, status=403)

    # Verify item exists
    try:
        item = ClapTestItem.objects.get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    # Get play limit
    play_limit = item.content.get('play_limit', 0)

    # Get response if exists
    try:
        response = StudentClapResponse.objects.get(assignment=assignment, item=item)
        play_count = response.response_data.get('play_count', 0) if response.response_data else 0
        last_played_at = response.response_data.get('last_played_at') if response.response_data else None
        limit_reached = play_count >= play_limit
    except StudentClapResponse.DoesNotExist:
        play_count = 0
        last_played_at = None
        limit_reached = False

    return JsonResponse({
        'play_count': play_count,
        'play_limit': play_limit,
        'limit_reached': limit_reached,
        'remaining_plays': max(0, play_limit - play_count),
        'last_played_at': last_played_at
    }, status=200)

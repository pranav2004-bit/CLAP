"""
Student Audio Playback Views
Handles playback tracking and file retrieval for audio_block items.

Set-aware audio resolution
──────────────────────────
When a student is assigned a set (StudentClapAssignment.assigned_set_id is set),
audio for audio_block items is resolved in priority order:

  1. Set-specific audio — AdminAudioFile.set_item FK points to the ClapSetItem
     that belongs to the student's assigned set.  Uploaded by the admin via the
     set editor (POST /admin/set-items/<id>/upload-audio).

  2. Base/shared audio — AdminAudioFile.item FK points to the structural
     ClapTestItem slot.  Commonly used when all sets share a single listening
     passage (the admin uploads once at the base level).

The structural ClapTestItem slot carries the StudentClapResponse FK so that
play-count tracking is always written to one consistent row per student.

Why NOT checking item.item_type
────────────────────────────────
The structural slot's item_type is set at creation time via _ensure_structural_slots.
If the slot was created earlier by a DIFFERENT item type (e.g. 'mcq') and the admin
later attached an audio_block ClapSetItem at the same order_index, get_or_create
returns the existing slot unchanged.  Checking item.item_type would incorrectly
block audio delivery for those slots.  AdminAudioFile existence is the authoritative
signal that this is an audio item — no separate type gate is needed.
"""

import os
import json
from datetime import datetime
from django.conf import settings
from django.http import JsonResponse, FileResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from api.models import (
    ClapTestItem, ClapSetItem, AdminAudioFile,
    StudentClapAssignment, StudentClapResponse,
)
from api.utils.jwt_utils import get_user_from_request


# ── Helper: set-aware audio resolution ────────────────────────────────────────

def _resolve_audio_for_item(item: ClapTestItem, assignment) -> tuple:
    """
    Return (admin_audio: AdminAudioFile | None, effective_play_limit: int)
    for a given structural ClapTestItem + student assignment.

    Priority:
      1. Set-specific audio (AdminAudioFile.set_item FK) — the student's
         assigned set has its own audio clip for this slot.
      2. Base item audio (AdminAudioFile.item FK) — audio is shared across
         all sets (or the test was created without the sets feature).

    play_limit is resolved with the same priority: set item content first,
    base item content as fallback.  0 always means "unlimited / not configured".

    Uses .filter().order_by().first() (not .get()) to survive duplicate
    order_index data without raising MultipleObjectsReturned.
    """
    admin_audio = None
    effective_play_limit = (item.content or {}).get('play_limit', 0)

    # ── Priority 1: set-specific audio ────────────────────────────────────────
    if getattr(assignment, 'assigned_set_id', None):
        try:
            set_item = (
                ClapSetItem.objects
                .filter(
                    set_component__set_id=assignment.assigned_set_id,
                    set_component__test_type=item.component.test_type,
                    order_index=item.order_index,
                )
                .order_by('created_at')   # stable: earlier-created item wins
                .first()
            )
            if set_item is not None:
                # Override play_limit from set item if explicitly configured
                set_play_limit = (set_item.content or {}).get('play_limit', 0)
                if set_play_limit:
                    effective_play_limit = set_play_limit

                # Try set-specific audio file
                try:
                    admin_audio = AdminAudioFile.objects.get(set_item=set_item)
                except AdminAudioFile.DoesNotExist:
                    pass  # Fall through to base-item audio below

        except Exception:
            # Defensive: a set-lookup error must never block audio delivery.
            # Log nothing here — callers log on 404 if both paths fail.
            pass

    # ── Priority 2: base item audio (shared / fallback) ───────────────────────
    if admin_audio is None:
        try:
            admin_audio = AdminAudioFile.objects.get(item=item)
        except AdminAudioFile.DoesNotExist:
            pass

    return admin_audio, effective_play_limit


# ── Views ──────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["GET"])
def retrieve_audio_file(request, item_id):
    """
    Retrieve audio file for audio_block item (authenticated).
    GET /api/student/clap-items/{item_id}/audio?assignment_id={uuid}

    Handles both base-item audio and set-specific audio transparently.
    """
    # ── Auth ───────────────────────────────────────────────────────────────────
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    if user.role != 'student':
        return JsonResponse({'error': 'Student access required'}, status=403)

    # ── Assignment ─────────────────────────────────────────────────────────────
    assignment_id = request.GET.get('assignment_id')
    if not assignment_id:
        return JsonResponse({'error': 'assignment_id required'}, status=400)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found or not yours'}, status=403)

    # ── Item ───────────────────────────────────────────────────────────────────
    try:
        item = ClapTestItem.objects.select_related('component').get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    if item.component.clap_test_id != assignment.clap_test_id:
        return JsonResponse({'error': 'Item does not belong to this assignment'}, status=403)

    # NOTE: item.item_type is intentionally NOT checked here.
    # See module docstring for the full reasoning.

    # ── Resolve audio (set-specific or base) ───────────────────────────────────
    admin_audio, effective_play_limit = _resolve_audio_for_item(item, assignment)

    if admin_audio is None:
        return JsonResponse({'error': 'Audio file not found'}, status=404)

    # ── Play-limit enforcement (0 = unlimited — skip check) ───────────────────
    if effective_play_limit > 0:
        try:
            resp = StudentClapResponse.objects.get(assignment=assignment, item=item)
            play_count = resp.response_data.get('play_count', 0) if resp.response_data else 0
            if play_count >= effective_play_limit:
                return JsonResponse(
                    {'error': 'Playback limit reached', 'code': 'PLAY_LIMIT_REACHED'},
                    status=403,
                )
        except StudentClapResponse.DoesNotExist:
            pass  # No plays recorded yet — allow

    # ── Serve audio file ───────────────────────────────────────────────────────
    if admin_audio.file_path.startswith('s3://'):
        # Stream through Django instead of redirecting to S3.
        # A browser fetch() follows the 302 redirect to S3, but S3 presigned
        # URLs are cross-origin and blocked by CORS unless the bucket has an
        # explicit AllowedOrigins CORS rule for every frontend domain.
        # Streaming through Django sidesteps S3 CORS entirely — the browser
        # only ever talks to the Django origin it already trusts.
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
            # Audio content is identical for every student — same file served by admin.
            # Match the local-file behaviour (public, max-age=86400) so browsers and
            # CDN/nginx can cache the response.  Previously 'no-store' forced every
            # page-refresh to re-stream the blob through a sync Gunicorn worker,
            # causing worker saturation when a whole class started simultaneously.
            response['Cache-Control'] = 'public, max-age=86400'
            content_length = s3_obj.get('ContentLength')
            if content_length:
                response['Content-Length'] = str(content_length)
            return response
        except Exception as exc:
            return JsonResponse({'error': f'Failed to fetch audio: {exc}'}, status=500)

    # Local filesystem — A2: explicit file handle management, close on exception.
    file_path = os.path.join(settings.MEDIA_ROOT, admin_audio.file_path)
    if not os.path.exists(file_path):
        return JsonResponse({'error': 'Audio file not found on server'}, status=404)

    fh = None
    try:
        fh = open(file_path, 'rb')
        response = FileResponse(fh, content_type=admin_audio.mime_type)
        response['Content-Disposition'] = 'inline'
        response['Cache-Control'] = 'public, max-age=86400'
        return response
    except Exception as exc:
        if fh is not None:
            fh.close()
        return JsonResponse({'error': f'Failed to serve file: {exc}'}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def track_playback(request, item_id):
    """
    Track audio playback completion and increment counter.
    POST /api/student/clap-items/{item_id}/track-playback
    Body: {"assignment_id": "uuid", "playback_completed": true}
    """
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    if user.role != 'student':
        return JsonResponse({'error': 'Student access required'}, status=403)

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

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found or not yours'}, status=403)

    try:
        item = ClapTestItem.objects.select_related('component').get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    if item.component.clap_test_id != assignment.clap_test_id:
        return JsonResponse({'error': 'Item does not belong to this assignment'}, status=403)

    # Resolve effective play_limit from set item content or base item content.
    _, effective_play_limit = _resolve_audio_for_item(item, assignment)

    # Play limit = 0 means "unlimited / not configured" — tracking is a no-op.
    # Return a success response so the frontend does not log a spurious error.
    if effective_play_limit < 1:
        return JsonResponse({
            'success': True,
            'play_count': 0,
            'play_limit': 0,
            'limit_reached': False,
            'remaining_plays': 0,
        })

    play_limit = effective_play_limit

    # Get or create response record (always keyed to structural ClapTestItem).
    # select_for_update() acquires a row-level write lock before we read
    # play_count and increment it.  Without the lock, two concurrent requests
    # (e.g. two browser tabs or a network retry) can both pass the
    # play_count >= play_limit check and increment simultaneously, allowing
    # the student to exceed their allowed plays.  The lock serialises the
    # read-increment-write cycle so only one request wins at a time.
    # get_or_create is NOT used here because it cannot hold a lock on the
    # newly-inserted row in the same transaction; we use get_or_create only
    # for the initial creation, then immediately re-fetch under lock.
    from django.db import transaction as _tx
    with _tx.atomic():
        # Ensure the row exists first (idempotent)
        StudentClapResponse.objects.get_or_create(
            assignment=assignment,
            item=item,
            defaults={'response_data': {'play_count': 0, 'type': 'audio_playback'}},
        )
        # Now lock the row so no concurrent request can read stale play_count
        try:
            response = StudentClapResponse.objects.select_for_update().get(
                assignment=assignment, item=item
            )
        except StudentClapResponse.DoesNotExist:
            # Should never happen — we just created it above — defensive only
            return JsonResponse({'error': 'Internal error tracking playback'}, status=500)

        if not response.response_data:
            response.response_data = {}

        play_count = response.response_data.get('play_count', 0)

        if play_count >= play_limit:
            return JsonResponse({'error': 'Playback limit already reached'}, status=403)

        response.response_data['play_count'] = play_count + 1
        response.response_data['last_played_at'] = datetime.now().isoformat()
        response.response_data['limit_reached'] = (response.response_data['play_count'] >= play_limit)
        response.response_data['type'] = 'audio_playback'
        response.save()

    return JsonResponse({
        'success': True,
        'play_count': response.response_data['play_count'],
        'play_limit': play_limit,
        'limit_reached': response.response_data['limit_reached'],
        'remaining_plays': max(0, play_limit - response.response_data['play_count']),
    }, status=200)


@csrf_exempt
@require_http_methods(["GET"])
def get_playback_status(request, item_id):
    """
    Get current playback status for student.
    GET /api/student/clap-items/{item_id}/playback-status?assignment_id={uuid}
    """
    user = get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required'}, status=401)
    if user.role != 'student':
        return JsonResponse({'error': 'Student access required'}, status=403)

    assignment_id = request.GET.get('assignment_id')
    if not assignment_id:
        return JsonResponse({'error': 'assignment_id required'}, status=400)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found or not yours'}, status=403)

    try:
        item = ClapTestItem.objects.select_related('component').get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Test item not found'}, status=404)

    # Resolve effective play_limit from set item content or base item content.
    _, effective_play_limit = _resolve_audio_for_item(item, assignment)
    play_limit = effective_play_limit

    try:
        response = StudentClapResponse.objects.get(assignment=assignment, item=item)
        play_count = response.response_data.get('play_count', 0) if response.response_data else 0
        last_played_at = response.response_data.get('last_played_at') if response.response_data else None
        # limit_reached is only meaningful when a play limit is configured.
        # When play_limit=0 (unlimited), never report limit_reached=True even
        # if play_count > 0 (which would happen after any completed play).
        limit_reached = (play_count >= play_limit) if play_limit > 0 else False
    except StudentClapResponse.DoesNotExist:
        play_count = 0
        last_played_at = None
        limit_reached = False

    return JsonResponse({
        'play_count': play_count,
        'play_limit': play_limit,
        'limit_reached': limit_reached,
        'remaining_plays': max(0, play_limit - play_count) if play_limit > 0 else 0,
        'last_played_at': last_played_at,
    }, status=200)

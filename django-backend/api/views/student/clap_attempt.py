from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
from django.db.models import Prefetch
import json
import logging
from api.models import (
    User, ClapTest, ClapTestComponent, ClapSetComponent, StudentClapAssignment,
    ClapTestItem, ClapSetItem, StudentClapResponse, ComponentAttempt, MalpracticeEvent,
    AssessmentSubmission,
)
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["GET"])
def list_assigned_tests(request):
    """
    GET: List all CLAP tests assigned to the student
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignments = list(StudentClapAssignment.objects.filter(
            student=user
        ).select_related('clap_test', 'assigned_set').prefetch_related(
            'clap_test__components',
            'assigned_set__components',   # ClapSetComponents for set-specific timings
        ).order_by('-assigned_at'))

        # ── Fresh deadline lookup ──────────────────────────────────────────────
        # Issue a separate direct SELECT on clap_tests for global_deadline.
        # Using str(UUID) as dict keys avoids any UUID-object vs string mismatch.
        test_ids = [str(a.clap_test_id) for a in assignments]
        fresh_deadlines = {
            str(id_): deadline
            for id_, deadline in ClapTest.objects.filter(
                id__in=test_ids
            ).values_list('id', 'global_deadline')
        } if test_ids else {}

        logger.debug(
            "[TIMER_DEBUG] student=%s test_ids=%s fresh_deadlines=%s",
            user.id, test_ids, fresh_deadlines,
        )

        data = []
        for assignment in assignments:
            # Build a map of test_type → ClapSetComponent for the student's set.
            # This lets us return set-specific duration and timer settings so the
            # student's countdown reflects the actual paper they were assigned.
            set_comp_map: dict = {}
            if assignment.assigned_set_id and assignment.assigned_set:
                for sc in assignment.assigned_set.components.all():
                    set_comp_map[sc.test_type] = sc

            components = []
            for comp in assignment.clap_test.components.all():
                sc = set_comp_map.get(comp.test_type)
                components.append({
                    'id': str(comp.id),          # structural ClapTestComponent ID (routing)
                    'type': comp.test_type,
                    'title': sc.title if sc else comp.title,
                    'duration': sc.duration_minutes if sc else comp.duration_minutes,
                    'timer_enabled': sc.timer_enabled if sc else comp.timer_enabled,
                })

            # Use the freshly-queried deadline (str-keyed to avoid UUID mismatch)
            global_deadline = fresh_deadlines.get(str(assignment.clap_test_id))
            now = timezone.now()
            if global_deadline is None:
                timer_state = 'upcoming'        # timer not started yet
            elif now < global_deadline:
                timer_state = 'live'            # timer running
            else:
                timer_state = 'expired'         # timer has passed

            data.append({
                'assignment_id': str(assignment.id),
                'test_id': str(assignment.clap_test.id),
                'test_name': assignment.clap_test.name,
                'status': assignment.status,
                'assigned_at': assignment.assigned_at.isoformat() if assignment.assigned_at else None,
                'started_at': assignment.started_at.isoformat() if assignment.started_at else None,
                'completed_at': assignment.completed_at.isoformat() if assignment.completed_at else None,
                'retest_granted': assignment.retest_granted,
                'deadline_utc': global_deadline.isoformat() if global_deadline else None,
                'timer_state': timer_state,
                'components': components,
                'test_duration_minutes': (
                    assignment.clap_test.global_duration_minutes
                    or sum(c['duration'] or 0 for c in components)
                ),
            })

        response = JsonResponse({'assignments': data})
        # Timer state must always be fresh — never serve a cached response.
        # Without this header the browser may return stale data where
        # deadline_utc is still null even after the admin starts the timer.
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate'
        response['Pragma'] = 'no-cache'
        return response

    except Exception as e:
        logger.error(f"Error listing assignments: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def start_assignment(request, assignment_id):
    """
    POST /student/clap-assignments/{assignment_id}/start

    Idempotent start — marks the assignment as started the first time,
    then returns the server-authoritative started_at and total_duration_minutes
    on every subsequent call so the frontend can seed its local timer.

    Response: { assignment_id, status, started_at, total_duration_minutes }
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.select_related('clap_test').get(
            id=assignment_id, student=user
        )
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    now = timezone.now()

    # Idempotent: only update started_at / status on first call
    if not assignment.started_at:
        assignment.started_at = now
        assignment.status = 'started'
        assignment.save(update_fields=['started_at', 'status'])

    # Effective duration: global_duration_minutes > set components > structural slots.
    # Using the student's assigned set ensures each set's individual timing is
    # respected even when sets have different durations.
    test = assignment.clap_test
    if test.global_duration_minutes:
        total_duration = test.global_duration_minutes
    elif assignment.assigned_set_id:
        total_duration = sum(
            c.duration_minutes or 0
            for c in ClapSetComponent.objects.filter(set_id=assignment.assigned_set_id)
        ) or None
    else:
        total_duration = sum(
            c.duration_minutes or 0
            for c in test.components.all()
        ) or None

    return JsonResponse({
        'assignment_id': str(assignment.id),
        'status': assignment.status,
        'started_at': assignment.started_at.isoformat() if assignment.started_at else None,
        'total_duration_minutes': total_duration,
    })


@csrf_exempt
@require_http_methods(["GET"])
def student_test_items(request, assignment_id, component_id):
    """
    GET: List items for a specific component within an assignment.
    Creates a server-side ComponentAttempt with a deadline on first access.
    Returns the server_deadline so the frontend can sync the timer.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    # Read-only mode: completed/expired assignments can still be viewed (not edited).
    # The student sees their submitted answers but cannot change or re-submit them.
    # test_deleted is a hard block — the test no longer exists so nothing to show.
    read_only_mode = assignment.status in ('completed', 'expired')
    if assignment.status == 'test_deleted':
        return JsonResponse({'error': 'Assignment already completed', 'code': 'ALREADY_COMPLETED'}, status=403)

    # Verify component belongs to the assigned test
    try:
        component = ClapTestComponent.objects.get(id=component_id, clap_test=assignment.clap_test)
    except ClapTestComponent.DoesNotExist:
        return JsonResponse({'error': 'Component not found in this test'}, status=404)

    # If assignment hasn't started, mark it as started (skip in read-only mode)
    if not read_only_mode and not assignment.started_at:
        assignment.started_at = timezone.now()
        assignment.status = 'started'
        assignment.save()

    # Resolve the student's set-specific component settings (duration, timer).
    # This ensures each set's deadline matches its own configuration, not the
    # structural slot which may have been created from a different set's defaults.
    effective_duration = component.duration_minutes
    effective_title = component.title
    if assignment.assigned_set_id:
        set_comp_meta = ClapSetComponent.objects.filter(
            set_id=assignment.assigned_set_id,
            test_type=component.test_type,
        ).values('duration_minutes', 'title').first()
        if set_comp_meta:
            effective_duration = set_comp_meta['duration_minutes']
            effective_title = set_comp_meta['title']

    # Create or retrieve ComponentAttempt — this is the server-issued deadline.
    # Skipped in read-only mode: the attempt already exists (component was submitted)
    # and we must not create a new one or modify the existing deadline.
    if read_only_mode:
        server_deadline_iso = None
        attempt_is_expired = True
    else:
        now = timezone.now()
        attempt, attempt_created = ComponentAttempt.objects.get_or_create(
            assignment=assignment,
            component=component,
            defaults={
                'started_at': now,
                'deadline': now + timezone.timedelta(minutes=effective_duration),
                'status': 'active',
            }
        )
        server_deadline_iso = attempt.deadline.isoformat()
        attempt_is_expired = attempt.is_expired()

    # ── Build set-item content map ─────────────────────────────────────────
    #
    # Maps order_index → ClapSetItem data for the student's assigned set.
    # 'id' is included so audio_block items can resolve their audio files
    # below without additional per-item DB queries.
    #
    # correct_option is intentionally excluded from .values() — we never
    # want it to reach the frontend, and excluding it here eliminates any
    # chance of accidental inclusion in the copied raw_content dict.
    #
    # DUPLICATE order_index DEFENCE
    # ──────────────────────────────
    # The DB has no UNIQUE constraint on (set_component_id, order_index)
    # because the table is managed=False.  Two items can share an index when:
    #   • Admin deleted an item then added a new one — old frontend sent
    #     items.length+1 which diverges from max(order_index) after a delete.
    #   • Two rapid consecutive adds raced before the row-lock was in place
    #     (fixed in set_items_handler, but historical data may already be dirty).
    #
    # Strategy: fetch in (order_index ASC, created_at ASC) order so the
    # first-created item always wins its natural slot.  Each duplicate gets
    # a deterministic synthetic index above the current max.  A runtime
    # structural slot is auto-created for the synthetic index (idempotent).
    # An ERROR is logged so the admin can run repair-set-order to fix the DB.
    #
    # This guarantees students ALWAYS see every question regardless of DB state.
    set_content_map: dict[int, dict] = {}
    if assignment.assigned_set_id:
        raw_set_items = list(ClapSetItem.objects.filter(
            set_component__set_id=assignment.assigned_set_id,
            set_component__test_type=component.test_type,
        ).values(
            'id', 'order_index', 'content', 'points', 'item_type', 'created_at',
        ).order_by('order_index', 'created_at'))  # stable tiebreak: earlier created wins

        _seen_oi: set = set()
        _synthetic_base = max(
            (si['order_index'] for si in raw_set_items), default=0
        )
        _synthetic_n = 0
        for si in raw_set_items:
            oi = si['order_index']
            if oi not in _seen_oi:
                set_content_map[oi] = si
                _seen_oi.add(oi)
            else:
                # Duplicate: assign a synthetic index beyond max so the item
                # is still delivered to the student without overwriting another.
                _synthetic_n += 1
                synthetic_oi = _synthetic_base + _synthetic_n
                set_content_map[synthetic_oi] = {**si, 'order_index': synthetic_oi}
                logger.error(
                    'DUPLICATE order_index=%d in ClapSetItem: '
                    'assignment=%s set=%s component=%s set_item=%s — '
                    'remapped to synthetic index=%d. '
                    'Run POST /api/admin/clap-tests/<id>/repair-set-order to '
                    'permanently fix the underlying data.',
                    oi, assignment_id, assignment.assigned_set_id,
                    component_id, si['id'], synthetic_oi,
                )

    # ── Fetch structural slot items for this component ─────────────────────
    #
    # Three cases:
    #
    #  A) Student has a set AND set_content_map is populated (the normal pure-set
    #     flow): fetch structural slots, then filter to only the order_indices that
    #     exist in their set.  Content is overlaid from ClapSetItem below.
    #
    #  B) Student has a set BUT set_content_map is EMPTY: the admin assigned this
    #     student a set that has no questions for this component yet.  Return an
    #     empty list — DO NOT fall back to structural slots that were created by
    #     another set and hold no content (content={}), which would render as
    #     completely blank questions in the UI.
    #
    #  C) Student has NO set (assigned_set_id is None): legacy / base-editor flow.
    #     Serve structural ClapTestItem directly (content was added via the master
    #     test editor, not the set editor).
    items = list(ClapTestItem.objects.filter(component=component).order_by('order_index'))

    if assignment.assigned_set_id:
        if not set_content_map:
            # Case B — set assigned but no questions in this component
            items = []
        else:
            # Case A — build a fast lookup of existing structural slots by order_index
            structural_by_index = {item.order_index: item for item in items}

            # ── Runtime structural slot repair ─────────────────────────────
            # _ensure_structural_slots is called when items are CREATED via the
            # admin set editor.  However, if an admin changed an item's
            # order_index via direct PUT/PATCH before the fix was deployed, or
            # if the slot was somehow missed (crash mid-create, import script
            # bypassing the API, etc.), a ClapSetItem can exist without a
            # matching structural ClapTestItem.  Without a slot, that item
            # would be silently dropped from the student's view.
            #
            # We detect and repair this on every student access:
            #   1. Compare set_content_map indices against existing structural slots.
            #   2. For any missing index: get_or_create the structural slot.
            #   3. Refresh the items list to include newly created slots.
            #
            # get_or_create is idempotent — concurrent student requests for the
            # same slot race to a single INSERT; the loser retries the SELECT.
            # This is safe without a DB unique constraint because get_or_create
            # uses a SELECT → INSERT sequence with IntegrityError retry internally.
            missing_indices = [
                idx for idx in set_content_map
                if idx not in structural_by_index
            ]
            if missing_indices:
                logger.warning(
                    "student_test_items: auto-repairing %d missing structural slot(s) "
                    "for assignment=%s component=%s indices=%s",
                    len(missing_indices), assignment_id, component_id, missing_indices,
                )
                with transaction.atomic():
                    for idx in missing_indices:
                        si = set_content_map[idx]
                        slot, created = ClapTestItem.objects.get_or_create(
                            component=component,
                            order_index=idx,
                            defaults={
                                'item_type': si['item_type'] or 'mcq',
                                'points': si['points'] or 0,
                                'content': {},
                            },
                        )
                        structural_by_index[idx] = slot
                        if created:
                            logger.info(
                                "Auto-created structural slot: component=%s order_index=%d",
                                component_id, idx,
                            )

                # Refresh the full items list after repair so the ordering is correct
                items = list(ClapTestItem.objects.filter(
                    component=component
                ).order_by('order_index'))
                structural_by_index = {item.order_index: item for item in items}

            # Keep only items whose order_index exists in the student's set
            items = [
                structural_by_index[idx]
                for idx in sorted(set_content_map.keys())
                if idx in structural_by_index
            ]

    # ── Bulk audio file resolution for audio_block items ──────────────────
    #
    # The admin _item_to_dict() resolves audio file metadata at query time.
    # The student endpoint must do the same so students can actually hear
    # audio blocks.  We resolve in bulk (two queries max) to avoid N per-item
    # DB hits regardless of how many audio_block items are in the component.
    #
    # Priority:
    #   1. Set-specific audio (AdminAudioFile.set_item_id is set) → 'set-items'
    #   2. Base-item audio (AdminAudioFile.item_id is set, same order_index) → 'clap-items'
    #   3. No audio found → has_audio_file = False
    from api.models import AdminAudioFile

    # Build a set of set_item UUIDs that have audio (bulk query — 1 hit)
    set_item_ids_in_map = {
        si['id'] for si in set_content_map.values()
        if si.get('item_type') == 'audio_block'
    }
    set_items_with_audio: set = set()
    if set_item_ids_in_map:
        set_items_with_audio = set(
            AdminAudioFile.objects.filter(
                set_item_id__in=set_item_ids_in_map
            ).values_list('set_item_id', flat=True)
        )

    # Build a map of order_index → base ClapTestItem.id for fallback audio
    # (only needed for audio_block items without set-specific audio)
    base_audio_item_ids: dict[int, str] = {}   # order_index → ClapTestItem.id
    audio_block_indices_needing_fallback = [
        idx for idx, si in set_content_map.items()
        if si.get('item_type') == 'audio_block'
        and si['id'] not in set_items_with_audio
    ]
    if audio_block_indices_needing_fallback:
        # Structural items at these indices ARE the base items for fallback audio
        for item in items:
            if item.order_index in audio_block_indices_needing_fallback:
                base_audio_item_ids[item.order_index] = str(item.id)

        # Check which base items actually have an AdminAudioFile (bulk — 1 hit)
        base_items_with_audio: set = set()
        if base_audio_item_ids:
            base_items_with_audio = set(
                AdminAudioFile.objects.filter(
                    item_id__in=base_audio_item_ids.values()
                ).values_list('item_id', flat=True)
            )
    else:
        base_items_with_audio = set()

    # ── Get existing responses for this component ──────────────────────────
    responses = StudentClapResponse.objects.filter(
        assignment=assignment,
        item__component=component
    )
    response_map = {str(r.item.id): r.response_data for r in responses}

    items_data = []
    for item in items:
        set_si = set_content_map.get(item.order_index)

        # Content source: set-specific first (pure-set flow), then structural
        # slot content (legacy / fallback for tests migrated from old flow).
        if set_si:
            raw_content = (set_si['content'] or {}).copy()
            effective_points = set_si['points'] if set_si['points'] else item.points
            effective_type = set_si['item_type'] or item.item_type
        else:
            raw_content = (item.content or {}).copy()
            effective_points = item.points
            effective_type = item.item_type

        # NEVER send the answer key to the frontend
        raw_content.pop('correct_option', None)

        # ── Audio resolution for audio_block items ─────────────────────────
        # Mirrors the logic in admin _item_to_dict() so students receive the
        # same audio metadata.  We use the bulk-prefetched sets above so this
        # is O(1) per item — no additional DB queries in this loop.
        if effective_type == 'audio_block':
            if set_si and set_si['id'] in set_items_with_audio:
                # Priority 1: set-specific audio file
                raw_content['has_audio_file'] = True
                raw_content['audio_endpoint'] = 'set-items'
                raw_content['set_item_id'] = str(set_si['id'])
            else:
                # Priority 2: base/structural item audio (shared across sets)
                base_item_id = base_audio_item_ids.get(item.order_index)
                import uuid as _uuid
                if base_item_id and _uuid.UUID(base_item_id) in base_items_with_audio:
                    raw_content['has_audio_file'] = True
                    raw_content['audio_endpoint'] = 'clap-items'
                    raw_content['base_item_id'] = base_item_id
                else:
                    raw_content['has_audio_file'] = False

        items_data.append({
            'id': str(item.id),       # structural ClapTestItem.id (StudentClapResponse FK)
            'item_type': effective_type,
            'order_index': item.order_index,
            'points': effective_points,
            'content': raw_content,
            'saved_response': response_map.get(str(item.id)),
        })

    attempt_started_at = None
    if not read_only_mode:
        attempt_started_at = attempt.started_at.isoformat()

    return JsonResponse({
        'component': {
            'id': str(component.id),
            'title': effective_title,
            'duration_minutes': effective_duration,
            'server_deadline': server_deadline_iso,
            'attempt_started_at': attempt_started_at,
            'is_expired': attempt_is_expired,
            'read_only': read_only_mode,
        },
        'items': items_data
    })

@csrf_exempt
@require_http_methods(["POST"])
def submit_response(request, assignment_id):
    """
    POST: Submit a response for a single item.
    Enforces server-side deadline: rejects submissions after component deadline.
    Body: { "item_id": "uuid", "response_data": {...} }
    """
    import time
    from api.middleware.rate_limit import _get_redis, _rate_limited

    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    # Per-endpoint burst limit: 30 auto-saves per 10-second window per user.
    # 30/10 s = 3 saves/second — enough for the fastest MCQ-clicking student
    # (50 questions × avg 1.3 s each = ~6 saves per 10-second bucket at peak).
    # The old limit of 5/10 s caused legitimate answers to be rate-limited and
    # silently dropped whenever a student answered faster than 1 every 2 seconds.
    # Fails open if Redis is unavailable (never blocks legitimate traffic).
    _rc = _get_redis()
    if _rc:
        _bucket = int(time.time()) // 10
        _key = f'rl:submit:{user.id}:{_bucket}'
        _limited, _, _ttl = _rate_limited(_rc, _key, limit=30, window_seconds=10)
        if _limited:
            _resp = JsonResponse({'error': 'Too many submissions', 'code': 'RATE_LIMITED'}, status=429)
            _resp['Retry-After'] = str(_ttl)
            return _resp

    try:
        assignment = StudentClapAssignment.objects.select_related('clap_test').get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    # C4: Reject if assignment already completed
    if assignment.status == 'completed':
        return JsonResponse({'error': 'Assignment already completed', 'code': 'ALREADY_COMPLETED'}, status=403)

    # C3: Enforce global deadline server-side
    test = assignment.clap_test
    if test.global_deadline and timezone.now() > test.global_deadline:
        return JsonResponse({'error': 'Test time has expired', 'code': 'GLOBAL_DEADLINE_EXCEEDED'}, status=403)

    # C5: Reject oversized payloads (1 MB limit)
    if len(request.body) > 1_048_576:
        return JsonResponse({'error': 'Response too large', 'code': 'PAYLOAD_TOO_LARGE'}, status=413)

    try:
        data = json.loads(request.body)
        item_id = data.get('item_id')
        response_data = data.get('response_data')

        if not item_id:
            return JsonResponse({'error': 'Item ID required'}, status=400)

        # Enforce server-side component deadline
        try:
            item_check = ClapTestItem.objects.select_related('component').get(id=item_id)
            attempt = ComponentAttempt.objects.filter(
                assignment=assignment,
                component=item_check.component
            ).first()
            if attempt and attempt.is_expired() and attempt.status == 'active':
                attempt.status = 'expired'
                attempt.auto_submitted = True
                attempt.save(update_fields=['status', 'auto_submitted'])
                # DO NOT return 403 here.  Returning 403 on the first save after
                # the component timer expires silently drops that answer: the client
                # retries and succeeds (status='expired' → condition is false on
                # retry), so every subsequent answer saves fine but the very first
                # MCQ after timer expiry is permanently lost.  The status transition
                # above is all that's needed — let the save proceed.
        except ClapTestItem.DoesNotExist:
            return JsonResponse({'error': 'Item not found'}, status=404)

        item = item_check

        # Verify item belongs to the assigned test
        if item.component.clap_test_id != assignment.clap_test_id:
            return JsonResponse({'error': 'Item does not belong to this assignment'}, status=400)

        # Create or update response
        response, created = StudentClapResponse.objects.update_or_create(
            assignment=assignment,
            item=item,
            defaults={
                'response_data': response_data,
                'updated_at': timezone.now()
            }
        )

        # Auto-evaluate MCQ items
        # NOTE: This is a BEST-EFFORT real-time grade for immediate UX feedback.
        # The authoritative score is always computed by the score_rule_based
        # Celery task at submission time, which re-evaluates from scratch.
        if item.item_type == 'mcq':
            try:
                # Support both response_data formats:
                #   dict  → {"selected_option": 2}  (legacy / explicit)
                #   int   → 2                        (current frontend sends bare index)
                if isinstance(response_data, dict):
                    raw_selected = response_data.get('selected_option')
                elif isinstance(response_data, (int, float)):
                    raw_selected = int(response_data)
                else:
                    raw_selected = None

                selected_option = None
                if raw_selected is not None:
                    try:
                        selected_option = int(raw_selected)
                    except (TypeError, ValueError):
                        pass

                # ── Answer-key + points lookup ────────────────────────────────
                # Priority 1: ClapSetItem for the student's assigned set
                #   → correct_option AND points (authoritative for set-based tests)
                # Priority 2: Base ClapTestItem.content / item.points
                # This mirrors the exact same priority order as score_rule_based.
                correct_option = None
                effective_points = item.points   # default: structural slot points

                if assignment.assigned_set_id:
                    set_item = ClapSetItem.objects.filter(
                        set_component__set_id=assignment.assigned_set_id,
                        set_component__test_type=item.component.test_type,
                        order_index=item.order_index,
                    ).values('content', 'points').first()
                    if set_item:
                        co = (set_item['content'] or {}).get('correct_option')
                        if co is not None:
                            try:
                                correct_option = int(co)
                            except (TypeError, ValueError):
                                pass
                        # Use set item's points if explicitly configured.
                        # The structural slot's points can be stale when the admin
                        # edits a question's point value after initial creation
                        # (get_or_create does not update existing rows).
                        if set_item['points'] is not None:
                            effective_points = set_item['points']

                # Fall back to base item answer key
                if correct_option is None:
                    base_co = (item.content or {}).get('correct_option')
                    if base_co is not None:
                        try:
                            correct_option = int(base_co)
                        except (TypeError, ValueError):
                            pass

                if correct_option is None:
                    # No answer key found — mark as unevaluated (pipeline will score it)
                    logger.warning(
                        'No correct_option for item %s (set=%s) — MCQ not auto-graded at submission time',
                        item.id, assignment.assigned_set_id,
                    )
                elif selected_option is not None and selected_option == correct_option:
                    response.is_correct = True
                    response.marks_awarded = effective_points
                    logger.debug(
                        'MCQ CORRECT: assignment=%s set=%s component=%s order=%s '
                        'selected=%s correct=%s points=%s',
                        assignment.id, assignment.assigned_set_id,
                        item.component.test_type, item.order_index,
                        selected_option, correct_option, effective_points,
                    )
                else:
                    response.is_correct = False
                    response.marks_awarded = 0
                    logger.debug(
                        'MCQ WRONG: assignment=%s set=%s component=%s order=%s '
                        'selected=%s correct=%s',
                        assignment.id, assignment.assigned_set_id,
                        item.component.test_type, item.order_index,
                        selected_option, correct_option,
                    )

                response.save()
            except (ValueError, TypeError, AttributeError) as e:
                logger.warning('Error evaluating MCQ response for item %s: %s', item.id, e)

        return JsonResponse({'message': 'Response saved', 'response_id': str(response.id)})

    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Item not found'}, status=404)
    except Exception as e:
        logger.error(f"Error submitting response: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def finish_component(request, assignment_id, component_id):
    """
    POST: Mark a component as finished.
    - Validates the student owns the assignment.
    - Records completion on ComponentAttempt row.
    - If all components are done, marks the assignment as completed.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    # C4: Idempotent — if already completed, return success without re-processing
    if assignment.status == 'completed':
        return JsonResponse({'message': 'Component finished successfully', 'component_id': str(component_id), 'all_components_done': True})

    try:
        component = ClapTestComponent.objects.get(id=component_id, clap_test=assignment.clap_test)
    except ClapTestComponent.DoesNotExist:
        return JsonResponse({'error': 'Component not found'}, status=404)

    now = timezone.now()

    # Create or update ComponentAttempt to completed
    attempt, created = ComponentAttempt.objects.get_or_create(
        assignment=assignment,
        component=component,
        defaults={
            'started_at': now,
            'deadline': now + timezone.timedelta(minutes=component.duration_minutes),
            'status': 'completed',
            'completed_at': now,
        }
    )
    if not created and attempt.status == 'active':
        attempt.status = 'completed'
        attempt.completed_at = now
        attempt.save(update_fields=['status', 'completed_at'])

    # Check if ALL components for this test are now done
    all_component_ids = set(str(c.id) for c in assignment.clap_test.components.all())
    done_component_ids = set(
        str(cid) for cid in ComponentAttempt.objects.filter(
            assignment=assignment,
            status__in=['completed', 'expired']
        ).values_list('component_id', flat=True)
    )
    all_done = all_component_ids <= done_component_ids

    if all_done and assignment.status != 'completed':
        # All components are done — finalize the assignment and dispatch the full
        # scoring pipeline (MCQ re-score + writing + speaking + report).
        # _finalize_and_dispatch is idempotent and handles the completed-at update,
        # AssessmentSubmission creation, and check_text_similarity internally.
        try:
            _finalize_and_dispatch(assignment, 'all_components_done')
        except Exception as dispatch_err:
            # Never fail the student response because of a pipeline error.
            # The Beat task / admin rescore can recover this later.
            logger.error(
                'finish_component_dispatch_failed assignment=%s error=%s',
                assignment_id, dispatch_err, exc_info=True,
            )

    return JsonResponse({
        'message': 'Component finished successfully',
        'component_id': str(component_id),
        'all_components_done': all_done
    })


@csrf_exempt
@require_http_methods(["POST"])
def log_malpractice_event(request, assignment_id):
    """
    POST /api/student/clap-assignments/{id}/malpractice-event
    Fire-and-forget from the student frontend on detected integrity events.
    Never interrupts or blocks the student session — always returns 200/400 quickly.
    Body: { "event_type": "tab_switch|fullscreen_exit|paste_attempt", "meta": {} }
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)

    try:
        data = json.loads(request.body)
        event_type = data.get('event_type', '')
        meta = data.get('meta', {})

        VALID_TYPES = {'tab_switch', 'fullscreen_exit', 'paste_attempt'}
        if event_type not in VALID_TYPES:
            return JsonResponse({'error': 'Invalid event type'}, status=400)

        MalpracticeEvent.objects.create(
            assignment=assignment,
            event_type=event_type,
            meta=meta if isinstance(meta, dict) else {},
        )
        logger.info(
            f"Malpractice [{event_type}] assignment={assignment_id} student={user.id} meta={meta}"
        )
        return JsonResponse({'logged': True})
    except Exception as e:
        logger.error(f"Error logging malpractice event for {assignment_id}: {e}")
        return JsonResponse({'error': 'Failed to log event'}, status=500)


# ── Auto-submit helpers ────────────────────────────────────────────────────────

def _finalize_and_dispatch(assignment, reason: str):
    """
    Atomic, idempotent finalization helper.  Called by both the client-facing
    auto_submit_assignment endpoint and the server-side Beat task.

    Steps (inside a single SELECT FOR UPDATE transaction):
      1. Lock assignment row — prevents concurrent double-dispatch.
      2. If already completed → return existing AssessmentSubmission (idempotent).
      3. If never started (status='assigned') → nothing to submit, return None.
      4. Ensure ComponentAttempt exists for EVERY component in the test:
            active   → mark expired + auto_submitted=True
            missing  → create with status='expired', auto_submitted=True
            completed/expired → leave untouched
      5. Mark assignment completed (status, completed_at).
      6. get_or_create AssessmentSubmission keyed on a deterministic
         idempotency_key scoped to this assignment — concurrent callers collide
         on the unique constraint and the losing writer gets the winner's row.

    Dispatches the Celery pipeline OUTSIDE the transaction to avoid holding DB
    locks during broker publish.

    Returns:
        (AssessmentSubmission | None, created: bool)
        created=True  → pipeline was dispatched by this call
        created=False → submission already existed; no double-dispatch
    """
    # Lazy import avoids circular dependency at module load time.
    # By call time both modules are already in sys.modules.
    from api.views.submissions import _dispatch_pipeline

    with transaction.atomic():
        # Lock the assignment row for the duration of this transaction.
        # Concurrent auto-submit calls (client + Beat task arriving simultaneously)
        # will queue behind the lock and receive the already-completed state
        # on the second pass — no double pipeline dispatch.
        try:
            locked = StudentClapAssignment.objects.select_for_update().get(
                id=assignment.id
            )
        except StudentClapAssignment.DoesNotExist:
            raise ValueError(f'Assignment {assignment.id} not found')

        # ── Idempotency guard: already completed ──────────────────────────────
        if locked.status == 'completed':
            existing_sub = AssessmentSubmission.objects.filter(
                user=locked.student,
                assessment=locked.clap_test,
            ).order_by('-created_at').first()
            logger.info(
                'auto_submit_already_completed assignment=%s reason=%s submission=%s',
                assignment.id, reason,
                str(existing_sub.id) if existing_sub else 'none',
            )
            return existing_sub, False

        # ── Never-started guard ───────────────────────────────────────────────
        if locked.status == 'assigned':
            logger.info(
                'auto_submit_never_started assignment=%s reason=%s — skipping',
                assignment.id, reason,
            )
            return None, False

        now = timezone.now()

        # ── Ensure ComponentAttempt for every component ───────────────────────
        all_components = list(
            ClapTestComponent.objects.filter(clap_test=locked.clap_test)
        )
        for comp in all_components:
            attempt, created_attempt = ComponentAttempt.objects.get_or_create(
                assignment=locked,
                component=comp,
                defaults={
                    'started_at': now,
                    'deadline': now,
                    'status': 'expired',
                    'auto_submitted': True,
                },
            )
            if not created_attempt and attempt.status == 'active':
                ComponentAttempt.objects.filter(id=attempt.id).update(
                    status='expired',
                    auto_submitted=True,
                )

        # ── Mark assignment completed ─────────────────────────────────────────
        StudentClapAssignment.objects.filter(id=locked.id).update(
            status='completed',
            completed_at=now,
        )

        # ── get_or_create submission (dedup guard) ────────────────────────────
        # idempotency_key is deterministic and scoped to this assignment +
        # attempt_number so that:
        #   - Concurrent callers (client beacon + Beat task arriving together)
        #     collide on the unique constraint → one wins, one is a no-op
        #   - Retests get a FRESH submission on every attempt — grant_retest
        #     increments attempt_number on the assignment row BEFORE the student
        #     can start, so the key is guaranteed unique per attempt regardless
        #     of how many retests have been granted.
        #   - First-attempt key:   auto:<assignment-uuid>:1
        #   - First retest key:    auto:<assignment-uuid>:2
        #   - N-th retest key:     auto:<assignment-uuid>:N+1
        #
        # IMPORTANT: getattr guard handles the case where attempt_number is None
        # (legacy rows created before the field was added) or 0 (impossible but
        # defensive). Both fall back to 1, matching the first-attempt key.
        attempt_number = getattr(locked, 'attempt_number', 1) or 1
        idempotency_key = f'auto:{locked.id}:{attempt_number}'
        submission, sub_created = AssessmentSubmission.objects.get_or_create(
            idempotency_key=idempotency_key,
            defaults={
                'user': locked.student,
                'assessment': locked.clap_test,
                'status': AssessmentSubmission.STATUS_PENDING,
                'correlation_id': str(locked.id),
            },
        )

    # ── Dispatch pipeline outside the transaction ─────────────────────────────
    if sub_created:
        dispatched = _dispatch_pipeline(
            submission.id, correlation_id=str(assignment.id)
        )
        logger.info(
            'auto_submit_finalized assignment=%s reason=%s submission=%s dispatched=%s',
            assignment.id, reason, submission.id, dispatched,
        )
        # Fire async text-similarity check (fire-and-forget, non-blocking)
        try:
            from api.tasks import check_text_similarity
            check_text_similarity.delay(str(assignment.id))
        except Exception as sim_err:
            logger.warning(
                'auto_submit_similarity_task_error assignment=%s error=%s',
                assignment.id, sim_err,
            )
    else:
        logger.info(
            'auto_submit_submission_already_exists assignment=%s reason=%s submission=%s',
            assignment.id, reason, submission.id,
        )

    return submission, sub_created


@csrf_exempt
@require_http_methods(["POST"])
def auto_submit_assignment(request, assignment_id):
    """
    POST /api/student/clap-assignments/{id}/auto-submit

    Unified, idempotent auto-submit endpoint.  Safe to call multiple times.

    Triggered by:
      - Frontend component-page timer expiry
      - Frontend hub-page timer expiry
      - Frontend pagehide/beforeunload keepalive fetch
      - Malpractice force-submit (tab limit / fullscreen limit)
      - Server Beat task (auto_submit_expired_assignments) — calls _finalize_and_dispatch directly

    Rate limit: 5 calls per 30-second window per user.
    Returns: { submission_id, status, already_completed }
    """
    import time
    from api.middleware.rate_limit import _get_redis, _rate_limited

    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    # Per-user rate limit: 5 calls per 30-second window.
    # Tolerates simultaneous client + beacon + timer triggers without blocking
    # legitimate retries on unstable connections.
    _rc = _get_redis()
    if _rc:
        _bucket = int(time.time()) // 30
        _key = f'rl:autosubmit:{user.id}:{_bucket}'
        _limited, _, _ttl = _rate_limited(_rc, _key, limit=5, window_seconds=30)
        if _limited:
            _resp = JsonResponse(
                {'error': 'Too many auto-submit requests', 'code': 'RATE_LIMITED'},
                status=429,
            )
            _resp['Retry-After'] = str(_ttl)
            return _resp

    try:
        assignment = StudentClapAssignment.objects.select_related(
            'clap_test'
        ).get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        data = {}

    reason = data.get('reason', 'client_unknown')
    VALID_REASONS = {'client_timer', 'client_malpractice', 'client_unload', 'client_unknown'}
    if reason not in VALID_REASONS:
        reason = 'client_unknown'

    try:
        submission, created = _finalize_and_dispatch(assignment, reason)
    except Exception as exc:
        logger.error(
            'auto_submit_assignment error assignment=%s student=%s reason=%s error=%s',
            assignment_id, user.id, reason, exc,
        )
        return JsonResponse(
            {'error': 'Auto-submit failed — please retry or contact support'},
            status=500,
        )

    if submission is None:
        # Assignment was never started
        return JsonResponse({
            'submission_id': None,
            'status': assignment.status,
            'already_completed': False,
            'message': 'Assignment was not started — nothing to submit',
        }, status=200)

    return JsonResponse({
        'submission_id': str(submission.id),
        'status': submission.status,
        'already_completed': not created,
    }, status=200)

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
from django.db.models import Prefetch
import json
import logging
from api.models import (
    User, ClapTest, ClapTestComponent, StudentClapAssignment,
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
        ).select_related('clap_test').prefetch_related('clap_test__components').order_by('-assigned_at'))

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

        # DEBUG: log so we can confirm the new code is running and see DB values
        logger.info(
            f"[TIMER_DEBUG v2] student={user.id} "
            f"test_ids={test_ids} "
            f"fresh_deadlines={fresh_deadlines}"
        )

        data = []
        for assignment in assignments:
            components = []
            for comp in assignment.clap_test.components.all():
                components.append({
                    'id': str(comp.id),
                    'type': comp.test_type,
                    'title': comp.title,
                    'duration': comp.duration_minutes,
                    'timer_enabled': comp.timer_enabled,
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

    # Effective duration: global_duration_minutes > sum of component durations
    test = assignment.clap_test
    if test.global_duration_minutes:
        total_duration = test.global_duration_minutes
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

    # Block access to components of already-completed or expired assignments
    if assignment.status in ('completed', 'expired', 'test_deleted'):
        return JsonResponse({'error': 'Assignment already completed'}, status=403)

    # Verify component belongs to the assigned test
    try:
        component = ClapTestComponent.objects.get(id=component_id, clap_test=assignment.clap_test)
    except ClapTestComponent.DoesNotExist:
        return JsonResponse({'error': 'Component not found in this test'}, status=404)

    # If assignment hasn't started, mark it as started
    if not assignment.started_at:
        assignment.started_at = timezone.now()
        assignment.status = 'started'
        assignment.save()

    # Create or retrieve ComponentAttempt — this is the server-issued deadline
    now = timezone.now()
    attempt, attempt_created = ComponentAttempt.objects.get_or_create(
        assignment=assignment,
        component=component,
        defaults={
            'started_at': now,
            'deadline': now + timezone.timedelta(minutes=component.duration_minutes),
            'status': 'active',
        }
    )
    server_deadline_iso = attempt.deadline.isoformat()
    attempt_is_expired = attempt.is_expired()

    # Get base items for this component (used for item_id, item_type, and points;
    # content may be overridden per-set below).
    items = list(ClapTestItem.objects.filter(component=component).order_by('order_index'))

    # Build set-item content map: order_index → ClapSetItem
    # When the student has an assigned set, we serve their set's question content
    # (question text, options) instead of the base content.  The item_id returned
    # to the frontend is still the ClapTestItem.id so StudentClapResponse links
    # correctly.  correct_option is NEVER sent to the frontend regardless of source.
    set_content_map: dict[int, dict] = {}
    if assignment.assigned_set_id:
        for si in ClapSetItem.objects.filter(
            set_component__set_id=assignment.assigned_set_id,
            set_component__test_type=component.test_type,
        ).values('order_index', 'content', 'points', 'item_type'):
            set_content_map[si['order_index']] = si

    # Get existing responses for this component
    responses = StudentClapResponse.objects.filter(
        assignment=assignment,
        item__component=component
    )
    response_map = {str(r.item.id): r.response_data for r in responses}

    items_data = []
    for item in items:
        set_si = set_content_map.get(item.order_index)

        # Choose content source: set-specific first, then base
        if set_si:
            raw_content = (set_si['content'] or {}).copy()
            # Use set item points if provided and > 0, else fall back to base
            effective_points = set_si['points'] if set_si['points'] else item.points
            effective_type = set_si['item_type'] or item.item_type
        else:
            raw_content = (item.content or {}).copy()
            effective_points = item.points
            effective_type = item.item_type

        # NEVER send the answer key to the frontend
        raw_content.pop('correct_option', None)

        items_data.append({
            'id': str(item.id),       # Always ClapTestItem.id (response FK target)
            'item_type': effective_type,
            'order_index': item.order_index,
            'points': effective_points,
            'content': raw_content,
            'saved_response': response_map.get(str(item.id)),
        })

    return JsonResponse({
        'component': {
            'id': str(component.id),
            'title': component.title,
            'duration_minutes': component.duration_minutes,
            'server_deadline': server_deadline_iso,
            'attempt_started_at': attempt.started_at.isoformat(),
            'is_expired': attempt_is_expired,
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

                # ── Answer-key lookup ─────────────────────────────────────────
                # Priority 1: ClapSetItem for the student's assigned set
                # Priority 2: Base ClapTestItem.content
                # This mirrors the exact same priority order as score_rule_based.
                correct_option = None

                if assignment.assigned_set_id:
                    set_item = ClapSetItem.objects.filter(
                        set_component__set_id=assignment.assigned_set_id,
                        set_component__test_type=item.component.test_type,
                        order_index=item.order_index,
                    ).values('content').first()
                    if set_item:
                        co = (set_item['content'] or {}).get('correct_option')
                        if co is not None:
                            try:
                                correct_option = int(co)
                            except (TypeError, ValueError):
                                pass

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
                    response.marks_awarded = item.points
                    logger.debug(
                        'MCQ CORRECT: assignment=%s set=%s component=%s order=%s '
                        'selected=%s correct=%s points=%s',
                        assignment.id, assignment.assigned_set_id,
                        item.component.test_type, item.order_index,
                        selected_option, correct_option, item.points,
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
        # idempotency_key is deterministic and scoped to this assignment so:
        #   - Concurrent callers collide on the unique constraint → one wins
        #   - Retests (new assignment_id) always generate a fresh submission
        idempotency_key = f'auto:{locked.id}'
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

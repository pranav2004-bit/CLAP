from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db.models import Prefetch
import json
import logging
from api.models import (
    User, ClapTest, ClapTestComponent, StudentClapAssignment,
    ClapTestItem, StudentClapResponse, ComponentAttempt, MalpracticeEvent
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
        assignments = StudentClapAssignment.objects.filter(
            student=user
        ).select_related('clap_test').prefetch_related('clap_test__components').order_by('-assigned_at')

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

            data.append({
                'assignment_id': str(assignment.id),
                'test_id': str(assignment.clap_test.id),
                'test_name': assignment.clap_test.name,
                'status': assignment.status,
                'assigned_at': assignment.assigned_at.isoformat() if assignment.assigned_at else None,
                'started_at': assignment.started_at.isoformat() if assignment.started_at else None,
                'completed_at': assignment.completed_at.isoformat() if assignment.completed_at else None,
                'retest_granted': assignment.retest_granted,
                'components': components
            })

        return JsonResponse({'assignments': data})

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

    # Get items
    items = ClapTestItem.objects.filter(component=component).order_by('order_index')

    # Get existing responses for this component
    responses = StudentClapResponse.objects.filter(
        assignment=assignment,
        item__component=component
    )
    response_map = {str(r.item.id): r.response_data for r in responses}

    items_data = []
    for item in items:
        # Sanitize content to remove answers if it's a quiz
        content = item.content.copy()
        if item.item_type == 'mcq' and 'correct_option' in content:
            del content['correct_option']  # Don't send answer to frontend!

        items_data.append({
            'id': str(item.id),
            'item_type': item.item_type,
            'order_index': item.order_index,
            'points': item.points,
            'content': content,
            'saved_response': response_map.get(str(item.id))
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

    # Per-endpoint burst limit: 5 auto-saves per 10-second window per user.
    # Fails open if Redis is unavailable (never blocks legitimate traffic).
    _rc = _get_redis()
    if _rc:
        _bucket = int(time.time()) // 10
        _key = f'rl:submit:{user.id}:{_bucket}'
        _limited, _, _ttl = _rate_limited(_rc, _key, limit=5, window_seconds=10)
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
                return JsonResponse({'error': 'Component time limit exceeded'}, status=403)
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
        if item.item_type == 'mcq' and 'correct_option' in item.content:
            try:
                selected_option = response_data.get('selected_option')
                correct_option = item.content.get('correct_option')

                if selected_option is not None and int(selected_option) == int(correct_option):
                    response.is_correct = True
                    response.marks_awarded = item.points
                else:
                    response.is_correct = False
                    response.marks_awarded = 0

                response.save()
            except (ValueError, TypeError) as e:
                logger.warning(f"Error evaluating MCQ response: {e}")

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
        assignment.status = 'completed'
        assignment.completed_at = now
        assignment.save(update_fields=['status', 'completed_at'])
        logger.info(f"Assignment {assignment_id} marked completed for student {user.id}")
        # Kick off async post-test text similarity check (fire-and-forget, never blocks student)
        try:
            from api.tasks import check_text_similarity
            check_text_similarity.delay(str(assignment_id))
        except Exception as task_err:
            logger.warning(f"Could not enqueue similarity task for {assignment_id}: {task_err}")

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



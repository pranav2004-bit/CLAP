from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import transaction
from django.db.models import Prefetch
from datetime import timedelta
import json
import logging
from api.models import (
    User, ClapTest, ClapTestComponent, StudentClapAssignment,
    ClapTestItem, StudentClapResponse,
    ClapSetComponent, ClapSetItem  # Sets feature
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
                    'timer_enabled': comp.timer_enabled
                })

            data.append({
                'assignment_id': str(assignment.id),
                'test_id': str(assignment.clap_test.id),
                'test_name': assignment.clap_test.name,
                'global_duration_minutes': assignment.clap_test.global_duration_minutes,
                'status': assignment.status,
                'assigned_at': assignment.assigned_at.isoformat() if assignment.assigned_at else None,
                'started_at': assignment.started_at.isoformat() if assignment.started_at else None,
                'completed_at': assignment.completed_at.isoformat() if assignment.completed_at else None,
                'components': components,
                # Retest fields
                'retest_granted': getattr(assignment, 'retest_granted', False),
                'attempt_number': getattr(assignment, 'attempt_number', 1) or 1,
            })
            
        return JsonResponse({'assignments': data})

    except Exception as e:
        logger.error(f"Error listing assignments: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def student_test_items(request, assignment_id, component_id):
    """
    GET: List items for a specific component within an assignment
    Ensures the student owns the assignment.
    Hides correct answers/evaluation logic.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.select_related(
            'assigned_set'
        ).get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    # ── SET-AWARE ROUTING ─────────────────────────────────────────────────────
    # If the student has been assigned a specific Set, serve questions from
    # that set's ClapSetComponent. Otherwise, fall back to ClapTestComponent.
    if assignment.assigned_set_id:
        # Verify the set_component belongs to the student's assigned set
        try:
            set_component = ClapSetComponent.objects.get(
                id=component_id,
                set=assignment.assigned_set
            )
        except ClapSetComponent.DoesNotExist:
            # Graceful fallback: it might be a ClapTestComponent ID from old clients
            try:
                ref_comp = ClapTestComponent.objects.get(id=component_id, clap_test=assignment.clap_test)
                # Find the matching set component by test_type
                set_component = ClapSetComponent.objects.filter(
                    set=assignment.assigned_set,
                    test_type=ref_comp.test_type
                ).first()
                if not set_component:
                    return JsonResponse({'error': 'Set component not found for this test type'}, status=404)
            except ClapTestComponent.DoesNotExist:
                return JsonResponse({'error': 'Component not found in this test'}, status=404)

        # Mark started
        if not assignment.started_at:
            assignment.started_at = timezone.now()
            assignment.status = 'started'
            assignment.save(update_fields=['started_at', 'status'])

        items = ClapSetItem.objects.filter(set_component=set_component).order_by('order_index')

        # Map saved responses (keyed by set_item_id stored in response_data)
        responses = StudentClapResponse.objects.filter(
            assignment=assignment,
            item__component=None  # Set items use a different join path
        )
        # Re-query using clap_set_item FK indirection via response_data
        # We store set_item_id in response.item_id using ClapTestItem.id trick.
        # Since ClapSetItem and ClapTestItem share no FK, we store
        # set_item_id as a string key in response_data for now.
        # A cleaner approach: use the StudentClapResponse.item field as set_item_id
        # by treating ClapSetItem.id as the item_id. This works because UUIDs are unique
        # across all tables. The ORM FK still points to ClapTestItem table but we
        # intercept at the DB level via raw query.
        from django.db import connection
        set_item_ids = [str(i.id) for i in items]
        response_map = {}
        if set_item_ids:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT item_id, response_data FROM student_clap_responses '
                    'WHERE assignment_id = %s AND item_id = ANY(%s)',
                    [str(assignment.id), set_item_ids]
                )
                for row in cursor.fetchall():
                    response_map[str(row[0])] = row[1]

        items_data = []
        for item in items:
            content = item.content.copy() if item.content else {}
            if item.item_type == 'mcq' and 'correct_option' in content:
                del content['correct_option']
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
                'id': str(set_component.id),
                'title': set_component.title,
                'duration_minutes': set_component.duration_minutes
            },
            'items': items_data,
            'set_label': assignment.assigned_set_label,  # Informational only
        })

    # ── DEFAULT ROUTING (No set assigned — original behavior) ─────────────────
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
            del content['correct_option'] # Don't send answer to frontend!
            
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
            'duration_minutes': component.duration_minutes
        },
        'items': items_data
    })

@csrf_exempt
@require_http_methods(["POST"])
def submit_response(request, assignment_id):
    """
    POST: Submit a response for a single item
    Body: { "item_id": "uuid", "response_data": {...} }
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    try:
        data = json.loads(request.body)
        item_id = data.get('item_id')
        response_data = data.get('response_data')

        if not item_id:
            return JsonResponse({'error': 'Item ID required'}, status=400)

        # ── SET-AWARE ITEM LOOKUP ────────────────────────────────────────────
        # First try ClapTestItem (default), then ClapSetItem (set mode)
        item = None
        is_set_item = False
        try:
            item = ClapTestItem.objects.get(id=item_id)
            # Verify it belongs to the test
            if item.component.clap_test_id != assignment.clap_test_id:
                return JsonResponse({'error': 'Item does not belong to this assignment'}, status=400)
        except ClapTestItem.DoesNotExist:
            # Try set item
            if assignment.assigned_set_id:
                try:
                    set_item = ClapSetItem.objects.select_related('set_component__set').get(
                        id=item_id,
                        set_component__set__clap_test=assignment.clap_test
                    )
                    is_set_item = True
                except ClapSetItem.DoesNotExist:
                    return JsonResponse({'error': 'Item not found'}, status=404)
            else:
                return JsonResponse({'error': 'Item not found'}, status=404)

        if is_set_item:
            # ── SAVE RESPONSE FOR SET ITEM via raw SQL ──────────────────────
            # We store set_item.id as item_id in student_clap_responses.
            # The FK constraint is on clap_test_items, so we bypass ORM and use raw SQL.
            from django.db import connection
            import uuid as uuid_module
            with connection.cursor() as cursor:
                cursor.execute(
                    '''
                    INSERT INTO student_clap_responses (id, assignment_id, item_id, response_data, created_at, updated_at)
                    VALUES (%s, %s, %s, %s::jsonb, NOW(), NOW())
                    ON CONFLICT (assignment_id, item_id)
                    DO UPDATE SET response_data = EXCLUDED.response_data, updated_at = NOW()
                    RETURNING id
                    ''',
                    [str(uuid_module.uuid4()), str(assignment.id), str(set_item.id),
                     json.dumps(response_data)]
                )
                row = cursor.fetchone()
                response_id = str(row[0]) if row else str(uuid_module.uuid4())

            # Auto-evaluate MCQ set items
            if set_item.item_type == 'mcq' and 'correct_option' in set_item.content:
                try:
                    selected = response_data.get('selected_option')
                    correct = set_item.content.get('correct_option')
                    is_correct = selected is not None and int(selected) == int(correct)
                    marks = set_item.points if is_correct else 0
                    with connection.cursor() as cursor:
                        cursor.execute(
                            'UPDATE student_clap_responses SET is_correct=%s, marks_awarded=%s '
                            'WHERE assignment_id=%s AND item_id=%s',
                            [is_correct, marks, str(assignment.id), str(set_item.id)]
                        )
                except (ValueError, TypeError) as e:
                    logger.warning(f'Error evaluating MCQ set item response: {e}')

            return JsonResponse({'message': 'Response saved', 'response_id': response_id})

        # ── DEFAULT ITEM SAVE (original behavior) ────────────────────────────
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
                logger.warning(f'Error evaluating MCQ response: {e}')

        return JsonResponse({'message': 'Response saved', 'response_id': str(response.id)})

    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Item not found'}, status=404)
    except Exception as e:
        logger.error(f"Error submitting response: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def start_assignment(request, assignment_id):
    """
    POST: Mark assignment as started (records started_at timestamp once).
    Idempotent – if already started, returns the existing started_at.
    Used as the global timer anchor for the student bundle view.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.select_related('clap_test__components').get(
            id=assignment_id, student=user
        )
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    # Idempotent – only set once
    if not assignment.started_at:
        assignment.started_at = timezone.now()
        assignment.status = 'started'
        assignment.save(update_fields=['started_at', 'status'])

    clap_test  = assignment.clap_test
    components = clap_test.components.all()

    # Use explicit global_duration_minutes if admin set it, else sum of component durations
    if clap_test.global_duration_minutes is not None:
        total_duration_minutes = clap_test.global_duration_minutes
        timer_mode = 'manual'
    else:
        total_duration_minutes = sum(
            (comp.duration_minutes or 0) for comp in components
        ) or None
        timer_mode = 'auto'

    # ── Auto-initialize global_deadline (once, race-safe) ────────────────────
    # The FIRST student to call /start locks the deadline for the entire test.
    # Admin can override anytime via start-live-timer (force=True) or extend-timer.
    global_deadline = clap_test.global_deadline
    if not global_deadline and total_duration_minutes:
        with transaction.atomic():
            # Re-read under lock so only one writer wins the race
            test_locked = ClapTest.objects.select_for_update().get(id=clap_test.id)
            if not test_locked.global_deadline:
                deadline = assignment.started_at + timedelta(minutes=total_duration_minutes)
                test_locked.global_deadline = deadline
                test_locked.timer_extension_log = [{
                    'action':           'auto_start',
                    'duration_minutes': total_duration_minutes,
                    'deadline_utc':     deadline.isoformat(),
                    'at':               assignment.started_at.isoformat(),
                    'reason':           'Auto-initialized on first student start',
                }]
                test_locked.save(update_fields=['global_deadline', 'timer_extension_log'])
                global_deadline = deadline
                logger.info(
                    f"[TIMER] Auto-initialized global_deadline for test {clap_test.id} "
                    f"to {deadline.isoformat()} (duration: {total_duration_minutes}m)"
                )
            else:
                global_deadline = test_locked.global_deadline

    components_info = [
        {
            'id':               str(comp.id),
            'type':             comp.test_type,
            'timer_enabled':    comp.timer_enabled,
            'duration_minutes': comp.duration_minutes,
        }
        for comp in components
    ]

    now = timezone.now()
    return JsonResponse({
        'started_at':             assignment.started_at.isoformat(),
        'total_duration_minutes': total_duration_minutes,
        'global_deadline':        global_deadline.isoformat() if global_deadline else None,
        'server_time_utc':        now.isoformat(),
        'timer_mode':             timer_mode,
        'status':                 assignment.status,
        'components':             components_info,
    })


@csrf_exempt
@require_http_methods(["POST"])
def finish_component(request, assignment_id, component_id):
    """
    POST: Mark a component as finished.
    Auth-required. Idempotent.
    Records completion timestamp in assignment.metadata and marks assignment
    completed when all components are done.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'student':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        assignment = StudentClapAssignment.objects.get(id=assignment_id, student=user)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found'}, status=404)

    try:
        ClapTestComponent.objects.get(id=component_id, clap_test=assignment.clap_test)
    except ClapTestComponent.DoesNotExist:
        return JsonResponse({'error': 'Component not found'}, status=404)

    now = timezone.now()
    meta = assignment.metadata or {}
    completed = meta.get('completed_components', {})

    # Record completion timestamp (idempotent — keep earliest timestamp)
    if str(component_id) not in completed:
        completed[str(component_id)] = now.isoformat()
    meta['completed_components'] = completed
    assignment.metadata = meta

    # Check if ALL components for this test are done
    all_ids = set(
        str(cid) for cid in assignment.clap_test.components.values_list('id', flat=True)
    )
    all_done = all_ids and all_ids <= set(completed.keys())

    update_fields = ['metadata']
    if all_done and assignment.status not in ('completed', 'expired'):
        assignment.status = 'completed'
        assignment.completed_at = now
        update_fields += ['status', 'completed_at']

    assignment.save(update_fields=update_fields)

    return JsonResponse({
        'message': 'Component finished successfully',
        'component_id': str(component_id),
        'all_components_done': all_done,
    })

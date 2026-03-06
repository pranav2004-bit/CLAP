
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from api.models import ClapTestComponent, ClapSetComponent, ClapTest
from api.utils.jwt_utils import get_user_from_request
import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["GET", "PATCH"])
def clap_component_detail_handler(request, component_id):
    """
    GET: Get component details
    PATCH: Update component details (e.g. duration_minutes)
    """
    # Auth check
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        component = ClapTestComponent.objects.get(id=component_id)
    except ClapTestComponent.DoesNotExist:
        return JsonResponse({'error': 'Component not found'}, status=404)

    if request.method == "GET":
        return JsonResponse({
            'component': {
                'id': str(component.id),
                'test_type': component.test_type,
                'title': component.title,
                'max_marks': component.max_marks,
                'duration_minutes': component.duration_minutes,
                'timer_enabled': component.timer_enabled,
                'status': component.status
            }
        })

    elif request.method == "PATCH":
        try:
            data = json.loads(request.body)

            # Map frontend 'duration' to backend 'duration_minutes' if needed
            if 'duration' in data:
                component.duration_minutes = data['duration']
            elif 'duration_minutes' in data:
                component.duration_minutes = data['duration_minutes']

            if 'title' in data:
                component.title = data['title']

            if 'max_marks' in data:
                component.max_marks = data['max_marks']

            if 'timer_enabled' in data:
                component.timer_enabled = bool(data['timer_enabled'])

            component.save()

            # ── Sync to all Set components of the same test + test_type ──────
            # Configure settings are global rules: every ClapSetComponent that
            # mirrors this component type must inherit the same values.
            synced = ClapSetComponent.objects.filter(
                set__clap_test=component.clap_test,
                test_type=component.test_type,
            ).update(
                duration_minutes=component.duration_minutes,
                max_marks=component.max_marks,
                timer_enabled=component.timer_enabled,
            )
            if synced:
                logger.info(
                    f"Synced Configure settings ({component.test_type}: "
                    f"duration={component.duration_minutes}m, "
                    f"max_marks={component.max_marks}, "
                    f"timer={component.timer_enabled}) "
                    f"to {synced} set component(s) for test {component.clap_test_id}"
                )

            return JsonResponse({
                'message': f'Component updated and synced to {synced} set(s)',
                'synced_set_components': synced,
                'component': {
                    'id': str(component.id),
                    'test_type': component.test_type,
                    'title': component.title,
                    'max_marks': component.max_marks,
                    'duration_minutes': component.duration_minutes,
                    'timer_enabled': component.timer_enabled,
                    'status': component.status
                }
            })

        except Exception as e:
            logger.error(f"Error updating component: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def force_sync_timers(request, test_id):
    """
    POST /api/admin/clap-tests/<test_id>/sync-timers
    Force-propagates all master component timer settings (duration_minutes,
    timer_enabled, max_marks) to every matching ClapSetComponent in this test.
    Idempotent — safe to call multiple times.
    """
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        clap_test = ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return JsonResponse({'error': 'Test not found'}, status=404)

    total_synced = 0
    details = []
    for master in ClapTestComponent.objects.filter(clap_test=clap_test):
        count = ClapSetComponent.objects.filter(
            set__clap_test=clap_test,
            test_type=master.test_type,
        ).update(
            duration_minutes=master.duration_minutes,
            timer_enabled=master.timer_enabled,
            max_marks=master.max_marks,
        )
        total_synced += count
        details.append({
            'test_type': master.test_type,
            'duration_minutes': master.duration_minutes,
            'timer_enabled': master.timer_enabled,
            'max_marks': master.max_marks,
            'set_components_updated': count,
        })
        logger.info(
            f"Force-sync [{master.test_type}] duration={master.duration_minutes}m "
            f"timer={master.timer_enabled} → {count} set component(s)"
        )

    return JsonResponse({
        'success': True,
        'message': f'Synced timer settings to {total_synced} set component(s)',
        'details': details,
    })

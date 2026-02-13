
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from api.models import ClapTestComponent
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

            component.save()
            
            return JsonResponse({
                'message': 'Component updated successfully',
                'component': {
                    'id': str(component.id),
                    'test_type': component.test_type,
                    'title': component.title,
                    'max_marks': component.max_marks,
                    'duration_minutes': component.duration_minutes,
                    'status': component.status
                }
            })

        except Exception as e:
            logger.error(f"Error updating component: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)

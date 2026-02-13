from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.utils import timezone
import json
import logging
from api.models import User, ClapTestComponent, ClapTestItem
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["GET", "POST"])
def clap_test_items_handler(request, component_id):
    """
    GET: List all items for a component
    POST: Create a new item
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
        items = component.items.all().order_by('order_index')
        return JsonResponse({
            'items': [{
                'id': str(item.id),
                'item_type': item.item_type,
                'order_index': item.order_index,
                'points': item.points,
                'content': item.content,
                'created_at': item.created_at.isoformat()
            } for item in items]
        })

    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            
            # Get next order index if not provided
            if 'order_index' not in data:
                last_item = component.items.last()
                order_index = (last_item.order_index + 1) if last_item else 1
            else:
                order_index = data['order_index']

            item = ClapTestItem.objects.create(
                component=component,
                item_type=data.get('item_type', 'mcq'),
                order_index=order_index,
                points=data.get('points', 1),
                content=data.get('content', {})
            )
            
            return JsonResponse({
                'message': 'Item created successfully',
                'item': {
                    'id': str(item.id),
                    'item_type': item.item_type,
                    'order_index': item.order_index,
                    'points': item.points,
                    'content': item.content
                }
            }, status=201)

        except Exception as e:
            logger.error(f"Error creating item: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["PATCH", "DELETE"])
def clap_test_item_detail_handler(request, item_id):
    """
    PATCH: Update an item
    DELETE: Delete an item
    """
    # Auth check
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        item = ClapTestItem.objects.get(id=item_id)
    except ClapTestItem.DoesNotExist:
        return JsonResponse({'error': 'Item not found'}, status=404)

    if request.method == "PATCH":
        try:
            data = json.loads(request.body)
            
            if 'item_type' in data:
                item.item_type = data['item_type']
            if 'points' in data:
                item.points = data['points']
            if 'content' in data:
                # Merge or replace content? Replacing is safer for structured data
                item.content = data['content']
            if 'order_index' in data:
                item.order_index = data['order_index']
                
            item.save()
            
            return JsonResponse({
                'message': 'Item updated successfully',
                'item': {
                    'id': str(item.id),
                    'item_type': item.item_type,
                    'order_index': item.order_index,
                    'points': item.points,
                    'content': item.content
                }
            })

        except Exception as e:
            logger.error(f"Error updating item: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)

    elif request.method == "DELETE":
        try:
            item.delete()
            return JsonResponse({'message': 'Item deleted successfully'})
        except Exception as e:
            logger.error(f"Error deleting item: {str(e)}")
            return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def reorder_items_handler(request, component_id):
    """
    POST: Reorder items for a component
    Body: { "item_ids": ["uuid1", "uuid2", ...] }
    """
    # Auth check
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        data = json.loads(request.body)
        item_ids = data.get('item_ids', [])
        
        with transaction.atomic():
            for index, item_id in enumerate(item_ids, 1):
                ClapTestItem.objects.filter(id=item_id, component_id=component_id).update(order_index=index)
                
        return JsonResponse({'message': 'Items reordered successfully'})

    except Exception as e:
        logger.error(f"Error reordering items: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

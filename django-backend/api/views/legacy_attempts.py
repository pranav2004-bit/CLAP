from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from api.models import TestAttempt, User, Test
from api.utils.jwt_utils import get_user_from_request
from django.utils import timezone
import json
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["GET"])
def attempts_handler(request):
    """
    GET /api/attempts
    Returns attempts for a user
    """
    try:
        user_id = request.GET.get('userId')
        
        # If user is admin/teacher, maybe they pass userId explicitly.
        # If no user_id, extract from token.
        if not user_id:
            user = get_user_from_request(request)
            if user:
                user_id = str(user.id)
            else:
                return JsonResponse({'success': False, 'error': 'UserId required'}, status=400)
                
        attempts = TestAttempt.objects.filter(user_id=user_id).order_by('-created_at')
        
        attempts_data = []
        for att in attempts:
            attempts_data.append({
                'id': str(att.id),
                'test_id': str(att.test_id),
                'user_id': str(att.user_id),
                'status': att.status,
                'score': float(att.score) if att.score else None,
                'max_score': float(att.max_score) if att.max_score else None,
                'started_at': att.started_at.isoformat() if att.started_at else None,
                'completed_at': att.completed_at.isoformat() if att.completed_at else None,
                'answers': att.answers
            })
            
        return JsonResponse({
            'success': True,
            'data': attempts_data
        })
        
    except Exception as e:
        logger.error(f"Error fetching attempts: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def create_attempt(request):
    """
    POST /api/attempts
    Create a new attempt
    """
    try:
        data = json.loads(request.body)
        test_id = data.get('test_id')
        user_id = data.get('user_id')
        
        if not test_id or not user_id:
            return JsonResponse({'success': False, 'error': 'test_id and user_id required'}, status=400)
            
        test = Test.objects.get(id=test_id)
        user = User.objects.get(id=user_id)
        
        attempt = TestAttempt.objects.create(
            test=test,
            user=user,
            status='in_progress',
            started_at=timezone.now()
        )
        
        return JsonResponse({
            'success': True,
            'data': {
                'id': str(attempt.id),
                'test_id': str(test.id),
                'user_id': str(user.id),
                'status': attempt.status,
                'started_at': attempt.started_at.isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Error creating attempt: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

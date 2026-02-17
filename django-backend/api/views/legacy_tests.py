from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from api.models import Test
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["GET"])
def tests_handler(request):
    """
    GET /api/tests
    Returns list of all published tests
    Matches the format expected by ApiClient in lib/api/client.ts
    """
    try:
        # Fetch tests - maybe filter by status='published' if needed?
        # The frontend seems to handle status logic, so let's filtering slightly or just all
        # Assuming we want all available tests
        tests = Test.objects.all().order_by('-created_at')
        
        tests_data = []
        for test in tests:
            tests_data.append({
                'id': str(test.id),
                'name': test.name,
                'type': test.type,
                'duration_minutes': test.duration_minutes,
                'total_questions': test.total_questions,
                'status': test.status,
                'created_at': test.created_at.isoformat() if test.created_at else None
            })
            
        return JsonResponse({
            'success': True,
            'data': tests_data
        })
        
    except Exception as e:
        logger.error(f"Error fetching legacy tests: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def test_detail_handler(request, test_id):
    """
    GET /api/tests/<id>
    """
    try:
        test = Test.objects.get(id=test_id)
        
        test_data = {
            'id': str(test.id),
            'name': test.name,
            'type': test.type,
            'duration_minutes': test.duration_minutes,
            'total_questions': test.total_questions,
            'status': test.status,
            'created_at': test.created_at.isoformat() if test.created_at else None,
            'instructions': test.instructions
        }
        
        # Also fetch questions? ApiClient.getTestById expects { test: ..., questions: ... } ??
        # Let's check client.ts: getTestById returns { test: any; questions: any[] }
        
        questions = test.questions.all().order_by('order_index')
        questions_data = []
        for q in questions:
            questions_data.append({
                'id': str(q.id),
                'question_text': q.question_text,
                'question_type': q.question_type,
                'options': q.options,
                'points': q.points,
                'order_index': q.order_index
            })
            
        return JsonResponse({
            'success': True,
            'data': {
                'test': test_data,
                'questions': questions_data
            }
        })
        
    except Test.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Test not found'
        }, status=404)
    except Exception as e:
        logger.error(f"Error fetching test detail: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

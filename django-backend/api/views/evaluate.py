"""
AI Evaluation Views
Maintains exact behavior from Next.js app/api/evaluate/speaking and writing routes
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import json
import logging

from api.models import TestAttempt
from api.utils import success_response, error_response
from api.utils.openai_client import transcribe_audio, evaluate_speaking, evaluate_writing

try:
    from openai import RateLimitError, APIError, APITimeoutError, APIConnectionError
except Exception:  # openai may not be installed in some environments
    RateLimitError = APIError = APITimeoutError = APIConnectionError = ()


def _is_openai_unavailable(error: Exception) -> bool:
    if isinstance(error, (RateLimitError, APIError, APITimeoutError, APIConnectionError)):
        return True
    msg = str(error).lower()
    return 'insufficient_quota' in msg or 'rate limit' in msg or 'openai' in msg

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def evaluate_speaking_test(request):
    """
    POST /api/evaluate/speaking
    Matches Next.js speaking evaluation route behavior
    """
    try:
        audio_file = request.FILES.get('audio')
        prompt = request.POST.get('prompt')
        attempt_id = request.POST.get('attemptId')
        
        if not audio_file or not prompt or not attempt_id:
            return error_response(
                'Missing required fields: audio, prompt, or attemptId',
                status=400
            )
        
        # Transcribe audio using Whisper
        transcript = transcribe_audio(audio_file, audio_file.content_type)
        
        if not transcript or transcript.strip() == '':
            return error_response(
                'Failed to transcribe audio or empty transcription',
                status=400
            )
        
        # Evaluate speaking using GPT-4
        evaluation = evaluate_speaking(transcript, prompt)
        
        # Update the test attempt with AI evaluation results
        try:
            attempt = TestAttempt.objects.get(id=attempt_id)
            
            # Get existing answers or empty dict
            existing_answers = attempt.answers or {}
            
            # Update with AI evaluation
            existing_answers['ai_evaluation'] = {
                'transcript': transcript,
                **evaluation
            }
            
            attempt.score = evaluation['score']
            attempt.max_score = evaluation['maxScore']
            attempt.status = 'completed'
            attempt.completed_at = timezone.now()
            attempt.answers = existing_answers
            attempt.save()
            
            updated_attempt = {
                'id': str(attempt.id),
                'score': float(attempt.score) if attempt.score else None,
                'max_score': float(attempt.max_score) if attempt.max_score else None,
                'status': attempt.status,
                'completed_at': attempt.completed_at.isoformat() if attempt.completed_at else None
            }
            
            return JsonResponse({
                'success': True,
                'transcript': transcript,
                'evaluation': evaluation,
                'updatedAttempt': updated_attempt
            })
            
        except TestAttempt.DoesNotExist:
            logger.error(f'Test attempt not found: {attempt_id}')
            return error_response('Failed to save evaluation results', status=500)
        
    except Exception as error:
        logger.error(f'Speaking evaluation error: {error}', exc_info=True)
        if _is_openai_unavailable(error):
            return error_response('OpenAI service unavailable', status=503)
        return error_response('Failed to evaluate speaking test', status=500)


@csrf_exempt
@require_http_methods(["POST"])
def evaluate_writing_test(request):
    """
    POST /api/evaluate/writing
    Matches Next.js writing evaluation route behavior
    """
    try:
        body = json.loads(request.body)
        essay = body.get('essay')
        prompt = body.get('prompt')
        attempt_id = body.get('attemptId')
        
        if not essay or not prompt or not attempt_id:
            return error_response(
                'Missing required fields: essay, prompt, or attemptId',
                status=400
            )
        
        if essay.strip() == '':
            return error_response('Essay content cannot be empty', status=400)
        
        # Evaluate writing using GPT-4
        evaluation = evaluate_writing(essay, prompt)
        
        # Update the test attempt with AI evaluation results
        try:
            attempt = TestAttempt.objects.get(id=attempt_id)
            
            # Get existing answers or empty dict
            existing_answers = attempt.answers or {}
            
            # Update with AI evaluation
            existing_answers['ai_evaluation'] = {
                'essay': essay,
                **evaluation
            }
            
            attempt.score = evaluation['score']
            attempt.max_score = evaluation['maxScore']
            attempt.status = 'completed'
            attempt.completed_at = timezone.now()
            attempt.answers = existing_answers
            attempt.save()
            
            updated_attempt = {
                'id': str(attempt.id),
                'score': float(attempt.score) if attempt.score else None,
                'max_score': float(attempt.max_score) if attempt.max_score else None,
                'status': attempt.status,
                'completed_at': attempt.completed_at.isoformat() if attempt.completed_at else None
            }
            
            return JsonResponse({
                'success': True,
                'evaluation': evaluation,
                'updatedAttempt': updated_attempt
            })
            
        except TestAttempt.DoesNotExist:
            logger.error(f'Test attempt not found: {attempt_id}')
            return error_response('Failed to save evaluation results', status=500)
        
    except Exception as error:
        logger.error(f'Writing evaluation error: {error}', exc_info=True)
        if _is_openai_unavailable(error):
            return error_response('OpenAI service unavailable', status=503)
        return error_response('Failed to evaluate writing test', status=500)

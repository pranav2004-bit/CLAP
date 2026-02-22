"""
OpenAI Integration Module
Maintains exact behavior from Next.js lib/openai.ts
"""

import openai
from django.conf import settings
import logging
import time
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai.api_key = settings.OPENAI_API_KEY

# Retry configuration matching Next.js
MAX_RETRIES = 3
RETRY_DELAY = 1  # seconds


def with_retry(func, retries=MAX_RETRIES):
    """
    Retry wrapper matching Next.js withRetry function
    """
    for attempt in range(MAX_RETRIES):
        try:
            return func()
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                logger.warning(f"API call failed, retrying... ({attempt + 1}/{MAX_RETRIES})")
                time.sleep(RETRY_DELAY)
            else:
                raise e


def evaluate_speaking(transcript: str, prompt: str) -> Dict[str, Any]:
    """
    Evaluate speaking test using configured OpenAI model
    Matches Next.js evaluateSpeaking function
    """
    from .prompts import SPEAKING_EVALUATION_PROMPT, SPEAKING_USER_PROMPT_TEMPLATE
    
    user_prompt = SPEAKING_USER_PROMPT_TEMPLATE.replace('{{prompt}}', prompt).replace('{{transcript}}', transcript)
    
    def make_request():
        response = openai.ChatCompletion.create(
            model=getattr(settings, 'OPENAI_MODEL', 'gpt-4-turbo'),
            messages=[
                {'role': 'system', 'content': SPEAKING_EVALUATION_PROMPT},
                {'role': 'user', 'content': user_prompt}
            ],
            temperature=0.3,
            response_format={'type': 'json_object'}
        )
        
        content = response.choices[0].message.content
        if not content:
            raise Exception('No response from OpenAI')
        
        import json
        evaluation = json.loads(content)
        
        # Calculate total score
        total_score = sum(criterion['score'] for criterion in evaluation['breakdown'].values())
        
        return {
            **evaluation,
            'score': total_score,
            'maxScore': 10
        }
    
    return with_retry(make_request)


def evaluate_writing(essay: str, prompt: str) -> Dict[str, Any]:
    """
    Evaluate writing test using configured OpenAI model
    Matches Next.js evaluateWriting function
    """
    from .prompts import WRITING_EVALUATION_PROMPT, WRITING_USER_PROMPT_TEMPLATE
    
    user_prompt = WRITING_USER_PROMPT_TEMPLATE.replace('{{prompt}}', prompt).replace('{{essay}}', essay)
    
    def make_request():
        response = openai.ChatCompletion.create(
            model=getattr(settings, 'OPENAI_MODEL', 'gpt-4-turbo'),
            messages=[
                {'role': 'system', 'content': WRITING_EVALUATION_PROMPT},
                {'role': 'user', 'content': user_prompt}
            ],
            temperature=0.3,
            response_format={'type': 'json_object'}
        )
        
        content = response.choices[0].message.content
        if not content:
            raise Exception('No response from OpenAI')
        
        import json
        evaluation = json.loads(content)
        
        # Calculate total score
        total_score = sum(criterion['score'] for criterion in evaluation['breakdown'].values())
        
        return {
            **evaluation,
            'score': total_score,
            'maxScore': 10
        }
    
    return with_retry(make_request)


def transcribe_audio(audio_file, mime_type='audio/mp3') -> str:
    """
    Transcribe audio using Whisper API
    Matches Next.js transcribeAudio function
    """
    def make_request():
        # audio_file is Django's UploadedFile object
        response = openai.Audio.transcribe(
            model='whisper-1',
            file=audio_file,
            response_format='text'
        )
        return response
    
    return with_retry(make_request)

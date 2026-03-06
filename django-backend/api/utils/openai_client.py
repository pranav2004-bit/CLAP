"""
OpenAI Integration Module — Updated to openai>=1.0 SDK syntax.
The v0.x API (openai.ChatCompletion.create, openai.Audio.transcribe) was removed
in openai>=1.0.0. This module uses the new client-based API.
"""

import json
import logging
import time
from typing import Dict, Any

from django.conf import settings

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAY = 1  # seconds base


def _get_client():
    """Return a configured OpenAI client (openai>=1.0 SDK)."""
    from openai import OpenAI  # lazy import so module loads even if openai not installed
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def with_retry(func, retries=MAX_RETRIES):
    """Retry wrapper with exponential back-off."""
    for attempt in range(retries):
        try:
            return func()
        except Exception as e:
            if attempt < retries - 1:
                delay = RETRY_DELAY * (2 ** attempt)
                logger.warning('OpenAI API call failed (attempt %d/%d), retrying in %ss: %s', attempt + 1, retries, delay, e)
                time.sleep(delay)
            else:
                raise


def evaluate_speaking(transcript: str, prompt: str) -> Dict[str, Any]:
    """Evaluate speaking using the configured OpenAI model (openai>=1.0 API)."""
    from .prompts import SPEAKING_EVALUATION_PROMPT, SPEAKING_USER_PROMPT_TEMPLATE

    user_prompt = SPEAKING_USER_PROMPT_TEMPLATE.replace('{{prompt}}', prompt).replace('{{transcript}}', transcript)

    def make_request():
        client = _get_client()
        response = client.chat.completions.create(
            model=getattr(settings, 'OPENAI_MODEL', 'gpt-4-turbo'),
            messages=[
                {'role': 'system', 'content': SPEAKING_EVALUATION_PROMPT},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.3,
            response_format={'type': 'json_object'},
            timeout=30,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError('Empty response from OpenAI')
        evaluation = json.loads(content)
        breakdown = evaluation.get('breakdown', {})
        if not isinstance(breakdown, dict):
            raise ValueError(f'Unexpected breakdown type from OpenAI: {type(breakdown)}')
        total_score = sum(
            float(v.get('score', 0)) for v in breakdown.values() if isinstance(v, dict)
        )
        return {**evaluation, 'score': total_score, 'maxScore': 10}

    return with_retry(make_request)


def evaluate_writing(essay: str, prompt: str) -> Dict[str, Any]:
    """Evaluate writing using the configured OpenAI model (openai>=1.0 API)."""
    from .prompts import WRITING_EVALUATION_PROMPT, WRITING_USER_PROMPT_TEMPLATE

    user_prompt = WRITING_USER_PROMPT_TEMPLATE.replace('{{prompt}}', prompt).replace('{{essay}}', essay)

    def make_request():
        client = _get_client()
        response = client.chat.completions.create(
            model=getattr(settings, 'OPENAI_MODEL', 'gpt-4-turbo'),
            messages=[
                {'role': 'system', 'content': WRITING_EVALUATION_PROMPT},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.3,
            response_format={'type': 'json_object'},
            timeout=30,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError('Empty response from OpenAI')
        evaluation = json.loads(content)
        breakdown = evaluation.get('breakdown', {})
        if not isinstance(breakdown, dict):
            raise ValueError(f'Unexpected breakdown type from OpenAI: {type(breakdown)}')
        total_score = sum(
            float(v.get('score', 0)) for v in breakdown.values() if isinstance(v, dict)
        )
        return {**evaluation, 'score': total_score, 'maxScore': 10}

    return with_retry(make_request)


def transcribe_audio(audio_file, mime_type: str = 'audio/mp3') -> str:
    """
    Transcribe audio using Whisper API (openai>=1.0 API).
    audio_file must be a file-like object (Django UploadedFile, open() handle,
    or a tuple of (filename, bytes, content_type) for S3-backed audio).
    Returns the transcription text string.
    """
    def make_request():
        client = _get_client()
        # Normalize Django UploadedFile to its underlying file handle for OpenAI
        file_obj = audio_file
        if hasattr(audio_file, "file"):
            file_obj = audio_file.file
        if hasattr(file_obj, "seek"):
            try:
                file_obj.seek(0)
            except Exception:
                pass
        response = client.audio.transcriptions.create(
            model='whisper-1',
            file=file_obj,
            response_format='text',
            timeout=60,
        )
        return response

    return with_retry(make_request)

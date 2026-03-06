"""
OpenAI Integration Module — Enterprise Multi-Key Pool.

Architecture:
  - Up to 5 primary API keys rotated in round-robin across Celery worker threads.
  - Each key that receives a 429 (rate-limit) response is put into a 60-second
    cooldown; the next available key is tried immediately (no sleep on 429).
  - If ALL primary keys are cooling → hot standby key is used automatically.
  - If standby is also cooling → least-recently-limited primary key is returned
    so Celery's built-in retry/back-off loop can handle the remaining wait.
  - Per-key timeouts: chat completions 30 s, Whisper transcriptions 60 s.
  - Full key values are never logged; only the first-8 / last-4 chars appear.
"""

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
COOLDOWN_SECONDS = 60   # rest a key for 60 s after a 429
MAX_RETRIES = 3
RETRY_DELAY = 1         # base seconds for exponential back-off on non-429 errors


# ── Thread-safe key pool ──────────────────────────────────────────────────────

class _KeyPool:
    """
    Thread-safe round-robin API key pool with per-key cooldown tracking.

    Behaviour
    ---------
    - Primary keys are tried in rotating order (round-robin).
    - A key that returned 429 is put into cooldown for COOLDOWN_SECONDS.
    - If ALL primary keys are cooling → hot standby key is used.
    - If standby is also cooling → returns the least-recently-cooled primary
      key (Celery retry loop handles the back-off).
    """

    def __init__(self, primary_keys: List[str], standby_key: Optional[str] = None):
        self._keys: List[str] = [k for k in primary_keys if k]
        self._standby: Optional[str] = standby_key or None
        self._lock = threading.Lock()
        self._index: int = 0
        self._cooldowns: Dict[str, float] = {}   # key → monotonic expiry time

    # ------------------------------------------------------------------
    def _is_cooling(self, key: str) -> bool:
        return time.monotonic() < self._cooldowns.get(key, 0.0)

    def mark_rate_limited(self, key: str) -> None:
        """Call when a RateLimitError (429) is received for `key`."""
        with self._lock:
            self._cooldowns[key] = time.monotonic() + COOLDOWN_SECONDS
        # Log partial key only — never log the full secret value
        logger.warning(
            'openai_key_rate_limited key_prefix=%s key_suffix=%s cooldown_seconds=%d',
            key[:8], key[-4:], COOLDOWN_SECONDS,
        )

    def get_key(self) -> str:
        """Return next available (non-cooling) key. Thread-safe."""
        with self._lock:
            n = len(self._keys)
            if n == 0:
                raise RuntimeError(
                    'No OpenAI API keys configured. '
                    'Set OPENAI_API_KEY in your .env file.'
                )

            # Try each primary key in round-robin order
            for _ in range(n):
                key = self._keys[self._index % n]
                self._index = (self._index + 1) % n
                if not self._is_cooling(key):
                    return key

            # All primary keys cooling → try standby
            if self._standby and not self._is_cooling(self._standby):
                logger.warning(
                    'openai_all_primary_cooling switching_to_standby=True '
                    'primary_key_count=%d', n,
                )
                return self._standby

            # Everything cooling → return least-recently-limited primary (best-effort)
            logger.error(
                'openai_all_keys_cooling primary_count=%d has_standby=%s '
                'returning_best_available=True',
                n, self._standby is not None,
            )
            return min(self._keys, key=lambda k: self._cooldowns.get(k, 0.0))

    # ------------------------------------------------------------------
    @property
    def pool_size(self) -> int:
        return len(self._keys)

    @property
    def has_standby(self) -> bool:
        return bool(self._standby)

    def status(self) -> Dict[str, Any]:
        """Return pool health summary (no key values exposed)."""
        with self._lock:
            now = time.monotonic()
            cooling = sum(
                1 for k in self._keys if now < self._cooldowns.get(k, 0.0)
            )
            standby_cooling = (
                self._standby is not None
                and now < self._cooldowns.get(self._standby, 0.0)
            )
        return {
            'primary_keys': self.pool_size,
            'has_standby': self.has_standby,
            'primary_keys_cooling': cooling,
            'standby_cooling': standby_cooling,
        }


# ── Module-level singleton — initialised once per worker process ──────────────
_pool: Optional[_KeyPool] = None
_pool_init_lock = threading.Lock()


def _get_pool() -> _KeyPool:
    """Return (and lazily initialise) the module-level key pool."""
    global _pool
    if _pool is not None:
        return _pool
    with _pool_init_lock:
        if _pool is not None:
            return _pool
        primary_keys: List[str] = getattr(settings, 'OPENAI_API_KEYS', [])
        standby_key: str = getattr(settings, 'OPENAI_STANDBY_KEY', '') or ''
        _pool = _KeyPool(primary_keys, standby_key or None)
        logger.info(
            'openai_key_pool_initialised primary_keys=%d has_standby=%s',
            _pool.pool_size, _pool.has_standby,
        )
    return _pool


def get_pool_status() -> Dict[str, Any]:
    """Expose pool health for /api/health/ or admin dashboards."""
    return _get_pool().status()


# ── Retry wrapper ─────────────────────────────────────────────────────────────

def _with_key_aware_retry(func, retries: int = MAX_RETRIES):
    """
    Execute `func(key: str)` with automatic key rotation on 429 and
    exponential back-off on transient errors.

    - RateLimitError (429): marks key as cooling, retries immediately with
      next key (no sleep — we have other keys available).
    - Other exceptions: exponential back-off before retry.
    - After `retries` attempts, re-raises the last exception.
    """
    from openai import RateLimitError

    last_exc: Optional[Exception] = None
    pool = _get_pool()

    for attempt in range(retries):
        key = pool.get_key()
        try:
            return func(key)
        except RateLimitError as exc:
            last_exc = exc
            pool.mark_rate_limited(key)
            logger.warning(
                'openai_rate_limit attempt=%d/%d rotating_to_next_key=True',
                attempt + 1, retries,
            )
            # No sleep on 429 — rotate to next key immediately
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                delay = RETRY_DELAY * (2 ** attempt)
                logger.warning(
                    'openai_api_error attempt=%d/%d retrying_in=%.1fs error=%s',
                    attempt + 1, retries, delay, exc,
                )
                time.sleep(delay)
            else:
                raise

    # All retries exhausted (only reached if last attempt was RateLimitError)
    raise last_exc  # type: ignore[misc]


# ── Public API ────────────────────────────────────────────────────────────────

def evaluate_speaking(transcript: str, prompt: str) -> Dict[str, Any]:
    """Evaluate a speaking submission using the configured OpenAI model."""
    from .prompts import SPEAKING_EVALUATION_PROMPT, SPEAKING_USER_PROMPT_TEMPLATE

    user_prompt = (
        SPEAKING_USER_PROMPT_TEMPLATE
        .replace('{{prompt}}', prompt)
        .replace('{{transcript}}', transcript)
    )

    def make_request(key: str) -> Dict[str, Any]:
        from openai import OpenAI
        client = OpenAI(api_key=key)
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
            raise ValueError(
                f'Unexpected breakdown type from OpenAI: {type(breakdown)}'
            )
        total_score = sum(
            float(v.get('score', 0))
            for v in breakdown.values()
            if isinstance(v, dict)
        )
        return {**evaluation, 'score': total_score, 'maxScore': 10}

    return _with_key_aware_retry(make_request)


def evaluate_writing(essay: str, prompt: str) -> Dict[str, Any]:
    """Evaluate a writing submission using the configured OpenAI model."""
    from .prompts import WRITING_EVALUATION_PROMPT, WRITING_USER_PROMPT_TEMPLATE

    user_prompt = (
        WRITING_USER_PROMPT_TEMPLATE
        .replace('{{prompt}}', prompt)
        .replace('{{essay}}', essay)
    )

    def make_request(key: str) -> Dict[str, Any]:
        from openai import OpenAI
        client = OpenAI(api_key=key)
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
            raise ValueError(
                f'Unexpected breakdown type from OpenAI: {type(breakdown)}'
            )
        total_score = sum(
            float(v.get('score', 0))
            for v in breakdown.values()
            if isinstance(v, dict)
        )
        return {**evaluation, 'score': total_score, 'maxScore': 10}

    return _with_key_aware_retry(make_request)


def transcribe_audio(audio_file, mime_type: str = 'audio/mp3') -> str:
    """
    Transcribe audio using Whisper API.
    audio_file must be a file-like object (Django UploadedFile, open() handle,
    or a tuple of (filename, bytes, content_type) for S3-backed audio).
    Returns the transcription text string.
    """
    def make_request(key: str) -> str:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        file_obj = audio_file
        if hasattr(audio_file, 'file'):
            file_obj = audio_file.file
        if hasattr(file_obj, 'seek'):
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

    return _with_key_aware_retry(make_request)

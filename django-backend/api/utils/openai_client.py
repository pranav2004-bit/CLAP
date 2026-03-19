"""
OpenAI Integration Module — Enterprise Multi-Key Pool with Quota Tracking.

Architecture
────────────
  Key pool
  ├── 4 primary API keys, rotated round-robin.
  ├── 1 hot-standby key, activated when ALL 4 primary keys are quota-limited.
  └── QuotaTracker selects the BEST key (most remaining quota) before each call.

  Per-call flow
  ├── 1. Estimate token cost (tiktoken or char-ratio fallback).
  ├── 2. QuotaTracker.check_and_reserve() — atomic Redis check + increment.
  │      If all keys exhausted → raise QuotaDailyExhaustedException / Temporarily.
  ├── 3. Call OpenAI API with the selected key.
  ├── 4. On success: QuotaTracker.record_actual_usage() — correct token delta.
  ├── 5. On 429: parse retry-after header, call appropriate mark_key_* method,
  │      rotate to next key and retry immediately (no sleep on RPM 429).
  └── 6. On persistent failure: raise — caller (Celery task) handles DLQ.

  Rate limits tracked per key (Tier 1 defaults)
  ├── RPM  : 500 req/min   (configurable via OPENAI_RPM_LIMIT)
  ├── RPD  : 10 000 req/day (configurable via OPENAI_RPD_LIMIT)
  ├── TPM  : 800 000 tokens/min (configurable via OPENAI_TPM_LIMIT)
  ├── TPD  : 10 000 000 tokens/day (configurable via OPENAI_TPD_LIMIT)
  └── Whisper RPM : 50 req/min per key (configurable via OPENAI_WHISPER_RPM_LIMIT)
                    Tracked separately with Redis proactive counter.

  Security
  ├── API key values are NEVER logged — only a 12-char SHA-256 prefix.
  ├── Keys are loaded once per process; no key is written to any Redis value.
  └── All quota Redis keys use hash-derived names, not key prefixes.

  Resilience
  ├── Quota tracker fails open (Redis unavailable = no blocking).
  ├── Exponential backoff (1 s, 2 s, 4 s) for transient non-429 errors.
  ├── MAX_RETRIES across ALL keys combined (prevents infinite retry loops).
  ├── Whisper transcription is tracked separately (different rate limits).
  └── Thread-safe: _KeyPool uses threading.Lock(); QuotaTracker uses Redis atoms.
"""

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings

from api.utils.quota_tracker import (
    QuotaTracker,
    QuotaDailyExhaustedException,
    QuotaTemporarilyUnavailableException,
    get_quota_tracker,
)
from api.utils.token_counter import estimate_simple_tokens

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
MAX_RETRIES         = 5        # max attempts across all key rotations
RETRY_DELAY_BASE    = 1.0      # base backoff for non-429 transient errors (seconds)
RETRY_DELAY_MAX     = 30.0     # cap on transient-error backoff (seconds)

# Threshold to distinguish RPD exhaustion from RPM in retry-after duration.
# OpenAI sends retry-after≥3600 when daily quota is exhausted.
RPD_RETRY_AFTER_THRESHOLD = 3_600

# Default retry-after when the header is absent (assume minute-level rate-limit)
DEFAULT_RETRY_AFTER_SECONDS = 65


# ── Thread-safe key pool ───────────────────────────────────────────────────────

class _KeyPool:
    """
    Thread-safe round-robin API key pool with QuotaTracker integration.

    Key selection order:
      1. QuotaTracker.best_available_key() — quota-aware (preferred path).
      2. Round-robin fallback when QuotaTracker has no preference (Redis down).
      3. Hot standby key when ALL primary keys are quota-exhausted.
      4. Least-recently-limited primary key as last resort (Celery retry handles wait).
    """

    def __init__(
        self,
        primary_keys: List[str],
        standby_key: Optional[str],
        tracker: QuotaTracker,
    ):
        self._keys: List[str] = [k for k in primary_keys if k]
        self._standby: Optional[str] = standby_key or None
        self._tracker = tracker
        self._lock = threading.Lock()
        self._rr_index: int = 0
        # In-process cooldown (backup to quota tracker for non-Redis cases)
        self._cooldowns: Dict[str, float] = {}

    @property
    def all_keys(self) -> List[str]:
        """All keys including standby (for quota status queries)."""
        keys = list(self._keys)
        if self._standby:
            keys.append(self._standby)
        return keys

    def _is_cooling(self, key: str) -> bool:
        return time.monotonic() < self._cooldowns.get(key, 0.0)

    def _mark_cooldown(self, key: str, seconds: float) -> None:
        with self._lock:
            self._cooldowns[key] = time.monotonic() + seconds

    def get_key(self, estimated_tokens: int = 500) -> str:
        """
        Return the best available key for a request of `estimated_tokens`.
        Thread-safe.
        """
        with self._lock:
            n = len(self._keys)
            if n == 0:
                raise RuntimeError(
                    'No OpenAI API keys configured. '
                    'Set OPENAI_API_KEY in your .env file.'
                )

            # ── Path 1: Quota-tracker guided selection ─────────────────────
            # Filter out in-process cooled keys before asking the tracker
            available = [k for k in self._keys if not self._is_cooling(k)]
            if self._standby and not self._is_cooling(self._standby):
                available_with_standby = available + [self._standby]
            else:
                available_with_standby = available

            best = self._tracker.best_available_key(
                available_with_standby or self._keys,  # fallback if all cooling
                estimated_tokens,
            )
            if best:
                # Advance round-robin index to maintain fair rotation
                if best in self._keys:
                    try:
                        self._rr_index = (self._keys.index(best) + 1) % n
                    except ValueError:
                        pass
                return best

            # ── Path 2: Round-robin among non-cooling primary keys ─────────
            for _ in range(n):
                key = self._keys[self._rr_index % n]
                self._rr_index = (self._rr_index + 1) % n
                if not self._is_cooling(key):
                    return key

            # ── Path 3: Hot standby ────────────────────────────────────────
            if self._standby and not self._is_cooling(self._standby):
                logger.warning(
                    'openai_all_primary_cooling using_standby=True primary_count=%d', n
                )
                return self._standby

            # ── Path 4: Last resort — return least-recently limited key ────
            logger.error(
                'openai_all_keys_quota_limited primary_count=%d has_standby=%s '
                'returning_best_effort=True',
                n, self._standby is not None,
            )
            return min(
                self._keys,
                key=lambda k: self._cooldowns.get(k, 0.0),
            )

    def mark_rate_limited(self, key: str, retry_after: int = DEFAULT_RETRY_AFTER_SECONDS) -> None:
        """Called when key receives a 429 RPM/TPM response."""
        self._mark_cooldown(key, float(retry_after))
        self._tracker.mark_key_rpm_limited(key, retry_after)
        from api.utils.quota_tracker import _key_hash
        logger.warning(
            'openai_key_rpm_limited key=%s retry_after=%ds',
            _key_hash(key), retry_after,
        )

    def mark_daily_exhausted(self, key: str, retry_after: int = 86_400) -> None:
        """Called when key receives a 429 RPD/TPD response (daily limit)."""
        self._mark_cooldown(key, float(retry_after))
        self._tracker.mark_key_daily_exhausted(key, retry_after)
        from api.utils.quota_tracker import _key_hash
        logger.error(
            'openai_key_daily_exhausted key=%s retry_after=%ds',
            _key_hash(key), retry_after,
        )

    def status(self) -> Dict[str, Any]:
        """Pool health summary — safe for /api/health/ or admin pages."""
        from api.utils.quota_tracker import _key_hash
        with self._lock:
            now = time.monotonic()
            cooling = sum(1 for k in self._keys if now < self._cooldowns.get(k, 0.0))
            standby_cooling = (
                self._standby is not None
                and now < self._cooldowns.get(self._standby, 0.0)
            )
        quota_statuses = self._tracker.get_all_keys_status(self.all_keys)
        return {
            'primary_keys': len(self._keys),
            'has_standby': bool(self._standby),
            'primary_keys_cooling': cooling,
            'standby_cooling': standby_cooling,
            'quota': quota_statuses,
        }


# ── Module-level singleton pool (one per worker process) ──────────────────────

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
        tracker = get_quota_tracker()

        _pool = _KeyPool(primary_keys, standby_key or None, tracker)
        logger.info(
            'openai_key_pool_init primary_keys=%d has_standby=%s model=%s',
            len(primary_keys), bool(standby_key),
            getattr(settings, 'OPENAI_MODEL', 'gpt-4o-mini'),
        )
    return _pool


def get_pool_status() -> Dict[str, Any]:
    """Expose pool health for /api/health/ or admin dashboards."""
    return _get_pool().status()


# ── Retry-after header parser ─────────────────────────────────────────────────

def _parse_retry_after(exc) -> Tuple[int, bool]:
    """
    Extract retry-after seconds from an OpenAI RateLimitError.

    Returns:
        (retry_after_seconds, is_daily_exhaustion)
        is_daily_exhaustion=True when retry-after > RPD_RETRY_AFTER_THRESHOLD
        (meaning the daily quota is used up, not just the per-minute one).
    """
    retry_after = DEFAULT_RETRY_AFTER_SECONDS
    try:
        response = getattr(exc, 'response', None)
        if response is not None:
            header_val = getattr(response, 'headers', {}).get('retry-after')
            if header_val is not None:
                retry_after = max(1, int(float(header_val)))
    except Exception:
        pass

    is_daily = retry_after > RPD_RETRY_AFTER_THRESHOLD
    return retry_after, is_daily


# ── Main retry wrapper ────────────────────────────────────────────────────────

def _with_quota_retry(
    func,
    estimated_tokens: int = 500,
    retries: int = MAX_RETRIES,
):
    """
    Execute func(key, client) with automatic quota-aware key rotation and retry.

    Retry policy
    ────────────
    - 429 RPM/TPM  → mark key rate-limited, rotate to next key immediately (no sleep).
    - 429 RPD/TPD  → mark key daily-exhausted, rotate key, no sleep.
    - All keys daily-exhausted → raise QuotaDailyExhaustedException.
    - All keys RPM-limited → raise QuotaTemporarilyUnavailableException.
    - Transient errors (timeout, connection) → exponential backoff (1s, 2s, 4s…).
    - After `retries` total attempts → re-raise last exception.
    """
    from openai import RateLimitError, APIConnectionError, APITimeoutError, OpenAIError

    pool = _get_pool()
    tracker = get_quota_tracker()
    last_exc: Optional[Exception] = None

    for attempt in range(retries):
        # ── Quota pre-flight: select best key ─────────────────────────────
        key = pool.get_key(estimated_tokens)

        allowed, wait_secs = tracker.check_and_reserve(key, estimated_tokens)
        if not allowed:
            # Quota blocked for this key — try the next key
            pool.mark_rate_limited(key, wait_secs)
            logger.warning(
                'openai_quota_precheck_blocked attempt=%d/%d wait=%ds rotating=True',
                attempt + 1, retries, wait_secs,
            )
            # If all keys are exhausted, raise a structured exception
            total_wait = tracker.time_until_any_key_available(pool.all_keys)
            if total_wait > 0:
                is_daily = total_wait > RPD_RETRY_AFTER_THRESHOLD
                if is_daily:
                    raise QuotaDailyExhaustedException(total_wait)
                raise QuotaTemporarilyUnavailableException(total_wait)
            continue  # Another key might be available

        # ── Call the API ───────────────────────────────────────────────────
        try:
            from openai import OpenAI
            client = OpenAI(api_key=key, timeout=30.0)
            result, actual_tokens = func(key, client)

            # Correct quota reservation with actual token usage
            tracker.record_actual_usage(key, actual_tokens, estimated_tokens)

            logger.info(
                'openai_call_success attempt=%d/%d estimated_tokens=%d actual_tokens=%d',
                attempt + 1, retries, estimated_tokens, actual_tokens,
            )
            return result

        except RateLimitError as exc:
            last_exc = exc
            retry_after, is_daily = _parse_retry_after(exc)

            if is_daily:
                pool.mark_daily_exhausted(key, retry_after)
            else:
                pool.mark_rate_limited(key, retry_after)

            logger.warning(
                'openai_rate_limit attempt=%d/%d is_daily=%s retry_after=%ds rotating=True',
                attempt + 1, retries, is_daily, retry_after,
            )

            # Check if we've exhausted all keys
            total_wait = tracker.time_until_any_key_available(pool.all_keys)
            if total_wait > RPD_RETRY_AFTER_THRESHOLD:
                raise QuotaDailyExhaustedException(total_wait) from exc
            if attempt == retries - 1 and total_wait > 0:
                raise QuotaTemporarilyUnavailableException(total_wait) from exc

            # No sleep for RPM 429 — rotate to next key immediately
            continue

        except (APIConnectionError, APITimeoutError) as exc:
            last_exc = exc
            if attempt < retries - 1:
                delay = min(RETRY_DELAY_BASE * (2 ** attempt), RETRY_DELAY_MAX)
                logger.warning(
                    'openai_transient_error attempt=%d/%d retrying_in=%.1fs error=%s',
                    attempt + 1, retries, delay, type(exc).__name__,
                )
                time.sleep(delay)
            else:
                raise

        except (OpenAIError, ValueError, json.JSONDecodeError) as exc:
            # Non-retryable API or parse error
            logger.error(
                'openai_non_retryable_error attempt=%d/%d error=%s',
                attempt + 1, retries, exc,
            )
            raise

        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                delay = min(RETRY_DELAY_BASE * (2 ** attempt), RETRY_DELAY_MAX)
                logger.warning(
                    'openai_unexpected_error attempt=%d/%d retrying_in=%.1fs error=%s',
                    attempt + 1, retries, delay, exc,
                )
                time.sleep(delay)
            else:
                raise

    # All retries exhausted (only reachable if last attempt was 429-rotate)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError('openai_all_retries_exhausted')


# ── Whisper RPM tracker (Redis-backed, proactive) ─────────────────────────────

def _whisper_rpm_key(api_key: str) -> str:
    """Redis key for per-key Whisper RPM counter (current 60-second window)."""
    import hashlib, math, time as _time
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()[:12]
    minute   = math.floor(_time.time() / 60)
    return f'whisper:rl:{key_hash}:rpm:{minute}'


def _whisper_rpm_check_and_increment(api_key: str) -> bool:
    """
    Atomically check and increment the Whisper RPM counter for a key.
    Returns True if the call is allowed, False if the key is at its RPM limit.
    Fails open (returns True) when Redis is unavailable.
    """
    limit = getattr(settings, 'OPENAI_WHISPER_RPM_LIMIT', 50)
    safe_limit = max(1, int(limit * getattr(settings, 'OPENAI_QUOTA_SAFETY_MARGIN', 0.90)))
    redis_key = _whisper_rpm_key(api_key)

    try:
        from api.utils.quota_tracker import get_quota_tracker
        tracker = get_quota_tracker()
        r = getattr(tracker, '_redis', None)
        if r is None:
            return True  # Redis unavailable — fail open

        pipe = r.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, 65)  # 65 s TTL — slightly longer than a minute window
        results = pipe.execute()
        current = results[0]
        if current > safe_limit:
            logger.warning(
                'whisper_rpm_limit_proactive key=%s current=%d limit=%d',
                redis_key[-8:], current, safe_limit,
            )
            return False
        return True
    except Exception:
        return True  # Fail open on any Redis error


# ── Whisper retry wrapper (separate — different rate limits from chat) ─────────

def _with_whisper_retry(func, retries: int = MAX_RETRIES):
    """
    Retry wrapper for Whisper transcription.
    Whisper has independent rate limits from chat completions.
    Uses proactive Redis RPM check + reactive 429 handling with key rotation.
    """
    from openai import RateLimitError, APIConnectionError, APITimeoutError

    pool = _get_pool()
    last_exc: Optional[Exception] = None

    for attempt in range(retries):
        key = pool.get_key(estimated_tokens=0)  # 0 = skip token quota for whisper

        # Proactive Whisper RPM check — rotate key if this one is at its limit
        if not _whisper_rpm_check_and_increment(key):
            pool.mark_rate_limited(key, DEFAULT_RETRY_AFTER_SECONDS)
            logger.warning(
                'whisper_rpm_proactive_block attempt=%d/%d rotating=True',
                attempt + 1, retries,
            )
            continue

        try:
            from openai import OpenAI
            client = OpenAI(api_key=key, timeout=120.0)
            return func(key, client)

        except RateLimitError as exc:
            last_exc = exc
            retry_after, _ = _parse_retry_after(exc)
            pool.mark_rate_limited(key, retry_after)
            logger.warning(
                'whisper_rate_limit attempt=%d/%d retry_after=%ds rotating=True',
                attempt + 1, retries, retry_after,
            )
            continue

        except (APIConnectionError, APITimeoutError) as exc:
            last_exc = exc
            if attempt < retries - 1:
                delay = min(RETRY_DELAY_BASE * (2 ** attempt), RETRY_DELAY_MAX)
                logger.warning(
                    'whisper_transient_error attempt=%d/%d retrying_in=%.1fs',
                    attempt + 1, retries, delay,
                )
                time.sleep(delay)
            else:
                raise

        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                delay = min(RETRY_DELAY_BASE * (2 ** attempt), RETRY_DELAY_MAX)
                time.sleep(delay)
            else:
                raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError('whisper_all_retries_exhausted')


# ── Public API ────────────────────────────────────────────────────────────────

def evaluate_speaking(transcript: str, prompt: str) -> Dict[str, Any]:
    """
    Evaluate a speaking transcript using gpt-4o-mini.

    Args:
        transcript: Student's speech transcription from Whisper.
        prompt: The speaking task prompt / rubric context.

    Returns:
        Dict with keys: score (0–10 float), feedback (dict), breakdown (dict).

    Raises:
        QuotaDailyExhaustedException: All keys have used up today's RPD/TPD.
        QuotaTemporarilyUnavailableException: All keys hit RPM/TPM (retry soon).
        ValueError: LLM returned malformed JSON or out-of-range score.
        openai.OpenAIError: Unrecoverable API error.
    """
    from .prompts import SPEAKING_EVALUATION_PROMPT, SPEAKING_USER_PROMPT_TEMPLATE

    model = getattr(settings, 'OPENAI_MODEL', 'gpt-4o-mini')

    user_prompt = (
        SPEAKING_USER_PROMPT_TEMPLATE
        .replace('{{prompt}}', prompt)
        .replace('{{transcript}}', transcript)
    )

    messages = [
        {'role': 'system', 'content': SPEAKING_EVALUATION_PROMPT},
        {'role': 'user',   'content': user_prompt},
    ]

    estimated_tokens = estimate_simple_tokens(SPEAKING_EVALUATION_PROMPT, user_prompt)

    def make_request(key: str, client) -> Tuple[Dict, int]:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            response_format={'type': 'json_object'},
            timeout=45.0,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError('Empty response from OpenAI chat completions')

        evaluation = json.loads(content)
        breakdown = evaluation.get('breakdown', {})
        if not isinstance(breakdown, dict):
            raise ValueError(
                f'Unexpected breakdown type: {type(breakdown).__name__}'
            )

        total_score = sum(
            float(v.get('score', 0))
            for v in breakdown.values()
            if isinstance(v, dict)
        )
        result = {**evaluation, 'score': total_score, 'maxScore': 10}

        # Actual token usage for quota correction
        actual = 0
        if response.usage:
            actual = (response.usage.prompt_tokens or 0) + (response.usage.completion_tokens or 0)

        return result, actual

    return _with_quota_retry(make_request, estimated_tokens=estimated_tokens)


def evaluate_writing(essay: str, prompt: str) -> Dict[str, Any]:
    """
    Evaluate a writing submission using gpt-4o-mini.

    Args:
        essay: Student's essay text.
        prompt: The writing task prompt / rubric context.

    Returns:
        Dict with keys: score (0–10 float), feedback (dict), breakdown (dict).

    Raises:
        QuotaDailyExhaustedException: All keys have used up today's RPD/TPD.
        QuotaTemporarilyUnavailableException: All keys hit RPM/TPM (retry soon).
        ValueError: LLM returned malformed JSON or out-of-range score.
        openai.OpenAIError: Unrecoverable API error.
    """
    from .prompts import WRITING_EVALUATION_PROMPT, WRITING_USER_PROMPT_TEMPLATE

    model = getattr(settings, 'OPENAI_MODEL', 'gpt-4o-mini')

    user_prompt = (
        WRITING_USER_PROMPT_TEMPLATE
        .replace('{{prompt}}', prompt)
        .replace('{{essay}}', essay)
    )

    messages = [
        {'role': 'system', 'content': WRITING_EVALUATION_PROMPT},
        {'role': 'user',   'content': user_prompt},
    ]

    estimated_tokens = estimate_simple_tokens(WRITING_EVALUATION_PROMPT, user_prompt)

    def make_request(key: str, client) -> Tuple[Dict, int]:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            response_format={'type': 'json_object'},
            timeout=45.0,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError('Empty response from OpenAI chat completions')

        evaluation = json.loads(content)
        breakdown = evaluation.get('breakdown', {})
        if not isinstance(breakdown, dict):
            raise ValueError(
                f'Unexpected breakdown type: {type(breakdown).__name__}'
            )

        total_score = sum(
            float(v.get('score', 0))
            for v in breakdown.values()
            if isinstance(v, dict)
        )
        result = {**evaluation, 'score': total_score, 'maxScore': 10}

        actual = 0
        if response.usage:
            actual = (response.usage.prompt_tokens or 0) + (response.usage.completion_tokens or 0)

        return result, actual

    return _with_quota_retry(make_request, estimated_tokens=estimated_tokens)


def transcribe_audio(audio_file, mime_type: str = 'audio/mp3') -> str:
    """
    Transcribe audio using Whisper API (whisper-1 model).

    audio_file must be one of:
      - A file-like object (open() handle, Django UploadedFile)
      - A tuple of (filename, bytes, content_type) for S3-backed audio

    Returns the transcription text string.

    Raises:
        openai.OpenAIError: Unrecoverable API error after all retries.
    """
    def make_request(key: str, client) -> str:
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
            timeout=120.0,
        )
        return response

    return _with_whisper_retry(make_request)

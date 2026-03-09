"""
OpenAI Quota Tracker — Redis-backed sliding-window rate-limit manager.

Tracks all four OpenAI quota dimensions per API key:
  - RPM  : requests per minute   (window: 60 s)
  - RPD  : requests per day      (window: 86 400 s)
  - TPM  : tokens per minute     (window: 60 s)
  - TPD  : tokens per day        (window: 86 400 s)

Design principles
─────────────────
• Single atomic Lua script: checks ALL four limits and increments ALL four
  counters in one Redis round-trip — zero TOCTOU window.
• Safety margin (default 0.90): avoids hitting the hard limit.  OpenAI
  enforces limits on a rolling basis so we leave 10 % headroom.
• Per-key hashing: full API key value is never stored in Redis; only a
  SHA-256 prefix identifies the key in logs and metrics.
• TTL self-cleanup: all Redis keys carry a TTL; no manual housekeeping.
• Fails open: if Redis is unreachable, quota checks return (allowed=True)
  so evaluations are never blocked by infrastructure failures.
• Pipeline batching: best_key() fetches all counters in one round-trip.
"""

import hashlib
import logging
import math
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Lua script: atomic check-and-increment for all four quota dimensions ──────
#
# KEYS : [rpm_key, rpd_key, tpm_key, tpd_key]
# ARGV : [rpm_limit, rpd_limit, tpm_limit, tpd_limit, token_amount]
# Returns: [allowed(1/0), blocked_dimension_or_"ok", current_value, ttl_secs]
#
# When allowed=1  → all four counters have been incremented.
# When allowed=0  → nothing was incremented; blocked_dimension names the limit
#                   that failed; current_value is the counter's value; ttl_secs
#                   is the seconds until that window resets.
#
# TTL is (re-)set on every INCR so the key always lives for a full window from
# the time it was last written, which is conservative and safe.
_LUA_RESERVE = """
local rpm_key = KEYS[1]; local rpd_key = KEYS[2]
local tpm_key = KEYS[3]; local tpd_key = KEYS[4]
local rpm_lim = tonumber(ARGV[1]); local rpd_lim = tonumber(ARGV[2])
local tpm_lim = tonumber(ARGV[3]); local tpd_lim = tonumber(ARGV[4])
local tokens  = tonumber(ARGV[5])

local rpm = tonumber(redis.call('GET', rpm_key) or 0)
local rpd = tonumber(redis.call('GET', rpd_key) or 0)
local tpm = tonumber(redis.call('GET', tpm_key) or 0)
local tpd = tonumber(redis.call('GET', tpd_key) or 0)

if rpm + 1 > rpm_lim then
    return {0, 'rpm', rpm, redis.call('TTL', rpm_key)}
end
if rpd + 1 > rpd_lim then
    return {0, 'rpd', rpd, redis.call('TTL', rpd_key)}
end
if tpm + tokens > tpm_lim then
    return {0, 'tpm', tpm, redis.call('TTL', tpm_key)}
end
if tpd + tokens > tpd_lim then
    return {0, 'tpd', tpd, redis.call('TTL', tpd_key)}
end

redis.call('INCRBY', rpm_key, 1)
redis.call('INCRBY', rpd_key, 1)
redis.call('INCRBY', tpm_key, tokens)
redis.call('INCRBY', tpd_key, tokens)

-- Always refresh TTL to full window (conservative: key lives as long as it
-- keeps being written, never silently expires mid-window).
redis.call('EXPIRE', rpm_key, 65)
redis.call('EXPIRE', rpd_key, 86410)
redis.call('EXPIRE', tpm_key, 65)
redis.call('EXPIRE', tpd_key, 86410)

return {1, 'ok', 0, 0}
"""

# ── Lua script: correct token reservation after actual usage is known ─────────
#
# KEYS : [tpm_key, tpd_key]
# ARGV : [delta]   positive = used more tokens than estimated, negative = less
#
# Clamps values to >= 0 to prevent negative counters from corrupting limits.
_LUA_CORRECT_TOKENS = """
local delta = tonumber(ARGV[1])
if delta == 0 then return 0 end
if delta > 0 then
    redis.call('INCRBY', KEYS[1], delta)
    redis.call('INCRBY', KEYS[2], delta)
else
    local absd = -delta
    local tpm = math.max(0, tonumber(redis.call('GET', KEYS[1]) or 0) - absd)
    local tpd = math.max(0, tonumber(redis.call('GET', KEYS[2]) or 0) - absd)
    redis.call('SET', KEYS[1], tpm, 'KEEPTTL')
    redis.call('SET', KEYS[2], tpd, 'KEEPTTL')
end
return 1
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _key_hash(api_key: str) -> str:
    """Return a safe 12-char identifier for an API key (never the key itself)."""
    return hashlib.sha256(api_key.encode()).hexdigest()[:12]


def _minute_epoch() -> int:
    """Current UTC minute window index."""
    return int(time.time() // 60)


def _day_epoch() -> int:
    """Current UTC day window index."""
    return int(time.time() // 86400)


class QuotaDailyExhaustedException(Exception):
    """Raised when all API keys have exhausted their daily (RPD/TPD) quota."""
    def __init__(self, wait_seconds: int):
        self.wait_seconds = wait_seconds
        super().__init__(
            f'All OpenAI API keys have exhausted daily quota. '
            f'Retry after {wait_seconds}s.'
        )


class QuotaTemporarilyUnavailableException(Exception):
    """Raised when all API keys are temporarily rate-limited (RPM/TPM)."""
    def __init__(self, wait_seconds: int):
        self.wait_seconds = wait_seconds
        super().__init__(
            f'All OpenAI API keys are temporarily rate-limited. '
            f'Retry after {wait_seconds}s.'
        )


# ── Main class ────────────────────────────────────────────────────────────────

class QuotaTracker:
    """
    Per-API-key quota tracker backed by Redis.

    Thread-safe: uses atomic Lua scripts for all state mutations.
    Process-safe: singleton cached per Django/Celery worker process.

    Example usage
    -------------
    tracker = QuotaTracker.from_settings()

    # Before making an API call:
    allowed, wait_secs = tracker.check_and_reserve(key, estimated_tokens)
    if not allowed:
        raise QuotaTemporarilyUnavailableException(wait_secs)

    # After the API call (actual token count from response.usage):
    tracker.record_actual_usage(key, actual_tokens, estimated_tokens)

    # Select the best key from the pool:
    best = tracker.best_available_key(pool_keys, estimated_tokens)
    """

    def __init__(
        self,
        redis_client,
        rpm_limit: int = 3,
        rpd_limit: int = 200,
        tpm_limit: int = 60_000,
        tpd_limit: int = 200_000,
        safety_margin: float = 0.90,
    ):
        self._r = redis_client
        # Apply safety margin — avoids riding the hard limit
        self.rpm_limit = max(1, math.floor(rpm_limit * safety_margin))
        self.rpd_limit = max(1, math.floor(rpd_limit * safety_margin))
        self.tpm_limit = max(100, math.floor(tpm_limit * safety_margin))
        self.tpd_limit = max(1000, math.floor(tpd_limit * safety_margin))

        # Register Lua scripts once per process (EVALSHA avoids resending script)
        self._lua_reserve: Optional[object] = None
        self._lua_correct: Optional[object] = None
        if self._r is not None:
            try:
                self._lua_reserve = self._r.register_script(_LUA_RESERVE)
                self._lua_correct = self._r.register_script(_LUA_CORRECT_TOKENS)
                logger.info(
                    'quota_tracker_init rpm=%d rpd=%d tpm=%d tpd=%d margin=%.0f%%',
                    self.rpm_limit, self.rpd_limit,
                    self.tpm_limit, self.tpd_limit,
                    safety_margin * 100,
                )
            except Exception as exc:
                logger.warning('quota_tracker_lua_init_failed error=%s', exc)

    # ── Key builders ──────────────────────────────────────────────────────────

    def _rpm_key(self, api_key: str) -> str:
        return f'openai:rl:{_key_hash(api_key)}:rpm:{_minute_epoch()}'

    def _rpd_key(self, api_key: str) -> str:
        return f'openai:rl:{_key_hash(api_key)}:rpd:{_day_epoch()}'

    def _tpm_key(self, api_key: str) -> str:
        return f'openai:rl:{_key_hash(api_key)}:tpm:{_minute_epoch()}'

    def _tpd_key(self, api_key: str) -> str:
        return f'openai:rl:{_key_hash(api_key)}:tpd:{_day_epoch()}'

    # ── Core operations ───────────────────────────────────────────────────────

    def check_and_reserve(
        self, api_key: str, estimated_tokens: int
    ) -> Tuple[bool, int]:
        """
        Atomically check all four quota dimensions and reserve capacity.

        Returns:
            (allowed, wait_seconds)
            - allowed=True  → quota reserved; proceed with the API call.
            - allowed=False → quota exhausted; wait `wait_seconds` before retry.

        Fails open (returns True, 0) if Redis is unreachable.
        """
        if self._r is None or self._lua_reserve is None:
            return True, 0  # Fail open — don't block evaluations on infra issues

        # Clamp token estimate to a sane range
        tokens = max(1, min(int(estimated_tokens), self.tpm_limit))

        try:
            result = self._lua_reserve(
                keys=[
                    self._rpm_key(api_key),
                    self._rpd_key(api_key),
                    self._tpm_key(api_key),
                    self._tpd_key(api_key),
                ],
                args=[
                    self.rpm_limit,
                    self.rpd_limit,
                    self.tpm_limit,
                    self.tpd_limit,
                    tokens,
                ],
            )
        except Exception as exc:
            logger.warning('quota_reserve_redis_error error=%s', exc)
            return True, 0  # Fail open

        allowed = bool(result[0])
        if allowed:
            return True, 0

        dim = result[1].decode() if isinstance(result[1], bytes) else str(result[1])
        ttl = max(1, int(result[3]))  # seconds until window resets
        # Add a small buffer so we don't retry right at the boundary
        buffer = 5 if dim in ('rpd', 'tpd') else 2
        wait = ttl + buffer

        logger.warning(
            'quota_blocked dim=%s key=%s ttl=%ds wait=%ds',
            dim, _key_hash(api_key), ttl, wait,
        )
        return False, wait

    def record_actual_usage(
        self, api_key: str, actual_tokens: int, estimated_tokens: int
    ) -> None:
        """
        After a successful API call, correct the token reservation.

        check_and_reserve() reserved `estimated_tokens`; this adjusts TPM/TPD
        by the delta so quota accounting stays accurate over time.
        """
        if self._r is None or self._lua_correct is None:
            return

        delta = int(actual_tokens) - int(estimated_tokens)
        if delta == 0:
            return

        try:
            self._lua_correct(
                keys=[self._tpm_key(api_key), self._tpd_key(api_key)],
                args=[delta],
            )
        except Exception as exc:
            # Non-critical: worst case, quota is slightly over/under counted
            logger.debug('quota_correct_tokens_error error=%s', exc)

    def _get(self, redis_key: str) -> int:
        """GET a Redis counter, returning 0 on any error."""
        if self._r is None:
            return 0
        try:
            val = self._r.get(redis_key)
            return int(val) if val is not None else 0
        except Exception:
            return 0

    def _get_ttl(self, redis_key: str) -> int:
        """Return seconds until key expires (0 if missing or no expiry)."""
        if self._r is None:
            return 0
        try:
            ttl = self._r.ttl(redis_key)
            return max(0, ttl) if ttl > 0 else 0
        except Exception:
            return 0

    # ── Key selection ─────────────────────────────────────────────────────────

    def best_available_key(
        self, api_keys: List[str], estimated_tokens: int
    ) -> Optional[str]:
        """
        Return the API key with the most quota headroom for the given request.

        Selection criteria (in priority order):
          1. RPD not exhausted (daily requests remaining)
          2. RPM not exhausted (minute requests remaining)
          3. TPD has room for estimated_tokens
          4. Highest combined remaining RPD + TPD score

        Returns None if no key has sufficient quota.
        Uses a single Redis pipeline to fetch all counters in one round-trip.
        """
        active_keys = [k for k in api_keys if k]
        if not active_keys:
            return None

        if self._r is None:
            # No Redis — return first key (openai_client cooldown still works)
            return active_keys[0]

        # Batch-fetch all counters in one pipeline round-trip
        try:
            pipe = self._r.pipeline(transaction=False)
            for k in active_keys:
                pipe.get(self._rpm_key(k))
                pipe.get(self._rpd_key(k))
                pipe.get(self._tpm_key(k))
                pipe.get(self._tpd_key(k))
            counters = pipe.execute()
        except Exception as exc:
            logger.warning('quota_best_key_pipeline_error error=%s', exc)
            return active_keys[0]  # Fail safe — return first key

        best_key_val: Optional[str] = None
        best_score: int = -1

        for i, key in enumerate(active_keys):
            base = i * 4
            rpm = int(counters[base] or 0)
            rpd = int(counters[base + 1] or 0)
            tpm = int(counters[base + 2] or 0)
            tpd = int(counters[base + 3] or 0)

            # Skip if daily limits exhausted
            if rpd >= self.rpd_limit:
                continue
            if tpd + estimated_tokens > self.tpd_limit:
                continue

            # Skip if minute limit exhausted (will free up in ≤60s)
            if rpm >= self.rpm_limit:
                continue
            if tpm + estimated_tokens > self.tpm_limit:
                continue

            # Score: weight daily remaining more than minute remaining
            rpd_remaining = self.rpd_limit - rpd
            tpd_remaining = self.tpd_limit - tpd
            # Higher RPD remaining = preferred; tie-break on TPD
            score = rpd_remaining * 10_000 + (tpd_remaining // 100)

            if score > best_score:
                best_score = score
                best_key_val = key

        return best_key_val

    def time_until_any_key_available(self, api_keys: List[str]) -> int:
        """
        Return the minimum wait time (seconds) until any key has quota.

        Returns 0 if any key is available right now.
        Returns a large value (up to 86 410) if all keys have exhausted RPD.
        """
        active_keys = [k for k in api_keys if k]
        if not active_keys or self._r is None:
            return 0

        min_wait = 86_410  # Assume worst case: all daily quotas exhausted

        try:
            pipe = self._r.pipeline(transaction=False)
            for k in active_keys:
                pipe.get(self._rpm_key(k))
                pipe.get(self._rpd_key(k))
                pipe.ttl(self._rpm_key(k))
                pipe.ttl(self._rpd_key(k))
            results = pipe.execute()
        except Exception as exc:
            logger.warning('quota_wait_pipeline_error error=%s', exc)
            return 60  # Conservative: try again in a minute

        for i in range(len(active_keys)):
            base = i * 4
            rpm = int(results[base] or 0)
            rpd = int(results[base + 1] or 0)
            rpm_ttl = max(0, int(results[base + 2]) if results[base + 2] and results[base + 2] > 0 else 0)
            rpd_ttl = max(0, int(results[base + 3]) if results[base + 3] and results[base + 3] > 0 else 0)

            if rpm < self.rpm_limit and rpd < self.rpd_limit:
                return 0  # This key is available right now

            if rpd >= self.rpd_limit:
                # Daily quota exhausted — wait for day reset
                min_wait = min(min_wait, rpd_ttl + 5)
            else:
                # Only RPM exhausted — wait for minute reset (fast)
                min_wait = min(min_wait, rpm_ttl + 2)

        return max(1, min_wait)

    # ── Forced quota manipulation (called on 429 response) ────────────────────

    def mark_key_rpm_limited(self, api_key: str, retry_after_seconds: int = 60) -> None:
        """
        Force the RPM counter to the limit so this key is skipped for the
        indicated duration. Called when we receive a 429 RPM-type response.
        """
        if self._r is None:
            return
        try:
            self._r.set(
                self._rpm_key(api_key),
                self.rpm_limit + 10,  # Slightly over limit to be safe
                ex=max(10, retry_after_seconds + 5),
            )
            logger.warning(
                'quota_rpm_forced key=%s duration=%ds', _key_hash(api_key), retry_after_seconds
            )
        except Exception as exc:
            logger.debug('quota_mark_rpm_limited_error error=%s', exc)

    def mark_key_daily_exhausted(self, api_key: str, retry_after_seconds: int = 86_400) -> None:
        """
        Force the RPD counter to the limit. Called when we receive a 429
        response indicating daily quota exhaustion (retry-after > 3600).
        """
        if self._r is None:
            return
        try:
            self._r.set(
                self._rpd_key(api_key),
                self.rpd_limit + 10,
                ex=max(3600, retry_after_seconds + 30),
            )
            logger.warning(
                'quota_rpd_daily_exhausted key=%s duration=%ds',
                _key_hash(api_key), retry_after_seconds,
            )
        except Exception as exc:
            logger.debug('quota_mark_daily_exhausted_error error=%s', exc)

    # ── Observability ─────────────────────────────────────────────────────────

    def get_all_keys_status(self, api_keys: List[str]) -> List[Dict]:
        """
        Return quota usage for all keys (safe for health checks — no key values).
        Uses one pipeline round-trip.
        """
        active_keys = [k for k in api_keys if k]
        if not active_keys or self._r is None:
            return []

        try:
            pipe = self._r.pipeline(transaction=False)
            for k in active_keys:
                pipe.get(self._rpm_key(k))
                pipe.get(self._rpd_key(k))
                pipe.get(self._tpm_key(k))
                pipe.get(self._tpd_key(k))
            results = pipe.execute()
        except Exception:
            return []

        statuses = []
        for i, key in enumerate(active_keys):
            base = i * 4
            statuses.append({
                'key_id': _key_hash(key),
                'rpm': {'used': int(results[base] or 0), 'limit': self.rpm_limit},
                'rpd': {'used': int(results[base + 1] or 0), 'limit': self.rpd_limit},
                'tpm': {'used': int(results[base + 2] or 0), 'limit': self.tpm_limit},
                'tpd': {'used': int(results[base + 3] or 0), 'limit': self.tpd_limit},
            })
        return statuses

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_settings(cls) -> 'QuotaTracker':
        """
        Create a QuotaTracker from Django settings.
        Returns a tracker even if Redis is unavailable (fails open).
        """
        from django.conf import settings

        redis_client = None
        try:
            import redis as _redis
            redis_url = getattr(settings, 'REDIS_URL', None)
            if redis_url:
                redis_client = _redis.Redis.from_url(redis_url, decode_responses=True)
                # Quick connectivity check (raises on failure)
                redis_client.ping()
        except Exception as exc:
            logger.warning('quota_tracker_redis_unavailable error=%s', exc)
            redis_client = None

        return cls(
            redis_client=redis_client,
            rpm_limit=getattr(settings, 'OPENAI_RPM_LIMIT', 3),
            rpd_limit=getattr(settings, 'OPENAI_RPD_LIMIT', 200),
            tpm_limit=getattr(settings, 'OPENAI_TPM_LIMIT', 60_000),
            tpd_limit=getattr(settings, 'OPENAI_TPD_LIMIT', 200_000),
            safety_margin=getattr(settings, 'OPENAI_QUOTA_SAFETY_MARGIN', 0.90),
        )


# ── Module-level singleton (one per worker process) ───────────────────────────
_tracker_instance: Optional[QuotaTracker] = None
_tracker_lock = None


def get_quota_tracker() -> QuotaTracker:
    """Return (and lazily initialise) the module-level QuotaTracker singleton."""
    global _tracker_instance, _tracker_lock
    import threading
    if _tracker_lock is None:
        _tracker_lock = threading.Lock()

    if _tracker_instance is not None:
        return _tracker_instance

    with _tracker_lock:
        if _tracker_instance is not None:
            return _tracker_instance
        _tracker_instance = QuotaTracker.from_settings()

    return _tracker_instance

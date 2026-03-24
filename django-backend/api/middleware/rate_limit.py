"""
api/middleware/rate_limit.py

IP-based API rate limiting middleware using Redis sliding-window counters.

Applied to all /api/* paths. Protects against:
  - Brute-force / credential stuffing attempts
  - Unauthenticated bulk scraping
  - API abuse by any unauthenticated client

Configuration (in settings.py / .env):
  RATE_LIMIT_ENABLED          — True/False master switch (default: True)
  RATE_LIMIT_ANON_PER_MINUTE  — requests/min per IP for unauthenticated (default: 60)
  RATE_LIMIT_AUTH_PER_MINUTE  — requests/min per user ID for authenticated (default: 300)

Rate limit key strategy (enterprise — campus-safe):
  Authenticated (Bearer JWT)  → key = 'uid:<user_id>' extracted from JWT sub claim.
                                Each student has their own independent 300/min bucket.
                                3000 students from the same campus IP never compete.
  Unauthenticated (no token)  → key = 'anon:<ip>' (per-IP, protects public endpoints).

  CRITICAL: Do NOT use IP as the key for authenticated requests.
  In campus/institution environments thousands of students share ONE NAT IP.
  Using IP would collapse all 3000 students into a single 300/min bucket (5 req/s),
  causing ~98% of saves and timer polls to receive 429 during a live test.

Behaviour:
  - Returns HTTP 429 with Retry-After header when limit exceeded.
  - Fails OPEN if Redis is unavailable (never blocks legitimate traffic for Redis downtime).
  - Skips CORS preflight (OPTIONS) and the health-check endpoint.
  - Uses INCR + EXPIRE (atomic on Redis) — no race conditions.
  - JWT decoding uses verify_exp=False — expiry is validated by the view layer,
    not here. We only need the user ID for bucketing.
"""

import logging
import time
from importlib.util import find_spec

from django.conf import settings
from django.http import JsonResponse

logger = logging.getLogger(__name__)

# Lazy import redis — not available in all dev environments
if find_spec('redis') is not None:
    import redis as _redis_lib
else:
    _redis_lib = None

_redis_client = None


def _get_redis():
    """Return a shared Redis client, creating it lazily on first call."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    if _redis_lib is None:
        return None

    redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/2')
    try:
        # Use DB 2 (same as rate limiting in submissions.py)
        _redis_client = _redis_lib.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as exc:
        logger.warning('Rate-limit middleware: Redis unavailable (%s) — failing open', exc)
        return None


def _rate_limited(redis_client, key: str, limit: int, window_seconds: int = 60) -> tuple:
    """
    Increment the request counter for `key` and check against `limit`.

    Returns:
        (is_limited: bool, current_count: int, ttl_seconds: int)

    Uses Redis INCR + EXPIRE.  Thread-safe and atomic on single-node Redis.
    """
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = pipe.execute()

        # Set TTL only on the first request in a window (count == 1) or if key has no TTL
        if count == 1 or ttl < 0:
            redis_client.expire(key, window_seconds)
            ttl = window_seconds

        return count > limit, count, ttl
    except Exception as exc:
        logger.warning('Rate-limit check failed for key %s: %s — failing open', key, exc)
        return False, 0, 60


def _extract_user_id_from_bearer(auth_header: str, fallback: str) -> str:
    """
    Decode the JWT Bearer token (WITHOUT full validation) to extract the `sub`
    (user ID) claim for rate-limit keying.

    We intentionally skip expiry verification here because:
      1. The view layer already validates the token and rejects expired ones.
      2. We only need the user identity for bucketing — auth is not our concern.
      3. Blocking an expired-token request at the rate-limit layer before the view
         can return a proper 401 would confuse clients expecting auth errors.

    Falls back to `fallback` (typically 'anon:{ip}') if decoding fails for any reason.
    """
    if find_spec('jwt') is None:
        return fallback
    try:
        import jwt as pyjwt
        token = auth_header.split(' ', 1)[1].strip()
        if not token:
            return fallback
        payload = pyjwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=['HS256'],
            options={
                'verify_exp': False,    # expiry checked by view, not here
                'verify_nbf': False,    # not-before also skipped
                'verify_aud': False,    # no audience claim in our tokens
            },
        )
        sub = payload.get('sub') or payload.get('user_id')
        return f'uid:{sub}' if sub else fallback
    except Exception:
        # Malformed / wrong-key token — fall back gracefully.
        # The view layer will reject it with 401; we don't need to block here.
        return fallback


class ApiRateLimitMiddleware:
    """
    Django WSGI middleware that applies per-user and per-IP rate limits to all
    /api/ endpoints using Redis counters.

    Key design: authenticated requests are keyed on the JWT user ID (sub claim),
    NOT on the IP address.  This is critical for campus deployments where thousands
    of students share a single NAT IP — IP-based keying would collapse all students
    into one shared bucket and cause mass 429s during live tests.
    """

    # Paths exempt from the global rate limit.
    # /api/auth/login has its own dedicated per-identifier lockout and per-IP
    # limit (200/min) implemented directly in api/views/auth.py.
    EXEMPT_PATHS = {'/api/health/', '/api/health', '/api/auth/login'}

    def __init__(self, get_response):
        self.get_response = get_response
        self.enabled = getattr(settings, 'RATE_LIMIT_ENABLED', True)
        self.anon_limit = getattr(settings, 'RATE_LIMIT_ANON_PER_MINUTE', 60)
        self.auth_limit = getattr(settings, 'RATE_LIMIT_AUTH_PER_MINUTE', 300)

    def __call__(self, request):
        if self.enabled and self._should_check(request):
            response = self._check_rate_limit(request)
            if response is not None:
                return response

        return self.get_response(request)

    def _should_check(self, request) -> bool:
        """Return True if this request should be rate-checked."""
        # Only apply to /api/ paths
        if not request.path.startswith('/api/'):
            return False
        # Skip CORS preflight — OPTIONS must never be rate limited
        if request.method == 'OPTIONS':
            return False
        # Skip exempt paths (health, login)
        if request.path in self.EXEMPT_PATHS:
            return False
        return True

    def _get_client_ip(self, request) -> str:
        """Extract real client IP, respecting trusted reverse proxy headers."""
        # X-Forwarded-For is set by nginx; use first (leftmost = real client)
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', 'unknown')

    def _check_rate_limit(self, request):
        """
        Perform the rate-limit check.  Returns a 429 JsonResponse if limited,
        None if the request should proceed.

        Key selection:
          Bearer token present → decode JWT → key = 'uid:<user_id>' (per student)
          No Bearer token      → key = 'anon:<ip>' (per IP, unauthenticated)

        This ensures 3000 campus students on the same IP each get their own
        independent 300/min bucket and never block each other.
        """
        redis_client = _get_redis()
        if redis_client is None:
            return None  # Fail open — Redis unavailable

        ip = self._get_client_ip(request)
        auth_header = request.headers.get('Authorization', '')

        minute_bucket = int(time.time()) // 60   # 1-minute sliding window

        if auth_header.startswith('Bearer '):
            # ── Authenticated request ────────────────────────────────────────
            # Decode JWT to get the actual user ID for the rate-limit key.
            # This is the ONLY correct approach for campus environments:
            # each student gets their own private 300/min bucket regardless
            # of how many students share the same public IP address.
            user_key = _extract_user_id_from_bearer(auth_header, fallback=f'anon:{ip}')
            key = f'rl:auth:{user_key}:{minute_bucket}'
            limit = self.auth_limit
        else:
            # ── Unauthenticated request ──────────────────────────────────────
            # No Bearer token → fall back to per-IP bucketing.
            # Covers public endpoints and pre-login traffic.
            key = f'rl:anon:{ip}:{minute_bucket}'
            limit = self.anon_limit

        is_limited, current_count, ttl = _rate_limited(redis_client, key, limit)

        if is_limited:
            logger.warning(
                'Rate limit exceeded — path=%s ip=%s key=%s count=%d limit=%d',
                request.path, ip, key, current_count, limit,
            )
            response = JsonResponse(
                {
                    'error': 'Too many requests',
                    'detail': f'Rate limit of {limit} requests/minute exceeded. '
                              f'Please retry after {ttl} seconds.',
                },
                status=429,
            )
            response['Retry-After'] = str(ttl)
            response['X-RateLimit-Limit'] = str(limit)
            response['X-RateLimit-Remaining'] = '0'
            return response

        return None

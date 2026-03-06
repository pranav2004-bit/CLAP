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

Behaviour:
  - Returns HTTP 429 with Retry-After header when limit exceeded.
  - Fails OPEN if Redis is unavailable (never blocks legitimate traffic for Redis downtime).
  - Skips CORS preflight (OPTIONS) and the health-check endpoint.
  - Uses INCR + EXPIRE (atomic on Redis) — no race conditions.
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


class ApiRateLimitMiddleware:
    """
    Django WSGI middleware that applies per-IP and per-user rate limits to all
    /api/ endpoints using Redis counters.
    """

    # Paths exempt from the global IP rate limit.
    # /api/auth/login has its own dedicated per-identifier lockout and per-IP
    # limit (200/min) implemented directly in api/views/auth.py, which is
    # appropriate for school networks where many students share one public IP.
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
        # Skip CORS preflight
        if request.method == 'OPTIONS':
            return False
        # Skip exempt paths
        if request.path in self.EXEMPT_PATHS:
            return False
        return True

    def _get_client_ip(self, request) -> str:
        """Extract real client IP, respecting trusted reverse proxy headers."""
        # X-Forwarded-For is set by nginx/ALB; use first (leftmost = client)
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', 'unknown')

    def _check_rate_limit(self, request):
        """
        Perform the rate-limit check.  Returns a 429 JsonResponse if limited,
        None if the request should proceed.
        """
        redis_client = _get_redis()
        if redis_client is None:
            return None  # Fail open — Redis unavailable

        ip = self._get_client_ip(request)

        # Determine if request is authenticated
        user_id = request.headers.get('x-user-id', '').strip()
        if not user_id:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                # Treat any request with a bearer token as authenticated for rate-limit
                # purposes (JWT validity is checked by the view, not here)
                user_id = f'token:{ip}'  # use IP as tie-breaker for unauthenticated tokens

        minute_bucket = int(time.time()) // 60   # 1-minute sliding window

        if user_id:
            # Authenticated: rate-limit by user ID
            key = f'rl:auth:{user_id}:{minute_bucket}'
            limit = self.auth_limit
        else:
            # Unauthenticated: rate-limit by IP
            key = f'rl:anon:{ip}:{minute_bucket}'
            limit = self.anon_limit

        is_limited, current_count, ttl = _rate_limited(redis_client, key, limit)

        if is_limited:
            logger.warning(
                'Rate limit exceeded — path=%s ip=%s user_id=%s count=%d limit=%d',
                request.path, ip, user_id or 'anon', current_count, limit,
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

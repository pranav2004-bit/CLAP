"""
api/views/health.py

D5: Public health endpoint for load balancers, Docker HEALTHCHECK, and uptime monitors.
GET /api/health/

Returns 200 when the service is ready to accept requests, 503 when degraded.

Checks performed:
  - Database: executes SELECT 1 (verifies DB connection and query path)
  - Redis:    PING (verifies broker/cache connectivity)

Response format:
  {
    "status": "ok" | "degraded",
    "checks": {
      "database": "ok" | "error: <reason>",
      "redis":    "ok" | "error: <reason>"
    },
    "version": "<app version from settings, optional>"
  }
"""

import logging
from importlib.util import find_spec

from django.conf import settings
from django.db import connection, OperationalError
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

logger = logging.getLogger(__name__)

if find_spec('redis') is not None:
    import redis as _redis_lib
else:
    _redis_lib = None


@csrf_exempt
@require_http_methods(["GET"])
@never_cache
def health_check(request):
    """
    Public health endpoint — no authentication required.
    Exempt from rate limiting (see ApiRateLimitMiddleware.EXEMPT_PATHS).
    """
    checks = {}
    overall = 'ok'

    # ── Database check ────────────────────────────────────────────
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        checks['database'] = 'ok'
    except OperationalError as exc:
        checks['database'] = f'error: {exc}'
        overall = 'degraded'
        logger.warning('Health check: database unreachable — %s', exc)
    except Exception as exc:
        checks['database'] = f'error: {exc}'
        overall = 'degraded'

    # ── Redis check ───────────────────────────────────────────────
    if _redis_lib is not None:
        redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/2')
        try:
            r = _redis_lib.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
            r.ping()
            checks['redis'] = 'ok'
        except Exception as exc:
            checks['redis'] = f'error: {exc}'
            overall = 'degraded'
            logger.warning('Health check: Redis unreachable — %s', exc)
    else:
        checks['redis'] = 'redis library not installed'

    payload = {
        'status': overall,
        'checks': checks,
    }

    app_version = getattr(settings, 'APP_VERSION', None)
    if app_version:
        payload['version'] = app_version

    http_status = 200 if overall == 'ok' else 503
    return JsonResponse(payload, status=http_status)

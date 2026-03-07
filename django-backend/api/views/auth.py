"""
Authentication Views
Backend-only login endpoint for frontend auth.

Enterprise hardening:
  - Issues JWT access tokens on successful login
  - Per-identifier progressive lockout (5 fails / 5 min → 15 min lockout)
  - Per-IP rate limit for login (200/min, handles school networks)
  - bcrypt password verification
  - Fails open on Redis unavailability (login still works, lockout is skipped)
"""

import json
import logging
import time
import bcrypt
from datetime import datetime, timedelta, timezone as dt_timezone
from importlib.util import find_spec

from django.conf import settings
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import User

logger = logging.getLogger(__name__)

# ── Redis helpers ─────────────────────────────────────────────────────────────

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
        _redis_client = _redis_lib.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        return _redis_client
    except Exception as exc:
        logger.warning('Auth: Redis unavailable (%s) — skipping lockout checks', exc)
        return None


def _lockout_key(identifier: str) -> str:
    return f'login:lockout:{identifier.lower()}'


def _fails_key(identifier: str) -> str:
    return f'login:fails:{identifier.lower()}'


def _check_lockout(redis_client, identifier: str) -> tuple:
    """Returns (is_locked: bool, ttl_seconds: int)."""
    if redis_client is None:
        return False, 0
    ttl = redis_client.ttl(_lockout_key(identifier))
    return (ttl > 0, ttl)


def _record_failed_attempt(redis_client, identifier: str) -> None:
    """
    Increment fail counter. After 5 failures in a 5-minute window,
    sets a 15-minute lockout key.
    """
    if redis_client is None:
        return
    key = _fails_key(identifier)
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = pipe.execute()
        if count == 1 or ttl < 0:
            redis_client.expire(key, 300)   # 5-minute failure window
        if count >= 5:
            redis_client.setex(_lockout_key(identifier), 900, '1')  # 15-minute lockout
    except Exception as exc:
        logger.warning('Auth: Redis fail recording error (%s)', exc)


def _clear_failed_attempts(redis_client, identifier: str) -> None:
    """Reset fail counter and lockout after a successful login."""
    if redis_client is None:
        return
    try:
        redis_client.delete(_fails_key(identifier))
        redis_client.delete(_lockout_key(identifier))
    except Exception as exc:
        logger.warning('Auth: Redis clear error (%s)', exc)


def _check_login_ip_limit(redis_client, ip: str) -> bool:
    """
    Returns True if the IP has exceeded 200 login attempts per minute.
    200/min allows an entire school network logging in simultaneously
    while still blocking a single bot hammering many accounts.
    """
    if redis_client is None:
        return False
    try:
        key = f'login:ip:{ip}:{int(time.time()) // 60}'
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 60)
        results = pipe.execute()
        ip_count = results[0]
        return ip_count > 200
    except Exception as exc:
        logger.warning('Auth: IP rate-limit check error (%s)', exc)
        return False


# ── JWT helper ────────────────────────────────────────────────────────────────

def _issue_jwt(user: User) -> str | None:
    """
    Issue a short-lived HS256 JWT for the authenticated user.
    Returns None if PyJWT is not installed.
    """
    try:
        import jwt as pyjwt
    except ImportError:
        logger.warning('Auth: PyJWT not installed — JWT issuance skipped')
        return None

    access_minutes = getattr(settings, 'JWT_ACCESS_TOKEN_MINUTES', 60)
    exp = datetime.now(dt_timezone.utc) + timedelta(minutes=access_minutes)
    payload = {
        'sub': str(user.id),
        'role': user.role,
        'exp': exp,
        'iat': datetime.now(dt_timezone.utc),
    }
    try:
        return pyjwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    except Exception as exc:
        logger.error('Auth: JWT encoding failed: %s', exc)
        return None


# ── Token refresh view ────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["POST"])
def refresh_token(request):
    """
    POST /api/auth/refresh
    Authorization: Bearer <current_access_token>

    Re-issues a fresh access token for the same user without requiring the password.
    Accepts tokens up to 30 minutes past their expiry (grace window for network hiccups
    and brief server restarts).  Returns 401 if the token is older than that, malformed,
    or the user account has been disabled.

    This is the backend half of the frontend auto-refresh that prevents users from being
    unexpectedly logged out mid-session by a transient 401.
    """
    try:
        import jwt as pyjwt
    except ImportError:
        logger.warning('Auth: PyJWT not installed — token refresh unavailable')
        return JsonResponse({'error': 'JWT not available'}, status=500)

    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return JsonResponse({'error': 'Missing Bearer token'}, status=401)

    token = auth_header.split(' ', 1)[1].strip()
    if not token:
        return JsonResponse({'error': 'Empty token'}, status=401)

    try:
        # Allow up to 30 minutes past expiry — covers clock drift and brief outages
        payload = pyjwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=['HS256'],
            leeway=timedelta(minutes=30),
        )
        user_id = payload.get('sub') or payload.get('user_id')
        if not user_id:
            return JsonResponse({'error': 'Invalid token payload'}, status=401)

        user = User.objects.get(id=user_id)
        if not user.is_active:
            return JsonResponse({'error': 'Account disabled'}, status=403)

        new_token = _issue_jwt(user)
        access_minutes = getattr(settings, 'JWT_ACCESS_TOKEN_MINUTES', 60)
        return JsonResponse({
            'access_token': new_token,
            'token_type': 'Bearer',
            'expires_in': access_minutes * 60,
        })

    except pyjwt.ExpiredSignatureError:
        # Token is older than the 30-minute grace window — must re-login
        return JsonResponse({'error': 'Token too old to refresh — please log in again'}, status=401)
    except (pyjwt.InvalidTokenError, User.DoesNotExist):
        return JsonResponse({'error': 'Invalid token'}, status=401)
    except Exception as exc:
        logger.error('Token refresh error: %s', exc, exc_info=True)
        return JsonResponse({'error': 'Refresh failed'}, status=500)


# ── Login view ────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["POST"])
def login(request):
    """
    POST /api/auth/login
    Body: { identifier, password, role }

    Returns user data + JWT access token on success.
    Returns 429 if locked out (too many failures) or IP limit exceeded.
    Returns 401 on invalid credentials.
    Returns 403 if account is disabled.
    """
    try:
        body = json.loads(request.body or "{}")
        identifier = (body.get("identifier") or "").strip()
        password = body.get("password") or ""
        role = (body.get("role") or "student").strip()

        if not identifier or not password:
            return JsonResponse({"error": "Missing identifier or password"}, status=400)

        if role not in ("student", "admin"):
            return JsonResponse({"error": "Invalid role"}, status=400)

        redis_client = _get_redis()

        # ── Per-identifier lockout check ──────────────────────────────────────
        is_locked, lockout_ttl = _check_lockout(redis_client, identifier)
        if is_locked:
            return JsonResponse(
                {"error": f"Account temporarily locked due to too many failed attempts. "
                          f"Try again in {lockout_ttl} seconds."},
                status=429
            )

        # ── Per-IP rate limit for login ───────────────────────────────────────
        # Extracts the real client IP, respecting reverse proxy X-Forwarded-For.
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        ip = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR', 'unknown')
        if _check_login_ip_limit(redis_client, ip):
            return JsonResponse(
                {"error": "Too many login attempts from this network. Please try again in a minute."},
                status=429
            )

        # ── User lookup ───────────────────────────────────────────────────────
        query = User.objects.filter(role=role)
        if role == "student":
            query = query.filter(
                Q(email__iexact=identifier) |
                Q(username__iexact=identifier) |
                Q(student_id__iexact=identifier)
            )
        else:
            query = query.filter(email__iexact=identifier)

        user = query.first()
        if not user:
            _record_failed_attempt(redis_client, identifier)
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        if not user.is_active:
            return JsonResponse({"error": "This account is disabled by admin"}, status=403)

        # ── Password verification ─────────────────────────────────────────────
        try:
            valid = bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8"))
        except Exception as exc:
            logger.error("Password verification failed: %s", exc)
            _record_failed_attempt(redis_client, identifier)
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        if not valid:
            _record_failed_attempt(redis_client, identifier)
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        # ── Success: clear lockout, issue JWT ─────────────────────────────────
        _clear_failed_attempts(redis_client, identifier)
        access_token = _issue_jwt(user)
        access_minutes = getattr(settings, 'JWT_ACCESS_TOKEN_MINUTES', 60)

        response_data = {
            "user": {
                "id": str(user.id),
                "email": user.email,
                "role": user.role,
                "full_name": user.full_name,
                "profile_completed": user.profile_completed,
                "student_id": user.student_id,
            },
            "token_type": "Bearer",
            "expires_in": access_minutes * 60,
        }
        if access_token:
            response_data["access_token"] = access_token

        return JsonResponse(response_data)

    except Exception as exc:
        logger.error("Login error: %s", exc, exc_info=True)
        return JsonResponse({"error": "Authentication failed"}, status=500)

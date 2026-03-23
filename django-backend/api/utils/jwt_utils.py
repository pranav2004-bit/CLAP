"""
api/utils/jwt_utils.py

Request authentication helper for CLAP Django backend.

Supported authentication methods (in priority order):
  1. x-user-id header  — Direct user UUID, trusted only when
                          settings.TRUST_X_USER_ID_HEADER is True.
                          WARNING: disable in production unless your reverse
                          proxy strips this header from external requests.
  2. Authorization: Bearer <JWT>  — HS256 JWT signed with settings.SECRET_KEY.
  3. ?token=<JWT> query param     — For SSE/EventSource (cannot set headers).
                                    Only accepted on GET requests.

E2 security note:
  TRUST_X_USER_ID_HEADER defaults to True for backward compatibility with
  the existing Next.js frontend. Set it to False in production after ensuring
  your nginx/ALB config strips 'x-user-id' from incoming requests.
"""

import logging

try:
    import jwt
except ImportError:
    jwt = None

from django.conf import settings
from api.models import User

logger = logging.getLogger(__name__)


def get_user_from_request(request):
    """
    Retrieve the authenticated User from the request.

    Returns a User instance on success, or None if authentication fails.
    """
    # ── Method 1: x-user-id header or query param ─────────────────────────────
    trust_header = getattr(settings, 'TRUST_X_USER_ID_HEADER', True)
    if trust_header:
        user_id = request.headers.get('x-user-id', '').strip()
        # Also allow query param for GET requests (needed for <audio>/<img> tags)
        if not user_id and request.method == 'GET':
            user_id = request.GET.get('user_id', '').strip()

        if user_id:
            try:
                return User.objects.get(id=user_id)
            except (User.DoesNotExist, ValueError):
                logger.warning('User ID authentication failed (id=%s)', user_id)
                # Fall through to JWT check

    # ── Resolve raw JWT token from header or query param ──────────────────────
    raw_token = ''

    # Standard Authorization: Bearer <jwt> header
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        raw_token = auth_header.split(' ', 1)[1].strip()

    # ?token=<jwt> query param — for SSE / EventSource / media elements.
    # EventSource API does not support custom headers, so SSE endpoints pass
    # the JWT as a query param.  Only accepted on GET requests.
    if not raw_token and request.method == 'GET':
        raw_token = request.GET.get('token', '').strip()

    if not raw_token:
        return None

    # ── Decode and validate JWT ────────────────────────────────────────────────
    if jwt is None:
        logger.error('PyJWT is not installed — cannot decode JWT tokens.')
        return None

    try:
        payload = jwt.decode(
            raw_token,
            settings.SECRET_KEY,
            algorithms=['HS256'],
        )
        user_id = payload.get('sub') or payload.get('user_id')
        if user_id:
            return User.objects.get(id=user_id)
    except jwt.ExpiredSignatureError:
        logger.warning('JWT token expired')
    except jwt.InvalidTokenError as exc:
        logger.warning('Invalid JWT token: %s', exc)
    except User.DoesNotExist:
        logger.warning('JWT token: user not found')
    except Exception as exc:
        logger.error('Unexpected error decoding JWT token: %s', exc)

    return None

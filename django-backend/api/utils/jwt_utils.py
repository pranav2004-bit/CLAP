"""
api/utils/jwt_utils.py

Request authentication helper for CLAP Django backend.

Supported authentication methods (in priority order):
  1. x-user-id header  — Direct user UUID, trusted only when
                          settings.TRUST_X_USER_ID_HEADER is True.
                          WARNING: disable in production unless your reverse
                          proxy strips this header from external requests.
  2. Authorization: Bearer <JWT>  — HS256 JWT signed with settings.SECRET_KEY.

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
    # ── Method 1: x-user-id header or query param ───────────────────────────────
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

    # ── Method 2: JWT Bearer token ────────────────────────────────
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        if jwt is None:
            logger.error('PyJWT is not installed — cannot decode Bearer tokens.')
            return None

        token = auth_header.split(' ', 1)[1]
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=['HS256'],
            )
            user_id = payload.get('sub') or payload.get('user_id')
            if user_id:
                return User.objects.get(id=user_id)
        except jwt.ExpiredSignatureError:
            logger.warning('Bearer token expired')
        except jwt.InvalidTokenError as exc:
            logger.warning('Invalid Bearer token: %s', exc)
        except User.DoesNotExist:
            logger.warning('Bearer token: user not found (id=%s)', user_id)
        except Exception as exc:
            logger.error('Unexpected error decoding Bearer token: %s', exc)

    return None

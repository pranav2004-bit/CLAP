"""
Shared admin authentication guard.

Consolidates _require_admin() that was duplicated across all admin view modules.
Uses case-insensitive role comparison to handle 'admin' / 'Admin' variations.
"""

from django.http import JsonResponse

from api.utils.jwt_utils import get_user_from_request


def require_admin(request):
    """
    Verify the request comes from an admin user.

    Returns (user, None) on success, (None, JsonResponse 401) on failure.
    Role comparison is intentionally case-insensitive so that both 'admin'
    and 'Admin' stored values are accepted.
    """
    user = get_user_from_request(request)
    if not user or user.role.lower() != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None

"""
Shared admin authentication guard.

Consolidates _require_admin() that was duplicated across all admin view modules.
Uses case-insensitive role comparison to handle 'admin' / 'Admin' variations.
"""

from django.http import JsonResponse

from api.utils.jwt_utils import get_user_from_request


def require_admin(request):
    """
    Verify the request comes from an admin (super admin) user.

    Returns (user, None) on success, (None, JsonResponse 401) on failure.
    Role comparison is intentionally case-insensitive so that both 'admin'
    and 'Admin' stored values are accepted.
    """
    user = get_user_from_request(request)
    if not user or user.role.lower() != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None


def require_admin_or_sub_admin(request):
    """
    Verify the request comes from an admin or sub_admin user.

    Sub admins have restricted UI access (Students tab only) but full API
    access to all student-management endpoints. This guard is used exclusively
    on student-management endpoints so both roles can operate them.

    Returns (user, None) on success, (None, JsonResponse 401) on failure.
    """
    user = get_user_from_request(request)
    if not user or user.role.lower() not in ('admin', 'sub_admin'):
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None

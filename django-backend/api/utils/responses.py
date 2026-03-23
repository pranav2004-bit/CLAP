"""
API Response Utilities
Maintains exact response structure from Next.js backend
"""

from django.db import DatabaseError, IntegrityError, OperationalError
from django.http import JsonResponse
from rest_framework.views import exception_handler as drf_exception_handler
import logging

logger = logging.getLogger(__name__)


def success_response(data, message=None, status=200):
    """
    Success response matching Next.js successResponse utility
    """
    response_data = {
        'success': True,
        'data': data,
    }
    if message:
        response_data['message'] = message
    
    return JsonResponse(response_data, status=status)


def error_response(error, message=None, status=500):
    """
    Error response matching Next.js errorResponse utility
    """
    response_data = {
        'success': False,
        'error': error,
    }
    if message:
        response_data['message'] = message
    
    return JsonResponse(response_data, status=status)


def validation_error_response(errors, status=400):
    """
    Validation error response matching Next.js validationErrorResponse
    """
    return JsonResponse({
        'success': False,
        'error': 'VALIDATION_ERROR',
        'message': 'Validation failed',
        'data': errors
    }, status=status)


def not_found_response(resource, status=404):
    """
    Not found response matching Next.js notFoundResponse
    """
    return JsonResponse({
        'success': False,
        'error': 'NOT_FOUND',
        'message': f'{resource} not found'
    }, status=status)


def unauthorized_response(status=401):
    """
    Unauthorized response matching Next.js unauthorizedResponse
    """
    return JsonResponse({
        'success': False,
        'error': 'UNAUTHORIZED',
        'message': 'Unauthorized access'
    }, status=status)


def bad_request_response(message, status=400):
    """
    Bad request response matching Next.js badRequestResponse
    """
    return JsonResponse({
        'success': False,
        'error': 'BAD_REQUEST',
        'message': message
    }, status=status)


def custom_exception_handler(exc, context):
    """
    Custom exception handler for DRF APIViews.
    Handles database-specific exceptions with correct status codes and
    structured JSON responses that do NOT leak internal details to clients.

    Also handles OperationalError → 503, IntegrityError → 409, DatabaseError → 500
    for any DRF-based view that raises these before DatabaseErrorMiddleware can catch them.
    """
    from django.conf import settings as dj_settings

    # ── Database errors: map to correct HTTP status codes ─────────────────────
    if isinstance(exc, OperationalError):
        logger.error('DB operational error in DRF view: %s', exc, exc_info=True)
        resp = JsonResponse(
            {
                'success': False,
                'error': 'SERVICE_UNAVAILABLE',
                'message': 'Database temporarily unavailable. Please retry in a moment.',
            },
            status=503,
        )
        resp['Retry-After'] = '5'
        return resp

    if isinstance(exc, IntegrityError):
        logger.error('DB integrity error in DRF view: %s', exc, exc_info=True)
        return JsonResponse(
            {
                'success': False,
                'error': 'CONFLICT',
                'message': 'A data conflict occurred. The record may already exist or a required reference is missing.',
            },
            status=409,
        )

    if isinstance(exc, DatabaseError):
        logger.error('DB error in DRF view: %s', exc, exc_info=True)
        return JsonResponse(
            {
                'success': False,
                'error': 'DATABASE_ERROR',
                'message': 'A database error occurred. Please try again.',
            },
            status=500,
        )

    # ── DRF-recognised exceptions (AuthenticationFailed, PermissionDenied, etc.) ──
    response = drf_exception_handler(exc, context)

    if response is not None:
        message = str(exc) if dj_settings.DEBUG else 'An error occurred. Please try again.'
        response.data = {
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': message,
        }

    # Log unhandled or server errors with full stack trace
    if response is None or response.status_code >= 500:
        logger.error('Unhandled exception in DRF view: %s', exc, exc_info=True)

    return response

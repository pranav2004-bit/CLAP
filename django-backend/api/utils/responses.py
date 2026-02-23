"""
API Response Utilities
Maintains exact response structure from Next.js backend
"""

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
    Custom exception handler for DRF to match Next.js error responses.
    Does NOT leak internal error details to the client.
    """
    from django.conf import settings as dj_settings

    # Call DRF's default exception handler first
    response = drf_exception_handler(exc, context)

    if response is not None:
        # Use generic message in production, detailed in debug mode
        message = str(exc) if dj_settings.DEBUG else 'An error occurred. Please try again.'
        custom_response_data = {
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': message,
        }
        response.data = custom_response_data

    # Log the actual error for debugging regardless
    if response is None or response.status_code >= 500:
        logger.error('Unhandled exception: %s', exc, exc_info=True)

    return response

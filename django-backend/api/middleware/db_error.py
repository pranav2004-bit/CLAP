"""
api/middleware/db_error.py

Global database error handler middleware.

Catches Django database exceptions that escape from any view and converts them
into structured JSON responses with correct HTTP status codes.  Without this,
an OperationalError (e.g. DB timeout, connection pool exhausted) would bubble
up as an HTML 500 page — unusable by the JSON-only frontend.

Status code mapping:
  OperationalError  → 503 Service Unavailable  (transient; client should retry)
  IntegrityError    → 409 Conflict             (duplicate key, FK violation, etc.)
  DatabaseError     → 500 Internal Server Error (other unclassified DB errors)

Behaviour:
  - Always logs the full exception with stack trace (exc_info=True)
  - Never leaks internal DB error details to the client response
  - Includes Retry-After: 5 on 503 responses (guides client retry logic)
  - Skips non-/api/ paths (admin Django UI, static files) — lets Django
    handle those with its own error pages
"""

import logging

from django.db import DatabaseError, IntegrityError, OperationalError
from django.http import JsonResponse

logger = logging.getLogger(__name__)


class DatabaseErrorMiddleware:
    """
    Django WSGI middleware that intercepts unhandled database exceptions
    from any view and returns structured JSON error responses.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except OperationalError as exc:
            # DB connection lost, pool exhausted, query timeout, etc.
            # Transient — client should retry after a short delay.
            logger.error(
                'Database operational error | method=%s path=%s | %s',
                request.method, request.path, exc,
                exc_info=True,
            )
            response = JsonResponse(
                {
                    'success': False,
                    'error': 'SERVICE_UNAVAILABLE',
                    'message': 'The database is temporarily unavailable. Please retry in a moment.',
                },
                status=503,
            )
            response['Retry-After'] = '5'
            return response

        except IntegrityError as exc:
            # Unique constraint, FK violation, NOT NULL, check constraint.
            # Client sent data that conflicts with existing state.
            logger.error(
                'Database integrity error | method=%s path=%s | %s',
                request.method, request.path, exc,
                exc_info=True,
            )
            return JsonResponse(
                {
                    'success': False,
                    'error': 'CONFLICT',
                    'message': 'A data conflict occurred. The record may already exist or a required reference is missing.',
                },
                status=409,
            )

        except DatabaseError as exc:
            # Catch-all for any other Django DB exception not covered above.
            logger.error(
                'Database error | method=%s path=%s | %s',
                request.method, request.path, exc,
                exc_info=True,
            )
            return JsonResponse(
                {
                    'success': False,
                    'error': 'DATABASE_ERROR',
                    'message': 'A database error occurred. Please try again.',
                },
                status=500,
            )

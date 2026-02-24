"""
api/middleware/cache_headers.py

Phase 2.2 — Cache-Control header middleware.

Applies appropriate Cache-Control headers to all API responses so that
CDN and browser caches behave correctly for different content types.

Activation
----------
Add to MIDDLEWARE in settings.py (after SecurityMiddleware):

    'api.middleware.cache_headers.CacheControlMiddleware',

This middleware is NOT active by default — it is registered in settings.py
only when CDN_ENABLED=True or CACHE_CONTROL_MIDDLEWARE_ENABLED=True.

Cache policy summary
---------------------
| Path prefix              | Cache-Control                        | Who caches |
|--------------------------|--------------------------------------|------------|
| /api/*                   | no-store                             | Nobody     |
| /static/*                | Handled by WhiteNoise (immutable)    | CDN + browser |
| Media files (served via  | See audio_playback.py view           | Browser    |
|  FileResponse)           |                                      |            |

Note: PDF report and audio file responses set their own Cache-Control headers
in the view layer (audio_playback.py) because they have per-user semantics
that cannot be determined from the URL alone.
"""

import logging

logger = logging.getLogger(__name__)


class CacheControlMiddleware:
    """
    Ensure all /api/* responses carry ``Cache-Control: no-store``.

    This prevents intermediate proxies, CDNs, and shared browser caches from
    storing authenticated API responses. Individual views may override this
    by setting their own Cache-Control header before this middleware runs,
    but in practice all CLAP API responses should never be cached.

    Static assets (/static/*) are not touched — WhiteNoise handles those.
    """

    # Paths where this middleware should NOT override cache headers.
    # These views set their own Cache-Control (e.g. public audio assets).
    EXCLUDE_PREFIXES = ('/static/', '/media/')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        path = request.path_info

        # Skip excluded prefixes
        for prefix in self.EXCLUDE_PREFIXES:
            if path.startswith(prefix):
                return response

        # Only apply to /api/ paths
        if not path.startswith('/api/'):
            return response

        # If the view already set a Cache-Control header, respect it.
        if 'Cache-Control' not in response:
            response['Cache-Control'] = 'no-store'

        return response

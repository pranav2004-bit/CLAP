"""
api/utils/cdn.py

Phase 2.1 — Provider-agnostic CDN URL resolver.

Usage
-----
    from api.utils.cdn import resolve_delivery_url

    # In a view or task, after obtaining a raw S3 presigned or direct URL:
    download_url = resolve_delivery_url(raw_url, url_type='download')

The resolver rewrites raw S3 URLs to CDN delivery URLs when CDN_ENABLED=True.
It is a *transparent* wrapper — callers do not need to know which CDN is active.

Settings (add to settings.py / .env):
    CDN_ENABLED          = False          # Master switch
    CDN_BASE_URL         = ""             # e.g. https://cdn.example.com
    CDN_PROVIDER         = "generic"      # 'cloudfront' | 'cloudflare' | 'fastly' | 'generic'
    CDN_SIGNED_URLS_ENABLED = False       # Phase 2.3 — enables CDN-signed URL generation

Rules
-----
  - CDN_ENABLED=False  → original URL returned unchanged (zero impact on dev)
  - CDN_ENABLED=True   → S3 URL rewritten to CDN_BASE_URL/{object_key}
  - Presigned PUT (upload) URLs are NEVER rewritten — always raw S3
  - url_type='download' rewrites; url_type='upload' returns original

S3 URL formats handled:
  s3://bucket/key              → CDN_BASE_URL/key
  https://bucket.s3.region.amazonaws.com/key?AWSAccessKeyId=...
    → CDN_BASE_URL/key  (only when NOT a presigned upload URL)
  https://project.supabase.co/storage/v1/object/...
    → CDN_BASE_URL/{key}

Phase 2.3 extension point
--------------------------
When CDN_SIGNED_URLS_ENABLED=True, call generate_signed_cdn_url() instead of
plain URL rewriting. Implementation added in Phase 2.3; until then this raises
NotImplementedError so teams know it requires completion before enabling.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse, urlunparse

from django.conf import settings

logger = logging.getLogger(__name__)

# ── Configuration helpers ─────────────────────────────────────────────────────

def _cdn_enabled() -> bool:
    return bool(getattr(settings, 'CDN_ENABLED', False))


def _cdn_base_url() -> str:
    url = getattr(settings, 'CDN_BASE_URL', '').rstrip('/')
    return url


def _cdn_signed_enabled() -> bool:
    return bool(getattr(settings, 'CDN_SIGNED_URLS_ENABLED', False))


# ── Object key extraction ─────────────────────────────────────────────────────

def _extract_key_from_s3_uri(url: str) -> str | None:
    """Parse ``s3://bucket/key/path`` → ``key/path``."""
    if not url.startswith('s3://'):
        return None
    # s3://bucket/key → path component is /key
    parsed = urlparse(url)
    return parsed.path.lstrip('/')


def _extract_key_from_https(url: str) -> str | None:
    """
    Extract the object key from a standard AWS S3 or Supabase Storage HTTPS URL.

    Supported formats:
      Virtual-hosted:  https://<bucket>.s3.<region>.amazonaws.com/<key>[?...]
      Path-style:      https://s3.<region>.amazonaws.com/<bucket>/<key>[?...]
      Supabase:        https://<ref>.supabase.co/storage/v1/object/[public/]<bucket>/<key>
    """
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path

    # AWS virtual-hosted style
    if '.s3.' in host and 'amazonaws.com' in host:
        return path.lstrip('/')

    # AWS path-style
    if host.startswith('s3.') and 'amazonaws.com' in host:
        # Path: /<bucket>/<key>
        parts = path.lstrip('/').split('/', 1)
        return parts[1] if len(parts) == 2 else None

    # Supabase Storage
    if 'supabase.co' in host and '/storage/v1/object/' in path:
        # Strip /storage/v1/object/[public/]<bucket>/
        remainder = path.split('/storage/v1/object/', 1)[-1]
        # Remove optional 'public/' prefix and bucket name
        parts = remainder.lstrip('/').split('/', 2)
        if len(parts) >= 3:
            return parts[2]  # the actual file key
        return None

    return None


def _is_presigned_upload(url: str) -> bool:
    """Detect AWS presigned PUT / Supabase presigned upload URLs — never CDN-rewrite these."""
    lower = url.lower()
    return (
        'x-amz-signature' in lower
        or 'awsaccesskeyid' in lower  # v2 presigned
        or 'x-amz-expires' in lower
    )


# ── Public API ────────────────────────────────────────────────────────────────

def resolve_delivery_url(raw_url: str, url_type: str = 'download') -> str:
    """
    Rewrite *raw_url* to a CDN delivery URL when CDN is enabled.

    Parameters
    ----------
    raw_url:   The original storage URL (s3:// URI or HTTPS presigned download URL).
    url_type:  'download' — may be rewritten to CDN.
               'upload'   — always returned unchanged (presigned PUT).

    Returns
    -------
    CDN URL (str) if CDN is enabled and the URL can be rewritten.
    Original URL (str) otherwise — never raises, always returns a usable URL.
    """
    if not raw_url:
        return raw_url

    if url_type == 'upload' or not _cdn_enabled():
        return raw_url

    # Never rewrite presigned upload/PUT URLs
    if _is_presigned_upload(raw_url):
        logger.debug('CDN: skipping presigned upload URL (not rewritten)')
        return raw_url

    base = _cdn_base_url()
    if not base:
        logger.warning('CDN_ENABLED=True but CDN_BASE_URL is not set — returning original URL')
        return raw_url

    # Phase 2.3: signed CDN URLs
    if _cdn_signed_enabled():
        raise NotImplementedError(
            'CDN_SIGNED_URLS_ENABLED=True requires Phase 2.3 implementation. '
            'Implement generate_signed_cdn_url() in api/utils/cdn.py before enabling.'
        )

    # Extract the object key from the URL
    key: str | None = None
    if raw_url.startswith('s3://'):
        key = _extract_key_from_s3_uri(raw_url)
    elif raw_url.startswith('https://') or raw_url.startswith('http://'):
        key = _extract_key_from_https(raw_url)

    if not key:
        logger.warning(
            'CDN: could not extract object key from URL %r — returning original',
            raw_url[:120],
        )
        return raw_url

    cdn_url = f'{base}/{key}'
    logger.debug('CDN: rewrote %r → %r', raw_url[:80], cdn_url[:80])
    return cdn_url


def generate_signed_cdn_url(key: str, expires_in: int = 3600) -> str:
    """
    Phase 2.3 stub — generate a signed CDN delivery URL.

    Parameters
    ----------
    key:        S3 object key (e.g. 'reports/batch-1/student-42.pdf').
    expires_in: Signature lifetime in seconds.

    Provider dispatch (set CDN_PROVIDER in settings):
      'cloudfront' → boto3 cloudfront_signer (RSA-SHA1, requires CDN_SIGNING_KEY_ID
                      and CDN_SIGNING_PRIVATE_KEY env vars)
      'generic'    → falls back to S3 presigned URL (no CDN signing)

    Raises
    ------
    NotImplementedError until Phase 2.3 is fully implemented.
    """
    raise NotImplementedError(
        'generate_signed_cdn_url() is a Phase 2.3 stub. '
        'Implement CloudFront RSA signing or equivalent before calling.'
    )

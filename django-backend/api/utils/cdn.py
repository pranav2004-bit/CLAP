"""
api/utils/cdn.py

Phases 2.1 + 2.3 — Provider-agnostic CDN URL resolver and signed URL generator.

Usage
-----
    from api.utils.cdn import resolve_delivery_url

    # In a view or task, after obtaining a raw S3 or storage URL:
    download_url = resolve_delivery_url(raw_url, url_type='download')

The resolver is a *transparent* wrapper — callers do not need to know which
CDN provider or signing mode is active.

Settings
--------
    CDN_ENABLED             = False          # Master switch
    CDN_BASE_URL            = ""             # e.g. https://cdn.example.com
    CDN_PROVIDER            = "generic"      # See below
    CDN_SIGNED_URLS_ENABLED = False          # Phase 2.3

    # Phase 2.3 CloudFront credentials (only needed when CDN_PROVIDER=cloudfront)
    CDN_SIGNING_KEY_ID      = ""             # CloudFront Key Pair ID
    CDN_SIGNING_PRIVATE_KEY = ""             # RSA private key, PEM, base64-encoded

CDN_PROVIDER values
-------------------
    'cloudfront' — AWS CloudFront signed URLs.
                   Requires: CDN_SIGNING_KEY_ID, CDN_SIGNING_PRIVATE_KEY, CDN_BASE_URL.
                   Uses botocore.signers.CloudFrontSigner + cryptography (RSA-SHA1).
    'generic'    — Falls back to a plain S3 presigned GET URL (no CDN signing).
                   Works without CDN_BASE_URL; uses S3 directly.
    'cloudflare' — Stub (not yet implemented). Falls through to generic.
    'fastly'     — Stub (not yet implemented). Falls through to generic.

Behaviour matrix
----------------
    CDN_ENABLED  CDN_SIGNED_URLS_ENABLED  → outcome
    False        *                        → original URL unchanged (zero impact)
    True         False                    → plain URL rewrite to CDN_BASE_URL/{key}
    True         True                     → signed URL via generate_signed_cdn_url()

Upload URLs (presigned PUT) are NEVER rewritten regardless of settings.

S3 URL formats handled
----------------------
    s3://bucket/key              → CDN_BASE_URL/key
    https://bucket.s3.region.amazonaws.com/key?...  (virtual-hosted)
    https://s3.region.amazonaws.com/bucket/key?...  (path-style)
    https://<ref>.supabase.co/storage/v1/object/...

Security note
-------------
    CloudFront signed URL signatures use RSA-SHA1 (AWS requirement).  The private
    key is never logged; it is loaded from a base64-encoded env var and cached in a
    module-level singleton for performance.  The singleton is process-scoped, so
    each Gunicorn/Celery worker holds its own copy (no shared-state issues).
    resolve_delivery_url() fails OPEN on signing errors — the original URL is
    returned so users can still access their content if CDN signing breaks.
"""

from __future__ import annotations

import base64
import datetime
import logging
from urllib.parse import urlparse

from django.conf import settings

logger = logging.getLogger(__name__)


# ── Configuration helpers ─────────────────────────────────────────────────────

def _cdn_enabled() -> bool:
    return bool(getattr(settings, 'CDN_ENABLED', False))


def _cdn_base_url() -> str:
    return (getattr(settings, 'CDN_BASE_URL', '') or '').rstrip('/')


def _cdn_provider() -> str:
    return (getattr(settings, 'CDN_PROVIDER', 'generic') or 'generic').lower()


def _cdn_signed_enabled() -> bool:
    return bool(getattr(settings, 'CDN_SIGNED_URLS_ENABLED', False))


# ── Module-level signer cache ─────────────────────────────────────────────────
# The CloudFrontSigner is stateless after construction (key_id + callback).
# Loading the PEM key once per worker avoids repeated base64 decode + PEM parse
# on every presigned URL generation (~1 ms overhead, not negligible at 300 req/min).

_cloudfront_signer_instance: object | None = None
_cloudfront_signer_key_id: str = ''


def _get_cloudfront_signer():
    """
    Return a cached botocore.signers.CloudFrontSigner built from settings.

    Lazy-initialised on first call; cached for the process lifetime.
    Thread-safe: botocore.signers.CloudFrontSigner is stateless after init.

    Raises ValueError / ImportError with actionable messages on misconfiguration.
    """
    global _cloudfront_signer_instance, _cloudfront_signer_key_id

    key_id = getattr(settings, 'CDN_SIGNING_KEY_ID', '') or ''
    private_key_b64 = getattr(settings, 'CDN_SIGNING_PRIVATE_KEY', '') or ''

    if not key_id:
        raise ValueError(
            'CDN_PROVIDER=cloudfront requires CDN_SIGNING_KEY_ID. '
            'Find it in: AWS Console → CloudFront → Public keys → Key pairs → Key ID.'
        )
    if not private_key_b64:
        raise ValueError(
            'CDN_PROVIDER=cloudfront requires CDN_SIGNING_PRIVATE_KEY. '
            'Encode the RSA PEM private key with: base64 -w0 private_key.pem'
        )

    # Return cached signer if key_id has not changed (e.g. between tests)
    if _cloudfront_signer_instance is not None and _cloudfront_signer_key_id == key_id:
        return _cloudfront_signer_instance

    # Decode base64 → PEM bytes
    try:
        private_key_pem: bytes = base64.b64decode(private_key_b64)
    except Exception as exc:
        raise ValueError(
            'CDN_SIGNING_PRIVATE_KEY is not valid base64. '
            f'Encode with: base64 -w0 private_key.pem  Error: {exc}'
        ) from exc

    # Load RSA private key — requires the 'cryptography' package
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
    except ImportError as exc:
        raise ImportError(
            'The "cryptography" package is required for CloudFront signed URLs. '
            'It is listed in requirements.txt — run: pip install cryptography>=41.0'
        ) from exc

    try:
        private_key = serialization.load_pem_private_key(private_key_pem, password=None)
    except Exception as exc:
        raise ValueError(
            'CDN_SIGNING_PRIVATE_KEY could not be loaded as an RSA PEM private key. '
            f'Generate one with: openssl genrsa -out private_key.pem 2048  Error: {exc}'
        ) from exc

    # Build the rsa_signer callback required by CloudFrontSigner.
    # CloudFront mandates RSA with PKCS#1 v1.5 padding + SHA-1 hash (AWS spec).
    def rsa_signer(message: bytes) -> bytes:
        return private_key.sign(message, asym_padding.PKCS1v15(), hashes.SHA1())

    try:
        from botocore.signers import CloudFrontSigner
    except ImportError as exc:
        raise ImportError(
            'botocore (installed via boto3) is required for CloudFront signed URLs. '
            'Ensure boto3 is installed: pip install boto3'
        ) from exc

    signer = CloudFrontSigner(key_id, rsa_signer)

    # Cache for this process lifetime
    _cloudfront_signer_instance = signer
    _cloudfront_signer_key_id = key_id
    logger.info('CDN: CloudFrontSigner initialised (key_id=%s)', key_id)

    return signer


# ── Object key extraction ─────────────────────────────────────────────────────

def _extract_key_from_s3_uri(url: str) -> str | None:
    """Parse ``s3://bucket/key/path`` → ``key/path``."""
    if not url.startswith('s3://'):
        return None
    parsed = urlparse(url)
    return parsed.path.lstrip('/') or None


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

    # AWS virtual-hosted style:  bucket.s3.region.amazonaws.com
    if '.s3.' in host and 'amazonaws.com' in host:
        return path.lstrip('/') or None

    # AWS path-style:  s3.region.amazonaws.com/bucket/key
    if host.startswith('s3.') and 'amazonaws.com' in host:
        parts = path.lstrip('/').split('/', 1)
        return parts[1] if len(parts) == 2 else None

    # Supabase Storage:  ref.supabase.co/storage/v1/object/[public/]bucket/key
    if 'supabase.co' in host and '/storage/v1/object/' in path:
        remainder = path.split('/storage/v1/object/', 1)[-1]
        parts = remainder.lstrip('/').split('/', 2)
        return parts[2] if len(parts) >= 3 else None

    return None


def _is_presigned_upload(url: str) -> bool:
    """Detect AWS presigned PUT / Supabase presigned upload URLs — never CDN-rewrite these."""
    lower = url.lower()
    return (
        'x-amz-signature' in lower
        or 'awsaccesskeyid' in lower   # v2 presigned
        or 'x-amz-expires' in lower
    )


# ── Signed URL providers ──────────────────────────────────────────────────────

def _cloudfront_signed_url(key: str, expires_in: int) -> str:
    """
    Generate an AWS CloudFront signed URL using RSA-SHA1 Key Pair signing.

    The signed URL enforces an expiry at the CDN edge — no S3 credentials are
    exposed.  Objects stay private in S3; only CloudFront (via OAC) can fetch them.

    One-time AWS setup:
      1. CloudFront → Public keys → Add key → upload the RSA *public* key PEM.
      2. CloudFront → Key groups → Add group → include the key above.
      3. Attach the key group to your distribution's cache behaviour
         (Restrict viewer access → Trusted key groups).
      4. Set CDN_SIGNING_KEY_ID to the Key Pair ID shown in step 1.
      5. Set CDN_SIGNING_PRIVATE_KEY to the output of: base64 -w0 private_key.pem
    """
    base = _cdn_base_url()
    if not base:
        raise ValueError(
            'CDN_PROVIDER=cloudfront requires CDN_BASE_URL '
            '(your CloudFront distribution domain, e.g. https://xxxx.cloudfront.net).'
        )

    signer = _get_cloudfront_signer()
    cdn_url = f'{base}/{key}'
    expiry = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)

    logger.debug(
        'CDN (CloudFront): signing URL for key=%r expires_in=%ds', key[:80], expires_in
    )
    return signer.generate_presigned_url(cdn_url, date_less_than=expiry)


def _generic_presigned_url(key: str, expires_in: int) -> str:
    """
    Fall back to a plain S3 presigned GET URL (no CDN signing layer).

    The presigned URL carries AWS credentials in query parameters and is valid
    for `expires_in` seconds.  Use when:
      - No CDN is provisioned yet but you still want time-limited access.
      - CDN_PROVIDER=generic (explicit opt-out of CDN signing).
    """
    # Lazy import to avoid circular dependency at module load time
    from api.utils.storage import get_s3_client

    client = get_s3_client()
    if not client:
        raise RuntimeError(
            'CDN_PROVIDER=generic requires S3 credentials to be configured '
            '(S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME).'
        )

    bucket = getattr(settings, 'S3_BUCKET_NAME', '') or ''
    if not bucket:
        raise RuntimeError('S3_BUCKET_NAME is not configured.')

    logger.debug(
        'CDN (generic): generating S3 presigned URL for key=%r expires_in=%ds',
        key[:80], expires_in,
    )
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=expires_in,
    )


# ── Public API ────────────────────────────────────────────────────────────────

def generate_signed_cdn_url(key: str, expires_in: int = 3600) -> str:
    """
    Generate a signed CDN delivery URL for the given S3 object key.

    Dispatches to the active CDN_PROVIDER:
      'cloudfront' → CloudFront signed URL (RSA-SHA1, Key Pair based).
                     Requires CDN_SIGNING_KEY_ID, CDN_SIGNING_PRIVATE_KEY, CDN_BASE_URL.
      'generic'    → S3 presigned GET URL (no CDN layer).
                     Works without CDN_BASE_URL; uses S3 credentials directly.
      'cloudflare' → raises NotImplementedError (use 'generic' as fallback).
      'fastly'     → raises NotImplementedError (use 'generic' as fallback).

    Parameters
    ----------
    key:        S3 object key (e.g. 'reports/batch-1/student-42.pdf').
    expires_in: Signature lifetime in seconds (default 3600 = 1 hour).
                Match S3_PRESIGNED_URL_EXPIRY_SECONDS so email links stay
                valid for the same window.

    Returns
    -------
    Signed URL string ready to embed in API responses or emails.

    Raises
    ------
    ValueError        — missing required settings (actionable message included).
    RuntimeError      — S3 client not configured.
    ImportError       — 'cryptography' not installed (cloudfront provider).
    NotImplementedError — provider not yet implemented (cloudflare/fastly).
    """
    provider = _cdn_provider()

    if provider == 'cloudfront':
        return _cloudfront_signed_url(key, expires_in)

    if provider == 'generic':
        return _generic_presigned_url(key, expires_in)

    if provider in ('cloudflare', 'fastly'):
        raise NotImplementedError(
            f'CDN_PROVIDER={provider!r} signed URL generation is not yet implemented. '
            f'Set CDN_PROVIDER=generic to use S3 presigned URLs instead, or '
            f'CDN_PROVIDER=cloudfront for AWS CloudFront signed URLs.'
        )

    raise ValueError(
        f'Unknown CDN_PROVIDER={provider!r}. '
        f'Supported values: cloudfront, generic.'
    )


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
    Original URL (str) in all other cases — never raises, always usable.

    Behaviour matrix
    ----------------
    CDN_ENABLED=False                 → raw_url (no-op)
    url_type='upload'                 → raw_url (never rewrite PUT URLs)
    CDN_ENABLED=True, signed=False    → CDN_BASE_URL/{key}  (plain rewrite)
    CDN_ENABLED=True, signed=True     → generate_signed_cdn_url(key, expires)
                                        on error → raw_url (fail open)
    """
    if not raw_url:
        return raw_url

    if url_type == 'upload' or not _cdn_enabled():
        return raw_url

    # Never rewrite presigned upload/PUT URLs
    if _is_presigned_upload(raw_url):
        logger.debug('CDN: skipping presigned upload URL (not rewritten)')
        return raw_url

    # Extract object key — needed for both plain rewrite and signed URLs
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

    # Phase 2.3: signed URL path — provider dispatched via CDN_PROVIDER
    if _cdn_signed_enabled():
        expires_in = int(getattr(settings, 'S3_PRESIGNED_URL_EXPIRY_SECONDS', 604800))
        try:
            signed = generate_signed_cdn_url(key, expires_in=expires_in)
            logger.debug('CDN: signed URL generated for key=%r', key[:80])
            return signed
        except Exception as exc:
            # Fail OPEN — log the error and return the original URL so users can
            # still access their content even if CDN signing is misconfigured.
            logger.error(
                'CDN: signed URL generation failed for key=%r (%s: %s) — '
                'returning original URL as fallback',
                key[:80], type(exc).__name__, exc,
            )
            return raw_url

    # Phase 2.1: plain URL rewrite (CDN_SIGNED_URLS_ENABLED=False)
    base = _cdn_base_url()
    if not base:
        logger.warning(
            'CDN_ENABLED=True but CDN_BASE_URL is not set — returning original URL'
        )
        return raw_url

    cdn_url = f'{base}/{key}'
    logger.debug('CDN: rewrote %r → %r', raw_url[:80], cdn_url[:80])
    return cdn_url

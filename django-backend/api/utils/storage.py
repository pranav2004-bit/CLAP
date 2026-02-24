"""
api/utils/storage.py

Provider-agnostic storage helper for CLAP application.

Supports three backends (controlled by STORAGE_PROVIDER in settings):
  'aws'       -> Amazon S3 via boto3
  'supabase'  -> Supabase Storage (S3-compatible, same boto3 code path)
  ''          -> Local filesystem under MEDIA_ROOT (dev only)

Settings reads:
  S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
  S3_ENDPOINT_URL, S3_REGION_NAME, S3_SIGNATURE_VERSION,
  S3_ADDRESSING_STYLE  (all resolved by settings.py from the active provider)

Public API:
  get_s3_client()                                  -> boto3 client | None
  upload_to_storage(file_obj, object_key, ctype)   -> 's3://...' | None
  delete_from_storage(file_path)                   -> bool
"""

import logging
import os
from importlib.util import find_spec
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# boto3 is optional — dev without S3 works fine with local storage.
if find_spec('boto3') is not None:
    import boto3
    import botocore.config
    from botocore.exceptions import BotoCoreError, ClientError
else:
    boto3 = None
    botocore = None
    BotoCoreError = Exception
    ClientError = Exception


# ── S3 client ────────────────────────────────────────────────────────────────

def get_s3_client():
    """
    Return a configured boto3 S3 client, or None if S3 is not configured.

    Credentials are read from Django settings (which already resolves the
    active provider — aws or supabase — in settings.py):
        S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME,
        S3_ENDPOINT_URL, S3_REGION_NAME, S3_ADDRESSING_STYLE,
        S3_SIGNATURE_VERSION
    """
    if boto3 is None:
        return None

    key    = getattr(settings, 'S3_ACCESS_KEY_ID', None) or None
    secret = getattr(settings, 'S3_SECRET_ACCESS_KEY', None) or None
    bucket = getattr(settings, 'S3_BUCKET_NAME', None) or None
    if not key or not secret or not bucket:
        return None

    addressing_style    = getattr(settings, 'S3_ADDRESSING_STYLE', 'virtual') or 'virtual'
    signature_version   = getattr(settings, 'S3_SIGNATURE_VERSION', 's3v4') or 's3v4'
    endpoint            = getattr(settings, 'S3_ENDPOINT_URL', None) or None
    region              = getattr(settings, 'S3_REGION_NAME', None) or None

    kwargs = {
        'aws_access_key_id':     key,
        'aws_secret_access_key': secret,
        'config': botocore.config.Config(
            s3={'addressing_style': addressing_style},
            signature_version=signature_version,
        ),
    }
    if endpoint:
        kwargs['endpoint_url'] = endpoint
    if region:
        kwargs['region_name'] = region

    try:
        return boto3.client('s3', **kwargs)
    except Exception as exc:
        logger.warning('Failed to create S3 client: %s', exc)
        return None


# ── Upload ───────────────────────────────────────────────────────────────────

def upload_to_storage(
    file_obj,
    object_key: str,
    content_type: str,
    cache_control: Optional[str] = None,
) -> Optional[str]:
    """
    Upload a file-like object to S3 (or Supabase Storage).

    Returns:
        's3://<bucket>/<object_key>'  when S3 is configured and upload succeeds.
        None                          when S3 is not configured; caller falls back
                                      to local disk storage.

    Raises:
        RuntimeError  on S3 upload failure (caller should return HTTP 500).

    Note on memory usage:
        Admin audio files pass through the server (multipart POST) and are <=10 MB.
        They are read into memory once for put_object().  Student audio files use the
        presigned-URL flow and never pass through the server, so this code is NOT in
        the hot path for concurrent student submissions.

    Args:
        file_obj:      Django UploadedFile or any object with .read() / .chunks().
        object_key:    S3 object key, e.g. 'admin_audio/2026/02/item-id_ts.mp3'
        content_type:  MIME type, e.g. 'audio/mpeg'
        cache_control: Optional Cache-Control header value to embed in S3 object
                       metadata. When set, CDN edge nodes and browsers will use
                       this value when serving the object.
                       Examples:
                         'public, max-age=86400, s-maxage=86400'  — CDN-cacheable
                         'private, max-age=3600'                   — browser-only
                       None = no Cache-Control metadata (S3 default: no-cache).
    """
    client = get_s3_client()
    bucket = getattr(settings, 'S3_BUCKET_NAME', '') or ''
    if not client or not bucket:
        return None  # Signal caller to fall back to local storage

    # Read bytes — single read is fine for admin one-time uploads (<= 10 MB).
    if hasattr(file_obj, 'read'):
        data = file_obj.read()
    else:
        # Django InMemoryUploadedFile / TemporaryUploadedFile support .chunks()
        data = b''.join(file_obj.chunks())

    put_kwargs: dict = {
        'Bucket': bucket,
        'Key': object_key,
        'Body': data,
        'ContentType': content_type,
        'ServerSideEncryption': 'AES256',   # E3: enforce at-rest encryption
    }
    if cache_control:
        put_kwargs['CacheControl'] = cache_control   # Phase 2.2

    try:
        client.put_object(**put_kwargs)
    except (BotoCoreError, ClientError) as exc:
        logger.error('S3 upload failed (key=%s): %s', object_key, exc)
        raise RuntimeError(f'S3 upload failed: {exc}') from exc

    return f's3://{bucket}/{object_key}'


# ── Delete ───────────────────────────────────────────────────────────────────

def delete_from_storage(file_path: str) -> bool:
    """
    Delete a file from S3 or the local filesystem.

    Args:
        file_path: Either 's3://bucket/key' (cloud) or a relative path
                   (relative to settings.MEDIA_ROOT for local files).

    Returns True on success, False on any error (errors are logged, not raised).
    """
    if not file_path:
        return False
    if file_path.startswith('s3://'):
        return _delete_from_s3(file_path)
    return _delete_local(file_path)


def _delete_from_s3(s3_path: str) -> bool:
    """Delete an object from S3 given an 's3://bucket/key' path."""
    try:
        # Strip 's3://' then split on first '/'
        without_scheme = s3_path[len('s3://'):]
        bucket, _, key = without_scheme.partition('/')
        if not bucket or not key:
            logger.warning('Malformed S3 path for deletion: %s', s3_path)
            return False
    except Exception as exc:
        logger.warning('Failed to parse S3 path %s: %s', s3_path, exc)
        return False

    client = get_s3_client()
    if not client:
        logger.warning(
            'Cannot delete S3 object — S3 client not configured: %s', s3_path
        )
        return False

    try:
        client.delete_object(Bucket=bucket, Key=key)
        logger.debug('Deleted S3 object: %s', s3_path)
        return True
    except (BotoCoreError, ClientError) as exc:
        logger.error('Failed to delete S3 object %s: %s', s3_path, exc)
        return False


def _delete_local(relative_path: str) -> bool:
    """Delete a file from the local filesystem (path relative to MEDIA_ROOT)."""
    try:
        full_path = os.path.join(settings.MEDIA_ROOT, relative_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            logger.debug('Deleted local file: %s', full_path)
        return True
    except OSError as exc:
        logger.error('Failed to delete local file %s: %s', relative_path, exc)
        return False

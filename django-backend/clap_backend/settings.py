"""
Django settings for CLAP backend project.
Maintains behavioral parity with Next.js backend.
"""

import os
import json
from pathlib import Path
from decouple import config

from datetime import timedelta
import importlib.util

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
# In production, SECRET_KEY MUST be set via environment variable.
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-this-in-production-CHANGE-ME')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'api',  # Our main API app
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    # A5/E1: IP-based rate limiting — placed early to reject abuse before view logic runs
    'api.middleware.rate_limit.ApiRateLimitMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'clap_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'clap_backend.wsgi.application'

# Database - Using Supabase PostgreSQL
# Same database as Next.js frontend
DB_APP_USER = config('DB_APP_USER', default=config('DB_USER', default='postgres'))
DB_APP_PASSWORD = config('DB_APP_PASSWORD', default=config('DB_PASSWORD', default=''))

# Database - Using Supabase PostgreSQL
# Same database as Next.js frontend
# Least-privilege note:
# - API deployments should run with DB_APP_USER/DB_APP_PASSWORD (no schema modification privileges).
# - Worker deployments can run with separate credentials via the same settings module by setting
#   DB_APP_USER/DB_APP_PASSWORD differently in worker environment.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='postgres'),
        'USER': DB_APP_USER,
        'PASSWORD': DB_APP_PASSWORD,
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': config('DB_CONN_MAX_AGE', default=600, cast=int),
        # B2: validate connection health before reuse (Django 4.1+)
        # Prevents stale-connection errors after DB failover / network blip
        'CONN_HEALTH_CHECKS': True,
        'OPTIONS': {
            'sslmode': config('DB_SSLMODE', default='require'),
            'connect_timeout': config('DB_CONNECT_TIMEOUT', default=10, cast=int),
            'options': '-c statement_timeout=' + str(config('DB_STATEMENT_TIMEOUT_MS', default=30000, cast=int)),
        },
    }
}

# Request body size limit (prevent memory exhaustion from large payloads)
DATA_UPLOAD_MAX_MEMORY_SIZE = config('DATA_UPLOAD_MAX_MEMORY_SIZE', default=10 * 1024 * 1024, cast=int)  # 10 MB

# A4: Always spool uploaded files to disk — prevents OOM when students upload
# 10 MB audio recordings. TemporaryFileUploadHandler writes to disk immediately;
# MemoryFileUploadHandler (Django default) holds entire upload in RAM.
FILE_UPLOAD_HANDLERS = [
    'django.core.files.uploadhandler.TemporaryFileUploadHandler',
]

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (uploaded content)
MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media/'

# Audio upload settings
AUDIO_UPLOAD_MAX_SIZE = 10 * 1024 * 1024  # 10 MB
AUDIO_ALLOWED_EXTENSIONS = ['webm', 'mp4', 'mp3', 'wav', 'ogg', 'm4a', 'aac']
AUDIO_ALLOWED_MIMETYPES = [
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/m4a',
    'audio/aac',
    'audio/x-m4a'
]

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS Settings - Allow Next.js frontend
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000'
).split(',')

CORS_ALLOW_CREDENTIALS = True

# Allow cache control headers from frontend
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'cache-control',
    'pragma',
    'expires',
    'x-user-id',
]




# Secrets Manager integration (optional)
SECRETS_MANAGER_PROVIDER = config('SECRETS_MANAGER_PROVIDER', default='env')
SECRETS_MANAGER_REGION = config('SECRETS_MANAGER_REGION', default='')
SECRETS_MANAGER_PREFIX = config('SECRETS_MANAGER_PREFIX', default='clap/')


def _resolve_secret(name: str, default: str = ''):
    env_value = config(name, default='')
    if env_value:
        return env_value

    if SECRETS_MANAGER_PROVIDER != 'aws':
        return default

    if importlib.util.find_spec('boto3') is None:
        return default

    import boto3

    secret_id = f"{SECRETS_MANAGER_PREFIX}{name}"
    client = boto3.client('secretsmanager', region_name=SECRETS_MANAGER_REGION or None)
    try:
        response = client.get_secret_value(SecretId=secret_id)
    except Exception:
        return default

    secret_string = response.get('SecretString')
    if not secret_string:
        return default

    try:
        payload = json.loads(secret_string)
        if isinstance(payload, dict):
            return str(payload.get(name, default))
    except Exception:
        return secret_string

    return default

# REST Framework Settings
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'EXCEPTION_HANDLER': 'api.utils.custom_exception_handler',
    # A5/E1: DRF-level throttle classes (applies to APIView-based endpoints)
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': config('DRF_THROTTLE_ANON', default='60/min'),
        'user': config('DRF_THROTTLE_USER', default='300/min'),
    },
}

# ── API Rate Limiting (middleware-level, applies to all function-based views) ─
# A5/E1: brute-force / API-abuse protection
# Controls ApiRateLimitMiddleware in api/middleware/rate_limit.py
RATE_LIMIT_ENABLED         = config('RATE_LIMIT_ENABLED', default=True, cast=bool)
RATE_LIMIT_ANON_PER_MINUTE = config('RATE_LIMIT_ANON_PER_MINUTE', default=60, cast=int)
RATE_LIMIT_AUTH_PER_MINUTE = config('RATE_LIMIT_AUTH_PER_MINUTE', default=300, cast=int)

# ── E2: x-user-id header trust ───────────────────────────────────────────────
# When True (default), the x-user-id request header is trusted as a direct
# user identity shortcut (matches current frontend behaviour).
# WARNING: In production behind a reverse proxy (nginx/ALB), set this to False
# and ensure the proxy STRIPS the x-user-id header from external requests.
# When False, only JWT Bearer tokens are accepted for authentication.
TRUST_X_USER_ID_HEADER = config('TRUST_X_USER_ID_HEADER', default=True, cast=bool)

# JWT settings (architecture target: 15 minute access, 7 day refresh)
JWT_ACCESS_TOKEN_MINUTES = config('JWT_ACCESS_TOKEN_MINUTES', default=15, cast=int)
JWT_REFRESH_TOKEN_DAYS = config('JWT_REFRESH_TOKEN_DAYS', default=7, cast=int)
JWT_ROTATE_REFRESH_TOKENS = config('JWT_ROTATE_REFRESH_TOKENS', default=True, cast=bool)
JWT_BLACKLIST_AFTER_ROTATION = config('JWT_BLACKLIST_AFTER_ROTATION', default=True, cast=bool)

if importlib.util.find_spec('rest_framework_simplejwt'):
    INSTALLED_APPS.append('rest_framework_simplejwt.token_blacklist')
    REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'] = (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    )
    SIMPLE_JWT = {
        'ACCESS_TOKEN_LIFETIME': timedelta(minutes=JWT_ACCESS_TOKEN_MINUTES),
        'REFRESH_TOKEN_LIFETIME': timedelta(days=JWT_REFRESH_TOKEN_DAYS),
        'ROTATE_REFRESH_TOKENS': JWT_ROTATE_REFRESH_TOKENS,
        'BLACKLIST_AFTER_ROTATION': JWT_BLACKLIST_AFTER_ROTATION,
        'UPDATE_LAST_LOGIN': True,
        'AUTH_HEADER_TYPES': ('Bearer',),
        'ALGORITHM': 'HS256',
        'SIGNING_KEY': SECRET_KEY,
    }

# OpenAI Configuration
OPENAI_API_KEY = _resolve_secret('OPENAI_API_KEY', default='')

# Email Configuration (Resend)
RESEND_API_KEY = _resolve_secret('RESEND_API_KEY', default='')
FROM_EMAIL = config('FROM_EMAIL', default='noreply@clap-test.com')

# A6: Structured JSON logging — machine-parseable by CloudWatch, Datadog, etc.
# Each log line is a JSON object with timestamp, level, logger, message fields.
# Falls back to human-readable text in DEBUG mode for readability in dev.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'clap_backend.json_formatter.JsonFormatter',
        },
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            # Use JSON in production, human-readable in dev (DEBUG=True)
            'formatter': 'verbose' if DEBUG else 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'api': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
        'celery': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# CSRF Settings - Disable for API (using header-based auth like Next.js)
CSRF_COOKIE_HTTPONLY = True


# TLS enforcement
ENFORCE_TLS = config('ENFORCE_TLS', default=not DEBUG, cast=bool)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = ENFORCE_TLS
SESSION_COOKIE_SECURE = ENFORCE_TLS
CSRF_COOKIE_SECURE = ENFORCE_TLS
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000 if ENFORCE_TLS else 0, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config('SECURE_HSTS_INCLUDE_SUBDOMAINS', default=ENFORCE_TLS, cast=bool)
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=False, cast=bool)
SECURE_REFERRER_POLICY = config('SECURE_REFERRER_POLICY', default='strict-origin-when-cross-origin')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'

# Custom settings matching Next.js behavior
DEFAULT_PASSWORD = 'CLAP@123'  # Default password for new students
BCRYPT_ROUNDS = 10  # Match Next.js bcrypt rounds


# Celery Configuration
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/1')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_TASK_TRACK_STARTED = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_RESULT_EXPIRES = config('CELERY_RESULT_EXPIRES', default=3600, cast=int)  # 1 hour
CELERY_TASK_TIME_LIMIT = config('CELERY_TASK_TIME_LIMIT', default=600, cast=int)  # 10 min hard kill
CELERY_TASK_SOFT_TIME_LIMIT = config('CELERY_TASK_SOFT_TIME_LIMIT', default=540, cast=int)  # 9 min graceful

CELERY_TASK_ROUTES = {
    'api.tasks.score_rule_based': {'queue': 'rule_scoring'},
    'api.tasks.evaluate_writing': {'queue': 'llm_evaluation'},
    'api.tasks.evaluate_speaking': {'queue': 'llm_evaluation'},
    'api.tasks.generate_report': {'queue': 'report_gen'},
    'api.tasks.send_email_report': {'queue': 'email'},
}

CELERY_TASK_DEFAULT_QUEUE = 'default'
CLAP_CELERY_QUEUES = ('rule_scoring', 'llm_evaluation', 'report_gen', 'email')

# Redis Configuration (cache/idempotency/rate limit fast-path)
REDIS_URL = config('REDIS_URL', default='redis://localhost:6379/2')

# ── Media Storage Configuration ──────────────────────────────────────────────
# STORAGE_PROVIDER controls where audio recordings and PDF reports are stored.
# Options:
#   'aws'      — Amazon S3 (set S3_BUCKET_NAME + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY)
#   'supabase' — Supabase Storage (S3-compatible; set SUPABASE_STORAGE_BUCKET +
#                SUPABASE_STORAGE_ACCESS_KEY + SUPABASE_STORAGE_SECRET_KEY +
#                SUPABASE_PROJECT_REF)
#   ''         — No cloud storage; files saved locally under MEDIA_ROOT (dev only)
STORAGE_PROVIDER = config('STORAGE_PROVIDER', default='').lower()

# ── AWS S3 credentials (used when STORAGE_PROVIDER=aws) ─────────────────────
S3_BUCKET_NAME = config('S3_BUCKET_NAME', default='')
S3_REGION_NAME = config('S3_REGION_NAME', default='')
S3_ACCESS_KEY_ID = config('S3_ACCESS_KEY_ID', default='')
S3_SECRET_ACCESS_KEY = config('S3_SECRET_ACCESS_KEY', default='')

# ── Supabase Storage credentials (used when STORAGE_PROVIDER=supabase) ───────
# Supabase Storage is fully S3-compatible — uses the same boto3 under the hood.
# Get these from: Supabase Dashboard → Storage → S3 Access
SUPABASE_PROJECT_REF = config('SUPABASE_PROJECT_REF', default='')          # e.g. abcxyzprojectref
SUPABASE_STORAGE_BUCKET = config('SUPABASE_STORAGE_BUCKET', default='')    # bucket name in Supabase Storage
SUPABASE_STORAGE_ACCESS_KEY = config('SUPABASE_STORAGE_ACCESS_KEY', default='')
SUPABASE_STORAGE_SECRET_KEY = config('SUPABASE_STORAGE_SECRET_KEY', default='')
SUPABASE_STORAGE_REGION = config('SUPABASE_STORAGE_REGION', default='ap-southeast-1')

# ── Resolve active storage credentials based on provider ─────────────────────
if STORAGE_PROVIDER == 'supabase' and SUPABASE_PROJECT_REF:
    S3_BUCKET_NAME = SUPABASE_STORAGE_BUCKET
    S3_REGION_NAME = SUPABASE_STORAGE_REGION
    S3_ACCESS_KEY_ID = SUPABASE_STORAGE_ACCESS_KEY
    S3_SECRET_ACCESS_KEY = SUPABASE_STORAGE_SECRET_KEY
    # Supabase Storage S3-compatible endpoint — path-style required
    S3_ENDPOINT_URL = f'https://{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/s3'
    S3_SIGNATURE_VERSION = 's3v4'
    S3_ADDRESSING_STYLE = 'path'   # Supabase requires path-style (not virtual-hosted)
elif STORAGE_PROVIDER == 'aws':
    S3_ENDPOINT_URL = config('S3_ENDPOINT_URL', default='')
    S3_SIGNATURE_VERSION = config('S3_SIGNATURE_VERSION', default='s3v4')
    S3_ADDRESSING_STYLE = config('S3_ADDRESSING_STYLE', default='virtual')
else:
    S3_ENDPOINT_URL = ''
    S3_SIGNATURE_VERSION = 's3v4'
    S3_ADDRESSING_STYLE = 'virtual'

S3_REPORT_PREFIX = config('S3_REPORT_PREFIX', default='reports')
S3_PRESIGNED_URL_EXPIRY_SECONDS = config('S3_PRESIGNED_URL_EXPIRY_SECONDS', default=604800, cast=int)

# ── django-storages settings (activated when storage provider is configured) ──
AWS_ACCESS_KEY_ID = S3_ACCESS_KEY_ID or None
AWS_SECRET_ACCESS_KEY = S3_SECRET_ACCESS_KEY or None
AWS_STORAGE_BUCKET_NAME = S3_BUCKET_NAME or None
AWS_S3_REGION_NAME = S3_REGION_NAME or None
AWS_S3_ENDPOINT_URL = S3_ENDPOINT_URL or None
AWS_S3_SIGNATURE_VERSION = S3_SIGNATURE_VERSION
AWS_S3_ADDRESSING_STYLE = S3_ADDRESSING_STYLE
AWS_QUERYSTRING_EXPIRE = S3_PRESIGNED_URL_EXPIRY_SECONDS
AWS_DEFAULT_ACL = None
AWS_S3_FILE_OVERWRITE = False

if S3_BUCKET_NAME and STORAGE_PROVIDER in ('aws', 'supabase'):
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3.S3Storage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }

# Email Provider Configuration (SES / SendGrid / Resend)
EMAIL_PROVIDER = config('EMAIL_PROVIDER', default='console')
AWS_SES_REGION = config('AWS_SES_REGION', default='')
SENDGRID_API_KEY = _resolve_secret('SENDGRID_API_KEY', default='')
RESEND_API_KEY = _resolve_secret('RESEND_API_KEY', default='')

# Email backend/provider defaults
EMAIL_HOST = config('EMAIL_HOST', default='smtp.sendgrid.net')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='apikey')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default=SENDGRID_API_KEY if SENDGRID_API_KEY else '')
AWS_SES_ACCESS_KEY_ID = _resolve_secret('AWS_SES_ACCESS_KEY_ID', default='')
AWS_SES_SECRET_ACCESS_KEY = _resolve_secret('AWS_SES_SECRET_ACCESS_KEY', default='')

if EMAIL_PROVIDER == 'ses':
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = f'email-smtp.{AWS_SES_REGION}.amazonaws.com' if AWS_SES_REGION else EMAIL_HOST
elif EMAIL_PROVIDER == 'sendgrid':
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Submission rate limits (architecture defaults)
SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR = config('SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR', default=10, cast=int)
SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR = config('SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR', default=100, cast=int)

# LLM Provider Configuration (OpenAI / Gemini)
LLM_PROVIDER = config('LLM_PROVIDER', default='openai')
OPENAI_MODEL = config('OPENAI_MODEL', default='gpt-4-turbo')
GEMINI_API_KEY = _resolve_secret('GEMINI_API_KEY', default='')
GEMINI_MODEL = config('GEMINI_MODEL', default='gemini-1.5-pro')

CELERY_BEAT_SCHEDULE = {
    'clap-dlq-sweeper-every-15-min': {
        'task': 'api.tasks.dlq_sweeper',
        'schedule': 900.0,
    },
}


# ── Startup validation ────────────────────────────────────────────────────────
# Runs at Django process startup.  Raises ValueError for hard misconfigurations
# that would cause silent data loss; logs WARNING for soft misconfigurations.

def _validate_settings():
    import logging as _logging
    _log = _logging.getLogger(__name__)

    # --- Storage provider ---
    _valid_storage = ('aws', 'supabase', '')
    if STORAGE_PROVIDER not in _valid_storage:
        raise ValueError(
            f"STORAGE_PROVIDER='{STORAGE_PROVIDER}' is invalid. "
            f"Must be one of: {_valid_storage}"
        )

    if STORAGE_PROVIDER == 'aws' and not S3_BUCKET_NAME:
        _log.warning(
            'STORAGE_PROVIDER=aws but S3_BUCKET_NAME is not set — '
            'reports and audio will fall back to local disk storage.'
        )

    if STORAGE_PROVIDER == 'supabase' and not SUPABASE_PROJECT_REF:
        _log.warning(
            'STORAGE_PROVIDER=supabase but SUPABASE_PROJECT_REF is not set — '
            'the S3-compatible endpoint URL cannot be built; storage will fail.'
        )

    # --- Email provider ---
    _valid_email = ('ses', 'sendgrid', 'resend', 'console', '')
    if EMAIL_PROVIDER not in _valid_email:
        raise ValueError(
            f"EMAIL_PROVIDER='{EMAIL_PROVIDER}' is invalid. "
            f"Must be one of: {_valid_email}"
        )

    if EMAIL_PROVIDER in ('console', '') and not DEBUG:
        _log.warning(
            "EMAIL_PROVIDER='%s' in a non-DEBUG environment — "
            'emails will NOT be delivered to students. '
            "Set EMAIL_PROVIDER to 'ses', 'sendgrid', or 'resend'.",
            EMAIL_PROVIDER,
        )

    # --- FROM_EMAIL domain sanity ---
    _test_domains = ('clap-test.com', 'example.com', 'test.com', 'localhost')
    _from_domain = (FROM_EMAIL or '').split('@')[-1].lower()
    if _from_domain in _test_domains and not DEBUG:
        _log.warning(
            "FROM_EMAIL='%s' uses a test/placeholder domain in a non-DEBUG environment. "
            'Students will not receive emails. Set FROM_EMAIL to your verified sender address.',
            FROM_EMAIL,
        )

    # --- LLM provider keys ---
    if LLM_PROVIDER == 'openai' and not OPENAI_API_KEY:
        _log.warning(
            'LLM_PROVIDER=openai but OPENAI_API_KEY is not set — '
            'writing and speaking evaluation will fail.'
        )

    if LLM_PROVIDER == 'gemini' and not GEMINI_API_KEY:
        _log.warning(
            'LLM_PROVIDER=gemini but GEMINI_API_KEY is not set — '
            'writing and speaking evaluation will fail.'
        )


_validate_settings()

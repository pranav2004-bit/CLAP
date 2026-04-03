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
SECRET_KEY = config('SECRET_KEY')

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
    # Global DB error handler — converts OperationalError→503, IntegrityError→409,
    # DatabaseError→500 into structured JSON before any other middleware runs.
    # Must sit above CorsMiddleware so CORS headers are still added to error responses.
    'api.middleware.db_error.DatabaseErrorMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    # A5/E1: IP-based rate limiting — placed early to reject abuse before view logic runs
    'api.middleware.rate_limit.ApiRateLimitMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Phase 2.2: sets Cache-Control: no-store on all /api/* responses that have
    # not already set a Cache-Control header in the view.  Positioned last so it
    # runs first on the response path (innermost = processed immediately after view).
    # Views that need a different policy (audio playback) set their own header and
    # this middleware leaves them untouched.
    'api.middleware.cache_headers.CacheControlMiddleware',
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

# Database — AWS PostgreSQL
# Same database as Next.js frontend
DB_APP_USER = config('DB_APP_USER', default=config('DB_USER', default='postgres'))
DB_APP_PASSWORD = config('DB_APP_PASSWORD', default=config('DB_PASSWORD', default=''))

# Database — AWS PostgreSQL
# Same database as Next.js frontend
# Least-privilege note:
# - API deployments should run with DB_APP_USER/DB_APP_PASSWORD (no schema modification privileges).
# - Worker deployments can run with separate credentials via the same settings module by setting
#   DB_APP_USER/DB_APP_PASSWORD differently in worker environment.

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='postgres'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
        'CONN_MAX_AGE': config('DB_CONN_MAX_AGE', default=600, cast=int),
        # B2: validate connection health before reuse (Django 4.1+)
        # Prevents stale-connection errors after DB failover / network blip
        'CONN_HEALTH_CHECKS': True,
        'OPTIONS': {
            'sslmode': config('DB_SSLMODE', default='require'),
            'connect_timeout': config('DB_CONNECT_TIMEOUT', default=10, cast=int),
            # NOTE: statement_timeout, lock_timeout, idle_in_transaction_session_timeout
            # CANNOT be set here via psycopg2 'options' when using PgBouncer in
            # transaction mode. PgBouncer blocks session-level startup parameters
            # and returns: "FATAL: unsupported startup parameter in options".
            #
            # These timeouts are instead enforced at the RDS PostgreSQL role level:
            #   ALTER ROLE postgres SET statement_timeout = '30s';
            #   ALTER ROLE postgres SET lock_timeout = '5s';
            #   ALTER ROLE postgres SET idle_in_transaction_session_timeout = '30s';
            # Run these once via: docker-compose exec django python manage.py dbshell
            # They persist across all connections permanently without any app-level config.
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

# Phase 2.2 — WhiteNoise static-asset caching
# CompressedManifestStaticFilesStorage appends a content hash to every filename
# (e.g. app.abc123.js), making URLs unique per content version — safe to cache
# forever.  WHITENOISE_MAX_AGE sets the max-age in seconds for those hashed files.
# Non-hashed files (if any) are served without a long max-age by WhiteNoise.
WHITENOISE_MAX_AGE = 31_536_000  # 1 year in seconds — CDN + browser cache forever
# Compress static files with Brotli and gzip (reduces transfer size ~70%).
WHITENOISE_USE_FINDERS = False    # Only serve from STATIC_ROOT after collectstatic

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

# ── Submission pipeline rate limits (enterprise: 500 per user/hr, 5000 global/hr) ─
SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR = config('SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR', default=500, cast=int)
SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR = config('SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR', default=5000, cast=int)

# ── Email webhook HMAC secret (set in .env for SendGrid/SES signature verification) ─
EMAIL_WEBHOOK_SECRET = config('EMAIL_WEBHOOK_SECRET', default='')

# ── E2: x-user-id header trust ───────────────────────────────────────────────
# When True (default), the x-user-id request header is trusted as a direct
# user identity shortcut (matches current frontend behaviour).
# WARNING: In production behind a reverse proxy (nginx/ALB), set this to False
# and ensure the proxy STRIPS the x-user-id header from external requests.
# When False, only JWT Bearer tokens are accepted for authentication.
TRUST_X_USER_ID_HEADER = config('TRUST_X_USER_ID_HEADER', default=False, cast=bool)

# JWT settings (architecture target: 15 minute access, 7 day refresh)
JWT_ACCESS_TOKEN_MINUTES = config('JWT_ACCESS_TOKEN_MINUTES', default=480, cast=int)  # 8 hours — admin sessions are long
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

# ── OpenAI Multi-Key Pool (4 primary keys + 1 hot standby) ──────────────────
# Primary key (required)
OPENAI_API_KEY   = _resolve_secret('OPENAI_API_KEY',   default='')
# Additional primary keys — 4 keys × 3 RPM = 12 RPM total effective throughput
OPENAI_API_KEY_2 = _resolve_secret('OPENAI_API_KEY_2', default='')
OPENAI_API_KEY_3 = _resolve_secret('OPENAI_API_KEY_3', default='')
OPENAI_API_KEY_4 = _resolve_secret('OPENAI_API_KEY_4', default='')
OPENAI_API_KEY_5 = _resolve_secret('OPENAI_API_KEY_5', default='')
# Hot standby key — reserved exclusively for when ALL 5 primary keys hit rate limits
OPENAI_STANDBY_KEY = _resolve_secret('OPENAI_STANDBY_KEY', default='')

# Build the pool list consumed by api/utils/openai_client.py._KeyPool
# 5 keys × limits per key (with 90% safety margin):
#   RPM effective : 5 × 2  = 10  req/min
#   RPD effective : 5 × 180 = 900 req/day
#   TPM effective : 5 × 54 000  = 270 000 tokens/min
#   TPD effective : 5 × 180 000 = 900 000 tokens/day
OPENAI_API_KEYS = [
    k for k in [
        OPENAI_API_KEY,
        OPENAI_API_KEY_2,
        OPENAI_API_KEY_3,
        OPENAI_API_KEY_4,
        OPENAI_API_KEY_5,
    ] if k
]

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
# E3: enable HSTS preload when TLS is enforced (eliminates security.W021 warning)
# CAUTION: once submitted to browser preload lists this cannot be undone for ~1 year.
SECURE_HSTS_PRELOAD = config('SECURE_HSTS_PRELOAD', default=ENFORCE_TLS, cast=bool)
SECURE_REFERRER_POLICY = config('SECURE_REFERRER_POLICY', default='strict-origin-when-cross-origin')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
# Deny framing of API responses (pure API — should never be iframed)
X_FRAME_OPTIONS = 'DENY'

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
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True  # Silences CPendingDeprecationWarning in Celery 5.x
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
#   'aws' — Amazon S3 (set S3_BUCKET_NAME + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY)
#   ''    — No cloud storage; files saved locally under MEDIA_ROOT (dev only)
STORAGE_PROVIDER = config('STORAGE_PROVIDER', default='').lower()

# ── AWS S3 credentials (used when STORAGE_PROVIDER=aws) ─────────────────────
S3_BUCKET_NAME = config('S3_BUCKET_NAME', default='')
S3_REGION_NAME = config('S3_REGION_NAME', default='')
S3_ACCESS_KEY_ID = config('S3_ACCESS_KEY_ID', default='')
S3_SECRET_ACCESS_KEY = config('S3_SECRET_ACCESS_KEY', default='')

# ── Resolve active storage credentials ───────────────────────────────────────
if STORAGE_PROVIDER == 'aws':
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
# E3/E4: Enforce private ACL on all S3 objects (defence-in-depth; bucket-level
# public-access-block should ALSO be enabled, but per-object ACL is a second layer).
AWS_DEFAULT_ACL = 'private'
AWS_S3_FILE_OVERWRITE = False

if S3_BUCKET_NAME and STORAGE_PROVIDER == 'aws':
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
    # SES SMTP uses IAM-generated SMTP credentials (different from AWS access keys).
    # Map the SES-specific credentials to the standard Django SMTP settings.
    if AWS_SES_ACCESS_KEY_ID:
        EMAIL_HOST_USER = AWS_SES_ACCESS_KEY_ID
    if AWS_SES_SECRET_ACCESS_KEY:
        EMAIL_HOST_PASSWORD = AWS_SES_SECRET_ACCESS_KEY
elif EMAIL_PROVIDER == 'sendgrid':
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Submission rate limits — enterprise defaults scaled for thousands of concurrent users
SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR = config('SUBMISSION_RATE_LIMIT_PER_USER_PER_HOUR', default=500, cast=int)
SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR = config('SUBMISSION_RATE_LIMIT_GLOBAL_PER_INSTITUTION_PER_HOUR', default=5000, cast=int)

# Email webhook HMAC secret (SendGrid event verification)
EMAIL_WEBHOOK_SECRET = config('EMAIL_WEBHOOK_SECRET', default='')

# ── OpenAI model selection ────────────────────────────────────────────────────
# Production: gpt-4o — best accuracy for rubric-based writing/speaking evaluation.
# Dev/CI fallback: gpt-4o-mini (set OPENAI_MODEL in .env to override).
# Do NOT use gpt-4o-mini in production — student scores depend on evaluation accuracy.
OPENAI_MODEL = config('OPENAI_MODEL', default='gpt-4o')

# ── OpenAI rate limit configuration ──────────────────────────────────────────
# Set these to match your OpenAI account tier exactly.
# With N keys the effective limit scales: N × per-key value.
#
# ┌──────────────┬─────────┬──────────┬───────────┬────────────────┐
# │ Tier         │ RPM     │ RPD      │ TPM       │ TPD            │
# ├──────────────┼─────────┼──────────┼───────────┼────────────────┤
# │ Free         │       3 │      200 │    30 000 │     90 000     │
# │ Tier 1 (≥$5) │     500 │   10 000 │   800 000 │ no hard limit  │
# │ Tier 2       │   5 000 │   10 000 │ 2 000 000 │ no hard limit  │
# │ Tier 3       │   5 000 │   10 000 │ 4 000 000 │ no hard limit  │
# └──────────────┴─────────┴──────────┴───────────┴────────────────┘
#
# Whisper (audio transcription) has SEPARATE rate limits from chat completions:
#   Tier 1 Whisper RPM = 50 per key  (independent of gpt-4o RPM budget)
#   Tier 2+ Whisper RPM = 50 per key (same limit at higher tiers currently)
#
# Default below = Tier 1 (the current account tier).
# Override in .env when you upgrade to a higher tier.
OPENAI_RPM_LIMIT         = config('OPENAI_RPM_LIMIT',         default=500,        cast=int)
OPENAI_RPD_LIMIT         = config('OPENAI_RPD_LIMIT',         default=10_000,     cast=int)
OPENAI_TPM_LIMIT         = config('OPENAI_TPM_LIMIT',         default=800_000,    cast=int)
OPENAI_TPD_LIMIT         = config('OPENAI_TPD_LIMIT',         default=10_000_000, cast=int)  # no hard limit on Tier 1 — set high
OPENAI_WHISPER_RPM_LIMIT = config('OPENAI_WHISPER_RPM_LIMIT', default=50,         cast=int)

# Safety margin: only use this fraction of stated limits (prevents riding the edge).
# 0.90 = use max 90 % of each limit, keeping a 10 % buffer.
# Lower to 0.80 if you observe sporadic 429s despite headroom.
OPENAI_QUOTA_SAFETY_MARGIN = config('OPENAI_QUOTA_SAFETY_MARGIN', default=0.90, cast=float)

CELERY_BEAT_SCHEDULE = {
    # DLQ sweeper: retries failed tasks every 15 minutes
    'clap-dlq-sweeper-every-15-min': {
        'task': 'api.tasks.dlq_sweeper',
        'schedule': 900.0,
    },
    # Quota status reporter: logs per-key quota usage every 5 minutes.
    # Zero-cost task — just reads Redis counters and emits structured log lines.
    # Lets operators spot quota exhaustion before students are impacted.
    'clap-quota-status-every-5-min': {
        'task': 'api.tasks.log_quota_status',
        'schedule': 300.0,
    },
    # Server-side auto-submit safety net: every 60 seconds.
    # Finalises assignments whose global_deadline expired > 2 minutes ago.
    # 2-min grace window gives the client priority (client has more partial data).
    # Beat task handles crashes, network loss, and dead browsers as the backstop.
    'clap-auto-submit-expired-every-60s': {
        'task': 'api.tasks.auto_submit_expired_assignments',
        'schedule': 60.0,
    },
}

# ── Application version ────────────────────────────────────────────────────────
# Exposed by /api/health/ and included in Sentry release tag.
APP_VERSION = config('APP_VERSION', default='')

# ── CDN delivery (Phase 2.1 / 2.3) ────────────────────────────────────────────
# CDN_ENABLED=False → all storage URLs returned unchanged (safe default).
# Set CDN_ENABLED=True and CDN_BASE_URL once a CDN distribution is configured.
CDN_ENABLED = config('CDN_ENABLED', default=False, cast=bool)
CDN_BASE_URL = config('CDN_BASE_URL', default='').rstrip('/')

# CDN_PROVIDER drives both URL rewriting (Phase 2.1) and signed URL generation
# (Phase 2.3).  Supported values:
#   'cloudfront' — AWS CloudFront signed URLs (RSA-SHA1 via botocore.signers)
#   'generic'    — plain S3 presigned GET URL (no CDN layer signing)
#   'cloudflare' — stub (not yet implemented; use 'generic' as fallback)
#   'fastly'     — stub (not yet implemented; use 'generic' as fallback)
CDN_PROVIDER = config('CDN_PROVIDER', default='generic')

# Phase 2.3: when True, resolve_delivery_url() generates a cryptographically
# signed URL instead of plain URL rewriting. Requires CDN_SIGNING_KEY_ID and
# CDN_SIGNING_PRIVATE_KEY to be set for CDN_PROVIDER=cloudfront.
CDN_SIGNED_URLS_ENABLED = config('CDN_SIGNED_URLS_ENABLED', default=False, cast=bool)

# Phase 2.3 — CloudFront signing credentials
# CDN_SIGNING_KEY_ID:      CloudFront Key Pair ID (from AWS Console →
#                           CloudFront → Public keys → Key pairs)
# CDN_SIGNING_PRIVATE_KEY: RSA-2048 private key, PEM format, base64-encoded.
#                           Encode:  base64 -w0 private_key.pem
#                           Decode:  base64 -d > private_key.pem
CDN_SIGNING_KEY_ID = config('CDN_SIGNING_KEY_ID', default='')
CDN_SIGNING_PRIVATE_KEY = _resolve_secret('CDN_SIGNING_PRIVATE_KEY', default='')

# ── Sentry / Error tracking (D4) ──────────────────────────────────────────────
# Set SENTRY_DSN in .env to activate. Safe no-op when DSN is absent.
# sentry-sdk captures Django exceptions AND Celery task failures automatically.
SENTRY_DSN = _resolve_secret('SENTRY_DSN', default='')


# ── Startup validation ────────────────────────────────────────────────────────
# Runs at Django process startup.  Raises ValueError for hard misconfigurations
# that would cause silent data loss; logs WARNING for soft misconfigurations.

def _validate_settings():
    import logging as _logging
    _log = _logging.getLogger(__name__)

    # --- Storage provider ---
    _valid_storage = ('aws', '')
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
    if not OPENAI_API_KEYS:
        _log.warning(
            'OPENAI_API_KEY is not set — '
            'writing and speaking evaluation will fail.'
        )
    else:
        _log.info(
            'openai_key_pool configured: primary_keys=%d has_standby=%s — '
            'add OPENAI_API_KEY_2…_5 and OPENAI_STANDBY_KEY for higher throughput.',
            len(OPENAI_API_KEYS), bool(OPENAI_STANDBY_KEY),
        )


_validate_settings()

# ── Sentry SDK initialisation (D4/E5) ─────────────────────────────────────────
# Initialised here (after settings are complete) so the DSN and release tag are
# available.  Gunicorn loads this module once before fork — all workers inherit
# the Sentry client.  Celery workers run their own Django setup and also reach
# this block, so task-level errors are captured automatically.
if SENTRY_DSN:
    import sentry_sdk  # noqa: E402 — imported here to keep it optional
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    import logging as _log_sentry

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            DjangoIntegration(
                transaction_style='url',    # group by URL pattern, not specific URLs
                middleware_spans=True,
                signals_spans=False,        # suppress low-value signal noise
                cache_spans=False,
            ),
            CeleryIntegration(
                monitor_beat_tasks=True,    # heartbeat for celery-beat via Crons
                propagate_traces=True,      # link Celery task errors to parent trace
            ),
            LoggingIntegration(
                level=_log_sentry.WARNING,        # WARNING+ captured as breadcrumbs
                event_level=_log_sentry.ERROR,    # ERROR+ sent as Sentry events
            ),
        ],
        release=APP_VERSION or None,
        environment='production' if not DEBUG else 'development',
        # Performance monitoring: 5 % sample rate — increase gradually in prod.
        traces_sample_rate=config('SENTRY_TRACES_SAMPLE_RATE', default=0.05, cast=float),
        # Never include request body or user PII in Sentry events.
        send_default_pii=False,
        attach_stacktrace=True,
    )

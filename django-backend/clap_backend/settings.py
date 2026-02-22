"""
Django settings for CLAP backend project.
Maintains behavioral parity with Next.js backend.
"""

import os
from pathlib import Path
from decouple import config

# Build paths inside the project
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-this-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=True, cast=bool)

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
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='postgres'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST'),
        'PORT': config('DB_PORT', default='5432'),
        'OPTIONS': {
            'sslmode': 'require',
        },
    }
}

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
}

# OpenAI Configuration
OPENAI_API_KEY = config('OPENAI_API_KEY', default='')

# Email Configuration (Resend)
RESEND_API_KEY = config('RESEND_API_KEY', default='')
FROM_EMAIL = config('FROM_EMAIL', default='noreply@clap-test.com')

# Logging Configuration - Match Next.js console logging behavior
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
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
        'api': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },
}

# CSRF Settings - Disable for API (using header-based auth like Next.js)
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG

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

# S3 Configuration (used for speaking uploads and generated reports)
S3_BUCKET_NAME = config('S3_BUCKET_NAME', default='')
S3_REGION_NAME = config('S3_REGION_NAME', default='')
S3_ENDPOINT_URL = config('S3_ENDPOINT_URL', default='')
S3_REPORT_PREFIX = config('S3_REPORT_PREFIX', default='reports')
S3_PRESIGNED_URL_EXPIRY_SECONDS = config('S3_PRESIGNED_URL_EXPIRY_SECONDS', default=604800, cast=int)

# Email Provider Configuration (SES/SendGrid)
EMAIL_PROVIDER = config('EMAIL_PROVIDER', default='ses')
AWS_SES_REGION = config('AWS_SES_REGION', default='')
SENDGRID_API_KEY = config('SENDGRID_API_KEY', default='')

S3_ACCESS_KEY_ID = config('S3_ACCESS_KEY_ID', default='')
S3_SECRET_ACCESS_KEY = config('S3_SECRET_ACCESS_KEY', default='')
S3_SIGNATURE_VERSION = config('S3_SIGNATURE_VERSION', default='s3v4')
S3_ADDRESSING_STYLE = config('S3_ADDRESSING_STYLE', default='virtual')

# django-storages settings (activated when S3 bucket is configured)
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

if S3_BUCKET_NAME:
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3.S3Storage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }

# Email backend/provider defaults
EMAIL_HOST = config('EMAIL_HOST', default='smtp.sendgrid.net')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='apikey')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default=SENDGRID_API_KEY)
AWS_SES_ACCESS_KEY_ID = config('AWS_SES_ACCESS_KEY_ID', default='')
AWS_SES_SECRET_ACCESS_KEY = config('AWS_SES_SECRET_ACCESS_KEY', default='')

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

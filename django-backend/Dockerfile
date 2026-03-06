# ================================================================
# CLAP Django Backend — Production Dockerfile (Multi-Stage)
# ================================================================
# Stages:
#   builder  — installs Python packages, compiles C extensions
#   runtime  — minimal production image (~200 MB)
#
# Build:
#   docker build -t clap-backend ./django-backend
#   docker build -t clap-backend:$(git rev-parse --short HEAD) ./django-backend
#
# Run (standalone):
#   docker run --env-file django-backend/.env -p 8000:8000 clap-backend
#
# Run (full stack):
#   docker compose up
# ================================================================


# ── Stage 1: builder ─────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build-time system dependencies
# gcc        — needed for bcrypt / psycopg2 C extensions
# libpq-dev  — PostgreSQL client headers for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages into an isolated prefix so we can copy them cleanly
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime ─────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Runtime-only system dependencies (no build tools = smaller attack surface)
# libpq5  — PostgreSQL client shared library needed by psycopg2 at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled packages from builder stage
COPY --from=builder /install /usr/local

# Create a non-root service user (principle of least privilege)
RUN useradd --no-create-home --no-log-init --shell /bin/false clap && \
    mkdir -p /app/media /app/static && \
    chown -R clap:clap /app

# Copy application code (owned by service user)
COPY --chown=clap:clap . .

USER clap

# ── Environment defaults ──────────────────────────────────────────
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=clap_backend.settings \
    PORT=8000

EXPOSE 8000

# ── Startup ───────────────────────────────────────────────────────
# collectstatic is run here so WhiteNoise can serve compressed assets.
# migrate applies any pending migrations (safe: Django migrations are idempotent).
# gunicorn reads config from gunicorn.conf.py (workers, threads, timeouts).
CMD ["sh", "-c", \
     "python manage.py collectstatic --noinput && \
      python manage.py migrate --noinput && \
      gunicorn clap_backend.wsgi:application --config gunicorn.conf.py"]

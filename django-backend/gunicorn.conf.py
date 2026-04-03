"""
gunicorn.conf.py — Production Gunicorn configuration for CLAP backend.

Tuning rationale:
  - worker_class='gthread': threaded workers are non-blocking and handle
    Django's synchronous views efficiently without gevent/eventlet overhead.
  - workers=(2×CPU)+1: standard formula for CPU-bound + moderate I/O mix.
  - threads=4: allows up to 4 concurrent requests per worker process.
  - max_requests+jitter: prevents memory accumulation from Django ORM/Redis
    connection churn; jitter avoids thundering herd on simultaneous restarts.
  - preload_app=True: imports Django once then forks workers — saves ~50 MB
    RAM per worker on copy-on-write kernels.
  - graceful_timeout: gives in-flight Celery task dispatches time to complete
    before worker is killed during rolling restarts.

At 6,000 users (typical concurrent sessions ~200–400):
  With 2 pods × 3 workers × 4 threads = 24 concurrent requests per pod pair.
  Scale pods horizontally for more capacity.

Usage:
  gunicorn clap_backend.wsgi:application --config gunicorn.conf.py
"""

import multiprocessing
import os


def _env_int(name, default):
    """Read integer env var with a safe default and clear error on bad input."""
    raw = os.environ.get(name)
    if raw is None or raw == '':
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f'{name} must be an integer, got: {raw!r}') from exc

# ── Binding ───────────────────────────────────────────────────────
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# ── Workers ───────────────────────────────────────────────────────
# Use gthread (sync + threading) — not gevent, as Django ORM is not async-safe
worker_class = 'gthread'

# (2 × CPU cores) + 1 is the recommended formula for mixed I/O + CPU workloads
_default_workers = (2 * multiprocessing.cpu_count()) + 1
workers = _env_int('GUNICORN_WORKERS', _default_workers)

# Threads per worker.
# 16 threads × 5 workers = 80 concurrent request slots — handles 10 000+ users.
# gthread is safe with 16 threads because Django views are I/O-bound (DB, S3, SES);
# threads mostly wait (~10-50ms) rather than burn CPU. Each 5-worker node handles
# ~800 req/s sustained; scale horizontally (add EC2 nodes) for more.
threads = _env_int('GUNICORN_THREADS', 16)

# Max simultaneous keep-alive connections per worker
worker_connections = 1000

# ── Reverse proxy trust ───────────────────────────────────────────
# Trust X-Forwarded-For from ALL upstream addresses (nginx container on same
# Docker network). Without this, REMOTE_ADDR is nginx's container IP for every
# request — Django's rate-limit middleware and security logs see every student as
# the same "client", breaking per-IP rate limiting and audit trails.
# Safe because nginx already strips X-Forwarded-For from external clients
# (proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for).
forwarded_allow_ips = '*'

# ── Timeouts ─────────────────────────────────────────────────────
# Kill worker if it doesn't respond within 120s (protects against hung DB queries)
timeout = _env_int('GUNICORN_TIMEOUT', 120)

# Give in-flight requests up to 30s to complete during graceful reload/restart
graceful_timeout = _env_int('GUNICORN_GRACEFUL_TIMEOUT', 30)

# HTTP keep-alive timeout — 5s balances connection reuse vs idle resource cost
keepalive = _env_int('GUNICORN_KEEPALIVE', 5)

# ── Memory leak prevention ────────────────────────────────────────
# Restart workers after 2000 requests to flush ORM connection or memory drift.
# Higher than the old 1000 default — at 80 concurrent threads processing 800 req/s,
# a 1000-request limit would recycle workers every ~6 seconds (too aggressive).
# 2000 requests ≈ every ~2.5 seconds at full load — balanced recycle cadence.
max_requests = _env_int('GUNICORN_MAX_REQUESTS', 2000)

# Randomise restart point ±200 to prevent all workers restarting simultaneously
# (thundering herd). With ±200 spread across 5 workers, no two recycle at once.
max_requests_jitter = _env_int('GUNICORN_MAX_REQUESTS_JITTER', 200)

# ── Performance ───────────────────────────────────────────────────
# Load app before forking — workers share read-only pages (copy-on-write)
# Note: with preload_app, database connections opened in __init__ are shared.
# Django's CONN_MAX_AGE is per-thread, so this is safe.
preload_app = True

# ── Logging ───────────────────────────────────────────────────────
# Log to stdout/stderr so container log drivers (CloudWatch, Datadog, etc.) capture them
errorlog  = '-'
accesslog = '-'
loglevel  = os.environ.get('GUNICORN_LOG_LEVEL', 'info')

# Extended access log: includes response time in microseconds (%D)
access_log_format = (
    '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sus'
)

# ── Process naming ────────────────────────────────────────────────
# Shows meaningful names in `ps` output for ops troubleshooting
proc_name = 'clap-backend'

"""
Central Redis connection factory — production-grade singleton per process.

Why a shared factory instead of ad-hoc redis.Redis.from_url() calls
──────────────────────────────────────────────────────────────────────
Each call to redis.Redis.from_url() creates a NEW ConnectionPool. With
9 Gunicorn workers × (rate_limit + auth + submissions + tasks + monitor)
= potentially 45 independent pools per host, each holding idle sockets.
This wastes file descriptors, Redis server slots, and TCP state.

A module-level singleton ensures ONE pool per process. redis-py's pool
is thread-safe: all 16 gthread threads in a Gunicorn worker share the
same pool and borrow/return connections atomically.

Production settings applied to every client
────────────────────────────────────────────
• socket_timeout=5s        — max time for a Redis command to complete.
                             Without this, a stalled Redis blocks a Django
                             request thread indefinitely, exhausting the
                             Gunicorn thread pool and causing a site outage.
• socket_connect_timeout=3s — max time to establish a new TCP connection.
                             Limits damage from a Redis restart or network
                             partition to 3 s per affected thread.
• socket_keepalive         — OS-level TCP keepalive probes detect silently
                             dropped connections (container restart, network
                             blip) within minutes, not hours.
• retry on ConnectionError / TimeoutError / BusyLoadingError
  with exponential backoff (64 ms → 128 ms → 256 ms → 512 ms cap):
                             Transient errors (Redis AOF rewrite, momentary
                             overload) self-heal without surfacing a 500.
• health_check_interval=30s — redis-py sends a PING on a pooled connection
                             before reusing it if it has been idle ≥ 30 s.
                             Catches stale sockets that appear healthy but
                             are actually closed at the OS level.
• max_connections=20       — caps the pool at 20 sockets per process.
                             9 Django workers × 20 = 180 max connections
                             from the web tier. Redis default maxclients is
                             10 000 — well within budget.

Fail-open behaviour
───────────────────
If Redis is unreachable at startup, get_redis_client() returns None.
All callers already guard: `if client is None: ...`.  Rate limiting,
auth lockouts, and idempotency checks degrade gracefully; the core exam
flow (DB-backed answer saving) continues unaffected.

Thread-safety
─────────────
A threading.Lock guards the lazy initialisation. Gunicorn prefork: the
module is imported AFTER fork (lazy, not at import time), so the parent
process never holds a socket that would be duplicated across workers.
"""

import logging
import socket
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# ── Module-level singleton ────────────────────────────────────────────────────
# One instance per OS process (Gunicorn worker / Celery worker).
# Thread-safe: the Lock protects the race between the first N concurrent
# threads that all find _client=None simultaneously (double-checked locking).
_lock: threading.Lock = threading.Lock()
_client: Optional["redis.Redis"] = None  # type: ignore[name-defined]


def get_redis_client() -> Optional["redis.Redis"]:  # type: ignore[name-defined]
    """
    Return the process-level Redis singleton, initialising it on first call.

    Returns None if:
      - the redis package is not installed
      - REDIS_URL is not configured
      - Redis is unreachable (connection refused, timeout, auth failure)

    Callers must handle None gracefully (fail-open).
    """
    global _client

    # Fast path — already initialised (99.99 % of calls after warm-up).
    if _client is not None:
        return _client

    with _lock:
        # Double-checked: another thread may have initialised while we waited.
        if _client is not None:
            return _client

        _client = _try_connect()
        return _client


def _try_connect() -> Optional["redis.Redis"]:  # type: ignore[name-defined]
    """Internal: create and verify a new Redis client. Returns None on any failure."""
    try:
        import redis as _redis_lib
        from redis.backoff import ExponentialBackoff
        from redis.exceptions import (
            BusyLoadingError,
            ConnectionError as RedisConnectionError,
            TimeoutError as RedisTimeoutError,
        )
        from redis.retry import Retry
    except ImportError:
        logger.warning("redis_client: redis-py not installed — Redis unavailable")
        return None

    from django.conf import settings

    redis_url: str = getattr(settings, "REDIS_URL", "") or ""
    if not redis_url:
        logger.warning("redis_client: REDIS_URL not configured — Redis unavailable")
        return None

    # TCP keepalive options (Linux-only; silently ignored on macOS/Windows).
    keepalive_options: dict = {}
    for attr, value in (
        ("TCP_KEEPIDLE", 60),    # first probe after 60 s idle
        ("TCP_KEEPINTVL", 10),   # subsequent probes every 10 s
        ("TCP_KEEPCNT", 5),      # declare dead after 5 consecutive failures
    ):
        if hasattr(socket, attr):
            keepalive_options[getattr(socket, attr)] = value

    # Exponential backoff: 64 ms → 128 ms → 256 ms → cap 512 ms.
    # Jitter is NOT added here; callers add their own jitter where relevant.
    retry = Retry(
        ExponentialBackoff(cap=0.512, base=0.064),
        retries=3,
    )

    try:
        client = _redis_lib.Redis.from_url(
            redis_url,
            decode_responses=True,
            # ── Timeouts ──────────────────────────────────────────────
            socket_timeout=5,              # command must complete in 5 s
            socket_connect_timeout=3,      # TCP connect must succeed in 3 s
            # ── Keepalive ─────────────────────────────────────────────
            socket_keepalive=True,
            socket_keepalive_options=keepalive_options,
            # ── Retry ─────────────────────────────────────────────────
            retry=retry,
            retry_on_error=[
                RedisConnectionError,
                RedisTimeoutError,
                BusyLoadingError,
            ],
            retry_on_timeout=True,
            # ── Pool health ───────────────────────────────────────────
            health_check_interval=30,      # PING idle connections before reuse
            # ── Pool cap ──────────────────────────────────────────────
            max_connections=20,            # per-process hard cap
        )
        # Verify connectivity before returning — fail fast at startup rather
        # than returning a broken client that fails on the first real command.
        client.ping()
        logger.info("redis_client: connected to %s", _redact_url(redis_url))
        return client

    except Exception as exc:
        logger.warning(
            "redis_client: connection failed (%s) — operating without Redis", exc
        )
        return None


def reset_client() -> None:
    """
    Force the singleton to be re-initialised on the next call.

    Call this in Gunicorn's post_fork hook (if preload_app=True) and in
    test teardown, so each process/test gets a fresh connection pool.

        # gunicorn.conf.py
        def post_fork(server, worker):
            from api.utils.redis_client import reset_client
            reset_client()
    """
    global _client
    with _lock:
        if _client is not None:
            try:
                _client.close()
            except Exception:
                pass
        _client = None


def _redact_url(url: str) -> str:
    """Replace password in redis://:password@host/db with ***."""
    import re
    return re.sub(r"(:)[^:@]+(@)", r"\1***\2", url)

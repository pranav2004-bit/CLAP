#!/usr/bin/env python3
"""
CLAP — Production Pipeline Health Checker
==========================================
Enterprise-grade real-time diagnostics for the CLAP assessment platform.

Usage:
  python test-pipeline-status.py            # Human-readable output
  python test-pipeline-status.py --json     # JSON output for monitoring tools / CI pipelines

Exit codes:
  0  — All services healthy
  1  — One or more services are DEGRADED or DOWN
  2  — Script itself failed to run checks (Docker not reachable, etc.)

This tool bypasses ALL caches (browser, Next.js, CDN) and queries the
actual running Docker containers directly. It is the single source of truth.
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional


TIMEOUT_SECONDS = 8   # Hard fail-fast limit per check


# ── Data Model ──────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    name: str
    status: str          # "healthy" | "degraded" | "down" | "unknown"
    message: str
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


# ── Core Utilities ──────────────────────────────────────────────────────────

def _run(cmd: list[str], timeout: int = TIMEOUT_SECONDS) -> tuple[bool, str, float]:
    """Run a command. Returns (success, stdout, elapsed_ms). Hard timeout enforced."""
    start = time.monotonic()
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
            timeout=timeout,
        )
        elapsed = (time.monotonic() - start) * 1000
        return True, result.stdout.strip(), elapsed
    except subprocess.TimeoutExpired:
        elapsed = (time.monotonic() - start) * 1000
        return False, f"TIMEOUT after {timeout}s — worker may be overloaded", elapsed
    except subprocess.CalledProcessError as e:
        elapsed = (time.monotonic() - start) * 1000
        return False, (e.stderr or e.stdout or "command failed").strip(), elapsed
    except FileNotFoundError:
        return False, "Docker not found — is Docker Desktop running?", 0.0


# ── Individual Checks ───────────────────────────────────────────────────────

def check_redis() -> CheckResult:
    """Ping Redis directly inside its container. Expects PONG."""
    ok, output, ms = _run(
        ["docker", "compose", "exec", "redis", "redis-cli", "ping"]
    )
    if ok and output == "PONG":
        return CheckResult("Redis Broker", "healthy", "PING → PONG", latency_ms=round(ms, 1))
    return CheckResult("Redis Broker", "down", "No PONG response", detail=output)


def check_celery_workers() -> CheckResult:
    """
    Run `celery inspect ping` — actively contacts every live Celery worker
    over the broker. Parses real output: each responding node prints 'pong'.
    NOTE: celery --timeout 5 means Celery waits 5s for workers internally,
    plus docker exec overhead. Subprocess timeout must be 20s minimum.
    """
    ok, output, ms = _run([
        "docker", "compose", "exec", "celery-llm",
        "celery", "-A", "clap_backend", "inspect", "ping",
        "--timeout", "5",
    ], timeout=20)
    if ok and output:
        # Real output: 'pong' appears once per responding worker node
        # e.g. -> llm@b189fb2079d0: OK \n        pong
        pong_count = output.lower().count("pong")
        if pong_count > 0:
            return CheckResult(
                "Celery Workers", "healthy",
                f"{pong_count} worker node(s) responded to inspect ping",
                latency_ms=round(ms, 1)
            )
    return CheckResult(
        "Celery Workers", "down",
        "No workers responded to inspect ping",
        detail=output or "empty response"
    )


def check_django_http() -> CheckResult:
    """
    Hit the actual Django HTTP health endpoint on port 8000.
    This confirms gunicorn is accepting connections, auth middleware is loaded,
    and the Django app initialized without crash. NOT a shell — a real HTTP call.
    """
    url = "http://localhost:8000/api/health/"
    start = time.monotonic()
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:
            elapsed = (time.monotonic() - start) * 1000
            body = response.read().decode()
            if response.status == 200:
                return CheckResult(
                    "Django HTTP API", "healthy",
                    f"HTTP 200 OK from /api/health/",
                    latency_ms=round(elapsed, 1),
                    detail=body[:120]
                )
            return CheckResult(
                "Django HTTP API", "degraded",
                f"HTTP {response.status} — unexpected status code",
                latency_ms=round(elapsed, 1)
            )
    except urllib.error.URLError as e:
        elapsed = (time.monotonic() - start) * 1000
        return CheckResult(
            "Django HTTP API", "down",
            "Connection refused — gunicorn is not accepting requests on :8000",
            latency_ms=round(elapsed, 1),
            detail=str(e)
        )
    except Exception as e:
        return CheckResult("Django HTTP API", "unknown", "Unexpected error", detail=str(e))


def check_database() -> CheckResult:
    """
    Execute a trivial SQL query through Django's ORM to confirm the live
    Supabase PostgreSQL connection is open. If Django is up but DB is down,
    this will fail while all other checks pass — which is exactly the scenario
    we must catch.
    """
    ok, output, ms = _run([
        "docker", "compose", "exec", "django",
        "python", "-c",
        (
            "from django.db import connection; "
            "connection.ensure_connection(); "
            "cursor = connection.cursor(); "
            "cursor.execute('SELECT 1'); "
            "result = cursor.fetchone(); "
            "print('OK' if result[0] == 1 else 'FAIL')"
        )
    ])
    if ok and "OK" in output:
        return CheckResult(
            "Database (Supabase)", "healthy",
            "Live SQL query SELECT 1 → returned 1",
            latency_ms=round(ms, 1)
        )
    return CheckResult(
        "Database (Supabase)", "down",
        "Database query failed — Supabase connection may be broken",
        detail=output
    )


def check_celery_beat() -> CheckResult:
    """Verify the celery-beat scheduler container is up via docker compose ps."""
    ok, output, ms = _run([
        "docker", "compose", "ps", "celery-beat"
    ])
    # docker compose ps output: STATUS column contains 'Up' when running
    if ok and "Up" in output:
        return CheckResult("Celery Beat", "healthy", "Scheduler container is Up", latency_ms=round(ms, 1))
    return CheckResult(
        "Celery Beat", "down",
        "Scheduler container is NOT running — periodic DLQ sweep will not fire",
        detail=output
    )


# ── Output Formatters ───────────────────────────────────────────────────────

STATUS_ICONS = {
    "healthy":  "\033[92m● HEALTHY   \033[0m",
    "degraded": "\033[93m● DEGRADED  \033[0m",
    "down":     "\033[91m● DOWN      \033[0m",
    "unknown":  "\033[90m● UNKNOWN   \033[0m",
}

def _print_human(results: list[CheckResult], all_healthy: bool, elapsed_total: float):
    print("\n╔══════════════════════════════════════════════════════╗")
    print("║       CLAP — Production Pipeline Health Report       ║")
    print(f"║  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC').ljust(52)}║")
    print("╚══════════════════════════════════════════════════════╝\n")

    for r in results:
        icon = STATUS_ICONS.get(r.status, STATUS_ICONS["unknown"])
        latency = f"  ({r.latency_ms:.0f}ms)" if r.latency_ms is not None else ""
        print(f"  {icon}  {r.name.ljust(22)} {r.message}{latency}")
        if r.detail and r.status != "healthy":
            print(f"  {''.ljust(16)}  \033[90m↳ {r.detail[:90]}\033[0m")

    print(f"\n  Scanned in {elapsed_total:.1f}s")

    if all_healthy:
        print("\n  \033[92m✔ ALL SYSTEMS OPERATIONAL — Ready for student assessments.\033[0m\n")
    else:
        down = [r.name for r in results if r.status in ("down", "degraded", "unknown")]
        print(f"\n  \033[91m✘ DEGRADED STATE — {len(down)} service(s) require attention: {', '.join(down)}\033[0m\n")


def _print_json(results: list[CheckResult], all_healthy: bool, elapsed_total: float):
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "overall_status": "healthy" if all_healthy else "degraded",
        "elapsed_seconds": round(elapsed_total, 2),
        "checks": [asdict(r) for r in results],
    }
    print(json.dumps(payload, indent=2))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="CLAP Production Pipeline Health Checker"
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Output results as machine-readable JSON (for CI/CD and monitoring integrations)"
    )
    args = parser.parse_args()

    start_total = time.monotonic()

    checks = [
        check_redis,
        check_django_http,
        check_database,
        check_celery_workers,
        check_celery_beat,
    ]

    results: list[CheckResult] = []
    for check_fn in checks:
        results.append(check_fn())

    elapsed_total = time.monotonic() - start_total
    all_healthy = all(r.status == "healthy" for r in results)

    if args.json:
        _print_json(results, all_healthy, elapsed_total)
    else:
        _print_human(results, all_healthy, elapsed_total)

    # Exit code contract: 0=all healthy, 1=any failure
    sys.exit(0 if all_healthy else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[Cancelled by user]")
        sys.exit(2)
    except Exception as e:
        print(f"\n[FATAL] Script crashed: {e}", file=sys.stderr)
        sys.exit(2)

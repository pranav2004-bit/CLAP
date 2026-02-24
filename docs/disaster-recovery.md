# CLAP Disaster Recovery Runbook

> **Audience:** Engineering on-call, DevOps
> **Last reviewed:** 2026-02-24
> **RTO target:** 30 minutes (G3)
> **RPO target:** 1 hour (Supabase PITR interval) (G3)

---

## 1. Recovery Time & Point Objectives (G3)

| Metric | Target | How it is achieved |
|---|---|---|
| **RTO** (Recovery Time Objective) | **30 minutes** | Pre-built Docker images tagged by git SHA; rolling ECS/K8s update; Gunicorn graceful reload drains in-flight requests. |
| **RPO** (Recovery Point Objective) | **1 hour** | Supabase Pro PITR takes incremental WAL snapshots every 60 minutes. Free tier: daily snapshots only (24 h RPO — upgrade to Pro for production). |

---

## 2. Backup Strategy (G2)

### 2.1 PostgreSQL (Supabase)

| Tier | Backup type | Frequency | Retention | PITR? |
|---|---|---|---|---|
| Supabase Free | Full snapshot | Daily | 7 days | No |
| Supabase Pro | Full + WAL stream | Continuous | 7–30 days | Yes (1-hour granularity) |
| Supabase Team / Enterprise | Full + WAL | Continuous | 30–90 days | Yes (1-min granularity) |

**Required for 6,000-user production:** Supabase Pro or higher to meet the 1-hour RPO target.

#### Validate backups quarterly:
```bash
# 1. Go to Supabase Dashboard → Settings → Backups
# 2. Click "Restore" → choose a staging project → confirm restore
# 3. Run django-backend/scripts/validate_restored_db.py against the staging DB
# 4. Verify unmanaged table row counts match production snapshot
# 5. Document restore time in this file (see § 6)
```

### 2.2 S3 / Supabase Storage (audio + reports)

| Object type | Retention policy | See |
|---|---|---|
| `audio/*` | STANDARD → IA (90d) → Glacier (180d) → expire (365d) | `docs/s3-lifecycle.json` |
| `reports/*` | STANDARD → IA (1y) → Glacier (2y) → expire (3y) | `docs/s3-lifecycle.json` |

**S3 versioning:** Enable S3 versioning on the CLAP bucket so accidental deletions are recoverable within the retention window.

```bash
aws s3api put-bucket-versioning \
  --bucket YOUR_BUCKET_NAME \
  --versioning-configuration Status=Enabled
```

**Supabase Storage:** Does not support versioning. Maintain a secondary scheduled export to AWS S3 (once monthly) for critical report data.

### 2.3 Redis

Redis is **ephemeral** — it holds Celery task queue state and rate-limit counters only. No recovery needed; tasks will be re-queued by the DLQ sweeper (`api.tasks.dlq_sweeper`) which runs every 15 minutes via Celery Beat.

---

## 3. Service Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (browser / app)                                         │
│         │                                                       │
│         ▼                                                       │
│  Load Balancer (ALB / Cloudflare)                               │
│         │                                                       │
│         ▼                                                       │
│  Django API  ──── Celery workers (llm, reports, scoring, beat)  │
│         │                │                                      │
│         ▼                ▼                                      │
│  Supabase PostgreSQL    Redis (ElastiCache / Upstash)           │
│                                                                 │
│  (all workers share)    S3 / Supabase Storage                   │
└─────────────────────────────────────────────────────────────────┘
```

| Service | Failure impact | Recovery |
|---|---|---|
| Supabase PostgreSQL | Complete outage — all API calls fail | PITR restore (§ 4.1) |
| Redis | Celery task queue paused; rate limiting disabled (fails open) | Restart Redis container; DLQ sweeper re-queues orphaned tasks |
| S3 / Supabase Storage | Audio upload/playback fails; report delivery fails; scoring still works | Restore from S3 versioning or Supabase Storage backup |
| Django pods | Serving requests stops | Auto-restart via ECS health check or K8s liveness probe |
| Celery workers | Task processing pauses; tasks queue in Redis | Auto-restart; DLQ sweeper catches any task that timed out |
| OpenAI API | LLM evaluation fails; tasks go to DLQ | DLQ sweeper retries after OpenAI recovers |

---

## 4. Recovery Procedures

### 4.1 Database restore (Supabase PITR)

```bash
# Step 1: Identify the target recovery point
# → Supabase Dashboard → Settings → Backups → Point-in-time Recovery

# Step 2: Restore to a new project (do NOT overwrite production)
# → Click "Create recovery branch" / choose time → confirm

# Step 3: Update DB_HOST in .env to point to restored project
# → Or toggle ALB target group to restored Django cluster

# Step 4: Run validate_schema to confirm schema integrity
docker compose exec django python manage.py validate_schema --exit-code

# Step 5: Smoke-test critical endpoints
curl -s https://your-domain.com/api/health/
# → Expected: {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}

# Step 6: Switch production traffic to restored DB
# Step 7: Update DNS / ALB if using separate restored instance
# Step 8: Monitor error rate in Sentry for 30 minutes before closing incident
```

### 4.2 Full pod restart (Django + Celery)

```bash
# Docker Compose (single server):
docker compose down && docker compose up -d

# ECS rolling update:
aws ecs update-service \
  --cluster clap-prod \
  --service clap-django \
  --force-new-deployment

# Kubernetes rolling restart:
kubectl rollout restart deployment/clap-django -n clap
kubectl rollout restart deployment/clap-celery-llm -n clap

# Verify health after restart (wait for start_period=20s):
curl https://your-domain.com/api/health/
```

### 4.3 Rollback to previous Docker image (F3)

All images are tagged with the git SHA during CI (`clap-backend:$GIT_SHA`). Keep the previous 3 tags in your registry.

```bash
# Find previous SHA from git log:
git log --oneline -5

# Redeploy previous image (ECS):
aws ecs update-service \
  --cluster clap-prod \
  --service clap-django \
  --task-definition clap-django:PREVIOUS_REVISION

# Redeploy previous image (Docker Compose):
# Edit docker-compose.yml → image: clap-backend:PREVIOUS_SHA
docker compose up -d
```

### 4.4 Database migration rollback

All Django migrations must be reversible (no irreversible `RunSQL`, no `CASCADE` drops in migrations).

```bash
# Roll back last migration for the api app:
docker compose exec django python manage.py migrate api PREVIOUS_MIGRATION_NAME

# List migration history:
docker compose exec django python manage.py showmigrations api

# Roll back all migrations to zero (nuclear option):
docker compose exec django python manage.py migrate api zero
```

### 4.5 DLQ inspection and reprocessing

When tasks fail and land in the dead letter queue:

```bash
# Count unresolved DLQ entries:
docker compose exec django python manage.py shell -c "
from api.models import DeadLetterQueue
print(DeadLetterQueue.objects.filter(resolved=False).count())
"

# Re-trigger DLQ sweeper immediately (instead of waiting 15 min):
docker compose exec django python manage.py shell -c "
from api.tasks import dlq_sweeper
dlq_sweeper.delay()
"

# Inspect specific failed tasks in Sentry:
# → Sentry → Issues → filter by 'celery' integration
```

---

## 5. Incident Severity Classification

| Severity | Definition | Response time | Example |
|---|---|---|---|
| **P1 — Critical** | All users cannot access service | 15 minutes | DB down, all pods crashed |
| **P2 — High** | Core feature broken for >10% of users | 1 hour | LLM evaluation queue stuck, report delivery failing |
| **P3 — Medium** | Degraded performance or non-critical feature broken | 4 hours | Slow queries, audio playback lag |
| **P4 — Low** | Minor issue, workaround exists | Next business day | Single DLQ entry, UI cosmetic bug |

---

## 6. Restore Test Log

Document each backup restoration test here.

| Date | Type | Recovery point | Restored to | Result | Duration | Tester |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

> Recommendation: test quarterly, or after any major schema migration.

---

## 7. Contact & Escalation

| Role | Contact |
|---|---|
| Engineering lead | _fill in_ |
| DevOps / infra | _fill in_ |
| Supabase support | https://supabase.com/dashboard/support |
| AWS support | https://console.aws.amazon.com/support |
| Sentry on-call | _fill in_ |

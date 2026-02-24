# Application Runtime Guide

**Goal:** Run the CLAP application (local development, staging, or production).

**Time estimate:** 5–10 minutes per execution

---

## Quick Start (Local Development)

### Option A: Manual Commands (Recommended for Learning)

**Terminal 1 — Redis**
```bash
redis-server
```

**Terminal 2 — Django Server**
```bash
cd django-backend
source venv/bin/activate  # Windows: venv\Scripts\Activate.ps1
python manage.py runserver 0.0.0.0:8000
```

**Terminal 3 — Celery Worker**
```bash
cd django-backend
source venv/bin/activate
celery -A clap_backend worker --loglevel=info
```

**Terminal 4 — Celery Beat (Scheduler)**
```bash
cd django-backend
source venv/bin/activate
celery -A clap_backend beat --loglevel=info
```

**Terminal 5 — Flower (Task Monitoring) [Optional]**
```bash
cd django-backend
source venv/bin/activate
celery -A clap_backend flower --port=5555
# Visit http://localhost:5555 to see task queue
```

### Option B: Docker Compose (Recommended for Production-like Setup)

```bash
cd django-backend

# Start all services
docker-compose up

# In another terminal, run migrations
docker-compose exec django python manage.py migrate

# Create superuser
docker-compose exec django python manage.py createsuperuser

# View logs
docker-compose logs -f django

# Stop all services
docker-compose down
```

---

## Detailed Startup Procedures

### Step 1: Verify Prerequisites

```bash
# Check Python version
python --version
# Should be 3.11+

# Check pip packages
pip list | grep -i "django\|celery\|redis"

# Check Redis running
redis-cli ping
# Should return PONG

# Check .env file exists
ls -la django-backend/.env
# If missing, copy from .env.example:
# cp django-backend/.env.example django-backend/.env
```

### Step 2: Activate Virtual Environment

```bash
cd django-backend

# Activate venv
# macOS/Linux:
source venv/bin/activate
# Windows (PowerShell):
venv\Scripts\Activate.ps1

# Verify activation
which python  # Should show path inside venv/
```

### Step 3: Database Verification

```bash
# Check migrations status
python manage.py showmigrations

# If unapplied migrations exist, run them:
python manage.py migrate

# Verify database works
python manage.py shell
>>> from django.db import connection
>>> connection.ensure_connection()
>>> print("✓ Database connection successful")
```

### Step 4: Start Redis (if not already running)

```bash
# Check if Redis is running
redis-cli ping
# If "Could not connect", start it:

# macOS (Homebrew):
brew services start redis
# Or manually:
redis-server

# Linux (systemd):
sudo systemctl start redis-server

# Docker:
docker run -d -p 6379:6379 redis:7-alpine

# Verify:
redis-cli ping
# Should return PONG
```

### Step 5: Start Django Development Server

```bash
# In Terminal 1
python manage.py runserver 0.0.0.0:8000

# Output:
# Starting development server at http://127.0.0.1:8000/
# Quit the server with CONTROL-C.
```

**Verify in another terminal:**
```bash
curl http://localhost:8000/api/health/
# Should return: {"status":"ok","checks":{"database":"ok","redis":"ok"}...}
```

### Step 6: Start Celery Worker(s)

**Terminal 2:**
```bash
# Activate venv in this terminal
source venv/bin/activate

# Start main worker
celery -A clap_backend worker --loglevel=info

# Output:
#  celery@hostname ready.
# [Tasks]
#   api.tasks.score_rule_based
#   api.tasks.evaluate_writing
#   ...
```

**Optional: Start specialized workers (for better throughput)**

```bash
# Terminal 2a — LLM evaluation (2 workers)
celery -A clap_backend worker --queues=llm_evaluation -c 2 --loglevel=info

# Terminal 2b — Report generation (2 workers)
celery -A clap_backend worker --queues=report_gen -c 2 --loglevel=info

# Terminal 2c — Rule scoring (8 workers)
celery -A clap_backend worker --queues=rule_scoring -c 8 --loglevel=info

# Terminal 2d — Email (8 workers)
celery -A clap_backend worker --queues=email -c 8 --loglevel=info
```

### Step 7: Start Celery Beat (Scheduler)

**Terminal 3:**
```bash
# Activate venv
source venv/bin/activate

# Start beat scheduler
celery -A clap_backend beat --loglevel=info

# Output:
# celery beat v5.4.0 (...)
# LocalTime -> 2026-02-24 10:30:00
# [2026-02-24 10:30:00,123: INFO/MainProcess] Scheduler: Sending due task dlq_sweeper ...
```

### Step 8: Monitor Tasks (Optional)

**Terminal 4:**
```bash
# Activate venv
source venv/bin/activate

# Start Flower (web-based task monitor)
celery -A clap_backend flower --port=5555

# Visit: http://localhost:5555
# See real-time task execution, queue depth, worker status
```

---

## Running Application Scenarios

### Scenario 1: Local Development (Quick Start)

**Use case:** Developing features, testing locally

**Steps:**
1. Start Redis: `redis-server`
2. Start Django: `python manage.py runserver`
3. Start Celery: `celery -A clap_backend worker --loglevel=info`
4. Start Beat: `celery -A clap_backend beat --loglevel=info`

**Access:**
- API: http://localhost:8000
- Admin: http://localhost:8000/admin
- Health: http://localhost:8000/api/health/
- Flower: http://localhost:5555

**Load testing (simulate 10 concurrent submissions):**
```bash
ab -n 10 -c 10 http://localhost:8000/api/submissions
```

---

### Scenario 2: Docker Compose (Production-like Local)

**Use case:** Testing with production config before deploying

**Steps:**

```bash
cd django-backend

# Start services
docker-compose up -d

# Watch logs
docker-compose logs -f

# Run migrations
docker-compose exec django python manage.py migrate

# Create superuser
docker-compose exec django python manage.py createsuperuser

# Access
# API: http://localhost:8000
# Admin: http://localhost:8000/admin
# Flower: http://localhost:5555
```

**Stop services:**
```bash
docker-compose down
```

**Remove volumes (reset database):**
```bash
docker-compose down -v
```

---

### Scenario 3: Production Deployment (ECS/Kubernetes)

**Use case:** Running on AWS ECS, GKE, or self-hosted Kubernetes

**Prerequisites:**
- Docker image built and in registry (ECR, Docker Hub, etc.)
- Environment variables configured (Secrets Manager, ConfigMaps)
- Database prepared (Supabase Pro, RDS)
- Redis service provisioned (ElastiCache, Upstash, etc.)

**Docker command (single pod):**
```bash
docker run \
  -e DEBUG=False \
  -e SECRET_KEY=your-secret-key \
  -e DB_HOST=db.example.com \
  -e REDIS_URL=rediss://redis.example.com:6380/2 \
  -e OPENAI_API_KEY=sk-proj-... \
  -p 8000:8000 \
  your-registry/clap-backend:v1.0.0
```

**Kubernetes manifest (example):**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clap-api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: django
        image: your-registry/clap-backend:v1.0.0
        ports:
        - containerPort: 8000
        env:
        - name: DEBUG
          value: "False"
        - name: SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: clap-secrets
              key: secret-key
        # ... other env vars from ConfigMaps/Secrets
        livenessProbe:
          httpGet:
            path: /api/health/
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health/
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
```

---

## Command Reference

### Django Management Commands

```bash
# Check system health
python manage.py check
python manage.py check --deploy  # Production validation

# Database operations
python manage.py migrate                    # Run migrations
python manage.py makemigrations            # Create new migrations
python manage.py migrate --fake-initial    # Fake initial migration (existing DB)
python manage.py dbshell                   # Open database shell

# Create admin user
python manage.py createsuperuser

# Collect static files
python manage.py collectstatic --noinput

# Clear old sessions/cache
python manage.py clearsessions
python manage.py clear_cache

# Shell with Django context
python manage.py shell

# Dump data
python manage.py dumpdata api > backup.json

# Load data
python manage.py loaddata backup.json

# Run tests
python manage.py test api

# Format code
python manage.py format_code  # (if installed)
```

### Celery Commands

```bash
# Start worker (main)
celery -A clap_backend worker --loglevel=info

# Start worker (specific queue)
celery -A clap_backend worker --queues=rule_scoring -c 8

# Start beat scheduler
celery -A clap_backend beat --loglevel=info

# Start Flower (web UI)
celery -A clap_backend flower --port=5555

# Inspect active tasks
celery -A clap_backend inspect active

# Inspect scheduled tasks
celery -A clap_backend inspect scheduled

# Inspect registered tasks
celery -A clap_backend inspect registered

# Purge all tasks (WARNING: deletes pending tasks)
celery -A clap_backend purge

# Check worker stats
celery -A clap_backend inspect stats
```

### Docker Compose Commands

```bash
# Start services (foreground)
docker-compose up

# Start services (background)
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f django

# Execute command in service
docker-compose exec django python manage.py migrate

# Stop services
docker-compose stop

# Stop and remove containers
docker-compose down

# Remove everything (including volumes)
docker-compose down -v

# Rebuild images
docker-compose up --build
```

### Gunicorn Commands (Production)

```bash
# Run with gunicorn config
gunicorn clap_backend.wsgi:application --config gunicorn.conf.py

# Run with specific workers/threads
gunicorn clap_backend.wsgi:application \
  --workers 9 \
  --worker-class gthread \
  --threads 4 \
  --bind 0.0.0.0:8000 \
  --timeout 120

# Run in background (with output logging)
gunicorn clap_backend.wsgi:application \
  --config gunicorn.conf.py \
  --daemon \
  --access-logfile /var/log/gunicorn-access.log \
  --error-logfile /var/log/gunicorn-error.log
```

---

## Health Checks & Monitoring

### Health Endpoint

```bash
# Check service health (no auth required)
curl http://localhost:8000/api/health/

# Response (healthy):
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "version": "v1.0.0"
}

# Response (degraded):
{
  "status": "degraded",
  "checks": {
    "database": "ok",
    "redis": "error: Connection refused"
  }
}
```

### Celery Task Status

```bash
# Get task result (requires task ID)
python manage.py shell
>>> from celery.result import AsyncResult
>>> result = AsyncResult("task-id-here")
>>> print(result.status)  # PENDING, SUCCESS, FAILURE, RETRY
>>> print(result.result)  # Task output
```

### Database Queries

```bash
# Check for slow queries (if logging is enabled)
python manage.py shell
>>> from django.db import connection
>>> from django.test.utils import override_settings
>>> with override_settings(DEBUG=True):
...     # Run your query here
...     pass
>>> print(len(connection.queries))  # Number of queries executed
>>> for q in connection.queries[-5:]:  # Last 5 queries
...     print(f"{q['time']:.2f}s: {q['sql'][:100]}")
```

### Redis Status

```bash
# Connect to Redis
redis-cli

# Check memory usage
INFO memory

# Check connected clients
INFO clients

# List all keys
KEYS *

# Get key size
STRLEN key_name

# Check database size
DBSIZE

# Flush all (WARNING: deletes all data)
FLUSHDB
```

---

## Common Issues & Solutions

### "No module named 'api'"

```bash
# Solution: Ensure you're in django-backend directory
cd django-backend

# Verify __init__.py exists
ls -la api/__init__.py

# Try again
python manage.py migrate
```

### "Celery: Could not connect to Redis"

```bash
# Solution: Start Redis
redis-server

# Or verify connection string
grep REDIS_URL .env

# Test connection
redis-cli -u "redis://localhost:6379/2" ping
```

### "Error: Superuser already exists"

```bash
# Solution: Create with different username
python manage.py createsuperuser --username admin2

# Or delete existing (in shell)
python manage.py shell
>>> from django.contrib.auth.models import User
>>> User.objects.filter(username='admin').delete()
>>> exit()

# Then create again
python manage.py createsuperuser
```

### "Migrations not applied"

```bash
# Solution: Check status
python manage.py showmigrations

# Apply pending migrations
python manage.py migrate

# If stuck, check database
python manage.py dbshell
# SELECT * FROM django_migrations;
# \q
```

### "Celery worker not picking up tasks"

```bash
# Solution: Verify worker is running
# (Check terminal where you started it)

# Check task is queued
python manage.py shell
>>> from api.tasks import score_rule_based
>>> result = score_rule_based.delay(submission_id="test-uuid")
>>> result.status
'SUCCESS' or 'PENDING'

# If PENDING for long time:
# 1. Kill worker with Ctrl+C
# 2. Kill any hung Python processes: pkill -f celery
# 3. Clear Redis: redis-cli FLUSHDB
# 4. Restart: celery -A clap_backend worker
```

---

## Performance Tuning

### Gunicorn Workers

```bash
# Calculate optimal workers:
# workers = (2 × CPU_COUNT) + 1

# For 4-core machine:
workers = (2 × 4) + 1 = 9

# Verify in gunicorn.conf.py:
cat gunicorn.conf.py | grep "^workers"
```

### Celery Concurrency

```bash
# Default (uses all CPU cores):
celery -A clap_backend worker

# Custom concurrency:
celery -A clap_backend worker -c 8  # 8 concurrent tasks
celery -A clap_backend worker -c 2  # 2 concurrent tasks (for memory-bound work)
```

### Database Connection Pool

```bash
# Current settings (in settings.py):
CONN_MAX_AGE=600  # 10 minutes
CONN_HEALTH_CHECKS=True

# Increase for high traffic:
# CONN_MAX_AGE=1800  # 30 minutes
```

### Redis Memory Usage

```bash
# Monitor Redis
redis-cli INFO memory

# Clear old keys
redis-cli --scan --pattern "rate_limit:*" | xargs redis-cli DEL
```

---

## Shutdown Procedures

### Graceful Shutdown

```bash
# Django: Ctrl+C in server terminal

# Celery: Ctrl+C (waits for running tasks to complete, max 30s)
# OR send SIGTERM:
kill -TERM <celery-pid>

# Celery Beat: Ctrl+C

# Redis: Ctrl+C or:
redis-cli SHUTDOWN
```

### Force Shutdown

```bash
# Kill all Python processes related to CLAP:
pkill -f "python.*manage.py"
pkill -f "celery"
pkill -f "redis"

# Or specific PIDs:
kill -9 <pid>
```

---

## Checklist for Starting Application

- [ ] Redis is running (`redis-cli ping` → PONG)
- [ ] Virtual environment activated (`which python` → shows venv path)
- [ ] .env file exists with required variables
- [ ] Database migrations applied (`python manage.py migrate`)
- [ ] Django server starts on port 8000
- [ ] Health endpoint returns 200 (`curl /api/health/`)
- [ ] Celery worker starts and shows task list
- [ ] Celery Beat starts and schedules tasks
- [ ] Can access admin panel at http://localhost:8000/admin/
- [ ] Can log in with superuser account

---

## Next Steps

1. Run the application (follow Quick Start above)
2. Test API endpoints (see `docs/api-reference.md` if available)
3. Monitor Celery tasks in Flower (http://localhost:5555)
4. Check logs for errors: `docker-compose logs -f`
5. Deploy to staging (see deployment documentation)
6. Load test before production deployment

---

**Questions?** Check the troubleshooting section above or review setup/configuration guides in `docs/` directory.

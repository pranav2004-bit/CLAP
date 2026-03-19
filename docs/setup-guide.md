# First-Time Setup Guide

**Goal:** Get the CLAP application running from scratch.

**Time estimate:** 2–4 hours (depending on infrastructure choices)

---

## Phase 1: Prerequisites & Infrastructure (1–2 hours)

### 1.1 Choose Your Stack

| Component | Local Dev | Staging | Production |
|-----------|-----------|---------|-----------|
| **Database** | SQLite | Supabase | Supabase Pro |
| **Cache/Queue** | Redis local | Redis Cloud | AWS ElastiCache |
| **Storage** | Local disk | Supabase Storage | AWS S3 |
| **LLM** | OpenAI API | OpenAI API | OpenAI API |
| **Email** | Console (print) | SendGrid | SendGrid/SES |
| **CDN** | None | CloudFront | CloudFront |

### 1.2 Local Development Setup (Recommended First)

**Requirements:**
- Python 3.11+
- Node.js 18+ (for frontend)
- Redis 7+ (`redis-cli` available)
- PostgreSQL 14+ OR Supabase account
- Git
- Docker & Docker Compose (optional but recommended)

**Install tools:**

```bash
# macOS (using Homebrew)
brew install python@3.11 redis postgresql git docker

# Ubuntu/Debian
sudo apt update && sudo apt install python3.11 python3.11-venv redis-server postgresql git docker.io

# Windows (using Chocolatey or winget)
winget install Python.Python.3.11 Redis Docker OpenSSL
```

### 1.3 Cloud Infrastructure (Staging/Production)

**Create accounts:**
1. **Supabase** (database + storage): https://supabase.com
2. **OpenAI** (LLM): https://platform.openai.com/account/api-keys
3. **SendGrid** (email): https://sendgrid.com
4. **Sentry** (error tracking): https://sentry.io
5. **AWS** (S3 + CloudFront + optional SES): https://aws.amazon.com
6. **Redis Cloud** or **Upstash** (cache): https://redis.com or https://upstash.com

---

## Phase 2: Repository & Environment (30 minutes)

### 2.1 Clone & Navigate

```bash
# Clone the repository
git clone https://github.com/pranav2004-bit/CLAP.git
cd CLAP

# Checkout the main branch (or your target branch)
git checkout main

# Navigate to Django backend
cd django-backend
```

### 2.2 Create Virtual Environment

```bash
# Create venv
python3.11 -m venv venv

# Activate venv
# macOS/Linux:
source venv/bin/activate
# Windows (PowerShell):
venv\Scripts\Activate.ps1

# Verify activation (you should see (venv) in prompt)
python --version  # Should show Python 3.11.x
```

### 2.3 Install Dependencies

```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

**Verify installation:**
```bash
python -c "import django; print(f'Django {django.VERSION}')"
python -c "import rest_framework; print('DRF installed')"
python -c "import celery; print('Celery installed')"
```

### 2.4 Create .env File

```bash
# Copy example to .env
cp .env.example .env

# Edit .env with your values
nano .env  # or use your editor of choice
```

**Minimal .env for local development:**

```env
# Django
SECRET_KEY=your-secret-key-minimum-50-chars-CHANGE-THIS
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (SQLite for local dev)
# Leave DB_* empty to use SQLite, OR set Supabase credentials

# Redis (local default)
REDIS_URL=redis://localhost:6379/2
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# LLM (OpenAI — writing/speaking evaluation + Whisper transcription)
OPENAI_API_KEY=sk-proj-...YOUR_ACTUAL_KEY...
OPENAI_MODEL=gpt-4o

# Storage (local disk for dev)
STORAGE_PROVIDER=
# Leave empty to use django-backend/media/

# Email (console — prints to terminal)
EMAIL_PROVIDER=console
FROM_EMAIL=noreply@localhost

# Rate limiting
RATE_LIMIT_ENABLED=True
RATE_LIMIT_ANON_PER_MINUTE=60
RATE_LIMIT_AUTH_PER_MINUTE=300

# CDN (disabled for local dev)
CDN_ENABLED=False

# Sentry (optional)
SENTRY_DSN=

# Version
APP_VERSION=dev
```

**Save and verify:**
```bash
# Check key values are set
grep "^SECRET_KEY\|^DEBUG\|^OPENAI_API_KEY" .env
```

---

## Phase 3: Database Setup (30 minutes)

### 3.1 Create Database

**Option A: SQLite (Local dev)**
```bash
# Django will auto-create SQLite database
# No action needed — migrations will create it
```

**Option B: Supabase (Staging/Production)**
1. Go to **Supabase Dashboard** → **New Project**
2. Choose region (e.g., `ap-south-1` for India)
3. Wait for project creation (~2 min)
4. Go to **Settings** → **Database** → **Connection String**
5. Copy **Session Mode** connection string (not Transaction Mode)
6. Update `.env`:
   ```env
   DB_NAME=postgres
   DB_USER=postgres.your-project-ref
   DB_PASSWORD=your-db-password
   DB_HOST=aws-0-your-region.pooler.supabase.com
   DB_PORT=5432
   DB_SSLMODE=require
   ```

### 3.2 Run Migrations

```bash
# Check migration status
python manage.py showmigrations

# Run all migrations
python manage.py migrate

# Verify (should show "OK" at end)
```

**Output should include:**
```
Running migrations:
  Applying contenttypes.0001_initial... OK
  ...
  Applying api.0001_initial... OK
```

### 3.3 Create Superuser (Admin Account)

```bash
python manage.py createsuperuser
```

**Prompts:**
```
Username: admin
Email: admin@example.com
Password: (choose a strong password)
Password (again):
Superuser created successfully.
```

### 3.4 Verify Database

```bash
# Test database connection
python manage.py dbshell
# Should open a database shell (psql for PostgreSQL, sqlite3 for SQLite)
# Type \q to exit

# Or verify via Django ORM:
python manage.py shell
>>> from django.contrib.auth.models import User
>>> User.objects.count()
1  # Your superuser
```

---

## Phase 4: Redis & Cache (15 minutes)

### 4.1 Start Redis

**Option A: Local Redis (macOS/Linux)**
```bash
# Start Redis server
redis-server

# In another terminal, verify connection:
redis-cli ping
# Should output: PONG
```

**Option B: Docker Compose**
```bash
# Start Redis in background
docker-compose up -d redis

# Verify:
docker-compose ps
# redis should show "Up"
```

**Option C: Managed Redis (Staging/Production)**
- **Redis Cloud:** https://redis.com (free tier available)
- **Upstash:** https://upstash.com (serverless Redis)
- **AWS ElastiCache:** https://aws.amazon.com/elasticache

Update `.env`:
```env
REDIS_URL=rediss://:your-password@your-host:6380/2
CELERY_BROKER_URL=rediss://:your-password@your-host:6380/0
CELERY_RESULT_BACKEND=rediss://:your-password@your-host:6380/1
```

### 4.2 Verify Connection

```bash
python manage.py shell
>>> import redis
>>> from django.conf import settings
>>> r = redis.from_url(settings.REDIS_URL)
>>> r.ping()
True
```

---

## Phase 5: Application Startup (15 minutes)

### 5.1 Collect Static Files

```bash
python manage.py collectstatic --noinput
```

**Output:**
```
Copying '/app/staticfiles/admin/...
...
123 static files copied, ...
```

### 5.2 System Check

```bash
python manage.py check

# For production validation:
python manage.py check --deploy
```

**Should show:**
```
System check identified some issues:

WARNINGS:
W005: ...

0 errors found
```

*(Some warnings are expected for dev; errors are not)*

### 5.3 Start Django Server

```bash
python manage.py runserver 0.0.0.0:8000
```

**Output:**
```
Starting development server at http://127.0.0.1:8000/
Quit the server with CONTROL-C.
```

### 5.4 Test Django in Another Terminal

```bash
# Check health endpoint
curl http://localhost:8000/api/health/

# Should return:
# {"status": "ok", "checks": {"database": "ok", "redis": "ok"}, "version": "dev"}
```

---

## Phase 6: Celery Task Queue (15 minutes)

**Open new terminal(s):**

### 6.1 Start Celery Worker

```bash
# Activate venv in this terminal too
source venv/bin/activate  # or on Windows: venv\Scripts\Activate.ps1

# Start worker (will process tasks from Redis)
celery -A clap_backend worker --loglevel=info
```

**Output:**
```
 celery@hostname ready.
[Tasks]
  api.tasks.score_rule_based
  api.tasks.evaluate_writing
  api.tasks.evaluate_speaking
  api.tasks.generate_report
  ...
```

### 6.2 Start Celery Beat (Scheduler)

```bash
# In another new terminal
source venv/bin/activate

# Start beat (will trigger periodic tasks like DLQ sweeper)
celery -A clap_backend beat --loglevel=info
```

**Output:**
```
celery beat v5.4.0 (...)
LocalTime -> 2026-02-24 10:30:00
...
Scheduler: Sending due task dlq_sweeper (api.tasks.dlq_sweeper) at 2026-02-24 10:30:00
```

### 6.3 Verify Celery

```bash
# In main Django shell terminal
python manage.py shell

>>> from celery import current_app
>>> current_app.compat_modules  # List of available Celery modules
>>> from api.tasks import score_rule_based
>>> result = score_rule_based.delay(submission_id="test-uuid")
>>> result.status
'PENDING' or 'SUCCESS'
```

---

## Phase 7: First Test Run (30 minutes)

### 7.1 Create Test Data

```bash
python manage.py shell

# Create a test batch
from api.models import Batch
batch = Batch.objects.create(
    batch_name="Test Batch 2025",
    start_year=2025,
    end_year=2027,
    is_active=True
)
print(f"Created batch: {batch.id}")

# Create a test student
from django.contrib.auth.models import User
student = User.objects.create_user(
    username='student1',
    email='student@example.com',
    password='testpass123'
)
student.userprofile.role = 'student'
student.userprofile.batch = batch
student.userprofile.save()
print(f"Created student: {student.id}")

# Verify
from api.models import User as CLAPUser
assert CLAPUser.objects.filter(role='student').count() >= 1
print("✓ Test data created")
```

### 7.2 Test API Endpoints

```bash
# From another terminal (with Django running)

# Test health endpoint
curl http://localhost:8000/api/health/

# Test authentication (get JWT token)
curl -X POST http://localhost:8000/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "student1", "password": "testpass123"}'

# Should return: {"access": "eyJ...", "refresh": "eyJ..."}
```

### 7.3 Test Admin Panel

1. Go to http://localhost:8000/admin/
2. Log in with your superuser credentials (created in Phase 3.3)
3. You should see:
   - Users
   - Batches
   - CLAP Tests
   - Submissions
   - Etc.

---

## Phase 8: Production Deployment Checklist

Once local development is working, prepare for staging/production:

### 8.1 Environment Variables

```bash
# Update .env for staging/production
ALLOWED_HOSTS=api.example.com,api-staging.example.com
DEBUG=False
ENFORCE_TLS=True
SECRET_KEY=<new-long-random-key>

# Database (Supabase)
DB_NAME=postgres
DB_USER=postgres.your-ref
DB_PASSWORD=<your-password>
DB_HOST=aws-0-region.pooler.supabase.com
DB_SSLMODE=require

# Redis (managed service)
REDIS_URL=rediss://:password@redis-host:6380/2

# Storage (S3 or Supabase Storage)
STORAGE_PROVIDER=supabase
SUPABASE_PROJECT_REF=...
SUPABASE_STORAGE_BUCKET=clap-storage

# Email (SendGrid or SES)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxx...

# CDN (CloudFront)
CDN_ENABLED=True
CDN_BASE_URL=https://d123abc456.cloudfront.net
CDN_SIGNED_URLS_ENABLED=True
CDN_PROVIDER=cloudfront
CDN_SIGNING_KEY_ID=K2XXX...
CDN_SIGNING_PRIVATE_KEY=<base64-encoded-pem>

# Error tracking (Sentry)
SENTRY_DSN=https://xxx@o000.ingest.sentry.io/0000

# Version
APP_VERSION=v1.0.0
```

### 8.2 Migrate Production Database

```bash
# Connect to production database
# Update .env to point to production database
source venv/bin/activate
python manage.py migrate --no-input
```

### 8.3 Build Docker Image

```bash
# From django-backend directory
docker build -t clap-backend:v1.0.0 .

# Test image locally
docker run -e DEBUG=False -p 8000:8000 clap-backend:v1.0.0
```

### 8.4 Push to Registry

```bash
# Tag image for ECR / Docker Hub
docker tag clap-backend:v1.0.0 your-registry.dkr.ecr.region.amazonaws.com/clap-backend:v1.0.0

# Push
docker push your-registry.dkr.ecr.region.amazonaws.com/clap-backend:v1.0.0
```

### 8.5 Deploy to ECS / Kubernetes

See `docs/deployment.md` (if available) or container orchestration docs.

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'api'"

**Solution:**
```bash
# Ensure you're in django-backend directory
cd django-backend

# Verify PYTHONPATH
echo $PYTHONPATH
# Should include current directory or django-backend

# Try again:
python manage.py migrate
```

### "Error: REDIS connection refused"

**Solution:**
```bash
# Check Redis is running
redis-cli ping
# If fails, start Redis:
redis-server

# Or check connection string in .env
grep REDIS_URL .env
```

### "Error: no such table: api_clap_test"

**Solution:**
```bash
# Migrations didn't run. Run them:
python manage.py migrate

# Verify:
python manage.py showmigrations
# All should show [X] (completed)
```

### "Error: SECRET_KEY is not set" / "DEBUG setting not found"

**Solution:**
```bash
# Verify .env file exists and is readable
ls -la .env
cat .env | grep "^SECRET_KEY\|^DEBUG"

# If missing, recreate:
cp .env.example .env
# Edit .env with your values
```

### "ConnectionRefusedError: [Errno 111] Connection refused" (database)

**Solution:**
```bash
# If using Supabase, verify connection string:
grep DB_ .env

# If local PostgreSQL:
psql -h localhost -U postgres -d postgres -c "SELECT 1;"

# If using SQLite, just delete it and let Django recreate:
rm db.sqlite3
python manage.py migrate
```

### "Celery worker not processing tasks"

**Solution:**
```bash
# Verify Redis is connected
redis-cli ping
# PONG

# Check Celery worker is running
# (Check terminal where you started it)

# Check task is actually queued:
python manage.py shell
>>> from api.tasks import score_rule_based
>>> result = score_rule_based.delay(submission_id="test")
>>> result.id  # Should return a task ID
```

---

## Summary Checklist

### Local Development
- [ ] Python 3.11+ installed and in PATH
- [ ] Redis running (`redis-cli ping` returns PONG)
- [ ] Virtual environment created and activated
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] .env file created with development values
- [ ] Database migrations run (`python manage.py migrate`)
- [ ] Superuser created (`python manage.py createsuperuser`)
- [ ] Django server starts (`python manage.py runserver`)
- [ ] Health endpoint returns 200 (`curl /api/health/`)
- [ ] Celery worker starts and picks up tasks
- [ ] Celery Beat starts scheduler
- [ ] Test data created and API works
- [ ] Admin panel accessible at http://localhost:8000/admin/

### Before Staging/Production
- [ ] All .env variables configured for target environment
- [ ] Database created and migrations run
- [ ] Storage provider (S3/Supabase) credentials set
- [ ] Email provider (SendGrid/SES) configured
- [ ] LLM provider (OpenAI) credentials set
- [ ] Redis/cache service provisioned and connected
- [ ] Sentry DSN configured for error tracking
- [ ] CDN (CloudFront) setup complete (see `docs/cdn-setup-guide.md`)
- [ ] Docker image built and tested locally
- [ ] Docker image pushed to registry (ECR/Docker Hub)
- [ ] Health checks configured in orchestration platform
- [ ] Load balancer/ingress configured
- [ ] HTTPS/TLS certificates provisioned

---

## Next Steps

1. **Run the application** (see `docs/runtime-guide.md`)
2. **Set up CDN** (see `docs/cdn-setup-guide.md`)
3. **Configure monitoring** (Sentry, CloudWatch, Prometheus)
4. **Deploy to staging** (Docker + ECS/K8s)
5. **Load test** (verify 6,000 concurrent user capacity)
6. **Deploy to production** (canary release, 10% → 50% → 100% traffic)

---

**Questions?** Check the troubleshooting section above, or review `docs/enterprise-audit-report.md` for architecture details.

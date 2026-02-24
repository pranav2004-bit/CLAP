# Getting Started with CLAP

**Welcome to the CLAP Django Backend!**

This guide will help you get up and running quickly. Choose your path below:

---

## 🚀 Quick Start (5 minutes)

### For Local Development (No Setup Cost)

```bash
# 1. Navigate to project
cd django-backend

# 2. Create & activate virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy .env for local development
cp ../.env.local-dev .env

# 5. Run migrations
python manage.py migrate

# 6. Create admin user
python manage.py createsuperuser

# 7. Start server (in Terminal 1)
python manage.py runserver

# 8. Start Redis (in Terminal 2)
redis-server

# 9. Start Celery worker (in Terminal 3)
celery -A clap_backend worker --loglevel=info

# 10. Visit http://localhost:8000/admin/
```

**Done!** ✅ You're ready to develop locally.

---

## 📖 Detailed Guides

### 1. First-Time Setup (2-4 hours)
**For fresh installation from scratch**

📄 **Read:** [`docs/setup-guide.md`](setup-guide.md)

**Covers:**
- Infrastructure choices (SQLite vs Supabase, local vs cloud)
- Virtual environment setup
- Database configuration
- Redis installation
- Celery task queue setup
- First API test

**Time:** 2-4 hours depending on your choices

---

### 2. Running the Application (Ongoing)
**Every time you want to start the app**

📄 **Read:** [`docs/runtime-guide.md`](runtime-guide.md)

**Quick Reference:**
```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Django
cd django-backend && source venv/bin/activate
python manage.py runserver

# Terminal 3: Celery Worker
cd django-backend && source venv/bin/activate
celery -A clap_backend worker --loglevel=info

# Terminal 4: Celery Beat (Scheduler)
cd django-backend && source venv/bin/activate
celery -A clap_backend beat --loglevel=info

# Terminal 5: Flower (Task Monitor - Optional)
cd django-backend && source venv/bin/activate
celery -A clap_backend flower --port=5555
```

**Visit:**
- API: http://localhost:8000
- Admin: http://localhost:8000/admin
- Health: http://localhost:8000/api/health/
- Flower: http://localhost:5555

**Time:** 5-10 minutes per session

---

### 3. CDN Setup (20-30 minutes)
**For production-ready content delivery**

📄 **Read:** [`docs/cdn-setup-guide.md`](cdn-setup-guide.md)

**Prerequisites:**
- AWS account with CloudFront access
- S3 bucket for storage
- OpenSSL installed

**Covers:**
- Creating CloudFront distribution
- Generating RSA key pair
- Configuring Django settings
- Testing signed URLs

**Time:** 20-30 minutes (one-time setup)

---

## 📝 Environment Files

Three ready-to-use `.env` templates for different environments:

### 1. **Local Development** (SQLite, Local Redis)
```bash
cp docs/.env.local-dev django-backend/.env
```
📄 **File:** [`docs/.env.local-dev`](.env.local-dev)
- Uses SQLite (no database setup)
- Local Redis (simple)
- Local file storage (no S3 cost)
- Console email (prints to terminal)
- **Cost:** $0

---

### 2. **Staging** (Supabase, Redis Cloud, SendGrid)
```bash
cp docs/.env.staging django-backend/.env
# Then edit and fill in YOUR values
```
📄 **File:** [`docs/.env.staging`](.env.staging)
- Supabase database (PITR backups)
- Redis Cloud (managed)
- Supabase Storage (S3-compatible, free)
- SendGrid email (100 free/day)
- Optional CloudFront CDN
- **Cost:** ~$50-100/month

---

### 3. **Production** (Supabase Pro, ElastiCache, S3, CDN)
```bash
cp docs/.env.production django-backend/.env
# Configure all SECRET values from AWS Secrets Manager
```
📄 **File:** [`docs/.env.production`](.env.production)
- Supabase Pro (PITR + backups)
- AWS ElastiCache (low-latency cache)
- AWS S3 (production storage)
- SendGrid (high-volume email)
- CloudFront CDN (global edge caching)
- AWS Secrets Manager (key rotation)
- **Cost:** ~$4,400/year for 6,000 users ($0.73/student/year)

---

## 🔧 Using .env Files

### Copy to Project

```bash
cd django-backend

# Development
cp ../.env.local-dev .env

# Or staging (then edit with your values)
cp ../.env.staging .env

# Or production (then configure AWS Secrets Manager)
cp ../.env.production .env
```

### Verify Configuration

```bash
# Check required variables are set
grep "^SECRET_KEY\|^DEBUG\|^OPENAI_API_KEY" .env

# Check for unset values (should be empty)
grep "YOUR_ACTUAL\|STORE_IN_AWS" .env
# If any results, fill them in before deploying
```

---

## 📚 Additional Resources

| Topic | File | When to Read |
|-------|------|--------------|
| **Full Architecture** | [`docs/enterprise-audit-report.md`](enterprise-audit-report.md) | Before production deployment |
| **Disaster Recovery** | [`docs/disaster-recovery.md`](disaster-recovery.md) | Planning backup strategy |
| **CloudFront Setup** | [`docs/cdn-setup-guide.md`](cdn-setup-guide.md) | Ready to enable CDN |
| **IAM Permissions** | [`docs/iam-policy.json`](iam-policy.json) | Creating AWS user for S3 |
| **S3 Lifecycle** | [`docs/s3-lifecycle.json`](s3-lifecycle.json) | Auto-archiving old files |

---

## 🎯 Implementation Path

### Phase 1: Local Development (Week 1)
- [ ] Read setup-guide.md
- [ ] Create virtual environment
- [ ] Install dependencies
- [ ] Run migrations
- [ ] Start Django server
- [ ] Test API endpoints
- [ ] Make code changes

### Phase 2: Staging Deployment (Week 2)
- [ ] Create Supabase project
- [ ] Set up Redis Cloud
- [ ] Copy .env.staging
- [ ] Deploy to container (Docker)
- [ ] Run load testing
- [ ] Verify all endpoints
- [ ] Monitor Sentry errors

### Phase 3: Production Deployment (Week 3)
- [ ] Set up Supabase Pro
- [ ] Provision AWS ElastiCache
- [ ] Create S3 bucket with lifecycle
- [ ] Configure CloudFront CDN
- [ ] Set up AWS Secrets Manager
- [ ] Deploy to production
- [ ] Run smoke tests
- [ ] Monitor 24/7 for 1 week

### Phase 4: Hardening (Ongoing)
- [ ] Monitor Sentry errors
- [ ] Analyze CloudWatch metrics
- [ ] Implement performance optimizations
- [ ] Scale workers based on demand
- [ ] Quarterly disaster recovery test

---

## ❓ Common Questions

### Q: Should I use local development or Docker Compose?
**A:** Start with manual commands (faster feedback loop). Use Docker Compose when deploying to staging/production.

### Q: How long does first setup take?
**A:** 2-4 hours for complete setup including database, cache, and task queue. Much faster on subsequent runs (5-10 minutes).

### Q: Can I test without OpenAI API key?
**A:** Yes, use dummy key for local dev: `OPENAI_API_KEY=sk-test-dummy`. Celery tasks will fail gracefully (logged to DLQ).

### Q: Do I need AWS?
**A:** No for local dev (uses SQLite + local file storage). Yes for production (S3 + CloudFront). Supabase is cheaper alternative to RDS.

### Q: How much does it cost to run?
**A:**
- Local dev: $0
- Staging: $50-100/month
- Production (6,000 users): $4,400/year ($0.73/student/year)

### Q: How do I handle 6,000 concurrent users?
**A:** Scale horizontally with Docker + orchestration (ECS/Kubernetes). Gunicorn + Celery are designed for this scale. See enterprise-audit-report.md.

---

## 🔗 Key Services You'll Need

### Database
- **Local:** SQLite (built-in)
- **Production:** Supabase PostgreSQL (PITR backups, connection pooling)
- **Link:** https://supabase.com

### Cache & Task Queue
- **Local:** Redis (install locally)
- **Production:** Redis Cloud or AWS ElastiCache
- **Link:** https://redis.com or https://aws.amazon.com/elasticache/

### Storage
- **Local:** Local disk (`/app/media/`)
- **Production:** AWS S3 or Supabase Storage
- **Link:** https://aws.amazon.com/s3

### LLM Evaluation
- **Provider:** OpenAI (GPT-4, Whisper)
- **Cost:** ~$1,500/year for 6,000 users
- **Link:** https://platform.openai.com

### Email Delivery
- **Local:** Console (prints to terminal)
- **Production:** SendGrid (100 free/day, $29+/month)
- **Link:** https://sendgrid.com

### Error Tracking
- **Optional:** Sentry
- **Cost:** Free tier available
- **Link:** https://sentry.io

### CDN (Production)
- **Provider:** AWS CloudFront
- **Cost:** ~$14/month for 165 GB/month
- **Link:** https://aws.amazon.com/cloudfront

---

## 📞 Need Help?

1. **Check the troubleshooting section** in [`docs/runtime-guide.md`](runtime-guide.md)
2. **Review the setup guide** in [`docs/setup-guide.md`](setup-guide.md)
3. **Read the enterprise audit** for architecture details: [`docs/enterprise-audit-report.md`](enterprise-audit-report.md)
4. **Check GitHub issues** for similar problems

---

## ✅ You're Ready!

Choose your path above and get started. Most people can get a working local development environment in **5-10 minutes**.

**Next step:** 👉 **[Read the Setup Guide](setup-guide.md)** for complete first-time setup.

---

**Current Version:** v1.0.0
**Last Updated:** 2026-02-24
**Status:** Production Ready ✅

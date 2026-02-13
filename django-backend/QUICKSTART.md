# Quick Start Guide - Django Backend

## 🚀 Get Running in 5 Minutes

### Step 1: Setup Virtual Environment (1 min)

```bash
cd django-backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### Step 2: Install Dependencies (2 min)

```bash
pip install -r requirements.txt
```

### Step 3: Configure Environment (1 min)

```bash
# Copy template
cp .env.example .env

# Edit .env with your Supabase credentials
# Minimum required:
# - DB_HOST
# - DB_PASSWORD
# - OPENAI_API_KEY
```

**Example .env:**
```env
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_supabase_password_here
DB_HOST=db.xxxxx.supabase.co
DB_PORT=5432

OPENAI_API_KEY=sk-xxxxx

CORS_ALLOWED_ORIGINS=http://localhost:3000

SECRET_KEY=change-this-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

### Step 4: Test Database Connection (30 sec)

```bash
python manage.py dbshell
# Should connect to Supabase PostgreSQL
# Type \q to exit
```

### Step 5: Run Server (30 sec)

```bash
python manage.py runserver 0.0.0.0:8000
```

**Server should start at**: `http://localhost:8000`

---

## ✅ Quick Test

### Test 1: List Batches

```bash
curl http://localhost:8000/api/admin/batches
```

**Expected**: JSON response with batches array

### Test 2: Create Batch

```bash
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"TEST-2026","start_year":2026,"end_year":2030}'
```

**Expected**: 201 status with created batch

### Test 3: List Students

```bash
curl http://localhost:8000/api/admin/students
```

**Expected**: JSON response with students array

---

## 🔧 Troubleshooting

### Database Connection Error

**Error**: `could not connect to server`

**Fix**:
1. Check `DB_HOST` in `.env`
2. Verify Supabase project is running
3. Check firewall/network settings

### Import Error

**Error**: `ModuleNotFoundError: No module named 'X'`

**Fix**:
```bash
pip install -r requirements.txt
```

### CORS Error (from frontend)

**Error**: `Access-Control-Allow-Origin`

**Fix**: Add frontend URL to `CORS_ALLOWED_ORIGINS` in `.env`
```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## 📚 Next Steps

1. **Full Testing**: See `VERIFICATION_CHECKLIST.md`
2. **Integration**: Update frontend API URL
3. **Deployment**: See `README.md` production section

---

## 🆘 Need Help?

- **Setup Issues**: Check `README.md`
- **Migration Questions**: See `MIGRATION_GUIDE.md`
- **Testing**: Use `VERIFICATION_CHECKLIST.md`
- **API Reference**: Original Next.js code in `app/api/`

---

## 📊 Project Status

- ✅ Core endpoints implemented
- ✅ Database models mapped
- ✅ OpenAI integration ready
- ✅ bcrypt password hashing
- ⏳ Remaining endpoints (follow same pattern)
- ⏳ Production deployment

**You're ready to start testing!** 🎉

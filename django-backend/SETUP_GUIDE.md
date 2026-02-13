# 🚀 Django Backend - Setup & Launch Guide

## ⚡ Quick Start (5 Minutes)

### Prerequisites
- ✅ Python 3.12.4 installed (verified)
- ✅ Supabase database credentials available
- ⚠️ Need: Supabase database password
- ⚠️ Need: OpenAI API key (for AI evaluation)

---

## 🎯 Step-by-Step Setup

### Step 1: Configure Environment Variables (2 minutes)

**IMPORTANT**: You need to update the `.env` file with your actual credentials.

1. Open `.env` file in this directory
2. Update these values:

```env
# Replace with your actual Supabase database password
DB_PASSWORD=your_actual_supabase_password_here

# Replace with your actual OpenAI API key
OPENAI_API_KEY=sk-your_actual_openai_key_here
```

**Where to find these:**
- **Supabase Password**: Supabase Dashboard → Project Settings → Database → Password
- **OpenAI Key**: OpenAI Platform → API Keys

---

### Step 2: Automated Setup & Launch (3 minutes)

**Option A: Automated (Recommended)**

Run the setup script:
```powershell
.\setup-and-run.ps1
```

This will:
1. ✅ Check Python installation
2. ✅ Create virtual environment
3. ✅ Install all dependencies
4. ✅ Start Django server on http://localhost:8000

**Option B: Manual Setup**

```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate

# Install dependencies
pip install -r requirements.txt

# Run server
python manage.py runserver 0.0.0.0:8000
```

---

### Step 3: Verify Setup (1 minute)

Once the server is running, open a new terminal and run:

```powershell
.\test-endpoints.ps1
```

This will test all basic endpoints and confirm everything is working.

---

## 🧪 Testing the API

### Using Browser
Open: http://localhost:8000/api/admin/batches

### Using PowerShell
```powershell
# List batches
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/batches" -Method Get

# Create batch
$batch = @{batch_name="2026-30"; start_year=2026; end_year=2030} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/batches" -Method Post -Body $batch -ContentType "application/json"
```

### Using cURL
```bash
# List batches
curl http://localhost:8000/api/admin/batches

# Create batch
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"2026-30","start_year":2026,"end_year":2030}'
```

---

## 📋 All Available Endpoints (23 total)

### ✅ Admin - Batch Management (5)
- GET /api/admin/batches
- POST /api/admin/batches
- PATCH /api/admin/batches/[id]
- DELETE /api/admin/batches/[id]
- GET /api/admin/batches/[id]/students

### ✅ Admin - Student Management (6)
- GET /api/admin/students
- POST /api/admin/students
- GET /api/admin/students/[id]
- PUT /api/admin/students/[id]
- DELETE /api/admin/students/[id]
- POST /api/admin/students/[id]/reset-password

### ✅ Admin - CLAP Test Management (7)
- GET /api/admin/clap-tests
- POST /api/admin/clap-tests
- GET /api/admin/clap-tests/[id]
- PATCH /api/admin/clap-tests/[id]
- DELETE /api/admin/clap-tests/[id]
- POST /api/admin/clap-tests/[id]/assign
- POST /api/admin/clap-tests/[id]/unassign

### ✅ Student Portal (3)
- GET /api/student/profile
- PUT /api/student/profile
- POST /api/student/change-password

### ✅ AI Evaluation (2)
- POST /api/evaluate/speaking
- POST /api/evaluate/writing

---

## ⚠️ Important Notes

### Database Password
The `.env` file currently has a placeholder for `DB_PASSWORD`. You MUST update this with your actual Supabase database password before the server will connect to the database.

**How to get it:**
1. Go to Supabase Dashboard
2. Select your project (fjuhxlllncnidbqqlzha)
3. Settings → Database
4. Copy the password (or reset if needed)

### OpenAI API Key
Required for AI evaluation endpoints (`/api/evaluate/speaking` and `/api/evaluate/writing`).

**How to get it:**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy and paste into `.env`

---

## 🔧 Troubleshooting

### Error: "No module named 'django'"
**Solution**: Activate virtual environment first
```powershell
.\venv\Scripts\Activate
pip install -r requirements.txt
```

### Error: Database connection failed
**Solution**: Update `DB_PASSWORD` in `.env` with actual Supabase password

### Error: Port 8000 already in use
**Solution**: Kill existing process or use different port
```powershell
# Use different port
python manage.py runserver 0.0.0.0:8001
```

### Error: CORS errors from frontend
**Solution**: Add frontend URL to `CORS_ALLOWED_ORIGINS` in `.env`
```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## 📊 What's Next?

### After Setup is Complete:

1. **Test All Endpoints**
   - Use `test-endpoints.ps1` script
   - Or use BEHAVIORAL_VERIFICATION_PLAN.md for detailed testing

2. **Integrate with Frontend**
   - Update Next.js frontend API URL to `http://localhost:8000`
   - Test all admin workflows
   - Test student portal

3. **Production Deployment**
   - Set `DEBUG=False` in `.env`
   - Configure production database
   - Set up Gunicorn + Nginx
   - Deploy to server

---

## 📚 Additional Resources

- **COMPLETION_REPORT.md** - Full migration summary
- **README.md** - Complete documentation
- **BEHAVIORAL_VERIFICATION_PLAN.md** - Detailed testing guide
- **QUICKSTART.md** - Alternative quick start guide

---

## ✅ Success Checklist

- [ ] Python 3.10+ installed
- [ ] Virtual environment created
- [ ] Dependencies installed
- [ ] `.env` file updated with DB password
- [ ] `.env` file updated with OpenAI key
- [ ] Server running on http://localhost:8000
- [ ] Test endpoints script passed
- [ ] Frontend connected (optional)

---

## 🎉 You're Ready!

Once you've completed the setup, your Django backend will be fully operational with all 23 endpoints ready to use!

**Current Status**: ✅ 100% Backend Migration Complete

**Next Command**: `.\setup-and-run.ps1`

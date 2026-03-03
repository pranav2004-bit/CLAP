# 🚀 How to Run CLAP Application

**Complete guide to starting your CLAP application with Django backend**

---

## 📋 **QUICK START - ONE COMMAND**

### **Easiest Way (Recommended)**

Open PowerShell in the project root and run:

```powershell
.\start-app.ps1
```

**What it does (Development Mode Only)**:
- ✅ Starts Django backend (Port 8000)
- ✅ Starts Next.js frontend (Port 3000)
- ❌ **Does NOT start Celery or Redis** (Test evaluations will stay stuck processing!)

### **Full Production-Ready Way (Required for LLM Evaluation processing)**

If you want the students to take a test, **and have their speaking/writing actually evaluated by AI**, you must run the background workers.

Open PowerShell in the project root and run:

```powershell
docker compose up --build
```
*(Wait a minute or two for all containers to boot)*

Then in a **second** terminal, start your Next.js frontend:
```powershell
npm run dev
```

**What it does**:
- ✅ Starts Redis (Message broker)
- ✅ Starts Django API
- ✅ Starts Celery LLM Worker (Evaluates speaking & writing using OpenAI)
- ✅ Starts Celery Reports Worker (Generates PDF reports)
- ✅ Starts Celery Beat (Scheduled tasks like retry sweepers)

**That's it!** Your full-stack application with evaluation grading will be running at `http://localhost:3000`

---

## 📋 **MANUAL START - TWO TERMINALS**

If you prefer to start servers manually:

### **Terminal 1: Django Backend**

```powershell
# Navigate to Django backend
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP\django-backend

# Activate virtual environment
.\venv\Scripts\Activate

# Run Django server
python manage.py runserver
```

**Expected Output**:
```
Django version 4.2.9, using settings 'clap_backend.settings'
Starting development server at http://127.0.0.1:8000/
Quit the server with CTRL-BREAK.
```

✅ **Django is ready when you see**: `Starting development server at http://127.0.0.1:8000/`

---

### **Terminal 2: Next.js Frontend**

```powershell
# Navigate to project root
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP

# Run Next.js development server
npm run dev
```

**Expected Output**:
```
> clap@0.1.0 dev
> next dev

  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in 2.5s
```

✅ **Frontend is ready when you see**: `Ready in X.Xs`

---

### **Access Application**

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🎯 **WHAT RUNS WHERE**

| Component | URL | Port | Purpose |
|-----------|-----|------|---------|
| **Frontend** | http://localhost:3000 | 3000 | Next.js UI |
| **Backend API** | http://localhost:8000/api | 8000 | Django REST API |
| **Admin Dashboard** | http://localhost:3000/admin | 3000 | Admin interface |
| **Student Portal** | http://localhost:3000/student | 3000 | Student interface |

---

## 🛠️ **FIRST TIME SETUP**

If you haven't set up the Django backend yet:

### **Step 1: Create Virtual Environment**

```powershell
cd django-backend
python -m venv venv
```

### **Step 2: Activate Virtual Environment**

```powershell
.\venv\Scripts\Activate
```

### **Step 3: Install Dependencies**

```powershell
pip install -r requirements.txt
```

### **Step 4: Configure Environment**

Create `.env` file in `django-backend/` with:

```env
# Database
DATABASE_URL=your_supabase_connection_string
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_supabase_password
DB_HOST=db.fjuhxlllncnidbqqlzha.supabase.co
DB_PORT=5432

# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000

# OpenAI (for AI evaluation)
OPENAI_API_KEY=your_openai_api_key
```

### **Step 5: Test Django**

```powershell
python manage.py runserver
```

Visit `http://localhost:8000/api/admin/batches` - should return JSON

---

## 🔍 **TROUBLESHOOTING**

### **Problem: Django won't start**

**Error**: `No module named 'django'`

**Solution**:
```powershell
cd django-backend
.\venv\Scripts\Activate
pip install -r requirements.txt
```

---

### **Problem: Port already in use**

**Error**: `Error: That port is already in use.`

**Solution**:
```powershell
# For Django (Port 8000)
python manage.py runserver 8001

# For Next.js (Port 3000)
npm run dev -- -p 3001
```

Or kill the process using the port:
```powershell
# Find process on port 8000
netstat -ano | findstr :8000

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

---

### **Problem: Database connection error**

**Error**: `django.db.utils.OperationalError: could not connect to server`

**Solution**:
1. Check `.env` file has correct database credentials
2. Verify Supabase database is running
3. Check internet connection

---

### **Problem: Frontend can't connect to backend**

**Error**: `Failed to fetch` or `Network Error`

**Solution**:
1. Verify Django is running: `http://localhost:8000/api/admin/batches`
2. Check `lib/api-config.ts` has correct URL:
   ```typescript
   export const API_BASE_URL = 'http://localhost:8000/api'
   ```
3. Check CORS settings in Django `settings.py`

---

## 🎯 **DEVELOPMENT WORKFLOW**

### **Daily Workflow**

1. **Start servers**:
   ```powershell
   .\start-app.ps1
   ```

2. **Develop**:
   - Frontend code: Edit files in `app/`, `components/`, `lib/`
   - Backend code: Edit files in `django-backend/api/`
   - Both auto-reload on changes

3. **Test**:
   - Frontend: Check browser at `http://localhost:3000`
   - Backend: Test API at `http://localhost:8000/api/`

4. **Stop servers**:
   - Close PowerShell windows, OR
   - Press `Ctrl+C` in each terminal

---

## 📊 **VERIFY EVERYTHING IS WORKING**

### **Test 1: Backend API**

```powershell
# In PowerShell
Invoke-RestMethod -Uri "http://localhost:8000/api/admin/batches"
```

**Expected**: JSON response with batch data

---

### **Test 2: Frontend**

Open browser: `http://localhost:3000`

**Expected**: CLAP application homepage loads

---

### **Test 3: Integration**

1. Go to `http://localhost:3000/admin/dashboard`
2. Check if batches are displayed
3. Try creating a new batch

**Expected**: Data from Django backend displays in frontend

---

## 🚀 **PRODUCTION DEPLOYMENT**

### **Django Backend**

```powershell
# Set production environment
DEBUG=False
ALLOWED_HOSTS=your-domain.com

# Use production server (Gunicorn)
gunicorn clap_backend.wsgi:application --bind 0.0.0.0:8000
```

### **Next.js Frontend**

```powershell
# Build for production
npm run build

# Start production server
npm start
```

---

## 📁 **USEFUL COMMANDS**

### **Django Commands**

```powershell
# Run server
python manage.py runserver

# Run on different port
python manage.py runserver 8001

# Check for issues
python manage.py check

# Open Django shell
python manage.py shell
```

### **Next.js Commands**

```powershell
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Run on different port
npm run dev -- -p 3001
```

### **Testing Commands**

```powershell
# Test Django API
cd django-backend
.\test-endpoints.ps1

# Test regression
.\regression-tests.ps1
```

---

## 🎯 **QUICK REFERENCE**

### **Start Application**
```powershell
.\start-app.ps1
```

### **Stop Application**
- Close PowerShell windows
- Or press `Ctrl+C` in each terminal

### **Access Points**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/api
- **Admin Dashboard**: http://localhost:3000/admin

### **Logs**
- **Django**: Terminal 1 (Django window)
- **Next.js**: Terminal 2 (Next.js window)
- **Browser**: Developer Console (F12)

---

## 💡 **TIPS**

### **Tip 1: Keep Terminals Open**
Don't close the terminal windows while using the app. Both servers need to keep running.

### **Tip 2: Auto-Reload**
Both Django and Next.js auto-reload when you save files. No need to restart.

### **Tip 3: Check Logs**
If something doesn't work, check the terminal windows for error messages.

### **Tip 4: Database Changes**
Django models have `managed=False`, so no migrations needed. Database schema is managed externally.

### **Tip 5: Environment Variables**
Keep `.env` files secure. Never commit them to git.

---

## 🎊 **SUMMARY**

### **Easiest Way**
```powershell
.\start-app.ps1
```

### **Manual Way**
```powershell
# Terminal 1
cd django-backend
.\venv\Scripts\Activate
python manage.py runserver

# Terminal 2
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP
npm run dev
```

### **Access**
```
http://localhost:3000
```

---

**That's it! Your application should now be running!** 🚀

If you encounter any issues, check the Troubleshooting section above.

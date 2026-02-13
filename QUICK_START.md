# 🚀 QUICK START GUIDE - CLAP Application

**Three simple ways to run your application**

---

## ✅ **METHOD 1: SIMPLEST WAY** ⭐ **RECOMMENDED**

### **Step 1: Start Django Backend**

Open PowerShell in the project root:

```powershell
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP\django-backend
.\start.ps1
```

**Wait for**: `Starting development server at http://127.0.0.1:8000/`

### **Step 2: Start Next.js Frontend**

Open a **NEW** PowerShell window in the project root:

```powershell
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP
npm run dev
```

**Wait for**: `Ready in X.Xs`

### **Step 3: Open Browser**

Go to: **http://localhost:3000**

**Done!** ✅

---

## ✅ **METHOD 2: AUTOMATED START**

From the project root, run:

```powershell
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP
.\start-app.ps1
```

This will:
- ✅ Start Django in a new window
- ✅ Start Next.js in a new window
- ✅ Open browser automatically

---

## ✅ **METHOD 3: MANUAL COMMANDS**

### **Terminal 1: Django**

```powershell
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP\django-backend
.\venv\Scripts\Activate
python manage.py runserver
```

### **Terminal 2: Next.js**

```powershell
cd C:\Users\pranavnath\OneDrive\Desktop\CLAP
npm run dev
```

---

## 📊 **WHAT YOU'LL SEE**

### **Django Backend (Terminal 1)**
```
Django version 4.2.9, using settings 'clap_backend.settings'
Starting development server at http://127.0.0.1:8000/
Quit the server with CTRL-BREAK.
```

### **Next.js Frontend (Terminal 2)**
```
> clap@0.1.0 dev
> next dev

  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in 2.5s
```

---

## 🎯 **ACCESS POINTS**

| What | URL |
|------|-----|
| **Application** | http://localhost:3000 |
| **Admin Dashboard** | http://localhost:3000/admin |
| **Student Portal** | http://localhost:3000/student |
| **Backend API** | http://localhost:8000/api |

---

## 🛑 **HOW TO STOP**

Press **Ctrl+C** in each terminal window

---

## ⚠️ **TROUBLESHOOTING**

### **Problem: "manage.py not found"**
✅ **FIXED!** I just created it for you.

### **Problem: "Port already in use"**

**Solution**:
```powershell
# Kill process on port 8000
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Or use different port
python manage.py runserver 8001
```

### **Problem: "Module not found"**

**Solution**:
```powershell
cd django-backend
.\venv\Scripts\Activate
pip install -r requirements.txt
```

---

## 📁 **AVAILABLE SCRIPTS**

In `django-backend/`:
- `start.ps1` - Quick start (recommended)
- `setup-and-run.ps1` - Setup + start
- `test-endpoints.ps1` - Test API endpoints
- `regression-tests.ps1` - Run regression tests

In project root:
- `start-app.ps1` - Start both servers automatically

---

## ✅ **RECOMMENDED WORKFLOW**

**Every time you want to run the app**:

1. Open PowerShell
2. Run:
   ```powershell
   cd C:\Users\pranavnath\OneDrive\Desktop\CLAP\django-backend
   .\start.ps1
   ```
3. Open another PowerShell
4. Run:
   ```powershell
   cd C:\Users\pranavnath\OneDrive\Desktop\CLAP
   npm run dev
   ```
5. Open browser: http://localhost:3000

**That's it!** 🎉

---

## 🎊 **FILES I CREATED FOR YOU**

✅ `django-backend/manage.py` - Django management script  
✅ `django-backend/start.ps1` - Quick start script  
✅ `django-backend/setup-and-run.ps1` - Setup + run script  
✅ `start-app.ps1` - Automated startup (both servers)  
✅ `QUICK_START.md` - This guide

---

**Now try running the app using Method 1!** 🚀

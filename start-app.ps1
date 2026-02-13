# CLAP Application Startup Script
# Starts both Django backend and Next.js frontend

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CLAP Application Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory (project root)
$projectRoot = $PSScriptRoot

Write-Host "[1/4] Checking Django backend..." -ForegroundColor Yellow

# Check if Django backend exists
$djangoPath = Join-Path $projectRoot "django-backend"
if (-not (Test-Path $djangoPath)) {
    Write-Host "[ERROR] Django backend not found at: $djangoPath" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Django backend found" -ForegroundColor Green
Write-Host ""

Write-Host "[2/4] Checking virtual environment..." -ForegroundColor Yellow

# Check if venv exists
$venvPath = Join-Path $djangoPath "venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "[ERROR] Virtual environment not found. Run setup first." -ForegroundColor Red
    Write-Host "Run: cd django-backend && python -m venv venv && .\venv\Scripts\Activate && pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Virtual environment found" -ForegroundColor Green
Write-Host ""

Write-Host "[3/4] Starting Django backend..." -ForegroundColor Yellow

# Start Django in a new window
$djangoCmd = "cd '$djangoPath'; .\venv\Scripts\Activate; python manage.py runserver; Read-Host 'Press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $djangoCmd

Write-Host "[OK] Django backend starting in new window..." -ForegroundColor Green
Write-Host "     URL: http://localhost:8000" -ForegroundColor Cyan
Write-Host ""

# Wait for Django to start
Write-Host "Waiting for Django to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "[4/4] Starting Next.js frontend..." -ForegroundColor Yellow

# Start Next.js in a new window
$nextCmd = "cd '$projectRoot'; npm run dev; Read-Host 'Press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $nextCmd

Write-Host "[OK] Next.js frontend starting in new window..." -ForegroundColor Green
Write-Host "     URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""

# Wait for Next.js to start
Write-Host "Waiting for Next.js to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Application Started Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your application is now running:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs:  http://localhost:8000/api/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Two PowerShell windows have been opened:" -ForegroundColor Yellow
Write-Host "  1. Django Backend (Port 8000)" -ForegroundColor White
Write-Host "  2. Next.js Frontend (Port 3000)" -ForegroundColor White
Write-Host ""
Write-Host "To stop the servers:" -ForegroundColor Yellow
Write-Host "  - Close both PowerShell windows, OR" -ForegroundColor White
Write-Host "  - Press Ctrl+C in each window" -ForegroundColor White
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Open browser
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "[SUCCESS] Application is ready!" -ForegroundColor Green
Write-Host "Press any key to close this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

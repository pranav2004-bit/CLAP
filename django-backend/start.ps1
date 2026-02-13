# Quick Start - Django Backend
# Simple script to start Django server

Write-Host "Starting Django Backend..." -ForegroundColor Cyan
Write-Host ""

# Activate venv and run server
& .\venv\Scripts\Activate.ps1
python manage.py runserver

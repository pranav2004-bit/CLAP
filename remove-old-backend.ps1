# Safe Backend Removal Script
# Removes Next.js API routes and makes Django the sole backend

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Safe Backend Migration - Removal" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if backup exists
Write-Host "[Step 1] Verifying backup branch exists..." -ForegroundColor Yellow
$backupExists = git branch --list backup-nextjs-api-routes
if ($backupExists) {
    Write-Host "[OK] Backup branch 'backup-nextjs-api-routes' found" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Backup branch not found! Run backup first." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Confirm with user
Write-Host "This script will remove the following:" -ForegroundColor Yellow
Write-Host "  - app/api/admin/" -ForegroundColor Red
Write-Host "  - app/api/student/" -ForegroundColor Red
Write-Host "  - app/api/evaluate/" -ForegroundColor Red
Write-Host "  - app/api/attempts/" -ForegroundColor Red
Write-Host "  - app/api/tests/" -ForegroundColor Red
Write-Host ""
Write-Host "This script will KEEP:" -ForegroundColor Yellow
Write-Host "  - app/api/auth/ (NextAuth)" -ForegroundColor Green
Write-Host "  - django-backend/ (New backend)" -ForegroundColor Green
Write-Host "  - All frontend files" -ForegroundColor Green
Write-Host ""

$confirmation = Read-Host "Are you sure you want to continue? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "[CANCELLED] Operation cancelled by user" -ForegroundColor Yellow
    exit 0
}
Write-Host ""

# Track what was removed
$removedItems = @()
$errors = @()

# Function to safely remove directory
function Remove-SafeDirectory {
    param($Path, $Description)
    
    Write-Host "[Removing] $Description..." -ForegroundColor Yellow
    
    if (Test-Path $Path) {
        try {
            Remove-Item -Recurse -Force $Path -ErrorAction Stop
            Write-Host "[OK] Removed: $Path" -ForegroundColor Green
            $script:removedItems += $Path
        } catch {
            Write-Host "[ERROR] Failed to remove: $Path" -ForegroundColor Red
            Write-Host "  Error: $_" -ForegroundColor Red
            $script:errors += @{Path = $Path; Error = $_}
        }
    } else {
        Write-Host "[SKIP] Not found: $Path" -ForegroundColor Gray
    }
}

Write-Host "[Step 2] Removing Next.js API routes..." -ForegroundColor Cyan
Write-Host ""

# Remove Admin API Routes
Remove-SafeDirectory "app/api/admin/batches" "Admin Batches API"
Remove-SafeDirectory "app/api/admin/students" "Admin Students API"
Remove-SafeDirectory "app/api/admin/clap-tests" "Admin CLAP Tests API"
Remove-SafeDirectory "app/api/admin/tests" "Admin Tests API"

# Check if admin folder is empty
if (Test-Path "app/api/admin") {
    $adminContents = Get-ChildItem "app/api/admin"
    if ($adminContents.Count -eq 0) {
        Remove-SafeDirectory "app/api/admin" "Empty Admin folder"
    } else {
        Write-Host "[KEEP] app/api/admin/ has remaining files" -ForegroundColor Yellow
    }
}

# Remove Student Portal API Routes
Remove-SafeDirectory "app/api/student" "Student Portal API"

# Remove AI Evaluation API Routes
Remove-SafeDirectory "app/api/evaluate" "AI Evaluation API"

# Remove Test/Attempt API Routes
Remove-SafeDirectory "app/api/attempts" "Test Attempts API"
Remove-SafeDirectory "app/api/tests" "Tests API"

Write-Host ""
Write-Host "[Step 3] Cleanup complete" -ForegroundColor Cyan
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Removal Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Removed Items: $($removedItems.Count)" -ForegroundColor Green
foreach ($item in $removedItems) {
    Write-Host "  - $item" -ForegroundColor Green
}
Write-Host ""

if ($errors.Count -gt 0) {
    Write-Host "Errors: $($errors.Count)" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $($error.Path): $($error.Error)" -ForegroundColor Red
    }
    Write-Host ""
}

# Verify what remains
Write-Host "[Step 4] Verifying remaining structure..." -ForegroundColor Cyan
Write-Host ""

if (Test-Path "app/api") {
    Write-Host "Remaining in app/api/:" -ForegroundColor Yellow
    Get-ChildItem "app/api" -Directory | ForEach-Object {
        Write-Host "  - $($_.Name)" -ForegroundColor $(if ($_.Name -eq "auth") { "Green" } else { "Yellow" })
    }
} else {
    Write-Host "[WARNING] app/api/ directory not found" -ForegroundColor Yellow
}
Write-Host ""

# Next steps
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Next Steps" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Verify frontend still works:" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "2. Check for TypeScript errors:" -ForegroundColor Yellow
Write-Host "   npm run build" -ForegroundColor White
Write-Host ""
Write-Host "3. Test Django backend:" -ForegroundColor Yellow
Write-Host "   cd django-backend" -ForegroundColor White
Write-Host "   .\test-endpoints.ps1" -ForegroundColor White
Write-Host ""
Write-Host "4. If everything works, commit changes:" -ForegroundColor Yellow
Write-Host "   git add -A" -ForegroundColor White
Write-Host "   git commit -m 'Remove Next.js API routes - Django is now sole backend'" -ForegroundColor White
Write-Host ""
Write-Host "5. If issues occur, restore from backup:" -ForegroundColor Yellow
Write-Host "   git checkout backup-nextjs-api-routes" -ForegroundColor White
Write-Host ""

if ($errors.Count -eq 0) {
    Write-Host "[SUCCESS] Backend removal completed successfully!" -ForegroundColor Green
    Write-Host "Django is now your sole backend!" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Removal completed with errors. Review above." -ForegroundColor Yellow
}
Write-Host ""

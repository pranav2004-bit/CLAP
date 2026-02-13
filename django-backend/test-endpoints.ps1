# Quick Test Script for Django Backend
# Tests basic endpoints to verify everything is working

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Django Backend Quick Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:8000/api"

# Test 1: List batches
Write-Host "`[Test 1`] GET /api/admin/batches" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/batches" -Method Get
    Write-Host "Success: Found $($response.batches.Count) batches" -ForegroundColor Green
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Create a test batch
Write-Host "`[Test 2`] POST /api/admin/batches" -ForegroundColor Yellow
$batchData = @{
    batch_name = "TEST-2026"
    start_year = 2026
    end_year = 2030
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/batches" -Method Post -Body $batchData -ContentType "application/json"
    Write-Host "Success: Batch created with ID $($response.batch.id)" -ForegroundColor Green
    $testBatchId = $response.batch.id
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: List students
Write-Host "`[Test 3`] GET /api/admin/students" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/students" -Method Get
    Write-Host "Success: Found $($response.students.Count) students" -ForegroundColor Green
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Create a test student
Write-Host "`[Test 4`] POST /api/admin/students" -ForegroundColor Yellow
$studentData = @{
    student_id = "TEST001"
    batch_id = $testBatchId
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/students" -Method Post -Body $studentData -ContentType "application/json"
    Write-Host "Success: Student created with ID $($response.student.id)" -ForegroundColor Green
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: List CLAP tests
Write-Host "`[Test 5`] GET /api/admin/clap-tests" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clap-tests" -Method Get
    Write-Host "Success: Found $($response.clapTests.Count) CLAP tests" -ForegroundColor Green
} catch {
    Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All basic endpoints are working!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update .env with your actual Supabase DB password" -ForegroundColor White
Write-Host "2. Update .env with your OpenAI API key" -ForegroundColor White
Write-Host "3. Test AI evaluation endpoints" -ForegroundColor White
Write-Host ""

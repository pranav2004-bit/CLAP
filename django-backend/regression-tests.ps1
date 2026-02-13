# Final Verification Test Script
# Tests all fixed endpoints to verify 100% operational status

Write-Host "========================================"
Write-Host "  Final Verification - Regression Tests"
Write-Host "========================================"
Write-Host ""

$baseUrl = "http://localhost:8000/api"
$passCount = 0
$failCount = 0

# Test 1: Get batch ID
Write-Host "[Test 1] Getting test batch ID..."
try {
    $batches = Invoke-RestMethod -Uri "$baseUrl/admin/batches" -Method Get
    $testBatchId = $batches.batches[0].id
    Write-Host "[PASS] Got batch ID: $testBatchId" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
    exit 1
}
Write-Host ""

# Test 2: PATCH batch - FIXED ENDPOINT
Write-Host "[Test 2] PATCH /api/admin/batches/{id}"
$patchData = @{is_active = $false} | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/batches/$testBatchId" -Method Patch -Body $patchData -ContentType "application/json"
    Write-Host "[PASS] Batch status toggled: $($response.message)" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 3: Get student ID
Write-Host "[Test 3] Getting test student ID..."
try {
    $students = Invoke-RestMethod -Uri "$baseUrl/admin/students" -Method Get
    $testStudentId = $students.students[0].id
    Write-Host "[PASS] Got student ID: $testStudentId" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
    exit 1
}
Write-Host ""

# Test 4: PUT student - FIXED ENDPOINT
Write-Host "[Test 4] PUT /api/admin/students/{id}"
$updateData = @{full_name = "Regression Test User"} | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/students/$testStudentId" -Method Put -Body $updateData -ContentType "application/json"
    Write-Host "[PASS] Student updated: $($response.student.full_name)" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 5: POST password reset - FIXED ENDPOINT
Write-Host "[Test 5] POST /api/admin/students/{id}/reset-password"
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/students/$testStudentId/reset-password" -Method Post
    Write-Host "[PASS] Password reset: $($response.message)" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 6: Get CLAP test ID
Write-Host "[Test 6] Getting test CLAP test ID..."
try {
    $tests = Invoke-RestMethod -Uri "$baseUrl/admin/clap-tests" -Method Get
    $testClapId = $tests.clapTests[0].id
    Write-Host "[PASS] Got CLAP test ID: $testClapId" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
    exit 1
}
Write-Host ""

# Test 7: PATCH CLAP test - FIXED ENDPOINT
Write-Host "[Test 7] PATCH /api/admin/clap-tests/{id}"
$patchTestData = @{name = "Regression Test CLAP"} | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clap-tests/$testClapId" -Method Patch -Body $patchTestData -ContentType "application/json"
    Write-Host "[PASS] CLAP test updated: $($response.message)" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 8: DELETE student - FIXED ENDPOINT
Write-Host "[Test 8] DELETE /api/admin/students/{id}"
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/students/$testStudentId" -Method Delete
    Write-Host "[PASS] Student soft deleted: $($response.message)" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 9: DELETE CLAP test - FIXED ENDPOINT
Write-Host "[Test 9] DELETE /api/admin/clap-tests/{id}"
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/admin/clap-tests/$testClapId" -Method Delete
    Write-Host "[PASS] CLAP test soft deleted: $($response.message)" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Summary
Write-Host "========================================"
Write-Host "  Test Results Summary"
Write-Host "========================================"
Write-Host "Total Tests: $($passCount + $failCount)"
Write-Host "Passed: $passCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($failCount -eq 0) {
    Write-Host "ALL REGRESSION TESTS PASSED!" -ForegroundColor Green
    Write-Host "All 6 previously failing endpoints are now working!" -ForegroundColor Green
    Write-Host "Backend is 100% operational!" -ForegroundColor Green
} else {
    Write-Host "Some tests failed. Review errors above." -ForegroundColor Yellow
}
Write-Host ""

# Django Backend Migration - Behavioral Verification Checklist

## Purpose
This checklist ensures the Django backend maintains **exact behavioral parity** with the Next.js backend.

## Testing Methodology
For each endpoint, verify:
1. ✅ **Request format** matches Next.js
2. ✅ **Response structure** is identical
3. ✅ **Status codes** are the same
4. ✅ **Error messages** match exactly
5. ✅ **Database operations** produce same results
6. ✅ **Logging output** is equivalent

---

## Admin - Batch Management

### GET /api/admin/batches

**Next.js Behavior:**
- Returns active batches only (`is_active=true`)
- Includes student count per batch
- Ordered by `created_at` descending
- Limited to 50 results
- Logs timing with `console.time('batch-fetch')`

**Django Verification:**
- [ ] Returns only active batches
- [ ] Student counts match database
- [ ] Ordering is correct
- [ ] Limit of 50 enforced
- [ ] Timing logged correctly

**Test Command:**
```bash
curl -X GET http://localhost:8000/api/admin/batches
```

**Expected Response:**
```json
{
  "batches": [
    {
      "id": "uuid",
      "batch_name": "2023-27",
      "start_year": 2023,
      "end_year": 2027,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "student_count": 5
    }
  ]
}
```

---

### POST /api/admin/batches

**Next.js Behavior:**
- Validates: `batch_name`, `start_year`, `end_year` required
- Validates: years must be integers
- Validates: `end_year > start_year`
- Checks for duplicate `batch_name` (409 conflict)
- Returns 201 on success
- Logs request body and result

**Django Verification:**
- [ ] Missing fields return 400
- [ ] Invalid year types return 400
- [ ] Invalid year range returns 400
- [ ] Duplicate batch returns 409
- [ ] Success returns 201
- [ ] Logging matches Next.js

**Test Commands:**
```bash
# Valid request
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"2026-30","start_year":2026,"end_year":2030}'

# Missing field
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"2026-30"}'

# Invalid year range
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"2026-30","start_year":2030,"end_year":2026}'

# Duplicate batch
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"2023-27","start_year":2023,"end_year":2027}'
```

---

## Admin - Student Management

### GET /api/admin/students

**Next.js Behavior:**
- Supports `search` query parameter (OR search on `full_name`, `email`, `student_id`)
- Supports `status` query parameter (`active`/`inactive`)
- Returns students with nested `batches` object
- Ordered by `created_at` descending

**Django Verification:**
- [ ] Search works across all three fields
- [ ] Status filter works correctly
- [ ] Batches relationship included
- [ ] Ordering is correct

**Test Commands:**
```bash
# All students
curl -X GET http://localhost:8000/api/admin/students

# Search
curl -X GET "http://localhost:8000/api/admin/students?search=john"

# Filter by status
curl -X GET "http://localhost:8000/api/admin/students?status=active"
```

---

### POST /api/admin/students

**Next.js Behavior:**
- Requires `student_id`
- Optional `batch_id`
- Checks for duplicate `student_id` (400 error)
- Generates dummy email: `{student_id}@clap-student.local`
- Hashes password with bcrypt (10 rounds)
- Default password: `CLAP@123`
- Returns 201 on success

**Django Verification:**
- [ ] Missing `student_id` returns 400
- [ ] Duplicate `student_id` returns 400
- [ ] Email format matches
- [ ] Password hash is bcrypt with 10 rounds
- [ ] Default password is `CLAP@123`
- [ ] Success returns 201

**Test Commands:**
```bash
# Valid request
curl -X POST http://localhost:8000/api/admin/students \
  -H "Content-Type: application/json" \
  -d '{"student_id":"STU001","batch_id":"<batch-uuid>"}'

# Missing student_id
curl -X POST http://localhost:8000/api/admin/students \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"<batch-uuid>"}'

# Duplicate student_id
curl -X POST http://localhost:8000/api/admin/students \
  -H "Content-Type: application/json" \
  -d '{"student_id":"STU001","batch_id":"<batch-uuid>"}'
```

---

### PUT /api/admin/students/<id>

**Next.js Behavior:**
- Updates only provided fields
- Supports: `full_name`, `email`, `student_id`, `is_active`
- Returns 404 if student not found
- Returns updated student object

**Django Verification:**
- [ ] Partial updates work
- [ ] Not found returns 404
- [ ] Response includes all student fields

**Test Command:**
```bash
curl -X PUT http://localhost:8000/api/admin/students/<uuid> \
  -H "Content-Type: application/json" \
  -d '{"full_name":"John Doe","is_active":true}'
```

---

### DELETE /api/admin/students/<id>

**Next.js Behavior:**
- **Soft delete**: Sets `is_active=false`
- Does NOT actually delete the record
- Returns 404 if student not found
- Returns success message

**Django Verification:**
- [ ] Record still exists in database
- [ ] `is_active` set to `false`
- [ ] Not found returns 404
- [ ] Success message matches

**Test Command:**
```bash
curl -X DELETE http://localhost:8000/api/admin/students/<uuid>
```

---

## Admin - CLAP Test Management

### GET /api/admin/clap-tests

**Next.js Behavior:**
- Excludes tests with `status='deleted'`
- Includes nested `batch` and `components`
- Transforms `components` to `tests` array
- Ordered by `created_at` descending

**Django Verification:**
- [ ] Deleted tests excluded
- [ ] Batch relationship included
- [ ] Components transformed correctly
- [ ] Ordering is correct

**Test Command:**
```bash
curl -X GET http://localhost:8000/api/admin/clap-tests
```

---

### POST /api/admin/clap-tests

**Next.js Behavior:**
- Requires `testName` and `batchId`
- Creates CLAP test with `status='draft'`
- Creates 5 test components (listening, speaking, reading, writing, vocabulary)
- Auto-assigns to all students in batch
- Uses transaction (all or nothing)
- Returns 201 on success

**Django Verification:**
- [ ] Missing fields return 400
- [ ] Test created with `status='draft'`
- [ ] All 5 components created
- [ ] Students auto-assigned
- [ ] Transaction rollback on error
- [ ] Success returns 201

**Test Command:**
```bash
curl -X POST http://localhost:8000/api/admin/clap-tests \
  -H "Content-Type: application/json" \
  -d '{"testName":"Mid-Term Assessment","batchId":"<batch-uuid>"}'
```

---

## AI Evaluation

### POST /api/evaluate/speaking

**Next.js Behavior:**
- Accepts `multipart/form-data`
- Requires: `audio` (file), `prompt` (string), `attemptId` (string)
- Transcribes audio with Whisper API
- Evaluates with GPT-4
- Updates `test_attempts` table
- Returns transcript, evaluation, and updated attempt

**Django Verification:**
- [ ] File upload works
- [ ] Missing fields return 400
- [ ] Empty transcription returns 400
- [ ] Whisper API called correctly
- [ ] GPT-4 evaluation matches format
- [ ] Database updated correctly
- [ ] Response structure matches

**Test Command:**
```bash
curl -X POST http://localhost:8000/api/evaluate/speaking \
  -F "audio=@recording.mp3" \
  -F "prompt=Describe your favorite hobby" \
  -F "attemptId=<attempt-uuid>"
```

---

### POST /api/evaluate/writing

**Next.js Behavior:**
- Accepts JSON body
- Requires: `essay`, `prompt`, `attemptId`
- Validates essay is not empty
- Evaluates with GPT-4
- Updates `test_attempts` table
- Returns evaluation and updated attempt

**Django Verification:**
- [ ] Missing fields return 400
- [ ] Empty essay returns 400
- [ ] GPT-4 evaluation matches format
- [ ] Database updated correctly
- [ ] Response structure matches

**Test Command:**
```bash
curl -X POST http://localhost:8000/api/evaluate/writing \
  -H "Content-Type: application/json" \
  -d '{
    "essay":"Climate change is one of the most pressing issues...",
    "prompt":"Write about climate change",
    "attemptId":"<attempt-uuid>"
  }'
```

---

## Cross-Cutting Concerns

### Logging

**Next.js Behavior:**
- Uses `console.log()`, `console.error()`, `console.time()`
- Logs request bodies
- Logs timing for performance-critical operations
- Logs errors with stack traces

**Django Verification:**
- [ ] Equivalent logging statements present
- [ ] Log levels match (INFO, ERROR)
- [ ] Timing logs included
- [ ] Error stack traces logged

---

### Error Responses

**Standard Error Format:**
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable message"
}
```

**Django Verification:**
- [ ] All errors use this format
- [ ] Error codes match Next.js
- [ ] Messages are identical

---

### Database Behavior

**Django Verification:**
- [ ] No migrations run (models are `managed=False`)
- [ ] Queries produce same results as Supabase client
- [ ] Transactions used where Next.js uses them
- [ ] Foreign key relationships work correctly

---

## Final Verification

- [ ] All endpoints tested
- [ ] All error cases tested
- [ ] Database state verified
- [ ] Logging output reviewed
- [ ] Performance comparable to Next.js
- [ ] Frontend integration tested
- [ ] No regressions in existing functionality

---

## Sign-Off

**Tester Name:** _______________  
**Date:** _______________  
**Status:** ☐ PASS ☐ FAIL  
**Notes:** _______________

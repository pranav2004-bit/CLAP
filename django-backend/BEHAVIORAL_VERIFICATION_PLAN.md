# Complete Behavioral Parity Verification Plan
## Next.js Backend → Django Migration

**Generated**: 2026-02-10  
**Purpose**: Ensure exact behavioral equivalence between Next.js and Django backends  
**Methodology**: Code-based analysis of all API routes

---

## ENDPOINT INVENTORY

Total Endpoints Analyzed: **23 routes**

### Implemented in Django (11 endpoints)
- ✅ GET /api/admin/batches
- ✅ POST /api/admin/batches
- ✅ GET /api/admin/students
- ✅ POST /api/admin/students
- ✅ GET /api/admin/students/[id]
- ✅ PUT /api/admin/students/[id]
- ✅ DELETE /api/admin/students/[id]
- ✅ GET /api/admin/clap-tests
- ✅ POST /api/admin/clap-tests
- ✅ POST /api/evaluate/speaking
- ✅ POST /api/evaluate/writing

### NOT Implemented in Django (12 endpoints)
- ❌ PATCH /api/admin/batches/[id]
- ❌ DELETE /api/admin/batches/[id]
- ❌ GET /api/admin/batches/[id]/students
- ❌ POST /api/admin/students/[id]/reset-password
- ❌ GET /api/admin/clap-tests/[id]
- ❌ PATCH /api/admin/clap-tests/[id]
- ❌ DELETE /api/admin/clap-tests/[id]
- ❌ POST /api/admin/clap-tests/[id]/assign
- ❌ POST /api/admin/clap-tests/[id]/unassign
- ❌ POST /api/student/change-password
- ❌ GET /api/student/profile
- ❌ PUT /api/student/profile
- ❌ All /api/attempts/* endpoints (7 routes)
- ❌ All /api/tests/* endpoints (4 routes)
- ❌ All /api/admin/tests/* endpoints (4 routes)

---

## VERIFICATION CHECKLIST BY ENDPOINT

---

## 1. GET /api/admin/batches

### Source File
`app/api/admin/batches/route.ts` (lines 1-60)

### Success Scenarios
- [ ] **S1.1**: Returns all batches where `is_active=true`
- [ ] **S1.2**: Batches ordered by `created_at DESC`
- [ ] **S1.3**: Limited to 50 results max
- [ ] **S1.4**: Each batch includes `student_count` (aggregated separately)
- [ ] **S1.5**: Returns 200 status code
- [ ] **S1.6**: Response shape: `{ batches: Array<Batch> }`

### Response Fields (Per Batch)
```json
{
  "id": "uuid",
  "batch_name": "string",
  "start_year": "integer",
  "end_year": "integer",
  "is_active": "boolean",
  "created_at": "ISO8601 timestamp",
  "student_count": "integer (calculated)"
}
```

### Database Operations
- [ ] **DB1.1**: SELECT from `batches` WHERE `is_active=true`
- [ ] **DB1.2**: SELECT COUNT from `users` WHERE `role='student'` GROUP BY `batch_id`
- [ ] **DB1.3**: No writes performed

### Performance Behaviors
- [ ] **P1.1**: Logs `console.time('batch-fetch')` at start
- [ ] **P1.2**: Logs `console.timeEnd('batch-fetch')` at completion
- [ ] **P1.3**: Logs elapsed time in seconds

### Error Scenarios
- [ ] **E1.1**: Database error → 500 status, `{ error: 'Failed to fetch batches' }`
- [ ] **E1.2**: Server error → 500 status, `{ error: 'Internal server error' }`

### Edge Cases
- [ ] **EC1.1**: Zero batches → Returns `{ batches: [] }`
- [ ] **EC1.2**: Batch with zero students → `student_count: 0`
- [ ] **EC1.3**: More than 50 batches → Only first 50 returned

### Hidden Behaviors
- ✓ **Uses service role client** (`createClient()` from `lib/supabase/server.ts`)
- ✓ **Student count optimization**: Separate query to avoid N+1
- ✓ **Explicit field selection**: Only fetches needed columns

---

## 2. POST /api/admin/batches

### Source File
`app/api/admin/batches/route.ts` (lines 62-120)

### Success Scenarios
- [ ] **S2.1**: Creates batch with valid data
- [ ] **S2.2**: Returns 201 status code
- [ ] **S2.3**: Returns created batch object
- [ ] **S2.4**: Sets `is_active=true` by default
- [ ] **S2.5**: Auto-generates `id` (UUID)
- [ ] **S2.6**: Auto-sets `created_at` and `updated_at` timestamps

### Request Body (Required)
```json
{
  "batch_name": "string (required)",
  "start_year": "integer (required)",
  "end_year": "integer (required)"
}
```

### Response Shape
```json
{
  "batch": {
    "id": "uuid",
    "batch_name": "string",
    "start_year": "integer",
    "end_year": "integer",
    "is_active": true,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

### Validation Failure Scenarios
- [ ] **V2.1**: Missing `batch_name` → 400, `{ error: 'Batch name, start year, and end year are required' }`
- [ ] **V2.2**: Missing `start_year` → 400, same error
- [ ] **V2.3**: Missing `end_year` → 400, same error
- [ ] **V2.4**: `start_year` not a number → 400, `{ error: 'Start year and end year must be valid numbers' }`
- [ ] **V2.5**: `end_year` not a number → 400, same error
- [ ] **V2.6**: `start_year >= end_year` → 400, `{ error: 'End year must be greater than start year' }`
- [ ] **V2.7**: Duplicate `batch_name` → 409, `{ error: 'Batch {name} already exists' }`

### Database Operations
- [ ] **DB2.1**: SELECT to check duplicate `batch_name`
- [ ] **DB2.2**: INSERT into `batches` table
- [ ] **DB2.3**: Returns inserted row with all fields

### Logging Behaviors
- [ ] **L2.1**: Logs `'POST /api/admin/batches called'`
- [ ] **L2.2**: Logs request body
- [ ] **L2.3**: Logs `'Missing required fields'` if validation fails
- [ ] **L2.4**: Logs `'Batch already exists: {name}'` if duplicate
- [ ] **L2.5**: Logs `'Batch created successfully: {data}'` on success
- [ ] **L2.6**: Logs timing with `console.time/timeEnd('batch-create')`

### Error Scenarios
- [ ] **E2.1**: Database error → 500, `{ error: error.message || 'Internal server error' }`

### Edge Cases
- [ ] **EC2.1**: `batch_name` with special characters → Should be allowed
- [ ] **EC2.2**: Very large year values → Should be allowed (no max validation)
- [ ] **EC2.3**: `start_year=2023, end_year=2024` → Valid (difference of 1)

---

## 3. GET /api/admin/students

### Source File
`app/api/admin/students/route.ts` (lines 1-60)

### Success Scenarios
- [ ] **S3.1**: Returns all students with `role='student'`
- [ ] **S3.2**: Includes nested `batches` object with batch details
- [ ] **S3.3**: Ordered by `created_at DESC`
- [ ] **S3.4**: Returns 200 status code

### Query Parameters
- `search` (optional): Filters by `full_name`, `email`, OR `student_id` (case-insensitive)
- `status` (optional): Filters by `is_active` (`'active'` → true, other → false)

### Response Shape
```json
{
  "students": [
    {
      "id": "uuid",
      "email": "string",
      "role": "student",
      "full_name": "string | null",
      "username": "string | null",
      "student_id": "string | null",
      "is_active": "boolean",
      "profile_completed": "boolean",
      "batch_id": "uuid | null",
      "created_at": "ISO8601",
      "batches": {
        "id": "uuid",
        "batch_name": "string"
      } | null
    }
  ]
}
```

### Search Behavior
- [ ] **SB3.1**: `?search=john` → Matches `full_name ILIKE '%john%'`
- [ ] **SB3.2**: `?search=john` → Matches `email ILIKE '%john%'`
- [ ] **SB3.3**: `?search=STU001` → Matches `student_id ILIKE '%STU001%'`
- [ ] **SB3.4**: Search is case-insensitive (ILIKE)
- [ ] **SB3.5**: Search uses OR logic (matches any field)

### Filter Behavior
- [ ] **FB3.1**: `?status=active` → Only `is_active=true`
- [ ] **FB3.2**: `?status=inactive` → Only `is_active=false`
- [ ] **FB3.3**: No status param → All students

### Database Operations
- [ ] **DB3.1**: SELECT from `users` WHERE `role='student'`
- [ ] **DB3.2**: JOIN with `batches` table
- [ ] **DB3.3**: Applies search filter if provided
- [ ] **DB3.4**: Applies status filter if provided

### Error Scenarios
- [ ] **E3.1**: Database error → 500, `{ error: 'Failed to fetch students' }`
- [ ] **E3.2**: Server error → 500, `{ error: 'Internal server error' }`

### Edge Cases
- [ ] **EC3.1**: Zero students → `{ students: [] }`
- [ ] **EC3.2**: Student with no batch → `batches: null`
- [ ] **EC3.3**: Search with no matches → `{ students: [] }`

---

## 4. POST /api/admin/students

### Source File
`app/api/admin/students/route.ts` (lines 62-120)

### Success Scenarios
- [ ] **S4.1**: Creates student with valid `student_id`
- [ ] **S4.2**: Returns 201 status code
- [ ] **S4.3**: Generates dummy email: `{student_id}@clap-student.local`
- [ ] **S4.4**: Hashes password with bcrypt (10 rounds)
- [ ] **S4.5**: Sets `role='student'`
- [ ] **S4.6**: Sets `is_active=true`
- [ ] **S4.7**: Sets `profile_completed=false`

### Request Body
```json
{
  "student_id": "string (required)",
  "batch_id": "uuid (optional)"
}
```

### Response Shape
```json
{
  "student": {
    "id": "uuid",
    "email": "{student_id}@clap-student.local",
    "student_id": "string",
    "role": "student",
    "is_active": true,
    "profile_completed": false,
    "batch_id": "uuid | null",
    "created_at": "ISO8601"
  }
}
```

### Default Values
- ✓ **Default password**: `'CLAP@123'` (hardcoded)
- ✓ **bcrypt rounds**: `10`
- ✓ **Email format**: `{student_id}@clap-student.local`
- ✓ **role**: `'student'`
- ✓ **is_active**: `true`
- ✓ **profile_completed**: `false`

### Validation Failure Scenarios
- [ ] **V4.1**: Missing `student_id` → 400, `{ error: 'Student ID is required' }`
- [ ] **V4.2**: Duplicate `student_id` → 400, `{ error: 'Student ID already exists' }`

### Database Operations
- [ ] **DB4.1**: SELECT to check duplicate `student_id`
- [ ] **DB4.2**: INSERT into `users` table
- [ ] **DB4.3**: Includes `batch_id` if provided

### Logging Behaviors
- [ ] **L4.1**: Logs `'Received student creation request: {body}'`
- [ ] **L4.2**: Logs `'Missing student_id'` if validation fails
- [ ] **L4.3**: Logs `'Student ID already exists: {id}'` if duplicate
- [ ] **L4.4**: Logs `'Inserting student data: {data}'`
- [ ] **L4.5**: Logs `'Student created successfully: {data}'` on success

### Error Scenarios
- [ ] **E4.1**: Database error → 500, `{ error: 'Failed to create student' }`
- [ ] **E4.2**: bcrypt error → 500, `{ error: 'Failed to create student' }`

### Edge Cases
- [ ] **EC4.1**: `student_id` with special characters → Should be allowed
- [ ] **EC4.2**: `batch_id` is null → Student created without batch
- [ ] **EC4.3**: Invalid `batch_id` (non-existent) → Database foreign key error

---

## 5. GET /api/admin/students/[id]

### Source File
`app/api/admin/students/[id]/route.ts` (lines 1-40)

### Success Scenarios
- [ ] **S5.1**: Returns student by `id` where `role='student'`
- [ ] **S5.2**: Returns 200 status code

### Response Shape
```json
{
  "student": {
    "id": "uuid",
    "email": "string",
    "role": "student",
    "full_name": "string | null",
    "username": "string | null",
    "student_id": "string | null",
    "is_active": "boolean",
    "profile_completed": "boolean",
    "batch_id": "uuid | null",
    "created_at": "ISO8601"
  }
}
```

### Database Operations
- [ ] **DB5.1**: SELECT from `users` WHERE `id={id}` AND `role='student'`

### Error Scenarios
- [ ] **E5.1**: Student not found → 404, `{ error: 'Student not found' }`
- [ ] **E5.2**: ID is not student (e.g., admin) → 404, `{ error: 'Student not found' }`
- [ ] **E5.3**: Database error → 500, `{ error: 'Failed to fetch student' }`

---

## 6. PUT /api/admin/students/[id]

### Source File
`app/api/admin/students/[id]/route.ts` (lines 42-90)

### Success Scenarios
- [ ] **S6.1**: Updates student with provided fields only (partial update)
- [ ] **S6.2**: Returns 200 status code
- [ ] **S6.3**: Returns updated student object

### Request Body (All Optional)
```json
{
  "full_name": "string (optional)",
  "email": "string (optional)",
  "student_id": "string (optional)",
  "is_active": "boolean (optional)"
}
```

### Update Behavior
- [ ] **UB6.1**: Only updates fields present in request body
- [ ] **UB6.2**: Omitted fields remain unchanged
- [ ] **UB6.3**: Empty request body → No changes made

### Database Operations
- [ ] **DB6.1**: UPDATE `users` WHERE `id={id}` AND `role='student'`
- [ ] **DB6.2**: SELECT updated row to return

### Error Scenarios
- [ ] **E6.1**: Student not found → 404, `{ error: 'Student not found' }`
- [ ] **E6.2**: Database error → 500, `{ error: 'Failed to update student' }`

### Edge Cases
- [ ] **EC6.1**: Update `email` to duplicate → Database unique constraint error
- [ ] **EC6.2**: Update `student_id` to duplicate → Database unique constraint error

---

## 7. DELETE /api/admin/students/[id]

### Source File
`app/api/admin/students/[id]/route.ts` (lines 92-110)

### Success Scenarios
- [ ] **S7.1**: **SOFT DELETE**: Sets `is_active=false` (NOT hard delete)
- [ ] **S7.2**: Returns 200 status code
- [ ] **S7.3**: Returns success message

### Response Shape
```json
{
  "message": "Student account deleted successfully"
}
```

### Database Operations
- [ ] **DB7.1**: UPDATE `users` SET `is_active=false` WHERE `id={id}` AND `role='student'`
- [ ] **DB7.2**: **Record is NOT deleted from database**

### Error Scenarios
- [ ] **E7.1**: Student not found → 404, `{ error: 'Student not found' }`
- [ ] **E7.2**: Database error → 500, `{ error: 'Failed to delete student' }`

### Critical Behavior
- ✓ **SOFT DELETE ONLY**: Record remains in database with `is_active=false`
- ✓ **Preserves data**: All student data, attempts, assignments preserved

---

## 8. GET /api/admin/clap-tests

### Source File
`app/api/admin/clap-tests/route.ts` (lines 1-80)

### Success Scenarios
- [ ] **S8.1**: Returns CLAP tests where `status != 'deleted'`
- [ ] **S8.2**: Includes nested `batch` and `components`
- [ ] **S8.3**: Ordered by `created_at DESC`
- [ ] **S8.4**: Transforms `components` to `tests` array

### Response Shape
```json
{
  "clapTests": [
    {
      "id": "uuid",
      "name": "string",
      "batch_id": "uuid | null",
      "batch_name": "string",
      "status": "draft | published | archived",
      "is_assigned": "boolean",
      "created_at": "ISO8601",
      "tests": [
        {
          "id": "listening | speaking | reading | writing | vocabulary",
          "name": "string",
          "type": "listening | speaking | reading | writing | vocabulary",
          "status": "pending | active | completed"
        }
      ]
    }
  ]
}
```

### Data Transformation
- [ ] **DT8.1**: `components` array → `tests` array
- [ ] **DT8.2**: `batch.batch_name` → `batch_name` (flattened)
- [ ] **DT8.3**: `batch_id != null` → `is_assigned: true`
- [ ] **DT8.4**: `batch_id == null` → `is_assigned: false`
- [ ] **DT8.5**: Missing batch → `batch_name: 'Unknown Batch'`

### Database Operations
- [ ] **DB8.1**: SELECT from `clap_tests` WHERE `status != 'deleted'`
- [ ] **DB8.2**: JOIN with `batches` table
- [ ] **DB8.3**: JOIN with `clap_test_components` table

### Error Scenarios
- [ ] **E8.1**: Database error → 500, `{ error: 'Internal server error' }`

---

## 9. POST /api/admin/clap-tests

### Source File
`app/api/admin/clap-tests/route.ts` (lines 82-150)

### Success Scenarios
- [ ] **S9.1**: Creates CLAP test with 5 components
- [ ] **S9.2**: Auto-assigns to all students in batch
- [ ] **S9.3**: Returns 201 status code (implied)
- [ ] **S9.4**: Uses transaction (atomic operation)

### Request Body
```json
{
  "testName": "string (required)",
  "batchId": "uuid (required)"
}
```

### Response Shape
```json
{
  "message": "CLAP test created successfully",
  "clapTest": {
    "id": "uuid",
    "name": "string",
    "batch_id": "uuid",
    "batch_name": "string",
    "status": "draft",
    "created_at": "ISO8601",
    "tests": [
      { "id": "listening", "name": "Listening Test", "type": "listening", "status": "pending" },
      { "id": "speaking", "name": "Speaking Test", "type": "speaking", "status": "pending" },
      { "id": "reading", "name": "Reading Test", "type": "reading", "status": "pending" },
      { "id": "writing", "name": "Writing Test", "type": "writing", "status": "pending" },
      { "id": "vocabulary", "name": "Vocabulary & Grammar Test", "type": "vocabulary", "status": "pending" }
    ]
  }
}
```

### Default Component Structure
```javascript
[
  { test_type: 'listening', title: 'Listening Test', description: 'Audio comprehension test' },
  { test_type: 'speaking', title: 'Speaking Test', description: 'Oral communication assessment' },
  { test_type: 'reading', title: 'Reading Test', description: 'Reading comprehension assessment' },
  { test_type: 'writing', title: 'Writing Test', description: 'Written expression assessment' },
  { test_type: 'vocabulary', title: 'Vocabulary & Grammar Test', description: 'Language fundamentals assessment' }
]
```

### Database Operations (Atomic Transaction)
- [ ] **DB9.1**: INSERT into `clap_tests` with `status='draft'`
- [ ] **DB9.2**: BULK INSERT 5 rows into `clap_test_components`
- [ ] **DB9.3**: SELECT students WHERE `batch_id={batchId}` AND `role='student'`
- [ ] **DB9.4**: BULK INSERT into `student_clap_assignments` (one per student)
- [ ] **DB9.5**: All operations in single transaction (rollback on any failure)

### Validation Failure Scenarios
- [ ] **V9.1**: Missing `testName` → 400, `{ error: 'Test name and batch are required' }`
- [ ] **V9.2**: Missing `batchId` → 400, same error

### Error Scenarios
- [ ] **E9.1**: Database error → 500, `{ error: 'Internal server error' }`
- [ ] **E9.2**: Transaction rollback → All changes reverted

### Edge Cases
- [ ] **EC9.1**: Batch with zero students → Test created, no assignments
- [ ] **EC9.2**: Invalid `batchId` → Database foreign key error

### Hidden Behaviors
- ✓ **Always creates exactly 5 components** (hardcoded)
- ✓ **Component order is fixed**
- ✓ **All components start with `status='pending'`**
- ✓ **Auto-assignment is automatic** (no opt-out)

---

## 10. POST /api/evaluate/speaking

### Source File
`app/api/evaluate/speaking/route.ts` (lines 1-100)

### Success Scenarios
- [ ] **S10.1**: Transcribes audio with Whisper API
- [ ] **S10.2**: Evaluates transcript with GPT-4
- [ ] **S10.3**: Updates `test_attempts` table
- [ ] **S10.4**: Returns 200 status code

### Request Format
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `audio`: File (required)
  - `prompt`: String (required)
  - `attemptId`: UUID (required)

### Response Shape
```json
{
  "success": true,
  "transcript": "string",
  "evaluation": {
    "breakdown": {
      "fluency": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" },
      "pronunciation": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" },
      "vocabulary": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" },
      "grammar": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" }
    },
    "feedback": "string",
    "score": 0-10,
    "maxScore": 10
  },
  "updatedAttempt": {
    "id": "uuid",
    "score": 0-10,
    "max_score": 10,
    "status": "completed",
    "completed_at": "ISO8601"
  }
}
```

### OpenAI Integration
- [ ] **OAI10.1**: Calls Whisper API with audio file
- [ ] **OAI10.2**: Model: `whisper-1`
- [ ] **OAI10.3**: Response format: `text`
- [ ] **OAI10.4**: Calls GPT-4 with system + user prompts
- [ ] **OAI10.5**: Model: `gpt-4-turbo`
- [ ] **OAI10.6**: Temperature: `0.3`
- [ ] **OAI10.7**: Response format: `json_object`
- [ ] **OAI10.8**: Retry logic: 3 attempts, 1s delay

### Database Operations
- [ ] **DB10.1**: SELECT `test_attempts` WHERE `id={attemptId}`
- [ ] **DB10.2**: UPDATE `test_attempts` SET:
  - `answers.ai_evaluation = { transcript, ...evaluation }`
  - `score = evaluation.score`
  - `max_score = 10`
  - `status = 'completed'`
  - `completed_at = NOW()`

### Validation Failure Scenarios
- [ ] **V10.1**: Missing `audio` → 400, `{ error: 'Missing required fields: audio, prompt, or attemptId' }`
- [ ] **V10.2**: Missing `prompt` → 400, same error
- [ ] **V10.3**: Missing `attemptId` → 400, same error
- [ ] **V10.4**: Empty transcript → 400, `{ error: 'Failed to transcribe audio or empty transcription' }`

### Error Scenarios
- [ ] **E10.1**: Whisper API error → 500, `{ error: 'Failed to evaluate speaking test' }`
- [ ] **E10.2**: GPT-4 API error → 500, same error
- [ ] **E10.3**: Attempt not found → 500, `{ error: 'Failed to save evaluation results' }`
- [ ] **E10.4**: Database error → 500, same error

### Score Calculation
- [ ] **SC10.1**: Total score = sum of 4 criteria scores
- [ ] **SC10.2**: Max score = 10 (4 × 2.5)
- [ ] **SC10.3**: Scores are floats (not integers)

---

## 11. POST /api/evaluate/writing

### Source File
`app/api/evaluate/writing/route.ts` (lines 1-100)

### Success Scenarios
- [ ] **S11.1**: Evaluates essay with GPT-4
- [ ] **S11.2**: Updates `test_attempts` table
- [ ] **S11.3**: Returns 200 status code

### Request Format
- **Content-Type**: `application/json`
```json
{
  "essay": "string (required)",
  "prompt": "string (required)",
  "attemptId": "uuid (required)"
}
```

### Response Shape
```json
{
  "success": true,
  "evaluation": {
    "breakdown": {
      "taskAchievement": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" },
      "coherence": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" },
      "vocabulary": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" },
      "grammar": { "score": 0-2.5, "maxScore": 2.5, "feedback": "string" }
    },
    "feedback": "string",
    "score": 0-10,
    "maxScore": 10
  },
  "updatedAttempt": {
    "id": "uuid",
    "score": 0-10,
    "max_score": 10,
    "status": "completed",
    "completed_at": "ISO8601"
  }
}
```

### OpenAI Integration
- [ ] **OAI11.1**: Calls GPT-4 with system + user prompts
- [ ] **OAI11.2**: Model: `gpt-4-turbo`
- [ ] **OAI11.3**: Temperature: `0.3`
- [ ] **OAI11.4**: Response format: `json_object`
- [ ] **OAI11.5**: Retry logic: 3 attempts, 1s delay

### Database Operations
- [ ] **DB11.1**: SELECT `test_attempts` WHERE `id={attemptId}`
- [ ] **DB11.2**: UPDATE `test_attempts` SET:
  - `answers.ai_evaluation = { essay, ...evaluation }`
  - `score = evaluation.score`
  - `max_score = 10`
  - `status = 'completed'`
  - `completed_at = NOW()`

### Validation Failure Scenarios
- [ ] **V11.1**: Missing `essay` → 400, `{ error: 'Missing required fields: essay, prompt, or attemptId' }`
- [ ] **V11.2**: Missing `prompt` → 400, same error
- [ ] **V11.3**: Missing `attemptId` → 400, same error
- [ ] **V11.4**: Empty essay (whitespace only) → 400, `{ error: 'Essay content cannot be empty' }`

### Error Scenarios
- [ ] **E11.1**: GPT-4 API error → 500, `{ error: 'Failed to evaluate writing test' }`
- [ ] **E11.2**: Attempt not found → 500, `{ error: 'Failed to save evaluation results' }`
- [ ] **E11.3**: Database error → 500, same error

---

## MISSING ENDPOINTS (Not Implemented in Django)

---

## 12. PATCH /api/admin/batches/[id]

### Source File
`app/api/admin/batches/[id]/route.ts` (lines 5-55)

### Purpose
Soft delete or restore batch by toggling `is_active`

### Request Body
```json
{
  "is_active": "boolean (required)"
}
```

### Response Shape
```json
{
  "message": "Batch {deleted|restored} successfully",
  "batch": { /* full batch object */ }
}
```

### Validation
- [ ] `is_active` must be boolean → 400 if not

### Database Operations
- [ ] UPDATE `batches` SET `is_active={value}` WHERE `id={id}`

### Error Cases
- [ ] Batch not found → 400 (database error)
- [ ] Database error → 400

---

## 13. DELETE /api/admin/batches/[id]

### Source File
`app/api/admin/batches/[id]/route.ts` (lines 58-110)

### Purpose
**Hard delete** batch (actual deletion)

### Pre-Delete Check
- [ ] **CRITICAL**: Checks if batch has students
- [ ] If students exist → 400, `{ error: 'Cannot delete batch with existing students. Please reassign or delete students first.' }`

### Database Operations
- [ ] SELECT COUNT from `users` WHERE `batch_id={id}` LIMIT 1
- [ ] If count > 0 → Abort with error
- [ ] DELETE from `batches` WHERE `id={id}`

### Error Cases
- [ ] Batch has students → 400 (prevents deletion)
- [ ] Database error → 400

---

## 14. GET /api/admin/batches/[id]/students

### Source File
`app/api/admin/batches/[id]/students/route.ts`

### Purpose
Get all students in a specific batch

### Query Parameters
- `search` (optional): Filter by `student_id` (ILIKE)

### Response Shape
```json
{
  "students": [
    {
      /* full student object with nested batches */
    }
  ]
}
```

### Database Operations
- [ ] SELECT from `users` WHERE `role='student'` AND `batch_id={id}`
- [ ] JOIN with `batches` table
- [ ] Apply search filter if provided
- [ ] ORDER BY `created_at DESC`

---

## 15. POST /api/admin/students/[id]/reset-password

### Source File
`app/api/admin/students/[id]/reset-password/route.ts`

### Purpose
Reset student password to default (`CLAP@123`)

### Request Body
None (POST with no body)

### Response Shape
```json
{
  "message": "Password reset successfully",
  "student": { /* full student object */ }
}
```

### Database Operations
- [ ] Hash default password (`'CLAP@123'`) with bcrypt (10 rounds)
- [ ] UPDATE `users` SET `password_hash={hash}`, `updated_at=NOW()` WHERE `id={id}` AND `role='student'`

### Default Values
- ✓ **Default password**: `'CLAP@123'`
- ✓ **bcrypt rounds**: `10`

---

## 16. GET /api/admin/clap-tests/[id]

### Source File
`app/api/admin/clap-tests/[id]/route.ts` (lines 178-227)

### Purpose
Get single CLAP test with components and batch

### Response Shape
```json
{
  "clapTest": {
    "id": "uuid",
    "name": "string",
    "batch_id": "uuid | null",
    "batch_name": "string",
    "status": "string",
    "is_assigned": "boolean",
    "created_at": "ISO8601",
    "tests": [
      { "id": "type", "name": "string", "type": "string", "status": "string" }
    ]
  }
}
```

### Data Transformation
- [ ] `components` → `tests` array
- [ ] `batch.batch_name` → `batch_name`
- [ ] `batch_id != null` → `is_assigned: true`
- [ ] Missing batch → `batch_name: 'Unknown Batch'`

---

## 17. PATCH /api/admin/clap-tests/[id]

### Source File
`app/api/admin/clap-tests/[id]/route.ts` (lines 76-176)

### Purpose
Update CLAP test name or batch assignment

### Request Body
```json
{
  "name": "string (optional)",
  "batch_id": "uuid (optional)"
}
```

### Validation
- [ ] At least one field required → 400 if both missing

### Batch Reassignment Logic
- [ ] If `batch_id` changed:
  - [ ] DELETE all existing `student_clap_assignments` for this test
  - [ ] SELECT students in new batch
  - [ ] INSERT new assignments for new batch students

### Database Operations
- [ ] UPDATE `clap_tests` SET `name`/`batch_id`, `updated_at=NOW()`
- [ ] If batch changed: DELETE + INSERT assignments

---

## 18. DELETE /api/admin/clap-tests/[id]

### Source File
`app/api/admin/clap-tests/[id]/route.ts` (lines 4-73)

### Purpose
**Soft delete** CLAP test (preserves all data)

### Database Operations
- [ ] UPDATE `clap_tests` SET `status='deleted'`, `updated_at=NOW()`
- [ ] UPDATE `student_clap_assignments` SET `status='test_deleted'` WHERE `clap_test_id={id}` AND `status IN ('assigned', 'started')`

### Response Shape
```json
{
  "message": "CLAP test deleted successfully",
  "preserved_data": {
    "student_results": "preserved",
    "test_components": "preserved",
    "assignments": "marked_as_inactive"
  }
}
```

### Critical Behavior
- ✓ **Soft delete only** (status change)
- ✓ **Preserves all related data**
- ✓ **Updates assignment status** to `'test_deleted'`

---

## 19. POST /api/admin/clap-tests/[id]/assign

### Source File
`app/api/admin/clap-tests/[id]/assign/route.ts`

### Purpose
Assign CLAP test to a batch

### Request Body
```json
{
  "batch_id": "uuid (required)"
}
```

### Database Operations
- [ ] UPDATE `clap_tests` SET `batch_id={batch_id}`, `updated_at=NOW()`
- [ ] DELETE existing `student_clap_assignments` for this test
- [ ] SELECT students in batch
- [ ] INSERT new assignments

### Response Shape
```json
{
  "message": "CLAP test assigned successfully",
  "assigned_to_batch": "uuid"
}
```

---

## 20. POST /api/admin/clap-tests/[id]/unassign

### Source File
`app/api/admin/clap-tests/[id]/unassign/route.ts`

### Purpose
Remove batch assignment from CLAP test

### Database Operations
- [ ] UPDATE `clap_tests` SET `batch_id=NULL`, `updated_at=NOW()`
- [ ] DELETE all `student_clap_assignments` for this test

### Response Shape
```json
{
  "message": "CLAP test unassigned successfully",
  "previous_batch": "uuid | null"
}
```

---

## 21. POST /api/student/change-password

### Source File
`app/api/student/change-password/route.ts`

### Purpose
Student changes their own password

### Authentication
- [ ] Requires `x-user-id` header

### Request Body
```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (required)"
}
```

### Validation
- [ ] Missing `x-user-id` → 401
- [ ] Missing `currentPassword` or `newPassword` → 400
- [ ] Current password incorrect → 400, `{ error: 'Current password is incorrect' }`

### Database Operations
- [ ] SELECT `password_hash` WHERE `id={userId}` AND `role='student'`
- [ ] Verify current password with bcrypt.compare()
- [ ] Hash new password with bcrypt (10 rounds)
- [ ] UPDATE `users` SET `password_hash={hash}`, `updated_at=NOW()`

---

## 22. GET /api/student/profile

### Source File
`app/api/student/profile/route.ts` (lines 5-33)

### Purpose
Get student's own profile

### Authentication
- [ ] Requires `x-user-id` header

### Response Shape
```json
{
  "profile": {
    "id": "uuid",
    "full_name": "string | null",
    "email": "string",
    "username": "string | null",
    "student_id": "string | null",
    "profile_completed": "boolean",
    "is_active": "boolean"
  }
}
```

### Database Operations
- [ ] SELECT specific fields WHERE `id={userId}` AND `role='student'`

---

## 23. PUT /api/student/profile

### Source File
`app/api/student/profile/route.ts` (lines 36-93)

### Purpose
Update student's own profile

### Authentication
- [ ] Requires `x-user-id` header

### Request Body
```json
{
  "username": "string (optional)",
  "email": "string (optional)"
}
```

### Validation
- [ ] Check if `username` already taken by another user → 400

### Auto-Completion Logic
- [ ] If both `username` AND `email` provided → Set `profile_completed=true`

### Database Operations
- [ ] SELECT to check duplicate username
- [ ] UPDATE `users` SET fields, possibly `profile_completed=true`

---

## ADDITIONAL ENDPOINTS (Mock Data - Not Production)

### /api/attempts/* (7 routes)
- GET /api/attempts
- POST /api/attempts
- GET /api/attempts/[id]
- PATCH /api/attempts/[id]
- DELETE /api/attempts/[id]
- POST /api/attempts/[id]/answers
- GET /api/attempts/[id]/answers
- POST /api/attempts/[id]/answers/batch
- DELETE /api/attempts/[id]/answers/[questionId]

**Status**: Uses mock data, not connected to database

### /api/tests/* (4 routes)
- GET /api/tests
- POST /api/tests
- GET /api/tests/[id]
- PUT /api/tests/[id]
- DELETE /api/tests/[id]

**Status**: Uses mock data, not connected to database

### /api/admin/tests/* (4 routes)
- GET /api/admin/tests
- POST /api/admin/tests
- GET /api/admin/tests/[id]
- PUT /api/admin/tests/[id]
- DELETE /api/admin/tests/[id]

**Status**: Connected to database, production-ready

---

## CROSS-CUTTING VERIFICATION

### Authentication Patterns
- [ ] **Header-based auth**: `x-user-id` header for student endpoints
- [ ] **No session management**: Stateless API
- [ ] **Role filtering**: Always filters by `role='student'` or `role='admin'`

### Logging Patterns
- [ ] **Request logging**: Logs request bodies
- [ ] **Error logging**: Logs errors with `console.error()`
- [ ] **Performance logging**: Uses `console.time/timeEnd()` for critical operations
- [ ] **Success logging**: Logs successful operations

### Error Response Patterns
- [ ] **Consistent structure**: `{ error: 'message' }`
- [ ] **Status codes**: 200, 201, 400, 401, 404, 409, 500
- [ ] **Error messages**: Specific, user-friendly
- [ ] **No stack traces**: Never exposes internal errors to client

### Database Patterns
- [ ] **Service role client**: Uses `createClient()` from `lib/supabase/server.ts`
- [ ] **Soft deletes**: Prefers `is_active=false` over DELETE
- [ ] **Timestamps**: Auto-updates `updated_at` on modifications
- [ ] **UUIDs**: All IDs are UUIDs (v4)

### Default Values
- ✓ **Default password**: `'CLAP@123'`
- ✓ **bcrypt rounds**: `10`
- ✓ **Student email format**: `{student_id}@clap-student.local`
- ✓ **Default status**: `'draft'` for tests, `'pending'` for components
- ✓ **Default role**: `'student'`
- ✓ **Default is_active**: `true`
- ✓ **Default profile_completed**: `false`

---

## TESTING PRIORITY MATRIX

### Priority 1 (Critical - Must Match Exactly)
1. POST /api/admin/batches - Validation logic
2. POST /api/admin/students - Password hashing, email generation
3. POST /api/admin/clap-tests - Component creation, auto-assignment
4. POST /api/evaluate/speaking - OpenAI integration, retry logic
5. POST /api/evaluate/writing - OpenAI integration, retry logic
6. DELETE /api/admin/students/[id] - Soft delete behavior

### Priority 2 (High - Core Functionality)
7. GET /api/admin/batches - Student count aggregation
8. GET /api/admin/students - Search and filter logic
9. GET /api/admin/clap-tests - Data transformation
10. PUT /api/admin/students/[id] - Partial update logic

### Priority 3 (Medium - Secondary Features)
11. GET /api/admin/students/[id]
12. GET /api/admin/batches/[id]/students
13. PATCH /api/admin/batches/[id]
14. DELETE /api/admin/batches/[id]

### Priority 4 (Low - Not Yet Implemented)
15-23. All other endpoints

---

## SIGN-OFF CHECKLIST

- [ ] All 11 implemented endpoints tested
- [ ] All validation scenarios verified
- [ ] All error cases tested
- [ ] Database side effects confirmed
- [ ] Default values verified
- [ ] Logging output reviewed
- [ ] Response shapes match exactly
- [ ] Status codes match exactly
- [ ] Edge cases tested
- [ ] Performance comparable

**Verification Engineer**: _______________  
**Date**: _______________  
**Status**: ☐ PASS ☐ FAIL  
**Notes**: _______________

---

**END OF VERIFICATION PLAN**

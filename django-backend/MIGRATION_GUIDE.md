# Migration Guide: Next.js → Django Backend

## Overview

This guide documents the complete migration from Next.js API routes to Django backend, ensuring behavioral equivalence.

---

## Architecture Comparison

### Next.js Backend
```
app/api/
├── admin/
│   ├── batches/route.ts
│   ├── students/route.ts
│   └── clap-tests/route.ts
├── evaluate/
│   ├── speaking/route.ts
│   └── writing/route.ts
└── lib/
    ├── supabase.ts
    └── openai.ts
```

### Django Backend
```
api/
├── views/
│   ├── admin/
│   │   ├── batches.py
│   │   ├── students.py
│   │   └── clap_tests.py
│   └── evaluate.py
├── utils/
│   ├── responses.py
│   └── openai_client.py
└── models.py
```

---

## Component Mapping

| Next.js | Django | Notes |
|---------|--------|-------|
| `route.ts` with `export async function GET()` | `@require_http_methods(["GET"])` view | Function-based views |
| `NextRequest`/`NextResponse` | `request`/`JsonResponse` | Django HTTP objects |
| `request.json()` | `json.loads(request.body)` | JSON parsing |
| `request.formData()` | `request.FILES` + `request.POST` | File uploads |
| `searchParams.get('key')` | `request.GET.get('key')` | Query parameters |
| `{ params }` (dynamic routes) | `<uuid:id>` in URL pattern | Path parameters |
| Supabase client | Django ORM | Database access |
| `console.log()` | `logger.info()` | Logging |
| `console.error()` | `logger.error()` | Error logging |
| `console.time()` | `time.time()` | Performance timing |
| `try/catch` | `try/except` | Error handling |

---

## Database Access Translation

### Next.js (Supabase Client)
```typescript
const { data, error } = await supabase
  .from('batches')
  .select('id, batch_name')
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(50)
```

### Django (ORM)
```python
batches = Batch.objects.filter(
    is_active=True
).values(
    'id', 'batch_name'
).order_by('-created_at')[:50]
```

---

## Key Behavioral Equivalences

### 1. Response Format

**Next.js:**
```typescript
return NextResponse.json({ batches: data }, { status: 200 })
```

**Django:**
```python
return JsonResponse({'batches': data}, status=200)
```

### 2. Error Handling

**Next.js:**
```typescript
return NextResponse.json(
  { error: 'Batch name is required' },
  { status: 400 }
)
```

**Django:**
```python
return error_response('Batch name is required', status=400)
```

### 3. Logging

**Next.js:**
```typescript
console.log('Request body:', body)
console.error('Error:', error)
```

**Django:**
```python
logger.info(f'Request body: {body}')
logger.error(f'Error: {error}', exc_info=True)
```

### 4. Password Hashing

**Next.js:**
```typescript
import bcrypt from 'bcryptjs'
const hash = await bcrypt.hash(password, 10)
```

**Django:**
```python
import bcrypt
hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=10))
```

### 5. OpenAI Integration

**Next.js:**
```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [...],
  temperature: 0.3
})
```

**Django:**
```python
response = openai.ChatCompletion.create(
    model='gpt-4-turbo',
    messages=[...],
    temperature=0.3
)
```

---

## URL Routing

### Next.js (File-based)
```
app/api/admin/batches/route.ts → /api/admin/batches
app/api/admin/students/[id]/route.ts → /api/admin/students/[id]
```

### Django (Explicit)
```python
# api/urls.py
urlpatterns = [
    path('admin/batches', batches.list_batches),
    path('admin/students/<uuid:student_id>', student_detail.get_student),
]
```

---

## Environment Variables

### Next.js (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
```

### Django (.env)
```env
DB_HOST=...
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
OPENAI_API_KEY=...
```

---

## Migration Steps

### Step 1: Setup Django Project
```bash
cd django-backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env with Supabase credentials
```

### Step 3: Verify Database Connection
```bash
python manage.py dbshell
# Should connect to Supabase PostgreSQL
```

### Step 4: Run Development Server
```bash
python manage.py runserver 0.0.0.0:8000
```

### Step 5: Test Endpoints
```bash
# Use VERIFICATION_CHECKLIST.md
curl http://localhost:8000/api/admin/batches
```

### Step 6: Update Frontend
```typescript
// Update API base URL in frontend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
```

### Step 7: Deploy Django Backend
```bash
# Production deployment
gunicorn clap_backend.wsgi:application --bind 0.0.0.0:8000
```

---

## Differences & Limitations

### Unavoidable Differences

1. **Async vs Sync**
   - Next.js: All routes are async
   - Django: Views are synchronous (can use async views in Django 3.1+)
   - **Impact**: None on behavior, only internal implementation

2. **Query Syntax**
   - Next.js: Supabase PostgREST query builder
   - Django: Django ORM
   - **Impact**: None on results, queries are equivalent

3. **Type System**
   - Next.js: TypeScript with compile-time type checking
   - Django: Python with runtime type checking
   - **Impact**: None on runtime behavior

### Preserved Behaviors

✅ **Exact same API URLs**  
✅ **Identical request/response formats**  
✅ **Same validation logic**  
✅ **Same error messages**  
✅ **Same status codes**  
✅ **Same database operations**  
✅ **Same bcrypt rounds (10)**  
✅ **Same default password (`CLAP@123`)**  
✅ **Same OpenAI model (`gpt-4-turbo`)**  
✅ **Same retry logic (3 attempts, 1s delay)**  

---

## Testing Strategy

### Unit Testing
```python
# tests/test_batches.py
from django.test import TestCase, Client

class BatchAPITestCase(TestCase):
    def test_create_batch(self):
        client = Client()
        response = client.post('/api/admin/batches', {
            'batch_name': '2026-30',
            'start_year': 2026,
            'end_year': 2030
        }, content_type='application/json')
        
        self.assertEqual(response.status_code, 201)
        self.assertIn('batch', response.json())
```

### Integration Testing
- Test against actual Supabase database
- Verify data integrity
- Compare results with Next.js implementation

### Behavioral Testing
- Use VERIFICATION_CHECKLIST.md
- Test all endpoints
- Verify error cases
- Check logging output

---

## Deployment Considerations

### Development
- Django runs on `localhost:8000`
- Next.js frontend on `localhost:3000`
- CORS configured to allow frontend

### Production
- Django behind Nginx/Apache
- HTTPS/SSL required
- Environment variables via secrets management
- Gunicorn or uWSGI as WSGI server

---

## Rollback Plan

If issues arise, rollback is straightforward:

1. **Frontend**: Change `API_BASE_URL` back to Next.js
2. **Database**: No changes made (Django uses existing schema)
3. **Data**: No data migration required

---

## Maintenance

### Adding New Endpoints

1. Create view function in `api/views/`
2. Add URL pattern in `api/urls.py`
3. Match Next.js behavior exactly
4. Update VERIFICATION_CHECKLIST.md
5. Test thoroughly

### Updating Existing Endpoints

1. Review Next.js implementation
2. Update Django view to match
3. Verify no behavioral changes
4. Test with checklist

---

## Support & Resources

- **Django Documentation**: https://docs.djangoproject.com/
- **Django REST Framework**: https://www.django-rest-framework.org/
- **Next.js API Reference**: Original implementation in `app/api/`
- **Verification Checklist**: `VERIFICATION_CHECKLIST.md`

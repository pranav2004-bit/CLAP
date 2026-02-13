# Django Backend for CLAP Application

## Overview

This is a **Django backend migration** from the original Next.js API routes, maintaining **exact behavioral parity** with the Next.js implementation. The backend connects to the same Supabase PostgreSQL database and provides identical API contracts.

## Project Structure

```
django-backend/
├── clap_backend/          # Django project configuration
│   ├── settings.py        # Settings (database, CORS, logging)
│   ├── urls.py            # Main URL configuration
│   ├── wsgi.py            # WSGI entry point
│   └── asgi.py            # ASGI entry point
├── api/                   # Main API application
│   ├── models.py          # Django models (mapped to existing tables)
│   ├── urls.py            # API URL routing
│   ├── views/             # View functions
│   │   ├── admin/         # Admin endpoints
│   │   │   ├── batches.py
│   │   │   ├── students.py
│   │   │   ├── student_detail.py
│   │   │   └── clap_tests.py
│   │   └── evaluate.py    # AI evaluation endpoints
│   └── utils/             # Utility modules
│       ├── responses.py   # Response helpers
│       ├── openai_client.py  # OpenAI integration
│       └── prompts.py     # AI evaluation prompts
├── manage.py              # Django management script
├── requirements.txt       # Python dependencies
└── .env.example           # Environment variables template
```

## Setup Instructions

### 1. Prerequisites

- Python 3.10 or higher
- PostgreSQL client libraries
- Access to the Supabase database

### 2. Installation

```bash
# Navigate to the django-backend directory
cd django-backend

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual credentials
```

**Required Environment Variables:**

```env
# Django Settings
SECRET_KEY=your-secret-key-here-change-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (Supabase PostgreSQL) - Same as Next.js
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_supabase_db_password
DB_HOST=db.your-project.supabase.co
DB_PORT=5432

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# CORS Settings (Frontend URL)
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### 4. Database Setup

**IMPORTANT**: Do NOT run Django migrations. The models are configured with `managed=False` to prevent Django from modifying the existing Supabase database schema.

```bash
# Verify database connection
python manage.py dbshell
```

### 5. Running the Server

```bash
# Development server
python manage.py runserver 0.0.0.0:8000

# Production server (using Gunicorn)
gunicorn clap_backend.wsgi:application --bind 0.0.0.0:8000
```

The API will be available at `http://localhost:8000/api/`

## API Endpoints

**Total: 23 endpoints (100% coverage)**

All endpoints maintain the exact same URL structure as Next.js:

### Admin - Batch Management (5 endpoints)
- `GET /api/admin/batches` - List all active batches
- `POST /api/admin/batches` - Create a new batch
- `PATCH /api/admin/batches/<id>` - Toggle batch active status
- `DELETE /api/admin/batches/<id>` - Hard delete batch (with validation)
- `GET /api/admin/batches/<id>/students` - List students in batch

### Admin - Student Management (6 endpoints)
- `GET /api/admin/students` - List students (with search/filter)
- `POST /api/admin/students` - Create a new student
- `GET /api/admin/students/<id>` - Get student by ID
- `PUT /api/admin/students/<id>` - Update student
- `DELETE /api/admin/students/<id>` - Soft delete student
- `POST /api/admin/students/<id>/reset-password` - Reset to default password

### Admin - CLAP Test Management (7 endpoints)
- `GET /api/admin/clap-tests` - List all CLAP tests
- `POST /api/admin/clap-tests` - Create a new CLAP test
- `GET /api/admin/clap-tests/<id>` - Get single CLAP test
- `PATCH /api/admin/clap-tests/<id>` - Update CLAP test
- `DELETE /api/admin/clap-tests/<id>` - Soft delete CLAP test
- `POST /api/admin/clap-tests/<id>/assign` - Assign test to batch
- `POST /api/admin/clap-tests/<id>/unassign` - Remove batch assignment

### Student Portal (3 endpoints)
- `GET /api/student/profile` - Get own profile
- `PUT /api/student/profile` - Update own profile
- `POST /api/student/change-password` - Change own password

### AI Evaluation (2 endpoints)
- `POST /api/evaluate/speaking` - Evaluate speaking test (Whisper + GPT-4)
- `POST /api/evaluate/writing` - Evaluate writing test (GPT-4)

## Key Features

### Behavioral Parity

✅ **Exact Response Structures**: All responses match Next.js format  
✅ **Same Validation Logic**: Identical input validation and error messages  
✅ **Matching Logging**: Console logging behavior preserved  
✅ **Performance Timing**: Request timing logs maintained  
✅ **Error Handling**: Same error codes and messages  
✅ **Database Queries**: Equivalent query logic using Django ORM  

### Security

- CORS configured for Next.js frontend
- CSRF protection (can be disabled for API-only usage)
- bcrypt password hashing (10 rounds, matching Next.js)
- SSL required for database connections

### Third-Party Integrations

- **OpenAI**: Whisper API for transcription, GPT-4 for evaluation
- **Retry Logic**: 3 retries with 1-second delay (matching Next.js)
- **Supabase**: Direct PostgreSQL connection

## Migration Notes

### What Was Changed

1. **Framework**: Next.js API Routes → Django Views
2. **Database Client**: Supabase JS Client → Django ORM
3. **Language**: TypeScript → Python
4. **Async Pattern**: JavaScript async/await → Python (synchronous views)

### What Was NOT Changed

- Database schema (no migrations)
- API URL structure
- Request/Response contracts
- Business logic
- Validation rules
- Error messages
- Default values (e.g., default password: `CLAP@123`)
- bcrypt rounds (10)

## Testing

### Manual Testing Checklist

```bash
# Test batch creation
curl -X POST http://localhost:8000/api/admin/batches \
  -H "Content-Type: application/json" \
  -d '{"batch_name":"2026-30","start_year":2026,"end_year":2030}'

# Test student creation
curl -X POST http://localhost:8000/api/admin/students \
  -H "Content-Type: application/json" \
  -d '{"student_id":"STU001","batch_id":"<batch-uuid>"}'

# Test batch listing
curl http://localhost:8000/api/admin/batches
```

## Deployment

### Production Checklist

- [ ] Set `DEBUG=False` in `.env`
- [ ] Generate a strong `SECRET_KEY`
- [ ] Configure `ALLOWED_HOSTS` with your domain
- [ ] Set up HTTPS/SSL
- [ ] Configure production database credentials
- [ ] Set up Gunicorn or uWSGI
- [ ] Configure Nginx/Apache reverse proxy
- [ ] Set up logging to files
- [ ] Configure static file serving

### Docker Deployment (Optional)

```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["gunicorn", "clap_backend.wsgi:application", "--bind", "0.0.0.0:8000"]
```

## Troubleshooting

### Database Connection Issues

```python
# Test database connection
python manage.py dbshell
```

### OpenAI API Errors

- Verify `OPENAI_API_KEY` is set correctly
- Check API quota/limits
- Review logs for specific error messages

### CORS Errors

- Ensure `CORS_ALLOWED_ORIGINS` includes your frontend URL
- Check that `corsheaders` is in `INSTALLED_APPS`

## Support

For issues or questions related to the Django backend migration, refer to:
- Django documentation: https://docs.djangoproject.com/
- Original Next.js implementation in `app/api/` directory

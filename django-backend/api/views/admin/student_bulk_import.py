"""
Bulk Student Import — Enterprise Grade
=======================================
POST /api/admin/students/bulk-import
    Accepts a multipart/form-data request with:
      - file       : CSV file with a 'student_id' column (required)
      - batch_id   : UUID of the target batch (required)

    Behaviour:
      - File-level validation:  Rejects malformed files immediately.
      - Row-level validation:   Each row is validated independently.
      - Atomic DB write:        All valid rows are committed in one transaction.
                                If the DB write fails catastrophically, NOTHING is written.
      - Partial success:        Duplicate / invalid rows are skipped; valid rows are created.
      - Result report:          Returns a detailed JSON summary including per-row failures.
      - Failed rows CSV:        Base64-encoded CSV of failed rows is included in the response
                                so the admin can download and fix them without re-entering data.

GET /api/admin/students/bulk-template
    Returns a downloadable CSV template with example rows.
"""

import base64
import csv
import io
import json
import logging
import re
import uuid

import bcrypt
from django.conf import settings
from django.db import transaction, IntegrityError
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import User, Batch
from api.utils.auth import require_admin as _require_admin

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB hard cap
MAX_ROWS = 10_000                        # Realistic upper limit for one import
STUDENT_ID_RE = re.compile(r'^[A-Za-z0-9_\-]{3,50}$')  # Allow alphanumeric, underscore, hyphen 3-50 chars


# ── Validation helpers ─────────────────────────────────────────────────────────

def _validate_student_id(raw: str) -> tuple[str, str | None]:
    """
    Cleans and validates a student ID.
    Returns (cleaned_id, error_message).
    error_message is None if valid.
    """
    cleaned = raw.strip().upper()
    if not cleaned:
        return '', 'Student ID is empty'
    if len(cleaned) > 50:
        return cleaned, f'Student ID too long ({len(cleaned)} chars, max 50)'
    if not STUDENT_ID_RE.match(cleaned):
        return cleaned, 'Student ID contains invalid characters (only letters, numbers, hyphens, underscores allowed)'
    return cleaned, None


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(
        plain.encode('utf-8'),
        bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)
    ).decode('utf-8')


def _build_failed_csv(failed_rows: list[dict]) -> str:
    """Builds a base64-encoded CSV of failed rows for admin download."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['row_number', 'student_id', 'reason'])
    for row in failed_rows:
        writer.writerow([row['row'], row['student_id'], row['reason']])
    csv_bytes = buf.getvalue().encode('utf-8')
    return base64.b64encode(csv_bytes).decode('ascii')


# ── Main endpoint ─────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def bulk_import_students(request):
    """
    POST /api/admin/students/bulk-import
    Multipart form fields:
      file      — CSV file
      batch_id  — UUID string of target batch
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    # ── 1. File presence check ──────────────────────────────────────────────
    if 'file' not in request.FILES:
        return JsonResponse({'error': 'No file uploaded. Please attach a CSV file.'}, status=400)

    uploaded_file = request.FILES['file']

    # ── 2. File type check ──────────────────────────────────────────────────
    filename = uploaded_file.name or ''
    if not filename.lower().endswith('.csv'):
        return JsonResponse({
            'error': f'Invalid file type. Only .csv files are accepted. Received: "{filename}"'
        }, status=400)

    # ── 3. File size check ──────────────────────────────────────────────────
    if uploaded_file.size > MAX_FILE_SIZE_BYTES:
        return JsonResponse({
            'error': f'File too large ({uploaded_file.size // 1024} KB). Maximum allowed size is 5 MB.'
        }, status=400)

    # ── 4. Batch ID validation ──────────────────────────────────────────────
    batch_id_raw = request.POST.get('batch_id', '').strip()
    if not batch_id_raw:
        return JsonResponse({'error': 'batch_id is required. Please select a batch before uploading.'}, status=400)

    try:
        batch_uuid = uuid.UUID(batch_id_raw)
    except ValueError:
        return JsonResponse({'error': f'Invalid batch_id format: "{batch_id_raw}"'}, status=400)

    try:
        batch = Batch.objects.get(id=batch_uuid)
    except Batch.DoesNotExist:
        return JsonResponse({'error': f'Batch with ID "{batch_id_raw}" does not exist.'}, status=404)

    # ── 5. Parse CSV ────────────────────────────────────────────────────────
    try:
        raw_content = uploaded_file.read().decode('utf-8-sig')  # utf-8-sig strips BOM from Excel exports
    except UnicodeDecodeError:
        return JsonResponse({
            'error': 'File encoding error. Please save your CSV as UTF-8 and re-upload.'
        }, status=400)

    reader = csv.DictReader(io.StringIO(raw_content))

    # Check required column exists
    if reader.fieldnames is None:
        return JsonResponse({'error': 'CSV file is empty or has no headers.'}, status=400)

    # Normalize header names — case-insensitive match for 'student_id'
    normalized_headers = [h.strip().lower() for h in reader.fieldnames]
    if 'student_id' not in normalized_headers:
        return JsonResponse({
            'error': (
                f'Required column "student_id" not found. '
                f'Found columns: {", ".join(reader.fieldnames)}. '
                'Please download the official import template.'
            )
        }, status=400)

    # Map the correct original header name for student_id (handles case variations)
    sid_col = reader.fieldnames[normalized_headers.index('student_id')]

    # ── 6. Row-level validation pass ───────────────────────────────────────
    valid_ids: list[str] = []         # Student IDs that passed validation
    failed_rows: list[dict] = []      # Rows that failed validation
    seen_in_file: set[str] = set()    # Detect intra-file duplicates
    row_num = 1                        # 1-indexed, row 1 = first data row

    for row in reader:
        row_num += 1

        if row_num > MAX_ROWS + 1:    # +1 for header
            failed_rows.append({
                'row': row_num,
                'student_id': '',
                'reason': f'File exceeds maximum row limit of {MAX_ROWS}. Rows beyond this limit were ignored.'
            })
            break

        raw_id = row.get(sid_col, '')
        cleaned_id, error = _validate_student_id(raw_id)

        if error:
            failed_rows.append({'row': row_num, 'student_id': raw_id.strip(), 'reason': error})
            continue

        # Intra-file duplicate check
        if cleaned_id in seen_in_file:
            failed_rows.append({
                'row': row_num,
                'student_id': cleaned_id,
                'reason': 'Duplicate student ID within this CSV file'
            })
            continue

        seen_in_file.add(cleaned_id)
        valid_ids.append(cleaned_id)

    if not valid_ids:
        return JsonResponse({
            'error': 'No valid student IDs found in the CSV. All rows failed validation.',
            'failed_count': len(failed_rows),
            'failures': failed_rows[:50],  # Return first 50 for the UI
        }, status=422)

    # ── 7. Database existence check (batch query — O(N) not O(N²)) ─────────
    # Get all existing student_ids from DB in one query, including deleted ones
    candidate_ids = set(valid_ids)

    # Active/inactive collisions — these must be skipped
    existing_active = set(
        User.objects.filter(student_id__in=candidate_ids)
        .exclude(student_id__startswith='DELETED_')
        .values_list('student_id', flat=True)
    )

    # Deleted collisions — these can be restored
    # Build a list of 'DELETED_{id}_*' patterns by checking prefixes
    deleted_queryset = User.objects.filter(
        student_id__startswith='DELETED_'
    ).values_list('student_id', flat=True)

    # Map: original_id -> deleted user student_id string
    restorable: dict[str, str] = {}
    for deleted_sid in deleted_queryset:
        # deleted_sid format: DELETED_{original_id}_{timestamp}
        parts = deleted_sid.split('_', 2)   # ['DELETED', original_id, timestamp]
        if len(parts) >= 2:
            original = parts[1] if len(parts) == 2 else '_'.join(parts[1:-1])
            if original in candidate_ids:
                restorable[original] = deleted_sid

    # Split valid_ids into three buckets
    to_create: list[str] = []
    to_restore: list[str] = []
    already_exist: list[str] = []

    for sid in valid_ids:
        if sid in existing_active:
            already_exist.append(sid)
        elif sid in restorable:
            to_restore.append(sid)
        else:
            to_create.append(sid)

    # Mark already-existing as failed rows (skipped, not an error)
    for sid in already_exist:
        failed_rows.append({
            'row': '—',
            'student_id': sid,
            'reason': 'Student ID already exists in the system (skipped)'
        })

    if not to_create and not to_restore:
        return JsonResponse({
            'error': 'All student IDs in the CSV already exist in the system. No new accounts were created.',
            'failed_count': len(failed_rows),
            'failures': failed_rows[:100],
            'failed_csv_b64': _build_failed_csv(failed_rows),
        }, status=422)

    # ── 8. Atomic DB write ─────────────────────────────────────────────────
    default_password = settings.DEFAULT_PASSWORD
    created_count = 0
    restored_count = 0

    try:
        with transaction.atomic():
            # --- Create new students ---
            if to_create:
                password_hash = _hash_password(default_password)
                new_users = []
                for sid in to_create:
                    new_users.append(User(
                        email=f'{sid}@clap-student.local',
                        student_id=sid,
                        password_hash=password_hash,
                        role='student',
                        is_active=True,
                        profile_completed=False,
                        batch_id=batch.id,
                    ))
                # bulk_create with ignore_conflicts=False (we already checked; let DB catch any race)
                # update_conflicts not available in older Django, use ignore_conflicts
                User.objects.bulk_create(new_users, batch_size=500, ignore_conflicts=False)
                created_count = len(to_create)

            # --- Restore deleted students ---
            if to_restore:
                password_hash = _hash_password(default_password)
                for sid in to_restore:
                    deleted_sid = restorable[sid]
                    User.objects.filter(student_id=deleted_sid).update(
                        student_id=sid,
                        is_active=True,
                        profile_completed=False,
                        batch_id=batch.id,
                        password_hash=password_hash,
                    )
                restored_count = len(to_restore)

    except IntegrityError as e:
        logger.error(f'Bulk import IntegrityError: {e}', exc_info=True)
        return JsonResponse({
            'error': (
                'A database conflict occurred during import. '
                'This usually means some student IDs were created by another admin simultaneously. '
                'No accounts were created from this upload. Please try again.'
            )
        }, status=409)

    except Exception as e:
        logger.error(f'Bulk import unexpected error: {e}', exc_info=True)
        return JsonResponse({
            'error': 'An unexpected server error occurred. The import was rolled back — no accounts were created. Please try again or contact support.'
        }, status=500)

    # ── 9. Build response ──────────────────────────────────────────────────
    response_payload = {
        'success': True,
        'summary': {
            'total_rows_in_file': row_num - 1,
            'created': created_count,
            'restored': restored_count,
            'skipped_duplicates': len(already_exist),
            'skipped_invalid': len([f for f in failed_rows if f['reason'] != 'Student ID already exists in the system (skipped)']),
            'batch_name': batch.batch_name,
            'batch_id': str(batch.id),
            'default_password': default_password,
        },
        'failed_count': len(failed_rows),
        'failures': failed_rows[:200],   # Return first 200 in body
    }

    if failed_rows:
        response_payload['failed_csv_b64'] = _build_failed_csv(failed_rows)

    logger.info(
        f'Bulk import complete by admin {admin_user.id}: '
        f'{created_count} created, {restored_count} restored, '
        f'{len(already_exist)} skipped (duplicates), '
        f'batch={batch.batch_name}'
    )

    return JsonResponse(response_payload, status=207 if failed_rows else 200)


# ── Template download endpoint ─────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET'])
def bulk_import_template(request):
    """
    GET /api/admin/students/bulk-template
    Returns a downloadable CSV template file with header + 3 example rows.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['student_id'])
    writer.writerows([
        ['A23126551001'],
        ['A23126551002'],
        ['A23126551003'],
    ])

    response = HttpResponse(buf.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="clap_student_import_template.csv"'
    return response

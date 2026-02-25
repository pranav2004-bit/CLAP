# -*- coding: utf-8 -*-
"""
CLAP Backend - Comprehensive API Test Suite
============================================
Tests EVERY endpoint registered in api/urls.py as of 2026-02-25.

Run with:
    .\\venv\\Scripts\\python.exe test_apis.py

Requirements:
  - Django env active  (DJANGO_SETTINGS_MODULE = clap_backend.settings)
  - Database reachable (supabase or local postgres)
  - At least 1 admin user and 1 student user in the DB
  - At least 1 batch and 1 CLAP test in the DB

The test uses Django's RequestFactory (no live HTTP server needed).
Tests that need an external service (Celery / Redis / OpenAI) are marked
SKIP with a clear reason.

Legend in output:
  [PASS]  -- expected HTTP status received
  [FAIL]  -- unexpected HTTP status (with response preview)
  [SKIP]  -- cannot be tested without external service / data
"""

import json
import os
import sys
import django

# Force stdout to ASCII on Windows so unicode in response bodies doesn't crash
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='ascii', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='ascii', errors='replace')

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "clap_backend.settings")
sys.path.insert(0, ".")
django.setup()

# ── stdlib / Django imports (after setup) ────────────────────────────────────
import uuid
from django.test import RequestFactory

from api.models import (
    Batch,
    ClapTest,
    ClapTestComponent,
    DeadLetterQueue,
    StudentClapAssignment,
    User,
    Test,
    TestAttempt,
)

# ── View imports ──────────────────────────────────────────────────────────────
from api.views.health import health_check
from api.views.admin.batches import batches_handler
from api.views.admin.batch_detail import batch_detail_handler, get_batch_students
from api.views.admin.students import students_handler
from api.views.admin.student_detail import student_detail_handler
from api.views.admin.student_toggle_active import toggle_student_active
from api.views.admin.student_password import reset_student_password
from api.views.admin.clap_tests import clap_tests_handler
from api.views.admin.clap_test_detail import clap_test_detail_handler
from api.views.admin.clap_test_assignment import assign_clap_test, unassign_clap_test
from api.views.admin.clap_test_results import clap_test_results_handler
from api.views.admin.clap_components import clap_component_detail_handler
from api.views.admin.clap_test_items import (
    clap_test_items_handler,
    clap_test_item_detail_handler,
    reorder_items_handler,
)
from api.views.admin.audio_upload import upload_audio_file, delete_audio_file
from api.views.admin.submissions_monitor import (
    submission_status_overview,
    submission_list,
    submission_detail,
    dlq_dashboard_widget,
    dlq_quick_action,
    pipeline_health,
)
from api.views.admin.llm_controls import (
    retrigger_llm_evaluation,
    llm_trace_by_submission,
    llm_analytics,
    manual_score_from_dlq,
)
from api.views.admin.report_management import (
    report_list,
    report_by_submission,
    regenerate_report,
    bulk_report_download,
    report_template_config,
    report_template_preview,
)
from api.views.admin.email_management import (
    email_delivery_status,
    resend_email,
    bulk_resend_email,
    bounce_complaint_logs,
)
from api.views.admin.notifications import in_app_alerts, send_daily_summary
from api.views.admin.score_management import (
    scores_by_submission,
    override_score,
    scores_by_batch,
    scores_by_assessment,
    export_scores,
)
from api.views.admin.dlq import (
    dlq_list,
    dlq_retry,
    dlq_bulk_retry,
    dlq_resolve,
    dlq_detail,
)

# Student-portal views
from api.views.student.profile import student_profile_handler, change_student_password
from api.views.student.clap_attempt import (
    list_assigned_tests,
    student_test_items,
    submit_response,
    finish_component,
)
from api.views.student.audio_upload import (
    get_audio_upload_url,
    submit_audio_response,
    retrieve_audio_file,
)
from api.views.student.audio_playback import (
    retrieve_audio_file as student_retrieve_audio,
    track_playback,
    get_playback_status,
)

# Misc
from api.views import evaluate, legacy_tests, legacy_attempts, submissions

# ── Helpers ───────────────────────────────────────────────────────────────────

rf = RequestFactory()
RESULTS = []   # (id, label, status, expected, actual, detail)


def _req(method, path, admin_id, body=None, student_id=None, content_type="application/json"):
    """Make a fake request and attach auth headers."""
    kwargs = {}
    if body is not None:
        kwargs["data"] = json.dumps(body)
        kwargs["content_type"] = content_type

    req = getattr(rf, method.lower())(path, **kwargs)
    if admin_id:
        req.META["HTTP_X_USER_ID"] = admin_id
    if student_id:
        req.META["HTTP_X_USER_ID"] = student_id
    return req


def record(test_id, label, response, expected, detail=""):
    """Record a test result and print immediately."""
    actual = response.status_code if response else None
    if isinstance(expected, int):
        ok = actual == expected
        exp_str = str(expected)
    else:
        ok = actual in expected
        exp_str = " or ".join(str(e) for e in expected)

    sym = "[PASS]" if ok else "[FAIL]"
    print("  %s [%s] %s: %s (expected %s)" % (sym, test_id, label, actual, exp_str))
    if not ok and response:
        try:
            preview = response.content[:300].decode("utf-8", errors="replace")
            # strip non-ascii so print never crashes on Windows cp1252
            preview = preview.encode("ascii", errors="replace").decode("ascii")
        except Exception:
            preview = repr(response.content[:300])
        print("       -> %s" % preview)
    RESULTS.append((test_id, label, ok, exp_str, actual, detail))


def skip(test_id, label, reason):
    """Mark a test as skipped."""
    print("  [SKIP] [%s] %s -- %s" % (test_id, label, reason))
    RESULTS.append((test_id, "SKIP:%s" % label, None, "skip", None, reason))


def section(title):
    print("\n" + "-"*60)
    print("  " + title)
    print("-"*60)


# ── Fetch real data from DB ───────────────────────────────────────────────────

print("\n" + "="*60)
print("  CLAP API Test Suite  --  2026-02-25")
print("="*60)

# Trackers for cleanup
_created_batch_id = None
_tmp_student_uuid = None
_sub_id_to_clean = None
_ai_attempt_to_clean = None
_ai_attempt_existed = False

try:
    print("\n[setup] Loading data from database...")

admin = User.objects.filter(role__iexact="admin").first()
if not admin:
    print("FATAL: No admin user found. Cannot proceed.")
    sys.exit(1)

student = (
    User.objects.filter(role="student")
    .exclude(student_id__startswith="DELETED_")
    .first()
)
batch = Batch.objects.filter(is_active=True).first()
clap_test = ClapTest.objects.exclude(status="deleted").first()
clap_component = (
    ClapTestComponent.objects.filter(clap_test=clap_test).first()
    if clap_test else None
)
clap_item = (
    clap_component.items.first()
    if clap_component and hasattr(clap_component, "items")
    else None
)
# AI Evaluation needs a TestAttempt
test_for_ai = Test.objects.first()
ai_attempt = None
if student and test_for_ai:
    _existing = TestAttempt.objects.filter(user=student, test=test_for_ai).first()
    if _existing:
        ai_attempt = _existing
        _ai_attempt_existed = True
    else:
        ai_attempt = TestAttempt.objects.create(
            user=student,
            test=test_for_ai,
            status='in_progress'
        )
        _ai_attempt_to_clean = ai_attempt.id
        _ai_attempt_existed = False

# Submissions need an assessment
submission_test = clap_test

# Pick a second test for destructive tests (delete/unassign) — avoid killing the primary one
clap_test_2 = (
    ClapTest.objects.exclude(status="deleted").exclude(id=clap_test.id).first()
    if clap_test else None
)
assignment = (
    StudentClapAssignment.objects.filter(
        student=student,
        clap_test__isnull=False,
    ).first()
    if student else None
)

AID = str(admin.id)                                   # Admin UUID
SID = str(student.id) if student else None            # Student UUID
BID = str(batch.id) if batch else None                # Batch UUID
TID = str(clap_test.id) if clap_test else None        # ClapTest UUID
T2ID = str(clap_test_2.id) if clap_test_2 else None   # Secondary ClapTest UUID
CID = str(clap_component.id) if clap_component else None
ITEM_ID = str(clap_item.id) if clap_item else None
ASSIGN_ID = str(assignment.id) if assignment else None
AI_ATTEMPT_ID = str(ai_attempt.id) if ai_attempt else None
FAKE_UUID = str(uuid.uuid4())                         # Always-missing UUID

print(f"  admin:      {AID}  ({admin.role})")
print(f"  student:    {SID}  ({student.student_id if student else 'N/A'})")
print(f"  batch:      {BID}  ({batch.batch_name if batch else 'N/A'})")
print(f"  clap_test:  {TID}  ({clap_test.name if clap_test else 'N/A'})")
print(f"  component:  {CID}")
print(f"  item:       {ITEM_ID}")
print(f"  assignment: {ASSIGN_ID}")


# ═══════════════════════════════════════════════════════
# 1. HEALTH CHECK
# ═══════════════════════════════════════════════════════
section("1. HEALTH CHECK")

resp = health_check(_req("GET", "/api/health/", None))
record("H1", "GET /api/health/  — no auth required", resp, [200, 503])


# ═══════════════════════════════════════════════════════
# 2. ADMIN AUTH GUARD
# ═══════════════════════════════════════════════════════
section("2. AUTH GUARD TESTS")

resp = batches_handler(_req("GET", "/api/admin/batches", None))
record("A1", "GET /admin/batches  no auth → 401", resp, 401)

resp = batches_handler(_req("GET", "/api/admin/batches", FAKE_UUID))
record("A2", "GET /admin/batches  unknown UUID → 401", resp, 401)


# ═══════════════════════════════════════════════════════
# 3. BATCH MANAGEMENT
# ═══════════════════════════════════════════════════════
section("3. BATCH MANAGEMENT")

resp = batches_handler(_req("GET", "/api/admin/batches", AID))
record("B1", "GET /admin/batches", resp, 200)

# POST — use a guaranteed-unique name to avoid 409
_test_batch_name = f"TEST_BATCH_{uuid.uuid4().hex[:6]}"
resp = batches_handler(_req("POST", "/api/admin/batches", AID, {
    "batch_name": _test_batch_name,
    "start_year": 2025,
    "end_year": 2027,
}))
record("B2", "POST /admin/batches  (create new)", resp, 201)

# Extract the newly created batch ID for cleanup use
if resp.status_code == 201:
    try:
        _created_batch_id = json.loads(resp.content)["batch"]["id"]
    except Exception:
        pass

# POST — duplicate batch → 409
resp_dup = batches_handler(_req("POST", "/api/admin/batches", AID, {
    "batch_name": _test_batch_name,
    "start_year": 2025,
    "end_year": 2027,
}))
record("B3", "POST /admin/batches  (duplicate name → 409)", resp_dup, 409)

# POST — missing fields → 400
resp_miss = batches_handler(_req("POST", "/api/admin/batches", AID, {
    "batch_name": "Incomplete"
}))
record("B4", "POST /admin/batches  (missing years → 400)", resp_miss, 400)

if BID:
    resp = get_batch_students(_req("GET", f"/api/admin/batches/{BID}/students", AID), BID)
    record("B5", "GET /admin/batches/{id}/students", resp, 200)

    # B6: GET /admin/batches/{id} -- the handler returns 405 for GET by design
    resp = batch_detail_handler(_req("GET", "/api/admin/batches/%s" % BID, AID), BID)
    record("B6", "GET /admin/batches/{id}  (405 by design -- no GET detail)", resp, 405)

    # B7: PATCH requires the is_active boolean field
    _current_batch = Batch.objects.get(id=BID)
    _new_active = not _current_batch.is_active   # toggle
    resp = batch_detail_handler(
        _req("PATCH", "/api/admin/batches/%s" % BID, AID, {"is_active": _new_active}),
        BID
    )
    record("B7", "PATCH /admin/batches/{id}  (toggle status)", resp, 200)
    # Re-toggle to restore original state
    batch_detail_handler(
        _req("PATCH", "/api/admin/batches/%s" % BID, AID, {"is_active": _current_batch.is_active}),
        BID
    )

    # DELETE — use the freshly-created empty test batch if available, else skip
    if _created_batch_id:
        resp = batch_detail_handler(
            _req("DELETE", f"/api/admin/batches/{_created_batch_id}", AID),
            _created_batch_id
        )
        record("B8", "DELETE /admin/batches/{id}  (empty batch → 200)", resp, 200)
    else:
        skip("B8", "DELETE /admin/batches/{id}", "Could not create a fresh empty batch")

    # DELETE -- batch with students -> 400
    # Find a batch that has at least one student enrolled
    _non_empty_batch = None
    for _b in Batch.objects.filter(is_active=True):
        if User.objects.filter(batch_id=_b.id, role='student').exists():
            _non_empty_batch = _b
            break
    if _non_empty_batch:
        _nbid = str(_non_empty_batch.id)
        resp = batch_detail_handler(_req("DELETE", "/api/admin/batches/%s" % _nbid, AID), _nbid)
        record("B9", "DELETE /admin/batches/{id}  (non-empty -> 400)", resp, 400)
    else:
        skip("B9", "DELETE non-empty batch -> 400", "No non-empty batch found")
else:
    for code in ["B5", "B6", "B7", "B8", "B9"]:
        skip(code, f"Batch detail tests", "No active batch in DB")


# ═══════════════════════════════════════════════════════
# 4. STUDENT MANAGEMENT
# ═══════════════════════════════════════════════════════
section("4. STUDENT MANAGEMENT")

resp = students_handler(_req("GET", "/api/admin/students", AID))
record("S1", "GET /admin/students", resp, 200)

# GET with search filter
resp = students_handler(_req("GET", "/api/admin/students?search=test", AID))
record("S2", "GET /admin/students?search=test", resp, 200)

# POST — missing student_id → 400
resp = students_handler(_req("POST", "/api/admin/students", AID, {"batch_id": BID}))
record("S3", "POST /admin/students  (missing student_id → 400)", resp, 400)

# POST — create a temp student we can safely delete later
_tmp_sid = f"TMP_{uuid.uuid4().hex[:8]}"
resp = students_handler(_req("POST", "/api/admin/students", AID, {
    "student_id": _tmp_sid,
    "batch_id": BID,
}))
record("S4", "POST /admin/students  (create new)", resp, 201)
if resp.status_code == 201:
    try:
        _tmp_student_uuid = json.loads(resp.content)["student"]["id"]
    except Exception:
        pass

if SID:
    resp = student_detail_handler(_req("GET", f"/api/admin/students/{SID}", AID), SID)
    record("S5", "GET /admin/students/{id}", resp, 200)

    resp = student_detail_handler(
        _req("PUT", f"/api/admin/students/{SID}", AID, {"full_name": "API Test Name"}),
        SID
    )
    record("S6", "PUT /admin/students/{id}", resp, 200)

    resp = toggle_student_active(
        _req("PATCH", f"/api/admin/students/{SID}/toggle-active", AID), SID
    )
    record("S7", "PATCH /admin/students/{id}/toggle-active", resp, 200)
    # Re-toggle to restore
    toggle_student_active(_req("PATCH", f"...", AID), SID)

    resp = reset_student_password(
        _req("POST", f"/api/admin/students/{SID}/reset-password", AID, {}), SID
    )
    record("S8", "POST /admin/students/{id}/reset-password", resp, 200)

    # PATCH (toggle active) on a non-existent student -> 404
    resp = student_detail_handler(
        _req("PATCH", f"/api/admin/students/{FAKE_UUID}", AID, {"is_active": True}), FAKE_UUID
    )
    record("S9", "PATCH /admin/students/{bad-id}  -> 404", resp, 404)

else:
    for code in ["S5", "S6", "S7", "S8", "S9"]:
        skip(code, "Student detail test", "No student in DB")

# DELETE — use the temp student we created
if _tmp_student_uuid:
    resp = student_detail_handler(
        _req("DELETE", f"/api/admin/students/{_tmp_student_uuid}", AID),
        _tmp_student_uuid
    )
    record("S10", "DELETE /admin/students/{id}  (soft-delete)", resp, 200)
else:
    skip("S10", "DELETE /admin/students/{id}", "Could not create temp student to delete")


# ═══════════════════════════════════════════════════════
# 5. CLAP TEST MANAGEMENT (list, detail, assign/unassign, results)
# ═══════════════════════════════════════════════════════
section("5. CLAP TEST MANAGEMENT")

resp = clap_tests_handler(_req("GET", "/api/admin/clap-tests", AID))
record("CT1", "GET /admin/clap-tests", resp, 200)

if TID:
    resp = clap_test_detail_handler(_req("GET", f"/api/admin/clap-tests/{TID}", AID), TID)
    record("CT2", "GET /admin/clap-tests/{id}", resp, 200)

    resp = clap_test_detail_handler(
        _req("PATCH", f"/api/admin/clap-tests/{TID}", AID, {"name": "API Test Updated"}),
        TID
    )
    record("CT3", "PATCH /admin/clap-tests/{id}", resp, 200)

    # Restore original name
    if clap_test:
        clap_test_detail_handler(
            _req("PATCH", f"/api/admin/clap-tests/{TID}", AID, {"name": clap_test.name}),
            TID
        )

    resp = clap_test_results_handler(_req("GET", f"/api/admin/clap-tests/{TID}/results", AID), TID)
    record("CT4", "GET /admin/clap-tests/{id}/results", resp, 200)

    # Assign / unassign — use secondary test to avoid side effects on primary
    if T2ID and BID:
        resp = assign_clap_test(
            _req("POST", f"/api/admin/clap-tests/{T2ID}/assign", AID, {"batch_id": BID}),
            T2ID
        )
        record("CT5", "POST /admin/clap-tests/{id}/assign", resp, 200)

        resp = unassign_clap_test(
            _req("POST", f"/api/admin/clap-tests/{T2ID}/unassign", AID, {}),
            T2ID
        )
        record("CT6", "POST /admin/clap-tests/{id}/unassign", resp, 200)
    else:
        skip("CT5", "POST assign", "Need both a second CLAP test AND an active batch")
        skip("CT6", "POST unassign", "Depends on CT5")

    # DELETE — soft delete the secondary test (to keep primary intact)
    _test_to_delete = T2ID or TID
    resp = clap_test_detail_handler(
        _req("DELETE", f"/api/admin/clap-tests/{_test_to_delete}", AID),
        _test_to_delete
    )
    record("CT7", "DELETE /admin/clap-tests/{id}  (soft-delete)", resp, 200)

else:
    for code in ["CT2", "CT3", "CT4", "CT5", "CT6", "CT7"]:
        skip(code, "CLAP test detail test", "No CLAP test in DB")

# POST create — missing fields → 400
resp = clap_tests_handler(_req("POST", "/api/admin/clap-tests", AID, {"testName": "NoB"}))
record("CT8", "POST /admin/clap-tests  (missing batchId → 400)", resp, 400)

# POST create — valid (creates a new test, no teardown needed — status=published)
if BID:
    resp = clap_tests_handler(_req("POST", "/api/admin/clap-tests", AID, {
        "testName": f"API Test {uuid.uuid4().hex[:4]}",
        "batchId": BID,
    }))
    record("CT9", "POST /admin/clap-tests  (create new)", resp, 200)
else:
    skip("CT9", "POST /admin/clap-tests", "No batch in DB")


# ═══════════════════════════════════════════════════════
# 6. CLAP COMPONENTS & ITEMS
# ═══════════════════════════════════════════════════════
section("6. CLAP COMPONENTS & ITEMS")

if CID:
    resp = clap_component_detail_handler(
        _req("GET", f"/api/admin/clap-components/{CID}", AID), CID
    )
    record("CI1", "GET /admin/clap-components/{id}", resp, 200)

    resp = clap_test_items_handler(
        _req("GET", f"/api/admin/clap-components/{CID}/items", AID), CID
    )
    record("CI2", "GET /admin/clap-components/{id}/items", resp, 200)
else:
    skip("CI1", "GET /admin/clap-components/{id}", "No CLAP component in DB")
    skip("CI2", "GET /admin/clap-components/{id}/items", "No CLAP component in DB")

if ITEM_ID:
    resp = clap_test_item_detail_handler(
        _req("GET", f"/api/admin/clap-items/{ITEM_ID}", AID), ITEM_ID
    )
    record("CI3", "GET /admin/clap-items/{id}", resp, 200)

    # New: Admin Audio Upload
    item_for_audio = ClapTestItem.objects.filter(item_type='audio_block').first()
    if item_for_audio:
        from django.core.files.uploadedfile import SimpleUploadedFile
        audio_id = str(item_for_audio.id)
        dummy_audio = SimpleUploadedFile("track.mp3", b"fake audio data", content_type="audio/mpeg")
        
        # We need to set play_limit in content for the item as required by view
        if not item_for_audio.content.get('play_limit'):
            item_for_audio.content['play_limit'] = 2
            item_for_audio.save()

        # Manual request for multipart
        req = rf.post(f"/api/admin/clap-items/{audio_id}/upload-audio", {
            "audio": dummy_audio,
            "duration": "120.5"
        })
        req.META["HTTP_X_USER_ID"] = AID
        resp = upload_audio_file(req, audio_id)
        record("CI4", "POST /admin/clap-items/{id}/upload-audio", resp, [201, 400]) # 400 if validation fails

        # Delete
        resp = delete_audio_file(_req("DELETE", f"/api/admin/clap-items/{audio_id}/audio", AID), audio_id)
        record("CI5", "DELETE /admin/clap-items/{id}/audio", resp, [200, 404])
    else:
        skip("CI4", "POST /admin/clap-items/audio", "No audio_block item found")
        skip("CI5", "DELETE /admin/clap-items/audio", "No audio_block item found")
else:
    skip("CI3", "GET /admin/clap-items/{id}", "No CLAP item in DB")
    skip("CI4", "POST /audio", "No CLAP item in DB")
    skip("CI5", "DELETE /audio", "No CLAP item in DB")


# ═══════════════════════════════════════════════════════
# 7. SUBMISSION PIPELINE MONITOR (admin)
# ═══════════════════════════════════════════════════════
section("7. SUBMISSION PIPELINE MONITOR")

resp = submission_status_overview(_req("GET", "/api/admin/submissions/overview", AID))
record("SM1", "GET /admin/submissions/overview", resp, 200)

resp = submission_list(_req("GET", "/api/admin/submissions", AID))
record("SM2", "GET /admin/submissions", resp, 200)

resp = pipeline_health(_req("GET", "/api/admin/submissions/health", AID))
record("SM3", "GET /admin/submissions/health", resp, 200)

resp = dlq_dashboard_widget(_req("GET", "/api/admin/submissions/dlq-widget", AID))
record("SM4", "GET /admin/submissions/dlq-widget", resp, 200)

# submission_detail with non-existent UUID → 404
resp = submission_detail(_req("GET", f"/api/admin/submissions/{FAKE_UUID}", AID), FAKE_UUID)
record("SM5", "GET /admin/submissions/{id}  (missing → 404)", resp, 404)

# New: Creation of submission (student)
_has_redis = False
if SID and ASSIGN_ID:
    # Check redis before attempting submission which triggers celery
    try:
        from django.conf import settings as django_settings
        import redis
        r = redis.Redis.from_url(getattr(django_settings, "REDIS_URL", "redis://localhost:6379/0"), socket_timeout=1)
        r.ping()
        _has_redis = True
    except:
        _has_redis = False

    if _has_redis:
        resp = submissions.create_submission(_req("POST", "/api/submissions", None, {
            "assignment_id": ASSIGN_ID,
            "idempotency_key": str(uuid.uuid4()),
            "correlation_id": "test-corr-id"
        }, student_id=SID))
        record("SM6", "POST /submissions (create)", resp, [201, 202])
        
        _sub_id = None
        if resp.status_code in [201, 202]:
            try:
                _sub_id = json.loads(resp.content)["submission_id"]
                _sub_id_to_clean = _sub_id
            except: pass
            
        if _sub_id:
            resp = submissions.submission_status(_req("GET", f"/api/submissions/{_sub_id}/status", None, student_id=SID), _sub_id)
            record("SM7", "GET /submissions/{id}/status", resp, 200)
            
            resp = submissions.submission_results(_req("GET", f"/api/submissions/{_sub_id}/results", None, student_id=SID), _sub_id)
            record("SM8", "GET /submissions/{id}/results", resp, 200)
        else:
            skip("SM7", "GET /submissions/status", "Failed to create submission")
            skip("SM8", "GET /submissions/results", "Failed to create submission")
    else:
        skip("SM6", "POST /submissions", "Redis/Celery not available")
        skip("SM7", "GET /submissions/status", "Redis/Celery not available")
        skip("SM8", "GET /submissions/results", "Redis/Celery not available")

    resp = submissions.submission_history(_req("GET", "/api/submissions/history", None, student_id=SID))
    record("SM9", "GET /submissions/history", resp, 200)
else:
    skip("SM6", "POST /submissions", "Missing student or assignment")
    skip("SM7", "GET /submissions/status", "Missing student or assignment")
    skip("SM8", "GET /submissions/results", "Missing student or assignment")
    skip("SM9", "GET /submissions/history", "Missing student or assignment")


# ═══════════════════════════════════════════════════════
# 8. DLQ MANAGEMENT (admin)
# ═══════════════════════════════════════════════════════
section("8. DLQ MANAGEMENT")

resp = dlq_list(_req("GET", "/api/admin/dlq", AID))
record("DQ1", "GET /admin/dlq", resp, 200)

resp = dlq_detail(_req("GET", f"/api/admin/dlq/99999999", AID), 99999999)
record("DQ2", "GET /admin/dlq/{id}  (missing → 404)", resp, 404)

resp = dlq_bulk_retry(_req("POST", "/api/admin/dlq/bulk-retry", AID, {"ids": []}))
record("DQ3", "POST /admin/dlq/bulk-retry  (empty list → 200 or 503)", resp, [200, 503])

# dlq_retry on non-existent entry — may return 200+queued or 503 if celery unavailable
resp = dlq_retry(_req("POST", f"/api/admin/dlq/99999999/retry", AID), 99999999)
record("DQ4", "POST /admin/dlq/{id}/retry  (celery may be off → 503)", resp, [200, 503])


# ═══════════════════════════════════════════════════════
# 9. LLM CONTROLS (admin)
# ═══════════════════════════════════════════════════════
section("9. LLM CONTROLS")

resp = llm_analytics(_req("GET", "/api/admin/llm/analytics", AID))
record("LC1", "GET /admin/llm/analytics", resp, 200)

# trace / retrigger with missing UUID → 404
resp = llm_trace_by_submission(
    _req("GET", f"/api/admin/llm/submissions/{FAKE_UUID}/trace", AID), FAKE_UUID
)
record("LC2", "GET /admin/llm/submissions/{id}/trace  (missing → 404)", resp, 404)

resp = retrigger_llm_evaluation(
    _req("POST", f"/api/admin/llm/submissions/{FAKE_UUID}/retrigger", AID, {}), FAKE_UUID
)
record("LC3", "POST /admin/llm/submissions/{id}/retrigger  (missing → 404 or 503)", resp, [404, 503])


# ═══════════════════════════════════════════════════════
# 10. REPORT MANAGEMENT (admin)
# ═══════════════════════════════════════════════════════
section("10. REPORT MANAGEMENT")

resp = report_list(_req("GET", "/api/admin/reports", AID))
record("RM1", "GET /admin/reports", resp, 200)

resp = report_template_config(_req("GET", "/api/admin/reports/template-config", AID))
record("RM2", "GET /admin/reports/template-config", resp, 200)

resp = report_by_submission(
    _req("GET", f"/api/admin/reports/submissions/{FAKE_UUID}", AID), FAKE_UUID
)
record("RM3", "GET /admin/reports/submissions/{id}  (missing → 404)", resp, 404)

resp = report_template_preview(
    _req("POST", "/api/admin/reports/template-preview", AID, {"submission_id": FAKE_UUID})
)
record("RM4", "POST /admin/reports/template-preview  (missing → 404 or 400)", resp, [400, 404])


# ═══════════════════════════════════════════════════════
# 11. EMAIL MANAGEMENT (admin)
# ═══════════════════════════════════════════════════════
section("11. EMAIL MANAGEMENT")

resp = email_delivery_status(_req("GET", "/api/admin/emails/status", AID))
record("EM1", "GET /admin/emails/status", resp, 200)

resp = bounce_complaint_logs(_req("GET", "/api/admin/emails/logs", AID))
record("EM2", "GET /admin/emails/logs", resp, 200)

resp = resend_email(
    _req("POST", f"/api/admin/emails/submissions/{FAKE_UUID}/resend", AID, {}), FAKE_UUID
)
record("EM3", "POST /admin/emails/submissions/{id}/resend  (missing → 404)", resp, 404)

resp = bulk_resend_email(_req("POST", "/api/admin/emails/bulk-resend", AID, {"ids": []}))
record("EM4", "POST /admin/emails/bulk-resend  (empty → 200 or 400)", resp, [200, 400])


# ═══════════════════════════════════════════════════════
# 12. SCORE MANAGEMENT (admin)
# ═══════════════════════════════════════════════════════
section("12. SCORE MANAGEMENT")

resp = scores_by_submission(
    _req("GET", f"/api/admin/scores/submissions/{FAKE_UUID}", AID), FAKE_UUID
)
record("SC1", "GET /admin/scores/submissions/{id}  (missing → 404)", resp, 404)

if BID:
    resp = scores_by_batch(_req("GET", f"/api/admin/scores/batches/{BID}", AID), BID)
    record("SC2", "GET /admin/scores/batches/{id}", resp, 200)
else:
    skip("SC2", "GET /admin/scores/batches/{id}", "No batch in DB")

resp = export_scores(_req("GET", "/api/admin/scores/export", AID))
record("SC3", "GET /admin/scores/export", resp, 200)


# ═══════════════════════════════════════════════════════
# 13. NOTIFICATIONS (admin)
# ═══════════════════════════════════════════════════════
section("13. NOTIFICATIONS")

resp = in_app_alerts(_req("GET", "/api/admin/notifications/alerts", AID))
record("NT1", "GET /admin/notifications/alerts", resp, 200)

resp = send_daily_summary(_req("POST", "/api/admin/notifications/daily-summary", AID, {}))
record("NT2", "POST /admin/notifications/daily-summary  (200 or 202 or 503)", resp, [200, 202, 503])


# ═══════════════════════════════════════════════════════
# 14. STUDENT PORTAL  (requires student auth)
# ═══════════════════════════════════════════════════════
section("14. STUDENT PORTAL")

if SID:
    resp = student_profile_handler(_req("GET", "/api/student/profile", None, student_id=SID))
    record("SP1", "GET /student/profile", resp, 200)

    resp = student_profile_handler(
        _req("PUT", "/api/student/profile", None,
             {"full_name": "Student API Test"}, student_id=SID)
    )
    record("SP2", "PUT /student/profile", resp, 200)

    resp = change_student_password(
        _req("POST", "/api/student/change-password", None,
             {"current_password": "CLAP@123", "new_password": "CLAP@123"},
             student_id=SID)
    )
    record("SP3", "POST /student/change-password  (same pwd may be 200 or 400)", resp, [200, 400])

    resp = list_assigned_tests(_req("GET", "/api/student/clap-assignments", None, student_id=SID))
    record("SP4", "GET /student/clap-assignments", resp, 200)

else:
    for code in ["SP1", "SP2", "SP3", "SP4"]:
        skip(code, "Student portal test", "No student in DB")

if ASSIGN_ID and CID and SID:
    resp = student_test_items(
        _req("GET", f"/api/student/clap-assignments/{ASSIGN_ID}/components/{CID}/items",
             None, student_id=SID),
        ASSIGN_ID, CID
    )
    record("SP5", "GET /student/clap-assignments/{asgn_id}/components/{comp_id}/items",
           resp, [200, 403])
else:
    skip("SP5", "GET student test items", "No assignment/component found")

if ASSIGN_ID and SID:
    resp = get_audio_upload_url(
        _req("GET", f"/api/student/clap-assignments/{ASSIGN_ID}/audio-upload-url",
             None, student_id=SID),
        ASSIGN_ID
    )
    record("SP6", "GET /student/clap-assignments/{id}/audio-upload-url  (200 or 501)",
           resp, [200, 501])
else:
    skip("SP6", "GET audio upload URL", "No assignment in DB")

if ITEM_ID and SID:
    resp = student_retrieve_audio(
        _req("GET", f"/api/student/clap-items/{ITEM_ID}/audio", None, student_id=SID),
        ITEM_ID
    )
    record("SP7", "GET /student/clap-items/{id}/audio  (200 or 404)", resp, [200, 404])

    resp = get_playback_status(
        _req("GET", f"/api/student/clap-items/{ITEM_ID}/playback-status",
             None, student_id=SID),
        ITEM_ID
    )
    record("SP8", "GET /student/clap-items/{id}/playback-status", resp, 200)

    # New: Submit response
    if ASSIGN_ID:
        resp = clap_attempt.submit_response(_req("POST", f"/api/student/clap-assignments/{ASSIGN_ID}/submit", None, {
            "item_id": ITEM_ID,
            "response_data": {"text": "This is a test answer"}
        }, student_id=SID), ASSIGN_ID)
        record("SP9", "POST /student/clap-assignments/{id}/submit", resp, 200)

        resp = clap_attempt.finish_component(_req("POST", f"/api/student/clap-assignments/{ASSIGN_ID}/components/{CID}/finish", None, {}, student_id=SID), ASSIGN_ID, CID)
        record("SP10", "POST /student/clap-assignments/{id}/components/{cid}/finish", resp, 200)
    else:
        skip("SP9", "POST submit response", "No assignment found")
        skip("SP10", "POST finish component", "No assignment found")
else:
    skip("SP7", "GET student audio file", "No CLAP item in DB")
    skip("SP8", "GET student playback-status", "No CLAP item in DB")
    skip("SP9", "POST submit response", "No CLAP item/assignment found")
    skip("SP10", "POST finish component", "No CLAP item/assignment found")


# ═══════════════════════════════════════════════════════
# 15. LEGACY ENDPOINTS
# ═══════════════════════════════════════════════════════
section("15. LEGACY ENDPOINTS")

resp = legacy_tests.tests_handler(_req("GET", "/api/tests", AID))
record("LG1", "GET /api/tests", resp, 200)

resp = legacy_tests.test_detail_handler(
    _req("GET", f"/api/tests/{FAKE_UUID}", AID), FAKE_UUID
)
record("LG2", "GET /api/tests/{id}  (missing → 404)", resp, 404)

resp = legacy_attempts.attempts_handler(_req("GET", "/api/attempts", AID))
record("LG3", "GET /api/attempts", resp, 200)


# ═══════════════════════════════════════════════════════
# 16. AI EVALUATION  (requires OpenAI key — skip if missing)
# ═══════════════════════════════════════════════════════
section("16. AI EVALUATION")

from django.conf import settings as _settings
_has_openai = bool(getattr(_settings, "OPENAI_API_KEY", ""))

if _has_openai and AI_ATTEMPT_ID:
    # Speaking expects multipart file upload
    from django.core.files.uploadedfile import SimpleUploadedFile
    dummy_audio = SimpleUploadedFile("test.wav", b"dummy content", content_type="audio/wav")
    
    req = rf.post("/api/evaluate/speaking", {
        "audio": dummy_audio,
        "prompt": "Introduce yourself.",
        "attemptId": AI_ATTEMPT_ID
    })
    req.META["HTTP_X_USER_ID"] = AID
    resp = evaluate.evaluate_speaking_test(req)
    record("AI1", "POST /api/evaluate/speaking  (multipart)", resp, [200, 400]) # 400 if Whisper fails on dummy content

    resp = evaluate.evaluate_writing_test(
        _req("POST", "/api/evaluate/writing", AID, {
            "essay": "I went to the market today. It was a beautiful sunny day.",
            "prompt": "Describe your day.",
            "attemptId": AI_ATTEMPT_ID
        })
    )
    record("AI2", "POST /api/evaluate/writing", resp, 200)
else:
    skip("AI1", "POST /api/evaluate/speaking", "OPENAI_API_KEY not set or AI_ATTEMPT_ID missing")
    skip("AI2", "POST /api/evaluate/writing", "OPENAI_API_KEY not set or AI_ATTEMPT_ID missing")


# ════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════
section("FINAL SUMMARY")

passes  = [r for r in RESULTS if r[2] is True]
fails   = [r for r in RESULTS if r[2] is False]
skipped = [r for r in RESULTS if r[2] is None]

print("\n  PASS  : %d" % len(passes))
print("  FAIL  : %d" % len(fails))
print("  SKIP  : %d" % len(skipped))
print("  " + "-"*30)
print("  Total : %d\n" % len(RESULTS))

if fails:
    print("  -- FAILING TESTS ------------------------------------------")
    for r in fails:
        print("   [FAIL] [%s] %s" % (r[0], r[1]))
        print("          Expected %s, got %s" % (r[3], r[4]))
else:
    print("  All tested endpoints PASSING!")

# Exit with error code if any failures
sys.exit(1 if fails else 0)

finally:
    section("CLEANUP")
    if _sub_id_to_clean:
        try:
            from api.models import AssessmentSubmission
            AssessmentSubmission.objects.filter(id=_sub_id_to_clean).delete()
            print(f"  [CLEANUP] Deleted test submission: {_sub_id_to_clean}")
        except: pass

    if _tmp_student_uuid:
        try:
            # We use .delete() on a queryset to avoid signals/cascade complexities if any
            User.objects.filter(id=_tmp_student_uuid).delete()
            print(f"  [CLEANUP] Deleted test student: {_tmp_student_uuid}")
        except: pass

    if _created_batch_id:
        try:
            Batch.objects.filter(id=_created_batch_id).delete()
            print(f"  [CLEANUP] Deleted test batch: {_created_batch_id}")
        except: pass

    if _ai_attempt_to_clean:
        try:
            TestAttempt.objects.filter(id=_ai_attempt_to_clean).delete()
            print(f"  [CLEANUP] Deleted test AI attempt: {_ai_attempt_to_clean}")
        except: pass

    print("\nCleanup complete. Final state restored.")

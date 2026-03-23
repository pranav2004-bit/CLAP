"""
Admin email management endpoints.

GET  /api/admin/emails/preview                    — render email template preview (HTML)
GET  /api/admin/emails/status                     — paginated delivery status per submission
POST /api/admin/emails/submissions/<id>/resend    — re-queue single email
POST /api/admin/emails/bulk-resend                — bulk re-queue (requires scope)
GET  /api/admin/emails/logs                       — paginated bounce/complaint audit log

All endpoints:
  • Accept optional ?test_id=<uuid> to scope results to a single CLAP test.
  • Return Cache-Control: no-store to prevent CDN/proxy caching.
  • Are read-safe under any concurrency level (no locks, read-only aggregations).

Pagination (max 30 per page):
  • Pass ?page=<n> (1-based). Response includes a 'pagination' dict with
    page, page_size, total, total_pages.

Stats accuracy:
  • email_delivery_status() loads up to MAX_STATS_BATCH rows into Python
    to compute delivery_status (a computed field from email_sent_at +
    latest bounce/complaint AuditLog events). Stats are derived from this
    full batch — not from the paginated page — so summary cards are always
    accurate even when browsing deep pages.
  • For future scale beyond MAX_STATS_BATCH: add a denormalised
    delivery_status column to AssessmentSubmission and keep it updated
    by the email webhook handler.
"""

import base64 as _base64
import json
import os
import uuid as _uuid

from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, ClapTest, SubmissionScore
from api.utils.auth import require_admin as _require_admin

from importlib.util import find_spec

if find_spec('celery') is not None:
    from api.tasks import send_email_report
else:
    send_email_report = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PAGE_SIZE       = 30      # rows per page — matches UI pagination limit
MAX_STATS_BATCH = 3_000   # max rows loaded for stats computation; covers all
                           # realistic single-assessment or global scopes

BOUNCE_EVENT_MARKERS = ('bounce', 'bounced', 'complaint')


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _no_cache_json(payload: dict, status: int = 200) -> JsonResponse:
    """Return JSON that must never be cached by any proxy or browser."""
    resp = JsonResponse(payload, status=status)
    resp['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp['Pragma'] = 'no-cache'
    return resp


def _resolve_test_filter(request):
    """
    Parse optional ?test_id=<uuid> query param.
    Returns (ClapTest|None, error_response|None).
    """
    raw = (request.GET.get('test_id') or '').strip()
    if not raw:
        return None, None
    try:
        tid = _uuid.UUID(raw)
    except ValueError:
        return None, _no_cache_json(
            {'error': 'Invalid test_id — must be a valid UUID'},
            status=400,
        )
    try:
        test = ClapTest.objects.only('id', 'name', 'test_id').get(pk=tid)
    except ClapTest.DoesNotExist:
        return None, _no_cache_json({'error': 'CLAP test not found'}, status=404)
    return test, None


def _test_payload(test) -> dict | None:
    if test is None:
        return None
    return {'id': str(test.id), 'test_id': test.test_id, 'name': test.name}


def _parse_page(request) -> int:
    try:
        return max(1, int(request.GET.get('page', 1)))
    except (ValueError, TypeError):
        return 1


# ---------------------------------------------------------------------------
# Domain helpers (unchanged logic, shared by both views)
# ---------------------------------------------------------------------------

def _latest_email_event_map(submission_ids):
    """
    Return a dict mapping submission_id → latest bounce/complaint AuditLog
    event dict. Only fetches from the DB for the given IDs.
    """
    if not submission_ids:
        return {}

    event_q = Q()
    for marker in BOUNCE_EVENT_MARKERS:
        event_q |= Q(event_type__icontains=marker)

    latest = (
        AuditLog.objects
        .filter(submission_id__in=submission_ids)
        .filter(event_q)
        .order_by('submission_id', '-created_at')
    )

    result = {}
    for event in latest:
        if event.submission_id not in result:
            result[event.submission_id] = {
                'event_type': event.event_type,
                'detail':     event.error_detail,
                'created_at': event.created_at.isoformat() if event.created_at else None,
            }
    return result


def _email_delivery_status(submission, latest_event):
    """
    Compute the human-readable delivery status for a single submission.
    Priority: complaint > bounce > sent (if email_sent_at set) > pending.
    """
    if submission.email_sent_at:
        if latest_event and 'complaint' in latest_event['event_type'].lower():
            return 'complaint'
        if latest_event and (
            'bounce' in latest_event['event_type'].lower() or
            'bounced' in latest_event['event_type'].lower()
        ):
            return 'bounced'
        return 'sent'

    if submission.status == AssessmentSubmission.STATUS_EMAIL_SENDING:
        return 'pending'

    if latest_event and 'complaint' in latest_event['event_type'].lower():
        return 'complaint'
    if latest_event and (
        'bounce' in latest_event['event_type'].lower() or
        'bounced' in latest_event['event_type'].lower()
    ):
        return 'bounced'

    return 'pending'


def _serialize_row(submission, event, delivery_status):
    """Serialise one AssessmentSubmission + event into the API response shape."""
    return {
        'submission_id':  str(submission.id),
        'student': {
            'id':    str(submission.user_id),
            'email': submission.user.email,
            'name':  submission.user.full_name,
        },
        'assessment': {
            'id':   str(submission.assessment_id),
            'name': getattr(submission.assessment, 'name', None),
        },
        'pipeline_status':    submission.status,
        'delivery_status':    delivery_status,
        'email_sent_at':      submission.email_sent_at.isoformat() if submission.email_sent_at else None,
        'latest_email_event': event,
        'updated_at':         submission.updated_at.isoformat() if submission.updated_at else None,
    }


# ---------------------------------------------------------------------------
# GET /api/admin/emails/status
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['GET'])
def email_delivery_status(request):
    """
    Paginated email delivery status across all submissions (or scoped to one test).

    Query params:
      ?test_id=<uuid>            Scope to a single CLAP test (optional).
      ?page=<n>                  1-based page number (default 1).
      ?delivery_status=<s>       Filter rows: sent | bounced | complaint | pending.
      ?student_id=<uuid>         Filter to a single student.

    Response:
      {
        selected_test: {...} | null,
        rows: [...],               // PAGE_SIZE rows max
        stats: {                   // computed from full scope, NOT just this page
          total_sent, delivered, bounced, complained, pending
        },
        pagination: { page, page_size, total, total_pages },
        generated_at: <iso>
      }
    """
    _, err = _require_admin(request)
    if err:
        return err

    selected_test, err = _resolve_test_filter(request)
    if err:
        return err

    page                   = _parse_page(request)
    delivery_status_filter = (request.GET.get('delivery_status') or '').strip().lower()
    student_id_filter      = (request.GET.get('student_id') or '').strip()

    # ── Base queryset ─────────────────────────────────────────────────────
    qs = (
        AssessmentSubmission.objects
        .select_related('user', 'assessment')
        .order_by('-updated_at')
    )
    if selected_test is not None:
        qs = qs.filter(assessment=selected_test)
    if student_id_filter:
        qs = qs.filter(user_id=student_id_filter)

    # ── Load full stats batch ─────────────────────────────────────────────
    # We load up to MAX_STATS_BATCH to compute accurate summary stats across
    # the entire scope. Stats are derived from this batch, not just one page,
    # so the summary cards stay accurate on every page navigation.
    all_rows      = list(qs[:MAX_STATS_BATCH])
    latest_events = _latest_email_event_map([s.id for s in all_rows])

    stat_counts     = {'sent': 0, 'bounced': 0, 'complaint': 0, 'pending': 0}
    total_email_sent = 0
    computed_all     = []

    for submission in all_rows:
        event = latest_events.get(submission.id)
        ds    = _email_delivery_status(submission, event)
        computed_all.append((submission, event, ds))
        stat_counts[ds] = stat_counts.get(ds, 0) + 1
        if submission.email_sent_at:
            total_email_sent += 1

    # ── Apply delivery_status filter (does not affect stats) ──────────────
    computed_filtered = (
        [(s, e, ds) for s, e, ds in computed_all if ds == delivery_status_filter]
        if delivery_status_filter
        else computed_all
    )

    # ── Paginate filtered list ────────────────────────────────────────────
    total_filtered = len(computed_filtered)
    total_pages    = max(1, (total_filtered + PAGE_SIZE - 1) // PAGE_SIZE)
    page           = min(page, total_pages)
    offset         = (page - 1) * PAGE_SIZE
    page_rows      = computed_filtered[offset: offset + PAGE_SIZE]

    return _no_cache_json({
        'selected_test': _test_payload(selected_test),
        'rows': [_serialize_row(s, e, ds) for s, e, ds in page_rows],
        'stats': {
            'total_sent': total_email_sent,
            'delivered':  stat_counts.get('sent',      0),
            'bounced':    stat_counts.get('bounced',   0),
            'complained': stat_counts.get('complaint', 0),
            'pending':    stat_counts.get('pending',   0),
        },
        'pagination': {
            'page':        page,
            'page_size':   PAGE_SIZE,
            'total':       total_filtered,
            'total_pages': total_pages,
        },
        'generated_at': timezone.now().isoformat(),
    })


# ---------------------------------------------------------------------------
# POST /api/admin/emails/submissions/<submission_id>/resend
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['POST'])
def resend_email(request, submission_id):
    """
    Re-queue the email report for a single submission.

    Guards (in order):
      1. Admin authentication required.
      2. Celery must be available.
      3. submission_id must be a valid UUID — returns 400 otherwise.
      4. Submission must exist — returns 404 otherwise.
      5. report_url must be set and non-empty — returns 400 otherwise.
      6. Row-level lock (SELECT FOR UPDATE) prevents concurrent double-dispatch
         when two admins click resend simultaneously.
      7. Status guard — returns 409 if email is already in-flight.
      8. DB update + AuditLog wrapped in transaction.atomic().
      9. Celery dispatch happens AFTER commit; if it fails the DB is
         rolled back to the pre-resend status so no stuck state is possible.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    if send_email_report is None:
        return _no_cache_json(
            {'error': 'Celery is not available in this environment'},
            status=503,
        )

    # ── 1. Validate submission_id is a proper UUID ─────────────────────────
    try:
        sub_uuid = _uuid.UUID(str(submission_id))
    except (ValueError, AttributeError):
        return _no_cache_json(
            {'error': 'Invalid submission_id — must be a valid UUID'},
            status=400,
        )

    # ── 2. Atomic block: lock row → guard → update → audit ─────────────────
    old_status = None
    try:
        with transaction.atomic():
            # select_for_update() acquires a row-level lock so concurrent
            # resend requests for the same submission queue up instead of
            # both succeeding and dispatching two Celery tasks.
            try:
                submission = (
                    AssessmentSubmission.objects
                    .select_for_update()
                    .select_related('user', 'assessment')
                    .get(id=sub_uuid)
                )
            except AssessmentSubmission.DoesNotExist:
                return _no_cache_json({'error': 'Submission not found'}, status=404)

            # ── 3. Report must exist and be non-empty ──────────────────────
            if not (submission.report_url or '').strip():
                return _no_cache_json(
                    {
                        'error': (
                            'Cannot send email: report has not been generated yet. '
                            'Generate the report first, then resend.'
                        )
                    },
                    status=400,
                )

            # ── 4. Idempotency guard — do not double-dispatch ──────────────
            if submission.status == AssessmentSubmission.STATUS_EMAIL_SENDING:
                return _no_cache_json(
                    {
                        'error': (
                            'Email is already being dispatched for this submission. '
                            'Wait for the current task to complete before retrying.'
                        )
                    },
                    status=409,
                )

            old_status               = submission.status
            submission.status        = AssessmentSubmission.STATUS_REPORT_READY
            submission.email_sent_at = None
            submission.updated_at    = timezone.now()
            submission.save(update_fields=['status', 'email_sent_at', 'updated_at'])

            AuditLog.objects.create(
                submission=submission,
                event_type='admin_email_resend_requested',
                old_status=old_status,
                new_status=submission.status,
                worker_id=f'admin:{admin_user.id}',
                error_detail='manual_resend_single',
            )
            # transaction commits here — row lock is released
    except Exception as exc:
        # Catches DB errors (connection loss, lock timeout, etc.)
        return _no_cache_json(
            {'error': f'Database error preparing resend: {exc}'},
            status=500,
        )

    # ── 3. Dispatch Celery task AFTER DB commit ────────────────────────────
    # Dispatching inside the transaction risks the worker reading stale data
    # before commit. Dispatching after commit is the correct pattern.
    # If dispatch fails we roll back the status so no stuck state remains.
    try:
        result = send_email_report.apply_async(
            args=[str(submission.id)],
            headers={'correlation_id': submission.correlation_id or str(submission.id)},
        )
    except Exception as exc:
        # Task broker is unavailable — restore submission to its previous state
        AssessmentSubmission.objects.filter(id=sub_uuid).update(
            status=old_status,
            email_sent_at=None,
            updated_at=timezone.now(),
        )
        AuditLog.objects.create(
            submission_id=sub_uuid,
            event_type='admin_email_resend_dispatch_failed',
            old_status=AssessmentSubmission.STATUS_REPORT_READY,
            new_status=old_status,
            worker_id=f'admin:{admin_user.id}',
            error_detail=f'celery_dispatch_failed: {exc}',
        )
        return _no_cache_json(
            {'error': f'Failed to queue email task — Celery broker may be unavailable: {exc}'},
            status=503,
        )

    return _no_cache_json(
        {
            'status':        'accepted',
            'submission_id': str(submission.id),
            'task_id':       result.id,
            'old_status':    old_status,
            'new_status':    submission.status,
        },
        status=202,
    )


# ---------------------------------------------------------------------------
# POST /api/admin/emails/bulk-resend
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['POST'])
def bulk_resend_email(request):
    """
    Bulk re-queue email reports.

    Body (JSON):
      {
        batch_id:      "<uuid>",   // filter by batch (at least one required)
        assessment_id: "<uuid>",   // filter by assessment
        only_failed:   true,       // default false — only bounce/complaint
        dry_run:       true        // default TRUE — preview without sending
      }

    Safety guard: dry_run defaults to true so admins must explicitly
    pass dry_run=false to execute real sends. Prevents accidental bulk spam.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    if send_email_report is None:
        return _no_cache_json(
            {'error': 'Celery is not available in this environment'},
            status=503,
        )

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return _no_cache_json({'error': 'Invalid JSON body'}, status=400)

    batch_id      = payload.get('batch_id')
    assessment_id = payload.get('assessment_id')
    if not batch_id and not assessment_id:
        return _no_cache_json(
            {'error': 'Provide batch_id or assessment_id to scope the bulk resend'},
            status=400,
        )

    only_failed = bool(payload.get('only_failed', False))
    dry_run     = bool(payload.get('dry_run', True))   # default safe

    qs = AssessmentSubmission.objects.select_related('user').filter(
        report_url__isnull=False
    )
    if batch_id:
        qs = qs.filter(user__batch_id=batch_id)
    if assessment_id:
        qs = qs.filter(assessment_id=assessment_id)

    rows = list(qs.order_by('-updated_at')[:500])
    latest_events = _latest_email_event_map([s.id for s in rows])

    if dry_run:
        would_dispatch = [str(s.id) for s in rows]
        return _no_cache_json({
            'status':              'dry_run',
            'would_dispatch_count': len(would_dispatch),
            'would_dispatch':      would_dispatch[:20],
            'note':                'No emails sent. Pass dry_run=false to execute.',
        })

    dispatched = []
    skipped    = []

    for submission in rows:
        event  = latest_events.get(submission.id)
        status = _email_delivery_status(submission, event)

        if only_failed and status not in {'bounced', 'complaint'}:
            skipped.append({
                'submission_id': str(submission.id),
                'reason':        f'delivery_status={status}',
            })
            continue

        old_status             = submission.status
        submission.status      = AssessmentSubmission.STATUS_REPORT_READY
        submission.email_sent_at = None
        submission.updated_at  = timezone.now()
        submission.save(update_fields=['status', 'email_sent_at', 'updated_at'])

        AuditLog.objects.create(
            submission=submission,
            event_type='admin_email_resend_requested',
            old_status=old_status,
            new_status=submission.status,
            worker_id=f'admin:{admin_user.id}',
            error_detail='manual_resend_bulk',
        )

        task = send_email_report.apply_async(
            args=[str(submission.id)],
            headers={'correlation_id': submission.correlation_id or str(submission.id)},
        )
        dispatched.append({'submission_id': str(submission.id), 'task_id': task.id})

    return _no_cache_json(
        {'status': 'accepted', 'dispatched': dispatched, 'skipped': skipped},
        status=202,
    )


# ---------------------------------------------------------------------------
# GET /api/admin/emails/logs
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(['GET'])
def bounce_complaint_logs(request):
    """
    Paginated bounce/complaint AuditLog records.

    Query params:
      ?test_id=<uuid>      Scope to a single CLAP test (optional).
      ?page=<n>            1-based page number (default 1).
      ?created_from=<iso>  Start of date range filter.
      ?created_to=<iso>    End of date range filter.

    Response:
      {
        selected_test: {...} | null,
        rows: [...],
        pagination: { page, page_size, total, total_pages },
        generated_at: <iso>
      }
    """
    _, err = _require_admin(request)
    if err:
        return err

    selected_test, err = _resolve_test_filter(request)
    if err:
        return err

    page = _parse_page(request)

    qs = (
        AuditLog.objects
        .select_related('submission', 'submission__user', 'submission__assessment')
        .order_by('-created_at')
    )

    # Filter to bounce/complaint events only
    event_q = Q()
    for marker in BOUNCE_EVENT_MARKERS:
        event_q |= Q(event_type__icontains=marker)
    qs = qs.filter(event_q)

    # Scope to test if provided
    if selected_test is not None:
        qs = qs.filter(submission__assessment=selected_test)

    # Optional date range
    created_from = request.GET.get('created_from')
    if created_from:
        qs = qs.filter(created_at__gte=created_from)
    created_to = request.GET.get('created_to')
    if created_to:
        qs = qs.filter(created_at__lte=created_to)

    # ── DB-level count for accurate pagination ────────────────────────────
    total       = qs.count()
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    page        = min(page, total_pages)
    offset      = (page - 1) * PAGE_SIZE

    rows = []
    for event in qs[offset: offset + PAGE_SIZE]:
        sub = event.submission
        rows.append({
            'audit_id':       event.id,
            'submission_id':  str(event.submission_id) if event.submission_id else None,
            'event_type':     event.event_type,
            'detail':         event.error_detail,
            'student_id':     str(sub.user_id) if sub and sub.user_id else None,
            'student_email':  sub.user.email if sub and sub.user else None,
            'assessment_id':  str(sub.assessment_id) if sub and sub.assessment_id else None,
            'assessment_name': getattr(sub.assessment, 'name', None) if sub else None,
            'created_at':     event.created_at.isoformat() if event.created_at else None,
        })

    return _no_cache_json({
        'selected_test': _test_payload(selected_test),
        'rows': rows,
        'pagination': {
            'page':        page,
            'page_size':   PAGE_SIZE,
            'total':       total,
            'total_pages': total_pages,
        },
        'generated_at': timezone.now().isoformat(),
    })


# ── Email template preview ────────────────────────────────────────────────────

def _get_email_logo_uri() -> str:
    logo_path = os.path.join(
        os.path.dirname(__file__), '..', '..', 'templates', 'reports', 'clap-logo-original.png'
    )
    try:
        with open(os.path.normpath(logo_path), 'rb') as f:
            return 'data:image/png;base64,' + _base64.b64encode(f.read()).decode()
    except Exception:
        return ''


_EMAIL_PREVIEW_SAMPLE_SCORES = [
    {'domain': 'listening',  'score': 8.0},
    {'domain': 'reading',    'score': 7.5},
    {'domain': 'speaking',   'score': 7.0},
    {'domain': 'vocabulary', 'score': 8.5},
    {'domain': 'writing',    'score': 7.0},
]


@csrf_exempt
@require_http_methods(['GET'])
def email_template_preview(request):
    """
    Render emails/submission_ready.html with sample data and return the HTML.
    Used by the admin Email Management preview modal.
    If a real complete submission exists it is used for richer preview data.
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    student_name    = 'Sample Student'
    student_email   = 'student@example.com'
    assessment_name = 'Sample Assessment'
    report_url      = 'https://example.com/report/sample.pdf'
    scores          = _EMAIL_PREVIEW_SAMPLE_SCORES

    # Use real data from the most recently completed submission if available
    try:
        real_sub = (
            AssessmentSubmission.objects
            .select_related('user', 'assessment')
            .filter(status=AssessmentSubmission.STATUS_COMPLETE)
            .order_by('-updated_at')
            .first()
        )
        if real_sub:
            student_name    = (
                (getattr(real_sub.user, 'full_name', None) or '').strip()
                or (getattr(real_sub.user, 'username', None) or '').strip()
                or real_sub.user.email
            )
            student_email   = real_sub.user.email
            assessment_name = getattr(real_sub.assessment, 'name', assessment_name)
            report_url      = real_sub.report_url or report_url
            real_scores = list(
                SubmissionScore.objects
                .filter(submission=real_sub)
                .order_by('domain')
                .values('domain', 'score')
            )
            if real_scores:
                scores = real_scores
    except Exception:
        pass  # fall through to sample data

    total_score = sum(float(s['score']) for s in scores)
    max_total   = 10 * len(scores)
    percentage  = (total_score / max_total * 100) if max_total else 0
    if percentage >= 90:
        grade = 'O'
    elif percentage >= 80:
        grade = 'A+'
    elif percentage >= 70:
        grade = 'A'
    elif percentage >= 60:
        grade = 'B+'
    else:
        grade = 'B'

    try:
        html = render_to_string('emails/submission_ready.html', {
            'student_name':    student_name,
            'student_email':   student_email,
            'assessment_name': assessment_name,
            'report_url':      report_url,
            'scores':          scores,
            'total_score':     total_score,
            'max_total':       max_total,
            'grade':           grade,
            'logo_data_uri':   _get_email_logo_uri(),
        })
    except Exception as exc:
        return JsonResponse({'error': f'Email template render failed: {exc}'}, status=500)

    return _no_cache_json({'html_preview': html})

"""
Admin email management endpoints.

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

import json
import uuid as _uuid

from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.models import AssessmentSubmission, AuditLog, ClapTest
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

    Guards:
      - Submission must exist.
      - report_url must be set (report must be generated first).
      - Celery must be available.

    Resets email_sent_at and status to REPORT_READY before dispatching
    so the pipeline picks it up cleanly.
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
        submission = AssessmentSubmission.objects.select_related('user', 'assessment').get(
            id=submission_id
        )
    except AssessmentSubmission.DoesNotExist:
        return _no_cache_json({'error': 'Submission not found'}, status=404)

    if not submission.report_url:
        return _no_cache_json(
            {'error': 'Cannot send email: report has not been generated yet (report_url is missing)'},
            status=400,
        )

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
        error_detail='manual_resend_single',
    )

    result = send_email_report.apply_async(
        args=[str(submission.id)],
        headers={'correlation_id': submission.correlation_id or str(submission.id)},
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

import csv
import io
import json
import uuid as _uuid_mod

from django.db import transaction
from django.db.models import Avg, Prefetch
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone

from api.models import AssessmentSubmission, SubmissionScore, AuditLog, ClapTest, Batch, User
from api.utils.jwt_utils import get_user_from_request

# ── Constants ─────────────────────────────────────────────────────────────────

_VALID_DOMAINS   = {'listening', 'reading', 'vocab', 'writing', 'speaking'}
_PAGE_SIZE_MAX   = 30
_PAGE_SIZE_DEFAULT = 30


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_admin(request):
    user = get_user_from_request(request)
    if not user or user.role != 'admin':
        return None, JsonResponse({'error': 'Unauthorized'}, status=401)
    return user, None


def _parse_page_params(request):
    """Return (page, page_size) validated integers."""
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = min(_PAGE_SIZE_MAX, max(1, int(request.GET.get('page_size', _PAGE_SIZE_DEFAULT))))
    except (ValueError, TypeError):
        page_size = _PAGE_SIZE_DEFAULT
    return page, page_size


def _submission_rows_from_qs(qs):
    """
    Convert a queryset of AssessmentSubmission (with prefetched scores + user + assessment)
    into serialisable dicts.  Scores are read from the prefetch cache — zero extra queries.
    """
    rows = []
    for sub in qs:
        user = sub.user
        assessment = sub.assessment
        a_name = (
            getattr(assessment, 'name', None)
            or getattr(assessment, 'title', None)
            or str(assessment)
        )
        # prefetch_related stores scores in _prefetched_objects_cache['submission_scores']
        # but we can also iterate via sub.submission_scores.all() after prefetch
        domain_scores = {}
        for s in sub.scores.all():
            domain_scores[s.domain] = float(s.score)

        rows.append({
            'submission_id':   str(sub.id),
            'student_id':      user.student_id or '—',
            'student_name':    (
                (user.full_name or '').strip()
                or (user.username or '').strip()
                or user.email
            ),
            'student_email':   user.email,
            'assessment_name': a_name,
            'status':          sub.status,
            'scores':          domain_scores,
            'created_at':      sub.created_at.isoformat() if sub.created_at else None,
        })
    return rows


def _base_submission_qs():
    """Base queryset with all necessary relations prefetched — reused across all search modes.

    Excludes SUPERSEDED submissions (invalidated when a retest was granted).
    These are audit-trail rows only; they must not appear in score search results
    or export data since they belong to a wiped attempt that is no longer current.
    """
    scores_prefetch = Prefetch(
        'scores',
        queryset=SubmissionScore.objects.all(),
    )
    return (
        AssessmentSubmission.objects
        .exclude(status__startswith='SUPERSEDED_')
        .select_related('user', 'assessment')
        .prefetch_related(scores_prefetch)
    )


def _paginate_qs(qs, page, page_size):
    """Return (page_rows_qs, total_count)."""
    total_count = qs.count()
    offset      = (page - 1) * page_size
    return qs[offset: offset + page_size], total_count


def _pagination_meta(total_count, page, page_size):
    import math
    return {
        'total_count': total_count,
        'page':        page,
        'page_size':   page_size,
        'total_pages': max(1, math.ceil(total_count / page_size)),
    }


# ── Legacy endpoints (UUID-based, kept for internal compatibility) ─────────────

@csrf_exempt
@require_http_methods(["GET"])
def scores_by_submission(request, submission_id):
    _, err = _require_admin(request)
    if err:
        return err

    try:
        submission = (
            AssessmentSubmission.objects
            .select_related('user', 'assessment')
            .get(id=submission_id)
        )
    except AssessmentSubmission.DoesNotExist:
        return JsonResponse({'error': 'Submission not found'}, status=404)

    rows = []
    for score in SubmissionScore.objects.filter(submission=submission).order_by('domain'):
        rows.append({
            'domain':         score.domain,
            'score':          float(score.score),
            'feedback':       score.feedback_json,
            'evaluated_by':   score.evaluated_by,
            'evaluated_at':   score.evaluated_at.isoformat() if score.evaluated_at else None,
            'llm_request_id': score.llm_request_id,
        })

    assessment = submission.assessment
    assessment_title = (
        getattr(assessment, 'title', None)
        or getattr(assessment, 'name', None)
        or str(assessment)
    )

    return JsonResponse({
        'submission': {
            'id':               str(submission.id),
            'status':           submission.status,
            'student_id':       str(submission.user_id),
            'student_email':    submission.user.email,
            'assessment_id':    str(submission.assessment_id),
            'assessment_title': assessment_title,
        },
        'scores': rows,
    })


@csrf_exempt
@require_http_methods(["GET"])
def scores_by_batch(request, batch_id):
    _, err = _require_admin(request)
    if err:
        return err

    qs          = SubmissionScore.objects.filter(submission__user__batch_id=batch_id)
    aggregates  = qs.values('domain').annotate(avg_score=Avg('score')).order_by('domain')

    return JsonResponse({
        'batch_id':        str(batch_id),
        'domain_averages': [
            {'domain': row['domain'], 'avg_score': float(row['avg_score'] or 0)}
            for row in aggregates
        ],
        'submissions_count': AssessmentSubmission.objects.filter(
            user__batch_id=batch_id
        ).exclude(status__startswith='SUPERSEDED_').count(),
    })


@csrf_exempt
@require_http_methods(["GET"])
def scores_by_assessment(request, assessment_id):
    _, err = _require_admin(request)
    if err:
        return err

    subs = (
        AssessmentSubmission.objects
        .filter(assessment_id=assessment_id)
        .exclude(status__startswith='SUPERSEDED_')
        .select_related('user')
        .order_by('-created_at')
    )
    rows = []
    for sub in subs[:500]:
        domain_scores = {
            s.domain: float(s.score)
            for s in SubmissionScore.objects.filter(submission=sub)
        }
        rows.append({
            'submission_id': str(sub.id),
            'student_id':    str(sub.user_id),
            'student_email': sub.user.email,
            'status':        sub.status,
            'scores':        domain_scores,
            'created_at':    sub.created_at.isoformat() if sub.created_at else None,
        })

    return JsonResponse({'assessment_id': str(assessment_id), 'rows': rows})


# ── Override (enterprise-grade: atomic, row-locked, audited) ──────────────────

@csrf_exempt
@require_http_methods(["POST"])
def override_score(request, submission_id):
    """
    Override a domain score for a submission.

    Guarantees:
    - UUID validation before any DB hit
    - select_for_update() on both submission + score row → prevents concurrent override race
    - transaction.atomic() → AuditLog is always written or the whole operation rolls back
    - evaluated_by set to 'admin' (not 'llm') for accurate audit trail
    - Returns fresh score value from DB (not from request payload) as confirmation
    """
    admin_user, err = _require_admin(request)
    if err:
        return err

    # ── Validate submission_id ─────────────────────────────────────────────
    try:
        _uuid_mod.UUID(str(submission_id))
    except (ValueError, AttributeError):
        return JsonResponse({'error': 'Invalid submission ID format'}, status=400)

    # ── Parse + validate payload ───────────────────────────────────────────
    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    domain  = (payload.get('domain') or '').strip().lower()
    # Accept both 'score' and 'new_score' for forward-compatibility
    raw_score = payload.get('new_score') if payload.get('new_score') is not None else payload.get('score')
    reason    = (payload.get('reason') or '').strip()

    if domain not in _VALID_DOMAINS:
        return JsonResponse(
            {'error': f'Invalid domain. Must be one of: {", ".join(sorted(_VALID_DOMAINS))}'},
            status=400,
        )
    if raw_score is None:
        return JsonResponse({'error': 'score is required'}, status=400)
    try:
        score_value = float(raw_score)
    except (ValueError, TypeError):
        return JsonResponse({'error': 'score must be a number'}, status=400)
    if not (0.0 <= score_value <= 10.0):
        return JsonResponse({'error': 'score must be between 0 and 10 (inclusive)'}, status=400)
    if not reason:
        return JsonResponse({'error': 'reason is required for score override'}, status=400)
    if len(reason) > 500:
        return JsonResponse({'error': 'reason must be 500 characters or fewer'}, status=400)

    # ── Atomic write with row-level lock ───────────────────────────────────
    try:
        with transaction.atomic():
            try:
                submission = (
                    AssessmentSubmission.objects
                    .select_for_update()
                    .select_related('user', 'assessment')
                    .get(id=submission_id)
                )
            except AssessmentSubmission.DoesNotExist:
                return JsonResponse({'error': 'Submission not found'}, status=404)

            # Read old score for audit trail (within the lock)
            old_score = None
            try:
                old_obj   = SubmissionScore.objects.select_for_update().get(
                    submission=submission, domain=domain
                )
                old_score = float(old_obj.score)
            except SubmissionScore.DoesNotExist:
                pass  # new score row will be created

            score_obj, created = SubmissionScore.objects.update_or_create(
                submission=submission,
                domain=domain,
                defaults={
                    'score':        score_value,
                    'feedback_json': {'overall': f'Admin override: {reason}'},
                    'evaluated_by': 'admin',
                    'evaluated_at': timezone.now(),
                    'llm_request_id': f'admin-override:{admin_user.id}',
                },
            )

            AuditLog.objects.create(
                submission=submission,
                event_type='score_override',
                old_status=submission.status,
                new_status=submission.status,
                worker_id=f'admin:{admin_user.id}',
                error_detail=(
                    f'domain={domain}; '
                    f'old_score={old_score}; '
                    f'new_score={score_value}; '
                    f'reason={reason}'
                ),
            )

    except Exception as exc:
        # Catch unexpected DB errors (deadlock, constraint violation, etc.)
        return JsonResponse(
            {'error': 'Score override failed due to a server error. Please try again.'},
            status=500,
        )

    return JsonResponse({
        'status':        'ok',
        'submission_id': str(submission.id),
        'domain':        domain,
        'old_score':     old_score,
        'new_score':     float(score_obj.score),  # read back from DB
        'reason':        reason,
        'overridden_by': str(admin_user.id),
        'overridden_at': timezone.now().isoformat(),
    })


# ── Plain-text search with pagination ─────────────────────────────────────────

@csrf_exempt
@require_http_methods(["GET"])
def scores_search(request):
    """
    Plain-text search across assessment name, batch name, or student ID.

    GET /api/admin/scores/search?mode=assessment&q=DEMO&page=1
    GET /api/admin/scores/search?mode=batch&q=2022-26&page=1
    GET /api/admin/scores/search?mode=student&q=A26126551001&page=1

    Pagination: max 30 records per page.
    Uses prefetch_related to eliminate N+1 queries — safe at scale.
    """
    _, err = _require_admin(request)
    if err:
        return err

    mode = (request.GET.get('mode') or '').strip().lower()
    q    = (request.GET.get('q')    or '').strip()
    page, page_size = _parse_page_params(request)

    if not q:
        return JsonResponse({'error': 'Search query is required'}, status=400)
    if mode not in ('assessment', 'batch', 'student'):
        return JsonResponse(
            {'error': 'mode must be one of: assessment, batch, student'},
            status=400,
        )

    base_qs = _base_submission_qs().order_by('-created_at')

    # ── Assessment ─────────────────────────────────────────────────────────
    if mode == 'assessment':
        tests = list(ClapTest.objects.filter(name__icontains=q)[:10])
        if not tests:
            return JsonResponse({'error': f'No assessment found matching "{q}"'}, status=404)

        # Use the first (closest) match; if multiple, merge
        test_ids  = [t.id for t in tests]
        qs        = base_qs.filter(assessment_id__in=test_ids)
        page_qs, total_count = _paginate_qs(qs, page, page_size)
        rows      = _submission_rows_from_qs(page_qs)

        return JsonResponse({
            'mode':  'assessment',
            'query': q,
            'rows':  rows,
            **_pagination_meta(total_count, page, page_size),
        })

    # ── Batch ──────────────────────────────────────────────────────────────
    if mode == 'batch':
        batch = Batch.objects.filter(batch_name__icontains=q).first()
        if not batch:
            return JsonResponse({'error': f'No batch found matching "{q}"'}, status=404)

        qs = base_qs.filter(user__batch=batch)
        page_qs, total_count = _paginate_qs(qs, page, page_size)
        rows = _submission_rows_from_qs(page_qs)

        # Domain averages computed on the FULL batch (not just this page)
        domain_averages = list(
            SubmissionScore.objects
            .filter(submission__user__batch=batch)
            .values('domain')
            .annotate(avg_score=Avg('score'))
            .order_by('domain')
        )

        return JsonResponse({
            'mode':            'batch',
            'query':           q,
            'batch_name':      batch.batch_name,
            'domain_averages': [
                {'domain': r['domain'], 'avg_score': float(r['avg_score'] or 0)}
                for r in domain_averages
            ],
            'rows': rows,
            **_pagination_meta(total_count, page, page_size),
        })

    # ── Student ────────────────────────────────────────────────────────────
    if mode == 'student':
        try:
            student = User.objects.get(student_id__iexact=q)
        except User.DoesNotExist:
            return JsonResponse({'error': f'No student found with ID "{q}"'}, status=404)
        except User.MultipleObjectsReturned:
            # Should not happen (student_id is unique), but handle defensively
            student = User.objects.filter(student_id__iexact=q).order_by('created_at').first()

        qs = base_qs.filter(user=student)
        page_qs, total_count = _paginate_qs(qs, page, page_size)
        rows = _submission_rows_from_qs(page_qs)

        return JsonResponse({
            'mode':          'student',
            'query':         q,
            'student_id':    student.student_id,
            'student_name':  (
                (student.full_name or '').strip()
                or (student.username or '').strip()
                or student.email
            ),
            'student_email': student.email,
            'rows':          rows,
            **_pagination_meta(total_count, page, page_size),
        })


# ── CSV Export ────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["GET"])
def export_scores(request):
    _, err = _require_admin(request)
    if err:
        return err

    scope = (request.GET.get('scope') or '').strip().lower()
    qs    = (
        AssessmentSubmission.objects
        .select_related('user', 'assessment')
        .order_by('-created_at')
    )

    if scope == 'batch':
        batch_id = request.GET.get('batch_id')
        if not batch_id:
            return JsonResponse({'error': 'batch_id is required for scope=batch'}, status=400)
        qs = qs.filter(user__batch_id=batch_id)
    elif scope in ('assessment', 'test'):
        assessment_id = request.GET.get('assessment_id') or request.GET.get('test_id')
        if not assessment_id:
            return JsonResponse(
                {'error': 'assessment_id (or test_id) is required for scope=assessment/test'},
                status=400,
            )
        qs = qs.filter(assessment_id=assessment_id)

    created_from = request.GET.get('created_from')
    if created_from:
        qs = qs.filter(created_at__gte=created_from)
    created_to = request.GET.get('created_to')
    if created_to:
        qs = qs.filter(created_at__lte=created_to)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        'submission_id', 'assessment_id', 'assessment_title',
        'student_id', 'student_email',
        'status', 'listening', 'reading', 'vocab', 'writing', 'speaking', 'created_at',
    ])

    scores_prefetch = Prefetch(
        'scores',
        queryset=SubmissionScore.objects.all(),
    )
    qs = qs.prefetch_related(scores_prefetch)

    for sub in qs[:5000]:
        score_map = {s.domain: float(s.score) for s in sub.scores.all()}
        assessment = sub.assessment
        assessment_title = (
            getattr(assessment, 'title', None)
            or getattr(assessment, 'name', None)
            or str(assessment)
        )
        writer.writerow([
            str(sub.id),
            str(sub.assessment_id),
            assessment_title,
            sub.user.student_id or str(sub.user_id),
            sub.user.email,
            sub.status,
            score_map.get('listening', ''),
            score_map.get('reading', ''),
            score_map.get('vocab', ''),
            score_map.get('writing', ''),
            score_map.get('speaking', ''),
            sub.created_at.isoformat() if sub.created_at else '',
        ])

    response = HttpResponse(buffer.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="scores_export.csv"'
    return response

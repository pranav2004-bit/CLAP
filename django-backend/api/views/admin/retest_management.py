"""
Admin Retest Management Views
Allows admins to grant retests to students.

Rules:
- Granting a retest WIPES all existing StudentClapResponse rows for that assignment
  and all AssessmentSubmission rows tied to that assignment — they are fully invalidated.
- Only the newest attempt's responses are ever used for scoring (enforced here).
- Audit trail: every grant is recorded with who granted it, when, and why.
- Multiple retests allowed; attempt_number tracks how many times the student has sat.
- Guard rails: cannot grant if the assignment is currently 'started' (student mid-test).
"""

import logging
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator

from api.models import (
    StudentClapAssignment,
    StudentClapResponse,
    AssessmentSubmission,
    ClapTest,
    StudentAudioResponse,
)
from api.utils.jwt_utils import get_user_from_request

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def grant_retest(request, assignment_id):
    """
    POST /api/admin/assignments/<uuid:assignment_id>/grant-retest
    Body: { "reason": "string (required)" }

    Grants a retest to a student by:
      1. Validating the admin is not granting mid-attempt.
      2. Atomically wiping all StudentClapResponse + StudentAudioResponse
         + AssessmentSubmission rows for this assignment.
      3. Resetting the assignment to 'assigned' state with attempt_number incremented.
    """
    admin = get_user_from_request(request)
    if not admin or admin.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    import json
    try:
        body = json.loads(request.body or '{}')
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    reason = (body.get('reason') or '').strip()
    if not reason:
        return JsonResponse({'error': 'A reason is required to grant a retest.'}, status=400)
    if len(reason) > 500:
        return JsonResponse({'error': 'Reason must be 500 characters or fewer.'}, status=400)

    try:
        assignment = StudentClapAssignment.objects.select_related(
            'student', 'clap_test'
        ).get(id=assignment_id)
    except StudentClapAssignment.DoesNotExist:
        return JsonResponse({'error': 'Assignment not found.'}, status=404)

    # Guard: do not allow granting while the student is currently taking the test
    if assignment.status == 'started':
        return JsonResponse(
            {
                'error': 'Cannot grant retest while the student is currently taking the test. '
                         'Wait until their current attempt has been submitted or times out.'
            },
            status=409
        )

    # Guard: assignment already in 'test_deleted' state
    if assignment.status == 'test_deleted':
        return JsonResponse({'error': 'The underlying test has been deleted. Retest cannot be granted.'}, status=409)

    try:
        with transaction.atomic():
            # --- Step 1: Wipe all responses for this assignment (both MCQ/subjective and audio) ---
            responses_deleted, _ = StudentClapResponse.objects.filter(assignment=assignment).delete()

            # Delete audio DB rows AND their physical files from S3 / local storage.
            # QuerySet.delete() is a bulk operation that bypasses per-instance delete()
            # methods — so we must call delete_file() on each instance first, then
            # bulk-delete the rows.  We iterate in batches to avoid loading all rows
            # into memory at once.
            audio_qs = StudentAudioResponse.objects.filter(assignment=assignment)
            audio_deleted = 0
            for audio in audio_qs.iterator(chunk_size=50):
                try:
                    audio.delete_file()
                except Exception as e:
                    logger.warning(
                        'Could not delete audio file for response %s (path=%s): %s — '
                        'DB row will still be deleted; file may be orphaned in storage.',
                        audio.id, audio.file_path, e,
                    )
                audio.delete()
                audio_deleted += 1

            # --- Step 2: Invalidate all existing AssessmentSubmissions for this student + test ---
            # We do NOT hard-delete submissions (audit trail) but we mark them superseded.
            # If the model has a 'superseded' status, use it; otherwise mark FAILED.
            submissions_qs = AssessmentSubmission.objects.filter(
                user=assignment.student,
                assessment=assignment.clap_test,
            )
            # Preserve count for logging before update
            submission_count = submissions_qs.count()
            # Use a convention: prefix status with SUPERSEDED_ to signal it's invalidated
            for sub in submissions_qs.exclude(status__startswith='SUPERSEDED_'):
                sub.status = f'SUPERSEDED_{sub.status}'
                sub.save(update_fields=['status', 'updated_at'])

            # --- Step 3: Reset assignment to fresh state ---
            current_attempt = getattr(assignment, 'attempt_number', 1) or 1
            assignment.status = 'assigned'
            assignment.started_at = None
            assignment.completed_at = None
            assignment.total_score = None
            assignment.retest_granted = True
            assignment.retest_granted_by_id = admin.id
            assignment.retest_reason = reason
            assignment.retest_granted_at = timezone.now()
            assignment.attempt_number = current_attempt + 1
            assignment.save(update_fields=[
                'status', 'started_at', 'completed_at', 'total_score',
                'retest_granted', 'retest_granted_by_id', 'retest_reason',
                'retest_granted_at', 'attempt_number'
            ])

        logger.info(
            'Retest granted: assignment=%s student=%s by_admin=%s attempt=%s '
            'responses_wiped=%s audio_wiped=%s submissions_superseded=%s reason=%r',
            assignment_id, assignment.student_id, admin.id, assignment.attempt_number,
            responses_deleted, audio_deleted, submission_count, reason
        )

        return JsonResponse({
            'message': 'Retest granted successfully.',
            'assignment_id': str(assignment.id),
            'student_name': assignment.student.full_name or assignment.student.email,
            'student_id': assignment.student.student_id,
            'attempt_number': assignment.attempt_number,
            'responses_wiped': responses_deleted,
            'audio_responses_wiped': audio_deleted,
            'submissions_superseded': submission_count,
            'granted_by': admin.full_name or admin.email,
            'reason': reason,
            'granted_at': assignment.retest_granted_at.isoformat(),
        })

    except Exception as e:
        logger.error('Error granting retest for assignment %s: %s', assignment_id, e, exc_info=True)
        return JsonResponse({'error': 'Internal server error. Retest was NOT granted.'}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def list_retest_candidates(request, test_id):
    """
    GET /api/admin/clap-tests/<uuid:test_id>/retest-candidates
    Returns all assignments for a given test that are in 'completed' or 'expired' state,
    along with retest history — so the admin can see who has had retests before.

    Query params:
      - page (int, default 1)
      - page_size (int, default 20)
      - search (string: student name or student_id)
    """
    admin = get_user_from_request(request)
    if not admin or admin.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        clap_test = ClapTest.objects.get(id=test_id)
    except ClapTest.DoesNotExist:
        return JsonResponse({'error': 'Test not found.'}, status=404)

    from django.db.models import Q
    qs = StudentClapAssignment.objects.filter(
        clap_test_id=test_id,
    ).select_related('student', 'retest_granted_by').order_by('-assigned_at')

    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(student__full_name__icontains=search) |
            Q(student__student_id__icontains=search)
        )

    page = max(int(request.GET.get('page', 1)), 1)
    page_size = min(max(int(request.GET.get('page_size', 20)), 1), 100)
    paginator = Paginator(qs, page_size)
    page_obj = paginator.get_page(page)

    rows = []
    for a in page_obj:
        rows.append({
            'assignment_id': str(a.id),
            'student_name': a.student.full_name or a.student.email or '',
            'student_id': a.student.student_id or '',
            'status': a.status,
            'attempt_number': getattr(a, 'attempt_number', 1) or 1,
            'total_score': a.total_score,
            'started_at': a.started_at.isoformat() if a.started_at else None,
            'completed_at': a.completed_at.isoformat() if a.completed_at else None,
            'retest_granted': getattr(a, 'retest_granted', False),
            'retest_granted_at': a.retest_granted_at.isoformat() if getattr(a, 'retest_granted_at', None) else None,
            'retest_reason': getattr(a, 'retest_reason', None),
            'retest_granted_by': (
                a.retest_granted_by.full_name or a.retest_granted_by.email
                if getattr(a, 'retest_granted_by', None) else None
            ),
            # Can grant retest if completed, expired, or assigned — not if mid-test
            'can_grant_retest': a.status in ('completed', 'expired', 'assigned'),
        })

    return JsonResponse({
        'test_name': clap_test.name,
        'candidates': rows,
        'pagination': {
            'page': page,
            'page_size': page_size,
            'total_count': paginator.count,
            'total_pages': paginator.num_pages,
        }
    })

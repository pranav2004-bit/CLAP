"""
management/commands/rescore_stale_mcq.py

Startup command — re-evaluates every completed assignment's L/R/V MCQ
marks_awarded and is_correct from scratch against the authoritative predefined
answer keys.

Runs automatically on every container startup (hooked into Dockerfile CMD).
Fully idempotent: running it ten times produces identical results.

Design principles:
  - Iterates from StudentClapAssignment (status='completed'), NOT from
    AssessmentSubmission.  This covers EVERY completed assignment, including
    those whose AssessmentSubmission is stuck in PENDING, or has no
    AssessmentSubmission record at all (pipeline submission failed).
  - Calls _reevaluate_mcq_responses for every assignment to ensure
    StudentClapResponse.is_correct and marks_awarded are correct.
    These are the values the results table and answers preview read directly.
  - Where a scoreable AssessmentSubmission exists, also updates SubmissionScore
    (used for reports, sorting, and W/S display).
  - Each assignment processed in its own atomic transaction.
  - All output goes to stdout/stderr → captured in Docker container logs.

Usage:
    python manage.py rescore_stale_mcq                    # rescore everything
    python manage.py rescore_stale_mcq --test-id <uuid>  # scope to one test
    python manage.py rescore_stale_mcq --dry-run          # preview, no writes
    python manage.py rescore_stale_mcq --batch-size 50   # tune batch size
"""

import time
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import (
    AssessmentSubmission,
    ClapTestComponent,
    StudentClapAssignment,
)
from api.tasks import (
    _build_set_answer_key,
    _reevaluate_mcq_responses,
    _upsert_rule_score,
)

# Statuses that mean score_rule_based has already run — SubmissionScore exists.
_SCOREABLE_STATUSES = frozenset([
    AssessmentSubmission.STATUS_RULES_COMPLETE,
    AssessmentSubmission.STATUS_LLM_PROCESSING,
    AssessmentSubmission.STATUS_LLM_COMPLETE,
    AssessmentSubmission.STATUS_LLM_FAILED,
    AssessmentSubmission.STATUS_REPORT_GENERATING,
    AssessmentSubmission.STATUS_REPORT_READY,
    AssessmentSubmission.STATUS_EMAIL_SENDING,
    AssessmentSubmission.STATUS_COMPLETE,
])

_MCQ_DOMAINS = {
    'listening': 'listening',
    'reading':   'reading',
    'vocab':     'vocabulary',
}


class Command(BaseCommand):
    help = (
        'Re-score all completed MCQ assignments against the authoritative '
        'predefined answer keys.  Safe to run on every startup (idempotent).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--test-id',
            type=str,
            default=None,
            metavar='UUID',
            help='Restrict rescore to a single CLAP test UUID.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Evaluate and log corrected scores without writing to DB.',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            metavar='N',
            help='Assignments processed per batch (default: 100).',
        )

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        test_id    = options['test_id']
        dry_run    = options['dry_run']
        batch_size = options['batch_size']

        started = time.monotonic()
        self.stdout.write(
            f'[rescore_stale_mcq] Starting'
            f'{"  (DRY RUN — no writes)" if dry_run else ""}...'
        )

        # ── 1. All COMPLETED assignments — regardless of pipeline state ────────
        # Iterating from StudentClapAssignment (not AssessmentSubmission) ensures
        # we cover every student whose submission pipeline may have stalled/failed.
        qs = (
            StudentClapAssignment.objects
            .filter(status='completed')
            .select_related('clap_test', 'assigned_set', 'student')
        )
        if test_id:
            qs = qs.filter(clap_test_id=test_id)

        assignment_ids = list(qs.values_list('id', flat=True))
        total = len(assignment_ids)
        self.stdout.write(f'[rescore_stale_mcq] {total} completed assignment(s) to rescore.')

        if total == 0:
            self.stdout.write('[rescore_stale_mcq] Nothing to do. Exiting.')
            return

        rescored = skipped = errors = 0

        # Cache: assessment_id → {domain → [component_ids]}
        # Built once per test to avoid re-querying ClapTestComponent for each student.
        component_cache: dict = {}

        # ── 2. Process in batches ─────────────────────────────────────────────
        for batch_start in range(0, total, batch_size):
            batch_ids = assignment_ids[batch_start : batch_start + batch_size]
            assignments = (
                StudentClapAssignment.objects
                .filter(id__in=batch_ids)
                .select_related('clap_test', 'assigned_set', 'student')
            )

            for assignment in assignments:
                try:
                    result = self._rescore_assignment(
                        assignment, component_cache, dry_run
                    )
                    if result == 'skipped':
                        skipped += 1
                    else:
                        rescored += 1
                except Exception as exc:
                    errors += 1
                    self.stderr.write(
                        f'[rescore_stale_mcq] ERROR  assignment={assignment.id} '
                        f'student={assignment.student_id}: {exc}'
                    )

        elapsed = time.monotonic() - started
        label = 'DRY RUN — no writes' if dry_run else 'complete'
        self.stdout.write(
            f'[rescore_stale_mcq] Done ({label}). '
            f'rescored={rescored}  skipped={skipped}  errors={errors}  '
            f'duration={elapsed:.2f}s'
        )
        if errors:
            self.stderr.write(
                f'[rescore_stale_mcq] {errors} error(s) — check logs above.'
            )

    # ------------------------------------------------------------------
    def _rescore_assignment(
        self,
        assignment: StudentClapAssignment,
        component_cache: dict,
        dry_run: bool,
    ) -> str:
        """
        Re-score one assignment's L/R/V MCQ domains atomically.

        Steps:
          1. Build the set-specific answer key (one bulk query).
          2. Re-evaluate every MCQ StudentClapResponse: write corrected
             is_correct + marks_awarded.  This is what the results table and
             answers preview read — it must always be correct.
          3. If a scoreable AssessmentSubmission exists, also update
             SubmissionScore (used for reports and sorting).

        Returns 'rescored' or 'skipped'.
        """
        # Populate component cache for this assessment if needed
        assessment_id = str(assignment.clap_test_id)
        if assessment_id not in component_cache:
            component_cache[assessment_id] = {}
            for domain, component_type in _MCQ_DOMAINS.items():
                component_cache[assessment_id][domain] = list(
                    ClapTestComponent.objects
                    .filter(
                        clap_test_id=assignment.clap_test_id,
                        test_type=component_type,
                    )
                    .values_list('id', flat=True)
                )

        domain_component_ids = component_cache[assessment_id]

        # Build the answer key once per assignment (O(set_items) query)
        set_answer_key = _build_set_answer_key(assignment)

        # Find the latest AssessmentSubmission for SubmissionScore update (optional)
        submission = (
            AssessmentSubmission.objects
            .filter(
                user=assignment.student,
                assessment=assignment.clap_test,
                status__in=_SCOREABLE_STATUSES,
            )
            .order_by('-created_at')
            .first()
        )

        if dry_run:
            for domain, component_ids in domain_component_ids.items():
                marks = (
                    _reevaluate_mcq_responses(assignment, component_ids, set_answer_key)
                    if component_ids else Decimal('0.00')
                )
                self.stdout.write(
                    f'  [DRY]  assignment={assignment.id}  domain={domain}'
                    f'  corrected_score={marks}'
                    f'  set={assignment.assigned_set_id or "base"}'
                    f'  submission={"found" if submission else "none"}'
                )
            return 'rescored'

        with transaction.atomic():
            for domain, component_ids in domain_component_ids.items():
                # Always re-evaluate MCQ responses — this writes correct
                # is_correct + marks_awarded to StudentClapResponse rows.
                # The results table and answers preview read these values directly.
                marks = (
                    _reevaluate_mcq_responses(assignment, component_ids, set_answer_key)
                    if component_ids else Decimal('0.00')
                )

                # Also update SubmissionScore when a scoreable submission exists.
                # SubmissionScore is used for reports and W/S display.
                if submission:
                    _upsert_rule_score(submission, domain, marks)

        return 'rescored'

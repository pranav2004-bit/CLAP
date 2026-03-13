"""
management/commands/rescore_stale_mcq.py

Startup command — re-evaluates every completed assignment's L/R/V MCQ scores
from scratch against the authoritative predefined answer keys.

Hooked into the Dockerfile CMD so it runs automatically on every container
startup.  Fully idempotent: running it ten times produces identical results.

Design principles:
  - Groups submissions by assessment so ClapTestComponent queries are reused
  - Builds each set's answer key exactly once per run (O(sets) DB queries)
  - Each assignment processed in its own atomic transaction — one failure
    never blocks the rest
  - Only overwrites L/R/V SubmissionScore rows; Writing/Speaking untouched
  - All output goes to stdout/stderr so Docker captures it in container logs

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
from django.utils import timezone

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

# Statuses that mean score_rule_based has already run at least once
_SCOREABLE_STATUSES = [
    AssessmentSubmission.STATUS_RULES_COMPLETE,
    AssessmentSubmission.STATUS_LLM_PROCESSING,
    AssessmentSubmission.STATUS_LLM_COMPLETE,
    AssessmentSubmission.STATUS_LLM_FAILED,
    AssessmentSubmission.STATUS_REPORT_GENERATING,
    AssessmentSubmission.STATUS_REPORT_READY,
    AssessmentSubmission.STATUS_EMAIL_SENDING,
    AssessmentSubmission.STATUS_COMPLETE,
]

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
            help='Compute corrected scores and log them without writing to DB.',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            metavar='N',
            help='Submissions processed per batch (default: 100).',
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

        # ── 1. Find every submission that has been through MCQ scoring ────
        qs = (
            AssessmentSubmission.objects
            .filter(status__in=_SCOREABLE_STATUSES)
            .select_related('user', 'assessment')
            .order_by('assessment_id', 'id')   # group by test for component cache
        )
        if test_id:
            qs = qs.filter(assessment_id=test_id)

        submission_ids = list(qs.values_list('id', flat=True))
        total = len(submission_ids)

        self.stdout.write(f'[rescore_stale_mcq] {total} submission(s) to rescore.')
        if total == 0:
            self.stdout.write('[rescore_stale_mcq] Nothing to do. Exiting.')
            return

        rescored = skipped = errors = 0

        # Cache: assessment_id → {domain → [component_ids]}
        # Avoids re-querying ClapTestComponent for every student on the same test.
        component_cache: dict[str, dict[str, list]] = {}

        # ── 2. Process in batches ─────────────────────────────────────────
        for batch_start in range(0, total, batch_size):
            batch_ids = submission_ids[batch_start : batch_start + batch_size]
            submissions = (
                AssessmentSubmission.objects
                .filter(id__in=batch_ids)
                .select_related('user', 'assessment')
            )

            for submission in submissions:
                try:
                    result = self._rescore_submission(
                        submission, component_cache, dry_run
                    )
                    if result == 'skipped':
                        skipped += 1
                    else:
                        rescored += 1
                except Exception as exc:
                    errors += 1
                    self.stderr.write(
                        f'[rescore_stale_mcq] ERROR  submission={submission.id} '
                        f'user={submission.user_id}: {exc}'
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
                f'[rescore_stale_mcq] {errors} error(s) encountered — '
                f'check logs above.'
            )

    # ------------------------------------------------------------------
    def _rescore_submission(
        self,
        submission: AssessmentSubmission,
        component_cache: dict,
        dry_run: bool,
    ) -> str:
        """
        Re-score one submission's L/R/V domains.

        Returns 'rescored' or 'skipped'.
        Each write is wrapped in its own atomic block so failures are isolated.
        """
        assignment = (
            StudentClapAssignment.objects
            .select_related('assigned_set')
            .filter(
                student=submission.user,
                clap_test=submission.assessment,
            )
            .first()
        )
        if not assignment:
            self.stderr.write(
                f'[rescore_stale_mcq] SKIP  submission={submission.id} '
                f'— no StudentClapAssignment found.'
            )
            return 'skipped'

        # Build answer key once per assignment (O(set_items) query)
        set_answer_key = _build_set_answer_key(assignment)

        # Populate component cache for this assessment if not already cached
        assessment_id = str(submission.assessment_id)
        if assessment_id not in component_cache:
            component_cache[assessment_id] = {}
            for domain, component_type in _MCQ_DOMAINS.items():
                component_cache[assessment_id][domain] = list(
                    ClapTestComponent.objects
                    .filter(
                        clap_test=submission.assessment,
                        test_type=component_type,
                    )
                    .values_list('id', flat=True)
                )

        domain_component_ids = component_cache[assessment_id]

        if dry_run:
            for domain, component_ids in domain_component_ids.items():
                marks = (
                    _reevaluate_mcq_responses(
                        assignment, component_ids, set_answer_key
                    )
                    if component_ids else Decimal('0.00')
                )
                self.stdout.write(
                    f'  [DRY]  submission={submission.id}  domain={domain}'
                    f'  corrected_score={marks}'
                    f'  set={assignment.assigned_set_id or "base"}'
                )
            return 'rescored'

        with transaction.atomic():
            for domain, component_ids in domain_component_ids.items():
                marks = (
                    _reevaluate_mcq_responses(
                        assignment, component_ids, set_answer_key
                    )
                    if component_ids else Decimal('0.00')
                )
                _upsert_rule_score(submission, domain, marks)

        return 'rescored'

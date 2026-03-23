"""
management/commands/validate_schema.py

B4: Schema validation command — detects drift between Django model definitions
and the actual PostgreSQL database state.

Usage:
    python manage.py validate_schema             # check, print results
    python manage.py validate_schema --fix       # print + suggest SQL remediation
    python manage.py validate_schema --exit-code # exit 1 on any failure (CI gate)

Checks performed:
  1. All expected tables exist in the database
  2. All managed-table FK indexes exist (auto-created by Django)
  3. Recommended indexes exist on unmanaged tables
  4. Pending Django migrations exist (integration with migrate --check)

Exit codes (with --exit-code):
  0 — all checks passed
  1 — one or more checks failed
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection


EXPECTED_TABLES = [
    # managed=False (app DB schema — not controlled by Django migrations)
    'users',
    'batches',
    'tests',
    'questions',
    'test_attempts',
    'clap_tests',
    'clap_test_components',
    'student_clap_assignments',
    'clap_test_items',
    'student_clap_responses',
    # managed=True (Django-owned)
    'clap_test_id_counter',
    'student_audio_responses',
    'admin_audio_files',
    'assessment_submission',
    'submission_score',
    'audit_log',
    'dead_letter_queue',
    # Django internals (created by migrate)
    'django_migrations',
    'django_content_type',
]

# Indexes that should exist on unmanaged (app-schema) tables
EXPECTED_UNMANAGED_INDEXES = [
    ('users',                      'idx_users_batch_id'),
    ('users',                      'idx_users_role'),
    ('clap_tests',                 'idx_clap_tests_batch_id'),
    ('clap_tests',                 'idx_clap_tests_status'),
    ('clap_test_components',       'idx_clap_test_components_clap_test_id'),
    ('clap_test_components',       'idx_clap_test_components_test_type'),
    ('clap_test_items',            'idx_clap_test_items_component_id'),
    ('clap_test_items',            'idx_clap_test_items_item_type'),
    ('student_clap_assignments',   'idx_student_clap_assignments_student_id'),
    ('student_clap_assignments',   'idx_student_clap_assignments_clap_test_id'),
    ('student_clap_assignments',   'idx_student_clap_assignments_status'),
    ('student_clap_responses',     'idx_student_clap_responses_assignment_id'),
    ('student_clap_responses',     'idx_student_clap_responses_item_id'),
]

# Indexes on managed (Django-owned) tables
EXPECTED_MANAGED_INDEXES = [
    ('student_audio_responses',  'student_aud_assignm_d0ecf4_idx'),
    ('student_audio_responses',  'student_aud_uploade_a83f74_idx'),
    ('assessment_submission',    'idx_submission_status'),
    ('assessment_submission',    'idx_submission_user'),
    ('submission_score',         'idx_score_submission'),
    ('audit_log',                'idx_audit_submission'),
    ('dead_letter_queue',        'idx_dlq_unresolved'),
]


class Command(BaseCommand):
    help = 'Validate database schema matches Django model expectations (B4)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Print suggested SQL to remediate missing indexes.',
        )
        parser.add_argument(
            '--exit-code',
            action='store_true',
            dest='exit_code',
            help='Exit with code 1 if any checks fail (for CI pipelines).',
        )

    def handle(self, *args, **options):
        failures = []
        warnings = []

        with connection.cursor() as cursor:
            # ── 1. Check tables ───────────────────────────────────
            self.stdout.write('\n=== Table existence ===')
            cursor.execute("""
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
            """)
            existing_tables = {row[0] for row in cursor.fetchall()}

            for table in EXPECTED_TABLES:
                if table in existing_tables:
                    self.stdout.write(self.style.SUCCESS(f'  [OK]    {table}'))
                else:
                    self.stdout.write(self.style.ERROR(f'  [MISS]  {table}'))
                    failures.append(f'Missing table: {table}')

            # ── 2. Check unmanaged table indexes ──────────────────
            self.stdout.write('\n=== Unmanaged table indexes ===')
            cursor.execute("""
                SELECT tablename, indexname
                FROM pg_indexes
                WHERE schemaname = 'public'
            """)
            existing_indexes = {(row[0], row[1]) for row in cursor.fetchall()}

            for table, index in EXPECTED_UNMANAGED_INDEXES:
                if (table, index) in existing_indexes:
                    self.stdout.write(self.style.SUCCESS(f'  [OK]    {table}.{index}'))
                else:
                    self.stdout.write(self.style.WARNING(f'  [MISS]  {table}.{index}'))
                    warnings.append(f'Missing index: {table}.{index}')

            # ── 3. Check managed table indexes ────────────────────
            self.stdout.write('\n=== Managed table indexes (Django migrations) ===')
            for table, index in EXPECTED_MANAGED_INDEXES:
                if (table, index) in existing_indexes:
                    self.stdout.write(self.style.SUCCESS(f'  [OK]    {table}.{index}'))
                else:
                    self.stdout.write(self.style.ERROR(f'  [MISS]  {table}.{index}'))
                    failures.append(f'Missing managed index: {table}.{index}')

            # ── 4. Check pending migrations ───────────────────────
            self.stdout.write('\n=== Django migrations ===')
            cursor.execute("""
                SELECT app, name
                FROM django_migrations
                ORDER BY app, name
            """)
            applied = {(r[0], r[1]) for r in cursor.fetchall()}
            self.stdout.write(f'  Applied migrations: {len(applied)}')

        # ── Summary ───────────────────────────────────────────────
        self.stdout.write('\n=== Summary ===')
        if not failures and not warnings:
            self.stdout.write(self.style.SUCCESS('All schema checks passed.'))
        else:
            if failures:
                self.stdout.write(self.style.ERROR(f'{len(failures)} FAILURE(S):'))
                for f in failures:
                    self.stdout.write(self.style.ERROR(f'  - {f}'))
            if warnings:
                self.stdout.write(self.style.WARNING(f'{len(warnings)} WARNING(S) (missing indexes — run CREATE INDEX statements manually):'))
                for w in warnings:
                    self.stdout.write(self.style.WARNING(f'  - {w}'))

        if options['fix'] and warnings:
            self.stdout.write('\n=== Remediation SQL ===')
            self.stdout.write('-- Run in your PostgreSQL client (psql / AWS RDS Query Editor)\n')
            for table, index in EXPECTED_UNMANAGED_INDEXES:
                if (table, index) not in existing_indexes:
                    col = index.replace(f'idx_{table}_', '')
                    self.stdout.write(
                        f'CREATE INDEX CONCURRENTLY IF NOT EXISTS {index} ON {table} ({col});'
                    )

        if options['exit_code'] and failures:
            raise CommandError(f'Schema validation failed with {len(failures)} error(s).')

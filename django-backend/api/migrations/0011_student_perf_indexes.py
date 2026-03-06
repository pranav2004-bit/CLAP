"""
0011_student_perf_indexes

Creates performance indexes on frequently-queried unmanaged model tables.
All three target tables use managed=False so we use RunSQL rather than
AddIndex to ensure the DDL actually executes against the live database.

Indexes added:
  student_clap_assignments:
    idx_student_assignment_student  — filters by student (list_assigned_tests, start_assignment)
    idx_student_assignment_status   — filters by status (dashboard stats)

  student_clap_responses:
    idx_student_response_assignment — filters by assignment (student_test_items join)
    idx_student_response_item       — filters by item in submit_response

  clap_test_items:
    idx_clapitem_component          — filters by component (student_test_items listing)
"""

from django.db import migrations


# Use IF NOT EXISTS so the migration is safe to re-run / apply on a DB that
# already has these indexes (e.g. after a restore or manual creation).
_FORWARD_SQL = """
CREATE INDEX IF NOT EXISTS idx_student_assignment_student
    ON student_clap_assignments (student_id);

CREATE INDEX IF NOT EXISTS idx_student_assignment_status
    ON student_clap_assignments (status);

CREATE INDEX IF NOT EXISTS idx_student_response_assignment
    ON student_clap_responses (assignment_id);

CREATE INDEX IF NOT EXISTS idx_student_response_item
    ON student_clap_responses (item_id);

CREATE INDEX IF NOT EXISTS idx_clapitem_component
    ON clap_test_items (component_id);
"""

_REVERSE_SQL = """
DROP INDEX IF EXISTS idx_student_assignment_student;
DROP INDEX IF EXISTS idx_student_assignment_status;
DROP INDEX IF EXISTS idx_student_response_assignment;
DROP INDEX IF EXISTS idx_student_response_item;
DROP INDEX IF EXISTS idx_clapitem_component;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0010_merge_20260306_1315'),
    ]

    operations = [
        migrations.RunSQL(
            sql=_FORWARD_SQL,
            reverse_sql=_REVERSE_SQL,
        ),
    ]

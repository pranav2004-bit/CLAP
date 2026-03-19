"""
Migration: assessmentsubmission_llm_failed_domains

Adds llm_failed_domains (JSONField, default=[]) to AssessmentSubmission.

Purpose
───────
Tracks which LLM-evaluated domains (writing, speaking) permanently failed after
exhausting all Celery retries.  Populated atomically by _record_llm_domain_failure()
in tasks.py whenever an evaluate_writing or evaluate_speaking task goes to the DLQ.

Used by
───────
- generate_report: skips cleanly when llm_failed_domains is non-empty and
  submission.status == LLM_FAILED (no unnecessary retries or DLQ entries).
- send_email_report: skips cleanly for the same reason.
- Admin results view: reads llm_failed_domains to show which columns failed
  and suppresses partial total/grade computation.

Migration is safe to run on a live database:
- AddField with a default value never locks the table on PostgreSQL 11+ (uses DDL NOT NULL DEFAULT).
- Existing rows receive an empty array ([]) as the default.
- No data migration required — new field is empty on all historical rows.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_make_user_email_nullable'),
    ]

    operations = [
        migrations.AddField(
            model_name='assessmentsubmission',
            name='llm_failed_domains',
            field=models.JSONField(
                default=list,
                blank=True,
                help_text=(
                    'LLM domains that permanently failed after all retries. '
                    'Example: ["writing"] or ["writing", "speaking"]. '
                    'Empty list means no permanent failures.'
                ),
            ),
        ),
    ]

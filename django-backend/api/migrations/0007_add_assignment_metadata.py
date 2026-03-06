"""
Migration 0007: Add metadata JSONB column to student_clap_assignments.

student_clap_assignments is managed=False (Supabase-owned table), so:
  - RunSQL adds the column to the DB if not exists
  - AddField updates Django model state only
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_sync_model_state'),
    ]

    operations = [
        # Add the column to Supabase (idempotent)
        migrations.RunSQL(
            sql="""
                ALTER TABLE student_clap_assignments
                ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
            """,
            reverse_sql="ALTER TABLE student_clap_assignments DROP COLUMN IF EXISTS metadata;",
        ),
        # Update Django model state
        migrations.AddField(
            model_name='studentclapassignment',
            name='metadata',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

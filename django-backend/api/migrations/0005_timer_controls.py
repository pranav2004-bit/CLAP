"""
Migration 0005: Add timer control fields
  - clap_tests.global_duration_minutes  (INT, nullable) — explicit global override timer
  - clap_test_components.timer_enabled  (BOOL, default TRUE) — per-component timer toggle
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_assessmentsubmission_auditlog_deadletterqueue_and_more'),
    ]

    operations = [
        # 1. Global timer override on the parent ClapTest
        migrations.RunSQL(
            sql="""
                ALTER TABLE clap_tests
                ADD COLUMN IF NOT EXISTS global_duration_minutes INTEGER DEFAULT NULL;
            """,
            reverse_sql="ALTER TABLE clap_tests DROP COLUMN IF EXISTS global_duration_minutes;"
        ),

        # 2. Per-component timer enable/disable toggle
        migrations.RunSQL(
            sql="""
                ALTER TABLE clap_test_components
                ADD COLUMN IF NOT EXISTS timer_enabled BOOLEAN NOT NULL DEFAULT TRUE;
            """,
            reverse_sql="ALTER TABLE clap_test_components DROP COLUMN IF EXISTS timer_enabled;"
        ),
    ]

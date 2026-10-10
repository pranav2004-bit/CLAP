"""
Migration 0020 — Add department column to users table.

Uses RunSQL because the User model is managed=False (Django doesn't own
the table). IF NOT EXISTS makes this idempotent — safe to re-run.

Valid department codes (enforced at the application layer, not DB level
so we avoid an ALTER that would block concurrent reads on large tables):
  CSD, CSE, CSM, CSC, IT, MECH, EEE, ECE, CHEM, CIVIL, BIOTECHNOLOGY
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_alter_submissionscore_domain'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS department VARCHAR(50) NULL;
            """,
            reverse_sql="""
                ALTER TABLE users
                DROP COLUMN IF EXISTS department;
            """,
        ),
    ]

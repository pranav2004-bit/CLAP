"""
Migration: make_user_email_nullable
- Makes User.email nullable/blank so admin-created students no longer need a dummy email.
- Data migration: clears all existing @clap-student.local placeholder emails → NULL.

Why RunSQL instead of AlterField for the DDL:
  Django's AlterField generates the same ALTER COLUMN SQL, but in a Supabase-managed
  PostgreSQL schema the ORM wrapper does not reliably commit the DDL before the
  subsequent RunPython DML runs.  Using RunSQL sends the raw DDL directly to Postgres
  and combined with atomic=False guarantees it is committed before the UPDATE fires.

  SeparateDatabaseAndState lets us run RunSQL for the actual DB change while still
  keeping AlterField in the state_operations so Django's model state stays in sync.

atomic=False is still required so each operation gets its own implicit savepoint.
"""
from django.db import migrations, models


def clear_dummy_emails(apps, schema_editor):
    """Set all auto-generated placeholder emails to NULL using raw SQL."""
    schema_editor.execute(
        "UPDATE users SET email = NULL WHERE email LIKE %s",
        ['%@clap-student.local']
    )


def restore_dummy_emails(apps, schema_editor):
    """Reverse migration: restore placeholder emails from student_id (best-effort)."""
    schema_editor.execute(
        """
        UPDATE users
        SET email = student_id || '@clap-student.local'
        WHERE email IS NULL
          AND role = 'student'
          AND student_id IS NOT NULL
        """
    )


class Migration(migrations.Migration):

    atomic = False   # Lets each operation commit independently

    dependencies = [
        ('api', '0012_malpractice_event'),
    ]

    operations = [
        # Step 1 — Drop the NOT NULL constraint directly in Postgres.
        #   database_operations: raw SQL that actually changes the column
        #   state_operations:    AlterField that updates Django's in-memory model state
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE users ALTER COLUMN email DROP NOT NULL',
                    reverse_sql='ALTER TABLE users ALTER COLUMN email SET NOT NULL',
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name='user',
                    name='email',
                    field=models.EmailField(
                        blank=True,
                        max_length=255,
                        null=True,
                        unique=True,
                    ),
                ),
            ],
        ),

        # Step 2 — Clear existing dummy placeholder emails now that the column allows NULL.
        migrations.RunPython(clear_dummy_emails, reverse_code=restore_dummy_emails),
    ]

from django.db import migrations


class Migration(migrations.Migration):
    """
    Drop the unique constraint on users.email so that multiple students
    can share the same email address. username has no unique constraint.

    The users table is managed=False (owned by the app DB schema directly),
    so we use RunSQL instead of AlterField.
    """

    dependencies = [
        ('api', '0016_auto_model_changes'),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;',
            reverse_sql='ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);',
        ),
    ]

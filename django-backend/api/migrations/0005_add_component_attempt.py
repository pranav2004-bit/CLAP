# Generated migration for ComponentAttempt model

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0004_assessmentsubmission_auditlog_deadletterqueue_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ComponentAttempt",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "started_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                (
                    "deadline",
                    models.DateTimeField(),
                ),
                (
                    "completed_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("completed", "Completed"),
                            ("expired", "Expired"),
                        ],
                        default="active",
                        max_length=20,
                    ),
                ),
                (
                    "auto_submitted",
                    models.BooleanField(default=False),
                ),
                (
                    "assignment",
                    models.ForeignKey(
                        db_column="assignment_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="component_attempts",
                        to="api.studentclapassignment",
                    ),
                ),
                (
                    "component",
                    models.ForeignKey(
                        db_column="component_id",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attempts",
                        to="api.claptestcomponent",
                    ),
                ),
            ],
            options={
                "db_table": "component_attempts",
                "managed": True,
                "unique_together": {("assignment", "component")},
            },
        ),
        migrations.AddIndex(
            model_name="componentattempt",
            index=models.Index(
                fields=["assignment", "component"],
                name="idx_comp_attempt_asgn_comp",
            ),
        ),
        migrations.AddIndex(
            model_name="componentattempt",
            index=models.Index(
                fields=["deadline"],
                name="idx_comp_attempt_deadline",
            ),
        ),
        migrations.AddIndex(
            model_name="componentattempt",
            index=models.Index(
                fields=["status"],
                name="idx_comp_attempt_status",
            ),
        ),
    ]

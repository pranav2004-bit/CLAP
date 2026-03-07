"""
Migration: Add MalpracticeEvent model for server-side academic integrity logging.

Records client-detected events (tab switches, fullscreen exits, paste attempts)
and post-test server-computed text similarity flags.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_student_perf_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='MalpracticeEvent',
            fields=[
                ('id', models.BigAutoField(
                    auto_created=True, primary_key=True,
                    serialize=False, verbose_name='ID',
                )),
                ('assignment', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='malpractice_events',
                    to='api.studentclapassignment',
                )),
                ('event_type', models.CharField(
                    choices=[
                        ('tab_switch',           'Tab Switch'),
                        ('fullscreen_exit',      'Fullscreen Exit'),
                        ('paste_attempt',        'Paste Attempt'),
                        ('high_text_similarity', 'High Text Similarity'),
                    ],
                    db_index=True,
                    max_length=50,
                )),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('meta', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'db_table': 'api_malpracticeevent',
                'ordering': ['-occurred_at'],
            },
        ),
        migrations.AddIndex(
            model_name='malpracticeevent',
            index=models.Index(fields=['assignment'], name='idx_malpractice_assignment'),
        ),
        migrations.AddIndex(
            model_name='malpracticeevent',
            index=models.Index(fields=['event_type'], name='idx_malpractice_type'),
        ),
    ]

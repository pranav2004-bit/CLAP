"""
Migration 0006: Sync Django model state with existing Supabase schema.

This migration is almost entirely STATE-ONLY because the affected tables
(clap_tests, clap_test_components, clap_test_sets, clap_set_components,
clap_set_items) are all managed=False — Django does not own them.

What each operation does:
  1. AddField  ClapTest.global_duration_minutes
       → State only (column already added via RunSQL in 0005)
  2. AddField  ClapTest.global_deadline
       → RunSQL adds the column to clap_tests IF it doesn't exist
  3. AddField  ClapTest.timer_extension_log
       → RunSQL adds the column to clap_tests IF it doesn't exist
  4. AddField  ClapTestComponent.timer_enabled
       → State only (column already added via RunSQL in 0005)
  5–7. CreateModel  ClapTestSet / ClapSetComponent / ClapSetItem
       → State only (tables live in Supabase, created outside Django)
"""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_timer_controls'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [

        # ── 1. ClapTest.global_duration_minutes ───────────────────────────────
        # Already added to the DB via 0005 RunSQL; this just updates model state.
        migrations.AddField(
            model_name='claptest',
            name='global_duration_minutes',
            field=models.IntegerField(blank=True, null=True),
        ),

        # ── 2. ClapTest.global_deadline ───────────────────────────────────────
        # New column — add to DB and update model state.
        migrations.RunSQL(
            sql="""
                ALTER TABLE clap_tests
                ADD COLUMN IF NOT EXISTS global_deadline TIMESTAMPTZ DEFAULT NULL;
            """,
            reverse_sql="ALTER TABLE clap_tests DROP COLUMN IF EXISTS global_deadline;",
        ),
        migrations.AddField(
            model_name='claptest',
            name='global_deadline',
            field=models.DateTimeField(blank=True, db_column='global_deadline', null=True),
        ),

        # ── 3. ClapTest.timer_extension_log ──────────────────────────────────
        # New column — add to DB and update model state.
        migrations.RunSQL(
            sql="""
                ALTER TABLE clap_tests
                ADD COLUMN IF NOT EXISTS timer_extension_log JSONB NOT NULL DEFAULT '[]'::jsonb;
            """,
            reverse_sql="ALTER TABLE clap_tests DROP COLUMN IF EXISTS timer_extension_log;",
        ),
        migrations.AddField(
            model_name='claptest',
            name='timer_extension_log',
            field=models.JSONField(blank=True, db_column='timer_extension_log', default=list),
        ),

        # ── 4. ClapTestComponent.timer_enabled ────────────────────────────────
        # Already added to the DB via 0005 RunSQL; this just updates model state.
        migrations.AddField(
            model_name='claptestcomponent',
            name='timer_enabled',
            field=models.BooleanField(default=True),
        ),

        # ── 5. ClapTestSet (managed=False — state only) ───────────────────────
        migrations.CreateModel(
            name='ClapTestSet',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('label', models.CharField(max_length=10)),
                ('set_number', models.IntegerField()),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('clap_test', models.ForeignKey(
                    db_column='clap_test_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sets',
                    to='api.claptest',
                )),
                ('created_by', models.ForeignKey(
                    blank=True,
                    db_column='created_by',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'clap_test_sets',
                'managed': False,
                'ordering': ['set_number'],
            },
        ),

        # ── 6. ClapSetComponent (managed=False — state only) ──────────────────
        migrations.CreateModel(
            name='ClapSetComponent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('test_type', models.CharField(max_length=20, choices=[
                    ('listening', 'Listening'), ('speaking', 'Speaking'),
                    ('reading', 'Reading'), ('writing', 'Writing'), ('vocabulary', 'Vocabulary'),
                ])),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, null=True)),
                ('max_marks', models.IntegerField(default=10)),
                ('duration_minutes', models.IntegerField(default=30)),
                ('timer_enabled', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('set', models.ForeignKey(
                    db_column='set_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='components',
                    to='api.claptestset',
                )),
            ],
            options={
                'db_table': 'clap_set_components',
                'managed': False,
            },
        ),

        # ── 7. ClapSetItem (managed=False — state only) ───────────────────────
        migrations.CreateModel(
            name='ClapSetItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('item_type', models.CharField(max_length=50, choices=[
                    ('mcq', 'Multiple Choice'), ('subjective', 'Subjective / Essay'),
                    ('text_block', 'Text Block / Instructions'), ('audio_block', 'Audio Block'),
                    ('file_upload', 'File Upload'), ('audio_recording', 'Audio Recording'),
                ])),
                ('order_index', models.IntegerField()),
                ('points', models.IntegerField(default=0)),
                ('content', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('set_component', models.ForeignKey(
                    db_column='set_component_id',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='items',
                    to='api.clapsetcomponent',
                )),
            ],
            options={
                'db_table': 'clap_set_items',
                'managed': False,
                'ordering': ['order_index'],
            },
        ),
    ]

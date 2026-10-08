# The managed=True custom tables (admin_audio_files, api_malpracticeevent,
# assessment_submission, audit_log, component_attempts, dead_letter_queue,
# student_audio_responses, submission_score) are correctly created by their
# own CreateModel operations earlier in this history, but Django's schema
# editor does not translate Python-level field defaults into database-level
# DEFAULT clauses. The real, working production schema has these set at the
# database level too (verified via pg_dump against a known-good database) —
# this migration brings this codebase's schema to an exact match.
#
# This is a safety net only: the Django ORM already supplies these values
# explicitly on every INSERT it performs, so the app's behavior is
# unaffected either way. This closes the gap for anything that might ever
# write to these tables outside the ORM (raw SQL, another service, a
# one-off script).
from django.db import migrations

FORWARD_SQL = r"""
ALTER TABLE ONLY public.admin_audio_files ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.admin_audio_files ALTER COLUMN uploaded_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ONLY public.admin_audio_files ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ONLY public.api_malpracticeevent ALTER COLUMN occurred_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ONLY public.api_malpracticeevent ALTER COLUMN meta SET DEFAULT '{}'::jsonb;

ALTER TABLE ONLY public.assessment_submission ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN status SET DEFAULT 'PENDING'::character varying;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN llm_failed_domains SET DEFAULT '[]'::jsonb;

ALTER TABLE ONLY public.audit_log ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ONLY public.component_attempts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.component_attempts ALTER COLUMN started_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ONLY public.component_attempts ALTER COLUMN status SET DEFAULT 'active'::character varying;
ALTER TABLE ONLY public.component_attempts ALTER COLUMN auto_submitted SET DEFAULT false;

ALTER TABLE ONLY public.dead_letter_queue ALTER COLUMN retry_count SET DEFAULT 0;
ALTER TABLE ONLY public.dead_letter_queue ALTER COLUMN resolved SET DEFAULT false;
ALTER TABLE ONLY public.dead_letter_queue ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ONLY public.student_audio_responses ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.student_audio_responses ALTER COLUMN recorded_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ONLY public.student_audio_responses ALTER COLUMN uploaded_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ONLY public.submission_score ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ONLY public.submission_score ALTER COLUMN evaluated_at SET DEFAULT CURRENT_TIMESTAMP;
"""

REVERSE_SQL = r"""
ALTER TABLE ONLY public.admin_audio_files ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ONLY public.admin_audio_files ALTER COLUMN uploaded_at DROP DEFAULT;
ALTER TABLE ONLY public.admin_audio_files ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE ONLY public.api_malpracticeevent ALTER COLUMN occurred_at DROP DEFAULT;
ALTER TABLE ONLY public.api_malpracticeevent ALTER COLUMN meta DROP DEFAULT;

ALTER TABLE ONLY public.assessment_submission ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN status DROP DEFAULT;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN version DROP DEFAULT;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE ONLY public.assessment_submission ALTER COLUMN llm_failed_domains DROP DEFAULT;

ALTER TABLE ONLY public.audit_log ALTER COLUMN created_at DROP DEFAULT;

ALTER TABLE ONLY public.component_attempts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ONLY public.component_attempts ALTER COLUMN started_at DROP DEFAULT;
ALTER TABLE ONLY public.component_attempts ALTER COLUMN status DROP DEFAULT;
ALTER TABLE ONLY public.component_attempts ALTER COLUMN auto_submitted DROP DEFAULT;

ALTER TABLE ONLY public.dead_letter_queue ALTER COLUMN retry_count DROP DEFAULT;
ALTER TABLE ONLY public.dead_letter_queue ALTER COLUMN resolved DROP DEFAULT;
ALTER TABLE ONLY public.dead_letter_queue ALTER COLUMN created_at DROP DEFAULT;

ALTER TABLE ONLY public.student_audio_responses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ONLY public.student_audio_responses ALTER COLUMN recorded_at DROP DEFAULT;
ALTER TABLE ONLY public.student_audio_responses ALTER COLUMN uploaded_at DROP DEFAULT;

ALTER TABLE ONLY public.submission_score ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ONLY public.submission_score ALTER COLUMN evaluated_at DROP DEFAULT;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_remove_users_email_unique_constraint'),
    ]

    operations = [
        migrations.RunSQL(sql=FORWARD_SQL, reverse_sql=REVERSE_SQL),
    ]

# Creates the core application tables whose models are declared
# managed=False in Django's own migration-replayed state (verified via
# MigrationLoader.project_state, not by reading models.py — the two can
# disagree, and it's the migration-replayed state that `migrate` actually
# uses). Django never generates DDL for these from CreateModel alone.
#
# This covers exactly: batches, clap_set_components, clap_set_items,
# clap_tests, clap_test_components, clap_test_id_counter, clap_test_items,
# clap_test_sets, questions, student_clap_assignments,
# student_clap_responses, tests, test_attempts, users.
#
# The remaining custom tables (admin_audio_files, api_malpracticeevent,
# assessment_submission, audit_log, component_attempts, dead_letter_queue,
# student_audio_responses, submission_score) are managed=True and are
# already correctly created by their own CreateModel operations later in
# the migration history — they are deliberately NOT duplicated here.
#
# Without this migration, `manage.py migrate` cannot build this project's
# database from scratch: 0001_initial's RunSQL steps (e.g. the ALTER TABLE
# on clap_tests) assume these tables already exist, which was previously
# only true if someone had manually run SQL against the database outside
# of Django's migration system entirely.
#
# This DDL is a verified, exact capture of the real, working production
# schema (taken via pg_dump --schema-only against a known-good database),
# not reconstructed from models.py.
from django.db import migrations

CREATE_SQL = r"""
--
-- Name: batches; Type: TABLE; Schema: public
--

CREATE TABLE public.batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_name character varying(50) NOT NULL,
    start_year integer NOT NULL,
    end_year integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: clap_tests; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id character varying(50),
    name character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    global_duration_minutes integer,
    global_deadline timestamp with time zone,
    timer_extension_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    batch_id uuid,
    created_by uuid
);

--
-- Name: clap_test_components; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_test_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_type character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    max_marks integer DEFAULT 10 NOT NULL,
    duration_minutes integer DEFAULT 30 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    timer_enabled boolean DEFAULT true NOT NULL,
    clap_test_id uuid
);

--
-- Name: clap_test_id_counter; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_test_id_counter (
    id bigint NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.clap_test_id_counter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.clap_test_id_counter_id_seq OWNED BY public.clap_test_id_counter.id;

--
-- Name: clap_test_items; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_test_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    item_type character varying(50) NOT NULL,
    order_index integer NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: clap_test_sets; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_test_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clap_test_id uuid NOT NULL,
    created_by uuid,
    label character varying(10) NOT NULL,
    set_number integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: clap_set_components; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_set_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    set_id uuid NOT NULL,
    test_type character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    max_marks integer DEFAULT 10 NOT NULL,
    duration_minutes integer DEFAULT 30 NOT NULL,
    timer_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: clap_set_items; Type: TABLE; Schema: public
--

CREATE TABLE public.clap_set_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    set_component_id uuid NOT NULL,
    item_type character varying(50) NOT NULL,
    order_index integer NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: questions; Type: TABLE; Schema: public
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_text text NOT NULL,
    question_type character varying(20) NOT NULL,
    options jsonb,
    correct_answer text,
    audio_url text,
    image_url text,
    points integer DEFAULT 1 NOT NULL,
    order_index integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    test_id uuid
);

--
-- Name: tests; Type: TABLE; Schema: public
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type character varying(20) NOT NULL,
    duration_minutes integer NOT NULL,
    total_questions integer NOT NULL,
    instructions text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: public
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255),
    role character varying(20) NOT NULL,
    full_name character varying(255),
    username character varying(100),
    student_id character varying(50),
    password_hash character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    profile_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    batch_id uuid,
    allowed_tabs jsonb DEFAULT '[]'::jsonb NOT NULL,
    department character varying(50)
);

--
-- Name: test_attempts; Type: TABLE; Schema: public
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    test_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    score numeric(5,2),
    max_score numeric(5,2),
    status character varying(20) DEFAULT 'in_progress'::character varying NOT NULL,
    answers jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: student_clap_assignments; Type: TABLE; Schema: public
--

CREATE TABLE public.student_clap_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    clap_test_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    status character varying(20) DEFAULT 'assigned'::character varying NOT NULL,
    total_score integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    retest_granted boolean DEFAULT false NOT NULL,
    retest_granted_by_id uuid,
    retest_reason text,
    retest_granted_at timestamp with time zone,
    assigned_set_id uuid,
    assigned_set_label character varying(10)
);

--
-- Name: student_clap_responses; Type: TABLE; Schema: public
--

CREATE TABLE public.student_clap_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    item_id uuid NOT NULL,
    response_data jsonb,
    is_correct boolean,
    marks_awarded numeric(5,2),
    feedback text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Column defaults driven by sequences

ALTER TABLE ONLY public.clap_test_id_counter ALTER COLUMN id SET DEFAULT nextval('public.clap_test_id_counter_id_seq'::regclass);

-- Primary keys / unique constraints

ALTER TABLE ONLY public.batches ADD CONSTRAINT batches_batch_name_key UNIQUE (batch_name);
ALTER TABLE ONLY public.batches ADD CONSTRAINT batches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_tests ADD CONSTRAINT clap_tests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_tests ADD CONSTRAINT clap_tests_test_id_key UNIQUE (test_id);
ALTER TABLE ONLY public.clap_test_components ADD CONSTRAINT clap_test_components_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_test_id_counter ADD CONSTRAINT clap_test_id_counter_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_test_items ADD CONSTRAINT clap_test_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_test_sets ADD CONSTRAINT clap_test_sets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_set_components ADD CONSTRAINT clap_set_components_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.clap_set_items ADD CONSTRAINT clap_set_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.questions ADD CONSTRAINT questions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tests ADD CONSTRAINT tests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_student_id_key UNIQUE (student_id);
ALTER TABLE ONLY public.test_attempts ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.student_clap_assignments ADD CONSTRAINT student_clap_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.student_clap_responses ADD CONSTRAINT student_clap_responses_pkey PRIMARY KEY (id);

-- Indexes

ALTER TABLE ONLY public.clap_test_sets ADD CONSTRAINT uq_cts_test_label UNIQUE (clap_test_id, label);
ALTER TABLE ONLY public.clap_test_sets ADD CONSTRAINT uq_cts_test_setnumber UNIQUE (clap_test_id, set_number);
ALTER TABLE ONLY public.student_clap_assignments ADD CONSTRAINT uq_sca_student_test UNIQUE (student_id, clap_test_id);
ALTER TABLE ONLY public.student_clap_responses ADD CONSTRAINT uq_scr_assignment_item UNIQUE (assignment_id, item_id);

CREATE INDEX idx_clap_test_components_test_id ON public.clap_test_components USING btree (clap_test_id);
CREATE INDEX idx_clap_tests_batch_id ON public.clap_tests USING btree (batch_id);
CREATE INDEX idx_clapitem_component ON public.clap_test_items USING btree (component_id);
CREATE INDEX idx_questions_test_id ON public.questions USING btree (test_id);
CREATE INDEX idx_sca_assigned_set ON public.student_clap_assignments USING btree (assigned_set_id);
CREATE INDEX idx_student_assignment_status ON public.student_clap_assignments USING btree (status);
CREATE INDEX idx_student_assignment_student ON public.student_clap_assignments USING btree (student_id);
CREATE INDEX idx_student_response_assignment ON public.student_clap_responses USING btree (assignment_id);
CREATE INDEX idx_student_response_item ON public.student_clap_responses USING btree (item_id);
CREATE INDEX idx_users_batch_id ON public.users USING btree (batch_id);

-- Foreign keys (only among tables created in this migration)

ALTER TABLE ONLY public.clap_test_components ADD CONSTRAINT clap_test_components_clap_test_id_fkey FOREIGN KEY (clap_test_id) REFERENCES public.clap_tests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clap_test_items ADD CONSTRAINT clap_test_items_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.clap_test_components(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clap_test_sets ADD CONSTRAINT clap_test_sets_clap_test_id_fkey FOREIGN KEY (clap_test_id) REFERENCES public.clap_tests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clap_test_sets ADD CONSTRAINT clap_test_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.clap_set_components ADD CONSTRAINT clap_set_components_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.clap_test_sets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clap_set_items ADD CONSTRAINT clap_set_items_set_component_id_fkey FOREIGN KEY (set_component_id) REFERENCES public.clap_set_components(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clap_tests ADD CONSTRAINT clap_tests_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.clap_tests ADD CONSTRAINT clap_tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.questions ADD CONSTRAINT questions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.student_clap_assignments ADD CONSTRAINT student_clap_assignments_assigned_set_id_fkey FOREIGN KEY (assigned_set_id) REFERENCES public.clap_test_sets(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.student_clap_assignments ADD CONSTRAINT student_clap_assignments_clap_test_id_fkey FOREIGN KEY (clap_test_id) REFERENCES public.clap_tests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.student_clap_assignments ADD CONSTRAINT student_clap_assignments_retest_granted_by_id_fkey FOREIGN KEY (retest_granted_by_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.student_clap_assignments ADD CONSTRAINT student_clap_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.student_clap_responses ADD CONSTRAINT student_clap_responses_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.student_clap_assignments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.student_clap_responses ADD CONSTRAINT student_clap_responses_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.clap_test_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.test_attempts ADD CONSTRAINT test_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.test_attempts ADD CONSTRAINT test_attempts_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users ADD CONSTRAINT users_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE SET NULL;
"""

DROP_SQL = r"""
DROP TABLE IF EXISTS public.student_clap_responses CASCADE;
DROP TABLE IF EXISTS public.student_clap_assignments CASCADE;
DROP TABLE IF EXISTS public.test_attempts CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tests CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.clap_set_items CASCADE;
DROP TABLE IF EXISTS public.clap_set_components CASCADE;
DROP TABLE IF EXISTS public.clap_test_sets CASCADE;
DROP TABLE IF EXISTS public.clap_test_items CASCADE;
DROP TABLE IF EXISTS public.clap_test_id_counter CASCADE;
DROP TABLE IF EXISTS public.clap_test_components CASCADE;
DROP TABLE IF EXISTS public.clap_tests CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
"""


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.RunSQL(sql=CREATE_SQL, reverse_sql=DROP_SQL),
    ]

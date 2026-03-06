-- ================================================================
-- CLAP Application — Missing Indexes for Supabase Unmanaged Tables
-- ================================================================
-- WHAT THIS IS:
--   Django cannot create indexes for tables defined with
--   managed=False. These tables live entirely in Supabase.
--   This script adds the missing B-tree indexes required for
--   6,000-user production load.
--
-- WHY THIS MATTERS:
--   Without these indexes every Celery task evaluation and every
--   student dashboard load triggers a full sequential scan.
--   At scale that means multi-second queries, connection-pool
--   exhaustion, and task timeouts that flood the Dead Letter Queue.
--
-- HOW TO APPLY:
--   1. Open: Supabase Dashboard → SQL Editor → New Query
--   2. Paste this entire file and click Run
--   3. CONCURRENTLY = zero downtime; live queries are not blocked
--   4. IF NOT EXISTS = safe to re-run at any time (idempotent)
--
-- NOTE ON CONCURRENTLY:
--   PostgreSQL requires CONCURRENTLY to run outside a transaction
--   block.  Supabase SQL Editor runs each statement as its own
--   transaction, so pasting the whole file works fine.
--   If you run via psql in a single transaction, execute each
--   CREATE INDEX statement individually.
--
-- VERIFICATION (run after applying):
--   SELECT indexname, tablename
--   FROM   pg_indexes
--   WHERE  schemaname = 'public'
--     AND  indexname  LIKE 'idx_%'
--   ORDER  BY tablename, indexname;
--
-- ESTIMATED TIME: < 1 second per index on current data volume
-- ROLLBACK:       DROP INDEX CONCURRENTLY IF EXISTS <indexname>;
-- ================================================================


-- ── users ────────────────────────────────────────────────────────
-- Lookup users by batch (admin batch management, ~every admin page)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_batch_id
    ON users (batch_id);

-- Filter users by role (admin/student separation in list views)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
    ON users (role);


-- ── clap_tests ───────────────────────────────────────────────────
-- Lookup tests by batch (admin dashboard, batch-scoped queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_tests_batch_id
    ON clap_tests (batch_id);

-- Filter tests by status (draft/active/completed — admin views)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_tests_status
    ON clap_tests (status);

-- Composite index for admin list: filter by status, sort by created_at DESC
-- Used by the paginated admin /admin/tests endpoint with status filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_tests_status_created
    ON clap_tests (status, created_at DESC);


-- ── clap_test_components ─────────────────────────────────────────
-- Lookup components by parent test — CELERY TASK CRITICAL PATH
-- Every evaluate_writing / evaluate_speaking / score_rule_based
-- task fetches components for a test. Without this index:
-- full scan of clap_test_components on every task = O(n) at 6k users.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_test_components_clap_test_id
    ON clap_test_components (clap_test_id);

-- Filter components by test type (reading/writing/speaking/listening)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_test_components_test_type
    ON clap_test_components (test_type);


-- ── clap_test_items ──────────────────────────────────────────────
-- Lookup items by parent component — CELERY TASK CRITICAL PATH
-- score_rule_based fetches all items for a component. Without this:
-- full scan of clap_test_items table on every MCQ/reading task.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_test_items_component_id
    ON clap_test_items (component_id);

-- Filter items by type (audio/text/mcq/speaking — task routing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clap_test_items_item_type
    ON clap_test_items (item_type);


-- ── student_clap_assignments ─────────────────────────────────────
-- Lookup assignments by student — STUDENT DASHBOARD CRITICAL PATH
-- Every student login loads their assignments. Without this:
-- full scan of student_clap_assignments for every dashboard load.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_clap_assignments_student_id
    ON student_clap_assignments (student_id);

-- Lookup assignments by test — admin oversight + Celery task queries
-- When Celery evaluates a test, it queries all assignments for it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_clap_assignments_clap_test_id
    ON student_clap_assignments (clap_test_id);

-- Filter assignments by status (assigned/in_progress/completed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_clap_assignments_status
    ON student_clap_assignments (status);


-- ── student_clap_responses ───────────────────────────────────────
-- Lookup responses by assignment — CELERY TASK CRITICAL PATH
-- evaluate_writing and evaluate_speaking fetch all responses for
-- an assignment. Without this: full scan of student_clap_responses.
-- At 6k students × 10 items each = 60k+ rows, multi-second scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_clap_responses_assignment_id
    ON student_clap_responses (assignment_id);

-- Lookup responses by item (reverse lookup during scoring pipeline)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_clap_responses_item_id
    ON student_clap_responses (item_id);


-- ================================================================
-- NOTE: student_audio_responses is managed=True (Django-owned).
--       Its indexes are already applied via Django migration 0002:
--         idx_student_aud_assignm  → (assignment_id, item_id)
--         idx_student_aud_uploade  → (uploaded_at)
--       No action needed here for that table.
--
-- NOTE: admin_audio_files is managed=True (Django-owned).
--       Its index (idx_admin_audio_item) is in migration 0003.
--       No action needed here for that table.
--
-- NOTE: assessment_submission, submission_score, audit_log,
--       dead_letter_queue are managed=True (Django-owned).
--       All FK + compound indexes are in migration 0004.
--       No action needed here for those tables.
-- ================================================================

-- CLAP least-privilege PostgreSQL role bootstrap
-- Run with a privileged admin account in each environment.

-- 1) Login roles (replace secure passwords)
CREATE ROLE clap_api_user LOGIN PASSWORD 'CHANGE_ME_API_PASSWORD';
CREATE ROLE clap_worker_user LOGIN PASSWORD 'CHANGE_ME_WORKER_PASSWORD';
CREATE ROLE clap_readonly_user LOGIN PASSWORD 'CHANGE_ME_READONLY_PASSWORD';

-- 2) Baseline database connect rights
GRANT CONNECT ON DATABASE postgres TO clap_api_user, clap_worker_user, clap_readonly_user;

-- 3) Schema usage (public schema assumed)
GRANT USAGE ON SCHEMA public TO clap_api_user, clap_worker_user, clap_readonly_user;

-- 4) Table privileges
-- API + worker can read/write existing app tables, but cannot alter schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clap_api_user, clap_worker_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clap_api_user, clap_worker_user;

-- Read-only account for analytics/reporting tasks.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO clap_readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO clap_readonly_user;

-- 5) Sequence rights for inserts
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO clap_api_user, clap_worker_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO clap_api_user, clap_worker_user;

-- 6) Explicitly avoid schema change powers
REVOKE CREATE ON SCHEMA public FROM clap_api_user, clap_worker_user, clap_readonly_user;

-- 7) Optional hardening (uncomment to enforce)
-- REVOKE ALL ON DATABASE postgres FROM PUBLIC;
-- REVOKE CREATE ON SCHEMA public FROM PUBLIC;

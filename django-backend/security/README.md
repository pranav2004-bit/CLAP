# CLAP Security Hardening Assets

## Least-Privilege Database Roles

- SQL bootstrap script: `least_privilege_roles.sql`
- Purpose: create role separation for API/worker/read-only access without schema mutation rights.

### Runtime wiring
Set these environment variables in deployment:

- `DB_APP_USER`
- `DB_APP_PASSWORD`

`clap_backend/settings.py` uses these values for the Django database connection. Deploy API and worker with different credentials if desired.

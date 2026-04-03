#!/bin/sh
# Custom PgBouncer entrypoint.
#
# WHY THIS EXISTS:
#   The edoburu/pgbouncer image auto-generates userlist.txt with the password
#   stored as an MD5 hash: "md5<hex>". This works for MD5 backend auth but
#   FAILS for SCRAM-SHA-256 (used by RDS PostgreSQL 15 by default), because
#   SCRAM requires the PLAINTEXT password to perform the key exchange.
#
#   This script replaces the auto-generated userlist.txt with a plaintext
#   entry AFTER pgbouncer.ini is generated (so pool/TLS settings are still
#   picked up from environment variables), then starts PgBouncer normally.
#
# FORMAT: userlist.txt expects:  "username" "password"
#   Plain text password = no prefix  → PgBouncer can do SCRAM to RDS  ✓
#   "md5<hash>" prefix             → PgBouncer cannot do SCRAM        ✗
set -e

# 1. Generate pgbouncer.ini from environment variables (edoburu helper)
generate-pgbouncer-ini > /etc/pgbouncer/pgbouncer.ini

# 2. Write userlist.txt with PLAINTEXT password (overrides md5-hashed default)
printf '"%s" "%s"\n' "$DB_USER" "$DB_PASSWORD" > /etc/pgbouncer/userlist.txt

# 3. Start PgBouncer
exec /usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini

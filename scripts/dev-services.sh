#!/usr/bin/env bash
# Starts PostgreSQL 16 (with pgvector) and Redis installed on the host, for
# machines where Docker is not available. Verified on Ubuntu 24.04.
# With Docker, use `docker compose -f infrastructure/docker-compose.yml up -d`
# instead (that file has NOT been run by the author; see docs/MILESTONE_2_PLAN.md).
#
#   sudo apt-get install -y postgresql-16 postgresql-16-pgvector redis-server
#   bash scripts/dev-services.sh start
set -euo pipefail
REDIS_PORT="${REDIS_PORT:-6380}"

as_postgres() { if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else sudo -u postgres bash -c "$1"; fi; }

case "${1:-start}" in
  start)
    pg_ctlcluster 16 main start 2>/dev/null || true
    as_postgres "psql -v ON_ERROR_STOP=1 -q" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hks_owner') THEN CREATE ROLE hks_owner LOGIN PASSWORD 'hks_owner_dev'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hks_app') THEN CREATE ROLE hks_app LOGIN PASSWORD 'hks_app_dev'; END IF;
END $$;
SQL
    for db in hks_dev hks_test; do
      as_postgres "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$db'\"" | grep -q 1 || as_postgres "createdb -O hks_owner $db"
      as_postgres "psql -q -d $db -c 'CREATE EXTENSION IF NOT EXISTS vector'"
    done
    redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1 || \
      redis-server --port "$REDIS_PORT" --daemonize yes --save '' --appendonly no --maxmemory-policy noeviction >/dev/null
    echo "PostgreSQL on 5432 (databases hks_dev, hks_test), Redis on $REDIS_PORT."
    ;;
  stop)
    redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
    pg_ctlcluster 16 main stop 2>/dev/null || true
    ;;
  *) echo "usage: $0 start|stop"; exit 1 ;;
esac

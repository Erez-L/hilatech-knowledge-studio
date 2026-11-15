#!/usr/bin/env bash
# Runs the HTTP test suite against a real server: Next.js (production build),
# the ingestion worker, PostgreSQL + pgvector and Redis. The AI providers are
# the deterministic TEST DOUBLES (APP_ENV=test), so this proves authentication,
# authorization, the API and the pipeline plumbing — not answer quality.
#
#   bash scripts/dev-services.sh start && bash scripts/http-tests.sh [--no-build]
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${HTTP_TEST_PORT:-3200}"
WORK="$(mktemp -d /tmp/hks-http-XXXXXX)"

export APP_ENV=test
export APP_BASE_URL="http://localhost:$PORT"
export DATABASE_URL="${TEST_DATABASE_URL:-postgres://hks_app:hks_app_dev@localhost:5432/hks_test}"
export DATABASE_MIGRATION_URL="${TEST_DATABASE_MIGRATION_URL:-postgres://hks_owner:hks_owner_dev@localhost:5432/hks_test}"
export REDIS_URL="${TEST_REDIS_URL:-redis://localhost:6380/2}"
export AUTH_SECRET="http-test-secret-not-used-anywhere-else-0123456789"
export MAIL_TRANSPORT=file MAIL_OUTBOX_FILE="$WORK/outbox.jsonl"
export STORAGE_DRIVER=local STORAGE_LOCAL_DIR="$WORK/storage"
export LLM_PROVIDER=deterministic EMBEDDINGS_PROVIDER=deterministic
export RAG_MIN_SIMILARITY=0.05 RAG_EVIDENCE_MIN_SIMILARITY=0.12
export CHUNK_TARGET_CHARS=500 CHUNK_MAX_CHARS=800 CHUNK_OVERLAP_CHARS=100
export UPLOAD_MAX_BYTES=$((2 * 1024 * 1024))
export LIMIT_QUESTIONS_PER_MINUTE="${LIMIT_QUESTIONS_PER_MINUTE:-8}" LIMIT_AUTH_ATTEMPTS_PER_MINUTE="${LIMIT_AUTH_ATTEMPTS_PER_MINUTE:-8}" LIMIT_UPLOADS_PER_MINUTE=30
export TRUSTED_PROXY_HOPS=1 LEADS_STORE=postgres LOG_LEVEL="${LOG_LEVEL:-warn}"
export HTTP_TEST_WORK="$WORK"

stop_processes() {
  # pnpm starts node as a child; killing the pnpm wrapper alone leaves it running.
  pkill -f "next start --port $PORT" 2>/dev/null || true
  pkill -f "apps/worker/node_modules/.*tsx.*src/main.ts" 2>/dev/null || true
  pkill -f "tsx src/main.ts" 2>/dev/null || true
  pkill -f "tsx/dist/.*src/main.ts" 2>/dev/null || true
  for pid in $(pgrep -f "next-server" 2>/dev/null); do
    grep -qz "PORT=$PORT" "/proc/$pid/environ" 2>/dev/null && kill "$pid" 2>/dev/null || true
  done
}
cleanup() {
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "${WORKER_PID:-}" ] && kill "$WORKER_PID" 2>/dev/null || true
  stop_processes
  wait 2>/dev/null || true
  [ "${KEEP_WORK:-}" = 1 ] || rm -rf "$WORK"
}
trap cleanup EXIT

stop_processes # leftovers from an interrupted run would steal queue jobs
redis-cli -u "$REDIS_URL" flushdb >/dev/null
pnpm exec tsx scripts/reset-test-database.mts
[ "${1:-}" = "--no-build" ] || pnpm --filter @hks/web build >/dev/null

PORT="$PORT" pnpm --filter @hks/web exec next start --port "$PORT" >"$WORK/web.log" 2>&1 &
WEB_PID=$!
pnpm --filter @hks/worker start >"$WORK/worker.log" 2>&1 &
WORKER_PID=$!
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://localhost:$PORT/en" && break; sleep 0.5; done

set +e
# RUN replaces the default runner (used by scripts/ui-checks.sh for the browser checks).
${RUN:-pnpm exec vitest run --config vitest.http.config.mts}
STATUS=$?
set -e
if [ $STATUS -ne 0 ]; then echo "--- web log (tail)"; tail -30 "$WORK/web.log"; echo "--- worker log (tail)"; tail -15 "$WORK/worker.log"; fi
exit $STATUS

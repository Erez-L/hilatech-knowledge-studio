#!/usr/bin/env bash
# Browser checks of the signed-in application against the same real stack as
# scripts/http-tests.sh (Next.js, worker, PostgreSQL, Redis; AI = test doubles).
# Captures screenshots into artifacts/screenshots/app/.
set -euo pipefail
cd "$(dirname "$0")/.."
export LIMIT_DEMO_QUESTIONS_PER_SESSION=15 LIMIT_DEMO_QUESTIONS_PER_MINUTE=60 LIMIT_DEMO_QUESTIONS_PER_DAY=300
export LIMIT_QUESTIONS_PER_MINUTE=60 LIMIT_AUTH_ATTEMPTS_PER_MINUTE=60
RUN="node apps/web/scripts/app-checks.mjs" exec bash scripts/http-tests.sh "$@"

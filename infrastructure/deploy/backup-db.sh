#!/usr/bin/env bash
# Backs up the PostgreSQL database of this stack: pg_dump, a check that the dump is readable,
# then a copy to S3. Run on the host, in /opt/knowledge-studio, as the user that runs deploy.sh:
#   ./backup-db.sh               dump, check, copy to S3
#   ./backup-db.sh --local-only  dump and check only (for example right before a deploy)
# Meant for a nightly cron entry. How to install it and how to restore: docs/BACKUP_AND_RESTORE.md.
#
# Settings, from the environment or from .env beside this script:
#   BACKUP_S3_URI       where the dumps go, for example s3://my-bucket/db-backups  (required)
#   BACKUP_LOCAL_DIR    where dumps are written first                 (default: ./backups)
#   BACKUP_KEEP_LOCAL   how many dumps stay on the host               (default: 3)
#
# It needs no password: pg_dump runs inside the ks-postgres container over the local socket, and
# the AWS CLI uses the instance role. It never deletes anything in S3; set a lifecycle rule on
# the bucket to expire old dumps. What it does not cover: the uploaded files (they are in S3
# already) and Redis (queues and pending sign-ups, which are rebuilt).
set -euo pipefail
cd "$(dirname "$0")"

fail() { echo "BACKUP FAILED: $*" >&2; exit 1; }
# Reads one KEY=value line from .env without running the file.
setting() {
  local name="$1" fallback="${2:-}" value="${!1:-}"
  if [ -z "$value" ] && [ -f .env ]; then
    value="$(grep -E "^${name}=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true)"
  fi
  printf '%s' "${value:-$fallback}"
}

MODE="${1:-upload}"
case "$MODE" in upload|--local-only) ;; *) fail "unknown argument: $MODE (use no argument or --local-only)";; esac

TARGET="$(setting BACKUP_S3_URI)"
TARGET="${TARGET%/}"
LOCAL_DIR="$(setting BACKUP_LOCAL_DIR ./backups)"
KEEP="$(setting BACKUP_KEEP_LOCAL 3)"
case "$KEEP" in ''|*[!0-9]*) fail "BACKUP_KEEP_LOCAL must be a whole number";; esac
[ "$KEEP" -ge 1 ] || fail "BACKUP_KEEP_LOCAL must be at least 1"

command -v docker >/dev/null 2>&1 || fail "docker was not found"
if [ "$MODE" = upload ]; then
  [ -n "$TARGET" ] || fail "BACKUP_S3_URI is not set (in .env or the environment)"
  case "$TARGET" in s3://?*) ;; *) fail "BACKUP_S3_URI must look like s3://bucket/prefix";; esac
  command -v aws >/dev/null 2>&1 || fail "the AWS CLI (aws) was not found; install it or use --local-only"
fi

compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }

umask 077
mkdir -p "$LOCAL_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="hks-${STAMP}.dump"
FILE="${LOCAL_DIR}/${NAME}"
PARTIAL="${FILE}.partial"
trap 'rm -f "$PARTIAL"' EXIT

# Custom format: compressed, and pg_restore can list it and restore from it selectively.
compose exec -T ks-postgres pg_dump -U postgres -d hks --format=custom >"$PARTIAL" || fail "pg_dump did not finish"
[ -s "$PARTIAL" ] || fail "pg_dump wrote an empty file"
# A dump that pg_restore cannot list is not a backup.
compose exec -T ks-postgres pg_restore --list <"$PARTIAL" >/dev/null || fail "the dump is not readable by pg_restore"
mv "$PARTIAL" "$FILE"
BYTES="$(wc -c <"$FILE" | tr -d '[:space:]')"

if [ "$MODE" = upload ]; then
  aws s3 cp --only-show-errors --sse AES256 "$FILE" "${TARGET}/${NAME}" || fail "the copy to ${TARGET} did not finish; the dump is still at ${FILE}"
fi

# Keep the newest dumps on the host and remove the rest. Nothing is removed in S3.
ls -1t "$LOCAL_DIR"/hks-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do rm -f "$old"; done

if [ "$MODE" = upload ]; then
  echo "BACKUP OK ${NAME} ${BYTES} bytes -> ${TARGET}/${NAME}"
else
  echo "BACKUP OK ${NAME} ${BYTES} bytes -> ${FILE} (local only, not copied to S3)"
fi

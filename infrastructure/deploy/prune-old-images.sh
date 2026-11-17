#!/usr/bin/env bash
# Removes every knowledge-studio app image except the tag in .env. Run only after the
# deployed version has been checked and approved: it removes the way back to the old one.
set -euo pipefail
cd "$(dirname "$0")"
REPO="ghcr.io/$(grep -E '^IMAGE_REPOSITORY=' .env | cut -d= -f2-)/app"
KEEP="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2-)"
docker images --format '{{.Repository}}:{{.Tag}}' "$REPO" | grep -v ":${KEEP}$" | xargs -r docker rmi
docker image prune -f >/dev/null
echo "kept ${REPO}:${KEEP}"; df -h / | tail -1

#!/usr/bin/env bash
# Deploys one image tag. Run on the host, in /opt/knowledge-studio:
#   sudo ./deploy.sh v0.1.0
# It does NOT remove older images. After the new version has been checked and approved,
# run ./prune-old-images.sh to free the disk.
set -euo pipefail
cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <image tag>}"
PREVIOUS="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2-)"
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" .env
compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }
if ! compose pull migrate ks-web ks-worker; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${PREVIOUS}|" .env
  echo "pull failed; IMAGE_TAG left at ${PREVIOUS}" >&2; exit 1
fi
compose up -d --remove-orphans
for _ in $(seq 1 40); do
  state="$(docker inspect -f '{{.State.Health.Status}}' knowledge-studio-ks-web-1 2>/dev/null || echo starting)"
  [ "$state" = healthy ] && { echo "DEPLOYED ${TAG} (previous: ${PREVIOUS})"; exit 0; }
  sleep 5
done
echo "web did not become healthy on ${TAG}. Previous tag was ${PREVIOUS}; to go back: ./deploy.sh ${PREVIOUS}" >&2
compose ps >&2
exit 1

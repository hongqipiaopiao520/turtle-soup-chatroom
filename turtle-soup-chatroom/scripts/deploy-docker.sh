#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-turtle-soup-chatroom}"
IMAGE_NAME="${IMAGE_NAME:-turtle-soup-chatroom}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-}"
HOST_PORT="${HOST_PORT:-8787}"
CONTAINER_PORT="${CONTAINER_PORT:-8787}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${HOST_PORT}/api/health}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"

log() {
  printf '\n[deploy:docker] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[deploy:docker] missing command: $1" >&2
    exit 1
  fi
}

require_command git
require_command docker
require_command curl

git_in_dir() {
  local dir="$1"
  shift
  (cd "$dir" && git "$@")
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
GIT_ROOT="$(git_in_dir "$APP_ROOT" rev-parse --show-toplevel)"
NEXT_CONTAINER="${APP_NAME}-next"
BACKUP_CONTAINER="${APP_NAME}-previous"
ROLLBACK_READY=0
PROMOTED=0

cd "$APP_ROOT"

if [ ! -f ".env" ]; then
  echo "[deploy:docker] .env not found. Create it from .env.example and set production secrets first." >&2
  exit 1
fi

if [ -n "$(git_in_dir "$GIT_ROOT" status --porcelain -- "$APP_ROOT")" ]; then
  echo "[deploy:docker] working tree is not clean; commit or stash changes before deploying." >&2
  git_in_dir "$GIT_ROOT" status --short -- "$APP_ROOT"
  exit 1
fi

if [ "$SKIP_GIT_PULL" != "1" ]; then
  if [ -n "$DEPLOY_BRANCH" ]; then
    log "checking out $DEPLOY_BRANCH"
    git_in_dir "$GIT_ROOT" checkout "$DEPLOY_BRANCH"
  fi
  log "pulling latest code"
  git_in_dir "$GIT_ROOT" pull --ff-only
else
  log "skipping git pull"
fi

log "building docker image"
docker build -t "$IMAGE_NAME:$IMAGE_TAG" -f "$APP_ROOT/Dockerfile" "$APP_ROOT"

log "preparing persistent directories"
mkdir -p "$APP_ROOT/data" "$APP_ROOT/logs"

log "removing stale staging container"
docker rm -f "$NEXT_CONTAINER" >/dev/null 2>&1 || true

log "stopping current container if present"
docker rm -f "$BACKUP_CONTAINER" >/dev/null 2>&1 || true
if docker ps -a --format '{{.Names}}' | grep -Fx "$APP_NAME" >/dev/null; then
  docker rename "$APP_NAME" "$BACKUP_CONTAINER"
  docker stop "$BACKUP_CONTAINER"
  ROLLBACK_READY=1
fi

rollback() {
  if [ "$ROLLBACK_READY" != "1" ] || [ "$PROMOTED" = "1" ]; then
    return
  fi
  echo "[deploy:docker] rolling back to previous container" >&2
  if docker ps -a --format '{{.Names}}' | grep -Fx "$NEXT_CONTAINER" >/dev/null; then
    docker rm -f "$NEXT_CONTAINER" >/dev/null 2>&1 || true
  fi
  if docker ps -a --format '{{.Names}}' | grep -Fx "$BACKUP_CONTAINER" >/dev/null; then
    docker rename "$BACKUP_CONTAINER" "$APP_NAME" >/dev/null 2>&1 || true
    docker start "$APP_NAME" >/dev/null 2>&1 || true
  fi
}

trap rollback ERR

log "starting new container"
docker run -d \
  --name "$NEXT_CONTAINER" \
  --restart unless-stopped \
  --env-file "$APP_ROOT/.env" \
  -e NODE_ENV=production \
  -e PORT="$CONTAINER_PORT" \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  -v "$APP_ROOT/data:/app/data" \
  -v "$APP_ROOT/logs:/app/logs" \
  "$IMAGE_NAME:$IMAGE_TAG"

log "checking health endpoint"
if ! curl -fsS --retry 12 --retry-delay 2 --retry-connrefused "$HEALTH_URL"; then
  echo "" >&2
  echo "[deploy:docker] health check failed: $HEALTH_URL" >&2
  docker logs "$NEXT_CONTAINER" --tail 120 || true
  rollback
  exit 1
fi

log "promoting new container"
docker rename "$NEXT_CONTAINER" "$APP_NAME"
docker rm -f "$BACKUP_CONTAINER" >/dev/null 2>&1 || true
PROMOTED=1

printf '\n'
log "deployed successfully"
docker ps --filter "name=$APP_NAME"

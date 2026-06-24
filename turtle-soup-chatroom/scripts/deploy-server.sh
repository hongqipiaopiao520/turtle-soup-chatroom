#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-turtle-soup-chatroom}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/api/health}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"

log() {
  printf '\n[deploy] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[deploy] missing command: $1" >&2
    exit 1
  fi
}

require_command git
require_command npm
require_command pm2
require_command curl

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
GIT_ROOT="$(git -C "$APP_ROOT" rev-parse --show-toplevel)"
cd "$APP_ROOT"

if [ ! -f ".env" ]; then
  echo "[deploy] .env not found. Create it from .env.example and set production secrets first." >&2
  exit 1
fi

if [ -n "$(git -C "$GIT_ROOT" status --porcelain -- "$APP_ROOT")" ]; then
  echo "[deploy] working tree is not clean; commit or stash changes before deploying." >&2
  git -C "$GIT_ROOT" status --short -- "$APP_ROOT"
  exit 1
fi

if [ "$SKIP_GIT_PULL" != "1" ]; then
  if [ -n "$DEPLOY_BRANCH" ]; then
    log "checking out $DEPLOY_BRANCH"
    git checkout "$DEPLOY_BRANCH"
  fi
  log "pulling latest code"
  git -C "$GIT_ROOT" pull --ff-only
else
  log "skipping git pull"
fi

log "installing dependencies"
npm ci --include=dev

log "building app"
npm run build

log "preparing runtime directories"
mkdir -p data logs

log "starting or restarting PM2 app"
pm2 startOrRestart "$APP_ROOT/ecosystem.config.cjs" --update-env
pm2 save

log "checking health endpoint"
if ! curl -fsS "$HEALTH_URL"; then
  echo "" >&2
  echo "[deploy] health check failed: $HEALTH_URL" >&2
  pm2 logs "$APP_NAME" --lines 80 --nostream || true
  exit 1
fi

printf '\n'
log "deployed successfully"
pm2 status "$APP_NAME"

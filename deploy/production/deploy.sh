#!/usr/bin/env bash
# BHC production deploy — runs ON the host (bhcontracting.ca).
#
#   cd /opt/bhc && bash deploy/production/deploy.sh            # deploy origin/main
#   bash deploy/production/deploy.sh --ref <sha|tag|branch>    # deploy a specific ref
#   bash deploy/production/deploy.sh --rollback                # go back to the previous release
#   bash deploy/production/deploy.sh --no-restart              # build only
#
# Env (optional): BHC_APP_DIR=/opt/bhc  BHC_SERVICE=bhc  BHC_APP_USER=www-data
#                 BHC_HEALTH_URL=http://127.0.0.1:3000/api/health
#                 BHC_HEALTH_TIMEOUT=90  BHC_NO_SUDO=1
#
# What it does, in order:
#   1. Snapshot data/store.json → data/backups/pre-deploy-*.json (as app user)
#   2. git fetch + checkout the target ref (records the previous SHA for rollback)
#   3. npm ci only when package-lock.json changed
#   4. next build into .next-build, then swap into .next (atomic-ish)
#   5. systemctl restart bhc, wait for GET /api/health to return 200
#   6. chown data/ to BHC_APP_USER so nightly store_backup can write
#   7. post-deploy automation tick as BHC_APP_USER
#   On health failure: automatic rollback to the previous SHA
set -euo pipefail

APP_DIR="${BHC_APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SERVICE="${BHC_SERVICE:-bhc}"
# Prod host (bhc-app-1) runs the app as www-data — there is no Linux user `bhc`.
# Override with BHC_APP_USER / BHC_APP_GROUP only if a host differs.
# Keep data/ owned by this user so nightly store_backup can write data/backups/*.json.
APP_USER="${BHC_APP_USER:-www-data}"
APP_GROUP="${BHC_APP_GROUP:-$APP_USER}"
HEALTH_URL="${BHC_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_TIMEOUT="${BHC_HEALTH_TIMEOUT:-90}"
STATE_DIR="$APP_DIR/data/deploy"
PREV_FILE="$STATE_DIR/previous_sha"
LOG_FILE="$STATE_DIR/deploy.log"
REF="origin/main"
RESTART=1
ROLLBACK=0

SUDO="sudo"
if [ "${BHC_NO_SUDO:-0}" = "1" ] || [ "$(id -u)" = "0" ]; then SUDO=""; fi

fix_data_ownership() {
  # Root deploys often mkdir/cp into data/backups as root → EACCES for User=www-data.
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    log "skip chown (user $APP_USER not found)"
    return 0
  fi
  if [ "$(id -u)" = "0" ]; then
    chown -R "$APP_USER:$APP_GROUP" "$APP_DIR/data" 2>/dev/null || true
  elif [ -n "$SUDO" ]; then
    $SUDO chown -R "$APP_USER:$APP_GROUP" "$APP_DIR/data" 2>/dev/null || true
  fi
  log "data ownership → $APP_USER:$APP_GROUP"
}

run_as_app() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u "$APP_USER" -- "$@"
  elif [ "$(id -un)" = "$APP_USER" ]; then
    "$@"
  elif [ -n "$SUDO" ] && id -u "$APP_USER" >/dev/null 2>&1; then
    $SUDO -u "$APP_USER" -- "$@"
  else
    "$@"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --rollback) ROLLBACK=1; shift ;;
    --no-restart) RESTART=0; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

cd "$APP_DIR"
mkdir -p "$STATE_DIR" data/backups

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"; }

restart_and_check() {
  if [ "$RESTART" = "0" ]; then
    log "skip restart (--no-restart)"
    return 0
  fi
  log "restart $SERVICE"
  $SUDO systemctl restart "$SERVICE"
  log "waiting for $HEALTH_URL (timeout ${HEALTH_TIMEOUT}s)"
  local waited=0
  until curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; do
    sleep 3
    waited=$((waited + 3))
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      log "✖ health check timed out"
      return 1
    fi
  done
  log "✔ healthy: $(curl -fsS --max-time 5 "$HEALTH_URL" | head -c 300)"
}

build() {
  local sha
  sha="$(git rev-parse --short HEAD)"
  export NEXT_TELEMETRY_DISABLED=1
  export BHC_COMMIT="$sha"
  log "npm run build ($sha)"
  # Build to a side directory so a failed build never leaves .next half-written
  rm -rf .next-build
  NEXT_DIST_DIR=.next-build npm run build >>"$LOG_FILE" 2>&1 || {
    log "✖ build failed — see $LOG_FILE"
    return 1
  }
  if [ -d .next-build ]; then
    rm -rf .next-prev
    [ -d .next ] && mv .next .next-prev
    mv .next-build .next
  fi
  # Persist BHC_COMMIT for the running service (systemd EnvironmentFile)
  if [ -f "$STATE_DIR/runtime.env" ] || [ -n "${BHC_WRITE_RUNTIME_ENV:-}" ]; then
    printf 'BHC_COMMIT=%s\n' "$sha" >"$STATE_DIR/runtime.env"
  fi
}

# ---------- rollback ----------
if [ "$ROLLBACK" = "1" ]; then
  if [ ! -f "$PREV_FILE" ]; then
    log "✖ no previous release recorded"
    exit 1
  fi
  PREV="$(cat "$PREV_FILE")"
  log "rolling back to $PREV"
  git checkout -q "$PREV"
  if git diff --quiet HEAD@{1} HEAD -- package-lock.json 2>/dev/null; then :; else npm ci --no-audit --no-fund >>"$LOG_FILE" 2>&1; fi
  build
  restart_and_check
  log "✔ rollback complete"
  exit 0
fi

# ---------- normal deploy ----------
CURRENT_SHA="$(git rev-parse HEAD)"
log "=== deploy start (current $(git rev-parse --short HEAD) → $REF)"

# 1. store snapshot (as app user when possible so backups/ stays writable)
mkdir -p data/backups
fix_data_ownership
if [ -f data/store.json ]; then
  SNAP="data/backups/pre-deploy-$(date -u +%Y-%m-%d_%H-%M-%S).json"
  if ! run_as_app cp data/store.json "$SNAP" 2>/dev/null; then
    cp data/store.json "$SNAP"
    fix_data_ownership
  fi
  log "store snapshot → $SNAP"
  # keep the 10 most recent pre-deploy snapshots
  ls -1t data/backups/pre-deploy-*.json 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

# 2. fetch + checkout
git fetch --prune origin >>"$LOG_FILE" 2>&1
TARGET_SHA="$(git rev-parse "$REF")"
if [ "$TARGET_SHA" = "$CURRENT_SHA" ] && [ -d .next ]; then
  log "already at $(git rev-parse --short HEAD); rebuilding anyway"
fi
echo "$CURRENT_SHA" >"$PREV_FILE"
LOCK_CHANGED=0
if ! git diff --quiet "$CURRENT_SHA" "$TARGET_SHA" -- package-lock.json; then LOCK_CHANGED=1; fi
if [ "$REF" = "origin/main" ]; then
  git checkout -q main
  git reset -q --hard origin/main
else
  git checkout -q "$TARGET_SHA"
fi
log "checked out $(git rev-parse --short HEAD)"

# 3. deps
if [ "$LOCK_CHANGED" = "1" ] || [ ! -d node_modules ]; then
  log "package-lock changed → npm ci"
  npm ci --no-audit --no-fund >>"$LOG_FILE" 2>&1
else
  log "package-lock unchanged → skip npm ci"
fi

# 4. build
if ! build; then
  log "build failed → restoring previous checkout"
  git checkout -q "$CURRENT_SHA"
  [ -d .next-prev ] && { rm -rf .next; mv .next-prev .next; }
  exit 1
fi

# 5. restart + health
if ! restart_and_check; then
  log "✖ health failed → automatic rollback to $(git rev-parse --short "$CURRENT_SHA")"
  git checkout -q "$CURRENT_SHA"
  if [ -d .next-prev ]; then
    rm -rf .next
    mv .next-prev .next
    $SUDO systemctl restart "$SERVICE"
  else
    build && $SUDO systemctl restart "$SERVICE"
  fi
  exit 1
fi

# 6. ensure data stays owned by the systemd user before the next backup tick
fix_data_ownership

# 7. warm the automation engine once so the new code's checks/backup run immediately
if command -v npx >/dev/null 2>&1; then
  log "post-deploy automation tick (as $APP_USER)"
  (run_as_app npx --yes tsx scripts/bhc-cli.ts automations tick >>"$LOG_FILE" 2>&1 || log "tick reported errors (non-fatal)")
fi

rm -rf .next-prev
log "=== deploy complete $(git rev-parse --short HEAD)"

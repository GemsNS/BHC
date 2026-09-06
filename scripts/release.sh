#!/usr/bin/env bash
# Release from your workstation: verify → push main → (optionally) deploy over SSH.
#
#   npm run release                  verify, push origin main, then let GitHub Actions deploy
#   npm run release -- --ssh         also run deploy/production/deploy.sh on the host via SSH
#   npm run release -- --skip-verify skip local checks (CI still runs them)
#
# SSH target comes from env: PROD_SSH="user@bhcontracting.ca" (optional PROD_APP_DIR=/opt/bhc)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSH=0
SKIP_VERIFY=0
for a in "$@"; do
  case "$a" in
    --ssh) SSH=1 ;;
    --skip-verify) SKIP_VERIFY=1 ;;
  esac
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "✖ You are on '$BRANCH'. Merge to main first (user preference: merge verified PRs into main)." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "✖ Working tree is not clean. Commit or stash first." >&2
  git status --short
  exit 1
fi

if [ "$SKIP_VERIFY" = "0" ]; then
  bash scripts/verify.sh
fi

echo "▶ pushing main → origin"
git push origin main

SHA="$(git rev-parse --short HEAD)"
echo "✔ pushed $SHA. GitHub Actions 'Deploy production' will run if PROD_SSH_* secrets are configured."

if [ "$SSH" = "1" ]; then
  : "${PROD_SSH:?Set PROD_SSH=user@host to deploy over SSH}"
  APP_DIR="${PROD_APP_DIR:-/opt/bhc}"
  echo "▶ deploying on $PROD_SSH ($APP_DIR)"
  ssh "$PROD_SSH" "bash -lc 'cd $APP_DIR && bash deploy/production/deploy.sh'"
fi

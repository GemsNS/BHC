#!/usr/bin/env bash
# Local verification gate — the same checks CI runs. Fails fast.
#   npm run verify            lint + typecheck + test + build
#   npm run verify -- --quick lint + typecheck + test (skip build)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

QUICK=0
for a in "$@"; do
  [ "$a" = "--quick" ] && QUICK=1
done

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

step "lint"
npm run lint

step "typecheck"
npm run typecheck

step "test"
npm test

if [ "$QUICK" = "0" ]; then
  step "build"
  NEXT_TELEMETRY_DISABLED=1 npm run build
fi

printf '\n\033[1;32m✔ verify passed\033[0m\n'

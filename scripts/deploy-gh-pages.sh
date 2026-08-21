#!/usr/bin/env bash
# Publish ./out to the gh-pages branch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/build-gh-pages.sh"

npx --yes gh-pages@6 -d out -b gh-pages --dotfiles
echo "Published to gh-pages branch. Demo: https://gemsns.github.io/BHC-ALL-IN-ONE/"

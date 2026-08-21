#!/usr/bin/env bash
# Build a static demo for GitHub Pages (no API routes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_DIR="$ROOT/src/app/api"
BACKUP="$ROOT/.api-backup-ghpages"

if [ -d "$BACKUP" ]; then
  rm -rf "$BACKUP"
fi

mv "$API_DIR" "$BACKUP"

cleanup() {
  if [ -d "$BACKUP" ] && [ ! -d "$API_DIR" ]; then
    mv "$BACKUP" "$API_DIR"
  fi
}
trap cleanup EXIT

export NEXT_PUBLIC_STATIC_DEMO=1
export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/BHC-ALL-IN-ONE}"

echo "Building static demo with basePath=$NEXT_PUBLIC_BASE_PATH"
rm -rf out
npx next build

# GitHub Pages: skip Jekyll processing
touch out/.nojekyll

# Rewrite manifest start_url for base path
if [ -f out/manifest.webmanifest ]; then
  node -e "
    const fs=require('fs');
    const p='out/manifest.webmanifest';
    const m=JSON.parse(fs.readFileSync(p,'utf8'));
    const base=process.env.NEXT_PUBLIC_BASE_PATH||'';
    m.start_url=base+'/apps/';
    m.icons=(m.icons||[]).map(i=>({...i,src: base + i.src}));
    fs.writeFileSync(p, JSON.stringify(m,null,2));
  "
fi

echo "Static export ready in ./out"

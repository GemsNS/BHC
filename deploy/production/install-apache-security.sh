#!/usr/bin/env bash
# Install Apache security snippet for bhcontracting.ca.
# Run on the production host as root (or with sudo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/deploy/production/apache-bhc-security.conf"
DEST_DIR="/etc/apache2/conf-available"
DEST="$DEST_DIR/bhc-security.conf"
VHOST_HINT="/etc/apache2/sites-enabled"

if [ ! -f "$SRC" ]; then
  echo "missing $SRC" >&2
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  exec sudo bash "$0" "$@"
fi

if ! command -v apache2ctl >/dev/null 2>&1; then
  echo "apache2 not installed — skip (Next.js headers still apply after deploy)"
  exit 0
fi

a2enmod headers >/dev/null 2>&1 || true
mkdir -p "$DEST_DIR"
cp -f "$SRC" "$DEST"
a2enconf bhc-security >/dev/null 2>&1 || true

apache2ctl configtest
systemctl reload apache2
echo "✔ installed $DEST and reloaded apache2"
echo "  Tip: if Server still shows Apache/x.y, ensure no other vhost overrides ServerTokens."
if [ -d "$VHOST_HINT" ]; then
  echo "  Enabled sites:"
  ls -1 "$VHOST_HINT" 2>/dev/null || true
fi

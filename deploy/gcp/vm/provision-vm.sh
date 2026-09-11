#!/usr/bin/env bash
# Provision a GCE VM for BHC: Node 20, Apache reverse proxy, systemd, persistent data.
# Run ON THE VM as root (or with sudo), after cloning the repo to /opt/bhc.
#
# Usage:
#   sudo bash deploy/gcp/vm/provision-vm.sh
#
# Requires /etc/bhc/bhc.env with GEMINI_API_KEY (see deploy/gcp/vm/bhc.env.example)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bhc}"
DATA_DIR="${DATA_DIR:-/var/bhc/data}"
ENV_FILE="/etc/bhc/bhc.env"
NODE_MAJOR=20

echo "==> BHC VM provision (Apache + Node ${NODE_MAJOR})"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg apache2 certbot python3-certbot-apache git rsync

# Node 20 via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  apt-get install -y -qq nodejs
fi

echo "Node: $(node -v)  npm: $(npm -v)"

mkdir -p /etc/bhc "$DATA_DIR"
chown -R www-data:www-data "$DATA_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$APP_DIR/deploy/gcp/vm/bhc.env.example" ]]; then
    cp "$APP_DIR/deploy/gcp/vm/bhc.env.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Created $ENV_FILE — edit GEMINI_API_KEY before starting bhc.service"
  else
    echo "ERROR: missing $ENV_FILE and bhc.env.example"
    exit 1
  fi
fi

# App install
if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "ERROR: clone repo to $APP_DIR first"
  exit 1
fi

cd "$APP_DIR"
mkdir -p data
if [[ ! -L data ]] && [[ ! -f data/store.json ]]; then
  rm -rf data
  ln -sfn "$DATA_DIR" data
fi
chown -R www-data:www-data "$APP_DIR" "$DATA_DIR" 2>/dev/null || true

sudo -u www-data bash -c "cd $APP_DIR && npm ci && npm run build"

# systemd
cp "$APP_DIR/deploy/gcp/vm/bhc.service" /etc/systemd/system/bhc.service
systemctl daemon-reload
systemctl enable bhc
systemctl restart bhc

# Apache
a2enmod proxy proxy_http proxy_wstunnel headers rewrite ssl 2>/dev/null || true
cp "$APP_DIR/deploy/gcp/vm/apache-bhc.conf" /etc/apache2/sites-available/bhc.conf
a2ensite bhc.conf 2>/dev/null || a2ensite bhc
a2dissite 000-default.conf 2>/dev/null || true
apache2ctl configtest
systemctl reload apache2

echo ""
echo "==> Provision complete (HTTP on port 80)"
echo "    BHC app:  systemctl status bhc"
echo "    Apache:   systemctl status apache2"
echo "    Test:     curl -sS http://127.0.0.1/api/ai/status"
echo ""
echo "After DNS A-record points to this VM's external IP, run:"
echo "    sudo bash $APP_DIR/deploy/gcp/vm/post-dns-https.sh YOUR_DOMAIN"

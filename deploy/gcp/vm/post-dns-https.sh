#!/usr/bin/env bash
# Run AFTER the domain A-record points to this VM's public IP.
# Issues Let's Encrypt cert via certbot + Apache, enables HTTPS redirect.
#
# Usage:
#   sudo bash deploy/gcp/vm/post-dns-https.sh ops.bhcontracting.co
#   sudo bash deploy/gcp/vm/post-dns-https.sh ops.bhcontracting.co admin@bhcontracting.co

set -euo pipefail

DOMAIN="${1:?Usage: $0 DOMAIN [EMAIL]}"
EMAIL="${2:-bhcontractingadmin@gmail.com}"
APP_DIR="${APP_DIR:-/opt/bhc}"
APACHE_SITE="/etc/apache2/sites-available/bhc.conf"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0 $*"
  exit 1
fi

echo "==> Verifying DNS for $DOMAIN"
IP="$(dig +short "$DOMAIN" | tail -1)"
EXT="$(curl -fsS -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || curl -fsS ifconfig.me)"
echo "    DNS resolves to: ${IP:-unknown}"
echo "    VM external IP:  ${EXT:-unknown}"

if [[ -z "$IP" ]]; then
  echo "WARN: DNS not propagated yet. Certbot may fail — wait and retry."
fi

# Update ServerName in Apache vhost
if grep -q 'ServerName _default_' "$APACHE_SITE"; then
  sed -i "s/ServerName _default_/ServerName $DOMAIN/" "$APACHE_SITE"
fi
apache2ctl configtest
systemctl reload apache2

echo "==> Requesting Let's Encrypt certificate"
certbot --apache -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

# Ensure HTTPS forwarded proto for Next.js
if ! grep -q 'X-Forwarded-Proto "https"' "$APACHE_SITE"; then
  echo "Note: certbot may have created a separate SSL vhost; forwarded headers should be set there."
fi

systemctl reload apache2
echo ""
echo "==> HTTPS enabled for https://$DOMAIN"
echo "    Test: curl -sS https://$DOMAIN/api/ai/status"
echo "    Renew: certbot renew (timer installed by certbot package)"

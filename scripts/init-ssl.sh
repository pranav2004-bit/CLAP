#!/bin/bash
# ================================================================
# CLAP SSL Bootstrap — First-time Let's Encrypt setup
# ================================================================
# Run ONCE on EC2 after DNS A record for api.sanjivo.com has
# propagated to 13.200.200.90 (verify with: dig api.sanjivo.com)
#
# Usage:
#   chmod +x scripts/init-ssl.sh
#   ./scripts/init-ssl.sh your-email@example.com
#
# What it does:
#   1. Creates a temporary self-signed cert so Nginx can start
#   2. Starts Nginx (port 80 serves ACME challenge path)
#   3. Runs Certbot to obtain a real Let's Encrypt cert
#   4. Reloads Nginx with the real cert
# ================================================================

set -euo pipefail

DOMAIN="api.sanjivo.com"
EMAIL="${1:?Usage: ./scripts/init-ssl.sh your-email@example.com}"

echo "==> [1/4] Creating temporary self-signed cert so Nginx can start..."
mkdir -p ./data/certbot/conf/live/$DOMAIN
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout ./data/certbot/conf/live/$DOMAIN/privkey.pem \
  -out    ./data/certbot/conf/live/$DOMAIN/fullchain.pem \
  -subj   "/CN=localhost" 2>/dev/null

# Required by Nginx ssl_session_cache shared SSL — create dummy dhparams
mkdir -p ./data/certbot/conf
if [ ! -f ./data/certbot/conf/ssl-dhparams.pem ]; then
  openssl dhparam -out ./data/certbot/conf/ssl-dhparams.pem 2048 2>/dev/null
fi

echo "==> [2/4] Starting Nginx (HTTP only for ACME challenge)..."
docker compose up -d nginx
sleep 3  # give Nginx a moment to fully start

echo "==> [3/4] Requesting Let's Encrypt certificate for $DOMAIN..."
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --domain "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --force-renewal

echo "==> [4/4] Reloading Nginx with real certificate..."
docker compose kill -s HUP nginx

echo ""
echo "SSL certificate installed successfully!"
echo "Test: curl -I https://$DOMAIN/api/health/"

#!/bin/bash
# Build the dashboard, deploy the Worker (voice + chat + dashboard) to Cloudflare, warm the weather cache.
# Everything runs on the Cloudflare free plan.
set -e
cd "$(dirname "$0")"
[ -f .env ] || { echo ".env not found"; exit 1; }
set -a; source <(grep -E '^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|ACCESS_CODE)=' .env); set +a

echo "[1/3] Building dashboard..."
(cd frontend && ([ -d node_modules ] || npm install --silent --legacy-peer-deps) && npx vite build >/dev/null)

echo "[2/3] Deploying Worker..."
(cd worker && ([ -d node_modules ] || npm install --silent) && npx wrangler deploy)

URL=$(cd worker && npx wrangler deployments list 2>/dev/null | grep -o 'https://[^ ]*workers.dev' | head -1)
URL=${URL:-$(grep -E '^AGENT_URL=' .env | cut -d= -f2-)}
echo "[3/3] Warming weather cache at $URL ..."
curl -s -X POST "$URL/api/warm${ACCESS_CODE:+?code=$ACCESS_CODE}"; echo
echo "Open: $URL${ACCESS_CODE:+/?code=<ACCESS_CODE from .env>}"

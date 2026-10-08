#!/bin/bash
# One-time setup of the free-tier Cloudflare resources the Worker needs (idempotent).
# Requires CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN in the environment (or ../.env).
set -e
cd "$(dirname "$0")/.."
[ -f ../.env ] && { set -a; source <(grep -E '^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN)=' ../.env); set +a; }
W="npx wrangler"

echo "Vectorize index (UC research)..."
$W vectorize create agribot-knowledge --dimensions=768 --metric=cosine 2>&1 | grep -iE "created|already|exists" || true
$W vectorize create-metadata-index agribot-knowledge --property-name=crop --type=string 2>&1 | grep -iE "enqueued|already|exists" || true

echo "KV namespace (warm weather + satellite snapshots)..."
if grep -q REPLACE_WITH_KV_ID wrangler.jsonc; then
  ID=$($W kv namespace create SNAPSHOTS 2>&1 | grep -o '"id": "[a-f0-9]*"' | head -1 | cut -d'"' -f4)
  [ -n "$ID" ] && sed -i.bak "s/REPLACE_WITH_KV_ID/$ID/" wrangler.jsonc && rm -f wrangler.jsonc.bak && echo "  KV id $ID written to wrangler.jsonc"
fi

echo "AI Gateway (free analytics for chat)..."
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways" \
  -d '{"id":"agribot","cache_ttl":0,"cache_invalidate_on_update":false,"collect_logs":true,"rate_limiting_interval":60,"rate_limiting_limit":120,"rate_limiting_technique":"sliding"}' | head -c 120; echo

echo "Next: python backend/scripts/ingest_pdfs.py   (embeds data/research/*.pdf into Vectorize)"
echo "      ./deploy_cloudflare.sh"

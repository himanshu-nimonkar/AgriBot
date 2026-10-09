#!/bin/bash
# AgriBot local development.
#   ./start_agribot.sh                 Worker (voice + chat brain) + dashboard, both local
#   ./start_agribot.sh --with-backend  ... plus the optional Python backend (map tiles, Field Vision, yield)
# Production is one command: ./deploy_cloudflare.sh   (no laptop, no tunnel, no phone carrier)

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
cleanup() { echo -e "\n${RED}Shutting down...${NC}"; kill $(jobs -p) 2>/dev/null; exit; }
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}AgriBot (Cloudflare edition)${NC}\n=============================="
[ -f ".env" ] || { echo -e "${RED}.env not found.${NC} Copy .env.example and add CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN."; exit 1; }
set -a; source <(grep -E '^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN)=' .env); set +a

# 1. Worker: Durable Objects, KV and the dashboard run locally; Workers AI + Vectorize are the real Cloudflare services
echo -e "${BLUE}Starting the Cloudflare Worker (local)...${NC}"
[ -d worker/node_modules ] || (cd worker && npm install --silent)
(cd worker && npx wrangler dev --port 8787 --ip 127.0.0.1 > ../worker.log 2>&1 &)
sleep 6

# 2. Optional Python backend (not needed for voice/chat)
if [[ "$*" == *"--with-backend"* ]]; then
    echo -e "${BLUE}Starting optional Python backend (port 8000)...${NC}"
    [ -d venv ] || { python3 -m venv venv && source venv/bin/activate && pip install -q -r backend/requirements.txt; }
    source venv/bin/activate
    (cd backend && nohup python -m uvicorn main:app --host 127.0.0.1 --port 8000 > ../backend.log 2>&1 &)
    API_HINT="http://127.0.0.1:8000"
fi

# 3. Dashboard
echo -e "${BLUE}Starting the dashboard...${NC}"
cd frontend && { [ -d node_modules ] || npm install --silent --legacy-peer-deps; }
VITE_AGENT_URL=http://127.0.0.1:8787 nohup npm run dev -- --host > ../frontend.log 2>&1 &
cd ..

echo -e "\n${GREEN}Ready${NC}"
echo "   Dashboard:    http://localhost:5173/${API_HINT:+?api_url=$API_HINT}"
echo "   Worker:       http://127.0.0.1:8787/api/voice/status"
echo "   Logs:         worker.log  frontend.log${API_HINT:+  backend.log}"
echo "   Ctrl+C to stop."
wait

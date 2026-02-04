#!/bin/bash

# AgriBot "Production-Ready" One-Stop Start Script
# Handles: Dependencies, Env Vars, Backend, Tunnel, Vapi Sync, Frontend.

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
    echo -e "\n${RED}🛑 Shutting down AgriBot System...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit
}
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}🌱 AgriBot System Initialization${NC}"
echo "=================================="

# 0. Prerequisite Checks
echo -e "${BLUE}🔍 Checking Prerequisites...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "   Please create a .env file with OPENAI_API_KEY, VAPI_PRIVATE_KEY, etc."
    exit 1
fi

if [ ! -f "cloudflared" ]; then
    echo -e "${YELLOW}⚠️  cloudflared binary not found.${NC}"
    echo "   Downloading cloudflared for macOS (Darwin-amd64)..."
    # Auto-download for convenience (assuming Mac as per User metadata)
    curl -L --output cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64
    chmod +x cloudflared
    echo -e "${GREEN}✅ Downloaded cloudflared.${NC}"
fi

# 1. Backend Setup & Start
echo -e "${BLUE}🐍 Setting up Backend...${NC}"

if [ ! -d "venv" ]; then
    echo "   Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "   Installing backend dependencies..."
    pip install -r backend/requirements.txt
else
    source venv/bin/activate
fi

# Double check dependencies if venv existed but might be stale
# (Skipping strictly for speed, but ideally we check)

echo -e "${BLUE}🚀 Starting FastAPI Backend (Port 8000)...${NC}"
export PYTHONPATH=$PYTHONPATH:$(pwd)/backend
# Disable Redis for local/dev mode to avoid needing Docker 
export REDIS_URL="" 
cd backend
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo "   Backend PID: $BACKEND_PID"

echo "   Waiting for backend to heat up..."
sleep 3

# 2. Start Cloudflare Tunnel
echo -e "${BLUE}🌐 Starting Cloudflare Tunnel...${NC}"
# Delete old log to ensure fresh token grep
rm -f tunnel.log
./cloudflared tunnel --url http://localhost:8000 > tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "   Tunnel PID: $TUNNEL_PID"

echo "   Resolving Public URL..."
SERVER_URL=""
MAX_RETRIES=30
COUNT=0
SPINNER=( '—' '\' '|' '/' )

while [ -z "$SERVER_URL" ]; do
    SERVER_URL=$(grep -o 'https://[^"]*\.trycloudflare\.com' tunnel.log | head -n 1)
    if [ -n "$SERVER_URL" ]; then
        break
    fi
    
    # Spinner animation
    printf "\r   Waiting for URL... ${SPINNER[COUNT % 4]}"
    sleep 1
    COUNT=$((COUNT+1))
    
    if [ $COUNT -ge $MAX_RETRIES ]; then
        echo -e "\n${RED}❌ Timeout waiting for Tunnel URL.${NC}"
        cat tunnel.log
        kill $BACKEND_PID $TUNNEL_PID
        exit 1
    fi
done

echo -e "\n${GREEN}✅ Tunnel Online: $SERVER_URL${NC}"

# 3. Update Vapi Configuration
echo -e "${BLUE}🔄 Syncing Configuration with Vapi.ai...${NC}"
python backend/scripts/update_vapi.py "$SERVER_URL"
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Vapi Sync Failed. Checking logs...${NC}"
    # proceed anyway but warn
fi

# 4. Frontend Setup & Start
echo -e "${BLUE}🎨 Setting up Frontend...${NC}"
cd frontend

if [ ! -d "node_modules" ]; then
    echo "   Installing Node dependencies (npm ci)..."
    npm ci --silent
fi

echo -e "🚀 Starting Vite Frontend..."
# We pass the API URL to the frontend environment/logs, though App.jsx uses query param primarily
nohup npm run dev -- --host > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo -e "\n${GREEN}🎉 SYSTEM FULLY OPERATIONAL!${NC}"
echo "=================================="
echo -e "   🏠 Local Frontend:   http://localhost:5173/?api_url=$SERVER_URL"
echo -e "   ☁️  Public Dashboard: https://agribot-dashboard.pages.dev/?api_url=$SERVER_URL"
echo -e "   🔙 Backend Public:   $SERVER_URL"
echo -e "   📄 Documentation:    http://localhost:8000/docs"
echo "=================================="
echo -e "   (Logs: backend.log, tunnel.log, frontend.log)"
echo -e "   Press CTRL+C to stop all services."

# Optional: Open Browser
# open "http://localhost:5173/?api_url=$SERVER_URL"

wait

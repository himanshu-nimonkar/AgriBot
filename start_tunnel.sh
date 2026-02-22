#!/bin/bash

# AgriBot: Local Backend Tunneling Script
# This script uses Cloudflare Tunnels (Quick Tunnels) to expose your local
# FastAPI backend (port 8000) to the internet so you can use it on your phone
# with the deployed Cloudflare Pages site.

echo ""
echo "🌾 AgriBot: Starting Backend Tunnel..."
echo "======================================"

# 1. Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null
then
    echo "❌ ERROR: 'cloudflared' is not installed."
    echo "Please install it using: brew install cloudflared"
    exit 1
fi

echo "[1/2] Connecting to Cloudflare edge..."
echo "[2/2] Exposing local port 8000..."
echo ""
echo "🔥 CRITICAL INSTRUCTIONS:"
echo "1. Look for a line below starting with 'https://' ending in '.trycloudflare.com'"
echo "2. Copy that URL."
echo "3. On your phone, open: https://agribot-dashboard.pages.dev/?api_url=<PASTE_URL_HERE>"
echo ""
echo "Note: Keep this terminal open while using the app."
echo "======================================"
echo ""

# Start the tunnel (Quick Tunnel mode)
cloudflared tunnel --url http://localhost:8000

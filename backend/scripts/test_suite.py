import requests
import asyncio
import websockets
import json
import os
from datetime import datetime

# Configuration
API_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws/dashboard"

def log(msg, status="INFO"):
    colors = {
        "INFO": "\033[94m",
        "SUCCESS": "\033[92m",
        "ERROR": "\033[91m",
        "RESET": "\033[0m"
    }
    print(f"{colors.get(status, '')}[{status}] {msg}{colors['RESET']}")

def test_health():
    try:
        log("Testing Backend Health...")
        response = requests.get(f"{API_URL}/health")
        if response.status_code == 200:
            data = response.json()
            log(f"Backend Healthy: {data}", "SUCCESS")
            return True
        else:
            log(f"Backend Returned {response.status_code}", "ERROR")
            return False
    except Exception as e:
        log(f"Backend Connection Failed: {e}", "ERROR")
        return False

async def test_websocket():
    try:
        log("Testing WebSocket Connection...")
        async with websockets.connect(WS_URL) as websocket:
            # Wait for connection message
            response = await websocket.recv()
            data = json.loads(response)
            if data.get("type") == "connected":
                log("WebSocket Connected Successfully", "SUCCESS")
                
                # Test Ping
                await websocket.send("ping")
                pong = await websocket.recv()
                if pong == "pong":
                    log("WebSocket Ping/Pong Successful", "SUCCESS")
                    return True
                else:
                    log(f"WebSocket Pong Failed: {pong}", "ERROR")
            else:
                log(f"Unexpected WS Welcome: {data}", "ERROR")
    except Exception as e:
        log(f"WebSocket Failed: {e}", "ERROR")
        return False

def test_gee_integration():
    # This invokes the analyze endpoint which uses GEE
    payload = {
        "query": "What is the NDVI index for this location?",
        "lat": 38.5449,
        "lon": -121.7405,
        "crop": "almonds",
        "session_id": "test-suite"
    }
    try:
        log("Testing GEE & Analysis Pipeline (may take 5-10s)...")
        response = requests.post(f"{API_URL}/api/analyze", json=payload)
        if response.status_code == 200:
            data = response.json()
            if data.get("satellite_data"):
                log("GEE Satellite Data Received", "SUCCESS")
                log(f"NDVI: {data['satellite_data'].get('ndvi_current')}", "INFO")
                return True
            else:
                log("Analysis Success but NO Satellite Data (GEE Issue?)", "ERROR")
                return False
        else:
            log(f"Analysis Failed: {response.text}", "ERROR")
            return False
    except Exception as e:
        log(f"Analysis Request Error: {e}", "ERROR")
        return False

async def main():
    print("=======================================")
    print("   AGRIBOT TESTING TOOLKIT SOV-1.0    ")
    print("=======================================")
    
    # 1. Health
    if not test_health():
        print("\n[ERROR] CRITICAL: Backend not running. Start it first.")
        return

    # 2. WebSocket
    await test_websocket()

    # 3. GEE / Analysis
    test_gee_integration()
    
    print("\n=======================================")
    print("   TESTING COMPLETE                    ")
    print("=======================================")

if __name__ == "__main__":
    asyncio.run(main())

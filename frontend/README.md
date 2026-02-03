# 🚜 AgriBot: Deep-Ag Copilot

**AgriBot** is a cutting-edge, voice-activated agricultural assistant that combines **Real-Time Satellite Data (Google Earth Engine)**, **Conversational AI (LLM)**, and **Hyper-Local Weather** to provide PhD-level agronomic advice to farmers.

![Status](https://img.shields.io/badge/System-Online-success)
![Vapi](https://img.shields.io/badge/Voice_AI-Active-purple)
![GEE](https://img.shields.io/badge/Satellite_Data-Live-green)

---

## 🌟 Key Features

### 1. 🗣️ Real-Time Voice Intelligence

- **Powered by Vapi.ai**: Talk to your farm data like you talk to a human.
- **Latency-Optimized**: Uses Cloudflare Tunnels for ultra-low latency voice responses.
- **Context-Aware**: Remembers previous questions in the conversation (e.g., "What about water?" knows you're talking about the previously mentioned crop).

### 2. 🛰️ Satellite-Powered Analytics (Google Earth Engine)

- **Live Imagery**: Pulls real-time Sentinel-2 satellite data.
- **Key Metrics**:
  - **NDVI (Normalized Difference Vegetation Index)**: Measures crop health/vigor.
  - **NDWI (Normalized Difference Water Index)**: Detects water stress levels.
- **Interactive Map**: Displays dynamic NDVI overlays directly on the field map.
- **Geospatial Precision**: Analyze specific fields by address (e.g., "123 Farm Lane").

### 3. 🧠 Advanced Reasoning Engine

- **RAG Methodology**: Retrieves relevant agricultural research papers.
- **Multi-Factor Analysis**: Combines weather forecasts, soil data, and historical trends.
- **Robust Architecture**: Supports both robust Dockerized deployments and lightweight local runs without external dependencies (graceful degradation without Redis).
- **Hybrid Deployment**: Local stability for the dashboard + Cloudflare edge performance for the voice agent.

---

## 🚀 Quick Start

### 1. Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Cloudflared** (for secure tunneling)

### 2. Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-repo/agribot.git
cd agribot

# 2. Setup Backend
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 3. Setup Frontend
cd frontend
npm install
```

### 3. Configuration (`.env`)

Create a `.env` file in the root directory:

```ini
# --- Cloudflare (Tunnel & AI) ---
CLOUDFLARE_ACCOUNT_ID=your_id
CLOUDFLARE_API_TOKEN=your_token

# --- Vapi.ai (Voice) ---
VAPI_PRIVATE_KEY=your_private_key
VAPI_PUBLIC_KEY=your_public_key

# --- Google Earth Engine ---
# Absolute path to your JSON key file
GEE_SERVICE_ACCOUNT_FILE=/path/to/indigo-splice-xxxx.json

# --- Optional (For Sessions & Rate Limiting) ---
# Leave empty for lightweight local mode
REDIS_URL=redis://localhost:6379
```

### 4. Run the System

#### Option A: Lightweight Local Mode (Recommended for testing)

Uses a single script to start the Backend, Cloudflare Tunnel, Vapi Updater, and Frontend.

```bash
./start_agribot.sh
```

**What happens?**

1.  **Backend**: Starts on `127.0.0.1:8000`.
2.  **Tunnel**: Opens a secure tunnel (`https://....trycloudflare.com`).
3.  **Vapi**: Updates your assistant with the new Tunnel URL.
4.  **Frontend**: Launches on `http://localhost:5173`.
5.  **Bonus**: You can connect a deployed Cloudflare Pages frontend to your local backend by appending `?api_url=https://your-tunnel-url.trycloudflare.com`.

#### Option B: Dockerized Deployment

For a production-grade setup with Redis and Celery:

```bash
./start_docker.sh
```

---

## 🏗️ Architecture

```mermaid
graph TD
    User[Farmer (Voice/Chat)] -->|WebSocket| Vapi[Vapi.ai Voice Gateway]
    User -->|HTTP| Dashboard[Local React Dashboard]

    subgraph "Hybrid Infrastructure"
        Vapi -->|HTTPS| Tunnel[Cloudflare Tunnel]
        Tunnel -->|Forward| Backend[FastAPI Backend]
        Dashboard -->|Direct| Backend
    end

    subgraph "Intelligence Layer"
        Backend -->|Analysis| GEE[Google Earth Engine]
        Backend -->|Inference| LLM[LLM Reasoning Core]
        Backend -->|Weather| Meteo[Open-Meteo API]
    end
```

---

## 🌍 Google Earth Engine (GEE) Integration

AgriBot uses GEE to fetch ground-truth data.

- **Setup**: Requires a Google Cloud Service Account with GEE API enabled.
- **Key File**: Place your JSON key in the root and reference it in `.env` as `GEE_SERVICE_ACCOUNT_FILE`.
- **Mock Mode**: If GEE is not configured, the system gracefully falls back to simulated data, allowing Development without credentials.
- **Metrics**:
  - **NDVI**: `(NIR - Red) / (NIR + Red)`
  - **NDWI**: `(Green - NIR) / (Green + NIR)`

---

## 🛠️ Troubleshooting

**1. "Offline" Status on Dashboard?**

- Ensure `start_agribot.sh` is running.
- Check if `VITE_API_URL` in `frontend/.env` is set to `http://127.0.0.1:8000`.

**2. Vapi Call Drops?**

- The Tunnel URL changes on every restart. Always use the start script to auto-update Vapi.
- Check the script output for "✅ Vapi Configured".

**3. "Invalid Date" or Map Errors?**

- This usually means GEE Authentication failed.
- Check that `GEE_SERVICE_ACCOUNT_FILE` path is correct and the file exists.
- If running without GEE, ensure Mock Mode is active (logs will say "Switching Geospatial Service to MOCK MODE").

---

## 📜 License

MIT License. Built for the Future of Agriculture.

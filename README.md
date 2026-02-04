# Yolo Deep-Ag Copilot: Autonomous Agricultural Intelligence System

**Production Verification Status**: Verified (Feb 2026)  
**System Version**: 1.2.0

---

## 1. Project Overview

### Core Problem

Farmers in Yolo County operate in a high-stakes environment where decision-making requires synthesizing fragmented data: soil telemetry, satellite imagery, weather models, and academic research. Accessing this data in the field is often impossible, leading to decisions based on intuition rather than precision agronomy.

### Solution

**Deep-Ag Copilot** (AgriBot) is a multimodal agricultural intelligence system. It unifies satellite telemetry, weather forecasting, and vector-searchable agronomic research into a single conversational interface. Farmers can query the system via **Voice** (Phone/PSTN) or **Text** (Web Dashboard).

### Domain Constraints

- **Geography**: Strictly bounded to **Yolo County, CA** (USDA Hardiness Zone 9b).
- **Crops**: Specialized knowledge for **Almonds, Process Tomatoes, Wine Grapes, Rice, Walnuts, and Pistachios**.
- **Interface**: Voice-first design for hands-free field operation; Text-fallback for precision office work.

---

## 2. High-Level System Architecture

The system enables a **Real-Time Reasoning Loop** where voice/text input triggers parallel data acquisition from satellites, weather stations, and research databases.

### Architecture Diagram

1.  **Interaction Layer**:
    - **Voice**: Managed by **Vapi.ai**, routing PSTN calls to the backend via WebSocket.
    - **Web**: A **React/Vite** dashboard visualizing the "Brain's" state (Satellite Maps, Thinking Logic, citations) alongside a text chat interface.
2.  **Orchestration Layer**:
    - **FastAPI Backend**: The central nervous system. It handles intent classification, tool execution, and session state.
    - **Async Logic**: Uses `asyncio` to execute blocking I/O (Geocoding, GEE, RAG) in parallel to minimize latency.
3.  **Intelligence Layer**:
    - **Reasoning Engine**: A customized LLM (Llama 3.1 8B via Cloudflare) that synthesizes data into actionable advice.
    - **RAG System**: A ChromaDB vector store containing indexed PDF research from UC ANR and UC IPM.
4.  **Data Layer**:
    - **Google Earth Engine**: Computes real-time NDVI/NDWI for specific coordinates.
    - **OpenMeteo**: Provides hyper-local historical and forecast weather data.

---

## 3. Technology Stack

### Frontend Application

- **React 18 + Vite**: Chosen for high-performance rendering and rapid HMR.
- **Node.js**: Build environment (not runtime).
- **TailwindCSS**: "Glassmorphism" UI for high-contrast visibility in outdoor settings.
- **React-Leaflet**: Renders dynamic map tiles from Earth Engine.
- **WebSocket**: Subscribes to backend events (`satellite_update`, `thought_stream`) for real-time visualization.

### Backend Infrastructure

- **Python 3.12.9**: Selected for rich geospatial (GEE) and AI (LangChain) ecosystem.
- **FastAPI**: High-concurrency async web framework.
- **Uvicorn**: ASGI Server.
- **Cloudflare Tunnel**: Exposes the local backend securely to the public internet (Vapi/Web).

### AI & Data

- **Google Earth Engine (GEE)**: Server-side geospatial computation for satellite imagery.
- **ChromaDB**: Lightweight, local vector database for RAG (Retrieval-Augmented Generation).
- **Vapi.ai**: Voice orchestration platform integrating:
  - **Deepgram Nova-2**: Speech-to-text transcription
  - **ElevenLabs**: High-quality text-to-speech synthesis
- **Cloudflare Workers AI**: Low-latency inference using Llama 3.1 8B Instruct Fast model.
- **Sentence Transformers**: `all-MiniLM-L6-v2` for document embeddings (384 dimensions).

### Additional Dependencies

- **Redis** (Optional): For rate limiting and distributed session storage.
- **Celery** (Optional): For background task processing.
- **FastAPI-Limiter**: Rate limiting middleware (works with or without Redis).
- **LangChain**: Agent orchestration and prompt management.
- **PDFPlumber & PyPDF**: PDF parsing for research document ingestion.
- **Pandas & NumPy**: Data processing for weather and market analysis.

---

## 4. Frontend Architecture

The Frontend is a **Reactive Visualization Terminal**. It supports two modes of interaction:

1.  **Passive Mode (Voice Call)**: Users talk on the phone. The dashboard auto-updates to show the map location, satellite layers, and citations mentioned in the call.
2.  **Active Mode (Text Chat)**: Users type queries directly into the dashboard.

### Key Components

- **App.jsx**: Manages global state (`location`, `weatherData`, `messages`) and WebSocket reconnection logic.
- **LiveMap.jsx**: A specialized map component that overlays NDVI/NDWI tiles. It listens for `satellite_update` events to zoom to the user's field automatically.
- **ConversationStream.jsx**: Displays the transcript. It handles "Thinking" states by showing pulsing indicators when the backend is processing.
- **WhyBox.jsx**: A transparency module that lists the _exact_ sources (PDFs, URLs) used to generate the last answer.

---

## 5. Backend Architecture

### Design Pattern: Async Tool Orchestration

The backend is structured around **Service Modules** (`services/`) invoked by a central **Reasoning Engine** (`agents/reasoning_engine.py`).

### Request Lifecycle

1.  **Ingest**: `main.py` receives a text query or Vapi voice webhook.
2.  **Intent Parsing**: The LLM extracts entities (Crop: "Almonds", Location: "Davis").
3.  **Parallel Execution**:
    - `satellite.py` -> GEE API (Compute NDVI)
    - `weather.py` -> OpenMeteo API (Fetch Forecast)
    - `rag.py` -> ChromaDB (Search Embeddings)
4.  **Synthesis**: The LLM combines these 3 inputs into a natural language response.
5.  **Streaming**: The response is streamed to the user (via SSE for Vapi, JSON for Web) with "Filler Phrases" ("Analyzing satellite data...") to mask 10-15s latency.

---

## 6. Voice and Vapi Integration

### Telephony Flow

- **Inbound**: User calls the configured Vapi phone number.
- **Handshake**: Vapi hits `/webhook/vapi`. Backend returns the Assistant Config (System Prompt, Voice ID).
- **Assistant Configuration**:
  - **Name**: "Yolo Ag Copilot"
  - **ID**: `e7f5bb75-932b-43bb-b728-ddeb9c13b54a`
  - **Voice**: ElevenLabs (`21m00Tcm4TlvDq8ikWAM`)
  - **Transcriber**: Deepgram Nova-2 (en-US)
  - **Model**: Custom LLM via Cloudflare Workers AI
- **Turn-Taking**:
  - User speaks → Vapi (Deepgram) transcribes.
  - Backend receives transcript → Generates Stream.
  - **Timeout**: 30 seconds of silence ends the call.
  - **Response Delay**: 0.5 seconds to allow natural speech pacing.

---

## 7. Data Flow (Critical Path)

**User Query**: _"Do my tomatoes need water given the heatwave?"_

1.  **Transcription**: "Do my tomatoes need water..."
2.  **Extraction**:
    - _Crop_: Tomatoes
    - _Intent_: Water Stress / Irrigation
    - _Location_: User's Lat/Lon (38.54, -121.74)
3.  **Parallel Fetch**:
    - **GEE**: Computes NDWI (Water Index) = -0.15 (Low/Dry).
    - **Weather**: Forecasts 102°F for next 3 days. Evapotranspiration (ETo) = 0.35 in/day.
    - **RAG**: Retrieves "UC IPM Tomato Irrigation Guidelines" (PDF).
4.  **Reasoning**:
    - _Logic_: NDWI is low + High ETo + Guidelines say "Irrigate at 60% depletion".
    - _Decision_: "Yes, irrigate immediately."
5.  **Response Generation**: "Your field's water index is negatively low at -0.15. With temperatures hitting 102 degrees, UC guidelines recommend immediate deep irrigation."
6.  **UI Sync**: Dashboard map flies to the coordinates and applies the **Red (Water Stress)** layer.

---

## 8. RAG and Knowledge System

- **Ingestion**: `ingest_data.py` recursively scans `data/research/` for PDFs/JSONs.
- **Chunking**: Recursive Text Splitter (1000 chars).
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2`.
- **Citation**: The LLM is strictly prompted to append `[Source: Filename]` to claims. If retrieval confidence is low, the system is instructed to state: "I could not find specific research on this."

---

## 9. Geospatial Intelligence

- **Source**: Sentinel-2 (10m resolution) and Landsat 8/9.
- **Indices**:
  - **NDVI** (Vegetation Health): Uses NIR/Red bands.
  - **NDWI** (Water Stress): Uses NIR/Green bands.
- **Anomaly Detection**: We act as a "Time Machine", comparing today's value against the 5-year average for this specific week. A deviation of >15% triggers an alert.

---

## 10. Environment Variables

Create `.env` in the root (validated by startup script):

```ini
# Cloudflare Workers AI (Required)
CLOUDFLARE_ACCOUNT_ID=...       # Your Cloudflare Account ID
CLOUDFLARE_API_TOKEN=...        # API token with Workers AI and Vectorize permissions

# Vapi.ai Voice Integration (Required for Phone Calls)
VAPI_PRIVATE_KEY=...            # Private key for backend authentication
VAPI_PUBLIC_KEY=...             # Public key for client-side SDK (if used)

# Google Earth Engine (Required for Satellite Data)
GEE_SERVICE_ACCOUNT_FILE=...    # Absolute path to GCP service account JSON file

# Frontend Configuration
VITE_API_URL=http://127.0.0.1:8000  # Backend URL (local dev or tunnel URL)

# Optional: Redis for Rate Limiting and Session Storage
REDIS_URL=                      # Leave empty to use in-memory fallback
                                # Example: redis://localhost:6379/0
```

### Environment Variable Details:

- **CLOUDFLARE_ACCOUNT_ID**: Found in Cloudflare Dashboard → Workers & Pages → Overview
- **CLOUDFLARE_API_TOKEN**: Create at Cloudflare Dashboard → My Profile → API Tokens
  - Required permissions: Account.Workers AI:Read, Account.Vectorize:Edit
- **VAPI_PRIVATE_KEY**: From Vapi.ai Dashboard → API Keys → Private Key
- **VAPI_PUBLIC_KEY**: From Vapi.ai Dashboard → API Keys → Public Key
- **GEE_SERVICE_ACCOUNT_FILE**: Download from Google Cloud Console → IAM → Service Accounts
  - Requires Earth Engine API enabled
  - Service account needs `roles/earthengine.viewer` permission
- **VITE_API_URL**: During development, use `http://127.0.0.1:8000`. For production, use your Cloudflare Tunnel URL or deployed backend URL.
- **REDIS_URL**: Optional. System uses in-memory storage if not provided. Useful for production deployments with multiple backend instances.

---

## 11. Local Development Setup

### System Requirements

- **Operating System**: macOS, Linux, or Windows (with WSL2)
- **Python**: 3.12.9 or higher
- **Node.js**: 18.x or higher
- **Memory**: Minimum 8GB RAM (16GB recommended for satellite processing)
- **Disk Space**: ~2GB for dependencies and research documents
- **Internet**: Required for GEE, Cloudflare, and Vapi APIs

### Required Accounts & API Access

1. **Cloudflare Account** (Free tier available):
   - Workers AI enabled
   - Vectorize index created (name: `agribot-knowledge`)
   - API token generated

2. **Vapi.ai Account** (Paid service ~$0.10/min):
   - Phone number configured
   - API keys generated
   - Assistant created (or use provided configuration)

3. **Google Cloud Platform** (Free tier for Earth Engine):
   - Earth Engine API enabled
   - Service account created
   - Credentials JSON downloaded

### Unified Startup

We provide a **unified startup script** that handles dependencies (pip/npm), tunnels, and process orchestration.

### Fast Start

```bash
./start_agribot.sh
```

_This script checks for `cloudflared`, sets up the Python `venv`, installs `node_modules`, and launches the full stack._

### Manual Steps

1.  **Backend**: `python -m uvicorn main:app --reload`
2.  **Frontend**: `cd frontend && npm run dev`
3.  **Tunnel**: `cloudflared tunnel --url http://localhost:8000`

---

## 12. Deployment Considerations

- **Hosting**:
  - Frontend: **Cloudflare Pages** (Static build).
  - Backend: **AWS EC2** or **GCP Cloud Run** (Containerized).
- **Scaling**: GEE and Cloudflare Workers are serverless/elastic. The Python backend is stateless and horizontally scalable.
- **Logging**: All Vapi calls are logged to `call-logs-*.json` for audit.

---

## 13. System Guarantees & Invariants

This system adheres to strict capabilities to ensure safety:

1.  **Citation Guarantee**: The system **never** offers agronomic advice without citing a retrieval source or explicit telemetry data.
2.  **Geographic Bound**: Advice is strictly calibrated for **Yolo County**. Queries outside this region receive a disclaimer.
3.  **Field-Specific Data**: Satellite data is always fetched for the **user's specific coordinates**, never averaged over the county.
4.  **No Financial Advice**: Economic market data (prices) provides context but is explicitly labeled "Advisory Only".

---

## 14. Failure Modes & Fallback

The system is designed to degrade gracefully:

1.  **GEE Timeout (Satellite Fail)**:
    - _Behavior_: The system skips the visual map overlay.
    - _Voice_: "I currently cannot access live satellite imagery, but based on the weather..."
2.  **RAG Retrieval Miss**:
    - _Behavior_: If no relevant documents are found (distance > threshold).
    - _Voice_: "I checked the UC database but couldn't find specific guidelines for [Rare Crop]."
3.  **Voice Latency**:
    - _Behavior_: If backend processing > 5s.
    - _Mitigation_: Streaming "Filler" phrases ("Checking weather models...") keep the connection alive.

---

## 15. Security & Privacy

- **Data Ephemerality**: Voice audio is processed but not stored permanently by our backend (only transcripts).
- **API Isolation**: Frontend never accesses private keys. All AI calls proxy through the Backend.
- **Rate Limiting**: (Optional) Redis-backed limiting on `/api/analyze` to prevent DOS.

---

## 16. Cost Model

- **Vapi**: ~$0.10/min (Telephony + STT/TTS).
- **Cloudflare Workers AI**: Low cost (per million tokens).
- **Google Earth Engine**: Free for non-commercial/research use.
- _Optimization_: Caching satellite tiles for 24 hours reduces GEE compute costs.

---

## 17. Example Scenario

**Farmer**: _"Can I spray for mites on my almonds tomorrow?"_

1.  **Intent**: `Pest Control` + `Almonds` + `Tomorrow`.
2.  **Data**:
    - _Weather_: Tomorrow wind speed = **15 mph**. Temp = 85°F.
    - _RAG_: "Avoid spraying if wind > 10 mph (Drift Hazard)."
3.  **Reasoning**: Wind speed (15 mph) exceeds safety threshold (10 mph).
4.  **Response**: "I recommend **against** spraying tomorrow. The forecast shows wind speeds of 15 mph, which exceeds the safe threshold of 10 mph for drift control."

---

## 18. Troubleshooting Common Issues

### Backend Won't Start

**Issue**: `ModuleNotFoundError` or missing dependencies
```bash
# Solution: Reinstall dependencies
cd backend
source ../venv/bin/activate
pip install -r requirements.txt
```

**Issue**: `earthengine.ee.EEException: Invalid credential`
```bash
# Solution: Check GEE_SERVICE_ACCOUNT_FILE path and re-authenticate
python backend/scripts/verify_gee.py
```

### Frontend Build Fails

**Issue**: `npm ERR! peer dependency` warnings
```bash
# Solution: Clean install
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Voice Calls Not Working

**Issue**: Vapi can't reach backend
- Ensure Cloudflare tunnel is running
- Check `serverUrl` in Vapi assistant configuration matches tunnel URL
- Verify VAPI_PRIVATE_KEY is correct

**Issue**: "Assistant not found" error
- Check assistant ID matches `e7f5bb75-932b-43bb-b728-ddeb9c13b54a`
- Run `python backend/scripts/update_vapi.py` to sync configuration

### Satellite Data Not Loading

**Issue**: Map shows "Loading..." indefinitely
- Check GEE service account has Earth Engine API enabled
- Verify coordinates are within Yolo County bounds (38.5-39.0 lat, -122.0 to -121.5 lon)
- Check browser console for CORS errors

### Port Conflicts

**Issue**: `Address already in use: 8000` or `5173`
```bash
# Solution: Kill existing processes
pkill -f "uvicorn|vite|cloudflared"
sleep 2
./start_agribot.sh
```

### Redis Connection Errors

**Issue**: Rate limiting disabled warnings
- This is normal if REDIS_URL is empty
- System automatically falls back to in-memory rate limiting
- For production, install Redis: `brew install redis` (macOS) or use Redis Cloud

---

## 19. Performance Optimization

### Caching Strategies

1. **Satellite Tiles**: Cached for 24 hours (configured in GEE service)
2. **Weather Data**: Cached for 1 hour (OpenMeteo updates hourly)
3. **RAG Embeddings**: Persistent in ChromaDB (no re-computation unless documents change)

### Latency Optimization

- **Parallel Execution**: GEE, Weather, and RAG queries run concurrently (saves ~8-12s per request)
- **Streaming Responses**: LLM streams tokens to reduce perceived latency
- **Filler Phrases**: "Analyzing satellite data..." masks processing time during voice calls

### Cost Optimization

- **Cloudflare Workers AI**: Free tier includes 10,000 neurons/day (roughly 5,000-10,000 queries)
- **GEE**: Free for non-commercial research (up to 50,000 requests/day)
- **Vapi**: ~$0.10/min (optimize by reducing silence timeout from 30s to 20s)

---

## 20. Production Deployment Checklist

- [ ] Set `REDIS_URL` to production Redis instance
- [ ] Configure CORS allowed origins in `backend/main.py`
- [ ] Set `VITE_API_URL` to production backend URL
- [ ] Enable rate limiting (Redis required)
- [ ] Set up SSL/TLS certificates (Cloudflare handles this automatically)
- [ ] Configure monitoring and logging (use Cloudflare Analytics)
- [ ] Set up backup for ChromaDB vector store
- [ ] Test with multiple concurrent users
- [ ] Update Vapi assistant `serverUrl` to production URL
- [ ] Enable HTTPS-only in production

---

_Verified by Engineering Team - February 2026_  
_System Version: 1.2.0_  
_Last Updated: February 3, 2026_

# Yolo Deep-Ag Copilot: Autonomous Agricultural Intelligence System

**Production Verification Status**: ✅ Verified (Feb 2026)  
**System Version**: 1.2.0

---

## 1. Project Overview

### 🎯 Core Problem

Farmers in Yolo County operate in a high-stakes environment where decision-making requires synthesizing fragmented data: soil telemetry, satellite imagery, weather models, and academic research. Accessing this data in the field is often impossible, leading to decisions based on intuition rather than precision agronomy.

### 💡 Solution

**Deep-Ag Copilot** (AgriBot) is a multimodal agricultural intelligence system. It unifies satellite telemetry, weather forecasting, and vector-searchable agronomic research into a single conversational interface. Farmers can query the system via **Voice** (Phone/PSTN) or **Text** (Web Dashboard).

### 📍 Domain Constraints

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

- **Python 3.12**: Selected for rich geospatial (GEE) and AI (LangChain) ecosystem.
- **FastAPI**: High-concurrency async web framework.
- **Uvicorn**: ASGI Server.
- **Cloudflare Tunnel**: Exposes the local backend securely to the public internet (Vapi/Web).

### AI & Data

- **Google Earth Engine (GEE)**: Server-side geospatial computation.
- **ChromaDB**: Lightweight, local vector database for RAG.
- **Vapi.ai**: Voice orchestration (integrating Deepgram STT and ElevenLabs TTS).
- **Cloudflare Workers AI**: Low-latency inference for the core Reasoning Agent.

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

- **Inbound**: User calls `+1 (530) ...`.
- **Handshake**: Vapi hits `/webhook/vapi`. Backend returns the Assistant Config (System Prompt, Voice ID).
- **Turn-Taking**:
  - User speaks -> Vapi (Deepgram) transcribes.
  - Backend receives transcript -> Generates Stream.
  - **Interruption Handling**: Configured to `interruptionsEnabled: false`. The system ignores barge-in attempts while delivering critical advice (Satellite Analysis results) to ensure the logic isn't cut off.

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
# Core
OPENAI_API_KEY=sk-...           # (Optional) High-accuracy fallback
VAPI_PRIVATE_KEY=...            # Required for Voice
CLOUDFLARE_API_TOKEN=...        # Required for LLM

# Geospatial
GEE_SERVICE_ACCOUNT_FILE=...    # Path to Google Cloud JSON credentials

# Infrastructure
VITE_API_URL=http://127.0.0.1:8000
```

---

## 11. Local Development Setup

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

_Verified by Engineering Team - 2026_

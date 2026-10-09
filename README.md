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

AgriBot now runs **entirely on Cloudflare's free plan**. No phone carrier, no voice-orchestration vendor, no tunnel, no always-on laptop.

```
 Browser / installed PWA                              Cloudflare (free plan)
 ┌───────────────────────┐   wss (16 kHz PCM up,    ┌────────────────────────────────────────────────┐
 │ React dashboard       │   mp3 down) + JSON       │ Worker  ──►  AgriAgent  (Durable Object / session)│
 │  • "Call Agent" modal │ ───────────────────────► │   routing    │  • VAD cost gate ► Flux STT (stream) │
 │  • chat box           │   https  /api/analyze    │   auth       │  • instant intent parse (no LLM)    │
 │  • map / weather cards│ ───────────────────────► │   cron       │  • live data (cache+prefetch)       │
 └───────────────────────┘                          │              │  • Llama 3.1 8B (stream, interruptible)
                                                    │              │  • sentence → Aura TTS (cached)     │
                                                    │              │  • SQLite memory: crop, field, facts,│
                                                    │              │    advice given, chat+voice history │
                                                    │  Governor DO: free-tier budget + call limits       │
                                                    └──────┬─────────────┬───────────────┬───────────────┘
                                          Workers AI ◄─────┘   Vectorize ◄┘     KV ◄─────┘
                                  (LLM, STT, TTS, embeddings)  (UC research)  (warm weather,
                                                                               satellite snapshots)
```

1.  **Interaction layer**: the React dashboard (served by the same Worker as free static assets). *Call Agent* opens a microphone WebSocket straight to the agent; the chat box talks to the *same* agent object, so voice and text share one memory.
2.  **Agent layer** (`worker/`, TypeScript): one Durable Object per session. Speech-to-text, turn-taking, the reasoning pipeline, text-to-speech and conversation memory all live here (SQLite storage survives reconnects and deploys).
3.  **Intelligence layer**: Llama 3.1 8B (Workers AI) synthesises answers from live data and UC research retrieved from Vectorize (`bge-base` embeddings).
4.  **Data layer**: Open-Meteo weather (warmed hourly into KV for every Yolo town by a cron trigger), precomputed Earth Engine NDVI/NDWI snapshots in KV, product labels, prices and local companies bundled in the Worker.

> **Optional extras**: the original Python/FastAPI backend (`backend/`) is no longer part of voice or chat. It still powers the dashboard's Earth Engine map tiles, Field Vision (Gemini/Veo), yield predictor and startup list; run it with `./start_agribot.sh --with-backend` and open the dashboard with `?api_url=<its URL>` if you want those widgets.

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

### AI & Data

- **Google Earth Engine (GEE)**: Server-side geospatial computation for satellite imagery.
- **Cloudflare Workers + Durable Objects (SQLite)**: the agent runtime and per-session memory.
- **Cloudflare Workers AI**: Llama 3.1 8B Instruct Fast (reasoning), Deepgram Flux (streaming speech-to-text with end-of-turn detection), Deepgram Aura / MeloTTS (text-to-speech), `bge-base-en-v1.5` (embeddings).
- **Cloudflare Vectorize**: UC research index (`agribot-knowledge`, 768-dim cosine).
- **Cloudflare KV**: warm weather per town and precomputed satellite snapshots.
- **Cloudflare AI Gateway**: free analytics/rate limiting for text chat.
- **Agents SDK (`agents/voice`)**: WebSocket voice pipeline (turn-taking, interruption, sentence-level TTS streaming).

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

The **voice and chat brain now lives in the Cloudflare Worker** (`worker/src/brain`, `worker/src/agent.ts`). The Python backend below is the original pipeline, kept for the optional dashboard extras (map tiles, Field Vision, yield predictor).

The backend is structured around **Service Modules** (`services/`) invoked by a central **Reasoning Engine** (`agents/reasoning_engine.py`).

### Request Lifecycle

1.  **Ingest**: `main.py` receives a text query.
2.  **Intent Parsing**: The LLM extracts entities (Crop: "Almonds", Location: "Davis").
3.  **Parallel Execution**:
    - `satellite.py` -> GEE API (Compute NDVI)
    - `weather.py` -> OpenMeteo API (Fetch Forecast)
    - `rag.py` -> Cloudflare Vectorize (Search Embeddings)
4.  **Synthesis**: The LLM combines these 3 inputs into a natural language response.
5.  **Response**: JSON for the web dashboard. (Live voice and the fast chat path run in the Cloudflare Worker instead.)

---

## 6. Voice (Cloudflare-only)

Two ways in, same brain, same free budget: **(a)** open the app, tap **Call Agent**, allow the microphone; **(b)** dial the farm's **real phone number** from any phone, no internet needed (section *6b*).

### How a turn works (and where the milliseconds go)

| Step | What happens | Typical cost |
|---|---|---|
| Speech in | Mic audio streams to the agent over a WebSocket. A small VAD gate forwards only speech to **Flux** (streaming STT), which detects the end of your turn itself. | ~0.2-0.4 s after you stop |
| Prefetch | While you are still talking, interim transcripts start weather / research lookups (shared in-flight cache, so nothing is fetched twice). | 0 s on the critical path |
| Understand | Regex intent parse: crop, town, topic. No LLM round trip. | ~0 ms |
| Data | Weather = KV read (hourly warmed) or live Open-Meteo; research = embed + Vectorize; satellite = KV snapshot. Hard 1.6 s budget; anything slower finishes in the background for the next turn. | 0.0-0.4 s |
| Think | Llama streams; sentences are cut as they complete. Answers are 1-3 spoken sentences. | first text ~0.4-0.7 s |
| Speak | Each sentence goes to **Aura** TTS as soon as it exists; short repeated lines are cached. mp3 streams to the browser. | first audio ~0.3-0.8 s |

Measured against the deployed Worker with real spoken audio: **first spoken words 0.7-1.8 s after the caller stops talking (median ~1.2 s)**; a repeated answer starts in ~0.6 s thanks to the TTS cache. A cold first turn of a call is slower.

- **Interruptions**: the browser client stops playback the moment your voice is detected over the assistant; the server aborts the in-flight LLM/TTS work (`AbortSignal`) and, if Flux ends your turn early and you keep talking, the aborted turn is discarded and re-run with the full sentence.
- **State**: per-session SQLite memory (crop, field location, facts you told it, advice already given, last data digest) plus the full conversation. Voice and chat use the same session id, so "what about walnuts?" works in either.
- **Never silent**: if the LLM is unreachable the caller gets a deterministic spoken answer built from live data; satellite numbers are only ever real snapshots, never invented.
- **Dashboard sync**: weather, satellite layer, map pin and sources update live during the call.

### Staying inside the free plan

Workers AI's free allowance is **10,000 neurons/day** (resets 00:00 UTC) and *everything* fails when it is exhausted, so a **Governor** Durable Object tracks an estimate and degrades gracefully:

| Today's estimated spend | Behaviour |
|---|---|
| < 55 % | Full-quality Aura voice, 1-3 sentence answers |
| 55-80 % | Same voice, tighter (<= 30 word) answers |
| 80-92 % | Cheaper MeloTTS voice (~70x cheaper), tight answers |
| >= 92 % | No new calls (text chat keeps working until 98 %) |

Rough capacity: one conversational turn costs ~250-350 neurons (speech-in ~90, Aura TTS 200-300, LLM ~10), i.e. **about 30 turns (10-15 minutes of conversation) per day at full quality**, and 100+ turns/day on the cheaper voice. Also free-plan guards: max 3 simultaneous calls, 80 calls/day, 10-minute call cap, and an optional access code so strangers can't spend your budget. If you need more, the Workers Paid plan ($5/mo) raises everything; no code changes needed.

### Setup

```bash
cp .env.example .env                       # CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN
worker/scripts/setup-cloudflare.sh         # Vectorize index, KV namespace, AI Gateway (idempotent)
python backend/scripts/ingest_pdfs.py      # embed data/research/*.pdf into Vectorize (one time)
cd worker && npx wrangler secret put ACCESS_CODE   # optional but recommended
cd .. && ./deploy_cloudflare.sh            # build dashboard + deploy Worker + warm weather
```

Open `https://agribot.<your-subdomain>.workers.dev/?code=<ACCESS_CODE>` once (the code is remembered). Check the line with `GET /api/voice/status`.
Test with real audio: `node worker/scripts/e2e-voice.mjs --url wss://<worker-host> --code <code> --wav question.wav`.
Unit tests: `cd worker && npm test`.

### Satellite data

Earth Engine can't run inside a Worker, and Sentinel-2 only revisits every ~5 days, so run `python backend/scripts/push_satellite_snapshots.py` (add `--full` for 5-year history) once a day; it computes NDVI/NDWI per town and publishes them to KV. Snapshots use **NDVI** (greenness) and **NDMI** (canopy moisture, NIR vs SWIR). NDWI is *not* used as a stress signal: it is strongly negative over healthy vegetation. Without `GEE_SERVICE_ACCOUNT_FILE` the agent truthfully says satellite data isn't available.

## 6b. The phone number (Vapi = call orchestrator only)

The point of the project: a farmer with no data coverage dials a normal number and talks. **Vapi** provides the number and the call plumbing (phone line, speech-to-text, text-to-speech, turn-taking, barge-in); every word it speaks comes from the Cloudflare Worker (`worker/src/vapi/`), because Vapi's model is a *custom LLM* pointing at it. Vapi is the only provider with free voice credits and a free number (everything else, Twilio included, is paid from minute one).

```
farmer's phone ──PSTN──► Vapi free number ──► Deepgram STT (Vapi) ──► POST /api/vapi-llm/chat/completions ──► Worker
                                                                       VapiBrain DO (one per caller, salted hash of the number)
                                                                         SessionBrain: memory + live weather/satellite + UC research
                                                                         free-tier LLM chain ► sentences streamed back as OpenAI SSE
 caller hears ◄── ElevenLabs/Vapi TTS (Vapi) ◄────────────────────────────────────────────────────────────────────────────────────┘
 caller talks over it ► Vapi drops the HTTP stream ► the stream's cancel() aborts the in-flight LLM request
 live transcripts ► POST /webhook/vapi ► speculative prefetch (weather/research already loading); end-of-call reports ► /api/voice/status
```

- **State**: same `SessionBrain` as the web chat, persisted per caller. A returning caller keeps their crop and field location ("what about tomorrow?" works across calls); Vapi also sends the whole conversation each turn. Only a salted hash of the number is stored.
- **Latency**: no filler sentences. Data is prefetched from partial transcripts, weather is warmed in KV, the first sentence streams as soon as it completes. Measured against the deployed Worker: first sentence reaches Vapi ~0.2-1.1 s after the request (excluding Vapi's own speech-to-text/TTS time, ~0.5-0.8 s more).
- **Never silent**: if every LLM provider fails the caller still hears a short answer built from live data.
- **Credits**: Vapi gives ~$5-10 of free credit and 1 free number (inbound only, US area codes). Calls cost roughly $0.05/min platform + speech vendors (lean setups ~$0.12/min all-in), i.e. ~50 minutes per $6. Defaults are credit-conscious: Vapi's own voice (not ElevenLabs), no denoising add-on, calls capped at 5 minutes (`--max-seconds`, `--voice-provider 11labs`, `--denoise` to change). After that you pay Vapi, or fall back to the free in-app web call (section 6).
- **Setup** (needs a Vapi account + private key):
  ```bash
  # .env: VAPI_PRIVATE_KEY=...   (VAPI_WEBHOOK_SECRET is already set)
  cd worker
  node scripts/vapi-setup.mjs --url https://agribot.<you>.workers.dev --create --create-number --area-code 530
  # shared Vapi account? set VAPI_ASSISTANT_ID first - the script only ever touches the assistant named "AgriBot Copilot"
  node scripts/vapi-setup.mjs --diagnose        # Vapi's own endedReason for recent calls
  ```
  Tests: `npm test` (the assistant JSON is validated against Vapi's live OpenAPI schema); `node scripts/e2e-vapi.mjs` simulates Vapi's requests end to end.

### When Workers AI is down: free LLM fallbacks

Workers AI's free quota can run out (10,000 neurons/day) and Cloudflare's enforcement sometimes stays blocked after the 00:00 UTC reset even when the dashboard shows 0 used (error 4006; a known issue, not a misconfiguration). With Vapi doing speech, a phone turn only needs the LLM (~10 neurons) and a tiny embedding, but the LLM must not be a single point of failure, so the brain tries providers in order and skips failing ones for a while:

| Provider | Free tier (check your own limits page) | Key |
|---|---|---|
| **Groq** | no card; measured on a real key: 1,000 req/day and 8,000 tokens/min per model; first words in ~150-350 ms | `GROQ_API_KEY` (+ `GROQ_MODEL`, default `qwen/qwen3.8-27b` with reasoning off; `openai/gpt-oss-20b` also works; Groq retired `llama-3.1-8b-instant`) |
| Workers AI | 10,000 neurons/day | built in |
| Google Gemini (AI Studio) | no card; limits shown in AI Studio | `GEMINI_API_KEY` (+ `GEMINI_MODEL`) |
| OpenRouter `:free` models | 50 req/day (1,000 after a one-time $10 top-up) | `OPENROUTER_API_KEY` |

Default order `groq,workers-ai,gemini,openrouter`; override with `LLM_ORDER`. Configure: `cd worker && npx wrangler secret put GROQ_API_KEY`, and check speed with `node scripts/check-llm.mjs`. `/api/voice/status` lists the active providers. If Workers AI embeddings are unavailable, research passages are skipped for that turn (answers still use live weather and satellite data).

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
# Cloudflare (Required - the only mandatory account)
CLOUDFLARE_ACCOUNT_ID=...       # Cloudflare Dashboard -> Workers & Pages -> Overview
CLOUDFLARE_API_TOKEN=...        # least privilege: Workers Scripts, Workers AI, Vectorize, KV, AI Gateway (Edit)
CLOUDFLARE_VECTORIZE_INDEX=agribot-knowledge
CLOUDFLARE_KV_NAMESPACE_ID=...  # printed by worker/scripts/setup-cloudflare.sh
ACCESS_CODE=...                 # shared code protecting your free AI budget (also set as a Worker secret)
AGENT_URL=https://agribot.<subdomain>.workers.dev

# Google Earth Engine (Required for Satellite Data)
GEE_SERVICE_ACCOUNT_FILE=...    # Absolute path to GCP service account JSON file

# Frontend Configuration
VITE_AGENT_URL=https://agribot.<subdomain>.workers.dev  # voice + chat (Cloudflare Worker); same-origin when the Worker serves the app
VITE_API_URL=http://127.0.0.1:8000  # optional Python extras (map tiles, Field Vision)

# Optional: Redis for Rate Limiting and Session Storage
REDIS_URL=                      # Leave empty to use in-memory fallback
                                # Example: redis://localhost:6379/0
```

### Environment Variable Details:

- **CLOUDFLARE_ACCOUNT_ID**: Found in Cloudflare Dashboard → Workers & Pages → Overview
- **CLOUDFLARE_API_TOKEN**: Create at Cloudflare Dashboard → My Profile → API Tokens
  - Prefer a scoped token over an account-wide one: Workers Scripts, Workers AI, Vectorize, Workers KV Storage, AI Gateway (all Edit)
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
- **Internet**: Required for Cloudflare (Workers AI, Vectorize) and optionally GEE

### Required Accounts & API Access

1. **Cloudflare Account** (Free tier available):
   - Workers AI enabled
   - Vectorize index created (name: `agribot-knowledge`)
   - API token generated

2. **Google Cloud Platform** (optional, free tier for Earth Engine - only for satellite snapshots and map tiles):
   - Earth Engine API enabled
   - Service account created
   - Credentials JSON downloaded

### Unified Startup

`./start_agribot.sh` runs the Worker and dashboard locally (Workers AI and Vectorize are the real Cloudflare services); `./deploy_cloudflare.sh` deploys everything.

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

- **Hosting**: one Cloudflare Worker serves the dashboard (static assets), the API and the voice WebSocket. Durable Objects scale per session; the free plan's limits are enforced by the Governor.
- **Optional Python backend** (map tiles, Field Vision): `backend/Dockerfile` for any container host.
- **Logging**: Workers Logs / `wrangler tail`; per-turn timings are logged as `[turn] ctx=... first_text=... total=...`; AI Gateway shows chat analytics.

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

- **Everything on the Cloudflare free plan: $0** (Workers 100k req/day, Durable Objects SQLite, KV, Vectorize 5 M stored / 30 M queried dimensions, AI Gateway core features, Workers AI 10,000 neurons/day).
- **Google Earth Engine**: free for non-commercial/research use (only the daily snapshot job and optional map tiles).
- Neuron prices if you ever upgrade: Flux STT 700/min, Aura TTS 1,364 per 1k chars, MeloTTS 18.6/min, Llama 3.1 8B fast 4,119 in / 34,868 out per M tokens (1,000 neurons = $0.011).

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

### Voice Call Won't Start / Sounds Wrong

1. Open the app from your Worker URL and allow the microphone (Safari/Chrome ask once; iOS needs a tap on *Start Call*).
2. `GET <worker-url>/api/voice/status`: `free_tier_governor.mode` shows `off` when today's free AI allowance is spent (resets 00:00 UTC); `knowledge_vectors` should be > 1000; `weather_warm_cache` should be `true` (run `POST /api/warm`).
3. 401 / "Invalid access code": open the URL once with `?code=<ACCESS_CODE>`.
4. Echo or it interrupts itself: use earbuds; the browser cancels echo, but loud speakerphones can leak.
5. Live logs: `cd worker && npx wrangler tail` (look for `[turn] ctx=... first_text=... total=...`).

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
3. **RAG Embeddings**: Persistent in Vectorize (no re-computation unless documents change)

### Latency Optimization

- **Parallel Execution**: GEE, Weather, and RAG queries run concurrently (saves ~8-12s per request)
- **Streaming Responses**: LLM streams tokens to reduce perceived latency
- **Speculative prefetch + TTS cache**: data is already loading while you speak; repeated lines are never re-synthesised

### Cost Optimization

- **Cloudflare Workers AI**: Free tier includes 10,000 neurons/day (roughly 5,000-10,000 queries)
- **GEE**: Free for non-commercial research (up to 50,000 requests/day)
- **Voice**: the VAD gate sends only speech to Flux (continuous streaming would cost ~700 neurons/min); shorter answers halve TTS cost

---

## 20. Production Deployment Checklist

- [ ] Set `REDIS_URL` to production Redis instance
- [ ] Configure CORS allowed origins in `backend/main.py`
- [ ] Set `VITE_API_URL` to production backend URL
- [ ] Enable rate limiting (Redis required)
- [ ] Set up SSL/TLS certificates (Cloudflare handles this automatically)
- [ ] Configure monitoring and logging (use Cloudflare Analytics)
- [ ] Re-run `ingest_pdfs.py` to rebuild the Vectorize index if needed
- [ ] Test with multiple concurrent users
- [ ] `wrangler secret put ACCESS_CODE` and rotate the Cloudflare API token to a least-privilege one
- [ ] Enable HTTPS-only in production

---

_Verified by Engineering Team - February 2026_  
_System Version: 1.2.0_  
_Last Updated: February 3, 2026_

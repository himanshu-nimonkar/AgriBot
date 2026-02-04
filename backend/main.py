"""
Yolo Deep-Ag Copilot - Main FastAPI Application
Voice-activated agricultural decision support system.
"""

import asyncio
import json
import re # Security sanitization
from datetime import datetime
from typing import List, Optional, Set
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn
import redis.asyncio as redis
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
import importlib

import os # Ensure os is imported for env check

class SafeRateLimiter(RateLimiter):
    """
    Rate Limiter that gracefully disables itself if Redis is not configured.
    Prevents crashes in 'lightweight mode'.
    """
    async def __call__(self, request: Request, response: JSONResponse):
        # Check if FastAPILimiter is actually initialized (it has a redis instance)
        if not FastAPILimiter.redis:
            return # Skip limiting
        try:
            await super().__call__(request, response)
        except Exception:
            # failsafe
            return

from config import settings
from models.schemas import (
    AnalyzeRequest, 
    AnalyzeResponse, 
    HealthResponse,
    DashboardUpdate,
    ConversationMessage
)
from agents.reasoning_engine import reasoning_engine, AgentResponse
from services.weather import weather_service
from services.rag import rag_service
from services.llm import llm_service


# ==================
# WebSocket Manager
# ==================

class ConnectionManager:
    """Manages WebSocket connections for real-time dashboard updates."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients."""
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.add(connection)
        
        # Clean up disconnected clients
        self.active_connections -= disconnected


manager = ConnectionManager()


# ==================
# Lifespan Events
# ==================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    print("[INFO] Yolo Deep-Ag Copilot starting...")
    print(f"   Location: Yolo County, CA ({settings.yolo_county_lat}, {settings.yolo_county_lon})")
    
    # Initialize Rate Limiter (if Redis available)
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        try:
            r = redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
            await FastAPILimiter.init(r)
            print("[SUCCESS] Rate Limiter initialized with Redis")
        except Exception as e:
            print(f"[WARNING] Rate Limiter failed to initialize: {e}")
    else:
        print("[INFO] Rate Limiter disabled (No REDIS_URL)")

    # Initialize services
    yield
    
    # Shutdown
    print("[INFO] Shutting down services...")
    await weather_service.close()
    await rag_service.close()
    await llm_service.close()


# ==================
# FastAPI App
# ==================

app = FastAPI(
    title="Yolo Deep-Ag Copilot",
    description="PhD-level agricultural decision support for Yolo County, CA",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:4173",
        "https://agribot-dashboard.pages.dev"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================
# Health Check
# ==================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        services={
            "weather": "ok",
            "llm": "ok",
            "rag": "ok"
        }
    )


# ==================
# Analysis Endpoint
# ==================

from services.session import session_manager

@app.post("/api/reset")
async def reset_session(request: Request):
    """Reset the current session context."""
    try:
        body = await request.json()
        session_id = body.get("session_id", "default")
    except:
        session_id = "default"
        
    session_manager.clear_session(session_id)
    return {"status": "ok", "message": "Session reset"}

from fastapi.staticfiles import StaticFiles
import os

# Mount static files for research PDFs
# Use parent directory to access data/research
research_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "research")
os.makedirs(research_dir, exist_ok=True)
app.mount("/research", StaticFiles(directory=research_dir), name="research")

@app.post("/api/analyze", response_model=AnalyzeResponse, dependencies=[Depends(SafeRateLimiter(times=50, seconds=60))])
async def analyze(request: AnalyzeRequest):
    """
    Analyze an agricultural query.
    
    Combines weather, satellite, and research data to provide
    PhD-level agronomic recommendations.
    """
    try:
        # Input Sanitization (Length & Char Filter)
        if len(request.query) > 500:
            raise HTTPException(status_code=400, detail="Query max length exceeded (500 chars).")
        
        # Remove potentially dangerous chars (basic injection prevention)
        request.query = re.sub(r'[;\'"\\<>]', '', request.query)

        # Broadcast "thinking" status to dashboard
        await manager.broadcast({
            "type": "thinking",
            "payload": {"query": request.query, "crop": request.crop},
            "timestamp": datetime.now().isoformat()
        })
        
        # Process through reasoning engine
        response: AgentResponse = await reasoning_engine.process_query(
            query=request.query,
            lat=request.lat,
            lon=request.lon,
            crop=request.crop,
            session_id=request.session_id
        )
        
        # Broadcast results to dashboard
        if response.weather_data:
            await manager.broadcast({
                "type": "weather",
                "payload": response.weather_data,
                "timestamp": datetime.now().isoformat()
            })
        
        if response.satellite_data:
            print(f"DEBUG: Sat Payload: {response.satellite_data}")
            await manager.broadcast({
                "type": "satellite",
                "payload": response.satellite_data,
                "timestamp": datetime.now().isoformat()
            })
        
        # NOTE: Removed 'response' broadcast here to avoid duplicate messages on the dashboard
        # (The dashboard handles the 'response' via the HTTP return value)
        # await manager.broadcast({ ... "type": "response" ... }) 
        
        if response.weather_data:
             print(f"DEBUG: Weather Payload: {response.weather_data}")
        
        return AnalyzeResponse(
            voice_response=response.voice_response,
            full_response=response.full_response,
            sources=response.sources,
            weather_data=response.weather_data,
            satellite_data=response.satellite_data,
            rag_results=response.rag_results,
            crop=response.crop,
            location_address=response.location_address,
            lat=response.lat,
            lon=response.lon,
            query=response.query,
            timestamp=response.timestamp,
            processing_time_ms=response.processing_time_ms
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================
# Vapi Webhook
# ==================

@app.post("/webhook/vapi")
async def vapi_webhook(request: Request):
    """
    Webhook for Vapi.ai voice calls.
    
    Handles various Vapi events:
    - assistant-request: Configure assistant
    - function-call: Process function calls
    - end-of-call-report: Log call completion
    """
    try:
        body = await request.json()
        message_type = body.get("message", {}).get("type", "")
        
        # Handle assistant request - configure the assistant
        if message_type == "assistant-request":
            return JSONResponse({
                "assistant": {
                    "name": "Deep-Ag Copilot",
                    "firstMessage": "Hello! I'm Deep-Ag Copilot, your agricultural advisor for Yolo County. How can I help you today?",
                    "transcriber": {
                        "provider": "deepgram",
                        "model": "nova-2",
                        "language": "en-US",
                        "smart_format": True
                    },
                    "voice": {
                        "provider": "11labs",
                        "voiceId": "ErXwobaYiN019PkySvjV",
                        "stability": 0.5,
                        "similarityBoost": 0.75
                    },
                    "model": {
                        "provider": "custom-llm",
                        "url": f"https://{request.headers.get('host')}/api/vapi-llm",
                        "model": "deep-ag-copilot"
                    },
                    "silenceTimeoutSeconds": 30,
                    "maxDurationSeconds": 600,
                    "backgroundSound": "office"
                }
            })
        
        # Handle transcript events
        if message_type == "transcript":
            transcript = body.get("message", {}).get("transcript", "")
            role = body.get("message", {}).get("role", "user")
            
            # Broadcast to dashboard
            await manager.broadcast({
                "type": "transcript",
                "payload": {"role": role, "text": transcript},
                "timestamp": datetime.now().isoformat()
            })
        
        # Handle function calls from Vapi
        if message_type == "function-call":
            function_call = body.get("message", {}).get("functionCall", {})
            function_name = function_call.get("name", "")
            parameters = function_call.get("parameters", {})
            
            if function_name == "analyze_field":
                # Process the agricultural query
                response = await reasoning_engine.process_query(
                    query=parameters.get("query", ""),
                    lat=parameters.get("lat"),
                    lon=parameters.get("lon"),
                    crop=parameters.get("crop")
                )
                
                return JSONResponse({
                    "result": response.voice_response
                })
        
        # Handle end of call
        if message_type == "end-of-call-report":
            call_data = body.get("message", {})
            print(f"Call ended. Duration: {call_data.get('durationSeconds', 0)}s")
        
        return JSONResponse({"status": "ok"})
        
    except Exception as e:
        # Log full error internally but don't expose details to client
        import traceback
        print(f"Vapi webhook error: {traceback.format_exc()}")
        return JSONResponse({"status": "error", "message": "Internal server error"}, status_code=500)


@app.post("/api/vapi-llm", dependencies=[Depends(SafeRateLimiter(times=100, seconds=60))])
async def vapi_llm_endpoint(request: Request):
    """
    Custom LLM endpoint for Vapi.
    
    Vapi sends conversation history, we process and respond.
    """
    try:
        body = await request.json()
        messages = body.get("messages", [])
        stream = body.get("stream", False)
        
        # Get the last user message
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "")
                break
        
        # Extract Call ID for session tracking
        call_data = body.get("call", {})
        session_id = call_data.get("id", "default-vapi")
        
        if not user_message:
            user_message = "Hello"
        
        print(f"[INFO] Vapi User Message ({session_id}): {user_message}")
        start_time = datetime.now()

        # Always stream to handle latency gracefully
        async def event_generator():
            chunk_id = f"chatcmpl-{int(datetime.now().timestamp())}"
            created = int(datetime.now().timestamp())
            model = "deep-ag-copilot"

            def make_chunk(text, finish_reason=None):
                return {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"content": text} if text else {},
                        "finish_reason": finish_reason
                    }]
                }

            # 1. IMMEDIATE FEEDBACK (0s)
            # Acknowledge receipt instantly to stop silence.
            initial_fillers = [
                "I'm accessing the agricultural database for your location...",
                "Let me check the latest satellite and weather data for you...",
                "Checking field conditions..."
            ]
            import random
            initial_msg = random.choice(initial_fillers) + " "
            yield f"data: {json.dumps(make_chunk(initial_msg))}\n\n"
            
            # Start actual heavy processing
            processing_task = asyncio.create_task(reasoning_engine.process_query(
                query=user_message,
                session_id=session_id
            ))
            
            # 2. PERIODIC UPDATES (Keep-alive + Status)
            wait_start = datetime.now()
            status_updates = [
                "I am now analyzing the recent satellite imagery for your field.",
                "I am reviewing the soil moisture levels to check for water stress.",
                "I am cross-referencing this data with the upcoming weather forecast.",
                "I am formulating the best recommendation for your crop."
            ]
            update_index = 0
            
            while not processing_task.done():
                await asyncio.sleep(0.5)
                elapsed = (datetime.now() - wait_start).total_seconds()
                
                # Update every 5 seconds to allow full sentence to be spoken
                if elapsed > (update_index + 1) * 5.0 and update_index < len(status_updates):
                    # Send a complete sentence
                    update_text = status_updates[update_index] + " "
                    yield f"data: {json.dumps(make_chunk(update_text))}\n\n"
                    update_index += 1
                
                # Technical keep-alive (every 2s to be safe)
                if int(elapsed * 10) % 20 == 0: 
                    yield f": keep-alive {elapsed}\n\n"
            
            # 3. FINAL RESULT
            response = await processing_task
            duration = (datetime.now() - start_time).total_seconds()
            print(f"[INFO] Vapi Response ({duration:.2f}s) Ready")

            # Calculate what we've already said (fillers)
            # The LLM response usually assumes it's the start. 
            # We might want to preface it with "Here is what I found:" or just output it.
            # But since we already said "Formulating recommendation...", we can just output the result.
            
            # Broadcast to Dashboard
            payload = asdict(response)
            payload["full"] = response.full_response
            payload["voice"] = response.voice_response
            await manager.broadcast({
                "type": "response",
                "payload": payload,
                "timestamp": datetime.now().isoformat()
            })

            # Send the actual answer
            final_text = response.voice_response
            yield f"data: {json.dumps(make_chunk(final_text))}\n\n"
            
            # Finish
            yield f"data: {json.dumps(make_chunk(None, 'stop'))}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(), 
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Vapi LLM Error: {e}")
        error_msg = " I apologize, but I encountered an error while retrieving the data. Please try again."
        return JSONResponse({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": error_msg
                }
            }]
        })


# ==================
# WebSocket Endpoint
# ==================

@app.post("/api/vapi-llm/chat/completions")
async def vapi_llm_chat_completions(request: Request):
    # Alias for /api/vapi-llm to handle Vapi's automatic path appending.
    return await vapi_llm_endpoint(request)


@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    # WebSocket for real-time dashboard updates.
    await manager.connect(websocket)
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "payload": {"message": "Connected to Deep-Ag Copilot"},
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            
            # Handle ping/pong for keepalive
            if data == "ping":
                await websocket.send_text("pong")
                continue
            
            # Handle query requests via WebSocket
            try:
                request = json.loads(data)
                if request.get("type") == "query":
                    response = await reasoning_engine.process_query(
                        query=request.get("query", ""),
                        lat=request.get("lat"),
                        lon=request.get("lon"),
                        crop=request.get("crop")
                    )
                    
                    await websocket.send_json({
                        "type": "response",
                        "payload": {
                            "voice": response.voice_response,
                            "full": response.full_response,
                            "sources": response.sources,
                            "weather": response.weather_data,
                            "satellite": response.satellite_data
                        },
                        "timestamp": datetime.now().isoformat()
                    })
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ==================
# Run Server
# ==================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=True
    )

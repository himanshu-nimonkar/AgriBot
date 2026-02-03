"""
Pydantic Schemas for API Request/Response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ==================
# Request Schemas
# ==================

class AnalyzeRequest(BaseModel):
    """Request for agricultural analysis."""
    query: str = Field(..., description="Natural language question")
    crop: Optional[str] = Field(None, description="Crop type (optional)")
    lat: Optional[float] = Field(None, description="Latitude", ge=-90, le=90)
    lon: Optional[float] = Field(None, description="Longitude", ge=-180, le=180)
    session_id: Optional[str] = Field("default", description="Session ID for context retention")


class VapiMessage(BaseModel):
    """Vapi webhook message structure."""
    type: str
    call: Optional[Dict[str, Any]] = None
    message: Optional[Dict[str, Any]] = None
    

class VapiTranscript(BaseModel):
    """Transcribed speech from Vapi."""
    role: str  # "user" or "assistant"
    transcript: str
    
    
# ==================
# Response Schemas
# ==================

class WeatherResponse(BaseModel):
    """Weather data response."""
    temperature_c: Optional[float] = None
    relative_humidity: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    precipitation_mm: Optional[float] = None
    soil_moisture_0_7cm: Optional[float] = None
    reference_evapotranspiration: Optional[float] = None
    spray_drift_risk: Optional[str] = None
    fungal_risk: Optional[str] = None
    forecast: List[Dict[str, Any]] = []


class SatelliteResponse(BaseModel):
    """Satellite analysis response."""
    ndvi_current: Optional[float] = None
    ndvi_historical_avg: Optional[float] = None
    ndvi_anomaly: Optional[float] = None
    ndwi_current: Optional[float] = None
    water_stress_level: Optional[str] = None
    county_avg_ndvi: Optional[float] = None
    relative_performance: Optional[str] = None
    tile_url: Optional[str] = None
    ndwi_tile_url: Optional[str] = None


class RAGResultResponse(BaseModel):
    """Single RAG search result."""
    text: str
    source: str
    page: Optional[int]
    score: float


class MarketData(BaseModel):
    """Commodity market data."""
    price: float
    unit: str
    trend: str
    source: str
    date: str
    commodity: str

class ChemicalResult(BaseModel):
    """Chemical product search result."""
    product_name: str
    active_ingredient: str
    rate: str
    rei: str
    phi: str
    notes: str

class AnalyzeResponse(BaseModel):
    """Full analysis response."""
    voice_response: str
    voice_summary: Optional[str] = None  # New concise voice summary
    full_response: str
    sources: List[str]
    
    weather_data: Optional[WeatherResponse] = None
    satellite_data: Optional[SatelliteResponse] = None
    rag_results: Optional[List[RAGResultResponse]] = None
    market_data: Optional[MarketData] = None  # New market data
    chemical_data: Optional[List[ChemicalResult]] = None  # New chemical data
    
    crop: str
    location_address: Optional[str] = None  # New detailed address
    lat: Optional[float] = None  # Returned latitude
    lon: Optional[float] = None  # Returned longitude
    query: str
    timestamp: str
    processing_time_ms: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: str
    services: Dict[str, str]


# ==================
# WebSocket Schemas
# ==================

class DashboardUpdate(BaseModel):
    """Real-time update for dashboard."""
    type: str  # "thinking", "weather", "satellite", "rag", "response"
    payload: Dict[str, Any]
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


class ConversationMessage(BaseModel):
    """Chat message for conversation stream."""
    role: str  # "user", "assistant", "system"
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

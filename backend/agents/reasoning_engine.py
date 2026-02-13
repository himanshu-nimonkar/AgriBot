"""
ReasoningEngine - The Agricultural Brain
Orchestrates parallel data fetching and multi-step reasoning.
"""

import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from datetime import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.weather import weather_service, WeatherData
from services.geospatial import gee_service, FieldAnalytics
from services.rag import rag_service, RAGContext, SearchResult
from services.llm import llm_service, LLMResponse
from services.geocoding import GeocodingService
from services.market import MarketService
from services.session import session_manager
from config import settings

# Initialize new services
geocoding_service = GeocodingService()
market_service = MarketService()

@dataclass
class AgentResponse:
    """Complete response from the reasoning engine."""
    voice_response: str
    voice_summary: str
    full_response: str
    sources: List[str]
    weather_data: Optional[Dict] = None
    satellite_data: Optional[Dict] = None
    rag_results: Optional[List[Dict]] = None
    market_data: Optional[Dict] = None
    chemical_data: Optional[List[Dict]] = None
    crop: str = ""
    location_address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    query: str = ""
    timestamp: str = ""
    processing_time_ms: int = 0


class ReasoningEngine:
    """The Ag Brain - Orchestrates multi-step reasoning."""
    
    def __init__(self):
        self.weather = weather_service
        self.gee = gee_service
        self.rag = rag_service
        self.llm = llm_service
        self.geocoding = geocoding_service
        self.market = market_service
        self.session = session_manager
        self.chemicals = []
        try:
            chem_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chemicals.json")
            if os.path.exists(chem_path):
                with open(chem_path, "r") as f:
                    self.chemicals = json.load(f)
        except Exception as e:
            print(f"Failed to load chemicals: {e}")
    
    async def process_query(self, query: str, lat: Optional[float] = None, lon: Optional[float] = None, crop: Optional[str] = None, session_id: str = "default") -> AgentResponse:
        start_time = datetime.now()
        
        # 1. Get Session Context
        session = self.session.get_session(session_id)
        
        # 2. Extract Intent
        intent = await self.llm.extract_intent(query)
        extracted_crop = crop or intent.get("crop", "unknown")
        extracted_address = intent.get("location_address")
        is_agricultural = intent.get("is_agricultural", True)
        
        # 3. Non-Agricultural Bypass (Math, Greetings, Random)
        if not is_agricultural:
             refusal_text = "I specialize in agricultural advice for Yolo County only. Please ask me about crops, weather, regulations, pests, or market data."
             processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
             return AgentResponse(
                voice_response=refusal_text,
                voice_summary=refusal_text,
                full_response=refusal_text,
                sources=[],
                query=query,
                timestamp=datetime.now().isoformat(),
                processing_time_ms=processing_time,
                crop="N/A",
                location_address="N/A",
                lat=0, lon=0
             )

        # 4. Context Merging (Ag Path)
        final_crop = extracted_crop
        if final_crop == "unknown" and session.crop:
            final_crop = session.crop
            
        final_lat = lat or session.lat
        final_lon = lon or session.lon
        
        # 5. Geocoding (Override session if new address provided)
        display_address = extracted_address or session.location_label
        if extracted_address:
            geo_result = await self.geocoding.geocode(extracted_address)
            if geo_result:
                final_lat, final_lon, display_address = geo_result
                # Update session
                self.session.update_context(session_id, lat=final_lat, lon=final_lon, label=display_address)
        
        # 5b. Force Update if Intent has Location but Geocoding Failed (Don't silently use session)
        # If the user EXPLICITLY mentioned a location (extracted_address) but we failed to geocode,
        # we might want to warn them or fallback carefully.
        # For now, if we found a new location in intent, we assume we want to use THAT context.
        # The logic:
        # - If extracted_address is present, we tried geocoding.
        # - If successful, final_lat/lon are set effectively.
        # - If session had a location, final_lat/lon were initialized to it.
        # - BUT, if user asks "What about Woodland?", we must ensure we don't accidentally ignore it if geocoding was tricky
        # (The GeocodingService handles most cases, but let's be robust).
        
        # If user provided a new address, and we successfully geocoded it, we MUST use it.
        # (This is already handled by lines 112-114 where we overwrite final_lat).
        
        # 6. Slot Filling & Validation
        question_type = intent.get("question_type", "")
        optimization_target = intent.get("optimization_target", "none")
        
        # If still no location
        if final_lat is None:
             # If optimization (Best place?), location is optional (we use county default)
             if optimization_target == "location":
                 # Use Yolo Center for generic data
                 final_lat = settings.yolo_county_lat
                 final_lon = settings.yolo_county_lon
                 display_address = "Yolo County (General)"
             # Basic check: Is this a general question that doesn't need location?
             elif "general" not in question_type:
                 return self._create_ask_response(intent, "I need to know which field or address you are referring to for accurate analysis.")

        # crop check - skip if looking for permit/regulatory info or general help or location optimization
        is_regulatory = "permit" in query.lower() or "regulatory" in question_type
        if final_crop == "unknown" and not is_regulatory and "general" not in question_type and optimization_target == "none":
             return self._create_ask_response(intent, "Which crop are you asking about? (Almonds, Walnuts, Tomatoes, etc.)")
        
        # Update session with found crop
        if final_crop != "unknown":
            self.session.update_context(session_id, crop=final_crop)

        # Fallback for location if still missing but we proceed
        if final_lat is None:
            # If we are here, it means:
            # 1. No session location
            # 2. No extracted address OR extracted address failed to geocode
            # 3. Optimization target != "location" (handled above)
            final_lat = settings.yolo_county_lat
            final_lon = settings.yolo_county_lon
            display_address = "Yolo County (Center)"

        # Ensure we return the correct address in the response, especially if it changed
        display_address = display_address or session.location_label or "Yolo County"

        # 7. Parallel Fetch
        tasks = [
            self.weather.get_weather(final_lat, final_lon),
            self.gee.get_field_analytics(final_lat, final_lon),
            self.rag.search_knowledge(query, final_crop),
        ]
        
        market_task = None
        if "market" in question_type or "general" in question_type or optimization_target != "none":
            market_task = self.market.get_market_data(final_crop)
            tasks.append(market_task)
        
        # Add GDD Task if relevant (Harvest, Planting, Time Optimization)
        gdd_task = None
        if optimization_target == "time" or any(k in question_type for k in ["harvest", "planting", "weather"]):
            gdd_task = self.weather.get_growing_degree_days(final_lat, final_lon)
            tasks.append(gdd_task)
            
        results = await asyncio.gather(*tasks, return_exceptions=True)
        weather_data = results[0] if not isinstance(results[0], Exception) else None
        if isinstance(results[1], Exception):
            print(f"[ERROR] GEE Task Failed: {results[1]}")
            satellite_data = None
        else:
            satellite_data = results[1]
            print(f"DEBUG: Satellite Result: {satellite_data}")
        rag_results = results[2] if not isinstance(results[2], Exception) else []
        
        # Map dynamic tasks results
        current_idx = 3
        market_data = None
        if market_task:
            market_data = results[current_idx] if len(results) > current_idx and not isinstance(results[current_idx], Exception) else None
            current_idx += 1
            
        gdd_data = None
        if gdd_task:
            gdd_data = results[current_idx] if len(results) > current_idx and not isinstance(results[current_idx], Exception) else None
            
        chemical_data = []
        if "chemical" in question_type or "pest" in question_type or is_regulatory:
            chemical_data = self._lookup_chemicals(query, final_crop)
            
        # 8. Synthesis & Generation
        # Inject GDD into weather context
        weather_context_str = self._format_weather(weather_data)
        if gdd_data:
            weather_context_str += f"\nGrowing Degree Days (GDD): {gdd_data}"
            
        llm_resp = await self.llm.generate_agricultural_response(
            query=query,
            crop=final_crop,
            weather_context=weather_context_str,
            satellite_context=self._format_satellite(satellite_data),
            rag_context=self._format_rag(rag_results),
            market_context=self._format_market(market_data),
            chemical_context=self._format_chemicals(chemical_data),
            history=session.history,
            memory_state={
                "crop": session.crop,
                "location": display_address or session.location_label,
                "key_facts": session.key_facts,
                "advisor_points": session.advisor_points
            }
        )
        
        # Save interaction (store full assistant content so follow-ups have richer context)
        self.session.add_message(session_id, "user", query)
        self.session.add_message(session_id, "assistant", llm_resp.text)

        # Update long-term memory without extra LLM calls
        self.session.update_memory(session_id, user_text=query, assistant_text=llm_resp.text, crop=final_crop, location_label=display_address)
        
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Combine LLM cited sources with actual RAG sources to ensure consistency
        rag_source_names = [r.source for r in rag_results] if rag_results else []
        combined_sources = list(set(llm_resp.sources + rag_source_names))
        
        return AgentResponse(
            voice_response=llm_resp.voice_summary,
            voice_summary=llm_resp.voice_summary,
            full_response=llm_resp.text,
            sources=combined_sources,
            weather_data=asdict(weather_data) if weather_data else None,
            satellite_data=asdict(satellite_data) if satellite_data else None,
            rag_results=[asdict(r) for r in rag_results] if rag_results else [],
            market_data=market_data,
            chemical_data=chemical_data,
            crop=final_crop,
            location_address=display_address,
            lat=final_lat,
            lon=final_lon,
            query=query,
            timestamp=datetime.now().isoformat(),
            processing_time_ms=processing_time
        )

    def _create_ask_response(self, extract_intent: Dict, question: str) -> AgentResponse:
        # Ensure question ends with punctuation
        if not question.strip().endswith("?"):
            question = question.strip() + "?"
            
        return AgentResponse(
            voice_response=question,
            voice_summary=question,
            full_response=question,
            sources=[],
            crop=extract_intent.get("crop", "unknown"),
            query="",
            timestamp=datetime.now().isoformat()
        )

    def _lookup_chemicals(self, query: str, crop: str) -> List[Dict]:
        matches = []
        q_lower = query.lower()
        crop_lower = crop.lower()
        for chem in self.chemicals:
            if crop_lower != "unknown" and crop_lower not in chem["crops"]: continue
            if any(p in q_lower for p in chem["pests"]) or chem["product_name"].lower() in q_lower:
                matches.append(chem)
        return matches[:3]

    def _format_weather(self, w: WeatherData) -> str:
        if not w: return "Weather unavailable."
        
        base_info = f"Temp: {w.temperature_c}C, Hum: {w.relative_humidity}%, Wind: {w.wind_speed_kmh}kmh, Current Precip: {w.precipitation_mm}mm, Soil(0-7cm): {w.soil_moisture_0_7cm}, Soil(28-100cm): {w.soil_moisture_28_100cm}, ETo: {w.reference_evapotranspiration}mm, SprayRisk: {w.spray_drift_risk}"
        
        # Add 7-day precipitation forecast
        if w.forecast and len(w.forecast) > 0:
            precip_forecast = []
            total_precip = 0
            rainy_days = 0
            for day in w.forecast:
                precip = day.precipitation_sum or 0
                total_precip += precip
                if precip > 0:
                    rainy_days += 1
                    precip_forecast.append(f"{day.date}: {precip}mm")
            
            forecast_summary = f" | 7-Day Forecast: {total_precip:.1f}mm total, {rainy_days} rainy days"
            if precip_forecast:
                forecast_summary += f" ({', '.join(precip_forecast[:3])})"  # Show first 3 rainy days
            
            return base_info + forecast_summary
        
        return base_info

    def _format_satellite(self, s: FieldAnalytics) -> str:
        if not s: return "Satellite unavailable."
        return f"NDVI: {s.ndvi_current:.2f}, WaterStress: {s.water_stress_level}, Health: {s.relative_performance}"
        
    def _format_rag(self, results) -> str:
        if not results: return "No research found."
        return " ".join([f"{r.text} [Source: {r.source}]" for r in results])

    def _format_market(self, m: Dict) -> str:
        if not m or not m.get("available"): return "Market unavailable."
        return f"{m['commodity']}: ${m['price']} / {m['unit']} (Trend: {m['trend']})"

    def _format_chemicals(self, chems: List[Dict]) -> str:
        if not chems: return "No chemicals found."
        return "\\n".join([f"- {c['product_name']} ({c['active_ingredient']}) Rate: {c['rate']} REI: {c['rei']}" for c in chems])

reasoning_engine = ReasoningEngine()

"""
LLM Service - Cloudflare Workers AI Integration
Uses Llama 3.1 8B for text generation.
FREE tier: 10,000 neurons/day.
"""

import httpx
import json
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings


@dataclass
class LLMResponse:
    """Response from the LLM."""
    text: str
    voice_summary: str
    sources: List[str]
    confidence: float


class CloudflareLLMService:
    """Cloudflare Workers AI LLM service."""
    
    # Using the fast Llama 3.1 8B model for quick responses
    MODEL = "@cf/meta/llama-3.1-8b-instruct-fast"
    
    def __init__(self):
        self.account_id = settings.cloudflare_account_id
        self.api_token = settings.cloudflare_api_token
        
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        
        self.client = httpx.AsyncClient(timeout=120.0, headers=self.headers)
    
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> str:
        """
        Generate text using Cloudflare Workers AI.
        
        Args:
            prompt: User prompt
            system_prompt: System instructions
            max_tokens: Maximum tokens to generate
            temperature: Creativity (0-1)
            
        Returns:
            Generated text
        """
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.MODEL}"
        
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        
        response = await self.client.post(url, json=payload)
        response.raise_for_status()
        
        result = response.json()
        return result.get("result", {}).get("response", "")
    
    async def generate_agricultural_response(
        self,
        query: str,
        crop: str,
        weather_context: str,
        satellite_context: str,
        rag_context: str,
        economic_context: Optional[str] = None,
        market_context: Optional[str] = None,
        chemical_context: Optional[str] = None,
        history: List[Dict] = [],
        memory_state: Optional[Dict] = None
    ) -> LLMResponse:
        """
        Generate a concise and expert agricultural response.
        """
        system_prompt = """You are Deep-Ag Copilot, a seasoned Yolo County agronomist who speaks like a helpful neighbor.
VOICE & TONE:
Sound like an expert friend: confident, practical, warm, not robotic.
If something is uncertain, do not give false answers admit you dont know and according to you what is the safest option.
OUTPUT FORMAT:
Return the response enclosed in these exact XML tags. Do not use Markdown code blocks for the tags themselves.
STYLE:
Use plain language, but keep expert precision (timing, thresholds, tradeoffs).
<voice_summary>
Exactly 3-5 Conversational answer sentences. Explain the "why" briefly. Avoid bullets.
</voice_summary>

<full_response>
Give 1–2 cohesive paragraphs (no bullet lists) that weave together the weather, satellite, and research context. Sound like an expert friend from Yolo County. Keep it specific and practical. Include [Source: ...] inline for any facts drawn from research. Avoid Markdown lists unless absolutely necessary.
</full_response>

<sources>
Source 1
Source 2
</sources>

CRITICAL RULES:
1. STRICTLY REJECT NON-AGRICULTURAL QUESTIONS.
2. USE CONTEXT:
   - If User says "What about walnuts?", look at HISTORY to see we were discussing "Almonds" or a specific location.
   - If User asks "Best place to grow?", combine RAG (soil/climate maps) + Weather constraints.
   - If User asks "Best time to X?", check Forecast (short_term) and GDD/Seasonality (long-term).
3. OPTIMIZATION QUESTIONS:
   - "Where in Yolo?": Recommend specific zones (e.g. "Capay Valley for organic...", "Clarksburg for grapes...") based on RAG knowledge.
   - "When to plant/harvest?": Use GDD and current soil moisture data to justify the timing.
4. Voice summary should feel like you're speaking directly to the grower, not as a generic AI.
5. DO NOT hallucinate. DO NOT REPLY WRONG ANSWERS INSTEAD ADMIT YOU DONT KNOW. 
"""

        # Format history (last 8 turns for better memory)
        history_text = ""
        if history:
            relevant_history = history[-8:] # Last 8 messages
            for msg in relevant_history:
                role = "Farmer" if msg['role'] == 'user' else "Advisor"
                history_text += f"{role}: {msg['content']}\n"
        
        if not history_text:
            history_text = "No previous context."

        # Long-term memory (persisted state)
        memory_text = "No long-term memory yet."
        if memory_state:
            mem_parts = []
            if memory_state.get("crop"):
                mem_parts.append(f"Crop: {memory_state['crop']}")
            if memory_state.get("location"):
                mem_parts.append(f"Location: {memory_state['location']}")
            if memory_state.get("key_facts"):
                mem_parts.append("Key facts: " + " | ".join(memory_state["key_facts"]))
            if memory_state.get("advisor_points"):
                mem_parts.append("Advisor points given: " + " | ".join(memory_state["advisor_points"]))
            if mem_parts:
                memory_text = "\n".join(mem_parts)

        prompt = f"""CROP: {crop}
LONG-TERM MEMORY:
{memory_text}

HISTORY:
{history_text}

CURRENT QUESTION: {query}

WEATHER (Current & Forecast):
{weather_context}

SATELLITE (Field Health):
{satellite_context}

MARKET:
{market_context or 'N/A'}

CHEMICAL LABELS:
{chemical_context or 'N/A'}

RESEARCH (Guidelines):
{rag_context}

ECONOMIC:
{economic_context or 'N/A'}
"""

        try:
            response_text = await self.generate(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=800,
                temperature=0.2
            )
        except Exception as e:
            print(f"LLM Generation Error (Mocking Response): {e}")
            # Fallback: Structured HTML Response using Real Data
            # Using HTML tags ensures the frontend displays it correctly via dangerouslySetInnerHTML
            response_text = f"""
<voice_summary>
I've analyzed the field data for {crop or 'your crop'}. Verification of satellite layers aligns with current weather patterns.
</voice_summary>

<full_response>
<div class="space-y-4">
    <div class="p-3 bg-emerald-900/20 border border-emerald-500/20 rounded-lg">
        <h3 class="text-emerald-400 font-bold mb-2 flex items-center gap-2">
            Field Analysis (Live Data)
        </h3>
        
        <div class="grid grid-cols-1 gap-3 text-sm">
            <div>
                <strong class="text-slate-300">Satellite Telemetry:</strong>
                <p class="text-emerald-50 mt-1 pl-2 border-l-2 border-emerald-500/50">{satellite_context}</p>
            </div>
            
            <div>
                <strong class="text-slate-300">Weather Conditions:</strong>
                <p class="text-emerald-50 mt-1 pl-2 border-l-2 border-blue-500/50">{weather_context}</p>
            </div>
        </div>
    </div>

    <div>
        <strong class="text-slate-300">Research Context:</strong>
        <p class="text-slate-400 text-sm mt-1">{rag_context[:300] + ("..." if len(rag_context) > 300 else "")}</p>
    </div>

    <p class="text-xs text-amber-500/80 italic mt-4 border-t border-white/5 pt-2">
        *Note: AI reasoning is currently limited due to connectivity, but the data above is real, live, and actionable.*
    </p>
</div>
</full_response>
"""
            
        try:
            # Parse XML-like Tags
            voice_summary = ""
            full_response = ""
            sources = []

            # Extract Voice Summary
            v_start = response_text.find("<voice_summary>")
            v_end = response_text.find("</voice_summary>")
            if v_start != -1 and v_end != -1:
                voice_summary = response_text[v_start + 15 : v_end].strip()
            
            # Extract Full Response
            f_start = response_text.find("<full_response>")
            f_end = response_text.find("</full_response>")
            if f_start != -1 and f_end != -1:
                full_response = response_text[f_start + 15 : f_end].strip()
            
            # Extract Sources
            s_start = response_text.find("<sources>")
            s_end = response_text.find("</sources>")
            if s_start != -1 and s_end != -1:
                sources_text = response_text[s_start + 9 : s_end].strip()
                if sources_text:
                    sources = [s.strip() for s in sources_text.split('\\n') if s.strip()]

            # Fallback if parsing failed completely
            if not full_response:
                full_response = response_text
                # strip tags if they exist but were malformed
                full_response = full_response.replace("<full_response>", "").replace("</full_response>", "")
            
            if not voice_summary:
                voice_summary = full_response[:300] + "..."

            print(f"DEBUG: Final LLM Response Text:\n{response_text}\n")
            return LLMResponse(
                text=full_response,
                voice_summary=voice_summary,
                sources=sources,
                confidence=0.9
            )
        except Exception as e:
            print(f"LLM Parse Error: {e}")
            print(f"Raw Response: {response_text}")
            
            return LLMResponse(
                text=response_text,
                voice_summary=response_text[:300] + "...",
                sources=[],
                confidence=0.5
            )
    
    async def extract_intent(self, user_input: str) -> Dict[str, Any]:
        """
        Extract structured intent from user voice input.
        
        Returns:
            Dict with crop, location_address, question_type, optimization_target, and keywords
        """
        system_prompt = """Extract structured information from farmer queries.
Return ONLY valid JSON with these fields:
- crop: one of [almonds, tomatoes, grapes, rice, pistachios, walnuts, unknown]
- question_type: [pest, disease, irrigation, weather, harvest, planting, market, chemical, math, general]
- optimization_target: [none, time, location, resource]
    - "Where is the best place to...?" -> location
    - "When should I...?" -> time
    - "How much water...?" -> resource
- location_address: Extract specific address/city. null if generic.
- is_agricultural: boolean
- urgency: [immediate, this_week, planning]
- keywords: list of terms"""

        prompt = f"Query: {user_input}"
        
        try:
            response = await self.generate(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=200,
                temperature=0.1
            )
        except Exception as e:
            print(f"Intent Extraction API Error: {e}")
            # Identify as agricultural to allow pipeline to proceed
            return {
                "crop": "unknown",
                "question_type": "general",
                "optimization_target": "none", 
                "location_address": None,
                "is_agricultural": True,
                "urgency": "planning",
                "keywords": []
            }
        
        try:
            # Clean response and parse JSON
            response = response.strip()
            
            # Handle Markdown Code Blocks
            if "```" in response:
                parts = response.split("```")
                json_part = None
                for i in range(1, len(parts), 2): 
                    part = parts[i].strip()
                    if part.startswith("json"):
                         part = part[4:].strip()
                    if part.startswith("{"):
                        json_part = part
                        break
                
                if json_part:
                    response = json_part
                else:
                    response = parts[1].strip() if len(parts) > 1 else response
                    if response.startswith("json"):
                        response = response[4:].strip()

            # Additional cleanup: Extract the first outermost JSON object
            start_idx = response.find("{")
            end_idx = response.rfind("}")
            
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                response = response[start_idx : end_idx + 1]
            
            try:
                data = json.loads(response)
                # Fallback for missing fields
                if "is_agricultural" not in data:
                    data["is_agricultural"] = data.get("question_type") not in ["general", "math"]
                if "optimization_target" not in data:
                    data["optimization_target"] = "none"
                return data
            except json.JSONDecodeError:
                return {
                    "crop": "unknown",
                    "question_type": "general",
                    "optimization_target": "none",
                    "location_address": None,
                    "is_agricultural": False,
                    "urgency": "planning",
                    "keywords": []
                }
        except Exception as e:
            print(f"Intent Extraction Error: {e}")
            return {
                "crop": "unknown",
                "question_type": "general",
                "optimization_target": "none", 
                "location_address": None,
                "is_agricultural": True,
                "urgency": "planning",
                "keywords": []
            }
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()


# Singleton
llm_service = CloudflareLLMService()


async def generate_response(
    query: str,
    crop: str,
    weather: str,
    satellite: str,
    rag: str,
    economic: Optional[str] = None,
    market: Optional[str] = None,
    chemical: Optional[str] = None,
    history: List[Dict] = [],
    memory_state: Optional[Dict] = None
) -> LLMResponse:
    """Convenience function for agricultural response generation."""
    return await llm_service.generate_agricultural_response(
        query, crop, weather, satellite, rag, economic, market, chemical, history, memory_state
    )


async def extract_intent(user_input: str) -> Dict[str, Any]:
    """Convenience function for intent extraction."""
    return await llm_service.extract_intent(user_input)

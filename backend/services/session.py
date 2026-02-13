import os
import json
import logging
from typing import Dict, Optional, List
from dataclasses import dataclass, field, asdict
import datetime
import uuid
try:
    import redis
except ImportError:
    redis = None

logger = logging.getLogger(__name__)

@dataclass
class SessionState:
    session_id: str
    crop: Optional[str] = None
    location_label: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    history: List[Dict] = field(default_factory=list)
    key_facts: List[str] = field(default_factory=list)       # Facts user shared (location, acreage, constraints)
    advisor_points: List[str] = field(default_factory=list)  # Advice already given to avoid repetition
    last_active: datetime.datetime = field(default_factory=datetime.datetime.now)

    def to_json(self):
        data = asdict(self)
        data['last_active'] = self.last_active.isoformat()
        return json.dumps(data)

    @classmethod
    def from_json(cls, json_str: str):
        data = json.loads(json_str)
        if 'last_active' in data:
            data['last_active'] = datetime.datetime.fromisoformat(data['last_active'])
        return cls(**data)


class SessionManager:
    """
    Session manager with Redis support and in-memory fallback.
    """
    
    def __init__(self):
        self._memory_store: Dict[str, SessionState] = {}
        self.redis_client = None
        
        redis_url = os.getenv("REDIS_URL")
        if redis_url and redis:
            try:
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                self.redis_client.ping()
                print("[SUCCESS] Session Manager: Connected to Redis")
            except Exception as e:
                print(f"[WARNING] Session Manager: Redis connection failed ({e}), using in-memory store.")
                self.redis_client = None
        else:
            print("[INFO] Session Manager: Using in-memory store (No REDIS_URL)")

    def _get_redis_key(self, session_id: str) -> str:
        return f"agribot:session:{session_id}"

    def get_session(self, session_id: str) -> SessionState:
        """Get or create a session."""
        
        # Try Redis
        if self.redis_client:
            try:
                data = self.redis_client.get(self._get_redis_key(session_id))
                if data:
                    session = SessionState.from_json(data)
                    session.last_active = datetime.datetime.now()
                    self._save_session(session) # Update timestamp
                    return session
            except Exception:
                pass # Fallback to new session

        # Try Memory
        if not self.redis_client:
            if session_id not in self._memory_store:
                self._memory_store[session_id] = SessionState(session_id=session_id)
            self._memory_store[session_id].last_active = datetime.datetime.now()
            return self._memory_store[session_id]

        # Create new if didn't exist in Redis
        new_session = SessionState(session_id=session_id)
        self._save_session(new_session)
        return new_session

    def _save_session(self, session: SessionState):
        """Save session state."""
        if self.redis_client:
            try:
                self.redis_client.setex(
                    self._get_redis_key(session.session_id),
                    86400 * 7, # 7 days expiry
                    session.to_json()
                )
            except Exception as e:
                print(f"Redis save error: {e}")
        else:
            # Memory store is updated by reference, but strictly speaking explicitly 'saving' is good practice
            self._memory_store[session.session_id] = session

    def update_context(self, session_id: str, crop: Optional[str] = None, 
                      lat: Optional[float] = None, lon: Optional[float] = None,
                      label: Optional[str] = None):
        """Update context variables for a session."""
        session = self.get_session(session_id)
        
        updated = False
        if crop and crop.lower() != "unknown":
            session.crop = crop
            updated = True
            
        if lat is not None and lon is not None:
            session.lat = lat
            session.lon = lon
            updated = True
            if label:
                session.location_label = label

        if updated:
            self._save_session(session)
                
    def add_message(self, session_id: str, role: str, content: str):
        """Add message to history."""
        session = self.get_session(session_id)
        session.history.append({
            "role": role,
            "content": content,
            "timestamp": datetime.datetime.now().isoformat()
        })
        # Keep conversation memory bounded to avoid unbounded growth (latest 30 turns)
        if len(session.history) > 30:
            session.history = session.history[-30:]
        self._save_session(session)

    # -------- Memory helpers (token-friendly, no extra LLM calls) --------
    def _extract_key_facts(self, text: str) -> List[str]:
        """
        Lightweight heuristic extraction to capture user-shared facts.
        Rules:
        - Sentences containing numbers, acres, gallons, dates, or location cues.
        - Sentences mentioning core crops.
        """
        cues = ["acre", "acres", "gallon", "gpa", "lat", "lon", "north", "south", "east", "west", "near", "by", "field", "orchard", "block", "tomato", "almond", "walnut", "pistachio", "rice", "grape"]
        sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
        facts = []
        for s in sentences:
            lower = s.lower()
            if any(c in lower for c in cues) or any(ch.isdigit() for ch in s):
                facts.append(s)
        return facts[:3]

    def _extract_advisor_points(self, text: str) -> List[str]:
        """
        Capture concise advice sentences from assistant replies.
        Takes first 2-3 declarative sentences.
        """
        sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
        return sentences[:3]

    def update_memory(self, session_id: str, user_text: str, assistant_text: str, crop: Optional[str] = None, location_label: Optional[str] = None):
        """
        Update long-term memory slots without an extra LLM call.
        """
        session = self.get_session(session_id)

        # Crop/location consolidation
        if crop and crop.lower() != "unknown":
            session.crop = crop
        if location_label:
            session.location_label = location_label

        # Key facts from user
        for fact in self._extract_key_facts(user_text):
            if fact not in session.key_facts:
                session.key_facts.append(fact)

        # Advisor points from assistant
        for point in self._extract_advisor_points(assistant_text):
            if point not in session.advisor_points:
                session.advisor_points.append(point)

        # Bound memory size
        session.key_facts = session.key_facts[-10:]
        session.advisor_points = session.advisor_points[-10:]

        self._save_session(session)

    def get_memory_summary(self, session_id: str) -> str:
        session = self.get_session(session_id)
        parts = []
        if session.crop:
            parts.append(f"Crop: {session.crop}")
        if session.location_label or (session.lat and session.lon):
            loc = session.location_label or f"Lat {session.lat}, Lon {session.lon}"
            parts.append(f"Location: {loc}")
        if session.key_facts:
            parts.append("Key facts: " + " | ".join(session.key_facts))
        if session.advisor_points:
            parts.append("Advisor points given: " + " | ".join(session.advisor_points))
        return "\n".join(parts) if parts else "No long-term memory yet."
        
    def clear_session(self, session_id: str):
        """Reset a session."""
        if self.redis_client:
            self.redis_client.delete(self._get_redis_key(session_id))
        
        if session_id in self._memory_store:
            del self._memory_store[session_id]
            
        # Recreate empty
        self.get_session(session_id)

# Singleton
session_manager = SessionManager()

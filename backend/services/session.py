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
        self._save_session(session)
        
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

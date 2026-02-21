import json
import os
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

class RecommendRequest(BaseModel):
    query: str
    focus_filter: Optional[str] = None
    city_filter: Optional[str] = None

STARTUPS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "yolo_startups.json")

def load_startups() -> List[dict]:
    if not os.path.exists(STARTUPS_FILE):
        return []
    with open(STARTUPS_FILE, "r") as f:
        return json.load(f)

@router.get("/")
def get_all_startups():
    startups = load_startups()
    return {"total": len(startups), "startups": startups}

@router.post("/recommend")
def recommend_startups(req: RecommendRequest):
    startups = load_startups()
    query = req.query.lower() if req.query else ""
    
    results = []
    for s in startups:
        score = 0
        if req.focus_filter and req.focus_filter.lower() != s["focus"].lower() and req.focus_filter != "All":
            continue
        if req.city_filter and req.city_filter.lower() != s["city"].lower() and req.city_filter != "All":
            continue

        if query:
            # Basic keyword matrix matching
            if query in s["name"].lower(): score += 5
            if query in s["focus"].lower(): score += 3
            if query in s["description"].lower(): score += 2
            
            for word in query.split():
                if len(word) > 3 and word in s["description"].lower():
                    score += 1
            if score == 0:
                continue # Skip if no match and query exists
        else:
            score = 1 # If no query, all remaining are equal (just filtered)

        s_copy = dict(s)
        s_copy["match_score"] = score
        results.append(s_copy)
            
    # Sort by score descending
    results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    
    return {"results": results[:5]}

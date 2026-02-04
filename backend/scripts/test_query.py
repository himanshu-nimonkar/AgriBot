
import requests
import json
import sys
import os

# Ensure we're hitting the local backend
URL = "http://127.0.0.1:8000/api/analyze"

def test_query():
    payload = {
        "query": "Will my tomato plants survive the cold wave which is gonna happen near drake drive next week?",
        "lat": 38.7646,
        "lon": -121.9018,
        "session_id": "cli-test-session"
    }
    
    print(f"[INFO] Sending Query: {payload['query']}")
    try:
        response = requests.post(URL, json=payload)
        response.raise_for_status()
        data = response.json()
        
        print("\n[SUCCESS] Response Received:")
        print(json.dumps(data, indent=2))
        
        # Check for date fields
        print(f"\nTime Check: {data.get('timestamp')}")
        
    except requests.exceptions.RequestException as e:
        print(f"\n[ERROR] Request Failed: {e}")
        if e.response is not None:
             print(f"Status: {e.response.status_code}")
             print(f"Detail: {e.response.text}")

if __name__ == "__main__":
    test_query()

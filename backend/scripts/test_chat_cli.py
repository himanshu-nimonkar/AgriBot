import requests
import json
import time

API_URL = "http://localhost:8000"

def test_chat():
    print("Testing Chat Endpoint...")
    session_id = "test_cli_user"
    payload = {
        "query": "What is the optimal irrigation strategy for Almonds in Yolo County?",
        "location": {"lat": 38.7646, "lon": -121.9018},
        "session_id": session_id
    }
    
    try:
        start_time = time.time()
        response = requests.post(f"{API_URL}/api/analyze", json=payload, timeout=30)
        end_time = time.time()
        
        if response.status_code == 200:
            data = response.json()
            print(f"SUCCESS (Took {end_time - start_time:.2f}s)")
            print(f"Response: {data.get('response', '')[:100]}...")
            if data.get('structured_data'):
                print(f"Structured Data Keys: {list(data['structured_data'].keys())}")
            return True
        else:
            print(f"FAILED: Status {response.status_code}")
            print(response.text)
            return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    test_chat()

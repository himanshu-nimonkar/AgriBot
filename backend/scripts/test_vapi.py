
import requests
import json
import sys

# Ensure we're hitting the local backend
URL = "http://127.0.0.1:8000/api/vapi-llm/chat/completions"

def test_vapi():
    # Simulate Vapi's OpenAI-compatible payload
    payload = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant." 
            },
            {
                "role": "user",
                "content": "Will my tomato plants survive the cold wave near drake drive?"
            }
        ],
        "temperature": 0.7
    }
    
    print(f"🎤 Sending Vapi Simulation: {payload['messages'][-1]['content']}")
    try:
        response = requests.post(URL, json=payload)
        response.raise_for_status()
        
        # Vapi expects streaming or non-streaming text. 
        # Our endpoint returns a simple JSON with "choices" or similar if mimicking OpenAI,
        # OR it returns the Vapi custom structure depending on implementation.
        # Let's inspect raw.
        
        print("\n✅ Response Status:", response.status_code)
        
        # Helper to print stream or json
        try:
            data = response.json()
            print(json.dumps(data, indent=2))
        except:
            print("Response text:", response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Request Failed: {e}")
        if e.response is not None:
             print(f"Status: {e.response.status_code}")
             print(f"Detail: {e.response.text}")

if __name__ == "__main__":
    test_vapi()

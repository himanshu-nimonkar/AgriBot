
import asyncio
import httpx
import json
import time

# Tunnel URL (hardcoded for now as it's the target)
API_URL = "http://localhost:8000/api/vapi-llm" # Hitting local for simulation to test logic
# Or we can hit the tunnel:
# API_URL = "https://paths-our-collaboration-everything.trycloudflare.com/api/vapi-llm"

PAYLOAD = {
    "message": {
        "type": "transcript",
        "role": "user",
        "transcript": "What is the best time to plant tomatoes in Yolo County? And what pests should I watch out for?"
    },
    "call": {
        "id": "sim-vapi-001"
    },
    "messages": [
        {"role": "user", "content": "What is the best time to plant tomatoes in Yolo County? And what pests should I watch out for?"}
    ]
}

async def simulate_call():
    print(f"[INFO] Simulating Vapi Call to {API_URL}...")
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            start = time.time()
            response = await client.post(API_URL, json=PAYLOAD)
            duration = time.time() - start
            
            print(f"[SUCCESS] Response received in {duration:.2f}s")
            print(f"Status Code: {response.status_code}")
            
            data = response.json()
            message = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            print("\n--- VOICE SUMMARY ---")
            print(message)
            print("---------------------")
            
            # Count lines/sentences roughly
            lines = [l for l in message.split('.') if l.strip()]
            print(f"Approximate Sentence Count: {len(lines)}")
            
        except Exception as e:
            print(f"[ERROR] Error: {e}")

if __name__ == "__main__":
    asyncio.run(simulate_call())

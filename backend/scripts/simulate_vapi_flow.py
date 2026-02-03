
import asyncio
import aiohttp
import json
import time
import sys
from datetime import datetime

async def simulate_vapi_call():
    """
    Simulates a Vapi.ai call to the local backend.
    Measures latency to first token (TTFB), filler phrase, and full completion.
    Validates SSE format.
    """
    url = "http://localhost:8000/api/vapi-llm"
    payload = {
        "messages": [
            {"role": "user", "content": "Where in Woodland should I grow tomatoes to get the best yield?"}
        ],
        "stream": True,
        "call": {"id": "sim-call-123"}
    }

    print(f"📞 Initializing Simulated Call to {url}...")
    start_time = time.time()
    
    first_token_time = None
    filler_received = False
    filler_content = ""
    final_response_content = ""
    keep_alive_count = 0
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    print(f"❌ Connection Failed: HTTP {response.status}")
                    text = await response.text()
                    print(f"Response: {text}")
                    return

                print(f"✅ Connection Established (HTTP 200) in {time.time() - start_time:.2f}s")
                
                async for line in response.content:
                    current_time = time.time()
                    elapsed = current_time - start_time
                    decoded_line = line.decode('utf-8').strip()
                    
                    if not decoded_line:
                        continue
                        
                    # Handle SSE Comments (Keep-Alive)
                    if decoded_line.startswith(":"):
                        keep_alive_count += 1
                        print(f"💓 Keep-alive received at {elapsed:.2f}s")
                        continue
                        
                    # Handle Data Frames
                    if decoded_line.startswith("data: "):
                        data_content = decoded_line[6:]
                        
                        if data_content == "[DONE]":
                            print(f"🏁 Stream Complete at {elapsed:.2f}s")
                            break
                        
                        try:
                            json_data = json.loads(data_content)
                            
                            # Check for choices
                            choices = json_data.get("choices", [])
                            if not choices:
                                continue
                                
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            
                            if content:
                                if first_token_time is None:
                                    first_token_time = elapsed
                                    print(f"⚡ First Token Received at {first_token_time:.2f}s")
                                
                                # Detect Filler
                                if not filler_received and "Just a moment" in (filler_content + content):
                                    filler_received = True
                                    print(f"🗣️  Filler Phrase Detected at {elapsed:.2f}s: '(Just a moment...)'")
                                    
                                if filler_received and "Just a moment" in (filler_content + content):
                                     filler_content += content
                                else:
                                     final_response_content += content

                                # Print chunks in real-time
                                # sys.stdout.write(content)
                                # sys.stdout.flush()

                        except json.JSONDecodeError:
                            print(f"❌ JSON Decode Error: {decoded_line}")
    except Exception as e:
        print(f"❌ Simulation Failed: {e}")
        return

    # Final Report
    print("\n\n📊 CALL SIMULATION REPORT")
    print("=========================")
    print(f"Total Duration:      {time.time() - start_time:.2f}s")
    print(f"Time to First Token: {first_token_time:.2f}s " + ("(✅ Excellent)" if first_token_time < 2.0 else "(⚠️ Slow)"))
    print(f"Filler Triggered:    {'Yes' if filler_received else 'No'}")
    print(f"Keep-Alives:         {keep_alive_count}")
    print("-------------------------")
    print("Full Response Received:")
    print(f"'{final_response_content[:100]}...'")
    print("=========================")
    
    if first_token_time and first_token_time < 2.0 and filler_received:
        print("✅ SUCCESS: The endpoints are behaving correctly for Vapi latency requirements.")
    else:
        print("⚠️  WARNING: Latency may still be too high for Vapi limits.")

if __name__ == "__main__":
    asyncio.run(simulate_vapi_call())

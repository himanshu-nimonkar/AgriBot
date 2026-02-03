
import asyncio
import os
import sys
from datetime import datetime

# Add backend to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.rag import rag_service
from services.llm import llm_service
from services.weather import weather_service
from config import settings

async def run_diagnostics():
    print(f"🔍 Starting System Diagnostics at {datetime.now().isoformat()}")
    print("-" * 50)
    
    # 1. Config Check
    print("\n1️⃣  CONFIGURATION CHECK")
    print(f"CF Account ID: {'✅ Loaded' if settings.cloudflare_account_id else '❌ Missing'}")
    print(f"CF API Token: {'✅ Loaded' if settings.cloudflare_api_token else '❌ Missing'}")
    # Don't print actual keys for security, just presence
    
    # 2. RAG Check
    print("\n2️⃣  RAG SERVICE CHECK")
    try:
        query = "tomato heat wave"
        print(f"Querying RAG for: '{query}'...")
        results = await rag_service.search_knowledge(query, "tomato")
        
        if results:
            print(f"✅ RAG Success! Found {len(results)} results.")
            for i, r in enumerate(results[:2]):
                print(f"   [{i+1}] {r.source}: {r.text[:100]}...")
        else:
            print("⚠️ RAG returned NO results (Empty List).")
            # Verify local file presence manually
            import glob
            files = glob.glob("./data/**/*", recursive=True)
            print(f"   DEBUG: Local files in ./data: {len(files)} found.")
            if len(files) < 10:
                print(f"   Files: {files}")

    except Exception as e:
        print(f"❌ RAG Failed with Exception: {e}")
        import traceback
        traceback.print_exc()

    # 3. LLM Check
    print("\n3️⃣  LLM SERVICE CHECK")
    try:
        print("Sending test prompt to Cloudflare Workers AI...")
        response = await llm_service.generate(
            prompt="Reply with exactly 'System Functional'.",
            max_tokens=20
        )
        print(f"LLM Raw Output: '{response}'")
        
        if "System Functional" in response:
            print("✅ LLM Connection Verified.")
        else:
            print(f"⚠️ LLM Response unexpected: {response}")
            
    except Exception as e:
        print(f"❌ LLM Failed with Exception: {e}")

    # 4. Weather Check (Just in case)
    print("\n4️⃣  WEATHER SERVICE CHECK")
    try:
        w = weather_service.get_weather(38.5, -121.7)
        # Mock weather is synchronous or async? Let's check service call.
        # Actually weather_service.get_weather is NOT async in the code I viewed earlier?
        # Wait, reasoning_engine calls it. Let's assume it IS, or check.
        # In reasoning engine: self.weather.get_weather(final_lat, final_lon) -> tasks list.
        # So it is awaitable.
        res = await w
        if res:
             print(f"✅ Weather Data: {res.temperature_c}C")
        else:
             print("⚠️ Weather returned None")
    except Exception as e:
        print(f"❌ Weather Failed: {e}")

    await rag_service.close()
    await llm_service.close()
    await weather_service.close()
    print("\n" + "-" * 50)
    print("Diagnostics Complete.")

if __name__ == "__main__":
    asyncio.run(run_diagnostics())

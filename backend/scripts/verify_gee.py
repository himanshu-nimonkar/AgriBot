import sys
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Setup env and path
backend_path = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_path))
env_path = backend_path.parent / ".env"
load_dotenv(env_path)

from services.geospatial import gee_service, get_field_analytics

async def main():
    print(f"Testing GEE with Credential File: {os.getenv('GEE_SERVICE_ACCOUNT_FILE')}")
    
    # Force Initialize
    gee_service.initialize()
    if gee_service._mock_mode:
        print("❌ Service switched to MOCK MODE during init.")
    else:
        print("✅ Service initialized in REAL mode.")

    print("\nRunning Analytics Request...")
    try:
        # Davis, CA coordinates
        data = await get_field_analytics(38.5449, -121.7405)
        print(f"\nResult: {data}")
        
        if data.tile_url:
            print(f"\n✅ Tile URL generated: {data.tile_url}")
        else:
            print(f"\n⚠️ No Tile URL (Mock mode or error).")
            
    except Exception as e:
        print(f"\n❌ Error during analytics: {e}")

if __name__ == "__main__":
    asyncio.run(main())

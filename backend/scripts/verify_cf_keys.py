
import os
import sys
import httpx
import asyncio
from dotenv import load_dotenv

# Load env file explicitly
load_dotenv("../.env")

ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

async def verify():
    print("🔍 Cloudflare Credential Verification")
    print("-" * 50)

    if not ACCOUNT_ID:
        print("❌ CRITICAL: CLOUDFLARE_ACCOUNT_ID is missing in .env")
        return
    if not API_TOKEN:
        print("❌ CRITICAL: CLOUDFLARE_API_TOKEN is missing in .env")
        return
    
    print(f"✅ Account ID detected: {ACCOUNT_ID[:4]}...{ACCOUNT_ID[-4:]} (Length: {len(ACCOUNT_ID)})")
    print(f"✅ API Token detected:  {API_TOKEN[:4]}...{API_TOKEN[-4:]} (Length: {len(API_TOKEN)})")

    # TEST 1: User Verify Endpoint (Checks if token is valid)
    print("\n1️⃣  Testing Token Validity (User/Verify)...")
    headers = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://api.cloudflare.com/client/v4/user/tokens/verify", headers=headers)
            print(f"   Status Code: {resp.status_code}")
            print(f"   Response: {resp.text}")
            
            if resp.status_code == 200:
                data = resp.json()
                if data['result']['status'] == 'active':
                    print("   ✅ Token is ACTIVE and INVALID.")
                else:
                    print("   ⚠️ Token is recognized but NOT active.")
            else:
                print("   ❌ Token verification FAILED. The token is likely invalid or expired.")
    except Exception as e:
        print(f"   ❌ Exception during verification: {e}")

    # TEST 2: Workers AI Specific Test
    print("\n2️⃣  Testing Workers AI Access...")
    model = "@cf/baai/bge-base-en-v1.5"
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}"
    payload = {"text": ["Test query for diagnostics"]}

    try:
        async with httpx.AsyncClient() as client:
            print(f"   URL: {url}")
            resp = await client.post(url, json=payload, headers=headers)
            print(f"   Status Code: {resp.status_code}")
            try:
                print(f"   Response Body: {resp.json()}")
            except:
                print(f"   Response Text: {resp.text}")
            
            if resp.status_code == 401:
                print("\n❌ DIAGNOSIS: 401 Unauthorized.")
                print("   Possible causes:")
                print("   1. The Token does not have 'Workers AI: Read' permissions.")
                print("   2. The Account ID does not match the Token's authorized account.")
                print("   3. The Token has expired.")
            elif resp.status_code == 403:
                print("\n❌ DIAGNOSIS: 403 Forbidden. Token valid but lacks permission for this resource.")
            elif resp.status_code == 200:
                print("\n✅ SUCCESS: Workers AI is accessible.")

    except Exception as e:
        print(f"   ❌ Exception during AI test: {e}")

if __name__ == "__main__":
    asyncio.run(verify())

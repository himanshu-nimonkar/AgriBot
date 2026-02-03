
import os
import sys
import json
import requests
import time
import subprocess
import re
from typing import Optional
from dotenv import load_dotenv

from pathlib import Path

# Load .env
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(env_path)

# Configuration
VAPI_BASE_URL = "https://api.vapi.ai"
VAPI_PRIVATE_KEY = os.getenv("VAPI_PRIVATE_KEY")

if not VAPI_PRIVATE_KEY:
    print("❌ Error: VAPI_PRIVATE_KEY not found in environment variables.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {VAPI_PRIVATE_KEY}",
    "Content-Type": "application/json"
}

def get_assistant_id(name_filter: str = "Ag Copilot") -> Optional[str]:
    """Finds the assistant ID by name."""
    try:
        resp = requests.get(f"{VAPI_BASE_URL}/assistant", headers=HEADERS)
        if resp.status_code != 200:
            print(f"❌ Failed to list assistants: {resp.text}")
            return None
            
        assistants = resp.json()
        for ast in assistants:
            # Check name or if it's the one we've been working with
            if name_filter.lower() in ast.get("name", "").lower():
                return ast["id"]
        
        # Fallback: Return the first one if only one exists/was recently modified
        if assistants:
            print(f"⚠️ Exact match for '{name_filter}' not found. Using most recent: {assistants[0].get('name')}")
            return assistants[0]["id"]
            
        return None
    except Exception as e:
        print(f"❌ Error fetching assistant: {e}")
        return None

def get_phone_number_id() -> Optional[str]:
    """Finds the first phone number ID."""
    try:
        resp = requests.get(f"{VAPI_BASE_URL}/phone-number", headers=HEADERS)
        if resp.status_code != 200:
            print(f"❌ Failed to list phone numbers: {resp.text}")
            return None
            
        numbers = resp.json()
        if numbers:
            return numbers[0]["id"]
        return None
    except Exception as e:
        print(f"❌ Error fetching phone number: {e}")
        return None

def update_vapi_config(url: str):
    """Updates Vapi Assistant and Phone Number with the new Tunnel URL."""
    print(f"\n🔄 Updating Vapi Configuration with URL: {url}")
    
    # 1. Clean URL (ensure https and remove trailing slash)
    if not url.startswith("https://"):
        url = f"https://{url}"
    url = url.rstrip("/")
    
    api_llm_url = f"{url}/api/vapi-llm"
    webhook_url = f"{url}/webhook/vapi"
    
    # 2. Find IDs
    assistant_id = get_assistant_id()
    if not assistant_id:
        print("❌ Could not find an Assistant ID.")
        return
        
    phone_id = get_phone_number_id()
    
    # 3. Update Assistant
    print(f"   🔹 Updating Assistant ({assistant_id})...")
    payload = {
        "model": {
            "provider": "custom-llm",
            "model": "deep-ag-copilot",
            "url": api_llm_url
        },
        "analysisPlan": {
            "structuredDataSchema": {
                "type": "string" 
            },
            "successEvaluationPrompt": "Did the AI answer the question?",
            "successEvaluationRubric": "NumericScale"
        },
        # Vapi's client-side filler messages (if supported) or rely on our streaming
        "serverUrl": webhook_url,
        "server": {
            "url": webhook_url,
            "timeoutSeconds": 60
        },
        "silenceTimeoutSeconds": 60,
        "interruptionsEnabled": False, 
        "voice": {
             "provider": "11labs", 
             "voiceId": "21m00Tcm4TlvDq8ikWAM",
        },
        "transcriber": {
             "provider": "deepgram",
             "model": "nova-2",
             "language": "en-US"
        }
    }
    
    resp = requests.patch(
        f"{VAPI_BASE_URL}/assistant/{assistant_id}",
        headers=HEADERS,
        json=payload
    )
    
    if resp.status_code == 200:
        print("   ✅ Assistant updated successfully.")
    else:
        print(f"   ❌ Failed to update Assistant: {resp.status_code} {resp.text}")

    # 4. Update Phone Number (if exists)
    if phone_id:
        print(f"   🔹 Updating Phone Number ({phone_id})...")
        phone_payload = {
            "serverUrl": webhook_url,
            "server": {
                "url": webhook_url
            }
        }
        resp = requests.patch(
            f"{VAPI_BASE_URL}/phone-number/{phone_id}",
            headers=HEADERS,
            json=phone_payload
        )
        if resp.status_code == 200:
            print("   ✅ Phone Number updated successfully.")
        else:
            print(f"   ❌ Failed to update Phone Number: {resp.status_code} {resp.text}")
    else:
        print("   ⚠️ No phone number found to update.")

    print("\n✨ AgBot is ready! Call your Vapi number now.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python update_vapi.py <NEW_TUNNEL_URL>")
        sys.exit(1)
        
    new_url = sys.argv[1]
    update_vapi_config(new_url)

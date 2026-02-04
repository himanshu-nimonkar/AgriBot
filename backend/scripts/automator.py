
import subprocess
import time
import re
import os
import requests
import sys
from dotenv import load_dotenv

# Load env vars from Project Root
dotenv_path = os.path.join(os.path.dirname(__file__), "../../.env")
load_dotenv(dotenv_path=dotenv_path)

VAPI_PRIVATE_KEY = os.getenv("VAPI_PRIVATE_KEY")
AGRIBOT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
BACKEND_DIR = os.path.join(AGRIBOT_ROOT, "backend")
FRONTEND_DIR = os.path.join(AGRIBOT_ROOT, "frontend")

def start_backend():
    print("[INFO] Starting FastAPI Backend...")
    # Use 127.0.0.1 to be explicit for cloudflared
    # Redirect stderr to stdout so we see errors in the console
    # Use sys.executable to ensure we use the same python environment
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=BACKEND_DIR,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    return backend

def start_tunnel():
    print("[INFO] Starting Cloudflare Tunnel...")
    tunnel = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", "http://localhost:8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    return tunnel

def get_tunnel_url(tunnel_process):
    print("⏳ Waiting for Tunnel URL...")
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    
    start_time = time.time()
    while time.time() - start_time < 30:
        line = tunnel_process.stdout.readline()
        if not line:
            break
        match = url_pattern.search(line)
        if match:
            return match.group(0)
    return None

def update_frontend_and_deploy(public_url):
    print(f"\n[INFO] Injecting URL into Frontend: {public_url}")
    
    print(f"[INFO] Building Frontend (Vite) with VITE_API_URL={public_url}...")
    try:
        # Pass VITE_API_URL via environment variables instead of writing a file
        build_env = os.environ.copy()
        build_env["VITE_API_URL"] = public_url
        subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, check=True, stdout=subprocess.DEVNULL, env=build_env)
    except subprocess.CalledProcessError:
        print("[ERROR] Frontend Build Failed!")
        return False
        
    print("[INFO] Deploying to Cloudflare Pages...")
    try:
        subprocess.run(
            ["npx", "wrangler", "pages", "deploy", "dist", "--project-name", "agribot-dashboard"], 
            cwd=FRONTEND_DIR, 
            check=True,
            stdout=subprocess.PIPE # Capture output to avoid too much noise
        )
        print("[SUCCESS] Deployment Successful!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Deployment Failed: {e}")
        return False

def update_vapi(public_url):
    if not VAPI_PRIVATE_KEY:
        print("[WARNING] VAPI_PRIVATE_KEY not found. Skipping Vapi update.")
        return

    print(f"[INFO] Updating Vapi Webhook...")
    headers = {"Authorization": f"Bearer {VAPI_PRIVATE_KEY}", "Content-Type": "application/json"}
    
    try:
        resp = requests.get("https://api.vapi.ai/assistant", headers=headers)
        if resp.status_code == 200:
            assistants = resp.json()
            target_assistant = None
            for a in assistants:
                if a.get("name") == "Deep-Ag Copilot" or a.get("name") == "AgriBot":
                    target_assistant = a
                    break
            
            if not target_assistant and assistants: target_assistant = assistants[0]
                
            if target_assistant:
                ass_id = target_assistant["id"]
                patch_url = f"https://api.vapi.ai/assistant/{ass_id}"
                
                # Update BOTH serverUrl (for webhooks) AND model.url (for Custom LLM)
                payload = {
                    "serverUrl": f"{public_url}/webhook/vapi",
                    "model": {
                        "provider": "custom-llm",
                        "url": f"{public_url}/api/vapi-llm/chat/completions",
                        "model": "gpt-3.5-turbo" # Ensure model is kept set
                    }
                }
                
                patch_resp = requests.patch(patch_url, json=payload, headers=headers)
                if patch_resp.status_code == 200:
                    print(f"[SUCCESS] Vapi Configured: {target_assistant.get('name')}")
                else:
                    print(f"[ERROR] Vapi Update Failed: {patch_resp.text}")
            else:
                print("[WARNING] No Assistant found.")
    except Exception as e:
        print(f"[WARNING] Vapi Error: {e}")

def start_local_frontend():
    print("[INFO] Starting Local Dashboard...")
    # npm run dev
    frontend = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.DEVNULL, # Keep it clean
        stderr=subprocess.PIPE
    )
    return frontend

def main():
    try:
        backend = start_backend()
        tunnel = start_tunnel()
        public_url = get_tunnel_url(tunnel)
        
        if public_url:
            print(f"[INFO] Tunnel Live: {public_url}")
            
            # 2. Deploy to Cloudflare (uses Tunnel URL for public access)
            # We wrap this in a try-except so the local app STILL starts even if remote deploy fails
            try:
                update_frontend_and_deploy(public_url)
            except Exception as e:
                print(f"[WARNING] Remote Deployment Failed (Permissions?): {e}")
                print("[WARNING] Proceeding with Local Dashboard Only.")
            
            # 3. Start Local Frontend (Guaranteed Access)
            # Reads VITE_API_URL=http://127.0.0.1:8000 from root .env because we set envDir: '..' in vite.config.js
            print(f"[INFO] Starting Local Frontend (Local Stable)")

            start_local_frontend()
            
            print("\n" + "="*60)
            print("[SUCCESS] SYSTEM READY!")
            print("1. Backend & Tunnel: Running")
            print("2. Vapi Voice: Connected")
            print("3. OPEN DASHBOARD: http://localhost:5173")
            print("   (Use this local link. The .pages.dev one may be outdated)")
            print("="*60 + "\n")
            
            # Keep running
            while True:
                time.sleep(1)
        else:
            print("[ERROR] Failed to retrieve URL.")
            backend.terminate()
            tunnel.terminate()
            
    except KeyboardInterrupt:
        print("\n[INFO] Stopping...")
        if 'backend' in locals(): backend.terminate()
        if 'tunnel' in locals(): tunnel.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main()

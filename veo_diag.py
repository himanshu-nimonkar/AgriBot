from google import genai
from google.genai import types
import json
import os

def get_api_key():
    try:
        with open('.env', 'r') as f:
            for line in f:
                if line.startswith('GEMINI_API_KEY='):
                    return line.split('=')[1].strip()
    except Exception:
        pass
    return None

api_key = get_api_key()
client = genai.Client(api_key=api_key)

log_data = []

def log(msg):
    print(msg)
    log_data.append(msg)

try:
    log(f"Using key: {api_key[:10]}...")
    
    # Try with a very simple request
    log("\nTesting Veo 3.1 generation...")
    try:
        # Note: Veo 3.1 might require specific duration or aspect ratio
        operation = client.models.generate_videos(
            model='veo-3.1-generate-preview',
            prompt='a peaceful farm at sunset',
            config=types.GenerateVideosConfig(
                duration_seconds=6,
                aspect_ratio="16:9",
                number_of_videos=1
            )
        )
        log(f"Job started: {operation.name}")
    except Exception as e:
        log(f"ERROR: {e}")
        if hasattr(e, 'response'):
             log(f"Response: {e.response}")
        if hasattr(e, 'args'):
             log(f"Args: {e.args}")
        try:
            import traceback
            log(traceback.format_exc())
        except:
            pass

except Exception as e:
    log(f"Global error: {e}")

with open('veo_error_full.txt', 'w') as f:
    f.write("\n".join(log_data))

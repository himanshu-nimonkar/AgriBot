from google import genai
from google.genai import types
import base64
import os

api_key = os.environ.get("GEMINI_API_KEY", "AIzaSyAaODGy72VYwMwKS4RfeXe6lQr5-qzui2g")
client = genai.Client(api_key=api_key)

try:
    with open('/Users/himanshunimonkar/Downloads/AgriBot/barren.png', 'rb') as f:
        image_bytes = f.read()
except:
    image_bytes = b"fakebytes"

image_part = types.Image(image_bytes=image_bytes, mime_type="image/png")

veo_models = [
    "veo-3.1-generate-preview",
    "veo-3.0-generate-001",
    "veo-2.0-generate-001"
]

for model in veo_models:
    try:
        print(f"Testing {model}...")
        operation = client.models.generate_videos(
            model=model,
            prompt='a peaceful farm at sunset',
            image=image_part,
            config=types.GenerateVideosConfig(
                duration_seconds=6,
                aspect_ratio="16:9",
                number_of_videos=1
            )
        )
        print(f"SUCCESS with {model}")
        break
    except Exception as e:
        print(f"FAILED {model}: {e}")


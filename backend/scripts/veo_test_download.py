from google import genai
from google.genai import types
import os

api_key = os.environ.get("GEMINI_API_KEY", "AIzaSyAaODGy72VYwMwKS4RfeXe6lQr5-qzui2g")
client = genai.Client(api_key=api_key)

try:
    with open('/Users/himanshunimonkar/Downloads/AgriBot/barren.png', 'rb') as f:
        image_bytes = f.read()
except:
    image_bytes = b"fakebytes"

image_part = types.Image(image_bytes=image_bytes, mime_type="image/png")

try:
    operation = client.models.generate_videos(
        model="veo-2.0-generate-001",
        prompt='a farm',
        image=image_part,
        config=types.GenerateVideosConfig(
            duration_seconds=6,
            aspect_ratio="16:9",
            number_of_videos=1
        )
    )
    import time
    while not operation.done:
        time.sleep(10)
        operation = client.operations.get(operation=operation)
    
    video_file = operation.response.generated_videos[0].video
    print(dir(video_file))
    print(video_file.model_dump())
        
except Exception as e:
    import traceback
    traceback.print_exc()


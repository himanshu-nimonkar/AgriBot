import asyncio
import os
import sys

from services.veo_service import veo_service

async def main():
    print("Testing Veo3 generation...")
    image_path = "/Users/himanshunimonkar/Downloads/AgriBot/barren.png"
    if not os.path.exists(image_path):
        print(f"Error: image {image_path} not found.")
        return
        
    with open(image_path, "rb") as f:
        image_bytes = f.read()
        
    mime_type = "image/png"
    
    print("Running analyze_image...")
    analytics = await veo_service.analyze_image(image_bytes, mime_type)
    print("Analytics:", analytics)
    
    print("Running generate_video...")
    job_id, instant_url = await veo_service.generate_video(image_bytes, mime_type, analytics)
    print(f"Job ID: {job_id}, Instant URL: {instant_url}")
    
    if not instant_url:
        print("Polling job status...")
        for _ in range(30):
            job = veo_service.get_job(job_id)
            print(f"Status: {job.status}")
            if job.status in ["ready", "error"]:
                print(f"Final Job: {job}")
                break
            await asyncio.sleep(5)
            
main_coro = main()
asyncio.run(main_coro)

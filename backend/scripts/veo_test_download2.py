import httpx
import os

api_key = os.environ.get("GEMINI_API_KEY", "AIzaSyAaODGy72VYwMwKS4RfeXe6lQr5-qzui2g")
uri = "https://generativelanguage.googleapis.com/v1beta/files/olug0b54ph2k:download?alt=media"

headers = {"x-goog-api-key": api_key}
with httpx.stream("GET", uri, headers=headers, follow_redirects=True) as response:
    print(response.status_code)
    if response.status_code == 200:
        with open("test_video.mp4", "wb") as f:
            for chunk in response.iter_bytes():
                f.write(chunk)
        print("Downloaded to test_video.mp4")

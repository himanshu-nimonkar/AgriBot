from typing import Optional, Tuple, Dict, Any
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

class GeocodingService:
    """Service to convert addresses to coordinates using OpenStreetMap (Nominatim)."""
    
    BASE_URL = "https://nominatim.openstreetmap.org/search"
    
    def __init__(self):
        self.headers = {
            "User-Agent": "AgriBot-University-Project/1.0 (agribot-dev@agribot.local)"
        }

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=3))
    async def geocode(self, address: str) -> Optional[Tuple[float, float, str]]:
        """
        Geocodes an address string to (lat, lon, display_name).
        Returns None if not found.
        """
        try:
            print(f"🌍 Geocoding: {address}")
            params = {
                "q": address,
                "format": "json",
                "limit": 1,
                "addressdetails": 1,
                # Bias towards Yolo/Sacramento area (roughly)
                "viewbox": "-122.5,38.2,-121.0,39.5",
                "bounded": 0 
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.BASE_URL, 
                    params=params, 
                    headers=self.headers,
                    timeout=4.0
                )
                response.raise_for_status()
                data = response.json()
                
                if not data:
                    return None
                    
                result = data[0]
                lat = float(result["lat"])
                lon = float(result["lon"])
                display_name = result["display_name"]
                
                print(f"📍 Resolved: {display_name} ({lat}, {lon})")
                return lat, lon, display_name
                
        except Exception as e:
            print(f"Geocoding error: {e}")
            # Fallback for demo address
            if "Shields Ave" in address:
                return 38.538, -121.761, "1 Shields Ave, Davis, CA 95616"
            return None

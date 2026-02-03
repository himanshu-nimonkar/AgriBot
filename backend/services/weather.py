"""
Weather Service - Open-Meteo API Integration
Fetches hyper-local weather data including advanced agricultural parameters.
FREE API - No authentication required.
"""

import httpx
from typing import Optional
from datetime import datetime, timedelta
from dataclasses import dataclass


@dataclass
class WeatherData:
    """Structured weather data for agricultural decisions."""
    timestamp: datetime
    latitude: float
    longitude: float
    
    # Current conditions
    temperature_c: float
    relative_humidity: float
    precipitation_mm: float
    wind_speed_kmh: float
    wind_direction: int
    
    # Agricultural-specific
    soil_moisture_0_7cm: float  # Volumetric water content
    soil_moisture_7_28cm: float # Root zone
    soil_moisture_28_100cm: float # Deep root zone
    reference_evapotranspiration: float  # ETo in mm
    
    # Risk factors
    spray_drift_risk: str  # low/medium/high based on wind
    fungal_risk: str  # Based on humidity/temp
    
    # Forecast (7 days)
    forecast: list


@dataclass
class ForecastDay:
    """Daily forecast data."""
    date: str
    temp_max: float
    temp_min: float
    precipitation_sum: float
    humidity_mean: float
    eto: float


class WeatherService:
    """Open-Meteo based weather service for agricultural applications."""
    
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def get_weather(
        self, 
        lat: float, 
        lon: float,
        include_forecast: bool = True
    ) -> WeatherData:
        """
        Fetch comprehensive weather data for agricultural decision-making.
        """
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": [
                "temperature_2m",
                "relative_humidity_2m", 
                "precipitation",
                "wind_speed_10m",
                "wind_direction_10m"
            ],
            "hourly": [
                "soil_moisture_0_to_7cm",
                "soil_moisture_7_to_28cm",
                "soil_moisture_28_to_100cm",
                "et0_fao_evapotranspiration"
            ],
            "daily": [
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "et0_fao_evapotranspiration"
            ],
            "timezone": "America/Los_Angeles",
            "forecast_days": 7 if include_forecast else 1
        }
        
        response = await self.client.get(self.BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()
        
        current = data.get("current", {})
        hourly = data.get("hourly", {})
        daily = data.get("daily", {})
        
        # Get current hour's agricultural data
        current_hour = datetime.now().hour
        
        def get_hourly_val(key, default=0.0):
            vals = hourly.get(key, [])
            if vals and len(vals) > current_hour:
                val = vals[current_hour]
                return val if val is not None else default
            return default
            
        soil_moisture_0_7 = get_hourly_val("soil_moisture_0_to_7cm", 0.3)
        soil_moisture_7_28 = get_hourly_val("soil_moisture_7_to_28cm", 0.3)
        soil_moisture_28_100 = get_hourly_val("soil_moisture_28_to_100cm", 0.35)
        eto = get_hourly_val("et0_fao_evapotranspiration", 0)
        
        # Calculate risk factors
        # Calculate risk factors (handle None values safely)
        wind_speed = current.get("wind_speed_10m")
        if wind_speed is None: wind_speed = 0.0
        
        humidity = current.get("relative_humidity_2m")
        if humidity is None: humidity = 50.0
        
        temp = current.get("temperature_2m")
        if temp is None: temp = 20.0
        
        spray_drift_risk = self._calculate_spray_drift_risk(wind_speed)
        fungal_risk = self._calculate_fungal_risk(humidity, temp)
        
        # Build forecast
        forecast = []
        if include_forecast and daily.get("time"):
            for i, date in enumerate(daily["time"]):
                forecast.append(ForecastDay(
                    date=date,
                    temp_max=daily.get("temperature_2m_max", [0])[i],
                    temp_min=daily.get("temperature_2m_min", [0])[i],
                    precipitation_sum=daily.get("precipitation_sum", [0])[i],
                    humidity_mean=65,  # Approximate from hourly if needed
                    eto=daily.get("et0_fao_evapotranspiration", [0])[i]
                ))
        
        return WeatherData(
            timestamp=datetime.now(),
            latitude=lat,
            longitude=lon,
            temperature_c=temp,
            relative_humidity=humidity,
            precipitation_mm=current.get("precipitation") or 0.0,
            wind_speed_kmh=wind_speed,
            wind_direction=current.get("wind_direction_10m", 0),
            soil_moisture_0_7cm=soil_moisture_0_7,
            soil_moisture_7_28cm=soil_moisture_7_28,
            soil_moisture_28_100cm=soil_moisture_28_100,
            reference_evapotranspiration=eto,
            spray_drift_risk=spray_drift_risk,
            fungal_risk=fungal_risk,
            forecast=forecast
        )
    
    def _calculate_spray_drift_risk(self, wind_speed: float) -> str:
        """Calculate spray drift risk based on wind speed."""
        if wind_speed > 15:
            return "high"
        elif wind_speed > 8:
            return "medium"
        return "low"
    
    def _calculate_fungal_risk(self, humidity: float, temp: float) -> str:
        """Calculate fungal disease risk based on humidity and temperature."""
        # Optimal conditions for most fungal pathogens: high humidity, moderate temp
        if humidity > 80 and 15 < temp < 30:
            return "high"
        elif humidity > 60 and 10 < temp < 35:
            return "medium"
        return "low"
    
    async def get_growing_degree_days(
        self, 
        lat: float, 
        lon: float,
        base_temp: float = 10.0,
        start_date: Optional[str] = None
    ) -> float:
        """
        Calculate Growing Degree Days (GDD) from a start date.
        
        Args:
            lat: Latitude
            lon: Longitude
            base_temp: Base temperature for GDD calculation (default 10°C)
            start_date: Start date (YYYY-MM-DD), defaults to Jan 1
            
        Returns:
            Accumulated GDD
        """
        if start_date is None:
            start_date = f"{datetime.now().year}-01-01"
        
        # Historical weather API endpoint
        historical_url = "https://archive-api.open-meteo.com/v1/archive"
        
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start_date,
            "end_date": datetime.now().strftime("%Y-%m-%d"),
            "daily": ["temperature_2m_max", "temperature_2m_min"],
            "timezone": "America/Los_Angeles"
        }
        
        try:
            response = await self.client.get(historical_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            daily = data.get("daily", {})
            t_max = daily.get("temperature_2m_max", [])
            t_min = daily.get("temperature_2m_min", [])
            
            gdd_total = 0.0
            for i in range(len(t_max)):
                if t_max[i] is not None and t_min[i] is not None:
                    avg_temp = (t_max[i] + t_min[i]) / 2
                    gdd = max(0, avg_temp - base_temp)
                    gdd_total += gdd
            
            return round(gdd_total, 1)
        except Exception as e:
            # Fallback estimate based on current date
            days_since_jan1 = (datetime.now() - datetime(datetime.now().year, 1, 1)).days
            return round(days_since_jan1 * 8.5, 1)  # Rough estimate for Yolo County
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Singleton instance
weather_service = WeatherService()


async def get_weather(lat: float, lon: float) -> WeatherData:
    """Convenience function to get weather data."""
    return await weather_service.get_weather(lat, lon)


async def get_gdd(lat: float, lon: float, base_temp: float = 10.0) -> float:
    """Convenience function to get GDD."""
    return await weather_service.get_growing_degree_days(lat, lon, base_temp)

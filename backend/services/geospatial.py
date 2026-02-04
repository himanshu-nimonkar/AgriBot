"""
Geospatial Service - Google Earth Engine Integration
Provides NDVI, NDWI, and anomaly detection for agricultural fields.
FREE for non-commercial use.
"""

import ee
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dataclasses import dataclass
import os
import sys

# Add parent directory to path for config import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings


@dataclass
class FieldAnalytics:
    """Satellite-derived field analytics."""
    latitude: float
    longitude: float
    analysis_date: str
    
    # Vegetation indices
    ndvi_current: float  # -1 to 1, higher = healthier vegetation
    ndvi_historical_avg: float  # 5-year average for this time
    ndvi_anomaly: float  # Current vs historical (positive = better than avg)
    
    # Water stress
    ndwi_current: float  # -1 to 1, higher = more water
    water_stress_level: str  # low/moderate/severe
    
    # Comparison
    county_avg_ndvi: float
    relative_performance: str  # above/at/below county average
    
    # Tile URLs for mapping
    ndvi_tile_url: Optional[str] = None
    ndwi_tile_url: Optional[str] = None
    tile_url: Optional[str] = None  # Generic tile URL for frontend


class GEEService:
    """Google Earth Engine service for agricultural satellite analysis."""
    
    # Yolo County bounding box
    YOLO_BOUNDS = {
        "west": -122.4,
        "east": -121.4,
        "south": 38.3,
        "north": 39.1
    }
    
    def __init__(self):
        self._initialized = False
        self._mock_mode = False
    
    def initialize(self):
        """Initialize Earth Engine with service account."""
        if self._initialized:
            return
        
        try:
            service_account_file = settings.gee_service_account_file
            
            if service_account_file and os.path.exists(service_account_file):
                # Load service account credentials
                with open(service_account_file) as f:
                    credentials_info = json.load(f)
                
                credentials = ee.ServiceAccountCredentials(
                    credentials_info.get("client_email"),
                    service_account_file
                )
                ee.Initialize(credentials)
                self._initialized = True
                print("[SUCCESS] Google Earth Engine initialized successfully")
            else:
                # If no file is found, DO NOT try interactive auth (it hangs the server)
                # Fallback to Mock Mode
                print(f"[WARNING] GEE Key not found at: {service_account_file}")
                print("[WARNING] Switching Geospatial Service to MOCK MODE.")
                self._mock_mode = True
                self._initialized = True
            
        except Exception as e:
            print(f"[WARNING] GEE initialization failed: {e}")
            print("[WARNING] Switching Geospatial Service to MOCK MODE.")
            self._mock_mode = True
            self._initialized = True

    def _get_point(self, lat: float, lon: float) -> ee.Geometry.Point:
        """Create a GEE point geometry."""
        if self._mock_mode: return None
        return ee.Geometry.Point([lon, lat])
    
    def _get_buffer(self, lat: float, lon: float, radius_m: int = 500) -> ee.Geometry:
        """Create a buffered area around a point for analysis."""
        if self._mock_mode: return None
        point = self._get_point(lat, lon)
        return point.buffer(radius_m)
    
    def _get_sentinel2_collection(
        self, 
        geometry: ee.Geometry,
        start_date: str,
        end_date: str,
        cloud_cover_max: int = 20
    ) -> ee.ImageCollection:
        """Get cloud-filtered Sentinel-2 imagery."""
        if self._mock_mode: return None
        return (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(geometry)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_cover_max))
        )
    
    def _calculate_ndvi(self, image: ee.Image) -> ee.Image:
        """Calculate NDVI from Sentinel-2 image."""
        if self._mock_mode: return None
        # Sentinel-2 bands: B8 = NIR, B4 = Red
        ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI")
        return ndvi
    
    def _calculate_ndwi(self, image: ee.Image) -> ee.Image:
        """Calculate NDWI (water index) from Sentinel-2 image."""
        if self._mock_mode: return None
        # Sentinel-2 bands: B3 = Green, B8 = NIR
        ndwi = image.normalizedDifference(["B3", "B8"]).rename("NDWI")
        return ndwi
    
    async def get_field_analytics(
        self, 
        lat: float, 
        lon: float,
        radius_m: int = 500
    ) -> FieldAnalytics:
        """
        Get comprehensive field analytics for a location.
        Runs in a thread to verify it doesn't block the event loop.
        """
        import asyncio
        return await asyncio.to_thread(self._get_field_analytics_sync, lat, lon, radius_m)

    def _get_field_analytics_sync(
        self, 
        lat: float, 
        lon: float,
        radius_m: int = 500
    ) -> FieldAnalytics:
        """
        Synchronous implementation of field analytics.
        """
        self.initialize()
        
        # Get tile URLs (or use mock/none)
        tile_url = self.get_ndvi_tile_url(lat, lon)
        ndwi_tile_url = self.get_ndwi_tile_url(lat, lon)
        
        if self._mock_mode:
            return FieldAnalytics(
                latitude=lat,
                longitude=lon,
                analysis_date=datetime.now().strftime("%Y-%m-%d"),
                ndvi_current=0.55,
                ndvi_historical_avg=0.52,
                ndvi_anomaly=0.03,
                ndwi_current=-0.05,
                water_stress_level="low",
                county_avg_ndvi=0.48,
                relative_performance="above",
                tile_url=None
            )
        
        area = self._get_buffer(lat, lon, radius_m)
        today = datetime.now()
        
        # Date ranges
        current_start = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        current_end = today.strftime("%Y-%m-%d")
        
        # Get current imagery
        current_collection = self._get_sentinel2_collection(
            area, current_start, current_end
        )
        
        # Calculate current NDVI/NDWI from most recent image
        try:
            current_image = current_collection.sort("system:time_start", False).first()
            
            ndvi_image = self._calculate_ndvi(current_image)
            ndwi_image = self._calculate_ndwi(current_image)
            
            # Get mean values for the area
            ndvi_stats = ndvi_image.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=area,
                scale=10,
                maxPixels=1e9
            ).getInfo()
            
            ndwi_stats = ndwi_image.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=area,
                scale=10,
                maxPixels=1e9
            ).getInfo()
            
            ndvi_current = ndvi_stats.get("NDVI", 0.5)
            ndwi_current = ndwi_stats.get("NDWI", 0.0)
        except Exception as e:
            print(f"Warning: Current imagery unavailable: {e}")
            ndvi_current = 0.5
            ndwi_current = 0.0
        
        # Calculate 5-year historical average for this time of year
        historical_ndvi_values = []
        for year_offset in range(1, 6):
            try:
                hist_year = today.year - year_offset
                hist_start = f"{hist_year}-{today.month:02d}-01"
                hist_end = f"{hist_year}-{today.month:02d}-28"
                
                hist_collection = self._get_sentinel2_collection(
                    area, hist_start, hist_end, cloud_cover_max=30
                )
                
                hist_image = hist_collection.median()
                hist_ndvi = self._calculate_ndvi(hist_image)
                
                stats = hist_ndvi.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=area,
                    scale=10,
                    maxPixels=1e9
                ).getInfo()
                
                if stats.get("NDVI") is not None:
                    historical_ndvi_values.append(stats["NDVI"])
            except:
                continue
        
        # Calculate overall stats
        ndvi_historical_avg = (
            sum(historical_ndvi_values) / len(historical_ndvi_values)
            if historical_ndvi_values else 0.55
        )
        
        # Calculate county average NDVI
        try:
            yolo_geometry = ee.Geometry.Rectangle([
                self.YOLO_BOUNDS["west"],
                self.YOLO_BOUNDS["south"],
                self.YOLO_BOUNDS["east"],
                self.YOLO_BOUNDS["north"]
            ])
            
            county_collection = self._get_sentinel2_collection(
                yolo_geometry, current_start, current_end, cloud_cover_max=30
            )
            county_image = county_collection.median()
            county_ndvi = self._calculate_ndvi(county_image)
            
            county_stats = county_ndvi.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=yolo_geometry,
                scale=100,
                maxPixels=1e9
            ).getInfo()
            
            county_avg_ndvi = county_stats.get("NDVI", 0.5)
        except:
            county_avg_ndvi = 0.5
        
        # Calculate anomalies and classifications
        ndvi_anomaly = ndvi_current - ndvi_historical_avg
        
        # Water stress classification
        if ndwi_current < -0.2:
            water_stress_level = "severe"
        elif ndwi_current < 0.0:
            water_stress_level = "moderate"
        else:
            water_stress_level = "low"
        
        # Relative performance
        if ndvi_current > county_avg_ndvi + 0.05:
            relative_performance = "above"
        elif ndvi_current < county_avg_ndvi - 0.05:
            relative_performance = "below"
        else:
            relative_performance = "at"
        
        return FieldAnalytics(
            latitude=lat,
            longitude=lon,
            analysis_date=today.strftime("%Y-%m-%d"),
            ndvi_current=round(ndvi_current, 3) if ndvi_current else 0.5,
            ndvi_historical_avg=round(ndvi_historical_avg, 3),
            ndvi_anomaly=round(ndvi_anomaly, 3) if ndvi_current else 0.0,
            ndwi_current=round(ndwi_current, 3) if ndwi_current else 0.0,
            water_stress_level=water_stress_level,
            county_avg_ndvi=round(county_avg_ndvi, 3),
            relative_performance=relative_performance,
            tile_url=tile_url,
            ndwi_tile_url=ndwi_tile_url
        )
    
    def get_ndvi_tile_url(self, lat: float, lon: float) -> Optional[str]:
        """
        Get a tile URL for rendering NDVI on a map.
        
        Returns:
            Tile URL template with {z}/{x}/{y}
        """
        self.initialize()
        
        try:
            today = datetime.now()
            start_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
            end_date = today.strftime("%Y-%m-%d")
            
            yolo_geometry = ee.Geometry.Rectangle([
                self.YOLO_BOUNDS["west"],
                self.YOLO_BOUNDS["south"],
                self.YOLO_BOUNDS["east"],
                self.YOLO_BOUNDS["north"]
            ])
            
            collection = self._get_sentinel2_collection(
                yolo_geometry, start_date, end_date
            )
            
            image = collection.median()
            ndvi = self._calculate_ndvi(image)
            
            # Visualization parameters
            vis_params = {
                "min": -0.2,
                "max": 0.8,
                "palette": ["red", "yellow", "green", "darkgreen"]
            }
            
            map_id = ndvi.getMapId(vis_params)
            return map_id["tile_fetcher"].url_format
        except Exception as e:
            print(f"Error getting tile URL: {e}")
            return None
    def get_ndwi_tile_url(self, lat: float, lon: float) -> Optional[str]:
        """
        Get a tile URL for rendering NDWI (Water Stress) on a map.
        """
        self.initialize()
        
        try:
            today = datetime.now()
            start_date = (today - timedelta(days=30)).strftime("%Y-%m-%d")
            end_date = today.strftime("%Y-%m-%d")
            
            yolo_geometry = ee.Geometry.Rectangle([
                self.YOLO_BOUNDS["west"],
                self.YOLO_BOUNDS["south"],
                self.YOLO_BOUNDS["east"],
                self.YOLO_BOUNDS["north"]
            ])
            
            collection = self._get_sentinel2_collection(
                yolo_geometry, start_date, end_date
            )
            
            image = collection.median()
            ndwi = self._calculate_ndwi(image)
            
            # Visualization parameters for Water Stress (Blue = Wet, Yellow/Red = Dry)
            vis_params = {
                "min": -0.5,
                "max": 0.5,
                "palette": ["red", "yellow", "cyan", "blue"]
            }
            
            map_id = ndwi.getMapId(vis_params)
            return map_id["tile_fetcher"].url_format
        except Exception as e:
            print(f"Error getting NDWI tile URL: {e}")
            return None

# Singleton instance
gee_service = GEEService()


async def get_field_analytics(lat: float, lon: float) -> FieldAnalytics:
    """Convenience function to get field analytics."""
    return await gee_service.get_field_analytics(lat, lon)

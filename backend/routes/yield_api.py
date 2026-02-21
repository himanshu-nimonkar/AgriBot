from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import random

router = APIRouter()

class YieldPredictRequest(BaseModel):
    crop_type: str
    ndvi: float
    avg_temp: float
    rainfall_mm: float
    soil_quality: str

class YieldPredictResponse(BaseModel):
    predicted_yield: float
    unit: str
    confidence: float
    growth_stage: str
    risk_factors: list[str]

@router.post("/predict", response_model=YieldPredictResponse)
async def predict_yield(request: YieldPredictRequest):
    """
    Mock integration for Yield Prediction.
    In a true production environment, would consult an ML model (e.g. random forest).
    """
    try:
        # Base yields (tons per acre) for Yolo County common crops
        base_yields = {
            "tomatoes": 45.0,  # Processing tomatoes
            "almonds": 1.2,    # Shelled weight
            "walnuts": 1.8,
            "sunflowers": 1.1,
            "rice": 4.1,
            "wheat": 3.0,
            "corn": 5.5,
            "alfalfa": 7.0
        }
        
        crop = request.crop_type.lower()
        base = base_yields.get(crop, 3.5)
        
        # Adjust via NDVI (healthy = multiplier > 1)
        # NDVI ranges from -1 to 1. Agricultural healthy is usually 0.5 - 0.8
        ndvi_factor = max(0.2, (request.ndvi / 0.7)) 
        
        # Adjust via Weather (too hot or too cold penalty)
        temp_factor = 1.0
        if request.avg_temp > 35: temp_factor = 0.85
        if request.avg_temp < 10: temp_factor = 0.90
        
        # Adjust via rainfall
        water_factor = 1.0
        if request.rainfall_mm < 50: water_factor = 0.90 # Drought stress
        elif request.rainfall_mm > 400: water_factor = 0.85 # Flood stress
        
        calculated_yield = base * ndvi_factor * temp_factor * water_factor
        
        # Add slight randomization to simulate live variance
        calculated_yield *= random.uniform(0.95, 1.05)
        
        risk_factors = []
        if water_factor < 1.0: risk_factors.append("Suboptimal moisture/rainfall recorded.")
        if temp_factor < 1.0: risk_factors.append("Extreme temperature stress detected.")
        if ndvi_factor < 0.9: risk_factors.append("Below-average vegetation density.")
        
        if not risk_factors:
            risk_factors.append("Optimal growing conditions.")
            
        return YieldPredictResponse(
            predicted_yield=round(calculated_yield, 2),
            unit="tons/acre",
            confidence=round(random.uniform(0.82, 0.95), 2),
            growth_stage="Vegetative / Late Season",
            risk_factors=risk_factors
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yield prediction failed: {str(e)}")

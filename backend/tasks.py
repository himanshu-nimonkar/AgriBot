
import logging
from .worker import celery_app
from .services.gee import gee_service  # Assuming gee_service can be imported and initialized
# Note: Service initialization might need care in a worker process

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, max_retries=3)
def task_fetch_satellite_data(self, lat, lon, start_date, end_date):
    """
    Background task to fetch satellite data using Google Earth Engine.
    """
    try:
        # We need to ensure gee_service is authenticated in this process
        # gee_service.authenticate() called in its __init__ usually
        
        # This is a synchronous blocking call in the worker
        data = gee_service.get_satellite_data(lat, lon, start_date, end_date)
        return data
    except Exception as e:
        logger.error(f"Satellite data fetch failed: {e}")
        raise self.retry(exc=e, countdown=60)

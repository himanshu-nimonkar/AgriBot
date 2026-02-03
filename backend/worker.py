
import os
from celery import Celery

# Get Redis URL from env or default to localhost for local testing if needed
# But for the "lightweight" mode without Redis, this might fail if initialized aggressively.
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "agribot",
    broker=redis_url,
    backend=redis_url
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Worker autoscaling
    worker_concurrency=2,
    worker_prefetch_multiplier=1,
)

@celery_app.task
def dummy_task(x, y):
    return x + y

# We will import heavy tasks here to register them
# from backend.tasks import fetch_satellite_data

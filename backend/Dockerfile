# Always-on backend for the phone line (referenced by docker-compose.yml).
# A laptop + quick tunnel cannot guarantee uptime; this image runs on Fly.io / Cloud Run / Render / EC2.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY data data

WORKDIR /app/backend
EXPOSE 8000
# --proxy-headers: trust the platform's X-Forwarded-* so the public https URL is detected correctly
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

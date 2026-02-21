"""
Field Vision Service - Veo 3.1 + Gemini Vision Integration
Analyzes aerial field images and generates AI timelapse videos of the land flourishing.
Falls back to mock mode if GEMINI_API_KEY is not set.
"""

import asyncio
import base64
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings

# ──────────────────────────────────────────────────────────────────
# Data models
# ──────────────────────────────────────────────────────────────────

@dataclass
class FieldAnalytics:
    """Analytics derived from the uploaded aerial image via Gemini Vision."""
    land_area_ha: float = 0.0          # estimated hectares
    water_need_l_per_day: float = 0.0  # litres / day / hectare
    profit_usd_per_ha: float = 0.0     # USD / hectare / season
    risk_score: int = 0                # 0-100 (100 = high risk)
    risk_label: str = "Unknown"        # Low / Moderate / High / Critical
    sustainability_score: int = 0      # 0-100 (100 = most sustainable)
    soil_type: str = "Unknown"
    dominant_vegetation: str = "None"
    recommended_crop: str = "N/A"
    veo_prompt: str = ""               # Rich prompt for Veo
    is_mock: bool = False
    notes: str = ""


@dataclass
class VeoJob:
    """Tracks an async Veo video-generation job."""
    job_id: str
    status: str = "generating"         # generating | ready | error
    video_url: Optional[str] = None
    video_path: Optional[str] = None
    analytics: Optional[FieldAnalytics] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)


# ──────────────────────────────────────────────────────────────────
# Mock data
# ──────────────────────────────────────────────────────────────────

MOCK_ANALYTICS = FieldAnalytics(
    land_area_ha=12.4,
    water_need_l_per_day=3800.0,
    profit_usd_per_ha=1240.0,
    risk_score=28,
    risk_label="Low",
    sustainability_score=74,
    soil_type="Sandy Loam",
    dominant_vegetation="Sparse Grass / Barren",
    recommended_crop="Wheat / Sorghum",
    veo_prompt=(
        "Cinematic aerial timelapse of a 12-hectare sandy-loam field in Yolo County, "
        "California. Time begins in early spring with bare rows of dark soil. "
        "Over the sequence wheat seedlings emerge, grow into tall golden stalks, "
        "irrigation channels glisten in the sunlight, and the field transforms into "
        "a lush, productive farmland. Drone shot slowly orbiting the field."
    ),
    is_mock=True,
    notes="Mock analytics — add GEMINI_API_KEY to .env for real analysis.",
)

# A royalty-free aerial farm time-lapse hosted on Pexels CDN
MOCK_VIDEO_URL = (
    "https://videos.pexels.com/video-files/852395/852395-hd_1280_720_25fps.mp4"
)


# ──────────────────────────────────────────────────────────────────
# Service class
# ──────────────────────────────────────────────────────────────────

class VeoService:
    """Orchestrates Gemini Vision analysis + Veo 3.1 video generation."""

    VIDEO_DIR = os.path.join(os.environ.get("TEMP", "/tmp"), "agribot_videos")

    def __init__(self):
        self._client = None
        self._jobs: Dict[str, VeoJob] = {}
        os.makedirs(self.VIDEO_DIR, exist_ok=True)

    # ── Initialisation ──────────────────────────────────────────

    def _get_client(self):
        """Lazily initialise the google-genai client."""
        if self._client is not None:
            return self._client
        api_key = settings.gemini_api_key
        if not api_key:
            return None
        try:
            from google import genai  # type: ignore
            self._client = genai.Client(api_key=api_key)
            print("[SUCCESS] Gemini/Veo client initialized")
            return self._client
        except ImportError:
            print("[WARNING] google-genai not installed — pip install google-genai")
            return None
        except Exception as exc:
            print(f"[WARNING] Gemini client init failed: {exc}")
            return None

    # ── Vision analysis (Gemini 2.5 Flash) ──────────────────────

    async def analyze_image(
        self,
        image_bytes: bytes,
        mime_type: str,
        crop_hint: str = "",
    ) -> FieldAnalytics:
        """Run Gemini Vision on the aerial image and extract structured analytics."""
        return await asyncio.to_thread(
            self._analyze_image_sync, image_bytes, mime_type, crop_hint
        )

    def _analyze_image_sync(
        self,
        image_bytes: bytes,
        mime_type: str,
        crop_hint: str = "",
    ) -> FieldAnalytics:
        client = self._get_client()
        if client is None:
            print("[INFO] VeoService: no Gemini key — returning mock analytics")
            return MOCK_ANALYTICS

        crop_context = f" The farmer intends to grow {crop_hint}." if crop_hint else ""

        prompt = f"""You are an expert agricultural AI. Analyze this aerial photograph of a field or land parcel.{crop_context}

Return ONLY a valid JSON object (no markdown, no explanation) with these exact keys:
{{
  "land_area_ha": <float, estimated hectares visible>,
  "water_need_l_per_day": <float, litres per day per hectare for optimal irrigation>,
  "profit_usd_per_ha": <float, estimated profit USD per hectare per season>,
  "risk_score": <integer 0-100, where 100 is extreme risk>,
  "risk_label": <string: "Low" | "Moderate" | "High" | "Critical">,
  "sustainability_score": <integer 0-100, where 100 is most sustainable>,
  "soil_type": <string, e.g. "Clay Loam">,
  "dominant_vegetation": <string, describe current vegetation>,
  "recommended_crop": <string, best crop for this land>,
  "veo_prompt": <string, a vivid 2-sentence Veo video prompt showing this land flourishing>,
  "notes": <string, 1 key observation for the farmer>
}}"""

        try:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore

            # Try a sequence of models to find one available and with quota
            # Prioritizing 'lite' for better availability and '2.5' or 'flash-latest'
            analysis_models = ["gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"]
            response = None
            last_analysis_error = None

            for model_name in analysis_models:
                try:
                    print(f"[INFO] Attempting analysis with model: {model_name}")
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[
                            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                            prompt,
                        ],
                    )
                    if response:
                        print(f"[SUCCESS] Image analyzed with model: {model_name}")
                        break
                except Exception as e:
                    print(f"[WARNING] Analysis with {model_name} failed: {e}")
                    last_analysis_error = e

            if not response:
                raise last_analysis_error or RuntimeError("All analysis models failed")

            raw = response.text.strip()
            # Strip any markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            return FieldAnalytics(
                land_area_ha=float(data.get("land_area_ha", 10.0)),
                water_need_l_per_day=float(data.get("water_need_l_per_day", 3500.0)),
                profit_usd_per_ha=float(data.get("profit_usd_per_ha", 1000.0)),
                risk_score=int(data.get("risk_score", 30)),
                risk_label=str(data.get("risk_label", "Moderate")),
                sustainability_score=int(data.get("sustainability_score", 65)),
                soil_type=str(data.get("soil_type", "Unknown")),
                dominant_vegetation=str(data.get("dominant_vegetation", "Unknown")),
                recommended_crop=str(data.get("recommended_crop", "N/A")),
                veo_prompt=str(data.get("veo_prompt", "")),
                notes=str(data.get("notes", "")),
                is_mock=False,
            )
        except Exception as exc:
            print(f"[WARNING] Gemini Vision analysis failed: {exc} — using mock")
            mock = MOCK_ANALYTICS
            mock.notes = f"Using mock data due to analysis error: {exc}"
            return mock

    # ── Veo 3.1 video generation ─────────────────────────────────

    async def generate_video(
        self,
        image_bytes: bytes,
        mime_type: str,
        analytics: FieldAnalytics,
    ) -> tuple[str, Optional[str]]:
        """
        Start Veo video generation. Returns (job_id, video_url_if_instant).
        Long jobs are stored in self._jobs and can be polled.
        """
        job_id = str(uuid.uuid4())
        job = VeoJob(job_id=job_id, analytics=analytics)
        self._jobs[job_id] = job

        client = self._get_client()
        if client is None:
            # Mock: return instantly
            job.status = "ready"
            job.video_url = MOCK_VIDEO_URL
            return job_id, MOCK_VIDEO_URL

        # Schedule video generation in the background
        asyncio.create_task(
            self._run_veo_job(job, client, image_bytes, mime_type, analytics)
        )
        return job_id, None

    async def _run_veo_job(
        self,
        job: VeoJob,
        client: Any,
        image_bytes: bytes,
        mime_type: str,
        analytics: FieldAnalytics,
    ) -> None:
        """Background task: run Veo, poll, save video."""
        try:
            await asyncio.to_thread(
                self._run_veo_sync, job, client, image_bytes, mime_type, analytics
            )
        except Exception as exc:
            print(f"[ERROR] Veo background job {job.job_id} failed: {exc}")
            job.status = "error"
            job.error = str(exc)
            job.video_url = MOCK_VIDEO_URL  # graceful fallback

    def _run_veo_sync(
        self,
        job: VeoJob,
        client: Any,
        image_bytes: bytes,
        mime_type: str,
        analytics: FieldAnalytics,
    ) -> None:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore

        prompt = analytics.veo_prompt or (
            "Cinematic aerial timelapse of a barren agricultural field transforming "
            "into a lush, thriving farmland over one growing season. Drone orbiting shot."
        )

        image_part = types.Image(image_bytes=image_bytes, mime_type=mime_type)

        # Try various Veo models available in the current environment
        veo_models = (
            "veo-3.1-generate-preview",
            "veo-3.0-generate-001",
            "veo-2.0-generate-001",
        )
        
        last_error = None
        for model_name in veo_models:
            try:
                print(f"[INFO] Attempting Veo job with model: {model_name}")
                operation = client.models.generate_videos(
                    model=model_name,
                    prompt=prompt,
                    image=image_part,
                    config=types.GenerateVideosConfig(
                        aspect_ratio="16:9",
                        duration_seconds=6,
                        number_of_videos=1,
                    ),
                )
                print(f"[SUCCESS] Veo job started with model {model_name}")
                break
            except Exception as exc:
                print(f"[WARNING] {model_name} failed: {exc}")
                last_error = str(exc)
                operation = None

        if operation is None:
            if "billing enabled" in (last_error or "").lower():
                print("[WARNING] Veo requires GCP billing. Falling back to mock video for this demo.")
                job.video_url = MOCK_VIDEO_URL
                job.status = "ready"
                job.notes = "Note: Real video generation requires GCP billing. Showing sample video."
                return
            raise RuntimeError(f"No Veo model available or all failed. Last error: {last_error}")

        # Poll until done (max 7 minutes)
        max_polls = 42
        for _ in range(max_polls):
            if operation.done:
                break
            print("[INFO] Veo: waiting 10s…")
            time.sleep(10)
            operation = client.operations.get(operation)

        if not operation.done or not operation.response:
            raise RuntimeError("Veo operation timed out")

        generated = operation.response.generated_videos
        if not generated:
            raise RuntimeError("Veo returned no videos")

        # Download video file
        video_file = generated[0].video
        client.files.download(file=video_file)

        out_path = os.path.join(self.VIDEO_DIR, f"{job.job_id}.mp4")
        video_file.save(out_path)

        job.video_path = out_path
        job.video_url = f"/api/field-vision/video/{job.job_id}"
        job.status = "ready"
        print(f"[SUCCESS] Veo video saved: {out_path}")

    # ── Job polling ───────────────────────────────────────────────

    def get_job(self, job_id: str) -> Optional[VeoJob]:
        return self._jobs.get(job_id)

    def get_video_path(self, job_id: str) -> Optional[str]:
        job = self._jobs.get(job_id)
        if job and job.video_path and os.path.exists(job.video_path):
            return job.video_path
        return None

    # ── Cleanup ───────────────────────────────────────────────────

    def cleanup_old_jobs(self, max_age_seconds: int = 172800) -> None:
        """Remove jobs older than max_age_seconds (default 48 h)."""
        now = time.time()
        expired = [
            jid for jid, job in self._jobs.items()
            if now - job.created_at > max_age_seconds
        ]
        for jid in expired:
            job = self._jobs.pop(jid)
            if job.video_path and os.path.exists(job.video_path):
                try:
                    os.remove(job.video_path)
                except OSError:
                    pass


# ── Singleton ─────────────────────────────────────────────────────
veo_service = VeoService()

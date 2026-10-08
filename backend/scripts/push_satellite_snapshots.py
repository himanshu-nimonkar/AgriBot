"""
Precompute Earth Engine satellite snapshots for every Yolo County town and publish them to Cloudflare KV.

Why: Earth Engine can't run inside a Worker, and a live computation takes seconds. Sentinel-2 only
revisits every ~5 days, so the voice/chat agent reads these snapshots from KV (~20 ms) instead.

    python backend/scripts/push_satellite_snapshots.py            # quick: current NDVI/NDWI per town (~1 min)
    python backend/scripts/push_satellite_snapshots.py --full     # + 5-year history & county comparison (~5 min)
    python backend/scripts/push_satellite_snapshots.py --dry-run  # compute, print, don't upload

Needs GEE_SERVICE_ACCOUNT_FILE (Earth Engine) and CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN /
CLOUDFLARE_KV_NAMESPACE_ID in .env. Run it daily (cron / GitHub Actions). It NEVER uploads demo numbers:
without Earth Engine credentials it uploads nothing and the agent simply says satellite data is unavailable.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / ".env")

from services.geospatial import gee_service  # noqa: E402

# Keep in sync with worker/src/brain/places.ts
PLACES = {
    "west-sacramento": (38.5805, -121.5302), "knights-landing": (38.8018, -121.7219),
    "woodland": (38.6785, -121.7733), "davis": (38.5449, -121.7405), "winters": (38.5249, -121.9708),
    "esparto": (38.6852, -122.0116), "capay": (38.7099, -122.0555), "madison": (38.6757, -121.9533),
    "dunnigan": (38.8863, -121.9706), "zamora": (38.8044, -121.8889), "yolo": (38.7321, -121.8066),
    "clarksburg": (38.4244, -121.5322), "guinda": (38.831, -122.2024), "rumsey": (38.8785, -122.2272),
    "dixon": (38.4455, -121.8233), "sacramento": (38.5816, -121.4944),
}

ACCOUNT = os.getenv("CLOUDFLARE_ACCOUNT_ID")
TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")
KV_ID = os.getenv("CLOUDFLARE_KV_NAMESPACE_ID")
TTL_SECONDS = 21 * 24 * 3600


def snapshot_for(lat: float, lon: float, full: bool):
    snap = gee_service._quick_snapshot_sync(lat, lon, 500)
    if not snap:
        return None
    out = {
        "ndvi": snap["ndvi"], "ndwi": snap["ndwi"], "ndmi": snap["ndmi"], "water_stress_level": snap["water_stress_level"],
        "image_date": snap.get("image_date"), "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    if full:
        a = gee_service._get_field_analytics_sync(lat, lon)
        if a and not a.is_mock:
            out.update({
                "ndvi_historical_avg": a.ndvi_historical_avg, "ndvi_anomaly": a.ndvi_anomaly,
                "county_avg_ndvi": a.county_avg_ndvi, "relative_performance": a.relative_performance,
            })
    return out


def main():
    full, dry = "--full" in sys.argv, "--dry-run" in sys.argv
    gee_service.initialize()
    if getattr(gee_service, "_mock_mode", False):
        print("[ERROR] Earth Engine is not configured (GEE_SERVICE_ACCOUNT_FILE). Nothing uploaded - "
              "the agent will report satellite data as unavailable rather than invent numbers.")
        sys.exit(1)
    if not dry and not (ACCOUNT and TOKEN and KV_ID):
        print("[ERROR] Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and CLOUDFLARE_KV_NAMESPACE_ID in .env")
        sys.exit(1)

    ok = failed = 0
    with httpx.Client(timeout=30, headers={"Authorization": f"Bearer {TOKEN}"}) as c:
        for slug, (lat, lon) in PLACES.items():
            snap = snapshot_for(lat, lon, full)
            if not snap:
                print(f"  - {slug}: no recent clear Sentinel-2 scene, skipped")
                failed += 1
                continue
            print(f"  - {slug}: NDVI {snap['ndvi']:.2f}  NDMI {snap['ndmi']:.2f}  stress={snap['water_stress_level']}  scene={snap['image_date']}")
            if not dry:
                url = (f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/storage/kv/namespaces/{KV_ID}"
                       f"/values/sat:{slug}?expiration_ttl={TTL_SECONDS}")
                r = c.put(url, content=json.dumps(snap), headers={"Content-Type": "text/plain"})
                if r.status_code != 200:
                    print(f"    upload failed: {r.status_code} {r.text[:200]}")
                    failed += 1
                    continue
            ok += 1
    print(f"\n[{'DRY RUN' if dry else 'DONE'}] {ok} snapshots {'computed' if dry else 'published'}, {failed} skipped/failed")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

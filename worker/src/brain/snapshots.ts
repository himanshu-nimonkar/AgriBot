import type { Env } from "../env";
import { PLACES, nearestPlace, placeBySlug } from "./places";
import { fetchWeather, type WeatherData } from "./weather";

export interface SatelliteSnapshot {
  ndvi: number;
  ndwi: number;
  /** Canopy moisture (NIR vs SWIR). Preferred over NDWI, which is strongly negative on healthy vegetation. */
  ndmi?: number;
  water_stress_level: "low" | "moderate" | "severe";
  image_date?: string;
  ndvi_historical_avg?: number;
  ndvi_anomaly?: number;
  county_avg_ndvi?: number;
  relative_performance?: string;
  computed_at: string;
}

const WX_MAX_AGE_MS = 75 * 60_000;
const SAT_MAX_AGE_DAYS = 21;

/** Warmed hourly by the cron trigger: weather for every gazetteer town is one KV read away. */
export async function warmWeather(env: Env): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  await Promise.all(
    PLACES.map(async (p) => {
      try {
        const data = await fetchWeather(p.lat, p.lon);
        await env.SNAPSHOTS.put(`wx:${p.slug}`, JSON.stringify({ at: Date.now(), data }), { expirationTtl: 3 * 3600 });
        ok++;
      } catch (e) {
        failed++;
        console.warn(`[warm] ${p.slug}: ${String(e).slice(0, 100)}`);
      }
    }),
  );
  return { ok, failed };
}

export async function kvWeather(env: Env, slug: string): Promise<WeatherData | null> {
  const v = await env.SNAPSHOTS.get<{ at: number; data: WeatherData }>(`wx:${slug}`, "json");
  return v && Date.now() - v.at < WX_MAX_AGE_MS ? v.data : null;
}

/** Satellite numbers are precomputed from Earth Engine (python script) - never invented here. */
export async function kvSatellite(env: Env, lat: number, lon: number): Promise<SatelliteSnapshot | null> {
  const place = nearestPlace(lat, lon);
  if (!place) return null;
  const v = await env.SNAPSHOTS.get<SatelliteSnapshot>(`sat:${place.slug}`, "json");
  if (!v) return null;
  const ageDays = (Date.now() - Date.parse(v.computed_at)) / 86_400_000;
  return ageDays <= SAT_MAX_AGE_DAYS ? v : null;
}

export const knownSlug = (slug: string) => !!placeBySlug(slug);

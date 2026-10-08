/**
 * Small dashboard endpoints (formerly in the Python backend) so the deployed app needs no laptop:
 * map telemetry, market trends, startup directory, yield estimate.
 */
import type { Env } from "./env";
import { TTLCache, within } from "./brain/cache";
import { getWeather } from "./brain/context";
import { kvSatellite } from "./brain/snapshots";
import startupsJson from "./data/startups.json";

interface Startup { name: string; city: string; focus: string; description: string; [k: string]: unknown }
const startups = startupsJson as Startup[];

const soilCache = new TTLCache<{ soil_type: string | null; soil_probabilities: unknown[] } | null>(64);
const elevCache = new TTLCache<number | null>(64);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

async function soil(lat: number, lon: number) {
  const r = await fetch(`https://rest.isric.org/soilgrids/v2.0/classification/query?lat=${lat}&lon=${lon}&number_classes=3`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const d: any = await r.json();
  return { soil_type: d.wrb_class_name ?? null, soil_probabilities: d.wrb_class_probability ?? [] };
}
async function elevation(lat: number, lon: number) {
  const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const d: any = await r.json();
  return d.elevation?.[0] != null ? Number(d.elevation[0]) : null;
}

export async function telemetry(env: Env, url: URL) {
  const lat = Number(url.searchParams.get("lat") ?? 38.5449), lon = Number(url.searchParams.get("lon") ?? -121.7405);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: "invalid coordinates" };
  const key = `${r3(lat)},${r3(lon)}`;
  const [weather, snap, soilData, elev] = await Promise.all([
    getWeather(env, lat, lon),
    kvSatellite(env, lat, lon),
    within(soilCache.ensure(key, 30 * 864e5, () => soil(lat, lon)), 7000),
    within(elevCache.ensure(key, 30 * 864e5, () => elevation(lat, lon)), 7000),
  ]);
  const satellite_data: Record<string, unknown> = {
    latitude: lat, longitude: lon, tile_url: null, ndwi_tile_url: null, ndvi_timeline: [],
    soil_type: soilData?.soil_type ?? null, soil_probabilities: soilData?.soil_probabilities ?? [], elevation_m: elev ?? null,
    // satellite numbers come only from the daily Earth Engine snapshot job; never invented
    satellite_available: !!snap,
  };
  if (snap) {
    Object.assign(satellite_data, {
      ndvi_current: snap.ndvi, ndwi_current: snap.ndwi, ndmi_current: snap.ndmi, water_stress_level: snap.water_stress_level, analysis_date: snap.image_date,
      ndvi_historical_avg: snap.ndvi_historical_avg, ndvi_anomaly: snap.ndvi_anomaly, county_avg_ndvi: snap.county_avg_ndvi, relative_performance: snap.relative_performance,
    });
  }
  return { lat, lon, weather_data: weather, satellite_data };
}

export function marketTrends() {
  const years = ["2020", "2021", "2022", "2023", "2024", "2025 (YTD)"];
  const bases: Record<string, number> = { "Almonds ($/lb)": 2.1, "Walnuts ($/lb)": 1.1, "Tomatoes ($/ton)": 85, "Rice ($/cwt)": 15, "Corn ($/bu)": 4, "Wheat ($/bu)": 5.5 };
  const curves: Record<string, number[]> = {
    "Almonds ($/lb)": [1, 0.85, 0.9, 0.75, 0.95, 0.93], "Walnuts ($/lb)": [1, 0.95, 0.7, 0.55, 0.5, 0.59],
    "Tomatoes ($/ton)": [1, 1.05, 1.25, 1.65, 1.6, 1.62], "Rice ($/cwt)": [1, 1.1, 1.15, 1.3, 1.25, 1.23],
    "Corn ($/bu)": [1, 1.2, 1.4, 1.3, 1.1, 1.12], "Wheat ($/bu)": [1, 1.3, 1.6, 1.4, 1.15, 1.1],
  };
  const data = years.map((year, i) => ({ year, ...Object.fromEntries(Object.entries(bases).map(([k, b]) => [k, Math.round(b * curves[k][i] * 100) / 100])) }));
  return { status: "success", data, source: "USDA AMS Historical Estimates (indicative)" };
}

export function startupList() {
  return { total: startups.length, startups };
}

export function startupRecommend(body: { query?: string; focus_filter?: string; city_filter?: string }) {
  const q = (body.query ?? "").toLowerCase();
  const results: (Startup & { match_score: number })[] = [];
  for (const s of startups) {
    if (body.focus_filter && body.focus_filter !== "All" && body.focus_filter.toLowerCase() !== s.focus.toLowerCase()) continue;
    if (body.city_filter && body.city_filter !== "All" && body.city_filter.toLowerCase() !== s.city.toLowerCase()) continue;
    let score = 0;
    if (q) {
      if (s.name.toLowerCase().includes(q)) score += 5;
      if (s.focus.toLowerCase().includes(q)) score += 3;
      if (s.description.toLowerCase().includes(q)) score += 2;
      for (const w of q.split(/\s+/)) if (w.length > 3 && s.description.toLowerCase().includes(w)) score += 1;
      if (!score) continue;
    } else score = 1;
    results.push({ ...s, match_score: score });
  }
  results.sort((a, b) => b.match_score - a.match_score);
  return { results: results.slice(0, 5) };
}

/** Transparent rule-based estimate (NDVI, heat and water factors) - not a trained model. */
export function yieldPredict(b: { crop_type: string; ndvi: number; avg_temp: number; rainfall_mm: number; soil_quality?: string }) {
  const base: Record<string, number> = { tomatoes: 45, almonds: 1.2, walnuts: 1.8, sunflowers: 1.1, rice: 4.1, wheat: 3, corn: 5.5, alfalfa: 7 };
  const b0 = base[(b.crop_type ?? "").toLowerCase()] ?? 3.5;
  const ndviF = Math.max(0.2, b.ndvi / 0.7);
  const tempF = b.avg_temp > 35 ? 0.85 : b.avg_temp < 10 ? 0.9 : 1;
  const waterF = b.rainfall_mm < 50 ? 0.9 : b.rainfall_mm > 400 ? 0.85 : 1;
  const risks: string[] = [];
  if (waterF < 1) risks.push("Suboptimal moisture/rainfall recorded.");
  if (tempF < 1) risks.push("Extreme temperature stress detected.");
  if (ndviF < 0.9) risks.push("Below-average vegetation density.");
  if (!risks.length) risks.push("Optimal growing conditions.");
  return {
    predicted_yield: Math.round(b0 * ndviF * tempF * waterF * 100) / 100,
    unit: "tons/acre",
    confidence: Math.round((0.9 - (waterF < 1 ? 0.04 : 0) - (tempF < 1 ? 0.04 : 0)) * 100) / 100,
    growth_stage: "Vegetative / Late Season",
    risk_factors: risks,
  };
}

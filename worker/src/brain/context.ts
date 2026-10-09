/**
 * Live-data layer: decides which sources a turn needs, starts them (shared with speculative
 * prefetch, so work is never duplicated) and renders them as compact, spoken-friendly text.
 */
import type { Env } from "../env";
import { TTLCache, within } from "./cache";
import { lookupChemicals, lookupStartups, marketFor } from "./data";
import type { TurnIntent } from "./intent";
import { nearestPlace } from "./places";
import { friendlySource, ragCache, searchKnowledge, type Passage } from "./rag";
import { kvSatellite, kvWeather, type SatelliteSnapshot } from "./snapshots";
import { cToF, kmhToMph, mmToIn, pct } from "./units";
import { fetchGdd, fetchWeather, type WeatherData } from "./weather";

export const CONTEXT_BUDGET_MS = 1600;
const WEATHER_TTL = 15 * 60_000;
const GDD_TTL = 12 * 3600_000;
const RAG_TTL = 3600_000;

const weatherCache = new TTLCache<WeatherData>(64);
const gddCache = new TTLCache<number | null>(32);
const satCache = new TTLCache<SatelliteSnapshot | null>(64);

export interface ContextPlan {
  lat: number;
  lon: number;
  label: string;
  locationKnown: boolean;
  crop?: string;
  topics: TurnIntent["topics"];
  ragQuery?: string;
  needWeather: boolean;
  needSatellite: boolean;
  needRag: boolean;
  needGdd: boolean;
}

export function buildRagQuery(text: string, crop: string | undefined, prevUser?: string): string {
  let q = text;
  if (q.split(/\s+/).length <= 5 && prevUser) q = `${prevUser} ${q}`; // short follow-ups carry no meaning alone
  if (crop && !q.toLowerCase().includes(crop)) q = `${crop} ${q}`;
  return q.trim().slice(0, 300);
}

export function planContext(
  intent: TurnIntent,
  loc: { lat: number; lon: number; label: string; known: boolean },
  crop: string | undefined,
  prevUser?: string,
): ContextPlan {
  const t = intent.topics;
  const has = (...names: string[]) => names.some((n) => (t as Set<string>).has(n));
  return {
    lat: loc.lat, lon: loc.lon, label: loc.label, locationKnown: loc.known, crop, topics: t,
    ragQuery: t.size ? buildRagQuery(intent.text, crop, prevUser) : undefined,
    needWeather: has("weather", "irrigation", "pest", "timing", "general", "satellite"),
    needSatellite: has("satellite", "irrigation"),
    needRag: has("pest", "irrigation", "timing", "general", "satellite"),
    needGdd: has("timing"),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const wxKey = (p: ContextPlan) => `${r2(p.lat)},${r2(p.lon)}`;
const ragKey = (p: ContextPlan) => `${(p.ragQuery ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ")}|${p.crop ?? ""}`;

export interface Fetches {
  weather?: WeatherData | Promise<WeatherData | null>;
  satellite?: SatelliteSnapshot | null | Promise<SatelliteSnapshot | null>;
  rag?: Passage[] | Promise<Passage[] | null>;
  gdd?: number | null | Promise<number | null>;
}

export function startFetches(env: Env, p: ContextPlan): Fetches {
  const out: Fetches = {};
  if (p.needWeather) {
    out.weather = weatherCache.ensure(wxKey(p), WEATHER_TTL, async () => {
      const place = nearestPlace(p.lat, p.lon, 3); // gazetteer towns are warmed in KV by the cron trigger
      const warm = place ? await kvWeather(env, place.slug) : null;
      return warm ?? (await fetchWeather(p.lat, p.lon));
    });
  }
  if (p.needSatellite) {
    out.satellite = satCache.ensure(`${r2(p.lat)},${r2(p.lon)}`, 30 * 60_000, () => kvSatellite(env, p.lat, p.lon));
  }
  if (p.needRag && p.ragQuery) {
    out.rag = ragCache.ensure(ragKey(p), RAG_TTL, () => searchKnowledge(env, p.ragQuery!, p.crop, 3));
  }
  if (p.needGdd) {
    out.gdd = gddCache.ensure(`${r2(p.lat)},${r2(p.lon)},${new Date().toISOString().slice(0, 10)}`, GDD_TTL, () => fetchGdd(p.lat, p.lon));
  }
  return out;
}

// ---------------------------------------------------------------- rendering
export function formatWeather(w: WeatherData, label: string): string {
  const lines = [
    `WEATHER at ${label} right now: ${cToF(w.temperature_c).toFixed(0)}F, humidity ${w.relative_humidity.toFixed(0)}%, ` +
      `wind ${kmhToMph(w.wind_speed_kmh).toFixed(0)} mph (spray drift risk ${w.spray_drift_risk}), ` +
      `rain right now ${mmToIn(w.precipitation_mm).toFixed(2)} in, fungal disease risk ${w.fungal_risk}.`,
    `SOIL moisture: ${pct(w.soil_moisture_0_7cm)} topsoil, ${pct(w.soil_moisture_7_28cm)} mid-depth, ${pct(w.soil_moisture_28_100cm)} deep root zone (volumetric).`,
  ];
  const days: string[] = [];
  let totalRain = 0;
  for (const d of w.forecast.slice(0, 7)) {
    const rain = mmToIn(d.precipitation_sum ?? 0);
    totalRain += rain;
    if (days.length < 5 && d.temp_max != null && d.temp_min != null) {
      const day = new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      const wind = d.wind_max_kmh != null ? `, wind up to ${kmhToMph(d.wind_max_kmh).toFixed(0)} mph` : "";
      const chance = d.rain_chance_pct != null ? ` (${d.rain_chance_pct}% chance)` : "";
      days.push(`${day}: high ${cToF(d.temp_max).toFixed(0)}F, low ${cToF(d.temp_min).toFixed(0)}F, rain ${rain.toFixed(2)} in${chance}${wind}, ET ${mmToIn(d.eto ?? 0).toFixed(2)} in/day`);
    }
  }
  if (days.length) lines.push(`FORECAST: ${days.join("; ")}. Total rain next 7 days: ${totalRain.toFixed(2)} in.`);
  return lines.join("\n");
}

const ndviBand = (v: number) =>
  v >= 0.6 ? "dense, healthy green canopy" : v >= 0.4 ? "moderate green cover" : v >= 0.2 ? "sparse or stressed vegetation (or early/late season)" : "bare soil or very sparse vegetation";

export function formatSatellite(s: SatelliteSnapshot, moistureFirst = false): string {
  let extra = "";
  if (s.ndvi_historical_avg != null && s.ndvi_anomaly != null) {
    extra =
      ` Vegetation index: same time in the last 5 years averaged ${s.ndvi_historical_avg.toFixed(2)} (${s.ndvi_anomaly >= 0 ? "+" : ""}${s.ndvi_anomaly.toFixed(2)} vs normal)` +
      (s.county_avg_ndvi != null ? `; county average is ${s.county_avg_ndvi.toFixed(2)}, so this area is ${s.relative_performance ?? "near"} the county average.` : ".");
  }
  const veg = `vegetation health index ${s.ndvi.toFixed(2)} = ${ndviBand(s.ndvi)}`;
  const moist = s.ndmi != null
    ? `canopy moisture ("water") index ${s.ndmi.toFixed(2)} (above 0.2 = well watered, 0 to 0.2 = drying, below 0 = dry or bare ground), moisture-stress signal ${s.water_stress_level}`
    : `moisture-stress signal ${s.water_stress_level}`;
  return (
    `SATELLITE (Sentinel-2 imagery analysed with Google Earth Engine${s.image_date ? `, scene from ${s.image_date}` : ""}): ` +
    (moistureFirst ? `${moist}; ${veg}.` : `${veg}; ${moist}.`) +
    `${extra} (Processed daily from the latest satellite pass; only the latest reading is kept, no day-by-day history.) Crop stage matters: bare, harvested or dormant fields read dry even when nothing is wrong.`
  );
}

export function formatRag(passages: Passage[] | null | undefined): { text: string; sources: string[] } {
  const good = (passages ?? []).slice(0, 3);
  if (!good.length) return { text: "", sources: [] };
  return {
    text: "RESEARCH PASSAGES (UC guidelines):\n" + good.map((p) => `- [${friendlySource(p.source)}] ${p.text.replace(/\s+/g, " ").slice(0, 380)}`).join("\n"),
    sources: good.map((p) => p.source),
  };
}

export interface GatheredContext {
  text: string;
  used: string[];
  missing: string[];
  weather?: WeatherData;
  satellite?: SatelliteSnapshot;
  ragSources: string[];
  elapsedMs: number;
}

export async function gatherContext(env: Env, plan: ContextPlan, intent: TurnIntent, budgetMs = CONTEXT_BUDGET_MS): Promise<GatheredContext> {
  const t0 = Date.now();
  const f = startFetches(env, plan);
  // every source gets the same wall-clock budget, concurrently
  const [weather, satellite, rag, gdd] = await Promise.all([
    within(f.weather, budgetMs), within(f.satellite, budgetMs), within(f.rag, budgetMs), within(f.gdd, budgetMs),
  ]);
  const out: GatheredContext = { text: "", used: [], missing: [], ragSources: [], elapsedMs: 0 };
  const sections: string[] = [];

  if (plan.needWeather) {
    if (weather) (out.weather = weather), sections.push(formatWeather(weather, plan.label)), out.used.push("weather");
    else out.missing.push("weather"), sections.push("WEATHER: unavailable right now.");
  }
  if (plan.needSatellite) {
    if (satellite) (out.satellite = satellite), sections.push(formatSatellite(satellite, /water|moisture|dry|drought|irrigat/i.test(intent.text))), out.used.push("satellite");
    else out.missing.push("satellite"), sections.push("SATELLITE: no recent snapshot for this area (do not quote any field-health numbers).");
  }
  if (plan.needRag) {
    const r = formatRag(rag);
    if (r.text) sections.push(r.text), (out.ragSources = r.sources), out.used.push("research");
    else out.missing.push("research"), sections.push("RESEARCH: no matching UC passage found; use general knowledge and say so if unsure.");
  }
  if (plan.needGdd && gdd != null) sections.push(`GROWING DEGREE DAYS since Jan 1 (base 50F): about ${(gdd * 1.8).toFixed(0)}.`), out.used.push("gdd");

  if (intent.topics.has("market")) {
    const m = marketFor(plan.crop);
    sections.push(m
      ? `MARKET (indicative baseline, advisory only - not a live quote): ${m.name} about $${m.price} per ${m.unit}, trend ${m.trend}.`
      : "MARKET: no price data for that commodity.");
    if (m) out.used.push("market");
  }
  if (intent.topics.has("pest")) {
    const chems = lookupChemicals(intent.text, plan.crop);
    if (chems.length) {
      sections.push("PRODUCT LABELS: " + chems.map((c) => `${c.product_name} (${c.active_ingredient}), rate ${c.rate}, REI ${c.rei}, PHI ${c.phi ?? "see label"}, note: ${c.notes ?? ""}`).join(" | "));
      out.used.push("labels");
    }
  }
  if (intent.topics.has("startups")) {
    const ups = lookupStartups(intent.text);
    if (ups.length) {
      sections.push("LOCAL AG COMPANIES: " + ups.map((s) => `${s.name} in ${s.city} (${s.focus}): ${s.description.slice(0, 140)}`).join(" | "));
      out.used.push("startups");
    }
  }
  out.text = sections.filter(Boolean).join("\n");
  out.elapsedMs = Date.now() - t0;
  return out;
}

/** Shared weather lookup (memory cache -> hourly-warmed KV -> live Open-Meteo). */
export async function getWeather(env: Env, lat: number, lon: number): Promise<WeatherData | null> {
  const key = `${r2(lat)},${r2(lon)}`;
  return within(
    weatherCache.ensure(key, WEATHER_TTL, async () => {
      const place = nearestPlace(lat, lon, 3);
      const warm = place ? await kvWeather(env, place.slug) : null;
      return warm ?? (await fetchWeather(lat, lon));
    }),
    8000,
  );
}

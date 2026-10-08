import { nowPacific } from "./units";

export interface ForecastDay {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  precipitation_sum: number | null;
  humidity_mean: number;
  eto: number | null;
  wind_max_kmh?: number | null;
  rain_chance_pct?: number | null;
}

/** Same field names as the Python service so the existing dashboard widgets keep working. */
export interface WeatherData {
  timestamp: string;
  latitude: number;
  longitude: number;
  temperature_c: number;
  relative_humidity: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  wind_direction: number;
  soil_moisture_0_7cm: number;
  soil_moisture_7_28cm: number;
  soil_moisture_28_100cm: number;
  reference_evapotranspiration: number;
  spray_drift_risk: "low" | "medium" | "high";
  fungal_risk: "low" | "medium" | "high";
  forecast: ForecastDay[];
}

const sprayRisk = (wind: number) => (wind > 15 ? "high" : wind > 8 ? "medium" : "low");
const fungalRisk = (h: number, t: number) =>
  h > 80 && t > 15 && t < 30 ? "high" : h > 60 && t > 10 && t < 35 ? "medium" : "low";

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherData> {
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m",
    hourly: "soil_moisture_0_to_7cm,soil_moisture_7_to_28cm,soil_moisture_28_to_100cm,et0_fao_evapotranspiration",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max,precipitation_probability_max",
    timezone: "America/Los_Angeles",
    forecast_days: "7",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const d: any = await r.json();
  const cur = d.current ?? {}, hourly = d.hourly ?? {}, daily = d.daily ?? {};

  // hourly arrays start at local midnight; match the current hour by timestamp (not server clock)
  const hourKey = typeof cur.time === "string" ? cur.time.slice(0, 13) : `${nowPacific().iso}T${String(nowPacific().hour).padStart(2, "0")}`;
  let idx = (hourly.time ?? []).findIndex((t: string) => t.startsWith(hourKey));
  if (idx < 0) idx = nowPacific().hour;
  const hv = (k: string, dflt: number) => {
    const v = hourly[k]?.[idx];
    return v == null ? dflt : v;
  };

  const wind = cur.wind_speed_10m ?? 0, hum = cur.relative_humidity_2m ?? 50, temp = cur.temperature_2m ?? 20;
  const forecast: ForecastDay[] = (daily.time ?? []).map((date: string, i: number) => ({
    date,
    temp_max: daily.temperature_2m_max?.[i] ?? null,
    temp_min: daily.temperature_2m_min?.[i] ?? null,
    precipitation_sum: daily.precipitation_sum?.[i] ?? null,
    humidity_mean: 65,
    eto: daily.et0_fao_evapotranspiration?.[i] ?? null,
    wind_max_kmh: daily.wind_speed_10m_max?.[i] ?? null,
    rain_chance_pct: daily.precipitation_probability_max?.[i] ?? null,
  }));
  return {
    timestamp: new Date().toISOString(),
    latitude: lat,
    longitude: lon,
    temperature_c: temp,
    relative_humidity: hum,
    precipitation_mm: cur.precipitation ?? 0,
    wind_speed_kmh: wind,
    wind_direction: cur.wind_direction_10m ?? 0,
    soil_moisture_0_7cm: hv("soil_moisture_0_to_7cm", 0.3),
    soil_moisture_7_28cm: hv("soil_moisture_7_to_28cm", 0.3),
    soil_moisture_28_100cm: hv("soil_moisture_28_to_100cm", 0.35),
    reference_evapotranspiration: hv("et0_fao_evapotranspiration", 0),
    spray_drift_risk: sprayRisk(wind),
    fungal_risk: fungalRisk(hum, temp),
    forecast,
  };
}

/** Growing degree days since Jan 1 (base 10C), in C-days. Returns null when the archive is unavailable. */
export async function fetchGdd(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const today = nowPacific().iso;
  const p = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${today.slice(0, 4)}-01-01`,
    end_date: today,
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "America/Los_Angeles",
  });
  const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${p}`, { signal });
  if (!r.ok) return null;
  const d: any = await r.json();
  const hi: (number | null)[] = d.daily?.temperature_2m_max ?? [], lo: (number | null)[] = d.daily?.temperature_2m_min ?? [];
  let total = 0;
  for (let i = 0; i < hi.length; i++) if (hi[i] != null && lo[i] != null) total += Math.max(0, (hi[i]! + lo[i]!) / 2 - 10);
  return Math.round(total * 10) / 10;
}

export interface Place {
  slug: string;
  label: string;
  lat: number;
  lon: number;
}

// Hard-coded so the common case needs no geocoding network hop.
export const PLACES: Place[] = [
  { slug: "west-sacramento", label: "West Sacramento", lat: 38.5805, lon: -121.5302 },
  { slug: "knights-landing", label: "Knights Landing", lat: 38.8018, lon: -121.7219 },
  { slug: "woodland", label: "Woodland", lat: 38.6785, lon: -121.7733 },
  { slug: "davis", label: "Davis", lat: 38.5449, lon: -121.7405 },
  { slug: "winters", label: "Winters", lat: 38.5249, lon: -121.9708 },
  { slug: "esparto", label: "Esparto", lat: 38.6852, lon: -122.0116 },
  { slug: "capay", label: "Capay Valley", lat: 38.7099, lon: -122.0555 },
  { slug: "madison", label: "Madison", lat: 38.6757, lon: -121.9533 },
  { slug: "dunnigan", label: "Dunnigan", lat: 38.8863, lon: -121.9706 },
  { slug: "zamora", label: "Zamora", lat: 38.8044, lon: -121.8889 },
  { slug: "yolo", label: "Yolo", lat: 38.7321, lon: -121.8066 },
  { slug: "clarksburg", label: "Clarksburg", lat: 38.4244, lon: -121.5322 },
  { slug: "guinda", label: "Guinda", lat: 38.831, lon: -122.2024 },
  { slug: "rumsey", label: "Rumsey", lat: 38.8785, lon: -122.2272 },
  { slug: "dixon", label: "Dixon", lat: 38.4455, lon: -121.8233 },
  { slug: "sacramento", label: "Sacramento", lat: 38.5816, lon: -121.4944 },
];

export const YOLO_CENTER = { lat: 38.7646, lon: -121.9018, label: "Yolo County" };

const bySlug = new Map(PLACES.map((p) => [p.slug, p]));
export const placeBySlug = (slug: string) => bySlug.get(slug);

// "west sacramento" must win over "sacramento"
const PLACE_RE = new RegExp(
  "\\b(" +
    [...PLACES]
      .sort((a, b) => b.label.length - a.label.length)
      .map((p) => (p.slug === "capay" ? "capay" : p.label.toLowerCase()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")\\b",
  "i",
);

export function findPlace(text: string): Place | undefined {
  const m = PLACE_RE.exec(text);
  if (!m) return undefined;
  const w = m[1].toLowerCase();
  return PLACES.find((p) => (p.slug === "capay" ? "capay" : p.label.toLowerCase()) === w);
}

const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Nearest gazetteer town within `maxKm` (used to map any coordinate onto warmed KV snapshots). */
export function nearestPlace(lat: number, lon: number, maxKm = 12): Place | undefined {
  let best: Place | undefined, bestD = Infinity;
  for (const p of PLACES) {
    const d = distanceKm(lat, lon, p.lat, p.lon);
    if (d < bestD) (best = p), (bestD = d);
  }
  return bestD <= maxKm ? best : undefined;
}

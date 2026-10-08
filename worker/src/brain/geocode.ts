/** Nominatim (OpenStreetMap) - free, used only for street addresses not in the town gazetteer. */
export async function geocode(address: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; label: string } | null> {
  const p = new URLSearchParams({
    q: `${address}, Yolo County, CA`,
    format: "json",
    limit: "1",
    viewbox: "-122.5,38.2,-121.0,39.5",
    bounded: "0",
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { "User-Agent": "AgriBot-University-Project/2.0 (agribot-dev@agribot.local)" },
    signal,
  });
  if (!r.ok) return null;
  const d: any[] = await r.json();
  if (!d.length) return null;
  return { lat: Number(d[0].lat), lon: Number(d[0].lon), label: address };
}

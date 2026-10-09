import { describe, expect, it } from "vitest";
import { parseUtterance } from "../src/brain/intent";
import { findPlace, nearestPlace } from "../src/brain/places";
import { cleanForSpeech, SentenceStreamer } from "../src/brain/speech";
import { sseTokens } from "../src/brain/llm";
import { formatRag, formatSatellite, formatWeather, planContext } from "../src/brain/context";
import { TTLCache, within } from "../src/brain/cache";
import { modeFor } from "../src/voice/policy";
import type { WeatherData } from "../src/brain/weather";

describe("speech cleanup", () => {
  it("makes text speakable", () => {
    expect(cleanForSpeech("It's **78°F** with 9 mph wind [Source: pmgalmond.pdf].")).toBe("It's 78 degrees with 9 miles per hour wind .");
    expect(cleanForSpeech("NDVI is 0.6")).toContain("vegetation health index");
  });
  it("repairs words glued to digits by the model, but leaves chemistry alone", () => {
    expect(cleanForSpeech("for the next7 days")).toBe("for the next 7 days");
    expect(cleanForSpeech("Vitamin B12 and H2O and 2,4-D")).toBe("Vitamin B12 and H2O and 2,4-D");
  });
  it("splits sentences, keeps decimals", () => {
    const s = new SentenceStreamer();
    const out: string[] = [];
    for (const t of ["It", " rained", " 0.5", " inches", ".", " Water", " early", " tomorrow", ".", " Okay"]) out.push(...s.feed(t));
    out.push(...s.finish(false));
    expect(out).toEqual(["It rained 0.5 inches. ", "Water early tomorrow. ", "Okay. "]);
  });
  it("handles brackets split across tokens and drops a truncated fragment", () => {
    const s = new SentenceStreamer();
    const out: string[] = [];
    for (const t of ["Good", " news", ". ", "See", " [Sour", "ce: x.pdf", "] here", ". ", "And then the mod"]) out.push(...s.feed(t));
    out.push(...s.finish(true));
    expect(out).toEqual(["Good news. ", "See here. "]);
  });
  it("flushes the first chunk at a comma", () => {
    const out = new SentenceStreamer(40).feed("Right now in Davis it is ninety degrees outside, and the wind is calm");
    expect(out[0]).toMatch(/^Right now in Davis/);
  });
});

describe("instant utterance understanding", () => {
  it("extracts crop, place and topics", () => {
    const i = parseUtterance("Will it rain on my almonds in Esparto tomorrow?");
    expect(i.crop).toBe("almonds");
    expect(i.place?.label).toBe("Esparto");
    expect(i.topics.has("weather")).toBe(true);
    expect(i.smalltalk).toBe(false);
  });
  it("recognises satellite questions phrased the way farmers phrase them", () => {
    for (const q of ["what is the water index live from the Google Earth Engine", "check the moisture index from space", "what does earth engine say about my field"])
      expect(parseUtterance(q).topics.has("satellite")).toBe(true);
  });
  it("detects small talk and bare follow-ups", () => {
    expect(parseUtterance("thanks, bye").smalltalk).toBe(true);
    expect([...parseUtterance("what about walnuts?").topics]).toEqual(["general"]);
    expect(parseUtterance("how's my field looking on satellite").topics.has("satellite")).toBe(true);
    expect(parseUtterance("my field is at county road 98").address?.toLowerCase()).toBe("county road 98");
  });
  it("prefers west sacramento over sacramento", () => {
    expect(findPlace("weather in west sacramento")?.label).toBe("West Sacramento");
    expect(nearestPlace(38.55, -121.74)?.slug).toBe("davis");
    expect(nearestPlace(40.0, -100.0)).toBeUndefined();
  });
});

describe("planning and rendering", () => {
  const loc = { lat: 38.5, lon: -121.7, label: "Davis", known: true };
  it("only asks for satellite when the question is about the field", () => {
    expect(planContext(parseUtterance("will it rain tomorrow"), loc, undefined).needSatellite).toBe(false);
    expect(planContext(parseUtterance("how is my field on satellite"), loc, undefined).needSatellite).toBe(true);
    expect(planContext(parseUtterance("what is the price of almonds"), loc, "almonds").needWeather).toBe(false);
  });
  const wx: WeatherData = {
    timestamp: "", latitude: 38.5, longitude: -121.7, temperature_c: 30, relative_humidity: 40, precipitation_mm: 0, wind_speed_kmh: 14,
    wind_direction: 200, soil_moisture_0_7cm: 0.21, soil_moisture_7_28cm: 0.25, soil_moisture_28_100cm: 0.3, reference_evapotranspiration: 0.3,
    spray_drift_risk: "medium", fungal_risk: "low",
    forecast: [{ date: "2026-10-06", temp_max: 35, temp_min: 18, precipitation_sum: 0, humidity_mean: 50, eto: 6, wind_max_kmh: 20, rain_chance_pct: 10 }],
  };
  it("renders weather in imperial units", () => {
    const t = formatWeather(wx, "Davis");
    expect(t).toContain("86F");
    expect(t).toContain("wind 9 mph");
    expect(t).toContain("high 95F");
    expect(t).toContain("(10% chance), wind up to 12 mph");
  });
  it("renders satellite with interpretation and never invents history", () => {
    const t = formatSatellite({ ndvi: 0.65, ndwi: -0.1, water_stress_level: "moderate", image_date: "2026-10-02", computed_at: "2026-10-03" });
    expect(t).toContain("dense, healthy green canopy");
    expect(t).not.toContain("last 5 years");
    const m = formatSatellite({ ndvi: 0.39, ndwi: -0.43, ndmi: 0.12, water_stress_level: "moderate", computed_at: "2026-10-03" });
    expect(m).toContain("canopy moisture (\"water\") index 0.12");
    expect(m).toContain("Google Earth Engine");
    expect(m).not.toContain("water index");               // never present NDWI as a stress reading
  });
  it("renders research with friendly source names", () => {
    const r = formatRag([{ text: "Irrigate at 60% depletion.", source: "tomato-checklist.pdf", score: 0.8 }]);
    expect(r.text).toContain("[tomato checklist]");
    expect(formatRag([]).text).toBe("");
  });
});

describe("infrastructure", () => {
  it("parses Workers AI SSE streams", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"response":"Hel'));      // frame split across chunks
        c.enqueue(enc.encode('lo"}\n\ndata: {"response":" world"}\n\n'));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const t of sseTokens(body)) out.push(t);
    expect(out.join("")).toBe("Hello world");
  });
  it("de-duplicates in-flight work and honours deadlines", async () => {
    const c = new TTLCache<number>();
    let calls = 0;
    const slow = () => new Promise<number>((r) => setTimeout(() => (calls++, r(7)), 60));
    const a = c.ensure("k", 1000, slow), b = c.ensure("k", 1000, slow);
    expect(await within(a, 5)).toBeNull();            // missed the deadline...
    expect(await b).toBe(7);                          // ...but the shared work finished
    expect(c.get("k")).toBe(7);
    expect(calls).toBe(1);
  });
  it("degrades voice quality as the free budget is consumed", () => {
    expect(modeFor(0.1)).toEqual({ mode: "aura", brevity: "normal" });
    expect(modeFor(0.6)).toEqual({ mode: "aura", brevity: "tight" });
    expect(modeFor(0.85).mode).toBe("melo");
    expect(modeFor(0.95).mode).toBe("off");
  });
});

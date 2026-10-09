import type { GatheredContext } from "./context";
import { cToF, kmhToMph, mmToIn } from "./units";

export const GREETING = "Hi, this is your Yolo County farm advisor. What can I help you with?";
export const DIDNT_CATCH = "Sorry, I didn't catch that. Could you say it one more time?";
export const TROUBLE = "Sorry, I'm having a little trouble reaching my data right now. Could you ask me that again in a moment?";
export const BUDGET_LOW =
  "I've hit today's free voice limit, so I'll switch to text. You can keep chatting with me in the chat box, and voice comes back tomorrow.";

/** Deterministic spoken answer used when the LLM is unreachable (still honest, built from live data). */
export function fallbackAnswer(ctx: GatheredContext | undefined, label: string): string {
  const w = ctx?.weather;
  if (!w) return TROUBLE + " ";
  const parts = [`Right now in ${label} it's ${cToF(w.temperature_c).toFixed(0)} degrees with wind around ${kmhToMph(w.wind_speed_kmh).toFixed(0)} miles per hour.`];
  const d = w.forecast[1];
  if (d?.temp_max != null) {
    const rain = mmToIn(d.precipitation_sum ?? 0);
    parts.push(`Tomorrow looks like a high of ${cToF(d.temp_max).toFixed(0)} degrees` + (rain >= 0.05 ? ` with about ${rain.toFixed(1)} inches of rain.` : " and no rain."));
  }
  parts.push("My detailed advice engine is slow right now, so ask me again in a moment for more.");
  return parts.join(" ") + " ";
}

/** Spoken lines that never change: synthesised once and kept in KV so they cost no neurons per call. */
export const FIXED_LINES: ReadonlySet<string> = new Set([GREETING, DIDNT_CATCH.trim(), TROUBLE.trim(), BUDGET_LOW]);

import type { TTSProvider } from "agents/voice";
import type { TtsMode } from "./governor";

const AURA = "@cf/deepgram/aura-1";
const MELO = "@cf/myshell-ai/melotts";
const NEURONS_PER_AURA_CHAR = 1.364;   // 1,363.64 neurons / 1k chars
const NEURONS_PER_MELO_SECOND = 0.31;  // 18.63 neurons / audio minute
const CACHE_MAX_CHARS = 160;           // only short, repeated lines are worth caching

/** `returnRawResponse` hands back an error *response* (not an exception) when Workers AI refuses: never play that as audio. */
async function audioOrThrow(res: Response): Promise<ArrayBuffer> {
  if (!res.ok) throw new Error(`aura ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) throw new Error(`aura error: ${(await res.text()).slice(0, 200)}`);
  return res.arrayBuffer();
}

const b64ToBuf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;

async function sha1(s: string) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cloudflare-only TTS with free-tier awareness: Aura-1 (natural voice) normally, MeloTTS (~70x cheaper)
 * when the governor says the day's budget is getting tight, nothing (text only) when it's exhausted.
 * Short fixed lines (greeting, fallbacks) are cached so they cost neurons once, not once per call.
 */
const b64 = (buf: ArrayBuffer) => {
  let s = "";
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

export class RoutedTTS implements TTSProvider {
  constructor(
    private ai: Ai,
    private getMode: () => TtsMode,
    private onNeurons: (n: number) => void,
    private speaker = "asteria",
    /** Persistent store for fixed lines (greeting, fallbacks): synthesised once ever, not once per call. */
    private kv?: KVNamespace,
    private fixedLines: ReadonlySet<string> = new Set(),
  ) {}

  /** Synthesize and store every fixed line that isn't cached yet. Called from /api/warm. */
  async warmFixedLines(): Promise<number> {
    let made = 0;
    for (const line of this.fixedLines) {
      const had = this.kv ? await this.kv.get(`tts:aura:${this.speaker}:${await sha1(line)}`) : null;
      if (!had && (await this.synthesize(line, undefined, true))) made++;
    }
    return made;
  }

  async synthesize(text: string, signal?: AbortSignal, forceAura = false): Promise<ArrayBuffer | null> {
    const mode: TtsMode = forceAura ? "aura" : this.getMode();
    if (mode === "off" || !text.trim()) return null;

    const fixedKey = this.kv && this.fixedLines.has(text) && mode === "aura" ? `tts:aura:${this.speaker}:${await sha1(text)}` : null;
    if (fixedKey) {
      const hit = await this.kv!.get(fixedKey);
      if (hit) return b64ToBuf(hit); // ~20 ms, 0 neurons
    }

    const cacheable = text.length <= CACHE_MAX_CHARS && typeof caches !== "undefined";
    const key = cacheable ? new Request(`https://tts.cache.invalid/${mode}/${this.speaker}/${await sha1(text)}`) : null;
    if (key) {
      const hit = await caches.default.match(key).catch(() => undefined);
      if (hit) return hit.arrayBuffer();
    }

    let audio: ArrayBuffer;
    if (mode === "aura") {
      const res = (await (this.ai as any).run(AURA, { text, speaker: this.speaker }, { returnRawResponse: true })) as Response;
      if (signal?.aborted) return null;
      audio = await audioOrThrow(res);
      this.onNeurons(text.length * NEURONS_PER_AURA_CHAR);
    } else {
      const out: any = await (this.ai as any).run(MELO, { prompt: text, lang: "en" });
      if (signal?.aborted) return null;
      audio = b64ToBuf(out.audio);
      this.onNeurons((text.length / 14) * NEURONS_PER_MELO_SECOND); // ~14 chars of speech per second
    }
    if (fixedKey) await this.kv!.put(fixedKey, b64(audio), { expirationTtl: 90 * 86400 }).catch(() => {});
    if (key) {
      await caches.default
        .put(key, new Response(audio.slice(0), { headers: { "Cache-Control": "public, max-age=2592000", "Content-Type": "audio/mpeg" } }))
        .catch(() => {});
    }
    return audio;
  }
}

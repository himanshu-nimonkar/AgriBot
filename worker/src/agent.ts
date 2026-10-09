/**
 * AgriAgent - one Durable Object per session id that serves BOTH the voice call and the text chat,
 * so crop / field location / facts / advice-given / conversation history are shared (ChatGPT-style
 * memory, persisted in the object's SQLite storage and surviving reconnects and deploys).
 *
 * Voice path:  mic PCM --WebSocket--> GatedTranscriber(Flux) -> onTurn -> Llama stream -> sentences -> Aura TTS -> mp3
 */
import { Agent, type Connection } from "agents";
import { withVoice, WorkersAIFluxSTT, type VoiceTurnContext } from "agents/voice";
import type { GatheredContext } from "./brain/context";
import { BUDGET_LOW, FIXED_LINES, fallbackAnswer, GREETING, TROUBLE } from "./brain/fallback";
import { hasFallbackProvider, isQuotaError, streamChat } from "./brain/llm";
import type { Brevity } from "./brain/prompt";
import { SessionBrain, sentences, type Loc, type Prepared } from "./brain/session";
import { cleanForSpeech, SentenceStreamer } from "./brain/speech";
import type { Env } from "./env";
import { GatedTranscriber } from "./voice/gated-transcriber";
import type { Admission, TtsMode } from "./voice/governor";
import { KEYTERMS, MAX_CALL_MS } from "./voice/config";
import { FLUX_NEURONS_PER_SECOND, LLM_IN_NEURONS_PER_TOKEN, LLM_OUT_NEURONS_PER_TOKEN, SAFETY } from "./voice/cost";
import { RoutedTTS } from "./voice/tts";

const VoiceAgent = withVoice(Agent, { historyLimit: 14, audioFormat: "mp3", maxMessageCount: 400 });

export class AgriAgent extends VoiceAgent<Env> {
  // Cloudflare-only speech stack. Flux (streaming STT with end-of-turn) is wrapped by a VAD gate
  // (see createTranscriber) so only speech is billed; TTS is Aura, degrading to MeloTTS / text under budget pressure.
  tts = new RoutedTTS(this.env.AI, () => this.ttsMode, (n) => this.addNeurons(n), "asteria", this.env.SNAPSHOTS, FIXED_LINES);

  private ttsMode: TtsMode = "aura";
  private brevity: Brevity = "normal";
  private pending = 0;
  private callTimer?: ReturnType<typeof setTimeout>;
  private brain = new SessionBrain(this.env, this.sql.bind(this) as any, () => this.brevity);

  // ------------------------------------------------------------ accounting
  private addNeurons(n: number) { this.pending += n * SAFETY; }
  private async flush(turns = 0) {
    const n = this.pending;
    this.pending = 0;
    if (n <= 0 && !turns) return;
    try {
      const p = await this.env.Governor.getByName("global").record(n, turns);
      this.ttsMode = p.mode;
      this.brevity = p.brevity;
    } catch (e) {
      console.warn("[gov] record failed", String(e).slice(0, 100));
    }
  }

  /** Shared brain turn + live dashboard sync over the same WebSocket. */
  async prepare(p: Parameters<SessionBrain["prepare"]>[0] & { connection?: Connection }): Promise<Prepared> {
    const prep = await this.brain.prepare(p);
    if (p.connection && prep.ctx) this.pushContext(p.connection, prep.ctx, { lat: prep.lat, lon: prep.lon, label: prep.label, known: prep.locationKnown }, prep.crop);
    return prep;
  }

  /** Live dashboard sync over the same WebSocket (weather card, satellite layer, map location). */
  private pushContext(conn: Connection, ctx: GatheredContext, loc: Loc & { known: boolean }, crop?: string) {
    try {
      conn.send(JSON.stringify({ type: "agri_context", weather: ctx.weather ?? null, satellite: ctx.satellite ?? null, sources: ctx.ragSources, location: { lat: loc.lat, lon: loc.lon, label: loc.label }, crop }));
    } catch { /* client gone */ }
  }

  // ------------------------------------------------------------ voice
  async beforeCallStart(connection: Connection): Promise<boolean> {
    const a: Admission = await this.env.Governor.getByName("global").admit(connection.id);
    if (!a.ok) {
      const text = a.reason === "busy" ? "All voice lines are busy right now. Please try again in a minute, or use the chat box."
        : a.reason === "daily-calls" ? "The voice line has reached today's call limit. Please use the chat box, or try again tomorrow." : BUDGET_LOW;
      connection.send(JSON.stringify({ type: "agri_notice", code: a.reason, text }));
      return false;
    }
    this.ttsMode = a.mode;
    this.brevity = a.brevity;
    return true;
  }

  async onCallStart(connection: Connection) {
    this.callTimer && clearTimeout(this.callTimer);
    this.callTimer = setTimeout(() => {
      void this.speak(connection, "We've been talking for ten minutes, so I'll wrap up this call to save the free voice budget. Call me again anytime.").finally(() => this.forceEndCall(connection));
    }, MAX_CALL_MS);
    await this.speak(connection, GREETING);
    void this.flush();
  }

  async onCallEnd(connection: Connection) {
    this.callTimer && clearTimeout(this.callTimer);
    await this.flush();
    try { await this.env.Governor.getByName("global").release(connection.id); } catch { /* best effort */ }
  }

  afterTranscribe(transcript: string) {
    return transcript.replace(/[^a-z0-9]/gi, "").length < 2 ? null : transcript;
  }

  beforeSynthesize(text: string) {
    return cleanForSpeech(text) || null;
  }

  createTranscriber() {
    return new GatedTranscriber(new WorkersAIFluxSTT(this.env.AI, { eotThreshold: 0.75, keyterms: KEYTERMS }), {
      onForwardedSeconds: (s) => this.addNeurons(s * FLUX_NEURONS_PER_SECOND),
      onInterimText: (t) => this.brain.prefetch(t),
    });
  }

  async onTurn(transcript: string, context: VoiceTurnContext) {
    return this.voiceTurn(transcript, context);
  }

  private async *voiceTurn(transcript: string, context: VoiceTurnContext): AsyncGenerator<string> {
    const t0 = Date.now();
    let prep: Prepared;
    try {
      prep = await this.prepare({ text: transcript, history: context.messages, mode: "voice", connection: context.connection });
    } catch (e) {
      console.warn("[turn] prepare failed", String(e).slice(0, 200));
      yield TROUBLE + " ";
      return;
    }
    const streamer = new SentenceStreamer();
    const spoken: string[] = [];
    let firstAt: number | undefined, outChars = 0, raw = "";
    try {
      for await (const tok of streamChat(this.env, prep.messages, { maxTokens: 130, signal: context.signal })) {
        raw += tok;
        for (const s of streamer.feed(tok)) {
          firstAt ??= Date.now();
          spoken.push(s), (outChars += s.length);
          yield s;
        }
      }
      for (const s of streamer.finish(streamer.tokens >= 126)) (firstAt ??= Date.now()), spoken.push(s), (outChars += s.length), yield s;
    } catch (e) {
      if (!context.signal.aborted) console.warn("[turn] llm failed", String(e).slice(0, 200));
      if (isQuotaError(e)) void this.env.Governor.getByName("global").exhausted();
    }
    if (context.signal.aborted) {
      console.log(`[turn] interrupted after ${Date.now() - t0}ms`);
      return;
    }
    if (!spoken.length) {
      const fb = fallbackAnswer(prep.ctx, prep.label);
      spoken.push(fb);
      yield fb;
    }
    const answer = spoken.join("").trim();
    this.brain.remember("", answer);
    this.addNeurons(prep.inputTokens * LLM_IN_NEURONS_PER_TOKEN + (outChars / 4) * LLM_OUT_NEURONS_PER_TOKEN);
    console.log(`[turn] raw=${JSON.stringify(raw.slice(0, 400))}`);
    console.log(`[turn] ctx=${prep.ctx?.elapsedMs ?? 0}ms first_text=${firstAt ? firstAt - t0 : "-"}ms total=${Date.now() - t0}ms used=${prep.ctx?.used.join(",") ?? "-"} missing=${prep.ctx?.missing.join(",") ?? "-"} mode=${this.ttsMode}/${this.brevity}`);
    void this.flush(1);
  }

  // ------------------------------------------------------------ text chat (same brain, same memory)
  async chat(req: { query: string; lat?: number; lon?: number; crop?: string }) {
    const t0 = Date.now();
    const policy = await this.env.Governor.getByName("global").policy();
    if (policy.spentFraction >= 0.98 && !hasFallbackProvider(this.env)) {
      return { error: "daily_free_limit", full_response: "I've used today's free AI allowance. I'll be back tomorrow (resets 00:00 UTC).", voice_response: "", sources: [] as string[] };
    }
    const history = this.getConversationHistory(14);
    const prep = await this.prepare({ text: req.query, history, mode: "chat", lat: req.lat, lon: req.lon, crop: req.crop });
    this.saveMessage("user", req.query);
    let text = "";
    try {
      for await (const tok of streamChat(this.env, prep.messages, { maxTokens: 700, temperature: 0.25, gateway: true })) text += tok;
    } catch (e) {
      console.warn("[chat] llm failed", String(e).slice(0, 200));
      if (isQuotaError(e)) void this.env.Governor.getByName("global").exhausted();
    }
    text = text.trim() || (prep.ctx?.weather ? fallbackAnswer(prep.ctx, prep.label) : TROUBLE);
    this.saveMessage("assistant", text);
    this.brain.remember("", cleanForSpeech(text));
    this.addNeurons(prep.inputTokens * LLM_IN_NEURONS_PER_TOKEN + (text.length / 4) * LLM_OUT_NEURONS_PER_TOKEN);
    void this.flush(1);
    const ctx = prep.ctx;
    return {
      voice_response: sentences(cleanForSpeech(text)).slice(0, 3).join(" "),
      full_response: text,
      sources: ctx?.ragSources ?? [],
      weather_data: ctx?.weather ?? null,
      satellite_data: ctx?.satellite ? { ndvi_current: ctx.satellite.ndvi, ndwi_current: ctx.satellite.ndwi, water_stress_level: ctx.satellite.water_stress_level, ndvi_historical_avg: ctx.satellite.ndvi_historical_avg, ndvi_anomaly: ctx.satellite.ndvi_anomaly, county_avg_ndvi: ctx.satellite.county_avg_ndvi, relative_performance: ctx.satellite.relative_performance, analysis_date: ctx.satellite.image_date, latitude: prep.lat, longitude: prep.lon } : null,
      rag_results: [],
      crop: prep.crop ?? "unknown",
      location_address: prep.label,
      lat: prep.lat,
      lon: prep.lon,
      query: req.query,
      timestamp: new Date().toISOString(),
      processing_time_ms: Date.now() - t0,
    };
  }

  /** Pre-synthesize the fixed spoken lines (greeting, fallbacks) once, for all future calls. */
  async warmSpeech() {
    return { made: await this.tts.warmFixedLines() };
  }

  async reset() {
    this.brain.clear();
    try { this.sql`DELETE FROM cf_voice_messages`; } catch { /* no voice history yet */ }
    return { status: "ok" };
  }
}


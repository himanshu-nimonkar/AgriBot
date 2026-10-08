/**
 * SessionBrain - the shared "thinking" layer used by every channel (web call, text chat, phone call).
 * It owns per-caller memory (crop, field, facts, advice given, last data digest) in whatever SQLite the
 * hosting Durable Object provides, resolves location, gathers live data and assembles the LLM prompt.
 */
import type { Env } from "../env";
import { cached, within } from "./cache";
import { gatherContext, planContext, startFetches, type GatheredContext } from "./context";
import { geocode } from "./geocode";
import { parseUtterance, PURE_SOCIAL } from "./intent";
import type { ChatMessage } from "./llm";
import { YOLO_CENTER, distanceKm } from "./places";
import { chatPrompt, voicePrompt, type Brevity, type Memory } from "./prompt";

export type SqlTag = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => T[];

export interface Loc { lat: number; lon: number; label: string }
interface Mem { crop?: string; loc?: Loc; keyFacts: string[]; advisorPoints: string[]; lastContext: string }

export interface Prepared {
  messages: ChatMessage[];
  ctx?: GatheredContext;
  label: string;
  lat: number;
  lon: number;
  crop?: string;
  locationKnown: boolean;
  inputTokens: number;
}

const KEY_FACT_CUES = ["acre", "gallon", "gpa", "north", "south", "east", "west", "near", "by", "field", "orchard", "block", "tomato", "almond", "walnut", "pistachio", "rice", "grape"];
export const sentences = (t: string) => t.replace(/\n/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const geoCache = cached<{ lat: number; lon: number; label: string } | null>(32);

/** Adapt a Durable Object's `ctx.storage.sql.exec` to the tagged-template form the Agents SDK uses. */
export const sqlTagFromExec = (exec: (query: string, ...bindings: any[]) => Iterable<any>): SqlTag =>
  ((strings: TemplateStringsArray, ...values: unknown[]) => [...exec(strings.join("?"), ...values)]) as SqlTag;

export class SessionBrain {
  private memReady = false;
  private lastPrefetch = { text: "", at: 0 };

  constructor(private env: Env, private sql: SqlTag, private getBrevity: () => Brevity = () => "normal") {}

  // ------------------------------------------------------------ memory (SQLite, survives reconnects/deploys)
  mem(): Mem {
    if (!this.memReady) {
      this.sql`CREATE TABLE IF NOT EXISTS agri_memory (k TEXT PRIMARY KEY, v TEXT NOT NULL)`;
      this.memReady = true;
    }
    const o: Record<string, any> = {};
    for (const r of this.sql<{ k: string; v: string }>`SELECT k, v FROM agri_memory`) {
      try { o[r.k] = JSON.parse(r.v); } catch { /* ignore */ }
    }
    return { crop: o.crop, loc: o.loc, keyFacts: o.keyFacts ?? [], advisorPoints: o.advisorPoints ?? [], lastContext: o.lastContext ?? "" };
  }
  private put(k: string, v: unknown) {
    this.sql`INSERT INTO agri_memory (k, v) VALUES (${k}, ${JSON.stringify(v)}) ON CONFLICT(k) DO UPDATE SET v = excluded.v`;
  }
  clear() {
    this.mem();
    this.sql`DELETE FROM agri_memory`;
  }

  /** Heuristic long-term memory (no extra LLM call): facts the user shared, advice already given. */
  remember(userText: string, assistantText: string) {
    const m = this.mem();
    if (userText) {
      for (const s of sentences(userText)) {
        const l = s.toLowerCase();
        if ((KEY_FACT_CUES.some((c) => l.includes(c)) || /\d/.test(s)) && !m.keyFacts.includes(s)) m.keyFacts.push(s);
      }
      this.put("keyFacts", m.keyFacts.slice(-10));
    }
    if (assistantText) {
      for (const s of sentences(assistantText).slice(0, 3)) if (!m.advisorPoints.includes(s)) m.advisorPoints.push(s);
      this.put("advisorPoints", m.advisorPoints.slice(-10));
    }
  }

  // ------------------------------------------------------------ location
  private resolveLoc(mem: Mem, intent: ReturnType<typeof parseUtterance>, req?: { lat?: number; lon?: number }) {
    if (intent.place) return { lat: intent.place.lat, lon: intent.place.lon, label: intent.place.label, known: true, fresh: true };
    if (req?.lat != null && req?.lon != null) {
      // chat: the map pin the user is looking at wins if it moved away from what we remembered
      if (!mem.loc || distanceKm(mem.loc.lat, mem.loc.lon, req.lat, req.lon) > 2)
        return { lat: req.lat, lon: req.lon, label: mem.loc && distanceKm(mem.loc.lat, mem.loc.lon, req.lat, req.lon) <= 2 ? mem.loc.label : "the selected location", known: true, fresh: !mem.loc };
    }
    if (mem.loc) return { ...mem.loc, known: true, fresh: false };
    return { ...YOLO_CENTER, known: false, fresh: false };
  }

  // ------------------------------------------------------------ one turn
  async prepare(p: {
    text: string; history: { role: string; content: string }[]; mode: "voice" | "chat";
    lat?: number; lon?: number; crop?: string;
  }): Promise<Prepared> {
    const intent = parseUtterance(p.text);
    const mem = this.mem();
    const prevUser = [...p.history].reverse().find((m) => m.role === "user")?.content;

    const crop = intent.crop ?? p.crop ?? mem.crop;
    if (crop && crop !== mem.crop) this.put("crop", crop);

    let loc = this.resolveLoc(mem, intent, p);
    if (!intent.place && intent.address) {
      const geo = await within(geoCache.ensure(intent.address.toLowerCase(), 30 * 864e5, () => geocode(intent.address!)), 1800);
      if (geo) loc = { lat: geo.lat, lon: geo.lon, label: geo.label, known: true, fresh: true };
    }
    if (loc.known && (loc.fresh || !mem.loc)) this.put("loc", { lat: loc.lat, lon: loc.lon, label: loc.label } satisfies Loc);
    this.remember(p.text, "");
    const memory = this.mem();

    const plan = planContext(intent, loc, crop, prevUser);
    let ctx: GatheredContext | undefined;
    let liveData = "";
    let stale = false;
    if (intent.topics.size) {
      ctx = await gatherContext(this.env, plan, intent);
      liveData = ctx.text;
      if (liveData) this.put("lastContext", liveData);
    } else if (memory.lastContext && !PURE_SOCIAL.test(p.text)) {
      liveData = memory.lastContext;
      stale = true; // follow-ups like "why is that?" reuse the previous turn's data
    }

    const m: Memory = { crop, location: memory.loc?.label ?? (loc.known ? loc.label : undefined), keyFacts: memory.keyFacts, advisorPoints: memory.advisorPoints };
    const system = p.mode === "voice"
      ? voicePrompt({ label: loc.label, locationKnown: loc.known, memory: m, liveData, dataIsStale: stale, brevity: this.getBrevity() })
      : chatPrompt({ label: loc.label, locationKnown: loc.known, memory: m, liveData });
    const messages: ChatMessage[] = [{ role: "system", content: system }];
    for (const h of p.history.slice(-14)) if (h.role === "user" || h.role === "assistant") messages.push({ role: h.role, content: h.content.slice(0, 600) });
    messages.push({ role: "user", content: p.text });

    return { messages, ctx, label: loc.label, lat: loc.lat, lon: loc.lon, crop, locationKnown: loc.known, inputTokens: Math.ceil(messages.reduce((n, x) => n + x.content.length, 0) / 3.6) };
  }

  /** Called with live (partial) transcripts: start weather/research while the caller is still talking. */
  prefetch(text: string) {
    try {
      const now = Date.now();
      const words = text.trim().split(/\s+/).length;
      if (words < 3 || text === this.lastPrefetch.text || now - this.lastPrefetch.at < 400) return;
      this.lastPrefetch = { text, at: now };
      const intent = parseUtterance(text);
      if (!intent.topics.size) return;
      const mem = this.mem();
      const loc = this.resolveLoc(mem, intent);
      const plan = planContext(intent, loc, intent.crop ?? mem.crop);
      if (words < 6) plan.needRag = false;
      startFetches(this.env, plan);
    } catch (e) {
      console.warn("[prefetch]", String(e).slice(0, 100));
    }
  }
}

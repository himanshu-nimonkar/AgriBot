/**
 * VapiBrain - the "thinking" half of a Vapi phone call.
 *
 * Vapi is only the call orchestrator (phone line, speech-to-text, text-to-speech, turn-taking, barge-in). On every
 * caller turn it POSTs an OpenAI-style chat request to our custom-LLM URL; this Durable Object (one per CALLER, named
 * by a salted hash of their number) answers from the same SessionBrain as the web chat: memory, live weather and
 * satellite data, UC research, and the free-tier LLM chain. The reply is streamed back sentence by sentence so Vapi's
 * TTS can start speaking after the first sentence. If the caller interrupts, Vapi drops the connection: the response
 * stream is cancelled, which aborts the in-flight LLM request.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { fallbackAnswer, GREETING, TROUBLE } from "../brain/fallback";
import { streamChat } from "../brain/llm";
import { SessionBrain, sqlTagFromExec } from "../brain/session";
import { SentenceStreamer } from "../brain/speech";

interface VapiMsg { role: string; content: unknown }
const text = (c: unknown) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join(" ") : "").trim();

export class VapiBrain extends DurableObject<Env> {
  private brain: SessionBrain;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.brain = new SessionBrain(env, sqlTagFromExec(ctx.storage.sql.exec.bind(ctx.storage.sql)), () => "normal");
  }

  /** Called by the webhook with live (partial) transcripts so data is loading before the caller finishes the sentence. */
  prefetch(t: string) {
    this.brain.prefetch(t);
  }

  async fetch(request: Request): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    const messages: VapiMsg[] = Array.isArray(body.messages) ? body.messages : [];
    const stream = body.stream !== false;
    const convo = messages.filter((m) => (m.role === "user" || m.role === "assistant") && text(m.content)).map((m) => ({ role: m.role, content: text(m.content) }));
    const lastUser = convo.map((m) => m.role).lastIndexOf("user");
    const userText = lastUser >= 0 ? convo[lastUser].content : "";
    const history = lastUser >= 0 ? convo.slice(0, lastUser) : convo;

    const id = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
    const created = Math.floor(Date.now() / 1000);
    const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: "agribot", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

    const ac = new AbortController();
    const sentences = this.reply(userText, history, ac.signal);

    if (!stream) {
      let out = "";
      for await (const s of sentences) out += s;
      return Response.json({ id, object: "chat.completion", created, model: "agribot", choices: [{ index: 0, message: { role: "assistant", content: out.trim() }, finish_reason: "stop" }] });
    }

    const enc = new TextEncoder();
    const it = sentences[Symbol.asyncIterator]();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(enc.encode(frame({ role: "assistant", content: "" }))); }, // flush headers immediately
        async pull(c) {
          try {
            const r = await it.next();
            if (r.done) {
              c.enqueue(enc.encode(frame({}, "stop")));
              c.enqueue(enc.encode("data: [DONE]\n\n"));
              c.close();
            } else c.enqueue(enc.encode(frame({ content: r.value })));
          } catch (e) {
            console.warn("[vapi] stream error", String(e).slice(0, 160));
            c.enqueue(enc.encode(frame({ content: TROUBLE + " " })));
            c.enqueue(enc.encode(frame({}, "stop")));
            c.enqueue(enc.encode("data: [DONE]\n\n"));
            c.close();
          }
        },
        // Vapi closed the connection (the caller talked over us): stop generating immediately.
        cancel() { console.log("[vapi] caller interrupted: stream cancelled, aborting the LLM request"); ac.abort(); void it.return?.(undefined); },
      }),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } },
    );
  }

  /** One caller turn as an async stream of speakable sentences. Never throws: failures become short spoken answers. */
  private async *reply(userText: string, history: { role: string; content: string }[], signal: AbortSignal): AsyncGenerator<string> {
    const t0 = Date.now();
    if (!userText) { // Vapi asking for the opening line
      const mem = this.brain.mem();
      yield mem.crop || mem.loc
        ? `Welcome back! Last time we talked about ${mem.crop ?? "your farm"}${mem.loc ? ` near ${mem.loc.label}` : ""}. What can I help you with? `
        : GREETING + " ";
      return;
    }
    if (userText.replace(/[^a-z0-9]/gi, "").length < 2) { yield "Sorry, I didn't catch that. Could you say it one more time? "; return; }

    let prep;
    try {
      prep = await this.brain.prepare({ text: userText, history, mode: "voice" });
    } catch (e) {
      console.warn("[vapi] prepare failed", String(e).slice(0, 200));
      yield TROUBLE + " ";
      return;
    }
    if (signal.aborted) return;

    const streamer = new SentenceStreamer();
    const spoken: string[] = [];
    let provider = "-", firstAt: number | undefined;
    try {
      for await (const tok of streamChat(this.env, prep.messages, { maxTokens: 130, signal, onProvider: (p) => (provider = p) })) {
        for (const s of streamer.feed(tok)) { firstAt ??= Date.now(); spoken.push(s); yield s; }
      }
      for (const s of streamer.finish(streamer.tokens >= 126)) { firstAt ??= Date.now(); spoken.push(s); yield s; }
    } catch (e) {
      if (!signal.aborted) console.warn("[vapi] llm failed", String(e).slice(0, 200));
    }
    if (signal.aborted) return void console.log(`[vapi] interrupted after ${Date.now() - t0}ms`);
    if (!spoken.length) { const fb = fallbackAnswer(prep.ctx, prep.label); spoken.push(fb); yield fb; }

    this.brain.remember("", spoken.join("").trim());
    console.log(`[vapi] ctx=${prep.ctx?.elapsedMs ?? 0}ms first_text=${firstAt ? firstAt - t0 : "-"}ms total=${Date.now() - t0}ms llm=${provider} used=${prep.ctx?.used.join(",") ?? "-"}`);
  }
}

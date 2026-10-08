import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasFallbackProvider, llmProviders, resetProviderCooldowns, streamChat } from "../src/brain/llm";

const enc = new TextEncoder();
const sse = (...toks: string[]) => new ReadableStream<Uint8Array>({
  start(c) { for (const t of toks) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)); c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); },
});
const cfStream = (...toks: string[]) => new ReadableStream<Uint8Array>({
  start(c) { for (const t of toks) c.enqueue(enc.encode(`data: ${JSON.stringify({ response: t })}\n\n`)); c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); },
});
const collect = async (it: AsyncGenerator<string>) => { let s = ""; for await (const t of it) s += t; return s; };
const msgs = [{ role: "user" as const, content: "hi" }];

function env(over: Record<string, unknown> = {}, ai?: () => Promise<ReadableStream<Uint8Array>>): any {
  return { AI: { run: vi.fn(ai ?? (async () => cfStream("from ", "workers"))) }, ...over };
}

beforeEach(() => resetProviderCooldowns());
afterEach(() => vi.unstubAllGlobals());

describe("interruption (barge-in) reaches the upstream request", () => {
  it("aborting the signal cancels the fetch and closes the provider stream", async () => {
    let upstreamCancelled = false, fetchSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      fetchSignal = init.signal as AbortSignal;
      return new Response(new ReadableStream<Uint8Array>({
        start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "one " } }] })}\n\n`)); }, // then stalls
        cancel() { upstreamCancelled = true; },
      }), { status: 200 });
    }));
    const ac = new AbortController();
    const got: string[] = [];
    const done = (async () => { for await (const t of streamChat(env({ GROQ_API_KEY: "k" }), msgs, { signal: ac.signal })) got.push(t); })();
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();                                         // caller talks over the assistant
    await done;                                         // the generator ends promptly instead of waiting for tokens
    expect(got).toEqual(["one "]);
    expect(fetchSignal?.aborted).toBe(true);
    expect(upstreamCancelled).toBe(true);
  });
});

describe("free-tier LLM provider chain", () => {
  it("only lists providers that are configured, in the preferred order", () => {
    expect(llmProviders(env())).toEqual(["workers-ai"]);
    expect(llmProviders(env({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" }))).toEqual(["groq", "workers-ai", "gemini"]);
    expect(llmProviders(env({ GROQ_API_KEY: "k", LLM_ORDER: "workers-ai,groq" }))).toEqual(["workers-ai", "groq"]);
    expect(hasFallbackProvider(env())).toBe(false);
    expect(hasFallbackProvider(env({ OPENROUTER_API_KEY: "k" }))).toBe(true);
  });

  it("uses the first provider when it is healthy", async () => {
    const fetchMock = vi.fn(async () => new Response(sse("hel", "lo"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const e = env({ GROQ_API_KEY: "k" });
    let used = "";
    expect(await collect(streamChat(e, msgs, { onProvider: (p) => (used = p) }))).toBe("hello");
    expect(used).toBe("groq");
    expect(e.AI.run).not.toHaveBeenCalled();
    expect((fetchMock.mock.calls[0] as any)[0]).toContain("groq.com");
  });

  it("falls through to Workers AI on a rate limit, then skips the failing provider (cooldown)", async () => {
    const fetchMock = vi.fn(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const e = env({ GROQ_API_KEY: "k" });
    expect(await collect(streamChat(e, msgs))).toBe("from workers");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await collect(streamChat(e, msgs))).toBe("from workers");
    expect(fetchMock).toHaveBeenCalledTimes(1);          // Groq was not retried within the cooldown
  });

  it("survives Workers AI quota exhaustion when a free fallback exists", async () => {
    const quota = async () => { throw new Error("AiError: you have used up your daily free allocation of 10,000 neurons"); };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sse("gemini ", "answer"), { status: 200 })));
    const e = env({ GEMINI_API_KEY: "k", LLM_ORDER: "workers-ai,gemini" }, quota);
    let used = "";
    expect(await collect(streamChat(e, msgs, { onProvider: (p) => (used = p) }))).toBe("gemini answer");
    expect(used).toBe("gemini");
    expect(e.AI.run).toHaveBeenCalledTimes(1);           // quota error: no pointless second Workers AI model
  });

  it("reports quota when Workers AI is the only provider, and failure when everything is down", async () => {
    const quota = async () => { throw new Error("AiError: you have used up your daily free allocation of 10,000 neurons"); };
    await expect(collect(streamChat(env({}, quota), msgs))).rejects.toThrow(/quota/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const down = async () => { throw new Error("boom"); };
    await expect(collect(streamChat(env({ GROQ_API_KEY: "k" }, down), msgs))).rejects.toThrow(/all providers failed/);
  });
});

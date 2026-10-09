import type { Env } from "../env";

export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const FALLBACK_MODEL = "@cf/meta/llama-3.2-3b-instruct";
export const FIRST_TOKEN_TIMEOUT_MS = 4000;
const STALL_TIMEOUT_MS = 6000;

export class LLMError extends Error {}

/** Workers AI refuses everything once the free daily neurons are gone ("used up your daily free allocation", code 4006). */
export const isQuotaError = (e: unknown) => /daily free allocation|\b4006\b/i.test(String((e as any)?.message ?? e));

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

/** Pull text deltas out of the SSE byte stream Workers AI returns (`data: {"response":"tok"}` ... `[DONE]`). */
export async function* sseTokens(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") return;
        try {
          const o = JSON.parse(data);
          const tok = o.response ?? o.choices?.[0]?.delta?.content;
          if (tok) yield tok as string;
        } catch { /* partial / keep-alive frame */ }
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.cancel().catch(() => {});
  }
}

async function nextWithTimeout<T>(it: AsyncIterator<T>, ms: number): Promise<IteratorResult<T>> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new LLMError(`no token within ${ms}ms`)), ms)));
  try {
    return await Promise.race([it.next(), timeout]);
  } finally {
    clearTimeout(t!);
  }
}

// ------------------------------------------------------------------ provider chain
// Workers AI's free neurons can run out (or its enforcement can glitch). The brain therefore tries a chain of
// free-tier LLM providers in order and remembers which ones are currently failing.
type Provider = "groq" | "workers-ai" | "gemini" | "openrouter";
const DEFAULT_ORDER: Provider[] = ["groq", "workers-ai", "gemini", "openrouter"];

const OPENAI_COMPAT: Record<string, { url: string; base: (e: Env) => string | undefined; key: (e: Env) => string | undefined; model: (e: Env) => string }> = {
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", base: (e) => e.GROQ_BASE_URL, key: (e) => e.GROQ_API_KEY, model: (e) => e.GROQ_MODEL || "qwen/qwen3.8-27b" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", base: (e) => e.GEMINI_BASE_URL, key: (e) => e.GEMINI_API_KEY, model: (e) => e.GEMINI_MODEL || "gemini-2.5-flash-lite" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", base: (e) => e.OPENROUTER_BASE_URL, key: (e) => e.OPENROUTER_API_KEY, model: (e) => e.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free" },
};

const cooldown = new Map<string, number>(); // provider -> epoch ms until which it is skipped
export const resetProviderCooldowns = () => cooldown.clear();

export function llmProviders(env: Env): Provider[] {
  const order = (env.LLM_ORDER ? env.LLM_ORDER.split(",").map((s) => s.trim()) : DEFAULT_ORDER) as Provider[];
  return order.filter((p) => p === "workers-ai" ? !!env.AI : !!OPENAI_COMPAT[p]?.key(env));
}
/** True when something other than Workers AI can answer (so Workers AI quota trouble need not stop chat). */
export const hasFallbackProvider = (env: Env) => llmProviders(env).some((p) => p !== "workers-ai");

function coolDownFor(provider: string, e: unknown): number {
  const msg = String((e as any)?.message ?? e);
  if (isQuotaError(e)) return 20 * 60_000;                       // free neurons gone: probe again in 20 min
  if (/\b(401|403|404)\b/.test(msg)) return 30 * 60_000;         // bad key / unknown model: don't hammer
  return 60_000;                                                 // 429 / 5xx / timeout
}

async function openStream(provider: Provider, env: Env, messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number; signal?: AbortSignal; gateway?: boolean }, workersModel: string): Promise<ReadableStream<Uint8Array>> {
  if (provider === "workers-ai") {
    return (env.AI as any).run(
      workersModel,
      { messages, stream: true, max_tokens: opts.maxTokens ?? 180, temperature: opts.temperature ?? 0.3 },
      // The gateway hop adds ~150 ms at the median, so live voice skips it; chat uses it for free analytics.
      opts.gateway && env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID, skipCache: true } } : undefined,
    ) as Promise<ReadableStream<Uint8Array>>;
  }
  const c = OPENAI_COMPAT[provider];
  const model = c.model(env);
  // Reasoning models: no hidden "thinking" for a phone call (it burns the token budget and adds latency).
  const extra: Record<string, unknown> = {};
  let maxTokens = opts.maxTokens ?? 180;
  if (provider === "groq" && /gpt-oss/i.test(model)) { extra.reasoning_effort = "low"; maxTokens = Math.max(maxTokens, 400); } // reasoning tokens count against max_tokens
  else if (provider === "groq" && /qwen3/i.test(model)) extra.reasoning_effort = "none";
  const res = await fetch(c.base(env) ? `${c.base(env)!.replace(/\/+$/, "")}/chat/completions` : c.url, { // *_BASE_URL: test/proxy override
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key(env)}`, ...(provider === "openrouter" ? { "X-Title": "AgriBot" } : {}) },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: maxTokens, temperature: opts.temperature ?? 0.3, ...extra }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new LLMError(`${provider} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
  return res.body;
}

/**
 * Stream a completion from the first healthy provider. A provider that fails before producing a token is skipped
 * (with a cooldown) and the next one is tried; after tokens flow we can't restart cleanly, so we surface the error.
 */
export async function* streamChat(
  env: Env,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; signal?: AbortSignal; gateway?: boolean; onProvider?: (name: string) => void } = {},
): AsyncGenerator<string> {
  const all = llmProviders(env);
  const now = Date.now();
  const healthy = all.filter((p) => (cooldown.get(p) ?? 0) <= now);
  const attempts = healthy.length ? healthy : all; // everything cooling down: try anyway, better than silence
  let lastErr: unknown;

  for (const provider of attempts) {
    const models = provider === "workers-ai" ? [env.LLM_MODEL || DEFAULT_MODEL, FALLBACK_MODEL] : [""];
    for (const model of models) {
      let gotToken = false;
      try {
        const stream = await openStream(provider, env, messages, opts, model);
        const it = sseTokens(stream, opts.signal)[Symbol.asyncIterator]();
        try {
          for (;;) {
            const r = await nextWithTimeout(it, gotToken ? STALL_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS);
            if (r.done) return;
            if (!gotToken) opts.onProvider?.(provider);
            gotToken = true;
            yield r.value;
          }
        } finally {
          await it.return?.(undefined);
        }
      } catch (e) {
        if (opts.signal?.aborted) return;
        lastErr = e;
        console.warn(`[llm] ${provider}${model ? ` ${model}` : ""} failed${gotToken ? " mid-stream" : ""}: ${String(e).slice(0, 160)}`);
        if (gotToken) throw e instanceof LLMError ? e : new LLMError(String(e));
        if (isQuotaError(e)) { cooldown.set(provider, Date.now() + coolDownFor(provider, e)); break; } // 2nd Workers AI model would fail too
        if (model === models[models.length - 1]) cooldown.set(provider, Date.now() + coolDownFor(provider, e));
      }
    }
  }
  // Keep the quota semantics callers rely on only when Workers AI was the sole option.
  throw new LLMError(`${all.length === 1 && isQuotaError(lastErr) ? "quota: " : "all providers failed: "}${String(lastErr).slice(0, 160)}`);
}

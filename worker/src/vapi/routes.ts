import type { Env } from "../env";
import { callerHash, timingSafeEqual } from "../lib/crypto";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

/** Vapi sends our shared secret as X-Vapi-Secret (configured on the assistant's model/server headers). */
export function vapiAuthorized(request: Request, env: Env): boolean {
  if (!env.VAPI_WEBHOOK_SECRET) return false; // never run open: strangers could burn the free LLM budget
  const got = request.headers.get("x-vapi-secret") ?? (request.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  return timingSafeEqual(got, env.VAPI_WEBHOOK_SECRET);
}

/** One brain per caller (salted hash of the number) so a farmer is remembered between calls; web calls use the call id. */
async function brainFor(env: Env, body: any) {
  const number = body?.customer?.number ?? body?.call?.customer?.number ?? body?.message?.call?.customer?.number ?? body?.message?.customer?.number;
  const callId = body?.call?.id ?? body?.message?.call?.id;
  const name = number ? `caller:${await callerHash(env.VAPI_WEBHOOK_SECRET!, String(number))}` : `call:${callId ?? crypto.randomUUID()}`;
  return env.VapiBrain.getByName(name);
}

/** POST {model.url}/chat/completions - Vapi's custom-LLM turn request. */
export async function vapiLlm(request: Request, env: Env): Promise<Response> {
  if (!vapiAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
  const raw = await request.text();
  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* handled by the brain as an empty request */ }
  const stub = await brainFor(env, body);
  return stub.fetch(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw }));
}

const RECENT_KEY = "vapi:calls";

export async function recentCalls(env: Env): Promise<unknown[]> {
  return (await env.SNAPSHOTS.get<unknown[]>(RECENT_KEY, "json")) ?? [];
}

/** POST /webhook/vapi - server messages: speculative prefetch from live transcripts, call diagnostics. */
export async function vapiWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!vapiAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
  let body: any = {};
  try { body = await request.json(); } catch { return json({ status: "ok" }); }
  const msg = body.message ?? body;
  const type: string = msg.type ?? "";

  try {
    if (type === "transcript" || type === 'transcript[transcriptType="final"]') {
      if (msg.role === "user" && typeof msg.transcript === "string") {
        const stub = await brainFor(env, msg);
        ctx.waitUntil(Promise.resolve(stub.prefetch(msg.transcript)).catch(() => {}));
      }
    } else if (type === "end-of-call-report") {
      const call = msg.call ?? {};
      const started = msg.startedAt ?? call.startedAt, ended = msg.endedAt ?? call.endedAt;
      const entry = {
        id: call.id, ended_reason: msg.endedReason ?? call.endedReason ?? "unknown", started_at: started, ended_at: ended,
        duration_s: started && ended ? Math.round((Date.parse(ended) - Date.parse(started)) / 1000) : null, cost: msg.cost ?? call.cost ?? null,
      };
      console.log(`[vapi] call ended reason=${entry.ended_reason} duration=${entry.duration_s}s cost=${entry.cost}`);
      const list = [entry, ...(await recentCalls(env))].slice(0, 20);
      ctx.waitUntil(env.SNAPSHOTS.put(RECENT_KEY, JSON.stringify(list), { expirationTtl: 30 * 86400 }));
    } else if (type === "hang") {
      console.warn("[vapi] HANG: the assistant failed to respond in time");
    }
  } catch (e) {
    console.warn("[vapi] webhook error", String(e).slice(0, 160));
  }
  return json({ status: "ok" }); // always 200: bookkeeping problems must never look like a failed call to Vapi
}

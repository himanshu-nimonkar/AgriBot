import { getAgentByName, routeAgentRequest } from "agents";
import { warmWeather } from "./brain/snapshots";
import type { Env } from "./env";
import { llmProviders } from "./brain/llm";
import { recentCalls, vapiLlm, vapiWebhook } from "./vapi/routes";
import { marketTrends, startupList, startupRecommend, telemetry, yieldPredict } from "./dashboard";

export { AgriAgent } from "./agent";
export { Governor } from "./voice/governor";
export { VapiBrain } from "./vapi/brain";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

function authorized(req: Request, env: Env): boolean {
  if (!env.ACCESS_CODE) return true;
  const got = req.headers.get("x-access-code") ?? new URL(req.url).searchParams.get("code") ?? "";
  if (got.length !== env.ACCESS_CODE.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ env.ACCESS_CODE.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // Vapi (phone orchestrator): custom-LLM turns + server messages. Vapi appends /chat/completions to model.url.
    if (url.pathname === "/api/vapi-llm/chat/completions" && request.method === "POST") return vapiLlm(request, env);
    if (url.pathname === "/webhook/vapi" && request.method === "POST") return vapiWebhook(request, env, ctx);

    if (url.pathname === "/health") return json({ status: "healthy", runtime: "cloudflare-workers" });

    if (url.pathname === "/api/voice/status") {
      const gov = await env.Governor.getByName("global").status();
      let vectors: number | null = null;
      try { const d: any = await env.KNOWLEDGE.describe(); vectors = d.vectorsCount ?? d.vectorCount ?? null; } catch { /* index missing */ }
      const wx = await env.SNAPSHOTS.get("wx:davis");
      return json({
        runtime: "cloudflare (workers + durable objects + workers ai)",
        access_code_required: !!env.ACCESS_CODE,
        vapi_configured: !!env.VAPI_WEBHOOK_SECRET,
        llm_providers: llmProviders(env),
        recent_phone_calls: authorized(request, env) ? await recentCalls(env) : "send the access code to see recent calls",
        knowledge_vectors: vectors,
        weather_warm_cache: !!wx,
        satellite_snapshot_davis: !!(await env.SNAPSHOTS.get("sat:davis")),
        free_tier_governor: gov,
      });
    }

    // ---- dashboard data (read-only, public like the old backend) ----
    if (url.pathname === "/api/location/telemetry") return json(await telemetry(env, url));
    if (url.pathname === "/api/market/trends") return json(marketTrends());
    if (url.pathname === "/api/startups" || url.pathname === "/api/startups/") return json(startupList());
    if (url.pathname === "/api/startups/recommend" && request.method === "POST") return json(startupRecommend((await request.json().catch(() => ({}))) as { query?: string; focus_filter?: string; city_filter?: string }));
    if (url.pathname === "/api/yield/predict" && request.method === "POST") {
      const b: any = await request.json().catch(() => null);
      if (!b || typeof b.ndvi !== "number") return json({ detail: "ndvi, avg_temp, rainfall_mm, crop_type required" }, 422);
      return json(yieldPredict(b));
    }

    if (url.pathname === "/api/governor/reset" && request.method === "POST") {
      if (!authorized(request, env)) return json({ detail: "Invalid access code" }, 401);
      await env.Governor.getByName("global").reset();
      return json({ status: "ok" });
    }

    if (url.pathname === "/api/warm" && request.method === "POST") {
      if (!authorized(request, env)) return json({ detail: "Invalid access code" }, 401);
      const weather = await warmWeather(env); // refresh weather for every town now (cron also does this hourly)
      const speech = await (await getAgentByName(env.AgriAgent, "_warm")).warmSpeech().catch(() => ({ made: -1 }));
      return json({ ...weather, speech_lines_synthesized: speech.made });
    }

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      if (!authorized(request, env)) return json({ detail: "Invalid access code" }, 401);
      let body: any;
      try { body = await request.json(); } catch { return json({ detail: "Invalid JSON" }, 400); }
      const query = String(body?.query ?? "").trim();
      if (!query) return json({ detail: "query is required" }, 400);
      if (query.length > 500) return json({ detail: "Query max length exceeded (500 chars)." }, 400);
      const agent = await getAgentByName(env.AgriAgent, String(body.session_id || "default").slice(0, 80));
      try {
        return json(await agent.chat({ query, lat: body.lat ?? undefined, lon: body.lon ?? undefined, crop: body.crop ?? undefined }));
      } catch (e) {
        console.error("[analyze]", String(e));
        return json({ detail: "Chat failed" }, 500);
      }
    }

    if (url.pathname === "/api/reset" && request.method === "POST") {
      if (!authorized(request, env)) return json({ detail: "Invalid access code" }, 401);
      const body: any = await request.json().catch(() => ({}));
      const agent = await getAgentByName(env.AgriAgent, String(body.session_id || "default").slice(0, 80));
      return json(await agent.reset());
    }

    // Voice / agent WebSocket: /agents/agri-agent/<session-id>?code=...
    const agentRes = await routeAgentRequest(request, env, {
      cors: true,
      onBeforeConnect: (req) => (authorized(req, env) ? undefined : new Response("Invalid access code", { status: 401 })),
      onBeforeRequest: (req) => (authorized(req, env) ? undefined : new Response("Invalid access code", { status: 401 })),
    });
    if (agentRes) return agentRes;

    return env.ASSETS.fetch(request); // the React dashboard (static assets, free)
  },

  /** Cron: keep weather for every town warm in KV so a voice turn is a ~20 ms KV read, not an API call. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(warmWeather(env).then((r) => console.log(`[warm] weather ok=${r.ok} failed=${r.failed}`)));
  },
} satisfies ExportedHandler<Env>;

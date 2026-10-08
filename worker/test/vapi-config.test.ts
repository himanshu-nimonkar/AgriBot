import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { describe, expect, it, beforeAll } from "vitest";
// @ts-expect-error plain ESM script
import { buildAssistantConfig } from "../scripts/vapi-config.mjs";
import { Validator, loadVapiSpec } from "./openapi-validator";
import { callerHash, timingSafeEqual } from "../src/lib/crypto";

let spec: any = null;
beforeAll(async () => { spec = await loadVapiSpec(); }, 40_000);
const cfg = () => buildAssistantConfig({ baseUrl: "https://agribot.example.workers.dev", secret: "s3cret" });

describe("Vapi assistant definition", () => {
  it("is valid against Vapi's live OpenAPI schema (create and update)", (ctx) => {
    if (!spec) return ctx.skip();
    const v = new Validator(spec);
    expect(v.validate("CreateAssistantDTO", cfg())).toEqual([]);
    expect(v.validate("UpdateAssistantDTO", cfg())).toEqual([]);
    expect(v.validate("CreateAssistantDTO", buildAssistantConfig({ baseUrl: "https://x", secret: "s", voiceProvider: "vapi", voiceId: "Elliot", personalizedGreeting: true }))).toEqual([]);
    for (const voiceProvider of ["11labs", "openai", "rime-ai"]) {
      expect(v.validate("CreateAssistantDTO", buildAssistantConfig({ baseUrl: "https://x", secret: "s", voiceProvider }))).toEqual([]);
    }
    expect(cfg().voice).toMatchObject({ provider: "deepgram", model: "aura-2", voiceId: "thalia" });
    expect(cfg().firstMessage).not.toMatch(/deep/i);                       // TTS reads "Deep Ag" as "Deepak"
  });
  it("the free-number request is valid", (ctx) => {
    if (!spec) return ctx.skip();
    expect(new Validator(spec).validate("CreateVapiPhoneNumberDTO", { provider: "vapi", numberDesiredAreaCode: "530", assistantId: "a1", name: "AgriBot phone line" })).toEqual([]);
  });
  it("the validator really catches the fields the old setup used", (ctx) => {
    if (!spec) return ctx.skip();
    const errs = new Validator(spec).validate("UpdateAssistantDTO", { interruptionsEnabled: false, silenceTimeoutSeconds: 60, serverUrl: "x" });
    expect(errs.join("\n")).toContain("interruptionsEnabled: property should not exist");
  });
  it("points Vapi at this Worker, authenticated, with fast barge-in", () => {
    const c = cfg();
    expect(c.model.url).toBe("https://agribot.example.workers.dev/api/vapi-llm");
    expect(c.model.headers["X-Vapi-Secret"]).toBe("s3cret");
    expect(c.server.url).toBe("https://agribot.example.workers.dev/webhook/vapi");
    expect(c.stopSpeakingPlan.voiceSeconds).toBeLessThanOrEqual(0.3);
    expect(c.maxDurationSeconds).toBeLessThanOrEqual(900);
  });
});

describe("caller identity + secret", () => {
  it("hashes numbers stably and compares secrets safely", async () => {
    const a = await callerHash("k", "+15305551234");
    expect(a).toMatch(/^[a-f0-9]{24}$/);
    expect(a).toBe(await callerHash("k", "+15305551234"));
    expect(a).not.toBe(await callerHash("k", "+15305551235"));
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("vapi-setup.mjs against a schema-enforcing fake Vapi", () => {
  it("creates the assistant, requests a free number, and refuses to touch unrelated assistants", async (ctx) => {
    if (!spec) return ctx.skip();
    const v = new Validator(spec);
    const state: any = { assistants: { friend: { id: "friend", name: "Friend's Pizza Bot" } }, calls: [] };
    const srv = createServer((req, res) => {
      let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
        const send = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
        const body = b ? JSON.parse(b) : {};
        state.calls.push(`${req.method} ${req.url}`);
        if (req.url === "/health") return send(200, { ok: true });
        if (req.method === "GET" && req.url === "/assistant") return send(200, Object.values(state.assistants));
        if (req.method === "POST" && req.url === "/assistant") {
          const e = v.validate("CreateAssistantDTO", body); if (e.length) return send(400, { message: e });
          state.assistants.new1 = { id: "new1", ...body }; return send(201, state.assistants.new1);
        }
        if (req.method === "GET" && req.url === "/assistant/new1") return send(200, state.assistants.new1);
        if (req.method === "POST" && req.url === "/phone-number") {
          if (body.provider !== "vapi" || !body.numberDesiredAreaCode) return send(400, { message: "bad" });
          return send(201, { id: "pn1", number: "+15305550111" });
        }
        send(404, { message: "nf" });
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as any).port;
    const env = { ...process.env, VAPI_PRIVATE_KEY: "k", VAPI_WEBHOOK_SECRET: "s", VAPI_BASE_URL: `http://127.0.0.1:${port}`, VAPI_ASSISTANT_ID: "", VAPI_PHONE_NUMBER_ID: "" };
    const run = (...a: string[]) => new Promise<{ status: number; stdout: string; stderr: string }>((resolve) =>
      execFile("node", ["scripts/vapi-setup.mjs", "--url", `http://127.0.0.1:${port}`, ...a], { env }, (err, stdout, stderr) => resolve({ status: err ? (err as any).code ?? 1 : 0, stdout, stderr })));
    const refuse = await run();
    expect(refuse.status).toBe(1);                                 // no matching assistant, no --create: refuses
    expect(state.calls.some((c: string) => c.startsWith("PATCH"))).toBe(false);
    const ok = await run("--create", "--create-number", "--area-code", "530");
    srv.close();
    expect(ok.stdout + ok.stderr).toContain("created assistant new1");
    expect(ok.stdout).toContain("+15305550111");
    expect(state.assistants.friend).toEqual({ id: "friend", name: "Friend's Pizza Bot" });
  }, 60_000);
});

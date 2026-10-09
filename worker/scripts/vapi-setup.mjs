/**
 * Create/update the Vapi assistant and attach a free US phone number.
 *
 *   node scripts/vapi-setup.mjs --url https://agribot.<you>.workers.dev                 update (needs VAPI_ASSISTANT_ID or exact name match)
 *   node scripts/vapi-setup.mjs --url ... --create                                       create the assistant if the account has none
 *   node scripts/vapi-setup.mjs --url ... --create-number --area-code 530                also get a free Vapi number routed to it
 *   node scripts/vapi-setup.mjs --url ... --dry-run                                      print the assistant JSON
 *   node scripts/vapi-setup.mjs --diagnose                                               recent calls + why they ended
 *
 * Reads VAPI_PRIVATE_KEY, VAPI_WEBHOOK_SECRET (and optional VAPI_ASSISTANT_ID / VAPI_PHONE_NUMBER_ID / VAPI_VOICE_ID)
 * from the environment or ../.env. The Vapi account may be shared: only the named assistant/number is ever touched.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSISTANT_NAME, buildAssistantConfig } from "./vapi-config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", "..", ".env");
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const API = process.env.VAPI_BASE_URL || "https://api.vapi.ai";
const key = process.env.VAPI_PRIVATE_KEY;
const fail = (m) => { console.error(`[ERROR] ${m}`); process.exit(1); };

async function vapi(method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.ok, status: r.status, json, text };
}

async function findAssistant(create) {
  const wanted = process.env.VAPI_ASSISTANT_ID;
  if (wanted) {
    const r = await vapi("GET", `/assistant/${wanted}`);
    if (!r.ok) fail(`VAPI_ASSISTANT_ID ${wanted} not found in this Vapi account (${r.status}). Is the key from the same account?`);
    return wanted;
  }
  const r = await vapi("GET", "/assistant");
  if (!r.ok) fail(`Could not list assistants: ${r.status} ${r.text.slice(0, 200)}`);
  const matches = r.json.filter((a) => (a.name || "").toLowerCase() === opt("name", ASSISTANT_NAME).toLowerCase());
  if (matches.length === 1) { console.log(`[INFO] Using assistant ${matches[0].id}`); return matches[0].id; }
  if (matches.length > 1) fail("Several assistants share that name; set VAPI_ASSISTANT_ID.");
  if (create) return null;
  fail(`No assistant named "${opt("name", ASSISTANT_NAME)}" in this account. Re-run with --create (existing assistants are never modified).`);
}

async function diagnose() {
  const r = await vapi("GET", "/call?limit=10");
  if (!r.ok) fail(`Could not list calls: ${r.status} ${r.text.slice(0, 200)}`);
  for (const c of r.json) console.log(` - ${(c.createdAt || "").slice(0, 19)}  ${(c.status || "").padEnd(10)} ended=${c.endedReason}  cost=${c.cost}`);
}

async function main() {
  if (flag("diagnose")) { if (!key) fail("VAPI_PRIVATE_KEY not set"); return diagnose(); }
  const url = opt("url", process.env.AGENT_URL);
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!url) fail("--url https://<worker> (or AGENT_URL) is required");
  if (!secret) fail("VAPI_WEBHOOK_SECRET is not set (it must also be set as a Worker secret)");
  const cfg = buildAssistantConfig({
    baseUrl: url, secret,
    name: opt("name", ASSISTANT_NAME),
    ...(opt("voice-provider", process.env.VAPI_VOICE_PROVIDER) ? { voiceProvider: opt("voice-provider", process.env.VAPI_VOICE_PROVIDER) } : {}),
    ...(opt("voice-id", process.env.VAPI_VOICE_ID) ? { voiceId: opt("voice-id", process.env.VAPI_VOICE_ID) } : {}),
    maxDurationSeconds: Number(opt("max-seconds", 300)),
    denoise: flag("denoise"),
    personalizedGreeting: flag("personalized-greeting"),
  });
  if (flag("dry-run")) { console.log(JSON.stringify({ ...cfg, model: { ...cfg.model, headers: "***" }, server: { ...cfg.server, headers: "***" } }, null, 2)); return; }
  if (!key) fail("VAPI_PRIVATE_KEY is not set (.env)");

  const health = await fetch(`${url.replace(/\/+$/, "")}/health`).catch(() => null);
  if (!health || !health.ok) fail(`${url}/health is not reachable: Vapi would hit the same dead end.`);

  let id = await findAssistant(flag("create"));
  if (id === null) {
    const r = await vapi("POST", "/assistant", cfg);
    if (!r.ok) fail(`Create assistant failed: ${r.status} ${r.text.slice(0, 600)}`);
    id = r.json.id;
    console.log(`[OK] created assistant ${id}  -> add VAPI_ASSISTANT_ID=${id} to .env`);
  } else {
    const r = await vapi("PATCH", `/assistant/${id}`, cfg);
    if (!r.ok) fail(`Update assistant failed: ${r.status} ${r.text.slice(0, 600)}`);
    console.log(`[OK] assistant ${id} updated`);
  }
  const got = (await vapi("GET", `/assistant/${id}`)).json;
  if (got.model?.url !== cfg.model.url || got.server?.url !== cfg.server.url) fail(`Vapi stored different URLs than we sent: model.url=${got.model?.url} server.url=${got.server?.url}`);
  console.log(`[OK] verified model.url = ${got.model.url}`);

  // phone number
  let phoneId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!phoneId && flag("create-number")) {
    const area = opt("area-code", "530");
    const r = await vapi("POST", "/phone-number", { provider: "vapi", numberDesiredAreaCode: area, assistantId: id, name: "AgriBot phone line" });
    if (!r.ok) fail(`Could not create a free Vapi number for area code ${area}: ${r.status} ${r.text.slice(0, 400)} (try another --area-code)`);
    phoneId = r.json.id;
    console.log(`[OK] free number requested: ${r.json.number || "(activating - takes a few minutes)"}  -> add VAPI_PHONE_NUMBER_ID=${phoneId} to .env`);
  } else if (phoneId) {
    // also replace any stale per-number server URL (e.g. an old tunnel) with ours
    const r = await vapi("PATCH", `/phone-number/${phoneId}`, { assistantId: id, server: cfg.server });
    if (!r.ok) fail(`Could not route the number to the assistant: ${r.status} ${r.text.slice(0, 300)}`);
    console.log(`[OK] number ${phoneId} routes to the assistant`);
  } else {
    const nums = await vapi("GET", "/phone-number");
    console.log(`[INFO] No number attached. ${Array.isArray(nums.json) ? nums.json.length : 0} number(s) in the account. Re-run with --create-number --area-code 530 to get a free one.`);
  }
  console.log("\n[SUCCESS] Call the number now.");
}
main().catch((e) => fail(e.message));

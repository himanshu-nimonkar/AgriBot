/**
 * Check the free LLM providers you configured: key valid? model available? how fast is the first token?
 *
 *   put GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY (and optional *_MODEL) in ../.env, then:
 *   node scripts/check-llm.mjs
 *
 * Then give the Worker the same keys:  npx wrangler secret put GROQ_API_KEY   (etc.)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
if (existsSync(envFile)) for (const l of readFileSync(envFile, "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const P = {
  groq: { base: "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "llama-3.1-8b-instant" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" },
  openrouter: { base: "https://openrouter.ai/api/v1", key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free" },
};
const prompt = [{ role: "system", content: "You are a farm advisor on a phone call. Answer in two short spoken sentences." }, { role: "user", content: "Will it rain this week near Davis, and should I irrigate my almonds?" }];

for (const [name, p] of Object.entries(P)) {
  if (!p.key) { console.log(`- ${name}: no key set (skipped)`); continue; }
  try {
    const models = await fetch(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.key}` } });
    const list = models.ok ? (await models.json()).data?.map((m) => m.id) ?? [] : [];
    const known = list.length ? list.some((id) => id.endsWith(p.model) || id === p.model) : null;
    const t0 = Date.now(); let first = null, text = "";
    const r = await fetch(`${p.base}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: p.model, messages: prompt, stream: true, max_tokens: 90 }) });
    if (!r.ok) { console.log(`- ${name}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}${known === false ? `  (model "${p.model}" not in this account's list)` : ""}`); continue; }
    const dec = new TextDecoder(); let buf = "";
    for await (const c of r.body) { buf += dec.decode(c, { stream: true }); for (const line of buf.split("\n")) { if (line.startsWith("data:") && !line.includes("[DONE]")) { try { const d = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content; if (d) { first ??= Date.now() - t0; text += d; } } catch {} } } buf = buf.slice(buf.lastIndexOf("\n") + 1); }
    console.log(`- ${name}: OK  model=${p.model}  first token ${first} ms  total ${Date.now() - t0} ms\n    "${text.trim().slice(0, 120)}"`);
  } catch (e) { console.log(`- ${name}: ${e.message}`); }
}

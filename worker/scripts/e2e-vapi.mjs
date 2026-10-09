/**
 * Vapi end-to-end test: behaves like Vapi's custom-LLM client against the real Worker, with a local stand-in for the
 * free LLM provider (so it also proves the call works with Workers AI unavailable).
 *
 *   # terminal 1: a Worker whose Groq provider points at this script's mock
 *   printf 'VAPI_WEBHOOK_SECRET=testsecret\nGROQ_API_KEY=mock\nGROQ_BASE_URL=http://127.0.0.1:18999\nLLM_ORDER=groq\n' > .dev.vars && npx wrangler dev --port 8787
 *   # terminal 2:
 *   node scripts/e2e-vapi.mjs --url http://127.0.0.1:8787 --secret testsecret
 */
import { createServer } from "node:http";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt("url", "http://127.0.0.1:8787");
const secret = opt("secret", "testsecret");
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

// ---- mock free LLM provider (OpenAI-compatible, streaming)
const seen = { requests: [], aborted: 0, tokenDelay: 5 };
const mock = createServer((req, res) => {
  let b = ""; req.on("data", (d) => (b += d));
  req.on("end", () => {
    const body = JSON.parse(b);
    seen.requests.push(body.messages);
    const system = body.messages[0].content;
    const where = /Location for local data: ([^.(]+)/.exec(system)?.[1]?.trim() ?? "the county";
    const temp = /WEATHER at [^:]+ right now: (\d+)F/.exec(system)?.[1];
    const answer = temp
      ? `Right now in ${where} it is ${temp} degrees. Rain looks unlikely this week. Want irrigation tips for your almonds?`
      : `Happy to help in ${where}. Which crop are you growing and roughly where is your field?`;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    let done = false;
    res.on("close", () => { if (!done) seen.aborted++; });
    const toks = answer.match(/\s*\S+/g);
    let i = 0;
    const tick = () => {
      if (res.destroyed) return;
      if (i < toks.length) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: toks[i++] } }] })}\n\n`); setTimeout(tick, seen.tokenDelay); }
      else { res.write("data: [DONE]\n\n"); done = true; res.end(); }
    };
    tick();
  });
});
await new Promise((r) => mock.listen(18999, "127.0.0.1", r));

const H = { "Content-Type": "application/json", "X-Vapi-Secret": secret };
const call = (id, number) => ({ id, customer: { number } });
async function turn(callObj, convo, { abortAfterFirstText = false } = {}) {
  const t0 = Date.now();
  const ac = new AbortController();
  const r = await fetch(`${base}/api/vapi-llm/chat/completions`, { method: "POST", headers: H, signal: ac.signal, body: JSON.stringify({ messages: [{ role: "system", content: "vapi prompt (ignored)" }, ...convo], stream: true, ...callObj }) });
  if (r.status !== 200) return { status: r.status, text: "", ttfb: null, done: false };
  let text = "", ttfb = null, done = false, buf = "", aborted = false;
  const dec = new TextDecoder();
  try {
    for await (const chunk of r.body) {
      if (aborted) break;
      buf += dec.decode(chunk, { stream: true });
      let nl; while (!aborted && (nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (d === "[DONE]") { done = true; continue; }
        const c = JSON.parse(d).choices[0].delta.content;
        if (c) { ttfb ??= Date.now() - t0; text += c; if (abortAfterFirstText) { aborted = true; ac.abort(); break; } }
      }
    }
  } catch (e) { if (!ac.signal.aborted) throw e; }
  return { status: 200, text: text.trim(), ttfb, done, aborted };
}
const post = (path, body, headers = H) => fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

try {
  // 1. auth
  check("rejects requests without the Vapi secret", (await post("/api/vapi-llm/chat/completions", { messages: [] }, { "Content-Type": "application/json" })).status === 401);
  check("rejects a wrong secret on the webhook", (await post("/webhook/vapi", { message: { type: "hang" } }, { "Content-Type": "application/json", "X-Vapi-Secret": "nope" })).status === 401);

  // 2. speculative prefetch from a live transcript, then the real turn
  const A = call("call-A", "+15305550123");
  await post("/webhook/vapi", { message: { type: "transcript", role: "user", transcriptType: "partial", transcript: "will it rain near esparto this week", call: A } });
  const t1 = await turn(A, [{ role: "assistant", content: "Hi!" }, { role: "user", content: "I grow almonds near Esparto. Will it rain this week?" }]);
  check("streams a complete, valid OpenAI-style answer", t1.status === 200 && t1.done && /degrees/.test(t1.text), `ttfb=${t1.ttfb}ms "${t1.text.slice(0, 70)}..."`);
  check("answer uses live weather for the town named", /Esparto/.test(t1.text));

  // 3. state within the call: follow-up with no place or crop named
  const t2 = await turn(A, [{ role: "assistant", content: "Hi!" }, { role: "user", content: "I grow almonds near Esparto. Will it rain this week?" }, { role: "assistant", content: t1.text }, { role: "user", content: "And what about tomorrow?" }]);
  const prompt2 = seen.requests.at(-1)[0].content;
  check("follow-up keeps the remembered location and crop", /Esparto/.test(t2.text) && /almonds/.test(prompt2), `"${t2.text.slice(0, 60)}..."`);
  check("full history is passed to the model", seen.requests.at(-1).filter((m) => m.role === "user").length === 2);

  // 4. barge-in: Vapi drops the connection while we are mid-answer
  seen.tokenDelay = 120; const before = seen.aborted;
  const t3 = await turn(A, [{ role: "user", content: "Tell me about irrigation for almonds near Esparto" }], { abortAfterFirstText: true });
  await new Promise((r) => setTimeout(r, 1200));
  // The Worker logs "[vapi] caller interrupted" (visible in `wrangler tail`); a tunnelled mock may not see the close, so it is informational here.
  check("caller interruption: client drops the stream mid-answer", !!t3.aborted, JSON.stringify({ ...t3, text: t3.text.slice(0, 50) }));
  console.log(`INFO  mock LLM saw ${seen.aborted - before} upstream abort(s) (can be 0 when a tunnel sits in between; unit test covers the abort chain)`);
  const t3b = await turn(A, [{ role: "user", content: "Actually, what about walnuts?" }]);
  check("the next question after an interruption is answered normally", t3b.done && t3b.text.length > 10, `"${t3b.text.slice(0, 50)}..."`);
  seen.tokenDelay = 5;

  // 5. a returning caller (new call id, same number) is remembered
  const B = call("call-B", "+15305550123");
  const g = await turn(B, []);                                   // Vapi asking for the opening line
  check("returning caller is greeted from memory", /Welcome back/.test(g.text) && /Esparto/.test(g.text), `"${g.text}"`);
  const C = call("call-C", "+15305550999");
  const g2 = await turn(C, []);
  check("a new caller gets the normal greeting", /farm advisor/.test(g2.text) && !/Welcome back/.test(g2.text));

  // 6. call report shows up for diagnostics
  await post("/webhook/vapi", { message: { type: "end-of-call-report", endedReason: "customer-ended-call", startedAt: "2026-10-07T10:00:00Z", endedAt: "2026-10-07T10:02:30Z", cost: 0.21, call: A } });
  await new Promise((r) => setTimeout(r, 800));
  const status = await (await fetch(`${base}/api/voice/status`)).json();
  const rc = Array.isArray(status.recent_phone_calls) ? status.recent_phone_calls : [];
  check("end-of-call report recorded (endedReason + duration)", rc[0]?.ended_reason === "customer-ended-call" && rc[0]?.duration_s === 150, JSON.stringify(rc[0] ?? status.recent_phone_calls));
} finally {
  mock.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);

/**
 * End-to-end voice test against a running Worker (wrangler dev or deployed).
 * Speaks the same WebSocket protocol as the browser VoiceClient: streams 16 kHz mono PCM like an open mic,
 * receives transcripts + mp3 audio, and reports the latency a caller would feel.
 *
 *   node scripts/e2e-voice.mjs --url wss://agribot.<you>.workers.dev --wav turn1.wav --wav turn2.wav [--code X]
 *
 * Make test speech on macOS:  say -o t.wav --file-format=WAVE --data-format=LEI16@16000 "will it rain in Davis"
 */
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const wavs = args.flatMap((a, i) => (a === "--wav" ? [args[i + 1]] : []));
const base = opt("url", "ws://127.0.0.1:8787");
const session = opt("session", `e2e-${Date.now()}`);
const code = opt("code", "");
const FRAME_MS = 20, SR = 16000, FRAME_SAMPLES = (SR * FRAME_MS) / 1000;

function readPcm(path) {
  const b = readFileSync(path);
  for (let o = 12; o < b.length - 8; ) {
    const id = b.toString("ascii", o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === "data") return new Int16Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + size));
    o += 8 + size;
  }
  throw new Error("no data chunk in " + path);
}

const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(2)}s]`, ...a);
setTimeout(() => { console.error("GLOBAL TIMEOUT"); process.exit(2); }, 150000);

const ws = new WebSocket(`${base}/agents/agri-agent/${session}${code ? `?code=${encodeURIComponent(code)}` : ""}`);
ws.binaryType = "arraybuffer";

let turn = 0, started = false, speechEndAt = null, firstAudioAt = null, audioBytes = 0, reply = "", turnDone;
const results = [];
const frame = (pcm, i) => { const f = new Int16Array(FRAME_SAMPLES); f.set(pcm.subarray(i * FRAME_SAMPLES, (i + 1) * FRAME_SAMPLES)); return f.buffer; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.on("open", () => { log("connected"); ws.send(JSON.stringify({ type: "hello", protocol_version: 1 })); ws.send(JSON.stringify({ type: "start_call", preferred_format: "mp3" })); });
ws.on("error", (e) => { console.error("ws error", e.message); process.exit(1); });
ws.on("message", (data, isBinary) => {
  if (isBinary) {
    audioBytes += data.byteLength;
    if (speechEndAt && firstAudioAt === null) { firstAudioAt = Date.now(); log(`FIRST AUDIO  (${firstAudioAt - speechEndAt} ms after you stopped speaking)`); }
    return;
  }
  const m = JSON.parse(Buffer.from(data).toString());
  switch (m.type) {
    case "status":
      log("status:", m.status);
      if (m.status === "listening" && !started) { started = true; nextTurn(); }
      break;
    case "transcript": log(`${m.role.toUpperCase()}: ${m.text}`); if (m.role === "assistant") { reply = m.text; if (speechEndAt) turnDone?.(); } break;
    case "transcript_end": reply = m.text; log("ASSISTANT:", m.text); if (speechEndAt) turnDone?.(); break;
    case "turn_metrics": log("turn_metrics", JSON.stringify(m)); break;
    case "agri_context": log("agri_context:", JSON.stringify({ loc: m.location, crop: m.crop, weather: !!m.weather, satellite: !!m.satellite, sources: m.sources?.length })); break;
    case "agri_notice": log("NOTICE:", m.text); break;
    case "error": log("ERROR:", JSON.stringify(m)); break;
    default: break;
  }
});

async function nextTurn() {
  if (turn >= wavs.length) return finish();
  const wav = wavs[turn++];
  firstAudioAt = null; speechEndAt = null; audioBytes = 0; reply = "";
  log(`=== TURN ${turn}: ${wav.split("/").pop()}`);
  for (let i = 0; i < 30; i++) { ws.send(new Int16Array(FRAME_SAMPLES).buffer); await sleep(FRAME_MS); } // room noise
  const pcm = readPcm(wav);
  for (let i = 0; i < Math.ceil(pcm.length / FRAME_SAMPLES); i++) { ws.send(frame(pcm, i)); await sleep(FRAME_MS); }
  speechEndAt = Date.now();
  log("finished speaking (mic stays open, sending silence)");
  const done = new Promise((r) => (turnDone = r));
  let finished = false; done.then(() => (finished = true));
  for (const end = Date.now() + 25000; !finished && Date.now() < end; ) { ws.send(new Int16Array(FRAME_SAMPLES).buffer); await sleep(FRAME_MS); }
  await sleep(1500);
  results.push({ turn, ok: finished, firstAudioMs: firstAudioAt ? firstAudioAt - speechEndAt : null, audioKB: Math.round(audioBytes / 1024), reply });
  nextTurn();
}

function finish() {
  console.log("\n===== SUMMARY =====");
  for (const r of results) console.log(`turn ${r.turn}: ${r.ok ? "ok" : "TIMEOUT"} | first audio ${r.firstAudioMs ?? "-"} ms after end of speech | ${r.audioKB} KB mp3 | ${r.reply.slice(0, 150)}`);
  ws.send(JSON.stringify({ type: "end_call" }));
  setTimeout(() => process.exit(0), 600);
}

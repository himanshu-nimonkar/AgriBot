import { describe, expect, it, vi } from "vitest";
import { GatedTranscriber, rms16 } from "../src/voice/gated-transcriber";
import type { TranscriberSessionOptions } from "agents/voice";

const SR = 16000;
const frame = (ms: number, amp: number) => {
  const n = Math.round((ms / 1000) * SR), a = new Int16Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.round(Math.sin(i / 6) * amp * 32767);
  return a.buffer;
};

function harness(gate = {}) {
  const fed: number[] = []; // ms of audio forwarded to the (fake) Flux session
  let opts: TranscriberSessionOptions | undefined;
  let forwarded = 0;
  const inner = {
    createSession(o?: TranscriberSessionOptions) {
      opts = o;
      return { feed: (b: ArrayBuffer) => void fed.push((b.byteLength / 2 / SR) * 1000), close() {} };
    },
  };
  const utterances: string[] = [];
  const session = new GatedTranscriber(inner, { onForwardedSeconds: (s) => (forwarded += s), ...gate }).createSession({ onUtterance: (t) => utterances.push(t) });
  return { session, fed, utterances, forwardedMs: () => forwarded * 1000, emit: () => opts! };
}

describe("GatedTranscriber (cost gate)", () => {
  it("forwards only speech (+pre-roll and a short tail), not minutes of silence", () => {
    const h = harness();
    for (let i = 0; i < 100; i++) h.session.feed(frame(20, 0.002));       // 2 s of quiet room
    expect(h.fed.length).toBe(0);
    for (let i = 0; i < 50; i++) h.session.feed(frame(20, 0.2));          // 1 s of speech
    for (let i = 0; i < 100; i++) h.session.feed(frame(20, 0.002));       // 2 s of silence
    for (let i = 0; i < 400; i++) h.session.feed(frame(20, 0.002));       // 8 s more silence
    const total = h.fed.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(1000);   // speech + pre-roll + hang were forwarded
    expect(total).toBeLessThan(2500);      // ...but nowhere near the 12 s that streamed in
    expect(h.forwardedMs()).toBeCloseTo(total, 0);
    h.session.close();
  });

  it("closes a turn from the last transcript if Flux never emits EndOfTurn", async () => {
    vi.useFakeTimers();
    const h = harness();
    for (let i = 0; i < 50; i++) h.session.feed(frame(20, 0.2));
    for (let i = 0; i < 60; i++) h.session.feed(frame(20, 0.002));        // > hang -> watchdog armed
    h.emit().onInterim?.("will it rain tomorrow");
    await vi.advanceTimersByTimeAsync(6000);
    expect(h.utterances).toEqual(["will it rain tomorrow"]);
    h.session.close();
    vi.useRealTimers();
  });

  it("does not double-fire when Flux does end the turn", async () => {
    vi.useFakeTimers();
    const h = harness();
    for (let i = 0; i < 50; i++) h.session.feed(frame(20, 0.2));
    for (let i = 0; i < 60; i++) h.session.feed(frame(20, 0.002));
    h.emit().onInterim?.("will it rain");
    h.emit().onUtterance?.("Will it rain tomorrow?");
    await vi.advanceTimersByTimeAsync(6000);
    expect(h.utterances).toEqual(["Will it rain tomorrow?"]);
    h.session.close();
    vi.useRealTimers();
  });

  it("re-arms the watchdog when Flux ends a turn early and the caller keeps talking", async () => {
    vi.useFakeTimers();
    const h = harness();
    for (let i = 0; i < 30; i++) h.session.feed(frame(20, 0.2));           // "How hot"
    h.emit().onInterim?.("How hot");
    h.emit().onUtterance?.("How hot");                                      // premature end of turn
    for (let i = 0; i < 40; i++) h.session.feed(frame(20, 0.2));           // "...will it get tomorrow?" (same breath)
    h.emit().onInterim?.("How hot will it get tomorrow");
    for (let i = 0; i < 60; i++) h.session.feed(frame(20, 0.002));         // caller stops; Flux never answers
    await vi.advanceTimersByTimeAsync(6000);
    expect(h.utterances).toEqual(["How hot", "How hot will it get tomorrow"]);
    h.session.close();
    vi.useRealTimers();
  });

  it("keeps the Flux socket alive through long pauses with tiny silence frames", async () => {
    vi.useFakeTimers();
    const h = harness();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(h.fed.length).toBeGreaterThanOrEqual(3);
    expect(h.fed.reduce((a, b) => a + b, 0)).toBeLessThan(200);          // pennies of audio
    h.session.close();
    vi.useRealTimers();
  });

  it("rms16 is sane", () => {
    expect(rms16(frame(20, 0.5))).toBeGreaterThan(0.3);
    expect(rms16(new ArrayBuffer(0))).toBe(0);
  });
});

/**
 * Cost-gating wrapper around the Flux speech-to-text session.
 *
 * Flux bills per second of audio streamed (~700 neurons/min). The browser streams the mic continuously
 * (including silence and while the assistant is speaking), which would burn the 10,000-neuron free day in
 * ~14 minutes. This wrapper runs a small VAD and only forwards speech (+ a short pre-roll and a trailing
 * silence so Flux can still detect end-of-turn), then keeps the Flux socket alive with tiny silence frames.
 * A watchdog guarantees a turn is always closed even if Flux doesn't emit EndOfTurn after the audio stops.
 */
import type { Transcriber, TranscriberSession, TranscriberSessionOptions } from "agents/voice";

export interface GateOptions {
  /** PCM sample rate of the audio fed in (16 kHz for the web client, 8 kHz for phone lines). */
  sampleRate?: number;
  /** Fires once per utterance after this much continuous voiced audio (fast barge-in on phone lines). */
  onVoiceStart?: () => void;
  voiceStartMs?: number;
  /** Called with seconds of audio actually forwarded to Flux (for neuron accounting). */
  onForwardedSeconds?: (s: number) => void;
  /** Called with interim text (speculative prefetch hook). */
  onInterimText?: (t: string) => void;
  hangMs?: number;       // trailing silence forwarded after speech ends
  prerollMs?: number;    // audio kept from before speech starts
  keepAliveMs?: number;  // idle gap after which a 20 ms silence frame is sent
}

export const rms16 = (buf: ArrayBuffer): number => {
  const v = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
  if (!v.length) return 0;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s / v.length) / 32768;
};

export class GatedTranscriber implements Transcriber {
  constructor(private inner: Transcriber, private gate: GateOptions = {}) {}

  createSession(options?: TranscriberSessionOptions): TranscriberSession {
    const g = this.gate;
    const SR = g.sampleRate ?? 16_000;
    const chunkMs = (buf: ArrayBuffer) => (buf.byteLength / 2 / SR) * 1000;
    const silence = (ms: number) => new ArrayBuffer(Math.round((ms / 1000) * SR) * 2);
    const voiceStartMs = g.voiceStartMs ?? 240;
    const hangMs = g.hangMs ?? 800, prerollMs = g.prerollMs ?? 400, keepAliveMs = g.keepAliveMs ?? 4000;

    let lastInterim = "";
    let awaitingEot = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let lastForwardWall = Date.now();

    const clearWatchdog = () => watchdog && (clearTimeout(watchdog), (watchdog = undefined));

    const session = this.inner.createSession({
      ...options,
      onInterim: (t) => {
        lastInterim = t;
        g.onInterimText?.(t);
        options?.onInterim?.(t);
      },
      onUtterance: (t) => {
        awaitingEot = false;
        lastInterim = "";
        clearWatchdog();
        options?.onUtterance?.(t);
      },
    });

    const forward = (buf: ArrayBuffer) => {
      lastForwardWall = Date.now();
      g.onForwardedSeconds?.(chunkMs(buf) / 1000);
      session.feed(buf);
    };

    // EOT watchdog: after speech stops, Flux normally answers within ~0.5 s. If not, push silence twice,
    // then fall back to the last interim transcript so the user is never left hanging.
    const armWatchdog = () => {
      clearWatchdog();
      let step = 0;
      const tick = () => {
        if (closed || !awaitingEot) return;
        step++;
        if (step <= 2) {
          forward(silence(900));
          watchdog = setTimeout(tick, 1300);
        } else if (lastInterim.trim()) {
          const t = lastInterim;
          awaitingEot = false;
          lastInterim = "";
          options?.onUtterance?.(t);
        } else {
          awaitingEot = false;
        }
      };
      watchdog = setTimeout(tick, 1500);
    };

    // VAD state (audio-clock based)
    let inSpeech = false, voicedRun = 0, silentMs = 0, noise = 0.01, voicedMs = 0, voiceStartFired = false;
    const preroll: ArrayBuffer[] = [];
    let prerollMsTotal = 0;

    keepAlive = setInterval(() => {
      if (!closed && Date.now() - lastForwardWall >= keepAliveMs) forward(silence(20));
    }, 1000);

    return {
      waitUntilReady: session.waitUntilReady?.bind(session),
      updateAgentContext: session.updateAgentContext?.bind(session),
      feed(chunk: ArrayBuffer) {
        if (closed) return;
        const level = rms16(chunk);
        const voiced = level > Math.max(0.02, noise * 3);
        if (!voiced) noise = Math.min(0.05, noise * 0.95 + level * 0.05);
        if (voiced) {
          voicedMs += chunkMs(chunk);
          if (!voiceStartFired && voicedMs >= voiceStartMs) (voiceStartFired = true), g.onVoiceStart?.();
        } else (voicedMs = 0), (voiceStartFired = false);

        if (!inSpeech) {
          preroll.push(chunk);
          prerollMsTotal += chunkMs(chunk);
          while (prerollMsTotal > prerollMs && preroll.length > 1) prerollMsTotal -= chunkMs(preroll.shift()!);
          voicedRun = voiced ? voicedRun + 1 : 0;
          if (voicedRun >= 2) {
            inSpeech = true;
            silentMs = 0;
            awaitingEot = true;
            clearWatchdog();
            for (const b of preroll) forward(b);
            preroll.length = 0;
            prerollMsTotal = 0;
          }
          return;
        }
        forward(chunk);
        if (voiced) {
          silentMs = 0;
          // Flux may already have ended a turn mid-sentence (utterance fired, speech continued): a new turn
          // is open again, so the end-of-turn watchdog must be armed for it too.
          awaitingEot = true;
        } else if ((silentMs += chunkMs(chunk)) >= hangMs) {
          inSpeech = false;
          voicedRun = 0;
          armWatchdog();
        }
      },
      close() {
        closed = true;
        clearWatchdog();
        if (keepAlive) clearInterval(keepAlive);
        session.close();
      },
    };
  }
}

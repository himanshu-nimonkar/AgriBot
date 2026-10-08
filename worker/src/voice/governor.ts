/**
 * Free-tier governor (one global Durable Object).
 *
 * Workers AI's free plan allows 10,000 neurons/day and hard-fails everything (chat, research, voice)
 * once exhausted. The governor keeps an estimate of today's spend and degrades gracefully BEFORE that:
 *   < 55%  : full quality voice
 *   < 80%  : voice with tighter (shorter) answers
 *   < 92%  : cheapest TTS voice + tight answers
 *   >= 92% : no new voice calls (text chat keeps working on the remaining margin)
 * It also caps concurrent calls so one noisy visitor can't burn the day's budget.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

import { modeFor, type Admission, type Brevity, type TtsMode } from "./policy";
export type { Admission, Brevity, TtsMode } from "./policy";

const MAX_CONCURRENT = 3;
const MAX_CALLS_PER_DAY = 80;
const CALL_TTL_MS = 12 * 60_000;
const EXHAUSTED_COOLDOWN_MS = 20 * 60_000;

export class Governor extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS active (id TEXT PRIMARY KEY, started INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS flags (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
    `);
  }

  private budget() {
    return Number(this.env.DAILY_NEURON_BUDGET) || 10_000;
  }
  private today() {
    return new Date().toISOString().slice(0, 10); // Workers AI resets at 00:00 UTC
  }
  private row() {
    const day = this.today();
    this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO usage(day) VALUES (?)`, day);
    return this.ctx.storage.sql.exec<{ neurons: number; calls: number; turns: number }>(`SELECT neurons, calls, turns FROM usage WHERE day = ?`, day).one();
  }
  /** Spent fraction: our estimate, forced to 1 for 20 minutes after Workers AI itself said "allowance used up" (then we retry). */
  private fraction(neurons: number) {
    const f = this.ctx.storage.sql.exec<{ v: number }>(`SELECT v FROM flags WHERE k = 'exhausted_at'`).toArray()[0];
    if (f && Date.now() - f.v < EXHAUSTED_COOLDOWN_MS) return Math.max(1, neurons / this.budget());
    return neurons / this.budget();
  }
  private activeCount() {
    this.ctx.storage.sql.exec(`DELETE FROM active WHERE started < ?`, Date.now() - CALL_TTL_MS);
    return this.ctx.storage.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM active`).one().n;
  }

  admit(callId: string): Admission {
    const r = this.row();
    const f = this.fraction(r.neurons);
    const { mode, brevity } = modeFor(f);
    if (mode === "off") return { ok: false, reason: "budget", mode, brevity, spentFraction: f };
    if (r.calls >= MAX_CALLS_PER_DAY) return { ok: false, reason: "daily-calls", mode, brevity, spentFraction: f };
    if (this.activeCount() >= MAX_CONCURRENT) return { ok: false, reason: "busy", mode, brevity, spentFraction: f };
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO active(id, started) VALUES (?, ?)`, callId, Date.now());
    this.ctx.storage.sql.exec(`UPDATE usage SET calls = calls + 1 WHERE day = ?`, this.today());
    return { ok: true, mode, brevity, spentFraction: f };
  }

  release(callId: string) {
    this.ctx.storage.sql.exec(`DELETE FROM active WHERE id = ?`, callId);
  }

  /** Record estimated neurons; returns the current policy so callers can adapt mid-call. */
  record(neurons: number, turns = 0): { mode: TtsMode; brevity: Brevity; spentFraction: number } {
    const day = this.today();
    this.row();
    this.ctx.storage.sql.exec(`UPDATE usage SET neurons = neurons + ?, turns = turns + ? WHERE day = ?`, Math.max(0, neurons), turns, day);
    const f = this.fraction(this.row().neurons);
    return { ...modeFor(f), spentFraction: f };
  }

  /** Workers AI itself reported the free allowance is gone: stop admitting calls until tomorrow. */
  exhausted() {
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO flags (k, v) VALUES ('exhausted_at', ?)`, Date.now());
  }

  /** Admin: forget today's estimate and any exhausted flag (the estimator is pessimistic; real usage is in Cloudflare analytics). */
  reset() {
    this.ctx.storage.sql.exec(`DELETE FROM flags`);
    this.ctx.storage.sql.exec(`UPDATE usage SET neurons = 0 WHERE day = ?`, this.today());
  }

  policy() {
    const f = this.fraction(this.row().neurons);
    return { ...modeFor(f), spentFraction: f };
  }

  status() {
    const r = this.row();
    return { day: this.today(), neurons_estimated: Math.round(r.neurons), budget: this.budget(), calls: r.calls, turns: r.turns, active_calls: this.activeCount(), ...this.policy() };
  }
}

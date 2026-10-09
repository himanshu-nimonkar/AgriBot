/** Pure policy (no runtime imports, unit-testable): how voice quality degrades as the free budget is spent. */
export type TtsMode = "aura" | "melo" | "off";
export type Brevity = "normal" | "tight";
export interface Admission { ok: boolean; reason?: "budget" | "busy" | "daily-calls"; mode: TtsMode; brevity: Brevity; spentFraction: number }


export const modeFor = (f: number): { mode: TtsMode; brevity: Brevity } =>
  f < 0.55 ? { mode: "aura", brevity: "normal" }
  : f < 0.8 ? { mode: "aura", brevity: "tight" }
  : f < 0.92 ? { mode: "melo", brevity: "tight" }
  : { mode: "off", brevity: "tight" };

/** Neuron estimates per unit (Workers AI pricing, 1,000 neurons = $0.011) shared by every channel. */
export const SAFETY = 1.35; // measured real usage ran ~30% above the raw per-unit estimate
export const FLUX_NEURONS_PER_SECOND = 700 / 60;
export const LLM_IN_NEURONS_PER_TOKEN = 4119 / 1e6;
export const LLM_OUT_NEURONS_PER_TOKEN = 34868 / 1e6;
export const llmNeurons = (inputTokens: number, outChars: number) =>
  inputTokens * LLM_IN_NEURONS_PER_TOKEN + (outChars / 4) * LLM_OUT_NEURONS_PER_TOKEN;

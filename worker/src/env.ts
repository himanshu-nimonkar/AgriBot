import type { AgriAgent } from "./agent";
import type { VapiBrain } from "./vapi/brain";
import type { Governor } from "./voice/governor";

export interface Env {
  AI: Ai;
  KNOWLEDGE: VectorizeIndex;
  SNAPSHOTS: KVNamespace;
  ASSETS: Fetcher;
  AgriAgent: DurableObjectNamespace<AgriAgent>;
  Governor: DurableObjectNamespace<Governor>;
  VapiBrain: DurableObjectNamespace<VapiBrain>;
  /** Shared secret Vapi sends as X-Vapi-Secret on every request; also salts the caller-number hash (Worker secret). */
  VAPI_WEBHOOK_SECRET?: string;
  /** AI Gateway id (free): analytics, rate limiting, caching for LLM calls. */
  AI_GATEWAY_ID?: string;
  /** Optional shared access code (secret). When set, calls/chat need ?code=... */
  ACCESS_CODE?: string;
  /** Daily neuron budget the governor protects (Workers AI free tier = 10,000). */
  DAILY_NEURON_BUDGET?: string;
  LLM_MODEL?: string;
  /** Free-tier fallback LLM providers (all optional secrets). Order: LLM_ORDER, default groq,workers-ai,gemini,openrouter. */
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_MODEL?: string;
  GEMINI_MODEL?: string;
  OPENROUTER_MODEL?: string;
  LLM_ORDER?: string;
  GROQ_BASE_URL?: string;
  GEMINI_BASE_URL?: string;
  OPENROUTER_BASE_URL?: string;
}

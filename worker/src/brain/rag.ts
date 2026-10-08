import type { Env } from "../env";
import { bm25Search } from "./bm25";
import { isQuotaError } from "./llm";
import { TTLCache } from "./cache";

export interface Passage {
  text: string;
  source: string;
  page?: number;
  score: number;
}

export const RAG_MIN_SCORE = 0.45;
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

let semanticBlockedUntil = 0; // Workers AI embeddings failing (quota/outage): skip the doomed call for a while

/**
 * UC research passages. Semantic search (Workers AI embedding + Vectorize) when available, otherwise - or when it
 * finds nothing - the bundled keyword index, so research never disappears with a quota outage.
 */
export async function searchKnowledge(env: Env, query: string, crop?: string, topK = 3): Promise<Passage[]> {
  if (Date.now() >= semanticBlockedUntil) {
    try {
      const hits = await Promise.race([
        semanticSearch(env, query, crop, topK),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("semantic search timeout")), 1800)),
      ]);
      if (hits.length) return hits;
    } catch (e) {
      semanticBlockedUntil = Date.now() + (isQuotaError(e) ? 10 * 60_000 : 60_000);
      console.warn(`[rag] semantic search unavailable, using keyword index: ${String(e).slice(0, 100)}`);
    }
  }
  return bm25Search(query, crop, topK);
}

async function semanticSearch(env: Env, query: string, crop?: string, topK = 3): Promise<Passage[]> {
  const emb: any = await env.AI.run(EMBED_MODEL, { text: [query] });
  const vector: number[] | undefined = emb?.data?.[0];
  if (!vector) return [];
  const opts: VectorizeQueryOptions = { topK, returnMetadata: "all" };
  // crop-specific guides plus the untagged county/general documents
  if (crop) opts.filter = { crop: { $in: [crop, "generic"] } };
  const res = await env.KNOWLEDGE.query(vector, opts);
  return res.matches
    .map((m) => ({
      text: String((m.metadata as any)?.text ?? ""),
      source: String((m.metadata as any)?.source ?? "UC research"),
      page: (m.metadata as any)?.page as number | undefined,
      score: m.score,
    }))
    .filter((p) => p.text.trim() && p.score >= RAG_MIN_SCORE);
}

export const friendlySource = (name: string) =>
  name.replace(/\.(pdf|txt|md|json)$/i, "").replace(/[_-]/g, " ").trim() || "UC research";

export const ragCache = new TTLCache<Passage[]>(128);

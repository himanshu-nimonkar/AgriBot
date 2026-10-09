/**
 * Local keyword search (BM25) over the UC research chunks bundled in the Worker (src/data/knowledge.json, built by
 * backend/scripts/export_knowledge.py). Zero network calls and ~1-3 ms per query, so research stays available when
 * Workers AI embeddings or Vectorize are down (free-quota outage) - and it is the fast path for voice.
 */
import knowledge from "../data/knowledge.json";
import type { Passage } from "./rag";

interface Index { docs: [string, string, number, string][]; lens: number[]; avgdl: number; postings: Record<string, [number, number][]> }
const idx = knowledge as unknown as Index;

const STOP = new Set("a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your".split(" "));

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
/** MUST stay identical to tokenize() in backend/scripts/export_knowledge.py */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 2 && !STOP.has(w)).map(stem);
}

const K1 = 1.5, B = 0.75;
// Words every farm question contains carry no signal; weight them down so the specific terms decide.
const GENERIC = new Set(["yolo", "county", "california", "farm", "crop", "tree", "plant", "field", "grower", "orchard"]);

export function bm25Search(query: string, crop: string | undefined, topK = 3, minScore = 5): Passage[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const N = idx.docs.length;
  const scores = new Map<number, { s: number; hit: number }>();
  for (const t of terms) {
    const post = idx.postings[t];
    if (!post) continue;
    const idf = Math.log(1 + (N - post.length + 0.5) / (post.length + 0.5)) * (GENERIC.has(t) ? 0.3 : 1);
    for (const [doc, tf] of post) {
      const [dCrop] = idx.docs[doc];
      if (crop && dCrop !== crop && dCrop !== "generic") continue;      // crop guides + the untagged county documents
      const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (idx.lens[doc] / idx.avgdl)));
      const cur = scores.get(doc) ?? { s: 0, hit: 0 };
      cur.s += idf * norm; cur.hit += 1;
      scores.set(doc, cur);
    }
  }
  return [...scores.entries()]
    .filter(([, v]) => v.s >= minScore && (v.hit >= 2 || terms.length === 1))
    .sort((a, b) => b[1].s - a[1].s)
    .slice(0, topK)
    .map(([doc, v]) => {
      const [, source, page, text] = idx.docs[doc];
      return { text, source, page, score: Math.min(1, v.s / 25) };
    });
}

"""
Export the UC research PDFs as chunks (same chunking as ingest_pdfs.py) into worker/src/data/knowledge.json.

The Worker bundles this file and searches it locally (BM25) whenever Workers AI embeddings / Vectorize are unavailable
(free-quota outage), and as a zero-latency path. Run again after adding PDFs:  python backend/scripts/export_knowledge.py
"""
import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "research"
OUT = ROOT / "worker" / "src" / "data" / "knowledge.json"


def chunk_text(text: str, size: int = 1000, overlap: int = 200):
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += size - overlap
    return chunks


def crop_of(name: str) -> str:
    n = name.lower()
    for key, crop in [("almond", "almonds"), ("walnut", "walnuts"), ("tomato", "tomatoes"), ("rice", "rice"), ("grape", "grapes"), ("pistachio", "pistachios")]:
        if key in n:
            return crop
    return "generic"


STOP = set("a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your".split())


def stem(w: str) -> str:
    if len(w) > 5 and w.endswith("ing"):
        return w[:-3]
    if len(w) > 4 and w.endswith("ed"):
        return w[:-2]
    if len(w) > 4 and w.endswith("es"):
        return w[:-2]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def tokenize(text: str):
    # MUST stay identical to tokenize() in worker/src/brain/bm25.ts
    return [stem(w) for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) >= 2 and w not in STOP]


rows = []
for pdf in sorted(SRC.glob("*.pdf")):
    crop = crop_of(pdf.name)
    try:
        reader = PdfReader(pdf)
    except Exception as e:
        print(f"skip {pdf.name}: {e}")
        continue
    for i, page in enumerate(reader.pages):
        text = " ".join((page.extract_text() or "").split())
        if len(text) <= 50:
            continue
        for chunk in chunk_text(text):
            rows.append([crop, pdf.name, i + 1, chunk])
    print(f"{pdf.name[:60]:62} crop={crop:10} chunks so far: {len(rows)}")

# Prebuilt BM25 inverted index: the Worker only JSON-parses it (a cold Durable Object must not re-tokenize 1.7 MB)
postings: dict = {}
lens = []
for doc_id, (_, _, _, text) in enumerate(rows):
    toks = tokenize(text)
    lens.append(len(toks))
    tf: dict = {}
    for w in toks:
        tf[w] = tf.get(w, 0) + 1
    for w, c in tf.items():
        postings.setdefault(w, []).append([doc_id, c])

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"docs": rows, "lens": lens, "avgdl": sum(lens) / max(1, len(lens)), "postings": postings}, ensure_ascii=False, separators=(",", ":")))
print(f"\n{len(rows)} chunks, {len(postings)} terms -> {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")

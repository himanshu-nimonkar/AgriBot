import os
import sys
import json
import asyncio
import httpx
from pathlib import Path
from PyPDF2 import PdfReader
from dotenv import load_dotenv

# Load Environment Variables from project root
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")
VECTORIZE_INDEX = "agribot-knowledge"
EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"

# Setup Headers
headers = {
    "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    "Content-Type": "application/json"
}

# Directories
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "research"

async def generate_embeddings(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    """Generate embeddings using Cloudflare Workers AI."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{EMBEDDING_MODEL}"
    
    embeddings = []
    # Batch process to avoid hitting limits or payload size issues
    batch_size = 5
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        payload = {"text": batch}
        
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()
            # BGE returns an array of shape (batch, 768)
            embeddings.extend(result["result"]["data"])
        except Exception as e:
            print(f"Error generating embeddings for batch: {e}")
            if hasattr(e, 'response') and e.response:
                print(e.response.text)
            # Fill with empty to align arrays
            embeddings.extend([[] for _ in batch])
    
    return embeddings

async def insert_vectors(client: httpx.AsyncClient, vectors: list[dict]):
    """Insert vectors into Cloudflare Vectorize."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/vectorize/v2/indexes/{VECTORIZE_INDEX}/insert"
    
    # We must format as NDJSON for Vectorize bulk inserts
    ndjson_data = "\n".join(json.dumps(vp) for vp in vectors)
    
    try:
        response = await client.post(
            url, 
            content=ndjson_data, 
            headers={"Authorization": headers["Authorization"], "Content-Type": "application/x-ndjson"}
        )
        response.raise_for_status()
        res_json = response.json()
        print(f"✅ Inserted {len(vectors)} vectors successfully.")
        return res_json
    except Exception as e:
        print(f"❌ Error inserting vectors: {e}")
        if hasattr(e, 'response') and e.response:
            print(e.response.text)
        return None

def extract_text_from_pdf(file_path: Path) -> list[dict]:
    """Extract text from PDF pages, filtering out empty pages."""
    pages_data = []
    try:
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and len(text.strip()) > 50: # Only keep substantial pages
                pages_data.append({
                    "page": i + 1,
                    "text": text.strip()
                })
    except Exception as e:
        print(f"Failed to read {file_path.name}: {e}")
    return pages_data

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Basic sliding window chunking to ensure embeddings capture context."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += (chunk_size - overlap)
    return chunks

async def main():
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
        print("Error: Missing Cloudflare credentials in .env")
        sys.exit(1)
        
    pdf_files = list(DATA_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"No PDF files found in {DATA_DIR}")
        sys.exit(0)
        
    print(f"Found {len(pdf_files)} PDF files to process.")
    
    async with httpx.AsyncClient(timeout=120.0, headers=headers) as client:
        for pdf_file in pdf_files:
            print(f"\nProcessing {pdf_file.name}...")
            
            # Determine Crop based on filename (basic heuristic)
            crop_tag = "generic"
            filename_lower = pdf_file.name.lower()
            if "almond" in filename_lower: crop_tag = "almonds"
            elif "walnut" in filename_lower: crop_tag = "walnuts"
            elif "tomato" in filename_lower: crop_tag = "tomatoes"
            elif "rice" in filename_lower: crop_tag = "rice"
            elif "grape" in filename_lower: crop_tag = "grapes"
            elif "pistachio" in filename_lower: crop_tag = "pistachios"

            pages = extract_text_from_pdf(pdf_file)
            if not pages:
                print(f"  Warning: No readable text found in {pdf_file.name}")
                continue
                
            print(f"  Extracted {len(pages)} valid pages.")
            
            # Prepare chunks
            all_chunks = []
            for p in pages:
                # Text usually has a lot of newlines, unify it slightly
                clean_text = " ".join(p["text"].split())
                page_chunks = chunk_text(clean_text)
                for i, chunk in enumerate(page_chunks):
                    all_chunks.append({
                        "id": f"{pdf_file.stem}-p{p['page']}-c{i}",
                        "text": chunk,
                        "metadata": {
                            "source": pdf_file.name,
                            "page": p["page"],
                            "crop": crop_tag,
                            "text": chunk # Vectorize requires text in metadata for retrieval
                        }
                    })
            
            print(f"  Created {len(all_chunks)} text chunks. Generating embeddings...")
            
            # Batch process in groups of 20 chunks to avoid massive payloads
            for i in range(0, len(all_chunks), 20):
                batch_chunks = all_chunks[i:i+20]
                texts = [c["text"] for c in batch_chunks]
                
                embeddings = await generate_embeddings(client, texts)
                
                # Prepare Vectorize payload
                vectors_payload = []
                for c, emb in zip(batch_chunks, embeddings):
                    if emb: # Skip failed embeddings
                        vectors_payload.append({
                            "id": c["id"],
                            "values": emb,
                            "namespace": "default", # Optional, but good practice
                            "metadata": c["metadata"]
                        })
                
                if vectors_payload:
                    print(f"  Pushing batch {i//20 + 1}/{(len(all_chunks)+19)//20} ({len(vectors_payload)} vectors)...")
                    await insert_vectors(client, vectors_payload)

if __name__ == "__main__":
    asyncio.run(main())

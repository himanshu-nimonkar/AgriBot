"""
Data Ingestion Script
Parses Agricultural Crop Report 2024 PDF and ingests into Cloudflare Vectorize.
"""

import asyncio
import json
import os
import sys
from typing import List, Dict, Any
from pathlib import Path

# Add parent directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdfplumber
import httpx
from config import settings


class DataIngester:
    """Handles PDF parsing and vector ingestion."""
    
    EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"
    CHUNK_SIZE = 500  # Characters per chunk
    CHUNK_OVERLAP = 50
    
    def __init__(self):
        self.account_id = settings.cloudflare_account_id
        self.api_token = settings.cloudflare_api_token
        self.index_name = settings.cloudflare_vectorize_index
        
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        
        self.client = httpx.Client(timeout=60.0, headers=self.headers)
    
    def parse_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """
        Parse the Agricultural Crop Report PDF.
        
        Extracts:
        - Text chunks for vectorization
        - Tables with crop data
        - Economic statistics
        """
        print(f"[INFO] Parsing PDF: {pdf_path}")
        
        all_text = []
        tables = []
        
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                # Extract text
                text = page.extract_text() or ""
                if text.strip():
                    all_text.append({
                        "page": page_num,
                        "text": text
                    })
                
                # Extract tables
                page_tables = page.extract_tables()
                for table in page_tables:
                    if table and len(table) > 1:
                        tables.append({
                            "page": page_num,
                            "data": table
                        })
        
        print(f"   Found {len(all_text)} pages with text")
        print(f"   Found {len(tables)} tables")
        
        return {"text": all_text, "tables": tables}
    
    def chunk_text(self, pages: List[Dict]) -> List[Dict]:
        """Split text into overlapping chunks for better retrieval."""
        chunks = []
        
        for page_data in pages:
            page = page_data["page"]
            text = page_data["text"]
            
            # Split into sentences first
            sentences = text.replace('\n', ' ').split('. ')
            
            current_chunk = ""
            for sentence in sentences:
                if len(current_chunk) + len(sentence) < self.CHUNK_SIZE:
                    current_chunk += sentence + ". "
                else:
                    if current_chunk.strip():
                        chunks.append({
                            "text": current_chunk.strip(),
                            "page": page,
                            "text": current_chunk.strip(),
                            "page": page,
                            "source": Path(self.current_pdf_name).name if hasattr(self, 'current_pdf_name') else "Agricultural Crop Report 2024"
                        })
                    # Start new chunk with overlap
                    overlap_text = current_chunk[-self.CHUNK_OVERLAP:] if len(current_chunk) > self.CHUNK_OVERLAP else ""
                    current_chunk = overlap_text + sentence + ". "
            
            # Add remaining text
            if current_chunk.strip():
                chunks.append({
                    "text": current_chunk.strip(),
                    "page": page,
                    "text": current_chunk.strip(),
                    "page": page,
                    "source": Path(self.current_pdf_name).name if hasattr(self, 'current_pdf_name') else "Agricultural Crop Report 2024"
                })
        
        print(f"   Created {len(chunks)} text chunks")
        return chunks
    
    def extract_crop_data(self, tables: List[Dict]) -> List[Dict]:
        """Extract structured crop data from tables."""
        crop_data = []
        
        # Keywords to identify crop tables
        crop_keywords = ["almond", "tomato", "grape", "rice", "pistachio", "walnut", 
                        "acreage", "value", "production", "yield"]
        
        for table_info in tables:
            table = table_info["data"]
            page = table_info["page"]
            
            # Check if this looks like a crop data table
            header = table[0] if table else []
            header_text = " ".join(str(cell).lower() for cell in header if cell)
            
            if any(kw in header_text for kw in crop_keywords):
                for row in table[1:]:
                    if row and row[0]:
                        crop_data.append({
                            "text": " | ".join(str(cell) for cell in row if cell),
                            "page": page,
                            "source": "Agricultural Crop Report 2024 - Table",
                            "type": "table_row"
                        })
        
        print(f"   Extracted {len(crop_data)} crop data rows")
        return crop_data
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Cloudflare Workers AI."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.EMBEDDING_MODEL}"
        
        # Batch in groups of 100
        all_embeddings = []
        batch_size = 100
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            print(f"   Generating embeddings for batch {i//batch_size + 1}...")
            
            response = self.client.post(url, json={"text": batch})
            
            if response.status_code != 200:
                print(f"   [WARNING] Embedding error: {response.text}")
                continue
            
            result = response.json()
            embeddings = result.get("result", {}).get("data", [])
            all_embeddings.extend(embeddings)
        
        return all_embeddings
    
    def create_vectorize_index(self):
        """Create Vectorize index if it doesn't exist."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/vectorize/v2/indexes"
        
        # Check if index exists
        response = self.client.get(url)
        if response.status_code == 200:
            indexes = response.json().get("result", [])
            for idx in indexes:
                if idx.get("name") == self.index_name:
                    print(f"[INFO] Index '{self.index_name}' already exists")
                    return True
        
        # Create new index
        print(f"[INFO] Creating Vectorize index '{self.index_name}'...")
        
        payload = {
            "name": self.index_name,
            "config": {
                "dimensions": 768,  # BGE base model dimension
                "metric": "cosine"
            }
        }
        
        response = self.client.post(url, json=payload)
        
        if response.status_code in [200, 201]:
            print(f"[SUCCESS] Index created successfully")
            return True
        else:
            print(f"[WARNING] Index creation failed: {response.text}")
            return False
    
    def upsert_vectors(self, chunks: List[Dict], embeddings: List[List[float]]):
        """Upsert vectors to Cloudflare Vectorize."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/vectorize/v2/indexes/{self.index_name}/upsert"
        
        # Prepare vectors in ndjson format
        vectors = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            # Generate unique ID based on source filename (truncated to avoid 64 byte limit)
            source_name = chunk.get("source", "unknown").replace(" ", "_").lower()
            # Truncate source_name if too long (leave room for _chunk_XXX)
            max_source_len = 50 
            if len(source_name) > max_source_len:
                source_name = source_name[:max_source_len]
            
            unique_id = f"{source_name}_chunk_{i}"
            
            vectors.append({
                "id": unique_id,
                "values": embedding,
                "metadata": {
                    "text": chunk["text"][:1000],  # Limit metadata size
                    "page": chunk.get("page"),
                    "source": chunk.get("source", "Unknown"),
                    "crop": self._detect_crop(chunk["text"])
                }
            })
        
        # Upsert in batches
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i+batch_size]
            print(f"   Upserting batch {i//batch_size + 1}...")
            
            # Vectorize expects ndjson format
            ndjson = "\n".join(json.dumps(v) for v in batch)
            
            response = self.client.post(
                url,
                content=ndjson,
                headers={**self.headers, "Content-Type": "application/x-ndjson"}
            )
            
            if response.status_code != 200:
                print(f"   [WARNING] Upsert error: {response.text}")
    
    def _detect_crop(self, text: str) -> str:
        """Detect which crop a text chunk is about."""
        text_lower = text.lower()
        
        crops = {
            "almonds": ["almond", "hull rot", "navel orangeworm"],
            "tomatoes": ["tomato", "tomatoes", "brix", "curly top"],
            "grapes": ["grape", "wine", "mildew", "veraison"],
            "rice": ["rice", "blast", "weevil", "booting"],
            "pistachios": ["pistachio", "botryosphaeria"],
            "walnuts": ["walnut", "blight", "codling moth", "sunburn"]
        }
        
        for crop, keywords in crops.items():
            if any(kw in text_lower for kw in keywords):
                return crop
        
        return "general"
    
    def add_uc_ipm_data(self):
        """Add UC IPM guidelines for the Top 6 crops."""
        print("[INFO] Adding UC IPM knowledge base...")
        
        # Pre-defined UC IPM knowledge (would normally be scraped)
        uc_ipm_data = [
            # Almonds
            {
                "text": "Hull Rot Management in Almonds: Hull rot is caused by Rhizopus stolonifer and Monilinia species. Infection occurs when hulls begin to split. Key management: Avoid over-irrigation during hull split (July-August). Apply fungicides at hull split if history of disease. Shake trees promptly after hull split. Remove mummy nuts to reduce inoculum. [Source: UC IPM Almond Guidelines]",
                "source": "UC IPM - Almonds",
                "crop": "almonds"
            },
            {
                "text": "Navel Orangeworm (NOW) in Almonds: NOW is the primary insect pest of almonds in California. Eggs laid on mummy nuts and split hulls. Management: Sanitize orchards by destroying mummy nuts by March 1. Monitor with egg traps. Apply insecticides at hull split. Early harvest reduces exposure. Degree-day model: 1900 DD above 55°F for first flight. [Source: UC IPM NOW Management]",
                "source": "UC IPM - Almonds",
                "crop": "almonds"
            },
            
            # Tomatoes
            {
                "text": "Curly Top Virus in Processing Tomatoes: Transmitted by beet leafhopper (Circulifer tenellus). Symptoms: upward leaf curling, plant stunting, reduced fruit set. No cure once infected. Management: Plant resistant varieties. Use reflective mulches. Remove infected plants. Avoid planting near sugar beets. Peak transmission: May-June when leafhoppers migrate from rangeland. [Source: UC IPM Tomato Guidelines]",
                "source": "UC IPM - Tomatoes",
                "crop": "tomatoes"
            },
            {
                "text": "Deficit Irrigation for Processing Tomatoes: Regulated Deficit Irrigation (RDI) can increase Brix (sugar content) by 0.5-1.0 degrees. Apply 50-75% of ET during fruit ripening stage. Monitor soil moisture to avoid extreme stress. Benefits: Higher soluble solids, better paste quality, reduced cracking. Risk: Yield reduction if over-stressed. [Source: UC Davis Irrigation Guidelines]",
                "source": "UC Davis - Tomatoes",
                "crop": "tomatoes"
            },
            
            # Wine Grapes
            {
                "text": "Powdery Mildew in Wine Grapes: Caused by Erysiphe necator. Critical period: bloom through veraison. Conditions favoring disease: 70-85°F, shade, dense canopy, humidity >40%. Management: Apply sulfur or DMI fungicides preventatively. Improve air circulation through canopy management. Monitor with Gubler-Thomas risk model. [Source: UC IPM Grape Guidelines]",
                "source": "UC IPM - Grapes",
                "crop": "grapes"
            },
            {
                "text": "Smoke Taint Risk in Wine Grapes: Volatile phenols from wildfire smoke absorb into grape skins. Most susceptible: veraison through harvest. Glycoconjugates released during fermentation create smoky, ashy flavors. Testing required before harvest decisions. No effective post-exposure treatment. Consider early harvest if smoke exposure occurs. [Source: UC Davis Smoke Taint Research]",
                "source": "UC Davis - Grapes",
                "crop": "grapes"
            },
            
            # Rice
            {
                "text": "Rice Blast Disease: Caused by Magnaporthe oryzae. Symptoms: Diamond-shaped lesions on leaves, neck rot, panicle blast. Conditions favoring: Cool nights (below 68°F), high humidity, dense stands. Management: Resistant varieties (M-206, M-209). Avoid excessive nitrogen. Maintain continuous flood. Apply fungicides at boot to heading stage if risk is high. [Source: UC IPM Rice Guidelines]",
                "source": "UC IPM - Rice",
                "crop": "rice"
            },
            {
                "text": "Thermal Shock at Rice Booting Stage: Cold temperatures (below 59°F) during microsporogenesis cause sterile florets. Critical period: 14-7 days before heading. Deep water (4-6 inches) provides thermal protection. Drain for warm periods, reflood when cold expected. GDD model: 2000-2200 from emergence to heading for California varieties. [Source: UC Rice Production Manual]",
                "source": "UC Davis - Rice",
                "crop": "rice"
            },
            
            # Pistachios
            {
                "text": "Botryosphaeria Panicle and Shoot Blight in Pistachios: Causes killing of clusters and shoots. Sporulation during rain events from infected tissue. Management: Prune out dead wood. Apply fungicides at late bloom (3+ hours wetness >60°F). Avoid overhead irrigation. Remove mummy clusters. Most severe in wet springs. [Source: UC IPM Pistachio Guidelines]",
                "source": "UC IPM - Pistachios",
                "crop": "pistachios"
            },
            
            # Walnuts
            {
                "text": "Walnut Blight: Caused by Xanthomonas arboricola pv. juglandis. Infects catkins, shoots, leaves, and nuts. Rain splash spreads bacteria. Management: Copper sprays at bud break and bloom. Apply before rain events. Prune for air circulation. Chandler and Howard varieties are susceptible. Resistant: Tulare, Cisco. [Source: UC IPM Walnut Guidelines]",
                "source": "UC IPM - Walnuts",
                "crop": "walnuts"
            },
            {
                "text": "Sunburn Prevention in Walnuts: Sunburn occurs when nut surface exceeds 113°F. Most common on south/southwest exposed nuts. White kaolin clay sprays reflect heat. Apply in June-July when heatwaves forecast. Maintain good canopy cover through irrigation and nutrition. Evaporative cooling (overhead sprinklers) during heatwaves can reduce damage by 50%. [Source: UC Walnut Production Manual]",
                "source": "UC Davis - Walnuts",
                "crop": "walnuts"
            }
        ]
        
        # Generate embeddings for UC IPM data
        texts = [item["text"] for item in uc_ipm_data]
        embeddings = self.generate_embeddings(texts)
        
        if embeddings:
            # Prepare for upsert
            chunks = [{"text": item["text"], "source": item["source"], "crop": item["crop"]} 
                     for item in uc_ipm_data]
            
            # Offset IDs to avoid collision with PDF data
            url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/vectorize/v2/indexes/{self.index_name}/upsert"
            
            vectors = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                vectors.append({
                    "id": f"ucipm_{i}",
                    "values": embedding,
                    "metadata": {
                        "text": chunk["text"],
                        "source": chunk["source"],
                        "crop": chunk["crop"]
                    }
                })
            
            ndjson = "\n".join(json.dumps(v) for v in vectors)
            response = self.client.post(
                url,
                content=ndjson,
                headers={**self.headers, "Content-Type": "application/x-ndjson"}
            )
            
            if response.status_code == 200:
                print(f"[SUCCESS] Added {len(uc_ipm_data)} UC IPM knowledge chunks")
            else:
                print(f"[WARNING] UC IPM upsert error: {response.text}")
    
    def run(self, pdf_path: str):
        """Run the full ingestion pipeline."""
        print("\n" + "="*50)
        self.current_pdf_name = pdf_path
        print("\n" + "="*50)
        print(f"[INFO] Processing: {Path(pdf_path).name}")
        print("="*50 + "\n")
        
        # Step 1: Create Vectorize index
        if not self.create_vectorize_index():
            print("[ERROR] Failed to create index. Aborting.")
            return
        
        # Step 2: Parse PDF
        pdf_data = self.parse_pdf(pdf_path)
        
        # Step 3: Create chunks
        text_chunks = self.chunk_text(pdf_data["text"])
        table_chunks = self.extract_crop_data(pdf_data["tables"])
        all_chunks = text_chunks + table_chunks
        
        # Step 4: Generate embeddings
        print("\n[INFO] Generating embeddings...")
        texts = [chunk["text"] for chunk in all_chunks]
        embeddings = self.generate_embeddings(texts)
        
        if not embeddings:
            print("[ERROR] Failed to generate embeddings. Aborting.")
            return
        
        # Step 5: Upsert to Vectorize
        print("\n[INFO] Uploading to Vectorize...")
        self.upsert_vectors(all_chunks, embeddings)
        
        # Step 6: Add UC IPM data
        print("\n")
        self.add_uc_ipm_data()
        
        # Save structured data locally
        data_dir = Path(__file__).parent.parent / "data"
        data_dir.mkdir(exist_ok=True)
        
        with open(data_dir / "crop_report_2024.json", "w") as f:
            json.dump({
                "chunks": len(all_chunks),
                "tables": len(pdf_data["tables"]),
                "source": pdf_path
            }, f, indent=2)
        
        print("\n" + "="*50)
        print("[SUCCESS] Ingestion complete!")
        print(f"   - {len(all_chunks)} chunks from PDF")
        print(f"   - UC IPM guidelines for 6 crops")
        print("="*50 + "\n")


    def get_index_stats(self):
        """Get statistics about the vector index."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/vectorize/v2/indexes/{self.index_name}"
        
        response = self.client.get(url)
        if response.status_code == 200:
            info = response.json().get("result", {})
            print("\n[INFO] Index Statistics:")
            print(f"   - Name: {info.get('name')}")
            print(f"   - Dimensions: {info.get('config', {}).get('dimensions')}")
            print(f"   - Metric: {info.get('config', {}).get('metric')}")
            # Vector count is often in a separate endpoint or part of the detail
            # Cloudflare API v2 for indexes often returns 'vectors_count' or similar
            print(f"   - Vector Count: {info.get('vectors_count', 'Unknown')}")
            print(f"   - Created On: {info.get('created_on')}")
            
            # Explicitly check count if not in main info
            # We can't easily count without iterating, but the main info usually has it.
        else:
            print(f"[ERROR] Failed to get index stats: {response.text}")

    def process_path(self, path_str: str):
        """Process a single file or directory of PDFs."""
        path = Path(path_str)
        
        if path.is_file():
            if path.suffix.lower() == ".pdf":
                self.run(str(path))
            else:
                print(f"[WARNING] Skipped non-PDF file: {path.name}")
        elif path.is_dir():
            print(f"[INFO] Scanning directory: {path}")
            pdf_files = list(path.glob("**/*.pdf"))
            print(f"   Found {len(pdf_files)} PDF files")
            
            for pdf_file in pdf_files:
                self.run(str(pdf_file))
        else:
            print(f"[ERROR] Path not found: {path}")

if __name__ == "__main__":
    # Default to scanning research directory
    target_path = str(Path(__file__).parent.parent.parent / "data/research")
    
    ingester = DataIngester()
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--stats":
            ingester.get_index_stats()
            sys.exit(0)
        else:
            target_path = sys.argv[1]
    
    ingester.process_path(target_path)

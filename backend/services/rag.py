"""
RAG Service - Cloudflare Vectorize Integration
Provides semantic search over agricultural knowledge base.
FREE tier: 10,000 neurons/day.
"""

import httpx
import json
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings

# Import Morph service for reranking (additive, not replacing Cloudflare)
try:
    from services.morph_service import morph_service
except ImportError:
    morph_service = None


@dataclass
class SearchResult:
    """A search result from the knowledge base."""
    text: str
    source: str
    page: Optional[int]
    score: float
    metadata: Dict[str, Any]


@dataclass
class RAGContext:
    """Combined context for RAG response generation."""
    query: str
    crop: str
    results: List[SearchResult]
    economic_context: Optional[str]
    

class CloudflareRAGService:
    """Cloudflare Workers AI + Vectorize based RAG service."""
    
    EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"
    LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast"
    
    def __init__(self):
        self.account_id = settings.cloudflare_account_id
        self.api_token = settings.cloudflare_api_token
        self.index_name = settings.cloudflare_vectorize_index
        
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        
        self.client = httpx.AsyncClient(timeout=60.0, headers=self.headers)
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using Cloudflare Workers AI."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.EMBEDDING_MODEL}"
        
        payload = {"text": [text]}
        
        response = await self.client.post(url, json=payload)
        response.raise_for_status()
        
        result = response.json()
        return result["result"]["data"][0]
    
    async def query_vectors(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict] = None
    ) -> List[Dict]:
        """Query Vectorize index for similar vectors."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/vectorize/v2/indexes/{self.index_name}/query"
        
        payload = {
            "vector": query_embedding,
            "topK": top_k,
            "returnMetadata": "all",
            "returnValues": False
        }
        
        if filter_metadata:
            payload["filter"] = filter_metadata
        
        response = await self.client.post(url, json=payload)
        
        if response.status_code == 404:
            # Index doesn't exist yet
            return []
        
        response.raise_for_status()
        result = response.json()
        
        return result.get("result", {}).get("matches", [])
    
    async def search_knowledge(
        self,
        query: str,
        crop: Optional[str] = None,
        top_k: int = 5
    ) -> List[SearchResult]:
        """
        Search the agricultural knowledge base.
        
        Args:
            query: Natural language query
            crop: Optional crop filter
            top_k: Number of results
            
        Returns:
            List of relevant SearchResult objects
        """
        try:
            # Generate query embedding
            query_embedding = await self.generate_embedding(query)
            
            # Build filter if crop specified
            filter_metadata = None
            if crop:
                filter_metadata = {"crop": {"$eq": crop.lower()}}
            
            # Query vectors
            matches = await self.query_vectors(query_embedding, top_k, filter_metadata)
            
            results = []
            for match in matches:
                metadata = match.get("metadata", {})
                results.append(SearchResult(
                    text=metadata.get("text", ""),
                    source=metadata.get("source", "Unknown"),
                    page=metadata.get("page"),
                    score=match.get("score", 0),
                    metadata=metadata
                ))
            
            # ---- Morph Rerank (additive second-stage) ----
            # Re-orders results by relevance using Morph's GPU reranker.
            # Falls back silently to original Vectorize order if unavailable.
            if results and morph_service and morph_service.enabled:
                try:
                    documents = [r.text for r in results if r.text]
                    if documents:
                        reranked = await morph_service.rerank_results(
                            query=query,
                            documents=documents,
                            top_n=top_k
                        )
                        if reranked:
                            # Rebuild results in reranked order
                            reranked_results = []
                            for rr in reranked:
                                if rr.index < len(results):
                                    original = results[rr.index]
                                    # Preserve original data, update score to rerank score
                                    reranked_results.append(SearchResult(
                                        text=original.text,
                                        source=original.source,
                                        page=original.page,
                                        score=rr.relevance_score,
                                        metadata={**original.metadata, "morph_rerank_score": rr.relevance_score, "original_vectorize_score": original.score}
                                    ))
                            if reranked_results:
                                results = reranked_results
                                print(f"[RAG] Results reranked by Morph ({len(reranked_results)} items)")
                except Exception as rerank_err:
                    print(f"[RAG] Morph rerank failed (keeping original order): {rerank_err}")
            # ---- End Morph Rerank ----
            
            return results

        except Exception as e:
            print(f"RAG API Error (Vectorize/Embedding): {e}")
            print("RAG: API failed. Attempting local fallback...")
            
            results = []
            try:
                import glob
                # Search recursively in data directory for common text/data formats
                local_files = []
                for ext in ["txt", "md", "pdf", "json"]:
                    local_files.extend(glob.glob(f"./data/**/*.{ext}", recursive=True))
                
                print(f"RAG: Found {len(local_files)} local files: {local_files}")

                for fpath in local_files:
                    fname = os.path.basename(fpath)
                    # Simple keyword matching
                    if crop and crop.lower() in fname.lower():
                        results.append(SearchResult(
                            text=f"Relevant document found: {fname}",
                            source=fname,
                            page=1,
                            score=0.5,
                            metadata={"source": fname, "path": fpath}
                        ))
                    elif any(q in fname.lower() for q in query.lower().split()):
                        results.append(SearchResult(
                            text=f"Relevant document found: {fname}",
                            source=fname,
                            page=1,
                            score=0.4,
                            metadata={"source": fname, "path": fpath}
                        ))
                
                # If still no results, return available files as context
                if not results and local_files:
                     for fpath in local_files[:3]: 
                        fname = os.path.basename(fpath)
                        results.append(SearchResult(
                            text=f"Available knowledge source: {fname}",
                            source=fname,
                            page=1,
                            score=0.1,
                            metadata={"source": fname, "path": fpath}
                        ))

            except Exception as fallback_e:
                print(f"Local RAG Fallback Error: {fallback_e}")
            
            return results
    
    async def get_crop_economic_context(self, crop: str) -> Optional[str]:
        """Get economic context for a crop from the 2024 report."""
        results = await self.search_knowledge(
            f"{crop} 2024 value acreage production Yolo County",
            crop=None,  # Search all docs
            top_k=2
        )
        
        if results:
            return "\n".join([r.text for r in results])
        return None
    
    async def build_rag_context(
        self,
        query: str,
        crop: str,
        additional_context: Optional[str] = None
    ) -> RAGContext:
        """
        Build complete RAG context for a query.
        
        Args:
            query: User's question
            crop: Target crop
            additional_context: Weather/satellite data
            
        Returns:
            RAGContext with all relevant information
        """
        # Search for relevant documents
        try:
            results = await self.search_knowledge(query, crop, top_k=5)
        except Exception:
            results = []
        
        # Fallback: If no vector results (or API error), try basic local file search
        if not results:
            print("RAG: Vector search failed or empty. Attempting local fallback...")
            try:
                import glob
                # Search recursively in data directory for common text/data formats
                local_files = []
                for ext in ["txt", "md", "pdf", "json"]:
                    local_files.extend(glob.glob(f"./data/**/*.{ext}", recursive=True))
                
                print(f"RAG: Found {len(local_files)} local files: {local_files}")

                for fpath in local_files:
                    fname = os.path.basename(fpath)
                    # Simple keyword matching
                    if crop and crop.lower() in fname.lower():
                        results.append(SearchResult(
                            text=f"Relevant document found: {fname}",
                            source=fname,
                            page=1,
                            score=0.5,
                            metadata={"source": fname, "path": fpath}
                        ))
                    elif any(q in fname.lower() for q in query.lower().split()):
                        results.append(SearchResult(
                            text=f"Relevant document found: {fname}",
                            source=fname,
                            page=1,
                            score=0.4,
                            metadata={"source": fname, "path": fpath}
                        ))
                
                # If still no results, just return the list of available files as "context"
                # This ensures the user sees *something* instead of nothing.
                if not results and local_files:
                     for fpath in local_files[:3]: # Limit to top 3 to avoid spam
                        fname = os.path.basename(fpath)
                        results.append(SearchResult(
                            text=f"Available knowledge source: {fname}",
                            source=fname,
                            page=1,
                            score=0.1,
                            metadata={"source": fname, "path": fpath}
                        ))

            except Exception as e:
                print(f"Local RAG Fallback Error: {e}")

        # Get economic context
        
        # Get economic context
        economic = await self.get_crop_economic_context(crop)
        
        return RAGContext(
            query=query,
            crop=crop,
            results=results,
            economic_context=economic
        )
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()


# Singleton
rag_service = CloudflareRAGService()


async def search_knowledge(query: str, crop: Optional[str] = None) -> List[SearchResult]:
    """Convenience function for knowledge search."""
    return await rag_service.search_knowledge(query, crop)


async def build_context(query: str, crop: str) -> RAGContext:
    """Convenience function for building RAG context."""
    return await rag_service.build_rag_context(query, crop)

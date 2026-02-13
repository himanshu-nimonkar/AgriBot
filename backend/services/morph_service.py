"""
Morph LLM Service - Integration Module
Provides Morph Rerank, Model Router (via Node.js SDK bridge), and WarpGrep.
Additive to existing Cloudflare pipeline — never replaces existing services.
"""

import asyncio
import httpx
import json
import subprocess
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings


# ==================
# Data Classes
# ==================

@dataclass
class RerankedResult:
    """A search result after Morph reranking."""
    index: int
    relevance_score: float
    original_text: str
    original_source: str


@dataclass
class RouterClassification:
    """Morph Router difficulty classification."""
    difficulty: str  # "easy", "medium", "hard", "needs_info"


@dataclass
class WarpGrepResult:
    """WarpGrep search result."""
    success: bool
    contexts: List[Dict[str, str]]  # [{file, content}]
    error: Optional[str] = None


# ==================
# Morph Service
# ==================

class MorphService:
    """
    Morph LLM integration service.
    All calls are additive — they enhance existing Cloudflare pipeline.
    """

    BASE_URL = "https://api.morphllm.com/v1"
    RERANK_MODEL = "morph-rerank-v4"
    WARPGREP_MODEL = "morph-warp-grep-v1"
    
    # Path to Node.js router bridge script
    ROUTER_BRIDGE_PATH = os.path.join(os.path.dirname(__file__), "morph_router_bridge.js")

    def __init__(self):
        self.api_key = settings.morph_api_key
        self.enabled = bool(self.api_key)

        if not self.enabled:
            print("[Morph] No MORPH_API_KEY found. Morph features disabled.")
            return

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers=self.headers
        )
        print("[Morph] Service initialized successfully.")

    # ------------------
    # Rerank API
    # ------------------

    async def rerank_results(
        self,
        query: str,
        documents: List[str],
        top_n: int = 5
    ) -> List[RerankedResult]:
        """
        Rerank search results using Morph's GPU-accelerated reranker.
        Called AFTER Cloudflare Vectorize returns initial results.
        """
        if not self.enabled or not documents:
            return []

        try:
            response = await self.client.post(
                f"{self.BASE_URL}/rerank",
                json={
                    "model": self.RERANK_MODEL,
                    "query": query,
                    "documents": documents,
                    "top_n": min(top_n, len(documents))
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("results", []):
                idx = item.get("index", 0)
                score = item.get("relevance_score", 0)
                results.append(RerankedResult(
                    index=idx,
                    relevance_score=score,
                    original_text=documents[idx] if idx < len(documents) else "",
                    original_source=""
                ))

            print(f"[Morph Rerank] Reranked {len(documents)} docs → top {len(results)} (scores: {[f'{r.relevance_score:.3f}' for r in results]})")
            return results

        except Exception as e:
            print(f"[Morph Rerank] Error (falling back to original order): {e}")
            return []

    # ------------------
    # Model Router (via Node.js SDK bridge)
    # ------------------

    async def classify_difficulty(self, query: str) -> RouterClassification:
        """
        Use Morph's Model Router to classify query difficulty.
        Calls Node.js bridge script that uses official @morphllm/morphsdk.
        Returns: easy / medium / hard / needs_info
        """
        if not self.enabled:
            return RouterClassification(difficulty="unknown")

        try:
            # Run Node.js bridge as subprocess
            env = os.environ.copy()
            env["MORPH_API_KEY"] = self.api_key
            
            # Run async to not block the event loop
            process = await asyncio.create_subprocess_exec(
                "node", self.ROUTER_BRIDGE_PATH, query,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=os.path.dirname(self.ROUTER_BRIDGE_PATH)
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), 
                timeout=15.0
            )
            
            output = stdout.decode("utf-8").strip()
            if not output:
                print(f"[Morph Router] Empty response. stderr: {stderr.decode('utf-8', errors='ignore')[:200]}")
                return RouterClassification(difficulty="medium")
            
            data = json.loads(output)
            difficulty = data.get("difficulty", "medium")
            
            if data.get("error"):
                print(f"[Morph Router] SDK error: {data['error']}. Difficulty: {difficulty}")
            else:
                print(f"[Morph Router] Query classified as: {difficulty}")
            
            return RouterClassification(difficulty=difficulty)

        except asyncio.TimeoutError:
            print("[Morph Router] Timeout (>15s). Defaulting to 'medium'.")
            return RouterClassification(difficulty="medium")
        except Exception as e:
            print(f"[Morph Router] Error: {e}. Defaulting to 'medium'.")
            return RouterClassification(difficulty="medium")

    # ------------------
    # WarpGrep API (multi-turn tool-calling)
    # ------------------

    async def warpgrep_search(
        self,
        query: str,
        repo_structure: Optional[str] = None
    ) -> WarpGrepResult:
        """
        Use Morph WarpGrep to search agricultural knowledge base.
        
        IMPORTANT: WarpGrep returns tool calls as XML in the content field:
          <tool_call>{"name": "grep", "arguments": {...}}</tool_call>
        NOT in the standard OpenAI tool_calls array.
        We must parse these, execute them locally, and feed results back.
        """
        if not self.enabled:
            return WarpGrepResult(success=False, contexts=[], error="Morph not enabled")

        try:
            if not repo_structure:
                repo_structure = self._build_data_structure()

            user_content = f"""<repo_structure>
{repo_structure}
</repo_structure>
<search_string>
{query}
</search_string>"""

            messages = [{"role": "user", "content": user_content}]
            contexts = []
            max_iterations = 5

            for iteration in range(max_iterations):
                print(f"[Morph WarpGrep] Iteration {iteration+1}/{max_iterations}")
                response = await self.client.post(
                    f"{self.BASE_URL}/chat/completions",
                    json={
                        "model": self.WARPGREP_MODEL,
                        "messages": messages,
                        "tools": self._warpgrep_tools(),
                        "tool_choice": "auto"
                    }
                )
                response.raise_for_status()
                data = response.json()

                choices = data.get("choices", [])
                if not choices:
                    print(f"[Morph WarpGrep] No choices in response, breaking")
                    break

                message = choices[0].get("message", {})
                content = message.get("content", "") or ""
                tool_calls_array = message.get("tool_calls", [])
                
                print(f"[Morph WarpGrep] Content length: {len(content)}, tool_calls: {len(tool_calls_array)}, has_xml: {'<tool_call>' in content}")

                # --- Path 1: Standard OpenAI tool_calls array ---
                if tool_calls_array:
                    print(f"[Morph WarpGrep] Path 1: Processing {len(tool_calls_array)} standard tool calls")
                    messages.append(message)
                    for tool_call in tool_calls_array:
                        func = tool_call.get("function", {})
                        tool_name = func.get("name", "")
                        try:
                            tool_args = json.loads(func.get("arguments", "{}"))
                        except json.JSONDecodeError:
                            tool_args = {}

                        if tool_name == "finish":
                            for ctx in tool_args.get("context", []):
                                contexts.append({
                                    "file": ctx.get("file_path", "unknown"),
                                    "content": ctx.get("content", "")
                                })
                            print(f"[Morph WarpGrep] Finished with {len(contexts)} contexts")
                            return WarpGrepResult(success=True, contexts=contexts)

                        tool_result = self._execute_warpgrep_tool(tool_name, tool_args)
                        print(f"[Morph WarpGrep] Executed {tool_name}: {len(tool_result)} chars")
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.get("id", f"call_{iteration}"),
                            "content": tool_result
                        })
                    continue

                # --- Path 2: XML-based tool_calls in content field ---
                if "<tool_call>" in content:
                    import re
                    # Capture everything between tags (handles nested JSON braces)
                    xml_matches = re.findall(r'<tool_call>\s*(.*?)\s*</tool_call>', content, re.DOTALL)
                    print(f"[Morph WarpGrep] Path 2: Found {len(xml_matches)} XML tool calls")
                    
                    if not xml_matches:
                        # No parseable tool calls, treat as plain text
                        contexts.append({"file": "summary", "content": content})
                        break

                    # Add the assistant message to conversation
                    messages.append({"role": "assistant", "content": content})
                    
                    # Process each XML tool call
                    all_results = []
                    found_finish = False
                    
                    for match_str in xml_matches:
                        try:
                            tc_data = json.loads(match_str)
                        except json.JSONDecodeError as jde:
                            print(f"[Morph WarpGrep] JSON parse error: {jde}, raw: {match_str[:200]}")
                            continue
                        
                        tool_name = tc_data.get("name", "")
                        tool_args = tc_data.get("arguments", {})
                        print(f"[Morph WarpGrep] XML tool: {tool_name}")
                        
                        if tool_name == "finish":
                            found_finish = True
                            for ctx in tool_args.get("context", []):
                                contexts.append({
                                    "file": ctx.get("file_path", "unknown"),
                                    "content": ctx.get("content", "")
                                })
                        else:
                            # Execute tool locally
                            result = self._execute_warpgrep_tool(tool_name, tool_args)
                            print(f"[Morph WarpGrep] Executed {tool_name}: {len(result)} chars")
                            all_results.append(f"[{tool_name}({json.dumps(tool_args)})]\n{result}")
                    
                    if found_finish:
                        print(f"[Morph WarpGrep] Finished with {len(contexts)} contexts")
                        return WarpGrepResult(success=True, contexts=contexts)
                    
                    # Feed tool results back to the model
                    if all_results:
                        combined_results = "\n\n".join(all_results)
                        print(f"[Morph WarpGrep] Feeding back {len(all_results)} tool results")
                        combined_results = "\n\n".join(all_results)
                        messages.append({"role": "user", "content": f"Tool results:\n{combined_results}"})
                    continue

                # --- Path 3: Plain text response (no tool calls) ---
                if content:
                    # Strip out any <tool_call> tags that might have been processed but left in the text
                    clean_content = re.sub(r'<tool_call>.*?</tool_call>', '', content, flags=re.DOTALL).strip()
                    if clean_content:
                        contexts.append({"file": "summary", "content": clean_content})
                break

            result_success = len(contexts) > 0
            if result_success:
                print(f"[Morph WarpGrep] Completed: {len(contexts)} contexts found")
            return WarpGrepResult(success=result_success, contexts=contexts)

        except Exception as e:
            print(f"[Morph WarpGrep] Search error: {e}")
            return WarpGrepResult(success=False, contexts=[], error=str(e))


    def _build_data_structure(self) -> str:
        """Build a file tree string from the data/research directory."""
        data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        if not os.path.exists(data_dir):
            return "data/ (empty)"

        lines = ["data/"]
        for root, dirs, files in os.walk(data_dir):
            level = root.replace(data_dir, "").count(os.sep)
            indent = "  " * (level + 1)
            subdir = os.path.basename(root)
            if root != data_dir:
                lines.append(f"{indent}{subdir}/")
            for file in sorted(files):
                lines.append(f"{indent}  {file}")

        return "\n".join(lines)

    def _warpgrep_tools(self) -> List[Dict]:
        """Define the tools WarpGrep can use."""
        return [
            {
                "type": "function",
                "function": {
                    "name": "grep",
                    "description": "Search for a pattern in files",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "pattern": {"type": "string", "description": "Regex pattern to search for"},
                            "path": {"type": "string", "description": "Path to search in"},
                            "include": {"type": "string", "description": "File pattern to include"}
                        },
                        "required": ["pattern"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "read",
                    "description": "Read contents of a file",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "file_path": {"type": "string", "description": "Path to the file"},
                            "start_line": {"type": "integer", "description": "Start line"},
                            "end_line": {"type": "integer", "description": "End line"}
                        },
                        "required": ["file_path"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_directory",
                    "description": "List contents of a directory",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Directory path"}
                        },
                        "required": ["path"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "finish",
                    "description": "Return the final search results",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "context": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "file_path": {"type": "string"},
                                        "content": {"type": "string"}
                                    }
                                },
                                "description": "List of relevant file contexts found"
                            }
                        },
                        "required": ["context"]
                    }
                }
            }
        ]

    def _execute_warpgrep_tool(self, tool_name: str, args: Dict) -> str:
        """Execute a WarpGrep tool call locally against the data directory."""
        data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

        try:
            if tool_name == "list_directory":
                path = args.get("path", "data")
                full_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), path)
                if not os.path.exists(full_path):
                    return f"Directory not found: {path}"
                entries = os.listdir(full_path)
                return "\n".join(sorted(entries))

            elif tool_name == "grep":
                pattern = args.get("pattern", "")
                search_path = args.get("path", "data")
                full_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), search_path)
                
                results = []
                if os.path.isdir(full_path):
                    for root, _, files in os.walk(full_path):
                        for fname in files:
                            fpath = os.path.join(root, fname)
                            rel_path = os.path.relpath(fpath, os.path.dirname(os.path.dirname(__file__)))
                            
                            # Handle PDF files
                            if fname.lower().endswith('.pdf'):
                                try:
                                    pdf_text = self._read_pdf_text(fpath)
                                    for i, line in enumerate(pdf_text.split('\n'), 1):
                                        if pattern.lower() in line.lower():
                                            results.append(f"{rel_path}:{i}: {line.strip()}")
                                except Exception:
                                    pass
                            # Handle text files
                            elif fname.lower().endswith(('.txt', '.md', '.json', '.csv')):
                                try:
                                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                                        for i, line in enumerate(f, 1):
                                            if pattern.lower() in line.lower():
                                                results.append(f"{rel_path}:{i}: {line.strip()}")
                                except Exception:
                                    pass

                if not results:
                    return f"No matches found for '{pattern}'."
                return "\n".join(results[:20])

            elif tool_name == "read":
                file_path = args.get("file_path", "")
                full_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path)
                if not os.path.exists(full_path):
                    return f"File not found: {file_path}."

                try:
                    start = args.get("start_line", 1) - 1
                    end = args.get("end_line", start + 50)
                    
                    if file_path.lower().endswith('.pdf'):
                        text = self._read_pdf_text(full_path)
                        lines = text.split('\n')
                        return "\n".join(lines[start:end])
                    else:
                        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                            lines = f.readlines()
                        return "".join(lines[start:end])
                except Exception as e:
                    return f"Error reading {file_path}: {e}"

            elif tool_name == "finish":
                return "Search complete."

            return f"Unknown tool: {tool_name}"

        except Exception as e:
            return f"Tool error: {e}"

    def _read_pdf_text(self, pdf_path: str) -> str:
        """Extract text from a PDF file using pypdf."""
        text_content = []
        try:
            import pypdf
            reader = pypdf.PdfReader(pdf_path)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text_content.append(extracted)
        except ImportError:
            return "[Error: pypdf not installed]"
        except Exception as e:
            return f"[Error interpreting PDF: {e}]"
        return "\n".join(text_content)

    async def close(self):
        """Close HTTP client."""
        if self.enabled:
            await self.client.aclose()


# Singleton
morph_service = MorphService()

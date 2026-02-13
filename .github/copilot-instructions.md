# Copilot Instructions for AgriBot

## Morph Integration
This project uses **Morph LLM** tools for development. When making code changes:

1. **Use `edit_file`** (Morph Fast Apply) for all code edits — it's faster and more precise than full file rewrites.
2. **Use `warpgrep_codebase_search`** (Morph WarpGrep) for finding relevant code — it understands natural language queries.

## Project Structure
- `backend/` — Python FastAPI backend with agricultural reasoning engine
- `frontend/` — Vite + React frontend dashboard
- `data/research/` — Agricultural research PDFs (UC Davis cost studies, IPM guides)
- `backend/services/` — Service modules (weather, RAG, LLM, geospatial, Morph)
- `backend/agents/` — Reasoning engine orchestrator

## Key Conventions
- All services are singleton instances created at module level
- Use `httpx.AsyncClient` for HTTP calls
- Config via `pydantic_settings` in `config.py`, env vars from `.env`
- Backend runs on port 8000, frontend on port 5173

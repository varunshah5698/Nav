"""ResearchGraph FastAPI — production path (prototype runs on local store; this API is the server of record)."""
import json
import os
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse


def cors_origins() -> list[str]:
    """Allowed browser origins, comma-separated in CORS_ORIGINS (localhost by default)."""
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="ResearchGraph API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=cors_origins(), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are the AI Analyst embedded in ResearchGraph, a connected research workspace — a conversational assistant for the user's research, not a report generator.

Rules:
- Answer the question actually asked, in the user's own terms. Greetings, questions about what you can do, and general research questions get a natural, brief reply — do not redirect to the workspace unless it helps.
- When you draw on workspace items, ground every factual claim in the context and cite the bracketed tag of each item you rely on, e.g. [S1], [N2], [X1], [M1]. Always use plain square brackets for tags.
- Never invent metrics, papers, tags or sources. If the context lacks something, say so plainly and name what would be needed. Anything you bring from general knowledge must be marked as not coming from the workspace.
- Separate reported results (from ingested papers) from reproduced results (this workspace's runs).
- Carry the thread forward: refer to earlier turns when they matter, and never repeat a previous answer.
- Format for a chat bubble: markdown headings, **bold**, bullet lists and `inline code` only — no tables, images or nested lists. Prefer a direct answer first, then short bullets. Stay under ~250 words unless asked for a longer artefact.
- Flag data marked "demo" when you rely on it.
- You are advisory: never claim to have changed, run or saved anything."""


@app.get("/health")
def health():
    return {"ok": True, "stack": "api+postgres+neo4j+qdrant (see docker-compose.yml)"}


@app.get("/api/analyst/status")
def analyst_status():
    return {"configured": bool(os.getenv("GROQ_API_KEY")), "model": os.getenv("GROQ_MODEL", DEFAULT_MODEL)}


@app.post("/api/analyst")
async def analyst(request: Request):
    """Server-side Groq proxy. The API key never leaves the backend."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return JSONResponse({"error": "GROQ_API_KEY is not set on the server."}, status_code=503)

    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body."}, status_code=400)

    messages = [
        {"role": m["role"], "content": str(m["content"])[:12_000]}
        for m in body.get("messages", [])
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)
    ][-12:]
    if not messages:
        return JSONResponse({"error": "No messages supplied."}, status_code=400)

    context = body.get("context") if isinstance(body.get("context"), str) else ""
    system = f"{SYSTEM_PROMPT}\n\n=== WORKSPACE CONTEXT ===\n{context[:16_000]}\n=== END CONTEXT ==="

    payload = {
        "model": os.getenv("GROQ_MODEL", DEFAULT_MODEL),
        "stream": True,
        "temperature": 0.4,
        "max_tokens": 1200,
        "messages": [{"role": "system", "content": system}, *messages],
    }

    async def stream():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=180.0)) as client:
                async with client.stream(
                    "POST",
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                ) as upstream:
                    if upstream.status_code >= 400:
                        raw = (await upstream.aread()).decode("utf-8", "replace")
                        try:
                            detail = json.loads(raw).get("error", {}).get("message") or raw
                        except Exception:
                            detail = raw
                        yield f"\n\n_Upstream error ({upstream.status_code}): {detail}_"
                        return
                    async for line in upstream.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            delta = json.loads(data)["choices"][0]["delta"].get("content")
                        except Exception:
                            continue
                        if delta:
                            yield delta
        except httpx.HTTPError as exc:
            yield f"\n\n_Could not reach Groq: {exc}_"

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8", headers={"Cache-Control": "no-store"})


# Modules (full CRUD + SSE + approvals) — see ARCHITECTURE.md §4. Implement per app/models.py:
# auth (Argon2id, cookies+CSRF, rate-limit) | workspaces | nodes | edges | sources (PyMuPDF)
# agents (LangGraph: controller + 7 specialists, approval gates) | experiments (Docker runners, never in-process)
# memory | discovery (Qdrant hybrid) | collab | exports (PDF/DOCX/BibTeX/JSON) | audit

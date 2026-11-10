# ResearchGraph — Architecture & Repository Audit

## 1. Repository audit (2026-11-08)
- Workspace `Prototype-Nav` was EMPTY except `.freebuff/project-id`. No existing framework, no reusable code, no broken features to preserve.
- Scaffolded fresh Vite + React 19 + TypeScript (`vite.config.ts`, `src/main.tsx`). Added: `react-router-dom`, `@xyflow/react`, `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `lenis`, `framer-motion`, `zustand`, `recharts`.
- No backend existed. This repo implements a **production-oriented prototype**: fully functional frontend with real persistence (localStorage), real graph/search/analytics/execution logic, plus a `backend/` FastAPI scaffold + `docker-compose.yml` for the PostgreSQL/Neo4j/Qdrant production path. Switching persistence is one adapter (`src/lib/store.ts` → API client).

## 2. Product scope (what ships now)
COLLECT → ORGANIZE → UNDERSTAND → EXPERIMENT → LEARN → SHARE, with human approval gates everywhere.
- 1 cinematic landing (`/`) with R3F universe + 6 scroll chapters (chaos → connections → agents → experiments → memory → connected space).
- Premium auth (`/login`, `/register`): PBKDF2-SHA256 (100k, WebCrypto) + salt, httpOnly-cookie-equivalent session envelope in localStorage, rate-limit, validation, protected `/app/*` routes. No hardcoded creds.
- App shell (Dribbble tokens): dark sidebar `#1E2222`, light content `#EFEFF1`, white 20px cards, lime `#D8F85E` primary, violet/charcoal/lime charts.
- 1 dashboard (`/app/dashboard`) + 7 modules: Canvas, Sources, Agents, Experiments, Memory, Discovery, Collaboration — each own route, real CRUD, real analytics, no dead buttons, no fake charts.
- Seeded demo workspace: **Plant Disease Detection Using Machine Learning** (10 nodes, 9 edges, 4 sources, 1 experiment with 2 runs, 5 memories, agent history) — all labelled “Demo”.

## 3. Frontend architecture
```
src/
  styles/tokens.css      Dribbble tokens (single source of truth)
  styles/global.css      shell, cards, tables, forms, charts, responsive, a11y, reduced-motion
  lib/types.ts           domain types
  lib/seed.ts            demo workspace seed
  lib/store.ts           zustand + localStorage persistence, all mutations, activity log, metrics
  lib/auth.ts            PBKDF2, register/login/logout/session, rate limit, validation
  lib/search.ts          hybrid TF-IDF + keyword + metadata filters
  lib/execution.ts       isolated JS experiment runner (Function sandbox, timeout, log capture)
  lib/export.ts          JSON / BibTeX / CSV / Markdown→print-PDF, graph JSON
  lib/analytics.ts       success rates, connected-node ratio, distributions (real-data only)
  components/ui.tsx      Button, Card, KPI, Badge, Input, Modal, Drawer, Empty, Progress, Tabs
  components/Shell.tsx   sidebar, topbar, workspace switcher, global search, notifications, profile
  components/Charts.tsx  Recharts wrappers in reference style
  components/ResearchUniverse.tsx  R3F hero / auth mini-universe
  pages/*.tsx            Landing, Auth, Dashboard, Canvas, Sources, Agents, Experiments, Memory, Discovery, Collaboration
  App.tsx                router + guards
```
- State: zustand single store, persisted to `rg.v1` localStorage key. Every mutation logs an `Activity` (recent feed, dashboard, collaboration history derive from it — reproducible analytics).
- Graph: `@xyflow/react` infinite canvas, 12 node types with distinct tint + icon, typed edges with labels, drag/select/group/edit/delete/undo-redo (history stack)/auto-layout/search/filter/inspector/minimap/zoom-pan/persist. AI “suggest connections” = TF-IDF similarity + type-compatibility rules with evidence + confidence; user must Accept/Edit/Reject — never auto-created.
- Agents: 8 agents (controller + 7 specialists). Controller plans sequence (Paper Reader → Equation → Code Setup → Experiment → Benchmark → Memory → Review). Runs are real state machines (queued→running→waiting_approval→completed/failed/paused/cancelled) with events, tool calls, logs, confidence. Approvals enforced in store (execution blocked until approved).
- Experiments: wizard (paper/question/repo/dataset → plan → approve → run). Runner is isolated (no access to store/secrets/DOM), CPU-only, timeout + log capture. Runs save params/deps/env/logs/metrics/seed. Comparison table + curves from real runs only. Colab = adapter stub with honest “not configured” state.
- Sources: PDF upload (text extraction via in-browser parsing + metadata; full PyMuPDF path documented in backend/), URL/GitHub/dataset/note ingestion, chunking + embeddings stub (TF-IDF vectors now; Sentence-Transformers/Qdrant in backend), processing progress via timed states, source→graph node sync.
- Discovery: hybrid retrieval over papers/notes/tags/datasets/code/questions/experiments; excerpt highlight, page refs, result→graph navigation, search logs → analytics (volume, open rate, zero-result rate, latency).
- Memory: 9 categories, error→fix linking, reuse recommendations with reasons, reuse-count tracking.
- Collaboration: invites/roles (owner/editor/viewer enforced in store guards), member list, activity feed, export studio (summary, bibliography, graph, experiment history/report, workspace report) with preview + download. No fake multiplayer — documented as roadmap.

## 4. Backend (production path, scaffolded)
```
backend/
  app/main.py            FastAPI: auth (Argon2id), workspaces, nodes, edges, sources, agents, experiments, memory, discovery, collab, exports + SSE
  app/models.py          SQLAlchemy: users, workspaces, members, sources, chunks, nodes, edges, experiments, runs, artifacts, agent_runs/events/approvals, memories, invites, exports, audit
  requirements.txt       fastapi, sqlalchemy, alembic, argon2-cffi, pymupdf, langchain, langgraph, qdrant-client, neo4j
  Dockerfile
docker-compose.yml         frontend + api + postgres + neo4j + qdrant + worker + minio
```
- Postgres = system of record; Neo4j = graph traversal (stable IDs, outbox sync — never silent drift); Qdrant = vectors (Chroma optional local alt — never both in prod); object storage for PDFs/artifacts (never in Postgres rows).
- Security: Argon2id, secure cookies + CSRF, rate limit, file validation, workspace isolation, CORS, audit logs, SSE for progress. Experiment workers = disposable Docker runners, never in API process.

## 5. Metrics (all real-data, denominators documented in `lib/analytics.ts`)
- Experiment success = completed-success / completed (excludes pending/cancelled). Source processing success likewise. Approval rate = approved / reviewed. Connected-node ratio = nodes-with-≥1-edge / nodes. Search engagement = searches-with-open / searches. No fabrication; empty states when n=0; demo data badged.

## 6. Env vars
Frontend (`.env.example`): `VITE_API_URL` (empty = local store), `VITE_DEMO_SEED=true`.
Backend: `DATABASE_URL`, `NEO4J_URI/USER/PASSWORD`, `QDRANT_URL`, `JWT_SECRET`, `LLM_PROVIDER` (`gemini|openai|groq`), `GEMINI_API_KEY`/`OPENAI_API_KEY`/`GROQ_API_KEY` + `GROQ_MODEL` (server only), `S3_ENDPOINT/...`, `COLAB_*` (optional).

## 7. Testing & deployment
- `npm run build` (tsc + vite), `npm run dev`, `npm run preview`. Manual QA checklist in `README.md`. Vitest/API tests = remaining task (listed in README limitations).
- Deploy: static frontend anywhere; `docker compose up` for full stack; affordable single-node path documented.

## 8. Limitations (honest)
Local prototype uses PBKDF2 (WebCrypto) not Argon2id (backend uses Argon2id), TF-IDF instead of Sentence-Transformers, in-browser PDF text (PyMuPDF in backend), simulated LLM agent outputs with real workflow/approval machinery (plug LLM provider in backend), JS sandbox instead of Docker (backend has Docker runners), no live multiplayer.

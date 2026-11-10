# ResearchGraph — Connected AI Research Workspace

Cinematic landing + auth + dashboard + 7 modules (Canvas, Sources, Agents, Experiments, Memory, Discovery, Collaboration), built on the **Nixtio Health-Dashboard design tokens** (`design-reference-audit.md`, `src/styles/tokens.css`). Seeded demo: *Plant Disease Detection Using Machine Learning* (all demo records labelled).

## Quickstart
```bash
npm install
npm run dev      # → http://localhost:5173
```
Register (any email) → demo workspace seeds automatically. Login persists locally.

**Live:** <https://researchgraph-steel.vercel.app> — static Vite build on Vercel with the analyst endpoint in `api/`. The AI Analyst reports offline until `GROQ_API_KEY` is set in the Vercel project.

## What works now (all real, no dead buttons)
- **AI Analyst**: Groq-backed analyst grounded in sources, graph, experiment runs and memory — scope switches, streamed answers, per-item citations; the key stays server-side behind `/api/analyst`.
- **Canvas**: 12 node types, typed edges, drag/persist/search/filter/auto-layout/inspector/undo, AI link suggestions with evidence + Accept/Reject.
- **Sources**: PDF/URL/GitHub/dataset/note ingest with progress, real pdf.js text extraction from uploaded PDFs (pages, metadata, author, page-referenced passages), source→node sync, success analytics.
- **Agents**: controller + 7 specialists, queued→running→waiting_approval→completed/failed/paused/cancelled, approval gates enforced, events + confidence + redirect.
- **Experiments**: wizard → plan approval gate → isolated CPU sandbox (timeout, logs) → run comparison → save to memory. Colab = honest stub.
- **Memory**: 9 kinds, error→fix linking, reuse counts, draft-experiment recommendations.
- **Discovery**: hybrid TF-IDF + keyword + filters, excerpts with highlights, search analytics (volume/engagement/zero-result).
- **Collab**: owner/editor/viewer (enforced), access roster with local-only invites, workspace activity, export studio (Report MD, BibTeX, Graph JSON, Exp CSV) with live preview, size/line count and export history. Report sections and sources are selectable; every file is generated in the browser.
- **Dashboard**: real KPIs + activity/distribution/outcome/agent/graph panels, range filter, empty states, no fabricated deltas.

## Authentication & cloud sync (Convex Auth + Google)

Convex is the authentication authority and the cloud store. There is no local
account system: `users`/password hashes were removed, and the store only mirrors
the identity returned by `ctx.auth.getUserIdentity()`.

```
Google OAuth -> convex.site/api/auth/callback/google -> Convex Auth session
   -> useConvexAuth()/users.me -> store.startSession(server identity)
   -> snapshots.get/save (ownership from getAuthUserId, never from the client)
```

- `convex/auth.ts` — Google provider (`@auth/core`).
- `convex/http.ts` — `/api/auth/*` HTTP routes.
- `convex/schema.ts` — `authTables` + `userSnapshots` (one per Convex user) +
  legacy `snapshots` (kept read-only; never exposed by a function).
- `convex/snapshots.ts` — `get`/`save` take **no userId**; unauthenticated calls throw.
- `convex/users.ts` — `me` returns name/email/photo for the signed-in user.
- `src/lib/useCloudSync.ts` — wipes cached data on sign-out, refuses snapshots whose
  server-reported `userId` differs from the session, debounces saves, flushes on hide.
- `src/components/Shell.tsx` — Google photo/name/email + real sign-out.
- `src/pages/Auth.tsx` — Google-only sign-in; redirects authenticated visitors.

### Google Cloud Console setup (one-time)

1. Google Cloud Console → create/select a project → **Google Auth Platform**.
2. Configure the consent screen (External), add your test users while in testing.
3. **Clients → Create client → Web application**.
   - Authorized JavaScript origin: `http://localhost:5173`
     (add your production origin when you deploy).
   - Authorized redirect URI: `https://canny-echidna-518.convex.site/api/auth/callback/google`
     (that is the deployment's HTTP Actions URL + `/api/auth/callback/google`).
4. Copy the Client ID and Client secret and set them on the Convex deployment:

```bash
npx convex env set AUTH_GOOGLE_ID <client-id>
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
```

Secrets live only in the Convex deployment environment — never in `.env.local`,
never in the Vite bundle, never in git. Check `SITE_URL` matches the app origin
(`http://localhost:5173` locally; `npx convex env set SITE_URL <prod-url>` for prod).

### Client environment

```bash
# .env.local (gitignored)
CONVEX_DEPLOYMENT=dev:canny-echidna-518
CONVEX_DEPLOY_KEY=dev:canny-echidna-518|<token>   # CLI only
VITE_CONVEX_URL=https://canny-echidna-518.convex.cloud
```

`npx convex deploy` pushes schema + functions. Documents are capped at 1 MiB;
the client skips snapshots over ~900 KB with a console warning.

### Data migration

Legacy rows in the `snapshots` table (`<localUserId>:<workspaceId>`) are preserved
but unreachable. On first Google sign-in, the browser's existing graph is uploaded
to the authenticated user's `userSnapshots` document, so nothing in the current
browser is lost. Signing out clears cached browser data; it reloads from Convex on
the next sign-in, which is what makes cross-device sync work.

## Deploy (Freebuff Sites)
Static build, published at <https://site-942642bb18134977bde5709248101d00.freebuff.page>. `sites/deploy.json` is the Sites manifest (`sites/worker.js` just serves `../dist`), and `sites/site.json` holds the project id and environment URLs. `npm run build` then deploy that manifest. `sites/worker.js` also serves the AI Analyst API (`GET /api/analyst/status`, `POST /api/analyst`) so the deployed site streams real answers: it reads `GROQ_API_KEY` from the Worker secret (Sites → Secrets, set per environment) and proxies Groq, rewriting SSE into the plain-text stream the client reads. The key never ships in the bundle — locally the same routes come from `vite.config.ts` and `backend/app/main.py`.

## Deploy (Render)

**Option A — one Node Web Service (what a plain "New → Web Service" gives you).** Build `npm install && npm run build`, start `npm start`. `server.mjs` serves `dist/` on `$PORT` with SPA fallback, gzip and immutable asset caching, and answers the analyst routes itself, so the browser's same-origin calls need no `VITE_API_URL`, no CORS and no second service. The only setting is `GROQ_API_KEY` (Environment → Add Environment Variable), then redeploy. Without it the site still loads and `/api/analyst/status` reports `configured: false`.

**Option B — two services from the Blueprint.** `render.yaml` creates a Static Site (`npm ci && npm run build` → `dist`, `/*` rewritten to `/index.html` for React Router) plus a Python Web Service for `backend/app/main.py` (FastAPI streaming the same analyst contract).

1. Render Dashboard → **New → Blueprint** → pick this repo → **Apply**.
2. Set `GROQ_API_KEY` on `researchgraph-api`. It is `sync: false`, so Render prompts for it and it never enters git.
3. Check the two hostnames. The Blueprint assumes `https://researchgraph-web.onrender.com` (static site, `CORS_ORIGINS` on the API) and `https://researchgraph-api.onrender.com` (API, `VITE_API_URL` on the static site). Render appends a suffix when a name is taken, so update those values and redeploy if yours differ — `VITE_API_URL` is inlined at build time.
4. Verify: `GET /health` on the API, `/api/analyst/status` reports whether the key is visible to it.

Whichever option you use, free instances sleep when idle, so the first request after a quiet period can take ~30 s. Option B's API allows browser origins listed in `CORS_ORIGINS` (comma-separated, defaults to `localhost:5173`), so local `npm run dev` keeps working against it.

## Production path
`backend/app/main.py` + `docker-compose.yml` (FastAPI, Postgres, Neo4j, Qdrant, worker, MinIO). Swap `src/lib/store.ts` persistence to API client; keys stay server-side (`OPENAI_API_KEY`/`GEMINI_API_KEY` never in bundle). PyMuPDF, Sentence-Transformers, LangGraph, Docker runners live in backend.

## Scripts / checks
`npm run build` (tsc + vite), `npm run preview`. Manual QA: register→login→dashboard KPIs→canvas add/connect/suggest→source ingest→agent approve→experiment run→memory reuse→discovery search→export download→logout. Mobile + reduced-motion + keyboard verified via CSS.

## Limitations (honest)
Browser PBKDF2 (backend: Argon2id), TF-IDF (backend: Qdrant + embeddings), in-browser PDF text via pdf.js (PyMuPDF/OCR in backend; scanned PDFs need OCR), Paper Reader / Equation / Review quote the selected source extractively instead of calling an LLM, simulated outputs remain for experiment/code/benchmark agents, JS sandbox (backend: Docker), no live multiplayer, no automated tests yet (`npm run build` is the gate).

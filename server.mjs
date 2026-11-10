#!/usr/bin/env node
/**
 * Static server + AI Analyst API for the built SPA.
 *
 * Used when this app is deployed as a Render *Web Service* (`npm run build`,
 * then `npm start`). A Render *Static Site* needs no process at all — it takes
 * the analyst endpoints from `backend/app/main.py` or `sites/worker.js`
 * instead. See render.yaml.
 *
 * Serves dist/ with SPA fallback to index.html, immutable caching for
 * /assets/*, and gzip for text types. Also answers the analyst routes the
 * browser calls, so a single service is enough:
 *   GET  /api/analyst/status  → { configured, model }
 *   POST /api/analyst         → streamed plain-text answer
 * The Groq key stays server-side in GROQ_API_KEY. No dependencies.
 */
import { createReadStream, promises as fs } from "node:fs";
import { createGzip } from "node:zlib";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const DIST = resolve(fileURLToPath(new URL("./dist", import.meta.url)));
const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
};

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".map", ".svg", ".txt"]);
const ASSETS_PREFIX = join(DIST, "assets") + sep;
const MAX_BODY_BYTES = 1_000_000;

// Kept in step with backend/app/main.py (the server of record).
const SYSTEM_PROMPT = [
  "You are the AI Analyst embedded in ResearchGraph, a connected research workspace — a conversational assistant for the user's research, not a report generator.",
  "",
  "Rules:",
  "- Answer the question actually asked, in the user's own terms. Greetings, questions about what you can do, and general research questions get a natural, brief reply — do not redirect to the workspace unless it helps.",
  "- When you draw on workspace items, ground every factual claim in the context and cite the bracketed tag of each item you rely on, e.g. [S1], [N2], [X1], [M1]. Always use plain square brackets for tags.",
  "- Never invent metrics, papers, tags or sources. If the context lacks something, say so plainly and name what would be needed. Anything you bring from general knowledge must be marked as not coming from the workspace.",
  "- Separate reported results (from ingested papers) from reproduced results (this workspace's runs).",
  "- Carry the thread forward: refer to earlier turns when they matter, and never repeat a previous answer.",
  "- Format for a chat bubble: markdown headings, **bold**, bullet lists and `inline code` only — no tables, images or nested lists. Prefer a direct answer first, then short bullets. Stay under ~250 words unless asked for a longer artefact.",
  "- Flag data marked \"demo\" when you rely on it.",
  "- You are advisory: never claim to have changed, run or saved anything.",
].join("\n");

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function statOrNull(path) {
  try {
    return await fs.stat(path);
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));
}

async function handleAnalyst(req, res, pathname) {
  if (pathname === "/api/analyst/status") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return json(res, 405, { error: "Use GET for /api/analyst/status." });
    }
    return json(res, 200, { configured: Boolean(GROQ_API_KEY), model: GROQ_MODEL });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Use POST for /api/analyst." });
  if (!GROQ_API_KEY) {
    return json(res, 503, { error: "GROQ_API_KEY is not set on the server." });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    if (error?.status === 413) return json(res, 413, { error: error.message });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const messages = sanitizeMessages(payload?.messages);
  if (!messages.length) return json(res, 400, { error: "No messages supplied." });

  const context = typeof payload.context === "string" ? payload.context.slice(0, 16_000) : "";
  const system = context
    ? `${SYSTEM_PROMPT}\n\n=== WORKSPACE CONTEXT ===\n${context}\n=== END CONTEXT ===`
    : SYSTEM_PROMPT;

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        stream: true,
        temperature: 0.4,
        max_tokens: 1200,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) return res.end();
    return json(res, 502, { error: `Could not reach Groq: ${error.message}` });
  }

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text().catch(() => "");
    let detail = raw;
    try {
      detail = JSON.parse(raw)?.error?.message || raw;
    } catch {
      /* keep raw text */
    }
    const status = upstream.status === 401 || upstream.status === 403 ? upstream.status : 502;
    return json(res, status, { error: detail || `Groq returned ${upstream.status}.` });
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
    "X-Analyst-Model": GROQ_MODEL,
  });
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const delta = JSON.parse(data).choices[0].delta?.content;
          if (delta) res.write(delta);
        } catch {
          /* skip malformed frames */
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) res.write(`\n\n_Stream interrupted: ${error.message}_`);
  } finally {
    res.end();
  }
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let filePath = resolve(DIST, normalize(pathname).replace(/^[/\\]+/, ""));
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }

  let immutable = filePath.startsWith(ASSETS_PREFIX);
  let stat = await statOrNull(filePath);

  if (stat?.isDirectory()) {
    filePath = join(filePath, "index.html");
    stat = await statOrNull(filePath);
    immutable = false;
  }

  if (!stat) {
    // Unknown path: a client-side route (BrowserRouter), not a 404.
    filePath = join(DIST, "index.html");
    stat = await statOrNull(filePath);
    immutable = false;
    if (!stat) {
      res
        .writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
        .end("dist/index.html is missing — run `npm run build` first.");
      return;
    }
  }

  const ext = extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  };

  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (gzip) {
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
  } else {
    headers["Content-Length"] = String(stat.size);
  }

  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  if (gzip) stream.pipe(createGzip()).pipe(res);
  else stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }

  try {
    if (pathname.startsWith("/api/analyst")) {
      await handleAnalyst(req, res, pathname.replace(/\/+$/, "") || "/api/analyst");
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    if (!res.headersSent) json(res, 500, { error: "Server error." });
    else res.destroy();
    console.error("request failed", error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ResearchGraph web listening on http://${HOST}:${PORT} (serving ${DIST})`);
  console.log(`AI Analyst: ${GROQ_API_KEY ? `enabled (${GROQ_MODEL})` : "GROQ_API_KEY is not set"}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

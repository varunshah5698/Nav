#!/usr/bin/env node
/**
 * Minimal static server for the built SPA.
 *
 * Used when this app is deployed as a Render *Web Service* (`npm run build`,
 * then `npm start`). A Render *Static Site* needs no process at all and is the
 * faster option — see render.yaml.
 *
 * Serves dist/ with SPA fallback to index.html, immutable caching for
 * /assets/*, and gzip for text types. No dependencies.
 */
import { createReadStream, promises as fs } from "node:fs";
import { createGzip } from "node:zlib";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const DIST = resolve(fileURLToPath(new URL("./dist", import.meta.url)));
const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

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

async function statOrNull(path) {
  try {
    return await fs.stat(path);
  } catch {
    return null;
  }
}

function bare(res, status, message, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers }).end(message);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    bare(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    bare(res, 400, "Bad request");
    return;
  }

  let filePath = resolve(DIST, normalize(pathname).replace(/^[/\\]+/, ""));
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    bare(res, 403, "Forbidden");
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
      bare(res, 500, "dist/index.html is missing — run `npm run build` first.");
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
});

server.listen(PORT, HOST, () => {
  console.log(`ResearchGraph web listening on http://${HOST}:${PORT} (serving ${DIST})`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

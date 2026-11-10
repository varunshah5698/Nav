export const config = { runtime: "edge" };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_BODY = 400_000;
// Same deployment as the Render web service. Used only when this Vercel
// project has no GROQ_API_KEY of its own.
const FALLBACK = "https://nav-y35d.onrender.com/api/analyst";

const SYSTEM_PROMPT = `You are the AI Analyst embedded in ResearchGraph, a connected research workspace — a conversational assistant for the user's research, not a report generator.

Rules:
- Answer the question actually asked, in the user's own terms. Greetings, questions about what you can do, and general research questions get a natural, brief reply — do not redirect to the workspace unless it helps.
- When you draw on workspace items, ground every factual claim in the context and cite the bracketed tag of each item you rely on, e.g. [S1], [N2], [X1], [M1]. Always use plain square brackets for tags.
- Never invent metrics, papers, tags or sources. If the context lacks something, say so plainly and name what would be needed. Anything you bring from general knowledge must be marked as not coming from the workspace.
- Separate reported results (from ingested papers) from reproduced results (this workspace's runs).
- Carry the thread forward: refer to earlier turns when they matter, and never repeat a previous answer.
- Format for a chat bubble: markdown headings, **bold**, bullet lists and inline code only — no tables, images or nested lists. Prefer a direct answer first, then short bullets. Stay under ~250 words unless asked for a longer artefact.
- Flag data marked "demo" when you rely on it.
- You are advisory: never claim to have changed, run or saved anything.`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function proxyToRender(request) {
  let body;
  try {
    body = await request.text();
  } catch {
    return json({ error: "Could not read the request body." }, 400);
  }
  try {
    const upstream = await fetch(FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "text/plain" },
      body,
    });
    const headers = {
      "Content-Type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    };
    const model = upstream.headers.get("x-analyst-model");
    if (model) headers["X-Analyst-Model"] = model;
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return json({ error: `Analyst proxy failed: ${err?.message || "network error"}` }, 502);
  }
}

export default async function handler(request) {
  const path = new URL(request.url).pathname;
  const env = process.env;
  const model = env.GROQ_MODEL || "openai/gpt-oss-120b";

  if (path === "/api/analyst/status") {
    return json({ configured: Boolean(env.GROQ_API_KEY), model });
  }

  if (path !== "/api/analyst") return json({ error: "Not found." }, 404);
  if (request.method !== "POST") return json({ error: "Use POST for /api/analyst." }, 405);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) {
    return json({ error: "Request body too large." }, 413);
  }
  if (!env.GROQ_API_KEY) return proxyToRender(request);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const messages = (Array.isArray(payload?.messages) ? payload.messages : [])
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));
  if (!messages.length) return json({ error: "No messages supplied." }, 400);

  const context = typeof payload.context === "string" ? payload.context.slice(0, 16_000) : "";
  const system = context
    ? `${SYSTEM_PROMPT}\n\n=== WORKSPACE CONTEXT ===\n${context}\n=== END CONTEXT ===`
    : SYSTEM_PROMPT;

  let upstream;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.4,
        max_tokens: 1200,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return json({ error: `Could not reach Groq: ${err?.message || "network error"}` }, 502);
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
    return json({ error: detail || `Groq returned ${upstream.status}.` }, status);
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const body = new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let out = "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) out += delta;
          } catch {
            /* partial frame — ignored */
          }
        }
        if (out) {
          controller.enqueue(encoder.encode(out));
          return;
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Analyst-Model": model,
    },
  });
}

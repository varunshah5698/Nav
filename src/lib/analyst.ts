import type { AgentRun, Edge, Experiment, MemoryEntry, RNode, Source, Workspace } from "./types";

export interface AnalystScope {
  sources: boolean;
  graph: boolean;
  runs: boolean;
  memory: boolean;
}

export const DEFAULT_SCOPE: AnalystScope = { sources: true, graph: true, runs: true, memory: true };

export interface AnalystItem {
  tag: string;
  kind: "source" | "node" | "experiment" | "memory" | "agent";
  title: string;
  to: string;
}

export interface AnalystContext {
  text: string;
  counts: { sources: number; nodes: number; edges: number; runs: number; memories: number };
  tokens: number;
  items: AnalystItem[];
}

export interface AnalystMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnalystStatus {
  configured: boolean;
  model: string;
  offline?: boolean;
}

const clip = (s: string | undefined, n: number) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

const pct = (v: number) => (v <= 1 ? `${(v * 100).toFixed(1)}%` : v.toFixed(1));

export function buildAnalystContext(
  data: {
    ws?: Workspace;
    nodes: RNode[];
    edges: Edge[];
    sources: Source[];
    experiments: Experiment[];
    agents: AgentRun[];
    memories: MemoryEntry[];
  },
  scope: AnalystScope,
): AnalystContext {
  const { ws, nodes, edges, sources, experiments, agents, memories } = data;
  const items: AnalystItem[] = [];
  const sections: string[] = [];
  const runs = experiments.flatMap((e) => e.runs.map((r) => ({ exp: e, run: r })));

  const nodeTag = new Map<string, string>();
  nodes.forEach((n, i) => nodeTag.set(n.id, `N${i + 1}`));

  if (scope.sources && sources.length) {
    const lines = sources.slice(0, 14).map((s, i) => {
      const tag = `S${i + 1}`;
      items.push({ tag, kind: "source", title: s.title, to: "/app/sources" });
      const bits: string[] = [s.kind, s.status];
      if (s.authors) bits.push(clip(s.authors, 60));
      const body = clip(s.abstract || s.url || "no abstract captured", 220);
      return `[${tag}] ${bits.join(" · ")} · ${s.title} — ${body}`;
    });
    sections.push(`SOURCES (${sources.length} indexed)\n${lines.join("\n")}`);
  }

  if (scope.graph && nodes.length) {
    const lines = nodes.slice(0, 30).map((n, i) => {
      const tag = `N${i + 1}`;
      items.push({ tag, kind: "node", title: n.title, to: `/app/canvas${ws ? `?ws=${ws.id}` : ""}` });
      const desc = clip(n.summary || n.description, 180);
      return `[${tag}] ${n.type} · ${n.title}${desc ? ` — ${desc}` : ""}`;
    });
    const rels = edges
      .slice(0, 28)
      .filter((e) => nodeTag.has(e.source) && nodeTag.has(e.target))
      .map((e) => `${nodeTag.get(e.source)} → ${nodeTag.get(e.target)} “${e.label}” (${e.type})`);
    sections.push(`KNOWLEDGE GRAPH\nNODES\n${lines.join("\n")}${rels.length ? `\nRELATIONS\n${rels.join("\n")}` : ""}`);
  }

  if (scope.runs && experiments.length) {
    const lines = experiments.slice(0, 10).map((e, i) => {
      const tag = `X${i + 1}`;
      items.push({ tag, kind: "experiment", title: e.name, to: "/app/experiments" });
      const last = e.runs[0];
      const metrics = last
        ? Object.entries(last.metrics)
            .map(([k, v]) => `${k}=${typeof v === "number" ? pct(v) : v}`)
            .join(", ")
        : "no runs yet";
      const params = Object.entries(e.params || {})
        .slice(0, 6)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `[${tag}] ${e.name} · status=${e.status}\n  objective: ${clip(e.objective, 180)}\n  method: ${clip(e.methodology, 160)}${params ? `\n  params: ${params}` : ""}\n  latest run: ${last ? `${last.status} — ${metrics}` : "none"}`;
    });
    sections.push(`EXPERIMENTS (${experiments.length}, ${runs.length} run${runs.length === 1 ? "" : "s"})\n${lines.join("\n")}`);
  }

  if (scope.memory && memories.length) {
    const lines = memories.slice(0, 12).map((m, i) => {
      const tag = `M${i + 1}`;
      items.push({ tag, kind: "memory", title: m.title, to: "/app/memory" });
      const detail = clip(m.description || m.error || m.fix, 170);
      return `[${tag}] ${m.kind} · ${m.title} — ${detail} (reused ${m.reuseCount}×)`;
    });
    sections.push(`MEMORY\n${lines.join("\n")}`);
  }

  if (scope.runs && agents.length) {
    const lines = agents.slice(0, 10).map((a, i) => {
      const tag = `A${i + 1}`;
      items.push({ tag, kind: "agent", title: a.task, to: "/app/agents" });
      return `[${tag}] ${a.agent} · ${a.status}${typeof a.confidence === "number" ? ` · confidence ${a.confidence.toFixed(2)}` : ""} · ${a.task}${a.output ? ` → ${clip(a.output, 150)}` : ""}`;
    });
    sections.push(`AGENT RUNS\n${lines.join("\n")}`);
  }

  const ready = sources.filter((s) => s.status === "ready").length;
  const head = [
    `WORKSPACE: ${ws?.name || "Untitled"}`,
    ws?.description ? `PURPOSE: ${clip(ws.description, 240)}` : "",
    `SNAPSHOT: ${sources.length} sources (${ready} ready) · ${nodes.length} nodes · ${edges.length} edges · ${runs.length} experiment runs · ${memories.length} memory records`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [head, ...sections].join("\n\n").slice(0, 14_000);
  return {
    text,
    counts: { sources: sources.length, nodes: nodes.length, edges: edges.length, runs: runs.length, memories: memories.length },
    tokens: Math.round(text.length / 4),
    items,
  };
}

const apiBase = () => ((import.meta.env.VITE_API_URL as string | undefined) || "").replace(/\/$/, "");

export async function analystStatus(signal?: AbortSignal): Promise<AnalystStatus> {
  const fallback = { configured: false, model: "openai/gpt-oss-120b", offline: true };
  try {
    const res = await fetch(`${apiBase()}/api/analyst/status`, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return fallback;
    const data = (await res.json()) as AnalystStatus;
    return { ...data, offline: false };
  } catch {
    return fallback;
  }
}

export async function streamAnalyst(opts: {
  messages: AnalystMessage[];
  context: string;
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ latencyMs: number; model?: string }> {
  const started = performance.now();
  const res = await fetch(`${apiBase()}/api/analyst`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: opts.messages, context: opts.context }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let message = `The analyst request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }

  if (!res.body) {
    opts.onDelta(await res.text());
    return { latencyMs: Math.round(performance.now() - started) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value?.length) opts.onDelta(decoder.decode(value, { stream: true }));
  }
  return { latencyMs: Math.round(performance.now() - started), model: res.headers.get("X-Analyst-Model") || undefined };
}

/** Pull [S1]/[N2]/[X3] markers out of an answer and map them to real workspace items. */
export function citationsFor(answer: string, items: AnalystItem[]): AnalystItem[] {
  const seen = new Set<string>();
  const out: AnalystItem[] = [];
  for (const match of answer.matchAll(/[\[【［]\s*([SNXMA]\d{1,2})\s*[\]】］]/g)) {
    const tag = match[1];
    if (seen.has(tag)) continue;
    seen.add(tag);
    const item = items.find((i) => i.tag === tag);
    if (item) out.push(item);
  }
  return out;
}

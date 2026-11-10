import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore, label } from "../lib/store";
import {
  DEFAULT_SCOPE, analystStatus, buildAnalystContext, citationsFor, streamAnalyst,
  type AnalystItem, type AnalystMessage, type AnalystStatus,
} from "../lib/analyst";
import type { AgentName } from "../lib/types";
import "../styles/analyst.css";

/* ---------- the crew ---------- */
type Crew = { n: AgentName; role: string; tint: string };
const CREW: Crew[] = [
  { n: "controller", role: "routes work, holds every gate", tint: "#D8F85E" },
  { n: "paper_reader", role: "reads sources, quotes passages", tint: "#B7A8FF" },
  { n: "equation", role: "pulls equations and variables", tint: "#F0CE4E" },
  { n: "code_setup", role: "deps, env, setup risks", tint: "#8FA6A6" },
  { n: "experiment", role: "plans and runs experiments", tint: "#7FB0FF" },
  { n: "benchmark", role: "compares runs to baselines", tint: "#5BE39A" },
  { n: "memory", role: "saves configs, errors, fixes", tint: "#CBB6FF" },
  { n: "review", role: "checks citations and repro", tint: "#FFB27A" },
];

/* ---------- page awareness ---------- */
const PAGES: Record<string, { name: string; hook: string; asks: string[] }> = {
  "/app/dashboard": { name: "Dashboard", hook: "your workspace at a glance", asks: ["What needs my attention?", "Audit the evidence here", "What should I do next?"] },
  "/app/canvas": { name: "Canvas", hook: "the evidence graph", asks: ["Where is the evidence thinnest?", "Which nodes carry no links?", "Design the next experiment"] },
  "/app/sources": { name: "Sources", hook: "ingested material", asks: ["What have I not read yet?", "Which source should I analyse?", "Where are the gaps?"] },
  "/app/agents": { name: "Agent center", hook: "the analyst team", asks: ["What is waiting on my approval?", "Who has been running?", "What is the Controller doing?"] },
  "/app/experiments": { name: "Experiments", hook: "planned and finished runs", asks: ["How did the last run go?", "Reported vs reproduced", "What is blocking the next run?"] },
  "/app/memory": { name: "Memory", hook: "saved configs and fixes", asks: ["What can I reuse?", "What failed before?", "What should be saved here?"] },
  "/app/discovery": { name: "Discovery", hook: "search across the lab", asks: ["What am I missing?", "Where is the evidence thinnest?", "Supervisor update"] },
  "/app/collaboration": { name: "Share & export", hook: "handing work to others", asks: ["What is safe to export?", "Supervisor update", "What should I do next?"] },
};
const pageFor = (path: string) => PAGES[path] || { name: "Workspace", hook: "your research", asks: ["Audit the evidence", "What needs my attention?", "Supervisor update"] };

/* ---------- message model ---------- */
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  offline?: boolean;
  latencyMs?: number;
  cites?: AnalystItem[];
};

const uid = () => "m" + Math.random().toString(36).slice(2, 9);

/* ---------- offline fallback: computed, never invented ---------- */
function groundedAnswer(q: string, ws: string, page: string, nodes: number, edges: number, sources: number, pending: number, runs: number): string {
  const k = q.toLowerCase();
  if (k.includes("approv") || k.includes("pending")) return pending ? `${pending} action${pending === 1 ? " is" : "s are"} waiting at the approval gate. Open the agent center to decide — nothing runs until you do.` : "Nothing is waiting on you. No task is held at an approval gate.";
  if (k.includes("link") || k.includes("node") || k.includes("graph")) return `The ${page} workspace holds **${nodes} nodes** and **${edges} links**. Ask again once the analyst service is reachable for a full read of the graph.`;
  if (k.includes("next") || k.includes("attention")) return `**${sources} sources**, **${nodes} nodes**, **${edges} links**, **${runs} experiments**. ${pending ? `Decide the ${pending} pending approval(s) first.` : "Nothing is blocked right now."}`;
  return `Working from ${ws}: **${sources} sources**, **${nodes} nodes**, **${edges} links**, **${runs} experiments**.`;
}

/* ---------- light markdown, sized for a narrow dock ---------- */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\s*[NSXMA]\d{1,2}\s*\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
        if (/^\[\s*[NSXMA]\d{1,2}\s*\]$/.test(p)) return <span key={i} className="adk-tag">{p.slice(1, -1).trim()}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Answer({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());
  return (
    <div className="adk-prose">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter(l => l.trim());
        const rows = lines.filter(l => l.trim().startsWith("|"));
        if (rows.length >= 2) {
          const body = rows.filter(l => !/^\|[\s:|-]+\|?$/.test(l.trim()));
          return (
            <div className="adk-table" key={i}>
              {body.map((row, j) => {
                const cells = row.split("|").map(c => c.trim()).filter(Boolean);
                return j === 0
                  ? <b key={j} className="adk-thead"><Inline text={cells.join(" · ")} /></b>
                  : <div className="adk-trow" key={j}>
                      <b><Inline text={(cells[0] || "").replace(/\*\*/g, "")} /></b>
                      {cells.length > 1 && <span><Inline text={cells.slice(1).join(" · ")} /></span>}
                    </div>;
              })}
            </div>
          );
        }
        if (lines.every(l => /^\s*[-*•]\s+/.test(l)))
          return <ul key={i}>{lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*[-*•]\s+/, "")} /></li>)}</ul>;
        return <p key={i}><Inline text={block} /></p>;
      })}
    </div>
  );
}

export default function AnalystDock() {
  const nav = useNavigate();
  const loc = useLocation();
  const page = pageFor(loc.pathname);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AnalystStatus | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("rg:analyst-toggle", toggle);
    return () => window.removeEventListener("rg:analyst-toggle", toggle);
  }, []);

  const ws = useStore(s => s.workspaces.find(w => w.id === s.activeWs));
  const activeWs = useStore(s => s.activeWs);
  const nodes = useStore(s => s.nodes);
  const edges = useStore(s => s.edges);
  const sources = useStore(s => s.sources);
  const agents = useStore(s => s.agents);
  const experiments = useStore(s => s.experiments);
  const memories = useStore(s => s.memories);

  const mine = useMemo(() => ({
    nodes: nodes.filter(n => n.workspaceId === activeWs),
    edges: edges.filter(e => e.workspaceId === activeWs),
    sources: sources.filter(s => s.workspaceId === activeWs),
    agents: agents.filter(a => a.workspaceId === activeWs),
    experiments: experiments.filter(x => x.workspaceId === activeWs),
    memories: memories.filter(m => m.workspaceId === activeWs),
  }), [nodes, edges, sources, agents, experiments, memories, activeWs]);

  const context = useMemo(() => buildAnalystContext(
    { ws: ws as any, nodes: mine.nodes, edges: mine.edges, sources: mine.sources, experiments: mine.experiments, agents: mine.agents, memories: mine.memories },
    DEFAULT_SCOPE
  ), [ws, mine]);

  const pending = mine.agents.filter(a => a.status === "waiting_approval").length;
  const live = !!status?.configured && !status?.offline;

  /* ---------- lifecycle ---------- */
  useEffect(() => {
    const c = new AbortController();
    analystStatus(c.signal).then(setStatus).catch(() => setStatus(null));
    return () => c.abort();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen(o => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const ask = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setNodeId(d.nodeId || null);
      setOpen(true);
      if (d.prompt) setTimeout(() => send(d.prompt), 80);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("rg:ask", ask as EventListener);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("rg:ask", ask as EventListener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, status]);

  useEffect(() => {
    if (!open || msgs.length) return;
    setMsgs([{
      id: uid(), role: "assistant",
      content: `I'm with you on every page — ${page.hook}. ${context.counts.sources} sources, ${context.counts.nodes} nodes and ${context.counts.runs} runs are in scope. Ask me, or take one of the prompts below.`,
    }]);
  }, [open, msgs.length, page.hook, context.counts]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 140); }, [open]);
  useEffect(() => {
    const t = threadRef.current;
    if (t) t.scrollTop = t.scrollHeight;
  }, [msgs, open, busy]);

  /* ---------- ask ---------- */
  function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft("");
    const mineMsg: Msg = { id: uid(), role: "user", content: q };
    const replyId = uid();
    setMsgs(m => [...m, mineMsg, { id: replyId, role: "assistant", content: "" }]);
    setBusy(true);

    const patch = (fn: (m: Msg) => Msg) => setMsgs(list => list.map(m => (m.id === replyId ? fn(m) : m)));

    if (!live) {
      setTimeout(() => {
        patch(m => ({ ...m, content: groundedAnswer(q, ws?.name || "this workspace", page.name, context.counts.nodes, context.counts.edges, context.counts.sources, pending, context.counts.runs), offline: true }));
        setBusy(false);
      }, 420);
      return;
    }

    const history: AnalystMessage[] = [...msgs.filter(m => m.content), mineMsg]
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const started = performance.now();

    streamAnalyst({
      messages: [...history.slice(0, -1), { role: "user", content: nodeId ? `${q}\n\n(Focus on node: ${nodeId})` : q }],
      context: context.text,
      signal: ctrl.signal,
      onDelta: chunk => patch(m => ({ ...m, content: m.content + chunk })),
    })
      .then(() => {
        setMsgs(list => list.map(m => (m.id === replyId
          ? { ...m, latencyMs: Math.round(performance.now() - started), cites: citationsFor(m.content, context.items) }
          : m)));
      })
      .catch(err => {
        if ((err as Error)?.name === "AbortError") { patch(m => ({ ...m, content: m.content || "Stopped." })); return; }
        patch(m => ({
          ...m, error: true,
          content: m.content || `The analyst could not answer: ${(err as Error)?.message || "service unavailable"}. Try again, or open the analyst desk for the full thread.`,
        }));
      })
      .finally(() => { setBusy(false); abortRef.current = null; });
  }

  const stop = () => { abortRef.current?.abort(); setBusy(false); };

  if (loc.pathname === "/app/analyst") return null;

  return (
    <>
      {open && (
        <section className="adk-panel" role="dialog" aria-label="Research analyst">
          <header className="adk-head">
            <div className="adk-head-l">
              <span className="adk-mark" aria-hidden>✦</span>
              <div>
                <b>Analyst</b>
                <span>{ws?.name || "Workspace"}</span>
              </div>
            </div>
            <span className={`adk-ctx${live ? " live" : ""}`}>{live ? "live" : status ? "offline" : "…"} · {page.name}</span>
            <button className="adk-x" onClick={() => setOpen(false)} aria-label="Close analyst">✕</button>
          </header>

          <div className="adk-crew" role="list" aria-label="Analyst team">
            {CREW.map(c => {
              const runs = mine.agents.filter(a => a.agent === c.n);
              const isBusy = runs.some(a => a.status === "running" || a.status === "queued");
              const gate = runs.some(a => a.status === "waiting_approval");
              return (
                <button key={c.n} role="listitem" className={`adk-chip${isBusy ? " busy" : ""}${gate ? " gate" : ""}`}
                  onClick={() => send(`What is the ${label(c.n)} doing right now, and what should it do next?`)}
                  title={`${label(c.n)} — ${c.role}`}>
                  <i style={{ background: c.tint }} />
                  <span>{label(c.n)}</span>
                  {gate ? <em>gate</em> : isBusy ? <em>live</em> : null}
                </button>
              );
            })}
          </div>

          <div className="adk-thread" ref={threadRef} role="log" aria-live="polite">
            {msgs.map(m => {
              if (m.role === "user") return <div key={m.id} className="adk-you">{m.content}</div>;
              return (
                <article key={m.id} className={`adk-msg${m.error ? " err" : ""}`}>
                  <div className="adk-msg-h">
                    <i style={{ background: "var(--lime)" }} />
                    <b>Analyst</b>
                    <span>{m.offline ? "offline · computed" : m.latencyMs ? `${(m.latencyMs / 1000).toFixed(1)}s` : busy ? "thinking" : ""}</span>
                  </div>
                  {m.content
                    ? <Answer text={m.content} />
                    : <div className="adk-think"><i /><i /><i /></div>}
                  {!!m.cites?.length && (
                    <div className="adk-cites">
                      <span>Grounded in</span>
                      {m.cites.slice(0, 4).map(c => (
                        <button key={c.tag} className="adk-cite" onClick={() => { nav(c.to); setOpen(false); }} title={c.title}>
                          <b>{c.tag}</b>{c.title.length > 30 ? c.title.slice(0, 28) + "…" : c.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.offline && <p className="adk-basis">No model key on this server — this is a computed answer from workspace data. Add GROQ_API_KEY for the full analyst.</p>}
                </article>
              );
            })}
            {busy && msgs[msgs.length - 1]?.content === "" && <div className="adk-think"><i /><i /><i /></div>}
          </div>

          <div className="adk-asks">
            {page.asks.map(a => <button key={a} onClick={() => send(a)} disabled={busy}>{a}</button>)}
          </div>

          <form className="adk-input" onSubmit={e => { e.preventDefault(); send(draft); }}>
            <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={`Ask about ${page.hook}…`} aria-label="Ask the analyst" />
            {busy
              ? <button type="button" className="stop" onClick={stop} aria-label="Stop"><span /></button>
              : <button type="submit" disabled={!draft.trim()} aria-label="Send">↑</button>}
          </form>
          <p className="adk-foot">
            Grounded in this workspace · <kbd>⌘J</kbd> anywhere · <button className="adk-more" onClick={() => { nav("/app/analyst"); setOpen(false); }}>open the desk ↗</button>
          </p>
        </section>
      )}
    </>
  );
}

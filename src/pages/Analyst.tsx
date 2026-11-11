import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { navIcons } from "../components/icons";
import {
  DEFAULT_SCOPE,
  analystStatus,
  buildAnalystContext,
  citationsFor,
  streamAnalyst,
  type AnalystMessage,
  type AnalystScope,
  type AnalystStatus,
} from "../lib/analyst";
import "../styles/analyst-page.css";

interface ThreadMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  error?: boolean;
  latencyMs?: number;
}

const uid = () => "m" + Math.random().toString(36).slice(2, 9);

const SUGGESTIONS: { icon: string; title: string; body: string }[] = [
  { icon: "◈", title: "Audit the evidence", body: "Where is the evidence in this workspace strongest, and where is it thinnest?" },
  { icon: "⚖", title: "Reported vs reproduced", body: "Compare what the paper claims with what our runs actually produced. What explains the gap?" },
  { icon: "⚗", title: "Next experiment", body: "Design the next experiment using only what we already have. Include params, baseline and success criteria." },
  { icon: "✦", title: "Supervisor update", body: "Write a five-bullet status update: question, method, result, blocker, next step." },
];

const SCOPE_META = [
  { key: "sources", label: "Sources", hint: "Papers, datasets, repos and abstracts", unit: "sources", icon: "sources", tone: "orange" },
  { key: "graph", label: "Knowledge graph", hint: "Nodes, types and typed relations", unit: "nodes", icon: "canvas", tone: "gold" },
  { key: "runs", label: "Experiments", hint: "Plans, parameters and run metrics", unit: "runs", icon: "experiments", tone: "green" },
  { key: "memory", label: "Memory", hint: "Errors, fixes and findings", unit: "records", icon: "memory", tone: "stone" },
] as const;

function inline(text: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|[\[【［]\s*[SNXMA]\d{1,2}\s*[\]】］])/g)
    .filter((part) => part !== "")
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      if (/^[\[【［]\s*[SNXMA]\d{1,2}\s*[\]】］]$/.test(part))
        return (
          <span key={i} className="an-mark">
            {part.slice(1, -1).trim()}
          </span>
        );
      return <span key={i}>{part}</span>;
    });
}

function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="an-prose">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.length === 1 && /^#{1,4}\s/.test(lines[0]))
          return <h4 key={bi}>{inline(lines[0].replace(/^#{1,4}\s+/, ""))}</h4>;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return (
            <ol key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>
              ))}
            </ol>
          );
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {inline(l)}
                {li < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const loadThread = (wsId: string | null): ThreadMsg[] => {
  if (!wsId) return [];
  try {
    const raw = sessionStorage.getItem(`rg.analyst.${wsId}`);
    return raw ? (JSON.parse(raw) as ThreadMsg[]) : [];
  } catch {
    return [];
  }
};

export default function Analyst() {
  const activeWs = useStore((s) => s.activeWs);
  const allNodes = useStore((s) => s.nodes);
  const allEdges = useStore((s) => s.edges);
  const allSources = useStore((s) => s.sources);
  const allExps = useStore((s) => s.experiments);
  const allAgents = useStore((s) => s.agents);
  const allMemories = useStore((s) => s.memories);
  const ws = useStore((s) => s.workspaces.find((w) => w.id === s.activeWs));

  const nodes = useMemo(() => allNodes.filter((n) => n.workspaceId === activeWs), [allNodes, activeWs]);
  const edges = useMemo(() => allEdges.filter((n) => n.workspaceId === activeWs), [allEdges, activeWs]);
  const sources = useMemo(() => allSources.filter((n) => n.workspaceId === activeWs), [allSources, activeWs]);
  const experiments = useMemo(() => allExps.filter((n) => n.workspaceId === activeWs), [allExps, activeWs]);
  const agents = useMemo(() => allAgents.filter((n) => n.workspaceId === activeWs), [allAgents, activeWs]);
  const memories = useMemo(() => allMemories.filter((n) => n.workspaceId === activeWs), [allMemories, activeWs]);

  const [scope, setScope] = useState<AnalystScope>(DEFAULT_SCOPE);
  const [messages, setMessages] = useState<ThreadMsg[]>(() => loadThread(activeWs));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AnalystStatus | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(
    () => buildAnalystContext({ ws, nodes, edges, sources, experiments, agents, memories }, scope),
    [ws, nodes, edges, sources, experiments, agents, memories, scope],
  );
  const byScope = {
    sources: context.counts.sources,
    graph: context.counts.nodes,
    runs: context.counts.runs,
    memory: context.counts.memories,
  };
  const budgetPct = Math.min(100, Math.round((context.text.length / 14_000) * 100));

  useEffect(() => {
    setMessages(loadThread(activeWs));
    setInput("");
  }, [activeWs]);

  useEffect(() => {
    if (!activeWs) return;
    try {
      sessionStorage.setItem(`rg.analyst.${activeWs}`, JSON.stringify(messages.slice(-24)));
    } catch {
      /* storage full or unavailable */
    }
  }, [messages, activeWs]);

  useEffect(() => {
    const controller = new AbortController();
    analystStatus(controller.signal).then(setStatus).catch(() => setStatus(null));
    return () => controller.abort();
  }, []);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(150, el.scrollHeight) + "px";
  }, [input]);

  const send = useCallback(
    async (preset?: string) => {
      const text = (preset ?? input).trim();
      if (!text || busy) return;
      setInput("");

      const userMsg: ThreadMsg = { id: uid(), role: "user", content: text, ts: Date.now() };
      const replyId = uid();
      const history: AnalystMessage[] = [...messages, userMsg]
        .filter((m) => !m.error && m.content.trim())
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: replyId, role: "assistant", content: "", ts: Date.now() },
      ]);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

      let acc = "";
      try {
        const result = await streamAnalyst({
          messages: history,
          context: context.text,
          signal: controller.signal,
          onDelta: (chunk) => {
            // Some models emit CJK/fullwidth brackets around tags — normalise so citations stay clickable.
            acc += chunk.replace(/[【［]/g, "[").replace(/[】］]/g, "]");
            setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content: acc } : m)));
          },
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId ? { ...m, content: acc, latencyMs: result.latencyMs } : m,
          ),
        );
      } catch (err) {
        const aborted = controller.signal.aborted;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId
              ? {
                  ...m,
                  error: true,
                  content: aborted
                    ? "_Stopped before an answer was complete._"
                    : `**The analyst could not answer.** ${(err as Error).message}`,
                }
              : m,
          ),
        );
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, context, input, messages],
  );

  const stop = () => abortRef.current?.abort();

  const newThread = () => {
    abortRef.current?.abort();
    setMessages([]);
    if (activeWs) sessionStorage.removeItem(`rg.analyst.${activeWs}`);
  };

  const copy = async (m: ThreadMsg) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const ready = status?.configured && !status.offline;
  const turns = messages.filter((m) => m.role === "user").length;
  const streamingId = busy ? messages[messages.length - 1]?.id : null;

  return (
    <div className="an-page">
      <header className="an-head">
        <div>
          <div className="an-eyebrow">
            <span className="an-spark">✦</span>AI ANALYST<span className="an-sep" />GROQ INFERENCE
          </div>
          <h1 className="an-title">The analyst desk</h1>
          <p className="an-sub">
            Ask the workspace, not the internet. Every answer is grounded in the items you let it read.
          </p>
        </div>
        <div className="an-head-right">
          <span className={`an-status${ready ? " live" : " idle"}`}>
            <i />
            {status === null ? "checking" : status.offline ? "service offline" : ready ? "key active" : "key missing"}
          </span>
          <button className="an-new" onClick={newThread} disabled={!messages.length}>
            <span aria-hidden>＋</span>
            New thread
          </button>
        </div>
      </header>

      <section className="an-kpis" aria-label="Evidence in scope">
        {SCOPE_META.map((meta) => {
          const on = scope[meta.key];
          return (
            <article key={meta.key} className={`an-kpi t-${meta.tone}${on ? "" : " off"}`}>
              <span className="an-kpi-label">{meta.label}</span>
              <div className="an-kpi-row">
                <b>{byScope[meta.key]}</b>
                <span className="an-kpi-pill">{on ? "in scope" : "paused"}</span>
              </div>
              <span className="an-kpi-ic" aria-hidden>{navIcons[meta.icon]}</span>
            </article>
          );
        })}
      </section>

      <div className="an-grid">
        <aside className="an-rail">
          <section className="an-profile">
            <div className="an-profile-top">
              <span className="an-orb">✦</span>
              <div className="an-profile-id">
                <b>Research Analyst</b>
                <span>{ws?.name || "Workspace"}</span>
              </div>
              <span className={`an-profile-dot${ready ? " live" : ""}`} aria-hidden />
            </div>
            <div className="an-profile-rows">
              <div><span>Model</span><b>{status?.model || "openai/gpt-oss-120b"}</b></div>
              <div><span>Grounding</span><b>{context.items.length} citable items</b></div>
              <div><span>Context</span><b>{context.tokens.toLocaleString("en-GB")} tokens</b></div>
              <div><span>Thread</span><b>{turns} turn{turns === 1 ? "" : "s"}</b></div>
            </div>
            <div className="an-budget"><i style={{ width: `${budgetPct}%` }} /></div>
            <div className="an-budget-foot"><span>Context window</span><b>{budgetPct}%</b></div>
          </section>

          <section className="an-card">
            <div className="an-card-h">
              <h2>Grounding</h2>
              <span>on / off</span>
            </div>
            <div className="an-scopes">
              {SCOPE_META.map((meta) => {
                const on = scope[meta.key];
                return (
                  <button
                    key={meta.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    className={`an-scope${on ? " on" : ""}`}
                    onClick={() => setScope((s) => ({ ...s, [meta.key]: !s[meta.key] }))}
                  >
                    <span className="an-scope-copy">
                      <b>{meta.label}</b>
                      <em>{meta.hint}</em>
                    </span>
                    <span className="an-scope-n">
                      {byScope[meta.key]} {meta.unit}
                    </span>
                    <span className="an-track">
                      <i />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="an-note">
              Only these items are sent to Groq. Nothing leaves your browser until you ask.
            </p>
          </section>

          <section className="an-card an-card-quiet">
            <div className="an-card-h">
              <h2>Start here</h2>
            </div>
            <div className="an-prompts">
              {SUGGESTIONS.map((s) => (
                <button key={s.title} type="button" className="an-prompt" onClick={() => send(s.body)} disabled={busy}>
                  <span className="an-prompt-ic">{s.icon}</span>
                  <span className="an-prompt-copy">
                    <b>{s.title}</b>
                    <em>{s.body}</em>
                  </span>
                  <span className="an-prompt-arrow" aria-hidden>↗</span>
                </button>
              ))}
            </div>
          </section>

          <p className="an-disclaimer">
            <b>AI-generated.</b> Verify numbers against the cited source before you publish or cite them.
          </p>
        </aside>

        <section className="an-main">
          <div className="an-bar">
            <div className="an-bar-left">
              <span className="an-live-dot" />
              <b>{ws?.name || "Workspace"}</b>

            </div>
            <div className="an-bar-right">
              <span>
                {turns} turn{turns === 1 ? "" : "s"}
              </span>
              <span className="an-model">{status?.model || "openai/gpt-oss-120b"}</span>
            </div>
          </div>

          <div className="an-thread" ref={threadRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="an-intro">
                <div className="an-intro-mark">✦</div>
                <h2>What should we interrogate?</h2>
                <p>
                  {context.counts.sources === 0 && context.counts.nodes === 0
                    ? "This workspace is empty. Add a source or draw a node, then come back."
                    : `${context.items.length} workspace ${context.items.length === 1 ? "item is" : "items are"} in scope right now.`}
                </p>
                <div className="an-tiles">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.title} type="button" className="an-tile" onClick={() => send(s.body)}>
                      <span className="an-tile-ic">{s.icon}</span>
                      <b>{s.title}</b>
                      <em>{s.body}</em>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                if (m.role === "user")
                  return (
                    <div className="an-msg user" key={m.id}>
                      <div className="an-bubble">{m.content}</div>
                    </div>
                  );
                const cites = citationsFor(m.content, context.items);
                return (
                  <div className={`an-msg assistant${m.error ? " err" : ""}`} key={m.id}>
                    <div className="an-avatar">✦</div>
                    <div className="an-answer">
                      {m.content ? (
                        <Prose text={m.content} />
                      ) : (
                        <div className="an-thinking">
                          <i />
                          <i />
                          <i />
                          <span>Reading {context.items.length} workspace items…</span>
                        </div>
                      )}
                      {streamingId === m.id && m.content !== "" && <span className="an-caret" />}
                      {!!cites.length && (
                        <div className="an-cites">
                          <span className="an-cites-h">Grounded in</span>
                          {cites.map((c) => (
                            <Link key={c.tag} to={c.to} className={`an-cite ${c.kind}`} title={c.title}>
                              <b>{c.tag}</b>
                              {c.title.length > 46 ? c.title.slice(0, 44) + "…" : c.title}
                            </Link>
                          ))}
                        </div>
                      )}
                      {!m.error && m.content && (
                        <div className="an-msg-foot">
                          {m.latencyMs ? <span>{(m.latencyMs / 1000).toFixed(1)}s</span> : <span>streaming</span>}
                          <span>·</span>
                          <span>{status?.model || "gpt-oss-120b"}</span>
                          <button type="button" onClick={() => copy(m)}>
                            {copied === m.id ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {status && (status.offline || !status.configured) && (
            <div className="an-warn">
              <b>{status.offline ? "Analyst service not reachable." : "No Groq key on the server."}</b>
              {status.offline
                ? " Start the dev server (npm run dev) or point VITE_API_URL at the FastAPI backend."
                : " Add GROQ_API_KEY to .env and restart the dev server — keys never enter the bundle."}
            </div>
          )}

          <form
            className="an-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="an-compose-box">
              <textarea
                ref={areaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about evidence, gaps, results, memory…"
                aria-label="Ask the analyst"
              />
              {busy ? (
                <button type="button" className="an-send stop" onClick={stop} aria-label="Stop">
                  <span />
                </button>
              ) : (
                <button type="submit" className="an-send" disabled={!input.trim()} aria-label="Send">
                  ↑
                </button>
              )}
            </div>
            <div className="an-hint">
              <span>⌘↵ to send</span>
              <span>{context.items.length} items in scope · grounded answers only</span>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

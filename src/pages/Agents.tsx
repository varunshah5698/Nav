import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useStore, label } from "../lib/store";
import type { AgentName, AgentRun, AgentStatus, Source } from "../lib/types";
import { pct } from "../lib/analytics";
import { Empty } from "../components/ui";
import "../styles/agents.css";

/* ---------- crew ---------- */
const CREW: { n: AgentName; hint: string; d: string; needs: string }[] = [
  { n: "controller", hint: "routes the work", d: "Coordinates the workflow, dependencies and approvals. It never bypasses a gate.", needs: "Approval policy" },
  { n: "paper_reader", hint: "reads sources", d: "Structured summary, contributions and verbatim passages with page citations.", needs: "Source ref" },
  { n: "equation", hint: "pulls equations", d: "Key equations, variables and method details with page references.", needs: "Source ref" },
  { n: "code_setup", hint: "prepares the env", d: "Dependencies, environment and setup commands. Installations wait for approval.", needs: "Approval" },
  { n: "experiment", hint: "runs experiments", d: "Plan → approval → isolated run → logs and artifacts in one traceable record.", needs: "Approval" },
  { n: "benchmark", hint: "compares runs", d: "Compares measured runs to reported baselines. It never invents numbers.", needs: "Run + baseline" },
  { n: "memory", hint: "stores findings", d: "Saves configs, errors, fixes and findings. Writes require your approval.", needs: "Approval" },
  { n: "review", hint: "audits evidence", d: "Checks evidence, citations, consistency and reproducibility before you cite.", needs: "Output ref" },
];

const TINT: Record<AgentName, string> = {
  controller: "#D8F85E",
  paper_reader: "#9C8BE5",
  equation: "#F0CE4E",
  code_setup: "#8FA6A6",
  experiment: "#7FB0FF",
  benchmark: "#5BE39A",
  memory: "#CBB6FF",
  review: "#FFB27A",
};

const SUGGEST: Record<AgentName, string[]> = {
  controller: ["Plan the next research step", "What needs my attention?"],
  paper_reader: ["Summarize the key contributions", "Find limitations and gaps"],
  equation: ["Extract important equations", "List variables and assumptions"],
  code_setup: ["Prepare the environment", "Check dependency risks"],
  experiment: ["Plan an experiment for this dataset", "Run an ablation"],
  benchmark: ["Compare runs to the reported baseline", "Explain the accuracy gap"],
  memory: ["Save the latest findings", "What can I reuse?"],
  review: ["Audit evidence and citations", "Check reproducibility"],
};

const STATE: Record<AgentStatus, { text: string; short: string; tone: string }> = {
  queued: { text: "Queued", short: "Queued", tone: "idle" },
  running: { text: "Running", short: "Running", tone: "busy" },
  waiting_approval: { text: "Needs approval", short: "Gate", tone: "warn" },
  completed: { text: "Completed", short: "Done", tone: "ok" },
  failed: { text: "Failed", short: "Failed", tone: "bad" },
  paused: { text: "Paused", short: "Paused", tone: "idle" },
  cancelled: { text: "Cancelled", short: "Stopped", tone: "idle" },
};

/* ---------- glyphs ---------- */
const GLYPHS: Record<AgentName, ReactNode> = {
  controller: <><circle cx="9" cy="9" r="2.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="15" cy="9" r="1.4"/><circle cx="9" cy="15" r="1.4"/><circle cx="3" cy="9" r="1.4"/><path d="M9 5.4v1.2M11.4 9h2.2M9 11.4v2.2M6.6 9H4.4"/></>,
  paper_reader: <><path d="M5 2.5h5L14.5 7v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M10 2.5V7h4.5M6.5 10h5M6.5 12.6h3.6"/></>,
  equation: <><path d="M13 3.5H5.5l4 5.5-4 5.5H13"/></>,
  code_setup: <><path d="M6.5 6 3.5 9l3 3M11.5 6l3 3-3 3M10 3.5 8 14.5"/></>,
  experiment: <><path d="M7 2.5h4M8 2.5v4.2L4.2 13a1.4 1.4 0 0 0 1.2 2.1h7.2a1.4 1.4 0 0 0 1.2-2.1L10 6.7V2.5"/><path d="M5.8 11.5h6.4"/></>,
  benchmark: <><path d="M3.5 14.5h11M5 14.5V9M9 14.5V5M13 14.5V7"/></>,
  memory: <><path d="M9 2.6 15 5.8 9 9 3 5.8 9 2.6Z"/><path d="m3 9.2 6 3.2 6-3.2M3 12.4l6 3.2 6-3.2"/></>,
  review: <><path d="M9 2.5 14.5 4.5v4.2c0 3.2-2.2 5.4-5.5 6.8-3.3-1.4-5.5-3.6-5.5-6.8V4.5L9 2.5Z"/><path d="m6.4 8.9 1.8 1.8 3.5-3.6"/></>,
};

function AgentGlyph({ agent }: { agent: AgentName }) {
  return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[agent]}</svg>;
}

const I = {
  pulse: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="6.4"/><path d="M9 5.4V9l2.3 1.5"/></svg>,
  gate: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="10" height="7" rx="1.6"/><path d="M6.4 8V6.2a2.6 2.6 0 0 1 5.2 0V8"/></svg>,
  check: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="6.4"/><path d="m6 9.2 2.1 2.1L12.2 7"/></svg>,
  trend: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13.5 7.2 9l2.6 2.4L15 5.5"/><path d="M11.6 5.5H15v3.4"/></svg>,
  lock: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="10" height="7" rx="1.6"/><path d="M6.4 8V6.2a2.6 2.6 0 0 1 5.2 0V8"/></svg>,
  doc: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5h5L14.5 7v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M10 2.5V7h4.5"/></svg>,
};

/* ---------- time ---------- */
const fullDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const rel = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

type Filter = "all" | "gates" | "live" | "done";

export default function Agents() {
  const activeWs = useStore(s => s.activeWs);
  const ws = useStore(s => s.workspaces.find(w => w.id === s.activeWs));
  const allAgents = useStore(s => s.agents);
  const agents = useMemo(() => allAgents
    .filter(a => a.workspaceId === activeWs)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [allAgents, activeWs]);
  const allSources = useStore(s => s.sources);
  const sources = useMemo(() => allSources.filter(s => s.workspaceId === activeWs && s.status === "ready" && (s.chunks?.length || 0) > 0), [allSources, activeWs]);
  const sourceById = useMemo(() => new Map(allSources.map(s => [s.id, s])), [allSources]);

  const start = useStore(s => s.startAgent), ap = useStore(s => s.approveAgent), rj = useStore(s => s.rejectAgent);
  const pauseRun = useStore(s => s.pauseAgent), resumeRun = useStore(s => s.resumeAgent), cancelRun = useStore(s => s.cancelAgent);
  const ev = useStore(s => s.agentEvent), toast = useStore(s => s.toast);

  const [agent, setAgent] = useState<AgentName>("paper_reader");
  const [task, setTask] = useState(SUGGEST.paper_reader[0]);
  const [srcId, setSrcId] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const deckRef = useRef<HTMLElement | null>(null);
  const taskRef = useRef<HTMLTextAreaElement | null>(null);

  const needsSource = agent === "paper_reader" || agent === "equation" || agent === "review";
  const srcForTask = sources.find(s => s.id === srcId) || sources[0];

  const waiting = agents.filter(a => a.status === "waiting_approval");
  const recentGates = agents.filter(a => a.approval && a.approval.state !== "pending").slice(0, 4);
  const liveCount = agents.filter(a => a.status === "queued" || a.status === "running" || a.status === "paused").length;
  const completed = agents.filter(a => a.status === "completed").length;
  const failed = agents.filter(a => a.status === "failed").length;
  const cancelled = agents.filter(a => a.status === "cancelled").length;
  const finished = completed + failed;
  const successRate = finished ? pct(completed, finished) : null;

  const visible = useMemo(() => agents.filter(a => {
    if (filter === "gates") return a.status === "waiting_approval";
    if (filter === "live") return a.status === "queued" || a.status === "running" || a.status === "paused";
    if (filter === "done") return a.status === "completed" || a.status === "failed" || a.status === "cancelled";
    return true;
  }), [agents, filter]);

  const detail = agents.find(a => a.id === sel);
  const closeSheet = useCallback(() => setSel(null), []);

  const pickAgent = (n: AgentName) => {
    if (n !== agent && (!task.trim() || SUGGEST[agent].includes(task.trim()))) setTask(SUGGEST[n][0]);
    setAgent(n);
  };

  const focusComposer = () => {
    deckRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => taskRef.current?.focus(), 320);
  };

  const runTask = () => {
    if (!task.trim() || (needsSource && !srcForTask)) return;
    const id = start(agent, task.trim(), needsSource ? srcForTask?.id : undefined);
    if (id) toast("Task queued — follow it in the run stream.");
  };

  const approve = (id: string, note?: string) => {
    ap(id, note);
    toast(note ? "Approved with a note — the agent will continue." : "Approved — the agent will continue.");
  };
  const reject = (id: string) => { rj(id); toast("Run rejected and stopped."); };
  const modify = (id: string) => {
    const note = window.prompt("Add a note or change for the agent (optional):", "");
    if (note !== null) approve(id, note);
  };
  const pause = (id: string) => { pauseRun(id); toast("Run paused."); };
  const resume = (id: string) => { resumeRun(id); toast("Run resumed."); };
  const cancel = (id: string) => { cancelRun(id); toast("Run cancelled."); };
  const redirect = (r: AgentRun) => {
    const note = window.prompt("Redirect this run — what should the agent focus on?", "Focus on the methods and limitations section.");
    if (note === null) return;
    ev(r.id, "Redirected by researcher: " + (note.trim() || "focus on methods and limitations"));
    toast("Redirect recorded.");
  };
  const copy = (r: AgentRun) => {
    if (!r.output) return;
    if (!navigator.clipboard) { toast("Copy is unavailable here — select the output text manually."); return; }
    navigator.clipboard.writeText(r.output)
      .then(() => toast("Output copied."))
      .catch(() => toast("Copy failed — select the output text manually."));
  };

  const filterCount = (f: Filter) => f === "all" ? agents.length : f === "gates" ? waiting.length : f === "live" ? liveCount : completed + failed + cancelled;

  return <div className="ag-room">
    <header className="ag-head">
      <div>
        <div className="ag-eyebrow"><span>{ws?.name || "Workspace"}</span>{ws?.demo && <span>Demo data</span>}</div>
        <h1 className="ag-h1">Agent control room</h1>
        <p className="ag-sub">Delegate one instruction, then watch the Controller route it. Consequential steps stop here until you approve them.</p>
      </div>
      <div className="ag-head-side">
        <span className="ag-now">
          <i className={liveCount ? "live" : waiting.length ? "gate" : ""} />
          {liveCount ? `${liveCount} active` : waiting.length ? `${waiting.length} waiting` : "all quiet"}
          <span style={{ color: "#C6CBC7" }}>·</span>
          {waiting.length} gate{waiting.length === 1 ? "" : "s"}
        </span>
        <button className="btn btn-primary btn-sm" onClick={focusComposer}>New run</button>
      </div>
    </header>

    <section className="ag-stats" aria-label="Agent summary">
      <article className="ag-stat t-violet">
        <div className="ag-stat-top"><span className="ag-stat-ic">{I.pulse}</span>Active now</div>
        <b>{liveCount}</b>
        <div className="ag-stat-foot"><b>{agents.length}</b> run{agents.length === 1 ? "" : "s"} in this workspace</div>
      </article>
      <article className="ag-stat t-warn">
        <div className="ag-stat-top"><span className="ag-stat-ic">{I.gate}</span>Awaiting approval</div>
        <b>{waiting.length}</b>
        <div className="ag-stat-foot">{waiting.length ? "safety gates open" : "all clear"}{waiting.length ? <><span>·</span><b>{label(waiting[0].agent)}</b></> : null}</div>
      </article>
      <article className="ag-stat t-good">
        <div className="ag-stat-top"><span className="ag-stat-ic">{I.check}</span>Completed</div>
        <b>{completed}</b>
        <div className="ag-stat-foot"><b>{failed}</b> failed<span>·</span>{cancelled} cancelled</div>
      </article>
      <article className="ag-stat t-blue">
        <div className="ag-stat-top"><span className="ag-stat-ic">{I.trend}</span>Success rate</div>
        <b>{successRate === null ? "—" : successRate}{successRate === null ? null : <small>%</small>}</b>
        <div className="ag-stat-foot">{successRate === null ? "no finished runs yet" : "completed ÷ finished runs"}</div>
      </article>
    </section>

    <section className="ag-deck" ref={deckRef} aria-label="Delegate a task">
      <div className="ag-deck-head">
        <div>
          <h2>Delegate a task</h2>
          <p>Pick a specialist and give it one clear instruction. The Controller sequences follow-up work; risky steps stay behind a gate.</p>
        </div>
        <span className="ag-gate-pill">{I.lock} Approval gates on</span>
      </div>
      <div className="ag-deck-grid">
        <div className="ag-picks" role="radiogroup" aria-label="Choose an agent">
          {CREW.map(c => <button key={c.n} type="button" role="radio" aria-checked={agent === c.n}
            className={`ag-pick${agent === c.n ? " on" : ""}`} style={{ "--tint": TINT[c.n] } as CSSProperties}
            onClick={() => pickAgent(c.n)}>
            <span className="ag-pick-ic"><AgentGlyph agent={c.n} /></span>
            <b>{label(c.n)}</b>
            <em>{c.needs}</em>
          </button>)}
        </div>

        <div className="ag-compose">
          <div className="ag-compose-top"><b>{label(agent)}</b><span>Instruction</span></div>
          <textarea ref={taskRef} className="ag-task" value={task} onChange={e => setTask(e.target.value)}
            placeholder={`Ask the ${label(agent).toLowerCase()} to…`} aria-label="Task instruction" />
          <div className="ag-suggest">
            {SUGGEST[agent].map(s => <button key={s} type="button" className={task.trim() === s ? "on" : ""} onClick={() => setTask(s)}>{s}</button>)}
          </div>
          {needsSource && (sources.length
            ? <label className="ag-src">
                <span className="ag-src-label">Source</span>
                <select value={srcForTask?.id || ""} onChange={e => setSrcId(e.target.value)} aria-label="Source to analyze">
                  {sources.map(s => <option key={s.id} value={s.id}>{s.title.length > 44 ? s.title.slice(0, 44) + "…" : s.title}</option>)}
                </select>
                <span className="ag-src-meta">{srcForTask?.pages ? `${srcForTask.pages}p` : `${srcForTask?.chunks?.length || 0} passages`}</span>
              </label>
            : <span className="ag-no-source">{I.doc}<span>No extracted source yet — <Link to="/app/sources">add a PDF in Sources</Link> to analyse your own paper.</span></span>)}
          <div className="ag-compose-foot">
            <span className="note">{needsSource ? "Quotes the selected source verbatim. No LLM key needed." : "Code setup, experiments and memory writes always ask first."}</span>
            <button className="btn btn-lime" onClick={runTask} disabled={!task.trim() || (needsSource && !srcForTask)}>Run via Controller</button>
          </div>
        </div>
      </div>
    </section>

    <div className="ag-main">
      <section className="ag-panel" aria-label="Run stream">
        <div className="ag-panel-h">
          <h2>Run stream</h2>
          <span className="ag-count">{agents.length}</span>
          <div className="ag-tabs" role="group" aria-label="Filter runs">
            {(["all", "gates", "live", "done"] as const).map(f =>
              <button key={f} className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "gates" ? "Gates" : f === "live" ? "Live" : "Done"} {filterCount(f)}
              </button>)}
          </div>
        </div>
        {!agents.length
          ? <div className="ag-empty"><Empty title="No agent runs yet" body="Delegate a task above — every event, approval and artifact will appear here and persist across reloads."
              action={<button className="btn btn-lime btn-sm" onClick={focusComposer}>Delegate your first task</button>} /></div>
          : !visible.length
            ? <div className="ag-empty"><Empty title="No runs in this view" body="Nothing matches this filter right now. Switch back to All to see the full stream." /></div>
            : <div className="ag-runs">{visible.map(a => {
              const st = STATE[a.status];
              const src = a.inputRef ? sourceById.get(a.inputRef) : undefined;
              return <div className="ag-run" key={a.id}>
                <button className="ag-run-hit" onClick={() => setSel(a.id)} aria-label={`Inspect ${label(a.agent)} run: ${a.task}`}>
                  <span className="ag-run-ic" style={{ "--tint": TINT[a.agent] } as CSSProperties}><AgentGlyph agent={a.agent} /></span>
                  <span className="ag-run-main">
                    <span className="ag-run-top"><b>{label(a.agent)}</b></span>
                    <span className="ag-run-task">{a.task}</span>
                    <span className="ag-run-meta">
                      <span>{rel(a.createdAt)}</span>
                      {src && <><span className="sep">·</span><span className="src">{src.title}</span></>}
                      {typeof a.confidence === "number" && <><span className="sep">·</span><span className="ag-conf"><span className="track"><i style={{ width: Math.round(a.confidence * 100) + "%" }} /></span>{(a.confidence * 100).toFixed(0)}%</span></>}
                    </span>
                  </span>
                </button>
                <div className="ag-run-side">
                  <span className={`ag-state ${st.tone}`}><i />{st.text}</span>
                  <button className="ag-chev" aria-label="Open run details" onClick={() => setSel(a.id)}>›</button>
                </div>
                <div className="ag-run-extra">
                  {a.status === "waiting_approval" && <button className="ag-mini warn" onClick={() => setSel(a.id)}>Review gate</button>}
                  {a.status === "running" && <button className="ag-mini" onClick={() => pause(a.id)}>Pause</button>}
                  {a.status === "paused" && <button className="ag-mini" onClick={() => resume(a.id)}>Resume</button>}
                  {(a.status === "running" || a.status === "paused" || a.status === "queued") && <button className="ag-mini danger" onClick={() => cancel(a.id)}>Cancel</button>}
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#A2A8A6" }}>{a.events.length} event{a.events.length === 1 ? "" : "s"}</span>
                </div>
              </div>;
            })}</div>}
      </section>

      <div className="ag-rail">
      <aside className="ag-panel ag-approvals" aria-label="Approval queue">
        <div className="ag-panel-h">
          <h2>Approval queue</h2>
          <span className="ag-count">{waiting.length}</span>
          {waiting.length ? <span className="ag-hint">needs you</span> : null}
        </div>
        {waiting.length ? waiting.map(a => <div className="ag-approval" key={a.id}>
          <div className="ag-approval-top">
            <span className="ag-approval-ic">{I.gate}</span>
            <span className="ag-approval-id"><b>{label(a.agent)}</b><span>{a.approval?.action}</span></span>
            <span className="ag-state warn"><i />Gate</span>
          </div>
          <p>{a.approval?.reason}</p>
          <dl>
            <div><dt>Expected</dt><dd>{a.approval?.expected}</dd></div>
            <div><dt>Risk</dt><dd>{a.approval?.risks}</dd></div>
          </dl>
          <div className="ag-approval-btns">
            <button className="btn btn-primary" onClick={() => approve(a.id)}>Approve</button>
            <button className="btn btn-ghost" onClick={() => modify(a.id)}>Modify</button>
            <button className="btn btn-ghost" onClick={() => reject(a.id)}>Reject</button>
            <button className="btn btn-ghost" onClick={() => setSel(a.id)}>Inspect</button>
          </div>
        </div>) : <div className="ag-clear">
          <span className="ag-clear-ic">{I.check}</span>
          <div><b>No gates waiting</b><p>Consequential actions pause here until you approve them.</p></div>
        </div>}
        <p className="ag-rail-note">Approval gates are enforced in the store: code setup, experiments and memory writes cannot execute without you.</p>
      </aside>

      <section className="ag-panel ag-history" aria-label="Recent approvals">
        <div className="ag-panel-h">
          <h2>Recent gates</h2>
          <span className="ag-count">{recentGates.length}</span>
          {recentGates.length ? <span className="ag-hint">resolved</span> : null}
        </div>
        {recentGates.length ? <div className="ag-hist">{recentGates.map(a => {
          const approved = a.approval?.state === "approved";
          return <button key={a.id} className="ag-hist-row" onClick={() => setSel(a.id)} aria-label={`Open ${label(a.agent)} gate`}>
            <span className="ag-hist-dot" style={{ background: approved ? "var(--good)" : "var(--bad)" }} />
            <span className="ag-hist-main"><b>{label(a.agent)}</b><span>{a.approval?.action}</span></span>
            <span className={`ag-state ${approved ? "ok" : "bad"}`}><i />{approved ? "Approved" : "Rejected"}</span>
          </button>;
        })}</div> : <p className="ag-rail-note">Resolved approvals will be listed here so every gate stays auditable.</p>}
      </section>
      </div>
    </div>

    <section className="ag-crew-sec">
      <div className="ag-sec-head">
        <h2>The crew</h2>
        <p>Eight specialists, one routing controller.</p>
        <span className="ag-count">{agents.length} run{agents.length === 1 ? "" : "s"}</span>
      </div>
      <div className="ag-crew">
        {CREW.map(c => {
          const runs = agents.filter(a => a.agent === c.n);
          const last = runs[0];
          const st = last ? STATE[last.status] : null;
          return <button key={c.n} type="button" className="ag-card" style={{ "--tint": TINT[c.n] } as CSSProperties}
            onClick={() => { pickAgent(c.n); focusComposer(); }} aria-label={`Delegate to ${label(c.n)}`}>
            <span className="ag-card-top">
              <span className="ag-card-ic"><AgentGlyph agent={c.n} /></span>
              <span className="ag-card-id"><b>{label(c.n)}</b><span>{c.hint}</span></span>
              {st && <span className={`ag-state ${st.tone}`}><i />{st.short}</span>}
            </span>
            <p>{c.d}</p>
            <span className="ag-card-foot">
              <span>{runs.length} run{runs.length === 1 ? "" : "s"}</span>
              <span className="ag-needs">{c.needs}</span>
              <span className="ag-use">Use →</span>
            </span>
          </button>;
        })}
      </div>
    </section>

    {detail && <RunSheet run={detail} source={detail.inputRef ? sourceById.get(detail.inputRef) : undefined}
      onClose={closeSheet}
      onApprove={() => approve(detail.id)} onReject={() => reject(detail.id)}
      onPause={() => pause(detail.id)} onResume={() => resume(detail.id)} onCancel={() => cancel(detail.id)}
      onRedirect={() => redirect(detail)} onCopy={() => copy(detail)} />}
  </div>;
}

/* ---------- inspector ---------- */
function RunSheet({ run, source, onClose, onApprove, onReject, onPause, onResume, onCancel, onRedirect, onCopy }: {
  run: AgentRun; source?: Source; onClose: () => void;
  onApprove: () => void; onReject: () => void; onPause: () => void; onResume: () => void; onCancel: () => void;
  onRedirect: () => void; onCopy: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const st = STATE[run.status];
  const approvalTone = run.approval?.state === "approved" ? "ok" : run.approval?.state === "rejected" ? "bad" : "warn";

  return <div className="ag-overlay" onClick={onClose}>
    <aside className="ag-sheet" role="dialog" aria-modal="true" aria-labelledby="ag-sheet-title" onClick={e => e.stopPropagation()}>
      <header className="ag-sheet-head">
        <span className="ag-sheet-ic" style={{ "--tint": TINT[run.agent] } as CSSProperties}><AgentGlyph agent={run.agent} /></span>
        <div className="ag-sheet-id">
          <div className="ag-sheet-kicker">{label(run.agent)}<span className={`ag-state ${st.tone}`}><i />{st.text}</span></div>
          <h2 id="ag-sheet-title">{run.task}</h2>
          <p>Started {fullDate(run.createdAt)} · updated {rel(run.updatedAt)}</p>
        </div>
        <button className="ag-x" aria-label="Close run details" onClick={onClose}>×</button>
      </header>

      <div className="ag-sheet-body">
        <dl className="ag-meta">
          <div><dt>Agent</dt><dd>{label(run.agent)}</dd></div>
          <div><dt>Status</dt><dd>{st.text}</dd></div>
          <div><dt>Source</dt><dd>{source?.title || "—"}</dd></div>
          <div><dt>Confidence</dt><dd>{typeof run.confidence === "number" ? `${(run.confidence * 100).toFixed(0)}%` : "—"}</dd></div>
          <div><dt>Started</dt><dd>{fullDate(run.createdAt)}</dd></div>
          <div><dt>Tool calls</dt><dd className="code">{run.toolCalls?.length ? run.toolCalls.join(", ") : "—"}</dd></div>
        </dl>

        {run.approval && <div className="ag-gate">
          <div className="ag-gate-top">
            <b>{run.approval.action}</b>
            <span className={`ag-state ${approvalTone}`}><i />{run.approval.state[0].toUpperCase() + run.approval.state.slice(1)}</span>
          </div>
          <p>{run.approval.reason}</p>
          <dl>
            <div><dt>Expected</dt><dd>{run.approval.expected}</dd></div>
            <div><dt>Risk</dt><dd>{run.approval.risks}</dd></div>
          </dl>
          {run.status === "waiting_approval" && <div className="ag-gate-acts">
            <button className="btn btn-primary" onClick={onApprove}>Approve</button>
            <button className="btn btn-ghost" onClick={onReject}>Reject</button>
          </div>}
        </div>}

        <section>
          <div className="ag-sec-h"><h3>Output</h3>{run.output && <button className="ag-copy" onClick={onCopy}>Copy</button>}</div>
          {run.output
            ? <pre className="ag-output">{run.output}</pre>
            : <p className="ag-muted">{run.status === "waiting_approval" ? "Waiting for your approval — nothing has executed yet." : "No output yet. Queued and running tasks write their result when they finish."}</p>}
        </section>

        <section>
          <div className="ag-sec-h"><h3>Event log</h3><span style={{ marginLeft: "auto", fontSize: 9, color: "#A2A8A6" }}>{run.events.length} event{run.events.length === 1 ? "" : "s"}</span></div>
          <ol className="ag-timeline">
            {run.events.map((e, i) => <li className="ag-ev" key={i}>
              <span className={`ag-ev-dot ${e.kind}`} />
              <div className="ag-ev-main">{e.text}<time>{fullDate(e.ts)}{e.detail ? ` · ${e.detail}` : ""}</time></div>
            </li>)}
          </ol>
        </section>
      </div>

      <footer className="ag-sheet-foot">
        {run.status === "running" && <button className="btn btn-ghost" onClick={onPause}>Pause</button>}
        {run.status === "paused" && <button className="btn btn-ghost" onClick={onResume}>Resume</button>}
        {(run.status === "queued" || run.status === "running" || run.status === "paused") && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-ghost" onClick={onRedirect}>Redirect</button>
        <button className="btn btn-primary spacer" onClick={onClose}>Close</button>
      </footer>
    </aside>
  </div>;
}

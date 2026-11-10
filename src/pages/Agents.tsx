import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useStore, label } from "../lib/store";
import type { AgentName, AgentRun, AgentStatus, Source } from "../lib/types";
import { pct } from "../lib/analytics";
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
  controller: "#F3703F",
  paper_reader: "#C9BDFF",
  equation: "#F2B64B",
  code_setup: "#9FB7B2",
  experiment: "#7FB0FF",
  benchmark: "#82E78F",
  memory: "#D9B8FF",
  review: "#FF937A",
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
  pulse: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="6.4"/><path d="M9 5.4V9l2.3 1.5"/></svg>,
  gate: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="8" width="10" height="7" rx="1.6"/><path d="M6.4 8V6.2a2.6 2.6 0 0 1 5.2 0V8"/></svg>,
  check: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="6.4"/><path d="m6 9.2 2.1 2.1L12.2 7"/></svg>,
  lock: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="8" width="10" height="7" rx="1.6"/><path d="M6.4 8V6.2a2.6 2.6 0 0 1 5.2 0V8"/></svg>,
  doc: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2.5h5L14.5 7v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M10 2.5V7h4.5"/></svg>,
  plus: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 3.5v11M3.5 9h11"/></svg>,
  arrow: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 9h10M9.5 5l4 4-4 4"/></svg>,
  close: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m5 5 8 8M13 5l-8 8"/></svg>,
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
const shortDay = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "short" });

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
  const selectedCrew = CREW.find(c => c.n === agent) || CREW[1];

  const waiting = agents.filter(a => a.status === "waiting_approval");
  const recentGates = agents.filter(a => a.approval && a.approval.state !== "pending").slice(0, 4);
  const liveCount = agents.filter(a => a.status === "queued" || a.status === "running" || a.status === "paused").length;
  const queuedCount = agents.filter(a => a.status === "queued").length;
  const runningCount = agents.filter(a => a.status === "running").length;
  const pausedCount = agents.filter(a => a.status === "paused").length;
  const completed = agents.filter(a => a.status === "completed").length;
  const failed = agents.filter(a => a.status === "failed").length;
  const cancelled = agents.filter(a => a.status === "cancelled").length;
  const finished = completed + failed;
  const successRate = finished ? pct(completed, finished) : null;

  const weekData = useMemo(() => {
    const startDay = new Date();
    startDay.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startDay);
      day.setDate(startDay.getDate() - (6 - i));
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const count = agents.filter(a => {
        const t = new Date(a.createdAt);
        return t >= day && t < next;
      }).length;
      return { label: shortDay(day), date: day, count };
    });
  }, [agents]);
  const weekTotal = weekData.reduce((sum, day) => sum + day.count, 0);
  const weekMax = Math.max(1, ...weekData.map(day => day.count));
  const peakDay = weekData.reduce((best, day, i) => day.count > weekData[best].count ? i : best, 0);
  const activityLabel = `Agent runs per day over the last seven days: ${weekData.map(day => `${day.label} ${day.count}`).join(", ")}.`;

  const outcomeGroups = [
    { label: "Completed", count: completed, color: "#82E78F" },
    { label: "Needs approval", count: waiting.length, color: "#F2B64B" },
    { label: "Active", count: liveCount, color: "#C9BDFF" },
    { label: "Failed / stopped", count: failed + cancelled, color: "#FF937A" },
  ];
  const outcomeTotal = outcomeGroups.reduce((sum, group) => sum + group.count, 0);
  const donutRadius = 64;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutCursor = 0;
  const donutSegments = outcomeGroups.map(group => {
    const fraction = outcomeTotal ? group.count / outcomeTotal : 0;
    const dash = fraction ? Math.max(fraction * donutCircumference - 5, 1) : 0;
    const offset = -(donutCursor * donutCircumference + 2.5);
    donutCursor += fraction;
    return { ...group, dash, offset };
  }).filter(group => group.count > 0);

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

  const latestFor = (n: AgentName) => {
    const runs = agents.filter(a => a.agent === n);
    return { runs, last: runs[0], state: runs[0] ? STATE[runs[0].status] : null };
  };

  return <div className="hza-page">
    <header className="hza-head">
      <div className="hza-head-copy">
        <div className="hza-eyebrow">
          <span className="hza-eyebrow-ws"><i />{ws?.name || "Workspace"}</span>
          {ws?.demo && <span className="hza-eyebrow-demo">Demo data</span>}
        </div>
        <h1>Agent control room</h1>
        <p>Delegate one instruction, then watch the Controller route it. Consequential steps stop here until you approve them.</p>
      </div>
      <div className="hza-head-side">
        <span className={`hza-live-pill${liveCount ? " live" : waiting.length ? " gate" : ""}`}>
          <i />
          {liveCount ? `${liveCount} active` : waiting.length ? `${waiting.length} waiting` : "All quiet"}
          <span className="hza-live-sep">·</span>
          {waiting.length} gate{waiting.length === 1 ? "" : "s"}
        </span>
        <button className="hza-btn hza-btn-primary hza-new-btn" onClick={focusComposer}>
          {I.plus} New run
        </button>
      </div>
    </header>

    <div className="hza-layout">
      <main className="hza-main">
        <section className="hza-kpis" aria-label="Agent summary">
          <article className="hza-kpi">
            <div className="hza-kpi-top">
              <span className="hza-kpi-label">Active now</span>
              <span className={`hza-kpi-dot${liveCount ? " live" : ""}`} />
            </div>
            <div className="hza-kpi-main">
              <b>{liveCount}</b>
              <span className="hza-chip neutral">{agents.length} run{agents.length === 1 ? "" : "s"}</span>
            </div>
            <p className="hza-kpi-foot">
              {queuedCount} queued <span>·</span> {runningCount} running{pausedCount ? <> <span>·</span> {pausedCount} paused</> : null}
            </p>
          </article>
          <article className="hza-kpi">
            <div className="hza-kpi-top">
              <span className="hza-kpi-label">Awaiting approval</span>
              <span className={`hza-kpi-dot${waiting.length ? " gate" : ""}`} />
            </div>
            <div className="hza-kpi-main">
              <b>{waiting.length}</b>
              <span className={`hza-chip ${waiting.length ? "warn" : "good"}`}>{waiting.length ? "Needs you" : "All clear"}</span>
            </div>
            <p className="hza-kpi-foot">{waiting.length ? "Safety gates are holding work." : "Consequential actions are gated."}</p>
          </article>
          <article className="hza-kpi">
            <div className="hza-kpi-top">
              <span className="hza-kpi-label">Completed</span>
              <span className="hza-kpi-dot live" />
            </div>
            <div className="hza-kpi-main">
              <b>{completed}</b>
              <span className="hza-chip good">{agents.length ? `${pct(completed, agents.length)}% of runs` : "No runs"}</span>
            </div>
            <p className="hza-kpi-foot">{failed} failed <span>·</span> {cancelled} cancelled</p>
          </article>
          <article className="hza-kpi">
            <div className="hza-kpi-top">
              <span className="hza-kpi-label">Success rate</span>
              <span className="hza-kpi-dot violet" />
            </div>
            <div className="hza-kpi-main">
              <b>{successRate === null ? "—" : successRate}{successRate === null ? null : <small>%</small>}</b>
              <span className="hza-chip neutral">{finished} finished</span>
            </div>
            <p className="hza-kpi-foot">Completed ÷ finished runs</p>
          </article>
        </section>

        <div className="hza-charts">
          <article className="hza-card hza-activity">
            <div className="hza-card-head">
              <div><h2>Run activity</h2><p>Runs started per day</p></div>
              <span className="hza-note">Last 7 days</span>
            </div>
            <div className="hza-chart-meta">
              <b>{weekTotal}</b><span>runs this week</span>
              <span className="hza-chip neutral">peak {Math.max(...weekData.map(day => day.count))}</span>
            </div>
            <div className="hza-bars" role="img" aria-label={activityLabel}>
              {weekData.map((day, i) => {
                const height = day.count ? Math.max(8, Math.round(day.count / weekMax * 100)) : 0;
                const hot = day.count > 0 && i === peakDay;
                return <div className="hza-bar-col" key={day.label + i} title={`${day.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${day.count} run${day.count === 1 ? "" : "s"}`}>
                  <span className={`hza-bar${hot ? " hot" : ""}${day.count ? "" : " zero"}`} style={{ height: `${height}%` }} />
                </div>;
              })}
            </div>
            <div className="hza-bar-labels" aria-hidden="true">
              {weekData.map((day, i) => <span key={day.label + i}>{day.label}</span>)}
            </div>
            <div className="hza-activity-foot">
              <span><i className="hza-legend-dot hot" /> Highlighted peak</span>
              <span>{weekTotal ? `${weekTotal} total` : "No runs this week"}</span>
            </div>
          </article>

          <article className="hza-card hza-outcomes">
            <div className="hza-card-head">
              <div><h2>Run outcomes</h2><p>Across every run</p></div>
              <span className="hza-note">{outcomeTotal} total</span>
            </div>
            <div className="hza-outcome-body">
              <div className="hza-donut-wrap">
                <svg className="hza-donut" viewBox="0 0 200 200" role="img" aria-label={`Run outcomes: ${outcomeGroups.map(group => `${group.label} ${group.count}`).join(", ")}`}>
                  <circle cx="100" cy="100" r={donutRadius} fill="none" stroke="rgba(255,255,255,.065)" strokeWidth="22" />
                  <g transform="rotate(-90 100 100)" fill="none" strokeWidth="22">
                    {donutSegments.map(segment => <circle key={segment.label} cx="100" cy="100" r={donutRadius} stroke={segment.color} strokeDasharray={`${segment.dash} ${donutCircumference - segment.dash}`} strokeDashoffset={segment.offset} />)}
                  </g>
                </svg>
                <div className="hza-donut-center"><b>{outcomeTotal}</b><span>runs</span></div>
              </div>
              <ul className="hza-outcome-legend">
                {outcomeGroups.map(group => <li key={group.label}>
                  <span className="hza-outcome-dot" style={{ background: group.color }} />
                  <span className="hza-outcome-label">{group.label}</span>
                  <b>{group.count}</b>
                  <span className="hza-outcome-pct">{outcomeTotal ? `${Math.round(group.count / outcomeTotal * 100)}%` : "—"}</span>
                </li>)}
              </ul>
            </div>
          </article>
        </div>

        <section className="hza-card hza-deck" ref={deckRef} aria-labelledby="hza-deck-title">
          <div className="hza-card-head hza-deck-head">
            <div>
              <h2 id="hza-deck-title">Delegate a task</h2>
              <p>Pick a specialist and give it one clear instruction. The Controller sequences follow-up work; risky steps stay behind a gate.</p>
            </div>
            <span className="hza-gate-pill">{I.lock}<span>Approval gates on</span></span>
          </div>

          <div className="hza-picks" role="radiogroup" aria-label="Choose an agent">
            {CREW.map(c => <button key={c.n} type="button" role="radio" aria-checked={agent === c.n}
              className={`hza-pick${agent === c.n ? " on" : ""}`} style={{ "--tint": TINT[c.n] } as CSSProperties}
              title={c.d} onClick={() => pickAgent(c.n)}>
              <span className="hza-pick-ic"><AgentGlyph agent={c.n} /></span>
              <span className="hza-pick-text"><b>{label(c.n)}</b><em>{c.hint}</em></span>
            </button>)}
          </div>

          <div className="hza-compose">
            <div className="hza-compose-main">
              <div className="hza-compose-head">
                <span className="hza-compose-agent" style={{ "--tint": TINT[agent] } as CSSProperties}><AgentGlyph agent={agent} /></span>
                <div className="hza-compose-id">
                  <b>{label(agent)}</b>
                  <span>{selectedCrew.hint} · {selectedCrew.needs.toLowerCase()}</span>
                </div>
                <span className="hza-compose-kicker">Instruction</span>
              </div>
              <textarea ref={taskRef} className="hza-task" value={task} onChange={e => setTask(e.target.value)}
                placeholder={`Ask the ${label(agent).toLowerCase()} to…`} aria-label="Task instruction" />
              <div className="hza-suggest">
                {SUGGEST[agent].map(s => <button key={s} type="button" className={task.trim() === s ? "on" : ""} onClick={() => setTask(s)}>{s}</button>)}
              </div>
              {needsSource && (sources.length
                ? <label className="hza-source">
                    <span className="hza-source-label">Source</span>
                    <select value={srcForTask?.id || ""} onChange={e => setSrcId(e.target.value)} aria-label="Source to analyze">
                      {sources.map(s => <option key={s.id} value={s.id}>{s.title.length > 44 ? s.title.slice(0, 44) + "…" : s.title}</option>)}
                    </select>
                    <span className="hza-source-meta">{srcForTask?.pages ? `${srcForTask.pages}p` : `${srcForTask?.chunks?.length || 0} passages`}</span>
                  </label>
                : <span className="hza-no-source">{I.doc}<span>No extracted source yet — <Link to="/app/sources">add a PDF in Sources</Link> to analyse your own paper.</span></span>)}
            </div>

            <aside className="hza-compose-side">
              <div className="hza-policy">
                <span className="hza-policy-ic">{I.lock}</span>
                <div><b>Guarded by default</b><p>Code setup, experiments and memory writes pause here until you approve them.</p></div>
              </div>
              <ul className="hza-policy-list">
                <li>{I.check}<span>Source citations stay attached</span></li>
                <li>{I.lock}<span>Consequential steps wait for you</span></li>
                <li>{I.doc}<span>Every run keeps an audit trail</span></li>
              </ul>
              <button className="hza-btn hza-btn-primary hza-run-btn" onClick={runTask} disabled={!task.trim() || (needsSource && !srcForTask)}>
                Run via Controller {I.arrow}
              </button>
              <p className="hza-compose-note">{needsSource ? "Quotes the selected source verbatim. No LLM key needed." : "The Controller sequences follow-up work and holds every gate."}</p>
            </aside>
          </div>
        </section>

        <section className="hza-card hza-stream" aria-labelledby="hza-stream-title">
          <div className="hza-stream-head">
            <div className="hza-title-line"><h2 id="hza-stream-title">Run stream</h2><span className="hza-count">{agents.length}</span></div>
            <div className="hza-tabs" role="group" aria-label="Filter runs">
              {(["all", "gates", "live", "done"] as const).map(f =>
                <button key={f} type="button" className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "gates" ? "Gates" : f === "live" ? "Live" : "Done"}<span>{filterCount(f)}</span>
                </button>)}
            </div>
          </div>

          {!agents.length
            ? <div className="hza-stream-empty">
                <span className="hza-empty-ic">{I.pulse}</span>
                <b>No agent runs yet</b>
                <p>Delegate a task above — every event, approval and artifact will appear here and persist across reloads.</p>
                <button className="hza-btn hza-btn-primary" onClick={focusComposer}>Delegate your first task</button>
              </div>
            : !visible.length
              ? <div className="hza-stream-empty">
                  <span className="hza-empty-ic">{I.gate}</span>
                  <b>No runs in this view</b>
                  <p>Nothing matches this filter right now. Switch back to all runs to see the full stream.</p>
                  <button className="hza-btn hza-btn-ghost" onClick={() => setFilter("all")}>Show all runs</button>
                </div>
              : <div className="hza-runs">
                  {visible.map(a => {
                    const st = STATE[a.status];
                    const src = a.inputRef ? sourceById.get(a.inputRef) : undefined;
                    const actionable = a.status === "waiting_approval" || a.status === "running" || a.status === "paused" || a.status === "queued";
                    return <div className={`hza-run${a.status === "waiting_approval" ? " gate" : ""}`} key={a.id}>
                      <button className="hza-run-hit" onClick={() => setSel(a.id)} aria-label={`Inspect ${label(a.agent)} run: ${a.task}`}>
                        <span className="hza-run-ic" style={{ "--tint": TINT[a.agent] } as CSSProperties}><AgentGlyph agent={a.agent} /></span>
                        <span className="hza-run-main">
                          <span className="hza-run-task">{a.task}</span>
                          <span className="hza-run-meta">
                            <b>{label(a.agent)}</b>
                            <span className="hza-sep">·</span>
                            <span>{rel(a.createdAt)}</span>
                            {src && <><span className="hza-sep">·</span><span className="hza-run-src">{src.title}</span></>}
                            {typeof a.confidence === "number" && <><span className="hza-sep">·</span><span className="hza-conf"><span className="hza-conf-track"><i style={{ width: Math.round(a.confidence * 100) + "%" }} /></span>{(a.confidence * 100).toFixed(0)}%</span></>}
                          </span>
                        </span>
                      </button>
                      <div className="hza-run-side">
                        <span className={`hza-state ${st.tone}`}><i />{st.text}</span>
                        <button className="hza-chev" aria-label="Open run details" onClick={() => setSel(a.id)}>›</button>
                      </div>
                      {actionable && <div className="hza-run-actions">
                        {a.status === "waiting_approval" && <button className="hza-mini warn" onClick={() => setSel(a.id)}>Review gate</button>}
                        {a.status === "running" && <button className="hza-mini" onClick={() => pause(a.id)}>Pause</button>}
                        {a.status === "paused" && <button className="hza-mini" onClick={() => resume(a.id)}>Resume</button>}
                        {(a.status === "running" || a.status === "paused" || a.status === "queued") && <button className="hza-mini danger" onClick={() => cancel(a.id)}>Cancel</button>}
                        <span className="hza-event-count">{a.events.length} event{a.events.length === 1 ? "" : "s"}</span>
                      </div>}
                    </div>;
                  })}
                </div>}
        </section>
      </main>

      <aside className="hza-rail">
        <section className="hza-card hza-controller" aria-labelledby="hza-controller-title">
          <div className="hza-controller-head">
            <span className="hza-controller-avatar"><AgentGlyph agent="controller" /><i /></span>
            <div className="hza-controller-id">
              <h2 id="hza-controller-title">Controller</h2>
              <p>Orchestrator · guarded</p>
            </div>
            <span className="hza-chip good hza-online"><i />Online</span>
          </div>
          <p className="hza-controller-copy">Routes every specialist, sequences follow-up work, and stops at every gate. Nothing consequential executes without you.</p>
          <dl className="hza-controller-facts">
            <div><dt>Specialists</dt><dd>{CREW.length}</dd></div>
            <div><dt>Runs</dt><dd>{agents.length}</dd></div>
            <div><dt>Active</dt><dd>{liveCount}</dd></div>
            <div><dt>Success</dt><dd>{successRate === null ? "—" : `${successRate}%`}</dd></div>
          </dl>
        </section>

        <section className="hza-card hza-approvals" aria-labelledby="hza-approvals-title">
          <div className="hza-card-head hza-rail-head">
            <div><h2 id="hza-approvals-title">Approval queue</h2><p>{waiting.length ? "Consequential steps are waiting for you." : "Every gate is clear."}</p></div>
            <span className={`hza-count${waiting.length ? " warn" : ""}`}>{waiting.length}</span>
          </div>
          {waiting.length
            ? waiting.map(a => <div className="hza-gate-card" key={a.id}>
                <div className="hza-gate-top">
                  <span className="hza-gate-ic">{I.gate}</span>
                  <div className="hza-gate-id"><b>{label(a.agent)}</b><span>{a.approval?.action}</span></div>
                  <span className="hza-state warn"><i />Gate</span>
                </div>
                <p className="hza-gate-reason">{a.approval?.reason}</p>
                <div className="hza-gate-facts">
                  <div><span>Expected</span><b>{a.approval?.expected}</b></div>
                  <div><span>Risk</span><b>{a.approval?.risks}</b></div>
                </div>
                <div className="hza-gate-actions">
                  <button className="hza-btn hza-btn-primary hza-btn-xs" onClick={() => approve(a.id)}>Approve</button>
                  <button className="hza-btn hza-btn-ghost hza-btn-xs" onClick={() => modify(a.id)}>Modify</button>
                  <button className="hza-btn hza-btn-ghost hza-btn-xs" onClick={() => reject(a.id)}>Reject</button>
                  <button className="hza-btn-link" onClick={() => setSel(a.id)}>Inspect</button>
                </div>
              </div>)
            : <div className="hza-clear">
                <span className="hza-clear-ic">{I.check}</span>
                <div><b>No gates waiting</b><p>Consequential actions pause here until you approve them.</p></div>
              </div>}

          {recentGates.length > 0 && <div className="hza-resolved">
            <div className="hza-subhead">Recently resolved <span>{recentGates.length}</span></div>
            {recentGates.map(a => {
              const approved = a.approval?.state === "approved";
              return <button key={a.id} className="hza-resolved-row" onClick={() => setSel(a.id)} aria-label={`Open ${label(a.agent)} gate`}>
                <span className={`hza-resolved-dot ${approved ? "ok" : "bad"}`} />
                <span className="hza-resolved-main"><b>{label(a.agent)}</b><span>{a.approval?.action}</span></span>
                <span className={`hza-state ${approved ? "ok" : "bad"}`}><i />{approved ? "Approved" : "Rejected"}</span>
              </button>;
            })}
          </div>}
          <p className="hza-rail-note">Approval gates are enforced in the store: code setup, experiments and memory writes cannot execute without you.</p>
        </section>

        <section className="hza-card hza-crew" aria-labelledby="hza-crew-title">
          <div className="hza-card-head hza-rail-head">
            <div><h2 id="hza-crew-title">Specialists</h2><p>Pick one to compose a task.</p></div>
            <span className="hza-count">{CREW.length}</span>
          </div>
          <div className="hza-crew-list">
            {CREW.map(c => {
              const latest = latestFor(c.n);
              return <button key={c.n} type="button" className={`hza-crew-row${agent === c.n ? " on" : ""}`} style={{ "--tint": TINT[c.n] } as CSSProperties}
                onClick={() => { pickAgent(c.n); focusComposer(); }} aria-label={`Delegate to ${label(c.n)}`}>
                <span className="hza-crew-ic"><AgentGlyph agent={c.n} /></span>
                <span className="hza-crew-main"><b>{label(c.n)}</b><em>{c.hint}</em></span>
                <span className="hza-crew-side">
                  {latest.state ? <span className={`hza-state ${latest.state.tone}`}><i />{latest.state.short}</span> : <span className="hza-state idle"><i />Idle</span>}
                  <span className="hza-crew-count">{latest.runs.length}</span>
                </span>
              </button>;
            })}
          </div>
        </section>

        <section className="hza-card hza-guardrails" aria-labelledby="hza-guardrails-title">
          <div className="hza-card-head hza-rail-head">
            <div><h2 id="hza-guardrails-title">Guardrails</h2><p>What always applies</p></div>
          </div>
          <ul className="hza-guard-list">
            <li>
              <span className="hza-guard-ic gold">{I.lock}</span>
              <div><b>Approval gates</b><span>Code, experiments and memory writes wait for you.</span></div>
            </li>
            <li>
              <span className="hza-guard-ic violet">{I.doc}</span>
              <div><b>Citations stay attached</b><span>Outputs keep their source references.</span></div>
            </li>
            <li>
              <span className="hza-guard-ic blue">{I.pulse}</span>
              <div><b>Audit trail</b><span>Every event is timestamped and inspectable.</span></div>
            </li>
            <li>
              <span className="hza-guard-ic good">{I.check}</span>
              <div><b>Workspace scope</b><span>Runs never leave the active workspace.</span></div>
            </li>
          </ul>
        </section>
      </aside>
    </div>

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

  return <div className="hza-overlay" onClick={onClose}>
    <aside className="hza-sheet" role="dialog" aria-modal="true" aria-labelledby="hza-sheet-title" onClick={e => e.stopPropagation()}>
      <header className="hza-sheet-head">
        <span className="hza-sheet-ic" style={{ "--tint": TINT[run.agent] } as CSSProperties}><AgentGlyph agent={run.agent} /></span>
        <div className="hza-sheet-id">
          <div className="hza-sheet-kicker"><span>{label(run.agent)}</span><span className={`hza-state ${st.tone}`}><i />{st.text}</span></div>
          <h2 id="hza-sheet-title">{run.task}</h2>
          <p>Started {fullDate(run.createdAt)} · updated {rel(run.updatedAt)}</p>
        </div>
        <button className="hza-close" aria-label="Close run details" onClick={onClose} autoFocus>{I.close}</button>
      </header>

      <div className="hza-sheet-body">
        <dl className="hza-meta">
          <div><dt>Agent</dt><dd>{label(run.agent)}</dd></div>
          <div><dt>Status</dt><dd>{st.text}</dd></div>
          <div><dt>Source</dt><dd>{source?.title || "—"}</dd></div>
          <div><dt>Confidence</dt><dd>{typeof run.confidence === "number" ? `${(run.confidence * 100).toFixed(0)}%` : "—"}</dd></div>
          <div><dt>Started</dt><dd>{fullDate(run.createdAt)}</dd></div>
          <div><dt>Tool calls</dt><dd className="code">{run.toolCalls?.length ? run.toolCalls.join(", ") : "—"}</dd></div>
        </dl>

        {run.approval && <div className="hza-gate-box">
          <div className="hza-gate-top">
            <span className="hza-gate-ic">{I.gate}</span>
            <div className="hza-gate-id"><b>{run.approval.action}</b><span>Approval gate</span></div>
            <span className={`hza-state ${approvalTone}`}><i />{run.approval.state[0].toUpperCase() + run.approval.state.slice(1)}</span>
          </div>
          <p className="hza-gate-reason">{run.approval.reason}</p>
          <div className="hza-gate-facts">
            <div><span>Expected</span><b>{run.approval.expected}</b></div>
            <div><span>Risk</span><b>{run.approval.risks}</b></div>
          </div>
          {run.approval.note && <p className="hza-gate-note">Note · {run.approval.note}</p>}
          {run.status === "waiting_approval" && <div className="hza-gate-actions">
            <button className="hza-btn hza-btn-primary hza-btn-xs" onClick={onApprove}>Approve</button>
            <button className="hza-btn hza-btn-ghost hza-btn-xs" onClick={onReject}>Reject</button>
          </div>}
        </div>}

        <section className="hza-section">
          <div className="hza-sec-head"><h3>Output</h3>{run.output && <button className="hza-copy" onClick={onCopy}>Copy</button>}</div>
          {run.output
            ? <pre className="hza-output">{run.output}</pre>
            : <p className="hza-muted">{run.status === "waiting_approval" ? "Waiting for your approval — nothing has executed yet." : "No output yet. Queued and running tasks write their result when they finish."}</p>}
        </section>

        <section className="hza-section">
          <div className="hza-sec-head"><h3>Event log</h3><span className="hza-sec-note">{run.events.length} event{run.events.length === 1 ? "" : "s"}</span></div>
          <ol className="hza-timeline">
            {run.events.map((e, i) => <li className="hza-event" key={i}>
              <span className={`hza-ev-dot ${e.kind}`} />
              <div className="hza-ev-main">{e.text}<time>{fullDate(e.ts)}{e.detail ? ` · ${e.detail}` : ""}</time></div>
            </li>)}
          </ol>
        </section>
      </div>

      <footer className="hza-sheet-foot">
        {run.status === "running" && <button className="hza-btn hza-btn-ghost hza-btn-sm" onClick={onPause}>Pause</button>}
        {run.status === "paused" && <button className="hza-btn hza-btn-ghost hza-btn-sm" onClick={onResume}>Resume</button>}
        {(run.status === "queued" || run.status === "running" || run.status === "paused") && <button className="hza-btn hza-btn-ghost hza-btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="hza-btn hza-btn-ghost hza-btn-sm" onClick={onRedirect}>Redirect</button>
        <button className="hza-btn hza-btn-primary hza-btn-sm hza-sheet-close" onClick={onClose}>Close</button>
      </footer>
    </aside>
  </div>;
}

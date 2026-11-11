import { lazy, Suspense, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import ErrorBoundary from "../components/ErrorBoundary";
const LabCore3D = lazy(() => import("../components/LabCore3D"));
import { useStore } from "../lib/store";
import { runExperimentSandbox } from "../lib/execution";
import type { RunProgress } from "../lib/execution";
import type { Experiment, ExpStatus } from "../lib/types";
import "../styles/experiments.css";

const STATUS: Record<ExpStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "muted" },
  pending_approval: { label: "Awaiting approval", tone: "warn" },
  approved: { label: "Approved", tone: "violet" },
  running: { label: "Running", tone: "live" },
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

const STEPS = ["Plan", "Approve", "Run", "Compare"];
const stepDone = (s: ExpStatus) => [s !== "draft", s === "approved" || s === "running" || s === "completed" || s === "failed", s === "completed" || s === "failed", s === "completed"];
const stepActive = (s: ExpStatus, i: number) =>
  !stepDone(s)[i] && ((s === "draft" && i === 0) || (s === "pending_approval" && i === 1) || ((s === "approved" || s === "running") && i === 2) || (s === "failed" && i === 3));

const acc = (m: Record<string, number>) => (typeof m?.accuracy === "number" ? m.accuracy : null);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/* ---------- small charts ---------- */
function Ring({ value, size = 56, stroke = 5, tone = "orange", label }: { value: number; size?: number; stroke?: number; tone?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`xh-ring ${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle
        className="fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
        strokeDasharray={`${c * clamp(value)} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {label && <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{label}</text>}
    </svg>
  );
}

function Spark({ values, tone = "orange", height = 42 }: { values: number[]; tone?: string; height?: number }) {
  const w = 160;
  const id = `xhg-${Math.abs(values.reduce((a, b) => a * 31 + Math.round(b * 1000), 7))}`;
  if (values.length < 2) {
    return <div className="xh-spark-empty" style={{ height }}><i /><span>waiting for a second run</span></div>;
  }
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.02;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - pad * 2),
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return (
    <svg className={`xh-spark ${tone}`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="stop-a" /><stop offset="100%" className="stop-b" />
        </linearGradient>
      </defs>
      <path className="area" d={area} fill={`url(#${id})`} />
      <path className="line" pathLength={1} d={line} />
      {pts.slice(-1).map((p, i) => <circle key={i} className="tip" cx={p[0]} cy={p[1]} r="2.6" />)}
    </svg>
  );
}

function MiniBars({ values }: { values: number[] }) {
  if (!values.length) return <div className="xh-minibars empty"><i /><i /><i /><i /><i /></div>;
  return (
    <div className="xh-minibars" aria-hidden>
      {values.slice(-9).map((v, i) => <i key={i} style={{ height: `${Math.max(14, clamp(v) * 100)}%` }} className={i === Math.min(values.length, 9) - 1 ? "on" : ""} />)}
    </div>
  );
}

function Icon({ name }: { name: "lab" | "run" | "target" | "gate" | "spark" }) {
  const paths = {
    lab: <><path d="M9 3h6M10 3v6.2L5.6 17a2.4 2.4 0 0 0 2.1 3.5h8.6a2.4 2.4 0 0 0 2.1-3.5L14 9.2V3" /><path d="M7.5 15h9" /></>,
    run: <><path d="M8 5.5v13l10-6.5-10-6.5Z" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    gate: <><path d="M5 20V9l7-5 7 5v11" /><path d="M9 20v-6h6v6" /></>,
    spark: <><path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5Z" /></>,
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

/* ---------- 3d lab core ---------- */
function CoreRings() {
  return (
    <>
      <span className="xh-orbit o1" />
      <span className="xh-orbit o2" />
      <span className="xh-orbit o3" />
      <span className="xh-core-ball"><i /></span>
    </>
  );
}

function LabCore({ best, runs, waiting, live }: { best: string; runs: number; waiting: number; live: RunProgress | null }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const webgl = useMemo(() => {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
  }, []);
  const reduced = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -16, y: ((e.clientX - r.left) / r.width - 0.5) * 22 });
  }
  const streaming = live?.stage === "epoch";
  return (
    <div
      className="xh-core-wrap"
      onPointerMove={move}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ "--tx": `${tilt.x}deg`, "--ty": `${tilt.y}deg` } as CSSProperties}
      aria-hidden
    >
      <div className={`xh-core ${webgl ? "is-3d" : "is-css"}`}>
        {webgl ? (
          <ErrorBoundary fallback={<CoreRings />}>
            <Suspense fallback={<CoreRings />}>
              <LabCore3D tiltX={tilt.x} tiltY={tilt.y} reduced={reduced} />
            </Suspense>
          </ErrorBoundary>
        ) : <CoreRings />}
        <span className="xh-chip c1"><em>best</em>{best}</span>
        <span className="xh-chip c2">{runs} runs</span>
        <span className="xh-chip c3">{streaming ? `epoch ${live.epoch}/${live.epochs}` : waiting ? `${waiting} to approve` : "gate clear"}</span>
      </div>
    </div>
  );
}

/* ---------- page ---------- */
export default function Experiments() {
  const activeWs = useStore(s => s.activeWs);
  const ws = useStore(s => s.workspaces.find(w => w.id === s.activeWs));
  const allX = useStore(s => s.experiments);
  const exps = useMemo(() => allX.filter(e => e.workspaceId === activeWs), [allX, activeWs]);
  const add = useStore(s => s.addExperiment);
  const setSt = useStore(s => s.setExpStatus);
  const addRun = useStore(s => s.addRun);
  const addMem = useStore(s => s.addMemory);
  const toast = useStore(s => s.toast);

  const [sel, setSel] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [live, setLive] = useState<RunProgress | null>(null);
  const [filter, setFilter] = useState<"all" | "pipeline" | "done">("all");

  const detail = exps.find(e => e.id === sel) || null;
  const allRuns = useMemo(() => exps.flatMap(e => e.runs.map(r => ({ ...r, expName: e.name, expId: e.id }))), [exps]);
  const okRuns = allRuns.filter(r => r.status === "completed");
  const best = allRuns.reduce<{ v: number; id: string; exp: string } | null>((b, r) => {
    const a = acc(r.metrics);
    return a !== null && (!b || a > b.v) ? { v: a, id: r.id, exp: r.expName } : b;
  }, null);
  const waiting = exps.filter(e => e.status === "pending_approval" || e.status === "approved");
  const totalTime = allRuns.reduce((n, r) => n + (r.metrics?.time_s || 0), 0);
  const draftCount = exps.filter(e => e.status === "draft").length;
  const doneCount = exps.filter(e => e.status === "completed").length;

  const shown = exps.filter(e =>
    filter === "all" ? true :
    filter === "done" ? e.status === "completed" || e.status === "failed" :
    e.status !== "completed" && e.status !== "failed"
  );

  const run = async (e: Experiment) => {
    setRunning(e.id);
    setLive(null);
    setSt(e.id, "running");
    try {
      const res = await runExperimentSandbox(e.params, undefined, 15000, { onProgress: setLive });
      addRun(e.id, {
        id: "r-" + Date.now().toString(36),
        startedAt: new Date(Date.now() - 60000).toISOString(),
        finishedAt: new Date().toISOString(),
        status: res.status,
        metrics: res.metrics,
        logs: res.logs,
        params: e.params,
      });
      setSt(e.id, res.status);
      toast(res.status === "completed" ? "Run finished — review the metrics." : "Run failed — logs saved.");
    } catch {
      setSt(e.id, "failed");
      toast("Run failed before metrics were captured.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="xh-lab">
      <motion.header
        className="xh-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="xh-hero-copy">
          <div className="xh-eyebrow">
            <i /> Experiment lab
            <span>{ws?.name || "Workspace"}</span>
          </div>
          <h1>Where plans become <span className="xh-serif">evidence.</span></h1>
          <p className="xh-sub">
            Draft a plan, pass the researcher gate, run it in an isolated CPU sandbox, then compare every run.
            Nothing executes without approval.
          </p>
          <div className="xh-hero-actions">
            <Link className="xh-btn ghost" to="/app/analyst"><Icon name="spark" /> Ask about a run</Link>
            <button className="xh-btn primary" onClick={() => setWizard(true)}><span className="plus">+</span> New experiment</button>
          </div>
          <div className="xh-hero-meta">
            <span><b>{exps.length}</b> experiments</span>
            <span><b>{allRuns.length}</b> runs</span>
            <span><b>{Math.round(totalTime / 60)}</b> min compute</span>
          </div>
        </div>
        <LabCore best={best ? pct(best.v) : "—"} runs={allRuns.length} waiting={waiting.length} live={live} />
      </motion.header>

      <section className="xh-kpis" aria-label="Experiment summary">
        <article className="xh-kpi t-violet">
          <div className="xh-kpi-top"><span className="xh-ic"><Icon name="lab" /></span>Experiments</div>
          <div className="xh-kpi-body">
            <b>{exps.length}<small>{doneCount} completed</small></b>
            <Ring value={exps.length ? doneCount / exps.length : 0} size={54} tone="violet" label={`${exps.length ? Math.round((doneCount / exps.length) * 100) : 0}%`} />
          </div>
          <div className="xh-kpi-foot">{draftCount} drafts · {waiting.length} in the pipeline</div>
        </article>

        <article className="xh-kpi t-blue">
          <div className="xh-kpi-top"><span className="xh-ic"><Icon name="run" /></span>Runs</div>
          <div className="xh-kpi-body">
            <b>{allRuns.length}<small>{okRuns.length} ok</small></b>
            <MiniBars values={allRuns.map(r => acc(r.metrics) ?? 0.35)} />
          </div>
          <div className="xh-kpi-foot">{allRuns.length - okRuns.length} failed · {Math.round(totalTime / 60)} min CPU</div>
        </article>

        <article className="xh-kpi t-orange">
          <div className="xh-kpi-top"><span className="xh-ic"><Icon name="target" /></span>Best accuracy</div>
          <div className="xh-kpi-body">
            <b>{best ? pct(best.v) : "—"}</b>
            {best && <span className="xh-kpi-tag">{best.id.slice(-6)}</span>}
          </div>
          <div className="xh-kpi-foot">{best ? best.exp : "no completed runs yet"}</div>
        </article>

        <article className={`xh-kpi t-lime${waiting.length ? " is-warn" : ""}`}>
          <div className="xh-kpi-top"><span className="xh-ic"><Icon name="gate" /></span>Needs you</div>
          <div className="xh-kpi-body">
            <b>{waiting.length}</b>
            <span className={`xh-beacon${waiting.length ? " live" : ""}`}><i /><i /><i /></span>
          </div>
          <div className="xh-kpi-foot">{waiting.length ? "awaiting approval before execution" : "nothing is blocked"}</div>
        </article>
      </section>

      <div className="xh-grid">
        <main className="xh-main">
          <div className="xh-list-head">
            <div>
              <h2>Program queue</h2>
              <p>Every experiment keeps its plan, params and runs together.</p>
            </div>
            <div className="xh-filters" role="tablist" aria-label="Filter experiments">
              {([["all", "All", exps.length], ["pipeline", "Pipeline", exps.length - draftCount - doneCount + draftCount], ["done", "Done", doneCount]] as const).map(([id, label]) =>
                <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
              )}
            </div>
          </div>

          {!exps.length && (
            <div className="xh-empty">
              <div className="xh-empty-art"><span /><span /><span /><i /></div>
              <div>
                <b>No experiments yet</b>
                <span>Reproduce a paper, test an open question, or import a repo — the lab keeps every run next to its plan.</span>
                <button className="xh-btn primary" onClick={() => setWizard(true)}>Create the first experiment</button>
              </div>
            </div>
          )}

          <div className="xh-cards">
            {shown.map((e, idx) => {
              const meta = STATUS[e.status];
              const accs = e.runs.map(r => acc(r.metrics)).filter((v): v is number => v !== null).reverse();
              const last = e.runs[0];
              return (
                <motion.article
                  key={e.id}
                  className={`xh-card${sel === e.id ? " is-open" : ""}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(idx * 0.04, 0.2) }}
                  onClick={() => setSel(e.id)}
                >
                  <span className={`xh-rail ${meta.tone}`} aria-hidden />
                  <header className="xh-card-h">
                    <span className={`xh-pill ${meta.tone}`}><i />{meta.label}</span>
                    <span className="xh-runs">{e.runs.length} run{e.runs.length === 1 ? "" : "s"}</span>
                  </header>
                  <h2>{e.name}</h2>
                  <p className="xh-obj">{e.objective}</p>

                  <div className="xh-card-viz">
                    <div className="xh-card-viz-main">
                      <span className="xh-viz-label">accuracy across runs</span>
                      <Spark values={accs} tone={e.status === "failed" ? "bad" : "orange"} />
                    </div>
                    <div className="xh-card-score">
                      <b>{last ? pct(acc(last.metrics)) : "—"}</b>
                      <em>{last ? "last run" : "no runs"}</em>
                    </div>
                  </div>

                  <div className="xh-params">
                    <span><em>model</em>{String(e.params.model ?? "—")}</span>
                    <span><em>epochs</em>{String(e.params.epochs ?? "—")}</span>
                    <span><em>lr</em>{String(e.params.lr ?? "—")}</span>
                    <span><em>seed</em>{String(e.params.seed ?? "—")}</span>
                  </div>

                  <div className="xh-steps" aria-label={`Pipeline: ${STEPS.join(" → ")}`} style={{ "--fill": `${Math.min(3, stepDone(e.status).filter(Boolean).length) * 33.33}%` } as CSSProperties}>
                    {STEPS.map((s, i) => (
                      <span key={s} className={`xh-step${stepDone(e.status)[i] ? " done" : ""}${stepActive(e.status, i) ? " active" : ""}`}>
                        <i />{s}
                      </span>
                    ))}
                  </div>

                  <footer className="xh-card-f">
                    <span className="xh-last">
                      {last ? <>last run <b>{pct(acc(last.metrics))}</b> · {last.status}</> : <span className="muted">no runs yet</span>}
                    </span>
                    <div className="xh-card-actions">
                      {e.status === "approved" && (
                        <button className="xh-mini lime" disabled={running === e.id} onClick={ev => { ev.stopPropagation(); run(e); }}>
                          {running === e.id ? "Running…" : "▶ Run"}
                        </button>
                      )}
                      {e.status === "pending_approval" && (
                        <button className="xh-mini amber" onClick={ev => { ev.stopPropagation(); setSt(e.id, "approved"); }}>Approve</button>
                      )}
                      <button className="xh-mini" onClick={ev => { ev.stopPropagation(); setSel(e.id); }}>Open</button>
                    </div>
                  </footer>
                </motion.article>
              );
            })}
          </div>

          {!shown.length && !!exps.length && <p className="xh-note">Nothing in this filter yet.</p>}
        </main>

        <aside className="xh-aside">
          <section className="xh-panel xh-gate">
            <div className="xh-panel-h"><h2>The gate</h2><span className="xh-locked">enforced</span></div>
            <ol className="xh-flow">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <span className="xh-flow-n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{s}</b>
                    <em>{["Write the objective, method and params", "A researcher approves the plan", "Isolated CPU sandbox, logs captured", "Metrics compared against the baseline"][i]}</em>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={`xh-panel xh-telemetry${running ? " is-live" : ""}`}>
            <div className="xh-panel-h">
              <h2>Run telemetry</h2>
              <span className={running ? "xh-live" : ""}>{running ? <><i /> live</> : live ? "last run" : "idle"}</span>
            </div>
            <div className="xh-eq" aria-hidden>
              {Array.from({ length: 30 }).map((_, i) => (
                <i key={i} style={{ height: `${16 + ((i * 17) % 74)}%`, animationDelay: `${(i % 10) * 0.08}s` }} />
              ))}
            </div>
            <div className="xh-telemetry-meta">
              <span><em>stage</em><b>{live ? (live.stage === "epoch" ? `epoch ${live.epoch}/${live.epochs}` : live.stage) : "waiting"}</b></span>
              <span><em>accuracy</em><b>{live?.accuracy != null ? pct(live.accuracy) : "—"}</b></span>
              <span><em>loss</em><b>{live?.loss != null ? live.loss.toFixed(3) : "—"}</b></span>
              <span><em>elapsed</em><b>{live ? `${(live.elapsedMs / 1000).toFixed(1)}s` : "—"}</b></span>
            </div>
            <div className="xh-tele-progress" aria-hidden><i style={{ width: `${live ? (live.epoch / Math.max(1, live.epochs)) * 100 : 0}%` }} /></div>
            <p className="xh-note">{running ? "Events stream from the sandbox as each epoch completes." : live ? "Last streamed run — start another to follow live epochs." : "Start an approved run to stream epoch telemetry."}</p>
          </section>

          <section className="xh-panel">
            <div className="xh-panel-h"><h2>Latest runs</h2><span>{allRuns.length}</span></div>
            {!allRuns.length ? (
              <p className="xh-note">Nothing has run yet. Approve a plan and the sandbox writes its log here.</p>
            ) : (
              <ul className="xh-recent">
                {allRuns.slice(0, 4).map(r => (
                  <li key={r.id}>
                    <button onClick={() => setSel(r.expId)}>
                      <span className={`xh-dot ${r.status === "completed" ? "good" : "bad"}`} />
                      <span className="xh-recent-txt"><b>{r.expName}</b><em>{r.id.slice(-6)} · {r.status}</em></span>
                      <span className="xh-recent-acc">{pct(acc(r.metrics))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {detail && <DetailSheet
        detail={detail}
        running={running}
        onClose={() => setSel(null)}
        onStatus={setSt}
        onRun={run}
        onSaveMemory={() => {
          addMem({ workspaceId: detail.workspaceId, kind: "success", title: "Config: " + detail.name, description: "Params " + JSON.stringify(detail.params), experimentId: detail.id, params: detail.params, env: detail.env.python + "/" + detail.env.framework, tags: ["repro"] });
          toast("Config saved to memory.");
        }}
      />}

      {wizard && (
        <Wizard
          onClose={() => setWizard(false)}
          onAdd={v => { add(v as any); setWizard(false); toast("Draft created — submit it for approval when ready."); }}
        />
      )}
    </div>
  );
}

/* ---------- detail ---------- */
function DetailSheet({ detail, running, onClose, onStatus, onRun, onSaveMemory }: {
  detail: Experiment;
  running: string | null;
  onClose: () => void;
  onStatus: (id: string, s: ExpStatus) => void;
  onRun: (e: Experiment) => void;
  onSaveMemory: () => void;
}) {
  const runs = [...detail.runs].reverse();
  const accs = runs.map(r => acc(r.metrics)).filter((v): v is number => v !== null);
  const latest = detail.runs[0];
  const latestAcc = latest ? acc(latest.metrics) : null;
  const meta = STATUS[detail.status];

  return (
    <div className="xh-sheet-wrap" onClick={onClose}>
      <motion.section
        className="xh-sheet"
        onClick={e => e.stopPropagation()}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        aria-label={`${detail.name} details`}
      >
        <header className="xh-sheet-h">
          <div className="xh-sheet-head">
            <span className={`xh-pill ${meta.tone}`}><i />{meta.label}</span>
            <h2>{detail.name}</h2>
            <p>{detail.objective}</p>
          </div>
          <div className="xh-sheet-gauge">
            <Ring value={latestAcc ?? 0} size={92} stroke={8} tone={detail.status === "failed" ? "bad" : "orange"} label={latestAcc === null ? "—" : `${Math.round(latestAcc * 100)}%`} />
            <span>last accuracy</span>
          </div>
          <button className="xh-x" onClick={onClose} aria-label="Close details">✕</button>
        </header>

        <div className="xh-sheet-body">
          <div className="xh-metrics">
            <div><em>accuracy</em><b>{latest ? pct(acc(latest.metrics)) : "—"}</b></div>
            <div><em>f1</em><b>{latest?.metrics.f1 ?? "—"}</b></div>
            <div><em>loss</em><b>{latest?.metrics.loss ?? "—"}</b></div>
            <div><em>compute</em><b>{latest?.metrics.time_s ? `${Math.round(latest.metrics.time_s / 60)}m` : "—"}</b></div>
          </div>

          <div className="xh-sheet-chart">
            <div className="xh-chart-head"><h3>Accuracy across runs</h3><span>{accs.length} point{accs.length === 1 ? "" : "s"}</span></div>
            <Spark values={accs} height={86} tone={detail.status === "failed" ? "bad" : "orange"} />
          </div>

          <div className="xh-steps big" style={{ "--fill": `${Math.min(3, stepDone(detail.status).filter(Boolean).length) * 33.33}%` } as CSSProperties}>
            {STEPS.map((s, i) => (
              <span key={s} className={`xh-step${stepDone(detail.status)[i] ? " done" : ""}${stepActive(detail.status, i) ? " active" : ""}`}><i />{s}</span>
            ))}
          </div>

          <div className="xh-gate-actions">
            {detail.status === "draft" && <button className="xh-btn primary" onClick={() => onStatus(detail.id, "pending_approval")}>Submit plan for approval</button>}
            {detail.status === "pending_approval" && <>
              <button className="xh-btn primary" onClick={() => onStatus(detail.id, "approved")}>Approve plan</button>
              <button className="xh-btn ghost" onClick={() => onStatus(detail.id, "draft")}>Send back to draft</button>
            </>}
            {detail.status === "approved" && (
              <button className="xh-btn lime" disabled={running === detail.id} onClick={() => onRun(detail)}>
                {running === detail.id ? "Running in the sandbox…" : "▶ Run on CPU (isolated)"}
              </button>
            )}
            {(detail.status === "completed" || detail.status === "failed") && (
              <button className="xh-btn ghost" onClick={() => onStatus(detail.id, "approved")}>Re-open for another run</button>
            )}
            {detail.status === "running" && <span className="xh-note">Sandbox running — logs arrive with the result.</span>}
          </div>

          <h3 className="xh-h3">Run comparison <span>{detail.runs.length}</span></h3>
          {!runs.length ? <p className="xh-note">No runs yet — approve the plan, then execute it here.</p> : (
            <>
              <div className="xh-runbars">
                {runs.map(r => {
                  const a = acc(r.metrics);
                  return (
                    <div className="xh-runbar" key={r.id}>
                      <span className="mono">{r.id.slice(-6)}</span>
                      <div className="track"><i className={r.status === "completed" ? "good" : "bad"} style={{ width: `${Math.max(4, (a ?? 0) * 100)}%` }} /></div>
                      <b>{pct(a)}</b>
                    </div>
                  );
                })}
              </div>
              <div className="xh-table-wrap">
                <table className="xh-table">
                  <thead><tr><th>Run</th><th>Status</th><th>Acc</th><th>F1</th><th>Loss</th><th>Time</th></tr></thead>
                  <tbody>
                    {detail.runs.map(r => (
                      <tr key={r.id}>
                        <td className="mono">{r.id.slice(-6)}</td>
                        <td><span className={`xh-dot ${r.status === "completed" ? "good" : "bad"}`} />{r.status}</td>
                        <td className="num">{r.metrics.accuracy ?? "—"}</td>
                        <td className="num">{r.metrics.f1 ?? "—"}</td>
                        <td className="num">{r.metrics.loss ?? "—"}</td>
                        <td className="num">{r.metrics.time_s ? `${Math.round(r.metrics.time_s / 60)}m` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <dl className="xh-kv">
            <div><dt>Method</dt><dd>{detail.methodology || "—"}</dd></div>
            <div><dt>Plan</dt><dd>{detail.plan || "—"}</dd></div>
            <div><dt>Expected</dt><dd>{detail.expected || "—"}</dd></div>
            <div><dt>Environment</dt><dd className="mono">{detail.env.python} · {detail.env.framework}</dd></div>
            <div><dt>Dependencies</dt><dd className="mono">{detail.deps.join(" · ") || "—"}</dd></div>
            <div><dt>Params</dt><dd className="mono">{Object.entries(detail.params).map(([k, v]) => `${k}=${v}`).join(" · ")}</dd></div>
          </dl>

          {detail.runs[0] && (
            <div className="xh-log-wrap">
              <div className="xh-log-head"><span className="dots"><i /><i /><i /></span> latest run · {detail.runs[0].id.slice(-6)}</div>
              <pre className="xh-log">{detail.runs[0].logs.join("\n")}</pre>
            </div>
          )}
        </div>

        <footer className="xh-sheet-f">
          <button className="xh-btn ghost" onClick={onSaveMemory}>Save config to memory</button>
          <button className="xh-btn ghost" onClick={onClose}>Close</button>
        </footer>
      </motion.section>
    </div>
  );
}

/* ---------- wizard ---------- */
function Wizard({ onClose, onAdd }: { onClose: () => void; onAdd: (v: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [obj, setObj] = useState("");
  const [method, setMethod] = useState("Transfer learning, freeze → unfreeze, cosine LR decay.");
  const [model, setModel] = useState("mobilenet_v2");
  const [epochs, setEpochs] = useState(5);
  const [lr, setLr] = useState(0.001);
  const valid = name.trim().length > 2;
  const estimate = Math.max(3, Math.round(epochs * 0.6 + (model === "efficientnet_lite0" ? 2 : 0)));

  return (
    <div className="xh-sheet-wrap" onClick={onClose}>
      <motion.section
        className="xh-wizard"
        onClick={e => e.stopPropagation()}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="xh-sheet-h wizard">
          <div className="xh-sheet-head">
            <span className="xh-pill violet"><i />New experiment</span>
            <h2>Plan it before you run it</h2>
            <p>A draft is free. Execution needs a researcher’s approval.</p>
          </div>
          <div className="xh-wizard-orb" aria-hidden><span /><i /></div>
          <button className="xh-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="xh-sheet-body">
          <div className="xh-wizard-steps">
            {["Plan", "Approve", "Run"].map((s, i) => <span key={s} className={i === 0 ? "on" : ""}><i>{i + 1}</i>{s}</span>)}
          </div>

          <label className="xh-field">
            <span>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Exp C — EfficientNet-Lite on field photos" autoFocus />
          </label>
          <label className="xh-field">
            <span>Objective</span>
            <input value={obj} onChange={e => setObj(e.target.value)} placeholder="What question does this answer?" />
          </label>
          <label className="xh-field">
            <span>Methodology</span>
            <textarea rows={2} value={method} onChange={e => setMethod(e.target.value)} />
          </label>

          <div className="xh-field">
            <span>Backbone</span>
            <div className="xh-picker">
              {["mobilenet_v2", "efficientnet_lite0"].map(m => (
                <button key={m} className={model === m ? "on" : ""} onClick={() => setModel(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="xh-row">
            <label className="xh-field"><span>Epochs</span><input type="number" min={1} value={epochs} onChange={e => setEpochs(+e.target.value)} /></label>
            <label className="xh-field"><span>Learning rate</span><input type="number" step="0.0001" value={lr} onChange={e => setLr(+e.target.value)} /></label>
            <label className="xh-field"><span>Seed</span><input type="number" value={42} readOnly /></label>
          </div>

          <div className="xh-estimate">
            <span className="xh-estimate-ic"><Icon name="run" /></span>
            <div><b>Estimated {estimate} min</b><em>CPU sandbox · 15s guard · logs saved with the run</em></div>
            <span className={`xh-pill ${valid ? "good" : "muted"}`}><i />{valid ? "ready to draft" : "needs a name"}</span>
          </div>

          <p className="xh-note">Creates a draft. A researcher must approve the plan before anything executes.</p>
        </div>

        <footer className="xh-sheet-f">
          <button className="xh-btn primary" disabled={!valid}
            onClick={() => onAdd({
              name: name.trim(), objective: obj.trim() || "Reproduce baseline", methodology: method,
              params: { model, epochs, batch: 32, lr, seed: 42, img: 224 },
              deps: ["torch==2.1.0", "torchvision==0.16.0", "pillow==9.5.0"],
              env: { python: "3.10", framework: "pytorch-cpu" },
              plan: "CPU run, save best checkpoint, log validation metrics.",
              expected: "~90% validation accuracy at this scale.",
            })}>Create draft</button>
          <button className="xh-btn ghost" onClick={onClose}>Cancel</button>
        </footer>
      </motion.section>
    </div>
  );
}

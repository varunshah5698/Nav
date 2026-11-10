import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { runExperimentSandbox } from "../lib/execution";
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
const stepDone = (s: ExpStatus) => [
  s !== "draft",
  s === "approved" || s === "running" || s === "completed" || s === "failed",
  s === "completed" || s === "failed",
  false,
];

const acc = (m: Record<string, number>) => (typeof m?.accuracy === "number" ? m.accuracy : null);
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

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

  const run = async (e: Experiment) => {
    setRunning(e.id);
    setSt(e.id, "running");
    const res = await runExperimentSandbox(e.params);
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
    setRunning(null);
    toast(res.status === "completed" ? "Run finished — review the metrics." : "Run failed — logs saved.");
  };

  return (
    <div className="exp-lab">
      <header className="exp-head">
        <div>
          <div className="exp-eyebrow"><span>Experiment lab</span><span>{(ws?.name || "Workspace").replace(" (Demo)", "")}</span>{ws?.demo && <span>Demo data</span>}</div>
          <h1 className="exp-h1">Experiments</h1>
          <p className="exp-sub">Draft a plan, pass the gate, run it in an isolated CPU sandbox, then compare runs side by side. Nothing executes without a researcher approval.</p>
        </div>
        <div className="exp-actions">
          <Link className="exp-btn ghost" to="/app/analyst">✧ Ask about a run</Link>
          <button className="exp-btn primary" onClick={() => setWizard(true)}>+ New experiment</button>
        </div>
      </header>

      <section className="exp-stats" aria-label="Experiment summary">
        <div className="exp-stat t-violet">
          <div className="exp-stat-top"><span className="exp-ic">⚗</span>Experiments</div>
          <b>{exps.length}<small>{doneCount} done</small></b>
          <div className="exp-stat-foot">{draftCount} draft · {waiting.length} in the pipeline</div>
        </div>
        <div className="exp-stat t-blue">
          <div className="exp-stat-top"><span className="exp-ic">▤</span>Runs</div>
          <b>{allRuns.length}<small>{okRuns.length} ok</small></b>
          <div className="exp-stat-foot">{allRuns.length - okRuns.length} failed · {Math.round(totalTime / 60)} min compute</div>
        </div>
        <div className="exp-stat t-lime">
          <div className="exp-stat-top"><span className="exp-ic">◎</span>Best accuracy</div>
          <b>{best ? pct(best.v) : "—"}</b>
          <div className="exp-stat-foot">{best ? `${best.id.slice(-5)} · ${best.exp.length > 24 ? best.exp.slice(0, 23) + "…" : best.exp}` : "no runs recorded yet"}</div>
        </div>
        <div className={`exp-stat${waiting.length ? " t-warn" : ""}`}>
          <div className="exp-stat-top"><span className="exp-ic">⚑</span>Needs you</div>
          <b>{waiting.length}</b>
          <div className="exp-stat-foot">{waiting.length ? "awaiting approval before execution" : "nothing is blocked"}</div>
        </div>
      </section>

      <div className="exp-grid">
        <section className="exp-list" aria-label="Experiments">
          {!exps.length && (
            <div className="exp-empty">
              <b>No experiments yet</b>
              <span>Reproduce a paper, test an open question, or import a repo — the lab keeps every run next to its plan.</span>
              <button className="exp-btn primary" onClick={() => setWizard(true)}>Create the first experiment</button>
            </div>
          )}

          {exps.map(e => {
            const meta = STATUS[e.status];
            const accs = e.runs.map(r => acc(r.metrics)).filter((v): v is number => v !== null);
            const last = e.runs[0];
            return (
              <article key={e.id} className={`exp-card${sel === e.id ? " is-open" : ""}`} onClick={() => setSel(e.id)}>
                <span className={`exp-rail ${meta.tone}`} aria-hidden />
                <header className="exp-card-h">
                  <span className={`exp-pill ${meta.tone}`}><i />{meta.label}</span>
                  <span className="exp-runs">{e.runs.length} run{e.runs.length === 1 ? "" : "s"}</span>
                </header>
                <h2>{e.name}</h2>
                <p className="exp-obj">{e.objective}</p>

                <div className="exp-params">
                  <span><em>model</em>{String(e.params.model ?? "—")}</span>
                  <span><em>epochs</em>{String(e.params.epochs ?? "—")}</span>
                  <span><em>lr</em>{String(e.params.lr ?? "—")}</span>
                  <span><em>seed</em>{String(e.params.seed ?? "—")}</span>
                </div>

                <div className="exp-steps" aria-label={`Pipeline: ${STEPS.join(" → ")}`}>
                  {STEPS.map((s, i) => {
                    const done = stepDone(e.status)[i];
                    const active = (e.status === "draft" && i === 0) || (e.status === "pending_approval" && i === 1) || (e.status === "approved" && i === 1) || (e.status === "running" && i === 2) || ((e.status === "completed" || e.status === "failed") && i === 3);
                    return (
                      <span key={s} className={`exp-step${done ? " done" : ""}${active ? " active" : ""}`}>
                        <i />{s}
                      </span>
                    );
                  })}
                </div>

                <footer className="exp-card-f">
                  {last ? (
                    <span className="exp-last">
                      last run <b>{pct(acc(last.metrics))}</b> · {last.status}
                    </span>
                  ) : (
                    <span className="exp-last muted">no runs yet</span>
                  )}
                  <div className="exp-card-actions">
                    {e.status === "approved" && (
                      <button className="exp-mini lime" disabled={running === e.id}
                        onClick={ev => { ev.stopPropagation(); run(e); }}>
                        {running === e.id ? "Running…" : "▶ Run"}
                      </button>
                    )}
                    {e.status === "pending_approval" && (
                      <button className="exp-mini amber" onClick={ev => { ev.stopPropagation(); setSt(e.id, "approved"); }}>
                        Approve
                      </button>
                    )}
                    <button className="exp-mini" onClick={ev => { ev.stopPropagation(); setSel(e.id); }}>Open</button>
                  </div>
                </footer>

                {accs.length >= 3 && (
                  <div className="exp-spark" aria-hidden title={`Run accuracy: ${accs.map(a => pct(a)).join(" · ")}`}>
                    {accs.slice(-10).map((v, i) => (
                      <i key={i} style={{ height: `${Math.max(10, Math.min(100, v * 100))}%` }} />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <aside className="exp-aside">
          <section className="exp-panel">
            <div className="exp-panel-h"><h2>The gate</h2><span>enforced</span></div>
            <ol className="exp-flow">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <span className="exp-flow-n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{s}</b>
                    <em>{["Write the objective, method and params", "A researcher approves the plan", "Isolated CPU sandbox, logs captured", "Metrics compared against the baseline"][i]}</em>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="exp-panel">
            <div className="exp-panel-h"><h2>Latest runs</h2><span>{allRuns.length}</span></div>
            {!allRuns.length ? (
              <p className="exp-note">Nothing has run yet. Approve a plan and the sandbox writes its log here.</p>
            ) : (
              <ul className="exp-recent">
                {allRuns.slice(0, 4).map(r => (
                  <li key={r.id}>
                    <button onClick={() => setSel(r.expId)}>
                      <span className={`exp-dot ${r.status === "completed" ? "good" : "bad"}`} />
                      <span className="exp-recent-txt"><b>{r.expName}</b><em>{r.id.slice(-6)} · {r.status}</em></span>
                      <span className="exp-recent-acc">{pct(acc(r.metrics))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="exp-panel quiet">
            <div className="exp-panel-h"><h2>Execution</h2></div>
            <p className="exp-note">Local CPU sandbox · 15s timeout · logs captured. Colab and Docker runners are declared but not configured in this prototype.</p>
          </section>
        </aside>
      </div>

      {detail && (
        <div className="exp-sheet-wrap" onClick={() => setSel(null)}>
          <section className="exp-sheet" onClick={e => e.stopPropagation()} aria-label={`${detail.name} details`}>
            <header className="exp-sheet-h">
              <div>
                <span className={`exp-pill ${STATUS[detail.status].tone}`}><i />{STATUS[detail.status].label}</span>
                <h2>{detail.name}</h2>
              </div>
              <button className="exp-x" onClick={() => setSel(null)} aria-label="Close details">✕</button>
            </header>

            <div className="exp-sheet-body">
              <p className="exp-obj">{detail.objective}</p>

              <div className="exp-steps big">
                {STEPS.map((s, i) => {
                  const done = stepDone(detail.status)[i];
                  const active = (detail.status === "draft" && i === 0) || (detail.status === "pending_approval" && i === 1) || (detail.status === "approved" && i === 1) || (detail.status === "running" && i === 2) || ((detail.status === "completed" || detail.status === "failed") && i === 3);
                  return <span key={s} className={`exp-step${done ? " done" : ""}${active ? " active" : ""}`}><i />{s}</span>;
                })}
              </div>

              <div className="exp-gate-actions">
                {detail.status === "draft" && (
                  <button className="exp-btn primary" onClick={() => setSt(detail.id, "pending_approval")}>Submit plan for approval</button>
                )}
                {detail.status === "pending_approval" && (
                  <>
                    <button className="exp-btn primary" onClick={() => setSt(detail.id, "approved")}>Approve plan</button>
                    <button className="exp-btn ghost" onClick={() => setSt(detail.id, "draft")}>Send back to draft</button>
                  </>
                )}
                {detail.status === "approved" && (
                  <button className="exp-btn lime" disabled={running === detail.id} onClick={() => run(detail)}>
                    {running === detail.id ? "Running in the sandbox…" : "▶ Run on CPU (isolated)"}
                  </button>
                )}
                {(detail.status === "completed" || detail.status === "failed") && (
                  <button className="exp-btn ghost" onClick={() => setSt(detail.id, "approved")}>Re-open for another run</button>
                )}
                {detail.status === "running" && <span className="exp-note">Sandbox running — logs arrive with the result.</span>}
              </div>

              <dl className="exp-kv">
                <div><dt>Method</dt><dd>{detail.methodology || "—"}</dd></div>
                <div><dt>Plan</dt><dd>{detail.plan || "—"}</dd></div>
                <div><dt>Expected</dt><dd>{detail.expected || "—"}</dd></div>
                <div><dt>Environment</dt><dd className="mono">{detail.env.python} · {detail.env.framework}</dd></div>
                <div><dt>Dependencies</dt><dd className="mono">{detail.deps.join(" · ") || "—"}</dd></div>
                <div><dt>Params</dt><dd className="mono">{Object.entries(detail.params).map(([k, v]) => `${k}=${v}`).join(" · ")}</dd></div>
              </dl>

              <h3 className="exp-h3">Runs <span>{detail.runs.length}</span></h3>
              {!detail.runs.length ? (
                <p className="exp-note">No runs yet — approve the plan, then execute it here.</p>
              ) : (
                <div className="exp-table-wrap">
                  <table className="exp-table">
                    <thead><tr><th>Run</th><th>Status</th><th>Acc</th><th>F1</th><th>Loss</th><th>Time</th></tr></thead>
                    <tbody>
                      {detail.runs.map(r => (
                        <tr key={r.id}>
                          <td className="mono">{r.id.slice(-6)}</td>
                          <td><span className={`exp-dot ${r.status === "completed" ? "good" : "bad"}`} />{r.status}</td>
                          <td className="num">{r.metrics.accuracy ?? "—"}</td>
                          <td className="num">{r.metrics.f1 ?? "—"}</td>
                          <td className="num">{r.metrics.loss ?? "—"}</td>
                          <td className="num">{r.metrics.time_s ? `${Math.round(r.metrics.time_s / 60)}m` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.runs[0] && <pre className="exp-log">{detail.runs[0].logs.join("\n")}</pre>}
            </div>

            <footer className="exp-sheet-f">
              <button className="exp-btn ghost" onClick={() => {
                addMem({ workspaceId: detail.workspaceId, kind: "success", title: "Config: " + detail.name, description: "Params " + JSON.stringify(detail.params), experimentId: detail.id, params: detail.params, env: detail.env.python + "/" + detail.env.framework, tags: ["repro"] });
                toast("Config saved to memory.");
              }}>Save config to memory</button>
              <button className="exp-btn ghost" onClick={() => setSel(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}

      {wizard && (
        <Wizard
          onClose={() => setWizard(false)}
          onAdd={v => { add(v as any); setWizard(false); toast("Draft created — submit it for approval when ready."); }}
        />
      )}
    </div>
  );
}

function Wizard({ onClose, onAdd }: { onClose: () => void; onAdd: (v: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [obj, setObj] = useState("");
  const [method, setMethod] = useState("Transfer learning, freeze → unfreeze, cosine LR decay.");
  const [model, setModel] = useState("mobilenet_v2");
  const [epochs, setEpochs] = useState(5);
  const [lr, setLr] = useState(0.001);
  const valid = name.trim().length > 2;

  return (
    <div className="exp-sheet-wrap" onClick={onClose}>
      <section className="exp-wizard" onClick={e => e.stopPropagation()}>
        <header className="exp-sheet-h">
          <div>
            <span className="exp-pill violet"><i />New experiment</span>
            <h2>Plan it before you run it</h2>
          </div>
          <button className="exp-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="exp-sheet-body">
          <label className="exp-field">
            <span>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Exp C — EfficientNet-Lite on field photos" autoFocus />
          </label>
          <label className="exp-field">
            <span>Objective</span>
            <input value={obj} onChange={e => setObj(e.target.value)} placeholder="What question does this answer?" />
          </label>
          <label className="exp-field">
            <span>Methodology</span>
            <textarea rows={2} value={method} onChange={e => setMethod(e.target.value)} />
          </label>

          <div className="exp-field">
            <span>Backbone</span>
            <div className="exp-picker">
              {["mobilenet_v2", "efficientnet_lite0"].map(m => (
                <button key={m} className={model === m ? "on" : ""} onClick={() => setModel(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="exp-row">
            <label className="exp-field"><span>Epochs</span><input type="number" min={1} value={epochs} onChange={e => setEpochs(+e.target.value)} /></label>
            <label className="exp-field"><span>Learning rate</span><input type="number" step="0.0001" value={lr} onChange={e => setLr(+e.target.value)} /></label>
            <label className="exp-field"><span>Seed</span><input type="number" value={42} readOnly /></label>
          </div>

          <p className="exp-foot-note">Creates a draft. A researcher must approve the plan before anything executes; runs happen in the isolated CPU sandbox with a 15s guard.</p>
        </div>

        <footer className="exp-sheet-f">
          <button className="exp-btn primary" disabled={!valid}
            onClick={() => onAdd({
              name: name.trim(), objective: obj.trim() || "Reproduce baseline", methodology: method,
              params: { model, epochs, batch: 32, lr, seed: 42, img: 224 },
              deps: ["torch==2.1.0", "torchvision==0.16.0", "pillow==9.5.0"],
              env: { python: "3.10", framework: "pytorch-cpu" },
              plan: "CPU run, save best checkpoint, log validation metrics.",
              expected: "~90% validation accuracy at demo scale.",
            })}>Create draft</button>
          <button className="exp-btn ghost" onClick={onClose}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}

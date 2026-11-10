import { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { Empty, Modal } from "../components/ui";
import { Donut } from "../components/Charts";
import type { MemoryEntry } from "../lib/types";
import "../styles/memory.css";

type Kind = MemoryEntry["kind"];

const KIND: Record<Kind, { label: string; hue: string; bg: string; ink: string }> = {
  success:    { label: "Success",    hue: "#6FD08C", bg: "rgba(111,208,140,.14)", ink: "#A7E9BC" },
  failure:    { label: "Failure",    hue: "#F0805A", bg: "rgba(240,128,90,.15)",  ink: "#F7B196" },
  error:      { label: "Error",      hue: "#E87777", bg: "rgba(232,119,119,.15)", ink: "#F3AFAF" },
  fix:        { label: "Fix",        hue: "#C9E87A", bg: "rgba(201,232,122,.14)", ink: "#DCF3A1" },
  params:     { label: "Params",     hue: "#B8A6FF", bg: "rgba(184,166,255,.14)", ink: "#D3C7FF" },
  env:        { label: "Env",        hue: "#7FB2FF", bg: "rgba(127,178,255,.14)", ink: "#B3D1FF" },
  finding:    { label: "Finding",    hue: "#F0C85A", bg: "rgba(240,200,90,.14)",  ink: "#F5D98F" },
  conclusion: { label: "Conclusion", hue: "#BEBAB0", bg: "rgba(190,186,176,.13)", ink: "#DDD9CF" },
  insight:    { label: "Insight",    hue: "#D3B8FF", bg: "rgba(211,184,255,.14)", ink: "#E4D2FF" },
};
const KINDS = Object.keys(KIND) as Kind[];
const K = (k: string) => KIND[k as Kind] || KIND.conclusion;

const TOKENS = ["pillow", "cpu", "cuda", "mobilenet", "torch", "epochs", "lr", "batch", "seed", "augment"];
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").split(" ").filter(w => w.length > 3);

const I = {
  stack: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2.4 2.8 5.6 9 8.8l6.2-3.2L9 2.4Z"/><path d="m2.8 9 6.2 3.2L15.2 9"/><path d="m2.8 12.4 6.2 3.2 6.2-3.2"/></svg>,
  reuse: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.4a6 6 0 0 1 10.4-3.8L15 6.2"/><path d="M15 2.8v3.4h-3.4"/><path d="M15 9.6a6 6 0 0 1-10.4 3.8L3 11.8"/><path d="M3 15.2v-3.4h3.4"/></svg>,
  cover: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2.2 15.2 4.6v4.2c0 3.4-2.4 5.9-6.2 7.2-3.8-1.3-6.2-3.8-6.2-7.2V4.6L9 2.2Z"/><path d="m6.4 8.8 1.9 1.9 3.5-3.6"/></svg>,
  alert: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2.6 16 14.8H2L9 2.6Z"/><path d="M9 7.2v3"/><path d="M9 12.6h.01"/></svg>,
};

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24);
  return d < 30 ? d + "d ago" : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Animate a number from 0 to its value on mount; instant for reduced motion. */
function useCountUp(target: number, ms = 900) {
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return reduced ? target : value;
}

/** Decorative 3D orbit: each saved memory becomes a node in the vault's constellation. */
function Constellation({ mems }: { mems: MemoryEntry[] }) {
  const rings: MemoryEntry[][] = [[], [], []];
  // cap at 15 nodes so the orbit stays legible; counts below show the full vault
  mems.slice(0, 15).forEach((m, i) => rings[i % 3].push(m));
  return <div className="mm-orb" role="img" aria-label={`${mems.length} memories orbiting the recall core`}>
    <span className="mm-orb-glow" aria-hidden />
    <span className="mm-orb-stage" aria-hidden>
      {rings.map((list, r) => list.length ? <span key={r} className={`mm-orbit o${r + 1}`}>
        {list.map((m, i) => <i key={m.id} title={`${K(m.kind).label}: ${m.title}`}
          style={{ background: K(m.kind).hue, boxShadow: `0 0 10px ${K(m.kind).hue}`, ["--a" as any]: `${(360 / list.length) * i}deg`, animationDelay: `${i * .3}s` }} />)}
      </span> : null)}
    </span>
    <span className="mm-orb-core"><b>{mems.length}</b><em>memories</em></span>
  </div>;
}

export default function Memory() {
  const activeWs = useStore(s => s.activeWs);
  const wsName = useStore(s => s.workspaces.find(w => w.id === s.activeWs)?.name);
  const _allM = useStore(s => s.memories);
  const mems = useMemo(() => _allM.filter(m => m.workspaceId === activeWs), [_allM, activeWs]);
  const _allX2 = useStore(s => s.experiments);
  const exps = useMemo(() => _allX2.filter(e => e.workspaceId === activeWs), [_allX2, activeWs]);
  const add = useStore(s => s.addMemory), reuse = useStore(s => s.reuse), toast = useStore(s => s.toast);

  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "reused">("new");
  const [open, setOpen] = useState(false);

  const byKind = useMemo(() => {
    const mp = new Map<Kind, number>();
    mems.forEach(m => mp.set(m.kind, (mp.get(m.kind) || 0) + 1));
    return [...mp.entries()].map(([k, value]) => ({ kind: k, value })).sort((a, b) => b.value - a.value);
  }, [mems]);

  const totalReuse = mems.reduce((a, m) => a + m.reuseCount, 0);
  const errors = mems.filter(m => m.kind === "error");
  const fixes = mems.filter(m => m.kind === "fix");
  const coverage = errors.length ? Math.round(Math.min(fixes.length, errors.length) / errors.length * 100) : 0;
  const fixWords = new Set(fixes.flatMap(m => words(m.title + " " + m.description + " " + (m.fix || ""))));
  const unresolved = errors.filter(m => { const w = words(m.title + " " + (m.error || "")); return !w.some(x => fixWords.has(x)); });
  const tags = new Set(mems.flatMap(m => m.tags.filter(t => t !== "demo")));
  const reusedCount = mems.filter(m => m.reuseCount > 0).length;
  const reuseRate = mems.length ? Math.round(reusedCount / mems.length * 100) : 0;
  const resolution = errors.length ? Math.round((errors.length - unresolved.length) / errors.length * 100) : 100;

  const next = exps.find(e => e.status === "draft" || e.status === "pending_approval")
    || exps.find(e => e.status === "running" || e.status === "approved")
    || [...exps].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  const recs = useMemo(() => {
    if (!next) return [] as { m: MemoryEntry; score: number; hits: string[] }[];
    const toks = JSON.stringify(next.params).toLowerCase();
    return mems.map(m => {
      const t = (m.title + " " + m.description + " " + JSON.stringify(m.params || {}) + " " + m.tags.join(" ")).toLowerCase();
      const hits = TOKENS.filter(w => t.includes(w) && toks.includes(w));
      let score = hits.length * 2;
      if (m.kind === "fix" || m.kind === "success") score += 1;
      return { m, score, hits };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  }, [mems, next]);

  const topReused = useMemo(() => [...mems].sort((a, b) => b.reuseCount - a.reuseCount).slice(0, 4), [mems]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = mems.filter(m => (kind === "all" || m.kind === kind) &&
      (needle === "" || (m.title + " " + m.description + " " + m.tags.join(" ") + " " + (m.error || "") + " " + (m.fix || "")).toLowerCase().includes(needle)));
    return [...f].sort((a, b) => sort === "reused" ? b.reuseCount - a.reuseCount : +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [mems, kind, q, sort]);

  const expName = (id?: string) => exps.find(e => e.id === id)?.name;

  const cMem = useCountUp(mems.length);
  const cReuse = useCountUp(totalReuse);
  const cCoverage = useCountUp(coverage);
  const cUnresolved = useCountUp(unresolved.length);
  const maxReuse = Math.max(1, ...topReused.map(m => m.reuseCount));

  return <div className="mm">
    <div className="mm-glow" aria-hidden />
    <header className="mm-head">
      <div>
        <span className="mm-eyebrow">{wsName || "Workspace"} <span>{mems.length} memories · {totalReuse} reuses · {tags.size} tags</span></span>
        <h1 className="mm-h1">Research memory</h1>
        <p className="mm-sub">Working configs, dead ends, errors and the fixes that closed them — recalled before the next run.</p>
      </div>
      <div className="mm-actions">
        <span className="mm-live"><i aria-hidden /> recall engine live</span>
        <button className="mm-btn lime" onClick={() => setOpen(true)}>+ Save memory</button>
      </div>
    </header>

    <div className="mm-kpis">
      <article className="mm-kpi">
        <div className="mm-kpi-top"><span className="mm-kpi-ic">{I.stack}</span><span className="mm-kpi-lbl">Memories</span></div>
        <div className="mm-kpi-val"><b>{cMem}</b></div>
        <div className="mm-kpi-foot"><b>{byKind.length}</b> kinds in use · <b>{tags.size}</b> tags</div>
      </article>
      <article className="mm-kpi t-violet">
        <div className="mm-kpi-top"><span className="mm-kpi-ic">{I.reuse}</span><span className="mm-kpi-lbl">Times reused</span></div>
        <div className="mm-kpi-val"><b>{cReuse}</b>
          <span className="mm-meter"><i style={{ width: Math.min(100, totalReuse / Math.max(1, mems.length) * 20) + "%" }} /></span></div>
        <div className="mm-kpi-foot"><b>{mems.length ? (totalReuse / mems.length).toFixed(1) : "0"}</b> per memory</div>
      </article>
      <article className="mm-kpi t-lime">
        <div className="mm-kpi-top"><span className="mm-kpi-ic">{I.cover}</span><span className="mm-kpi-lbl">Fix coverage</span></div>
        <div className="mm-kpi-val"><b>{cCoverage}<small>%</small></b>
          <span className="mm-meter lime"><i style={{ width: Math.max(2, coverage) + "%" }} /></span></div>
        <div className="mm-kpi-foot"><b>{errors.length}</b> {errors.length === 1 ? "error" : "errors"} · <b>{fixes.length}</b> {fixes.length === 1 ? "fix" : "fixes"} logged</div>
      </article>
      <article className="mm-kpi t-ink">
        <div className="mm-kpi-top"><span className="mm-kpi-ic">{I.alert}</span><span className="mm-kpi-lbl">Unresolved errors</span></div>
        <div className="mm-kpi-val"><b>{cUnresolved}</b></div>
        <div className="mm-kpi-foot">{unresolved.length ? <>No fix recorded yet — <b>worth one more look</b></> : "Every logged error has a fix"}</div>
      </article>
    </div>

    <div className="mm-layout">
      <div className="mm-main">
        <div className="mm-row g21">
          <section className="mm-panel">
            <div className="mm-p-head">
              <div><h2>Memory mix</h2><p>What kind of lessons are you keeping?</p></div>
              {kind !== "all" && <button className="mm-link" onClick={() => setKind("all")}>Clear filter</button>}
            </div>
            {mems.length ? <div className="mm-mix">
              <Donut data={byKind.map(d => ({ name: K(d.kind).label, value: d.value }))}
                colors={byKind.map(d => K(d.kind).hue)} height={186}
                center={{ value: String(mems.length), label: "memories" }} />
              <ul className="mm-legend">
                {byKind.map(d => <li key={d.kind}>
                  <button className={kind === d.kind ? "on" : ""} onClick={() => setKind(kind === d.kind ? "all" : d.kind)}>
                    <span className="mm-dot" style={{ background: K(d.kind).hue }} />
                    <span className="mm-leg-name">{K(d.kind).label}</span>
                    <span className="mm-leg-bar"><i style={{ width: (d.value / byKind[0].value * 100) + "%", background: K(d.kind).hue }} /></span>
                    <b>{d.value}</b>
                  </button>
                </li>)}
              </ul>
            </div> : <p className="mm-note">Nothing saved yet — the mix fills in as you log lessons.</p>}
          </section>

          <section className="mm-panel">
            <div className="mm-p-head">
              <div><h2>{recs.length ? "Bring into the next run" : "Most reused lessons"}</h2>
                <p>{next ? next.name : "No experiment to match against yet"}</p></div>
            </div>
            {!next ? (topReused.length ? <ul className="mm-recs">
              {topReused.slice(0, 3).map(m => <li key={m.id}>
                <div className="mm-rec-top">
                  <span className="mm-kind sm" style={{ background: K(m.kind).bg, color: K(m.kind).ink }}>{K(m.kind).label}</span>
                  <b>{m.title}</b>
                </div>
                <p>{m.description}</p>
                <div className="mm-rec-foot">
                  <span className="mm-reuse-pill on">{m.reuseCount}× reused</span>
                  <button className="mm-btn ghost sm" onClick={() => { reuse(m.id); toast(`Reused “${m.title}”.`); }}>
                    Reuse <span>{m.reuseCount}×</span>
                  </button>
                </div>
              </li>)}
            </ul> : <p className="mm-note">Nothing to recommend yet — save a config or a fix and it will show up here.</p>)
              : recs.length ? <ul className="mm-recs">
              {recs.map(r => <li key={r.m.id}>
                <div className="mm-rec-top">
                  <span className="mm-kind sm" style={{ background: K(r.m.kind).bg, color: K(r.m.kind).ink }}>{K(r.m.kind).label}</span>
                  <b>{r.m.title}</b>
                </div>
                <p>{r.m.description}</p>
                <div className="mm-rec-foot">
                  {r.hits.length > 0 && <span className="mm-hits">{r.hits.slice(0, 3).map(h => <em key={h}>{h}</em>)}</span>}
                  <button className="mm-btn ghost sm" onClick={() => { reuse(r.m.id); toast(`Reused “${r.m.title}” in the plan.`); }}>
                    Reuse <span>{r.m.reuseCount}×</span>
                  </button>
                </div>
              </li>)}
            </ul> : <p className="mm-note">No strong match for this experiment yet. Tag memories with terms like <code>pillow</code>, <code>cpu</code> or <code>mobilenet</code> so they surface next time.</p>}
            {next && recs.length > 0 && <p className="mm-note mm-rec-note">Matched on parameters and tags shared with this experiment — reuse, then adjust.</p>}
          </section>
        </div>

        <div className="mm-toolbar">
          <div className="mm-chips">
            <button className={`mm-chip${kind === "all" ? " on" : ""}`} onClick={() => setKind("all")}>All <span>{mems.length}</span></button>
            {byKind.map(d => <button key={d.kind} className={`mm-chip${kind === d.kind ? " on" : ""}`} onClick={() => setKind(kind === d.kind ? "all" : d.kind)}>
              <span className="mm-dot" style={{ background: K(d.kind).hue }} />{K(d.kind).label} <span>{d.value}</span>
            </button>)}
          </div>
          <div className="mm-tools">
            <div className="mm-seg">
              <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>Newest</button>
              <button className={sort === "reused" ? "on" : ""} onClick={() => setSort("reused")}>Most reused</button>
            </div>
            <input className="mm-input" placeholder="Search memory…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        {!list.length
          ? <Empty title={mems.length ? "Nothing matches" : "Memory is empty"} body={mems.length ? "Try another kind or a shorter search." : "Save configs, errors, fixes and findings as you work — they come back as recommendations."} action={!mems.length && <button className="mm-btn lime" onClick={() => setOpen(true)}>+ Save memory</button>} />
          : <div className="mm-list">
            {list.map((m, idx) => {
              const k = K(m.kind);
              return <article key={m.id} className="mm-card" style={{ ["--kh" as any]: k.hue, ["--i" as any]: Math.min(idx, 10) }}>
                <div className="mm-card-top">
                  <span className="mm-kind" style={{ background: k.bg, color: k.ink }}><span className="mm-dot" style={{ background: k.hue }} />{k.label}</span>
                  <span className={`mm-reuse-pill${m.reuseCount >= 3 ? " on" : ""}`}>{m.reuseCount > 0 ? `${m.reuseCount}× reused` : "not reused"}</span>
                </div>
                <h3>{m.title}</h3>
                <p className="mm-desc">{m.description}</p>
                {m.error && <div className="mm-call bad"><span>Error</span><code>{m.error}</code></div>}
                {m.fix && <div className="mm-call good"><span>Fix</span><code>{m.fix}</code></div>}
                {m.params && <div className="mm-params">
                  {Object.entries(m.params).map(([key, v]) => <span key={key}><b>{key}</b>{String(v)}</span>)}
                </div>}
                <div className="mm-meta">
                  <span>{ago(m.createdAt)}</span>
                  {expName(m.experimentId) && <span className="mm-src">from {expName(m.experimentId)}</span>}
                  {m.tags.filter(t => t !== "demo").map(t => <span key={t} className="mm-tag">#{t}</span>)}
                </div>
                <div className="mm-card-foot">
                  <button className="mm-btn ghost sm" onClick={() => { reuse(m.id); toast(`Marked “${m.title}” as reused.`); }}>
                    Mark reused <span>{m.reuseCount}</span>
                  </button>
                </div>
              </article>;
            })}
          </div>}
      </div>

      <aside className="mm-rail">
        <section className="mm-panel mm-panel-orb">
          <div className="mm-p-head">
            <div><h2>Memory constellation</h2><p>Every lesson mapped around the recall core.</p></div>
            <span className="mm-signal">3D</span>
          </div>
          <Constellation mems={mems} />
          <div className="mm-orb-foot">
            {byKind.slice(0, 3).map(d => <span key={d.kind}><i style={{ background: K(d.kind).hue }} />{K(d.kind).label} <b>{d.value}</b></span>)}
            {!byKind.length && <span>Awaiting the first memory</span>}
          </div>
        </section>

        <section className="mm-panel">
          <div className="mm-p-head">
            <div><h2>Reuse leaderboard</h2><p>Lessons that keep earning their keep.</p></div>
          </div>
          {topReused.length ? <ul className="mm-leader">
            {topReused.map((m, i) => <li key={m.id}>
              <span className="mm-leader-rank">{String(i + 1).padStart(2, "0")}</span>
              <div className="mm-leader-body">
                <span className="mm-leader-title" title={m.title}>{m.title}</span>
                <span className="mm-leader-bar"><i style={{ width: Math.max(4, m.reuseCount / maxReuse * 100) + "%", background: K(m.kind).hue }} /></span>
              </div>
              <button className="mm-leader-reuse" onClick={() => { reuse(m.id); toast(`Reused “${m.title}”.`); }} title={`Reuse “${m.title}”`}>
                {m.reuseCount}×
              </button>
            </li>)}
          </ul> : <p className="mm-note">Nothing reused yet — the first reuse starts the board.</p>}
        </section>

        <section className="mm-panel">
          <div className="mm-p-head">
            <div><h2>Vault health</h2><p>How recall-ready the memory is.</p></div>
          </div>
          <div className="mm-health">
            {[
              { label: "Fix coverage", value: coverage, tone: "#C9E87A" },
              { label: "Reuse rate", value: reuseRate, tone: "#B8A6FF" },
              { label: "Error resolution", value: resolution, tone: "#6FD08C" },
            ].map(row => <div className="mm-health-row" key={row.label}>
              <span>{row.label}</span><b>{row.value}%</b>
              <span className="mm-health-bar"><i style={{ width: Math.max(2, row.value) + "%", background: row.tone }} /></span>
            </div>)}
          </div>
          <p className="mm-note mm-health-note">Reuse rate is the share of memories recalled at least once. Nothing here is estimated.</p>
        </section>
      </aside>
    </div>

    {open && <NewMem onClose={() => setOpen(false)} onAdd={v => { add({ ...v, workspaceId: "" } as any); setOpen(false); }} />}
  </div>;
}

function NewMem({ onClose, onAdd }: { onClose: () => void; onAdd: (v: any) => void }) {
  const ws = useStore(s => s.activeWs);
  const [kind, setKind] = useState<Kind>("finding");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  return <Modal onClose={onClose}>
    <h3 style={{ marginTop: 0 }}>Save memory</h3>
    <p className="mm-note" style={{ marginTop: -4 }}>Write down the lesson while it is fresh — future-you reads this before the next run.</p>
    <label className="lbl">Kind</label>
    <div className="mm-kinds">
      {KINDS.map(k => <button key={k} type="button" className={`mm-kchip${kind === k ? " on" : ""}`} onClick={() => setKind(k)}
        style={kind === k ? { background: KIND[k].bg, color: KIND[k].hue, borderColor: KIND[k].hue } : undefined}>
        <span className="mm-dot" style={{ background: KIND[k].hue }} />{KIND[k].label}
      </button>)}
    </div>
    <label className="lbl">Title</label>
    <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pin pillow==9.5.0 on CPU" />
    <label className="lbl">Description</label>
    <textarea className="textarea" rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What happened, what you tried, what to do next time." />
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button className="mm-btn lime" disabled={!title.trim()} onClick={() => onAdd({ workspaceId: ws, kind, title, description: desc, tags: [] })}>Save memory</button>
      <button className="mm-btn ghost" onClick={onClose}>Cancel</button>
    </div>
  </Modal>;
}

import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { hybridSearch, type Doc } from "../lib/search";
import { Empty } from "../components/ui";
import { Donut } from "../components/Charts";
import { navIcons } from "../components/icons";
import "../styles/discovery.css";

const TYPES = ["all", "pdf", "note", "question", "dataset", "experiment", "github", "url"] as const;
const TYPE_LABEL: Record<string, string> = {
  all: "All", pdf: "Papers", note: "Notes", question: "Questions", dataset: "Datasets", experiment: "Runs", github: "Repos", url: "Web",
};
const KIND_LABEL: Record<string, string> = {
  pdf: "PDF papers", note: "Notes", question: "Questions", dataset: "Datasets", experiment: "Experiment runs", url: "Web pages", github: "Repositories",
};
const TYPE_COLOR: Record<string, string> = {
  pdf: "#F0B49C", note: "#E8DFD0", question: "#F0C85A", dataset: "#A8E7B8",
  experiment: "#C9A9F5", github: "#CBBDF5", url: "#A9C6FF",
};
const msLabel = (ms: number) => ms < 1 ? "<1 ms" : Math.round(ms) + " ms";
const FLOAT_POS = [
  { left: "4%", top: "15%" }, { left: "72%", top: "6%" }, { left: "84%", top: "57%" },
  { left: "4%", top: "65%" }, { left: "42%", top: "86%" },
];
const NODE_LINKS = [{ x: 15, y: 18 }, { x: 82, y: 10 }, { x: 92, y: 60 }, { x: 14, y: 68 }, { x: 50, y: 88 }];

function Stat({ icon, label, value, suffix, delta, tone, foot }: {
  icon: React.ReactNode; label: string; value: string | number; suffix?: string;
  delta: string; tone: "up" | "warn" | "zero"; foot: React.ReactNode;
}) {
  return <article className="dc-stat">
    <span className="dc-stat-lbl"><span className="dc-stat-ic">{icon}</span>{label}</span>
    <div className="dc-stat-row"><b>{value}{suffix && <small>{suffix}</small>}</b><span className={`dc-delta ${tone}`}>{delta}</span></div>
    <span className="dc-stat-foot">{foot}</span>
  </article>;
}

export default function Discovery() {
  const activeWs = useStore(s => s.activeWs);
  const ws = useStore(s => s.workspaces.find(w => w.id === s.activeWs));
  const _n = useStore(s => s.nodes); const nodes = useMemo(() => _n.filter(n => n.workspaceId === activeWs), [_n, activeWs]);
  const _s = useStore(s => s.sources); const sources = useMemo(() => _s.filter(n => n.workspaceId === activeWs), [_s, activeWs]);
  const _x = useStore(s => s.experiments); const exps = useMemo(() => _x.filter(n => n.workspaceId === activeWs), [_x, activeWs]);
  const _l = useStore(s => s.searchLogs); const logs = useMemo(() => _l.filter(n => n.workspaceId === activeWs), [_l, activeWs]);
  const doLog = useStore(s => s.logSearch), mark = useStore(s => s.markOpened);
  const addNode = useStore(s => s.addNode); const toast = useStore(s => s.toast);
  const [q, setQ] = useState(""); const [type, setType] = useState<string>("all");
  const docs: Doc[] = useMemo(() => [
    ...sources.map(s => ({ id: s.id, title: s.title, text: (s.abstract || "") + " " + (s.chunks?.map(c => c.text).join(" ") || ""), type: s.kind, tags: s.tags, ref: "source:" + s.id })),
    ...nodes.filter(n => n.type === "note" || n.type === "question").map(n => ({ id: n.id, title: n.title, text: n.description + " " + (n.summary || ""), type: n.type, tags: n.tags, ref: "node:" + n.id })),
    ...exps.map(e => ({ id: e.id, title: e.name, text: e.objective + " " + e.methodology + " " + JSON.stringify(e.params), type: "experiment", tags: [], ref: "experiment:" + e.id })),
  ], [sources, nodes, exps]);
  const [res, setRes] = useState<ReturnType<typeof hybridSearch> | null>(null);
  const run = (query: string) => {
    if (!query.trim()) return;
    setQ(query);
    const docsF = type === "all" ? docs : docs.filter(d => d.type === type || (type === "pdf" && d.type === "pdf"));
    const r = hybridSearch(query, docsF); setRes(r);
    doLog(useStore.getState().activeWs!, query, r.results.length, r.ms);
  };

  const vol = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
      return { key: d.toDateString(), label: d.toLocaleDateString("en-GB", { weekday: "short" }), value: 0, current: i === 6 };
    });
    const map = new Map(days.map(d => [d.key, d]));
    logs.forEach(l => { const d = new Date(l.createdAt); d.setHours(0, 0, 0, 0); const day = map.get(d.toDateString()); if (day) day.value++; });
    return days;
  }, [logs]);
  const volMax = Math.max(...vol.map(v => v.value), 1);
  const week = logs.filter(l => +new Date(l.createdAt) > Date.now() - 7 * 864e5).length;
  const engaged = logs.length ? Math.round(logs.filter(l => l.opened).length / logs.length * 100) : 0;
  const zeroR = logs.length ? Math.round(logs.filter(l => l.results === 0).length / logs.length * 100) : 0;
  const opened = logs.filter(l => l.opened).length;
  const avgMs = logs.length ? Math.round(logs.reduce((a, l) => a + l.durationMs, 0) / logs.length) : 0;
  const passages = sources.reduce((a, s) => a + (s.chunks?.length || 0), 0);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach(d => m.set(d.type, (m.get(d.type) || 0) + 1));
    return m;
  }, [docs]);
  const index = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach(d => m.set(d.type, (m.get(d.type) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [docs]);
  const mix = useMemo(() => index.map(([t, value]) => ({ type: t, name: KIND_LABEL[t] || t, value })), [index]);
  const explore = useMemo(() => docs.slice(0, 8), [docs]);
  const prompts = useMemo(() => docs.slice(0, 3), [docs]);
  const resultTotal = res?.results.length || 0;

  return <div className="dc">
    <header className="dc-head">
      <div className="dc-head-top">
        <div>
          <div className="dc-eyebrow"><span>{ws?.name || "Workspace"}</span><i className="sep" /><span>{docs.length} indexed items</span></div>
          <h1 className="dc-h1">Discovery</h1>
        </div>
        <div className="dc-head-actions">
          <span className="dc-live"><i />Local index</span>
          <span className="dc-engine">TF-IDF + keyword</span>
        </div>
      </div>
      <p className="dc-sub">Meaning-based retrieval across papers, notes, datasets, code, questions and runs. Every result comes from this workspace — no web results, no ads, no precision claims without evaluation.</p>
    </header>

    <section className="dc-hero">
      <div className="dc-visual" aria-hidden="true">
        <div className="dc-floor" />
        <div className="dc-orbit">
          <svg className="dc-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {NODE_LINKS.slice(0, Math.min(mix.length, NODE_LINKS.length)).map((p, i) => <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} />)}
          </svg>
          <span className="dc-ring r1"><i /></span><span className="dc-ring r2"><i /></span><span className="dc-ring r3"><i /></span>
          <span className="dc-core">{navIcons.search}</span>
          {mix.slice(0, FLOAT_POS.length).map((m, i) =>
            <span key={m.type} className="dc-float" style={{ left: FLOAT_POS[i].left, top: FLOAT_POS[i].top, animationDelay: `${i * 0.7}s` }}>
              <i style={{ background: TYPE_COLOR[m.type] || "#F0805A" }} />{m.name}<b>{m.value}</b>
            </span>)}
          <span className="dc-spark sp1" /><span className="dc-spark sp2" /><span className="dc-spark sp3" />
        </div>
        <span className="dc-scan" />
        <div className="dc-visual-cap"><span>Indexed locally</span><b>{passages} passages</b></div>
      </div>

      <div className="dc-searchwrap">
        <span className="dc-kicker">Ask your corpus</span>
        <h2>Every paper, note and run — one search away.</h2>
        <p>Search {docs.length} items by meaning, not exact keywords. Results are ranked locally and stay in your browser.</p>
        <div className="dc-desk">
          <span className="dc-desk-ic">{navIcons.search}</span>
          <input className="dc-input" placeholder="Search everything you have read, written and run…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") run(q); }} aria-label="Search the workspace" />
          <button className="dc-go" onClick={() => run(q)}>Search</button>
        </div>
        <div className="dc-types" role="group" aria-label="Filter by type">
          {TYPES.filter(t => t === "all" || counts.get(t)).map(t => <button key={t} className={`dc-type${type === t ? " on" : ""}`} onClick={() => setType(t)} aria-pressed={type === t}>
            {TYPE_LABEL[t]}<span>{t === "all" ? docs.length : counts.get(t) || 0}</span>
          </button>)}
        </div>
        <div className="dc-quick">
          <span className="dc-quick-lbl">Try</span>
          {prompts.map(d => <button key={d.id} className="dc-quick-btn" onClick={() => run(d.title)} title={d.title}>{d.title}</button>)}
          <span className="dc-scope">{sources.length} sources · {exps.length} runs · {nodes.filter(n => n.type === "note" || n.type === "question").length} notes</span>
        </div>
      </div>
    </section>

    <section className="dc-stats" aria-label="Discovery summary">
      <Stat icon={navIcons.discovery} label="Indexed items" value={docs.length} delta={`${index.length} types`} tone={docs.length ? "up" : "zero"}
        foot={<>{nodes.length} graph nodes · {exps.length} runs</>} />
      <Stat icon={navIcons.sources} label="Passages searchable" value={passages} delta={`${sources.length} sources`} tone={sources.length ? "up" : "zero"}
        foot={<>{sources.filter(s => s.chunks?.length).length} of {sources.length} documents with text</>} />
      <Stat icon={navIcons.search} label="Searches run" value={logs.length} delta={`+${week} this week`} tone={week ? "up" : "zero"}
        foot={logs.length ? <>Average response <b>{msLabel(avgMs)}</b></> : "Nothing logged yet"} />
      <Stat icon={navIcons.dashboard} label="Result open rate" value={logs.length ? engaged : "—"} suffix={logs.length ? "%" : undefined}
        delta={!logs.length ? "no searches" : opened ? `${zeroR}% zero-result` : "no opens yet"} tone={!logs.length ? "zero" : opened ? (zeroR ? "warn" : "up") : "warn"}
        foot={logs.length ? <>{opened} of {logs.length} searches opened a result</> : "Run a search to start measuring"} />
    </section>

    <div className="dc-layout">
      <div className="dc-main">
        {res
          ? (resultTotal
            ? <section className="dc-panel dc-results">
              <div className="dc-p-head">
                <div><h2>{resultTotal} matches for “{q}”</h2><p>{msLabel(res.ms)} · hybrid score shown as relevance, not accuracy</p></div>
                <span className="dc-p-badge">Ranked</span>
              </div>
              <div className="dc-results-list">
                {res.results.map((r, i) => {
                  const p = Math.round(r.relevance * 100);
                  const color = TYPE_COLOR[r.type] || "#F0805A";
                  return <article key={r.id} className="dc-hit" style={{ animationDelay: `${i * 45}ms` }}>
                    <div className="dc-hit-side">
                      <span className="dc-hit-rank">{String(i + 1).padStart(2, "0")}</span>
                      <span className="dc-score" style={{ background: `conic-gradient(${color} ${p}%, rgba(255,255,255,.08) 0)` }} title={`${p}% relevance`}><b>{p}%</b></span>
                    </div>
                    <div className="dc-hit-main">
                      <div className="dc-hit-top">
                        <span className="dc-hit-type" style={{ color, borderColor: color, background: `${color}1f` }}>{labelForType(r.type)}</span>
                        <h3>{r.title}</h3>
                      </div>
                      <p className="dc-excerpt" dangerouslySetInnerHTML={{ __html: highlight(r.excerpt, (r as { matched?: string[] }).matched || []) }} />
                      <div className="dc-hit-foot">
                        <span className="dc-ref">{r.ref.replace(":", " · ")}</span>
                        {r.tags.slice(0, 3).map(t => <span className="dc-tag" key={t}>{t}</span>)}
                        <span className="dc-hit-act">
                          <button className="dc-btn" onClick={() => mark(useStore.getState().activeWs!)}>Open →</button>
                          <button className="dc-btn" onClick={() => { addNode({ type: "note", title: "Note on: " + r.title, description: r.excerpt, tags: ["discovery"], x: 200, y: 200 }); toast("Saved as a note"); }}>Save as note</button>
                        </span>
                      </div>
                    </div>
                  </article>;
                })}
              </div>
            </section>
            : <section className="dc-panel"><Empty title="No useful results" body="Try fewer terms, check spelling, or switch the type filter. Zero-result searches are logged so the gap stays visible." /></section>)
          : <section className="dc-panel dc-explore">
            <div className="dc-p-head">
              <div><h2>Explore the index</h2><p>{docs.length} items indexed · click one to search with its title</p></div>
              <span className="dc-p-badge">{index.length} types</span>
            </div>
            {explore.length
              ? <div className="dc-doc-grid">
                {explore.map((d, i) => <button key={d.id} className="dc-doc" onClick={() => run(d.title)} style={{ animationDelay: `${i * 55}ms` }}>
                  <span className="dc-doc-top"><i className="dc-dot" style={{ background: TYPE_COLOR[d.type] || "#F0805A" }} />{labelForType(d.type)}<span className="dc-doc-go">Search →</span></span>
                  <b>{d.title}</b>
                  <span className="dc-doc-text">{d.text.trim().slice(0, 115) || "No preview text yet."}</span>
                  <span className="dc-doc-tags">{d.tags.slice(0, 3).map(t => <span key={t}>{t}</span>)}</span>
                </button>)}
              </div>
              : <Empty title="Nothing indexed yet" body="Add a source or write a note and it becomes searchable here." />}
          </section>}
      </div>

      <aside className="dc-rail" aria-label="Index and search analytics">
        <section className="dc-panel">
          <div className="dc-p-head">
            <div><h2>Index mix</h2><p>{docs.length} searchable items</p></div>
            <span className="dc-p-ic">{navIcons.memory}</span>
          </div>
          {mix.length
            ? <><div className="dc-mix">
              <Donut data={mix} colors={mix.map(m => TYPE_COLOR[m.type] || "#F0805A")} height={188} center={{ value: String(docs.length), label: "items" }} />
              <div className="dc-legend">
                {mix.map(m => <div key={m.type}>
                  <i style={{ background: TYPE_COLOR[m.type] || "#F0805A" }} /><span className="nm">{m.name}</span><b>{m.value}</b><em>{Math.round(m.value / Math.max(1, docs.length) * 100)}%</em>
                </div>)}
              </div>
            </div>
              <div className="dc-footrow"><span>Passages <b>{passages}</b></span><span>Sources <b>{sources.length}</b></span><span>Runs <b>{exps.length}</b></span></div></>
            : <div className="dc-inline-empty">Add a source or note to build the index.</div>}
        </section>

        <section className="dc-panel">
          <div className="dc-p-head">
            <div><h2>Search activity</h2><p>Last 7 days</p></div>
            <span className="dc-p-badge">{week} this week</span>
          </div>
          <div className={`dc-bars${logs.length ? "" : " is-empty"}`} role="img" aria-label={vol.map(v => `${v.label}: ${v.value} search${v.value === 1 ? "" : "es"}`).join(", ")}>
            {vol.map(v => <div key={v.key} className={`dc-bar-col${v.current ? " on" : ""}`} title={`${v.label}: ${v.value}`}>
              <span className="dc-bar-n">{v.value || ""}</span>
              <span className="dc-bar-track"><i style={{ height: `${Math.max(3, Math.round(v.value / volMax * 100))}%` }} /></span>
              <span className="dc-bar-lbl">{v.label}</span>
            </div>)}
          </div>
          {!logs.length && <p className="dc-bars-hint">No queries yet — the first search starts this 7-day history.</p>}
          <div className="dc-footrow"><span>Total <b>{logs.length}</b></span><span>Opened <b>{engaged}%</b></span><span>Zero <b>{zeroR}%</b></span></div>
        </section>

        <section className="dc-panel">
          <div className="dc-p-head">
            <div><h2>Recent queries</h2><p>{logs.length} logged</p></div>
          </div>
          {logs.length
            ? <div className="dc-query-list">
              {logs.slice(0, 6).map(l => <div className="dc-query" key={l.id}>
                <span className="dc-query-dot" data-on={l.opened ? "yes" : "no"} title={l.opened ? "Opened a result" : "No open recorded"} />
                <span className="dc-query-q" title={l.query}>{l.query}</span><b>{l.results}</b>
              </div>)}
            </div>
            : explore.length
              ? <div className="dc-query-list">
                <span className="dc-query-hint">Try one of these</span>
                {explore.slice(0, 3).map(d => <button key={d.id} className="dc-query dc-query-suggest" onClick={() => run(d.title)}>
                  <span className="dc-query-dot" data-on="no" />
                  <span className="dc-query-q" title={d.title}>{d.title}</span><b>Search →</b>
                </button>)}
              </div>
              : <div className="dc-inline-empty compact">Run a search to start the log.</div>}
        </section>
      </aside>
    </div>

    <section className="dc-panel dc-pipeline" aria-label="How retrieval works">
      <div className="dc-p-head">
        <div><h2>Retrieval pipeline</h2><p>Every query is tokenised and scored locally across this workspace.</p></div>
        <span className="dc-p-badge">No network</span>
      </div>
      <div className="dc-flow">
        <div className="dc-flow-node"><span>01</span><div><b>Tokenise</b><em>Query → weighted terms</em></div></div>
        <div className="dc-flow-line"><i /></div>
        <div className="dc-flow-node"><span>02</span><div><b>Score</b><em>TF-IDF ×2 · title ×0.8 · tags ×0.5</em></div></div>
        <div className="dc-flow-line"><i /></div>
        <div className="dc-flow-node"><span>03</span><div><b>Rank</b><em>Top 20 by hybrid score</em></div></div>
        <div className="dc-flow-line"><i /></div>
        <div className="dc-flow-node"><span>04</span><div><b>Cite</b><em>Excerpt + source reference</em></div></div>
      </div>
    </section>
  </div>;
}

function labelForType(t: string) {
  return t === "pdf" ? "Paper" : t === "experiment" ? "Run" : t.charAt(0).toUpperCase() + t.slice(1);
}

function highlight(text: string, terms: string[]) {
  let h = text.replace(/</g, "&lt;");
  terms.forEach(t => { if (!t) return; h = h.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
  return h;
}

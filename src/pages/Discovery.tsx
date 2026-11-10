import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { hybridSearch, type Doc } from "../lib/search";
import { Badge, Empty } from "../components/ui";
import { navIcons } from "../components/icons";
import "../styles/discovery.css";

const TYPES = ["all", "pdf", "note", "question", "dataset", "experiment", "github", "url"] as const;
const TYPE_LABEL: Record<string, string> = {
  all: "All", pdf: "Papers", note: "Notes", question: "Questions", dataset: "Datasets", experiment: "Runs", github: "Repos", url: "Web",
};
const KIND_LABEL: Record<string, string> = {
  pdf: "PDF papers", note: "Notes", question: "Questions", dataset: "Datasets", experiment: "Experiment runs", url: "Web pages", github: "Repositories",
};

export default function Discovery() {
  const activeWs = useStore(s => s.activeWs);
  const _n = useStore(s => s.nodes); const nodes = useMemo(() => _n.filter(n => n.workspaceId === activeWs), [_n, activeWs]);
  const _s = useStore(s => s.sources); const sources = useMemo(() => _s.filter(n => n.workspaceId === activeWs), [_s, activeWs]);
  const _x = useStore(s => s.experiments); const exps = useMemo(() => _x.filter(n => n.workspaceId === activeWs), [_x, activeWs]);
  const _l = useStore(s => s.searchLogs); const logs = useMemo(() => _l.filter(n => n.workspaceId === activeWs), [_l, activeWs]);
  const doLog = useStore(s => s.logSearch), mark = useStore(s => s.markOpened);
  const addNode = useStore(s => s.addNode);
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
  const vol = useMemo(() => { const m = new Map<string, number>(); logs.forEach(l => { const k = new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].slice(-8).map(([label, value]) => ({ label, value })); }, [logs]);
  const engaged = logs.length ? Math.round(logs.filter(l => l.opened).length / logs.length * 100) : 0;
  const zeroR = logs.length ? Math.round(logs.filter(l => l.results === 0).length / logs.length * 100) : 0;

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
  const maxIndex = index.reduce((m, [, v]) => Math.max(m, v), 1);
  const starters = useMemo(() => docs.slice(0, 3), [docs]);

  return <div className="dc">
    <div className="dc-eyebrow"><span>Search</span><span>{docs.length} indexed items</span><span>TF-IDF + keyword hybrid</span></div>
    <h1 className="rg-h1">Semantic Discovery</h1>
    <p className="rg-sub">Meaning-based retrieval across papers, notes, datasets, code, questions and runs. No precision claims without evaluation.</p>

    <section className="dc-desk">
      <div className="dc-desk-row">
        <span className="dc-desk-ic" aria-hidden>{navIcons.search}</span>
        <input className="dc-input" placeholder="Search everything you have read, written and run…" value={q}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") run(q); }} aria-label="Search the workspace" />
        <button className="btn btn-primary dc-go" onClick={() => run(q)}>Search</button>
      </div>
      <div className="dc-desk-foot">
        <div className="dc-types" role="group" aria-label="Filter by type">
          {TYPES.filter(t => t === "all" || counts.get(t)).map(t => <button key={t} className={`dc-type${type === t ? " on" : ""}`} onClick={() => setType(t)} aria-pressed={type === t}>
            {TYPE_LABEL[t]}<span>{(t === "all" ? docs.length : counts.get(t) || 0)}</span>
          </button>)}
        </div>
        <span className="dc-scope">{sources.length} sources · {exps.length} runs · {nodes.filter(n => n.type === "note" || n.type === "question").length} notes</span>
      </div>
    </section>

    {res ? (res.results.length
      ? <section className="dc-results">
        <div className="dc-results-head"><b>{res.results.length} results</b><span>{res.ms.toFixed(0)} ms · hybrid score shown as relevance, not accuracy</span></div>
        <div className="dc-list">{res.results.map((r, i) => <article key={r.id} className="dc-hit">
          <div className="dc-hit-main">
            <div className="dc-hit-top">
              <span className="dc-rank">{String(i + 1).padStart(2, "0")}</span>
              <h3>{r.title}</h3>
              <span className="dc-hit-badges"><Badge>{labelForType(r.type)}</Badge><Badge tone="violet">{Math.round(r.relevance * 100)}% relevant</Badge></span>
            </div>
            <p className="dc-excerpt" dangerouslySetInnerHTML={{ __html: highlight(r.excerpt, (r as { matched?: string[] }).matched || []) }} />
            <div className="dc-hit-foot">
              <span className="dc-ref">{r.ref.replace(":", " · ")}</span>
              {r.tags.slice(0, 3).map(t => <Badge key={t}>{t}</Badge>)}
              <span className="dc-hit-act">
                <button className="btn btn-ghost btn-sm" onClick={() => mark(useStore.getState().activeWs!)}>Open →</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { addNode({ type: "note", title: "Note on: " + r.title, description: r.excerpt, tags: ["discovery"], x: 200, y: 200 }); }}>Save as note</button>
              </span>
            </div>
          </div>
          <div className="dc-rel" title={`${Math.round(r.relevance * 100)}% relevance`}><i style={{ height: `${Math.round(r.relevance * 100)}%` }} /></div>
        </article>)}</div>
      </section>
      : <div className="dc-empty-result"><Empty title="No useful results" body="Try fewer terms, check spelling, or switch the type filter. Zero-result searches are logged so the gap stays visible." /></div>)
      : <section className="dc-start">
        <div className="dc-start-copy">
          <h2>Search what you already collected</h2>
          <p>Nothing here queries the internet. Results come from the {docs.length} items in this workspace, ranked by term overlap and meaning, and each hit links back to the item it came from.</p>
        </div>
        <div className="dc-start-list">
          <span className="dc-start-lbl">Try a real item from this workspace</span>
          {starters.map(d => <button key={d.id} className="dc-start-btn" onClick={() => run(d.title)}>
            <span className="dc-start-t">{labelForType(d.type)}</span>{d.title}
          </button>)}
          {!starters.length && <Empty title="Nothing indexed yet" body="Add a source or write a note and it becomes searchable here." />}
        </div>
      </section>}

    {logs.length
      ? <div className="dc-analytics">
        <div className="dc-card">
          <div className="dc-card-h"><h3>Search volume</h3><span className="dc-card-ic" aria-hidden>{navIcons.discovery}</span></div>
          {vol.length >= 3
            ? <div className="dc-vol">{vol.map(v => <div key={v.label} className="dc-vol-col">
              <span className="dc-vol-n">{v.value}</span>
              <span className="dc-vol-bar"><i style={{ height: `${Math.round(v.value / Math.max(...vol.map(x => x.value)) * 100)}%` }} /></span>
              <span className="dc-vol-lbl">{v.label}</span>
            </div>)}</div>
            : vol.length
              ? <ul className="dc-vollist">{vol.map(v => <li key={v.label}>
                <span>{v.label}</span>
                <span className="dc-bar"><i style={{ width: `${Math.round(v.value / Math.max(...vol.map(x => x.value)) * 100)}%` }} /></span>
                <b>{v.value} {v.value === 1 ? "search" : "searches"}</b>
              </li>)}</ul>
              : <Empty title="No searches yet" body="Run a search to populate analytics." />}
        </div>
        <div className="dc-card">
          <div className="dc-card-h"><h3>Engagement</h3></div>
          <b className="dc-big">{engaged}%</b>
          <p className="dc-note">Searches leading to an opened result ÷ total searches.</p>
          <div className="dc-split"><span>Zero-result rate</span><b>{zeroR}%</b></div>
        </div>
        <div className="dc-card">
          <div className="dc-card-h"><h3>Top queries</h3></div>
          <ul className="dc-queries">{logs.slice(0, 5).map(l => <li key={l.id}><span>{l.query}</span><b>{l.results}</b></li>)}</ul>
        </div>
      </div>
      : <div className="dc-analytics dc-analytics-empty">
        <div className="dc-card">
          <div className="dc-card-h"><h3>Search history</h3><span className="dc-pill">{logs.length} logged</span></div>
          <Empty title="No searches yet" body="Volume, engagement and top queries appear here once you search. Nothing is pre-filled." />
        </div>
        <div className="dc-card">
          <div className="dc-card-h"><h3>Corpus index</h3><span className="dc-pill">{docs.length} items</span></div>
          <ul className="dc-index">{index.map(([t, n]) => <li key={t}>
            <span>{KIND_LABEL[t] || t}</span><span className="dc-bar"><i style={{ width: `${Math.round(n / maxIndex * 100)}%` }} /></span><b>{n}</b>
          </li>)}</ul>
          <p className="dc-note">Only these items are searchable — no web results are mixed in.</p>
        </div>
      </div>}
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

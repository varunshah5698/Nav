import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  MarkerType, type Node as RFNode, type Edge as RFEdge, type ReactFlowInstance,
  useNodesState, useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/canvas.css";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { Modal } from "../components/ui";
import { Gauge } from "../components/Charts";
import NodeAnalysis from "../components/NodeAnalysis";
import { graphMetrics } from "../lib/analytics";
import type { EdgeType, NodeType, RNode, Activity } from "../lib/types";

/* ---------- type system ---------- */
const C: Record<NodeType, string> = {
  paper: "#B7A8FF", dataset: "#7FB0FF", code_repo: "#8FA6A6", code_file: "#78898A",
  note: "#D8F85E", webpage: "#9FC4FF", question: "#F0CE4E", experiment: "#D8F85E",
  result: "#5BE39A", error: "#FF7A7A", fix: "#5BE39A", conclusion: "#CBB6FF",
};
const NODE_TYPES: NodeType[] = ["paper", "dataset", "code_repo", "code_file", "note", "webpage", "question", "experiment", "result", "error", "fix", "conclusion"];
const LABEL: Record<EdgeType, string> = {
  supports: "supports", references: "references", uses: "uses", investigates: "investigates",
  produces: "produces", resolves: "resolves", contradicts: "contradicts", relates: "relates to",
};
const LINK_TYPES: EdgeType[] = ["relates", "supports", "references", "uses", "investigates", "produces", "resolves", "contradicts"];
const pretty = (t: string) => t.replace(/_/g, " ");

/* ---------- node card ---------- */
function NodeCard({ data }: { data: any }) {
  const n = data.node as RNode;
  return (
    <div className="cv-node" style={{ ["--c" as any]: C[n.type] }}>
      <Handle type="target" position={Position.Left} className="cv-handle" />
      <span className="cv-node-bar" />
      <div className="cv-node-meta">
        <span className="cv-node-type">{pretty(n.type)}</span>
        <span className="cv-node-deg" title={`${data.degree} connections`}>{data.degree}</span>
      </div>
      <div className="cv-node-title">{n.title}</div>
      {n.tags.length > 0 && (
        <div className="cv-node-tags">{n.tags.slice(0, 2).map((t: string) => <span key={t}>#{t}</span>)}</div>
      )}
      <Handle type="source" position={Position.Right} className="cv-handle" />
    </div>
  );
}
const nodeTypes = { rnode: NodeCard };

/* ---------- small chrome icons ---------- */
const I = {
  nodes: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="2.6"/><circle cx="9" cy="3.2" r="1.5"/><circle cx="9" cy="14.8" r="1.5"/><circle cx="3.2" cy="9" r="1.5"/><circle cx="14.8" cy="9" r="1.5"/></svg>,
  links: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="4.6" cy="9" r="2.1"/><circle cx="13.4" cy="4.6" r="2.1"/><circle cx="13.4" cy="13.4" r="2.1"/><path d="M6.5 8 11.7 5.4M6.5 10l5.2 2.6"/></svg>,
  health: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12.4a6.4 6.4 0 1 1 12 0"/><path d="M9 12.4 12 8"/></svg>,
  orphan: <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3"/><circle cx="9" cy="9" r="6.6" strokeDasharray="2 3"/></svg>,
};

/* ---------- layout: left → right research flow ---------- */
const COLUMNS: NodeType[][] = [
  ["paper", "dataset", "code_repo", "code_file", "webpage", "note"],
  ["question"],
  ["experiment"],
  ["result", "error", "fix"],
  ["conclusion"],
];
/* narrower stages fold the five stages into three balanced columns
   (evidence → work → findings) so the fitted zoom stays legible */
const COLUMNS_NARROW: NodeType[][] = [
  ["paper", "dataset", "code_repo", "webpage"],
  ["code_file", "note", "question", "experiment"],
  ["result", "error", "fix", "conclusion"],
];
const COL_W = 268, ORIGIN_X = 40, ORIGIN_Y = 40;
const NW = 208, NH = 108;
const overlaps = (ns: RNode[]) => ns.some((a, i) => ns.some((b, j) => j > i && Math.abs(a.x - b.x) < NW && Math.abs(a.y - b.y) < NH));

export default function Canvas() {
  const ws = useStore(s => s.workspaces.find(w => w.id === s.activeWs));
  const activeWs = useStore(s => s.activeWs);
  const allN = useStore(s => s.nodes); const nodes = useMemo(() => allN.filter(n => n.workspaceId === activeWs), [allN, activeWs]);
  const allE = useStore(s => s.edges); const edges = useMemo(() => allE.filter(e => e.workspaceId === activeWs), [allE, activeWs]);
  const addNode = useStore(s => s.addNode), upd = useStore(s => s.updateNode), del = useStore(s => s.deleteNode);
  const addE = useStore(s => s.addEdge), delE = useStore(s => s.deleteEdge), suggest = useStore(s => s.suggestEdges);
  const toast = useStore(s => s.toast);
  const canEdit = useStore(s => !!s.canEdit());

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | NodeType>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [suggFor, setSuggFor] = useState<string | null>(null);
  const [analysisFor, setAnalysisFor] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [linkType, setLinkType] = useState<EdgeType>("relates");
  const searchRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const inst = useRef<ReactFlowInstance | null>(null);
  const tidied = useRef(false);

  const degree = useMemo(() => {
    const m = new Map<string, number>();
    edges.forEach(e => { m.set(e.source, (m.get(e.source) || 0) + 1); m.set(e.target, (m.get(e.target) || 0) + 1); });
    return m;
  }, [edges]);

  const counts = useMemo(() => {
    const m: Partial<Record<NodeType, number>> = {};
    nodes.forEach(n => { m[n.type] = (m[n.type] || 0) + 1; });
    return m;
  }, [nodes]);

  const visible = useMemo(() => nodes.filter(n =>
    (filter === "all" || n.type === filter) &&
    (q === "" || (n.title + " " + n.description + " " + n.tags.join(" ")).toLowerCase().includes(q.toLowerCase()))
  ), [nodes, filter, q]);

  /* focus = neighbourhood of the current selection */
  const activeEdges = useMemo(() => {
    if (selEdge) return new Set([selEdge]);
    if (sel) return new Set(edges.filter(e => e.source === sel || e.target === sel).map(e => e.id));
    return new Set<string>();
  }, [sel, selEdge, edges]);
  const focus = useMemo(() => {
    if (selEdge) { const e = edges.find(x => x.id === selEdge); return e ? new Set([e.source, e.target]) : null; }
    if (!sel) return null;
    const s = new Set([sel]);
    edges.forEach(e => { if (e.source === sel) s.add(e.target); if (e.target === sel) s.add(e.source); });
    return s;
  }, [sel, selEdge, edges]);

  const [rfN, setRfN, onN] = useNodesState([] as RFNode[]);
  const [rfE, setRfE, onE] = useEdgesState([] as RFEdge[]);

  useEffect(() => {
    setRfN(visible.map(n => {
      const dim = !!focus && !focus.has(n.id);
      return {
        id: n.id, type: "rnode", position: { x: n.x, y: n.y },
        data: { node: n, degree: degree.get(n.id) || 0 },
        className: [dim ? "cv-dim" : "", sel === n.id ? "is-sel" : ""].join(" ").trim(),
        selected: sel === n.id,
        draggable: canEdit,
      } as RFNode;
    }));
    setRfE(edges
      .filter(e => visible.some(n => n.id === e.source) && visible.some(n => n.id === e.target))
      .map(e => {
        const on = activeEdges.has(e.id);
        const dim = !!focus && !on;
        return {
          id: e.id, source: e.source, target: e.target,
          className: dim ? "cv-dim" : "",
          animated: e.type === "produces",
          style: { stroke: on ? "rgba(216,248,94,.8)" : "rgba(255,255,255,.22)", strokeWidth: on ? 1.9 : 1.3 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: on ? "rgba(216,248,94,.8)" : "rgba(255,255,255,.3)" },
        } as RFEdge;
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, filter, q, sel, selEdge, focus, activeEdges, canEdit]);

  /* frame the whole graph from stored positions — no node measurement needed */
  const fitAll = useCallback((duration = 0) => {
    const box = flowRef.current?.getBoundingClientRect(), rf = inst.current;
    const st = useStore.getState();
    const list = st.nodes.filter(n => n.workspaceId === st.activeWs);
    if (!box || !rf || !list.length) return;
    const minX = Math.min(...list.map(n => n.x)), maxX = Math.max(...list.map(n => n.x)) + NW;
    const minY = Math.min(...list.map(n => n.y)), maxY = Math.max(...list.map(n => n.y)) + NH;
    const pad = 44;
    const zoom = Math.max(0.25, Math.min((box.width - pad * 2) / Math.max(maxX - minX, 1), (box.height - pad * 2) / Math.max(maxY - minY, 1), 1.15));
    rf.setViewport({ x: box.width / 2 - ((minX + maxX) / 2) * zoom, y: box.height / 2 - ((minY + maxY) / 2) * zoom, zoom }, { duration });
  }, []);

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !rfN.length) return;
    fitted.current = true;
    const tryFit = (tries = 0) => {
      if (inst.current) { fitAll(); return; }
      if (tries < 25) setTimeout(() => tryFit(tries + 1), 40);
    };
    setTimeout(() => tryFit(), 40);
  }, [rfN.length, fitAll]);

  const layout = useCallback(() => {
    const width = flowRef.current?.getBoundingClientRect().width || 900;
    const narrow = width < 1180;
    const cols = narrow ? COLUMNS_NARROW : COLUMNS;
    const rowH = narrow ? 96 : 138, colW = narrow ? 248 : COL_W;
    cols.forEach((types, ci) => {
      const col = nodes.filter(n => types.includes(n.type)).sort((a, b) => a.y - b.y);
      col.forEach((n, ri) => upd(n.id, { x: ORIGIN_X + ci * colW, y: ORIGIN_Y + ri * rowH }));
    });
    setTimeout(() => fitAll(550), 80);
  }, [nodes, upd, fitAll]);

  /* arrange once per screen size: seed positions overlap and a phone needs a tighter flow */
  useEffect(() => {
    if (tidied.current || !nodes.length) return;
    tidied.current = true;
    if (!canEdit) return;
    const box = flowRef.current?.getBoundingClientRect();
    const mode = box && box.width < 1180 ? "compact" : "wide";
    if (localStorage.getItem("rg.canvas.layout.v2") === mode && !overlaps(nodes)) return;
    setTimeout(() => {
      layout();
      try { localStorage.setItem("rg.canvas.layout.v2", mode); } catch { /* private mode */ }
      toast("Arranged the graph into the research flow.");
    }, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  const onConnect = useCallback((c: any) => {
    if (c.source && c.target) { addE(c.source, c.target, LABEL[linkType], linkType); toast(`Linked · ${LABEL[linkType]}`); }
  }, [addE, linkType, toast]);

  const onNodeDragStop = useCallback((_e: any, n: RFNode) => {
    upd(n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) });
  }, [upd]);

  /* keep the selected card clear of the inspector panel */
  const bringIntoView = useCallback((nodeId: string) => {
    const rf = inst.current, box = flowRef.current?.getBoundingClientRect();
    const n = nodes.find(x => x.id === nodeId);
    if (!rf || !box || !n) return;
    const vp = rf.getViewport();
    const panel = box.width > 720 ? 356 : 0;
    const sx = n.x * vp.zoom + vp.x, sy = n.y * vp.zoom + vp.y;
    const right = sx + NW * vp.zoom, bottom = sy + NH * vp.zoom;
    let dx = 0, dy = 0;
    if (right > box.width - panel - 24) dx = box.width - panel - 24 - right;
    else if (sx < 24) dx = 24 - sx;
    if (bottom > box.height - 24) dy = box.height - 24 - bottom;
    else if (sy < 24) dy = 24 - sy;
    if (dx || dy) rf.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 380 });
  }, [nodes]);

  /* outside click closes the type popover */
  useEffect(() => {
    if (!typeOpen) return;
    const h = (ev: MouseEvent) => { if (!typeRef.current?.contains(ev.target as globalThis.Node)) setTypeOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [typeOpen]);

  /* keyboard: / focus search, n new node, esc dismiss */
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if (ev.key === "Escape") { setSel(null); setSelEdge(null); setTypeOpen(false); if (typing) t.blur(); return; }
      if (typing) return;
      if (ev.key === "/") { ev.preventDefault(); searchRef.current?.focus(); }
      if (ev.key.toLowerCase() === "n" && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); setShowAdd(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const node = nodes.find(n => n.id === sel) || null;
  const edge = edges.find(e => e.id === selEdge) || null;
  const rels = useMemo(() => (sel ? edges.filter(e => e.source === sel || e.target === sel).map(e => {
    const out = e.source === sel;
    return { edge: e, out, other: nodes.find(n => n.id === (out ? e.target : e.source)) };
  }).filter(r => r.other) : []), [sel, edges, nodes]);
  const suggs = suggFor ? suggest(suggFor) : [];
  const isolated = nodes.filter(n => !(degree.get(n.id) || 0)).length;
  const mostConnected = [...degree.entries()].sort((a, b) => b[1] - a[1])[0];
  const mostNode = mostConnected ? nodes.find(n => n.id === mostConnected[0]) : null;

  /* graph statistics shown around the stage */
  const gm = useMemo(() => graphMetrics(nodes, edges), [nodes, edges]);
  const byType = useMemo(() => NODE_TYPES
    .map(t => ({ type: t, n: counts[t] || 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n), [counts]);
  const byLink = useMemo(() => {
    const m = new Map<string, number>();
    edges.forEach(e => m.set(e.label, (m.get(e.label) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [edges]);
  const allActs = useStore(s => s.activities);
  const acts = useMemo(() => allActs
    .filter(a => a.workspaceId === activeWs)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5), [allActs, activeWs]);
  const rel = (iso: string) => {
    const m = Math.round((Date.now() - +new Date(iso)) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    const h = Math.round(m / 60);
    return h < 24 ? h + "h ago" : Math.round(h / 24) + "d ago";
  };
  const maxType = byType[0]?.n || 1;
  const maxLink = byLink[0]?.[1] || 1;

  const clearAll = () => { setFilter("all"); setQ(""); };

  return (
    <div className="cv">      <header className="cv-head">
        <div>
          <div className="cv-eyebrow">
            <span>{ws?.name || "Workspace"}</span>
            {ws?.demo && <><i className="sep" /><span>Demo data</span></>}
          </div>
          <h1 className="cv-h1">Research canvas</h1>
          <p className="cv-sub">Arrange the evidence left to right, then read the graph beside it.</p>
        </div>
        <div className="cv-actions">
          <button className="btn btn-ghost btn-sm" onClick={layout}>Tidy layout</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} disabled={!canEdit}>+ New node</button>
        </div>
      </header>

      <section className="cv-kpis" aria-label="Graph summary">
        <div className="cv-kpi t-violet">
          <span className="cv-kpi-ic">{I.nodes}</span>
          <div><b>{nodes.length}</b><span>Nodes</span></div>
          <em>{byType.length} type{byType.length === 1 ? "" : "s"}</em>
        </div>
        <div className="cv-kpi t-ink">
          <span className="cv-kpi-ic">{I.links}</span>
          <div><b>{edges.length}</b><span>Links</span></div>
          <em>{gm.avgDegree.toFixed(1)} per node</em>
        </div>
        <div className="cv-kpi t-lime">
          <span className="cv-kpi-ic">{I.health}</span>
          <div><b>{nodes.length ? gm.rate : 0}<small>%</small></b><span>Connected</span></div>
          <em>{gm.linked}/{gm.nodes} linked</em>
        </div>
        <div className={`cv-kpi${isolated ? " t-warn" : ""}`}>
          <span className="cv-kpi-ic">{I.orphan}</span>
          <div><b>{isolated}</b><span>Isolated</span></div>
          <em>{isolated ? "need a link" : "none ✓"}</em>
        </div>
      </section>

      <div className="cv-main">
      <section className="cv-stage" aria-label="Research graph canvas">
        <div className="cv-bar">
          <label className="cv-search">
            <span aria-hidden>⌕</span>
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Filter nodes…  /" aria-label="Filter nodes" />
            {q && <button className="cv-x-sm" onClick={() => setQ("")} aria-label="Clear filter">✕</button>}
          </label>

          <div className="cv-types" ref={typeRef}>
            <button className={`cv-chip${filter !== "all" ? " on" : ""}`} onClick={() => setTypeOpen(o => !o)} aria-expanded={typeOpen}>
              <i style={{ background: filter === "all" ? "#D8F85E" : C[filter] }} />
              {filter === "all" ? "All types" : pretty(filter)}
              <span className="cv-chip-n">{filter === "all" ? nodes.length : counts[filter] || 0}</span>
              <span className="cv-caret" aria-hidden>▾</span>
            </button>
            {typeOpen && (
              <div className="cv-pop" role="listbox">
                <button className={filter === "all" ? "on" : ""} onClick={() => { setFilter("all"); setTypeOpen(false); }}>
                  <i style={{ background: "#D8F85E" }} /> All types <span>{nodes.length}</span>
                </button>
                {NODE_TYPES.filter(t => counts[t]).map(t => (
                  <button key={t} className={filter === t ? "on" : ""} onClick={() => { setFilter(t); setTypeOpen(false); }}>
                    <i style={{ background: C[t] }} /> {pretty(t)} <span>{counts[t]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="cv-link">
            <span>New link</span>
            <select value={linkType} onChange={e => setLinkType(e.target.value as EdgeType)} aria-label="Type for new connections">
              {LINK_TYPES.map(t => <option key={t} value={t}>{LABEL[t]}</option>)}
            </select>
          </label>

          <div className="cv-bar-r">
            <span className="cv-meter">{visible.length}<em>/{nodes.length}</em></span>
            <button className="cv-icon" onClick={layout} title="Arrange nodes left → right by research stage" aria-label="Auto-layout">tidy</button>
            <button className="cv-add" onClick={() => setShowAdd(true)} disabled={!canEdit}>+ Node</button>
          </div>
        </div>

        <div className="cv-flow" ref={flowRef}>
          <ReactFlow
            nodes={rfN} edges={rfE}
            onNodesChange={onN} onEdgesChange={onE} onConnect={onConnect}
            onInit={i => { inst.current = i; }}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_e, n) => { setSel(n.id); setSelEdge(null); bringIntoView(n.id); }}
            onEdgeClick={(_e, e) => { setSelEdge(e.id); setSel(null); }}
            onPaneClick={() => { setSel(null); setSelEdge(null); }}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
            minZoom={0.25} maxZoom={1.8} nodesConnectable={canEdit} nodesDraggable={canEdit}
            connectionLineStyle={{ stroke: "#D8F85E", strokeWidth: 1.6, strokeDasharray: "5 4" }}
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgba(255,255,255,.13)" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right"
              nodeColor={(n: any) => C[(n.data?.node?.type as NodeType) || "note"]}
              nodeStrokeWidth={0} maskColor="rgba(11,14,14,.72)"
              style={{ width: 132, height: 88 }} />
          </ReactFlow>

          {visible.length === 0 && (
            <div className="cv-empty">
              <b>Nothing matches “{q || pretty(filter)}”.</b>
              <span>Try another word, or show every node again.</span>
              <button className="cv-chip on" onClick={clearAll}>Reset filters</button>
            </div>
          )}

          {!sel && !selEdge && (
            <div className="cv-hint">
              Drag to arrange · pull from a side dot to link
              {mostNode && <> · busiest: <button onClick={() => setSel(mostNode.id)}>{mostNode.title.length > 34 ? mostNode.title.slice(0, 34) + "…" : mostNode.title}</button></>}
            </div>
          )}

          {/* ---------- inspector ---------- */}
          <aside className={`cv-insp${node || edge ? " open" : ""}`} aria-hidden={!(node || edge)}>
            {node && (
              <>
                <div className="cv-insp-h">
                  <span className="cv-tag" style={{ color: C[node.type] }}><i style={{ background: C[node.type] }} />{pretty(node.type)}</span>
                  <button className="cv-x" onClick={() => setSel(null)} aria-label="Close inspector">✕</button>
                </div>
                <div className="cv-insp-body">
                <input className="cv-insp-title" value={node.title} readOnly={!canEdit}
                  onChange={e => upd(node.id, { title: e.target.value })} aria-label="Node title" />
                <textarea className="cv-insp-desc" rows={3} value={node.description} readOnly={!canEdit}
                  placeholder="What did you learn here?" onChange={e => upd(node.id, { description: e.target.value })} aria-label="Node description" />
                {node.url && <a className="cv-insp-url" href={node.url} target="_blank" rel="noreferrer">Open source ↗</a>}
                <div className="cv-insp-meta">{degree.get(node.id) || 0} connections · updated {new Date(node.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>

                <div className="cv-sec">
                  <h4>Connections <span>{rels.length}</span></h4>
                  {rels.length === 0 && <p className="cv-none">No links yet — drag from a side dot to connect this node.</p>}
                  {rels.map((r: any) => (
                    <div className="cv-rel" key={r.edge.id}>
                      <button className="cv-rel-main" onClick={() => setSel(r.other.id)}>
                        <i style={{ background: C[r.other.type as NodeType] }} />
                        <span className="cv-rel-txt">
                          <b>{r.other.title}</b>
                          <em>{r.out ? "→" : "←"} {r.edge.label}</em>
                        </span>
                      </button>
                      <button className="cv-rel-x" title="Remove connection" onClick={() => delE(r.edge.id)} aria-label={`Remove link to ${r.other.title}`}>✕</button>
                    </div>
                  ))}
                </div>

                {node.tags.length > 0 && <div className="cv-insp-tags">{node.tags.map(t => <span key={t}>#{t}</span>)}</div>}
                </div>

                <div className="cv-insp-acts">
                  <button className="cv-btn lime" onClick={() => setAnalysisFor(node.id)}>Full analysis</button>
                  <button className="cv-btn ghost" onClick={() => setSuggFor(node.id)}>✦ Suggest</button>
                  <button className="cv-btn danger" disabled={!canEdit} onClick={() => { del(node.id); setSel(null); }}>Delete</button>
                </div>
              </>
            )}

            {edge && (
              <>
                <div className="cv-insp-h">
                  <span className="cv-tag" style={{ color: "#CBD5D5" }}><i style={{ background: "#D8F85E" }} />connection</span>
                  <button className="cv-x" onClick={() => setSelEdge(null)} aria-label="Close inspector">✕</button>
                </div>
                <div className="cv-insp-body">
                <div className="cv-edge-view">
                  <b>{nodes.find(n => n.id === edge.source)?.title || "—"}</b>
                  <span className="cv-edge-arrow">↓ <em>{edge.label}</em></span>
                  <b>{nodes.find(n => n.id === edge.target)?.title || "—"}</b>
                </div>
                <div className="cv-insp-meta">type: {edge.type} · created {new Date(edge.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                </div>
                <div className="cv-insp-acts">
                  <button className="cv-btn danger" disabled={!canEdit} onClick={() => { delE(edge.id); setSelEdge(null); }}>Remove connection</button>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>

      <aside className="cv-rail" aria-label="Graph analysis">
        <section className="cv-panel">
          <div className="cv-panel-h">
            <h2>Graph health</h2>
            <span className="cv-stat-pill">{gm.rate}% linked</span>
          </div>
          <div className="cv-gauge-wrap"><Gauge value={gm.rate} label="nodes linked" /></div>
          <div className="cv-mini">
            <div><span>Avg degree</span><b>{gm.avgDegree.toFixed(1)}</b></div>
            <div><span>Density</span><b>{gm.density.toFixed(2)}</b></div>
            <div><span>Clusters</span><b>{gm.components}</b></div>
            <div><span>Max degree</span><b>{gm.maxDegree}</b></div>
          </div>
        </section>

        <section className="cv-panel">
          <div className="cv-panel-h">
            <h2>Node mix</h2>
            <span className="cv-stat-pill">{nodes.length} total</span>
          </div>
          {byType.length ? (
            <div className="cv-mix">
              {byType.slice(0, 6).map(t => (
                <button key={t.type} className="cv-mix-row"
                  onClick={() => { setFilter(filter === t.type ? "all" : t.type); setQ(""); }}
                  aria-pressed={filter === t.type} title={`Show only ${pretty(t.type)}`}>
                  <span className="lab"><i style={{ background: C[t.type] }} />{pretty(t.type)}</span>
                  <span className="track"><i style={{ width: `${(t.n / maxType) * 100}%`, background: C[t.type] }} /></span>
                  <b>{t.n}</b>
                </button>
              ))}
              {byType.length > 6 && <p className="cv-mix-more">+{byType.length - 6} smaller types</p>}
            </div>
          ) : <p className="cv-ok">No nodes yet — add your first one.</p>}
        </section>

        <section className="cv-panel">
          <div className="cv-panel-h">
            <h2>Unlinked</h2>
            <span className={`cv-stat-pill${gm.isolated.length ? " warn" : ""}`}>{gm.isolated.length}</span>
          </div>
          {gm.isolated.length ? (
            <div className="cv-orphans">
              {gm.isolated.slice(0, 4).map(n => (
                <button key={n.id} onClick={() => { setSel(n.id); setSelEdge(null); bringIntoView(n.id); }}>
                  <i style={{ background: C[n.type] }} />
                  <span>{n.title}</span>
                  <em>{pretty(n.type)}</em>
                </button>
              ))}
              {gm.isolated.length > 4 && <p className="cv-mix-more">+{gm.isolated.length - 4} more on the stage</p>}
            </div>
          ) : <p className="cv-ok">✓ Every node has at least one link.</p>}
        </section>
      </aside>
      </div>

      <section className="cv-bottom">
        <section className="cv-panel">
          <div className="cv-panel-h">
            <h2>Link vocabulary</h2>
            <span className="cv-stat-pill">{edges.length} links</span>
          </div>
          {byLink.length ? (
            <div className="cv-mix">
              {byLink.map(([label, n]) => (
                <div className="cv-mix-row static" key={label}>
                  <span className="lab">{label}</span>
                  <span className="track"><i style={{ width: `${(n / maxLink) * 100}%` }} /></span>
                  <b>{n}</b>
                </div>
              ))}
            </div>
          ) : <p className="cv-ok">No links yet — pull from a node’s side dot to connect two.</p>}
        </section>

        <section className="cv-panel">
          <div className="cv-panel-h">
            <h2>Recent activity</h2>
            <Link className="cv-linkpill" to="/app/collaboration">History</Link>
          </div>
          {acts.length ? (
            <ol className="cv-tl">
              {acts.map((a: Activity) => (
                <li key={a.id}><span className={`dot ${a.kind}`} /><div><p>{a.text}</p><time>{rel(a.createdAt)}</time></div></li>
              ))}
            </ol>
          ) : <p className="cv-ok">Activity appears as you add sources, run agents and link nodes.</p>}
        </section>
      </section>

      {analysisFor && <NodeAnalysis nodeId={analysisFor} onClose={() => setAnalysisFor(null)} />}

      {showAdd && (
        <AddNode onClose={() => setShowAdd(false)} onAdd={(t, title) => {
          const pos = { x: 120 + Math.random() * 260, y: 120 + Math.random() * 200 };
          addNode({ type: t, title, description: "", tags: [], ...pos });
          setShowAdd(false);
          setTimeout(() => fitAll(450), 80);
        }} />
      )}

      {suggFor && (
        <Modal onClose={() => setSuggFor(null)}>
          <div className="cv-sugg">
            <h3>Suggested connections</h3>
            <p className="cv-sugg-sub">Proposed from tag and type similarity. Nothing is linked until you accept.</p>
            {!suggs.length ? <p className="cv-none">No compatible nodes found — add keywords or tags first.</p> : suggs.map(s => (
              <div className="cv-sugg-row" key={s.target.id}>
                <div className="cv-sugg-h">
                  <i style={{ background: C[s.target.type] }} />
                  <b>{s.target.title}</b>
                  <span className="cv-sugg-conf">{(s.conf * 100).toFixed(0)}%</span>
                </div>
                <p>{s.reason}</p>
                <div className="cv-sugg-f">
                  <span className="cv-tag" style={{ color: C[s.target.type] }}>→ {s.label}</span>
                  <button className="cv-btn lime" onClick={() => { addE(suggFor, s.target.id, s.label, "relates"); setSuggFor(null); }}>Accept</button>
                  <button className="cv-btn ghost" onClick={() => setSuggFor(null)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddNode({ onClose, onAdd }: { onClose: () => void; onAdd: (t: NodeType, title: string) => void }) {
  const [t, setT] = useState<NodeType>("note");
  const [title, setTitle] = useState("");
  return (
    <Modal onClose={onClose}>
      <div className="cv-sugg">
        <h3>New node</h3>
        <p className="cv-sugg-sub">Pick what this is, then name it. You can fill in detail on the canvas.</p>
        <div className="cv-picker">
          {NODE_TYPES.map(x => (
            <button key={x} className={t === x ? "on" : ""} onClick={() => setT(x)}>
              <i style={{ background: C[x] }} />{pretty(x)}
            </button>
          ))}
        </div>
        <label className="lbl" style={{ marginTop: 16 }}>Title</label>
        <input className="input" autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && title.trim()) onAdd(t, title.trim()); }}
          placeholder="e.g. Why does augmentation help field photos?" />
        <div className="cv-sugg-f" style={{ marginTop: 16 }}>
          <button className="cv-btn lime" disabled={!title.trim()} onClick={() => onAdd(t, title.trim())}>Create node</button>
          <button className="cv-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

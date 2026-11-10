import { useEffect, useMemo } from "react";
import { useStore } from "../lib/store";
import type { NodeType, RNode } from "../lib/types";

/* mirrors the canvas palette so a node keeps one colour everywhere */
const NC: Record<string, string> = {
  paper: "#B7A8FF", dataset: "#7FB0FF", code_repo: "#8FA6A6", code_file: "#78898A",
  note: "#C7E24B", webpage: "#9FC4FF", question: "#F0CE4E", experiment: "#C7E24B",
  result: "#5BE39A", error: "#FF7A7A", fix: "#5BE39A", conclusion: "#CBB6FF",
};
const color = (t: string) => NC[t] || "#9AA0A0";
const pretty = (t: string) => t.replace(/_/g, " ");
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Bars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map(i => i.value));
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  return <div className="na-bars">
    {items.map(i => <div className="na-bar" key={i.label}>
      <span className="na-bar-l"><i style={{ background: i.color }} />{pretty(i.label)}</span>
      <span className="na-bar-t"><i style={{ width: `${(i.value / max) * 100}%`, background: i.color }} /></span>
      <b>{i.value}<em>{Math.round((i.value / total) * 100)}%</em></b>
    </div>)}
  </div>;
}

/** Radial ego network: the node, everyone it touches, and how much those neighbours know each other. */
function Ego({ node, rels, inner }: { node: RNode; rels: { out: boolean; other: RNode; label: string }[]; inner: number }) {
  const list = rels.slice(0, 7);
  const cx = 150, cy = 104, r = 74;
  if (!rels.length) return <div className="na-ego na-ego-empty">
    <span className="na-dot" style={{ background: color(node.type) }} />
    <p>No neighbours yet — this node isn’t connected to anything, so there is no ego network to draw.</p>
    <p className="na-ego-hint">Connect it on the canvas and this view fills in.</p>
  </div>;
  return <div className="na-ego">
    <svg viewBox="0 0 300 208" role="img" aria-label={`${node.title} and ${rels.length} connected nodes`}>
      {list.map((rel, i) => {
        const a = (-90 + (360 / Math.max(list.length, 1)) * i) * Math.PI / 180;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        return <g key={rel.other.id}>
          <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(30,34,34,.18)" strokeWidth={1.4}
            strokeDasharray={rel.out ? undefined : "3 3"} />
        </g>;
      })}
      {list.map((rel, i) => {
        const a = (-90 + (360 / Math.max(list.length, 1)) * i) * Math.PI / 180;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        const right = Math.cos(a) >= 0;
        return <g key={rel.other.id}>
          <circle cx={x} cy={y} r={5.4} fill={color(rel.other.type)} stroke="#fff" strokeWidth={1.8} />
          <text x={x + (right ? 9 : -9)} y={y + 3} textAnchor={right ? "start" : "end"}
            fontSize="7.6" fill="#6B7171" fontWeight="600">
            {rel.other.title.length > 13 ? rel.other.title.slice(0, 12) + "…" : rel.other.title}
          </text>
        </g>;
      })}
      <circle cx={cx} cy={cy} r={15} fill="#fff" />
      <circle cx={cx} cy={cy} r={12} fill={color(node.type)} />
      <circle cx={cx} cy={cy} r={4.2} fill="#fff" />
    </svg>
    <p className="na-ego-cap">
      Neighbour links <b>{inner}</b> · ego density <b>{(rels.length > 1 ? inner / (rels.length * (rels.length - 1) / 2) : 0).toFixed(2)}</b>
    </p>
  </div>;
}

export default function NodeAnalysis({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const activeWs = useStore(s => s.activeWs);
  const allN = useStore(s => s.nodes);
  const allE = useStore(s => s.edges);
  const nodes = useMemo(() => allN.filter(n => n.workspaceId === activeWs), [allN, activeWs]);
  const edges = useMemo(() => allE.filter(e => e.workspaceId === activeWs), [allE, activeWs]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const node = nodes.find(n => n.id === nodeId) || null;

  const stats = useMemo(() => {
    if (!node) return null;
    const degree = new Map<string, number>();
    edges.forEach(e => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });
    const rels = edges
      .filter(e => e.source === node.id || e.target === node.id)
      .map(e => {
        const out = e.source === node.id;
        return { edge: e, out, label: e.label, other: nodes.find(n => n.id === (out ? e.target : e.source)) };
      })
      .filter((r): r is { edge: typeof r.edge; out: boolean; label: string; other: RNode } => !!r.other);

    const outCount = rels.filter(r => r.out).length;
    const deg = rels.length;
    const ranked = [...nodes].map(n => ({ id: n.id, d: degree.get(n.id) || 0 })).sort((a, b) => b.d - a.d);
    const rank = ranked.findIndex(r => r.id === node.id) + 1;

    const relMap = new Map<string, number>();
    rels.forEach(r => relMap.set(r.label, (relMap.get(r.label) || 0) + 1));
    const relItems = [...relMap.entries()].sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, color: "#7A67D6" }));

    const typeMap = new Map<string, number>();
    rels.forEach(r => typeMap.set(r.other.type, (typeMap.get(r.other.type) || 0) + 1));
    const typeItems = [...typeMap.entries()].sort((a, b) => b[1] - a[1])
      .map(([t, value]) => ({ label: t, value, color: color(t) }));

    /* ego density: how many of the neighbours are linked to one another */
    const nb = new Set(rels.map(r => r.other.id));
    const inner = edges.filter(e => nb.has(e.source) && nb.has(e.target)).length;

    /* component size via breadth-first walk */
    const adj = new Map<string, string[]>();
    edges.forEach(e => {
      adj.set(e.source, [...(adj.get(e.source) || []), e.target]);
      adj.set(e.target, [...(adj.get(e.target) || []), e.source]);
    });
    const seen = new Set([node.id]);
    const queue = [node.id];
    while (queue.length) {
      const cur = queue.shift()!;
      (adj.get(cur) || []).forEach(next => { if (!seen.has(next)) { seen.add(next); queue.push(next); } });
    }

    return {
      deg, outCount, inCount: deg - outCount, rank, total: nodes.length,
      centrality: nodes.length > 1 ? deg / (nodes.length - 1) : 0,
      rels, relItems, typeItems, inner, degree,
      component: seen.size,
    };
  }, [node, nodes, edges]);

  if (!node || !stats) return null;
  const t = node.type as NodeType;

  return <div className="na-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Full analysis of ${node.title}`}>
    <div className="na-sheet" onClick={e => e.stopPropagation()}>
      <header className="na-head">
        <div>
          <span className="na-type" style={{ color: "#3B423F" }}><i style={{ background: color(t) }} />{pretty(t)}</span>
          <h2>{node.title}</h2>
          <p>{stats.deg ? `${stats.deg} connection${stats.deg === 1 ? "" : "s"} across ${new Set(stats.rels.map(r => r.other.type)).size} node types · in a cluster of ${stats.component}` : "No connections yet — this node stands alone in the graph."}</p>
        </div>
        <button className="na-x" onClick={onClose} aria-label="Close analysis">✕</button>
      </header>

      <div className="na-kpis">
        <div><span>Connections</span><b>{stats.deg}</b><em>{stats.inCount} in · {stats.outCount} out</em></div>
        <div><span>Centrality</span><b>{(stats.centrality * 100).toFixed(0)}<small>%</small></b><em>of possible links</em></div>
        <div><span>Degree rank</span><b>#{stats.rank}</b><em>of {stats.total} nodes</em></div>
        <div><span>Cluster</span><b>{stats.component}</b><em>{stats.component === 1 ? "node" : "nodes"} reachable</em></div>
      </div>

      <div className="na-grid">
        <section className="na-panel">
          <h3>Ego network</h3>
          <Ego node={node} rels={stats.rels} inner={stats.inner} />
        </section>

        <section className="na-panel">
          <h3>Relations used <span>{stats.relItems.length}</span></h3>
          {stats.relItems.length ? <Bars items={stats.relItems} /> : <p className="na-none">No relations to analyse.</p>}
          <h3 className="na-h3-gap">Neighbour types <span>{stats.typeItems.length}</span></h3>
          {stats.typeItems.length ? <Bars items={stats.typeItems} /> : <p className="na-none">Nothing linked yet.</p>}
        </section>
      </div>

      <section className="na-panel na-panel-wide">
        <h3>Connections <span>{stats.rels.length}</span></h3>
        {stats.rels.length ? <table className="na-tbl">
          <thead><tr><th>Node</th><th>Relation</th><th>Direction</th><th>Degree</th></tr></thead>
          <tbody>{stats.rels.map(r => (
            <tr key={r.edge.id}>
              <td><i style={{ background: color(r.other.type) }} />{r.other.title}</td>
              <td className="na-rel">{r.label}</td>
              <td className="na-dir">{r.out ? "→ out" : "← in"}</td>
              <td className="na-num">{stats.degree.get(r.other.id) || 0}</td>
            </tr>
          ))}</tbody>
        </table> : <p className="na-none">Drag from this node's side dot to start connecting it.</p>}
      </section>

      <footer className="na-foot">
        <span>Created {date(node.createdAt)} · updated {date(node.updatedAt)}{node.tags.length ? ` · ${node.tags.map(x => "#" + x).join(" ")}` : ""}</span>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
      </footer>
    </div>
  </div>;
}

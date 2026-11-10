import { useState } from "react";

type Kind = "paper" | "dataset" | "repo" | "exp" | "result" | "fix" | "gap";

interface GNode {
  id: string;
  label: string;
  kind: Kind;
  x: number;
  y: number;
}

interface GEdge {
  from: string;
  to: string;
  rel: string;
  conf: string;
  proposed?: boolean;
}

const NODES: GNode[] = [
  { id: "paper", label: "CNN paper", kind: "paper", x: 128, y: 70 },
  { id: "dataset", label: "PlantVillage", kind: "dataset", x: 120, y: 206 },
  { id: "repo", label: "leaf-cnn repo", kind: "repo", x: 116, y: 348 },
  { id: "exp", label: "Exp A · MobileNetV2", kind: "exp", x: 340, y: 236 },
  { id: "result", label: "91.4% val acc", kind: "result", x: 534, y: 130 },
  { id: "gap", label: "Field accuracy?", kind: "gap", x: 528, y: 344 },
  { id: "fix", label: "pillow 9.5.0", kind: "fix", x: 312, y: 408 },
];

const EDGES: GEdge[] = [
  { from: "paper", to: "dataset", rel: "evaluates on", conf: "0.92" },
  { from: "paper", to: "exp", rel: "methodology", conf: "0.90" },
  { from: "dataset", to: "exp", rel: "trains on", conf: "0.95" },
  { from: "repo", to: "exp", rel: "executes", conf: "0.93" },
  { from: "exp", to: "result", rel: "produces", conf: "0.95" },
  { from: "exp", to: "fix", rel: "raised", conf: "0.90" },
  { from: "fix", to: "repo", rel: "resolves", conf: "0.97" },
  { from: "exp", to: "gap", rel: "still open", conf: "0.88", proposed: true },
];

const DOT: Record<Kind, string> = {
  paper: "#F3F5F3",
  dataset: "#A79BF0",
  repo: "#9FC0FF",
  exp: "#D8F85E",
  result: "#CBF37F",
  fix: "#7FE3C4",
  gap: "#BCB2FF",
};

const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
const PILL_H = 30;

function pillWidth(label: string) {
  return label.length * 6.5 + 28;
}

interface Geometry {
  edge: GEdge;
  key: string;
  d: string;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  bx: number;
  by: number;
}

const GEO: Geometry[] = EDGES.map((e) => {
  const a = NODE_BY_ID.get(e.from) as GNode;
  const b = NODE_BY_ID.get(e.to) as GNode;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = (a.x + b.x) / 2 - dy * 0.13;
  const cy = (a.y + b.y) / 2 + dx * 0.13;
  return {
    edge: e,
    key: `${e.from}-${e.to}`,
    d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
    ax: a.x,
    ay: a.y,
    cx,
    cy,
    bx: b.x,
    by: b.y,
  };
});

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box, pad = 3) {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

function pointAt(g: Geometry, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * g.ax + 2 * mt * t * g.cx + t * t * g.bx,
    y: mt * mt * g.ay + 2 * mt * t * g.cy + t * t * g.by,
  };
}

const NODE_BOXES: Box[] = NODES.map((n) => {
  const w = pillWidth(n.label);
  return { x: n.x - w / 2, y: n.y - PILL_H / 2, w, h: PILL_H };
});

const T_VALUES = [0.5, 0.62, 0.38, 0.71, 0.29, 0.8, 0.2];

export default function ConnectionGraph() {
  const [active, setActive] = useState<string | null>("exp");

  const related = (e: GEdge) => active !== null && (e.from === active || e.to === active);

  const connectedIds = new Set<string>();
  if (active) {
    connectedIds.add(active);
    for (const e of EDGES) {
      if (e.from === active) connectedIds.add(e.to);
      if (e.to === active) connectedIds.add(e.from);
    }
  }

  // place relation labels so they never sit on a node or another label
  const placed: Box[] = [];
  const labels = GEO.filter((g) => related(g.edge)).flatMap((g) => {
    const text = `${g.edge.rel} ${g.edge.conf}`;
    const w = text.length * 5.5 + 12;
    const h = 17;
    for (const t of T_VALUES) {
      const p = pointAt(g, t);
      const box: Box = { x: p.x - w / 2, y: p.y - h / 2, w, h };
      if (NODE_BOXES.some((nb) => overlaps(box, nb))) continue;
      if (placed.some((pb) => overlaps(box, pb))) continue;
      placed.push(box);
      return [{ key: g.key, x: p.x, y: p.y, w, h, text }];
    }
    return [];
  });

  const activeNode = active ? NODE_BY_ID.get(active) : undefined;
  const activeCount = active ? EDGES.filter(related).length : 0;

  return (
    <div className="cg">
      <svg
        className="cg-svg"
        viewBox="0 0 640 470"
        role="group"
        aria-label="Knowledge graph: papers, datasets, code and experiments connected by typed relations"
      >
        <g className="cg-edges">
          {GEO.map((g) => {
            const on = related(g.edge);
            const dim = active !== null && !on;
            return (
              <path
                key={g.key}
                d={g.d}
                className={`cg-edge${g.edge.proposed ? " proposed" : ""}${on ? " on" : ""}`}
                style={{ opacity: dim ? 0.15 : 1 }}
              />
            );
          })}
        </g>

        {labels.length > 0 && (
          <g className="cg-labels">
            {labels.map((l) => (
              <g key={l.key} className="cg-label" pointerEvents="none">
                <rect x={l.x - l.w / 2} y={l.y - l.h / 2} width={l.w} height={l.h} rx={l.h / 2} />
                <text x={l.x} y={l.y + 3.2} textAnchor="middle">
                  {l.text}
                </text>
              </g>
            ))}
          </g>
        )}

        <g className="cg-nodes">
          {NODES.map((n) => {
            const w = pillWidth(n.label);
            const isActive = active === n.id;
            const isConnected = connectedIds.has(n.id);
            return (
              <g
                key={n.id}
                className={`cg-node${isActive ? " active" : ""}${isConnected ? " connected" : ""}`}
                transform={`translate(${n.x - w / 2}, ${n.y - PILL_H / 2})`}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                aria-label={`${n.label}, ${EDGES.filter((e) => e.from === n.id || e.to === n.id).length} connections`}
                onMouseEnter={() => setActive(n.id)}
                onFocus={() => setActive(n.id)}
                onClick={() => setActive(n.id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setActive(n.id);
                  }
                  if (ev.key === "Escape") setActive(null);
                }}
              >
                <rect className="cg-pill" width={w} height={PILL_H} rx={10} />
                <circle className="cg-dot" cx={15} cy={PILL_H / 2} r={3.4} fill={DOT[n.kind]} />
                <text className="cg-text" x={26} y={PILL_H / 2 + 4}>
                  {n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="cg-foot">
        <span className="cg-state">
          {activeNode ? (
            <>
              <b>{activeNode.label}</b>
              {` · ${activeCount} relations`}
            </>
          ) : (
            "select a node"
          )}
        </span>
        <span className="cg-stats">
          {NODES.length} nodes · {EDGES.length} edges
          <i className="cg-metric">91.4% val acc</i>
        </span>
      </div>
    </div>
  );
}

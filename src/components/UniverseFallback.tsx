import type { CSSProperties } from "react";

const NODES = [
  { x: -26, y: -14, c: "#9C8BE5", s: 7 },
  { x: 26, y: -22, c: "#D8F85E", s: 9 },
  { x: 34, y: 9, c: "#F3703F", s: 6 },
  { x: -34, y: 16, c: "#EDEBE6", s: 5 },
  { x: 12, y: 29, c: "#D8F85E", s: 5 },
  { x: -14, y: 31, c: "#9C8BE5", s: 4 },
  { x: 40, y: -9, c: "#EDEBE6", s: 4 },
  { x: -42, y: -10, c: "#F3703F", s: 4 },
  { x: 20, y: 20, c: "#D8F85E", s: 3 },
  { x: -25, y: 4, c: "#9C8BE5", s: 3 },
];

export default function UniverseFallback() {
  return (
    <div className="lp-u-fallback" aria-hidden="true">
      <div className="lp-u-fallback-glow" />
      <div className="lp-u-fallback-rings">
        <i />
        <i />
        <i />
      </div>
      <div className="lp-u-fallback-core">
        <i />
        <i />
      </div>
      {NODES.map((n, i) => (
        <span
          className="lp-u-fallback-node"
          key={i}
          style={{ "--x": `${n.x}%`, "--y": `${n.y}%`, "--c": n.c, "--s": `${n.s}px`, "--delay": `${i * -0.7}s` } as CSSProperties}
        />
      ))}
      <span className="lp-u-fallback-grid" />
    </div>
  );
}

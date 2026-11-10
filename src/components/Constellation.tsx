import { useEffect, useRef } from "react";

type Vec3 = [number, number, number];
type NodeKind =
  | "paper"
  | "dataset"
  | "repo"
  | "exp"
  | "result"
  | "error"
  | "fix"
  | "gap"
  | "note"
  | "claim";

interface SceneNode {
  label: string;
  kind: NodeKind;
  p: Vec3;
  focal?: boolean;
}

const COLORS: Record<NodeKind, string> = {
  paper: "#F3F5F3",
  dataset: "#A79BF0",
  repo: "#9FC0FF",
  exp: "#D8F85E",
  result: "#CBF37F",
  error: "#FF9A86",
  fix: "#7FE3C4",
  gap: "#BCB2FF",
  note: "#C6CDCD",
  claim: "#F6F8F4",
};

const NODES: SceneNode[] = [
  { label: "lightweight-cnn.pdf", kind: "paper", p: [-1.22, -0.6, 0.3] },
  { label: "PlantVillage subset", kind: "dataset", p: [-0.66, 0.66, -0.4] },
  { label: "leaf-cnn repo", kind: "repo", p: [0.02, -1.02, -0.58] },
  { label: "Exp A · MobileNetV2", kind: "exp", p: [0.1, 0.04, 0.86], focal: true },
  { label: "91.4% val acc", kind: "result", p: [1.06, 0.18, 0.14] },
  { label: "pillow 9.5.0 pin", kind: "fix", p: [0.66, -0.82, -0.2] },
  { label: "CUDA unavailable", kind: "error", p: [-0.2, -0.44, -0.98] },
  { label: "Field accuracy?", kind: "gap", p: [0.96, 0.9, -0.44] },
  { label: "Augmentation recipe", kind: "note", p: [-1.02, 0.22, -0.9] },
  { label: "Conclusion", kind: "claim", p: [0.46, 1.16, 0.4] },
  { label: "Baseline 90.2%", kind: "result", p: [-0.5, -1.2, 0.1] },
  { label: "Benchmark run", kind: "result", p: [1.42, -0.36, -0.42] },
  { label: "Review note", kind: "note", p: [-1.52, -0.98, -0.18] },
  { label: "Figure 2 crop", kind: "note", p: [-0.06, 1.5, -0.52] },
  { label: "Method section", kind: "paper", p: [1.3, 1.42, 0.18] },
  { label: "Repro check", kind: "fix", p: [-1.34, 1.0, -1.0] },
  { label: "Equation 3", kind: "claim", p: [-1.2, 0.06, 1.1] },
];

const EDGES: Array<[number, number, "ok" | "open" | "weak"]> = [
  [0, 1, "ok"],
  [0, 3, "ok"],
  [1, 3, "ok"],
  [3, 4, "ok"],
  [3, 5, "ok"],
  [3, 7, "open"],
  [3, 8, "ok"],
  [2, 3, "ok"],
  [3, 6, "ok"],
  [6, 10, "ok"],
  [4, 9, "ok"],
  [1, 8, "ok"],
  [5, 2, "open"],
  [0, 8, "ok"],
  [11, 4, "ok"],
  [12, 0, "weak"],
  [13, 1, "weak"],
  [14, 7, "weak"],
  [15, 8, "weak"],
  [12, 11, "weak"],
  [16, 0, "ok"],
  [16, 3, "weak"],
  [11, 5, "weak"],
];

interface Projected {
  x: number;
  y: number;
  z: number;
  s: number;
}

function project(p: Vec3, rx: number, ry: number, cx: number, cy: number, k: number): Projected {
  const [x, y, z] = p;
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  const camZ = 3.6;
  const persp = camZ / (camZ - z2);
  return { x: cx + x1 * persp * k, y: cy + y1 * persp * k, z: z2, s: persp };
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function hits(a: Box, b: Box) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

export default function Constellation({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let running = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let t = 0;

    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const wide = w >= 900;
      const small = w < 640;
      const cx = w * (wide ? 0.76 : 0.5);
      const cy = h * (wide ? 0.46 : small ? 0.215 : 0.28);
      const k = wide
        ? Math.min(w * 0.26, h * 0.31)
        : Math.min(w * 0.5, h * (small ? 0.215 : 0.2));

      const rx = 0.36 + pointer.y * 0.24;
      const ry = t * 0.15 + pointer.x * 0.55;

      ctx.clearRect(0, 0, w, h);

      // --- atmosphere -------------------------------------------------
      const auroraA = ctx.createRadialGradient(
        cx + Math.sin(t * 0.22) * w * 0.16,
        cy + Math.cos(t * 0.17) * h * 0.12,
        0,
        cx,
        cy,
        Math.max(w, h) * 0.62,
      );
      auroraA.addColorStop(0, "rgba(216,248,94,0.14)");
      auroraA.addColorStop(0.45, "rgba(120,150,60,0.06)");
      auroraA.addColorStop(1, "rgba(11,14,14,0)");
      ctx.fillStyle = auroraA;
      ctx.fillRect(0, 0, w, h);

      const auroraB = ctx.createRadialGradient(
        cx - w * 0.24,
        cy + h * 0.28,
        0,
        cx - w * 0.2,
        cy + h * 0.24,
        Math.max(w, h) * 0.45,
      );
      auroraB.addColorStop(0, "rgba(156,139,229,0.14)");
      auroraB.addColorStop(1, "rgba(156,139,229,0)");
      ctx.fillStyle = auroraB;
      ctx.fillRect(0, 0, w, h);

      // --- orbit / wireframe rings ------------------------------------
      const ring = (radius: number, tilt: number, spin: number, alpha: number, width: number) => {
        ctx.beginPath();
        for (let i = 0; i <= 84; i++) {
          const a = (i / 84) * Math.PI * 2 + spin;
          const p: Vec3 = [
            Math.cos(a) * radius,
            Math.sin(a) * radius * Math.sin(tilt),
            Math.sin(a) * radius * Math.cos(tilt),
          ];
          const q = project(p, rx, ry, cx, cy, k);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = `rgba(216,248,94,${alpha})`;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      ring(1.55, 0.85, 0, 0.11, 0.8);
      ring(1.9, 1.3, 1.1, 0.055, 0.7);
      ring(2.15, 0.42, 2.4, 0.04, 0.6);

      const pts = NODES.map((n) => project(n.p, rx, ry, cx, cy, k));

      // focal light: the experiment node reads as the light source of the scene
      const focalPt = pts[3];
      const sunReach = Math.max(w, h) * 0.34;
      const sun = ctx.createRadialGradient(
        focalPt.x,
        focalPt.y,
        0,
        focalPt.x,
        focalPt.y,
        sunReach,
      );
      sun.addColorStop(0, "rgba(216,248,94,0.15)");
      sun.addColorStop(0.35, "rgba(198,236,88,0.05)");
      sun.addColorStop(1, "rgba(216,248,94,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);

      // --- edges ------------------------------------------------------
      const edgeOrder = EDGES.map((e) => ({
        e,
        d: (pts[e[0]].z + pts[e[1]].z) / 2,
      })).sort((a, b) => a.d - b.d);

      for (const { e } of edgeOrder) {
        const a = pts[e[0]];
        const b = pts[e[1]];
        const depth = Math.min(1, Math.max(0, (a.z + b.z + 2.4) / 4.8));
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const qx = mx - dy * 0.1;
        const qy = my + dx * 0.1;

        const kind = e[2];
        const passes = kind === "weak" ? 1 : 2;
        for (let pass = 0; pass < passes; pass++) {
          const bloom = pass === 0 && passes === 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(qx, qy, b.x, b.y);
          if (kind === "open") {
            ctx.setLineDash([4, 7]);
            ctx.lineDashOffset = -t * 16;
            ctx.strokeStyle = bloom
              ? `rgba(156,139,229,${(0.02 + depth * 0.05).toFixed(3)})`
              : `rgba(184,170,248,${(0.1 + depth * 0.42).toFixed(3)})`;
          } else if (kind === "weak") {
            ctx.setLineDash([]);
            ctx.strokeStyle = `rgba(198,212,206,${(0.03 + depth * 0.15).toFixed(3)})`;
          } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = bloom
              ? `rgba(216,248,94,${(0.015 + depth * 0.045).toFixed(3)})`
              : `rgba(212,246,112,${(0.08 + depth * 0.44).toFixed(3)})`;
          }
          ctx.lineWidth = bloom ? 3 + depth * 4 : 0.55 + depth * 0.65;
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // --- packets travelling along relations --------------------------
      ctx.globalCompositeOperation = "lighter";
      for (const { e } of edgeOrder) {
        const a = pts[e[0]];
        const b = pts[e[1]];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const qx = mx - (b.y - a.y) * 0.1;
        const qy = my + (b.x - a.x) * 0.1;
        const phase = (t * 0.18 + (e[0] * 0.13 + e[1] * 0.29)) % 1;
        const mt = 1 - phase;
        const px = mt * mt * a.x + 2 * mt * phase * qx + phase * phase * b.x;
        const py = mt * mt * a.y + 2 * mt * phase * qy + phase * phase * b.y;
        const depth = Math.min(1, Math.max(0, (a.z + b.z + 2.4) / 4.8));
        const tint = e[2] === "open" ? "184,170,248" : e[2] === "weak" ? "210,224,216" : "224,252,140";
        const g = ctx.createRadialGradient(px, py, 0, px, py, 7 + depth * 4);
        g.addColorStop(0, `rgba(${tint},${(0.55 + depth * 0.4).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(${tint},0.18)`);
        g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, 7 + depth * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // --- dust -------------------------------------------------------
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 60; i++) {
        const a = i * 2.399 + 0.7;
        const r = 1.95 + ((i * 37) % 100) / 44;
        const p: Vec3 = [
          Math.cos(a) * r,
          Math.sin(a * 1.7) * r * 0.85,
          Math.sin(a) * r,
        ];
        const q = project(p, rx * 1.1 + 0.2, ry * 0.6, cx, cy, k);
        const alpha = Math.max(0, 0.05 + (q.z + 2) * 0.05);
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(0.4, q.s * 0.85), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // --- dots -------------------------------------------------------
      const nodeOrder = pts.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z);

      for (const { p, i } of nodeOrder) {
        const node = NODES[i];
        const depth = Math.min(1, Math.max(0, (p.z + 1.5) / 3));
        const color = COLORS[node.kind];
        const rad = (node.focal ? 5.2 : 2.8) * (0.72 + depth * 0.95);
        const blur = (1 - depth) * 1.6;

        const reach = rad * (node.focal ? 14 : 6);
        ctx.globalCompositeOperation = "lighter";
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, reach);
        halo.addColorStop(0, hexA(color, node.focal ? 0.5 : 0.34));
        halo.addColorStop(0.3, hexA(color, 0.12));
        halo.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, reach, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";

        ctx.save();
        if (blur > 0.35) ctx.filter = `blur(${blur.toFixed(2)}px)`;
        ctx.globalAlpha = 0.42 + depth * 0.58;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        // hot core so near nodes read as light sources, not flat discs
        if (depth > 0.45) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${(0.35 + depth * 0.5).toFixed(3)})`;
          ctx.fill();
        }
        ctx.restore();

        if (node.focal) {
          const pulse = 0.5 + Math.sin(t * 2.1) * 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad + 7 + pulse * 6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(216,248,94,${0.18 + pulse * 0.26})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // --- labels (near to far, collision-checked) ---------------------
      const placed: Box[] = [];
      const budget = small ? 1 : wide ? 8 : 5;
      let drawn = 0;

      const labelOrder = [...nodeOrder].sort((a, b) => {
        if (NODES[a.i].focal) return -1;
        if (NODES[b.i].focal) return 1;
        return b.p.z - a.p.z;
      });

      for (const { p, i } of labelOrder) {
        if (drawn >= budget) break;
        const node = NODES[i];
        const depth = Math.min(1, Math.max(0, (p.z + 1.5) / 3));
        if (!node.focal && depth < 0.3) continue;

        const label = node.focal ? node.label.toUpperCase() : node.label;
        ctx.font = `${node.focal ? "700" : "600"} ${node.focal ? 10 : 9.5}px ${MONO}`;
        const spacing = node.focal ? "0.1em" : "0.02em";
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = spacing;
        const tw = ctx.measureText(label).width;

        const padX = node.focal ? 8 : 0;
        const boxW = tw + padX * 2;
        const rad = (node.focal ? 4.4 : 2.3) * (0.72 + depth * 0.95);

        let lx = p.x + rad + 10;
        if (lx + boxW > w - 12) lx = p.x - rad - 10 - boxW;
        if (lx < 8) continue;

        const ly = p.y + 3.3;
        const box: Box = {
          x1: lx - padX - 2,
          y1: ly - 11,
          x2: lx + tw + padX + 2,
          y2: ly + 5,
        };
        // focal label outranks everything; others skip overlaps
        if (!node.focal && placed.some((b) => hits(b, box))) continue;
        placed.push(box);

        if (node.focal) {
          ctx.fillStyle = "rgba(8,11,11,0.78)";
          roundRect(ctx, lx - padX, ly - 10.5, boxW, 16.5, 8);
          ctx.fill();
          ctx.strokeStyle = "rgba(216,248,94,0.28)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = "rgba(214,246,104,0.96)";
        } else {
          ctx.fillStyle = `rgba(236,242,238,${(0.24 + depth * 0.5).toFixed(3)})`;
        }
        ctx.fillText(label, lx, ly);
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0em";
        drawn += 1;
      }
    };

    const frame = () => {
      if (!running) return;
      t += 0.016;
      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;
      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onPointer = (e: PointerEvent) => {
      pointer.tx = e.clientX / window.innerWidth - 0.5;
      pointer.ty = e.clientY / window.innerHeight - 0.5;
    };

    const onScroll = () => {
      const p = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
      canvas.style.opacity = String(Math.max(0, 1 - p * 0.9));
      canvas.style.transform = `translate3d(0,${(p * -70).toFixed(1)}px,0) scale(${(1 + p * 0.08).toFixed(3)})`;
    };

    const ro = new ResizeObserver(() => {
      setSize();
      draw();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    setSize();
    draw();
    start();

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

function hexA(hex: string, alpha: number) {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const LIME = "#D8F85E";
const VIOLET = "#9C8BE5";
const ORANGE = "#F3703F";
const PAPER = "#EDEBE6";

const STEPS = [
  {
    title: "A single thread",
    body: "One paper, one question, one loose result. Every workspace starts as a point of curiosity.",
  },
  {
    title: "Connections appear",
    body: "Datasets, runs, errors and fixes pull toward it. Typed edges turn a pile of files into a structure you can read.",
  },
  {
    title: "See the whole mind",
    body: "Scroll back and the shape is still there — evidence, decisions and the path between them, in one universe.",
  },
];

type V3 = { x: number; y: number; z: number };
type Node = { pos: V3; color: string; size: number; label?: string };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeUniverse(count: number) {
  const rand = prng(19);
  const nodes: Node[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const palette = [LIME, VIOLET, ORANGE, PAPER];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const shell = 2.35 + (rand() - 0.5) * 0.7;
    nodes.push({
      pos: {
        x: Math.cos(theta) * radius * shell,
        y: y * shell * 0.92,
        z: Math.sin(theta) * radius * shell,
      },
      color: i % 9 === 0 ? ORANGE : palette[i % palette.length],
      size: 0.055 + rand() * 0.055,
    });
  }
  ["Paper", "Dataset", "Result", "Fix"].forEach((label, i) => {
    const n = nodes[(i * 7 + 3) % nodes.length];
    if (n && !n.label) n.label = label;
  });

  const keys = new Set<string>();
  const edges: [number, number][] = [];
  const add = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (keys.has(key)) return;
    keys.add(key);
    edges.push([a, b]);
  };
  nodes.forEach((n, i) => {
    nodes
      .map((m, j) => ({ j, d: (n.pos.x - m.pos.x) ** 2 + (n.pos.y - m.pos.y) ** 2 + (n.pos.z - m.pos.z) ** 2 }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach(({ j }) => add(i, j));
  });
  for (let i = 0; i < nodes.length; i += 5) add(i, (i + 7) % nodes.length);

  return { nodes, edges };
}

function makeDust(count: number) {
  const rand = prng(71);
  const out: V3[] = [];
  for (let i = 0; i < count; i++) {
    const r = 3.2 + rand() * 4.8;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 2 - 1);
    out.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.cos(phi) * 0.8,
      z: r * Math.sin(phi) * Math.sin(theta),
    });
  }
  return out;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const CORE = (() => {
  const raw: [number, number, number][] = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ];
  const verts = raw.map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const a = verts[i], b = verts[j];
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1.2) edges.push([i, j]);
    }
  }
  return { verts, edges };
})();

const RING = Array.from({ length: 96 }, (_, i) => {
  const a = (i / 96) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a), z: 0 };
});

function rotate(v: V3, ry: number, rx: number, rz: number) {
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = v.x * cy - v.z * sy;
  const z1 = v.x * sy + v.z * cy;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y1 = v.y * cx - z1 * sx;
  const z2 = v.y * sx + z1 * cx;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return { x: x1 * cz - y1 * sz, y: x1 * sz + y1 * cz, z: z2 };
}

function makeGlow(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, color);
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.55, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  return c;
}

export default function ScrollUniverse() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(0);
  const [compact, setCompact] = useState(false);
  const [reduced, setReduced] = useState(false);

  const data = useMemo(() => makeUniverse(compact ? 17 : 27), [compact]);
  const dust = useMemo(() => makeDust(compact ? 300 : 680), [compact]);
  const glows = useMemo(() => {
    const map: Record<string, HTMLCanvasElement> = {};
    [LIME, VIOLET, ORANGE, PAPER].forEach((c) => (map[c] = makeGlow(c)));
    return map;
  }, []);

  useEffect(() => {
    const mqCompact = window.matchMedia("(max-width: 760px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setCompact(mqCompact.matches);
      setReduced(mqMotion.matches);
    };
    sync();
    mqCompact.addEventListener("change", sync);
    mqMotion.addEventListener("change", sync);
    return () => {
      mqCompact.removeEventListener("change", sync);
      mqMotion.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight);
      const p = clamp01(-rect.top / total);
      progress.current = p;
      el.style.setProperty("--u-progress", p.toFixed(4));
      const next = p < 0.34 ? 0 : p < 0.7 ? 1 : 2;
      setActive((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let visible = false;
    let stopped = false;
    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = c.clientWidth;
      H = c.clientHeight;
      c.width = Math.max(1, Math.round(W * dpr));
      c.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const t = now / 1000;
      const p = reduced ? 0.58 : smooth(clamp01(progress.current));
      const webScale = mix(0.12, 1.12, p);
      const ry = mix(-0.28, 1.85, p) + (reduced ? 0 : t * 0.04) + pointer.current.x * 0.3;
      const rx = mix(-0.16, 0.2, p) + pointer.current.y * 0.18;
      const rz = mix(0.04, -0.12, p);
      const camZ = mix(7.6, 5.8, p);
      const focal = Math.min(W * 1.22, H * 1.42);
      const cx = W * (compact ? 0.54 : 0.64);
      const cy = H * (compact ? 0.66 : 0.5);

      const project = (v: V3, scale = 1, rot = { ry, rx, rz }) => {
        const r = rotate({ x: v.x * scale, y: v.y * scale, z: v.z * scale }, rot.ry, rot.rx, rot.rz);
        const depth = r.z + camZ;
        const f = focal / Math.max(0.5, depth);
        return { x: cx + r.x * f, y: cy + r.y * f, z: depth, f };
      };

      ctx.clearRect(0, 0, W, H);

      // ambient halo
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.5);
      bg.addColorStop(0, "rgba(216,248,94,.075)");
      bg.addColorStop(0.55, "rgba(156,139,229,.035)");
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // dust
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const dustRot = { ry: t * (reduced ? 0 : 0.012), rx: Math.sin(t * 0.08) * 0.08, rz: 0 };
      dust.forEach((v, i) => {
        const s = project(v, 1, dustRot);
        if (s.z <= 0.5) return;
        const a = clamp01((1 - s.z / 12)) * (reduced ? 0.3 : 0.38);
        ctx.globalAlpha = a * (i % 7 === 0 ? 1.4 : 0.75);
        const r = Math.max(0.5, Math.min(2.2, 14 / s.z));
        ctx.drawImage(glows[PAPER], s.x - r * 2, s.y - r * 2, r * 4, r * 4);
      });
      ctx.restore();

      // orbit rings
      const ringGroups = [
        { radius: 1.65, color: LIME, tilt: [0.9 + p * 0.4, 0.2, 0.2 + t * (reduced ? 0 : 0.05)] },
        { radius: 2.05, color: VIOLET, tilt: [0.6 + p * 0.5, 1.2, 0.3 - t * (reduced ? 0 : 0.035)] },
      ];
      ringGroups.forEach((ring) => {
        const rot = { ry: ring.tilt[2], rx: ring.tilt[0], rz: ring.tilt[1] };
        ctx.beginPath();
        RING.forEach((v, i) => {
          const s = project({ x: v.x * ring.radius, y: v.y * ring.radius, z: v.z }, 1, rot);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // core
      const coreScale = mix(0.9, 1.06, p);
      const coreRot = { ry: (reduced ? 0 : t * 0.14) + p * 0.7, rx: Math.sin(t * 0.35) * 0.06, rz: 0 };
      const coreCenter = project({ x: 0, y: 0, z: 0 });
      const coreR = 0.5 * coreCenter.f * coreScale;
      const glow = ctx.createRadialGradient(coreCenter.x, coreCenter.y, coreR * 0.2, coreCenter.x, coreCenter.y, coreR * 2.6);
      glow.addColorStop(0, "rgba(216,248,94,.11)");
      glow.addColorStop(0.45, "rgba(216,248,94,.045)");
      glow.addColorStop(1, "rgba(216,248,94,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(coreCenter.x, coreCenter.y, coreR * 2.6, 0, Math.PI * 2);
      ctx.fill();

      const sphere = ctx.createRadialGradient(
        coreCenter.x - coreR * 0.34,
        coreCenter.y - coreR * 0.36,
        coreR * 0.05,
        coreCenter.x,
        coreCenter.y,
        coreR,
      );
      sphere.addColorStop(0, "#F2FFB4");
      sphere.addColorStop(0.2, "#D8F85E");
      sphere.addColorStop(0.58, "#4C5A1D");
      sphere.addColorStop(1, "#0B100E");
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(coreCenter.x, coreCenter.y, coreR, 0, Math.PI * 2);
      ctx.fill();

      // core wireframe
      const coreVerts = CORE.verts.map((v) => project({ x: v.x * 0.62 * coreScale, y: v.y * 0.62 * coreScale, z: v.z * 0.62 * coreScale }, 1, coreRot));
      ctx.strokeStyle = LIME;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      CORE.edges.forEach(([a, b]) => {
        ctx.moveTo(coreVerts[a].x, coreVerts[a].y);
        ctx.lineTo(coreVerts[b].x, coreVerts[b].y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      // edges
      const edgeAlpha = mix(0.12, 0.45, p);
      const projected = data.nodes.map((n) => project(n.pos, webScale));
      const orderedEdges = data.edges
        .map(([a, b]) => ({ a, b, z: (projected[a].z + projected[b].z) / 2 }))
        .sort((x, y) => y.z - x.z);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      orderedEdges.forEach(({ a, b }) => {
        const A = projected[a], B = projected[b];
        const alpha = edgeAlpha * clamp01(1.4 - (A.z + B.z) / 18);
        ctx.strokeStyle = `rgba(216,248,94,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(216,248,94,${alpha * 0.18})`;
        ctx.lineWidth = 3.2;
        ctx.stroke();
      });
      ctx.restore();

      // nodes
      const orderedNodes = data.nodes
        .map((n, i) => ({ n, i, z: projected[i].z }))
        .sort((a, b) => b.z - a.z);
      orderedNodes.forEach(({ n, i }) => {
        const s = projected[i];
        if (s.z <= 0.5) return;
        const r = Math.max(1.1, n.size * s.f * 0.98);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.22;
        const g = glows[n.color] || glows[PAPER];
        ctx.drawImage(g, s.x - r * 3, s.y - r * 3, r * 6, r * 6);
        ctx.restore();

        const grad = ctx.createRadialGradient(s.x - r * 0.34, s.y - r * 0.36, r * 0.08, s.x, s.y, r);
        grad.addColorStop(0, "rgba(255,255,255,.7)");
        grad.addColorStop(0.36, n.color);
        grad.addColorStop(1, "rgba(8,11,11,.92)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      });

      // labels — only in the safe copy-free zone, never overlapping each other
      const reveal = clamp01((p - 0.28) / 0.3);
      if (reveal > 0.02) {
        const placed: { x: number; y: number; w: number; h: number }[] = [];
        ctx.font = "700 11px Manrope, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        data.nodes.forEach((n, i) => {
          if (!n.label) return;
          const base = projected[i];
          if (base.z <= 0.5) return;
          const dir = Math.hypot(n.pos.x, n.pos.y, n.pos.z) || 1;
          const s = project({ x: n.pos.x + (n.pos.x / dir) * 0.6, y: n.pos.y + (n.pos.y / dir) * 0.6 + 0.2, z: n.pos.z + (n.pos.z / dir) * 0.6 }, webScale);
          const safeX = compact ? W * 0.06 : W * 0.43;
          const minY = compact ? H * 0.66 : H * 0.12;
          const safe = s.x > safeX && s.y > minY && s.y < H * 0.9;
          if (!safe) return;
          const tw = ctx.measureText(n.label.toUpperCase()).width + 18;
          const rect = { x: s.x - tw / 2, y: s.y - 11, w: tw, h: 22 };
          if (placed.some((r) => rect.x < r.x + r.w + 4 && rect.x + rect.w + 4 > r.x && rect.y < r.y + r.h + 4 && rect.y + rect.h + 4 > r.y)) return;
          placed.push(rect);
          ctx.globalAlpha = reveal * 0.8;
          ctx.beginPath();
          ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 11);
          ctx.fillStyle = "rgba(8,11,11,.86)";
          ctx.fill();
          ctx.strokeStyle = n.color;
          ctx.globalAlpha = reveal * 0.45;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = reveal * 0.86;
          ctx.fillStyle = "#EAF1DD";
          ctx.fillText(n.label.toUpperCase(), s.x, s.y + 0.5);
          ctx.globalAlpha = 1;
        });
      }
    };

    const loop = (now: number) => {
      draw(now);
      raf = !stopped && visible && !reduced ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (reduced || raf) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };

    resize();
    draw(performance.now());
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) start();
      else stop();
    }, { rootMargin: "20% 0px" });
    io.observe(c);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      stop();
      io.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [data, dust, glows, compact, reduced]);

  const onPointer = (e: ReactPointerEvent) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.current.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  return (
    <section className="lp-universe" id="universe" ref={section} onPointerMove={onPointer}>
      <div className="lp-universe-sticky">
        <div className="lp-universe-stage" aria-hidden="true">
          <canvas ref={canvas} className="lp-u-canvas" />
        </div>
        <div className="lp-universe-scrim" aria-hidden="true" />
        <div className="lp-universe-inner">
          <div className="lp-u-copy">
            <span className="lp-kicker lp-u-kicker"><b>00</b> The universe</span>
            <h2 className="lp-u-title">
              Research has a shape.
              <br />
              <em>Watch it form.</em>
            </h2>
            <p className="lp-u-lead">
              Scroll to pull one question into a connected universe of papers, runs, errors and
              the fixes that resolved them.
            </p>
            <ol className="lp-u-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className={active === i ? "is-active" : ""}>
                  <span className="lp-u-n">0{i + 1}</span>
                  <div>
                    <b>{s.title}</b>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lp-u-hint" aria-hidden="true">
              <span>Scroll to expand</span>
              <i />
            </div>
          </div>
        </div>
        <div className="lp-u-bar" aria-hidden="true"><i /></div>
      </div>
    </section>
  );
}

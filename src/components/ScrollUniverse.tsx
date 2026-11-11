import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import UniverseFallback from "./UniverseFallback";
import * as THREE from "three";

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

function makeGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabel(text: string, color: string) {
  const measure = document.createElement("canvas").getContext("2d")!;
  const font = "700 26px Manrope, Inter, sans-serif";
  measure.font = font;
  const width = Math.ceil(measure.measureText(text.toUpperCase()).width) + 40;
  const c = document.createElement("canvas");
  c.width = Math.max(132, width);
  c.height = 64;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.roundRect(2, 2, c.width - 4, c.height - 4, 16);
  g.fillStyle = "rgba(8,11,11,.86)";
  g.fill();
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = "#EAF1DD";
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.toUpperCase(), c.width / 2, c.height / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, aspect: c.width / c.height };
}

function NodeLabel({ text, color, progress, position }: { text: string; color: string; progress: MutableRefObject<number>; position: [number, number, number] }) {
  const { texture, aspect } = useMemo(() => makeLabel(text, color), [text, color]);
  const sprite = useRef<THREE.Sprite>(null);
  const mat = useRef<THREE.SpriteMaterial>(null);
  const world = useRef(new THREE.Vector3());
  const projected = useRef(new THREE.Vector3());
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera, size }) => {
    if (!sprite.current || !mat.current) return;
    sprite.current.getWorldPosition(world.current);
    projected.current.copy(world.current).project(camera);
    const x = (projected.current.x * 0.5 + 0.5) * size.width;
    const y = (-projected.current.y * 0.5 + 0.5) * size.height;
    const mobile = size.width < 760;
    const safeX = mobile ? size.width * 0.05 : size.width * 0.43;
    const minY = mobile ? size.height * 0.66 : size.height * 0.12;
    const safe = projected.current.z < 1 && x > safeX && y > minY && y < size.height * 0.9;
    const edge = clamp01((x - safeX) / (size.width * 0.08));
    const reveal = clamp01((smooth(clamp01(progress.current)) - 0.28) / 0.3);
    const target = safe ? Math.min(1, edge) * reveal * 0.75 : 0;
    mat.current.opacity = THREE.MathUtils.lerp(mat.current.opacity, target, 0.12);
    const distance = world.current.distanceTo(camera.position);
    const base = Math.min(0.23, Math.max(0.1, distance * 0.036));
    sprite.current.scale.set(base * aspect, base, 1);
  });
  return (
    <sprite ref={sprite} position={position} scale={[0.2 * aspect, 0.2, 1]}>
      <spriteMaterial ref={mat} map={texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

type Node = { pos: THREE.Vector3; color: string; size: number; label?: string };

function makeUniverse(count: number) {
  const rand = prng(19);
  const nodes: Node[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const shell = 2.35 + (rand() - 0.5) * 0.7;
    const pos = new THREE.Vector3(
      Math.cos(theta) * radius * shell,
      y * shell * 0.92,
      Math.sin(theta) * radius * shell,
    );
    const palette = [LIME, VIOLET, PAPER, ORANGE];
    const color = palette[i % palette.length];
        nodes.push({
      pos,
      color: i % 9 === 0 ? ORANGE : color,
      size: 0.055 + rand() * 0.055,
    });
  }
  ["Paper", "Dataset", "Result", "Fix"].forEach((label, i) => {
    const n = nodes[(i * 7 + 3) % nodes.length];
    if (n && !n.label) n.label = label;
  });


  const pairs = new Set<string>();
  const edges: [number, number][] = [];
  const add = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    edges.push([a, b]);
  };
  nodes.forEach((n, i) => {
    const nearest = nodes
      .map((m, j) => ({ j, d: n.pos.distanceToSquared(m.pos) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    nearest.forEach((ne) => add(i, ne.j));
  });
  for (let i = 0; i < nodes.length; i += 5) add(i, (i + 7) % nodes.length);

  const positions = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => {
    const p = nodes[a].pos;
    const q = nodes[b].pos;
    positions.set([p.x, p.y, p.z, q.x, q.y, q.z], i * 6);
  });
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  return { nodes, edgeGeo };
}

function Dust({ glow, compact, reduced }: { glow: THREE.Texture; compact: boolean; reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { geo, mat } = useMemo(() => {
    const n = compact ? 320 : 760;
    const rand = prng(71);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 3.2 + rand() * 4.8;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 2 - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * 0.8;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      map: glow,
      color: "#C8C2B8",
      size: 0.045,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    return { geo: g, mat: m };
  }, [compact, glow]);
  useFrame((s) => {
    if (ref.current && !reduced) {
      ref.current.rotation.y = s.clock.elapsedTime * 0.012;
      ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.08) * 0.08;
    }
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    return this.state.failed ? <UniverseFallback /> : this.props.children;
  }
}

function UniverseScene({
  progress,
  pointer,
  compact,
  reduced,
}: {
  progress: MutableRefObject<number>;
  pointer: MutableRefObject<{ x: number; y: number }>;
  compact: boolean;
  reduced: boolean;
}) {
  const data = useMemo(() => makeUniverse(compact ? 17 : 27), [compact]);
  const glow = useMemo(makeGlow, []);
  const web = useRef<THREE.Group>(null);
  const core = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  const coreGlow = useRef<THREE.SpriteMaterial>(null);
  const { camera } = useThree();
  useEffect(() => () => data.edgeGeo.dispose(), [data]);
  useEffect(() => () => glow.dispose(), [glow]);

  useFrame((s, dt) => {
    const p = reduced ? 0.58 : smooth(clamp01(progress.current));
    const t = s.clock.elapsedTime;
    if (web.current) {
      web.current.rotation.y = mix(-0.28, 1.85, p) + (reduced ? 0 : t * 0.04) + pointer.current.x * 0.3;
      web.current.rotation.x = mix(-0.16, 0.2, p) + pointer.current.y * 0.18;
      web.current.rotation.z = mix(0.04, -0.12, p);
      web.current.scale.setScalar(mix(0.12, 1.12, p));
      web.current.position.y = mix(0.12, -0.06, p);
    }
    if (core.current) {
      core.current.rotation.y = t * (reduced ? 0 : 0.14) + p * 0.7;
      core.current.rotation.z = Math.sin(t * 0.35) * 0.06;
      core.current.scale.setScalar(mix(0.9, 1.06, p));
    }
    if (rings.current) {
      rings.current.rotation.z = t * (reduced ? 0 : 0.05);
      rings.current.rotation.x = mix(0.9, 1.3, p);
    }
    if (edge.current) edge.current.opacity = mix(0.12, 0.4, p);
    if (coreGlow.current) coreGlow.current.opacity = mix(0.2, 0.4, p);
    camera.position.z = mix(7.6, 5.8, p);
    camera.position.y = mix(0.55, 0.18, p);
    camera.lookAt(0, 0, 0);
    if (dt > 0.1) s.clock.getDelta();
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[4, 4, 5]} intensity={2.4} color={LIME} distance={20} decay={2} />
      <pointLight position={[-5, -2, 2]} intensity={1.8} color={VIOLET} distance={18} decay={2} />
      <pointLight position={[0, -4, -4]} intensity={1.2} color={ORANGE} distance={16} decay={2} />

      <group ref={core}>
        <sprite scale={[6.2, 6.2, 1]}>
          <spriteMaterial ref={coreGlow} map={glow} color={LIME} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <mesh>
          <icosahedronGeometry args={[0.55, 8]} />
          <meshStandardMaterial
            color="#0B100E"
            emissive={LIME}
            emissiveIntensity={0.035}
            metalness={0.95}
            roughness={0.14}
          />
        </mesh>
        <mesh scale={1.22}>
          <icosahedronGeometry args={[0.55, 1]} />
          <meshBasicMaterial color={LIME} wireframe transparent opacity={0.3} />
        </mesh>
        <group ref={rings}>
          <mesh rotation={[1.1, 0.2, 0]}>
            <torusGeometry args={[1.65, 0.006, 6, 120]} />
            <meshBasicMaterial color={LIME} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh rotation={[0.6, 1.2, 0.3]}>
            <torusGeometry args={[2.05, 0.004, 6, 120]} />
            <meshBasicMaterial color={VIOLET} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      </group>

      <group ref={web}>
        <lineSegments geometry={data.edgeGeo}>
          <lineBasicMaterial ref={edge} color={LIME} transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
        {data.nodes.map((n, i) => (
          <group key={i} position={n.pos}>
            <mesh>
              <sphereGeometry args={[n.size, 16, 16]} />
              <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.85} metalness={0.2} roughness={0.25} toneMapped={false} />
            </mesh>
            <sprite scale={[n.size * 10, n.size * 10, 1]}>
              <spriteMaterial map={glow} color={n.color} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
            {n.label && <NodeLabel text={n.label} color={n.color} progress={progress} position={[n.pos.x * 0.2, n.pos.y * 0.2 + 0.28, n.pos.z * 0.2]} />}
          </group>
        ))}
      </group>

      <Dust glow={glow} compact={compact} reduced={reduced} />
    </>
  );
}

export default function ScrollUniverse() {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [compact, setCompact] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setWebgl(Boolean(c.getContext("webgl2") || c.getContext("webgl")));
    } catch {
      setWebgl(false);
    }
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
    const io = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
      rootMargin: "20% 0px",
    });
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
    };
  }, []);

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
          {webgl ? (
            <SceneBoundary>
              <Canvas
                dpr={[1, compact ? 1.35 : 1.6]}
                camera={{ position: [0, 0.55, 7.6], fov: compact ? 54 : 46 }}
                gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
                frameloop={inView ? "always" : "never"}
              >
                <UniverseScene progress={progress} pointer={pointer} compact={compact} reduced={reduced} />
              </Canvas>
            </SceneBoundary>
          ) : (
            <UniverseFallback />
          )}
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

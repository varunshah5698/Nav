import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const LIME = "#D8F85E";
const VIOLET = "#9C8BE5";
const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- soft additive halo (cheap stand-in for bloom) ---------- */
function Halo({ color, size, x = 0, y = 0, z, opacity = 1 }: { color: string; size: number; x?: number; y?: number; z: number; opacity?: number }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color.replace(/[\d.]+\)$/, "0.16)"));
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [color]);
  return (
    <sprite position={[x, y, z]} scale={[size, size, 1]}>
      <spriteMaterial map={texture} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

/* ---------- central distorted core ---------- */
function Core() {
  const core = useRef<THREE.Mesh>(null);
  const shell = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (core.current) {
      core.current.rotation.y = t * 0.16;
      core.current.rotation.z = Math.sin(t * 0.22) * 0.12;
    }
    if (shell.current) {
      shell.current.rotation.y = -t * 0.11;
      shell.current.rotation.x = t * 0.05;
    }
    if (glow.current) {
      const p = 1 + Math.sin(t * 1.4) * (REDUCED ? 0 : 0.035);
      glow.current.scale.setScalar(p);
    }
  });
  return (
    <Float speed={REDUCED ? 0 : 1.15} rotationIntensity={REDUCED ? 0 : 0.35} floatIntensity={REDUCED ? 0 : 0.55}>
      <Halo color="rgba(216,248,94,0.30)" size={7.2} z={-1.2} opacity={0.85} />
      <Halo color="rgba(156,139,229,0.28)" size={5.4} x={0.7} y={-0.5} z={-0.6} opacity={0.7} />
      <mesh ref={core} castShadow>
        <icosahedronGeometry args={[1.28, 12]} />
        <MeshDistortMaterial
          color="#131919"
          metalness={0.9}
          roughness={0.22}
          distort={REDUCED ? 0 : 0.34}
          speed={REDUCED ? 0 : 1.5}
          emissive="#2A3418"
          emissiveIntensity={0.55}
        />
      </mesh>

      {/* faceted wire cage */}
      <mesh ref={shell} scale={1.38}>
        <icosahedronGeometry args={[1.28, 1]} />
        <meshBasicMaterial color={LIME} wireframe transparent opacity={0.2} />
      </mesh>

      {/* inner chroma */}
      <mesh ref={glow} scale={0.74}>
        <sphereGeometry args={[1.28, 48, 48]} />
        <meshStandardMaterial
          color="#0B0F0F"
          metalness={0.95}
          roughness={0.18}
          emissive={VIOLET}
          emissiveIntensity={0.38}
        />
      </mesh>
    </Float>
  );
}

/* ---------- orbiting data rings ---------- */
const RINGS = [
  { r: 2.0, tilt: [1.16, 0.1, 0.26] as const, color: LIME, speed: 0.22, n: 3, size: 0.052 },
  { r: 2.44, tilt: [0.52, 0.75, -0.34] as const, color: VIOLET, speed: -0.15, n: 4, size: 0.045 },
  { r: 2.88, tilt: [1.44, 0.24, 0.62] as const, color: "#FFFFFF", speed: 0.1, n: 2, size: 0.036 },
];

function Ring({ r, tilt, color, speed, n, size }: (typeof RINGS)[number]) {
  const spin = useRef<THREE.Group>(null);
  const nodes = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + i * 0.7;
        return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
      }),
    [n, r],
  );
  useFrame(() => {
    if (spin.current) spin.current.rotation.z += REDUCED ? 0 : speed * 0.012;
  });
  return (
    <group rotation={tilt as unknown as [number, number, number]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r, 0.0045, 8, 160]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} />
      </mesh>
      <group ref={spin}>
        {nodes.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[size, 16, 16]} />
            <meshStandardMaterial
              color="#101414"
              emissive={color}
              emissiveIntensity={2.4}
              roughness={0.3}
              metalness={0.4}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Rings() {
  return (
    <group rotation={[0.06, 0, -0.1]}>
      {RINGS.map((r, i) => (
        <Ring key={i} {...r} />
      ))}
    </group>
  );
}

/* ---------- graphite "research graph" spokes ---------- */
function Spokes() {
  const geo = useMemo(() => {
    const grp = new THREE.BufferGeometry();
    const verts: number[] = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const y = Math.sin(i * 1.9) * 1.5;
      const rad = 3.1 + Math.cos(i * 2.3) * 0.5;
      const p = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad);
      verts.push(0, 0, 0, p.x, p.y, p.z);
    }
    grp.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    return grp;
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={LIME} transparent opacity={0.1} />
    </lineSegments>
  );
}

/* ---------- ambient dust ---------- */
function Dust({ count = 1100 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3.4 + Math.random() * 8.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * 0.55;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);
  useFrame((s) => {
    if (!ref.current || REDUCED) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.012;
    ref.current.rotation.x = Math.sin(s.clock.elapsedTime * 0.05) * 0.05;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.035}
        color={VIOLET}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function GridFloor() {
  return (
    <gridHelper
      args={[52, 52, "#243030", "#151C1C"]}
      position={[0, -3.1, 0]}
      material-transparent
      material-opacity={0.55}
    />
  );
}

/* ---------- whole stage: parallax + responsive framing ---------- */
function Stage() {
  const group = useRef<THREE.Group>(null);
  const { size } = useThree();
  const drift = useRef({ x: 0, y: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  useFrame((s, delta) => {
    if (!group.current) return;
    const wide = size.width >= 980;
    const t = s.clock.elapsedTime;
    const tx = wide ? -1.9 : 0;
    const ty = wide ? -0.8 : 1.15;
    const k = Math.min(1, delta * 2.5);
    drift.current.x += ((REDUCED ? 0 : pointer.current.y * 0.2) - drift.current.x) * k;
    drift.current.y += ((REDUCED ? 0 : pointer.current.x * 0.32) - drift.current.y) * k;
    group.current.position.x += (tx - group.current.position.x) * Math.min(1, delta * 3);
    group.current.position.y += (ty - group.current.position.y) * Math.min(1, delta * 3);
    const scale = wide ? 1 : 0.76;
    group.current.scale.setScalar(group.current.scale.x + (scale - group.current.scale.x) * Math.min(1, delta * 3));
    group.current.rotation.x = drift.current.x + (REDUCED ? 0 : Math.sin(t * 0.22) * 0.04);
    group.current.rotation.y = drift.current.y + (REDUCED ? 0 : t * 0.045);
  });
  return (
    <group ref={group}>
      <Core />
      <Rings />
      <Spokes />
      <Dust count={size.width < 820 ? 600 : 1100} />
      <GridFloor />
    </group>
  );
}

export default function AuthScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.25, 7.4], fov: 44 }}
      dpr={[1, 1.7]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <fog attach="fog" args={["#080B0B", 8.5, 21]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 6]} intensity={2.4} color="#FFFFFF" />
      <pointLight position={[4.5, 1.5, 3]} intensity={26} color={LIME} distance={22} decay={2} />
      <pointLight position={[-4.5, -2, 2.5]} intensity={24} color={VIOLET} distance={22} decay={2} />
      <Stage />
    </Canvas>
  );
}

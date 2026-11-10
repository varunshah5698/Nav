import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import * as THREE from "three";

function Orbit({ radius, tilt, speed, color, dot, reduced }: {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  color: string;
  dot?: string;
  reduced: boolean;
}) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!ref.current || reduced) return;
    ref.current.rotation.z += dt * speed;
  });
  return (
    <group ref={ref} rotation={tilt}>
      <mesh>
        <torusGeometry args={[radius, 0.007, 12, 160]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {dot && (
        <mesh position={[radius, 0, 0]}>
          <sphereGeometry args={[0.045, 18, 18]} />
          <meshBasicMaterial color={dot} />
        </mesh>
      )}
    </group>
  );
}

function Scene({ tiltX, tiltY, reduced }: { tiltX: number; tiltY: number; reduced: boolean }) {
  const group = useRef<Group>(null);
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    target.current = { x: tiltX * 0.012, y: tiltY * 0.016 };
  }, [tiltX, tiltY]);

  useFrame((_, dt) => {
    if (!group.current || reduced) return;
    const k = Math.min(1, dt * 4.5);
    group.current.rotation.x += (target.current.x - group.current.rotation.x) * k;
    group.current.rotation.y += (target.current.y - group.current.rotation.y) * k + dt * 0.12;
  });

  return (
    <group ref={group}>
      <Float speed={reduced ? 0 : 1.4} rotationIntensity={0.22} floatIntensity={0.5}>
        <mesh>
          <sphereGeometry args={[1.02, 64, 64]} />
          <MeshDistortMaterial color="#F3703F" roughness={0.3} metalness={0.16} distort={reduced ? 0 : 0.16} speed={1.3} />
        </mesh>
        <mesh scale={1.01}>
          <sphereGeometry args={[1.02, 48, 48]} />
          <meshBasicMaterial color="#FF9A6E" transparent opacity={0.12} blending={THREE.AdditiveBlending} />
        </mesh>
      </Float>

      <Orbit radius={1.66} tilt={[1.22, 0.15, 0]} speed={0.22} color="#F3703F" dot="#D8F85E" reduced={reduced} />
      <Orbit radius={1.34} tilt={[0.92, 0.72, 0.3]} speed={-0.17} color="#8B7BE8" dot="#6E9AE6" reduced={reduced} />
      <Orbit radius={1.96} tilt={[1.48, 0.08, 0.2]} speed={0.08} color="#C9B79F" reduced={reduced} />

      {!reduced && <Sparkles count={26} scale={[3.4, 2.6, 2.4]} size={1.5} speed={0.32} opacity={0.65} color="#FFB08E" />}
    </group>
  );
}

/** WebGL lab core. CSS rings remain the fallback when WebGL is unavailable. */
export default function LabCore3D({ tiltX, tiltY, reduced }: { tiltX: number; tiltY: number; reduced: boolean }) {
  return (
    <div className="xh-core3d">
      <Canvas
        dpr={[1, 1.6]}
        frameloop={reduced ? "demand" : "always"}
        camera={{ position: [0, 0, 4.4], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.62} />
        <directionalLight position={[4, 5, 6]} intensity={2.3} color="#FFE1CF" />
        <pointLight position={[-4, -2, -3]} intensity={2.1} color="#D8F85E" />
        <Scene tiltX={tiltX} tiltY={tiltY} reduced={reduced} />
      </Canvas>
    </div>
  );
}

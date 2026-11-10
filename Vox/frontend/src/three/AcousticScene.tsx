import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'

interface SceneProps {
  /** Scroll progress 0..1 written by GSAP ScrollTrigger (mutable, not state). */
  progressRef?: MutableRefObject<number>
  compact?: boolean
  reduced?: boolean
}

const PALETTE = ['#4D5BAD', '#8FA4E4', '#78A3B2', '#B4DAAA']

function WaveRibbon({
  index,
  count,
  phase,
  depth,
  amplitude,
  progressRef,
  reduced,
}: {
  index: number
  count: number
  phase: number
  depth: number
  amplitude: number
  progressRef?: MutableRefObject<number>
  reduced: boolean
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    )
    return geo
  }, [count])

  const object = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: PALETTE[index % PALETTE.length],
      transparent: true,
      opacity: index === 0 ? 0.95 : 0.6,
    })
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    return line
  }, [geometry, index])

  useFrame(({ clock }) => {
    const time = reduced ? 1.2 : clock.getElapsedTime()
    const progress = progressRef?.current ?? 0
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    const spread = 7.4 + progress * 3.2
    const flatten = 1 - progress * 0.45

    for (let i = 0; i < count; i += 1) {
      const p = i / (count - 1)
      const envelope = Math.sin(Math.PI * p) ** 1.1
      const x = (p - 0.5) * spread
      const y =
        Math.sin(p * Math.PI * 3.4 + time * (reduced ? 0 : 1.05) + phase) *
          0.62 *
          envelope *
          amplitude *
          flatten +
        Math.sin(p * Math.PI * 1.2 + phase) * 0.1
      const z =
        depth +
        Math.cos(p * Math.PI * 2.1 + time * (reduced ? 0 : 0.6) + phase) * 0.35
      attr.setXYZ(i, x, y, z)
    }
    attr.needsUpdate = true
    object.rotation.y = progress * 0.12
  })

  return <primitive object={object} />
}

function ParticleField({
  count,
  reduced,
  progressRef,
}: {
  count: number
  reduced: boolean
  progressRef?: MutableRefObject<number>
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const golden = 2.399963
        const r = 1.6 + ((i * 37) % 100) / 34
        return {
          angle: i * golden,
          radius: r,
          height: ((i * 53) % 100) / 100 - 0.5,
          speed: 0.08 + ((i * 17) % 100) / 900,
          scale: 0.012 + ((i * 11) % 100) / 6000,
        }
      }),
    [count],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    if (!mesh.current) return
    const time = reduced ? 0 : clock.getElapsedTime()
    const progress = progressRef?.current ?? 0
    seeds.forEach((seed, i) => {
      const angle = seed.angle + time * seed.speed
      const radius = seed.radius * (1 + progress * 0.25)
      dummy.position.set(
        Math.cos(angle) * radius,
        seed.height * 2.6 + Math.sin(time * 0.5 + i) * 0.06,
        Math.sin(angle) * radius * 0.55 - 0.6,
      )
      const scale = seed.scale * (1 + Math.sin(time * 0.8 + i * 0.4) * 0.35)
      dummy.scale.setScalar(Math.max(0.004, scale))
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        color="#7C9BD4"
        transparent
        opacity={0.55}
        roughness={0.4}
        metalness={0.1}
      />
    </instancedMesh>
  )
}

function Rig({
  progressRef,
  compact,
  reduced,
}: {
  progressRef?: MutableRefObject<number>
  compact: boolean
  reduced: boolean
}) {
  useFrame(({ camera, clock }) => {
    const progress = progressRef?.current ?? 0
    const time = reduced ? 0 : clock.getElapsedTime()
    const targetZ = (compact ? 6.4 : 7.4) - progress * 1.5
    const targetY = 0.25 + progress * 0.35
    camera.position.z += (targetZ - camera.position.z) * 0.06
    camera.position.y += (targetY - camera.position.y) * 0.06
    camera.position.x += (progress * 0.5 - camera.position.x) * 0.04
    camera.lookAt(0, 0.1 + Math.sin(time * 0.25) * 0.02, 0)
  })
  return null
}

export default function AcousticScene({
  progressRef,
  compact = false,
  reduced = false,
}: SceneProps) {
  const ribbons = compact ? 3 : 4
  const particles = compact ? 220 : 520

  return (
    <Canvas
      camera={{ position: [0, 0.35, compact ? 6.4 : 7.4], fov: 42 }}
      dpr={[1, 1.7]}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 4, 6]} intensity={1.4} color="#ffffff" />
      <directionalLight position={[-5, -2, 3]} intensity={0.6} color="#C3CAFC" />
      <pointLight position={[0, 0, 3]} intensity={1.1} color="#8FA4E4" />

      <group position={[0, compact ? 0 : -0.15, 0]}>
        {Array.from({ length: ribbons }, (_, i) => (
          <WaveRibbon
            key={i}
            index={i}
            count={compact ? 150 : 260}
            phase={i * 0.85}
            depth={(i - (ribbons - 1) / 2) * 0.55}
            amplitude={1 - i * 0.12}
            progressRef={progressRef}
            reduced={reduced}
          />
        ))}
        <ParticleField count={particles} reduced={reduced} progressRef={progressRef} />
      </group>

      <Rig progressRef={progressRef} compact={compact} reduced={reduced} />
    </Canvas>
  )
}

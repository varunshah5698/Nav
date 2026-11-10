import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
function Web({n=14}:{n?:number}){
  const g=useRef<THREE.Group>(null);
  const pts=useMemo(()=>{
    const p:THREE.Vector3[]=[]; const R=2.6;
    for(let i=0;i<n;i++){ const t=(i/n)*Math.PI*2; const r=R*(0.55+0.45*Math.abs(Math.sin(i*2.3))); p.push(new THREE.Vector3(Math.cos(t)*r,Math.sin(i*1.7)*1.4,Math.sin(t)*r)); }
    return p;
  },[n]);
  const lineGeo=useMemo(()=>{
    const verts:number[]=[];
    pts.slice(1).forEach(p=>{ verts.push(0,0,0,p.x,p.y,p.z); });
    for(let i=1;i<pts.length-1;i++){ const a=pts[i],b=pts[i+1]; verts.push(a.x,a.y,a.z,b.x,b.y,b.z); }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.BufferAttribute(new Float32Array(verts),3));
    return geo;
  },[pts]);
  const dust=useMemo(()=>{
    const arr=new Float32Array(240*3);
    for(let i=0;i<240*3;i++) arr[i]=(Math.random()-0.5)*12;
    const geo=new THREE.BufferGeometry();
    geo.setAttribute("position",new THREE.BufferAttribute(arr,3));
    return geo;
  },[]);
  useFrame((s)=>{ if(g.current){ g.current.rotation.y=s.clock.elapsedTime*0.08; g.current.rotation.x=Math.sin(s.clock.elapsedTime*0.15)*0.12; }});
  return <group ref={g}>
    <points geometry={dust}><pointsMaterial size={0.03} color="#9C8BE5" transparent opacity={0.6}/></points>
    <lineSegments geometry={lineGeo}><lineBasicMaterial color="#D8F85E" transparent opacity={0.35}/></lineSegments>
    {pts.map((p,i)=><mesh key={i} position={p}>
      <sphereGeometry args={[i===0?0.2:0.09,20,20]}/>
      <meshStandardMaterial color={i===0?"#D8F85E":i%3===0?"#9C8BE5":"#ffffff"} emissive={i===0?"#5a6416":"#222222"} emissiveIntensity={i===0?0.7:0.15}/>
    </mesh>)}
    <ambientLight intensity={0.9}/><pointLight position={[4,3,4]} intensity={1.4} color="#D8F85E"/><pointLight position={[-4,-2,-3]} intensity={0.8} color="#9C8BE5"/>
  </group>;
}
export default function ResearchUniverse({compact}:{compact?:boolean}){
  return <Canvas camera={{position:[0,0.6,7.2],fov:46}} dpr={[1,1.6]} style={{height:compact?"340px":"100%"}}>
    <color attach="background" args={[compact?"#1E2222":"#141717"]}/>
    <Web n={compact?10:16}/>
  </Canvas>;
}

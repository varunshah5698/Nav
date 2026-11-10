import type { AgentRun, Edge, Experiment, RNode, Source } from "./types";
export const pct=(n:number,d:number)=> d>0 ? Math.round(n/d*1000)/10 : 0;
export function expSuccess(exps:Experiment[]){
  const runs = exps.flatMap(e=>e.runs).filter(r=>r.status==="completed"||r.status==="failed");
  const ok = runs.filter(r=>r.status==="completed").length;
  return { ok, total:runs.length, rate:pct(ok,runs.length) };
}
export function srcSuccess(srcs:Source[]){
  const done = srcs.filter(s=>s.status==="ready"||s.status==="failed");
  const ok = done.filter(s=>s.status==="ready").length;
  return { ok, total:done.length, rate:pct(ok,done.length) };
}
export function connectedRatio(nodes:RNode[], edges:Edge[]){
  const linked = new Set<string>(); edges.forEach(e=>{linked.add(e.source);linked.add(e.target);});
  const n = nodes.filter(x=>linked.has(x.id)).length;
  return { linked:n, total:nodes.length, rate:pct(n,nodes.length) };
}
export function agentStats(runs:AgentRun[]){
  const total=runs.length, ok=runs.filter(r=>r.status==="completed").length;
  const pending=runs.filter(r=>r.status==="waiting_approval").length;
  return { total, ok, failed:runs.filter(r=>r.status==="failed").length, pending, rate:pct(ok,total) };
}
export function approvalRate(runs:AgentRun[]){
  const rev = runs.filter(r=>r.approval && r.approval.state!=="pending");
  const ap = rev.filter(r=>r.approval!.state==="approved").length;
  return { approved:ap, total:rev.length, rate:pct(ap,rev.length) };
}

/* ---------- descriptive statistics ---------- */
export function mean(xs:number[]){ return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
export function median(xs:number[]){
  if(!xs.length) return 0;
  const s=[...xs].sort((a,b)=>a-b), m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
/** Sample standard deviation (n-1). Returns 0 for n < 2. */
export function stdev(xs:number[]){
  if(xs.length<2) return 0;
  const m=mean(xs);
  return Math.sqrt(xs.reduce((a,v)=>a+(v-m)**2,0)/(xs.length-1));
}
export interface Summary { n:number; mean:number; median:number; sd:number; min:number; max:number }
export function describe(values:number[]):Summary|null{
  const xs=values.filter(v=>typeof v==="number" && Number.isFinite(v));
  if(!xs.length) return null;
  return { n:xs.length, mean:mean(xs), median:median(xs), sd:stdev(xs), min:Math.min(...xs), max:Math.max(...xs) };
}

/* ---------- graph structure ---------- */
export interface GraphMetrics {
  nodes:number; edges:number; degrees:number[]; density:number; avgDegree:number; maxDegree:number;
  components:number; linked:number; rate:number; isolated:RNode[]; hubs:{id:string;title:string;degree:number}[];
}
export function graphMetrics(nodes:RNode[], edges:Edge[]):GraphMetrics{
  const ids=new Set(nodes.map(n=>n.id));
  const valid=edges.filter(e=>ids.has(e.source) && ids.has(e.target));
  const degree=new Map<string,number>(); nodes.forEach(n=>degree.set(n.id,0));
  valid.forEach(e=>{
    degree.set(e.source,(degree.get(e.source)||0)+1);
    degree.set(e.target,(degree.get(e.target)||0)+1);
  });
  const parent=new Map<string,string>(); nodes.forEach(n=>parent.set(n.id,n.id));
  const find=(x:string):string=>{ let r=x; while(parent.get(r)!==r) r=parent.get(r)!; return r; };
  valid.forEach(e=>{ const a=find(e.source), b=find(e.target); if(a!==b) parent.set(a,b); });
  const components=new Set(nodes.map(n=>find(n.id))).size;
  const isolated=nodes.filter(n=>(degree.get(n.id)||0)===0);
  const linked=nodes.length-isolated.length;
  const degrees=[...degree.values()];
  const hubs=[...degree.entries()]
    .filter(([,d])=>d>0).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([id,d])=>({ id, degree:d, title:nodes.find(n=>n.id===id)?.title||id }));
  return {
    nodes:nodes.length, edges:valid.length, degrees,
    density: nodes.length>1 ? valid.length/(nodes.length*(nodes.length-1)/2) : 0,
    avgDegree: nodes.length ? 2*valid.length/nodes.length : 0,
    maxDegree: degrees.length ? Math.max(...degrees) : 0,
    components, linked, rate:pct(linked,nodes.length), isolated, hubs,
  };
}

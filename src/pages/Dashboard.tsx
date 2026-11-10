import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { Badge, Empty, Modal } from "../components/ui";
import { Donut, Growth, RankBars, RunBars } from "../components/Charts";
import { approvalRate, describe, graphMetrics, median, pct } from "../lib/analytics";
import type { Activity, AgentName, SourceKind } from "../lib/types";
import "../styles/dashboard.css";

const TYPE_LABEL:Record<string,string>={paper:"Papers",dataset:"Datasets",code_repo:"Code repos",code_file:"Code files",note:"Notes",webpage:"Web pages",question:"Questions",experiment:"Experiments",result:"Results",error:"Errors",fix:"Fixes",conclusion:"Conclusions"};
const KIND_LABEL:Record<string,string>={pdf:"PDF papers",url:"Web pages",github:"Repositories",dataset:"Datasets",note:"Notes"};
const AGENT_LABEL:Record<AgentName,string>={controller:"Controller",paper_reader:"Paper Reader",equation:"Equation Solver",code_setup:"Code Setup",experiment:"Experiment",benchmark:"Benchmark",memory:"Memory",review:"Review"};
const MIX=["#6FD08C","#F0805A","#E8DFD0","#8B8F87","#C9A9F5","#7AA2FF"];
const num=(v:number)=>v.toLocaleString("en-GB");
const statusTone=(s:string)=>s==="completed"?"green":s==="failed"?"red":s==="waiting_approval"?"yellow":s==="running"?"violet":"";
const rel=(iso:string)=>{
  const s=Math.max(0,Math.round((Date.now()-+new Date(iso))/1000));
  if(s<60) return "just now";
  const m=Math.round(s/60); if(m<60) return m+"m ago";
  const h=Math.round(m/60); if(h<24) return h+"h ago";
  const d=Math.round(h/24);
  return d<30 ? d+"d ago" : new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
};

const KIND_ICON:Record<SourceKind,React.ReactNode>={
  pdf:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5h5L14.5 7v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M10 2.5V7h4.5"/><path d="M6.6 10.6h4.8M6.6 13h3.2"/></svg>,
  url:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="6.2"/><path d="M2.8 9h12.4M9 2.8c1.8 1.7 2.8 3.8 2.8 6.2S10.8 13.5 9 15.2C7.2 13.5 6.2 11.4 6.2 9S7.2 4.5 9 2.8Z"/></svg>,
  github:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7 5-4 4 4 4M11 5l4 4-4 4"/></svg>,
  dataset:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="9" cy="4.6" rx="5.2" ry="2.1"/><path d="M3.8 4.6v8.8c0 1.2 2.3 2.1 5.2 2.1s5.2-.9 5.2-2.1V4.6"/><path d="M3.8 9c0 1.2 2.3 2.1 5.2 2.1s5.2-.9 5.2-2.1"/></svg>,
  note:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3h10v8l-4 4H4Z"/><path d="M10 15v-4h4"/><path d="M6.5 6.5h5M6.5 9h3.2"/></svg>,
};

function Delta({children,tone="up"}:{children:React.ReactNode;tone?:"up"|"down"|"warn"|"zero"}){
  return <span className={`db-delta ${tone}`}>
    {tone==="up"&&<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.6 8.6 6 5.2l3.4 3.4"/><path d="M6 5.4v5"/></svg>}
    {tone==="down"&&<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.6 3.4 6 6.8l3.4-3.4"/><path d="M6 6.6v5"/></svg>}
    {children}
  </span>;
}

function Panel({id,title,sub,action,children}:{id?:string;title:string;sub?:string;action?:React.ReactNode;children:React.ReactNode}){
  return <section className="db-panel" id={id}>
    <div className="db-p-head"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action&&<div className="db-p-act">{action}</div>}</div>
    {children}
  </section>;
}

function Kpi({label,value,delta,tone}:{label:string;value:string;delta:string;tone:"up"|"down"|"warn"|"zero"}){
  return <article className="db-kpi">
    <span className="db-kpi-lbl">{label}</span>
    <div className="db-kpi-row"><b>{value}</b><Delta tone={tone}>{delta}</Delta></div>
  </article>;
}

export default function Dashboard(){
  const activeWs=useStore(s=>s.activeWs);
  const ws=useStore(s=>s.workspaces.find(w=>w.id===s.activeWs));
  const user=useStore(s=>s.users.find(u=>u.id===s.sessionUserId));
  const memberships=useStore(s=>s.memberships);
  const createWs=useStore(s=>s.createWorkspace);
  const allNodes=useStore(s=>s.nodes); const nodes=useMemo(()=>allNodes.filter(n=>n.workspaceId===activeWs),[allNodes,activeWs]);
  const allEdges=useStore(s=>s.edges); const edges=useMemo(()=>allEdges.filter(n=>n.workspaceId===activeWs),[allEdges,activeWs]);
  const allSources=useStore(s=>s.sources); const sources=useMemo(()=>allSources.filter(n=>n.workspaceId===activeWs),[allSources,activeWs]);
  const allExps=useStore(s=>s.experiments); const exps=useMemo(()=>allExps.filter(n=>n.workspaceId===activeWs),[allExps,activeWs]);
  const allAgents=useStore(s=>s.agents); const agents=useMemo(()=>allAgents.filter(n=>n.workspaceId===activeWs),[allAgents,activeWs]);
  const allActs=useStore(s=>s.activities); const acts=useMemo(()=>allActs.filter(n=>n.workspaceId===activeWs).sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt)),[allActs,activeWs]);
  const [range,setRange]=useState("7d");
  const [tab,setTab]=useState("overview");
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState({name:"",desc:""});

  const days=range==="7d"?7:range==="30d"?30:90;
  const now=Date.now();
  const since=now-days*864e5;
  const inRange=(iso:string)=>{ const t=+new Date(iso); return t>since && t<=now; };

  const runs=useMemo(()=>exps.flatMap(e=>e.runs),[exps]);
  const gm=useMemo(()=>graphMetrics(nodes,edges),[nodes,edges]);
  const memberCount=memberships.filter(m=>m.workspaceId===activeWs).length;

  /* --- time series: additions per bucket + cumulative corpus --- */
  const series=useMemo(()=>{
    const unit=days>30?7:1, buckets=Math.ceil(days/unit);
    const itemTs=[...nodes,...sources].map(x=>+new Date(x.createdAt)).sort((a,b)=>a-b);
    const edgeTs=edges.map(e=>+new Date(e.createdAt));
    const srcTs=sources.map(s=>+new Date(s.createdAt));
    const runTs=runs.map(r=>+new Date(r.startedAt));
    const between=(arr:number[],a:number,b:number)=>arr.filter(t=>t>a&&t<=b).length;
    const upto=(arr:number[],t:number)=>arr.filter(x=>x<=t).length;
    return Array.from({length:buckets},(_,i)=>{
      const end=since+(i+1)*unit*864e5, start=end-unit*864e5;
      return {
        label:new Date(end-864e5).toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
        added:between(itemTs,start,end),
        total:upto(itemTs,end),
        edgeTotal:upto(edgeTs,end),
        srcTotal:upto(srcTs,end),
        runTotal:upto(runTs,end),
      };
    });
  },[nodes,sources,edges,runs,since,days]);

  /* --- headline numbers --- */
  const finished=runs.filter(r=>r.status==="completed"||r.status==="failed");
  const okRuns=runs.filter(r=>r.status==="completed").length;
  const failedRuns=runs.filter(r=>r.status==="failed").length;
  const successRate=finished.length?pct(okRuns,finished.length):0;
  const readySources=sources.filter(s=>s.status==="ready").length;
  const newSources=sources.filter(s=>inRange(s.createdAt)).length;
  const edgeAdded=edges.filter(e=>inRange(e.createdAt)).length;
  const totalItems=nodes.length+sources.length;
  const addedInRange=series.reduce((a,b)=>a+b.added,0);
  const peak=series.reduce((a,b)=>b.added>a.added?b:a, series[0]||{label:"—",added:0});
  const avgPerDay=(addedInRange/days).toFixed(1);

  const ingestDone=sources.filter(s=>s.status==="ready"||s.status==="failed");
  const ingestRate=ingestDone.length?pct(readySources,ingestDone.length):0;
  const ingestMs=median(sources.map(s=>s.durationMs||0).filter(v=>v>0));
  const chunks=sources.reduce((a,s)=>a+(s.chunks?.length||0),0);
  const completeness=pct(nodes.filter(n=>n.description?.trim()&&n.tags.length>0).length,nodes.length);

  const ap=useMemo(()=>approvalRate(agents),[agents]);
  const conf=describe(agents.map(a=>a.confidence).filter((v):v is number=>typeof v==="number"));

  const byType=useMemo(()=>{
    const m=new Map<string,number>();
    nodes.forEach(n=>m.set(TYPE_LABEL[n.type]||n.type,(m.get(TYPE_LABEL[n.type]||n.type)||0)+1));
    return [...m.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  },[nodes]);
  const byKind=useMemo(()=>{
    const m=new Map<string,number>();
    sources.forEach(s=>m.set(KIND_LABEL[s.kind]||s.kind,(m.get(KIND_LABEL[s.kind]||s.kind)||0)+1));
    return [...m.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  },[sources]);

  const runBars=useMemo(()=>runs
    .filter(r=>typeof r.metrics?.accuracy==="number")
    .map((r,i)=>({
      label:String(r.params?.model??`Run ${i+1}`).replace("mobilenet_v2","MobileNetV2").replace("efficientnet_lite0","EfficientNet-Lite0"),
      value:+(((r.metrics?.accuracy)??0)*100).toFixed(1),
    })).slice(-6),[runs]);

  const sourceList=useMemo(()=>[...sources].sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt)).slice(0,6),[sources]);

  /* --- descriptive statistics for run metrics --- */
  const metricRows=useMemo(()=>{
    const defs:[string,string,(v:number)=>string,(v:number)=>string][]=[
      ["accuracy","Accuracy",v=>(v*100).toFixed(1)+"%",v=>"±"+(v*100).toFixed(1)+" pt"],
      ["f1","F1 score",v=>(v*100).toFixed(1)+"%",v=>"±"+(v*100).toFixed(1)+" pt"],
      ["loss","Loss",v=>v.toFixed(3),v=>"±"+v.toFixed(3)],
      ["time_s","Runtime",v=>Math.round(v/60)+"m",v=>"±"+Math.round(v/60)+"m"],
    ];
    return defs.flatMap(([key,label,fmt,sdFmt])=>{
      const d=describe(runs.map(r=>r.metrics?.[key]).filter((v):v is number=>typeof v==="number"));
      if(!d) return [];
      return [{key,label,n:d.n,mean:fmt(d.mean),median:fmt(d.median),sd:d.n>1?sdFmt(d.sd):"—",range:fmt(d.min)+"–"+fmt(d.max)}];
    });
  },[runs]);

  const statusCounts={completed:0,running:0,waiting_approval:0,failed:0,other:0};
  agents.forEach(a=>{
    if(a.status==="completed") statusCounts.completed++;
    else if(a.status==="running") statusCounts.running++;
    else if(a.status==="waiting_approval") statusCounts.waiting_approval++;
    else if(a.status==="failed") statusCounts.failed++;
    else statusCounts.other++;
  });
  const recentAgents=[...agents].sort((a,b)=>+new Date(b.updatedAt)-+new Date(a.updatedAt)).slice(0,4);

  const attention:{n:string;label:string;hint:string;to:string;cta:string;tone:string}[]=[];
  if(gm.isolated.length) attention.push({n:String(gm.isolated.length),label:`${gm.isolated.length} isolated node${gm.isolated.length>1?"s":""}`,hint:"Not linked to any evidence yet",to:"/app/canvas",cta:"Canvas",tone:""});
  if(statusCounts.waiting_approval) attention.push({n:String(statusCounts.waiting_approval),label:"Task awaiting approval",hint:"An agent is paused until you review",to:"/app/agents",cta:"Review",tone:"warn"});
  const failedSrc=sources.filter(s=>s.status==="failed").length;
  if(failedSrc) attention.push({n:String(failedSrc),label:`${failedSrc} source${failedSrc>1?"s":""} failed to ingest`,hint:"Re-upload or check the file",to:"/app/sources",cta:"Sources",tone:"warn"});
  if(failedRuns) attention.push({n:String(failedRuns),label:`${failedRuns} experiment run${failedRuns>1?"s":""} failed`,hint:"Metrics and logs are kept for review",to:"/app/experiments",cta:"Lab",tone:"info"});
  if(!gm.isolated.length && gm.nodes>1) attention.push({n:String(gm.hubs.length),label:"Graph fully connected",hint:"Every node has at least one link",to:"/app/canvas",cta:"Inspect",tone:"info"});

  const checks=[
    {ok:sources.length>0&&readySources===sources.length,label:"Ingestion",value:`${readySources}/${sources.length} ready`},
    {ok:!failedRuns,label:"Experiment runs",value:runs.length?`${okRuns}/${runs.length} passed`:"none yet"},
    {ok:!statusCounts.waiting_approval,label:"Approvals",value:ap.total?`${ap.approved}/${ap.total} approved`:"nothing queued"},
    {ok:gm.rate>=60,label:"Connectivity",value:`${gm.rate}% nodes linked`},
  ];

  const canvasTo="/app/canvas"+(ws?`?ws=${ws.id}`:"");
  const create=()=>{ if(!draft.name.trim()) return; createWs(draft.name.trim(),draft.desc.trim()); setDraft({name:"",desc:""}); setOpen(false); };
  const initials=(user?.name||"R").split(/\s+/).map(p=>p[0]).slice(0,2).join("").toUpperCase();
  const joinDate=new Date(user?.createdAt||ws?.createdAt||Date.now()).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const successTone=finished.length?(successRate>=80?"up":"warn"):"zero";
  const jump=(id:string,key:string)=>{
    setTab(key);
    const el=document.getElementById(id);
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});
  };

  return <div className="db" id="db-overview">
    <header className="db-head">
      <div className="db-head-top">
        <div>
          <div className="db-eyebrow"><span>{ws?.name||"Workspace"}</span>{ws?.demo&&<><i className="sep"/><span>Demo data</span></>}</div>
          <h1 className="db-h1">Research cabinet</h1>
        </div>
        <div className="db-head-actions">
          <nav className="db-tabs" aria-label="Dashboard sections">
            {[["overview","db-overview","My cabinet"],["corpus","db-corpus","Corpus"],["statistics","db-statistics","Statistics"]].map(([key,id,label])=>
              <button key={key} className={tab===key?"on":""} aria-pressed={tab===key} onClick={()=>jump(id,key)}>{label}</button>)}
          </nav>
          <button className="db-ghost" onClick={()=>setOpen(true)}>+ Workspace</button>
        </div>
      </div>
      <p className="db-sub">Corpus, knowledge graph and experiment statistics for the last {days} days.</p>
    </header>

    <div className="db-layout">
      <div className="db-main">
        <section className="db-kpis" aria-label="Headline metrics">
          <Kpi label="Sources indexed" value={num(sources.length)} delta={`+${newSources} in range`} tone={newSources?"up":"zero"}/>
          <Kpi label="Knowledge connections" value={num(edges.length)} delta={`+${edgeAdded} in range`} tone={edgeAdded?"up":"zero"}/>
          <Kpi label="Experiment runs" value={num(runs.length)} delta={finished.length?`${successRate}% passed`:"no runs"} tone={successTone}/>
          <Kpi label="Corpus items" value={num(totalItems)} delta={`+${addedInRange} in range`} tone={addedInRange?"up":"zero"}/>
        </section>

        <div className="db-pair">
          <Panel title="Run accuracy" sub="Validation accuracy across finished runs" action={<Link className="db-link" to="/app/experiments">Lab</Link>}>
            {runBars.length? <>
              <RunBars data={runBars}/>
              <div className="db-footrow">
                <span>Best <b>{Math.max(...runBars.map(r=>r.value)).toFixed(1)}%</b></span>
                <span>Mean <b>{(runBars.reduce((a,b)=>a+b.value,0)/runBars.length).toFixed(1)}%</b></span>
                <span><b>{runBars.length}</b> run{runBars.length===1?"":"s"}</span>
              </div>
            </>:<Empty title="No run metrics" body="Approve a plan and execute it to collect accuracy, F1 and loss." action={<Link className="btn btn-primary btn-sm" to="/app/experiments">Open lab</Link>}/>}
          </Panel>

          <Panel title="Source mix" sub={`${sources.length} sources · ${chunks} chunks indexed`} action={<Link className="db-link" to="/app/sources">Sources</Link>}>
            {sources.length? <>
              <div className="db-mix">
                <Donut data={byKind} height={196} center={{value:String(sources.length),label:"sources"}}/>
                <div className="db-legend-list">
                  {byKind.map((k,i)=><div key={k.name}>
                    <i style={{background:MIX[i%MIX.length]}}/>
                    <span className="nm">{k.name}</span>
                    <b>{k.value}</b>
                    <em>{Math.round(k.value/Math.max(sources.length,1)*100)}%</em>
                  </div>)}
                </div>
              </div>
              <div className="db-footrow"><span>Median ingest <b>{ingestMs?Math.round(ingestMs/1000)+"s":"—"}</b></span><span>Ready <b>{readySources}/{sources.length}</b></span></div>
            </>:<Empty title="No sources" body="Upload a PDF, URL or dataset to start ingestion."/>}
          </Panel>
        </div>

        <Panel title="Knowledge growth" sub={`New sources and nodes per ${days>30?"week":"day"}, against the cumulative corpus`}
          action={<>
            <div className="db-seg" role="group" aria-label="Time range">
              {[["7d","7 days"],["30d","30 days"],["90d","90 days"]].map(([k,l])=>
                <button key={k} className={range===k?"on":""} aria-pressed={range===k} onClick={()=>setRange(k)}>{l}</button>)}
            </div>
            <Link className="db-link" to={canvasTo}>Canvas</Link>
            <Link className="db-cta" to="/app/sources">+ Add source</Link>
          </>}>
          {totalItems? <>
            <Growth data={series}/>
            <div className="db-footrow">
              <span>Peak day <b>{peak.label}</b> · {peak.added} items</span>
              <span><b>{avgPerDay}</b> items / day avg</span>
              <span>Corpus <b>{num(totalItems)}</b> items</span>
            </div>
          </> : <Empty title="Nothing indexed yet" body="Add your first source or draw a node — the analysis fills in automatically." action={<Link className="btn btn-primary btn-sm" to="/app/sources">Add a source</Link>}/>}
        </Panel>
      </div>

      <aside className="db-rail" aria-label="Account and sources">
        <section className="db-profile">
          <div className="db-profile-top">
            <span className="db-avatar">{initials}</span>
            <div>
              <b>{user?.name||"Researcher"}</b>
              <span><i className="db-star" aria-hidden>★</i> {ws?.demo?"Demo workspace":"Owner"} · {memberCount} member{memberCount===1?"":"s"}</span>
            </div>
          </div>
          <dl className="db-info">
            <div><dt>Email</dt><dd title={user?.email}>{user?.email||"—"}</dd></div>
            <div><dt>Workspace</dt><dd title={ws?.name}>{ws?.name||"—"}</dd></div>
            <div><dt>Joined</dt><dd>{joinDate}</dd></div>
            <div><dt>Corpus items</dt><dd className="db-info-total">{num(totalItems)} <Delta tone={addedInRange?"up":"zero"}>+{addedInRange}</Delta></dd></div>
          </dl>
          <div className="db-health">
            <div><span>Graph health</span><b>{gm.rate}% linked</b></div>
            <div className="db-health-bar" aria-hidden><i style={{width:Math.min(100,gm.rate)+"%"}}/></div>
          </div>
        </section>

        <section className="db-panel db-props" aria-label="My sources">
          <div className="db-p-head">
            <div><h2>My sources</h2><p>{sources.length} in this workspace</p></div>
            <div className="db-p-act"><Link className="db-cta db-cta-sm" to="/app/sources">+ Add source</Link></div>
          </div>
          {sourceList.length? <div className="db-prop-list">
            {sourceList.map(s=>{
              const tone=s.status==="ready"?"up":s.status==="failed"?"down":s.status==="processing"?"warn":"zero";
              return <Link className="db-prop" key={s.id} to="/app/sources">
                <span className={`db-prop-ic k-${s.kind}`}>{KIND_ICON[s.kind]}</span>
                <div className="db-prop-main">
                  <b title={s.title}>{s.title}</b>
                  <Delta tone={tone}>{s.status==="ready"?"ready":s.status.replace("_"," ")}</Delta>
                </div>
                <div className="db-prop-val"><b>{s.chunks?.length??0}</b><span>chunks{s.durationMs?` · ${(s.durationMs/1000).toFixed(1)}s`:""}</span></div>
              </Link>;
            })}
          </div> : <Empty title="No sources yet" body="Upload a PDF, URL or dataset to start."/>}
        </section>
      </aside>
    </div>

    <section className="db-ribbon" aria-label="Corpus and workflow quality signals">
      <div><span>Metadata completeness</span><b>{nodes.length?completeness+"%":"—"}</b></div>
      <div><span>Ingest success</span><b>{ingestDone.length?ingestRate+"%":"—"}</b></div>
      <div><span>Approval rate</span><b>{ap.total?ap.rate+"%":"—"}</b></div>
      <div><span>Agent confidence</span><b>{conf?conf.mean.toFixed(2):"—"}</b></div>
      <div><span>Graph clusters</span><b>{nodes.length?gm.components:"—"}</b></div>
    </section>

    <section className="db-row g3">
      <Panel id="db-corpus" title="Corpus composition" sub={`${nodes.length} nodes across ${byType.length} types`} action={<Link className="db-link" to={canvasTo}>Canvas</Link>}>
        {byType.length? <>
          <RankBars items={byType}/>
          <p className="db-note"><b>{byType[0].name}</b> lead the graph at {Math.round(byType[0].value/Math.max(nodes.length,1)*100)}% of all nodes.</p>
        </>:<Empty title="Empty graph" body="Create nodes on the canvas to see the composition."/>}
      </Panel>

      <Panel id="db-statistics" title="Run statistics" sub={runs.length?`Descriptive summary across ${runs.length} run${runs.length>1?"s":""}`:"No measurements yet"}>
        {metricRows.length? <>
          <table className="db-tbl">
            <thead><tr><th>Metric</th><th>n</th><th>Mean</th><th>Median</th><th>SD</th><th>Range</th></tr></thead>
            <tbody>{metricRows.map(r=><tr key={r.key}><td>{r.label}</td><td className="muted">{r.n}</td><td><b>{r.mean}</b></td><td>{r.median}</td><td className="muted">{r.sd}</td><td>{r.range}</td></tr>)}</tbody>
          </table>
          <p className="db-note">SD is the sample standard deviation (n−1) — a small SD means the run is reproducible, not just good.</p>
        </>:<Empty title="No run metrics" body="Approve a plan and execute it to collect accuracy, F1 and loss." action={<Link className="btn btn-primary btn-sm" to="/app/experiments">Open lab</Link>}/>}
      </Panel>

      <Panel title="Agent workload" sub={agents.length?`${agents.length} tasks · ${ap.total?ap.rate+"% approved":"no approvals yet"}`:"No agent tasks yet"} action={<Link className="db-link" to="/app/agents">Control center</Link>}>
        {agents.length? <>
          <div className="db-statusbar" role="img" aria-label="Agent tasks by status">
            {statusCounts.completed>0&&<i style={{flex:statusCounts.completed,background:"#6FD08C"}}/>}
            {statusCounts.running>0&&<i style={{flex:statusCounts.running,background:"#E8DFD0"}}/>}
            {statusCounts.waiting_approval>0&&<i style={{flex:statusCounts.waiting_approval,background:"#F0C85A"}}/>}
            {statusCounts.failed>0&&<i style={{flex:statusCounts.failed,background:"#E07A6A"}}/>}
            {statusCounts.other>0&&<i style={{flex:statusCounts.other,background:"#6B6F67"}}/>}
          </div>
          <div className="db-sb-legend">
            {[["completed","Completed","#6FD08C"],["running","Running","#E8DFD0"],["waiting_approval","Awaiting approval","#F0C85A"],["failed","Failed","#E07A6A"]].map(([k,l,c])=>
              statusCounts[k as keyof typeof statusCounts]?<span key={k}><i style={{background:c}}/>{l} {statusCounts[k as keyof typeof statusCounts]}</span>:null)}
          </div>
          <div className="db-agents">
            {recentAgents.map(a=><div className="db-agent" key={a.id}>
              <div className="db-agent-main"><b>{AGENT_LABEL[a.agent]||a.agent}</b><span>{a.task}</span></div>
              {typeof a.confidence==="number"&&<span className="db-conf">{Math.round(a.confidence*100)}%</span>}
              <Badge tone={statusTone(a.status)}>{a.status.replace("_"," ")}</Badge>
            </div>)}
          </div>
          <div className="db-footrow"><span>Mean confidence <b>{conf?conf.mean.toFixed(2):"—"}</b></span><span>Approved <b>{ap.approved}/{ap.total}</b></span></div>
        </>:<Empty title="No agent tasks" body="Ask Paper Reader to analyze your first paper."/>}
      </Panel>
    </section>

    <section className="db-row g2">
      <Panel title="Needs attention" sub="Derived from graph gaps, failures and pending reviews">
        {attention.length? <div className="db-attn">
          {attention.map(a=><Link key={a.label} className={`db-attn-item ${a.tone}`} to={a.to}>
            <span className="n">{a.n}</span><div><p>{a.label}</p><small>{a.hint}</small></div><span className="go">{a.cta} →</span>
          </Link>)}
        </div>:<div className={`db-clear${totalItems?"":" muted"}`}>{totalItems?"✓ All clear — no blockers detected.":"Nothing to review yet — add a source or node."}</div>}
        {gm.isolated.length>0&&<div className="db-isolated">
          <span className="db-isolated-h">Unlinked nodes</span>
          {gm.isolated.slice(0,4).map(n=><Link key={n.id} className="db-iso" to={canvasTo}>
            <i/>{n.title}<em>{TYPE_LABEL[n.type]||n.type}</em>
          </Link>)}
          {gm.isolated.length>4&&<span className="db-iso-more">+{gm.isolated.length-4} more on the canvas</span>}
        </div>}
        {totalItems>0&&<ul className="db-checks">
          {checks.map(c=><li key={c.label} className={c.ok?"":"pending"}><span className="tick">{c.ok?"✓":"!"}</span><span>{c.label}</span><b>{c.value}</b></li>)}
        </ul>}
      </Panel>

      <Panel title="Recent activity" sub={`${(()=>{const n=acts.filter(a=>inRange(a.createdAt)).length; return `${n} event${n===1?"":"s"} in the selected range`;})()}`} action={<Link className="db-link" to="/app/collaboration">History</Link>}>
        {acts.length? <ol className="db-tl">
          {acts.slice(0,7).map((a:Activity)=><li key={a.id}><span className={`dot ${a.kind}`}/><div><p>{a.text}</p><time>{rel(a.createdAt)}</time></div></li>)}
        </ol>:<Empty title="Quiet so far" body="Activity appears as you add sources, run agents and connect nodes."/>}
      </Panel>
    </section>

    {open&&<Modal onClose={()=>setOpen(false)}>
      <h3 style={{margin:"0 0 4px",fontSize:18}}>New workspace</h3>
      <p style={{margin:"0 0 6px",fontSize:12.5,color:"var(--muted)"}}>Workspaces keep graphs, sources and runs isolated from one another.</p>
      <label className="lbl" htmlFor="ws-name">Name</label>
      <input id="ws-name" className="input" autoFocus value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Protein folding study" onKeyDown={e=>{if(e.key==="Enter")create();}}/>
      <label className="lbl" htmlFor="ws-desc">Description</label>
      <textarea id="ws-desc" className="textarea" rows={3} value={draft.desc} onChange={e=>setDraft({...draft,desc:e.target.value})} placeholder="What are you investigating?"/>
      <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>setOpen(false)}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={!draft.name.trim()}>Create workspace</button>
      </div>
    </Modal>}
  </div>;
}

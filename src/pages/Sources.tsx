import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { Empty } from "../components/ui";
import { Donut } from "../components/Charts";
import { median, pct, srcSuccess } from "../lib/analytics";
import { titleFromFilename } from "../lib/text";
import type { ParsedPdf } from "../lib/pdf";
import type { Source, SourceKind } from "../lib/types";
import "../styles/sources.css";

const KIND_ORDER:SourceKind[]=["pdf","url","github","dataset","note"];
const KIND_LABEL:Record<SourceKind,string>={pdf:"Paper",url:"Web page",github:"Repository",dataset:"Dataset",note:"Note"};
const KIND_NOUN:Record<SourceKind,string>={pdf:"PDF papers",url:"Web pages",github:"Code repos",dataset:"Datasets",note:"Research notes"};
const KIND_HINT:Record<SourceKind,string>={pdf:"PDF + text",url:"Public link",github:"Repo URL",dataset:"Metadata record",note:"Free text"};
const STATE:Record<Source["status"],{label:string;tone:string}>={
  ready:{label:"Ready",tone:"ok"},
  processing:{label:"Processing",tone:"busy"},
  queued:{label:"Queued",tone:"warn"},
  failed:{label:"Failed",tone:"bad"},
};
const KIND_COLOR:Record<SourceKind,string>={pdf:"#F0B49C",url:"#A9C6FF",github:"#CBBDF5",dataset:"#A8E7B8",note:"#E8DFD0"};

type DraftSource=Omit<Source,"id"|"createdAt"|"progress"|"status"|"workspaceId"> & {fileText?:string};

const rel=(iso:string)=>{
  const s=Math.max(0,Math.round((Date.now()-+new Date(iso))/1000));
  if(s<60) return "just now";
  const m=Math.round(s/60); if(m<60) return m+"m ago";
  const h=Math.round(m/60); if(h<24) return h+"h ago";
  const d=Math.round(h/24); if(d<30) return d+"d ago";
  return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
};
const fullDate=(iso:string)=>new Date(iso).toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const fmtDuration=(ms?:number)=>{
  if(!ms) return "—";
  return ms<1000?ms+" ms":(ms/1000).toFixed(ms<10000?1:0)+" s";
};
const num=(v:number)=>v.toLocaleString("en-GB");

function KindGlyph({kind}:{kind:SourceKind}){
  if(kind==="pdf") return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 2.5h5L14.5 7v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M10 2.5V7h4.5"/><path d="M6.6 10.6h4.8M6.6 13h3.2"/>
  </svg>;
  if(kind==="url") return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="9" r="6.4"/><path d="M2.6 9h12.8M9 2.6c1.9 1.9 2.8 4.1 2.8 6.4S10.9 13.5 9 15.4C7.1 13.5 6.2 11.3 6.2 9S7.1 4.5 9 2.6Z"/>
  </svg>;
  if(kind==="github") return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="4.6" r="1.9"/><circle cx="5" cy="13.4" r="1.9"/><circle cx="13" cy="9" r="1.9"/><path d="M5 6.5v4.9M6.7 5.6l4.6 2.6"/>
  </svg>;
  if(kind==="dataset") return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="9" cy="4.8" rx="5.6" ry="2.2"/><path d="M3.4 4.8v8.4c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V4.8"/><path d="M3.4 9c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2"/>
  </svg>;
  return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 3.5h8l3 3v8a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"/><path d="M11 3.5V7h3M6 10h6M6 12.6h4"/>
  </svg>;
}

const S={
  docs:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2.5h5L14.5 7v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M10 2.5V7h4.5"/></svg>,
  layers:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 2.6 15.4 6 9 9.4 2.6 6 9 2.6Z"/><path d="m2.6 9.4 6.4 3.4 6.4-3.4M2.6 12.6 9 16l6.4-3.4"/></svg>,
  link:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="4.6" cy="9" r="2.1"/><circle cx="13.4" cy="4.6" r="2.1"/><circle cx="13.4" cy="13.4" r="2.1"/><path d="M6.5 8 11.6 5.3M6.5 10l5.1 2.7"/></svg>,
  check:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="6.4"/><path d="m6 9.2 2.1 2.1L12.2 7"/></svg>,
  search:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m11.8 11.8 3.4 3.4"/></svg>,
  upload:<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11.5V3.2M6 6.1 9 3.2l3 2.9"/><path d="M3.4 11.4v2.4a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1v-2.4"/></svg>,
};

function Delta({tone="zero",children}:{tone?:"up"|"down"|"warn"|"zero";children:React.ReactNode}){
  return <span className={`src-delta ${tone}`}>
    {tone==="up"&&<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.6 8.6 6 5.2l3.4 3.4"/><path d="M6 5.4v5"/></svg>}
    {tone==="down"&&<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.6 3.4 6 6.8l3.4-3.4"/><path d="M6 6.6v5"/></svg>}
    {children}
  </span>;
}

function useDialog(onClose:()=>void){
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",onKey);
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{ window.removeEventListener("keydown",onKey); document.body.style.overflow=prev; };
  },[onClose]);
}

export default function Sources(){
  const activeWs=useStore(s=>s.activeWs);
  const ws=useStore(s=>s.workspaces.find(w=>w.id===s.activeWs));
  const user=useStore(s=>s.users.find(u=>u.id===s.sessionUserId));
  const me=useStore(s=>s.sessionUserId);
  const memberships=useStore(s=>s.memberships);
  const allSources=useStore(s=>s.sources);
  const sources=useMemo(()=>allSources.filter(x=>x.workspaceId===activeWs),[allSources,activeWs]);
  const add=useStore(s=>s.addSource);

  const [kind,setKind]=useState<"all"|SourceKind>("all");
  const [status,setStatus]=useState<"all"|"ready"|"pipeline">("all");
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const [sel,setSel]=useState<string|null>(null);
  const [view,setView]=useState<"grid"|"list">("grid");

  const term=q.trim().toLowerCase();
  const filtered=useMemo(()=>sources.filter(s=>{
    if(status==="ready"&&s.status!=="ready") return false;
    if(status==="pipeline"&&s.status!=="queued"&&s.status!=="processing") return false;
    if(kind!=="all"&&s.kind!==kind) return false;
    if(!term) return true;
    const haystack=s.title+" "+(s.authors||"")+" "+(s.abstract||"")+" "+s.tags.join(" ")+" "+(s.chunks?.map(c=>c.text).join(" ")||"");
    return haystack.toLowerCase().includes(term);
  }).sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt)),[sources,status,kind,term]);
  const detail=sources.find(x=>x.id===sel);

  const kinds=useMemo(()=>{
    const m=new Map<SourceKind,number>();
    sources.forEach(s=>m.set(s.kind,(m.get(s.kind)||0)+1));
    return m;
  },[sources]);
  const byKind=useMemo(()=>KIND_ORDER.map(k=>({kind:k,name:KIND_NOUN[k],value:kinds.get(k)||0})).filter(k=>k.value>0),[kinds]);

  const success=srcSuccess(sources);
  const passages=sources.reduce((a,s)=>a+(s.chunks?.length||0),0);
  const chunked=sources.filter(s=>s.chunks?.length).length;
  const linked=sources.filter(s=>s.nodeId).length;
  const newThisWeek=sources.filter(s=>+new Date(s.createdAt)>Date.now()-7*864e5).length;
  const ingestMs=median(sources.map(s=>s.durationMs||0).filter(v=>v>0));
  const inFlight=sources.filter(s=>s.status==="queued"||s.status==="processing").length;
  const ready=sources.filter(s=>s.status==="ready").length;
  const failed=success.total-success.ok;
  const linkedRate=sources.length?pct(linked,sources.length):0;

  const intake=useMemo(()=>sources.filter(s=>s.durationMs).sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt)).slice(-6),[sources]);
  const intakeMax=Math.max(...intake.map(s=>s.durationMs||0),1);
  const intakeFast=Math.min(...intake.map(s=>s.durationMs||0));
  const intakeSlow=Math.max(...intake.map(s=>s.durationMs||0));

  const recent=useMemo(()=>[...sources].sort((a,b)=>+new Date(b.createdAt)-+new Date(a.createdAt)).slice(0,6),[sources]);
  const memberCount=memberships.filter(m=>m.workspaceId===activeWs).length;
  const role=memberships.find(m=>m.workspaceId===activeWs&&m.userId===me)?.role;
  const initials=(user?.name||"R").split(/\s+/).map(p=>p[0]).slice(0,2).join("").toUpperCase();
  const joinDate=new Date(user?.createdAt||ws?.createdAt||Date.now()).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});

  return <div className="src-lib">
    <header className="src-head">
      <div className="src-head-top">
        <div>
          <div className="src-eyebrow"><span>{ws?.name||"Workspace"}</span></div>
          <h1 className="src-h1">Source library</h1>
        </div>
        <nav className="src-tabs" aria-label="Filter sources by status">
          {([["all","All sources",sources.length],["ready","Ready",ready],["pipeline","In pipeline",inFlight]] as const).map(([key,label,count])=>
            <button key={key} className={status===key?"on":""} aria-pressed={status===key} aria-label={`${label}, ${count}`} onClick={()=>setStatus(key)}>
              {label}<em>{count}</em>
            </button>)}
        </nav>
      </div>
      <p className="src-sub">Papers, PDFs, links, repositories, datasets and notes — text is extracted locally into page-referenced passages, then synced to a graph node.</p>
    </header>

    <div className="src-layout">
      <div className="src-main">
        <section className="src-stats" aria-label="Library summary">
          <article className="src-stat">
            <span className="src-stat-lbl"><span className="src-stat-ic">{S.docs}</span>Sources indexed</span>
            <div className="src-stat-row"><b>{sources.length}</b><Delta tone={newThisWeek?"up":"zero"}>+{newThisWeek} this week</Delta></div>
            <span className="src-stat-foot">{inFlight?`${inFlight} in pipeline`:"Pipeline idle"}<span>·</span>{kinds.size} source types</span>
          </article>
          <article className="src-stat">
            <span className="src-stat-lbl"><span className="src-stat-ic">{S.layers}</span>Passages extracted</span>
            <div className="src-stat-row"><b>{passages}</b><Delta>{chunked} {chunked===1?"doc":"docs"} with text</Delta></div>
            <span className="src-stat-foot">{sources.length?`${Math.round((chunked/Math.max(1,sources.length))*100)}% of sources parsed`:"No documents parsed yet"}</span>
          </article>
          <article className="src-stat">
            <span className="src-stat-lbl"><span className="src-stat-ic">{S.link}</span>Synced to graph</span>
            <div className="src-stat-row"><b>{sources.length?linkedRate:0}<small>%</small></b><Delta tone={linkedRate>=80?"up":linkedRate?"warn":"zero"}>{linked} linked</Delta></div>
            <span className="src-stat-foot">{linked} of {sources.length} sources have a node</span>
          </article>
          <article className="src-stat">
            <span className="src-stat-lbl"><span className="src-stat-ic">{S.check}</span>Ingest success</span>
            <div className="src-stat-row"><b>{success.total?success.rate:"—"}{success.total?<small>%</small>:null}</b><Delta tone={failed?"down":success.total?"up":"zero"}>{success.total?`${success.ok} ready · ${failed} failed`:"no finished ingests"}</Delta></div>
            <span className="src-stat-foot" title="Ready ÷ (ready + failed). Queued and processing sources are excluded.">{ingestMs?`Median ingest ${fmtDuration(ingestMs)}`:"Queued and processing are excluded"}</span>
          </article>
        </section>

        <div className="src-pair">
          <section className="src-panel" aria-labelledby="src-activity-title">
            <div className="src-p-head">
              <div><h2 id="src-activity-title">Ingest time</h2><p>Extraction time per source</p></div>
              <span className="src-p-badge">Latest {intake.length||0}</span>
            </div>
            {intake.length? <div className="src-bars" role="img" aria-label={intake.map(m=>`${m.title}: ${fmtDuration(m.durationMs)}`).join(", ")}>
              {intake.map((m,i)=><div key={m.id} className={`src-bar-col${i===intake.length-1?" on":""}`} title={`${m.title} · ${fmtDuration(m.durationMs)}`}>
                <div className="src-bar-track"><i style={{height:`${Math.max(2,Math.round((m.durationMs||0)/intakeMax*100))}%`}}/></div>
                <span className="m">{KIND_LABEL[m.kind]}</span>
              </div>)}
            </div> : <div className="src-inline-empty">Ingest a source to record extraction time.</div>}
            <div className="src-footrow">
              <span>Latest <b>{intake.length?fmtDuration(intake[intake.length-1].durationMs):"—"}</b></span>
              <span>Fastest <b>{intake.length?fmtDuration(intakeFast):"—"}</b></span>
              <span>Slowest <b>{intake.length?fmtDuration(intakeSlow):"—"}</b></span>
            </div>
          </section>

          <section className="src-panel" aria-labelledby="src-mix-title">
            <div className="src-p-head">
              <div><h2 id="src-mix-title">Source mix</h2><p>{sources.length} sources · {passages} passages</p></div>
            </div>
            {sources.length? <>
              <div className="src-mix">
                <Donut data={byKind} colors={byKind.map(k=>KIND_COLOR[k.kind])} height={196} center={{value:String(sources.length),label:"sources"}}/>
                <div className="src-legend">
                  {byKind.map(k=><div key={k.name}>
                    <i style={{background:KIND_COLOR[k.kind]}}/><span className="nm">{k.name}</span><b>{k.value}</b><em>{Math.round(k.value/Math.max(1,sources.length)*100)}%</em>
                  </div>)}
                </div>
              </div>
              <div className="src-footrow"><span>Linked <b>{linked}</b></span><span>With text <b>{chunked}</b></span><span>Failed <b>{failed}</b></span></div>
            </> : <div className="src-inline-empty">Add a source to see the library mix.</div>}
          </section>
        </div>

        <section className="src-panel src-browser" aria-labelledby="src-browser-title">
          <div className="src-p-head">
            <div><h2 id="src-browser-title">All sources</h2><p>{filtered.length} of {sources.length} shown · {passages} passages indexed</p></div>
            <div className="src-browser-act">
              <div className="src-search">
                {S.search}
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search titles, authors, tags, passages…" aria-label="Search the source library"/>
                {q&&<button className="src-search-x" aria-label="Clear search" onClick={()=>setQ("")}>×</button>}
              </div>
              <div className="src-view" role="group" aria-label="Library layout">
                {(["grid","list"] as const).map(v=>
                  <button key={v} className={view===v?"on":""} aria-pressed={view===v} onClick={()=>setView(v)}>{v==="grid"?"Grid":"List"}</button>)}
              </div>
              <button className="src-cta" onClick={()=>setOpen(true)}>+ Add source</button>
            </div>
          </div>

          <div className="src-toolbar">
            <div className="src-chips" role="group" aria-label="Filter by source type">
              <button className={`src-chip${kind==="all"?" on":""}`} aria-pressed={kind==="all"} onClick={()=>setKind("all")}>All <em>{sources.length}</em></button>
              {KIND_ORDER.map(k=>
                <button key={k} className={`src-chip${kind===k?" on":""}`} aria-pressed={kind===k} onClick={()=>setKind(k)}>
                  {KIND_NOUN[k]} <em>{kinds.get(k)||0}</em>
                </button>)}
            </div>
            <span className="src-count">{filtered.length} of {sources.length} shown</span>
          </div>

          {!filtered.length
            ? <div className="src-empty-wrap">
                {sources.length
                  ? <Empty title="No sources match" body="Try another type, status or search term — the library filters titles, authors, summaries, tags and extracted passages."
                      action={<button className="src-cta" onClick={()=>{setQ("");setKind("all");setStatus("all");}}>Reset filters</button>}/>
                  : <Empty title="Your library is empty" body="Add a paper, link, repository, dataset or note — extraction produces page-referenced passages and one graph node."
                      action={<button className="src-cta" onClick={()=>setOpen(true)}>Add your first source</button>}/>}
              </div>
            : view==="grid"
              ? <div className="src-grid">
                  {filtered.map(x=>{
                    const state=STATE[x.status];
                    const meta=[x.pages?`${x.pages} pages`:null,x.chunks?.length?`${x.chunks.length} passage${x.chunks.length===1?"":"s"}`:"no passages",x.durationMs?fmtDuration(x.durationMs):null].filter(Boolean).join(" · ");
                    return <article key={x.id} className={`src-card${x.status==="failed"?" failed":""}`}>
                      <div className="src-card-head">
                        <span className={`src-kind k-${x.kind}`}><KindGlyph kind={x.kind}/></span>
                        <div className="src-card-id">
                          <h3 title={x.title}>{x.title}</h3>
                          <p>{x.authors?`${x.authors} · `:""}{KIND_LABEL[x.kind]} · {rel(x.createdAt)}</p>
                        </div>
                        <span className={`src-state ${state.tone}`}><i/>{state.label}</span>
                      </div>
                      <p className={`src-abs${x.abstract?"":" empty"}`}>{x.abstract||"No summary yet — inspect to see extracted passages."}</p>
                      {x.tags.length>0&&<div className="src-tags">{x.tags.slice(0,4).map(t=><span key={t} className="src-tag">{t}</span>)}{x.tags.length>4&&<span className="src-tag">+{x.tags.length-4}</span>}</div>}
                      {x.status==="processing"&&<div className="src-prog"><span><em style={{fontStyle:"normal"}}>Extracting text</em><b>{x.progress}%</b></span><div className="src-bar"><i style={{width:x.progress+"%"}}/></div></div>}
                      <div className="src-card-foot">
                        <span className="src-meta">{meta}</span>
                        <div className="src-card-actions">
                          <button className="src-btn" aria-label={`Inspect ${x.title}`} onClick={()=>setSel(x.id)}>Inspect</button>
                          {x.url&&<a className="src-btn quiet" href={x.url} target="_blank" rel="noreferrer" aria-label={`Open ${x.title}`}>Open <span className="ext">↗</span></a>}
                        </div>
                      </div>
                    </article>;
                  })}
                </div>
              : <div className="src-list">
                  <div className="src-row head" aria-hidden="true">
                    <span/><span>Source</span><span>Type</span><span>Status</span><span className="sr">Passages</span><span className="sr added">Added</span><span/>
                  </div>
                  {filtered.map(x=>{
                    const state=STATE[x.status];
                    return <div key={x.id} className="src-row">
                      <span className={`src-kind k-${x.kind}`}><KindGlyph kind={x.kind}/></span>
                      <div className="src-row-main">
                        <b title={x.title}>{x.title}</b>
                        <span>{x.abstract||x.url||"No summary yet."}</span>
                      </div>
                      <span className="src-row-type">{KIND_LABEL[x.kind]}</span>
                      <span className={`src-state ${state.tone}`}><i/>{state.label}</span>
                      <span className="src-row-meta">{x.chunks?.length||0}</span>
                      <span className="src-row-meta added">{rel(x.createdAt)}</span>
                      <button className="src-btn" aria-label={`Inspect ${x.title}`} onClick={()=>setSel(x.id)}>Inspect</button>
                    </div>;
                  })}
                </div>}
        </section>
      </div>

      <aside className="src-rail" aria-label="Workspace and recent sources">
        <section className="src-profile" aria-label="Workspace account">
          <div className="src-profile-top">
            <span className="src-avatar">{initials}</span>
            <div>
              <b>{user?.name||"Researcher"}</b>
              <span><i className="src-star" aria-hidden>★</i> {role?role[0].toUpperCase()+role.slice(1):"Member"} · {memberCount} member{memberCount===1?"":"s"}</span>
            </div>
          </div>
          <dl className="src-info">
            <div><dt>Email</dt><dd title={user?.email}>{user?.email||"—"}</dd></div>
            <div><dt>Workspace</dt><dd title={ws?.name}>{ws?.name||"—"}</dd></div>
            <div><dt>Joined</dt><dd>{joinDate}</dd></div>
            <div><dt>Sources</dt><dd className="src-info-total">{sources.length} <Delta tone={newThisWeek?"up":"zero"}>+{newThisWeek}</Delta></dd></div>
          </dl>
          <div className="src-health">
            <div><span>Graph sync</span><b>{linkedRate}% linked</b></div>
            <div className="src-health-bar" aria-hidden><i style={{width:Math.min(100,linkedRate)+"%"}}/></div>
          </div>
        </section>

        <section className="src-panel src-recent" aria-label="Recent sources">
          <div className="src-p-head">
            <div><h2>My sources</h2><p>{sources.length} in this workspace</p></div>
            <div className="src-p-act"><button className="src-link" onClick={()=>setOpen(true)}>+ Add source</button></div>
          </div>
          {recent.length? <div className="src-recent-list">
            {recent.map(x=><button type="button" key={x.id} className="src-recent-row" onClick={()=>setSel(x.id)}>
              <span className={`src-kind k-${x.kind}`}><KindGlyph kind={x.kind}/></span>
              <span className="src-recent-main"><b title={x.title}>{x.title}</b><span className={`src-recent-state ${STATE[x.status].tone}`}>{STATE[x.status].label} · {rel(x.createdAt)}</span></span>
              <span className="src-recent-val"><b>{x.chunks?.length||0}</b><span>passages</span></span>
            </button>)}
          </div> : <div className="src-inline-empty">No sources yet — add one to start the library.</div>}
        </section>
      </aside>
    </div>

    {open&&<AddSource onClose={()=>setOpen(false)} onAdd={add}/>}
    {detail&&<SourceSheet source={detail} onClose={()=>setSel(null)}/>}
  </div>;
}

function SourceSheet({source:s,onClose}:{source:Source;onClose:()=>void}){
  useDialog(onClose);
  const state=STATE[s.status];
  return <div className="overlay src-overlay" onClick={onClose}>
    <aside className="src-sheet" role="dialog" aria-modal="true" aria-labelledby="src-sheet-title" onClick={e=>e.stopPropagation()}>
      <header className="src-sheet-head">
        <span className={`src-kind lg k-${s.kind}`}><KindGlyph kind={s.kind}/></span>
        <div>
          <div className="src-sheet-kicker">{KIND_LABEL[s.kind]}<span className={`src-state ${state.tone}`}><i/>{state.label}</span></div>
          <h2 id="src-sheet-title">{s.title}</h2>
        </div>
        <button className="src-x" aria-label="Close details" onClick={onClose}>×</button>
      </header>
      <div className="src-sheet-body">
        {s.status==="processing"&&<div className="src-processing">
          <span>Extracting passages<b>{s.progress}%</b></span>
          <div className="src-bar"><i style={{width:s.progress+"%"}}/></div>
        </div>}
        {s.error&&<div className="src-error" role="alert"><div><b>Ingestion failed</b>{s.error}</div></div>}
        <dl className="src-meta-grid">
          <div><dt>Type</dt><dd>{KIND_NOUN[s.kind]}</dd></div>
          <div><dt>Authors</dt><dd>{s.authors||"—"}</dd></div>
          <div><dt>Added</dt><dd>{fullDate(s.createdAt)}</dd></div>
          <div><dt>Ingest time</dt><dd>{s.status==="processing"?"in progress":fmtDuration(s.durationMs)}</dd></div>
          <div><dt>Passages</dt><dd>{s.chunks?.length||0}</dd></div>
          {s.pages?<div><dt>Pages</dt><dd>{num(s.pages)}</dd></div>:null}
          {s.charCount?<div><dt>Characters</dt><dd>{num(s.charCount)}</dd></div>:null}
          <div><dt>Graph node</dt><dd className={s.nodeId?"code":""}>{s.nodeId||"pending"}</dd></div>
        </dl>
        <section className="src-sec">
          <h4>Abstract / summary <em>AI-labelled where generated</em></h4>
          <p className={s.abstract?"":"muted"}>{s.abstract||"No summary has been generated for this source yet."}</p>
        </section>
        <section className="src-sec">
          <h4>Passages <em>with page references</em></h4>
          {s.chunks?.length
            ? <div className="src-passages">{s.chunks.map((c,i)=><div key={i} className="src-passage">
                <span className="pg">p. {c.page}</span><p>{c.text}</p>
              </div>)}</div>
            : <p className="muted">{s.status==="failed"?"No text could be extracted from this source.":"No extracted passages yet — the pipeline writes them when ingestion finishes."}</p>}
        </section>
        {s.truncated&&<section className="src-sec">
          <h4>Storage note</h4>
          <p className="muted">Long document: text after the local storage cap is not indexed. Only the stored passages are searchable.</p>
        </section>}
        <section className="src-sec">
          <h4>Provenance</h4>
          <p className="muted">Text was extracted locally from the uploaded document; methodology is recorded on the linked graph node {s.nodeId||"(pending)"}. Records still need validation before they are used as evidence.</p>
        </section>
      </div>
      <footer className="src-sheet-foot">
        {s.url?<a className="btn btn-primary btn-sm" href={s.url} target="_blank" rel="noreferrer">Open source ↗</a>:<span className="src-meta">Stored in this workspace</span>}
        <button className="btn btn-ghost btn-sm spacer" onClick={onClose}>Close</button>
      </footer>
    </aside>
  </div>;
}

function AddSource({onClose,onAdd}:{onClose:()=>void;onAdd:(s:DraftSource)=>void}){
  useDialog(onClose);
  const [kind,setKind]=useState<SourceKind>("pdf");
  const [title,setTitle]=useState("");
  const [url,setUrl]=useState("");
  const [tags,setTags]=useState("");
  const [text,setText]=useState("");
  const [fileName,setFileName]=useState("");
  const [parsed,setParsed]=useState<ParsedPdf|null>(null);
  const [busy,setBusy]=useState(false);
  const [parsePct,setParsePct]=useState(0);
  const [error,setError]=useState<string|null>(null);
  const titleTouched=useRef(false);

  const body=kind==="pdf"?(parsed?.text||text):kind==="note"?text:undefined;
  const canIngest=!!title.trim()&&!busy&&(kind!=="pdf"||!!parsed||!!text.trim());

  async function pick(f:File|undefined){
    if(!f) return;
    setError(null); setParsed(null); setParsePct(0); setFileName(f.name);
    if(!titleTouched.current) setTitle(titleFromFilename(f.name));
    if(!/\.pdf$/i.test(f.name)&&f.type!=="application/pdf"){setError("Choose a PDF file (.pdf).");return;}
    if(f.size>40*1024*1024){setError("PDFs up to 40 MB are supported. Split larger files first.");return;}
    setBusy(true);
    try{
      const {parsePdf}=await import("../lib/pdf");
      const r=await parsePdf(f,p=>setParsePct(p));
      if(!r.charCount||!r.chunks.length) throw new Error("No selectable text found. This looks like a scanned/image-only PDF — paste the text below or run OCR first.");
      setParsed(r);
      if(!titleTouched.current) setTitle(r.title||titleFromFilename(f.name));
      setParsePct(100);
    }catch(err){
      setError(err instanceof Error?err.message:"Could not read the PDF.");
    }finally{setBusy(false);}
  }

  const resetFile=()=>{ setParsed(null); setFileName(""); setParsePct(0); setText(""); setError(null); };

  function submit(){
    if(!canIngest) return;
    onAdd({
      kind,
      title:title.trim(),
      authors:parsed?.author,
      url:(kind==="url"||kind==="github")?url.trim()||undefined:undefined,
      tags:tags.split(",").map(t=>t.trim()).filter(Boolean),
      fileText:body,
      chunks:parsed?.chunks,
      pages:parsed?.pageCount,
      charCount:parsed?.charCount,
      truncated:parsed?.truncated,
    });
    onClose();
  }

  return <div className="overlay" onClick={onClose}>
    <div className="modal src-modal" role="dialog" aria-modal="true" aria-labelledby="src-add-title" onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{flex:1}}>
          <h2 id="src-add-title">Add a source</h2>
          <p className="intro">Pick what you are adding. Text is extracted in your browser, split into passages and summarised into one node on the canvas.</p>
        </div>
        <button className="src-x" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <div className="src-kinds" role="radiogroup" aria-label="Source type">
        {KIND_ORDER.map(k=><button key={k} type="button" role="radio" aria-checked={kind===k} className={`src-kindcard${kind===k?" on":""}`} onClick={()=>setKind(k)}>
          <span className={`src-kind k-${k}`}><KindGlyph kind={k}/></span>
          <b>{KIND_LABEL[k]}</b><em>{KIND_HINT[k]}</em>
        </button>)}
      </div>

      <div className="src-form">
        <div className="full">
          <label className="lbl" htmlFor="src-title">Title</label>
          <input id="src-title" className="input" autoFocus value={title} onChange={e=>{titleTouched.current=true;setTitle(e.target.value);}} placeholder="Paper, dataset, repository or note name"/>
        </div>

        {(kind==="url"||kind==="github")&&<div className="full">
          <label className="lbl" htmlFor="src-url">URL</label>
          <input id="src-url" className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder={kind==="github"?"https://github.com/org/repo":"https://…"}/>
        </div>}

        {kind==="pdf"&&<div className="full">
          <label className="lbl">Document</label>
          {parsed
            ? <div className="src-parsed">
                <div className="src-parsed-stats">
                  <div><b>{num(parsed.pageCount)}</b><span>pages</span></div>
                  <div><b>{num(parsed.charCount)}</b><span>characters</span></div>
                  <div><b>{parsed.chunks.length}</b><span>passages</span></div>
                </div>
                <p>Extracted locally from {fileName}. The file stays on this device.</p>
                {parsed.truncated&&<p className="trunc">Long document: only the first {parsed.chunks.length} passages are indexed for search.</p>}
                <button className="btn btn-ghost btn-sm" onClick={resetFile}>Remove file</button>
              </div>
            : <>
                <label className="src-drop">
                  <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>pick(e.target.files?.[0])}/>
                  <span className="drop-ic">{S.upload}</span>
                  <span><b>{busy?"Reading the document…":"Choose a PDF file"}</b><span>Up to 40 MB · parsed locally, never uploaded</span></span>
                  {fileName&&!busy&&<span className="picked" title={fileName}>{fileName}</span>}
                </label>
                {busy&&<div className="src-processing" style={{marginTop:8}}>
                  <span>Extracting text in your browser<b>{parsePct}%</b></span>
                  <div className="src-bar"><i style={{width:parsePct+"%"}}/></div>
                </div>}
                {error&&<div className="src-error" role="alert" style={{marginTop:8}}><div><b>Could not extract text</b>{error}</div></div>}
                <label className="lbl" htmlFor="src-paste">Or paste text <span style={{fontWeight:500,textTransform:"none",letterSpacing:0,color:"#8E8C85"}}>(fallback for scanned PDFs)</span></label>
                <textarea id="src-paste" className="textarea" rows={4} value={text} onChange={e=>setText(e.target.value)} placeholder="Paste a few paragraphs from the PDF…"/>
                <span className="src-hintline">Selectable text only. Scanned pages need OCR, which runs in the production backend.</span>
              </>}
        </div>}

        {kind==="note"&&<div className="full">
          <label className="lbl" htmlFor="src-note">Note text</label>
          <textarea id="src-note" className="textarea" rows={4} value={text} onChange={e=>setText(e.target.value)} placeholder="Write or paste the note — it is indexed for discovery and becomes the node description."/>
        </div>}

        <div className="full">
          <label className="lbl" htmlFor="src-tags">Tags</label>
          <input id="src-tags" className="input" value={tags} onChange={e=>setTags(e.target.value)} placeholder="cnn, plant"/>
          <span className="src-hintline">Comma-separated. Tags become graph metadata and drive discovery search.</span>
        </div>
      </div>

      <div className="src-modal-foot">
        <span className="note">{kind==="pdf"&&!parsed&&!text.trim()?"Select a PDF or paste its text first.":"Files stay in your browser in this prototype."}</span>
        <div className="end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="src-cta" onClick={submit} disabled={!canIngest}>Ingest source</button>
        </div>
      </div>
    </div>
  </div>;
}

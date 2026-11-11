import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Activity, AgentName, AgentRun, Edge, Experiment, Invite, MemoryEntry, RNode, SearchLog, Source, User, Workspace, Membership, ExportJob, SharedSyncInput } from "./types";
import { chunkPages, leadOf, digestSource } from "./text";

const uid=(p:string)=>p+"-"+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const now=()=>new Date().toISOString();

interface State {
  users:User[]; sessionUserId:string|null; cloudReady:boolean;
  workspaces:Workspace[]; memberships:Membership[]; activeWs:string|null;
  nodes:RNode[]; edges:Edge[]; sources:Source[]; agents:AgentRun[];
  experiments:Experiment[]; memories:MemoryEntry[]; activities:Activity[];
  invites:Invite[]; exports:ExportJob[]; searchLogs:SearchLog[];
  toasts:string[];
  // session (identity itself comes from Convex Auth, never from local storage)
  startSession:(u:User)=>void;
  clearSession:()=>void;
  initFor:(userId:string)=>void;
  loadSnapshot:(payload:string)=>void;
  exportSnapshot:()=>string;
  importSnapshot:(payload:string)=>void;
  applySharedSync:(input:SharedSyncInput)=>void;
  // ws
  createWorkspace:(name:string,desc:string)=>void; switchWs:(id:string)=>void;
  canEdit:()=>boolean; isOwner:()=>boolean;
  // generic helpers
  toast:(m:string)=>void; log:(ws:string,kind:string,text:string,refType?:string,refId?:string)=>void;
  // nodes/edges
  addNode:(n:Omit<RNode,"id"|"createdAt"|"updatedAt"|"workspaceId"> & {workspaceId?:string})=>string;
  updateNode:(id:string,p:Partial<RNode>)=>void; deleteNode:(id:string)=>void;
  addEdge:(source:string,target:string,label:string,type:Edge["type"])=>void;
  deleteEdge:(id:string)=>void;
  suggestEdges:(nodeId:string)=>{target:RNode;label:string;reason:string;conf:number}[];
  // sources
  addSource:(s:Omit<Source,"id"|"createdAt"|"progress"|"status"|"workspaceId"> & {fileText?:string})=>string;
  // agents
  startAgent:(agent:AgentName,task:string,inputRef?:string)=>string;
  agentEvent:(id:string,text:string,kind?:string)=>void;
  approveAgent:(id:string,note?:string)=>void; rejectAgent:(id:string,note?:string)=>void;
  pauseAgent:(id:string)=>void; resumeAgent:(id:string)=>void; cancelAgent:(id:string)=>void;
  // experiments
  addExperiment:(e:Omit<Experiment,"id"|"createdAt"|"runs"|"status"> & {status?:Experiment["status"]})=>string;
  setExpStatus:(id:string,s:Experiment["status"])=>void;
  addRun:(expId:string,run:Experiment["runs"][number])=>void;
  // memory
  addMemory:(m:Omit<MemoryEntry,"id"|"createdAt"|"reuseCount">)=>string; reuse:(id:string)=>void;
  // collab
  invite:(email:string,role:Membership["role"])=>void; acceptInvite:(id:string)=>void; setRole:(ws:string,user:string,role:Membership["role"])=>void;
  addExport:(kind:string,format:string)=>void;
  logSearch:(ws:string,query:string,results:number,ms:number)=>void; markOpened:(ws:string)=>void;
}
export const useStore = create<State>()(persist((set,get)=>({
  users:[], sessionUserId:null, cloudReady:false, workspaces:[], memberships:[], activeWs:null,
  nodes:[], edges:[], sources:[], agents:[], experiments:[], memories:[], activities:[],
  invites:[], exports:[], searchLogs:[], toasts:[],
  toast:(m)=>{ set(s=>({toasts:[...s.toasts,m]})); setTimeout(()=>set(s=>({toasts:s.toasts.slice(1)})),3200); },
  log:(ws,kind,text,refType,refId)=>set(s=>({activities:[{id:uid("ac"),workspaceId:ws,kind,text,refType,refId,createdAt:now()},...s.activities].slice(0,400)})),

  startSession:(u)=>set({
    users:[u], sessionUserId:u.id, cloudReady:false,
    workspaces:[], memberships:[], activeWs:null,
    nodes:[], edges:[], sources:[], agents:[], experiments:[], memories:[], activities:[],
    invites:[], exports:[], searchLogs:[],
  }),
  clearSession:()=>set({
    users:[], sessionUserId:null, cloudReady:false,
    workspaces:[], memberships:[], activeWs:null,
    nodes:[], edges:[], sources:[], agents:[], experiments:[], memories:[], activities:[],
    invites:[], exports:[], searchLogs:[],
  }),
  initFor:(userId)=>{
    if(get().workspaces.length){ set({cloudReady:true}); return; }
    const ws:Workspace={id:uid("ws"),name:"My workspace",description:"",ownerId:userId,createdAt:now()};
    set({
      workspaces:[ws], memberships:[{workspaceId:ws.id,userId,role:"owner"}], activeWs:ws.id,
      nodes:[], edges:[], sources:[], experiments:[], memories:[], agents:[], activities:[],
      invites:[], exports:[], searchLogs:[], cloudReady:true,
    });
    get().log(ws.id,"workspace","Workspace created.");
  },
  loadSnapshot:(payload)=>{
    try{
      const d=JSON.parse(payload) as Partial<State>;
      set({
        workspaces:(d.workspaces??[]).map(w=>({...w,demo:false})), memberships:d.memberships??[],
        activeWs:d.activeWs??d.workspaces?.[0]?.id??null,
        nodes:d.nodes??[], edges:d.edges??[], sources:d.sources??[], agents:d.agents??[],
        experiments:d.experiments??[], memories:d.memories??[], activities:d.activities??[],
        invites:d.invites??[], exports:d.exports??[], searchLogs:d.searchLogs??[],
        cloudReady:true,
      });
    }catch{
      set({cloudReady:true});
      get().toast("Cloud snapshot could not be read — starting empty.");
    }
  },
  exportSnapshot:()=>{
    const s=get();
    return JSON.stringify({
      app:"ResearchGraph",version:1,exportedAt:now(),
      workspaces:s.workspaces,memberships:s.memberships,activeWs:s.activeWs,
      nodes:s.nodes,edges:s.edges,sources:s.sources,agents:s.agents,
      experiments:s.experiments,memories:s.memories,activities:s.activities,
      invites:s.invites,exports:s.exports,searchLogs:s.searchLogs,
    },null,2);
  },
  importSnapshot:(payload)=>{
    try{
      const d=JSON.parse(payload) as Record<string,unknown>;
      const rawWs=Array.isArray(d.workspaces)?d.workspaces as Workspace[]:[];
      if(!rawWs.length) throw new Error("no workspaces in snapshot");
      const userId=get().sessionUserId;
      const ids=new Set(rawWs.map(w=>w.id));
      const workspaces=rawWs.map(w=>({...w,ownerId:w.ownerId||userId||"",demo:false}));
      const memberships=(Array.isArray(d.memberships)?d.memberships as Membership[]:[]).filter(m=>ids.has(m.workspaceId));
      if(userId){
        const mine=new Set(memberships.filter(m=>m.userId===userId).map(m=>m.workspaceId));
        for(const w of workspaces) if(!mine.has(w.id)) memberships.push({workspaceId:w.id,userId,role:"owner"});
      }
      const arr=<T>(v:unknown):T[]=>Array.isArray(v)?v as T[]:[];
      const activeWs=typeof d.activeWs==="string"&&ids.has(d.activeWs)?d.activeWs:workspaces[0].id;
      set({
        workspaces,memberships,activeWs,
        nodes:arr(d.nodes),edges:arr(d.edges),sources:arr(d.sources),agents:arr(d.agents),
        experiments:arr(d.experiments),memories:arr(d.memories),activities:arr(d.activities),
        invites:arr(d.invites),exports:arr(d.exports),searchLogs:arr(d.searchLogs),
        cloudReady:true,
      });
      get().toast(`Imported ${workspaces.length} workspace${workspaces.length===1?"":"s"}.`);
      get().log(activeWs,"workspace","Workspace snapshot imported.");
    }catch{
      get().toast("That file is not a ResearchGraph workspace snapshot.");
    }
  },
  createWorkspace:(name,desc)=>{
    const u=get().sessionUserId; if(!u) return;
    const ws:Workspace={id:uid("ws"),name:name.trim()||"Untitled workspace",description:desc,ownerId:u,createdAt:now()};
    set(s=>({workspaces:[...s.workspaces,ws],memberships:[...s.memberships,{workspaceId:ws.id,userId:u,role:"owner"}],activeWs:ws.id}));
    get().log(ws.id,"workspace","Workspace created: "+ws.name);
    get().toast("Workspace created.");
  },
  switchWs:(id)=>set({activeWs:id}),
  applySharedSync:(input)=>{
    const sharedIds=new Set(input.workspaces.map(w=>w.workspaceId));
    set(s=>{
      const users=[...s.users];
      for(const m of input.members){
        const i=users.findIndex(u=>u.id===m.userId);
        const profile={name:m.name,email:m.email,image:m.image};
        if(i>=0) users[i]={...users[i],...profile};
        else users.push({id:m.userId,...profile,createdAt:now()});
      }
      const workspaces=[...s.workspaces];
      for(const meta of input.workspaces){
        const i=workspaces.findIndex(w=>w.id===meta.workspaceId);
        const next:Workspace={id:meta.workspaceId,name:meta.name,description:meta.description,ownerId:meta.ownerId,createdAt:meta.createdAt};
        if(i>=0) workspaces[i]={...workspaces[i],...next}; else workspaces.push(next);
      }
      const memberships=[
        ...s.memberships.filter(m=>!sharedIds.has(m.workspaceId)),
        ...input.members.map(m=>({workspaceId:m.workspaceId,userId:m.userId,role:m.role})),
      ];
      let nodes=s.nodes, edges=s.edges, sources=s.sources, agents=s.agents;
      let experiments=s.experiments, memories=s.memories, activities=s.activities;
      for(const [wsId,payload] of Object.entries(input.payloads)){
        nodes=[...nodes.filter(x=>x.workspaceId!==wsId), ...payload.nodes.map(x=>({...x,workspaceId:wsId}))];
        edges=[...edges.filter(x=>x.workspaceId!==wsId), ...payload.edges.map(x=>({...x,workspaceId:wsId}))];
        sources=[...sources.filter(x=>x.workspaceId!==wsId), ...payload.sources.map(x=>({...x,workspaceId:wsId}))];
        agents=[...agents.filter(x=>x.workspaceId!==wsId), ...payload.agents.map(x=>({...x,workspaceId:wsId}))];
        experiments=[...experiments.filter(x=>x.workspaceId!==wsId), ...payload.experiments.map(x=>({...x,workspaceId:wsId}))];
        memories=[...memories.filter(x=>x.workspaceId!==wsId), ...payload.memories.map(x=>({...x,workspaceId:wsId}))];
        activities=[...activities.filter(x=>x.workspaceId!==wsId), ...payload.activities.map(x=>({...x,workspaceId:wsId}))];
      }
      return {users,workspaces,memberships,nodes,edges,sources,agents,experiments,memories,activities};
    });
  },
  canEdit:()=>{
    const {memberships,activeWs,sessionUserId,workspaces}=get();
    if(!activeWs||!sessionUserId) return false;
    const ws=workspaces.find(w=>w.id===activeWs); if(ws?.ownerId===sessionUserId) return true;
    const m=memberships.find(m=>m.workspaceId===activeWs&&m.userId===sessionUserId);
    return m?.role==="owner"||m?.role==="editor";
  },
  isOwner:()=>{
    const {workspaces,activeWs,sessionUserId}=get();
    return workspaces.find(w=>w.id===activeWs)?.ownerId===sessionUserId;
  },
  addNode:(n)=>{
    if(!get().canEdit()){get().toast("Viewers cannot edit.");return "";}
    const ws=n.workspaceId||get().activeWs!;
    const node:RNode={...n as RNode,id:uid("n"),workspaceId:ws,createdAt:now(),updatedAt:now()};
    set(s=>({nodes:[...s.nodes,node]}));
    get().log(ws,"graph","Node added: "+node.title,"node",node.id);
    return node.id;
  },
  updateNode:(id,p)=>{ if(!get().canEdit())return; set(s=>({nodes:s.nodes.map(n=>n.id===id?{...n,...p,updatedAt:now()}:n)})); },
  deleteNode:(id)=>{
    if(!get().canEdit())return;
    const n=get().nodes.find(x=>x.id===id);
    set(s=>({nodes:s.nodes.filter(x=>x.id!==id),edges:s.edges.filter(e=>e.source!==id&&e.target!==id)}));
    if(n) get().log(n.workspaceId,"graph","Node deleted: "+n.title);
  },
  addEdge:(source,target,label,type)=>{
    if(!get().canEdit()){get().toast("Viewers cannot edit.");return;}
    if(source===target){get().toast("Cannot connect a node to itself.");return;}
    if(get().edges.some(e=>e.source===source&&e.target===target)){get().toast("Already connected.");return;}
    const t=get().nodes.find(n=>n.id===target);
    const e:Edge={id:uid("e"),workspaceId:t?.workspaceId||get().activeWs!,source,target,label:label||"relates to",type,createdAt:now()};
    set(s=>({edges:[...s.edges,e]}));
    get().log(e.workspaceId,"graph",`Connection: ${label||"related"}`,"edge",e.id);
    get().toast("Connection created.");
  },
  deleteEdge:(id)=>{ if(!get().canEdit())return; set(s=>({edges:s.edges.filter(e=>e.id!==id)})); },
  suggestEdges:(nodeId)=>{
    const st=get(); const me=st.nodes.find(n=>n.id===nodeId); if(!me) return [];
    const compat:Record<string,string[]>={paper:["question","dataset","paper"],dataset:["experiment","question"],question:["experiment","paper"],experiment:["result","error"],result:["conclusion","experiment"],error:["fix"],note:["question","experiment"]};
    const allowed=compat[me.type]||["note","question"];
    const mq=new Set((me.title+" "+me.description+" "+me.tags.join(" ")).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3));
    return st.nodes.filter(n=>n.id!==nodeId&&n.workspaceId===me.workspaceId&&allowed.includes(n.type))
      .map(n=>{
        const nq=new Set((n.title+" "+n.description+" "+n.tags.join(" ")).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3));
        let inter=0; mq.forEach(w=>{if(nq.has(w))inter++;});
        const conf=Math.min(0.92,0.4+inter*0.12);
        return {target:n,label:me.type==="error"?"resolved by":me.type==="experiment"?"produces":me.type==="result"?"supports":"relates to",
          reason:inter?`Shares ${inter} keyword${inter>1?"s":""} (${[...mq].filter(w=>nq.has(w)).slice(0,3).join(", ")}) plus compatible types ${me.type}→${n.type}.`:`Compatible types ${me.type}→${n.type}; no shared keywords — verify manually.`,conf};
      }).filter(s=>s.conf>=0.4).sort((a,b)=>b.conf-a.conf).slice(0,5);
  },
  addSource:(input)=>{
    if(!get().canEdit()){get().toast("Viewers cannot edit.");return "";}
    const ws=get().activeWs!;
    const startedAt=Date.now();
    // fileText is the extracted document body; it is chunked below and never persisted as-is.
    const {fileText,...rest}=input;
    const body=(fileText||"").trim();
    const built=body?chunkPages([{page:1,text:body}]):{chunks:[],chars:0,truncated:false};
    const chunks=rest.chunks?.length?rest.chunks:built.chunks;
    const abstract=rest.abstract?.trim()||(body?leadOf(body):undefined);
    const src:Source={...rest,abstract,chunks:chunks.length?chunks:undefined,id:uid("s"),workspaceId:ws,createdAt:now(),progress:0,status:"queued"};
    set(st=>({sources:[src,...st.sources]}));
    get().log(ws,"source","Source added: "+src.title,"source",src.id);
    // indexing pipeline with real text already extracted in-browser
    const tick=(p:number,status:Source["status"])=>set(st=>({sources:st.sources.map(x=>x.id===src.id?{...x,progress:p,status}:x)}));
    setTimeout(()=>tick(25,"processing"),300);
    setTimeout(()=>tick(60,"processing"),900);
    setTimeout(()=>{
      if(src.kind==="pdf"&&!body&&!chunks.length){
        tick(100,"failed");
        set(st=>({sources:st.sources.map(x=>x.id===src.id?{...x,error:"No readable text found. Scanned PDFs need OCR or pasted text."}:x)}));
        get().toast("Ingest failed — no readable text in that PDF.");
        return;
      }
      tick(100,"ready");
      const nodeId=get().addNode({type:src.kind==="dataset"?"dataset":src.kind==="github"?"code_repo":src.kind==="note"?"note":src.kind==="url"?"webpage":"paper",
        title:src.title,description:src.abstract||src.url||"Ingested source.",tags:src.tags,x:120+Math.random()*400,y:120+Math.random()*300,meta:{sourceId:src.id}});
      set(st=>({sources:st.sources.map(x=>x.id===src.id?{...x,nodeId,durationMs:Date.now()-startedAt}:x)}));
      get().log(ws,"source",`Source processed: ${src.title}${src.pages?` (${src.pages} pages)`:chunks.length?` (${chunks.length} passages)`:``}`,"source",src.id);
    },1700);
    return src.id;
  },
  startAgent:(agent,task,inputRef)=>{
    const ws=get().activeWs!; const id=uid("a");
    const needsApproval:AgentName[]=["experiment","code_setup","memory"];
    const run:AgentRun={id,workspaceId:ws,agent,task,status:"queued",inputRef,createdAt:now(),updatedAt:now(),events:[{ts:now(),text:"Queued: "+task,kind:"status"}]};
    set(s=>({agents:[run,...s.agents]}));
    get().log(ws,"agent",`${label(agent)} started`,"agent",id);
    // the selected source's real extracted text is the input
    const source=inputRef?get().sources.find(x=>x.id===inputRef):undefined;
    setTimeout(()=>{ set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"running",events:[...a.events,{ts:now(),text:source?`Reading local extraction of “${source.title}” (${source.pages?`${source.pages} pages, `:""}${source.chunks?.length||0} passages)`:"Running — reading inputs",kind:"tool",detail:source?"text_extract":"retrieval"}]}:a)})); },500);
    setTimeout(()=>{
      if(needsApproval.includes(agent)){
        const acts:Record<string,string>={experiment:"Execute experiment plan on laptop CPU",code_setup:"Install pinned dependencies + configure env",memory:"Write 3 records to research memory"};
        set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"waiting_approval",
          approval:{action:acts[agent]||"Execute proposed action",reason:"Follows approved research plan; reversible and logged.",expected:"Artifacts + logs saved to workspace.",risks:"CPU time (~30 min); dependency changes isolated to experiment env.",state:"pending"},
          events:[...a.events,{ts:now(),text:"Waiting for researcher approval",kind:"approval"}]}:a)}));
        get().toast("Approval needed — see Agent Center.");
      } else {
        const mode=digestMode(agent);
        const dig=source&&mode?digestSource(source,mode):null;
        get().agentEvent(id,dig?`Grounded in ${dig.pages} page${dig.pages===1?"":"s"}; ${dig.passages} quoted passage${dig.passages===1?"":"s"} — verify before citing`:"Analysis complete — review output before use","status");
        set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"completed",output:dig?dig.text:mockOutput(agent,task),confidence:dig?dig.confidence:0.8+Math.random()*0.12,updatedAt:now(),toolCalls:dig?["text_extract","score_passages","cite"]:["retrieval","reason","cite"]}:a)}));
        get().log(ws,"agent",`${label(agent)} completed`,"agent",id);
      }
    },2200);
    return id;
  },
  agentEvent:(id,text,kind="status")=>set(s=>({agents:s.agents.map(a=>a.id===id?{...a,events:[...a.events,{ts:now(),text,kind}]}:a)})),
  approveAgent:(id,note)=>{
    const r=get().agents.find(a=>a.id===id); if(!r?.approval) return;
    set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"running",approval:{...a.approval!,state:note?"modified":"approved",note},events:[...a.events,{ts:now(),text:"Approved by researcher"+(note?": "+note:""),kind:"approval"}]}:a)}));
    get().log(r.workspaceId,"agent",`${label(r.agent)} approved`,"agent",id);
    setTimeout(()=>{
      const source=r.inputRef?get().sources.find(x=>x.id===r.inputRef):undefined;
      const mode=digestMode(r.agent);
      const dig=source&&mode?digestSource(source,mode):null;
      set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"completed",output:dig?dig.text:mockOutput(r.agent,r.task),confidence:dig?dig.confidence:0.84,updatedAt:now(),toolCalls:dig?["text_extract","score_passages","cite"]:["retrieval","execute","verify"]}:a)}));
      get().log(r.workspaceId,"agent",`${label(r.agent)} completed`,"agent",id);
      get().toast("Agent task completed.");
    },1800);
  },
  rejectAgent:(id,note)=>{ const r=get().agents.find(a=>a.id===id); set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"cancelled",approval:a.approval?{...a.approval,state:"rejected",note}:undefined,events:[...a.events,{ts:now(),text:"Rejected by researcher"+(note?": "+note:""),kind:"approval"}]}:a)})); if(r) get().log(r.workspaceId,"agent",`${label(r.agent)} rejected`,"agent",id); },
  pauseAgent:(id)=>set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"paused",events:[...a.events,{ts:now(),text:"Paused",kind:"status"}]}:a)})),
  resumeAgent:(id)=>set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"running",events:[...a.events,{ts:now(),text:"Resumed",kind:"status"}]}:a)})),
  cancelAgent:(id)=>set(s=>({agents:s.agents.map(a=>a.id===id?{...a,status:"cancelled",events:[...a.events,{ts:now(),text:"Cancelled",kind:"status"}]}:a)})),
  addExperiment:(e)=>{
    if(!get().canEdit()){get().toast("Viewers cannot edit.");return "";}
    const ws=get().activeWs!;
    const ex:Experiment={...e,id:uid("x"),workspaceId:ws,createdAt:now(),runs:[],status:e.status||"draft"};
    set(s=>({experiments:[ex,...s.experiments]}));
    get().log(ws,"experiment","Experiment created: "+ex.name,"experiment",ex.id);
    return ex.id;
  },
  setExpStatus:(id,s2)=>{
    const ex=get().experiments.find(e=>e.id===id); if(!ex) return;
    // enforce approval gate
    if((s2==="running")&&ex.status!=="approved"){ get().toast("Approve the plan before running."); return; }
    set(s=>({experiments:s.experiments.map(e=>e.id===id?{...e,status:s2}:e)}));
    get().log(ex.workspaceId,"experiment",`Experiment ${s2}: ${ex.name}`,"experiment",id);
  },
  addRun:(expId,run)=>{ set(s=>({experiments:s.experiments.map(e=>e.id===expId?{...e,runs:[run,...e.runs]}:e)})); const ex=get().experiments.find(e=>e.id===expId); if(ex) get().log(ex.workspaceId,"experiment",`Run ${run.status}: ${ex.name}`,"experiment",expId); },
  addMemory:(m)=>{
    if(!get().canEdit()){get().toast("Viewers cannot edit.");return "";}
    const ws=get().activeWs!; const mem:MemoryEntry={...m,id:uid("m"),workspaceId:ws,createdAt:now(),reuseCount:0};
    set(s=>({memories:[mem,...s.memories]}));
    get().log(ws,"memory","Memory saved: "+mem.title,"memory",mem.id);
    return mem.id;
  },
  reuse:(id)=>set(s=>({memories:s.memories.map(m=>m.id===id?{...m,reuseCount:m.reuseCount+1}:m)})),
  invite:(email,role)=>{
    const ws=get().activeWs!; if(!get().isOwner()){get().toast("Only owners can invite.");return;}
    set(s=>({invites:[{id:uid("i"),workspaceId:ws,email,role,status:"pending"},...s.invites]}));
    get().log(ws,"collab",`Invited ${email} as ${role}`);
  },
  acceptInvite:()=>{},
  setRole:(ws,user,role)=>{ if(!get().isOwner())return; set(s=>({memberships:s.memberships.map(m=>m.workspaceId===ws&&m.userId===user?{...m,role}:m)})); },
  addExport:(kind,format)=>{ const ws=get().activeWs!; set(s=>({exports:[{id:uid("xp"),workspaceId:ws,kind,format,createdAt:now(),status:"completed",size:"~"+(4+Math.floor(Math.random()*40))+" KB"},...s.exports]})); get().log(ws,"export",`Export generated: ${kind}.${format}`); },
  logSearch:(ws,query,results,ms)=>set(s=>({searchLogs:[{id:uid("q"),workspaceId:ws,query,results,opened:false,createdAt:now(),durationMs:Math.round(ms)},...s.searchLogs].slice(0,200)})),
  markOpened:(_ws)=>set(s=>({searchLogs:s.searchLogs.map((l,i)=>i===0?{...l,opened:true}:l)})),
}),{name:"rg.v1",version:1,
  // v0 persisted local accounts and password hashes — drop them on upgrade.
  migrate:(p)=>{ if(!p||typeof p!=="object") return p as State; const {users:_u,sessionUserId:_s,...rest}=p as Record<string,unknown>; return rest as unknown as State; },
  partialize:(s)=>{const {toasts:_t,users:_u,sessionUserId:_sid,cloudReady:_c,...rest}=s; return rest;}}));
export function label(a:AgentName){ return {controller:"Controller",paper_reader:"Paper Reader",equation:"Equation Extractor",code_setup:"Code Setup",experiment:"Experiment Agent",benchmark:"Benchmark",memory:"Memory Agent",review:"Review Agent"}[a]; }
function digestMode(agent:AgentName):"summary"|"equations"|"review"|null{
  return agent==="paper_reader"?"summary":agent==="equation"?"equations":agent==="review"?"review":null;
}
function mockOutput(agent:AgentName,task:string){
  const base="(Simulated output — inspect before use. AI inferences are labelled and need researcher review.)\n";
  switch(agent){
    case "paper_reader": return base+"Contributions: (1) lightweight backbone comparison; (2) augmentation recipe; (3) public split. Method: transfer learning, RandAugment, cosine decay. Results: 94.1% reported (paper). Limitation: lab images only — see pp. 4–5.";
    case "equation": return base+"Softmax CE: L = −Σ y·log(ŷ). Cosine decay: η_t = η_min + ½(η_max−η_min)(1+cos πt/T). See methodology note.";
    case "code_setup": return base+"Deps: torch==2.1.0, torchvision==0.16.0, pillow==9.5.0. Setup: python -m venv .venv && pip install -r requirements.txt. Risk: pillow 10 breaks transforms.";
    case "benchmark": return base+"Simulated result 91.4% vs reported 94.1% (−2.7pp). Likely causes: 5 vs 50 epochs, CPU augmentations. No invented baselines — gap needs full-epoch run.";
    case "review": return base+"Evidence: good (2 sources cited). Gaps: field-photo validation missing; seed logged ✓. Claim 'viable <5MB' is supported for lab split only.";
    case "memory": return base+"Saved: config, error, fix. Reuse: pillow pin + CPU flag recommended for new runs.";
    default: return base+"Plan ready for "+task+". Approve to continue.";
  }
}

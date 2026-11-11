import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useStore } from "../lib/store";
import { download } from "../lib/export";
import { flushCloud } from "../lib/useCloudSync";
import Analyst from "./Analyst";
import { Modal } from "./ui";
import { LogoMark } from "./Logo";
import { navIcons } from "./icons";

const items=[
  {to:"/app/dashboard",label:"Dashboard",icon:"dashboard"},
  {to:"/app/canvas",label:"Canvas",icon:"canvas"},
  {to:"/app/analyst",label:"Analyst",icon:"analyst"},
  {to:"/app/sources",label:"Sources",icon:"sources"},
  {to:"/app/agents",label:"Agents",icon:"agents"},
  {to:"/app/experiments",label:"Experiments",icon:"experiments"},
  {to:"/app/memory",label:"Memory",icon:"memory"},
  {to:"/app/discovery",label:"Discovery",icon:"discovery"},
  {to:"/app/collaboration",label:"Share",icon:"share"},
];

export default function Shell({children}:{children:React.ReactNode}){
  const activeWsId=useStore(s=>s.activeWs);
  const ws=useStore(s=>s.workspaces.find(w=>w.id===s.activeWs));
  const wss=useStore(s=>s.workspaces); const sw=useStore(s=>s.switchWs);
  const user=useStore(s=>s.users.find(u=>u.id===s.sessionUserId));
  const createWorkspace=useStore(s=>s.createWorkspace);
  const deleteWorkspace=useStore(s=>s.deleteWorkspace);
  const removeSharedWorkspace=useMutation(api.workspaceSync.remove);
  const { signOut } = useAuthActions();
  const allAgents=useStore(s=>s.agents); const agents=allAgents.filter(a=>a.workspaceId===activeWsId);
  const toasts=useStore(s=>s.toasts);
  const pending=agents.filter(a=>a.status==="waiting_approval").length;
  const nav=useNavigate(); const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [manageOpen,setManageOpen]=useState(false);
  const [wsName,setWsName]=useState("");
  const snapshotRef=useRef<HTMLInputElement>(null);
  const initials=(user?.name||"R").split(/\s+/).map(p=>p[0]).slice(0,2).join("").toUpperCase();
  const closeMenu=()=>document.querySelector<HTMLDetailsElement>("details.rg-profile[open]")?.removeAttribute("open");
  const endSession=async()=>{ closeMenu(); await flushCloud(); await signOut(); nav("/login"); };
  const exportWorkspace=()=>{
    closeMenu();
    const name=(ws?.name||"workspace").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"workspace";
    download(`researchgraph-${name}-${new Date().toISOString().slice(0,10)}.json`, useStore.getState().exportSnapshot(), "application/json");
  };
  const removeWorkspace=async(w:{id:string;name:string;demo?:boolean})=>{
    if(!window.confirm(`Delete “${w.name}”? Its graph, sources, runs and memory will be removed.`)) return;
    if(!w.demo){
      try { await removeSharedWorkspace({workspaceId:w.id}); }
      catch(e){ useStore.getState().toast(e instanceof Error?e.message:"Could not delete workspace."); return; }
    }
    deleteWorkspace(w.id);
    void flushCloud();
  };
  const importWorkspace=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; e.target.value="";
    if(!file) return;
    useStore.getState().importSnapshot(await file.text());
    closeMenu(); setOpen(false); nav("/app/dashboard");
  };

  useEffect(()=>{
    const onDown=(e:MouseEvent)=>{
      const d=document.querySelector<HTMLDetailsElement>("details.rg-profile[open]");
      if(d&&!d.contains(e.target as Node)) d.removeAttribute("open");
    };
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") closeMenu(); };
    document.addEventListener("pointerdown",onDown);
    document.addEventListener("keydown",onKey);
    return ()=>{ document.removeEventListener("pointerdown",onDown); document.removeEventListener("keydown",onKey); };
  },[]);

  return <div className="rg-shell theme-dash">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="rg-side">
      <Link to="/app/dashboard" className="rg-brand" aria-label="ResearchGraph home">
        <LogoMark size={28} className="rg-brand-mark" />
        <span className="rg-brand-name">ResearchGraph</span>
      </Link>
      <nav className="rg-nav" aria-label="Primary">
        {items.map(i=><NavLink key={i.to} to={i.to+(i.to==="/app/canvas"&&ws?`?ws=${ws.id}`:"")} className={({isActive})=>isActive?"active":""}>
          <span className="rg-nav-ic" aria-hidden>{navIcons[i.icon]}</span>
          <span className="rg-nav-label">{i.label}</span>
          {i.label==="Agents"&&pending>0&&<span className="rg-count">{pending}</span>}
        </NavLink>)}
      </nav>
      <div className="rg-side-foot">
        <select className="rg-ws" value={ws?.id||""} onChange={e=>sw(e.target.value)} aria-label="Workspace">
          {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" · Demo":""}</option>)}
        </select>
        <button className="rg-side-logout" onClick={endSession}>Log out</button>
      </div>
    </aside>
    <div className="rg-main">
      <header className="rg-top">
        <Link to="/app/dashboard" className="rg-brand rg-brand-top" aria-label="ResearchGraph home">
          <LogoMark size={28} className="rg-brand-mark" />
          <span className="rg-brand-name">ResearchGraph</span>
        </Link>
        <div className="rg-search">
          <div className="rg-searchbox">
            <span className="rg-search-ic">{navIcons.search}</span>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search sources, notes, agents…" onKeyDown={e=>{if(e.key==="Enter"&&q.trim()){nav("/app/discovery?q="+encodeURIComponent(q));setOpen(false);}}} aria-label="Global search"/>
          </div>
        </div>
        <div className="rg-top-actions">
          <button className="rg-analyst" onClick={()=>window.dispatchEvent(new Event("rg:analyst-toggle"))} title="Ask the analyst" aria-label="Ask the analyst">
            {navIcons.analyst}{pending>0&&<i className="rg-analyst-dot" aria-hidden/>}
          </button>
          <button className="rg-bell" onClick={()=>nav("/app/agents")} aria-label={pending?`${pending} approvals waiting`:"Approvals"}>
            {navIcons.bell}{pending>0&&<span className="dot">{pending}</span>}
          </button>
          <details className="rg-profile">
            <summary aria-label={`Account menu for ${user?.name||"Researcher"}`}>
              <span className="rg-avatar">{user?.image?<img src={user.image} alt="" referrerPolicy="no-referrer"/>:initials}</span>
              <span className="rg-who"><b>{user?.name||"Researcher"}</b><span>{ws?.name||"Workspace"}</span></span>
            </summary>
            <div className="rg-profile-menu">
              <span className="rg-profile-mail">{user?.email}</span>
              <label className="rg-profile-ws">
                <span>Workspace</span>
                <select value={ws?.id||""} onChange={e=>sw(e.target.value)}>
                  {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" · Demo":""}</option>)}
                </select>
              </label>
              <button onClick={()=>{closeMenu();setManageOpen(true);}}>Manage workspaces</button>
              <Link to="/app/collaboration" onClick={()=>{closeMenu();setOpen(false);}}>Share workspace</Link>
              <button onClick={exportWorkspace}>Export workspace (.json)</button>
              <button onClick={()=>{closeMenu();snapshotRef.current?.click();}}>Import workspace (.json)</button>
              <button onClick={endSession}>Log out</button>
            </div>
          </details>
          <input ref={snapshotRef} type="file" accept="application/json,.json" hidden onChange={importWorkspace}/>
          <button className="menubtn" aria-label="Menu" aria-expanded={open} aria-controls="rg-mobile-nav" onClick={()=>setOpen(!open)}>{navIcons.menu}</button>
        </div>
      </header>
      {open&&<nav className="rg-mobile-nav" id="rg-mobile-nav" aria-label="Primary mobile">
        {items.map(i=><NavLink key={i.to} to={i.to+(i.to==="/app/canvas"&&ws?`?ws=${ws.id}`:"")} className={({isActive})=>isActive?"active":""} onClick={()=>setOpen(false)}>
          <span className="rg-nav-ic" aria-hidden>{navIcons[i.icon]}</span>
          <span className="rg-nav-label">{i.label}</span>
          {i.label==="Agents"&&pending>0&&<span className="rg-count">{pending}</span>}
        </NavLink>)}
        <div className="rg-mobile-foot">
          <select className="rg-ws" value={ws?.id||""} onChange={e=>sw(e.target.value)} aria-label="Workspace">
            {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" · Demo":""}</option>)}
          </select>
          <button onClick={endSession}>Log out</button>
        </div>
      </nav>}
      <main id="main" className="rg-content">{children}</main>
    </div>
    <Analyst/>
    {manageOpen && <Modal onClose={()=>setManageOpen(false)}>
      <div className="rg-wsm">
        <h3>Workspaces</h3>
        <p>Each workspace keeps its own graph, sources, runs and memory. The demo workspace is yours to explore.</p>
        <div className="rg-wsm-list">
          {wss.map(w=>{
            const owner=w.ownerId===user?.id;
            return <div className={`rg-wsm-row${w.id===ws?.id?" on":""}`} key={w.id}>
              <button className="rg-wsm-pick" onClick={()=>{sw(w.id);setManageOpen(false);}}>
                <b>{w.name}{w.demo&&<span className="rg-wsm-demo">Demo</span>}</b>
                <span>{w.id===ws?.id?"Active workspace":"Switch to this workspace"}</span>
              </button>
              {owner&&<button className="rg-wsm-del" aria-label={`Delete ${w.name}`} onClick={()=>void removeWorkspace(w)}>Delete</button>}
            </div>;
          })}
        </div>
        <form className="rg-wsm-create" onSubmit={e=>{e.preventDefault(); if(!wsName.trim()) return; createWorkspace(wsName.trim(),""); setWsName(""); setManageOpen(false);}}>
          <input className="input" value={wsName} onChange={e=>setWsName(e.target.value)} placeholder="New workspace name" aria-label="New workspace name"/>
          <button className="btn btn-primary btn-sm" disabled={!wsName.trim()}>Create</button>
        </form>
      </div>
    </Modal>}
    <div className="toastwrap" aria-live="polite">{toasts.map((m,i)=><div key={i} className="toast">{m}</div>)}</div>
  </div>;
}

import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import Analyst from "./Analyst";
import { LogoMark } from "./Logo";
import { navIcons } from "./icons";

const items=[
  {to:"/app/dashboard",label:"Dashboard"},
  {to:"/app/canvas",label:"Canvas"},
  {to:"/app/analyst",label:"Analyst"},
  {to:"/app/sources",label:"Sources"},
  {to:"/app/agents",label:"Agents"},
  {to:"/app/experiments",label:"Experiments"},
  {to:"/app/memory",label:"Memory"},
  {to:"/app/discovery",label:"Discovery"},
  {to:"/app/collaboration",label:"Share"},
];

export default function Shell({children}:{children:React.ReactNode}){
  const activeWsId=useStore(s=>s.activeWs);
  const ws=useStore(s=>s.workspaces.find(w=>w.id===s.activeWs));
  const wss=useStore(s=>s.workspaces); const sw=useStore(s=>s.switchWs);
  const user=useStore(s=>s.users.find(u=>u.id===s.sessionUserId));
  const logout=useStore(s=>s.logout); const allAgents=useStore(s=>s.agents); const agents=allAgents.filter(a=>a.workspaceId===activeWsId);
  const toasts=useStore(s=>s.toasts);
  const pending=agents.filter(a=>a.status==="waiting_approval").length;
  const nav=useNavigate(); const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const path=useLocation().pathname;
  const dash=path.startsWith("/app/dashboard")||path.startsWith("/app/sources");
  const initials=(user?.name||"R").split(/\s+/).map(p=>p[0]).slice(0,2).join("").toUpperCase();
  const closeMenu=()=>document.querySelector<HTMLDetailsElement>("details.rg-profile[open]")?.removeAttribute("open");
  const signOut=()=>{ closeMenu(); logout(); nav("/login"); };

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

  return <div className={`rg-shell${dash?" theme-dash":""}`}>
    <a className="skip" href="#main">Skip to content</a>
    <header className="rg-top">
      <Link to="/app/dashboard" className="rg-brand" aria-label="ResearchGraph home">
        <LogoMark size={28} className="rg-brand-mark" />
        <span className="rg-brand-name">ResearchGraph</span>
      </Link>
      <nav className="rg-nav" aria-label="Primary">
        {items.map(i=><NavLink key={i.to} to={i.to+(i.to==="/app/canvas"&&ws?`?ws=${ws.id}`:"")} className={({isActive})=>isActive?"active":""}>
          {i.label}
          {i.label==="Agents"&&pending>0&&<span className="rg-count">{pending}</span>}
        </NavLink>)}
      </nav>
      <div className="rg-search">
        <div className="rg-searchbox">
          <span className="rg-search-ic">{navIcons.search}</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search sources, notes, agents…" onKeyDown={e=>{if(e.key==="Enter"&&q.trim()){nav("/app/discovery?q="+encodeURIComponent(q));setOpen(false);}}} aria-label="Global search"/>
        </div>
      </div>
      <div className="rg-top-actions">
        <select className="rg-ws" value={ws?.id||""} onChange={e=>sw(e.target.value)} aria-label="Workspace">
          {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" (Demo)":""}</option>)}
        </select>
        <button className="rg-analyst" onClick={()=>window.dispatchEvent(new Event("rg:analyst-toggle"))} title="Ask the analyst" aria-label="Ask the analyst">
          {navIcons.analyst}{pending>0&&<i className="rg-analyst-dot" aria-hidden/>}
        </button>
        <button className="rg-bell" onClick={()=>nav("/app/agents")} aria-label={pending?`${pending} approvals waiting`:"Approvals"}>
          {navIcons.bell}{pending>0&&<span className="dot">{pending}</span>}
        </button>
        <details className="rg-profile">
          <summary aria-label={`Account menu for ${user?.name||"Researcher"}`}>
            <span className="rg-avatar">{initials}</span>
            <span className="rg-who"><b>{user?.name||"Researcher"}</b><span>{ws?.name||"Workspace"}</span></span>
          </summary>
          <div className="rg-profile-menu">
            <span className="rg-profile-mail">{user?.email}</span>
            <label className="rg-profile-ws">
              <span>Workspace</span>
              <select value={ws?.id||""} onChange={e=>sw(e.target.value)}>
                {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" (Demo)":""}</option>)}
              </select>
            </label>
            <Link to="/app/collaboration" onClick={()=>{closeMenu();setOpen(false);}}>Share workspace</Link>
            <button onClick={signOut}>Log out</button>
          </div>
        </details>
        <button className="menubtn" aria-label="Menu" aria-expanded={open} aria-controls="rg-mobile-nav" onClick={()=>setOpen(!open)}>{navIcons.menu}</button>
      </div>
    </header>
    {open&&<nav className="rg-mobile-nav" id="rg-mobile-nav" aria-label="Primary mobile">
      {items.map(i=><NavLink key={i.to} to={i.to+(i.to==="/app/canvas"&&ws?`?ws=${ws.id}`:"")} className={({isActive})=>isActive?"active":""} onClick={()=>setOpen(false)}>
        {i.label}{i.label==="Agents"&&pending>0&&<span className="rg-count">{pending}</span>}
      </NavLink>)}
      <div className="rg-mobile-foot">
        <select className="rg-ws" value={ws?.id||""} onChange={e=>sw(e.target.value)} aria-label="Workspace">
          {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" (Demo)":""}</option>)}
        </select>
        <button onClick={signOut}>Log out</button>
      </div>
    </nav>}
    <main id="main" className="rg-content">{children}</main>
    <Analyst/>
    <div className="toastwrap" aria-live="polite">{toasts.map((m,i)=><div key={i} className="toast">{m}</div>)}</div>
  </div>;
}

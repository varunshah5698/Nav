import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useStore } from "../lib/store";
import Analyst from "./Analyst";
import { LogoMark } from "./Logo";
import { navIcons } from "./icons";
const items=[
  {to:"/app/dashboard",label:"Dashboard",icon:"dashboard"},
  {to:"/app/canvas",label:"Research Canvas",icon:"canvas"},
  {to:"/app/analyst",label:"AI Analyst",icon:"analyst"},
  {to:"/app/sources",label:"Sources",icon:"sources"},
  {to:"/app/agents",label:"AI Agents",icon:"agents"},
  {to:"/app/experiments",label:"Experiments",icon:"experiments"},
  {to:"/app/memory",label:"Memory",icon:"memory"},
  {to:"/app/discovery",label:"Discovery",icon:"discovery"},
  {to:"/app/collaboration",label:"Share & Export",icon:"share"},
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
  return <div className="rg-shell">
    <a className="skip" href="#main">Skip to content</a>
    {open&&<div className="rg-scrim" onClick={()=>setOpen(false)} aria-hidden/>}
    <aside className={`rg-side${open?" open":""}`}>
      <div className="rg-brand"><LogoMark size={30} className="rg-brand-mark" title="ResearchGraph" /><div><div className="rg-brand-name">ResearchGraph</div><div className="rg-brand-sub">Connected research</div></div></div>
      <nav className="rg-nav" aria-label="Primary">
        {items.map(i=><NavLink key={i.to} to={i.to+(i.to==="/app/canvas"&&ws?`?ws=${ws.id}`:"")} className={({isActive})=>isActive?"active":""} onClick={()=>setOpen(false)}>
          <span className="ico">{navIcons[i.icon]}</span>{i.label}
          {i.label==="AI Agents"&&pending>0&&<span className="count">{pending}</span>}
        </NavLink>)}
      </nav>
      <button className="rg-side-logout" onClick={()=>{logout();nav("/login");}}>Log out</button>
      <div className="rg-upgrade"><span className="rg-upgrade-tag">Demo workspace</span><h4>From chaos to discovery</h4><p>Seeded so every page has real sample data. Invite your lab when ready.</p>
        <button className="btn btn-lime btn-sm" onClick={()=>nav("/app/collaboration")}>Share workspace</button></div>
    </aside>
    <div className="rg-main">
      <header className="rg-top">
        <button className="menubtn" aria-label="Menu" aria-expanded={open} onClick={()=>setOpen(!open)}>{navIcons.menu}</button>
        <div className="rg-profile"><div className="rg-avatar">{(user?.name||"R").slice(0,1)}</div>
          <div><b>{user?.name||"Researcher"}</b><span>{user?.email}</span></div></div>
        <div className="rg-search">
          <select className="select" style={{width:"auto",borderRadius:999}} value={ws?.id||""} onChange={e=>sw(e.target.value)} aria-label="Workspace">
            {wss.map(w=><option key={w.id} value={w.id}>{w.name}{w.demo?" (Demo)":""}</option>)}
          </select>
          <div className="rg-searchbox"><span className="rg-search-ic">{navIcons.search}</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search… (↵ Discovery)" onKeyDown={e=>{if(e.key==="Enter")nav("/app/discovery?q="+encodeURIComponent(q));}} aria-label="Global search"/></div>
          <button className="rg-analyst" onClick={()=>window.dispatchEvent(new Event("rg:analyst-toggle"))} title="Ask the analyst" aria-label="Ask the analyst">{navIcons.analyst}<span>Ask the analyst</span>{pending>0&&<i className="rg-analyst-dot" aria-hidden/>}</button>
          <button className="rg-bell" onClick={()=>nav("/app/agents")} aria-label="Approvals">{navIcons.bell}{pending>0&&<span className="dot">{pending}</span>}</button>
          <span className="rg-date">{new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>{logout();nav("/login");}}>Logout</button>
        </div>
      </header>
      <main id="main" className="rg-content">{children}</main>
    </div>
    <Analyst/>
    <div className="toastwrap" aria-live="polite">{toasts.map((m,i)=><div key={i} className="toast">{m}</div>)}</div>
  </div>;
}

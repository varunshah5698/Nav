import React from "react";
export const Btn=(p:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button {...p} className={`btn btn-${p.variant||"primary"} ${p.className||""}`}/>;
export function Card(p:{children:React.ReactNode;dark?:boolean;style?:React.CSSProperties;title?:string;icon?:string;action?:React.ReactNode}){
  return <div className={`card${p.dark?" dark":""}`} style={p.style}>
    {(p.title||p.action)&&<div className="card-h"><span className="ticon">{p.icon||"◈"}</span><h3>{p.title}</h3><span className="dots" style={{marginLeft:"auto"}}>{p.action}</span></div>}
    {p.children}</div>;
}
export function Kpi(p:{label:string;value:string;hint?:string;icon?:string;delta?:string;down?:boolean;tip?:string}){
  return <div className="card kpi-card" title={p.tip}><div className="card-h"><span className="ticon">{p.icon||"◈"}</span><h3>{p.label}</h3></div>
    <div className="metric">{p.value} {p.delta&&<span className={`delta${p.down?" down":""}`}>{p.delta}</span>}</div>
    {p.hint&&<span className="hint">{p.hint}</span>}</div>;
}
export const Badge=(p:{children:React.ReactNode;tone?:string})=><span className={`badge ${p.tone||""}`}>{p.children}</span>;
export const Field=(p:{label:string;children:React.ReactNode})=><div><label className="lbl">{p.label}</label>{p.children}</div>;
export function Modal(p:{children:React.ReactNode;onClose:()=>void}){
  return <div className="overlay" onClick={p.onClose}><div className="modal" onClick={e=>e.stopPropagation()}>{p.children}</div></div>;
}
export function Empty(p:{title:string;body:string;action?:React.ReactNode}){
  return <div className="empty"><b>{p.title}</b>{p.body}<div style={{marginTop:12}}>{p.action}</div></div>;
}
export function Toasts(p:{items:string[]}){
  return <div className="toastwrap" aria-live="polite">{p.items.map((m,i)=><div key={i} className="toast">{m}</div>)}</div>;
}

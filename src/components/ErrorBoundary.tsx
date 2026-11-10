import React from "react";
export default class ErrorBoundary extends React.Component<{children:React.ReactNode;fallback?:React.ReactNode},{bad:boolean}>{
  state={bad:false};
  static getDerivedStateFromError(){return {bad:true};}
  componentDidCatch(e:any){console.warn("3D fallback:",e?.message);}
  render(){ if(this.state.bad) return <>{this.props.fallback||<div style={{padding:40,color:"#9AA0A0"}}>3D unavailable — static view.</div>}</>; return this.props.children; }
}

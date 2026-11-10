import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import Landing from "./pages/Landing";
import { Login, Register } from "./pages/Auth";
import Shell from "./components/Shell";
import Dashboard from "./pages/Dashboard";
import Analyst from "./pages/Analyst";
import Canvas from "./pages/Canvas";
import Sources from "./pages/Sources";
import Agents from "./pages/Agents";
import Experiments from "./pages/Experiments";
import Memory from "./pages/Memory";
import Discovery from "./pages/Discovery";
import Collaboration from "./pages/Collaboration";
import { useStore } from "./lib/store";
import { useCloudSync } from "./lib/useCloudSync";
import { api } from "../convex/_generated/api";
import "./styles/global.css";

function Boot(){
  return <div className="rg-boot" role="status" aria-live="polite">
    <span className="rg-boot-spin" aria-hidden="true"/>
    <b>Securing your workspace…</b>
  </div>;
}
function Guard({children}:{children:React.ReactNode}){
  const {isLoading,isAuthenticated}=useConvexAuth();
  const me=useQuery(api.users.me, isAuthenticated?{}:"skip");
  const sessionUserId=useStore(s=>s.sessionUserId);
  const cloudReady=useStore(s=>s.cloudReady);
  if(isLoading) return <Boot/>;
  if(!isAuthenticated) return <Navigate to="/login" replace/>;
  // Wait until the store has switched to this Convex identity and loaded its snapshot.
  if(!me || sessionUserId!==me.id || !cloudReady) return <Boot/>;
  return <Shell>{children}</Shell>;
}
function CanvasRoute(){
  const p=useParams(); const sw=useStore(s=>s.switchWs);
  if(p.workspaceId) sw(p.workspaceId);
  return <Canvas/>;
}
export default function App(){
  useCloudSync();
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="/register" element={<Register/>}/>
      <Route path="/signup" element={<Register/>}/>
      <Route path="/app/dashboard" element={<Guard><Dashboard/></Guard>}/>
      <Route path="/app/analyst" element={<Guard><Analyst/></Guard>}/>
      <Route path="/app/canvas" element={<Guard><Canvas/></Guard>}/>
      <Route path="/app/workspaces/:workspaceId/canvas" element={<Guard><CanvasRoute/></Guard>}/>
      <Route path="/app/sources" element={<Guard><Sources/></Guard>}/>
      <Route path="/app/agents" element={<Guard><Agents/></Guard>}/>
      <Route path="/app/experiments" element={<Guard><Experiments/></Guard>}/>
      <Route path="/app/memory" element={<Guard><Memory/></Guard>}/>
      <Route path="/app/discovery" element={<Guard><Discovery/></Guard>}/>
      <Route path="/app/collaboration" element={<Guard><Collaboration/></Guard>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </BrowserRouter>;
}

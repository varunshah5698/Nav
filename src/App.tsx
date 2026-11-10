import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
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
import "./styles/global.css";
function Guard({children}:{children:React.ReactNode}){
  const u=useStore(s=>s.sessionUserId);
  if(!u) return <Navigate to="/login" replace/>;
  return <Shell>{children}</Shell>;
}
function CanvasRoute(){
  const p=useParams(); const sw=useStore(s=>s.switchWs);
  if(p.workspaceId) sw(p.workspaceId);
  return <Canvas/>;
}
export default function App(){
  return <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="/register" element={<Register/>}/>
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

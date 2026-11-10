import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import Collaboration from "./pages/Collaboration";
import { useStore } from "./lib/store";
import "./styles/global.css";

function Preview() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useStore.setState({
      users: [
        { id: "u-prev", name: "Varun Shah", email: "varun@lab.org" },
        { id: "u-maya", name: "Maya Rao", email: "maya@lab.org" },
        { id: "u-noah", name: "Noah Kim", email: "noah@lab.org" },
        { id: "u-iris", name: "Iris Okafor", email: "iris@lab.org" },
      ] as never,
      sessionUserId: "u-prev",
    });
    useStore.getState().seedFor("u-prev");
    const ws = "ws-demo-plant";
    useStore.setState({
      memberships: [
        { workspaceId: ws, userId: "u-prev", role: "owner" },
        { workspaceId: ws, userId: "u-maya", role: "editor" },
        { workspaceId: ws, userId: "u-noah", role: "viewer" },
        { workspaceId: ws, userId: "u-iris", role: "viewer" },
      ] as never,
      invites: [
        { id: "i1", workspaceId: ws, email: "sam@lab.org", role: "editor", invitedBy: "u-prev", createdAt: new Date(Date.now() - 3600e3).toISOString(), status: "pending" },
        { id: "i2", workspaceId: ws, email: "lena@lab.org", role: "viewer", invitedBy: "u-prev", createdAt: new Date(Date.now() - 7200e3).toISOString(), status: "pending" },
      ] as never,
      exports: [
        { id: "x1", workspaceId: ws, kind: "report", format: "md", createdAt: new Date(Date.now() - 900e3).toISOString(), status: "completed", size: "~18 KB" },
        { id: "x2", workspaceId: ws, kind: "graph", format: "json", createdAt: new Date(Date.now() - 5400e3).toISOString(), status: "completed", size: "~24 KB" },
        { id: "x3", workspaceId: ws, kind: "bibliography", format: "bib", createdAt: new Date(Date.now() - 86400e3).toISOString(), status: "completed", size: "~6 KB" },
      ] as never,
    });
    setReady(true);
  }, []);
  if (!ready) return null;
  return (
    <div className="theme-dash" style={{ minHeight: "100vh" }}>
      <div className="rg-content">
        <Collaboration />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);

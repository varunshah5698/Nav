import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LogoMark } from "../components/Logo";
import { useStore } from "../lib/store";
import "../styles/invite.css";

type InviteState =
  | { status: "idle" | "accepting" }
  | { status: "accepted"; workspaceId: string; workspaceName: string }
  | { status: "error"; message: string };

function friendlyError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  const last = raw.split("\n").map((line) => line.trim()).filter(Boolean).pop() || raw;
  const cleaned = last.replace(/^Uncaught Error:\s*/i, "").replace(/^Server Error\s*/i, "");
  if (/different email/i.test(cleaned)) {
    return "This invitation was sent to a different email address. Sign in with the address that received it, or ask the owner to resend it.";
  }
  if (/expired/i.test(cleaned)) return "This invitation has expired. Ask the workspace owner to send a new one.";
  if (/already been used/i.test(cleaned)) return "This invitation has already been used.";
  if (/not valid|no longer exists/i.test(cleaned)) return "This invitation is no longer valid.";
  return cleaned || "The invitation could not be accepted. Try again or ask the owner to resend it.";
}

export default function Invite() {
  const { token = "" } = useParams();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const accept = useMutation(api.workspaceInvites.accept);
  const shared = useQuery(api.workspaceSync.mine, isAuthenticated ? {} : "skip");
  const switchWs = useStore((s) => s.switchWs);
  const nav = useNavigate();
  const started = useRef(false);
  const [state, setState] = useState<InviteState>({ status: "idle" });
  const next = `/invite/${token}`;
  const authLink = `?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token || started.current) return;
    started.current = true;
    setState({ status: "accepting" });
    void accept({ token })
      .then((result) => {
        setState({
          status: "accepted",
          workspaceId: result.workspaceId,
          workspaceName: result.workspaceName,
        });
      })
      .catch((error) => {
        setState({ status: "error", message: friendlyError(error) });
      });
  }, [accept, isAuthenticated, isLoading, token]);

  useEffect(() => {
    if (state.status !== "accepted") return;
    if (!shared?.workspaces.some((w) => w.workspaceId === state.workspaceId)) return;
    switchWs(state.workspaceId);
    nav("/app/dashboard", { replace: true });
  }, [state, shared, switchWs, nav]);

  const enter = (workspaceId: string) => {
    switchWs(workspaceId);
    nav("/app/dashboard", { replace: true });
  };

  const switchAccount = async () => {
    await signOut();
    started.current = false;
    setState({ status: "idle" });
  };

  return (
    <div className="invite-page theme-dash">
      <div className="invite-orb" aria-hidden="true" />
      <div className="invite-wrap">
        <Link to="/" className="invite-brand">
          <LogoMark size={30} />
          <b>ResearchGraph</b>
        </Link>

        <section className="invite-card" aria-live="polite">
          {isLoading ? (
            <div className="invite-state">
              <span className="invite-spin" aria-hidden="true" />
              <h1>Checking your session…</h1>
              <p>One moment while we verify your account.</p>
            </div>
          ) : !isAuthenticated ? (
            <div className="invite-state">
              <span className="invite-kicker">Workspace invitation</span>
              <h1>You've been invited to collaborate.</h1>
              <p>Sign in or create an account with the email address that received the invitation. The owner has already chosen your role.</p>
              <div className="invite-actions">
                <Link className="invite-btn primary" to={`/login${authLink}`}>Sign in to accept</Link>
                <Link className="invite-btn ghost" to={`/register${authLink}`}>Create an account</Link>
              </div>
              <p className="invite-fine">The invitation link is single-use and expires after seven days.</p>
            </div>
          ) : state.status === "accepting" ? (
            <div className="invite-state">
              <span className="invite-spin" aria-hidden="true" />
              <h1>Joining the workspace…</h1>
              <p>Verifying the invitation and adding you to the roster.</p>
            </div>
          ) : state.status === "accepted" ? (
            <div className="invite-state">
              <span className="invite-check" aria-hidden="true">✓</span>
              <span className="invite-kicker">Invitation accepted</span>
              <h1>Welcome to {state.workspaceName}.</h1>
              <p>You are on the workspace roster. Its graph, sources, experiments, memory and shared files are now attached to your account.</p>
              <div className="invite-actions">
                <button className="invite-btn primary" onClick={() => enter(state.workspaceId)}>Open workspace</button>
              </div>
              <p className="invite-fine">Setting up the shared workspace…</p>
            </div>
          ) : state.status === "error" ? (
            <div className="invite-state">
              <span className="invite-alert" aria-hidden="true">!</span>
              <span className="invite-kicker">Invitation problem</span>
              <h1>We couldn't add you to this workspace.</h1>
              <p>{state.message}</p>
              <div className="invite-actions">
                <button className="invite-btn primary" onClick={() => void switchAccount()}>Switch account</button>
                <Link className="invite-btn ghost" to="/app/dashboard">Go to dashboard</Link>
              </div>
              <p className="invite-fine">No workspace data has been changed.</p>
            </div>
          ) : (
            <div className="invite-state">
              <span className="invite-spin" aria-hidden="true" />
              <h1>Preparing your invitation…</h1>
              <p>Reading the invite token.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

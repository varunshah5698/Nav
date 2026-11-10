import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "../lib/store";
import { Badge } from "../components/ui";
import type { Membership } from "../lib/types";
import {
  bibtex,
  bytesOf,
  download,
  expCSV,
  graphJSON,
  prettySize,
  workspaceReport,
  type ReportSection,
} from "../lib/export";
import "../styles/share.css";

type Format = "md" | "bib" | "json" | "csv";

const FORMATS: {
  id: Format;
  label: string;
  ext: string;
  kind: string;
  icon: string;
  blurb: string;
  mime: string;
}[] = [
  {
    id: "md",
    label: "Research report",
    ext: ".md",
    kind: "report",
    icon: "▤",
    blurb: "Narrative handoff — sources, graph, runs and memory in one file. Prints to PDF.",
    mime: "text/markdown",
  },
  {
    id: "bib",
    label: "Bibliography",
    ext: ".bib",
    kind: "bibliography",
    icon: "❝",
    blurb: "BibTeX for every indexed source, ready for Zotero, Paperpile or LaTeX.",
    mime: "application/x-bibtex",
  },
  {
    id: "json",
    label: "Graph snapshot",
    ext: ".json",
    kind: "graph",
    icon: "◈",
    blurb: "Nodes, edges and relationship types, exact enough to re-import or analyse.",
    mime: "application/json",
  },
  {
    id: "csv",
    label: "Run metrics",
    ext: ".csv",
    kind: "experiments",
    icon: "⌗",
    blurb: "One row per run: accuracy, F1, loss, wall time and the parameters used.",
    mime: "text/csv",
  },
];

const SECTIONS: { id: ReportSection; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "graph", label: "Graph" },
  { id: "experiments", label: "Runs" },
  { id: "memory", label: "Memory" },
];

const CAPABILITIES: { label: string; viewer: boolean; editor: boolean; owner: boolean }[] = [
  { label: "Read sources, graph and memory", viewer: true, editor: true, owner: true },
  { label: "Edit research content", viewer: false, editor: true, owner: true },
  { label: "Generate exports", viewer: true, editor: true, owner: true },
  { label: "Invite people & set roles", viewer: false, editor: false, owner: true },
];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

export default function Collaboration() {
  const activeWs = useStore((s) => s.activeWs);
  const ws = useStore((s) => s.workspaces.find((w) => w.id === s.activeWs));
  const sessionUserId = useStore((s) => s.sessionUserId);
  const users = useStore((s) => s.users);
  const toast = useStore((s) => s.toast);

  const _nodes = useStore((s) => s.nodes);
  const nodes = useMemo(() => _nodes.filter((n) => n.workspaceId === activeWs), [_nodes, activeWs]);
  const _edges = useStore((s) => s.edges);
  const edges = useMemo(() => _edges.filter((n) => n.workspaceId === activeWs), [_edges, activeWs]);
  const _sources = useStore((s) => s.sources);
  const sources = useMemo(() => _sources.filter((n) => n.workspaceId === activeWs), [_sources, activeWs]);
  const _exps = useStore((s) => s.experiments);
  const exps = useMemo(() => _exps.filter((n) => n.workspaceId === activeWs), [_exps, activeWs]);
  const _mems = useStore((s) => s.memories);
  const mems = useMemo(() => _mems.filter((n) => n.workspaceId === activeWs), [_mems, activeWs]);
  const _acts = useStore((s) => s.activities);
  const acts = useMemo(() => _acts.filter((n) => n.workspaceId === activeWs).slice(0, 14), [_acts, activeWs]);
  const _invites = useStore((s) => s.invites);
  const invites = useMemo(() => _invites.filter((n) => n.workspaceId === activeWs), [_invites, activeWs]);
  const _exports = useStore((s) => s.exports);
  const exportsLog = useMemo(() => _exports.filter((n) => n.workspaceId === activeWs), [_exports, activeWs]);
  const _members = useStore((s) => s.memberships);
  const members = useMemo(() => {
    const order: Record<string, number> = { owner: 0, editor: 1, viewer: 2 };
    return _members
      .filter((m) => m.workspaceId === activeWs)
      .sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3));
  }, [_members, activeWs]);

  const invite = useStore((s) => s.invite);
  const setRole = useStore((s) => s.setRole);
  const addExport = useStore((s) => s.addExport);
  const canManage = useStore((s) => s.isOwner);

  const owner = canManage();
  const myRole = members.find((m) => m.userId === sessionUserId)?.role;
  const me = users.find((u) => u.id === sessionUserId);

  const [format, setFormat] = useState<Format>("md");
  const [sections, setSections] = useState<ReportSection[]>(["sources", "graph", "experiments", "memory"]);
  const [email, setEmail] = useState("");
  const [role, setRole_] = useState<"editor" | "viewer">("viewer");
  const [copied, setCopied] = useState("");

  const runCount = useMemo(() => exps.reduce((a, e) => a + e.runs.length, 0), [exps]);
  const pending = invites.filter((i) => i.status === "pending");

  const buildFor = (f: Format) => {
    if (f === "bib") return bibtex(sources);
    if (f === "json") return graphJSON(nodes, edges, ws?.name);
    if (f === "csv") return expCSV(exps);
    return workspaceReport(ws?.name || "Workspace", { nodes, edges, sources, exps, mems }, sections);
  };

  const content = useMemo(
    () => buildFor(format),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [format, sections, nodes, edges, sources, exps, mems, ws],
  );

  const meta = FORMATS.find((f) => f.id === format)!;
  const filename = `${slug(ws?.name || "workspace")}-${meta.kind}${meta.ext}`;
  const bytes = useMemo(() => bytesOf(content), [content]);

  const run = (f: Format = format) => {
    const m = FORMATS.find((x) => x.id === f)!;
    const name = `${slug(ws?.name || "workspace")}-${m.kind}${m.ext}`;
    download(name, buildFor(f), m.mime);
    addExport(m.kind, m.ext.slice(1));
    toast(`Exported ${name}`);
  };

  const copy = async (text: string, key: string) => {
    const ok = await writeClipboard(text);
    if (!ok) {
      toast("Copy is blocked in this browser — select the text instead.");
      return;
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1800);
  };

  const origin = window.location.origin;
  const inviteNote = `${me?.name || "A researcher"} invited you to “${ws?.name || "a workspace"}” on ResearchGraph.\nSign in at ${origin}/login — the workspace roster and roles live under Share & export.`;

  const toggleSection = (id: ReportSection) => {
    setSections((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
  };

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!owner) {
      toast("Only the workspace owner can invite.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("Enter a valid email address.");
      return;
    }
    invite(email.trim(), role);
    toast(`Invitation recorded for ${email.trim()}`);
    setEmail("");
  };

  const formatOf = (kind: string, fmt: string) =>
    FORMATS.find((f) => f.kind === kind || f.ext.slice(1) === fmt) ?? FORMATS[0];

  return (
    <div className="sx">
      <header className="sx-head">
        <div>
          <span className="sx-eyebrow">
            <i aria-hidden="true">⇪</i> Distribution
            <span className="sx-sep" aria-hidden="true" />
            {members.length} {members.length === 1 ? "member" : "members"}
            <span className="sx-sep" aria-hidden="true" />
            {exportsLog.length} exports
          </span>
          <h1 className="sx-title">Share &amp; export</h1>
          <p className="sx-sub">
            Hand the work over without handing over the keys. Roles are enforced per workspace, and every file
            carries only metadata that actually exists — no synthesised numbers.
          </p>
        </div>
        <div className="sx-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => copy(inviteNote, "note")}>
            {copied === "note" ? "✓ Invite copied" : "Copy invite"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => run()}>
            ⇪ Generate export
          </button>
        </div>
      </header>

      <div className="sx-grid">
        <section className="sx-access" aria-label="Workspace access">
          <div className="sx-access-head">
            <span className="sx-kicker">Workspace access</span>
            {myRole && <Badge tone="lime">{myRole}</Badge>}
          </div>
          <h2 className="sx-access-title">{ws?.name || "Workspace"}</h2>
          <p className="sx-access-sub">
            Viewers read, editors change the research, owners manage the roster. Every route in this workspace
            checks the same rule.
          </p>

          <form className="sx-invite" onSubmit={submitInvite} noValidate>
            <label className="sx-invite-lbl" htmlFor="sx-email">
              Invite a collaborator
            </label>
            <div className="sx-invite-row">
              <input
                id="sx-email"
                className="sx-input"
                type="email"
                placeholder="teammate@lab.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!owner}
                autoComplete="off"
              />
              <div className="sx-roleseg" role="group" aria-label="Role for the invitation">
                {(["viewer", "editor"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={role === r ? "on" : ""}
                    aria-pressed={role === r}
                    onClick={() => setRole_(r)}
                    disabled={!owner}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button className="btn btn-lime btn-sm" type="submit" disabled={!owner}>
                Invite
              </button>
            </div>
            {!owner && <p className="sx-hint">Only the workspace owner can invite or change roles.</p>}
          </form>

          <ul className="sx-people">
            {members.map((m: Membership) => {
              const u = users.find((x) => x.id === m.userId);
              return (
                <li key={m.userId} className="sx-person">
                  <span className="sx-avatar">{(u?.name || "?").slice(0, 1)}</span>
                  <div className="sx-person-main">
                    <b>
                      {u?.name || "Unknown researcher"}
                      {m.userId === sessionUserId && <em>you</em>}
                    </b>
                    <span>{u?.email || "no email"}</span>
                  </div>
                  {owner && m.role !== "owner" ? (
                    <select
                      className="sx-role"
                      value={m.role}
                      aria-label={`Role for ${u?.name || "member"}`}
                      onChange={(e) => setRole(activeWs!, m.userId, e.target.value as Membership["role"])}
                    >
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                  ) : (
                    <Badge tone={m.role === "owner" ? "dark" : m.role === "editor" ? "violet" : ""}>
                      {m.role}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>

          {pending.length > 0 && (
            <div className="sx-pending">
              <span className="sx-kicker">Pending invitations</span>
              {pending.map((i) => (
                <div key={i.id} className="sx-pending-row">
                  <span className="sx-mail" aria-hidden="true">
                    ✉
                  </span>
                  <div>
                    <b>{i.email}</b>
                    <small>invited as {i.role}</small>
                  </div>
                  <Badge tone="yellow">{i.status}</Badge>
                </div>
              ))}
            </div>
          )}

          <div className="sx-access-foot">
            <div>
              <b>Invite link</b>
              <code>{origin}/login</code>
            </div>
            <button className="btn btn-lime btn-sm" onClick={() => copy(`${origin}/login`, "link")}>
              {copied === "link" ? "✓ Copied" : "Copy link"}
            </button>
          </div>
          <p className="sx-fine">
            Invitations are recorded in this workspace; this prototype does not send email. Exporting never
            uploads anything.
          </p>
        </section>

        <aside className="sx-policy" aria-label="Sharing policy">
          <div className="sx-access-head">
            <span className="sx-kicker">Sharing policy</span>
            <Badge tone="green">enforced</Badge>
          </div>
          <h2>What each role can do</h2>
          <table className="sx-matrix">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col">Viewer</th>
                <th scope="col">Editor</th>
                <th scope="col">Owner</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className={c.viewer ? "" : "no"}>{c.viewer ? "✓" : "·"}</td>
                  <td className={c.editor ? "" : "no"}>{c.editor ? "✓" : "·"}</td>
                  <td className={c.owner ? "" : "no"}>{c.owner ? "✓" : "·"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sx-inv">
            <span className="sx-kicker">What an export can carry</span>
            <div className="sx-inv-row">
              <i className="k-src" aria-hidden="true" /> Sources <b>{sources.length}</b>
            </div>
            <div className="sx-inv-row">
              <i className="k-graph" aria-hidden="true" /> Graph nodes <b>{nodes.length}</b>
            </div>
            <div className="sx-inv-row">
              <i className="k-edge" aria-hidden="true" /> Relationships <b>{edges.length}</b>
            </div>
            <div className="sx-inv-row">
              <i className="k-run" aria-hidden="true" /> Recorded runs <b>{runCount}</b>
            </div>
            <div className="sx-inv-row">
              <i className="k-mem" aria-hidden="true" /> Memory entries <b>{mems.length}</b>
            </div>
          </div>
          <p className="sx-fine">Files are built in your browser from workspace data — nothing is uploaded.</p>
        </aside>
      </div>

      <section className="sx-studio" aria-label="Export studio">
        <div className="sx-studio-head">
          <div>
            <span className="sx-kicker">Export studio</span>
            <h2>Build a handoff file</h2>
            <p>Pick a format. The preview below is the real file — what you see is what downloads.</p>
          </div>
          <div className="sx-size">
            <b>{prettySize(bytes)}</b>
            <span>{content.split("\n").length} lines</span>
          </div>
        </div>

        <div className="sx-studio-grid">
          <div className="sx-picker">
            <div className="sx-formats" role="radiogroup" aria-label="Export format">
              {FORMATS.map((f) => {
                const on = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`sx-format${on ? " on" : ""}`}
                    onClick={() => setFormat(f.id)}
                  >
                    <span className="sx-format-icon" aria-hidden="true">
                      {f.icon}
                    </span>
                    <span className="sx-format-main">
                      <b>
                        {f.label} <code>{f.ext}</code>
                      </b>
                      <span>{f.blurb}</span>
                    </span>
                    <span className="sx-radio" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <div className={`sx-sections${format !== "md" ? " is-muted" : ""}`}>
              <span className="sx-sections-lbl">
                Include {format !== "md" && <em>· report only</em>}
              </span>
              <div className="sx-chips">
                {SECTIONS.map((s) => {
                  const on = sections.includes(s.id);
                  const last = on && sections.length === 1;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`sx-chip${on ? " on" : ""}`}
                      aria-pressed={on}
                      disabled={format !== "md" || last}
                      onClick={() => toggleSection(s.id)}
                    >
                      {on ? "✓ " : ""}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sx-runbar">
              <div className="sx-runbar-note">
                <b>{filename}</b>
                <span>saved to your downloads folder</span>
              </div>
              <button className="btn btn-primary" onClick={() => run()}>
                ⇪ Generate &amp; download
              </button>
            </div>
          </div>

          <div className="sx-preview">
            <div className="sx-preview-bar">
              <span className="sx-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <code>{filename}</code>
              <button className="sx-copy" onClick={() => copy(content, "preview")}>
                {copied === "preview" ? "✓" : "Copy"}
              </button>
            </div>
            <pre className="sx-code">{content}</pre>
          </div>
        </div>
      </section>

      <div className="sx-lower">
        <section className="sx-card" aria-label="Export history">
          <div className="sx-card-head">
            <h2>Export history</h2>
            <Badge>{exportsLog.length}</Badge>
          </div>
          {exportsLog.length ? (
            <ul className="sx-history">
              {exportsLog.slice(0, 6).map((x) => {
                const f = formatOf(x.kind, x.format);
                return (
                  <li key={x.id}>
                    <span className="sx-fileicon" aria-hidden="true">
                      {f.icon}
                    </span>
                    <div>
                      <b>
                        {x.kind}
                        <code>.{x.format}</code>
                      </b>
                      <span>
                        {when(x.createdAt)} · {x.size || "regenerated on demand"}
                      </span>
                    </div>
                    <button className="sx-again" onClick={() => run(f.id)} aria-label={`Export ${x.kind} again`}>
                      Again
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="sx-empty">
              Nothing exported yet. The first file will land here with its format, size and timestamp.
            </div>
          )}
        </section>

        <section className="sx-card" aria-label="Workspace activity">
          <div className="sx-card-head">
            <h2>Workspace activity</h2>
            <Badge tone="violet">{acts.length}</Badge>
          </div>
          {acts.length ? (
            <ul className="sx-timeline">
              {acts.map((a) => (
                <li key={a.id}>
                  <i className={`k-${a.kind}`} aria-hidden="true" />
                  <p>{a.text}</p>
                  <time dateTime={a.createdAt}>{when(a.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sx-empty">Sharing, edits and exports will be logged here.</div>
          )}
        </section>
      </div>
    </div>
  );
}

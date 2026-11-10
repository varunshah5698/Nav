import { useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStore } from "../lib/store";
import { Badge } from "../components/ui";
import { Donut } from "../components/Charts";
import type { Membership } from "../lib/types";
import {
  bibtex,
  bytesOf,
  downloadBlob,
  expCSV,
  graphJSON,
  prettySize,
  workspaceReport,
  type ReportSection,
} from "../lib/export";
import "../styles/share.css";

type Format = "md" | "bib" | "json" | "csv";
type FileKind = "pdf" | "doc" | "slides" | "text" | "sheet" | "code" | "quote" | "image" | "archive";

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
  { id: "files", label: "Files" },
];

const CAPABILITIES: { label: string; viewer: boolean; editor: boolean; owner: boolean }[] = [
  { label: "Read sources, graph and memory", viewer: true, editor: true, owner: true },
  { label: "Edit research content", viewer: false, editor: true, owner: true },
  { label: "Generate exports", viewer: true, editor: true, owner: true },
  { label: "Invite people & set roles", viewer: false, editor: false, owner: true },
];

const UPLOAD_FORMATS: { kind: FileKind; label: string; exts: string[]; blurb: string }[] = [
  { kind: "pdf", label: "PDF", exts: ["pdf"], blurb: "Papers, signed handoffs" },
  { kind: "doc", label: "Word", exts: ["docx"], blurb: "Drafts and reports" },
  { kind: "slides", label: "Slides", exts: ["pptx"], blurb: "Talks and posters" },
  { kind: "text", label: "Text", exts: ["md", "txt"], blurb: "Notes, readmes" },
  { kind: "sheet", label: "Sheets", exts: ["csv"], blurb: "Run tables, raw data" },
  { kind: "code", label: "JSON", exts: ["json"], blurb: "Graph snapshots" },
  { kind: "quote", label: "BibTeX", exts: ["bib"], blurb: "Bibliographies" },
  { kind: "image", label: "Images", exts: ["png", "jpg", "jpeg", "svg", "webp"], blurb: "Figures and plots" },
  { kind: "archive", label: "Archive", exts: ["zip"], blurb: "Multi-file bundles" },
];

const EXT_KIND = new Map<string, FileKind>(
  UPLOAD_FORMATS.flatMap((f) => f.exts.map((ext) => [ext, f.kind] as const)),
);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const FILE_ACCEPT = UPLOAD_FORMATS.flatMap((f) => f.exts.map((e) => `.${e}`)).join(",");

interface ShareFile {
  id: string;
  file: File;
  ext: string;
  kind: FileKind;
  addedAt: number;
}
interface RejectedFile {
  name: string;
  reason: string;
}

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() || "";
const kindOf = (ext: string) => EXT_KIND.get(ext);
const formatLabel = (kind: FileKind) => UPLOAD_FORMATS.find((f) => f.kind === kind)?.label || kind;

function rejectReason(file: File, total: number, seen: ShareFile[]): string | null {
  const ext = extOf(file.name);
  if (!kindOf(ext)) return ext ? `Unsupported .${ext} files` : "File has no extension";
  if (!file.size) return "File is empty";
  if (file.size > MAX_FILE_BYTES) return `Larger than ${prettySize(MAX_FILE_BYTES)}`;
  if (total + file.size > MAX_TOTAL_BYTES) return `Over the ${prettySize(MAX_TOTAL_BYTES)} session cap`;
  if (seen.some((s) => s.file.name === file.name && s.file.size === file.size && s.file.lastModified === file.lastModified))
    return "Already attached";
  return null;
}

function FileGlyph({ kind }: { kind: FileKind }) {
  if (kind === "sheet")
    return (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.7" y="3.4" width="12.6" height="11.2" rx="1.7" />
        <path d="M2.9 7.1h12.2M2.9 11h12.2M7.2 3.5v11M11.2 3.5v11" />
      </svg>
    );
  if (kind === "code" || kind === "quote")
    return (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6.1 5.3-3.5 3.7 3.5 3.7M11.9 5.3l3.5 3.7-3.5 3.7M10.2 3.6 7.8 14.4" />
      </svg>
    );
  if (kind === "image")
    return (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.7" y="3.2" width="12.6" height="11.6" rx="2" />
        <circle cx="6.7" cy="7.1" r="1.3" />
        <path d="m3.4 13 3.8-3.6 2.5 2.2 2.4-2.4 3.4 3.5" />
      </svg>
    );
  if (kind === "archive")
    return (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 6.4h12v8.1a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 14.5Z" />
        <path d="M2.5 3h13v3.4h-13zM8 9.2h2v3H8z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.3 2.7h6l3.4 3.4v9.2H4.3Z" />
      <path d="M10.1 2.9v3.4h3.4M6.4 9.4h5.2M6.4 11.9h3.6" />
    </svg>
  );
}

function Ico({ name }: { name: "share" | "upload" | "mail" | "link" | "download" | "trash" | "search" | "shield" | "users" | "export" }) {
  const paths = {
    share: <><path d="M9 11.4V2.9M6.3 5.6 9 2.9l2.7 2.7" /><path d="M3.4 11v3.1a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1V11" /></>,
    upload: <><path d="M9 12.4V3.4M5.9 6.5 9 3.4l3.1 3.1" /><path d="M3.3 11.5v3a1.4 1.4 0 0 0 1.4 1.4h8.6a1.4 1.4 0 0 0 1.4-1.4v-3" /></>,
    mail: <><rect x="2.6" y="4.2" width="12.8" height="9.6" rx="1.8" /><path d="m3.3 5.2 5.7 4.3 5.7-4.3" /></>,
    link: <><path d="M7.4 10.6a3.1 3.1 0 0 0 4.4 0l2-2a3.1 3.1 0 0 0-4.4-4.4l-1 1" /><path d="M10.6 7.4a3.1 3.1 0 0 0-4.4 0l-2 2a3.1 3.1 0 0 0 4.4 4.4l1-1" /></>,
    download: <><path d="M9 3v8.6M5.9 8.5 9 11.6l3.1-3.1" /><path d="M3.3 12.4v2.1a1.4 1.4 0 0 0 1.4 1.4h8.6a1.4 1.4 0 0 0 1.4-1.4v-2.1" /></>,
    trash: <><path d="M3.6 5.2h10.8M7.2 5V3.4h3.6V5M5 5.2l.6 9a1.3 1.3 0 0 0 1.3 1.2h4.2a1.3 1.3 0 0 0 1.3-1.2l.6-9" /><path d="M7.6 8v4.4M10.4 8v4.4" /></>,
    search: <><circle cx="8" cy="8" r="4.5" /><path d="m11.4 11.4 3.2 3.2" /></>,
    shield: <><path d="M9 2.6 14.4 4.8v4.5c0 3.1-2.2 5.3-5.4 6.3-3.2-1-5.4-3.2-5.4-6.3V4.8Z" /><path d="m6.5 8.7 1.7 1.7 3.3-3.4" /></>,
    users: <><circle cx="7" cy="6.2" r="2.5" /><path d="M2.6 14.7c0-2.4 2-3.9 4.4-3.9s4.4 1.5 4.4 3.9" /><path d="M11.9 4.1a2.4 2.4 0 0 1 0 4.4M12.8 10.9c1.7.4 2.7 1.7 2.7 3.5" /></>,
    export: <><path d="M9 2.8v8.4M5.9 8.1 9 11.2l3.1-3.1" /><path d="M3.2 12.1v2.2a1.4 1.4 0 0 0 1.4 1.4h8.8a1.4 1.4 0 0 0 1.4-1.4v-2.2" /></>,
  };
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {paths[name]}
    </svg>
  );
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

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

/* ---------- 3d share core ---------- */
function ShareCore({ people, files, exportsCount, pending }: { people: number; files: number; exportsCount: number; pending: number }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduce = useReducedMotion();
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -14, y: ((e.clientX - r.left) / r.width - 0.5) * 20 });
  }
  return (
    <div
      className="shx-core-wrap"
      onPointerMove={move}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ "--tx": `${tilt.x}deg`, "--ty": `${tilt.y}deg` } as CSSProperties}
      aria-hidden
    >
      <div className="shx-core">
        <span className="shx-halo" />
        <span className="shx-orbit o1" />
        <span className="shx-orbit o2" />
        <span className="shx-orbit o3" />
        <span className="shx-token k-pdf">PDF</span>
        <span className="shx-token k-csv">CSV</span>
        <span className="shx-token k-json">JSON</span>
        <span className="shx-token k-bib">BIB</span>
        <span className="shx-orb">
          <span className="shx-orb-glow" />
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 23.8 40.5 9.2l-7.2 30.9-9-11.6L8 23.8Z" />
            <path d="m40.5 9.2-16.2 19.3" />
          </svg>
        </span>
        <span className="shx-core-chip c1"><em>people</em>{people} in the room</span>
        <span className="shx-core-chip c2"><em>files</em>{files} attached</span>
        <span className="shx-core-chip c3"><em>{pending ? "waiting" : "exports"}</em>{pending ? `${pending} invite${pending === 1 ? "" : "s"}` : `${exportsCount} generated`}</span>
      </div>
    </div>
  );
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
  const [sections, setSections] = useState<ReportSection[]>(["sources", "graph", "experiments", "memory", "files"]);
  const [email, setEmail] = useState("");
  const [role, setRole_] = useState<"editor" | "viewer">("viewer");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState("");
  const [uploads, setUploads] = useState<ShareFile[]>([]);
  const [rejects, setRejects] = useState<RejectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const runCount = useMemo(() => exps.reduce((a, e) => a + e.runs.length, 0), [exps]);
  const pending = invites.filter((i) => i.status === "pending");
  const totalUploadBytes = useMemo(() => uploads.reduce((a, f) => a + f.file.size, 0), [uploads]);
  const shownFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    return q ? uploads.filter((f) => f.file.name.toLowerCase().includes(q)) : uploads;
  }, [uploads, fileQuery]);
  const reportFiles = useMemo(
    () => uploads.map((f) => ({ name: f.file.name, ext: f.ext, bytes: f.file.size })),
    [uploads],
  );

  const roleCount = (r: Membership["role"]) => members.filter((m) => m.role === r).length;
  const exportMix = FORMATS.map((f) => ({
    id: f.id,
    label: f.ext.slice(1).toUpperCase(),
    n: exportsLog.filter((x) => x.kind === f.kind || x.format === f.ext.slice(1)).length,
  }));
  const exportPeak = Math.max(...exportMix.map((x) => x.n), 1);
  const shareItems = [
    { name: "Sources", value: sources.length, color: "#7AA2FF" },
    { name: "Graph nodes", value: nodes.length, color: "#9C8BE5" },
    { name: "Relationships", value: edges.length, color: "#C0B4F0" },
    { name: "Runs", value: runCount, color: "#D8F85E" },
    { name: "Memory", value: mems.length, color: "#F2B64B" },
    { name: "Files", value: uploads.length, color: "#F3703F" },
  ];
  const shareTotal = shareItems.reduce((a, b) => a + b.value, 0);

  const buildFor = (f: Format) => {
    if (f === "bib") return bibtex(sources);
    if (f === "json") return graphJSON(nodes, edges, ws?.name);
    if (f === "csv") return expCSV(exps);
    return workspaceReport(
      ws?.name || "Workspace",
      { nodes, edges, sources, exps, mems, files: reportFiles },
      sections,
    );
  };

  const content = useMemo(
    () => buildFor(format),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [format, sections, nodes, edges, sources, exps, mems, ws, reportFiles],
  );

  const meta = FORMATS.find((f) => f.id === format)!;
  const filename = `${slug(ws?.name || "workspace")}-${meta.kind}${meta.ext}`;
  const bytes = useMemo(() => bytesOf(content), [content]);

  const run = (f: Format = format) => {
    const m = FORMATS.find((x) => x.id === f)!;
    const name = `${slug(ws?.name || "workspace")}-${m.kind}${m.ext}`;
    downloadBlob(name, new Blob([buildFor(f)], { type: m.mime }));
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
  const inviteNote = [
    `${me?.name || "A researcher"} invited you to “${ws?.name || "a workspace"}” on ResearchGraph.`,
    note.trim() ? `“${note.trim()}”` : "",
    `Sign in at ${origin}/login — the roster and exports live under Share.`,
  ]
    .filter(Boolean)
    .join("\n\n");

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

  const openPicker = () => fileInput.current?.click();

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const seen = [...uploads];
    let total = totalUploadBytes;
    const ok: ShareFile[] = [];
    const bad: RejectedFile[] = [];
    for (const file of Array.from(list)) {
      const reason = rejectReason(file, total, seen);
      if (reason) {
        bad.push({ name: file.name, reason });
        continue;
      }
      const ext = extOf(file.name);
      const item: ShareFile = {
        id: crypto.randomUUID(),
        file,
        ext,
        kind: kindOf(ext)!,
        addedAt: Date.now(),
      };
      ok.push(item);
      seen.push(item);
      total += file.size;
    }
    if (ok.length) {
      setUploads((cur) => [...cur, ...ok]);
      setFileQuery("");
      toast(`${ok.length} file${ok.length === 1 ? "" : "s"} added — listed in the report, never uploaded.`);
    }
    setRejects(bad);
  };

  const removeFile = (id: string) => {
    const hit = uploads.find((f) => f.id === id);
    setUploads((cur) => cur.filter((f) => f.id !== id));
    setRejects([]);
    if (hit) toast(`Removed ${hit.file.name}`);
  };

  const clearFiles = () => {
    setUploads([]);
    setFileQuery("");
    setRejects([]);
    toast("Session tray cleared.");
  };

  const dropKey = (e: KeyboardEvent<HTMLLabelElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const formatOf = (kind: string, fmt: string) =>
    FORMATS.find((f) => f.kind === kind || f.ext.slice(1) === fmt) ?? FORMATS[0];

  return (
    <div className="shx">
      <motion.header
        className="shx-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="shx-hero-copy">
          <div className="shx-eyebrow">
            <i aria-hidden="true" />
            <span>Distribution</span>
            <span>{(ws?.name || "Workspace").replace(" (Demo)", "")}</span>
            {ws?.demo && <em>Demo data</em>}
          </div>
          <h1>
            Share the work, <span className="shx-serif">not the keys.</span>
          </h1>
          <p className="shx-hero-sub">
            Invite the people, attach your own handoff files, then build an export from what actually exists in the
            workspace. Roles stay enforced; nothing leaves the browser without a download.
          </p>
          <div className="shx-hero-actions">
            <button className="shx-btn lime" onClick={openPicker}>
              <Ico name="upload" /> Upload files
            </button>
            <button className="shx-btn ghost" onClick={() => copy(inviteNote, "note")}>
              {copied === "note" ? "✓ Invite copied" : "Copy invite"}
            </button>
          </div>
          <div className="shx-hero-meta">
            <span><b>{members.length}</b> people</span>
            <span><b>{pending.length}</b> pending</span>
            <span><b>{exportsLog.length}</b> exports</span>
            <span><b>{uploads.length}</b> files attached</span>
          </div>
        </div>
        <ShareCore people={members.length} files={uploads.length} exportsCount={exportsLog.length} pending={pending.length} />
      </motion.header>

      <section className="shx-kpis" aria-label="Share summary">
        <article className="shx-kpi shx-rise" style={{ animationDelay: "40ms" }}>
          <div className="shx-kpi-top">
            <span className="shx-kpi-ic t-blue"><Ico name="users" /></span>
            Collaborators
          </div>
          <div className="shx-kpi-mid">
            <b>{members.length}</b>
            <span className="shx-avstack" aria-hidden>
              {members.slice(0, 3).map((m) => {
                const u = users.find((x) => x.id === m.userId);
                return <i key={m.userId}>{initialsOf(u?.name || "?")}</i>;
              })}
              {members.length > 3 && <em>+{members.length - 3}</em>}
            </span>
          </div>
          <div className="shx-kpi-foot">
            {roleCount("owner")} owner · {roleCount("editor")} editor · {roleCount("viewer")} viewer
          </div>
        </article>

        <article className="shx-kpi shx-rise" style={{ animationDelay: "100ms" }}>
          <div className="shx-kpi-top">
            <span className="shx-kpi-ic t-gold"><Ico name="mail" /></span>
            Pending invites
          </div>
          <div className="shx-kpi-mid">
            <b>{pending.length}</b>
            <span className={`shx-signal${pending.length ? " on" : ""}`} aria-hidden><i /></span>
          </div>
          <div className="shx-kpi-foot">
            {pending.length ? "Recorded here — this prototype does not email" : "No one waiting for access"}
          </div>
        </article>

        <article className="shx-kpi shx-rise" style={{ animationDelay: "160ms" }}>
          <div className="shx-kpi-top">
            <span className="shx-kpi-ic t-violet"><Ico name="export" /></span>
            Exports
          </div>
          <div className="shx-kpi-mid">
            <b>{exportsLog.length}</b>
            <span className="shx-minibars" aria-hidden>
              {exportMix.map((x) => <i key={x.id} style={{ height: `${Math.max(18, (x.n / exportPeak) * 100)}%` }} title={`${x.label}: ${x.n}`} />)}
            </span>
          </div>
          <div className="shx-kpi-foot">
            {exportsLog[0] ? `Latest ${when(exportsLog[0].createdAt)}` : "Nothing generated yet"}
          </div>
        </article>

        <article className="shx-kpi shx-rise" style={{ animationDelay: "220ms" }}>
          <div className="shx-kpi-top">
            <span className="shx-kpi-ic t-orange"><Ico name="share" /></span>
            Handoff files
          </div>
          <div className="shx-kpi-mid">
            <b>{uploads.length}</b>
            <span className="shx-filestack" aria-hidden><i /><i /><i /></span>
          </div>
          <div className="shx-kpi-foot">
            {uploads.length ? `${prettySize(totalUploadBytes)} · session only` : "Bring your own PDF, CSV, JSON…"}
          </div>
        </article>
      </section>

      <motion.section
        className="shx-panel shx-upload"
        aria-labelledby="shx-upload-title"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="shx-panel-head">
          <div>
            <span className="shx-kicker">Upload bay</span>
            <h2 id="shx-upload-title">Bring your own files</h2>
            <p>Drop the artefacts the workspace cannot generate — figures, posters, raw data, signed PDFs. Each file is checked before it joins the handoff.</p>
          </div>
          {uploads.length > 0 && (
            <div className="shx-upload-actions">
              <span>{uploads.length} file{uploads.length === 1 ? "" : "s"} · {prettySize(totalUploadBytes)}</span>
              <button onClick={clearFiles}>Clear all</button>
            </div>
          )}
        </div>

        <div className="shx-up-grid">
          <label
            className={`shx-drop${dragging ? " is-drag" : ""}`}
            htmlFor="shx-file"
            tabIndex={0}
            onKeyDown={dropKey}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <input
              id="shx-file"
              ref={fileInput}
              className="shx-file-input"
              type="file"
              multiple
              accept={FILE_ACCEPT}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="shx-drop-ic"><Ico name="upload" /></span>
            <b>{dragging ? "Release to attach" : "Drop files here"}</b>
            <span className="shx-drop-sub">or <span className="shx-browse">browse your device</span> · {prettySize(MAX_FILE_BYTES)} each</span>
            <span className="shx-drop-formats" aria-hidden>
              {UPLOAD_FORMATS.slice(0, 5).map((f) => <i key={f.kind}>{f.label}</i>)}
              <i>+4 more</i>
            </span>
            <span className="shx-drop-privacy"><Ico name="shield" /> Validated in the browser. Never uploaded.</span>
          </label>

          <div className="shx-tray">
            <div className="shx-tray-head">
              <span className="shx-kicker">Session tray</span>
              <span className="shx-tray-count">{uploads.length}</span>
              {uploads.length > 0 && (
                <label className="shx-file-search">
                  <Ico name="search" />
                  <input
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                    placeholder="Find a file…"
                    aria-label="Search attached files"
                  />
                </label>
              )}
            </div>

            {uploads.length === 0 ? (
              <div className="shx-tray-empty">
                <span className="shx-empty-stack" aria-hidden><i /><i /><i /></span>
                <b>No files attached yet</b>
                <span>The report can list every file you add — names, types and sizes, never the contents.</span>
              </div>
            ) : (
              <>
                <ul className="shx-files">
                  <AnimatePresence initial={false}>
                    {shownFiles.map((f) => (
                      <motion.li
                        key={f.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.2 }}
                        className="shx-file"
                      >
                        <span className={`shx-file-ic f-${f.kind}`}><FileGlyph kind={f.kind} /></span>
                        <span className="shx-file-main">
                          <b title={f.file.name}>{f.file.name}</b>
                          <small>{formatLabel(f.kind)} · {f.ext} · {prettySize(f.file.size)}</small>
                        </span>
                        <span className="shx-file-state">Ready</span>
                        <span className="shx-file-actions">
                          <button onClick={() => downloadBlob(f.file.name, f.file)} aria-label={`Download ${f.file.name}`} title="Download original">
                            <Ico name="download" />
                          </button>
                          <button onClick={() => removeFile(f.id)} aria-label={`Remove ${f.file.name}`} title="Remove">
                            <Ico name="trash" />
                          </button>
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                {shownFiles.length === 0 && (
                  <p className="shx-tray-none">No attached file matches “{fileQuery.trim()}”.</p>
                )}
              </>
            )}
          </div>
        </div>

        {rejects.length > 0 && (
          <div className="shx-rejects" role="alert">
            <Ico name="shield" />
            <div>
              <b>{rejects.length} file{rejects.length === 1 ? "" : "s"} not added</b>
              <ul>
                {rejects.map((r) => <li key={`${r.name}-${r.reason}`}><span>{r.name}</span>{r.reason}</li>)}
              </ul>
            </div>
            <button onClick={() => setRejects([])}>Dismiss</button>
          </div>
        )}

        <div className="shx-formats">
          <div className="shx-formats-head">
            <span className="shx-kicker">Accepted here</span>
            <span>{prettySize(MAX_FILE_BYTES)} per file · {prettySize(MAX_TOTAL_BYTES)} per session</span>
          </div>
          <ul className="shx-format-grid">
            {UPLOAD_FORMATS.map((f) => (
              <li key={f.kind} className={`shx-format-tile f-${f.kind}`}>
                <span className="shx-format-ic"><FileGlyph kind={f.kind} /></span>
                <span className="shx-format-copy">
                  <b>{f.label}</b>
                  <em>{f.exts.map((e) => `.${e}`).join(" ")}</em>
                </span>
                <span className="shx-format-blurb">{f.blurb}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.section>

      <div className="shx-main">
        <motion.section
          className="shx-panel shx-access"
          aria-label="Workspace access"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="shx-panel-head">
            <div>
              <span className="shx-kicker">Access roster</span>
              <h2>Who gets in</h2>
              <p>Viewers read, editors change the research, owners manage the roster. Every route checks the same rule.</p>
            </div>
            {myRole && <Badge tone="lime">{myRole}</Badge>}
          </div>

          <form className="shx-invite" onSubmit={submitInvite} noValidate>
            <label className="shx-input" htmlFor="shx-email">
              <span className="shx-input-lbl">Email</span>
              <span className="shx-input-box">
                <Ico name="mail" />
                <input
                  id="shx-email"
                  type="email"
                  placeholder="teammate@lab.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!owner}
                  autoComplete="off"
                />
              </span>
            </label>
            <div className="shx-seg" role="group" aria-label="Role for the invitation">
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
            <button className="shx-btn lime" type="submit" disabled={!owner}>Invite</button>
          </form>
          {!owner && <p className="shx-hint">Only the workspace owner can invite or change roles.</p>}

          <ul className="shx-people">
            {members.map((m: Membership) => {
              const u = users.find((x) => x.id === m.userId);
              return (
                <li key={m.userId} className="shx-person">
                  <span className="shx-avatar">{initialsOf(u?.name || "?")}</span>
                  <div className="shx-person-main">
                    <b>
                      {u?.name || "Unknown researcher"}
                      {m.userId === sessionUserId && <em>you</em>}
                    </b>
                    <span>{u?.email || "no email"}</span>
                  </div>
                  {owner && m.role !== "owner" ? (
                    <select
                      className="shx-role"
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
            <div className="shx-pending">
              <span className="shx-kicker">Pending invitations</span>
              {pending.map((i) => (
                <div key={i.id} className="shx-pending-row">
                  <span className="shx-pending-ic" aria-hidden="true"><Ico name="mail" /></span>
                  <div>
                    <b>{i.email}</b>
                    <small>invited as {i.role}</small>
                  </div>
                  <Badge tone="yellow">{i.status}</Badge>
                </div>
              ))}
            </div>
          )}

          <div className="shx-note">
            <div className="shx-note-head">
              <span className="shx-kicker">Message with the invite</span>
              <em>{note.length}/240</em>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={240}
              rows={2}
              placeholder="Add context — what should they look at first?"
              aria-label="Message included in the copied invitation"
            />
            <div className="shx-note-foot">
              <code>{origin}/login</code>
              <button onClick={() => copy(`${origin}/login`, "link")}>{copied === "link" ? "✓ Link copied" : "Copy link"}</button>
              <button className="shx-btn lime sm" onClick={() => copy(inviteNote, "note")}>
                {copied === "note" ? "✓ Copied" : "Copy invite"}
              </button>
            </div>
          </div>
          <p className="shx-fine">Invitations are recorded in this workspace; this prototype does not send email. Attachments stay in this browser session.</p>
        </motion.section>

        <motion.aside
          className="shx-panel shx-map"
          aria-label="Sharing policy"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="shx-panel-head">
            <div>
              <span className="shx-kicker">Handoff map</span>
              <h2>What leaves the workspace</h2>
            </div>
            <Badge tone="green">enforced</Badge>
          </div>

          {shareTotal > 0 ? (
            <div className="shx-donut-row">
              <div className="shx-donut">
                <Donut
                  data={shareItems.map((s) => ({ name: s.name, value: s.value }))}
                  height={186}
                  center={{ value: String(shareTotal), label: "items" }}
                  colors={shareItems.map((s) => s.color)}
                />
              </div>
              <ul className="shx-legend">
                {shareItems.map((s) => (
                  <li key={s.name}>
                    <i style={{ background: s.color }} />
                    {s.name}
                    <b>{s.value}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="shx-map-empty">Nothing indexed yet. Add sources or files and the handoff map fills itself.</div>
          )}

          <div className="shx-roles">
            <span className="shx-kicker">What each role can do</span>
            <table className="shx-matrix">
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
          </div>

          <div className="shx-linkcard">
            <span className="shx-link-ic"><Ico name="link" /></span>
            <div>
              <span className="shx-kicker">Invite link</span>
              <code>{origin}/login</code>
            </div>
            <button onClick={() => copy(`${origin}/login`, "link")}>{copied === "link" ? "✓" : "Copy"}</button>
          </div>
          <p className="shx-fine">Exports are built in your browser from workspace data — nothing is uploaded. Uploaded files are listed by name, type and size only.</p>
        </motion.aside>
      </div>

      <section className="shx-panel shx-studio" aria-label="Export studio">
        <div className="shx-panel-head">
          <div>
            <span className="shx-kicker">Export studio</span>
            <h2>Build a handoff file</h2>
            <p>Pick a format. The preview is the real file — what you see is what downloads.</p>
          </div>
          <div className="shx-size">
            <b>{prettySize(bytes)}</b>
            <span>{content.split("\n").length} lines</span>
          </div>
        </div>

        <div className="shx-studio-grid">
          <div className="shx-picker">
            <div className="shx-format-pick" role="radiogroup" aria-label="Export format">
              {FORMATS.map((f) => {
                const on = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`shx-format${on ? " on" : ""}`}
                    onClick={() => setFormat(f.id)}
                  >
                    <span className="shx-format-icon" aria-hidden="true">{f.icon}</span>
                    <span className="shx-format-main">
                      <b>{f.label} <code>{f.ext}</code></b>
                      <span>{f.blurb}</span>
                    </span>
                    <span className="shx-radio" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <div className={`shx-sections${format !== "md" ? " is-muted" : ""}`}>
              <span className="shx-sections-lbl">
                Include {format !== "md" && <em>· report only</em>}
              </span>
              <div className="shx-chips">
                {SECTIONS.map((s) => {
                  const on = sections.includes(s.id);
                  const last = on && sections.length === 1;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`shx-chip${on ? " on" : ""}`}
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
              <p className="shx-sections-note">
                {uploads.length
                  ? `${uploads.length} attached file${uploads.length === 1 ? "" : "s"} will be listed in the report manifest.`
                  : "Attach files above to list them in the report manifest."}
              </p>
            </div>

            <div className="shx-runbar">
              <div className="shx-runbar-note">
                <b>{filename}</b>
                <span>saved to your downloads folder</span>
              </div>
              <button className="shx-btn lime" onClick={() => run()}>
                <Ico name="export" /> Generate &amp; download
              </button>
            </div>
          </div>

          <div className="shx-preview">
            <div className="shx-preview-bar">
              <span className="shx-dots" aria-hidden="true"><i /><i /><i /></span>
              <code>{filename}</code>
              <button className="shx-copy" onClick={() => copy(content, "preview")}>
                {copied === "preview" ? "✓" : "Copy"}
              </button>
            </div>
            <pre className="shx-code">{content}</pre>
          </div>
        </div>
      </section>

      <div className="shx-lower">
        <section className="shx-panel shx-card" aria-label="Export history">
          <div className="shx-card-head">
            <h2>Export history</h2>
            <Badge>{exportsLog.length}</Badge>
          </div>
          {exportsLog.length ? (
            <ul className="shx-history">
              {exportsLog.slice(0, 6).map((x) => {
                const f = formatOf(x.kind, x.format);
                return (
                  <li key={x.id}>
                    <span className="shx-fileicon" aria-hidden="true">{f.icon}</span>
                    <div>
                      <b>{x.kind}<code>.{x.format}</code></b>
                      <span>{when(x.createdAt)} · {x.size || "regenerated on demand"}</span>
                    </div>
                    <button className="shx-again" onClick={() => run(f.id)} aria-label={`Export ${x.kind} again`}>Again</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="shx-empty">Nothing exported yet. The first file will land here with its format, size and timestamp.</div>
          )}
        </section>

        <section className="shx-panel shx-card" aria-label="Workspace activity">
          <div className="shx-card-head">
            <h2>Workspace activity</h2>
            <Badge tone="violet">{acts.length}</Badge>
          </div>
          {acts.length ? (
            <ul className="shx-timeline">
              {acts.map((a) => (
                <li key={a.id}>
                  <i className={`k-${a.kind}`} aria-hidden="true" />
                  <p>{a.text}</p>
                  <time dateTime={a.createdAt}>{when(a.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="shx-empty">Sharing, edits and exports will be logged here.</div>
          )}
        </section>
      </div>
    </div>
  );
}

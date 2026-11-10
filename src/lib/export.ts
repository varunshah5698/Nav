import type { Edge, Experiment, MemoryEntry, RNode, Source } from "./types";

export function downloadBlob(name: string, blob: Blob) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

export function download(name: string, content: string, mime = "text/plain") {
  downloadBlob(name, new Blob([content], { type: mime }));
}

export function bytesOf(content: string) {
  return new Blob([content]).size;
}

export function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function graphJSON(nodes: RNode[], edges: Edge[], workspace?: string) {
  return JSON.stringify(
    {
      workspace: workspace || undefined,
      exported: new Date().toISOString(),
      counts: { nodes: nodes.length, edges: edges.length },
      nodes,
      edges,
    },
    null,
    2,
  );
}

export function bibtex(sources: Source[]) {
  return sources
    .map((s, i) => {
      const first = (s.authors || "anon").split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") || "anon";
      const year = new Date(s.createdAt).getFullYear();
      const key = `${first}${year}_${i}`;
      if (s.kind === "dataset")
        return `@dataset{${key},\n  title={${s.title}},\n  year={${year}},\n  note={${s.abstract || ""}},\n  url={${s.url || ""}}\n}`;
      return `@misc{${key},\n  title={${s.title}},\n  author={${s.authors || "Unknown"}},\n  year={${year}},\n  howpublished={${s.url || s.kind}},\n  note={${s.abstract || ""}}\n}`;
    })
    .join("\n\n");
}

export function expCSV(exps: Experiment[]) {
  const rows = ["experiment,run,status,accuracy,f1,loss,time_s,params"];
  exps.forEach((e) =>
    e.runs.forEach((r) =>
      rows.push(
        [
          `"${e.name}"`,
          r.id,
          r.status,
          r.metrics.accuracy ?? "",
          r.metrics.f1 ?? "",
          r.metrics.loss ?? "",
          r.metrics.time_s ?? "",
          `"${JSON.stringify(r.params).replace(/"/g, '""')}"`,
        ].join(","),
      ),
    ),
  );
  return rows.join("\n");
}

export type ReportSection = "sources" | "graph" | "experiments" | "memory" | "files";

export interface HandoffFile {
  name: string;
  ext: string;
  bytes: number;
}

export interface ReportParts {
  nodes: RNode[];
  edges: Edge[];
  sources: Source[];
  exps: Experiment[];
  mems: MemoryEntry[];
  files?: HandoffFile[];
}

export function workspaceReport(
  wsName: string,
  parts: ReportParts,
  sections: ReportSection[] = ["sources", "graph", "experiments", "memory", "files"],
) {
  const on = new Set(sections);
  const { nodes, edges, sources, exps, mems, files = [] } = parts;
  const runs = exps.reduce((a, e) => a + e.runs.length, 0);
  const out: string[] = [
    `# ${wsName} — Research Report`,
    ``,
    `_Generated ${new Date().toLocaleString()} from ResearchGraph. Metadata only — no synthesised numbers._`,
    ``,
    `| Item | Count |`,
    `| --- | --- |`,
    `| Sources | ${sources.length} |`,
    `| Graph nodes | ${nodes.length} |`,
    `| Graph edges | ${edges.length} |`,
    `| Experiments | ${exps.length} |`,
    `| Runs | ${runs} |`,
    `| Memory entries | ${mems.length} |`,
    `| Handoff files | ${files.length} |`,
    ``,
  ];

  if (on.has("sources")) {
    out.push(`## Sources`);
    out.push(
      sources.length
        ? sources
            .map(
              (s) =>
                `- **${s.title}**${s.authors ? ` — ${s.authors}` : ""} _(${s.kind}, ${s.status})_${
                  s.url ? `\n  <${s.url}>` : ""
                }`,
            )
            .join("\n")
        : "_No sources indexed._",
    );
    out.push(``);
  }

  if (on.has("graph")) {
    const titles = new Map(nodes.map((n) => [n.id, n.title]));
    out.push(`## Knowledge graph`);
    out.push(
      nodes.length
        ? nodes
            .map(
              (n) =>
                `- **[${n.type}] ${n.title}**${n.description ? ` — ${n.description}` : ""}${
                  n.tags.length ? ` _(${n.tags.join(", ")})_` : ""
                }`,
            )
            .join("\n")
        : "_Graph is empty._",
    );
    if (edges.length) {
      out.push(``, `### Relationships`);
      out.push(
        edges
          .map(
            (e) =>
              `- ${titles.get(e.source) || e.source} → ${titles.get(e.target) || e.target} _(${e.label || e.type})_`,
          )
          .join("\n"),
      );
    }
    out.push(``);
  }

  if (on.has("experiments")) {
    out.push(`## Experiments`);
    out.push(
      exps.length
        ? exps
            .map((e) =>
              [
                `### ${e.name} · ${e.status}`,
                `Objective: ${e.objective}`,
                `Method: ${e.methodology}`,
                `Params: \`${JSON.stringify(e.params)}\``,
                e.runs.length
                  ? `Runs:\n${e.runs
                      .map(
                        (r) =>
                          `  - ${r.id} · ${r.status} · acc=${r.metrics.accuracy ?? "—"} · f1=${
                            r.metrics.f1 ?? "—"
                          } · loss=${r.metrics.loss ?? "—"}`,
                      )
                      .join("\n")}`
                  : `Runs: none recorded`,
              ].join("\n"),
            )
            .join("\n\n")
        : "_No experiments recorded._",
    );
    out.push(``);
  }

  if (on.has("memory")) {
    out.push(`## Memory`);
    out.push(
      mems.length
        ? mems.map((m) => `- _[${m.kind}]_ **${m.title}** — ${m.description}`).join("\n")
        : "_No memory entries._",
    );
    out.push(``);
  }

  if (on.has("files")) {
    out.push(`## Handoff files`);
    out.push(
      files.length
        ? files.map((f) => `- ${f.name} _(${f.ext.toUpperCase()}, ${prettySize(f.bytes)})_`).join("\n")
        : "_No files attached._",
    );
    out.push(``);
  }

  return out.join("\n");
}

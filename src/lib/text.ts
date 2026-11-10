import type { Source } from "./types";

/** A page of text as extracted from a document. Pages are 1-indexed. */
export interface PageText { page: number; text: string }
export interface TextChunk { page: number; text: string }

/** Caps keep a full paper inside the localStorage budget without losing the opening pages. */
export const STORE_MAX_CHARS = 120_000;
export const STORE_MAX_CHUNKS = 240;
const CHUNK_TARGET = 850;

export function titleFromFilename(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled PDF";
}

export function normalizeText(t: string) {
  return (t || "")
    .replace(/\u00ad/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\n(?=[a-z])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLongParagraph(par: string, target: number): string[] {
  const sentences = par.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [par];
  const out: string[] = [];
  let buf = "";
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ""; };
  for (const s of sentences) {
    if (s.length > target * 1.6) {
      flush();
      for (let i = 0; i < s.length; i += target) out.push(s.slice(i, i + target).trim());
      continue;
    }
    if (buf.length + s.length > target) flush();
    buf += s;
  }
  flush();
  return out;
}

/** Split page text into page-referenced passages, capped for persistence. */
export function chunkPages(pages: PageText[], opts?: { maxChars?: number; maxChunks?: number }) {
  const maxChars = opts?.maxChars ?? STORE_MAX_CHARS;
  const maxChunks = opts?.maxChunks ?? STORE_MAX_CHUNKS;
  const chunks: TextChunk[] = [];
  let chars = 0;
  let truncated = false;
  outer: for (const p of pages) {
    const text = normalizeText(p.text);
    if (!text) continue;
    const paras = text.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
    for (const para of paras) {
      const parts = para.length > CHUNK_TARGET * 1.4 ? splitLongParagraph(para, CHUNK_TARGET) : [para];
      for (const part of parts) {
        if (chunks.length >= maxChunks || chars + part.length > maxChars) { truncated = true; break outer; }
        chunks.push({ page: p.page, text: part });
        chars += part.length;
      }
    }
  }
  return { chunks, chars, truncated };
}

/** Opening text of a document, used as its default summary. */
export function leadOf(text: string, max = 700) {
  const flat = normalizeText(text).replace(/\n+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim() + "…";
}

const STOP = new Set(("a about above after again against all also am an and any are aren't as at be because been before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why with won't would wouldn't you your yours yourself yourselves use used using based show shows shown study paper results method methods approach data model models proposed however therefore thus may can also two one three new").split(" "));

export function keywords(texts: string[], limit = 10) {
  const freq = new Map<string, number>();
  for (const t of texts) {
    for (const w of (t || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
      if (w.length < 4 || w.length > 28 || STOP.has(w) || /^\d+$/.test(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count }));
}

function sentences(text: string) {
  return (text.replace(/\n+/g, " ").match(/[^.!?]+[.!?]+["')\]]*/g) || [])
    .map(s => s.trim())
    .filter(s => s.length > 45 && s.length < 420 && /[A-Za-z]/.test(s));
}

export function keyPassages(chunks: TextChunk[], terms: { term: string }[], limit = 5) {
  const set = new Set(terms.map(t => t.term));
  const scored: { text: string; page: number; score: number }[] = [];
  chunks.forEach((c, i) => {
    for (const s of sentences(c.text)) {
      const words = new Set(s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/));
      let score = 0;
      set.forEach(t => { if (words.has(t)) score += 1; });
      if (score > 0) scored.push({ text: s, page: c.page, score: score + (i < 4 ? 0.4 : 0) });
    }
  });
  const seen = new Set<string>();
  return scored.sort((a, b) => b.score - a.score).filter(s => {
    const k = s.text.slice(0, 60).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
}

export function equationLines(chunks: TextChunk[], limit = 6) {
  const re = /[=\u2260\u2248\u2264\u2265\u03a3\u2211]/;
  const seen = new Set<string>();
  const out: TextChunk[] = [];
  for (const c of chunks) {
    for (const raw of c.text.split(/\n|(?<=[.;])\s+(?=[A-Z][a-z]+\s*[=:])/)) {
      const s = raw.trim().replace(/\s+/g, " ");
      if (s.length < 8 || s.length > 220) continue;
      if (!re.test(s) || /https?:|@|\.(png|jpg|pdf)\b/i.test(s)) continue;
      // prose rarely has an equation on the right of "=": require a number, operator or bracket there
      const rhs = s.slice(s.indexOf("=") + 1);
      if (s.includes("=") && !/[\d+\-*/^|()]/.test(rhs)) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ page: c.page, text: s });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type DigestMode = "summary" | "equations" | "review";

/** Prefer heading-style lines, then fall back to any mention of the section name. */
function sectionChunk(chunks: TextChunk[], name: string) {
  const heading = new RegExp(`(^|\\n)\\s*(?:\\d+(?:\\.\\d+)*[.)]?\\s*)?${name}s?\\b`, "i");
  const mention = new RegExp(`\\b${name}s?\\b`, "i");
  return chunks.find(c => heading.test(c.text)) || chunks.find(c => mention.test(c.text));
}

export interface Digest { text: string; confidence: number; passages: number; pages: number }

const SECTIONS = ["abstract", "introduction", "related work", "background", "method", "methodology", "approach", "experiment", "evaluation", "results", "discussion", "limitation", "conclusion", "future work", "references"];

/** Deterministic, extractive digest of an ingested source. No LLM: sentences are quoted from the document. */
export function digestSource(src: Pick<Source, "title" | "abstract" | "chunks" | "pages">, mode: DigestMode): Digest {
  const chunks = src.chunks || [];
  const pages = src.pages || new Set(chunks.map(c => c.page)).size;
  if (!chunks.length) {
    return {
      text: `No extracted text is stored for “${src.title}”. Re-ingest the PDF (selectable text is required — scanned pages need OCR) and run this again.`,
      confidence: 0.15, passages: 0, pages,
    };
  }
  const terms = keywords(chunks.map(c => c.text));
  const coverage = (() => {
    const hits = new Set<string>();
    for (const c of chunks) {
      const words = new Set(c.text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/));
      terms.forEach(t => { if (words.has(t.term)) hits.add(t.term); });
    }
    return terms.length ? hits.size / terms.length : 0;
  })();

  if (mode === "equations") {
    const eqs = equationLines(chunks);
    if (!eqs.length) {
      return {
        text: `No equation-like lines were found in “${src.title}” (${pages} pages, ${chunks.length} passages). This extractor looks for math symbols and “=” in selectable text — scanned or image-based equations cannot be read without OCR.`,
        confidence: 0.25, passages: 0, pages,
      };
    }
    return {
      text: `Equation candidates from “${src.title}” — ${pages} pages, ${chunks.length} passages (local text extraction, no LLM). Verify each line against the PDF before citing.\n\n` +
        eqs.map((e, i) => `${i + 1}. [p.${e.page}] ${e.text}`).join("\n") +
        `\n\nFound ${eqs.length} candidate line${eqs.length === 1 ? "" : "s"}; extraction can split multi-line equations.`,
      confidence: Math.min(0.8, 0.45 + eqs.length * 0.05), passages: eqs.length, pages,
    };
  }

  if (mode === "review") {
    const found: { section: string; page: number }[] = [];
    for (const name of SECTIONS) {
      const hit = sectionChunk(chunks, name);
      if (hit) found.push({ section: name, page: hit.page });
    }
    const checks = [
      { label: "Selectable text extracted", ok: true, detail: `${chunks.length} passages from ${pages} pages` },
      { label: "Method section detected", ok: found.some(f => /method|approach/i.test(f.section)), detail: found.filter(f => /method|approach/i.test(f.section)).map(f => `p.${f.page}`).join(", ") || "not detected" },
      { label: "Results / evaluation detected", ok: found.some(f => /result|evaluation|experiment/i.test(f.section)), detail: found.filter(f => /result|evaluation|experiment/i.test(f.section)).map(f => `p.${f.page}`).join(", ") || "not detected" },
      { label: "Limitations stated", ok: found.some(f => f.section === "limitation"), detail: found.filter(f => f.section === "limitation").map(f => `p.${f.page}`).join(", ") || "none found" },
      { label: "Reference list detected", ok: found.some(f => f.section === "references"), detail: found.filter(f => f.section === "references").map(f => `p.${f.page}`).join(", ") || "not detected" },
      { label: "Figures / tables referenced", ok: /\b(figure|fig\.|table)\s*\d+/i.test(chunks.map(c => c.text).join(" ")), detail: "text mentions only — images are not parsed" },
    ];
    const pass = checks.filter(c => c.ok).length;
    return {
      text: `Structural review of “${src.title}” — ${pages} pages, ${chunks.length} passages (local extraction, no LLM).\n\n` +
        checks.map(c => `${c.ok ? "✓" : "✗"} ${c.label}: ${c.detail}`).join("\n") +
        `\n\n${pass}/${checks.length} checks satisfied. This is a structural text check only: it does not validate claims, statistics or citations.`,
      confidence: Math.min(0.85, 0.4 + pass / checks.length * 0.4), passages: pass, pages,
    };
  }

  const passages = keyPassages(chunks, terms, 5);
  const kw = terms.slice(0, 8).map(t => `${t.term} (${t.count})`).join(", ") || "none";
  const abstract = src.abstract?.trim();
  return {
    text: `Extractive summary of “${src.title}” — ${pages} pages, ${chunks.length} passages (local text extraction, no LLM; quotes are verbatim).\n\n` +
      (abstract ? `Opening text: ${abstract}\n\n` : "") +
      `Key terms: ${kw}.\n\n` +
      (passages.length
        ? `Most representative passages:\n${passages.map((p, i) => `${i + 1}. [p.${p.page}] “${p.text}”`).join("\n")}`
        : "No representative sentences could be scored from the extracted text.") +
      `\n\nTerm coverage: ${Math.round(coverage * 100)}% of key terms appear in the selected passages. Verify quotes against the PDF before citing.`,
    confidence: Math.min(0.85, 0.45 + coverage * 0.35 + passages.length * 0.02), passages: passages.length, pages,
  };
}

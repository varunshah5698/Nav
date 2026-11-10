import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { chunkPages, normalizeText, type PageText, type TextChunk } from "./text";

let workerConfigured = false;
function configureWorker() {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  workerConfigured = true;
}

export interface ParsedPdf {
  pages: PageText[];
  chunks: TextChunk[];
  /** Plain extracted text (capped) used as the source body. */
  text: string;
  title?: string;
  author?: string;
  pageCount: number;
  charCount: number;
  truncated: boolean;
}

const HARD_TEXT_CAP = 160_000;

function cleanMeta(v: unknown) {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (s.length < 3 || s.length > 200) return undefined;
  if (/^(untitled|unknown|document\d*|title|microsoft word.*|powerpoint.*)$/i.test(s)) return undefined;
  return s;
}

function pageText(items: Array<Record<string, any>>) {
  let out = "";
  let prevX: number | null = null;
  let prevY: number | null = null;
  let prevW = 0;
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    const tr = Array.isArray(it.transform) ? it.transform : [];
    const x = Number(tr[4] ?? 0);
    const y = Number(tr[5] ?? 0);
    if (prevY !== null && Math.abs(y - prevY) > 2.5) {
      if (!out.endsWith("\n")) out += "\n";
      prevX = null;
    } else if (prevX !== null && typeof it.width === "number" && x - (prevX + prevW) > 2 && !/\s$/.test(out) && !/^\s/.test(it.str)) {
      out += " ";
    }
    out += it.str;
    if (it.hasEOL && !out.endsWith("\n")) out += "\n";
    prevX = x;
    prevY = y;
    prevW = typeof it.width === "number" ? it.width : 0;
  }
  return normalizeText(out);
}

function friendlyError(err: unknown) {
  const e = err as { name?: string; message?: string };
  const msg = e?.message || "";
  if (e?.name === "PasswordException" || /password/i.test(msg)) return new Error("This PDF is password-protected. Remove the password and try again.");
  if (e?.name === "InvalidPDFException" || /invalid pdf|no pdf header/i.test(msg)) return new Error("That file is not a valid PDF. Try exporting it again.");
  if (e?.name === "MissingPDFException") return new Error("The PDF could not be read. Try choosing the file again.");
  return new Error(msg || "Could not read the PDF.");
}

/** Extract real, selectable text from a PDF entirely in the browser. */
export async function parsePdf(file: File, onProgress?: (pct: number) => void): Promise<ParsedPdf> {
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > 40 * 1024 * 1024) throw new Error("PDFs up to 40 MB are supported. Split large files and try again.");
  configureWorker();

  const data = new Uint8Array(await file.arrayBuffer());
  let task: pdfjs.PDFDocumentLoadingTask | null = null;
  let doc: pdfjs.PDFDocumentProxy | null = null;
  try {
    task = pdfjs.getDocument({ data, isOffscreenCanvasSupported: false });
    if (onProgress) task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total > 0) onProgress(Math.min(45, Math.round((loaded / total) * 45)));
    };
    doc = await task.promise;

    let metaTitle: string | undefined;
    let metaAuthor: string | undefined;
    try {
      const meta = await doc.getMetadata();
      const info = (meta?.info || {}) as Record<string, unknown>;
      metaTitle = cleanMeta(info.Title);
      metaAuthor = cleanMeta(info.Author);
    } catch { /* metadata is optional */ }

    const pages: PageText[] = [];
    let charCount = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      try {
        const content = await page.getTextContent();
        const text = pageText(content.items as Array<Record<string, any>>);
        if (text) { charCount += text.length; pages.push({ page: i, text }); }
      } finally {
        page.cleanup();
      }
      onProgress?.(45 + Math.round((i / doc.numPages) * 55));
    }

    const { chunks, truncated } = chunkPages(pages);
    let text = "";
    for (const p of pages) {
      if (text.length >= HARD_TEXT_CAP) break;
      text += (text ? "\n\n" : "") + p.text;
    }
    if (text.length > HARD_TEXT_CAP) text = text.slice(0, HARD_TEXT_CAP);

    return {
      pages, chunks, text, pageCount: doc.numPages, charCount, truncated,
      title: metaTitle, author: metaAuthor,
    };
  } catch (err) {
    throw friendlyError(err);
  } finally {
    if (task) { try { await task.destroy(); } catch { /* ignore */ } }
  }
}

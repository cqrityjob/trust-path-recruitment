// HAYAT — the browser document reader (pdf.js + Tesseract.js).
//
// ── WHY THE DOCUMENT IS READ HERE AND NOT ON THE SERVER ────────────────
//
// The deployed server runtime is Cloudflare Workers. Tesseract's WASM engine
// and its language data do not fit a Worker's memory and CPU budget, and
// Docling is Python. That alone would decide it, but there is a better reason:
// read here, the document never leaves the holder's device in order to be
// read. No OCR text is uploaded, stored or logged, because none is ever sent.
// The existing private upload still happens exactly where it did before --
// after the claim is saved -- and is the only time the bytes travel.
//
// The cost is that a reading is client output, and client output is a claim.
// That is the correct status for it: see ./verification for what is evidence.
//
// ── WHERE THE ENGINE COMES FROM ────────────────────────────────────────
//
// Tesseract.js defaults to fetching its worker, its WASM core and its language
// data from a public CDN at run time. HAYAT does not: all three are served
// from this application's own origin under /hayat-ocr/ (see
// scripts/vite/hayat-ocr-assets.ts), pinned to the versions in the lockfile.
//
// This module is browser-only and is imported dynamically by the form, so
// neither library is in the initial bundle and neither reaches the server
// build.

import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { HAYAT_LIMITS } from "./limits";
import { readImageSize } from "./image-size";
import type { DocumentReader, ReadFailure, ReadOutcome, TextLine } from "./types";

export const HAYAT_OCR_BASE = "/hayat-ocr";

class ReadError extends Error {
  constructor(readonly reason: ReadFailure) {
    super(reason);
  }
}

type OcrWorker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>;

/** One reading's disposable resources: whatever is open when it is abandoned. */
interface Session {
  readonly signal: AbortSignal;
  ocr: OcrWorker | null;
  dispose: (() => void)[];
}

const aborted = (session: Session) => {
  if (session.signal.aborted) throw new ReadError("timeout");
};

async function ocrWorker(session: Session): Promise<OcrWorker> {
  if (session.ocr) return session.ocr;
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(["swe", "eng"], 1, {
      workerPath: `${HAYAT_OCR_BASE}/worker.min.js`,
      corePath: `${HAYAT_OCR_BASE}/core`,
      langPath: `${HAYAT_OCR_BASE}/lang`,
      // A blob worker would importScripts() a relative URL it cannot resolve.
      workerBlobURL: false,
      gzip: true,
    });
    session.ocr = worker;
    session.dispose.push(() => void worker.terminate());
    return worker;
  } catch {
    throw new ReadError("engine_unavailable");
  }
}

async function ocrCanvas(
  session: Session,
  canvas: HTMLCanvasElement,
  page: number,
): Promise<TextLine[]> {
  const worker = await ocrWorker(session);
  aborted(session);
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
  const lines: TextLine[] = [];
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        const text = line.text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const weakest = Math.min(line.confidence, ...line.words.map((w) => w.confidence));
        lines.push({ page, text, source: "ocr", confidence: Math.max(0, weakest) / 100 });
      }
  return lines;
}

// ── Orientation ─────────────────────────────────────────────────────────
//
// A phone photo of a certificate is sideways about as often as it is not, and
// an EXIF flag only helps when the camera wrote one. Tesseract's own
// orientation detection needs the legacy engine and a second model; this
// reader ships the LSTM engine only. So orientation is found the plain way:
// if the upright reading is poor, read a SMALL copy at 90, 180 and 270 degrees,
// keep whichever reads best, and only then do the full-size pass in that
// orientation. An upright document costs nothing extra.

const alnum = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, "").length;
/** How much legible text a reading holds: characters weighted by confidence. */
const legibility = (lines: readonly TextLine[]) =>
  lines.reduce((sum, l) => sum + alnum(l.text) * (l.confidence ?? 0), 0);
const readsWell = (lines: readonly TextLine[]) => {
  const characters = lines.reduce((n, l) => n + alnum(l.text), 0);
  return characters >= 30 && legibility(lines) / characters >= 0.7;
};

function rotated(
  source: HTMLCanvasElement,
  degrees: 90 | 180 | 270,
  maxEdge: number,
  session: Session,
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const w = source.width * scale;
  const h = source.height * scale;
  const canvas = canvasOf(degrees === 180 ? w : h, degrees === 180 ? h : w, session);
  const context = canvas.getContext("2d");
  if (!context) throw new ReadError("engine_unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -w / 2, -h / 2, w, h);
  return canvas;
}

async function ocrAnyOrientation(
  session: Session,
  canvas: HTMLCanvasElement,
  page: number,
): Promise<TextLine[]> {
  const upright = await ocrCanvas(session, canvas, page);
  if (readsWell(upright)) return upright;
  let best: { degrees: 0 | 90 | 180 | 270; score: number } = {
    degrees: 0,
    score: legibility(upright),
  };
  for (const degrees of [90, 270, 180] as const) {
    aborted(session);
    const probe = rotated(canvas, degrees, HAYAT_LIMITS.orientationProbeEdge, session);
    const lines = await ocrCanvas(session, probe, page);
    probe.width = 0;
    probe.height = 0;
    // A turned copy must read clearly better, not marginally: noise read
    // sideways is still noise.
    if (readsWell(lines) && legibility(lines) > best.score * 1.5)
      best = { degrees, score: legibility(lines) };
  }
  if (best.degrees === 0) return upright;
  return ocrCanvas(session, rotated(canvas, best.degrees, HAYAT_LIMITS.maxOcrEdge, session), page);
}

function canvasOf(width: number, height: number, session: Session): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  // Releasing the backing store is what actually returns the memory.
  session.dispose.push(() => {
    canvas.width = 0;
    canvas.height = 0;
  });
  return canvas;
}

async function readImage(session: Session, file: Blob, mimeType: string): Promise<ReadOutcome> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const declared = readImageSize(bytes, mimeType);
  if (mimeType !== "image/heic") {
    if (!declared) throw new ReadError("unreadable");
    if (declared.width * declared.height > HAYAT_LIMITS.maxSourcePixels)
      throw new ReadError("too_large_to_process");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Most browsers cannot decode HEIC. The file is still a valid attachment.
    throw new ReadError(mimeType === "image/heic" ? "unsupported_format" : "unreadable");
  }
  session.dispose.push(() => bitmap.close());
  if (bitmap.width * bitmap.height > HAYAT_LIMITS.maxSourcePixels)
    throw new ReadError("too_large_to_process");
  const scale = Math.min(1, HAYAT_LIMITS.maxOcrEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = canvasOf(bitmap.width * scale, bitmap.height * scale, session);
  const context = canvas.getContext("2d");
  if (!context) throw new ReadError("engine_unavailable");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const lines = await ocrAnyOrientation(session, canvas, 1);
  if (lines.length === 0) throw new ReadError("no_text");
  return { ok: true, text: { lines, pageCount: 1, pagesRead: 1 } };
}

interface PdfTextItem {
  readonly str?: string;
  readonly hasEOL?: boolean;
  readonly transform?: readonly number[];
}

/** pdf.js text items -> printed lines, split on end-of-line and on a new baseline. */
function linesOf(items: readonly PdfTextItem[], page: number): TextLine[] {
  const lines: TextLine[] = [];
  let current = "";
  let baseline: number | null = null;
  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) lines.push({ page, text, source: "pdf_text", confidence: null });
    current = "";
  };
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = item.transform?.[5] ?? null;
    if (baseline !== null && y !== null && Math.abs(y - baseline) > 2) flush();
    if (y !== null) baseline = y;
    current += (current && !current.endsWith(" ") ? " " : "") + item.str;
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

async function readPdf(session: Session, file: Blob): Promise<ReadOutcome> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => {
    throw new ReadError("engine_unavailable");
  });
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // A certificate has no business running scripts or forms.
    enableXfa: false,
    stopAtErrors: false,
    useSystemFonts: false,
    maxImageSize: HAYAT_LIMITS.maxSourcePixels,
  });
  session.dispose.push(() => void task.destroy());
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new ReadError(name === "PasswordException" ? "encrypted" : "unreadable");
  }
  if (pdf.numPages > HAYAT_LIMITS.maxDeclaredPages) throw new ReadError("too_large_to_process");
  const pagesRead = Math.min(pdf.numPages, HAYAT_LIMITS.maxPages);
  const lines: TextLine[] = [];
  for (let number = 1; number <= pagesRead; number += 1) {
    aborted(session);
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const embedded = linesOf(content.items as PdfTextItem[], number);
    const characters = embedded.reduce((n, l) => n + l.text.length, 0);
    if (characters >= HAYAT_LIMITS.minEmbeddedChars) {
      lines.push(...embedded);
    } else {
      // A scanned page: render it, within the pixel budget, and OCR the render.
      const base = page.getViewport({ scale: 1 });
      const budget = Math.sqrt(HAYAT_LIMITS.maxRenderPixels / (base.width * base.height));
      const viewport = page.getViewport({ scale: Math.min(HAYAT_LIMITS.renderScale, budget) });
      const canvas = canvasOf(viewport.width, viewport.height, session);
      const context = canvas.getContext("2d");
      if (!context) throw new ReadError("engine_unavailable");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      lines.push(...(await ocrAnyOrientation(session, canvas, number)));
      canvas.width = 0;
      canvas.height = 0;
    }
    page.cleanup();
  }
  if (lines.length === 0) throw new ReadError("no_text");
  return { ok: true, text: { lines, pageCount: pdf.numPages, pagesRead } };
}

export function createBrowserDocumentReader(): DocumentReader {
  return {
    async read(file, mimeType, signal) {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), HAYAT_LIMITS.timeoutMs);
      const session: Session = {
        signal: AbortSignal.any([signal, timeout.signal]),
        ocr: null,
        dispose: [],
      };
      const release = () => {
        clearTimeout(timer);
        for (const dispose of session.dispose.splice(0).reverse())
          try {
            dispose();
          } catch {
            // Disposal is best-effort; a failed terminate must not mask the result.
          }
      };
      // Abandoning a reading tears the engine down immediately; the pending
      // work then rejects, and the race below has already answered.
      const abandoned = new Promise<ReadOutcome>((resolve) =>
        session.signal.addEventListener(
          "abort",
          () => {
            release();
            resolve({ ok: false, reason: "timeout" });
          },
          { once: true },
        ),
      );
      const work = (async (): Promise<ReadOutcome> => {
        try {
          if (mimeType === "application/pdf") return await readPdf(session, file);
          if (mimeType.startsWith("image/")) return await readImage(session, file, mimeType);
          return { ok: false, reason: "unsupported_format" };
        } catch (error) {
          return { ok: false, reason: error instanceof ReadError ? error.reason : "unreadable" };
        }
      })();
      try {
        return await Promise.race([work, abandoned]);
      } finally {
        release();
      }
    },
  };
}

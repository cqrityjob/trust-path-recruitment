import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import {
  EXTRACTION_LIMITS,
  ExtractionError,
  SW_EXTRACTION_VERSION,
  type DocumentExtraction,
  type ExtractionFailureCode,
} from "./contracts";

interface WorkerInput {
  bytes: Uint8Array;
  format: "pdf" | "docx";
  pdfjsUrl: string;
  limits: typeof EXTRACTION_LIMITS;
}

/**
 * This self-contained function runs in a disposable Node worker. No environment,
 * credentials or source-controlled URL enter it. Keeping parsing off the server
 * event loop lets the parent terminate CPU-bound input at the hard deadline.
 */
async function extractInWorker(input: WorkerInput) {
  const { createHash } = await import("node:crypto");
  const { inflateRawSync } = await import("node:zlib");
  const { bytes, format, limits } = input;
  const started = Date.now();
  const fail = (code: string): never => {
    throw Object.assign(new Error(code), { code });
  };
  const checkTime = () => {
    if (Date.now() - started >= limits.timeoutMs) fail("deadline");
  };
  const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
  const segments: Array<{
    ordinal: number;
    locator: { kind: "page" | "section"; number: number };
    text: string;
    sha256: string;
  }> = [];
  let totalCharacters = 0;
  const addText = (raw: string, kind: "page" | "section", number: number) => {
    checkTime();
    const text = raw
      .replaceAll(String.fromCharCode(0), "")
      .replace(/[\t ]+/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!text) return;
    totalCharacters += text.length;
    if (totalCharacters > limits.textCharacters) fail("too_much_text");
    for (let offset = 0; offset < text.length; ) {
      let end = Math.min(offset + limits.chunkCharacters, text.length);
      const last = text.charCodeAt(end - 1);
      if (end < text.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
      const chunk = text.slice(offset, end).trim();
      if (chunk) {
        if (segments.length >= limits.segments) fail("too_much_text");
        segments.push({
          ordinal: segments.length + 1,
          locator: { kind, number },
          text: chunk,
          sha256: hash(chunk),
        });
      }
      offset = end;
    }
  };
  // PDF.js receives bytes only. Reject external/font fetches rather than adding
  // a browser, renderer, annotation executor or document-provided network path.
  globalThis.fetch = async () => {
    throw new Error("SW_DOCUMENT_NETWORK_DISABLED");
  };

  if (format === "pdf") {
    let engine: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
    try {
      engine = await import(input.pdfjsUrl);
    } catch {
      return fail("engine_unavailable");
    }
    const task = engine.getDocument({
      data: new Uint8Array(bytes),
      enableXfa: false,
      stopAtErrors: true,
      useSystemFonts: false,
      disableFontFace: true,
      useWasm: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      maxImageSize: 0,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      useWorkerFetch: false,
      verbosity: 0,
    });
    let document: Awaited<typeof task.promise>;
    try {
      document = await task.promise;
    } catch (error) {
      await task.destroy();
      return fail(
        (error as { name?: string }).name === "PasswordException" ? "encrypted" : "malformed",
      );
    }
    try {
      if (document.numPages > limits.pages) fail("too_many_pages");
      let emptyPages = 0;
      for (let number = 1; number <= document.numPages; number += 1) {
        checkTime();
        const page = await document.getPage(number);
        // No rendering, JavaScript/actions, attachments, links, XFA or OCR.
        const stream = page.streamTextContent({ includeMarkedContent: false });
        const reader = stream.getReader();
        let text = "";
        let baseline: number | null = null;
        try {
          for (;;) {
            checkTime();
            const part = await reader.read();
            if (part.done) break;
            for (const item of part.value.items) {
              if (!("str" in item)) continue;
              const y = item.transform[5];
              if (baseline !== null && Math.abs(y - baseline) > 2) text += "\n";
              baseline = y;
              text += item.str + (item.hasEOL ? "\n" : " ");
              if (totalCharacters + text.length > limits.textCharacters) fail("too_much_text");
            }
          }
        } finally {
          reader.releaseLock();
          page.cleanup();
        }
        if (!/[\p{L}\p{N}]/u.test(text)) emptyPages += 1;
        addText(text, "page", number);
      }
      if (!segments.some((segment) => /\p{L}{2}/u.test(segment.text))) fail("scanned_or_empty");
      return {
        format,
        pageCount: document.numPages,
        segments,
        warnings: emptyPages ? ["pages_without_text"] : [],
      };
    } finally {
      await task.destroy();
    }
  }

  const data = Buffer.from(bytes);
  const range = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > data.length) fail("malformed");
  };
  const u16 = (offset: number) => {
    range(offset, 2);
    return data.readUInt16LE(offset);
  };
  const u32 = (offset: number) => {
    range(offset, 4);
    return data.readUInt32LE(offset);
  };
  const decode = (value: Uint8Array) => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(value);
    } catch {
      return fail("malformed");
    }
  };
  let eocd = -1;
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset -= 1) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === data.length) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || u16(eocd + 4) !== 0 || u16(eocd + 6) !== 0) fail("malformed");
  const count = u16(eocd + 10);
  if (count !== u16(eocd + 8) || count === 65535 || count < 2) fail("malformed");
  if (count > limits.zipEntries) fail("too_large");
  const directorySize = u32(eocd + 12);
  const directoryStart = u32(eocd + 16);
  if (directoryStart + directorySize !== eocd) fail("malformed");
  type Entry = {
    name: string;
    flags: number;
    method: number;
    crc: number;
    compressed: number;
    uncompressed: number;
    offset: number;
  };
  const entries = new Map<string, Entry>();
  let position = directoryStart;
  let totalUncompressed = 0;
  for (let index = 0; index < count; index += 1) {
    checkTime();
    if (u32(position) !== 0x02014b50) fail("malformed");
    range(position, 46);
    const flags = u16(position + 8);
    const method = u16(position + 10);
    if (flags & 0x41) fail("encrypted");
    if (![0, 8].includes(method) || u16(position + 34) !== 0) fail("malformed");
    const compressed = u32(position + 20);
    const uncompressed = u32(position + 24);
    const nameLength = u16(position + 28);
    const extraLength = u16(position + 30);
    const commentLength = u16(position + 32);
    range(position + 46, nameLength + extraLength + commentLength);
    const name = decode(data.subarray(position + 46, position + 46 + nameLength));
    if (
      !name ||
      name.length > 240 ||
      /[\\:]/.test(name) ||
      [...name].some((character) => character.charCodeAt(0) < 32) ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === ".." || part === ".")
    )
      fail("malformed");
    if (entries.has(name.toLowerCase()) || ((u32(position + 38) >>> 16) & 0xf000) === 0xa000)
      fail("malformed");
    if (/(?:vbaproject\.bin|macroenabled|^word\/(?:embeddings|activex)\/)/i.test(name))
      fail("unsupported");
    totalUncompressed += uncompressed;
    if (
      totalUncompressed > limits.uncompressedBytes ||
      uncompressed > Math.max(1024, compressed * limits.compressionRatio)
    )
      fail("too_large");
    const entry: Entry = {
      name,
      flags,
      method,
      crc: u32(position + 16),
      compressed,
      uncompressed,
      offset: u32(position + 42),
    };
    if (
      entry.offset >= directoryStart ||
      entry.compressed === 0xffffffff ||
      entry.uncompressed === 0xffffffff
    )
      fail("malformed");
    entries.set(name.toLowerCase(), entry);
    position += 46 + nameLength + extraLength + commentLength;
  }
  if (position !== eocd) fail("malformed");
  const crc32 = (value: Uint8Array) => {
    let crc = 0xffffffff;
    for (const octet of value) {
      crc ^= octet;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const inflate = (name: string, cap: number) => {
    const entry = entries.get(name.toLowerCase());
    if (!entry || entry.name !== name) return fail("malformed");
    const offset = entry.offset;
    if (
      u32(offset) !== 0x04034b50 ||
      u16(offset + 6) !== entry.flags ||
      u16(offset + 8) !== entry.method
    )
      fail("malformed");
    const nameLength = u16(offset + 26);
    const extraLength = u16(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    range(offset + 30, nameLength + extraLength);
    if (
      decode(data.subarray(offset + 30, offset + 30 + nameLength)) !== name ||
      start + entry.compressed > directoryStart
    )
      fail("malformed");
    if (
      !(entry.flags & 8) &&
      (u32(offset + 14) !== entry.crc ||
        u32(offset + 18) !== entry.compressed ||
        u32(offset + 22) !== entry.uncompressed)
    )
      fail("malformed");
    if (entry.uncompressed > cap) fail("too_large");
    let expanded: Buffer;
    try {
      const compressed = data.subarray(start, start + entry.compressed);
      expanded =
        entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: cap });
    } catch {
      return fail("malformed");
    }
    if (
      expanded.length !== entry.uncompressed ||
      expanded.length > cap ||
      crc32(expanded) !== entry.crc
    )
      fail("malformed");
    return decode(expanded);
  };
  const types = inflate("[Content_Types].xml", 65536);
  if (
    /<!DOCTYPE|<!ENTITY|macroEnabled/i.test(types) ||
    !types.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    ) ||
    !types.includes("/word/document.xml")
  )
    fail("unsupported");
  const xml = inflate("word/document.xml", limits.xmlBytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /<\?xml[^?]*encoding\s*=\s*["'](?!utf-8["'])/i.test(xml))
    fail("unsupported");
  // A narrow well-formed XML reader, not HTML stripping. No DTD, entity loader,
  // relationship resolver, embedded object, macro or alternate-content engine.
  const entity = (text: string) =>
    text.replace(/&([^;]{1,32});|&/g, (match, name: string | undefined) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      if (name && Object.hasOwn(named, name)) return named[name];
      if (name && /^#(?:[0-9]+|x[0-9a-f]+)$/i.test(name)) {
        const code =
          name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff))
        )
          return String.fromCodePoint(code);
      }
      return fail("malformed");
    });
  const stack: string[] = [];
  let prefix = "w";
  let bodyDepth = 0;
  let deletedDepth = 0;
  let textDepth = 0;
  let section = 1;
  let paragraph = "";
  let cursor = 0;
  let rootSeen = false;
  let rootClosed = false;
  const flush = () => {
    addText(paragraph, "section", section++);
    paragraph = "";
  };
  const tag = /<(?:(!--[\s\S]*?--)|(\?xml\s[^?]*\?)|([^<>"']|"[^"]*"|'[^']*')*)>/g;
  for (let match = tag.exec(xml); match; match = tag.exec(xml)) {
    checkTime();
    const between = xml.slice(cursor, match.index);
    if (between.includes("<")) fail("malformed");
    if (textDepth && !deletedDepth) paragraph += entity(between);
    else if (!stack.length && between.trim()) fail("malformed");
    cursor = match.index + match[0].length;
    if (paragraph.length + totalCharacters > limits.textCharacters) fail("too_much_text");
    if (match[1] || match[2]) continue;
    const raw = match[0].slice(1, -1).trim();
    if (raw.startsWith("!") || raw.startsWith("?")) fail("unsupported");
    const closing = raw.startsWith("/");
    const selfClosing = raw.endsWith("/");
    const name = raw.match(/^\/?([A-Za-z_][\w.:-]*)/)?.[1];
    if (!name) return fail("malformed");
    if (closing) {
      if (raw !== `/${name}` || stack.pop() !== name) fail("malformed");
      if (name === `${prefix}:t` && bodyDepth) textDepth -= 1;
      if (name === `${prefix}:del`) deletedDepth -= 1;
      if (name === `${prefix}:p` && bodyDepth && !deletedDepth) flush();
      if (name === `${prefix}:body`) bodyDepth -= 1;
      if (!stack.length) rootClosed = true;
      continue;
    }
    let attributes = raw.slice(name.length, selfClosing ? -1 : undefined);
    const attributeNames = new Set<string>();
    while (attributes.trim()) {
      const attribute = attributes.match(/^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"<]*"|'[^'<]*')/);
      if (!attribute || attributeNames.has(attribute[1])) return fail("malformed");
      attributeNames.add(attribute[1]);
      entity(attribute[2].slice(1, -1));
      attributes = attributes.slice(attribute[0].length);
    }
    if (!stack.length) {
      if (rootSeen || rootClosed) fail("malformed");
      const ns = raw.match(
        /xmlns:([A-Za-z_][\w.-]*)\s*=\s*["'](?:http:\/\/schemas.openxmlformats.org\/wordprocessingml\/2006\/main|http:\/\/purl.oclc.org\/ooxml\/wordprocessingml\/main)["']/,
      );
      if (!ns || name !== `${ns[1]}:document`) return fail("malformed");
      prefix = ns[1];
      rootSeen = true;
    } else if (new RegExp(`xmlns:${prefix}\\s*=`).test(raw)) fail("unsupported");
    if (stack.length >= 128) fail("too_large");
    if (name === `${prefix}:body`) bodyDepth += 1;
    if (name === `${prefix}:del`) deletedDepth += 1;
    if (name === `${prefix}:t` && bodyDepth) textDepth += 1;
    if (bodyDepth && !deletedDepth && (name === `${prefix}:tab` || name === `${prefix}:br`))
      paragraph += "\n";
    if (!selfClosing) stack.push(name);
    else {
      if (name === `${prefix}:t` && bodyDepth) textDepth -= 1;
      if (name === `${prefix}:del`) deletedDepth -= 1;
      if (name === `${prefix}:body`) bodyDepth -= 1;
    }
  }
  if (stack.length || !rootClosed || xml.slice(cursor).trim()) fail("malformed");
  flush();
  if (!segments.some((segment) => /\p{L}{2}/u.test(segment.text))) fail("scanned_or_empty");
  return { format, pageCount: null, segments, warnings: ["body_text_only"] };
}

export async function extractDocument(input: {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly signal?: AbortSignal;
}): Promise<DocumentExtraction> {
  if (typeof window !== "undefined") throw new Error("SW_SERVER_ONLY");
  if (input.signal?.aborted) throw new ExtractionError("cancelled");
  if (!input.bytes.length || input.bytes.length > EXTRACTION_LIMITS.fileBytes)
    throw new ExtractionError("too_large");
  const bytes = new Uint8Array(input.bytes);
  const pdf =
    input.mimeType === "application/pdf" &&
    Buffer.from(bytes.subarray(0, 8)).toString("ascii").startsWith("%PDF-");
  const docx =
    input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 3 &&
    bytes[3] === 4;
  if (!pdf && !docx) throw new ExtractionError("unsupported");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let pdfjsUrl = "";
  if (pdf) {
    try {
      pdfjsUrl = pathToFileURL(
        createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs"),
      ).href;
    } catch {
      throw new ExtractionError("engine_unavailable");
    }
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const {parentPort,workerData}=require('node:worker_threads'); (${extractInWorker.toString()})(workerData).then(value=>parentPort.postMessage({ok:true,value}),error=>parentPort.postMessage({ok:false,code:error.code||'malformed'}));`,
      {
        eval: true,
        workerData: { bytes, format: pdf ? "pdf" : "docx", pdfjsUrl, limits: EXTRACTION_LIMITS },
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
        stdout: true,
        stderr: true,
      },
    );
    // Drain without logging document/parser content into application logs.
    worker.stdout?.resume();
    worker.stderr?.resume();
    let settled = false;
    const finish = (error?: ExtractionError, value?: DocumentExtraction) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () => finish(new ExtractionError("cancelled"));
    const timer = setTimeout(
      () => finish(new ExtractionError("deadline")),
      EXTRACTION_LIMITS.timeoutMs,
    );
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
    worker.on("message", (result) => {
      if (!result.ok) finish(new ExtractionError(result.code as ExtractionFailureCode));
      else finish(undefined, { ...result.value, sha256, extractorVersion: SW_EXTRACTION_VERSION });
    });
    worker.on("error", () => finish(new ExtractionError("engine_unavailable")));
    worker.on("exit", () => {
      if (!settled) finish(new ExtractionError("engine_unavailable"));
    });
  });
}

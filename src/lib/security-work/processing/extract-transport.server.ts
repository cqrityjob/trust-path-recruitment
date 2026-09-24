import "@tanstack/react-start/server-only";
import { z } from "zod";
import {
  EXTRACTION_LIMITS,
  ExtractionError,
  SW_EXTRACTION_VERSION,
  type DocumentExtraction,
  type ExtractionFailureCode,
} from "./contracts";

type Env = Readonly<Record<string, string | undefined>>;
const mimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
const failureCodes: readonly ExtractionFailureCode[] = [
  "unsupported",
  "malformed",
  "encrypted",
  "too_large",
  "too_many_pages",
  "too_much_text",
  "scanned_or_empty",
  "deadline",
  "cancelled",
  "engine_unavailable",
  "processor_unavailable",
];

/** Only explicit server configuration can select this owner-operated processor. */
export function extractionProcessorConfiguration(env: Env = process.env): {
  url: string;
  token: string;
} {
  if (typeof window !== "undefined") throw new Error("SW_SERVER_ONLY");
  if (
    env.SW_PROCESSOR_ENABLED !== "true" ||
    !env.SW_PROCESSOR_DATA_PROCESSING_APPROVAL?.trim() ||
    !env.SW_PROCESSOR_AUTH_TOKEN ||
    new TextEncoder().encode(env.SW_PROCESSOR_AUTH_TOKEN).byteLength < 32
  )
    throw new ExtractionError("processor_not_configured");
  let url: URL;
  try {
    url = new URL(env.SW_PROCESSOR_URL ?? "");
  } catch {
    throw new ExtractionError("processor_not_configured");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== env.SW_PROCESSOR_EXPECTED_ORIGIN ||
    url.pathname !== "/v1/extract" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ExtractionError("processor_not_configured");
  return { url: url.href, token: env.SW_PROCESSOR_AUTH_TOKEN };
}
const hash = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
const extractionSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    extractorVersion: z.literal(SW_EXTRACTION_VERSION),
    format: z.enum(["pdf", "docx"]),
    pageCount: z.number().int().min(1).max(EXTRACTION_LIMITS.pages).nullable(),
    segments: z
      .array(
        z
          .object({
            ordinal: z.number().int().min(1).max(EXTRACTION_LIMITS.segments),
            locator: z
              .object({
                kind: z.enum(["page", "section"]),
                number: z.number().int().min(1).max(1_000_000),
              })
              .strict(),
            text: z.string().min(1).max(EXTRACTION_LIMITS.chunkCharacters),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1)
      .max(EXTRACTION_LIMITS.segments),
    warnings: z.array(z.enum(["pages_without_text", "body_text_only"])).max(2),
  })
  .strict();

/** Cloudflare-safe transport. The Node processor owns CPU-isolated parsing only. */
export async function extractDocument(
  input: { bytes: Uint8Array; mimeType: string; signal?: AbortSignal },
  options: { env?: Env; fetchImpl?: typeof fetch } = {},
): Promise<DocumentExtraction> {
  const configuration = extractionProcessorConfiguration(options.env ?? process.env);
  if (!mimeTypes.includes(input.mimeType as (typeof mimeTypes)[number]))
    throw new ExtractionError("unsupported");
  if (!input.bytes.length || input.bytes.length > EXTRACTION_LIMITS.fileBytes)
    throw new ExtractionError("too_large");
  const bytes = new Uint8Array(input.bytes);
  const expectedFormat = input.mimeType === mimeTypes[0] ? "pdf" : "docx";
  if (
    expectedFormat === "pdf"
      ? new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
      : bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4
  )
    throw new ExtractionError("unsupported");
  const controller = new AbortController();
  const abort = () => controller.abort(new ExtractionError("cancelled"));
  input.signal?.addEventListener("abort", abort, { once: true });
  if (input.signal?.aborted) abort();
  // The processor enforces the 10s parse deadline; this also bounds transfer.
  const timeout = setTimeout(() => controller.abort(new ExtractionError("deadline")), 15_000);
  const signal = controller.signal;
  let rejectOnAbort: (() => void) | undefined;
  const run = async (): Promise<DocumentExtraction> => {
    signal.throwIfAborted();
    const originalHash = await hash(bytes);
    signal.throwIfAborted();
    const response = await (options.fetchImpl ?? fetch)(configuration.url, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        authorization: `Bearer ${configuration.token}`,
        "content-type": input.mimeType,
        accept: "application/json",
      },
      body: bytes,
    });
    if (!response.body) throw new ExtractionError("processor_unavailable");
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new ExtractionError("processor_unavailable");
        }
        parts.push(part.value);
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
    signal.throwIfAborted();
    const merged = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged));
    } catch {
      throw new ExtractionError("processor_unavailable");
    }
    if (!response.ok) {
      const failure = z
        .object({ status: z.literal("failed"), errorCode: z.string() })
        .strict()
        .safeParse(raw);
      if (failure.success && failureCodes.includes(failure.data.errorCode as ExtractionFailureCode))
        throw new ExtractionError(failure.data.errorCode as ExtractionFailureCode);
      throw new ExtractionError("processor_unavailable");
    }
    const checked = extractionSchema.safeParse(raw);
    if (!checked.success) throw new ExtractionError("processor_unavailable");
    const value = checked.data;
    if (
      value.sha256 !== originalHash ||
      value.format !== expectedFormat ||
      (value.format === "pdf" ? value.pageCount === null : value.pageCount !== null) ||
      value.segments.reduce((sum, item) => sum + item.text.length, 0) >
        EXTRACTION_LIMITS.textCharacters
    )
      throw new ExtractionError("processor_unavailable");
    for (const [index, segment] of value.segments.entries()) {
      signal.throwIfAborted();
      if (
        !segment.text.trim() ||
        segment.ordinal !== index + 1 ||
        segment.sha256 !== (await hash(new TextEncoder().encode(segment.text))) ||
        segment.locator.kind !== (value.format === "pdf" ? "page" : "section") ||
        (value.format === "pdf" && segment.locator.number > value.pageCount!)
      )
        throw new ExtractionError("processor_unavailable");
    }
    return value;
  };
  try {
    const aborted = new Promise<never>((_, reject) => {
      rejectOnAbort = () => reject(signal.reason);
      signal.addEventListener("abort", rejectOnAbort, { once: true });
      if (signal.aborted) rejectOnAbort();
    });
    return await Promise.race([run(), aborted]);
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("processor_unavailable");
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abort);
    if (rejectOnAbort) signal.removeEventListener("abort", rejectOnAbort);
  }
}

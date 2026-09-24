/** Owner-operated Node processor. No database client, completion key or provider key. */
import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { extractDocument } from "../src/lib/security-work/processing/extract.server";
import {
  EXTRACTION_LIMITS,
  ExtractionError,
  SW_EXTRACTION_VERSION,
} from "../src/lib/security-work/processing/contracts";

/** A fixed synthetic startup probe also checks packaged PDF.js and native assets. */
export async function checkProcessorEngine(): Promise<void> {
  const stream = "BT /F1 12 Tf 72 720 Td (SW readiness) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.7\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const result = await extractDocument({
    bytes: new Uint8Array(Buffer.from(pdf)),
    mimeType: "application/pdf",
  });
  if (result.segments[0]?.text !== "SW readiness") throw new Error("SW_PROCESSOR_ENGINE_NOT_READY");
}

export function createSecurityWorkProcessor(token: string): Server {
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("SW_PROCESSOR_AUTH_REQUIRED");
  const expected = Buffer.from(`Bearer ${token}`, "utf8");
  let active = 0;
  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    const send = (status: number, value: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(JSON.stringify(value));
    };
    const deny = (status: number, errorCode: string) =>
      send(status, { status: "failed", errorCode });
    if (request.method === "GET" && request.url === "/healthz") {
      send(200, { status: "ok", parserVersion: SW_EXTRACTION_VERSION });
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/extract") {
      deny(404, "unsupported");
      return;
    }
    const actual = Buffer.from(request.headers.authorization ?? "", "utf8");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      deny(401, "processor_unavailable");
      return;
    }
    const mimeType = request.headers["content-type"];
    if (
      typeof mimeType !== "string" ||
      ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(mimeType)
    ) {
      deny(415, "unsupported");
      return;
    }
    const declared = request.headers["content-length"];
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > EXTRACTION_LIMITS.fileBytes)) {
      deny(413, "too_large");
      return;
    }
    if (active >= 2) {
      deny(503, "processor_unavailable");
      return;
    }
    active += 1;
    const controller = new AbortController();
    const cancel = () => {
      if (!response.writableEnded) controller.abort();
    };
    request.once("aborted", cancel);
    response.once("close", cancel);
    const timeout = setTimeout(() => {
      controller.abort();
      request.destroy();
    }, 15_000);
    try {
      const parts: Buffer[] = [];
      let length = 0;
      for await (const part of request) {
        length += part.length;
        if (length > EXTRACTION_LIMITS.fileBytes) {
          deny(413, "too_large");
          request.destroy();
          return;
        }
        parts.push(Buffer.from(part));
      }
      if (!length) {
        deny(400, "malformed");
        return;
      }
      const result = await extractDocument({
        bytes: new Uint8Array(Buffer.concat(parts)),
        mimeType,
        signal: controller.signal,
      });
      send(200, result);
    } catch (error) {
      deny(
        error instanceof ExtractionError && error.code === "too_large" ? 413 : 422,
        error instanceof ExtractionError ? error.code : "malformed",
      );
    } finally {
      clearTimeout(timeout);
      active -= 1;
      request.removeListener("aborted", cancel);
      response.removeListener("close", cancel);
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 10;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const token = process.env.SW_PROCESSOR_AUTH_TOKEN ?? "";
  const port = Number(process.env.SW_PROCESSOR_PORT ?? "8789");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SW_PROCESSOR_PORT_INVALID");
  const host = process.env.SW_PROCESSOR_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0"].includes(host)) throw new Error("SW_PROCESSOR_HOST_INVALID");
  const server = createSecurityWorkProcessor(token);
  await checkProcessorEngine();
  // 0.0.0.0 is an explicit container setting; the managed proxy owns public TLS.
  server.listen(port, host, () => {
    console.log("Security Work document processor ready.");
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 16_000).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

// Thirteen real Node HTTP/TLS checks. Endpoints must belong to the synthetic loopback bootstrap.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { deflateRawSync } from "node:zlib";
import { extractDocument } from "../src/lib/security-work/processing/extract-transport.server";

const httpOrigin = new URL(process.env.SW_PROCESSOR_TEST_HTTP_ORIGIN ?? "");
const httpsOrigin = new URL(process.env.SW_PROCESSOR_EXPECTED_ORIGIN ?? "");
assert.equal(httpOrigin.protocol, "http:");
assert.equal(httpsOrigin.protocol, "https:");
for (const origin of [httpOrigin, httpsOrigin]) {
  assert.equal(origin.hostname, "127.0.0.1");
  assert.equal(origin.pathname, "/");
  assert(!origin.username && !origin.password && !origin.search && !origin.hash);
}
assert.equal(process.env.SW_PROCESSOR_DATA_PROCESSING_APPROVAL, "synthetic-local-only");
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
assert(process.env.NODE_EXTRA_CA_CERTS);
assert(process.env.SW_PROCESSOR_AUTH_TOKEN && process.env.SW_PROCESSOR_AUTH_TOKEN.length >= 32);
const env = {
  SW_PROCESSOR_ENABLED: "true",
  SW_PROCESSOR_URL: `${httpsOrigin.origin}/v1/extract`,
  SW_PROCESSOR_EXPECTED_ORIGIN: httpsOrigin.origin,
  SW_PROCESSOR_AUTH_TOKEN: process.env.SW_PROCESSOR_AUTH_TOKEN,
  SW_PROCESSOR_DATA_PROCESSING_APPROVAL: "synthetic-local-only",
};
const authorization = `Bearer ${env.SW_PROCESSOR_AUTH_TOKEN}`;
const mime = "application/pdf";
const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const syntheticText = "Synthetic processor integration evidence.";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function pdf(value: string) {
  const stream = value ? `BT /F1 12 Tf 72 720 Td (${value}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let valueOut = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(valueOut));
    valueOut += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const position = Buffer.byteLength(valueOut);
  valueOut += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(valueOut));
}
function crc32(value: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function docx(text: string) {
  const entries = [
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ],
  ];
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(content);
    const bytes = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const part = Buffer.concat([local, filename, bytes]);
    locals.push(part);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(Buffer.concat([central, filename]));
    offset += part.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directoryBytes, end]));
}
const bytes = pdf(syntheticText);
let checks = 0;
async function check(label: string, run: () => Promise<void>) {
  try {
    await run();
    checks += 1;
    console.log(`ok ${checks} - ${label}`);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "failed"}`, {
      cause: error,
    });
  }
}
async function post(origin: URL, body: Uint8Array, type = mime, bearer = authorization) {
  return fetch(`${origin.origin}/v1/extract`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { authorization: bearer, "content-type": type },
    body: new Uint8Array(body),
  });
}
async function failure(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { status: "failed", errorCode: code });
}
await check("HTTP rejects unknown route", async () => {
  const response = await fetch(`${httpOrigin.origin}/not-an-endpoint`);
  await failure(response, 404, "unsupported");
});
await check("HTTP rejects missing authorization", async () => {
  await failure(await post(httpOrigin, bytes, mime, ""), 401, "processor_unavailable");
});
await check("TLS rejects a wrong bearer token", async () => {
  await failure(
    await post(httpsOrigin, bytes, mime, "Bearer synthetic-wrong-token"),
    401,
    "processor_unavailable",
  );
});
await check("TLS rejects unsupported MIME", async () => {
  await failure(await post(httpsOrigin, bytes, "text/plain"), 415, "unsupported");
});
await check("TLS rejects an empty body", async () => {
  await failure(await post(httpsOrigin, new Uint8Array()), 400, "malformed");
});
await check("TLS rejects mismatched PDF signature", async () => {
  await failure(await post(httpsOrigin, new Uint8Array([0x50, 0x4b, 3, 4])), 422, "unsupported");
});
await check("TLS rejects a malformed actual PDF", async () => {
  await failure(
    await post(httpsOrigin, new Uint8Array(Buffer.from("%PDF-1.7\ninvalid"))),
    422,
    "malformed",
  );
});
await check("TLS identifies scanned or empty actual PDF", async () => {
  await failure(await post(httpsOrigin, pdf("")), 422, "scanned_or_empty");
});
await check("packaged Node worker extracts PDF via HTTP with exact hashes", async () => {
  const response = await post(httpOrigin, bytes);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.sha256, hash(bytes));
  assert.equal(result.pageCount, 1);
  assert.equal(result.segments[0].text, syntheticText);
  assert.equal(result.segments[0].sha256, hash(syntheticText));
});
await check("Cloudflare-safe transport verifies real TLS processor response", async () => {
  const result = await extractDocument({ bytes, mimeType: mime }, { env });
  assert.equal(result.sha256, hash(bytes));
  assert.equal(result.segments[0].text, syntheticText);
});
await check("packaged Node worker extracts a compressed DOCX via TLS", async () => {
  const data = docx(syntheticText);
  const response = await post(httpsOrigin, data, docxMime);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.sha256, hash(data));
  assert.equal(result.format, "docx");
  assert.equal(result.segments[0].text, syntheticText);
});
await check("HTTP rejects oversized Content-Length before receiving a body", async () => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      `${httpOrigin.origin}/v1/extract`,
      {
        method: "POST",
        headers: { authorization, "content-type": mime, "content-length": 10 * 1024 * 1024 + 1 },
        timeout: 5000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("HTTP cap check timed out")));
    request.end();
  });
  assert.equal(status, 413);
});
await check("TLS rejects compressed DOCX amplification", async () => {
  await failure(await post(httpsOrigin, docx("X".repeat(500_000)), docxMime), 413, "too_large");
});
assert.equal(checks, 13);
console.log(
  "Security Work packaged processor: 13 actual Node/HTTP/TLS checks passed; synthetic loopback data only.",
);

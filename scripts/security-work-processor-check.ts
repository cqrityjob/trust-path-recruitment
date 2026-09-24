// Synthetic fixed content and mock transport; --local-node opts into loopback fixtures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import {
  extractDocument,
  extractionProcessorConfiguration,
} from "../src/lib/security-work/processing/extract-transport.server";
import {
  EXTRACTION_LIMITS,
  SW_EXTRACTION_VERSION,
} from "../src/lib/security-work/processing/contracts";

const env = {
  SW_PROCESSOR_ENABLED: "true",
  SW_PROCESSOR_URL: "https://processor.example.invalid/v1/extract",
  SW_PROCESSOR_EXPECTED_ORIGIN: "https://processor.example.invalid",
  SW_PROCESSOR_AUTH_TOKEN: "synthetic-local-processor-auth-000000000000",
  SW_PROCESSOR_DATA_PROCESSING_APPROVAL: "synthetic-local-only",
};
const text = "Synthetic processor roundtrip evidence.";
function pdf(value: string): Uint8Array {
  const stream = value ? `BT /F1 12 Tf 72 720 Td (${value}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const offset = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((value) => `${String(value).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(result));
}
const bytes = pdf(text);
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const result = () => ({
  sha256: hash(bytes),
  extractorVersion: SW_EXTRACTION_VERSION,
  format: "pdf",
  pageCount: 1,
  segments: [{ ordinal: 1, locator: { kind: "page", number: 1 }, text, sha256: hash(text) }],
  warnings: [],
});
const input = { bytes, mimeType: "application/pdf" };
const noFetch = async () => {
  throw new Error("No request expected");
};
let checks = 0;
async function test(label: string, run: () => void | Promise<void>) {
  try {
    await run();
    checks += 1;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : "failed"}`, {
      cause: error,
    });
  }
}
await test("processor requires explicit activation, origin, approval, secure fixed endpoint and long token", () => {
  for (const invalid of [
    {},
    { ...env, SW_PROCESSOR_ENABLED: "false" },
    { ...env, SW_PROCESSOR_AUTH_TOKEN: "short" },
    { ...env, SW_PROCESSOR_DATA_PROCESSING_APPROVAL: "" },
    { ...env, SW_PROCESSOR_EXPECTED_ORIGIN: "https://other.invalid" },
    { ...env, SW_PROCESSOR_URL: "http://processor.example.invalid/v1/extract" },
    { ...env, SW_PROCESSOR_URL: `${env.SW_PROCESSOR_URL}?target=elsewhere` },
    { ...env, SW_PROCESSOR_URL: "https://processor.example.invalid/arbitrary" },
  ])
    assert.throws(() => extractionProcessorConfiguration(invalid), /PROCESSOR_NOT_CONFIGURED/);
});
await test("fixed HTTPS request has no redirect, URL input or inherited credentials", async () => {
  let calls = 0;
  const received = await extractDocument(input, {
    env,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, env.SW_PROCESSOR_URL);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${env.SW_PROCESSOR_AUTH_TOKEN}`,
      );
      assert.deepEqual(init?.body, bytes);
      return Response.json(result());
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(received, result());
});
await test("MIME, signature and byte cap checked before transmission", async () => {
  await assert.rejects(
    extractDocument({ ...input, mimeType: "text/plain" }, { env, fetchImpl: noFetch }),
    /UNSUPPORTED/,
  );
  await assert.rejects(
    extractDocument({ ...input, bytes: new Uint8Array(20) }, { env, fetchImpl: noFetch }),
    /UNSUPPORTED/,
  );
  await assert.rejects(
    extractDocument(
      { ...input, bytes: new Uint8Array(EXTRACTION_LIMITS.fileBytes + 1) },
      { env, fetchImpl: noFetch },
    ),
    /TOO_LARGE/,
  );
});
await test("wrong original or extracted hash and impossible locators rejected", async () => {
  for (const value of [
    { ...result(), sha256: hash("other") },
    { ...result(), segments: [{ ...result().segments[0], text: "Changed" }] },
    { ...result(), segments: [{ ...result().segments[0], locator: { kind: "page", number: 2 } }] },
    { ...result(), privateMetadata: "must reject" },
  ]) {
    await assert.rejects(
      extractDocument(input, { env, fetchImpl: async () => Response.json(value) }),
      /PROCESSOR_UNAVAILABLE/,
    );
  }
});
await test("scanned or empty response remains a clear failure", async () => {
  await assert.rejects(
    extractDocument(input, {
      env,
      fetchImpl: async () =>
        Response.json({ status: "failed", errorCode: "scanned_or_empty" }, { status: 422 }),
    }),
    /SCANNED_OR_EMPTY/,
  );
});
await test("unbounded or invalid processor responses rejected", async () => {
  await assert.rejects(
    extractDocument(input, {
      env,
      fetchImpl: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    }),
    /PROCESSOR_UNAVAILABLE/,
  );
  await assert.rejects(
    extractDocument(input, { env, fetchImpl: async () => new Response("not JSON") }),
    /PROCESSOR_UNAVAILABLE/,
  );
});
await test("cancelled processor operation sends no data", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    extractDocument({ ...input, signal: controller.signal }, { env, fetchImpl: noFetch }),
    /CANCELLED/,
  );
});
await test("transport loss does not automatically retry", async () => {
  let calls = 0;
  await assert.rejects(
    extractDocument(input, {
      env,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("Synthetic lost connection");
      },
    }),
    /PROCESSOR_UNAVAILABLE/,
  );
  assert.equal(calls, 1);
});
if (process.argv.includes("--local-node")) {
  const port = Number(
    process.argv.find((arg) => arg.startsWith("--processor-port="))?.split("=")[1] ?? "3150",
  );
  assert(Number.isInteger(port) && port > 0 && port < 65536);
  const url = `http://127.0.0.1:${port}/v1/extract`;
  await test("actual isolated Node bundle parses PDF bytes via authenticated HTTP", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.SW_PROCESSOR_AUTH_TOKEN}`,
        "content-type": "application/pdf",
      },
      body: new Uint8Array(bytes),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.sha256, hash(bytes));
    assert.equal(body.segments[0].text, text);
    assert.equal(body.pageCount, 1);
  });
  await test("actual Node processor rejects missing authorization", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(bytes),
    });
    assert.equal(response.status, 401);
  });
  await test("actual Node processor rejects oversized declared body before reading", async () => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        url,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.SW_PROCESSOR_AUTH_TOKEN}`,
            "content-type": "application/pdf",
            "content-length": EXTRACTION_LIMITS.fileBytes + 1,
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on("error", reject);
      request.end();
    });
    assert.equal(status, 413);
  });
  await test("actual HTTPS app transport verifies local processor output", async () => {
    const localEnv = {
      ...env,
      SW_PROCESSOR_URL: "https://127.0.0.1:3151/v1/extract",
      SW_PROCESSOR_EXPECTED_ORIGIN: "https://127.0.0.1:3151",
    };
    const extracted = await extractDocument(input, { env: localEnv });
    assert.equal(extracted.segments[0].text, text);
    assert.equal(extracted.sha256, hash(bytes));
  });
  await test("actual Node empty PDF keeps explicit scanned/empty error", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.SW_PROCESSOR_AUTH_TOKEN}`,
        "content-type": "application/pdf",
      },
      body: new Uint8Array(pdf("")),
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).errorCode, "scanned_or_empty");
  });
}
console.log(`Security Work processor: ${checks} synthetic checks passed.`);

/** Prints only pass/fail. --probe is explicit, sends no document and creates no job. */
import { extractionProcessorConfiguration } from "../src/lib/security-work/processing/extract-transport.server";
import { assertWorkerSigningConfigured } from "../src/lib/security-work/processing/attestation.server";
import { SW_EXTRACTION_VERSION } from "../src/lib/security-work/processing/contracts";

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("EMPTY_RESPONSE");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new Error("RESPONSE_TOO_LARGE");
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}

try {
  const configuration = extractionProcessorConfiguration(process.env);
  assertWorkerSigningConfigured(process.env);
  console.log(
    "Application processor configuration: valid; secret values omitted. Database key match not checked.",
  );
  if (process.argv.includes("--probe")) {
    const signal = AbortSignal.timeout(5000);
    const health = await fetch(new URL("/healthz", configuration.url), {
      signal,
      redirect: "error",
    });
    const data = await boundedJson(health);
    if (!health.ok) throw new Error("HEALTH_FAILED");
    if (data.status !== "ok" || data.parserVersion !== SW_EXTRACTION_VERSION)
      throw new Error("HEALTH_FAILED");
    const auth = await fetch(configuration.url, {
      method: "POST",
      signal,
      redirect: "error",
      headers: {
        authorization: `Bearer ${configuration.token}`,
        "content-type": "application/pdf",
      },
      body: new Uint8Array(),
    });
    const authData = await boundedJson(auth);
    if (auth.status !== 400 || authData.errorCode !== "malformed") throw new Error("AUTH_FAILED");
    console.log(
      "Processor TLS, readiness and bearer match: verified with an empty body; no document or database request.",
    );
  }
} catch {
  console.error(
    "Processor configuration/probe failed. No configuration values or remote response bodies are printed.",
  );
  process.exitCode = 1;
}

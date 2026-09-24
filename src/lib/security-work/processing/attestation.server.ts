import "@tanstack/react-start/server-only";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";

const id = z.string().uuid();
const keyId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);

export function assertWorkerSigningConfigured(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (typeof window !== "undefined") throw new Error("SW_SERVER_ONLY");
  if (
    !keyId.safeParse(env.SW_WORKER_KEY_ID).success ||
    !env.SW_WORKER_SECRET ||
    Buffer.byteLength(env.SW_WORKER_SECRET, "utf8") < 32
  )
    throw new Error("SW_WORKER_NOT_CONFIGURED");
}

/** Keys are provisioned out of band in private DB storage and server environment. */
export function signProcessingReceipt(
  kind: "extraction" | "ai",
  jobId: string,
  fence: string,
  payload: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): { keyId: string; signature: string } {
  if (typeof window !== "undefined") throw new Error("SW_SERVER_ONLY");
  assertWorkerSigningConfigured(env);
  if (kind !== "extraction" && kind !== "ai") throw new Error("SW_INVALID_RECEIPT_KIND");
  id.parse(jobId);
  id.parse(fence);
  const selectedKeyId = keyId.parse(env.SW_WORKER_KEY_ID);
  const secret = env.SW_WORKER_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32)
    throw new Error("SW_WORKER_NOT_CONFIGURED");
  if (Buffer.byteLength(payload, "utf8") > 2 * 1024 * 1024) throw new Error("SW_RECEIPT_TOO_LARGE");
  const digest = createHash("sha256").update(payload, "utf8").digest("hex");
  // Never parse/re-serialize the payload after signing: the receipt binds exact bytes.
  const message = `${kind}\n${jobId.toLowerCase()}\n${fence.toLowerCase()}\n${digest}`;
  return {
    keyId: selectedKeyId,
    signature: createHmac("sha256", secret).update(message, "utf8").digest("hex"),
  };
}

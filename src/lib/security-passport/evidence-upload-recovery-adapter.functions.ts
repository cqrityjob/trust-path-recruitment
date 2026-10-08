import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/database";
import { orNull } from "./rpc";
import type { EvidenceRecord } from "./evidence.functions";
import type { EvidenceUploadAttempt, EvidenceRecoveryResult } from "./evidence-upload-recovery";
import { isDefiniteAttachmentRejection, type EvidenceUploadOutcome } from "./evidence-upload";

const evidenceSchema = z.object({
  id: z.string().uuid(),
  claimId: z.string().uuid().nullable(),
  periodId: z.string().uuid().nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  uploadedAt: z.string(),
  lifecycleState: z.string(),
});
const attemptSchema = z
  .object({
    id: z.string().uuid(),
    claimId: z.string().uuid().nullable(),
    periodId: z.string().uuid().nullable(),
    storagePath: z.string(),
    fileName: z.string().min(1).max(300),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/heic"]),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(8 * 1024 * 1024),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(["prepared", "registered", "cleanup_pending", "cleaned"]),
    revision: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    evidence: evidenceSchema.nullable(),
  })
  .refine((a) => (a.claimId === null) !== (a.periodId === null));
type Attempt = z.infer<typeof attemptSchema>;
type Caller = { readonly supabase: SupabaseClient<Database>; readonly userId: string };
const BUCKET = "passport-evidence";
const ext = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
} as const;

function parseOwn(data: unknown, userId: string): Attempt {
  const a = attemptSchema.parse(data);
  if (a.storagePath !== `${userId}/${a.id}.${ext[a.mimeType]}`)
    throw new Error("SP_EVIDENCE_UPLOAD_INVALID_JOURNAL");
  if (
    a.evidence &&
    (a.evidence.claimId !== a.claimId ||
      a.evidence.periodId !== a.periodId ||
      a.evidence.fileName !== a.fileName ||
      a.evidence.mimeType !== a.mimeType ||
      a.evidence.sizeBytes !== a.sizeBytes)
  )
    throw new Error("SP_EVIDENCE_UPLOAD_INVALID_JOURNAL");
  return a;
}
function summary(a: Attempt): EvidenceUploadAttempt {
  return {
    id: a.id,
    claimId: a.claimId,
    periodId: a.periodId,
    fileName: a.fileName,
    status: a.status,
    updatedAt: a.updatedAt,
  };
}
function result(a: Attempt): EvidenceRecoveryResult | null {
  if (a.status === "registered")
    return a.evidence
      ? { status: "registered", evidence: a.evidence }
      : { status: "unknown", attemptId: a.id };
  if (a.status === "cleaned" || a.status === "cleanup_pending")
    return { status: a.status, attemptId: a.id };
  return null;
}
async function read(caller: Caller, id: string): Promise<Attempt> {
  const r = await caller.supabase.rpc("sp_reconcile_evidence_upload", { _attempt_id: id });
  if (r.error) throw new Error("SP_EVIDENCE_UPLOAD_RECONCILE_FAILED");
  const a = parseOwn(r.data, caller.userId);
  if (a.id !== id) throw new Error("SP_EVIDENCE_UPLOAD_INVALID_JOURNAL");
  return a;
}
async function sessionActive(caller: Caller): Promise<boolean> {
  const r = await caller.supabase.rpc("sp_passport_session_active");
  return r.error === null && r.data === true;
}
async function missing(caller: Caller, a: Attempt): Promise<boolean> {
  if (!(await sessionActive(caller))) return false;
  const name = a.storagePath.slice(a.storagePath.indexOf("/") + 1);
  const r = await caller.supabase.storage
    .from(BUCKET)
    .list(caller.userId, { search: name, limit: 100 });
  return (
    r.error === null &&
    r.data !== null &&
    !r.data.some((o) => o.name === name) &&
    (await sessionActive(caller))
  );
}
async function attach(caller: Caller, a: Attempt): Promise<"accepted" | "rejected" | "unknown"> {
  const r = await caller.supabase.rpc("sp_attach_evidence", {
    _claim_id: orNull(a.claimId),
    _period_id: orNull(a.periodId),
    _storage_path: a.storagePath,
    _file_name: a.fileName,
    _mime_type: a.mimeType,
    _size_bytes: a.sizeBytes,
    _sha256: a.sha256,
  });
  return r.error ? (isDefiniteAttachmentRejection(r.error) ? "rejected" : "unknown") : "accepted";
}

/** Only the authenticated owner's journal is read. Technical paths/hash never
 * enter the browser response. Reading this list performs no reconciliation or
 * Storage mutation; the holder must choose an action. */
export async function listOwnedUploadAttempts(
  caller: Caller,
  target: { claimId: string | null; periodId: string | null },
): Promise<readonly EvidenceUploadAttempt[]> {
  const r = await caller.supabase.rpc("sp_list_my_evidence_upload_attempts", {
    _claim_id: target.claimId,
    _period_id: target.periodId,
  });
  if (r.error) throw new Error("SP_EVIDENCE_UPLOAD_LIST_FAILED");
  return z
    .array(z.unknown())
    .parse(r.data)
    .map((data) => summary(parseOwn(data, caller.userId)));
}

/** Explicit cleanup first takes a database fence, then uses the same caller's
 * Storage permission. No missing response or empty RLS read authorizes delete. */
export async function cleanupOwnedUpload(
  caller: Caller,
  attemptId: string,
): Promise<EvidenceRecoveryResult> {
  try {
    const r = await caller.supabase.rpc("sp_authorize_evidence_upload_cleanup", {
      _attempt_id: attemptId,
    });
    if (r.error) return { status: "unknown", attemptId };
    const a = parseOwn(r.data, caller.userId);
    if (a.id !== attemptId) return { status: "unknown", attemptId };
    const existing = result(a);
    if (
      existing?.status === "registered" ||
      existing?.status === "unknown" ||
      existing?.status === "cleaned"
    )
      return existing;
    if (a.status !== "cleanup_pending") return { status: "unknown", attemptId };
    const deleted = await caller.supabase.storage.from(BUCKET).remove([a.storagePath]);
    if (deleted.error || !(await missing(caller, a)))
      return { status: "cleanup_pending", attemptId };
    const confirmed = await caller.supabase.rpc("sp_confirm_evidence_upload_cleanup", {
      _attempt_id: attemptId,
    });
    if (confirmed.error) return { status: "cleanup_pending", attemptId };
    const final = parseOwn(confirmed.data, caller.userId);
    return final.id === attemptId && final.status === "cleaned"
      ? { status: "cleaned", attemptId }
      : { status: "cleanup_pending", attemptId };
  } catch {
    // No raw transport error/Storage path is propagated to the client.
    return { status: "unknown", attemptId };
  }
}

/** A reload has lost the browser File, not the persistent intention. Download
 * exactly its own object and verify the original bytes before any attachment. */
export async function resumeOwnedUpload(
  caller: Caller,
  attemptId: string,
): Promise<EvidenceRecoveryResult> {
  try {
    const a = await read(caller, attemptId);
    const existing = result(a);
    if (existing) return existing;
    if (!(await sessionActive(caller))) return { status: "unknown", attemptId };
    const download = await caller.supabase.storage.from(BUCKET).download(a.storagePath);
    if (download.error || !download.data) {
      return { status: (await missing(caller, a)) ? "file_missing" : "unknown", attemptId };
    }
    if (!(await sessionActive(caller))) return { status: "unknown", attemptId };
    // Refuse before reading a potentially oversized or altered object body.
    if (download.data.size !== a.sizeBytes || download.data.type !== a.mimeType)
      return { status: "integrity_mismatch", attemptId };
    const bytes = Buffer.from(await download.data.arrayBuffer());
    const { createHash } = await import("node:crypto");
    if (
      bytes.byteLength !== a.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== a.sha256
    )
      return { status: "integrity_mismatch", attemptId };
    let outcome: "accepted" | "rejected" | "unknown" = "unknown";
    try {
      outcome = await attach(caller, a);
    } catch {
      /* Resolve any lost RPC reply by journal readback. */
    }
    const final = result(await read(caller, attemptId));
    if (final) return final;
    return { status: outcome === "rejected" ? "attachment_rejected" : "unknown", attemptId };
  } catch {
    return { status: "unknown", attemptId };
  }
}

/** Persist the intention first; the old EvidenceRecord success response and
 * document-provided ceiling stay unchanged. No service-role client exists. */
export async function uploadRecoverableEvidence(
  input: Caller & {
    readonly claimId: string | null;
    readonly periodId: string | null;
    readonly attemptId: string;
    readonly bytes: Buffer;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sha256: string;
  },
): Promise<EvidenceUploadOutcome<EvidenceRecord>> {
  const unknown = { status: "outcome_unknown", attemptId: input.attemptId } as const;
  let a: Attempt;
  try {
    const prepared = await input.supabase.rpc("sp_begin_evidence_upload", {
      _attempt_id: input.attemptId,
      _claim_id: input.claimId,
      _period_id: input.periodId,
      _file_name: input.fileName,
      _mime_type: input.mimeType,
      _size_bytes: input.bytes.byteLength,
      _sha256: input.sha256,
    });
    if (prepared.error) {
      if (
        [
          "SP_TARGET_NOT_FOUND",
          "SP_NOT_HOLDER",
          "SP_TARGET_AMBIGUOUS",
          "SP_UPLOAD_INVALID_INPUT",
        ].includes(prepared.error.message)
      )
        throw new Error(prepared.error.message);
      return unknown;
    }
    a = parseOwn(prepared.data, input.userId);
  } catch (cause) {
    if (
      cause instanceof Error &&
      [
        "SP_TARGET_NOT_FOUND",
        "SP_NOT_HOLDER",
        "SP_TARGET_AMBIGUOUS",
        "SP_UPLOAD_INVALID_INPUT",
      ].includes(cause.message)
    )
      throw cause;
    return unknown;
  }
  if (
    a.id !== input.attemptId ||
    a.claimId !== input.claimId ||
    a.periodId !== input.periodId ||
    a.fileName !== input.fileName ||
    a.mimeType !== input.mimeType ||
    a.sizeBytes !== input.bytes.byteLength ||
    a.sha256 !== input.sha256 ||
    a.status !== "prepared"
  )
    return unknown;
  try {
    const uploaded = await input.supabase.storage
      .from(BUCKET)
      .upload(a.storagePath, input.bytes, { contentType: a.mimeType, upsert: false });
    if (uploaded.error) return unknown;
  } catch {
    return unknown;
  }
  let outcome: "accepted" | "rejected" | "unknown" = "unknown";
  try {
    outcome = await attach(input, a);
  } catch {
    /* Do not delete on unknown commit. */
  }
  try {
    const resolved = result(await read(input, a.id));
    if (resolved?.status === "registered" && resolved.evidence.lifecycleState === "active")
      return { status: "saved", evidence: resolved.evidence };
    if (resolved || outcome !== "rejected") return unknown;
  } catch {
    return unknown;
  }
  const cleanup = await cleanupOwnedUpload(input, a.id);
  if (cleanup.status === "registered" && cleanup.evidence.lifecycleState === "active")
    return { status: "saved", evidence: cleanup.evidence };
  return {
    status: "not_attached",
    attemptId: a.id,
    fileCleanup: cleanup.status === "cleaned" ? "confirmed" : "pending",
  };
}

// Security Passport — evidence server functions.
//
// ── WHY THE BYTES TRAVEL THROUGH THE SERVER ────────────────────────────
//
// The obvious alternative is a browser-side upload straight into Storage.
// It works, and the Storage policies would still hold. It was not chosen
// because it puts a storage credential and a bucket name in the browser for
// a product whose entire promise is that the holder's documents are private.
// Sending the bytes through the server keeps every storage call on the
// server, using the CALLER'S OWN authenticated client — so RLS and the
// Storage policies still decide, and nothing here succeeds because the
// server held a master key.
//
// The cost is honest and bounded: the file is base64-encoded in the request
// body, so the practical ceiling is lower than the database's 10 MB CHECK.
// EVIDENCE_MAX_BYTES below is the stricter number the product enforces.
//
// ── WHAT AN UPLOAD CAN PRODUCE ─────────────────────────────────────────
//
// DOCUMENT_PROVIDED. Nothing else, ever. That is not enforced here — it is
// enforced by `sp_attach_evidence`, which is the only writer, and by the
// trigger behind it. This file cannot express a higher level: it has no
// parameter for one and never names one.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orNull } from "./rpc";

export const EVIDENCE_BUCKET = "passport-evidence";

/** Stricter than the database CHECK (10 MB) because the transport is
 *  base64. A holder is told this number, not the database's. */
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

export const EVIDENCE_ALLOWED_MIME: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
];

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};

export interface EvidenceRecord {
  readonly id: string;
  readonly claimId: string | null;
  readonly periodId: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly lifecycleState: string;
}

type EvidenceRow = {
  id: string;
  claim_id: string | null;
  period_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  lifecycle_state: string;
};

function toEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    claimId: row.claim_id,
    periodId: row.period_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    lifecycleState: row.lifecycle_state,
  };
}

/** Strips directory components and anything that is not plainly a filename.
 *  The stored object name never uses this — the object is named by a UUID —
 *  but the display name is shown to a reviewer, so it must not be able to
 *  carry a path, a control character or markup. */
function safeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    // eslint-disable-next-line no-control-regex -- control characters are exactly what must go
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>"'`]/g, "")
    .trim();
  return (cleaned.length > 0 ? cleaned : "file").slice(0, 120);
}

const uploadInput = z.object({
  claimId: z.string().uuid().nullable(),
  periodId: z.string().uuid().nullable(),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().refine((m) => EVIDENCE_ALLOWED_MIME.includes(m), "unsupported file type"),
  /** base64, without a data: prefix. */
  contentBase64: z.string().min(1),
});

export const uploadEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => uploadInput.parse(data))
  .handler(async ({ context, data }): Promise<EvidenceRecord> => {
    const { supabase, userId } = context;
    const db = supabase;

    if (!data.claimId && !data.periodId) {
      throw new Error("SP_EVIDENCE_NO_TARGET");
    }

    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.byteLength === 0) throw new Error("SP_EVIDENCE_EMPTY");
    if (bytes.byteLength > EVIDENCE_MAX_BYTES) throw new Error("SP_EVIDENCE_TOO_LARGE");

    const { createHash, randomUUID } = await import("node:crypto");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // The object name is a UUID under the holder's own folder. The holder's
    // filename is metadata, never part of the path — so a filename can never
    // traverse out of the folder the Storage policy pins.
    const ext = EXT_BY_MIME[data.mimeType] ?? "bin";
    const storagePath = `${userId}/${randomUUID()}.${ext}`;

    const uploaded = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(storagePath, bytes, { contentType: data.mimeType, upsert: false });
    if (uploaded.error) throw new Error(uploaded.error.message);

    // sp_attach_evidence re-checks that the path's first segment is the
    // caller, so a row can never point at another holder's object even if
    // this function were called with a crafted path.
    const { data: evidenceId, error } = await db.rpc("sp_attach_evidence", {
      _claim_id: orNull(data.claimId),
      _period_id: orNull(data.periodId),
      _storage_path: storagePath,
      _file_name: safeDisplayName(data.fileName),
      _mime_type: data.mimeType,
      _size_bytes: bytes.byteLength,
      _sha256: sha256,
    });

    if (error) {
      // The metadata row is what makes an object reachable. If it failed, the
      // object is unreferenced — remove it rather than leave an orphan in a
      // bucket the holder cannot see or clean up.
      await supabase.storage.from(EVIDENCE_BUCKET).remove([storagePath]);
      throw new Error(error.message);
    }

    const { data: row } = await db
      .from("sp_evidence")
      .select(
        "id, claim_id, period_id, file_name, mime_type, size_bytes, uploaded_at, lifecycle_state",
      )
      .eq("id", evidenceId as unknown as string)
      .single();

    return toEvidence(row as EvidenceRow);
  });

export const listMyEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly EvidenceRecord[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sp_evidence")
      .select(
        "id, claim_id, period_id, file_name, mime_type, size_bytes, uploaded_at, lifecycle_state",
      )
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "active")
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as EvidenceRow[]).map(toEvidence);
  });

/** Short-lived signed URL. Five minutes, matching the existing CV download
 *  in job-intelligence — long enough to open, short enough that a copied
 *  link is not a durable grant.
 *
 *  Deliberately no ownership check in TypeScript: the signed URL is created
 *  with the caller's own client, so the Storage policies decide. A holder
 *  reaches their own folder; a verifier reaches an object only while a
 *  CQrityjob review is open on it; everybody else gets an error. */
export const getEvidenceViewUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ evidenceId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ url: string; expiresInSeconds: number }> => {
    const { supabase } = context;
    const db = supabase;

    const { data: row, error } = await db
      .from("sp_evidence")
      .select("storage_path")
      .eq("id", data.evidenceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("SP_EVIDENCE_NOT_FOUND");

    const path = (row as { storage_path: string }).storage_path;
    const signed = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 300);
    if (signed.error || !signed.data) throw new Error(signed.error?.message ?? "SP_SIGN_FAILED");

    return { url: signed.data.signedUrl, expiresInSeconds: 300 };
  });

/** Withdrawal removes the bytes and keeps the record. The record is what a
 *  later reviewer needs to understand why a claim stopped being backed; the
 *  bytes are the holder's private document and there is no reason to keep
 *  them once they have taken them back. */
export const withdrawEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ evidenceId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const db = supabase;

    const { data: row } = await db
      .from("sp_evidence")
      .select("storage_path")
      .eq("id", data.evidenceId)
      .maybeSingle();

    const { error } = await db.rpc("sp_withdraw_evidence", { _evidence_id: data.evidenceId });
    if (error) throw new Error(error.message);

    if (row) {
      await supabase.storage
        .from(EVIDENCE_BUCKET)
        .remove([(row as { storage_path: string }).storage_path]);
    }
    return { ok: true };
  });

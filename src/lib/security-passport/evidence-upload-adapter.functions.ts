import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/database";
import type { EvidenceRecord } from "./evidence.functions";
import { orNull } from "./rpc";
import {
  isDefiniteAttachmentRejection,
  uploadAndAttachEvidence,
  type EvidenceUploadOutcome,
} from "./evidence-upload";

/** All operations use the authenticated caller's client. This adapter is also
 * exercised against real isolated Auth/Storage; it has no privileged fallback. */
export function uploadOwnedEvidence(input: {
  readonly supabase: SupabaseClient<Database>;
  readonly userId: string;
  readonly claimId: string | null;
  readonly periodId: string | null;
  readonly bucket: string;
  readonly attemptId: string;
  readonly storagePath: string;
  readonly bytes: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sha256: string;
}): Promise<EvidenceUploadOutcome<EvidenceRecord>> {
  const { supabase, userId, claimId, periodId, storagePath } = input;
  const bucket = supabase.storage.from(input.bucket);
  const sessionActive = async () => {
    const result = await supabase.rpc("sp_passport_session_active");
    return result.error === null && result.data === true;
  };
  return uploadAndAttachEvidence<EvidenceRecord>({
    attemptId: input.attemptId,
    preflight: async () => {
      if (!claimId && !periodId) throw new Error("SP_EVIDENCE_NO_TARGET");
      if (claimId && periodId) throw new Error("SP_TARGET_AMBIGUOUS");
      const targetId = claimId ?? periodId;
      if (!targetId) throw new Error("SP_EVIDENCE_NO_TARGET");
      // The path is generated internally, never supplied by the HTTP caller.
      if (
        storagePath !==
        `${userId}/${input.attemptId}.${input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "image/jpeg" ? "jpg" : input.mimeType === "image/png" ? "png" : "heic"}`
      ) {
        throw new Error("SP_EVIDENCE_PATH_NOT_OWNED");
      }
      const { data: target, error } = claimId
        ? await supabase
            .from("sp_claims")
            .select("id")
            .eq("id", targetId)
            .eq("holder_user_id", userId)
            .maybeSingle()
        : await supabase
            .from("sp_experience_periods")
            .select("id")
            .eq("id", targetId)
            .eq("holder_user_id", userId)
            .maybeSingle();
      if (error) throw new Error(error.message);
      if (!target) throw new Error("SP_TARGET_NOT_FOUND");
    },
    upload: async () => {
      const result = await bucket.upload(storagePath, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });
      if (result.error) throw new Error(result.error.message);
    },
    attach: async () => {
      const { error } = await supabase.rpc("sp_attach_evidence", {
        _claim_id: orNull(claimId),
        _period_id: orNull(periodId),
        _storage_path: storagePath,
        _file_name: input.fileName,
        _mime_type: input.mimeType,
        _size_bytes: input.bytes.byteLength,
        _sha256: input.sha256,
      });
      return error ? (isDefiniteAttachmentRejection(error) ? "rejected" : "unknown") : "accepted";
    },
    readAttached: async () => {
      // RLS may hide every row after logout without returning a query error.
      // That empty result is not proof that the RPC did not commit.
      if (!(await sessionActive())) return { state: "unknown" };
      const { data: row, error } = await supabase
        .from("sp_evidence")
        .select(
          "id, claim_id, period_id, file_name, mime_type, size_bytes, uploaded_at, lifecycle_state, sha256",
        )
        .eq("holder_user_id", userId)
        .eq("storage_path", storagePath)
        .maybeSingle();
      if (error) return { state: "unknown" };
      if (!row) return { state: (await sessionActive()) ? "missing" : "unknown" };
      // A row already pointing at this object always blocks cleanup. Only a
      // matching active attachment can be reported as the successful upload.
      if (
        row.claim_id !== claimId ||
        row.period_id !== periodId ||
        row.sha256 !== input.sha256 ||
        row.lifecycle_state !== "active"
      ) {
        return { state: "unknown" };
      }
      return {
        state: "found",
        evidence: {
          id: row.id,
          claimId: row.claim_id,
          periodId: row.period_id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          uploadedAt: row.uploaded_at,
          lifecycleState: row.lifecycle_state,
        },
      };
    },
    remove: async () => {
      const result = await bucket.remove([storagePath]);
      return {
        failed: result.error !== null,
        deleted: (result.data ?? []).some((object) => object.name === storagePath),
      };
    },
    confirmMissing: async () => {
      // A revoked session can make list() return a successful empty result.
      // Bracket the read with the same live-session predicate as Storage RLS.
      if (!(await sessionActive())) return false;
      const separator = storagePath.lastIndexOf("/");
      const name = storagePath.slice(separator + 1);
      const result = await bucket.list(storagePath.slice(0, separator), {
        search: name,
        limit: 100,
      });
      return (
        result.error === null &&
        result.data !== null &&
        !result.data.some((object) => object.name === name) &&
        (await sessionActive())
      );
    },
  });
}

import type { EvidenceRecord } from "./evidence.functions";

/** Browser-safe summary: no Storage path, hash, credential or bearer URL. */
export interface EvidenceUploadAttempt {
  readonly id: string;
  readonly claimId: string | null;
  readonly periodId: string | null;
  readonly fileName: string;
  readonly status: "prepared" | "registered" | "cleanup_pending" | "cleaned";
  readonly updatedAt: string;
}
export type EvidenceRecoveryResult =
  | { readonly status: "registered"; readonly evidence: EvidenceRecord }
  | {
      readonly status:
        | "unknown"
        | "file_missing"
        | "integrity_mismatch"
        | "attachment_rejected"
        | "cleanup_pending"
        | "cleaned";
      readonly attemptId: string;
    };

/** Storage and metadata are separate transactions. A missing response is not
 * proof of a rollback. Only a definite rejection plus an authoritative empty
 * metadata read permits cleanup of this attempt's generated object. */
export type EvidenceUploadOutcome<T> =
  | { readonly status: "saved"; readonly evidence: T }
  | {
      readonly status: "not_attached";
      readonly fileCleanup: "confirmed" | "pending";
      readonly attemptId: string;
    }
  | { readonly status: "outcome_unknown"; readonly attemptId: string };

export type EvidenceAttachmentRead<T> =
  | { readonly state: "found"; readonly evidence: T }
  | { readonly state: "missing" }
  | { readonly state: "unknown" };

/** Deliberately conservative: only recognized target/constraint refusals from
 * Postgres are definite. Transport, gateway and unfamiliar errors are unknown. */
export function isDefiniteAttachmentRejection(error: {
  readonly code?: string;
  readonly message?: string;
}): boolean {
  return (
    (error.code === "P0002" && error.message === "SP_TARGET_NOT_FOUND") ||
    (error.code === "42501" &&
      ["SP_NOT_HOLDER", "SP_EVIDENCE_PATH_NOT_OWNED"].includes(error.message ?? "")) ||
    (error.code === "23514" && error.message?.startsWith("SP_TARGET_AMBIGUOUS:") === true) ||
    // A constraint violation aborts this RPC's entire database transaction.
    ["23502", "23503", "23505", "23514"].includes(error.code ?? "")
  );
}

export async function uploadAndAttachEvidence<T>(input: {
  readonly attemptId: string;
  readonly preflight: () => Promise<void>;
  readonly upload: () => Promise<void>;
  readonly attach: () => Promise<"accepted" | "rejected" | "unknown">;
  readonly readAttached: () => Promise<EvidenceAttachmentRead<T>>;
  readonly remove: () => Promise<{ readonly failed: boolean; readonly deleted: boolean }>;
  readonly confirmMissing: () => Promise<boolean>;
}): Promise<EvidenceUploadOutcome<T>> {
  // No Storage request is made for an inaccessible, missing or ambiguous target.
  await input.preflight();
  const unknown = { status: "outcome_unknown", attemptId: input.attemptId } as const;
  try {
    await input.upload();
  } catch {
    // Even the upload response may be lost after Storage accepted the bytes.
    return unknown;
  }
  let attachment: "accepted" | "rejected" | "unknown" = "unknown";
  try {
    attachment = await input.attach();
  } catch {
    // A late RPC commit can race an empty read. No cleanup on this path.
  }
  let read: EvidenceAttachmentRead<T> = { state: "unknown" };
  try {
    read = await input.readAttached();
  } catch {
    // A read failure cannot establish that metadata was not committed.
  }
  if (read.state === "found") return { status: "saved", evidence: read.evidence };
  if (attachment !== "rejected" || read.state !== "missing") return unknown;
  try {
    const result = await input.remove();
    if (!result.failed && (result.deleted || (await input.confirmMissing()))) {
      return { status: "not_attached", fileCleanup: "confirmed", attemptId: input.attemptId };
    }
  } catch {
    // A cleanup failure is retained in the outcome, never reported as removed.
  }
  return { status: "not_attached", fileCleanup: "pending", attemptId: input.attemptId };
}

/** Preserve the existing successful server-function contract. Error codes carry
 * an opaque reference, never a bearer URL, filename, holder ID or Storage path. */
export function requireSavedEvidence<T>(outcome: EvidenceUploadOutcome<T>): T {
  if (outcome.status === "saved") return outcome.evidence;
  const code =
    outcome.status === "outcome_unknown"
      ? "SP_EVIDENCE_UPLOAD_OUTCOME_UNKNOWN"
      : outcome.fileCleanup === "pending"
        ? "SP_EVIDENCE_UPLOAD_CLEANUP_PENDING"
        : "SP_EVIDENCE_UPLOAD_NOT_ATTACHED";
  throw new Error(`${code}:${outcome.attemptId}`);
}

export function evidenceUploadIssue(cause: unknown): {
  readonly key: "ev.uploadUnknown" | "ev.uploadPending" | "ev.uploadNotAttached" | "ev.failed";
  readonly reference: string | null;
} {
  const message = cause instanceof Error ? cause.message : "";
  const [code, reference] = message.split(":");
  const safeReference = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(reference ?? "")
    ? reference
    : null;
  const key =
    code === "SP_EVIDENCE_UPLOAD_CLEANUP_PENDING"
      ? "ev.uploadPending"
      : code === "SP_EVIDENCE_UPLOAD_NOT_ATTACHED"
        ? "ev.uploadNotAttached"
        : [
              "SP_EVIDENCE_NO_TARGET",
              "SP_TARGET_AMBIGUOUS",
              "SP_TARGET_NOT_FOUND",
              "SP_EVIDENCE_EMPTY",
              "SP_EVIDENCE_TOO_LARGE",
              "read_failed",
              "file",
            ].includes(code)
          ? "ev.failed"
          : "ev.uploadUnknown";
  return { key, reference: safeReference };
}

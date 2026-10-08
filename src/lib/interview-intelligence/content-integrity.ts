/** A current observation of pinned content, or metadata from a frozen report.
 * A matching hash proves identity. It does not approve content or validate a method.
 */
export interface ContentIntegrity {
  readonly manifestVersion: number;
  readonly manifestHash: string;
  readonly algorithm: string;
  readonly packHashMatches: boolean;
  readonly packContentStatus: string | null;
  readonly packValidationLabel: string | null;
  readonly methodApprovalState: string | null;
  readonly caseStoredPackHash: string | null;
  readonly storedPackHash: string | null;
  readonly recomputedPackHash: string | null;
}

export function readContentIntegrity(raw: unknown): ContentIntegrity | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (
    v.manifest_version !== 1 ||
    v.content_hash_algorithm !== "sha256-jsonb-v1" ||
    typeof v.manifest_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.manifest_hash) ||
    typeof v.pack_hash_matches !== "boolean"
  )
    return null;
  const text = (key: string) => (typeof v[key] === "string" ? (v[key] as string) : null);
  return {
    manifestVersion: 1,
    manifestHash: v.manifest_hash,
    algorithm: v.content_hash_algorithm,
    packHashMatches: v.pack_hash_matches,
    packContentStatus: text("pack_content_status"),
    packValidationLabel: text("pack_validation_label"),
    methodApprovalState: text("method_approval_state"),
    caseStoredPackHash: text("case_stored_pack_hash"),
    storedPackHash: text("stored_pack_hash"),
    recomputedPackHash: text("recomputed_pack_hash"),
  };
}

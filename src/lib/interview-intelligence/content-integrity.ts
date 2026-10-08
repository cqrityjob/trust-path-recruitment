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
  readonly observation?: string;
  readonly freezeProvenance?: "case_created" | "observed_now";
  readonly frozenAt?: string;
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
    observation: text("observation") ?? undefined,
    freezeProvenance:
      v.freeze_provenance === "case_created" || v.freeze_provenance === "observed_now"
        ? v.freeze_provenance
        : undefined,
    frozenAt: text("frozen_at") ?? undefined,
  };
}

export type InterviewClientCopy = Readonly<Record<"sv" | "en", Readonly<Record<string, string>>>>;
export interface ContentSnapshotState {
  readonly provenance: "case_created" | "observed_now";
  readonly frozenAt: string;
  readonly requiresAcknowledgement: boolean;
  readonly mayAcknowledge: boolean;
  readonly acknowledgedAt: string | null;
  readonly clientCopy: InterviewClientCopy;
}
export interface FrozenCaseContent extends ContentSnapshotState {
  readonly integrity: ContentIntegrity;
  readonly manifest: Record<string, unknown>;
  readonly content: Record<string, unknown>;
}
const CONTENT_ARRAYS = [
  "questions",
  "competencies",
  "question_competencies",
  "competency_map",
  "probes",
  "dimensions",
  "anchors",
  "verification_rules",
  "prohibited_areas",
  "method_practices",
  "conduct_steps",
  "conduct_guidance",
  "conduct_prohibitions",
  "trust_stages",
  "trust_prohibitions",
  "trust_claims",
  "trust_ai_tasks",
] as const;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Missing snapshots fail closed. A live content query is never a fallback. */
export function readFrozenCaseContent(raw: unknown): FrozenCaseContent | null {
  if (!record(raw) || !record(raw.manifest)) return null;
  const manifest = raw.manifest;
  const integrity = readContentIntegrity(manifest);
  const content = manifest.content;
  if (
    !integrity ||
    integrity.observation !== "frozen_case_content" ||
    !record(content) ||
    !record(content.pack) ||
    !record(content.pack_version) ||
    (content.method !== null && !record(content.method)) ||
    (raw.provenance !== "case_created" && raw.provenance !== "observed_now") ||
    raw.provenance !== integrity.freezeProvenance ||
    typeof raw.frozen_at !== "string" ||
    raw.frozen_at !== integrity.frozenAt ||
    typeof raw.requires_acknowledgement !== "boolean" ||
    typeof raw.may_acknowledge !== "boolean" ||
    (raw.acknowledged_at !== null && typeof raw.acknowledged_at !== "string") ||
    !record(content.client_copy)
  )
    return null;
  for (const key of CONTENT_ARRAYS) {
    if (!Array.isArray(content[key]) || !(content[key] as unknown[]).every(record)) return null;
  }
  for (const language of ["sv", "en"] as const) {
    const copy = content.client_copy[language];
    if (
      !record(copy) ||
      !Object.keys(copy).length ||
      !Object.values(copy).every((v) => typeof v === "string")
    )
      return null;
  }
  return {
    manifest,
    content,
    integrity,
    provenance: raw.provenance,
    frozenAt: raw.frozen_at,
    requiresAcknowledgement: raw.requires_acknowledgement,
    mayAcknowledge: raw.may_acknowledge,
    acknowledgedAt: raw.acknowledged_at,
    clientCopy: content.client_copy as InterviewClientCopy,
  };
}
export function frozenRows(
  snapshot: FrozenCaseContent,
  key: (typeof CONTENT_ARRAYS)[number],
): {
  data: Array<Record<string, unknown>>;
  error: { message: string } | null;
} {
  return { data: snapshot.content[key] as Array<Record<string, unknown>>, error: null };
}

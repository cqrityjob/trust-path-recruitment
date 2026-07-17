// Career Intelligence Graph — governance layer (Epic 1).
//
// Read-only surface for lifecycle, quality level and graph-version metadata.
// This module intentionally does NOT change any runtime scoring, ranking
// or public rendering behaviour. It exposes the shapes and a feature-flag
// read so future epics (CIG activation, admin governance UI) can adopt
// the governance data incrementally.
//
// The authoritative enforcement switch is stored in the database at
// `public.cig_governance_settings.lifecycle_enforced` (default `false`).
// The client-side flag `VITE_CIG_LIFECYCLE_ENFORCED` is a mirror used
// only to reveal governance UI. It is NOT a security boundary.

// Lifecycle states, mirroring the `cig_content_status` Postgres enum.
// The order matches the intended review flow from doc §14.
export const CIG_LIFECYCLE_STATES = [
  "draft",
  "researched",
  "awaiting_human_review",
  "reviewed",
  "published",
  "archived",
] as const;

export type CigLifecycleState = (typeof CIG_LIFECYCLE_STATES)[number];

// Quality levels, mirroring the `cig_quality_level` Postgres enum.
// A: fully reviewed, complete content, eligible for production ranking.
// B: reliable, matching-eligible with clear limitations.
// C: discovery only — MUST NOT appear as a primary assessment result.
export const CIG_QUALITY_LEVELS = ["A", "B", "C"] as const;
export type CigQualityLevel = (typeof CIG_QUALITY_LEVELS)[number];

export interface GraphVersion {
  id: string;
  version: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
  isActive: boolean;
}

export interface CigProfessionReview {
  id: string;
  professionId: string;
  reviewerId: string | null;
  reviewerLabel: string;
  reviewDate: string;
  reviewScope: string;
  reviewNotes: string | null;
  sourceReference: string | null;
  nextReviewDue: string | null;
  graphVersion: string;
  createdAt: string;
}

// Whether the client-side mirror flag is on. The database setting is the
// authoritative source; this is read only to conditionally reveal
// governance UI that later epics will add.
export function cigLifecycleEnforcedFlag(): boolean {
  const raw =
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_CIG_LIFECYCLE_ENFORCED) ??
    (typeof process !== "undefined" ? process.env?.VITE_CIG_LIFECYCLE_ENFORCED : undefined);
  return String(raw).toLowerCase() === "true";
}

// Predicate used by future epics to decide whether a profession may be
// surfaced as a *primary* assessment recommendation. Kept here to
// centralise the rule; callers must opt in (Epic 6 will wire this into
// the CIE ranking layer). Do NOT call this from ranking code today —
// Epic 1 must not change any user-visible behaviour.
export function isPrimaryRankingEligible(input: {
  contentStatus: CigLifecycleState;
  qualityLevel: CigQualityLevel;
}): boolean {
  return (
    input.contentStatus === "published" &&
    (input.qualityLevel === "A" || input.qualityLevel === "B")
  );
}
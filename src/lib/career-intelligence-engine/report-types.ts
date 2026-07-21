// Saved Career Intelligence Report — Phase 2: types only.
//
// This module defines the immutable, versioned snapshot contract stored in
// `assessment_run_reports.report`. It is a pure data-shape file — nothing
// here computes anything, and nothing in career-profile.ts / scoring.ts /
// family-ranking.ts / target-vector.ts imports from or is imported by this
// file. The report is a frozen copy of an already-computed EngineResultV1,
// never a re-derivation of it.

import type { Bi } from "@/lib/career-center/types";
import type { EngineResultV1 } from "./types";
import type { SecurityCareerProfileSnapshotV1 } from "@/lib/security-career-profile/types";
import type { AssessmentProfileId } from "@/lib/question-library/types";

export const REPORT_VERSION = "car-v1" as const;

/** The three Career Center fields CompareCard needs beyond EngineResultV1,
 * captured at save time so a saved report never re-fetches live profession
 * content (which can change after the report was saved). Keyed by
 * Match.legacySlug, matching CompareCard's existing lookup key. */
export interface CompareEnrichmentEntry {
  level?: string;
  workEnvironments?: Bi[];
  nextRoleTitle?: { titleSv: string; titleEn: string };
}

export type CompareEnrichmentMap = Record<string, CompareEnrichmentEntry>;

/** The complete, immutable, self-contained snapshot written into
 * `assessment_run_reports.report`. Every fact a saved report renders comes
 * from this object — nothing is recomputed or re-fetched on replay. */
export interface SavedCareerReportV1 {
  reportVersion: typeof REPORT_VERSION;
  completionId: string;
  savedAt: string; // ISO
  engineVersion: string;
  graphVersion: string;
  inputsHash: string; // retained for traceability/integrity checks, not for dedup
  locale: "sv" | "en"; // informational only — replay renders in whatever `lang` is active, same as the live page
  engineResult: EngineResultV1; // verbatim, unmodified — the exact object the results page rendered
  compareEnrichment: CompareEnrichmentMap;
  profileSnapshot: SecurityCareerProfileSnapshotV1 | null;
  // Optional, additive (Assessment Catalog / Question Library platform
  // layer). Self-identifies which catalog definition/profile produced this
  // report. Absent on every report saved before this field existed --
  // readers must treat a missing assessmentDefinitionId as the legacy
  // 'career-guidance' definition, not as an error.
  assessmentDefinitionId?: string;
  profileId?: AssessmentProfileId;
}

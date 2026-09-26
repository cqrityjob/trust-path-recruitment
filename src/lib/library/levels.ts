// The two assessment LEVELS an employer chooses between when sending a
// candidate test from a recruitment: operational roles and strategic /
// leading roles.
//
// ── WHAT THIS IS, AND IS NOT ────────────────────────────────────────────
//
// A presentation of the catalogue (src/lib/library/catalogue.ts), which is
// the one place that says which real content a role profile leads to. This
// module adds nothing to that mapping and decides no access: what an
// organisation may actually send is read live from its content library, and
// the database refuses anything else again on the way in.
//
// Three rules, inherited from the catalogue and kept here on purpose:
//
//   * the levels are ALWAYS both shown, each with who it is for and what it
//     produces, in plain Swedish and English -- the owner's launch decision
//     (2026-09-26) is that neither level is hidden;
//   * a level with no approved content of its own is never the other level
//     renamed: the strategic level says exactly what is missing (the
//     content specification's own list, docs/product/
//     trust-beskt-content-gaps-2026-09-19.md §3.1) and cannot be sent;
//   * nothing about scoring, questions or reports is shared between levels:
//     each level maps to its own assessment definition, or to none.

import { ROLE_PROFILES, TRUST_CONTENT, type RoleGroup, type RoleProfileKey } from "./catalogue";

export interface AssessmentLevel {
  readonly group: RoleGroup;
  readonly profile: RoleProfileKey;
  /** The recruitment test that belongs to the level, by slug -- or null when
   *  no approved test exists for it. */
  readonly assessmentSlug: string | null;
}

/** In the order the employer reads them: operational first, because that is
 *  the level with a test today; strategic second, never hidden. */
export const ASSESSMENT_LEVELS: readonly AssessmentLevel[] = ROLE_PROFILES.map((p) => ({
  group: p.group,
  profile: p.key,
  assessmentSlug: TRUST_CONTENT[p.key]?.assessmentSlug ?? null,
}));

/** What the strategic level is missing before a test can exist, as the
 *  owner's content specification lists it (§3.1). Named, not paraphrased:
 *  the product says these words instead of "coming soon". */
export const STRATEGIC_MISSING_CONTENT = [
  "requirement_profile",
  "interview_guide",
  "candidate_component",
  "report_section",
  "review",
] as const;
export type StrategicMissingContent = (typeof STRATEGIC_MISSING_CONTENT)[number];

/** The subset of a content-library row this module reads. */
export interface OfferableAssessment {
  readonly libraryKind: string;
  readonly slug: string;
  readonly itemId: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly designedFor: string;
  readonly assignable: boolean;
  readonly unassignableReason: string | null;
  readonly itemCount: number;
  readonly moduleCount: number;
  readonly minutesMin: number | null;
  readonly minutesMax: number | null;
  readonly competenciesSv: readonly string[];
  readonly competenciesEn: readonly string[];
}

export type LevelOfferState =
  /** The level's test exists, this organisation may run it, and it has not
   *  been sent on this application. */
  | "sendable"
  /** No approved test exists for the level at all. */
  | "no_content"
  /** A test exists but this organisation may not run it (the library says
   *  why). */
  | "not_assignable"
  /** Already sent on this application; the database would return the same
   *  attempt, so the button is not offered twice. */
  | "already_sent";

export interface LevelOffer {
  readonly level: AssessmentLevel;
  readonly state: LevelOfferState;
  readonly assessment: OfferableAssessment | null;
  readonly missing: readonly StrategicMissingContent[];
}

/** Resolve what each level offers for ONE application, from the library the
 *  organisation can read and the tests already sent on the application.
 *  Pure: the same inputs give the same answer, and nothing is invented for
 *  a level whose slug the library does not carry. */
export function resolveLevelOffers(
  library: readonly OfferableAssessment[],
  alreadySentSlugs: ReadonlySet<string>,
): readonly LevelOffer[] {
  return ASSESSMENT_LEVELS.map((level) => {
    if (!level.assessmentSlug) {
      return {
        level,
        state: "no_content",
        assessment: null,
        missing: level.group === "strategic" ? STRATEGIC_MISSING_CONTENT : [],
      };
    }
    const row =
      library.find(
        (r) =>
          r.libraryKind === "assessment" &&
          r.slug === level.assessmentSlug &&
          r.designedFor === "recruitment_support",
      ) ?? null;
    if (!row) return { level, state: "no_content", assessment: null, missing: [] };
    if (alreadySentSlugs.has(row.slug))
      return { level, state: "already_sent", assessment: row, missing: [] };
    if (!row.assignable) return { level, state: "not_assignable", assessment: row, missing: [] };
    return { level, state: "sendable", assessment: row, missing: [] };
  });
}

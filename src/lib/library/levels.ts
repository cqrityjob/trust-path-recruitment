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
//   * a level is never the other level renamed: each maps to its own
//     assessment definition, or to none, and nothing about scoring,
//     questions or reports is shared between them;
//   * a level whose content exists but is not released says so in those
//     words. The strategic level's content (20261216090000) is a governed
//     DRAFT awaiting the owner's content approval: the library answers
//     "not permitted" for it until CQrityjob designates it, and this module
//     reports that as a draft awaiting release -- never as "coming soon",
//     never as a validated test, and never by offering the operational test
//     under the strategic heading.

import { ROLE_PROFILES, TRUST_CONTENT, type RoleGroup, type RoleProfileKey } from "./catalogue";

export interface AssessmentLevel {
  readonly group: RoleGroup;
  readonly profile: RoleProfileKey;
  /** The recruitment test that belongs to the level, by slug -- or null when
   *  the catalogue carries no test for it. */
  readonly assessmentSlug: string | null;
}

/** In the order the employer reads them: operational first, because that is
 *  the level released today; strategic second, never hidden. */
export const ASSESSMENT_LEVELS: readonly AssessmentLevel[] = ROLE_PROFILES.map((p) => ({
  group: p.group,
  profile: p.key,
  assessmentSlug: TRUST_CONTENT[p.key]?.assessmentSlug ?? null,
}));

/** What the strategic level consists of, as the owner's content
 *  specification lists it (docs/product/trust-beskt-content-gaps-2026-09-19.md
 *  §3.1). Every part exists as a draft since 20261216090000; the list is
 *  shown so the employer sees what is under review, and what is not
 *  installed where the library does not carry the test at all. */
export const STRATEGIC_CONTENT_PARTS = [
  "requirement_profile",
  "interview_guide",
  "candidate_component",
  "report_section",
  "review",
] as const;
export type StrategicContentPart = (typeof STRATEGIC_CONTENT_PARTS)[number];

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
  readonly contentStatus: string;
  readonly validationStatus: string;
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
  /** The library carries no test for the level at all: either the catalogue
   *  names none, or the content is not installed in this environment. */
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
  /** True when the test exists as governed draft content that CQrityjob has
   *  not released for recruitment: the library refuses it as not permitted
   *  and it is still a draft. Said as "awaiting content approval", which is
   *  what it is. */
  readonly draftAwaitingRelease: boolean;
  /** The parts the level consists of, for the strategic level; empty for a
   *  level that needs no such explanation. */
  readonly parts: readonly StrategicContentPart[];
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
    const parts = level.group === "strategic" ? STRATEGIC_CONTENT_PARTS : [];
    if (!level.assessmentSlug) {
      return { level, state: "no_content", assessment: null, draftAwaitingRelease: false, parts };
    }
    const row =
      library.find(
        (r) =>
          r.libraryKind === "assessment" &&
          r.slug === level.assessmentSlug &&
          r.designedFor === "recruitment_support",
      ) ?? null;
    if (!row) {
      return { level, state: "no_content", assessment: null, draftAwaitingRelease: false, parts };
    }
    if (alreadySentSlugs.has(row.slug)) {
      return { level, state: "already_sent", assessment: row, draftAwaitingRelease: false, parts };
    }
    if (!row.assignable) {
      return {
        level,
        state: "not_assignable",
        assessment: row,
        draftAwaitingRelease:
          row.contentStatus === "draft" && row.unassignableReason === "not_permitted",
        parts,
      };
    }
    return { level, state: "sendable", assessment: row, draftAwaitingRelease: false, parts };
  });
}

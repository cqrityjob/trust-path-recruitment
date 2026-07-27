// Security Competency Platform -- shared domain types.
//
// Source of truth: "CQrityjob Security Competency Core Specification v2.0"
// (docs/assessment/security-competency-core-v2.0.md). These types mirror the
// PR-A schema in
// supabase/migrations/20260727120000_scp_a1_security_competency_platform_domain.sql.
//
// DELIBERATE ISOLATION -- read before adding an import here.
// This module must never import from, re-export, or structurally depend on:
//   * src/lib/assessment-content.ts        (Career Guidance question content)
//   * src/lib/career-assessment/*          (Career Guidance dimensions/mappings)
//   * src/lib/question-library/*           (Career Guidance question assets)
//   * src/lib/career-intelligence-engine/* (Career Guidance scoring)
// Career Guidance and Security Competency are two separate products (spec 2,
// implementation directive section 5). The isolation is enforced automatically
// by scripts/security-competency-separation-check.ts -- adding such an import
// fails CI, by design.

/** The twelve Security Competency Core constructs (spec chapter 5). */
export type CompetencyCode =
  | "SCC-01"
  | "SCC-02"
  | "SCC-03"
  | "SCC-04"
  | "SCC-05"
  | "SCC-06"
  | "SCC-07"
  | "SCC-08"
  | "SCC-09"
  | "SCC-10"
  | "SCC-11"
  | "SCC-12";

export const COMPETENCY_CODES: readonly CompetencyCode[] = [
  "SCC-01",
  "SCC-02",
  "SCC-03",
  "SCC-04",
  "SCC-05",
  "SCC-06",
  "SCC-07",
  "SCC-08",
  "SCC-09",
  "SCC-10",
  "SCC-11",
  "SCC-12",
] as const;

/** Product families. `career_guidance` exists only as an explicit separation marker. */
export type ProductType = "career_guidance" | "security_competency_core" | "profession_module";

/** Stable public slugs (implementation directive section 7). */
export const FAMILY_SLUGS = {
  careerGuidance: "career-guidance",
  core: "security-competency-core",
  professionModules: "security-profession-modules",
} as const;

export const PROFESSION_SLUGS = {
  securityOfficer: "security-officer-se",
  publicOrderOfficer: "public-order-officer-se",
  protectiveSecurityOfficer: "protective-security-officer-se",
} as const;

export type ProfessionSlug = (typeof PROFESSION_SLUGS)[keyof typeof PROFESSION_SLUGS];

/**
 * Editorial workflow state. Distinct from `ValidationStatus` on purpose:
 * this is "where is this content in the authoring pipeline", not "how much
 * evidence backs it".
 */
export type ContentStatus = "draft" | "in_review" | "approved" | "published" | "retired";

/**
 * Product-facing evidence claim (spec chapter 14 release gates). Every report
 * must display this -- acceptance criterion 18.
 */
export type ValidationStatus =
  | "design"
  | "pilot"
  | "operational-development"
  | "operational-selection"
  | "retired";

/** Item-level evidence claim (spec Bilaga A `status`). */
export type ItemValidationStatus = "design" | "sme_reviewed" | "pilot" | "operational" | "retired";

/** Spec 7.2 / 7.3 -- the three permitted item formats. */
export type ItemFormat = "sjt_best_response" | "sjt_rate_effectiveness" | "biq_frequency";

/** Spec 7.1 / 11 -- translation is an adaptation with its own review gate. */
export type AdaptationStatus =
  | "source"
  | "adaptation_pending"
  | "adaptation_reviewed"
  | "approved";

export type ScpLanguage = "sv-SE" | "en-GB";

/** Spec 13.3 content-governance roles, separate from `public.app_role`. */
export type ContentRole = "editor" | "reviewer" | "publisher";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type LegalReviewStatus = "not_required" | "pending" | "approved" | "rejected";

export interface Competency {
  id: string;
  code: CompetencyCode;
  displayOrder: number;
}

export interface CompetencyVersion {
  id: string;
  competencyId: string;
  versionNumber: number;
  contentStatus: ContentStatus;
  nameSv: string;
  nameEn: string;
  definitionSv: string;
  definitionEn: string;
}

export interface CompetencyFacet {
  id: string;
  competencyId: string;
  slug: string;
  nameSv: string;
  nameEn: string;
  definitionSv: string;
  definitionEn: string;
  displayOrder: number;
}

export interface Profession {
  id: string;
  slug: ProfessionSlug;
  nameSv: string;
  nameEn: string;
  /** ISO 3166-1 alpha-2. Swedish regulated roles never apply automatically abroad. */
  market: string;
  legallyRegulated: boolean;
}

export interface AssessmentDefinition {
  id: string;
  familyId: string;
  professionId: string | null;
  slug: string;
  nameSv: string;
  nameEn: string;
  purpose: "core" | "profession_module";
}

export interface AssessmentVersion {
  id: string;
  definitionId: string;
  versionNumber: number;
  contentStatus: ContentStatus;
  validationStatus: ValidationStatus;
  languageScope: ScpLanguage[];
  contentHash: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
}

/**
 * The full lineage an assignment locks before a candidate starts
 * (spec 2.1 step 2, acceptance criterion 7).
 */
export interface BundleVersionLineage {
  bundleVersionId: string;
  coreAssessmentVersionId: string;
  moduleAssessmentVersionId: string;
  coreFormId: string;
  moduleFormId: string;
  roleWeightProfileId: string | null;
  scoringVersion: string;
  reportVersion: string;
  disclaimerVersion: string;
  validationStatus: ValidationStatus;
}

/**
 * Candidate-facing shape of one item. Deliberately has NO score field:
 * the scoring key lives in `scp_item_options`, which no candidate or employer
 * account can read (spec 12.1, acceptance criterion 12).
 */
export interface CandidateFacingItem {
  itemVersionId: string;
  itemFormat: ItemFormat;
  scenario: string;
  prompt: string;
  options: Array<{ optionKey: string; label: string }>;
}

/** Stable error codes raised by Security Competency server functions. */
export const SCP_ERRORS = {
  /**
   * Spec T-002. A retired assessment version can never receive a new
   * assignment. The specification writes this `assessment_retired`; this
   * repository's established convention for thrown error codes is
   * SCREAMING_SNAKE_CASE (see the ~70 existing codes in src/lib/**), so the
   * same stable code is expressed in that casing. Documented in
   * docs/assessment/implementation/gap-analysis.md.
   */
  ASSESSMENT_RETIRED: "ASSESSMENT_RETIRED",
  /** A published version was edited in place (spec T-004). */
  PUBLISHED_IMMUTABLE: "SCP_PUBLISHED_IMMUTABLE",
  /** Someone tried to attach Security Competency content to Career Guidance. */
  CAREER_GUIDANCE_SEPARATION: "SCP_CAREER_GUIDANCE_SEPARATION",
  /** Publication attempted without an independent reviewer (spec T-013). */
  TWO_PERSON_PRINCIPLE_REQUIRED: "SCP_TWO_PERSON_PRINCIPLE_REQUIRED",
  /** A draft item may never be assigned (acceptance criterion 15). */
  ITEM_NOT_PUBLISHED: "SCP_ITEM_NOT_PUBLISHED",
} as const;

/**
 * Spec 8.3 preliminary description bands. Labelled "preliminär
 * utvecklingsprofil" everywhere they are shown -- these are NOT norms, and
 * percentile / "top N %" / industry comparison language is forbidden until
 * approved norm data exists (spec 8.3, 14).
 */
export const PRELIMINARY_BANDS = [
  { min: 0, max: 39, key: "needs_verification" },
  { min: 40, max: 59, key: "varying_support" },
  { min: 60, max: 79, key: "clear_support" },
  { min: 80, max: 100, key: "very_clear_support" },
] as const;

/** Spec 8.1 starting weights -- a pilot start model, not a permanent fact. */
export const SCORING_START_WEIGHTS = { sjt: 0.7, biq: 0.3 } as const;

/** Spec 8.4 quality flags. A flag lowers interpretation strength; it never accuses. */
export type QualityFlag =
  | "completion_quality"
  | "rapid_response"
  | "straightlining"
  | "inconsistency"
  | "technical_anomaly"
  | "language_support";

/** Spec 8.5. */
export type InterpretationStrength = "limited" | "sufficient" | "strong";

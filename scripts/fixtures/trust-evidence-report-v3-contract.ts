// CQrityjob TRUST Evidence Report — future contracts, DOCUMENT ONLY.
//
// "Från evidens till en bättre intervju."
//
// This file is the versioned technical contract for two things that do NOT
// exist yet and which PR-R0 must not build:
//
//   1. the canonical Report V3 shape (audience document), and
//   2. the private, immutable computation manifest behind it.
//
// It is a TypeScript fixture rather than prose so that the shape is type-
// checked (tsconfig.scripts.json), so that the forbidden-claim guard can walk
// it as data, and so that PR-R1 / PR-R2 / PR-R3 start from a shape the
// product owner has already read. Nothing imports it at runtime. No UI
// renders it. No migration reads it. No report is generated from it.
//
// The chain it describes is the EXISTING one, unchanged by PR-R0:
//
//   question + response -> evidence type -> competency signal -> limitation
//     -> human review -> TRUST follow-up -> documented interview outcome
//
// ── PRODUCT BOUNDARY (negative contract, locked) ──────────────────────────
//
// The report may support: a structured interview, an additional assessment,
// a clarification request, the collection of more evidence. It must never
// output: hire, reject, recommended/not recommended, pass/fail, a ranking, a
// percentile, a benchmark, a match or job-fit percentage, suitability, a
// potential score, a safety risk score, a personality diagnosis, a predictive
// work-performance claim, a bias-free claim, a total score, an employer-
// weighted candidate index, a radar/spider chart or a closed competence
// polygon. The guard in scripts/trust-evidence-report-check.ts fails the
// build if any such key enters this contract.

/** The four allowed process steps. This is the SAME closed set the shipped
 *  rds-v1 layer produces (RecommendedNextStep in decision-support.ts); V3 may
 *  not widen it. */
export const TRUST_PROCESS_STEPS = [
  "structured_interview",
  "additional_assessment",
  "request_clarification",
  "gather_more_evidence",
] as const;
export type TrustProcessStep = (typeof TRUST_PROCESS_STEPS)[number];

/** What a line may say about the evidence behind an area. Descriptive states
 *  about the EVIDENCE, never a judgement about the PERSON. */
export type TrustEvidenceState =
  | "observed_consistent" // several observed tasks pointed the same way
  | "observed_mixed" // comparable observed tasks pointed different ways
  | "observed_limited" // too few observed tasks to say anything (SCC-08 on one item)
  | "self_reported_only" // the person described it; nothing observed it
  | "not_covered" // the instrument did not touch the area
  | "human_review_pending"; // a person still has to read something here

export type TrustCoverageStatus = "covered" | "partially_covered" | "limited" | "not_covered";

export type TrustReviewStatus =
  | "not_required"
  | "pending"
  | "completed_upheld"
  | "completed_disputed"; // adjusted/overturned: no numeric contribution was written

/** Source types are the registry codes of scp_evidence_source_types. Only the
 *  counting ones may ever appear under an observed state. */
export type TrustSourceType =
  | "assessment_response"
  | "self_report"
  | "human_reviewed_free_text"
  | "interview_addendum";

/** Methodological flags a line carries so the reader is told what the number
 *  behind it cannot support. `descriptive_only` and `methodologically_open`
 *  are the interpretation labels c07 / c19 need and which today's schema does
 *  not hold (recorded gap, PR-R1/R2). */
export type TrustMethodologicalFlag =
  | "single_context"
  | "single_item"
  | "self_report_not_observed"
  | "descriptive_only"
  | "methodologically_open"
  | "unvalidated_content"
  | "closed_test";

export type TrustFollowUpPriority = "first" | "next" | "if_time_allows" | "none";

/** One competency area, as the future report states it. Every field is a
 *  fact about the evidence; there is deliberately no numeric field at all. */
export type TrustEvidenceArea = {
  competency_code: string;
  competency_version: string;
  evidence_state: TrustEvidenceState;
  observed_item_count: number;
  planned_item_count: number;
  context_count: number;
  source_types: TrustSourceType[];
  coverage_status: TrustCoverageStatus;
  review_status: TrustReviewStatus;
  methodological_flags: TrustMethodologicalFlag[];
  factual_explanation: { sv: string; en: string };
  follow_up_priority: TrustFollowUpPriority;
};

/** What the person SAID about their way of working. Never merged into an
 *  area, never counted, never "shown". */
export type TrustSelfReportedPattern = {
  domain_key: string;
  competency_code: string;
  pattern: "consistently_described" | "mostly_described" | "rarely_described" | "not_described";
  consistency: "consistent" | "varied";
  item_count: number;
  interpretation: "descriptive_only" | "methodologically_open";
  factual_explanation: { sv: string; en: string };
};

/** A TRUST follow-up: an authored, versioned interview question selected by
 *  the evidence state, never generated and never scored. */
export type TrustFollowUp = {
  competency_code: string;
  trust_question_version: string;
  focus:
    | "explore_limited_evidence"
    | "explore_self_report"
    | "explore_development"
    | "confirm_strength";
  question: { sv: string; en: string };
  listen_for: { sv: string[]; en: string[] };
  priority: TrustFollowUpPriority;
};

export type TrustLimitation = {
  code:
    | "one_assessment_occasion"
    | "single_evidence_context"
    | "self_report_not_observed"
    | "unvalidated_content"
    | "closed_test_pilot"
    | "no_norm_group"
    | "no_predictive_claim";
  statement: { sv: string; en: string };
};

/** The human review record the report is released under. Counts and states
 *  only: no reviewer rationale, no rubric level, no severity. */
export type TrustHumanReview = {
  reviews_total: number;
  reviews_completed: number;
  disputed_readings: number;
  safety_findings_present: boolean; // a person found something; never a score
  released_by_role: "owner" | "admin";
  released_at: string;
};

/** The canonical Report V3 shape. `context` and `coverage` are the frozen
 *  Part A of today's snapshot, carried forward, not redesigned here. */
export type TrustEvidenceReportV3 = {
  schema_version: "trust-evidence-report/v3";
  report_id: string;
  released_at: string;
  audience: "participant" | "employer";
  context: {
    person_context: "candidate" | "employee";
    organisation_name: string;
    purpose_code: string;
    assessment_slug: string;
    assessment_version: number;
    language: string;
    governance_mode: string;
    validation_status: string;
  };
  coverage: {
    observed_items: number;
    self_report_items: number;
    evidence_contexts: number;
    areas_covered: number;
    areas_limited: number;
    areas_not_covered: number;
  };
  areas: TrustEvidenceArea[];
  self_reported_patterns: TrustSelfReportedPattern[];
  trust_followups: TrustFollowUp[];
  limitations: TrustLimitation[];
  human_review: TrustHumanReview;
  recommended_process_step: TrustProcessStep;
  /** Present in the FUTURE only; ties the audience document to its private
   *  manifest without exposing anything from it. */
  computation_manifest_ref: { manifest_id: string; canonical_sha256: string };
};

// ── The private computation manifest (PR-R1; NOT created by PR-R0) ─────────
//
// scp_report_computation_manifests. One row per released report version,
// immutable after insert, private: not readable by a participant, not readable
// by an employer, reachable only through server / reviewer / internal paths.
// It is what makes a released report REPRODUCIBLE, which today's
// derivation_input (maturity level per competency, nothing per item) does not.

export type TrustManifestEvidenceRow = {
  evidence_id: string;
  response_id: string;
  item_id: string;
  item_version: string;
  option_key_version: string;
  rubric_version: string | null;
  competency_code: string;
  competency_mapping_version: string;
  source_type: TrustSourceType;
  classification: "observed" | "self_report";
  provenance_type: "deterministic" | "human_review";
  contribution: number;
  confidence: number;
  included: boolean;
  exclusion_reason:
    | null
    | "self_report_non_counting"
    | "training_non_counting"
    | "superseded"
    | "expired"
    | "review_disputed"
    | "review_pending";
};

export type TrustManifestAreaComputation = {
  competency_code: string;
  item_count: number;
  weighted_sum: number;
  denominator: number;
  spread: number;
  classification_rule: string; // e.g. "ras-v1: n<3 -> limited; spread>=0.6 -> mixed; ..."
  final_area_signal: "strong" | "consistent" | "mixed" | "developing" | "limited";
};

export type TrustComputationManifest = {
  report_version_id: string;
  snapshot_id: string;
  attempt_id: string;
  calculated_at: string;
  calculation_schema_version: string;
  scoring_model_version: string; // today: det-v1
  signal_model_version: string; // today: ras-v1
  threshold_version: string; // today: v1
  evidence_state_version: string; // today: des-v2
  evidence_scope_version: string; // today: attempt-v1
  report_template_version: string; // today: scp_report_versions.id
  trust_question_version: string;
  rubric_versions: string[];
  competency_mapping_version: string;
  included_evidence: TrustManifestEvidenceRow[];
  excluded_evidence: TrustManifestEvidenceRow[];
  areas: TrustManifestAreaComputation[];
  canonical_sha256: string;
};

/** A worked example of the audience document, so the guard has data to walk
 *  and a reviewer has something concrete to object to. Drawn from the shape
 *  the R0 suite observed on the flagship form: SCC-08 on one observed item. */
export const TRUST_V3_EXAMPLE: TrustEvidenceReportV3 = {
  schema_version: "trust-evidence-report/v3",
  report_id: "00000000-0000-0000-0000-000000000000",
  released_at: "2026-09-04T00:00:00Z",
  audience: "employer",
  context: {
    person_context: "candidate",
    organisation_name: "Exempel Bevakning AB",
    purpose_code: "closed_test_recruitment",
    assessment_slug: "security-officer-recruitment",
    assessment_version: 1,
    language: "sv",
    governance_mode: "closed_test",
    validation_status: "design",
  },
  coverage: {
    observed_items: 26,
    self_report_items: 24,
    evidence_contexts: 1,
    areas_covered: 5,
    areas_limited: 3,
    areas_not_covered: 0,
  },
  areas: [
    {
      competency_code: "SCC-08",
      competency_version: "1",
      evidence_state: "observed_limited",
      observed_item_count: 1,
      planned_item_count: 1,
      context_count: 1,
      source_types: ["assessment_response"],
      coverage_status: "limited",
      review_status: "not_required",
      methodological_flags: ["single_item", "single_context", "unvalidated_content", "closed_test"],
      factual_explanation: {
        sv: "Begränsat underlag: endast en uppgift i den här bedömningen berörde området. Följ upp i intervju.",
        en: "Limited evidence: only one task in this assessment touched this area. Follow up in interview.",
      },
      follow_up_priority: "first",
    },
  ],
  self_reported_patterns: [
    {
      domain_key: "aktiv-scanning",
      competency_code: "SCC-03",
      pattern: "consistently_described",
      consistency: "consistent",
      item_count: 3,
      interpretation: "descriptive_only",
      factual_explanation: {
        sv: "Deltagaren beskriver genomgående att hen arbetar så. Självrapporterat, inte observerat.",
        en: "The participant consistently describes working this way. Self-reported, not observed.",
      },
    },
  ],
  trust_followups: [
    {
      competency_code: "SCC-08",
      trust_question_version: "igp-v1",
      focus: "explore_limited_evidence",
      question: {
        sv: "Vad behöver nästa pass alltid få veta av dig?",
        en: "What does the next shift always need to hear from you?",
      },
      listen_for: {
        sv: ["Har en egen checklista i huvudet"],
        en: ["Has their own mental checklist"],
      },
      priority: "first",
    },
  ],
  limitations: [
    {
      code: "one_assessment_occasion",
      statement: {
        sv: "Underlaget kommer från ett bedömningstillfälle.",
        en: "The evidence comes from one assessment occasion.",
      },
    },
  ],
  human_review: {
    reviews_total: 7,
    reviews_completed: 7,
    disputed_readings: 0,
    safety_findings_present: false,
    released_by_role: "owner",
    released_at: "2026-09-04T00:00:00Z",
  },
  recommended_process_step: "structured_interview",
  computation_manifest_ref: {
    manifest_id: "00000000-0000-0000-0000-000000000001",
    canonical_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
  },
};

/** The fields a manifest row MUST carry, listed as data so the guard can
 *  assert the type above still names every one of them. */
export const TRUST_MANIFEST_REQUIRED_FIELDS = [
  "report_version_id",
  "snapshot_id",
  "attempt_id",
  "calculated_at",
  "calculation_schema_version",
  "scoring_model_version",
  "signal_model_version",
  "threshold_version",
  "report_template_version",
  "included_evidence",
  "excluded_evidence",
  "rubric_versions",
  "competency_mapping_version",
  "trust_question_version",
  "canonical_sha256",
] as const;

export const TRUST_MANIFEST_EVIDENCE_FIELDS = [
  "item_version",
  "option_key_version",
  "rubric_version",
  "contribution",
  "confidence",
  "source_type",
  "classification",
  "included",
  "exclusion_reason",
] as const;

export const TRUST_MANIFEST_AREA_FIELDS = [
  "item_count",
  "weighted_sum",
  "denominator",
  "spread",
  "classification_rule",
  "final_area_signal",
] as const;

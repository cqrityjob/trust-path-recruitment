// CQrityjob TRUST Evidence Report — the versioned contracts, as DATA.
//
// "Från evidens till en bättre intervju."
//
// This file is the versioned technical contract for two things:
//
//   1. the canonical Report V3 document (employer audience), which PR-R3A
//      (20261028090000) produces server-side as scp_employer_report_v3(), and
//   2. the private, immutable computation manifest behind it (PR-R1,
//      20261027090000).
//
// It is a TypeScript fixture rather than prose so that the shape is type-
// checked (tsconfig.scripts.json), so that the forbidden-claim guard can walk
// it as data, and so that the migration can be held to it: guard H14 asserts
// the R3A migration names every key below, and guard H15 asserts the
// employer field allowlist here equals the one the database suite enforces.
// Nothing in src/ imports it (guard H12): the UI (PR-R3B) reads the document
// from the database, and this file states what that document is.
//
// ── THREE DIMENSIONS, KEPT APART ──────────────────────────────────────────
//
//   observed_pattern      what the observed responses LOOK LIKE
//   evidence_sufficiency  how much observed evidence EXISTS
//   follow_up_priority    what the recruiter should DO (employer only)
//
// Nothing encodes one in another; `evidence_state` is a composite
// presentation field DERIVED from the first two and never replaces them.
//
// ── FROZEN REPORT / LIVE OVERLAY ──────────────────────────────────────────
//
//   frozen_report.core      the shared, audience-neutral frozen core
//   frozen_report.employer  what only the commissioning organisation gets
//   addenda_overlay         the live post-interview addenda, own as_of;
//                           never part of the report's identity or provenance
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
// build if any such key enters this contract, and the migration's own
// apply-time proof fails if any such word enters the projection.

/** The four allowed process steps. This is the SAME closed set the shipped
 *  rds-v1 layer produces (RecommendedNextStep in decision-support.ts) and
 *  the database rule scp_report_next_step returns; V3 may not widen it. */
export const TRUST_PROCESS_STEPS = [
  "structured_interview",
  "additional_assessment",
  "request_clarification",
  "gather_more_evidence",
] as const;
export type TrustProcessStep = (typeof TRUST_PROCESS_STEPS)[number];

/** Dimension 1: what the observed responses look like. Never encodes an
 *  amount of evidence, a follow-up or a safety state. `not_established` is
 *  what a too-small basis (or none) yields: the governed rule computes no
 *  pattern under three tasks, and nothing invents a stronger one. */
export type TrustObservedPattern =
  | "clearly_consistent"
  | "consistent"
  | "mixed"
  | "developing"
  | "not_established";

/** Dimension 2: how much observed evidence exists. */
export type TrustEvidenceSufficiency = "sufficient" | "limited" | "none";

/** Dimension 3 (employer only): what the recruiter should do next. */
export type TrustFollowUpPriority = "first" | "next" | "if_time_allows" | "none";

/** The composite presentation state of ADR Decision 2, DERIVED from the two
 *  frozen dimensions and the review state. Descriptive of the EVIDENCE. */
export type TrustEvidenceState =
  | "observed_consistent"
  | "observed_mixed"
  | "observed_follow_up"
  | "observed_limited"
  | "self_reported_only"
  | "not_covered"
  | "human_review_pending";

export type TrustCoverageStatus = "covered" | "partially_covered" | "limited" | "not_covered";

/** The mandatory-review state of a competency: whether a person had to read
 *  something here and whether that is done. Never the reviewer's outcome. */
export type TrustReviewStatus = "not_required" | "pending" | "completed";

/** Source types are the registry codes of scp_evidence_source_types, plus the
 *  free-text channel once a person has read it and it stands. Only the
 *  counting ones may ever appear on a competency. */
export type TrustSourceType =
  | "assessment_response"
  | "self_report"
  | "human_reviewed_free_text"
  | "interview_addendum";

/** Methodological flags a line carries so the reader is told what the number
 *  behind it cannot support. `descriptive_only` and `methodologically_open`
 *  are the interpretation labels c07 / c19 need; the schema still holds no
 *  per-domain column for them, so every pattern is stated descriptive_only
 *  (recorded gap, unchanged by PR-R3A). */
export type TrustMethodologicalFlag =
  | "single_context"
  | "single_item"
  | "self_report_not_observed"
  | "descriptive_only"
  | "methodologically_open"
  | "unvalidated_content"
  | "closed_test";

/** Why an area is verified in interview: governed reasons, never a workflow
 *  detail. `human_review_adjusted` says a person changed a reading and
 *  nothing more. */
export type TrustVerifyReason =
  | "safety_finding"
  | "developing_pattern"
  | "mixed_pattern"
  | "limited_evidence"
  | "pending_review"
  | "human_review_adjusted";

export type TrustBilingual = { sv: string; en: string };

/** One competency line of the SHARED FROZEN CORE. Every field is a fact
 *  about the evidence; the only numbers are counts. Structural facts that
 *  the frozen snapshot does not carry come from the PR-R1 manifest as counts
 *  and are `null` on a report released before PR-R1 (never fabricated). */
export type TrustCoreCompetency = {
  competency_code: string;
  competency_version: string;
  competency_name_sv: string;
  competency_name_en: string;
  observed_pattern: TrustObservedPattern;
  evidence_sufficiency: TrustEvidenceSufficiency;
  evidence_state: TrustEvidenceState;
  observed_item_count: number;
  answered_item_count: number | null;
  /** This competency's own frozen context count -- never the report's. */
  context_count: number | null;
  source_types: TrustSourceType[];
  coverage_status: TrustCoverageStatus;
  review_status: TrustReviewStatus | null;
  methodological_flags: TrustMethodologicalFlag[];
  factual_explanation: TrustBilingual;
  /** The one limitation the card states, or null. */
  limitation: { code: string; sv: string; en: string } | null;
  /** What the evidence is built on: item and review COUNTS per channel. */
  evidence_basis: {
    scenario_items: number;
    free_text_items: number;
    free_text_reviewed: number;
    self_description_items: number;
    safety_critical_items: number;
    safety_critical_reviewed: number;
  } | null;
  behaviour: TrustBilingual;
  /** The candidate's own descriptions live in self_reported_patterns; a line
   *  only names which domains belong to it. */
  self_description_domain_keys: string[];
};

/** The employer's line for one competency: what to DO about it. */
export type TrustEmployerArea = {
  competency_code: string;
  follow_up_priority: TrustFollowUpPriority;
  safety_critical_follow_up: boolean;
  clearest_support_eligible: boolean;
  verify_reasons: TrustVerifyReason[];
  /** The authored employer follow-up prompt for the competency, or null. */
  interview_prompt: TrustBilingual | null;
  trust_followup_codes: TrustFollowUp["focus"][];
  traceability: { available: boolean };
};

/** What the person SAID about their way of working. Never merged into a
 *  competency line, never counted as observed, never "shown". */
export type TrustSelfReportedPattern = {
  domain_key: string;
  domain_sv: string;
  domain_en: string;
  competency_code: string;
  evidence_type: "self_reported";
  pattern: "consistently_described" | "mostly_described" | "rarely_described" | "not_described";
  consistency: "consistent" | "varied";
  item_count: number;
  interpretation: "descriptive_only" | "methodologically_open";
  factual_explanation: TrustBilingual;
};

/** A TRUST follow-up: an authored, versioned interview question selected by
 *  the evidence at release, never generated and never scored. */
export type TrustFollowUp = {
  competency_code: string;
  area_sv: string;
  area_en: string;
  trust_question_version: string;
  focus:
    | "explore_limited_evidence"
    | "explore_self_report"
    | "explore_development"
    | "confirm_strength";
  evidence_type: "observed" | "self_reported";
  why: TrustBilingual;
  question: TrustBilingual;
  followup: TrustBilingual;
  listen_for: { sv: string[]; en: string[] };
  priority: TrustFollowUpPriority;
};

/** The TRUST Interview Plan: at most three areas, at most five questions,
 *  every question an authored guide entry. T-R-U-S-T: Target, Ready,
 *  Understand, Structure, Tell. The structure steps are never called STAR in
 *  user-facing copy. */
export type TrustPlanPriority = {
  order: number;
  competency_code: string;
  target: {
    competency_code: string;
    area_sv: string;
    area_en: string;
    focus: TrustFollowUp["focus"];
    evidence_type: "observed" | "self_reported";
  };
  ready: {
    existing_evidence: TrustBilingual;
    observed_item_count: number;
    observed_pattern: TrustObservedPattern;
    evidence_sufficiency: TrustEvidenceSufficiency;
    limitation: TrustCoreCompetency["limitation"];
  };
  understand: { question: TrustBilingual };
  structure: {
    steps: {
      key: "situation" | "own_role" | "action" | "result" | "reflection";
      sv: string;
      en: string;
    }[];
    followup: TrustBilingual | null;
  };
  tell: { listen_for: { sv: string[]; en: string[] }; document: TrustBilingual };
};

export type TrustPlan = {
  heading: TrustBilingual;
  subheading: TrustBilingual;
  priorities: TrustPlanPriority[];
  question_count: number;
  question_limit: 5;
  area_limit: 3;
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
  statement: TrustBilingual;
};

/** The human review record the report is released under. "Human reviewed"
 *  means exactly that the mandatory reviews for release were completed --
 *  `meaning` states it as a denial. Counts only: no rationale, no rubric
 *  level, no outcome, no severity, no reviewer. */
export type TrustHumanReview = {
  required: boolean;
  reviews_total: number;
  reviews_completed: number;
  completed: boolean;
  safety_findings_present: boolean; // a person found something; never a score
  free_text: { items: number; reviewed: number } | null;
  safety_critical: { items: number; reviewed: number } | null;
  meaning: TrustBilingual;
};

/** A compact overview line: the two dimensions, the priority and the frozen
 *  why-line. */
export type TrustOverviewLine = {
  competency_code: string;
  competency_name_sv: string;
  competency_name_en: string;
  observed_pattern: TrustObservedPattern;
  evidence_sufficiency: TrustEvidenceSufficiency;
  observed_item_count: number;
  follow_up_priority: TrustFollowUpPriority;
  safety_critical_follow_up: boolean;
  verify_reasons: TrustVerifyReason[];
  line: TrustBilingual;
};

/** Human-readable provenance: versions, template, rubric editions, and
 *  whether the report was released with a verified computation chain.
 *  Deliberately no manifest id and no hash. */
export type TrustProvenance = {
  report_id: string;
  released_at: string;
  calculated_at: string;
  scoring_model_version: string;
  threshold_version: string;
  signal_version: string;
  evidence_state_version: string;
  evidence_scope_version: string;
  brief_version: string;
  rubric_versions: number[];
  report_template: { report_key: string; version: number };
  computation_chain: "verified" | "legacy";
  evidence_basis_available: boolean;
  traceability_available: boolean;
};

/** The SHARED FROZEN CORE: audience-neutral by construction. A participant
 *  projection may later be built on it. It carries no process step, no
 *  priority, no safety detail, no interview material, no addendum, no
 *  author, no organisation, no attempt id and no subject id. */
export type TrustFrozenCore = {
  core_version: "trust-evidence-core/v1";
  assessment: {
    assessment_slug: string;
    assessment_name_sv: string;
    assessment_name_en: string;
    assessment_version: number;
    language: string;
    governance_mode: string;
    validation_status: string;
    content_status: string;
  };
  timestamps: {
    started_at: string | null;
    submitted_at: string | null;
    scored_at: string | null;
    released_at: string;
    calculated_at: string;
  };
  competencies: TrustCoreCompetency[];
  self_reported_patterns: TrustSelfReportedPattern[];
  coverage: {
    observed_items: number;
    self_report_items: number;
    /** The report-level count; a competency carries its own. */
    evidence_contexts: number;
    areas_sufficient: number;
    areas_limited: number;
    areas_none: number;
    composition: {
      scenario_items: number;
      self_description_items: number;
      free_text_items: number;
      free_text_reviewed: number;
      safety_critical_items: number;
      safety_critical_reviewed: number;
    } | null;
    modules: unknown[];
  };
  human_review: TrustHumanReview;
  limitations: { standing_statement: TrustBilingual; items: TrustLimitation[] };
  provenance: TrustProvenance;
};

/** The EMPLOYER PROJECTION: what only the commissioning organisation gets. */
export type TrustEmployerProjection = {
  context: {
    attempt_id: string;
    subject_id: string;
    participant_ref: string;
    person_context: "candidate" | "employee";
    organisation_name: string;
    purpose_code: string;
    standing_limitation: TrustBilingual;
    /** The audience contract's template lines: the one thing that follows
     *  the live template row, carried outside the frozen core. */
    template_limitations: { sv: string[]; en: string[] };
  };
  primary_next_step: {
    step: TrustProcessStep;
    reason_code:
      | "safety_follow_up"
      | "no_observed_evidence"
      | "thin_coverage"
      | "ready_for_interview";
    rule_version: "rds-v1";
    reason: TrustBilingual;
    interview_handoff: { attempt_id: string; focus_area_codes: string[] };
  };
  overview: {
    clearest_support: TrustOverviewLine[];
    verify_in_interview: TrustOverviewLine[];
    limited_evidence: TrustOverviewLine[];
  };
  safety_followup: {
    present: boolean;
    source: "human_review";
    findings: { finding: string; severity: string; observed_at: string }[];
    finding_count: number;
    areas_flagged_for_follow_up: string[];
    statement: TrustBilingual;
  };
  areas: TrustEmployerArea[];
  trust_followups: TrustFollowUp[];
  trust_plan: TrustPlan;
};

/** A post-interview addendum: what a person found in the interview, against
 *  one competency. A separate append-only record (scp_interview_notes)
 *  composed with the report; the released report is never rewritten.
 *  Attribution is the minimum display field: never a user id, never an
 *  e-mail. */
export type TrustInterviewAddendum = {
  id: string;
  competency_code: string;
  status: "supported_in_interview" | "not_supported_in_interview" | "additional_context";
  note: string | null;
  recorded_at: string;
  author_display_name: string;
};

/** The canonical Report V3 document, as scp_employer_report_v3 returns it. */
export type TrustEvidenceReportV3 = {
  schema_version: "trust-evidence-report/v3";
  report_id: string;
  frozen_report: {
    core: TrustFrozenCore;
    employer: TrustEmployerProjection;
  };
  addenda_overlay: {
    as_of: string;
    source: "interview_note";
    items: TrustInterviewAddendum[];
  };
};

/** The keys the R3A migration must write literally (guard H14). */
export const TRUST_V3_TOP_LEVEL_KEYS = [
  "schema_version",
  "report_id",
  "frozen_report",
  "addenda_overlay",
] as const;
export const TRUST_V3_CORE_KEYS = [
  "core_version",
  "assessment",
  "timestamps",
  "competencies",
  "self_reported_patterns",
  "coverage",
  "human_review",
  "limitations",
  "provenance",
] as const;
export const TRUST_V3_EMPLOYER_KEYS = [
  "context",
  "primary_next_step",
  "overview",
  "safety_followup",
  "areas",
  "trust_followups",
  "trust_plan",
] as const;
export const TRUST_V3_CORE_COMPETENCY_KEYS = [
  "competency_code",
  "competency_version",
  "competency_name_sv",
  "competency_name_en",
  "observed_pattern",
  "evidence_sufficiency",
  "evidence_state",
  "observed_item_count",
  "answered_item_count",
  "context_count",
  "source_types",
  "coverage_status",
  "review_status",
  "methodological_flags",
  "factual_explanation",
  "limitation",
  "evidence_basis",
  "behaviour",
  "self_description_domain_keys",
] as const;
export const TRUST_V3_EMPLOYER_AREA_KEYS = [
  "competency_code",
  "follow_up_priority",
  "safety_critical_follow_up",
  "clearest_support_eligible",
  "verify_reasons",
  "interview_prompt",
  "trust_followup_codes",
  "traceability",
] as const;

/** The employer-visible field allowlist: every key that may appear at any
 *  depth of the document. Locked here and in the database suite
 *  (scp_trust_evidence_report_r3a_contract_test.sql, ALLOWLIST block);
 *  guard H15 refuses if the two differ. Default is minimisation. */
export const TRUST_V3_EMPLOYER_KEY_ALLOWLIST = [
  "addenda_overlay",
  "answered",
  "answered_item_count",
  "area_en",
  "area_limit",
  "area_sv",
  "areas",
  "areas_flagged_for_follow_up",
  "areas_limited",
  "areas_none",
  "areas_sufficient",
  "as_of",
  "asks",
  "assessment",
  "assessment_name_en",
  "assessment_name_sv",
  "assessment_slug",
  "assessment_version",
  "attempt_id",
  "author_display_name",
  "available",
  "behaviour",
  "block_key",
  "brief_version",
  "calculated_at",
  "clearest_support",
  "clearest_support_eligible",
  "code",
  "competencies",
  "competency_code",
  "competency_name_en",
  "competency_name_sv",
  "competency_version",
  "completed",
  "composition",
  "computation_chain",
  "consistency",
  "content_status",
  "context",
  "context_count",
  "core",
  "core_version",
  "coverage",
  "coverage_status",
  "document",
  "domain_en",
  "domain_key",
  "domain_sv",
  "employer",
  "en",
  "evidence_basis",
  "evidence_basis_available",
  "evidence_contexts",
  "evidence_scope_version",
  "evidence_state",
  "evidence_state_version",
  "evidence_sufficiency",
  "evidence_type",
  "existing_evidence",
  "factual_explanation",
  "finding",
  "finding_count",
  "findings",
  "focus",
  "focus_area_codes",
  "follow_up_priority",
  "followup",
  "free_text",
  "free_text_items",
  "free_text_reviewed",
  "frozen_report",
  "governance_mode",
  "heading",
  "human_review",
  "id",
  "interpretation",
  "interview_handoff",
  "interview_prompt",
  "item_count",
  "items",
  "key",
  "language",
  "limitation",
  "limitations",
  "limited_evidence",
  "line",
  "listen_for",
  "meaning",
  "methodological_flags",
  "modules",
  "name_en",
  "name_sv",
  "note",
  "observed_at",
  "observed_item_count",
  "observed_items",
  "observed_pattern",
  "order",
  "organisation_name",
  "overview",
  "participant_ref",
  "pattern",
  "person_context",
  "present",
  "primary_next_step",
  "priorities",
  "priority",
  "provenance",
  "purpose_code",
  "question",
  "question_count",
  "question_limit",
  "ready",
  "reason",
  "reason_code",
  "recorded_at",
  "released_at",
  "report_id",
  "report_key",
  "report_template",
  "required",
  "review_status",
  "reviewed",
  "reviews_completed",
  "reviews_total",
  "rubric_versions",
  "rule_version",
  "safety_critical",
  "safety_critical_follow_up",
  "safety_critical_items",
  "safety_critical_reviewed",
  "safety_findings_present",
  "safety_followup",
  "scenario_items",
  "schema_version",
  "scored_at",
  "scoring_model_version",
  "self_description_domain_keys",
  "self_description_items",
  "self_report_items",
  "self_reported_patterns",
  "severity",
  "signal_version",
  "source",
  "source_types",
  "standing_limitation",
  "standing_statement",
  "started_at",
  "statement",
  "status",
  "step",
  "steps",
  "structure",
  "subheading",
  "subject_id",
  "submitted_at",
  "sv",
  "target",
  "tell",
  "template_limitations",
  "threshold_version",
  "timestamps",
  "traceability",
  "traceability_available",
  "trust_followup_codes",
  "trust_followups",
  "trust_plan",
  "trust_question_version",
  "understand",
  "validation_status",
  "verify_in_interview",
  "verify_reasons",
  "version",
  "why",
] as const;

/** Keys the shared core must never carry (guard H16): the participant
 *  boundary, stated as data. */
export const TRUST_CORE_FORBIDDEN_KEYS = [
  "attempt_id",
  "subject_id",
  "participant_ref",
  "organisation_name",
  "purpose_code",
  "primary_next_step",
  "step",
  "reason_code",
  "follow_up_priority",
  "safety_followup",
  "findings",
  "severity",
  "finding",
  "observed_at",
  "interview_prompt",
  "trust_followups",
  "trust_plan",
  "question",
  "listen_for",
  "addenda_overlay",
  "author_display_name",
  "note",
  "recorded_at",
  "clearest_support",
  "verify_in_interview",
  "limited_evidence",
  "interview_handoff",
  "template_limitations",
  "standing_limitation",
  "verify_reasons",
  "selected_option_key",
  "contribution",
  "reviewer_rationale",
  "email",
  "user_id",
  "manifest_id",
  "canonical_sha256",
] as const;

// ── The private computation manifest (PR-R1, 20261027090000) ─────────────
//
// scp_report_computation_manifests. One row per RELEASE (both audience
// snapshots point at the same row, because there is one calculation),
// immutable after insert, private: not readable by a participant, not readable
// by an employer, reachable only through server / internal paths. It is what
// makes a released report REPRODUCIBLE, which derivation_input (maturity level
// per competency, nothing per item) does not. PR-R3A reads it inside the
// definer function for COUNTS and VERSION IDENTITIES only (guard H11f).
//
// Shape as IMPLEMENTED: identity (manifest id, snapshot ids, attempt id) and
// time (calculated_at) are COLUMNS of the row; the hashed `body` holds the
// frozen inputs, versions and computation only, so the same frozen inputs
// under the same versions hash the same however often they are recomputed.
// The types below describe the body; TRUST_MANIFEST_BODY_KEYS lists the keys
// the migration must write literally (guard H11d).

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

const STEPS: TrustPlanPriority["structure"]["steps"] = [
  { key: "situation", sv: "Situation", en: "Situation" },
  { key: "own_role", sv: "Egen roll", en: "Own role" },
  { key: "action", sv: "Agerande", en: "Action" },
  { key: "result", sv: "Resultat", en: "Result" },
  { key: "reflection", sv: "Reflektion", en: "Reflection" },
];

const SCC08_LIMITATION = {
  code: "single_item",
  sv: "Det finns ett observerat svar, men underlaget räcker inte för att fastställa ett stabilt svarsmönster. Följ upp området i intervju.",
  en: "There is one observed answer, but the evidence is not enough to establish a stable response pattern. Follow up the area in interview.",
};
const SCC08_WHY = {
  sv: "Endast 1 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
  en: "Only 1 task(s) in this assessment touched this area — too few to say anything about it.",
};
const SCC08_QUESTION = {
  sv: "Vad behöver nästa pass alltid få veta av dig?",
  en: "What does the next shift always need to hear from you?",
};
const SCC08_LISTEN = {
  sv: ["Har en egen checklista i huvudet"],
  en: ["Has their own mental checklist"],
};

/** A worked example of the document, so the guard has data to walk and a
 *  reviewer has something concrete to object to. Drawn from the shape the
 *  R3A suite observes on the flagship form: SCC-08 on one observed item. */
export const TRUST_V3_EXAMPLE: TrustEvidenceReportV3 = {
  schema_version: "trust-evidence-report/v3",
  report_id: "00000000-0000-0000-0000-000000000000",
  frozen_report: {
    core: {
      core_version: "trust-evidence-core/v1",
      assessment: {
        assessment_slug: "security-officer-recruitment",
        assessment_name_sv: "Väktare – Recruitment Assessment",
        assessment_name_en: "Security Officer – Recruitment Assessment",
        assessment_version: 1,
        language: "sv",
        governance_mode: "closed_test",
        validation_status: "design",
        content_status: "draft",
      },
      timestamps: {
        started_at: "2026-09-04T08:00:00Z",
        submitted_at: "2026-09-04T08:40:00Z",
        scored_at: "2026-09-04T12:00:00Z",
        released_at: "2026-09-05T00:00:00Z",
        calculated_at: "2026-09-05T00:00:00Z",
      },
      competencies: [
        {
          competency_code: "SCC-08",
          competency_version: "1",
          competency_name_sv: "Samarbete och samordning",
          competency_name_en: "Teamwork & Collaboration",
          observed_pattern: "not_established",
          evidence_sufficiency: "limited",
          evidence_state: "observed_limited",
          observed_item_count: 1,
          answered_item_count: 1,
          context_count: 1,
          source_types: ["assessment_response"],
          coverage_status: "limited",
          review_status: "not_required",
          methodological_flags: [
            "single_item",
            "single_context",
            "unvalidated_content",
            "closed_test",
          ],
          factual_explanation: SCC08_WHY,
          limitation: SCC08_LIMITATION,
          evidence_basis: {
            scenario_items: 1,
            free_text_items: 0,
            free_text_reviewed: 0,
            self_description_items: 0,
            safety_critical_items: 0,
            safety_critical_reviewed: 0,
          },
          behaviour: {
            sv: "Samordnar egna åtgärder med kollegor och andra funktioner.",
            en: "Coordinates own actions with colleagues and other functions.",
          },
          self_description_domain_keys: [],
        },
      ],
      self_reported_patterns: [
        {
          domain_key: "aktiv-scanning",
          domain_sv: "Aktiv scanning",
          domain_en: "Active scanning",
          competency_code: "SCC-03",
          evidence_type: "self_reported",
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
      coverage: {
        observed_items: 26,
        self_report_items: 24,
        evidence_contexts: 1,
        areas_sufficient: 5,
        areas_limited: 3,
        areas_none: 0,
        composition: {
          scenario_items: 22,
          self_description_items: 24,
          free_text_items: 4,
          free_text_reviewed: 4,
          safety_critical_items: 3,
          safety_critical_reviewed: 3,
        },
        modules: [],
      },
      human_review: {
        required: true,
        reviews_total: 7,
        reviews_completed: 7,
        completed: true,
        safety_findings_present: false,
        free_text: { items: 4, reviewed: 4 },
        safety_critical: { items: 3, reviewed: 3 },
        meaning: {
          sv: "Mänskligt granskat betyder att de obligatoriska mänskliga granskningarna inför frisläppning är slutförda. Det betyder inte att svaren är godkända, validerade eller lämpliga, och det är inte ett omdöme från granskaren.",
          en: "Human-reviewed means that the mandatory human reviews required for release were completed. It does not mean the answers are approved or validated, it does not say the person is right for the role, and it is not an endorsement by the reviewer.",
        },
      },
      limitations: {
        standing_statement: {
          sv: "Detta visar hur kandidaten svarade i just dessa uppgifter. Det fastställer inte lämplighet eller framtida arbetsprestation. Beslutet är arbetsgivarens.",
          en: "This shows how the candidate answered these specific tasks. It does not settle whether the person is right for the role, nor future work performance. The decision is the employer's.",
        },
        items: [
          {
            code: "one_assessment_occasion",
            statement: {
              sv: "Underlaget kommer från ett bedömningstillfälle.",
              en: "The evidence comes from one assessment occasion.",
            },
          },
        ],
      },
      provenance: {
        report_id: "00000000-0000-0000-0000-000000000000",
        released_at: "2026-09-05T00:00:00Z",
        calculated_at: "2026-09-05T00:00:00Z",
        scoring_model_version: "det-v1",
        threshold_version: "v1",
        signal_version: "ras-v1",
        evidence_state_version: "des-v2",
        evidence_scope_version: "attempt-v1",
        brief_version: "rab-v1",
        rubric_versions: [1],
        report_template: { report_key: "closed-test-employer", version: 1 },
        computation_chain: "verified",
        evidence_basis_available: true,
        traceability_available: true,
      },
    },
    employer: {
      context: {
        attempt_id: "00000000-0000-0000-0000-000000000010",
        subject_id: "00000000-0000-0000-0000-000000000020",
        participant_ref: "4C42C8",
        person_context: "candidate",
        organisation_name: "Exempel Bevakning AB",
        purpose_code: "closed_test_recruitment",
        standing_limitation: {
          sv: "Underlag för fortsatt mänsklig bedömning -- inte ett anställningsbeslut.",
          en: "Evidence for continued human judgement -- not an employment decision.",
        },
        template_limitations: { sv: [], en: [] },
      },
      primary_next_step: {
        step: "structured_interview",
        reason_code: "ready_for_interview",
        rule_version: "rds-v1",
        reason: {
          sv: "Underlaget räcker för att förbereda ett strukturerat samtal.",
          en: "There is enough here to prepare a structured conversation.",
        },
        interview_handoff: {
          attempt_id: "00000000-0000-0000-0000-000000000010",
          focus_area_codes: ["SCC-08"],
        },
      },
      overview: {
        clearest_support: [],
        verify_in_interview: [
          {
            competency_code: "SCC-08",
            competency_name_sv: "Samarbete och samordning",
            competency_name_en: "Teamwork & Collaboration",
            observed_pattern: "not_established",
            evidence_sufficiency: "limited",
            observed_item_count: 1,
            follow_up_priority: "next",
            safety_critical_follow_up: false,
            verify_reasons: ["limited_evidence"],
            line: SCC08_WHY,
          },
        ],
        limited_evidence: [
          {
            competency_code: "SCC-08",
            competency_name_sv: "Samarbete och samordning",
            competency_name_en: "Teamwork & Collaboration",
            observed_pattern: "not_established",
            evidence_sufficiency: "limited",
            observed_item_count: 1,
            follow_up_priority: "next",
            safety_critical_follow_up: false,
            verify_reasons: ["limited_evidence"],
            line: SCC08_WHY,
          },
        ],
      },
      safety_followup: {
        present: false,
        source: "human_review",
        findings: [],
        finding_count: 0,
        areas_flagged_for_follow_up: [],
        statement: {
          sv: "Ett säkerhetskritiskt svar har granskats av en person och behöver följas upp i samtal.",
          en: "A safety-critical answer has been reviewed by a person and needs to be followed up in conversation.",
        },
      },
      areas: [
        {
          competency_code: "SCC-08",
          follow_up_priority: "next",
          safety_critical_follow_up: false,
          clearest_support_eligible: false,
          verify_reasons: ["limited_evidence"],
          interview_prompt: {
            sv: "Be personen beskriva en överlämning som gick fel. Vad saknades, och vad gör hen annorlunda nu?",
            en: "Ask the person about a handover that went wrong. What was missing, and what do they do differently now?",
          },
          trust_followup_codes: ["explore_limited_evidence"],
          traceability: { available: true },
        },
      ],
      trust_followups: [
        {
          competency_code: "SCC-08",
          area_sv: "Samarbete och samordning",
          area_en: "Teamwork & Collaboration",
          trust_question_version: "igp-v1",
          focus: "explore_limited_evidence",
          evidence_type: "observed",
          why: SCC08_WHY,
          question: SCC08_QUESTION,
          followup: {
            sv: "Berätta om en gång då det inte nådde fram.",
            en: "Tell me about a time it did not get through.",
          },
          listen_for: SCC08_LISTEN,
          priority: "next",
        },
      ],
      trust_plan: {
        heading: { sv: "TRUST Interview Plan", en: "TRUST Interview Plan" },
        subheading: {
          sv: "Från evidens till en bättre intervju.",
          en: "From evidence to a better interview.",
        },
        priorities: [
          {
            order: 1,
            competency_code: "SCC-08",
            target: {
              competency_code: "SCC-08",
              area_sv: "Samarbete och samordning",
              area_en: "Teamwork & Collaboration",
              focus: "explore_limited_evidence",
              evidence_type: "observed",
            },
            ready: {
              existing_evidence: SCC08_WHY,
              observed_item_count: 1,
              observed_pattern: "not_established",
              evidence_sufficiency: "limited",
              limitation: SCC08_LIMITATION,
            },
            understand: { question: SCC08_QUESTION },
            structure: {
              steps: STEPS,
              followup: {
                sv: "Berätta om en gång då det inte nådde fram.",
                en: "Tell me about a time it did not get through.",
              },
            },
            tell: {
              listen_for: SCC08_LISTEN,
              document: {
                sv: "Dokumentera det konkreta exemplet, personens egen roll, vad hen gjorde och vad det ledde till.",
                en: "Document the concrete example, the person's own role, what they did and what it led to.",
              },
            },
          },
        ],
        question_count: 2,
        question_limit: 5,
        area_limit: 3,
      },
    },
  },
  addenda_overlay: {
    as_of: "2026-09-05T09:00:00Z",
    source: "interview_note",
    items: [],
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

/** The keys the PR-R1 migration writes into the hashed body (top level and
 *  inside `versions` / `computation`), listed as data so the guard can assert
 *  the migration still names every one of them. */
export const TRUST_MANIFEST_BODY_KEYS = [
  // top level
  "schema_version",
  "attempt",
  "versions",
  "prompts",
  "coverage",
  "computation",
  // versions
  "calculation_schema_version",
  "scoring_model_version",
  "signal_model_version",
  "threshold_version",
  "evidence_state_version",
  "evidence_scope_version",
  "brief_version",
  "competency_mapping_version",
  "rubric_versions",
  "trust_question_version",
  "report_template_version",
  // computation
  "classification_rule",
  "thresholds",
  "source_types",
  "competency_mapping",
  "evidence",
  "reviews",
  "areas",
  "self_report_areas",
  // evidence row
  "item_version_id",
  "option_key_version",
  "rubric_version_id",
  "contribution",
  "confidence",
  "classification",
  "included",
  "exclusion_reason",
  // area
  "item_count",
  "weighted_sum",
  "denominator",
  "spread",
  "final_area_signal",
  "maturity_level",
  "evidence_state",
] as const;

// CQrityjob TRUST Evidence Report — the employer document, as the client reads it.
//
// "Från evidens till en bättre intervju."
//
// These are the client-side types for the jsonb that
// public.scp_employer_report_v3(attempt_id) returns (PR-R3A, 20261029090000).
// The database contract is the source of truth; the typed fixture that the
// guards walk lives in scripts/fixtures (nothing in src/ imports it, by
// rule). What is stated here is what the UI relies on, no more.
//
// Three dimensions, kept apart:
//   observed_pattern      what the observed responses look like
//   evidence_sufficiency  how much observed evidence exists
//   follow_up_priority    what the recruiter should do (employer only)
//
// frozen_report is immutable; template_overlay and addenda_overlay are live.
// Every number on a competency is a count. There is no score, no total, no
// rank, no verdict anywhere in this document, and the UI renders none.

export type Bilingual = { sv: string; en: string };

export type ObservedPattern =
  | "clearly_consistent"
  | "consistent"
  | "mixed"
  | "developing"
  | "not_established";

export type EvidenceSufficiency = "sufficient" | "limited" | "none";

export type FollowUpPriority = "first" | "next" | "if_time_allows" | "none";

export type EvidenceState =
  | "observed_consistent"
  | "observed_mixed"
  | "observed_follow_up"
  | "observed_limited"
  | "self_reported_only"
  | "not_covered"
  | "human_review_pending";

export type ReviewStatus = "not_required" | "pending" | "completed";

export type SourceType =
  | "assessment_response"
  | "self_report"
  | "human_reviewed_free_text"
  | "interview_addendum";

export type MethodologicalFlag =
  | "single_context"
  | "single_item"
  | "self_report_not_observed"
  | "descriptive_only"
  | "methodologically_open"
  | "unvalidated_content"
  | "closed_test";

export type VerifyReason =
  | "safety_finding"
  | "developing_pattern"
  | "mixed_pattern"
  | "limited_evidence"
  | "pending_review"
  | "human_review_adjusted";

export type ProcessStep =
  | "structured_interview"
  | "additional_assessment"
  | "request_clarification"
  | "gather_more_evidence";

export type GuideFocus =
  | "explore_limited_evidence"
  | "explore_self_report"
  | "explore_development"
  | "confirm_strength";

export type CoreCompetency = {
  competency_code: string;
  competency_version: string;
  competency_name_sv: string;
  competency_name_en: string;
  observed_pattern: ObservedPattern;
  evidence_sufficiency: EvidenceSufficiency;
  evidence_state: EvidenceState;
  observed_item_count: number;
  answered_item_count: number | null;
  context_count: number | null;
  source_types: SourceType[];
  review_status: ReviewStatus | null;
  methodological_flags: MethodologicalFlag[];
  factual_explanation: Bilingual;
  limitation: { code: string; sv: string; en: string } | null;
  evidence_basis: {
    scenario_items: number;
    free_text_items: number;
    free_text_reviewed: number;
    self_description_items: number;
  } | null;
  behaviour: Bilingual;
  self_description_domain_keys: string[];
};

export type SelfReportedPattern = {
  domain_key: string;
  domain_sv: string;
  domain_en: string;
  competency_code: string;
  evidence_type: "self_reported";
  pattern: "consistently_described" | "mostly_described" | "rarely_described" | "not_described";
  consistency: "consistent" | "varied";
  item_count: number;
  interpretation: "descriptive_only" | "methodologically_open";
  factual_explanation: Bilingual;
};

export type Limitation = {
  code: string;
  statement: Bilingual;
};

export type FrozenCore = {
  core_version: string;
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
  competencies: CoreCompetency[];
  self_reported_patterns: SelfReportedPattern[];
  coverage: {
    observed_items: number;
    self_report_items: number;
    evidence_contexts: number;
    areas_sufficient: number;
    areas_limited: number;
    areas_none: number;
    composition: {
      scenario_items: number;
      self_description_items: number;
      free_text_items: number;
      free_text_reviewed: number;
    } | null;
    modules: {
      block_key: string;
      name_sv: string;
      name_en: string;
      asks: string;
      items: number;
      answered: number;
    }[];
  };
  human_review: {
    required: boolean;
    reviews_total: number;
    reviews_completed: number;
    completed: boolean;
    free_text: { items: number; reviewed: number } | null;
    meaning: Bilingual;
  };
  definitions: {
    evidence_sufficiency: {
      rule_version: string;
      minimum_observed_items: number;
      sv: string;
      en: string;
    };
  };
  limitations: { standing_statement: Bilingual; items: Limitation[] };
  provenance: {
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
};

export type EmployerArea = {
  competency_code: string;
  follow_up_priority: FollowUpPriority;
  safety_critical_follow_up: boolean;
  clearest_support_eligible: boolean;
  verify_reasons: VerifyReason[];
  safety_critical: { items: number; reviewed: number } | null;
  interview_prompt: Bilingual | null;
  trust_followup_codes: GuideFocus[];
  traceability: { available: boolean };
};

export type OverviewLine = {
  competency_code: string;
  competency_name_sv: string;
  competency_name_en: string;
  observed_pattern: ObservedPattern;
  evidence_sufficiency: EvidenceSufficiency;
  observed_item_count: number;
  follow_up_priority: FollowUpPriority;
  safety_critical_follow_up: boolean;
  verify_reasons: VerifyReason[];
  line: Bilingual;
};

export type TrustFollowUp = {
  competency_code: string;
  area_sv: string;
  area_en: string;
  trust_question_version: string;
  focus: GuideFocus;
  evidence_type: "observed" | "self_reported";
  why: Bilingual;
  question: Bilingual;
  followup: Bilingual;
  listen_for: { sv: string[]; en: string[] };
  priority: FollowUpPriority;
};

export type PlanPriority = {
  order: number;
  competency_code: string;
  target: {
    competency_code: string;
    area_sv: string;
    area_en: string;
    focus: GuideFocus;
    evidence_type: "observed" | "self_reported";
  };
  ready: {
    existing_evidence: Bilingual;
    observed_item_count: number;
    observed_pattern: ObservedPattern;
    evidence_sufficiency: EvidenceSufficiency;
    limitation: { code: string; sv: string; en: string } | null;
  };
  understand: { question: Bilingual };
  structure: { steps: { key: string; sv: string; en: string }[]; followup: Bilingual | null };
  tell: { listen_for: { sv: string[]; en: string[] }; document: Bilingual };
};

export type EmployerProjection = {
  context: {
    attempt_id: string;
    subject_id: string;
    participant_ref: string;
    person_context: "candidate" | "employee";
    organisation_name: string;
    purpose_code: string;
    standing_limitation: Bilingual;
  };
  primary_next_step: {
    step: ProcessStep;
    reason_code:
      | "safety_follow_up"
      | "no_observed_evidence"
      | "thin_coverage"
      | "ready_for_interview";
    rule_version: string;
    reason: Bilingual;
    interview_handoff: { attempt_id: string; focus_area_codes: string[] };
  };
  overview: {
    clearest_support: OverviewLine[];
    verify_in_interview: OverviewLine[];
    limited_evidence: OverviewLine[];
  };
  safety_followup: {
    present: boolean;
    source: "human_review";
    findings: { finding: string; severity: string; observed_at: string }[];
    finding_count: number;
    areas_flagged_for_follow_up: string[];
    safety_critical: { items: number; reviewed: number } | null;
    statement: Bilingual;
  };
  areas: EmployerArea[];
  trust_followups: TrustFollowUp[];
  trust_plan: {
    heading: Bilingual;
    subheading: Bilingual;
    priorities: PlanPriority[];
    question_count: number;
    question_limit: number;
    area_limit: number;
  };
};

export type InterviewAddendum = {
  id: string;
  competency_code: string;
  status: "supported_in_interview" | "not_supported_in_interview" | "additional_context";
  note: string | null;
  recorded_at: string;
  author_display_name: string;
};

/** The employer document. `frozen_report` never changes after release; the
 *  two overlays are live and say so with their own `as_of`. */
export type TrustReportDocument = {
  schema_version: "trust-evidence-report/v3";
  report_id: string;
  frozen_report: { core: FrozenCore; employer: EmployerProjection };
  template_overlay: {
    as_of: string;
    source: "scp_report_versions";
    report_template: { report_key: string; version: number };
    limitations: { sv: string[]; en: string[] };
  };
  addenda_overlay: { as_of: string; source: "interview_note"; items: InterviewAddendum[] };
};

/** The minimum structural check the client performs before rendering: the
 *  schema version and the four top-level blocks. Anything else missing is a
 *  legacy-safe null the UI renders as an explicit empty state. */
export function isTrustReportDocument(value: unknown): value is TrustReportDocument {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.schema_version !== "trust-evidence-report/v3") return false;
  const fr = v.frozen_report as Record<string, unknown> | undefined;
  return (
    !!fr &&
    typeof fr === "object" &&
    !!fr.core &&
    !!fr.employer &&
    !!v.template_overlay &&
    !!v.addenda_overlay &&
    typeof v.report_id === "string"
  );
}

/** LEGACY COMPATIBILITY -- not the generation path.
 *
 *  The database now writes grammatical Swedish and English: since
 *  20261030090000 scp_release_attempt_report agrees the noun with the number
 *  in every observed-line sentence, and the database suite proves a report
 *  released from here can contain no placeholder at all.
 *
 *  Reports released BEFORE that migration are frozen documents that still
 *  say "Endast 1 uppgift(er) ..." / "Only 1 task(s) ...", because the SQL
 *  that wrote them built one sentence for both counts. A frozen document is
 *  never rewritten -- that is the whole point of freezing it -- so the reader
 *  is shown the same statement with the number and the noun in agreement.
 *
 *  Deliberately narrow. It repairs ONE shape, a number followed by a word
 *  with a short bracketed suffix, and nothing else: no other prose in a
 *  frozen report is touched, no count, claim or qualifier is altered, and
 *  text the current generator produces passes through unchanged.
 *
 *  "2 uppgift(er)" -> "2 uppgifter"; "1 task(s)" -> "1 task". */
export function repairPlurals(text: string): string {
  return text.replace(
    /(\d+)(\s+)([A-Za-zÀ-ÿ]+)\(([A-Za-zÀ-ÿ]{1,3})\)/g,
    (_m, n: string, gap: string, base: string, suffix: string) =>
      `${n}${gap}${Number(n) === 1 ? base : base + suffix}`,
  );
}

/** Pick the language of a bilingual pair, as the reader should see it. */
export const pick = (t: Bilingual | null | undefined, lang: "sv" | "en"): string =>
  t ? repairPlurals(lang === "en" ? t.en : t.sv) : "";

/** The same repair for a limitation, which is a flat {code, sv, en} row. */
export const pickLimitation = (
  t: { code: string; sv: string; en: string } | null | undefined,
  lang: "sv" | "en",
): string => (t ? repairPlurals(lang === "en" ? t.en : t.sv) : "");

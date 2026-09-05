// CQrityjob TRUST Evidence Report — the versioned contracts, as DATA.
//
// "Från evidens till en bättre intervju."
//
// This file is the versioned technical contract for two things:
//
//   1. the canonical Report V3 shape (employer audience document), which
//      PR-R3A (20261028090000) now produces server-side as
//      scp_employer_report_v3(attempt_id), and
//   2. the private, immutable computation manifest behind it (PR-R1,
//      20261027090000).
//
// It is a TypeScript fixture rather than prose so that the shape is type-
// checked (tsconfig.scripts.json), so that the forbidden-claim guard can walk
// it as data, and so that the migration can be held to it: guard H14 asserts
// the R3A migration names every top-level key and every area key below.
// Nothing in src/ imports it (guard H12): the UI (PR-R3B) reads the document
// from the database, and this file states what that document is.
//
// The chain it describes is the EXISTING one, unchanged:
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
// build if any such key enters this contract, and the migration's own
// apply-time proof fails if any such word enters the projection.

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
  | "observed_follow_up" // observed tasks consistently took the less well-judged option: a person should ask
  | "observed_limited" // too few observed tasks to say anything (SCC-08 on one item)
  | "self_reported_only" // the person described it; nothing observed it
  | "not_covered" // the instrument did not touch the area
  | "human_review_pending"; // a person still has to read something here

/** The response-pattern label a card shows: one word for THIS assessment's
 *  answers (the frozen ras-v1 signal), never a trait. sv / en copy lives in
 *  the UI dictionary under these keys. */
export type TrustResponsePattern =
  | "clearly_consistent" // Tydligt sammanhållet svarsmönster
  | "consistent" // Sammanhållet svarsmönster
  | "mixed" // Blandat svarsmönster
  | "follow_up" // Behöver följas upp
  | "limited" // Begränsat underlag
  | "none"; // Inget observerat underlag

export type TrustCoverageStatus = "covered" | "partially_covered" | "limited" | "not_covered";

export type TrustReviewStatus =
  | "not_required"
  | "pending"
  | "completed_upheld"
  | "completed_disputed"; // adjusted/overturned: no numeric contribution was written

/** Source types are the registry codes of scp_evidence_source_types, plus the
 *  free-text channel once a person has read it and let it stand. Only the
 *  counting ones may ever appear under an observed state. */
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

export type TrustFollowUpPriority = "first" | "next" | "if_time_allows" | "none";

export type TrustBilingual = { sv: string; en: string };

/** One competency area, as the report states it. Every field is a fact about
 *  the evidence; the only numbers are counts. */
export type TrustEvidenceArea = {
  competency_code: string;
  competency_version: string;
  competency_name_sv: string;
  competency_name_en: string;
  response_pattern: TrustResponsePattern;
  evidence_state: TrustEvidenceState;
  observed_item_count: number;
  planned_item_count: number;
  answered_item_count: number;
  context_count: number;
  source_types: TrustSourceType[];
  coverage_status: TrustCoverageStatus;
  review_status: TrustReviewStatus;
  methodological_flags: TrustMethodologicalFlag[];
  factual_explanation: TrustBilingual;
  follow_up_priority: TrustFollowUpPriority;
  safety_critical_follow_up: boolean;
  /** The one limitation the card states, or null. */
  limitation: { code: string; sv: string; en: string } | null;
  /** What the evidence is built on: item and review COUNTS per channel. */
  evidence_basis: {
    scenario_items: number;
    scenario_answered: number;
    free_text_items: number;
    free_text_answered: number;
    free_text_reviewed: number;
    self_description_items: number;
    self_description_answered: number;
    safety_critical_items: number;
    safety_critical_reviewed: number;
    reviews_completed: number;
    reviews_disputed: number;
  };
  behaviour: TrustBilingual;
  /** The candidate's own descriptions live in self_reported_patterns; a card
   *  only names which domains belong to it. */
  self_description_domain_keys: string[];
  /** The authored employer follow-up prompt for the competency, or null. */
  interview_prompt: TrustBilingual | null;
  trust_followup_codes: TrustFollowUp["focus"][];
  traceability: { available: boolean };
};

/** What the person SAID about their way of working. Never merged into an
 *  area, never counted, never "shown". */
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
 *  the evidence state at release, never generated and never scored. */
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
    response_pattern: TrustResponsePattern;
    limitation: TrustEvidenceArea["limitation"];
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

/** The human review record the report is released under. Counts and states
 *  only: no reviewer rationale, no rubric level, no severity. Who released
 *  lives in the private manifest and is not an audience fact. */
export type TrustHumanReview = {
  reviews_total: number;
  reviews_completed: number;
  reviews_pending: number;
  disputed_readings: number;
  safety_findings_present: boolean; // a person found something; never a score
  free_text: { items: number; answered: number; reviewed: number };
  safety_critical: { items: number; reviewed: number };
  complete: boolean;
  released_at: string;
};

/** A compact overview line: the card's label, count and frozen why-line. */
export type TrustOverviewLine = {
  competency_code: string;
  competency_name_sv: string;
  competency_name_en: string;
  response_pattern: TrustResponsePattern;
  observed_item_count: number;
  line: TrustBilingual;
};

/** A post-interview addendum: what a person found in the interview, against
 *  one area. A separate append-only record (scp_interview_notes) composed
 *  with the report; the released report is never rewritten. */
export type TrustInterviewAddendum = {
  id: string;
  competency_code: string;
  status: "supported_in_interview" | "not_supported_in_interview" | "additional_context";
  note: string | null;
  source: "interview_note";
  recorded_at: string;
  author: { user_id: string; email: string | null };
};

/** The canonical Report V3 shape, as scp_employer_report_v3 returns it.
 *  `context` and `coverage` carry the frozen Part A of the snapshot forward;
 *  every conclusion is the frozen document's; the form composition, answer
 *  counts and review states are structural facts from immutable rows. */
export type TrustEvidenceReportV3 = {
  schema_version: "trust-evidence-report/v3";
  report_id: string;
  attempt_id: string;
  subject_id: string;
  released_at: string;
  audience: "employer";
  context: {
    participant_ref: string;
    person_context: "candidate" | "employee";
    organisation_name: string;
    purpose_code: string;
    assessment_slug: string;
    assessment_name_sv: string;
    assessment_name_en: string;
    assessment_version: number;
    language: string;
    governance_mode: string;
    validation_status: string;
    content_status: string;
    started_at: string | null;
    submitted_at: string | null;
    scored_at: string | null;
    human_reviewed_badge: boolean;
    standing_limitation: TrustBilingual;
  };
  primary_next_step: {
    step: TrustProcessStep;
    reason_code:
      | "safety_follow_up"
      | "no_observed_evidence"
      | "thin_coverage"
      | "ready_for_interview";
    reason: TrustBilingual;
    interview_handoff: { attempt_id: string; focus_area_codes: string[] };
  };
  overview: {
    clearest_support: TrustOverviewLine[];
    verify_in_interview: (TrustOverviewLine & { safety_critical_follow_up: boolean })[];
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
  coverage: {
    observed_items: number;
    self_report_items: number;
    evidence_contexts: number;
    areas_covered: number;
    areas_limited: number;
    areas_not_covered: number;
    composition: {
      scenario_items: number;
      scenario_answered: number;
      self_description_items: number;
      self_description_answered: number;
      free_text_items: number;
      free_text_answered: number;
      free_text_reviewed: number;
      safety_critical_items: number;
      safety_critical_reviewed: number;
    };
    modules: unknown[];
  };
  areas: TrustEvidenceArea[];
  self_reported_patterns: TrustSelfReportedPattern[];
  trust_followups: TrustFollowUp[];
  trust_plan: TrustPlan;
  limitations: {
    standing_statement: TrustBilingual;
    items: TrustLimitation[];
    template: { sv: string[]; en: string[] };
  };
  human_review: TrustHumanReview;
  /** Human-readable provenance: versions, template, rubric edition, and
   *  whether the report was released with a verified computation chain.
   *  Deliberately no manifest id and no hash: the private manifest is
   *  referenced as a fact, never by identity. */
  provenance_summary: {
    report_id: string;
    released_at: string;
    calculated_at: string;
    assessment_slug: string;
    assessment_version: number;
    scoring_model_version: string;
    threshold_version: string;
    signal_version: string;
    evidence_state_version: string;
    evidence_scope_version: string;
    brief_version: string;
    rubric_versions: number[];
    report_template: { report_key: string; version: number };
    computation_chain: "verified" | "legacy";
    traceability_available: boolean;
  };
  interview_addenda: TrustInterviewAddendum[];
};

/** The top-level keys the R3A migration must write literally (guard H14). */
export const TRUST_V3_TOP_LEVEL_KEYS = [
  "schema_version",
  "report_id",
  "attempt_id",
  "subject_id",
  "released_at",
  "audience",
  "context",
  "primary_next_step",
  "overview",
  "safety_followup",
  "coverage",
  "areas",
  "self_reported_patterns",
  "trust_followups",
  "trust_plan",
  "limitations",
  "human_review",
  "provenance_summary",
  "interview_addenda",
] as const;

/** The area keys the R3A migration must write literally (guard H14). */
export const TRUST_V3_AREA_KEYS = [
  "competency_code",
  "competency_version",
  "response_pattern",
  "evidence_state",
  "observed_item_count",
  "planned_item_count",
  "answered_item_count",
  "context_count",
  "source_types",
  "coverage_status",
  "review_status",
  "methodological_flags",
  "factual_explanation",
  "follow_up_priority",
  "safety_critical_follow_up",
  "limitation",
  "evidence_basis",
  "behaviour",
  "self_description_domain_keys",
  "interview_prompt",
  "trust_followup_codes",
  "traceability",
] as const;

// ── The private computation manifest (PR-R1, 20261027090000) ─────────────
//
// scp_report_computation_manifests. One row per RELEASE (both audience
// snapshots point at the same row, because there is one calculation),
// immutable after insert, private: not readable by a participant, not readable
// by an employer, reachable only through server / internal paths. It is what
// makes a released report REPRODUCIBLE, which derivation_input (maturity level
// per competency, nothing per item) does not.
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

/** A worked example of the audience document, so the guard has data to walk
 *  and a reviewer has something concrete to object to. Drawn from the shape
 *  the R3A suite observes on the flagship form: SCC-08 on one observed item. */
export const TRUST_V3_EXAMPLE: TrustEvidenceReportV3 = {
  schema_version: "trust-evidence-report/v3",
  report_id: "00000000-0000-0000-0000-000000000000",
  attempt_id: "00000000-0000-0000-0000-000000000010",
  subject_id: "00000000-0000-0000-0000-000000000020",
  released_at: "2026-09-05T00:00:00Z",
  audience: "employer",
  context: {
    participant_ref: "4C42C8",
    person_context: "candidate",
    organisation_name: "Exempel Bevakning AB",
    purpose_code: "closed_test_recruitment",
    assessment_slug: "security-officer-recruitment",
    assessment_name_sv: "Väktare – Recruitment Assessment",
    assessment_name_en: "Security Officer – Recruitment Assessment",
    assessment_version: 1,
    language: "sv",
    governance_mode: "closed_test",
    validation_status: "design",
    content_status: "draft",
    started_at: "2026-09-04T08:00:00Z",
    submitted_at: "2026-09-04T08:40:00Z",
    scored_at: "2026-09-04T12:00:00Z",
    human_reviewed_badge: true,
    standing_limitation: {
      sv: "Underlag för fortsatt mänsklig bedömning -- inte ett anställningsbeslut.",
      en: "Evidence for continued human judgement -- not an employment decision.",
    },
  },
  primary_next_step: {
    step: "structured_interview",
    reason_code: "ready_for_interview",
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
    verify_in_interview: [],
    limited_evidence: [
      {
        competency_code: "SCC-08",
        competency_name_sv: "Samarbete och samordning",
        competency_name_en: "Teamwork & Collaboration",
        response_pattern: "limited",
        observed_item_count: 1,
        line: {
          sv: "Endast 1 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
          en: "Only 1 task(s) in this assessment touched this area — too few to say anything about it.",
        },
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
  coverage: {
    observed_items: 26,
    self_report_items: 24,
    evidence_contexts: 1,
    areas_covered: 5,
    areas_limited: 3,
    areas_not_covered: 0,
    composition: {
      scenario_items: 22,
      scenario_answered: 22,
      self_description_items: 24,
      self_description_answered: 24,
      free_text_items: 4,
      free_text_answered: 4,
      free_text_reviewed: 4,
      safety_critical_items: 3,
      safety_critical_reviewed: 3,
    },
    modules: [],
  },
  areas: [
    {
      competency_code: "SCC-08",
      competency_version: "1",
      competency_name_sv: "Samarbete och samordning",
      competency_name_en: "Teamwork & Collaboration",
      response_pattern: "limited",
      evidence_state: "observed_limited",
      observed_item_count: 1,
      planned_item_count: 1,
      answered_item_count: 1,
      context_count: 1,
      source_types: ["assessment_response"],
      coverage_status: "limited",
      review_status: "not_required",
      methodological_flags: ["single_item", "single_context", "unvalidated_content", "closed_test"],
      factual_explanation: {
        sv: "Endast 1 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
        en: "Only 1 task(s) in this assessment touched this area — too few to say anything about it.",
      },
      follow_up_priority: "next",
      safety_critical_follow_up: false,
      limitation: {
        code: "single_item",
        sv: "Endast en uppgift i den här bedömningen berörde området. Det räcker inte för en slutsats -- följ upp i intervju.",
        en: "Only one task in this assessment touched this area. That is not enough for a conclusion -- follow up in interview.",
      },
      evidence_basis: {
        scenario_items: 1,
        scenario_answered: 1,
        free_text_items: 0,
        free_text_answered: 0,
        free_text_reviewed: 0,
        self_description_items: 0,
        self_description_answered: 0,
        safety_critical_items: 0,
        safety_critical_reviewed: 0,
        reviews_completed: 0,
        reviews_disputed: 0,
      },
      behaviour: {
        sv: "Samordnar egna åtgärder med kollegor och andra funktioner.",
        en: "Coordinates own actions with colleagues and other functions.",
      },
      self_description_domain_keys: [],
      interview_prompt: {
        sv: "Be personen beskriva en överlämning som gick fel. Vad saknades, och vad gör hen annorlunda nu?",
        en: "Ask the person about a handover that went wrong. What was missing, and what do they do differently now?",
      },
      trust_followup_codes: ["explore_limited_evidence"],
      traceability: { available: true },
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
  trust_followups: [
    {
      competency_code: "SCC-08",
      area_sv: "Samarbete och samordning",
      area_en: "Teamwork & Collaboration",
      trust_question_version: "igp-v1",
      focus: "explore_limited_evidence",
      evidence_type: "observed",
      why: {
        sv: "Endast 1 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
        en: "Only 1 task(s) in this assessment touched this area — too few to say anything about it.",
      },
      question: {
        sv: "Vad behöver nästa pass alltid få veta av dig?",
        en: "What does the next shift always need to hear from you?",
      },
      followup: {
        sv: "Berätta om en gång då det inte nådde fram.",
        en: "Tell me about a time it did not get through.",
      },
      listen_for: {
        sv: ["Har en egen checklista i huvudet"],
        en: ["Has their own mental checklist"],
      },
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
          existing_evidence: {
            sv: "Endast 1 uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.",
            en: "Only 1 task(s) in this assessment touched this area — too few to say anything about it.",
          },
          observed_item_count: 1,
          response_pattern: "limited",
          limitation: {
            code: "single_item",
            sv: "Endast en uppgift i den här bedömningen berörde området. Det räcker inte för en slutsats -- följ upp i intervju.",
            en: "Only one task in this assessment touched this area. That is not enough for a conclusion -- follow up in interview.",
          },
        },
        understand: {
          question: {
            sv: "Vad behöver nästa pass alltid få veta av dig?",
            en: "What does the next shift always need to hear from you?",
          },
        },
        structure: {
          steps: STEPS,
          followup: {
            sv: "Berätta om en gång då det inte nådde fram.",
            en: "Tell me about a time it did not get through.",
          },
        },
        tell: {
          listen_for: {
            sv: ["Har en egen checklista i huvudet"],
            en: ["Has their own mental checklist"],
          },
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
    template: { sv: [], en: [] },
  },
  human_review: {
    reviews_total: 7,
    reviews_completed: 7,
    reviews_pending: 0,
    disputed_readings: 0,
    safety_findings_present: false,
    free_text: { items: 4, answered: 4, reviewed: 4 },
    safety_critical: { items: 3, reviewed: 3 },
    complete: true,
    released_at: "2026-09-05T00:00:00Z",
  },
  provenance_summary: {
    report_id: "00000000-0000-0000-0000-000000000000",
    released_at: "2026-09-05T00:00:00Z",
    calculated_at: "2026-09-05T00:00:00Z",
    assessment_slug: "security-officer-recruitment",
    assessment_version: 1,
    scoring_model_version: "det-v1",
    threshold_version: "v1",
    signal_version: "ras-v1",
    evidence_state_version: "des-v2",
    evidence_scope_version: "attempt-v1",
    brief_version: "rab-v1",
    rubric_versions: [1],
    report_template: { report_key: "closed-test-employer", version: 1 },
    computation_chain: "verified",
    traceability_available: true,
  },
  interview_addenda: [],
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

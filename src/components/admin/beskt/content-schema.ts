// The shape of every governed BESKT content family, as the authoring screen
// needs to render it.
//
// ── WHY THIS FILE EXISTS AND WHAT IT IS NOT ─────────────────────────────
//
// It is a RENDERING schema, not a validation authority. Every field name and
// every option below is copied from the migration that owns it
// (20261108090000 for the columns, 20261118090000 for the payload key lists
// the authoring RPCs accept), so a form can present the right controls and
// the right closed vocabularies.
//
// Nothing here decides whether a value is allowed. The database does, in a
// CHECK constraint, a child-row guard and the validator — three times over —
// and it refuses a payload naming a field the contract does not have
// (`BESKT_CONTENT_UNKNOWN_FIELD`) rather than dropping it silently. So the
// worst a drift between this file and the schema can cause is a refused save
// with a clear message, never a governed row that should not exist.
//
// The guard (`scripts/beskt-governance-admin-check.tsx`) reads the migration
// and this file together and fails when a family's key list here is not the
// key list the RPC accepts, so the drift is caught in CI rather than by an
// editor hitting a refusal.
//
// ── WHY NO VOCABULARY IS OPEN ───────────────────────────────────────────
//
// Every governed classification renders as a select over its closed list,
// never as free text. That is not cosmetic: a free-text `access_class` would
// let an editor type `authorised_security_function` into a recruitment
// method by accident, and a free-text `prohibited_inferences` would let one
// silently disappear.

import type { BesktContentFamily } from "@/lib/beskt/governance.functions";

export type BesktFieldKind =
  | "key" // the stable identifier a row is addressed by; immutable after creation
  | "text"
  | "textarea"
  | "integer"
  | "boolean"
  | "select"
  | "multiselect";

export interface BesktFieldSpec {
  readonly name: string;
  readonly kind: BesktFieldKind;
  /** NOT NULL in the schema. The form marks it; the database enforces it. */
  readonly required: boolean;
  /** The closed vocabulary, for `select` and `multiselect`. */
  readonly options?: readonly string[];
}

export interface BesktFamilySpec {
  readonly family: BesktContentFamily;
  /** The payload key the RPC addresses the row by. */
  readonly keyField: string;
  /** The column each stored row carries the key under. */
  readonly rowKeyField: string;
  readonly fields: readonly BesktFieldSpec[];
}

// ---------------------------------------------------------------------------
// The closed vocabularies, each named once and reused.
// ---------------------------------------------------------------------------

export const MODES = ["recruitment_support", "security_vetting_support"] as const;

export const PHASES = ["candidate_preparation", "interview", "verification_follow_up"] as const;

export const PROVENANCE = [
  "source_stated",
  "derived_in_authoring",
  "cqrity_design_hypothesis",
] as const;

export const ACCESS_CLASSES = [
  "recruiter",
  "beskt_interviewer",
  "independent_assessor",
  "authorised_security_function",
  "accountable_process_owner",
] as const;

export const REVIEW_ROLES = [
  "personnel_security",
  "senior_hr",
  "recruitment",
  "employment_privacy_legal",
  "data_protection",
] as const;

export const EXPOSURE_AREAS = [
  "access_to_protected_premises",
  "access_to_protected_information",
  "privileged_it_access",
  "handling_of_valuables_or_cash",
  "keys_alarms_and_access_control",
  "authority_over_others",
  "lone_working",
  "public_facing_conflict",
  "use_of_force_mandate",
  "reporting_and_documentation",
] as const;

export const RETENTION_CLASSES = ["recruitment_record", "security_vetting_record"] as const;

export const ANSWER_TYPES = [
  "single_choice",
  "multi_choice",
  "boolean",
  "short_text",
  "long_text",
  "date",
  "acknowledgement",
] as const;

export const REQUIREDNESS = ["required", "voluntary"] as const;

export const SENSITIVITY_CLASSES = [
  "ordinary",
  "integrity_sensitive",
  "security_vetting_only",
] as const;

/**
 * What a governed item may NEVER be used to infer.
 *
 * A positive list of prohibitions, stored on the item, so the prohibition
 * travels with the question rather than living in a policy document that the
 * question does not reference.
 */
export const PROHIBITED_INFERENCES = [
  "suitability_inference",
  "credibility_or_deception_inference",
  "biometric_or_emotion_inference",
  "sensitive_trait_inference",
  "protected_trait_proxy",
  "omission_as_negative_evidence",
  "personality_or_health_diagnosis",
  "inconsistency_as_dishonesty",
] as const;

export const PROMPT_KINDS = [
  "planning_from_role_relevance",
  "purpose_explanation",
  "process_explanation",
  "voluntariness_notice",
  "data_use_and_rights_notice",
  "human_decision_notice",
  "autonomy_offer",
  "open_invitation",
  "free_account",
  "behavioural_example",
  "listening_reflection",
  "specific_probe",
  "context_opportunity",
  "correction_opportunity",
  "neutral_difference_exploration",
  "summary_confirmation",
  "verification_need_disclosure",
  "closure_next_step",
  "interviewer_self_review",
] as const;

export const PEACE_STAGES = [
  "planning",
  "engage_explain",
  "account",
  "closure",
  "evaluation",
] as const;

export const ADDRESSEES = ["candidate", "interviewer"] as const;

export const QUESTION_FORMS = [
  "open_question",
  "free_recall",
  "cued_recall",
  "reflective_readback",
  "neutral_clarification",
  "summary_readback",
  "information_notice",
] as const;

export const PROBE_BASES = [
  "submitted_answer",
  "documented_role_requirement",
  "candidate_supplied_document",
  "candidate_correction",
] as const;

export const EVALUATION_TEMPLATE_KEYS = [
  "method_adherence",
  "basis_gaps",
  "next_step_planning",
] as const;

export const CONDITION_KINDS = ["always", "option_selected", "boolean_equals"] as const;

export const ROUTING_ACTIONS = ["show", "skip"] as const;

/** The seven categorical evidence states. There is no eighth, and no level. */
export const EVIDENCE_STATES = [
  "unaddressed",
  "clarification_needed",
  "sufficiently_clarified",
  "external_verification_needed",
  "conflicting_information",
  "insufficient_basis",
  "not_applicable",
] as const;

export const REQUIRED_NEXT_ACTIONS = [
  "none",
  "clarify_with_candidate",
  "offer_candidate_correction",
  "external_verification",
  "record_insufficient_basis",
  "refer_to_authorised_security_function",
] as const;

export const OBSERVATION_FIELD_KEYS = [
  "fact",
  "source_provenance",
  "role_exposure_link",
  "interviewer_interpretation",
  "candidate_explanation",
  "counter_evidence",
  "protective_factor",
  "verification_need",
  "candidate_correction",
  "sensitivity_access_class",
] as const;

export const RECORDED_BY = ["interviewer", "candidate", "process_owner", "system"] as const;

export const ACTIVATION_REQUIREMENT_KEYS = [
  "security_sensitive_role_attested",
  "lawful_basis_recorded",
  "authorised_security_owner_assigned",
] as const;

export const SATISFIED_BY_ROLES = [
  "accountable_process_owner",
  "authorised_security_function",
] as const;

/** Every closed vocabulary this file names, so one guard can read them all. */
export const BESKT_VOCABULARIES: Readonly<Record<string, readonly string[]>> = {
  mode: MODES,
  permitted_mode: MODES,
  applies_mode: MODES,
  phase: PHASES,
  content_provenance: PROVENANCE,
  access_class: ACCESS_CLASSES,
  owning_review_role: REVIEW_ROLES,
  exposure_area: EXPOSURE_AREAS,
  retention_class: RETENTION_CLASSES,
  answer_type: ANSWER_TYPES,
  requiredness: REQUIREDNESS,
  sensitivity_class: SENSITIVITY_CLASSES,
  prohibited_inferences: PROHIBITED_INFERENCES,
  prompt_kind: PROMPT_KINDS,
  peace_stage: PEACE_STAGES,
  addressee: ADDRESSEES,
  question_form: QUESTION_FORMS,
  permitted_probe_bases: PROBE_BASES,
  evaluation_template_key: EVALUATION_TEMPLATE_KEYS,
  condition_kind: CONDITION_KINDS,
  action: ROUTING_ACTIONS,
  evidence_state: EVIDENCE_STATES,
  required_next_action: REQUIRED_NEXT_ACTIONS,
  field_key: OBSERVATION_FIELD_KEYS,
  recorded_by: RECORDED_BY,
  requirement_key: ACTIVATION_REQUIREMENT_KEYS,
  satisfied_by_role: SATISFIED_BY_ROLES,
};

// ---------------------------------------------------------------------------
// The eight families.
// ---------------------------------------------------------------------------

const f = (
  name: string,
  kind: BesktFieldKind,
  required: boolean,
  options?: readonly string[],
): BesktFieldSpec => ({ name, kind, required, options });

export const BESKT_FAMILY_SPECS: readonly BesktFamilySpec[] = [
  {
    family: "exposure_profile",
    keyField: "profile_key",
    rowKeyField: "profile_key",
    fields: [
      f("profile_key", "key", true),
      f("display_order", "integer", true),
      f("exposure_area", "select", true, EXPOSURE_AREAS),
      f("duties_sv", "textarea", false),
      f("duties_en", "textarea", false),
      f("role_relevance_rationale_sv", "textarea", false),
      f("role_relevance_rationale_en", "textarea", false),
      f("permitted_mode", "select", true, MODES),
      f("owning_review_role", "select", true, REVIEW_ROLES),
      f("jurisdiction_reference", "text", false),
      f("lawful_basis_reference", "text", false),
      f("retention_class", "select", true, RETENTION_CLASSES),
      f("access_class", "select", true, ACCESS_CLASSES),
      f("security_sensitive_role_attestation_reference", "text", false),
      f("content_provenance", "select", true, PROVENANCE),
      f("source_reference", "text", false),
    ],
  },
  {
    family: "section",
    keyField: "section_key",
    rowKeyField: "section_key",
    fields: [
      f("section_key", "key", true),
      f("display_order", "integer", true),
      f("phase", "select", true, PHASES),
      f("title_sv", "text", false),
      f("title_en", "text", false),
    ],
  },
  {
    family: "item",
    keyField: "item_key",
    rowKeyField: "item_key",
    fields: [
      f("item_key", "key", true),
      f("section_key", "text", true),
      f("profile_key", "text", true),
      f("display_order", "integer", true),
      f("wording_sv", "textarea", false),
      f("wording_en", "textarea", false),
      f("purpose_sv", "textarea", false),
      f("purpose_en", "textarea", false),
      f("permitted_mode", "select", true, MODES),
      f("phase", "select", true, PHASES),
      f("answer_type", "select", true, ANSWER_TYPES),
      f("requiredness", "select", true, REQUIREDNESS),
      f("discuss_orally_allowed", "boolean", true),
      f("sensitivity_class", "select", true, SENSITIVITY_CLASSES),
      f("access_class", "select", true, ACCESS_CLASSES),
      f("content_provenance", "select", true, PROVENANCE),
      f("source_reference", "text", false),
      f("prohibited_inferences", "multiselect", false, PROHIBITED_INFERENCES),
    ],
  },
  {
    family: "prompt",
    keyField: "prompt_key",
    rowKeyField: "prompt_key",
    fields: [
      f("prompt_key", "key", true),
      f("profile_key", "text", true),
      f("item_key", "text", false),
      f("display_order", "integer", true),
      f("prompt_kind", "select", true, PROMPT_KINDS),
      f("peace_stage", "select", true, PEACE_STAGES),
      f("addressee", "select", true, ADDRESSEES),
      f("question_form", "select", true, QUESTION_FORMS),
      f("permitted_probe_bases", "multiselect", false, PROBE_BASES),
      f("permitted_mode", "select", true, MODES),
      f("wording_sv", "textarea", false),
      f("wording_en", "textarea", false),
      f("evaluation_template_key", "select", false, EVALUATION_TEMPLATE_KEYS),
      f("content_provenance", "select", true, PROVENANCE),
      f("source_reference", "text", false),
    ],
  },
  {
    family: "routing_rule",
    keyField: "rule_key",
    rowKeyField: "rule_key",
    fields: [
      f("rule_key", "key", true),
      f("evaluation_order", "integer", true),
      f("applies_mode", "select", true, MODES),
      f("source_item_key", "text", true),
      f("condition_kind", "select", true, CONDITION_KINDS),
      f("condition_option_key", "text", false),
      f("condition_boolean", "boolean", false),
      f("action", "select", true, ROUTING_ACTIONS),
      f("target_item_key", "text", true),
    ],
  },
  {
    family: "evidence_anchor",
    keyField: "evidence_state",
    rowKeyField: "evidence_state",
    fields: [
      f("evidence_state", "select", true, EVIDENCE_STATES),
      f("definition_sv", "textarea", false),
      f("definition_en", "textarea", false),
      f("inclusion_criteria_sv", "textarea", false),
      f("inclusion_criteria_en", "textarea", false),
      f("exclusion_criteria_sv", "textarea", false),
      f("exclusion_criteria_en", "textarea", false),
      f("supporting_evidence_examples_sv", "textarea", false),
      f("supporting_evidence_examples_en", "textarea", false),
      f("counter_evidence_and_protective_factors_sv", "textarea", false),
      f("counter_evidence_and_protective_factors_en", "textarea", false),
      f("prohibited_inferences", "multiselect", false, PROHIBITED_INFERENCES),
      f("required_next_action", "select", false, REQUIRED_NEXT_ACTIONS),
    ],
  },
  {
    family: "observation_field",
    keyField: "field_key",
    rowKeyField: "field_key",
    fields: [
      f("field_key", "select", true, OBSERVATION_FIELD_KEYS),
      f("ordinal", "integer", true),
      f("recorded_by", "select", true, RECORDED_BY),
      f("is_judgement", "boolean", true),
      f("label_sv", "text", false),
      f("label_en", "text", false),
      f("definition_sv", "textarea", false),
      f("definition_en", "textarea", false),
    ],
  },
  {
    family: "activation_requirement",
    keyField: "requirement_key",
    rowKeyField: "requirement_key",
    fields: [
      f("requirement_key", "select", true, ACTIVATION_REQUIREMENT_KEYS),
      f("satisfied_by_role", "select", true, SATISFIED_BY_ROLES),
      f("statement_sv", "textarea", true),
      f("statement_en", "textarea", true),
    ],
  },
];

export function besktFamilySpec(family: BesktContentFamily): BesktFamilySpec {
  const spec = BESKT_FAMILY_SPECS.find((s) => s.family === family);
  // Unreachable through the type, and thrown rather than defaulted: a missing
  // spec is a programming error, and a silent fallback would render an empty
  // form that looked like a family with no fields.
  if (!spec) throw new Error(`no BESKT family spec for ${family}`);
  return spec;
}

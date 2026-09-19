/**
 * BESKT v0.1 → the rows the governed authoring RPCs take. Pure: no I/O, so the
 * same plan can be printed, checked by a guard and imported.
 */

import {
  ACTIVATION_REQUIREMENTS,
  ANCHORS,
  GRAMMAR_FOLLOW_UPS,
  OBSERVATION_FIELDS,
  OCCURRENCE,
  PROMPTS,
  QUESTIONS,
  SECTIONS,
  SOURCE,
  type Mode,
  type QuestionDef,
} from "./beskt-v0-1.content";

export type MethodKey = "rekrytering" | "sakerhet";
type Row = Record<string, unknown>;

export interface Plan {
  readonly method: { slug: string; nameSv: string; nameEn: string; purposeSv: string };
  readonly version: { mode: Mode; summarySv: string; summaryEn: string };
  readonly profiles: Row[];
  readonly sections: Row[];
  readonly items: Row[];
  readonly rules: Row[];
  readonly prompts: Row[];
  readonly anchors: Row[];
  readonly fields: Row[];
  readonly activation: Row[];
}

const PROFILE_KEY = "sakerhetskanslig_befattning";

function accessFor(q: QuestionDef): string {
  if (q.sensitivity === "security_vetting_only") return "authorised_security_function";
  if (q.sensitivity === "integrity_sensitive") return "beskt_interviewer";
  return "recruiter";
}

function ref(q: QuestionDef, extra = ""): string {
  return `${SOURCE}, ${q.specRef}${extra}`;
}

export function buildPlan(
  method: MethodKey,
  {
    synthetic,
    lawfulBasisReference,
    attestationReference,
  }: {
    synthetic: boolean;
    /** The owner's recorded lawful-basis decision. Never invented here. */
    lawfulBasisReference?: string;
    /** Security vetting only: where the employer's attestation that a role is
     *  security-sensitive is recorded. A reference to the requirement's
     *  runtime, stated by the operator -- never an attestation itself. */
    attestationReference?: string;
  },
): Plan {
  const mode: Mode = method === "rekrytering" ? "recruitment_support" : "security_vetting_support";
  const questions = QUESTIONS.filter(
    (q) => mode === "security_vetting_support" || q.mode === "recruitment_support",
  );

  const tag = synthetic ? "SYNTETISK TEST – " : "";
  const tagEn = synthetic ? "SYNTHETIC TEST – " : "";
  const methodInfo =
    method === "rekrytering"
      ? {
          slug: synthetic ? "syntetisk-beskt-rekryteringsstod-v0-1" : "beskt-rekryteringsstod",
          nameSv: `${tag}BESKT – rekryteringsstöd`,
          nameEn: `${tagEn}BESKT – recruitment support`,
        }
      : {
          slug: synthetic
            ? "syntetisk-beskt-sakerhetsprovningsstod-v0-1"
            : "beskt-sakerhetsprovningsstod",
          nameSv: `${tag}BESKT – säkerhetsprövningsstöd`,
          nameEn: `${tagEn}BESKT – security vetting support`,
        };

  const purposeSv =
    "BESKT identifierar teman att klarlägga och skyddsåtgärder att överväga. Modellen beräknar inte sannolikheten att en person blir insider och får inte ensam ligga till grund för beslut.";

  const version = {
    mode,
    summarySv:
      (synthetic
        ? "Syntetisk testversion av BESKT v0.1 för lokal genomgång. Inte en produktionsversion. "
        : "") +
      (method === "rekrytering"
        ? "Förberedande underlag och strukturerad intervju för rollens säkerhetsbeteende: gemensam bas, B – besvikelse och konflikter, situationer och rollens exponering."
        : "Förberedande personalsäkerhetsunderlag och BESKT-intervju: Besvikelse, Ekonomi, Social situation, Kontakter och Tillfälle. Aktiveras först när de tre aktiveringskraven är uppfyllda."),
    summaryEn:
      (synthetic
        ? "Synthetic test version of BESKT v0.1 for a local walkthrough. Not a production version. "
        : "") +
      (method === "rekrytering"
        ? "Pre-interview form and structured interview on security behaviour in the role: common base, B – disappointment and conflicts, situations and the role's exposure."
        : "Pre-interview personnel security form and BESKT interview: Disappointment, Finances, Social situation, Contacts and Opportunity. Activated only once the three activation requirements are met."),
  };

  // ---- T: the exposure profile ------------------------------------------------
  const vetting = mode === "security_vetting_support";
  const profiles: Row[] = [
    {
      profile_key: PROFILE_KEY,
      display_order: 1,
      exposure_area: "access_to_protected_information",
      duties_sv:
        "Mall för en säkerhetskänslig befattning. Arbetsgivarens avhemligade befattningsanalys fastställer typ av åtkomst, självständighet, möjlighet att kringgå kontroll, möjlig skada, tillsyn och befintliga skydd.",
      duties_en:
        "Template for a security-sensitive position. The employer's declassified position analysis sets the type of access, autonomy, scope to bypass controls, possible harm, supervision and existing safeguards.",
      role_relevance_rationale_sv:
        "Tillfälle är i första hand organisationens åtkomst- och kontrollfråga, inte kandidatens egenskap. Frågorna motiveras av rollens exponering.",
      role_relevance_rationale_en:
        "Opportunity is primarily the organisation's access and control question, not a characteristic of the candidate. The questions are justified by the role's exposure.",
      permitted_mode: mode,
      owning_review_role: "personnel_security",
      jurisdiction_reference:
        "SE — säkerhetsskyddslagen (2018:585), säkerhetsskyddsförordningen (2021:955), PMFS 2026:8",
      // Never invented. Synthetic: labelled as such. Otherwise empty, so the
      // validator blocks submission until the owner's decision is recorded.
      lawful_basis_reference: synthetic
        ? "SYNTETISK TESTVERSION – ingen rättslig grund fastställd; får inte användas med verkliga personuppgifter"
        : lawfulBasisReference?.trim() || null,
      retention_class: vetting ? "security_vetting_record" : "recruitment_record",
      access_class: vetting ? "authorised_security_function" : "recruiter",
      security_sensitive_role_attestation_reference:
        vetting && !synthetic ? attestationReference?.trim() || null : null,
      content_provenance: "derived_in_authoring",
      source_reference: `${SOURCE}, §2.1, §4.3 T, §7`,
    },
  ];

  // ---- sections that carry at least one item ----------------------------------
  const usedDomains = new Set(questions.map((q) => q.domain));
  const sections: Row[] = SECTIONS.filter((s) => usedDomains.has(s.domain)).map((s, i) => ({
    section_key: s.key,
    display_order: i + 1,
    phase: "candidate_preparation",
    title_sv: s.sv,
    title_en: s.en,
  }));
  const sectionOf = (q: QuestionDef) => SECTIONS.find((s) => s.domain === q.domain)!.key;

  // ---- items, with the §4.2 grammar expanded under every incident question ----
  const items: Row[] = [];
  const rules: Row[] = [];
  const order = new Map<string, number>();
  const nextOrder = (section: string) => {
    const n = (order.get(section) ?? 0) + 1;
    order.set(section, n);
    return n;
  };
  let evaluationOrder = 0;

  for (const q of questions) {
    const section = sectionOf(q);
    const base = {
      section_key: section,
      profile_key: PROFILE_KEY,
      permitted_mode: q.mode,
      phase: "candidate_preparation",
      sensitivity_class: q.sensitivity,
      access_class: accessFor(q),
      prohibited_inferences: [...q.prohibited],
    };
    const isAck = q.key === "t01_forstaelse";
    items.push({
      ...base,
      item_key: q.key,
      display_order: nextOrder(section),
      wording_sv: q.sv,
      wording_en: q.en,
      purpose_sv: q.purposeSv,
      purpose_en: q.purposeEn,
      answer_type: isAck ? "acknowledgement" : q.shape === "open" ? "long_text" : "single_choice",
      requiredness: isAck ? "required" : "voluntary",
      discuss_orally_allowed: !isAck,
      content_provenance: "source_stated",
      source_reference: ref(q),
      options:
        q.shape === "incident"
          ? OCCURRENCE.map((o, i) => ({
              option_key: o.key,
              label_sv: o.sv,
              label_en: o.en,
              display_order: i + 1,
            }))
          : q.shape === "choice"
            ? (q.options ?? []).map((o, i) => ({
                option_key: o.key,
                label_sv: o.sv,
                label_en: o.en,
                display_order: i + 1,
              }))
            : [],
    });

    if (q.shape === "incident") {
      for (const g of GRAMMAR_FOLLOW_UPS) {
        const target = `${q.key}__${g.suffix}`;
        const opts = g.options ?? [];
        items.push({
          ...base,
          item_key: target,
          display_order: nextOrder(section),
          wording_sv: g.sv,
          wording_en: g.en,
          purpose_sv: g.purposeSv,
          purpose_en: g.purposeEn,
          answer_type: g.answerType,
          requiredness: "voluntary",
          discuss_orally_allowed: true,
          content_provenance: "source_stated",
          source_reference: ref(q, " — svarsgrammatik §4.2"),
          options: opts.map((o, i) => ({
            option_key: o.key,
            label_sv: o.sv,
            label_en: o.en,
            display_order: i + 1,
          })),
        });
        // §4.5: a Ja or an Osäker opens the follow-ups; a Nej does not ask more.
        for (const when of ["ja", "osaker"]) {
          rules.push({
            rule_key: `${target}__${when}`,
            evaluation_order: ++evaluationOrder,
            applies_mode: q.mode,
            source_item_key: q.key,
            condition_kind: "option_selected",
            condition_option_key: when,
            action: "show",
            target_item_key: target,
          });
        }
      }
    }
  }

  // §4.3 fråga 12 is asked only when an E question was answered Ja or Osäker.
  if (questions.some((q) => q.key === "q12_ekonomisk_plan")) {
    for (const source of [
      "q09_ekonomisk_press",
      "q10_forsamrad_ekonomi",
      "q11_ekonomiskt_beroende",
    ]) {
      for (const when of ["ja", "osaker"]) {
        rules.push({
          rule_key: `q12_ekonomisk_plan__${source.slice(0, 3)}__${when}`,
          evaluation_order: ++evaluationOrder,
          applies_mode: "security_vetting_support",
          source_item_key: source,
          condition_kind: "option_selected",
          condition_option_key: when,
          action: "show",
          target_item_key: "q12_ekonomisk_plan",
        });
      }
    }
  }

  // ---- prompts ------------------------------------------------------------------
  const prompts: Row[] = PROMPTS.map((p, i) => ({
    prompt_key: p.key,
    profile_key: PROFILE_KEY,
    item_key: null,
    display_order: i + 1,
    prompt_kind: p.kind,
    peace_stage: p.stage,
    addressee: p.stage === "planning" || p.stage === "evaluation" ? "interviewer" : "candidate",
    question_form: p.form,
    permitted_probe_bases: [...p.bases],
    permitted_mode: "recruitment_support",
    wording_sv: p.evaluationKey ? null : p.sv,
    wording_en: p.evaluationKey ? null : p.en,
    evaluation_template_key: p.evaluationKey ?? null,
    content_provenance: p.provenance,
    source_reference: `${SOURCE}, ${p.specRef}`,
  }));

  const anchors: Row[] = ANCHORS.map((a) => ({
    evidence_state: a.state,
    definition_sv: a.defSv,
    definition_en: a.defEn,
    inclusion_criteria_sv: a.inclSv,
    inclusion_criteria_en: a.inclEn,
    exclusion_criteria_sv: a.exclSv,
    exclusion_criteria_en: a.exclEn,
    supporting_evidence_examples_sv: a.suppSv,
    supporting_evidence_examples_en: a.suppEn,
    counter_evidence_and_protective_factors_sv: a.counterSv,
    counter_evidence_and_protective_factors_en: a.counterEn,
    prohibited_inferences: [...a.prohibited],
    required_next_action:
      vetting && a.state === "insufficient_basis"
        ? "refer_to_authorised_security_function"
        : a.nextAction,
  }));

  const fields: Row[] = OBSERVATION_FIELDS.map((f) => ({
    field_key: f.key,
    ordinal: f.ordinal,
    recorded_by: f.recordedBy,
    is_judgement: f.isJudgement,
    label_sv: f.labelSv,
    label_en: f.labelEn,
    definition_sv: f.defSv,
    definition_en: f.defEn,
  }));

  const activation: Row[] = vetting
    ? ACTIVATION_REQUIREMENTS.map((a) => ({
        requirement_key: a.key,
        satisfied_by_role: a.by,
        statement_sv: a.sv,
        statement_en: a.en,
      }))
    : [];

  return {
    method: { ...methodInfo, purposeSv },
    version,
    profiles,
    sections,
    items,
    rules,
    prompts,
    anchors,
    fields,
    activation,
  };
}

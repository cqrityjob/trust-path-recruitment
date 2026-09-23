// The vacancy's requirements and application questions as the job form holds
// them before saving, and the shape the server function takes. Pure, so the
// editor component file exports components only.

export type RequirementDraft = {
  key: string;
  kind: "mandatory" | "desirable";
  label_sv: string;
  label_en: string;
};
export type QuestionDraft = {
  key: string;
  requirement_key: string | null;
  prompt_sv: string;
  prompt_en: string;
  answer_kind: "text" | "yes_no";
  is_required: boolean;
};
export type VacancyStructureDraft = {
  requirements: RequirementDraft[];
  questions: QuestionDraft[];
};

export const emptyStructure: VacancyStructureDraft = { requirements: [], questions: [] };

let seq = 0;
export function newKey(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

export function structureFromRows(
  requirements: {
    id: string;
    kind: "mandatory" | "desirable";
    labelSv: string | null;
    labelEn: string | null;
  }[],
  questions: {
    requirementId: string | null;
    promptSv: string | null;
    promptEn: string | null;
    answerKind: "text" | "yes_no";
    isRequired: boolean;
  }[],
): VacancyStructureDraft {
  return {
    requirements: requirements.map((r) => ({
      key: r.id,
      kind: r.kind,
      label_sv: r.labelSv ?? "",
      label_en: r.labelEn ?? "",
    })),
    questions: questions.map((q) => ({
      key: newKey("q"),
      requirement_key: q.requirementId,
      prompt_sv: q.promptSv ?? "",
      prompt_en: q.promptEn ?? "",
      answer_kind: q.answerKind,
      is_required: q.isRequired,
    })),
  };
}

/** The frame as the server function takes it. Requirements keep their key
 *  so each question can name the requirement it is linked to. */
export function structurePayload(s: VacancyStructureDraft) {
  return {
    requirements: s.requirements.map((r) => ({
      key: r.key,
      kind: r.kind,
      label_sv: r.label_sv || null,
      label_en: r.label_en || null,
    })),
    questions: s.questions.map((q) => ({
      requirement_key: q.requirement_key,
      prompt_sv: q.prompt_sv || null,
      prompt_en: q.prompt_en || null,
      answer_kind: q.answer_kind,
      is_required: q.is_required,
    })),
  };
}

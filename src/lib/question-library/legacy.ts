// Lookup helpers for reusing the existing, frozen Public Assessment v2.1
// content by reference. Nothing here copies content or mappings -- every
// caller gets back the exact live object from assessment-content.ts /
// question-mappings.ts.

import { questions as legacyQuestions, type Question } from "@/lib/assessment-content";
import { questionMappingById } from "@/lib/career-assessment/question-mappings";
import type { QuestionMapping } from "@/lib/career-assessment/types";

const legacyQuestionById: Record<string, Question> = Object.fromEntries(
  legacyQuestions.map((q) => [q.id, q]),
);

export function legacyQuestion(id: string): Question {
  const q = legacyQuestionById[id];
  if (!q) throw new Error(`legacyQuestion: unknown existing question id "${id}"`);
  return q;
}

export function legacyMapping(id: string): QuestionMapping {
  const m = questionMappingById[id];
  if (!m) throw new Error(`legacyMapping: unknown existing mapping id "${id}"`);
  return m;
}

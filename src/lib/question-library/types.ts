import type { DimensionId, QuestionMapping } from "@/lib/career-assessment/types";
import type { CompetencySlug } from "@/lib/competency-library/types";
import type { Question } from "@/lib/assessment-content";

export type { Question };

// The three Current Situation → question-set profiles for the Public Career
// Assessment. Each candidate always answers 8 Universal Core + 8 questions
// from exactly one of these profile pools.
export type AssessmentProfileId = "student_or_new" | "security_professional" | "career_changer";

export type EvidenceType = "scenario-based" | "behavioural" | "preference";

// A single reusable Question Library entry. Existing (reused) questions
// reference the live `content`/`mapping` objects from
// src/lib/assessment-content.ts / src/lib/career-assessment/question-mappings.ts
// by value -- nothing is copied. New questions carry their own literal
// content/mapping, authored in the same shape and convention.
export interface QuestionAsset {
  id: string; // stable asset id, e.g. "core-01" or "sgf-01"
  version: number;
  status: "draft" | "published" | "archived";
  category: string; // short authoring label, e.g. "integrity"
  competencies: CompetencySlug[]; // Competency Library entries this question is evidence for
  dimensions: DimensionId[]; // denormalized union of dimensions the mapping actually weights (kept for the scoring engine, which reads dimensions directly)
  difficulty?: "foundational" | "intermediate" | "advanced"; // reserved, not read yet
  tags: string[];
  supportedAssessmentDefinitions: string[]; // catalog assessment_id values (or "*")
  evidenceType: EvidenceType;
  content: Question;
  mapping: QuestionMapping;
}

export interface AssembledQuestionSet {
  questions: Question[];
  mappings: QuestionMapping[];
}

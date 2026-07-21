import type { Bi, DimensionId } from "@/lib/career-assessment/types";

// Competency Library -- the platform layer between the Question Library and
// the Dimension Model (Assessment DNA). A Competency is "what a question is
// evidence of"; a Dimension is "what that evidence aggregates into." See
// docs/architecture/competency-library.md for the full rationale.
//
// This is a declarative, additive layer only: the scoring engine
// (src/lib/career-assessment/matching-engine.ts) still reads Dimension
// weights directly from QuestionMapping -- it does not read this registry at
// runtime. CompetencyDefinition.dimensions is a checkable declaration
// ("this competency's evidence belongs to these dimensions"), validated by
// validate.ts against the actual dimension weights carried by every question
// tagged with that competency slug.

export type CompetencySlug =
  | "comp-integrity"
  | "comp-judgement"
  | "comp-reliability"
  | "comp-clear-communication"
  | "comp-collaboration"
  | "comp-risk-recognition"
  | "comp-prioritisation"
  | "comp-learning-agility"
  | "comp-situational-awareness"
  | "comp-procedural-discipline"
  | "comp-escalation-judgement"
  | "comp-judgement-under-uncertainty"
  | "comp-adaptability"
  | "comp-reporting-quality"
  | "comp-work-environment-preference"
  | "comp-career-direction-preference"
  | "comp-work-motivation"
  | "comp-service-disposition"
  | "comp-composure-under-pressure";

export type CompetencyStatus = "provisional" | "published";

export interface CompetencyDefinition {
  id: string;
  slug: CompetencySlug;
  name: Bi;
  description: Bi;
  // Which of the 14 frozen dimensions this competency contributes evidence
  // to. A competency may feed more than one dimension; a dimension is
  // typically fed by several competencies (see docs/architecture/competency-library.md
  // for the full fan-in table).
  dimensions: DimensionId[];
  status: CompetencyStatus;
}

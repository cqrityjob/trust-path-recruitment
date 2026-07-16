import type { QuestionMapping } from "./types";

// All weights are provisional; the model is a documented hypothesis, not a
// validated instrument. Every option or rating contribution is capped by the
// question-level `maxAbsPerDimension` when the engine applies it.
export const questionMappings: QuestionMapping[] = [
  {
    questionId: "q1",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "protect",
        weights: [
          { dimension: "operational_orientation", weight: 2 },
          { dimension: "service_orientation", weight: 2 },
          { dimension: "risk_awareness", weight: 1 },
        ],
      },
      {
        optionId: "problem",
        weights: [
          { dimension: "analytical_orientation", weight: 2 },
          { dimension: "investigation_orientation", weight: 1 },
        ],
      },
      {
        optionId: "tech",
        weights: [{ dimension: "technical_orientation", weight: 3 }],
      },
      {
        optionId: "lead",
        weights: [
          { dimension: "leadership_orientation", weight: 3 },
          { dimension: "strategic_orientation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q2",
    maxAbsPerDimension: 3,
    rating: [{ dimension: "communication", factor: 1.25 }],
  },
  {
    questionId: "q3",
    maxAbsPerDimension: 3,
    rating: [
      { dimension: "leadership_orientation", factor: 1.5 },
      { dimension: "teamwork", factor: 0.5 },
    ],
  },
  {
    questionId: "q4",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "deesc",
        weights: [
          { dimension: "conflict_management", weight: 2 },
          { dimension: "communication", weight: 2 },
          { dimension: "service_orientation", weight: 1 },
        ],
      },
      {
        optionId: "protocol",
        weights: [
          { dimension: "structure_documentation", weight: 2 },
          { dimension: "risk_awareness", weight: 1 },
        ],
      },
      {
        optionId: "delegate",
        weights: [
          { dimension: "leadership_orientation", weight: 2 },
          { dimension: "teamwork", weight: 1 },
        ],
      },
      {
        optionId: "act",
        weights: [
          { dimension: "independent_decision_making", weight: 2 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q5",
    maxAbsPerDimension: 3,
    rating: [{ dimension: "analytical_orientation", factor: 1.5 }],
  },
  {
    questionId: "q6",
    maxAbsPerDimension: 3,
    rating: [{ dimension: "technical_orientation", factor: 1.5 }],
  },
  {
    questionId: "q7",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "office",
        weights: [
          { dimension: "analytical_orientation", weight: 1 },
          { dimension: "strategic_orientation", weight: 1 },
        ],
      },
      {
        optionId: "field",
        weights: [{ dimension: "operational_orientation", weight: 2 }],
      },
      {
        optionId: "datacenter",
        weights: [
          { dimension: "technical_orientation", weight: 1 },
          { dimension: "structure_documentation", weight: 1 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
      {
        optionId: "public",
        weights: [
          { dimension: "service_orientation", weight: 2 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
      {
        optionId: "corporate",
        weights: [
          { dimension: "strategic_orientation", weight: 1 },
          { dimension: "leadership_orientation", weight: 1 },
        ],
      },
      {
        optionId: "gov",
        weights: [
          { dimension: "structure_documentation", weight: 1 },
          { dimension: "investigation_orientation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q8",
    maxAbsPerDimension: 3,
    rating: [{ dimension: "risk_awareness", factor: 1.5 }],
  },
  {
    questionId: "q9",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "core",
        weights: [
          { dimension: "service_orientation", weight: 2 },
          { dimension: "communication", weight: 1 },
        ],
      },
      { optionId: "ok", weights: [{ dimension: "service_orientation", weight: 1 }] },
      { optionId: "limited", weights: [{ dimension: "service_orientation", weight: -1 }] },
      {
        optionId: "no",
        weights: [
          { dimension: "service_orientation", weight: -2 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q10",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "data",
        weights: [
          { dimension: "analytical_orientation", weight: 2 },
          { dimension: "structure_documentation", weight: 1 },
        ],
      },
      {
        optionId: "gut",
        weights: [
          { dimension: "independent_decision_making", weight: 2 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
      {
        optionId: "team",
        weights: [
          { dimension: "teamwork", weight: 2 },
          { dimension: "communication", weight: 1 },
        ],
      },
      {
        optionId: "rules",
        weights: [
          { dimension: "structure_documentation", weight: 2 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q11",
    maxAbsPerDimension: 3,
    rating: [
      { dimension: "operational_orientation", factor: 1 },
      { dimension: "conflict_management", factor: 0.5 },
    ],
  },
  {
    questionId: "q12",
    maxAbsPerDimension: 3,
    rating: [
      { dimension: "teamwork", factor: 1.25 },
      { dimension: "independent_decision_making", factor: -0.75 },
    ],
  },
  {
    questionId: "q13",
    maxAbsPerDimension: 3,
    rating: [
      { dimension: "strategic_orientation", factor: 1.25 },
      { dimension: "structure_documentation", factor: 0.75 },
    ],
  },
  {
    questionId: "q14",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "hands",
        weights: [
          { dimension: "learning_development", weight: 1 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
      {
        optionId: "read",
        weights: [
          { dimension: "learning_development", weight: 1 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      {
        optionId: "mentor",
        weights: [
          { dimension: "learning_development", weight: 1 },
          { dimension: "teamwork", weight: 1 },
        ],
      },
      {
        optionId: "course",
        weights: [
          { dimension: "learning_development", weight: 2 },
          { dimension: "structure_documentation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q15",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "invest",
        weights: [
          { dimension: "investigation_orientation", weight: 2 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      { optionId: "physec", weights: [{ dimension: "operational_orientation", weight: 2 }] },
      {
        optionId: "cyber",
        weights: [
          { dimension: "technical_orientation", weight: 2 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      {
        optionId: "compliance",
        weights: [
          { dimension: "structure_documentation", weight: 2 },
          { dimension: "investigation_orientation", weight: 1 },
        ],
      },
      {
        optionId: "crisis",
        weights: [
          { dimension: "risk_awareness", weight: 2 },
          { dimension: "strategic_orientation", weight: 1 },
        ],
      },
      {
        optionId: "strategy",
        weights: [
          { dimension: "strategic_orientation", weight: 2 },
          { dimension: "leadership_orientation", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q16",
    maxAbsPerDimension: 3,
    rating: [
      { dimension: "leadership_orientation", factor: 1 },
      { dimension: "strategic_orientation", factor: 0.75 },
      { dimension: "learning_development", factor: 0.5 },
    ],
  },
];

export const questionMappingById: Record<string, QuestionMapping> = Object.fromEntries(
  questionMappings.map((m) => [m.questionId, m]),
);
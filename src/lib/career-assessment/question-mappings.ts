import type { QuestionMapping } from "./types";

// Public Assessment v2.0 dimension mappings. All weights are provisional;
// the model is a documented hypothesis, not a validated instrument (see
// docs/job-intelligence/public-assessment-v2-questions.md for the full
// authoring rationale, evidence-signal intent, and known limitations per
// question). Every option or rating contribution is capped by the
// question-level `maxAbsPerDimension` when the engine applies it.
//
// Deliberate scoping decision (reported, not silent): mappings target the
// existing, frozen 14-DimensionId model (src/lib/career-assessment/types.ts)
// -- not the Assessment DNA Dimension Framework's 12 dimensions, which
// remain reserved for the Blueprint Engine. See the v2.0 implementation
// report for the full reconciliation and the resulting coverage trade-off
// (leadership_orientation, strategic_orientation, technical_orientation and
// investigation_orientation receive option-level rather than dedicated
// primary-item coverage in this version).
export const questionMappings: QuestionMapping[] = [
  {
    questionId: "q1",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "always",
        weights: [
          { dimension: "structure_documentation", weight: 3 },
          { dimension: "risk_awareness", weight: 1 },
        ],
      },
      { optionId: "mostly", weights: [{ dimension: "structure_documentation", weight: 2 }] },
      { optionId: "variable", weights: [{ dimension: "structure_documentation", weight: -1 }] },
      {
        optionId: "deprioritize",
        weights: [
          { dimension: "structure_documentation", weight: -2 },
          { dimension: "risk_awareness", weight: -1 },
        ],
      },
    ],
  },
  {
    questionId: "q2",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "raise_privately",
        weights: [
          { dimension: "structure_documentation", weight: 2 },
          { dimension: "conflict_management", weight: 1 },
        ],
      },
      {
        optionId: "follow_procedure",
        weights: [
          { dimension: "structure_documentation", weight: 2 },
          { dimension: "conflict_management", weight: 1 },
        ],
      },
      { optionId: "let_it_go", weights: [{ dimension: "structure_documentation", weight: -1 }] },
      {
        optionId: "adopt_it",
        weights: [
          { dimension: "structure_documentation", weight: -3 },
          { dimension: "conflict_management", weight: -1 },
        ],
      },
    ],
  },
  {
    questionId: "q3",
    maxAbsPerDimension: 3,
    options: [
      { optionId: "unexplained", weights: [{ dimension: "risk_awareness", weight: 3 }] },
      { optionId: "unusual_person", weights: [{ dimension: "risk_awareness", weight: 2 }] },
      { optionId: "schedule_only", weights: [{ dimension: "risk_awareness", weight: 0 }] },
      { optionId: "told_only", weights: [{ dimension: "risk_awareness", weight: -1 }] },
    ],
  },
  {
    questionId: "q4",
    maxAbsPerDimension: 3,
    options: [
      { optionId: "proactive", weights: [{ dimension: "risk_awareness", weight: 3 }] },
      { optionId: "task_focused", weights: [{ dimension: "risk_awareness", weight: 1 }] },
      { optionId: "reactive", weights: [{ dimension: "risk_awareness", weight: -1 }] },
      { optionId: "assume_fine", weights: [{ dimension: "risk_awareness", weight: -2 }] },
    ],
  },
  {
    questionId: "q5",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "follow_and_raise",
        weights: [{ dimension: "structure_documentation", weight: 3 }],
      },
      {
        optionId: "follow_and_note",
        weights: [{ dimension: "structure_documentation", weight: 2 }],
      },
      {
        optionId: "use_own_this_time",
        weights: [{ dimension: "structure_documentation", weight: -1 }],
      },
      {
        optionId: "use_own_regularly",
        weights: [{ dimension: "structure_documentation", weight: -2 }],
      },
    ],
  },
  {
    questionId: "q6",
    maxAbsPerDimension: 3,
    options: [
      { optionId: "facts_first", weights: [{ dimension: "communication", weight: 3 }] },
      { optionId: "facts_and_read", weights: [{ dimension: "communication", weight: 2 }] },
      { optionId: "next_steps", weights: [{ dimension: "communication", weight: 0 }] },
      { optionId: "whatever_urgent", weights: [{ dimension: "communication", weight: -1 }] },
    ],
  },
  {
    questionId: "q7",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "escalate_now",
        weights: [
          { dimension: "conflict_management", weight: 2 },
          { dimension: "communication", weight: 1 },
        ],
      },
      {
        optionId: "gather_more",
        weights: [
          { dimension: "conflict_management", weight: 2 },
          { dimension: "communication", weight: 1 },
        ],
      },
      { optionId: "wait_and_see", weights: [{ dimension: "conflict_management", weight: -1 }] },
      { optionId: "handle_alone", weights: [{ dimension: "conflict_management", weight: -2 }] },
    ],
  },
  {
    questionId: "q8",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "continue_alert",
        weights: [
          { dimension: "independent_decision_making", weight: 3 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      {
        optionId: "pause_then_continue",
        weights: [
          { dimension: "independent_decision_making", weight: 2 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      {
        optionId: "second_guess",
        weights: [{ dimension: "independent_decision_making", weight: -1 }],
      },
      {
        optionId: "reverse_to_be_safe",
        weights: [{ dimension: "independent_decision_making", weight: -2 }],
      },
    ],
  },
  {
    questionId: "q9",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "best_available",
        weights: [{ dimension: "independent_decision_making", weight: 2 }],
      },
      {
        optionId: "pause_briefly",
        weights: [
          { dimension: "independent_decision_making", weight: 2 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      { optionId: "freeze", weights: [{ dimension: "independent_decision_making", weight: -1 }] },
      {
        optionId: "pick_convenient",
        weights: [{ dimension: "independent_decision_making", weight: -2 }],
      },
    ],
  },
  {
    questionId: "q10",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "adjust_same_shift",
        weights: [
          { dimension: "learning_development", weight: 3 },
          { dimension: "operational_orientation", weight: 1 },
        ],
      },
      {
        optionId: "adjust_with_guidance",
        weights: [{ dimension: "learning_development", weight: 2 }],
      },
      { optionId: "revert_to_old", weights: [{ dimension: "learning_development", weight: -1 }] },
      {
        optionId: "find_it_frustrating",
        weights: [{ dimension: "learning_development", weight: -2 }],
      },
    ],
  },
  {
    questionId: "q11",
    maxAbsPerDimension: 3,
    options: [
      { optionId: "fast_proactive", weights: [{ dimension: "learning_development", weight: 3 }] },
      { optionId: "normal_pace", weights: [{ dimension: "learning_development", weight: 1 }] },
      {
        optionId: "slower_than_liked",
        weights: [{ dimension: "learning_development", weight: -1 }],
      },
      {
        optionId: "still_not_comfortable",
        weights: [{ dimension: "learning_development", weight: -2 }],
      },
    ],
  },
  {
    questionId: "q12",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "triage_and_flag",
        weights: [
          { dimension: "operational_orientation", weight: 3 },
          { dimension: "conflict_management", weight: 1 },
        ],
      },
      { optionId: "fastest_first", weights: [{ dimension: "operational_orientation", weight: 1 }] },
      { optionId: "both_at_once", weights: [{ dimension: "operational_orientation", weight: -1 }] },
      {
        optionId: "freeze",
        weights: [
          { dimension: "operational_orientation", weight: -2 },
          { dimension: "conflict_management", weight: -1 },
        ],
      },
    ],
  },
  {
    questionId: "q13",
    maxAbsPerDimension: 3,
    options: [
      { optionId: "discuss_and_agree", weights: [{ dimension: "teamwork", weight: 3 }] },
      {
        optionId: "defer_to_them",
        weights: [
          { dimension: "teamwork", weight: 1 },
          { dimension: "independent_decision_making", weight: -1 },
        ],
      },
      {
        optionId: "split_and_go_own_way",
        weights: [
          { dimension: "teamwork", weight: -1 },
          { dimension: "independent_decision_making", weight: 1 },
        ],
      },
      {
        optionId: "push_my_view",
        weights: [
          { dimension: "teamwork", weight: -2 },
          { dimension: "independent_decision_making", weight: 1 },
        ],
      },
    ],
  },
  {
    questionId: "q14",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "immediate_detailed",
        weights: [{ dimension: "structure_documentation", weight: 3 }],
      },
      {
        optionId: "immediate_brief",
        weights: [{ dimension: "structure_documentation", weight: 2 }],
      },
      { optionId: "delayed", weights: [{ dimension: "structure_documentation", weight: 0 }] },
      { optionId: "minimal", weights: [{ dimension: "structure_documentation", weight: -1 }] },
    ],
  },
  {
    questionId: "q15",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "core",
        weights: [
          { dimension: "service_orientation", weight: 2 },
          { dimension: "communication", weight: 1 },
        ],
      },
      { optionId: "capable", weights: [{ dimension: "service_orientation", weight: 1 }] },
      { optionId: "limited", weights: [{ dimension: "service_orientation", weight: -1 }] },
      { optionId: "minimal", weights: [{ dimension: "service_orientation", weight: -2 }] },
    ],
  },
  {
    questionId: "q16",
    maxAbsPerDimension: 3,
    options: [
      {
        optionId: "office",
        weights: [
          { dimension: "analytical_orientation", weight: 1 },
          { dimension: "strategic_orientation", weight: 1 },
        ],
      },
      { optionId: "field", weights: [{ dimension: "operational_orientation", weight: 2 }] },
      {
        optionId: "datacenter",
        weights: [
          { dimension: "technical_orientation", weight: 2 },
          { dimension: "structure_documentation", weight: 1 },
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
          { dimension: "strategic_orientation", weight: 2 },
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
      {
        optionId: "casework",
        weights: [
          { dimension: "investigation_orientation", weight: 2 },
          { dimension: "analytical_orientation", weight: 1 },
        ],
      },
      {
        optionId: "coordination",
        weights: [
          { dimension: "leadership_orientation", weight: 2 },
          { dimension: "teamwork", weight: 1 },
        ],
      },
    ],
  },
];

export const questionMappingById: Record<string, QuestionMapping> = Object.fromEntries(
  questionMappings.map((m) => [m.questionId, m]),
);

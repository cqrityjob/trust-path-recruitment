import type { QuestionAsset } from "../types";
import { legacyQuestion, legacyMapping } from "../legacy";

// Universal Core (Q1-Q8) -- asked to every Public Career Assessment
// candidate regardless of profile. All 8 are reused verbatim from the
// existing, frozen Public Assessment v2.1 content (assessment-content.ts /
// question-mappings.ts) by reference, never copied. See
// docs/job-intelligence/public-career-assessment-v1-spec.md for the full
// reasoning per question.
//
// Root-cause fix (Employer Assessment workflow phase): these 8 assets are
// also the other half of the preserved, frozen 16-question
// 'security-guard-foundation' content -- the remaining 8 live in
// security-guard-foundation.assets.ts (the `security_professional` profile
// pool) and were already tagged with 'security-guard-foundation'. These 8
// Universal Core assets were missing that same tag, so
// byDefinition('security-guard-foundation') / assembleQuestionSet(...)
// returned only 8 of the assessment's 16 questions -- the employer
// catalogue's "8 questions, ~2 minutes" display was reading that same
// undercount, not a separate bug. Adding 'security-guard-foundation' here
// is purely additive metadata: no question text, mapping, or scoring
// changes; 'public-career-assessment' behaviour is unchanged since it
// stays in the array unchanged.
export const coreAssets: QuestionAsset[] = [
  {
    id: "core-01",
    version: 1,
    status: "published",
    category: "integrity",
    competencies: ["comp-integrity"],
    dimensions: ["structure_documentation", "conflict_management"],
    tags: ["universal-core", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q2"),
    mapping: legacyMapping("q2"),
  },
  {
    id: "core-02",
    version: 1,
    status: "published",
    category: "judgement",
    competencies: ["comp-judgement"],
    dimensions: ["independent_decision_making", "analytical_orientation"],
    tags: ["universal-core", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q8"),
    mapping: legacyMapping("q8"),
  },
  {
    id: "core-03",
    version: 1,
    status: "published",
    category: "responsibility",
    competencies: ["comp-reliability"],
    dimensions: ["structure_documentation", "risk_awareness"],
    tags: ["universal-core", "behavioural"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "behavioural",
    content: legacyQuestion("q1"),
    mapping: legacyMapping("q1"),
  },
  {
    id: "core-04",
    version: 1,
    status: "published",
    category: "communication",
    competencies: ["comp-clear-communication"],
    dimensions: ["communication"],
    tags: ["universal-core", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q6"),
    mapping: legacyMapping("q6"),
  },
  {
    id: "core-05",
    version: 1,
    status: "published",
    category: "collaboration",
    competencies: ["comp-collaboration"],
    dimensions: ["teamwork", "independent_decision_making"],
    tags: ["universal-core", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q13"),
    mapping: legacyMapping("q13"),
  },
  {
    id: "core-06",
    version: 1,
    status: "published",
    category: "risk-awareness",
    competencies: ["comp-risk-recognition"],
    dimensions: ["risk_awareness"],
    tags: ["universal-core", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q4"),
    mapping: legacyMapping("q4"),
  },
  {
    id: "core-07",
    version: 1,
    status: "published",
    category: "prioritisation",
    competencies: ["comp-prioritisation"],
    dimensions: ["operational_orientation", "conflict_management"],
    tags: ["universal-core", "scenario-based"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "scenario-based",
    content: legacyQuestion("q12"),
    mapping: legacyMapping("q12"),
  },
  {
    id: "core-08",
    version: 1,
    status: "published",
    category: "learning-orientation",
    competencies: ["comp-learning-agility"],
    dimensions: ["learning_development"],
    tags: ["universal-core", "behavioural"],
    supportedAssessmentDefinitions: ["public-career-assessment", "security-guard-foundation"],
    evidenceType: "behavioural",
    content: legacyQuestion("q11"),
    mapping: legacyMapping("q11"),
  },
];

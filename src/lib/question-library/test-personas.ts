import type { AnswerMap } from "@/lib/career-assessment/types";
import type { AssessmentProfileId } from "./types";

// Regression personas for the two brand-new Public Career Assessment
// profile pools (student_or_new, career_changer). test-personas.ts under
// src/lib/career-assessment/ is frozen (it covers only the original,
// preserved 16-question set) -- these are new, additive personas exercising
// the newly-assembled question sets, run by scripts/question-library-check.ts.
//
// Two personas per profile: a confident/positive answer pattern (general
// sanity: no crash, plausible top match) and a hesitant/low-evidence
// pattern (regression target: Potential must exceed Current Fit for at
// least one match, mirroring career-assessment/test-personas.ts's own
// E_student_exploring persona and the documented "missing experience is
// not unsuitability" safeguard).
export interface QuestionLibraryPersona {
  id: string;
  profileId: AssessmentProfileId;
  description: string;
  answers: AnswerMap;
  expectPotentialAboveCurrentFit: boolean;
}

const coreConfidentAnswers: AnswerMap = {
  q2: "follow_procedure",
  q8: "continue_alert",
  q1: "always",
  q6: "facts_first",
  q13: "discuss_and_agree",
  q4: "proactive",
  q12: "triage_and_flag",
  q11: "fast_proactive",
};

const coreHesitantAnswers: AnswerMap = {
  q2: "let_it_go",
  q8: "second_guess",
  q1: "variable",
  q6: "next_steps",
  q13: "split_and_go_own_way",
  q4: "reactive",
  q12: "both_at_once",
  q11: "slower_than_liked",
};

export const questionLibraryPersonas: QuestionLibraryPersona[] = [
  {
    id: "SN_confident_entry",
    profileId: "student_or_new",
    description:
      "Student/new entrant answering confidently and consistently across all 16 questions.",
    answers: {
      ...coreConfidentAnswers,
      "stu-01": "committed",
      "stu-02": "thorough",
      "stu-03": "full_check",
      "stu-04": "full_help",
      "stu-05": "calm_read",
      "stu-06": "curious",
      q16: ["field", "coordination"],
      "stu-08": "lead",
    },
    expectPotentialAboveCurrentFit: false,
  },
  {
    id: "SN_hesitant_newcomer",
    profileId: "student_or_new",
    description:
      "Student/new entrant with genuinely uncertain, low-confidence answers and no prior track record -- the exact audience the evidence-scale / Potential-boost safeguard exists for.",
    answers: {
      ...coreHesitantAnswers,
      "stu-01": "coasting",
      "stu-02": "quick_no_retain",
      "stu-03": "partial",
      "stu-04": "redirect",
      "stu-05": "stressed",
      "stu-06": "unsure",
      q16: ["office"],
      "stu-08": "hands_on",
    },
    expectPotentialAboveCurrentFit: true,
  },
  {
    id: "CC_confident_transfer",
    profileId: "career_changer",
    description:
      "Career changer confidently transferring strong habits from a prior, unrelated industry.",
    answers: {
      ...coreConfidentAnswers,
      "chg-01": "consistent",
      "chg-02": "raise_first",
      "chg-03": "facts_ordered",
      "chg-04": "resolve",
      "chg-05": "compartmentalize",
      q10: "adjust_same_shift",
      q16: ["field", "public"],
      "chg-08": "leadership",
    },
    expectPotentialAboveCurrentFit: false,
  },
  {
    id: "CC_hesitant_transition",
    profileId: "career_changer",
    description:
      "Career changer still finding their footing in a new industry -- uncertain answers, no security-sector track record to draw on.",
    answers: {
      ...coreHesitantAnswers,
      "chg-01": "inconsistent",
      "chg-02": "continue_no_question",
      "chg-03": "apology_only",
      "chg-04": "defensive",
      "chg-05": "affected",
      q10: "revert_to_old",
      q16: ["office"],
      "chg-08": "structured",
    },
    expectPotentialAboveCurrentFit: true,
  },
];

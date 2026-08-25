// The nine equivalence personas for the v3.2 question-refinement mandate.
//
// These are RAW RESPONSE SETS, not dimension scores. That distinction is the
// whole point: the golden-persona fixture (../../src/lib/career-discovery/
// v31/golden-persona-fixtures.ts) starts from hand-authored dimension
// vectors, which would prove nothing about a wording change because wording
// sits UPSTREAM of dimensions. A refinement that accidentally moved an item's
// primary dimension, swapped an option id or renumbered the scale would leave
// those fixtures untouched and pass. Starting from response ids is the only
// way the proof binds.
//
// Every scale value is a raw 1-10 response and every single-choice value is a
// real option id from ../../src/lib/career-discovery/v31/option-matrix.ts.
// Nothing here may change in the v3.2 branch: the personas are the constant
// against which old and new wording are compared.

import type { Answer } from "../../src/lib/career-discovery/v31/scoring";
import type { ContextStatus } from "../../src/lib/career-discovery/types";
import type { ExperienceBand } from "../../src/lib/career-discovery/career-context";

/** The 14 scale item ids, in registry order. */
const SCALE_IDS = [
  "CQ01",
  "CQ04",
  "CQ05",
  "CQ07",
  "CQ08",
  "CQ10",
  "CQ11",
  "CQ13",
  "CQ14",
  "CQ16",
  "CQ18",
  "CQ19",
  "CQ21",
  "CQ22",
] as const;

/** The 8 single-choice item ids, in registry order. */
const CHOICE_IDS = ["CQ02", "CQ03", "CQ06", "CQ09", "CQ12", "CQ15", "CQ17", "CQ20"] as const;

type ScaleId = (typeof SCALE_IDS)[number];
type ChoiceId = (typeof CHOICE_IDS)[number];

export interface EquivalencePersona {
  readonly key: string;
  readonly label: string;
  readonly contextStatus: ContextStatus;
  readonly experienceBand: ExperienceBand | null;
  readonly currentProfessionCigSlug: string | null;
  /** Report tags from the 4 Discovery Path answers — contextual, unscored. */
  readonly discoveryTags: readonly string[];
  readonly scales: Readonly<Record<ScaleId, number>>;
  readonly choices: Readonly<Record<ChoiceId, "A" | "B" | "C" | "D">>;
}

/** Raw responses -> the Answer[] the engine consumes. Registry order is
 *  fixed here so the array itself is deterministic; scoring is order-
 *  independent (guard 9.2) but the fixture should not rely on that. */
export function answersOf(p: EquivalencePersona): Answer[] {
  const out: Answer[] = [];
  for (const id of SCALE_IDS) {
    out.push({ itemId: id, format: "scale", value: p.scales[id] });
  }
  for (const id of CHOICE_IDS) {
    out.push({ itemId: id, format: "single_choice", optionId: `${id}_${p.choices[id]}` });
  }
  return out.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export const EQUIVALENCE_PERSONAS: readonly EquivalencePersona[] = [
  {
    key: "student_new_entrant",
    label: "1 · Student / new entrant",
    contextStatus: "exploring_security",
    experienceBand: null,
    currentProfessionCigSlug: null,
    discoveryTags: ["operational_interest", "high_people_contact"],
    scales: {
      CQ01: 7,
      CQ04: 6,
      CQ05: 8,
      CQ07: 5,
      CQ08: 6,
      CQ10: 5,
      CQ11: 4,
      CQ13: 5,
      CQ14: 5,
      CQ16: 8,
      CQ18: 8,
      CQ19: 6,
      CQ21: 4,
      CQ22: 4,
    },
    choices: {
      CQ02: "D",
      CQ03: "A",
      CQ06: "A",
      CQ09: "A",
      CQ12: "B",
      CQ15: "A",
      CQ17: "B",
      CQ20: "C",
    },
  },
  {
    key: "operational",
    label: "2 · Operational",
    contextStatus: "working_in_security",
    experienceBand: "4_7y",
    currentProfessionCigSlug: "vaktare",
    discoveryTags: ["operational_interest", "team_orientation"],
    scales: {
      CQ01: 10,
      CQ04: 4,
      CQ05: 7,
      CQ07: 7,
      CQ08: 4,
      CQ10: 9,
      CQ11: 8,
      CQ13: 5,
      CQ14: 4,
      CQ16: 6,
      CQ18: 7,
      CQ19: 9,
      CQ21: 5,
      CQ22: 5,
    },
    choices: {
      CQ02: "C",
      CQ03: "B",
      CQ06: "A",
      CQ09: "A",
      CQ12: "A",
      CQ15: "A",
      CQ17: "A",
      CQ20: "A",
    },
  },
  {
    key: "technical",
    label: "3 · Technical",
    contextStatus: "working_in_security",
    experienceBand: "4_7y",
    currentProfessionCigSlug: null,
    discoveryTags: ["technology_interest", "independent_focus"],
    scales: {
      CQ01: 4,
      CQ04: 9,
      CQ05: 4,
      CQ07: 7,
      CQ08: 10,
      CQ10: 4,
      CQ11: 8,
      CQ13: 3,
      CQ14: 6,
      CQ16: 9,
      CQ18: 4,
      CQ19: 7,
      CQ21: 5,
      CQ22: 5,
    },
    choices: {
      CQ02: "A",
      CQ03: "D",
      CQ06: "C",
      CQ09: "C",
      CQ12: "C",
      CQ15: "C",
      CQ17: "C",
      CQ20: "B",
    },
  },
  {
    key: "investigative",
    label: "4 · Investigative",
    contextStatus: "working_in_security",
    experienceBand: "8_plus_y",
    currentProfessionCigSlug: null,
    discoveryTags: ["investigative_interest", "independent_focus"],
    scales: {
      CQ01: 5,
      CQ04: 10,
      CQ05: 6,
      CQ07: 8,
      CQ08: 6,
      CQ10: 7,
      CQ11: 7,
      CQ13: 4,
      CQ14: 7,
      CQ16: 8,
      CQ18: 5,
      CQ19: 8,
      CQ21: 6,
      CQ22: 6,
    },
    choices: {
      CQ02: "B",
      CQ03: "A",
      CQ06: "B",
      CQ09: "B",
      CQ12: "B",
      CQ15: "C",
      CQ17: "B",
      CQ20: "B",
    },
  },
  {
    key: "aml_compliance",
    label: "5 · AML / compliance",
    contextStatus: "working_in_security",
    experienceBand: "8_plus_y",
    currentProfessionCigSlug: null,
    discoveryTags: ["preventive_interest", "independent_focus"],
    scales: {
      CQ01: 3,
      CQ04: 8,
      CQ05: 5,
      CQ07: 10,
      CQ08: 5,
      CQ10: 7,
      CQ11: 6,
      CQ13: 4,
      CQ14: 7,
      CQ16: 9,
      CQ18: 6,
      CQ19: 8,
      CQ21: 10,
      CQ22: 10,
    },
    choices: {
      CQ02: "C",
      CQ03: "C",
      CQ06: "B",
      CQ09: "D",
      CQ12: "B",
      CQ15: "C",
      CQ17: "D",
      CQ20: "D",
    },
  },
  {
    key: "risk_crisis",
    label: "6 · Risk / crisis",
    contextStatus: "working_in_security",
    experienceBand: "8_plus_y",
    currentProfessionCigSlug: null,
    discoveryTags: ["preventive_interest", "team_orientation"],
    scales: {
      CQ01: 8,
      CQ04: 7,
      CQ05: 7,
      CQ07: 8,
      CQ08: 6,
      CQ10: 9,
      CQ11: 8,
      CQ13: 7,
      CQ14: 9,
      CQ16: 7,
      CQ18: 7,
      CQ19: 10,
      CQ21: 7,
      CQ22: 6,
    },
    choices: {
      CQ02: "C",
      CQ03: "A",
      CQ06: "D",
      CQ09: "D",
      CQ12: "D",
      CQ15: "B",
      CQ17: "D",
      CQ20: "A",
    },
  },
  {
    key: "leadership",
    label: "7 · Leadership",
    contextStatus: "security_leader",
    experienceBand: "8_plus_y",
    currentProfessionCigSlug: null,
    discoveryTags: ["preventive_interest", "team_orientation"],
    scales: {
      CQ01: 6,
      CQ04: 6,
      CQ05: 9,
      CQ07: 8,
      CQ08: 5,
      CQ10: 9,
      CQ11: 9,
      CQ13: 10,
      CQ14: 10,
      CQ16: 8,
      CQ18: 9,
      CQ19: 9,
      CQ21: 7,
      CQ22: 6,
    },
    choices: {
      CQ02: "D",
      CQ03: "B",
      CQ06: "D",
      CQ09: "D",
      CQ12: "D",
      CQ15: "D",
      CQ17: "D",
      CQ20: "C",
    },
  },
  {
    key: "broad_junior",
    label: "8 · Broad junior",
    contextStatus: "exploring_security",
    experienceBand: "under_1y",
    currentProfessionCigSlug: null,
    discoveryTags: ["investigative_interest", "team_orientation"],
    scales: {
      CQ01: 6,
      CQ04: 6,
      CQ05: 6,
      CQ07: 6,
      CQ08: 6,
      CQ10: 6,
      CQ11: 6,
      CQ13: 6,
      CQ14: 6,
      CQ16: 6,
      CQ18: 6,
      CQ19: 6,
      CQ21: 6,
      CQ22: 6,
    },
    choices: {
      CQ02: "B",
      CQ03: "B",
      CQ06: "B",
      CQ09: "B",
      CQ12: "B",
      CQ15: "B",
      CQ17: "B",
      CQ20: "B",
    },
  },
  {
    key: "broad_senior",
    label: "9 · Broad senior",
    contextStatus: "developing_current_role",
    experienceBand: "8_plus_y",
    currentProfessionCigSlug: "vaktare",
    discoveryTags: ["operational_interest", "preventive_interest"],
    scales: {
      CQ01: 9,
      CQ04: 8,
      CQ05: 8,
      CQ07: 9,
      CQ08: 8,
      CQ10: 9,
      CQ11: 9,
      CQ13: 9,
      CQ14: 9,
      CQ16: 9,
      CQ18: 9,
      CQ19: 9,
      CQ21: 8,
      CQ22: 8,
    },
    choices: {
      CQ02: "A",
      CQ03: "C",
      CQ06: "C",
      CQ09: "C",
      CQ12: "C",
      CQ15: "D",
      CQ17: "C",
      CQ20: "D",
    },
  },
];

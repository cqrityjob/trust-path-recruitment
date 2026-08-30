// The eight answer-level Career DNA regression personas.
//
// ── WHY THESE EXIST ALONGSIDE THE GOLDEN PERSONAS ──────────────────────
//
// src/lib/career-discovery/v31/golden-persona-fixtures.ts holds sixteen
// personas as PRE-COMPUTED DIMENSION SCORES. That is the right shape for
// what it guards -- profession matching against a known dimension vector --
// but it means the entire instrument above the matcher (the 22 core items,
// the forced-choice option matrix, the role weights, the aggregation) is
// bypassed. Nothing in CI proved that real ANSWERS produce differentiated
// professions; only that hand-written dimension vectors do.
//
// These personas start one layer earlier, at the raw answer vector a
// candidate actually submits, so the whole chain is exercised:
//
//   answers -> evidence -> dimensions -> affinity -> gates -> priority
//           -> stage -> the candidate-facing top 3
//
// ── HOW THEY WERE AUTHORED ─────────────────────────────────────────────
//
// Each persona is a faithful encoding of a described human, written from
// the profile FORWARD and never tuned backward from a desired profession.
// That distinction is the whole value of the fixture: an answer vector
// adjusted until it produced a wanted output would prove only that it had
// been adjusted. Where a persona's result is arguable, the differentiation
// check asserts the CLUSTER it must land in (operational / technical /
// investigative), never a specific rank-1 profession -- there is no
// "if beginner then Väktare" rule here, and there must never be one.
//
// P1 Beginner Operational · P2 Beginner Technical · P3 Beginner
// Investigative · P4 Beginner Service/Coordination · P5 Experienced
// Operational · P6 Experienced Technical · P7 Strategic/Leadership ·
// P8 Risk/Crisis.

import type { Answer } from "../../src/lib/career-discovery/v31/scoring";
import type { ContextStatus } from "../../src/lib/career-discovery/types";
import type { ExperienceBand } from "../../src/lib/career-discovery/career-context";

export interface AnswerPersona {
  readonly id: string;
  readonly label: string;
  readonly contextStatus: ContextStatus;
  readonly currentProfessionCigSlug?: string;
  readonly experienceBand?: ExperienceBand;
  /** path item id -> option value */
  readonly discovery: Readonly<Record<string, string>>;
  readonly scales: Readonly<Record<string, number>>;
  readonly choices: Readonly<Record<string, string>>;
}

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
];
const CHOICE_IDS = ["CQ02", "CQ03", "CQ06", "CQ09", "CQ12", "CQ15", "CQ17", "CQ20"];

export function answersFor(p: AnswerPersona): Answer[] {
  const out: Answer[] = [];
  for (const id of SCALE_IDS) {
    const v = p.scales[id];
    if (v === undefined) throw new Error(`${p.id}: missing scale ${id}`);
    out.push({ itemId: id, format: "scale", value: v });
  }
  for (const id of CHOICE_IDS) {
    const c = p.choices[id];
    if (c === undefined) throw new Error(`${p.id}: missing choice ${id}`);
    out.push({ itemId: id, format: "single_choice", optionId: `${id}_${c}` });
  }
  return out;
}

export const PERSONAS: readonly AnswerPersona[] = [
  {
    id: "P1",
    label: "Beginner Operational",
    contextStatus: "exploring_security",
    discovery: {
      ADAPT_EXPLORE_01: "a",
      ADAPT_EXPLORE_02: "a",
      ADAPT_EXPLORE_03: "a",
      ADAPT_EXPLORE_04: "a",
    },
    scales: {
      CQ01: 9,
      CQ04: 3,
      CQ05: 7,
      CQ07: 7,
      CQ08: 2,
      CQ10: 9,
      CQ11: 7,
      CQ13: 3,
      CQ14: 3,
      CQ16: 6,
      CQ18: 7,
      CQ19: 8,
      CQ21: 4,
      CQ22: 5,
    },
    choices: {
      CQ02: "D",
      CQ03: "D",
      CQ06: "D",
      CQ09: "A",
      CQ12: "A",
      CQ15: "A",
      CQ17: "D",
      CQ20: "A",
    },
  },
  {
    id: "P2",
    label: "Beginner Technical",
    contextStatus: "exploring_security",
    discovery: {
      ADAPT_EXPLORE_01: "d",
      ADAPT_EXPLORE_02: "c",
      ADAPT_EXPLORE_03: "c",
      ADAPT_EXPLORE_04: "d",
    },
    scales: {
      CQ01: 5,
      CQ04: 8,
      CQ05: 4,
      CQ07: 7,
      CQ08: 10,
      CQ10: 3,
      CQ11: 6,
      CQ13: 3,
      CQ14: 4,
      CQ16: 9,
      CQ18: 6,
      CQ19: 6,
      CQ21: 4,
      CQ22: 4,
    },
    choices: {
      CQ02: "A",
      CQ03: "C",
      CQ06: "B",
      CQ09: "A",
      CQ12: "A",
      CQ15: "D",
      CQ17: "D",
      CQ20: "D",
    },
  },
  {
    id: "P3",
    label: "Beginner Investigative",
    contextStatus: "exploring_security",
    discovery: {
      ADAPT_EXPLORE_01: "b",
      ADAPT_EXPLORE_02: "c",
      ADAPT_EXPLORE_03: "b",
      ADAPT_EXPLORE_04: "b",
    },
    scales: {
      CQ01: 4,
      CQ04: 9,
      CQ05: 5,
      CQ07: 8,
      CQ08: 3,
      CQ10: 4,
      CQ11: 6,
      CQ13: 3,
      CQ14: 5,
      CQ16: 8,
      CQ18: 5,
      CQ19: 6,
      CQ21: 6,
      CQ22: 6,
    },
    choices: {
      CQ02: "B",
      CQ03: "A",
      CQ06: "A",
      CQ09: "D",
      CQ12: "B",
      CQ15: "C",
      CQ17: "A",
      CQ20: "D",
    },
  },
  {
    id: "P4",
    label: "Beginner Service/Coordination",
    contextStatus: "exploring_security",
    discovery: {
      ADAPT_EXPLORE_01: "c",
      ADAPT_EXPLORE_02: "b",
      ADAPT_EXPLORE_03: "a",
      ADAPT_EXPLORE_04: "a",
    },
    scales: {
      CQ01: 6,
      CQ04: 4,
      CQ05: 9,
      CQ07: 7,
      CQ08: 3,
      CQ10: 6,
      CQ11: 5,
      CQ13: 7,
      CQ14: 5,
      CQ16: 7,
      CQ18: 9,
      CQ19: 7,
      CQ21: 5,
      CQ22: 5,
    },
    choices: {
      CQ02: "D",
      CQ03: "B",
      CQ06: "C",
      CQ09: "C",
      CQ12: "C",
      CQ15: "B",
      CQ17: "D",
      CQ20: "C",
    },
  },
  {
    id: "P5",
    label: "Experienced Operational",
    contextStatus: "working_in_security",
    currentProfessionCigSlug: "vaktare",
    experienceBand: "4_7y",
    discovery: {
      ADAPT_WORKING_01: "a",
      ADAPT_WORKING_02: "a",
      ADAPT_WORKING_03: "a",
      ADAPT_WORKING_04: "a",
    },
    scales: {
      CQ01: 9,
      CQ04: 4,
      CQ05: 7,
      CQ07: 8,
      CQ08: 3,
      CQ10: 9,
      CQ11: 8,
      CQ13: 5,
      CQ14: 4,
      CQ16: 6,
      CQ18: 7,
      CQ19: 9,
      CQ21: 5,
      CQ22: 6,
    },
    choices: {
      CQ02: "D",
      CQ03: "D",
      CQ06: "D",
      CQ09: "A",
      CQ12: "A",
      CQ15: "A",
      CQ17: "D",
      CQ20: "A",
    },
  },
  {
    id: "P6",
    label: "Experienced Technical",
    contextStatus: "developing_current_role",
    currentProfessionCigSlug: "sakerhetstekniker",
    experienceBand: "4_7y",
    discovery: {
      ADAPT_DEVELOP_01: "b",
      ADAPT_DEVELOP_02: "b",
      ADAPT_DEVELOP_03: "b",
      ADAPT_DEVELOP_04: "b",
    },
    scales: {
      CQ01: 5,
      CQ04: 9,
      CQ05: 5,
      CQ07: 8,
      CQ08: 10,
      CQ10: 3,
      CQ11: 7,
      CQ13: 4,
      CQ14: 6,
      CQ16: 9,
      CQ18: 6,
      CQ19: 7,
      CQ21: 5,
      CQ22: 5,
    },
    choices: {
      CQ02: "A",
      CQ03: "C",
      CQ06: "B",
      CQ09: "B",
      CQ12: "A",
      CQ15: "D",
      CQ17: "A",
      CQ20: "D",
    },
  },
  {
    id: "P7",
    label: "Strategic/Leadership",
    contextStatus: "security_leader",
    currentProfessionCigSlug: "sakerhetschef",
    experienceBand: "8_plus_y",
    discovery: {
      ADAPT_LEADER_01: "d",
      ADAPT_LEADER_02: "d",
      ADAPT_LEADER_03: "d",
      ADAPT_LEADER_04: "c",
    },
    scales: {
      CQ01: 4,
      CQ04: 5,
      CQ05: 8,
      CQ07: 8,
      CQ08: 4,
      CQ10: 7,
      CQ11: 8,
      CQ13: 10,
      CQ14: 9,
      CQ16: 8,
      CQ18: 8,
      CQ19: 8,
      CQ21: 6,
      CQ22: 6,
    },
    choices: {
      CQ02: "C",
      CQ03: "B",
      CQ06: "C",
      CQ09: "C",
      CQ12: "C",
      CQ15: "B",
      CQ17: "C",
      CQ20: "C",
    },
  },
  {
    id: "P8",
    label: "Risk/Crisis",
    contextStatus: "developing_current_role",
    discovery: {
      ADAPT_DEVELOP_01: "c",
      ADAPT_DEVELOP_02: "c",
      ADAPT_DEVELOP_03: "c",
      ADAPT_DEVELOP_04: "c",
    },
    scales: {
      CQ01: 4,
      CQ04: 8,
      CQ05: 6,
      CQ07: 9,
      CQ08: 5,
      CQ10: 5,
      CQ11: 7,
      CQ13: 6,
      CQ14: 10,
      CQ16: 8,
      CQ18: 8,
      CQ19: 8,
      CQ21: 7,
      CQ22: 8,
    },
    choices: {
      CQ02: "B",
      CQ03: "D",
      CQ06: "B",
      CQ09: "D",
      CQ12: "B",
      CQ15: "C",
      CQ17: "C",
      CQ20: "B",
    },
  },
];

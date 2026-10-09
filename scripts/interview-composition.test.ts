// The interview composition's pure half, exhausted: every core question is
// always in the selection, probes follow the question they deepen, positions
// are unique and ordered, and time/coverage come from the pack's own numbers.
//
// Run: bun test scripts/interview-composition.test.ts

import { describe, expect, test } from "bun:test";
import {
  COMPOSITION_GROUPS,
  SELECTABLE_GROUPS,
  buildSelection,
  coverageOf,
} from "../src/lib/recruitment/interview-composition";
import type { CompositionCatalog } from "../src/lib/recruitment/lifecycle-v03.functions";

const q = (
  n: number,
  type: "behavioural" | "situational",
  codes: string[],
  min: number | null = 6,
  max: number | null = 8,
) => ({
  id: `q${n}`,
  code: `Q${n}`,
  displayOrder: n,
  questionType: type,
  promptSv: `Fråga ${n}`,
  promptEn: null,
  durationMin: min,
  durationMax: max,
  competencyCodes: codes,
});
const catalog: CompositionCatalog = {
  packVersionId: "pv",
  packId: "p",
  versionNumber: 1,
  contentStatus: "draft",
  validationLabel: "pilot_hypothesis",
  locale: "sv-SE",
  packName: { sv: "Väktare", en: null },
  competencies: ["C1", "C2", "C3", "C4", "C5", "C6"].map((code, i) => ({
    id: `c${i + 1}`,
    code,
    nameSv: code,
    nameEn: null,
  })),
  coreQuestions: [
    q(1, "behavioural", ["C1"]),
    q(2, "behavioural", ["C2"]),
    q(3, "behavioural", ["C3"]),
    q(4, "behavioural", ["C4"]),
    q(5, "behavioural", ["C5"]),
    q(6, "behavioural", ["C6"], null, null),
    q(7, "situational", ["C1", "C2"]),
    q(8, "situational", ["C1", "C3"]),
  ],
  approvedProbes: [
    {
      id: "p1",
      questionId: "q1",
      purpose: "example",
      wordingSv: "Ett exempel?",
      wordingEn: null,
      displayOrder: 1,
    },
    {
      id: "p2",
      questionId: "q1",
      purpose: "own_role",
      wordingSv: "Din roll?",
      wordingEn: null,
      displayOrder: 2,
    },
    {
      id: "p3",
      questionId: "q8",
      purpose: "effect",
      wordingSv: "Effekten?",
      wordingEn: null,
      displayOrder: 1,
    },
    {
      id: "pg",
      questionId: null,
      purpose: "neutral_check",
      wordingSv: "Har jag förstått dig rätt?",
      wordingEn: null,
      displayOrder: 1,
    },
  ],
};

describe("the seven groups", () => {
  test("in the order the brief names them; only three carry governed content today", () => {
    expect([...COMPOSITION_GROUPS]).toEqual([
      "intro",
      "competence",
      "scenarios",
      "probes",
      "beskt",
      "clarifications",
      "closing",
    ]);
    expect([...SELECTABLE_GROUPS].sort()).toEqual(["competence", "probes", "scenarios"]);
  });
});

describe("the selection a catalogue implies", () => {
  test("every core question, always, in pack order, with no probe chosen", () => {
    const s = buildSelection(catalog, new Set());
    expect(s).toHaveLength(8);
    expect(s.map((x) => x.kind)).toEqual(Array(8).fill("core_question"));
    expect(s.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.map((x) => x.group)).toEqual([
      ...Array(6).fill("competence"),
      "scenarios",
      "scenarios",
    ]);
  });
  test("a chosen probe follows the question it deepens; a general probe comes last", () => {
    const s = buildSelection(catalog, new Set(["p2", "p3", "pg", "unknown"]));
    expect(s.map((x) => x.itemId)).toEqual([
      "q1",
      "p2",
      "q2",
      "q3",
      "q4",
      "q5",
      "q6",
      "q7",
      "q8",
      "p3",
      "pg",
    ]);
    expect(new Set(s.map((x) => x.position)).size).toBe(s.length);
    expect(s.filter((x) => x.kind === "approved_probe").every((x) => x.group === "probes")).toBe(
      true,
    );
  });
  test("a probe id that is not in the catalogue is never selected", () => {
    expect(buildSelection(catalog, new Set(["ghost"])).some((x) => x.itemId === "ghost")).toBe(
      false,
    );
  });
});

describe("time and coverage come from the pack's own numbers", () => {
  test("core only", () => {
    const c = coverageOf(catalog, buildSelection(catalog, new Set()));
    expect(c.min).toBe(7 * 6);
    expect(c.max).toBe(7 * 8);
    expect(c.covered).toBe(6);
    expect(c.total).toBe(6);
    expect(c.missing).toEqual([]);
  });
  test("probes add one to two minutes each; a missing area is named", () => {
    const c = coverageOf(catalog, buildSelection(catalog, new Set(["p1", "pg"])));
    expect(c.min).toBe(7 * 6 + 2);
    expect(c.max).toBe(7 * 8 + 4);
    const partial = coverageOf(
      catalog,
      buildSelection(catalog, new Set()).filter((x) => x.itemId !== "q6"),
    );
    expect(partial.missing).toEqual(["C6"]);
    expect(partial.covered).toBe(5);
  });
});

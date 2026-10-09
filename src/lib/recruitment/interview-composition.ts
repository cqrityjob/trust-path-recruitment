// The interview composition's pure half: the seven groups a recruiter sees,
// the selection a catalogue implies, and the time/coverage arithmetic over the
// pack's own numbers. No I/O, so a guard can exhaust it; the panel renders.

import type { CompositionCatalog, SelectionItem } from "./lifecycle-v03.functions";

export const COMPOSITION_GROUPS = [
  "intro",
  "competence",
  "scenarios",
  "probes",
  "beskt",
  "clarifications",
  "closing",
] as const;
export type CompositionGroup = (typeof COMPOSITION_GROUPS)[number];

/** The groups that carry governed content in a pack version today. */
export const SELECTABLE_GROUPS: ReadonlySet<CompositionGroup> = new Set([
  "competence",
  "scenarios",
  "probes",
]);

export function compositionQueryKey(employerId: string, jobId: string) {
  return ["employer", employerId, "interview-composition", jobId] as const;
}

/** The selection a catalogue implies: every core question (always), plus the
 *  probes whose ids are chosen. Positions follow the pack's own order, probes
 *  after the question they deepen. Pure. */
export function buildSelection(
  catalog: CompositionCatalog,
  chosenProbes: ReadonlySet<string>,
): SelectionItem[] {
  const out: SelectionItem[] = [];
  let position = 1;
  for (const q of [...catalog.coreQuestions].sort((a, b) => a.displayOrder - b.displayOrder)) {
    out.push({
      group: q.questionType === "situational" ? "scenarios" : "competence",
      kind: "core_question",
      itemId: q.id,
      position: position++,
    });
    for (const p of catalog.approvedProbes
      .filter((x) => x.questionId === q.id && chosenProbes.has(x.id))
      .sort((a, b) => a.displayOrder - b.displayOrder)) {
      out.push({ group: "probes", kind: "approved_probe", itemId: p.id, position: position++ });
    }
  }
  for (const p of catalog.approvedProbes
    .filter((x) => x.questionId === null && chosenProbes.has(x.id))
    .sort((a, b) => a.displayOrder - b.displayOrder)) {
    out.push({ group: "probes", kind: "approved_probe", itemId: p.id, position: position++ });
  }
  return out;
}

/** Time and coverage, from the pack's own numbers. A probe without a stated
 *  duration adds the conservative two minutes the guide allows for one. */
export function coverageOf(catalog: CompositionCatalog, selection: readonly SelectionItem[]) {
  const chosen = new Set(selection.map((s) => s.itemId));
  let min = 0;
  let max = 0;
  const covered = new Set<string>();
  for (const q of catalog.coreQuestions) {
    if (!chosen.has(q.id)) continue;
    min += q.durationMin ?? 0;
    max += q.durationMax ?? q.durationMin ?? 0;
    for (const c of q.competencyCodes) covered.add(c);
  }
  const probes = catalog.approvedProbes.filter((p) => chosen.has(p.id)).length;
  min += probes * 1;
  max += probes * 2;
  const missing = catalog.competencies.map((c) => c.code).filter((c) => !covered.has(c));
  return { min, max, covered: covered.size, total: catalog.competencies.length, missing };
}

export function supplementQueryKey(employerId: string, applicationId: string) {
  return ["employer", employerId, "supplement", applicationId] as const;
}

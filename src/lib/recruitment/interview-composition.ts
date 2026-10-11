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

/** The groups that carry governed content a recruitment may choose from:
 *  the pack version's three, and -- from slot 20270315100000 -- the published
 *  BESKT items for recruitment support. Introduction, clarifications and the
 *  closing stay structural until their SV/EN texts are approved by a person. */
export const SELECTABLE_GROUPS: ReadonlySet<CompositionGroup> = new Set([
  "competence",
  "scenarios",
  "probes",
  "beskt",
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
  chosenBeskt: ReadonlySet<string> = new Set(),
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
  // BESKT items last, in the method's own section/item order, only those the
  // catalogue lists (the server verifies them again against the published
  // version and refuses vetting content: RI_COMPOSITION_VETTING_ONLY).
  for (const b of (catalog.besktItems ?? []).filter((x) => chosenBeskt.has(x.id))) {
    out.push({ group: "beskt", kind: "beskt_item", itemId: b.id, position: position++ });
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
  // A BESKT item states no duration; an open question with its purpose
  // explained is given the conservative two to four minutes.
  const beskt = (catalog.besktItems ?? []).filter((b) => chosen.has(b.id)).length;
  min += beskt * 2;
  max += beskt * 4;
  const missing = catalog.competencies.map((c) => c.code).filter((c) => !covered.has(c));
  return { min, max, covered: covered.size, total: catalog.competencies.length, missing };
}

export function supplementQueryKey(employerId: string, applicationId: string) {
  return ["employer", employerId, "supplement", applicationId] as const;
}

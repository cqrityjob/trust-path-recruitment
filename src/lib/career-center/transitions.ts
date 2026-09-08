// One recorded move between two professions, explained — and the evidence
// bar it has to clear before it may be explained at all.
//
// ── WHAT THE PROFESSION GUIDE USED TO DO ───────────────────────────────
//
// It showed "Vanliga steg härifrån" as a list of role names. A reader learned
// that Säkerhetschef exists and that somebody thinks it comes after
// Ordningsvakt. They did not learn why it is possible, what they would need,
// or whether anything stands between the two.
//
// ── AND WHAT THE FIRST FIX GOT WRONG ───────────────────────────────────
//
// It explained everything it could find, including edges marked
// `status: "placeholder"` — records with no source, no jurisdiction and no
// review date — and rendered them beside sourced ones in identical cards,
// with a "Vanlig övergång" badge taken from an editorial `likelihood` field
// that no evidence supported. Two of the three flagship routes rested on
// exactly those placeholder edges.
//
// That is the same failure the publishability rule exists to prevent, one
// level down: unfinished content presented as finished. So a transition now
// has to earn its wording.
//
// ── THE EVIDENCE BAR ───────────────────────────────────────────────────
//
//   reviewed      an explicit `careerPaths` edge whose status is not
//                 placeholder, carrying at least one credible source of its
//                 OWN, a jurisdiction, and a review date that parses and is
//                 not older than TRANSITION_REVIEW_MAX_AGE_DAYS.
//                 May render its reviewed prose.
//
//   under_review  everything else, including every implicit
//                 nextRoles/previousRoles link. Renders as a possible
//                 direction under review: the two role names, the derived
//                 competency overlap, and nothing else. No likelihood, no
//                 experience statement, no progression wording.
//
// Note "of its OWN". A guide's statutory sources are evidence about the ROLE.
// They are not evidence about the MOVE, and an edge may not borrow them.
//
// ── FREQUENCY IS A SEPARATE, HIGHER BAR ────────────────────────────────
//
// "Vanlig övergång" is a claim about how many people do something. The only
// thing that supports it is evidence about that exact transition — statistics,
// a register, a study. `frequencyEvidence` carries that and nothing else does;
// `likelihood` alone can never produce a label. No edge in this dataset has
// frequency evidence, so no frequency label renders anywhere. That is the
// correct output, not a missing feature.
//
// ── THREE KINDS, DERIVED, NEVER TYPED IN ───────────────────────────────
//
//   formal_gate   The destination is a REGULATED role that states formal
//                 requirements: a mandated training, an approval, or an
//                 appointment by an authority. Nobody moves into it by doing
//                 well at the current job. Highest precedence.
//
//   long_term     Not gated, but two or more levels away, or a role that
//                 demands leadership at a higher level than the current one
//                 does and sits at senior level or above. A direction of
//                 travel, not a next step.
//
//   adjacent      Everything else: the nearest recorded move.
//
// Each rule reads fields the guides already carry and already source. None is
// a judgement typed into this file, and none can disagree with the guide it
// describes, because it IS the guide.

import type {
  Bi,
  CareerPath,
  CompetencyId,
  EducationId,
  ExperienceLevel,
  Profession,
  ProficiencyLevel,
  Region,
  SourceRef,
} from "./types";
import { careerPaths } from "./career-paths";
import { publishedProfessions, getPublishedProfession } from "./publishability";

/**
 * Every recorded transition between two professions, from either direction
 * the dataset happens to express it in.
 *
 * Returns the `careerPaths` edge when one exists, the marker `"implicit"`
 * when only a nextRoles / previousRoles link records the move, and `null`
 * when the data records nothing — which is the answer every caller must
 * respect. Nothing in the Career Center may render a move this function does
 * not confirm.
 *
 * It does NOT decide whether the move may be DESCRIBED. That is
 * `transitionEvidenceLevel`, and the two are deliberately separate: an edge
 * can exist and still have nothing publishable to say about itself.
 */
export function transitionBetween(fromId: string, toId: string): CareerPath | "implicit" | null {
  const edge = careerPaths.find((p) => p.from === fromId && p.to === toId);
  if (edge) return edge;
  const from = getPublishedProfession(fromId);
  const to = getPublishedProfession(toId);
  if (from?.nextRoles?.includes(toId)) return "implicit";
  if (to?.previousRoles?.includes(fromId)) return "implicit";
  return null;
}

export type TransitionKind = "adjacent" | "formal_gate" | "long_term";

/** How the dataset records the move. `edge` carries reviewed prose; `implicit`
 *  is a nextRoles / previousRoles link and carries only derived facts. */
export type TransitionEvidence = "edge" | "implicit";

/** Whether the move may be described, or only named. */
export type TransitionEvidenceLevel = "reviewed" | "under_review";

/**
 * How old a transition's review may be before it stops counting as reviewed.
 *
 * Two years. The claims are about law and law moves: this repository already
 * had a guide citing an Act repealed in 2023 as the current requirement, and
 * a review date that never expires is how that survives. When a date lapses
 * the transition degrades to `under_review` — it stops making claims rather
 * than disappearing, which is the honest failure mode.
 */
export const TRANSITION_REVIEW_MAX_AGE_DAYS = 730;

/** The date the freshness rule is evaluated against. Injectable so the guard
 *  can prove the rule bites without waiting two years. */
export function isFreshReview(iso: string | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const at = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(at)) return false;
  const ageDays = (now.getTime() - at) / 86_400_000;
  // A future review date is not fresh, it is wrong.
  if (ageDays < 0) return false;
  return ageDays <= TRANSITION_REVIEW_MAX_AGE_DAYS;
}

function credibleSources(sources: readonly SourceRef[] | undefined): readonly SourceRef[] {
  return (sources ?? []).filter(
    (s) => s.label?.sv?.trim() && s.label?.en?.trim() && (Boolean(s.url) || Boolean(s.publisher)),
  );
}

/**
 * Whether a recorded transition may be described rather than merely named.
 *
 * Exported so the guard can assert it per edge, and so a route builder can
 * refuse to consume an unreviewed one.
 */
export function transitionEvidenceLevel(
  record: CareerPath | "implicit" | null,
  now: Date = new Date(),
): TransitionEvidenceLevel {
  if (!record || record === "implicit") return "under_review";
  if (record.status === "placeholder") return "under_review";
  if (credibleSources(record.sources).length === 0) return "under_review";
  if ((record.countries?.length ?? 0) === 0) return "under_review";
  if (!isFreshReview(record.lastVerified, now)) return "under_review";
  return "reviewed";
}

export interface RaisedDemand {
  readonly competencyId: CompetencyId;
  /** 0 when the origin does not require the competency at all. */
  readonly from: ProficiencyLevel | 0;
  readonly to: ProficiencyLevel;
}

export interface ProfessionTransition {
  readonly from: Profession;
  readonly to: Profession;
  readonly kind: TransitionKind;
  readonly evidence: TransitionEvidence;
  readonly evidenceLevel: TransitionEvidenceLevel;
  /**
   * A frequency label, or `null`.
   *
   * Non-null ONLY when the edge carries `frequencyEvidence` — evidence about
   * this exact transition. It is `null` everywhere in the current dataset,
   * and a caller must render nothing rather than falling back to `likelihood`.
   */
  readonly likelihood: "common" | "possible" | null;
  /** The sources for the frequency claim, when there is one. */
  readonly frequencyEvidence: readonly SourceRef[];
  /** Competencies BOTH roles demand. Derived from the two guides, so it is
   *  available at either evidence level: it restates what the guides already
   *  say rather than making a claim about the move. */
  readonly transferable: readonly CompetencyId[];
  /** Competencies the destination demands and the origin does not, or demands
   *  at a higher level. Also derived from the guides. */
  readonly raised: readonly RaisedDemand[];
  /** The DESTINATION's own formal requirements, verbatim. A property of the
   *  role, sourced on the role's own guide — not a claim about the move. */
  readonly formalRequirements: readonly Bi[];
  /** The destination's recorded education pathways. */
  readonly education: readonly EducationId[];
  /** Reviewed prose. EMPTY unless `evidenceLevel === "reviewed"`. */
  readonly notes: readonly Bi[];
  /** Experience statements. EMPTY unless `evidenceLevel === "reviewed"`:
   *  "this is what the move needs" is exactly the kind of claim an unsourced
   *  edge may not make. */
  readonly experienceRequired: readonly Bi[];
  /** The transition's own sources. Empty when under review. */
  readonly sources: readonly SourceRef[];
  /** The jurisdiction the transition's claims are made in. */
  readonly countries: readonly Region[];
  /** Published guides the graph records between origin and destination.
   *
   *  Populated for `long_term` moves only. On an adjacent or gated move the
   *  graph will happily produce a "middle" role, and offering a detour around
   *  a step somebody can already take is noise. */
  readonly via: readonly Profession[];
}

const LEVEL_ORDER: readonly ExperienceLevel[] = ["entry", "mid", "senior", "executive"];

function levelDistance(from: ExperienceLevel, to: ExperienceLevel): number {
  return LEVEL_ORDER.indexOf(to) - LEVEL_ORDER.indexOf(from);
}

function requiredLevel(p: Profession, competencyId: CompetencyId): ProficiencyLevel | 0 {
  return p.competencies.find((c) => c.competencyId === competencyId)?.requiredLevel ?? 0;
}

/**
 * Classify one move.
 *
 * Exported so the guard can assert the classification of specific pairs the
 * pilot depends on — a route that silently reclassified Säkerhetschef as an
 * adjacent step would otherwise only be visible by reading the page.
 */
export function transitionKind(from: Profession, to: Profession): TransitionKind {
  // 1. A regulated destination with stated formal requirements is a gate.
  //    `regulated` alone is not enough: a role can be regulated as an
  //    ACTIVITY (the AML Act binds the firm, not the analyst) and carry no
  //    personal requirement, and calling that a gate would invent one.
  if (to.regulated && (to.formalRequirements?.length ?? 0) > 0) return "formal_gate";

  // 2. Two rungs or more is a direction, not a step.
  if (levelDistance(from.level, to.level) >= 2) return "long_term";

  // 3. A senior role that demands more leadership than the origin does is
  //    also a direction: the gap is accumulated responsibility, which no
  //    course closes.
  const leadershipTo = requiredLevel(to, "leadership");
  const leadershipFrom = requiredLevel(from, "leadership");
  const seniorDestination = to.level === "senior" || to.level === "executive";
  if (seniorDestination && leadershipTo > leadershipFrom) return "long_term";

  return "adjacent";
}

/**
 * Published guides the graph records BETWEEN two professions.
 *
 * Pure graph reading: X qualifies when the data records a move from origin
 * into X and a move from X towards the destination.
 */
export function intermediateSteps(from: Profession, to: Profession): Profession[] {
  return publishedProfessions.filter(
    (x) =>
      x.id !== from.id &&
      x.id !== to.id &&
      transitionBetween(from.id, x.id) !== null &&
      transitionBetween(x.id, to.id) !== null,
  );
}

function describe(from: Profession, to: Profession, now: Date): ProfessionTransition {
  const kind = transitionKind(from, to);
  const record = transitionBetween(from.id, to.id);
  const edge = record && record !== "implicit" ? record : null;
  const evidenceLevel = transitionEvidenceLevel(record, now);
  const reviewed = evidenceLevel === "reviewed";

  const transferable = from.competencies
    .filter((c) => to.competencies.some((t) => t.competencyId === c.competencyId))
    .map((c) => c.competencyId);

  const raised: RaisedDemand[] = to.competencies
    .map((c) => ({
      competencyId: c.competencyId,
      from: requiredLevel(from, c.competencyId),
      to: c.requiredLevel,
    }))
    .filter((d) => d.to > d.from)
    .sort((a, b) => b.to - a.to || a.competencyId.localeCompare(b.competencyId));

  // A frequency label needs frequency evidence, full stop. `likelihood` is
  // never promoted to a label on its own.
  const frequencyEvidence = credibleSources(edge?.frequencyEvidence);
  const likelihood = frequencyEvidence.length > 0 ? (edge?.likelihood ?? null) : null;

  return {
    from,
    to,
    kind,
    evidence: edge ? "edge" : "implicit",
    evidenceLevel,
    likelihood,
    frequencyEvidence,
    transferable,
    raised,
    formalRequirements: to.formalRequirements ?? [],
    education: to.educationPathways ?? [],
    notes: reviewed && edge?.notes ? [edge.notes] : [],
    experienceRequired: reviewed && edge?.experienceRequired ? [edge.experienceRequired] : [],
    sources: reviewed ? credibleSources(edge?.sources) : [],
    countries: reviewed ? (edge?.countries ?? []) : [],
    via: kind === "long_term" ? intermediateSteps(from, to) : [],
  };
}

/** Ordered so a reader meets the nearest move first and the direction of
 *  travel last. Within a kind, a reviewed transition precedes one under
 *  review, then the shorter level jump, then the title — so the order is
 *  stable rather than array-position dependent. */
const KIND_ORDER: Readonly<Record<TransitionKind, number>> = {
  adjacent: 0,
  formal_gate: 1,
  long_term: 2,
};

function order(a: ProfessionTransition, b: ProfessionTransition): number {
  const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (byKind !== 0) return byKind;
  const byEvidence =
    (a.evidenceLevel === "reviewed" ? 0 : 1) - (b.evidenceLevel === "reviewed" ? 0 : 1);
  if (byEvidence !== 0) return byEvidence;
  const byLevel = levelDistance(a.from.level, a.to.level) - levelDistance(b.from.level, b.to.level);
  if (byLevel !== 0) return byLevel;
  return a.to.titleCanonical.localeCompare(b.to.titleCanonical);
}

/**
 * Every recorded onward move from a profession, explained, published only.
 *
 * A guide may only offer a move a reader can actually follow: an unpublished
 * destination is omitted rather than linked into the unavailable state.
 */
export function onwardTransitions(
  from: Profession,
  now: Date = new Date(),
): ProfessionTransition[] {
  const ids = new Set(from.nextRoles ?? []);
  // An edge recorded only in career-paths.ts, with no matching nextRoles
  // entry, is still a recorded transition and belongs here.
  for (const p of publishedProfessions) {
    if (p.id !== from.id && transitionBetween(from.id, p.id) !== null) ids.add(p.id);
  }
  return [...ids]
    .map((id) => getPublishedProfession(id))
    .filter((p): p is Profession => Boolean(p) && p!.id !== from.id)
    .map((to) => describe(from, to, now))
    .sort(order);
}

/** Recorded moves INTO a profession — "vanliga vägar hit". */
export function inboundTransitions(to: Profession, now: Date = new Date()): ProfessionTransition[] {
  const ids = new Set(to.previousRoles ?? []);
  for (const p of publishedProfessions) {
    if (p.id !== to.id && transitionBetween(p.id, to.id) !== null) ids.add(p.id);
  }
  return [...ids]
    .map((id) => getPublishedProfession(id))
    .filter((p): p is Profession => Boolean(p) && p!.id !== to.id)
    .map((from) => describe(from, to, now))
    .sort(order);
}

/** One named move, when the caller already knows both ends. Returns
 *  `undefined` when the data records nothing between them — a caller may not
 *  render a transition the dataset does not carry. */
export function describeTransition(
  fromId: string,
  toId: string,
  now: Date = new Date(),
): ProfessionTransition | undefined {
  const from = getPublishedProfession(fromId);
  const to = getPublishedProfession(toId);
  if (!from || !to) return undefined;
  if (transitionBetween(from.id, to.id) === null) return undefined;
  return describe(from, to, now);
}

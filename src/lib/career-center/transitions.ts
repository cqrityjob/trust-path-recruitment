// One recorded move between two professions, explained.
//
// ── WHAT THE PILOT ASKED FOR AND WHAT WAS MISSING ──────────────────────
//
// A profession guide showed "Vanliga steg härifrån" as a list of role names.
// A reader learned that Säkerhetschef exists and that somebody thinks it
// comes after Ordningsvakt. They did not learn why it is possible, what they
// would need, whether anything stands between the two, or what to do on
// Monday — which is the whole question the Career Center is for.
//
// Worse, the flat list gave every move the same weight. "Väktare ->
// Ordningsvakt" (a separate statutory training and a police appointment) and
// "Ordningsvakt -> Säkerhetschef" (two levels and a leadership function) were
// rendered as two identical rows. Presenting a senior leadership role as a
// next step for somebody in their first guarding job is not optimism, it is
// a false claim about how the industry works.
//
// ── THREE KINDS, DERIVED, NEVER TYPED IN ───────────────────────────────
//
//   formal_gate   The destination is a REGULATED role that states formal
//                 requirements: a mandated training, an approval, or an
//                 appointment by an authority. Nobody moves into it by doing
//                 well at the current job. Highest precedence — a gate is a
//                 gate regardless of how near the role otherwise looks.
//
//   long_term     Not gated, but two or more levels away, or a role that
//                 demands leadership at a higher level than the current one
//                 does and sits at senior level or above. Shown as a
//                 direction of travel, not as a next step.
//
//   adjacent      Everything else: the nearest recorded move.
//
// Each rule reads fields the guides already carry and already source
// (`regulated`, `formalRequirements`, `level`, the competency demands). None
// of them is a judgement typed into this file, and none can disagree with the
// guide it describes, because it IS the guide.
//
// ── WHAT IS NEVER SYNTHESISED ──────────────────────────────────────────
//
// Timing ("2-3 years"), salary, and any statement that a move is likely for
// a particular reader. `notes` and `experienceRequired` are rendered only
// when an explicit `careerPaths` edge carries them; an implicit
// nextRoles/previousRoles link renders the derived facts and nothing else.
// A transition with nothing sourced to say says nothing.
//
// ── THE INTERMEDIATE STEP ──────────────────────────────────────────────
//
// `intermediateSteps` answers "is there anything between here and there?"
// from the graph alone: a published profession the data records a move INTO
// from the origin and a move OUT OF towards the destination. That is what
// turns "Ordningsvakt -> Säkerhetschef" from an implausible leap into
// "Ordningsvakt -> Säkerhetssamordnare -> Säkerhetschef", without anybody
// authoring a chain. If the graph records no middle role, none is shown.

import type {
  Bi,
  CareerPath,
  CompetencyId,
  EducationId,
  ExperienceLevel,
  Profession,
  ProficiencyLevel,
} from "./types";
import { careerPaths } from "./career-paths";
import { publishedProfessions, getPublishedProfession } from "./publishability";

/**
 * Every recorded transition between two professions, from either direction
 * the dataset happens to express it in.
 *
 * Returns the reviewed `careerPaths` edge when one exists, the marker
 * `"implicit"` when only a nextRoles / previousRoles link records the move,
 * and `null` when the data records nothing — which is the answer every caller
 * must respect. Nothing in the Career Center may render a move this function
 * does not confirm.
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
  /** From an explicit edge only. `null` for an implicit link — an implicit
   *  link records that a move exists, not how usual it is. */
  readonly likelihood: "common" | "possible" | null;
  /** Competencies BOTH roles demand. The honest answer to "why is this
   *  possible for me": the work you already do is the work that carries. */
  readonly transferable: readonly CompetencyId[];
  /** Competencies the destination demands and the origin does not, or demands
   *  at a higher level. The honest answer to "what would I have to build". */
  readonly raised: readonly RaisedDemand[];
  /** The DESTINATION's own formal requirements, verbatim. Never rewritten
   *  into a softer sentence: a mandated approval is not "recommended". */
  readonly formalRequirements: readonly Bi[];
  /** The destination's recorded education pathways. */
  readonly education: readonly EducationId[];
  /** Reviewed prose from an explicit edge. Empty for an implicit link. */
  readonly notes: readonly Bi[];
  readonly experienceRequired: readonly Bi[];
  /** Published guides the graph records between origin and destination.
   *
   *  Populated for `long_term` moves only. On an adjacent or gated move the
   *  graph will happily produce a "middle" role — Väktare -> Ordningsvakt ->
   *  Säkerhetssamordnare makes Ordningsvakt an intermediate of an adjacent
   *  move — and offering a detour around a step somebody can already take is
   *  noise. The question "is there something between here and there?" is only
   *  worth answering when "there" is far away. */
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
 * into X and a move from X towards the destination. Never more than the graph
 * carries, and the destination and origin themselves are excluded.
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

function describe(from: Profession, to: Profession): ProfessionTransition {
  const kind = transitionKind(from, to);
  const record = transitionBetween(from.id, to.id);
  const edge = record && record !== "implicit" ? record : null;

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

  return {
    from,
    to,
    kind,
    evidence: edge ? "edge" : "implicit",
    likelihood: edge?.likelihood ?? null,
    transferable,
    raised,
    formalRequirements: to.formalRequirements ?? [],
    education: to.educationPathways ?? [],
    notes: edge?.notes ? [edge.notes] : [],
    experienceRequired: edge?.experienceRequired ? [edge.experienceRequired] : [],
    via: kind === "long_term" ? intermediateSteps(from, to) : [],
  };
}

/** Ordered so a reader meets the nearest move first and the direction of
 *  travel last. Within a kind, the shorter level jump comes first, then the
 *  title, so the order is stable rather than array-position dependent. */
const KIND_ORDER: Readonly<Record<TransitionKind, number>> = {
  adjacent: 0,
  formal_gate: 1,
  long_term: 2,
};

function order(a: ProfessionTransition, b: ProfessionTransition): number {
  const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (byKind !== 0) return byKind;
  const byLevel = levelDistance(a.from.level, a.to.level) - levelDistance(b.from.level, b.to.level);
  if (byLevel !== 0) return byLevel;
  return a.to.titleCanonical.localeCompare(b.to.titleCanonical);
}

/**
 * Every recorded onward move from a profession, explained, published only.
 *
 * A guide may only offer a move a reader can actually follow: an unpublished
 * destination is omitted rather than linked into the unavailable state, which
 * is the same rule the existing related-role lists follow.
 */
export function onwardTransitions(from: Profession): ProfessionTransition[] {
  const ids = new Set(from.nextRoles ?? []);
  // An edge recorded only in career-paths.ts, with no matching nextRoles
  // entry, is still a recorded transition and belongs here.
  for (const p of publishedProfessions) {
    if (p.id !== from.id && transitionBetween(from.id, p.id) !== null) ids.add(p.id);
  }
  return [...ids]
    .map((id) => getPublishedProfession(id))
    .filter((p): p is Profession => Boolean(p) && p!.id !== from.id)
    .map((to) => describe(from, to))
    .sort(order);
}

/** Recorded moves INTO a profession — "vanliga vägar hit". */
export function inboundTransitions(to: Profession): ProfessionTransition[] {
  const ids = new Set(to.previousRoles ?? []);
  for (const p of publishedProfessions) {
    if (p.id !== to.id && transitionBetween(p.id, to.id) !== null) ids.add(p.id);
  }
  return [...ids]
    .map((id) => getPublishedProfession(id))
    .filter((p): p is Profession => Boolean(p) && p!.id !== to.id)
    .map((from) => describe(from, to))
    .sort(order);
}

/** One named move, when the caller already knows both ends. Returns
 *  `undefined` when the data records nothing between them — a caller may not
 *  render a transition the dataset does not carry. */
export function describeTransition(fromId: string, toId: string): ProfessionTransition | undefined {
  const from = getPublishedProfession(fromId);
  const to = getPublishedProfession(toId);
  if (!from || !to) return undefined;
  if (transitionBetween(from.id, to.id) === null) return undefined;
  return describe(from, to);
}

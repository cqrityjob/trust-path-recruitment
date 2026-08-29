// Career routes — the hub's "Karriärvägar" section.
//
// ── WHAT REPLACED WHAT ─────────────────────────────────────────────────
//
// The hub used to show one hard-coded chain of five strings:
// Student → Väktare → Gruppledare → Säkerhetschef → Head of Security. Three
// of those five are not professions this product has guides for; two are not
// professions in the taxonomy at all. Nothing in it was clickable, nothing in
// it was derived, and it implied a single linear ladder for an industry that
// does not have one.
//
// This replaces it with three routes assembled from the data that already
// exists: `careerPaths` edges and the professions' own `nextRoles` /
// `previousRoles` links, restricted to guides that pass the publishability
// rule. Every step is a real guide a reader can open.
//
// ── THE INVARIANT ──────────────────────────────────────────────────────
//
// A stage may only follow another stage if the DATA carries a transition
// between them — an explicit `careerPaths` edge, or a `nextRoles` /
// `previousRoles` link on the professions themselves. `validateRoutes()`
// enforces that, and the guard script runs it: composing a plausible-looking
// route out of professions with no recorded relationship is exactly the kind
// of invented claim this section exists to stop making.
//
// ── WHAT IS DERIVED VERSUS WHAT IS AUTHORED ────────────────────────────
//
// Authored here: which professions form which route, and nothing else.
//
// Derived from the profession records: the level shift between stages, the
// change in regulatory status, the change in orientation, and the
// competencies the next stage adds or demands more of. Those are the honest
// answer to "what changes between these stages" and they cannot go stale
// against the guides, because they ARE the guides.
//
// Deliberately NOT produced: time-to-progress and formal progression
// requirements, unless a `careerPaths` edge states them. No edge in the
// current dataset carries `experienceRequired`, so the UI shows no timing
// claim at all — which is the correct output, not a missing feature.

import type {
  CareerPath,
  Bi,
  CompetencyId,
  ExperienceLevel,
  Orientation,
  Profession,
  ProficiencyLevel,
} from "./types";
import { careerPaths } from "./career-paths";
import { getPublishedProfession, publishedOnly } from "./publishability";

export type CareerRouteId = "operational" | "technical" | "analytical_strategic";

interface AuthoredRoute {
  readonly id: CareerRouteId;
  readonly name: Bi;
  /** The direction this route travels, in one sentence. Not a promise. */
  readonly direction: Bi;
  /** Ordered stages. A stage holds more than one profession when the data
   *  records parallel roles at the same point — the operational route splits
   *  into two separately regulated appointments after the first stage, and
   *  flattening that into a single line would misdescribe both. */
  readonly stages: readonly (readonly string[])[];
}

const authoredRoutes: readonly AuthoredRoute[] = [
  {
    id: "operational",
    name: { sv: "Operativt spår", en: "Operational route" },
    direction: {
      sv: "Från bevakningsuppdrag i tjänst hos kund mot förordnade roller med utökade befogenheter, och vidare mot ansvar för en hel säkerhetsfunktion.",
      en: "From guarding assignments on a client site towards appointed roles with wider powers, and onwards to responsibility for a whole security function.",
    },
    stages: [["security-officer"], ["ordningsvakt", "skyddsvakt"], ["security-manager"]],
  },
  {
    id: "technical",
    name: { sv: "Tekniskt spår", en: "Technical route" },
    direction: {
      sv: "Från installation och drift av säkerhetssystem mot skydd av samhällsviktiga anläggningar, och vidare mot ansvar för teknik och säkerhet i kombination.",
      en: "From installing and operating security systems towards protecting essential facilities, and onwards to owning technology and security together.",
    },
    stages: [["security-technician"], ["data-center-security"], ["security-manager"]],
  },
  {
    id: "analytical_strategic",
    name: { sv: "Analytiskt och strategiskt spår", en: "Analytical and strategic route" },
    direction: {
      sv: "Från specialistansvar för risk eller kontinuitet mot ett samlat lednings- och styrningsansvar för säkerhet.",
      en: "From specialist ownership of risk or continuity towards combined leadership and governance responsibility for security.",
    },
    stages: [["risk-manager", "crisis-continuity-manager"], ["security-manager"]],
  },
] as const;

// ---------------------------------------------------------------------------
// Transition evidence
// ---------------------------------------------------------------------------

/** Every recorded transition between two professions, from either direction
 *  the dataset happens to express it in. */
export function transitionBetween(fromId: string, toId: string): CareerPath | "implicit" | null {
  const edge = careerPaths.find((p) => p.from === fromId && p.to === toId);
  if (edge) return edge;
  const from = getPublishedProfession(fromId);
  const to = getPublishedProfession(toId);
  if (from?.nextRoles?.includes(toId)) return "implicit";
  if (to?.previousRoles?.includes(fromId)) return "implicit";
  return null;
}

export interface RouteStage {
  readonly professions: readonly Profession[];
  /** What changes on the way INTO this stage. Absent on the first stage. */
  readonly shift?: StageShift;
}

export interface StageShift {
  /** Populated only when the level actually differs. */
  readonly levelFrom?: ExperienceLevel;
  readonly levelTo?: ExperienceLevel;
  /** True when the next stage introduces a regulated appointment that the
   *  previous one did not require. */
  readonly becomesRegulated: boolean;
  /** Orientations the next stage adds. */
  readonly addedOrientations: readonly Orientation[];
  /** Competencies the next stage requires that the previous stage did not
   *  require at all, or required at a lower level. */
  readonly raisedCompetencies: readonly { id: CompetencyId; level: ProficiencyLevel }[];
  /** Notes carried by an explicit `careerPaths` edge. Never synthesised. */
  readonly notes: readonly Bi[];
  /** Experience statements carried by an explicit edge. Empty in the current
   *  dataset, and rendered as nothing rather than as a guess. */
  readonly experienceRequired: readonly Bi[];
}

export interface CareerRoute {
  readonly id: CareerRouteId;
  readonly name: Bi;
  readonly direction: Bi;
  readonly stages: readonly RouteStage[];
}

function maxRequiredLevel(
  ps: readonly Profession[],
  competencyId: CompetencyId,
): ProficiencyLevel | 0 {
  let best: ProficiencyLevel | 0 = 0;
  for (const p of ps) {
    for (const rc of p.competencies) {
      if (rc.competencyId === competencyId && rc.requiredLevel > best) best = rc.requiredLevel;
    }
  }
  return best;
}

const LEVEL_ORDER: readonly ExperienceLevel[] = ["entry", "mid", "senior", "executive"];

function highestLevel(ps: readonly Profession[]): ExperienceLevel {
  return ps.reduce<ExperienceLevel>(
    (acc, p) => (LEVEL_ORDER.indexOf(p.level) > LEVEL_ORDER.indexOf(acc) ? p.level : acc),
    ps[0]?.level ?? "entry",
  );
}

function computeShift(prev: readonly Profession[], next: readonly Profession[]): StageShift {
  const levelFrom = highestLevel(prev);
  const levelTo = highestLevel(next);

  const becomesRegulated = next.every((p) => p.regulated) && !prev.every((p) => p.regulated);

  const prevOrientations = new Set(prev.flatMap((p) => p.orientation));
  const addedOrientations = Array.from(
    new Set(next.flatMap((p) => p.orientation).filter((o) => !prevOrientations.has(o))),
  );

  // A competency counts as raised when EVERY profession in the next stage
  // demands it above what ANY profession in the previous stage demanded. The
  // asymmetry is deliberate: "you will need more of this wherever you land"
  // is a claim the data supports; "one of three possible next roles wants
  // slightly more of this" is not.
  const candidateIds = Array.from(
    new Set(next.flatMap((p) => p.competencies.map((c) => c.competencyId))),
  );
  const raisedCompetencies = candidateIds
    .map((id) => ({ id, level: maxRequiredLevel(next, id) }))
    .filter((c): c is { id: CompetencyId; level: ProficiencyLevel } => c.level > 0)
    .filter((c) => next.every((p) => p.competencies.some((rc) => rc.competencyId === c.id)))
    .filter((c) => c.level > maxRequiredLevel(prev, c.id))
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));

  const notes: Bi[] = [];
  const experienceRequired: Bi[] = [];
  for (const from of prev) {
    for (const to of next) {
      const edge = transitionBetween(from.id, to.id);
      if (edge && edge !== "implicit") {
        if (edge.notes) notes.push(edge.notes);
        if (edge.experienceRequired) experienceRequired.push(edge.experienceRequired);
      }
    }
  }

  return {
    ...(levelFrom !== levelTo ? { levelFrom, levelTo } : {}),
    becomesRegulated,
    addedOrientations,
    raisedCompetencies,
    notes,
    experienceRequired,
  };
}

function buildRoute(authored: AuthoredRoute): CareerRoute | null {
  const stageProfessions = authored.stages.map((ids) => publishedOnly(ids));
  // A stage that lost every published profession collapses the route: rather
  // than silently splicing stage 1 to stage 3 and inventing a transition, the
  // whole route drops out of the hub.
  if (stageProfessions.some((s) => s.length === 0)) return null;
  if (stageProfessions.length < 2) return null;

  const stages: RouteStage[] = stageProfessions.map((professions, i) =>
    i === 0
      ? { professions }
      : { professions, shift: computeShift(stageProfessions[i - 1], professions) },
  );

  return { id: authored.id, name: authored.name, direction: authored.direction, stages };
}

/** The routes the hub renders. Only routes whose every stage still resolves
 *  to published guides survive. */
export const careerRoutes: readonly CareerRoute[] = authoredRoutes
  .map(buildRoute)
  .filter((r): r is CareerRoute => r !== null);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type RouteIssue = { readonly routeId: CareerRouteId; readonly message: string };

/**
 * Every consecutive stage pair must be backed by at least one recorded
 * transition, and every profession named must be published.
 *
 * Run by the guard script. This is the assertion that keeps the section
 * honest: a route is allowed to be short, but it is not allowed to assert a
 * progression the dataset never recorded.
 */
export function validateRoutes(): RouteIssue[] {
  const issues: RouteIssue[] = [];

  for (const authored of authoredRoutes) {
    for (const stage of authored.stages) {
      for (const id of stage) {
        if (!getPublishedProfession(id)) {
          issues.push({
            routeId: authored.id,
            message: `stage references "${id}", which is not a published profession guide`,
          });
        }
      }
    }

    for (let i = 1; i < authored.stages.length; i += 1) {
      const prev = authored.stages[i - 1];
      const next = authored.stages[i];
      for (const toId of next) {
        const backed = prev.some((fromId) => transitionBetween(fromId, toId) !== null);
        if (!backed) {
          issues.push({
            routeId: authored.id,
            message: `no recorded transition from [${prev.join(", ")}] to "${toId}" — a route may not assert a progression the data does not carry`,
          });
        }
      }
    }
  }

  return issues;
}

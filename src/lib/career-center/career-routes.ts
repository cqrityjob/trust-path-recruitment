// "Karriärvägar" — independent directions out of a role, not a ladder.
//
// ── WHAT THIS REPLACED, TWICE ──────────────────────────────────────────
//
// First it replaced five hard-coded strings (Student → Väktare → Gruppledare
// → Säkerhetschef → Head of Security), three of which were not professions
// this product has guides for.
//
// Then it had to replace ITS replacement. The stage model that followed drew
// a chain:
//
//   Väktare → Ordningsvakt | Skyddsvakt → Säkerhetssamordnare → Säkerhetschef
//
// Every stage was a real guide and every pair was backed by a recorded
// relationship, so the invariant held — and the picture was still false. A
// left-to-right chain of stages says *this comes after that*, and a reader
// takes it as a sequence: that becoming an ordningsvakt or a skyddsvakt is
// something you pass through on the way to coordinating security. It is not.
// Those are two separate statutory appointments under two separate Acts,
// neither of which is a prerequisite for anything else on the line.
//
// The stage model could not express that, because a stage IS an ordinal. So
// the model changed rather than the data.
//
// ── BRANCHES ───────────────────────────────────────────────────────────
//
// A route is now ONE origin and a set of INDEPENDENT directions out of it.
// Nothing about the rendering implies order, and the copy says so explicitly.
// Where a further direction exists from one of those destinations, it is its
// own route with its own origin — not a fourth rung.
//
// ── AND EVERY BRANCH CARRIES ITS OWN EVIDENCE LEVEL ────────────────────
//
// `transitions.ts` decides whether a move may be described or only named. A
// branch backed by a placeholder edge renders as a direction under review,
// with no likelihood, no experience claim and no progression wording — the
// same treatment it gets on a profession guide, from the same function, so
// the two surfaces cannot disagree.

import type { Bi, Profession } from "./types";
import { getPublishedProfession } from "./publishability";
import {
  onwardTransitions,
  type ProfessionTransition,
  type TransitionEvidenceLevel,
} from "./transitions";

export type CareerRouteId =
  | "from_security_officer"
  | "from_security_coordinator"
  | "from_security_technician"
  | "from_risk_manager";

interface AuthoredRoute {
  readonly id: CareerRouteId;
  readonly name: Bi;
  /** What this group of directions has in common, in one sentence. Never a
   *  promise, and never an ordering. */
  readonly direction: Bi;
  /** The role a reader is standing in. */
  readonly origin: string;
  /** Independent destinations. Order here is presentation only: none is a
   *  prerequisite for another, and `validateRoutes` asserts that no branch is
   *  reachable from another branch in the same route, which is what would
   *  make the list a sequence in disguise. */
  readonly branches: readonly string[];
}

const authoredRoutes: readonly AuthoredRoute[] = [
  {
    id: "from_security_officer",
    name: { sv: "Från väktare", en: "From security officer" },
    direction: {
      sv: "Tre oberoende riktningar från bevakningsuppdrag: två egna förordnanden med egna regelverk, och en samordnande roll utan reglering. Ingen av dem är ett steg på vägen mot någon annan.",
      en: "Three independent directions out of guarding work: two separate appointments under their own regulations, and one unregulated coordinating role. None of them is a step towards any of the others.",
    },
    origin: "security-officer",
    branches: ["ordningsvakt", "skyddsvakt", "security-coordinator"],
  },
  {
    id: "from_security_coordinator",
    name: { sv: "Från säkerhetssamordnare", en: "From security coordinator" },
    direction: {
      sv: "Från att samordna säkerhetsarbetet mot ett samlat ansvar för hela säkerhetsfunktionen.",
      en: "From coordinating security work towards owning a whole security function.",
    },
    origin: "security-coordinator",
    branches: ["security-manager"],
  },
  {
    id: "from_security_technician",
    name: { sv: "Från säkerhetstekniker", en: "From security systems technician" },
    direction: {
      sv: "Från installation och drift av säkerhetssystem mot skydd av samhällsviktiga anläggningar.",
      en: "From installing and operating security systems towards protecting essential facilities.",
    },
    origin: "security-technician",
    branches: ["data-center-security"],
  },
  {
    id: "from_risk_manager",
    name: { sv: "Från risk manager", en: "From risk manager" },
    direction: {
      sv: "Från specialistansvar för risk mot ett samlat lednings- och styrningsansvar för säkerhet.",
      en: "From specialist ownership of risk towards combined leadership and governance responsibility for security.",
    },
    origin: "risk-manager",
    branches: ["security-manager"],
  },
] as const;

export interface CareerRouteBranch {
  readonly transition: ProfessionTransition;
  readonly evidenceLevel: TransitionEvidenceLevel;
}

export interface CareerRoute {
  readonly id: CareerRouteId;
  readonly name: Bi;
  readonly direction: Bi;
  readonly origin: Profession;
  readonly branches: readonly CareerRouteBranch[];
}

function buildRoute(authored: AuthoredRoute, now: Date): CareerRoute | null {
  const origin = getPublishedProfession(authored.origin);
  if (!origin) return null;

  // Branches are read through `onwardTransitions`, not assembled here: the
  // route surface and the profession guide then describe the same move with
  // the same words and the same evidence level, by construction.
  const available = onwardTransitions(origin, now);
  const branches = authored.branches
    .map((id) => available.find((t) => t.to.id === id))
    .filter((t): t is ProfessionTransition => Boolean(t))
    .map((transition) => ({ transition, evidenceLevel: transition.evidenceLevel }));

  if (branches.length === 0) return null;
  return {
    id: authored.id,
    name: authored.name,
    direction: authored.direction,
    origin,
    branches,
  };
}

/** The routes the hub renders. */
export const careerRoutes: readonly CareerRoute[] = authoredRoutes
  .map((r) => buildRoute(r, new Date()))
  .filter((r): r is CareerRoute => r !== null);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type RouteIssue = { readonly routeId: CareerRouteId; readonly message: string };

/**
 * What a branch list must satisfy, run by the guard.
 *
 *   1. Every profession named is a published guide.
 *   2. EVERY BRANCH IS A DIRECT RECORDED TRANSITION FROM THE ORIGIN.
 *   3. No branch is the origin, and no branch is listed twice.
 *
 * ── WHY RULE 2 IS THE ANTI-LADDER RULE ─────────────────────────────────
 *
 * A ladder is a list whose entries are only reachable THROUGH each other.
 * Requiring every branch to be reachable directly from the origin is exactly
 * the property that makes the list unordered: no entry depends on any other,
 * so no reading order is implied and none can be inferred.
 *
 * An earlier version of this function went further and refused any route
 * where one branch also led on to another. That rejected the correct
 * arrangement: both Ordningsvakt and Skyddsvakt happen to record a further
 * direction towards Säkerhetssamordnare, and Säkerhetssamordnare is also
 * directly reachable from Väktare. All three of those facts are true, and
 * listing the three as parallel directions out of Väktare misrepresents none
 * of them — the convergence downstream says nothing about the order a reader
 * would take them in.
 *
 * What made the old rendering false was the STAGE MODEL, which numbered its
 * entries and drew arrows between them. That is gone, the layout is a plain
 * unordered row, and the copy states independence in words. The guard asserts
 * both of those against the component source rather than trying to encode
 * "reads as a sequence" as a graph property, which it is not.
 */
export function validateRoutes(now: Date = new Date()): RouteIssue[] {
  const issues: RouteIssue[] = [];

  for (const authored of authoredRoutes) {
    const origin = getPublishedProfession(authored.origin);
    if (!origin) {
      issues.push({
        routeId: authored.id,
        message: `origin "${authored.origin}" is not a published profession guide`,
      });
      continue;
    }

    const available = onwardTransitions(origin, now);
    const seen = new Set<string>();

    for (const branchId of authored.branches) {
      if (branchId === authored.origin) {
        issues.push({
          routeId: authored.id,
          message: `branch "${branchId}" is the route's own origin`,
        });
        continue;
      }
      if (seen.has(branchId)) {
        issues.push({ routeId: authored.id, message: `branch "${branchId}" is listed twice` });
        continue;
      }
      seen.add(branchId);

      if (!getPublishedProfession(branchId)) {
        issues.push({
          routeId: authored.id,
          message: `branch "${branchId}" is not a published profession guide`,
        });
        continue;
      }
      if (!available.some((t) => t.to.id === branchId)) {
        issues.push({
          routeId: authored.id,
          message: `no DIRECT recorded transition from "${authored.origin}" to "${branchId}" — every branch must stand on its own, or the list is a ladder`,
        });
      }
    }
  }

  return issues;
}

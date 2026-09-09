// The six areas of the candidate's career, as one table.
//
// ── WHAT WAS WRONG ─────────────────────────────────────────────────────
//
// /my-career was a single page nine sections tall. Everything a candidate
// owns was on it, in full, one below the other: the career picture, open
// roles, applications, tests, training, a tools list and an activity feed.
// Measured at 1440 the page was 2838px — more than three screens — and the
// CV lived 1425px down inside a list called "Karriärverktyg". Sharing was
// not on it at all, at any height, in any language.
//
// So the destinations existed and were correct; what did not exist was a
// way to SEE that they existed. This table is that: six areas, named, in
// the order a candidate builds them.
//
// ── EVERY DESTINATION IS ALREADY CANONICAL ─────────────────────────────
//
// Nothing here is a new route. Four of the six are pages this product has
// shipped for months (/my-career, /my-career/cv, /my-career/applications,
// /passport); Career Discovery points at CANONICAL_ASSESSMENT_PATH, the
// same constant /discovery redirects to; Sharing points at the share
// screen the Passport already links to from its overview. A hub that
// invented a seventh page would be the same mistake one level up.
//
// ── TWO OF THEM LEAVE THE MY CAREER SHELL, ON PURPOSE ──────────────────
//
// Security Passport and Sharing live under /passport, which has a product
// shell of its own with its own four tabs. Clicking either one hands the
// candidate to that shell, where the primary navigation marks "Mitt
// Security Passport" as the current location — so they are never without
// an answer to "where am I". Wrapping the Passport in a SECOND strip to
// keep this one on screen would put two section navigations on one page,
// which is worse than the crossing it would smooth over.
//
// ── PRESENTATION ONLY ──────────────────────────────────────────────────
//
// Nothing here grants anything, exactly as candidate-app-nav.ts says of
// the primary navigation. Every destination re-verifies its own access:
// /my-career/cv and /my-career/applications are owner-scoped by RLS, the
// Passport reads the holder's own record, and the share screen creates a
// disclosure through a database function that checks the holder. Which tab
// is drawn has never been the boundary.

import { matchesRouteId } from "@/components/site/candidate-app-nav";
import { CANONICAL_ASSESSMENT_PATH } from "@/lib/career-discovery/routes";

export const MY_CAREER_HUB_VERSION = "my-career-hub-v1" as const;

export type HubSectionKey =
  | "overview"
  | "passport"
  | "cv"
  | "discovery"
  | "applications"
  | "sharing";

export interface HubSection {
  readonly key: HubSectionKey;
  /** The canonical destination. One link per area, never two. */
  readonly to: string;
  /** TanStack route ids whose presence in the match chain makes this
   *  section the current location.
   *
   *  ROUTE IDS, not pathnames — the router already resolved the URL, and
   *  re-parsing it with substring checks would be a second, worse router.
   *  The guard fails the build for a prefix that names no real route. */
  readonly routeIds: readonly string[];
}

export const MY_CAREER_HUB: readonly HubSection[] = [
  {
    key: "overview",
    to: "/my-career",
    // The INDEX route id, which carries a trailing slash, and nothing
    // else. "/_authenticated/my-career" as a prefix would swallow every
    // section below and light Overview on all of them.
    routeIds: ["/_authenticated/my-career/"],
  },
  {
    key: "passport",
    to: "/passport",
    // NOT /passport-attestations — that surface lives under the Passport's
    // name and is authorised by has_employer_role. The segment-boundary
    // rule imported from candidate-app-nav keeps it out, and it is the
    // SAME function the primary navigation uses rather than a second copy
    // of the rule that could drift away from it.
    routeIds: ["/_authenticated/passport"],
  },
  {
    key: "cv",
    to: "/my-career/cv",
    routeIds: ["/_authenticated/my-career/cv"],
  },
  {
    key: "discovery",
    to: CANONICAL_ASSESSMENT_PATH,
    // The saved report and the career journey belong to the analysis in
    // the candidate's head, so they light this tab rather than nothing.
    // /discovery is an alias that redirects here; it is listed because a
    // candidate can still be mid-redirect on it.
    routeIds: [
      "/_authenticated/security-career-assessment",
      "/security-career-assessment",
      "/_authenticated/discovery",
      "/discovery",
      "/_authenticated/my-career/reports",
      "/_authenticated/journey",
    ],
  },
  {
    key: "applications",
    to: "/my-career/applications",
    routeIds: ["/_authenticated/my-career/applications"],
  },
  {
    key: "sharing",
    to: "/passport/share",
    // LONGER than the Passport's prefix above, and `resolveHubSection`
    // resolves by longest match — so the share screen marks Sharing and
    // not Security Passport, without depending on array order.
    routeIds: ["/_authenticated/passport/share"],
  },
] as const;

/**
 * Which section is the current location, or null.
 *
 * Null rather than a guess: /my-career/profile and /my-career/career-card
 * are inside the hub's shell and belong to none of the six, and lighting a
 * tab the reader is not standing on is worse than lighting none.
 */
export function resolveHubSection(routeIds: readonly string[]): HubSectionKey | null {
  let active: HubSectionKey | null = null;
  let bestLength = -1;
  for (const routeId of routeIds) {
    for (const section of MY_CAREER_HUB) {
      for (const prefix of section.routeIds) {
        if (!matchesRouteId(routeId, prefix)) continue;
        if (prefix.length > bestLength) {
          bestLength = prefix.length;
          active = section.key;
        }
      }
    }
  }
  return active;
}

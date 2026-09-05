// The signed-in candidate's application navigation — one definition.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
//
// Until now CQrityjob had exactly one navigation: the marketing site's.
// A signed-in candidate was shown "Säkerhetskarriärcenter · Jobb ·
// Arbetsgivare · Bedömningar · Om oss · Kontakt" — six links, none of
// which was their own workspace — with "Min karriär" demoted to a small
// outlined button on the far right, and Security Passport absent from the
// chrome entirely. The employer workspace already had its own shell
// (EmployerAppShell, which deliberately does NOT wrap in SiteLayout); the
// candidate was the only role still living inside the marketing site.
//
// So this is not a new pattern. It is the pattern the employer workspace
// already established, finally applied to the candidate.
//
// ── ONE DEFINITION, TWO VIEWPORTS ──────────────────────────────────────
//
// Desktop and mobile render from THIS array. A link that exists at 1440
// and not at 375 is the specific bug this shape makes impossible, and the
// previous header had it: account settings existed in the desktop
// dropdown and nowhere on mobile until it was patched in by hand.
//
// ── PRESENTATION ONLY ──────────────────────────────────────────────────
//
// Nothing here grants anything. Every destination re-verifies its own
// access — /my-career and /passport are owner-scoped by RLS, /academy
// returns the rows the database returned for this caller and nothing
// else. Which link is drawn has never been the boundary and is not the
// boundary now.

/** The five destinations, in the candidate's own order.
 *
 *  Min karriär · Mitt Security Passport · Hitta jobb · Yrken och
 *  karriärvägar · Tester och resultat. The Passport is second because it is
 *  the durable thing this product builds for a person; jobs, professions and
 *  tests are what happens around it.
 *
 *  Deliberately five.
 *
 *  Career Card, My Profile, the CV and Career Analysis are NOT here: they
 *  belong inside the overview and the account menu respectively. Premium
 *  SaaS is not more navigation. Reviewing is not here either: it is a
 *  separate authorised capability, reached from the account menu's
 *  workspace switch, and giving it equal billing beside the candidate's
 *  own products would say otherwise. */
import type { TranslationKey } from "@/i18n/dictionaries";

export type CandidateNavKey =
  | "myCareer"
  | "exploreProfessions"
  | "jobs"
  | "passport"
  | "assessments";

export type CandidateNavItem = {
  readonly key: CandidateNavKey;
  /** The canonical destination. One link per product, never two. */
  readonly to: string;
  /** Dictionary key. Chrome copy lives in the dictionary, per the
   *  convention documented in professional-identity/copy.ts.
   *
   *  Typed as TranslationKey, so a label that exists in Swedish and not in
   *  English -- or a key invented here and never authored -- is a build
   *  error rather than a nav item reading "nav.passport" to a user. */
  readonly labelKey: TranslationKey;
  /** TanStack route ids whose presence in the match chain makes this item
   *  the current location.
   *
   *  ROUTE IDS, not pathnames. The router already resolved the URL into
   *  matched routes; re-parsing the pathname with substring checks would
   *  be a second, worse router. A prefix that names no real route matches
   *  nothing — and the guard script fails the build for it. */
  readonly routeIds: readonly string[];
};

export const CANDIDATE_APP_NAV: readonly CandidateNavItem[] = [
  {
    key: "myCareer",
    to: "/my-career",
    // "Min karriär" — the candidate's own words for this place, and the
    // same words the account menu's workspace switch uses. "Översikt" named
    // a page rather than the thing the person came for.
    labelKey: "nav.my_career",
    // Career Discovery, the Career Journey and the saved Career Analysis
    // are all reached from here and all belong to it in the information
    // architecture, so they keep My Career lit rather than lighting
    // nothing. /my-career/applications is the deliberate exception below.
    routeIds: [
      "/_authenticated/my-career",
      "/_authenticated/journey",
      "/_authenticated/discovery",
      "/_authenticated/security-career-assessment",
      "/security-career-assessment",
      "/discovery",
    ],
  },
  {
    key: "passport",
    to: "/passport",
    labelKey: "nav.myPassport",
    // NOT /passport-attestations. That surface lives under the Passport's
    // name but is authorised by has_employer_role(owner|admin) — it is an
    // employer's attestation desk, not the holder's Passport, and the
    // segment-boundary rule in matchesRouteId keeps it out.
    routeIds: ["/_authenticated/passport"],
  },
  {
    key: "jobs",
    to: "/jobs",
    labelKey: "nav.findJobs",
    // Opportunities AND applications — the two halves of the same thing
    // in the candidate's head. /my-career/applications lives under the
    // My Career URL for ownership reasons, and is longer than the
    // My Career prefix above, so longest-match puts it here where a
    // candidate expects it.
    routeIds: ["/jobs", "/_authenticated/my-career/applications"],
  },
  {
    key: "exploreProfessions",
    to: "/career-center",
    labelKey: "nav.professionsAndPaths",
    // The profession explorer is a candidate tool as much as a public page:
    // "which security roles exist and what do they require" is the question
    // Career Discovery answers for one person, asked about all of them. It
    // carries the app chrome for somebody signed in and stays the website's
    // page for everybody else -- the same route, two chromes, no copy.
    routeIds: ["/career-center"],
  },
  {
    key: "assessments",
    to: "/academy",
    labelKey: "nav.testsAndResults",
    // The URL says "academy" for historical reasons and stays that way —
    // renaming a route to fix a label is how link rot starts. The label
    // is the product name; the path is an implementation detail nobody is
    // shown.
    routeIds: ["/_authenticated/academy"],
  },
] as const;

/** Candidate product routes that carry the app chrome but are not
 *  themselves a navigation destination. Listed so the shell knows it is
 *  in the app rather than on the marketing site. */
const EXTRA_CANDIDATE_ROUTE_IDS: readonly string[] = ["/_authenticated/feedback"];

/** Segment-boundary prefix match.
 *
 *  "/_authenticated/passport" must NOT match
 *  "/_authenticated/passport-attestations". A bare startsWith does, which
 *  would have put an employer surface under the holder's Passport tab. */
export function matchesRouteId(routeId: string, prefix: string): boolean {
  return routeId === prefix || routeId.startsWith(`${prefix}/`);
}

export type CandidateNavContext = {
  /** True when the signed-in person is inside their own workspace, and
   *  the app chrome replaces the marketing chrome. */
  readonly inCandidateApp: boolean;
  /** Which item is the current location, or null when the route is part
   *  of the workspace but is not one of the four (rather than lighting an
   *  item that is not where you are). */
  readonly activeKey: CandidateNavKey | null;
};

/**
 * Resolve the chrome from the router's matched route ids.
 *
 * Longest prefix wins, so "/_authenticated/my-career/applications" (Jobs)
 * beats "/_authenticated/my-career" (My Career) rather than depending on
 * the order of the array.
 */
export function resolveCandidateNav(routeIds: readonly string[]): CandidateNavContext {
  let activeKey: CandidateNavKey | null = null;
  let bestLength = -1;
  let inCandidateApp = false;

  for (const routeId of routeIds) {
    for (const item of CANDIDATE_APP_NAV) {
      for (const prefix of item.routeIds) {
        if (!matchesRouteId(routeId, prefix)) continue;
        inCandidateApp = true;
        if (prefix.length > bestLength) {
          bestLength = prefix.length;
          activeKey = item.key;
        }
      }
    }
    for (const prefix of EXTRA_CANDIDATE_ROUTE_IDS) {
      if (matchesRouteId(routeId, prefix)) inCandidateApp = true;
    }
  }

  return { inCandidateApp, activeKey };
}

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

/** The owner's seven destinations (2026-09-24):
 * Overview · Security Passport · My Security Work · CV · Jobs · Career ·
 * Tests & development. This explicitly replaces the former six-item canon.
 * Career Card and My Profile remain contextual/account destinations.
 * Both viewport variants consume this definition; visibility grants no access.
 */
import type { TranslationKey } from "@/i18n/dictionaries";

export type CandidateNavKey =
  | "overview"
  | "career"
  | "cv"
  | "jobs"
  | "passport"
  | "security-work"
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
    key: "overview",
    to: "/my-career",
    // "Översikt" — the owner's label, and now the ONLY name this
    // destination has anywhere in the product. The strip that used to
    // offer a second "Översikt" at this same URL is gone.
    labelKey: "nav.overview",
    // Everything under the shell EXCEPT the surfaces the owner's sketches
    // give to another destination. Those are listed on the destination
    // that owns them, and longest-prefix resolution — not array order —
    // is what makes the more specific entry win:
    //
    //   /my-career/applications → Jobb   (sketch 3's supporting area)
    //   /my-career/reports/…    → Karriär (sketch 4's saved analysis)
    //
    // This is the reverse of the #211 decision, and deliberately so. #211
    // moved applications ONTO this item because the page rendered inside
    // a hub strip that marked "Ansökningar" while the primary navigation
    // marked "Hitta jobb" — two navigations telling the reader they were
    // in two places. The strip is retired, so there is no longer a second
    // navigation to disagree with, and the owner's sketch puts
    // applications in Jobs. The reasoning that forced #211 is gone; the
    // reasoning it overrode is not.
    routeIds: ["/_authenticated/my-career"],
  },
  {
    key: "passport",
    to: "/passport",
    // "Security Passport" — the product's own name, as the sketch
    // underlines it. It was "Mitt Security Passport"; the possessive is
    // already implied by it being in the candidate's own navigation.
    labelKey: "nav.securityPassport",
    // NOT /passport-attestations. That surface lives under the Passport's
    // name but is authorised by has_employer_role(owner|admin) — it is an
    // employer's attestation desk, not the holder's Passport, and the
    // segment-boundary rule in matchesRouteId keeps it out.
    routeIds: ["/_authenticated/passport"],
  },
  {
    key: "security-work",
    to: "/security-work",
    // Owner decision 2026-09-24: a visible professional work tool directly
    // after Passport, including before the first personal workspace exists.
    // This navigation grants no workspace membership or employer role.
    labelKey: "sw.name",
    routeIds: ["/_authenticated/security-work"],
  },
  {
    key: "cv",
    to: "/my-career/cv",
    // CV follows Security Work under the current seven-destination order.
    //
    // ── THIS REVERSES AN EARLIER EXPLICIT RULE, DELIBERATELY ──────────
    //
    // Until now the CV was contextual from Överskt and Jobs and NOT a
    // navigation item, on the owner's explicit rule, and this file said
    // "deliberately five" because of it. The owner's authenticated
    // navigation is now six and names the CV in it. That is a product
    // decision they are entitled to change; what must not happen is the
    // change arriving silently, so the reversal is recorded here rather
    // than the old reasoning being quietly deleted.
    //
    // The CONTEXTUAL entries stay as well — the Overview status grid and
    // the Jobs side column both still reach the CV. A destination having
    // a nav item has never meant nothing else may link to it; what the
    // canon forbids is two entries resolving to the same place, and a
    // summary linking to its canonical page is the pattern this codebase
    // already uses everywhere.
    labelKey: "nav.cv",
    // The CV layout route. Longer than the overview item's
    // "/_authenticated/my-career", so longest-prefix resolution lights CV
    // for /my-career/cv, /cv/new and /cv/$cvId without depending on the
    // order of this array — the same mechanism applications and reports
    // already rely on.
    routeIds: ["/_authenticated/my-career/cv"],
  },
  {
    key: "jobs",
    to: "/jobs",
    // "Jobb" — the sketch's word. "Hitta jobb" named only the discovery
    // half of a page that is also where applications live. This reuses the
    // marketing navigation's existing "nav.jobs" rather than adding a
    // second key holding the identical string in both languages.
    labelKey: "nav.jobs",
    // Vacancies AND the candidate's own applications, which sketch 3 puts
    // in this workspace's supporting area. The applications prefix is
    // longer than the overview item's "/_authenticated/my-career", so
    // longest-prefix resolution lights Jobb here without depending on the
    // order of this array.
    routeIds: ["/jobs", "/_authenticated/my-career/applications"],
  },
  {
    key: "career",
    to: "/career-center",
    // "Karriär" — sketch 4. One career product: exploring professions,
    // Career Discovery, the saved analysis and the paths out of it.
    labelKey: "nav.career",
    // ── ONE CAREER PRODUCT, ONE LIT ITEM ──────────────────────────────
    //
    // Career Discovery (canonical and its /discovery alias), the career
    // journey behind "Hur kommer jag dit?" and the saved career analysis
    // at /my-career/reports all used to light "Min karriär", because
    // Karriär was not a destination and there was nowhere else to put
    // them. They are parts of THIS product and light it now.
    //
    // /my-career/reports is under the overview item's prefix, so it is
    // listed here at greater length and wins on longest prefix.
    routeIds: [
      "/career-center",
      "/_authenticated/security-career-assessment",
      "/security-career-assessment",
      "/_authenticated/discovery",
      "/discovery",
      "/_authenticated/journey",
      "/_authenticated/my-career/reports",
    ],
  },
  {
    key: "assessments",
    to: "/academy",
    labelKey: "nav.testsAndDevelopment",
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

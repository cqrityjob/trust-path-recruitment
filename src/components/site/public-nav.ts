// The public site's navigation — one definition for the header's desktop
// bar, its compact menu and the footer.
//
// ── THE LOCKED NAVIGATION (2026-09-30) ────────────────────────────────
//
//   Karriär · Jobb · Security Passport · Säkerhetsarbete · För arbetsgivare ▾ · Om oss
//
// with SV / EN, Logga in and Skapa konto on the right. "Karriär", never
// "Min karriär" (that is the signed-in workspace). "Säkerhetsarbete", never
// "Security Intelligence" or "AI-agent". Only "För arbetsgivare" has a
// submenu, and its five entries are sections of /employers.
//
// This supersedes the 2026-09-27 six, which put the two product entries
// first and pointed them at homepage anchors — a visitor who chose
// Security Passport or Säkerhetsarbete kept scrolling into unrelated
// products. Each entry now opens a page about that one area.
//
// The career analysis is deliberately NOT an entry. It keeps its direct
// action on the Career page, inside the area it belongs to.
//
// ── WHY THE TWO PRODUCT ENTRIES DEPEND ON THE SESSION ──────────────────
//
// A signed-out visitor gets the PUBLIC page that explains the product:
// /security-passport and /sakerhetsarbete. The signed-in product routes
// (/passport, /security-work) are authenticated and stay exactly where they
// are; a signed-in person's entry opens their own product instead. That is
// PRESENTATION ONLY: every destination re-verifies its own access
// server-side, exactly as it does when the URL is typed.

import type { TranslationKey } from "@/i18n/dictionaries";

export type PublicNavKey = "career" | "jobs" | "passport" | "security-work" | "employers" | "about";

export type PublicNavItem = {
  readonly key: PublicNavKey;
  readonly to:
    | "/career-center"
    | "/jobs"
    | "/security-passport"
    | "/passport"
    | "/sakerhetsarbete"
    | "/security-work"
    | "/employers"
    | "/about";
  readonly labelKey: TranslationKey;
};

/** The six public destinations, in the locked order, for a reader who is
 *  (true) or is not yet known to be (false) signed in. */
export function publicNav(signedIn: boolean): readonly PublicNavItem[] {
  return [
    { key: "career", to: "/career-center", labelKey: "nav.career" },
    { key: "jobs", to: "/jobs", labelKey: "nav.jobs" },
    signedIn
      ? { key: "passport", to: "/passport", labelKey: "nav.passportPublic" }
      : { key: "passport", to: "/security-passport", labelKey: "nav.passportPublic" },
    signedIn
      ? { key: "security-work", to: "/security-work", labelKey: "nav.securityWorkPublic" }
      : { key: "security-work", to: "/sakerhetsarbete", labelKey: "nav.securityWorkPublic" },
    { key: "employers", to: "/employers", labelKey: "nav.employers" },
    { key: "about", to: "/about", labelKey: "nav.about" },
  ];
}

export type EmployerNavKey = "platform" | "assessment" | "interview" | "recruitment" | "interim";

export type EmployerNavItem = {
  readonly key: EmployerNavKey;
  readonly to: "/employers";
  /** A section of /employers; undefined for the page itself. */
  readonly hash: "bedomning" | "intervju" | "rekrytering" | "interim" | undefined;
  readonly labelKey: TranslationKey;
  readonly bodyKey: TranslationKey;
};

/** "För arbetsgivare ▾" — the one submenu in the bar. Every destination is
 *  an existing section of /employers, so none of them can be a dead link. */
export const EMPLOYER_NAV: readonly EmployerNavItem[] = [
  {
    key: "platform",
    to: "/employers",
    hash: undefined,
    labelKey: "nav.forEmployers.platform",
    bodyKey: "nav.forEmployers.platform.body",
  },
  {
    key: "assessment",
    to: "/employers",
    hash: "bedomning",
    labelKey: "nav.forEmployers.assessment",
    bodyKey: "nav.forEmployers.assessment.body",
  },
  {
    key: "interview",
    to: "/employers",
    hash: "intervju",
    labelKey: "nav.forEmployers.interview",
    bodyKey: "nav.forEmployers.interview.body",
  },
  {
    key: "recruitment",
    to: "/employers",
    hash: "rekrytering",
    labelKey: "nav.forEmployers.recruitment",
    bodyKey: "nav.forEmployers.recruitment.body",
  },
  {
    key: "interim",
    to: "/employers",
    hash: "interim",
    labelKey: "nav.forEmployers.interim",
    bodyKey: "nav.forEmployers.interim.body",
  },
];

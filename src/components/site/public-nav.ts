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
// ── "REGISTRERA FÖRETAG" ──────────────────────────────────────────────
//
// Registering a company used to exist only on / and on /employers, so a
// visitor on any other page could sign an existing company in but never
// register a new one. EMPLOYER_REGISTER_NAV is the ONE definition of that
// entry (destination, intent and label); the "För arbetsgivare" panel, the
// compact menu and the footer all render it. It is not a seventh entry of the
// locked bar: it sits beside the employer login in the panel and in the
// sheet, and in the footer's own row.
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
import { EMPLOYER_INTENT } from "@/lib/auth/organisation-entrance";

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

/** "Registrera företag" — the one way to register a company, from every
 *  surface that offers it. `/signup` carrying `/employer` as its return
 *  destination: the SAME door and the SAME intent as the homepage's employer
 *  band and /employers, never a bare /signup. Offered to a signed-out visitor
 *  only, and only while the employer portal is released (the consumers gate
 *  it; this is the destination, not the gate). The label is the owner-approved
 *  one the homepage band and /employers already use, so the same action is
 *  never called two different things. */
export const EMPLOYER_REGISTER_NAV = {
  key: "employer-register",
  to: "/signup",
  search: EMPLOYER_INTENT,
  labelKey: "employers.cta.register",
} as const;

export type FooterExtraKey = "contact" | "employer-register" | "feedback";

export type FooterExtraItem = {
  readonly key: FooterExtraKey;
  readonly to: "/contact" | "/signup" | "/feedback";
  /** Only the registration entry carries one. */
  readonly search?: typeof EMPLOYER_INTENT;
  readonly labelKey: TranslationKey;
};

/** What the footer shows AFTER the six it shares with the header, for a
 *  reader whose session is signed in (true), signed out (false) or not known
 *  yet (null), and with the employer portal released or not.
 *
 *  "Not known yet" counts as not signed in for both conditional entries. For
 *  registration that is what the server renders, so the first client render
 *  matches it. For Betafeedback it is the safe side: /feedback sits behind the
 *  login, so offering it to somebody who is not signed in is a link that
 *  bounces them to a sign-in form.
 *
 *  Presentation only: every destination re-verifies access on its own. */
export function footerExtraNav(state: {
  signedIn: boolean | null;
  employerPortal: boolean;
}): readonly FooterExtraItem[] {
  const items: FooterExtraItem[] = [{ key: "contact", to: "/contact", labelKey: "nav.contact" }];
  if (state.signedIn !== true && state.employerPortal) items.push(EMPLOYER_REGISTER_NAV);
  if (state.signedIn === true) {
    items.push({ key: "feedback", to: "/feedback", labelKey: "footer.betaFeedback" });
  }
  return items;
}

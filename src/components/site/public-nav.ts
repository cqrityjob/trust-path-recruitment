// The public site's navigation — one definition for the header's desktop
// bar, its compact menu and the footer.
//
// ── THE SIX (MVP text specification §4, 2026-09-27) ────────────────────
//
//   Säkerhetsarbete · Security Passport · Karriär · Jobb · För arbetsgivare · Om oss
//
// The three core parts come first and carry the names the signed-in product
// uses for them, so a visitor meets the same words before and after signing
// in. Then the employer information page and the company page. This
// supersedes the owner's 2026-09-14 five ("För dig · Jobb · Arbetsgivare ·
// Karriärvägar · Om oss"), which kept product names out of the bar: the
// owner's latest decision is that the three parts are equal and each must
// be reachable from the chrome.
//
// The career analysis is deliberately NOT a seventh entry. It keeps its
// direct action in the homepage's career card and on the Career Center, and
// does not compete with the three parts in the bar.
//
// ── WHY THE TWO PRODUCT ENTRIES DEPEND ON THE SESSION ──────────────────
//
// For a signed-out visitor they lead to the homepage section that explains
// the part. A signed-in person never sees those sections: the homepage sends
// them to their own workspace (src/routes/index.tsx), so the same link would
// silently land them on the overview. For them the entry opens the product
// itself. That is PRESENTATION ONLY: every destination re-verifies its own
// access server-side, exactly as it does when the URL is typed.

import type { TranslationKey } from "@/i18n/dictionaries";

export type PublicNavKey = "security-work" | "passport" | "career" | "jobs" | "employers" | "about";

export type PublicNavItem = {
  readonly key: PublicNavKey;
  readonly to:
    | "/"
    | "/security-work"
    | "/passport"
    | "/career-center"
    | "/jobs"
    | "/employers"
    | "/about";
  /** The homepage section, for an entry that points at one. */
  readonly hash: "security-intelligence" | "passport" | undefined;
  readonly labelKey: TranslationKey;
};

/** The six public destinations, in the specified order, for a reader who is
 *  (true) or is not yet known to be (false) signed in. */
export function publicNav(signedIn: boolean): readonly PublicNavItem[] {
  return [
    signedIn
      ? {
          key: "security-work",
          to: "/security-work",
          hash: undefined,
          labelKey: "nav.securityWorkPublic",
        }
      : {
          key: "security-work",
          to: "/",
          hash: "security-intelligence",
          labelKey: "nav.securityWorkPublic",
        },
    signedIn
      ? { key: "passport", to: "/passport", hash: undefined, labelKey: "nav.passportPublic" }
      : { key: "passport", to: "/", hash: "passport", labelKey: "nav.passportPublic" },
    { key: "career", to: "/career-center", hash: undefined, labelKey: "nav.career" },
    { key: "jobs", to: "/jobs", hash: undefined, labelKey: "nav.jobs" },
    { key: "employers", to: "/employers", hash: undefined, labelKey: "nav.employers" },
    { key: "about", to: "/about", hash: undefined, labelKey: "nav.about" },
  ];
}

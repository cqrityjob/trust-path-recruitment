// Where each part of the professional profile is actually edited.
//
// ── THE RULE THIS FILE EXISTS TO ENFORCE ───────────────────────────────
//
// CQrityjob must never tell somebody to do something they cannot do. The
// pilot found the exact failure: "Fyll i din profil" sent a career-changer
// to /my-career/profile, where the field the score called missing — a
// Passport headline — is not rendered, and where the profession question is
// not rendered either because that editor only asks it of people already
// working in security. They saved what they could, the number did not move,
// and the same recommendation came back. Every visit. There was no state
// they could reach from that destination that would retire the action.
//
// So a section is no longer described only by its weight. It is described by
// WHERE it is edited and WHETHER this person can get there right now, and
// nothing may recommend a section that fails the second test.
//
// ── WHY OWNERSHIP IS NOT DUPLICATION ───────────────────────────────────
//
// The fix for "the field is not on this page" is a link to the page that has
// it, never a second copy of the field. `security_career_profiles` is the
// canonical self-reported profile and `sp_passport_profiles` /
// `sp_claims` / `sp_experience_periods` are the Passport's; migration
// 20261007090000 made that split deliberate, and copying a Passport fact
// into a profile table to make a percentage move would recreate precisely
// the two-writer defect it removed. This file routes. It never copies.
//
// ── WHY THE HREFS CARRY INTENT ─────────────────────────────────────────
//
// `/passport/information` is a long page. Landing at the top of it, having
// been told "add your work experience", is only marginally better than
// landing on the wrong page: the person still has to find the section. The
// anchors are real ids on the receiving surfaces and the query intent is the
// one `SecurityCareerProfileCard` already understood — deep-link
// infrastructure that existed, extended rather than replaced.

import type { CompletenessSection } from "./completeness";
import type { ProfessionalIdentityV1 } from "./types";
import { isAlreadyWorkingInSecurity } from "@/lib/security-career-profile/types";

/** Which product owns the write. Presentation of an architectural fact, not
 *  a permission: every write still goes through the owner's own server
 *  function and its own rules. */
export type SectionOwner = "profile" | "passport" | "discovery";

/** What the person must be able to do before a section may be recommended.
 *  See `isSectionReachable`. */
export interface SectionDestination {
  readonly owner: SectionOwner;
  /** In-app path, with the intent that opens the right editor. */
  readonly href: string;
}

/**
 * The canonical destination for every section.
 *
 * `sp-profile-basics`, `sp-work-country`, `sp-employment`, `sp-education`,
 * `sp-languages` and `sp-skills` are ids that exist on
 * `/passport/information`; `career-profile` is the id on the canonical
 * profile card, and `edit=profession` is the intent it already read. A guard
 * in `scripts/professional-identity-check.ts` asserts every one of these
 * targets is still present in the receiving source, because a renamed anchor
 * is a silently dead deep link.
 */
export const SECTION_DESTINATIONS: Readonly<Record<CompletenessSection, SectionDestination>> = {
  situation: { owner: "profile", href: "/my-career/profile?edit=profession#career-profile" },
  // Basic information is not security evidence. Its editor moved to the
  // profile with the owner's 2026-09-14 correction; the row is unchanged.
  identity: { owner: "profile", href: "/my-career/profile#profile-basics" },
  profession: { owner: "profile", href: "/my-career/profile?edit=profession#career-profile" },
  experience: { owner: "profile", href: "/my-career/profile?edit=profession#career-profile" },
  // Where a person works is a profile answer, not a credential. Same
  // sp_passport_profiles row, same setWorkCountry writer, new editor home.
  location: { owner: "profile", href: "/my-career/profile#profile-work-country" },
  // ── AUTHORING MOVED, EVIDENCE DID NOT (owner, 2026-09-14) ──────────
  //
  // This pointed at the Passport because the employment EDITOR lived
  // there. The owner moved the general authoring editors to the profile
  // and was explicit that this does not follow from the evidence
  // boundary: "sp-employment may remain a real Passport section and
  // anchor. Employment evidence has not moved. However, the general
  // authoring editor for employment history must move to the canonical
  // Profile workspace."
  //
  // So the OWNER of the write is the profile, and the record is the same
  // sp_experience_periods row written by the same saveExperienceEntry.
  // Documenting and verifying a period is still Passport work, reached
  // from #sp-employment, which is still a real section with a real
  // anchor and unchanged deep links.
  employment: { owner: "profile", href: "/my-career/profile#profile-employment" },
  // ── MOVED TO THE PROFILE, WHERE THE OWNER'S REVIEW PUT THEM ─────────
  //
  // These three were edited inside /passport/information, which is what
  // made a candidate go to the Security Passport to record their degree.
  // Their editors are on the canonical profile now, and this file routes
  // to where the write actually happens -- which is the whole point of it.
  //
  // The OWNER changes with the editor; the STORAGE does not. Each is still
  // one `sp_claims` row written by the same server function, so this is a
  // routing change and emphatically not a copy into a profile table -- see
  // the note above on migration 20261007090000.
  education: { owner: "profile", href: "/my-career/profile#profile-education" },
  skills: { owner: "profile", href: "/my-career/profile#profile-skills" },
  languages: { owner: "profile", href: "/my-career/profile#profile-languages" },
  careerDirection: { owner: "discovery", href: "/security-career-assessment" },
};

/** A canonical destination, split into the parts a router `Link` takes. */
export interface SectionLinkTarget {
  readonly to: string;
  readonly search?: Readonly<Record<string, string>>;
  readonly hash?: string;
}

/**
 * The same destination, as `to` / `search` / `hash`.
 *
 * The section overview needs to LINK to these, and a router link takes the
 * three parts separately rather than one string. Deriving them here is what
 * keeps `SECTION_DESTINATIONS` the only place a route or an anchor is
 * written down: a surface that re-typed `#profile-employment` next to its
 * own link would be a second source of truth, and the two would drift the
 * first time a section moved -- which is exactly how a recommendation ended
 * up pointing at an editor that had already been relocated.
 *
 * Pure string work, no router import: this file is read by guards and by
 * server-side code that must not pull the router in.
 */
export function sectionLinkTarget(section: CompletenessSection): SectionLinkTarget {
  const { href } = SECTION_DESTINATIONS[section];
  const [beforeHash = "", hash = ""] = href.split("#");
  const [to = "", query = ""] = beforeHash.split("?");
  const search = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
  return {
    to,
    ...(search ? { search } : {}),
    ...(hash ? { hash } : {}),
  };
}

/** What the caller knows that the identity read model does not. */
export interface ReachabilitySignals {
  /** Whether Career Discovery would admit THIS person. `false` withholds the
   *  direction destination; `undefined` means nobody asked. */
  readonly careerDiscoveryOpen?: boolean;
}

/**
 * Can this person open that destination and change the state, today?
 *
 * Three ways to answer no, and each is a real dead end the pilot could have
 * walked into:
 *
 *   * a Passport-owned section while the person has no Passport. The editor
 *     is behind a record that does not exist yet, and "open your Security
 *     Passport" is the honest action instead — the ladder already offers it.
 *   * profession or experience for somebody the profile editor does not ask.
 *     `isAlreadyWorkingInSecurity` is the form's OWN gate, imported so the
 *     recommendation and the rendered field cannot disagree.
 *   * Career Discovery while the assessment is closed to them.
 *
 * A read that did not answer is not handled here. `known()` in the ladder
 * decides that, before anything reaches this function: "we could not read
 * your Passport" must never become "you have no Passport".
 */
export function isSectionReachable(
  section: CompletenessSection,
  identity: ProfessionalIdentityV1,
  signals: ReachabilitySignals = {},
): boolean {
  const { owner } = SECTION_DESTINATIONS[section];

  if (owner === "passport" && !identity.hasPassport) return false;
  if (owner === "discovery" && signals.careerDiscoveryOpen === false) return false;

  if (section === "profession" || section === "experience") {
    return isAlreadyWorkingInSecurity(identity.currentStatus);
  }

  return true;
}

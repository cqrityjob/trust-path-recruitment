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
  identity: { owner: "passport", href: "/passport/information#sp-profile-basics" },
  profession: { owner: "profile", href: "/my-career/profile?edit=profession#career-profile" },
  experience: { owner: "profile", href: "/my-career/profile?edit=profession#career-profile" },
  location: { owner: "passport", href: "/passport/information#sp-work-country" },
  employment: { owner: "passport", href: "/passport/information#sp-employment" },
  education: { owner: "passport", href: "/passport/information#sp-education" },
  skills: { owner: "passport", href: "/passport/information#sp-skills" },
  languages: { owner: "passport", href: "/passport/information#sp-languages" },
  careerDirection: { owner: "discovery", href: "/security-career-assessment" },
};

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

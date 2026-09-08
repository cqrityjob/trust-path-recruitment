// "Jag jobbar som väktare — vad kan jag gå vidare till?"
//
// ── THE QUESTION THE FIRST VERSION DID NOT ANSWER ──────────────────────
//
// The pilot's personal section answered exactly one question: which
// occupations the frozen Career Discovery report ranked. That is a real
// answer and it is the wrong one for most readers, because most readers are
// not asking "what suits me". They are standing in a job and asking what is
// reachable from it.
//
// Those two questions have different inputs, different evidence and different
// failure modes, and collapsing them under one "Rekommenderat för dig"
// heading makes both untrustworthy — a reader cannot tell whether a card is
// there because an instrument scored them or because they typed a job title.
//
// So the Career Center now holds THREE concepts, kept apart on purpose:
//
//   fit          suggestions read from the frozen Career Discovery report.
//                Nothing here recomputes them.  (personal-direction.ts)
//
//   pathFrom     directions out of a role the reader has EXPLICITLY named,
//                either in their own profile or in the selector on this page.
//                This module.
//
//   eligibility  never inferred, never claimed, by either of the above.
//                See ELIGIBILITY_IS_NEVER_ASSESSED below.
//
// ── WHERE THE CURRENT ROLE COMES FROM ──────────────────────────────────
//
// Two sources, both explicitly authored by the reader, and the surface always
// says which one it used:
//
//   profile   `security_career_profiles.current_profession_slug`, written by
//             the candidate through the profession picker on their own
//             profile. This is the canonical self-reported value in
//             `ProfessionalIdentityV1`; it is a CIG slug, and it is the
//             SAME field My Career prints as the person's professional
//             identity. Reusing it is right precisely because it is
//             user-authored for the purpose of saying "this is what I do".
//
//   selected  a choice made in the selector on this page, carried in the URL.
//             Available to everybody, including anonymous readers, and it
//             overrides the profile value when both exist — the reader is
//             looking at a career page and asking a hypothetical, and the
//             answer should follow what they just clicked.
//
// ── WHAT IS DELIBERATELY NOT A SOURCE ──────────────────────────────────
//
// Security Passport merits. Not the employment history, not the credentials,
// not their absence. A Passport records what somebody has REGISTERED; it is
// not a record of what they have done, and an absent merit is an absent
// record and nothing else. Deriving "you are a väktare" from a väktare
// credential would turn a registration gap into a statement about a person's
// working life, and deriving "you are not" from its absence would be worse.
// The Career Center does not read the Passport at all, and a guard asserts it.

import type { Profession } from "./types";
import { getPublishedProfession, publishedProfessions } from "./publishability";
import { publishedProfessionFromAnySlug } from "./profession-links";
import { onwardTransitions, type ProfessionTransition } from "./transitions";

/**
 * Eligibility is never assessed, computed, inferred or implied — not from the
 * career analysis, not from a stated current role, not from Passport merits,
 * and not from any combination of them.
 *
 * It is a constant rather than a comment so that a surface renders the
 * disclaimer from the MODEL. Copy can be edited away; a `false` that every
 * personal state carries has to be argued with.
 */
export const ELIGIBILITY_IS_NEVER_ASSESSED = false as const;

/** How the reader's current role was established. Always rendered: a
 *  recommendation must state where it came from. */
export type OriginProvenance = "profile" | "selected";

/** How many directions the hub shows before sending the reader to the guide.
 *  Three, matching the fit section, so neither looks like the fuller answer. */
export const MAX_PATH_DIRECTIONS = 3;

export type CareerOrigin =
  /** The reader has not named a role, and none is stored. Not an error. */
  | { readonly state: "unknown" }
  /** A role is named but the catalogue has no published guide for it — a
   *  free-text profession, or one still under review. The surface says so
   *  rather than silently showing nothing. */
  | { readonly state: "unsupported"; readonly label: string; readonly provenance: OriginProvenance }
  | {
      readonly state: "ready";
      readonly profession: Profession;
      readonly provenance: OriginProvenance;
      /** At most MAX_PATH_DIRECTIONS, ordered by `transitions.ts`. */
      readonly directions: readonly ProfessionTransition[];
      /** How many were recorded in total, so "see all" can be honest about
       *  whether there is more to see. */
      readonly totalDirections: number;
      /** Always false. Directions are not an eligibility verdict. */
      readonly eligibilityAssessed: typeof ELIGIBILITY_IS_NEVER_ASSESSED;
    };

/** Every profession a reader may pick as their current role. Published guides
 *  only: choosing one that has no guide would produce an empty answer that
 *  looks like "there is nowhere to go from here". */
export function selectableOrigins(): readonly Profession[] {
  return [...publishedProfessions].sort((a, b) => a.titleSv.localeCompare(b.titleSv, "sv"));
}

/**
 * Resolve the reader's current role and the directions out of it.
 *
 * `selectedSlug` wins over `profileSlug`: an explicit click on this page is
 * the most recent thing the reader has said about themselves.
 *
 * Both are accepted in either slug namespace — the profile stores a CIG slug,
 * the selector writes a Career Center slug — and both resolve through the one
 * bridge in `profession-links.ts`.
 */
export function careerOrigin(input: {
  readonly selectedSlug?: string | null;
  readonly profileSlug?: string | null;
  readonly profileLabel?: string | null;
  readonly now?: Date;
}): CareerOrigin {
  const now = input.now ?? new Date();
  const selected = input.selectedSlug?.trim() || null;
  const stored = input.profileSlug?.trim() || null;

  const provenance: OriginProvenance | null = selected ? "selected" : stored ? "profile" : null;
  const slug = selected ?? stored;
  if (!slug || !provenance) return { state: "unknown" };

  const profession = publishedProfessionFromAnySlug(slug);
  if (!profession) {
    // A stated role we cannot resolve to a published guide. Named, not hidden:
    // the reader told us something and deserves to see that we heard it.
    return {
      state: "unsupported",
      label: input.profileLabel?.trim() || slug,
      provenance,
    };
  }

  const all = onwardTransitions(profession, now);
  return {
    state: "ready",
    profession,
    provenance,
    directions: all.slice(0, MAX_PATH_DIRECTIONS),
    totalDirections: all.length,
    eligibilityAssessed: ELIGIBILITY_IS_NEVER_ASSESSED,
  };
}

/** The Career Center slug a selector control should write for a profession
 *  the reader picks. Kept here so the URL contract has one owner. */
export function originSlugFor(p: Profession): string {
  return p.slug;
}

/** Whether a slug names something the selector could have written. Used by
 *  the route's search validator so a hand-edited URL degrades to "unknown"
 *  rather than to a broken state. */
export function isSelectableOrigin(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return Boolean(getPublishedProfession(slug));
}

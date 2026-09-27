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
//             answer should follow what they just clicked. It is TEMPORARY:
//             it never writes to the profile, the surface says it is
//             temporary, and "Återgå till mitt sparade yrke" removes it.
//
//   cleared   `?from=none`. The reader explicitly cleared the selector. This
//             is NOT the same as an absent `from`: absent means "use my
//             profile", cleared means "show me nothing for now". Before this
//             state existed, clearing deleted `from` and the profile's role
//             came straight back, so a signed-in reader could not clear the
//             selector at all.
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
import {
  isWellFormedCigSlug,
  professionInfoDestination,
  publishedProfessionFromAnySlug,
  resolveProfessionRef,
  type ProfessionInfoDestination,
} from "./profession-links";
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

/** The `from` value that means "the reader cleared the selector". */
export const ORIGIN_NONE = "none" as const;

/** How many directions the hub shows before sending the reader to the guide.
 *  Three, matching the fit section, so neither looks like the fuller answer. */
export const MAX_PATH_DIRECTIONS = 3;

/** The role saved in the reader's profile, as far as the page can name it.
 *  Present whenever the profile states one — in every origin state — so the
 *  surface can always offer "back to my saved profession". */
export interface SavedRole {
  /** The profile's CIG slug, or null for a free-text role. */
  readonly slug: string | null;
  /** The published guide for it, when one exists. */
  readonly profession: Profession | null;
  /** A human label: the guide title is used by the surface when there is a
   *  guide; otherwise the catalogue's title, otherwise the free text. Never
   *  a raw slug. */
  readonly labelSv: string | null;
  readonly labelEn: string | null;
  readonly info: ProfessionInfoDestination;
}

export type CareerOrigin =
  /** No role is in play: nothing stated, nothing selected — or the reader
   *  explicitly cleared the selector (`cleared`). Not an error. */
  | { readonly state: "unknown"; readonly cleared: boolean; readonly saved: SavedRole | null }
  /** A role is named but the catalogue has no published guide for it — a
   *  free-text profession, or a catalogue profession still without a guide.
   *  The surface names it and offers what exists for it, never a
   *  neighbouring guide. */
  | {
      readonly state: "unsupported";
      readonly provenance: OriginProvenance;
      readonly labelSv: string | null;
      readonly labelEn: string | null;
      /** The reviewed catalogue page for exactly this role, or `none` for
       *  free text. */
      readonly info: ProfessionInfoDestination;
      readonly saved: SavedRole | null;
    }
  | {
      readonly state: "ready";
      readonly profession: Profession;
      readonly provenance: OriginProvenance;
      /** At most MAX_PATH_DIRECTIONS, ordered by `transitions.ts`. */
      readonly directions: readonly ProfessionTransition[];
      /** How many were recorded in total, so "see all" can be honest about
       *  whether there is more to see. */
      readonly totalDirections: number;
      /** The guide for exactly this profession. */
      readonly info: ProfessionInfoDestination;
      readonly saved: SavedRole | null;
      /** Always false. Directions are not an eligibility verdict. */
      readonly eligibilityAssessed: typeof ELIGIBILITY_IS_NEVER_ASSESSED;
    };

/** Every profession a reader may pick as their current role. Published guides
 *  only: choosing one that has no guide would produce an empty answer that
 *  looks like "there is nowhere to go from here". */
export function selectableOrigins(): readonly Profession[] {
  return [...publishedProfessions].sort((a, b) => a.titleSv.localeCompare(b.titleSv, "sv"));
}

function savedRole(input: {
  readonly profileSlug?: string | null;
  readonly profileLabel?: string | null;
  readonly profileTitleSv?: string | null;
  readonly profileTitleEn?: string | null;
}): SavedRole | null {
  const slug = input.profileSlug?.trim() || null;
  const other = input.profileLabel?.trim() || null;
  if (!slug && !other) return null;
  const profession = slug ? (publishedProfessionFromAnySlug(slug) ?? null) : null;
  const catalogueSv = input.profileTitleSv?.trim() || null;
  const catalogueEn = input.profileTitleEn?.trim() || null;
  return {
    slug,
    profession,
    labelSv: profession?.titleSv ?? catalogueSv ?? other,
    labelEn: profession?.titleEn ?? catalogueEn ?? catalogueSv ?? other,
    // The profile stores a CIG slug; a Career Center slug is accepted too
    // (older rows, hand-edited links) and resolved in its own namespace.
    info: !slug
      ? { kind: "none" }
      : resolveProfessionRef(slug)?.namespace === "career_center"
        ? professionInfoDestination({ careerCenterSlug: slug })
        : isWellFormedCigSlug(slug)
          ? professionInfoDestination({ cigSlug: slug })
          : { kind: "none" },
  };
}

/**
 * Resolve the reader's current role and the directions out of it.
 *
 *   `from=<slug>`  the reader's temporary selection; wins over the profile.
 *   `from=none`    the reader cleared the selector; the profile is NOT used.
 *   no `from`      the profile's saved role, when there is one.
 *
 * Both slugs are accepted in either namespace — the profile stores a CIG
 * slug, the selector writes a Career Center slug — and both resolve through
 * the one bridge in `profession-links.ts`. A selection naming the SAME
 * profession as the profile is reported as the profile's, because nothing
 * temporary is in play.
 */
export function careerOrigin(input: {
  readonly selectedSlug?: string | null;
  readonly profileSlug?: string | null;
  /** Free text the reader typed for a role that was not listed. */
  readonly profileLabel?: string | null;
  /** The catalogue's own title for a profile slug without a guide. */
  readonly profileTitleSv?: string | null;
  readonly profileTitleEn?: string | null;
  readonly now?: Date;
}): CareerOrigin {
  const now = input.now ?? new Date();
  const saved = savedRole(input);
  const selected = input.selectedSlug?.trim() || null;

  if (selected === ORIGIN_NONE) return { state: "unknown", cleared: true, saved };

  if (selected) {
    const profession = publishedProfessionFromAnySlug(selected);
    // The validator only lets published guides through, so a miss here is a
    // caller bypassing it; degrade to "nothing selected" rather than guess.
    if (!profession) return { state: "unknown", cleared: false, saved };
    const provenance: OriginProvenance =
      saved?.profession?.id === profession.id ? "profile" : "selected";
    return ready(profession, provenance, saved, now);
  }

  if (!saved) return { state: "unknown", cleared: false, saved: null };
  if (saved.profession) return ready(saved.profession, "profile", saved, now);
  return {
    state: "unsupported",
    provenance: "profile",
    labelSv: saved.labelSv,
    labelEn: saved.labelEn,
    info: saved.info,
    saved,
  };
}

function ready(
  profession: Profession,
  provenance: OriginProvenance,
  saved: SavedRole | null,
  now: Date,
): CareerOrigin {
  const all = onwardTransitions(profession, now);
  return {
    state: "ready",
    profession,
    provenance,
    directions: all.slice(0, MAX_PATH_DIRECTIONS),
    totalDirections: all.length,
    info: {
      kind: "career_center",
      slug: profession.slug,
      href: `/career-center/${profession.slug}`,
    },
    saved,
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
 *  rather than to a broken state. `none` is the explicit "cleared" value. */
export function isSelectableOrigin(slug: string | null | undefined): boolean {
  if (!slug) return false;
  if (slug === ORIGIN_NONE) return true;
  return Boolean(getPublishedProfession(slug));
}

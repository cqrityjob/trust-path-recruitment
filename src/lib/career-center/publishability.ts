// Which profession guides the Career Center is allowed to present as finished.
//
// ── WHY THIS IS DERIVED AND NOT A FLAG ─────────────────────────────────
//
// The obvious implementation is a `published: boolean` on Profession, set by
// hand. That is exactly the mechanism that produced the problem this module
// exists to end: twenty guides shipped, ten of them carrying the sentence
// "Content varies between countries. This guide is under development." as
// their only responsibility, all twenty rendered as equally clickable cards
// with an "UNDER UTVECKLING" badge as the sole distinction. A hand-set flag
// records an intention. It cannot notice that the intention stopped being
// true, and nothing stops a new profession from being added with the flag
// already set.
//
// So publishability is COMPUTED from the content itself. A guide is public
// when it actually carries the things a reader needs in order to trust it:
// a real description, a substantive "Om yrket", a family and a level, real
// competencies, formal requirements wherever the role is regulated, at least
// one onward or prior role, at least one citable source, a review date and a
// stated jurisdiction. Delete the sources from a published guide and it
// leaves the public catalogue on the next render — no flag to remember.
//
// The consequence is that the count in the hero, the explorer results, the
// career routes, the related-profession lists and the route guard all read
// from one predicate, and none of them can drift from another.
//
// No database column, no migration: `Profession` already carries every field
// this reads.

import type { Profession } from "./types";
import { professions } from "./professions";

/** Minimum length, in characters, of a substantive "Om yrket". The ten
 *  placeholder overviews are all shorter than their own disclaimer sentence
 *  is long; the ten researched ones all clear this comfortably. Applied to
 *  BOTH languages so an English reader is never sent to a stub. */
export const MIN_OVERVIEW_CHARS = 100;

/** A guide that describes the work in one bullet is not describing the work.
 *  Placeholders carry exactly one ("Responsibilities vary between..."). */
export const MIN_RESPONSIBILITIES = 2;

/** Fewer than three competencies cannot show a meaningful demand profile. */
export const MIN_COMPETENCIES = 3;

export type PublishabilityFailure =
  | "status_placeholder"
  | "description_missing"
  | "overview_too_thin"
  | "family_missing"
  | "level_missing"
  | "responsibilities_too_few"
  | "competencies_too_few"
  | "regulated_without_requirements"
  | "no_career_path"
  | "no_sources"
  | "no_review_date"
  | "no_jurisdiction";

export interface PublishabilityResult {
  readonly publishable: boolean;
  /** Empty when publishable. Ordered as evaluated, so the first entry is the
   *  most structural reason. Surfaced by the guard script, never in the UI. */
  readonly failures: readonly PublishabilityFailure[];
}

function bothLanguagesPresent(b: { sv: string; en: string } | undefined, min = 1): boolean {
  if (!b) return false;
  return b.sv.trim().length >= min && b.en.trim().length >= min;
}

/**
 * Evaluates one profession against the publishability rule.
 *
 * Total and deterministic: no I/O, no environment, no dates-relative-to-now.
 * A guide's publishability is a property of its content alone, so the same
 * dataset yields the same public catalogue on every render, on the server and
 * in the browser.
 */
export function professionPublishability(p: Profession): PublishabilityResult {
  const failures: PublishabilityFailure[] = [];

  // A profession explicitly marked placeholder is never public, regardless of
  // how much structure it happens to carry.
  if (p.status === "placeholder") failures.push("status_placeholder");

  if (!bothLanguagesPresent(p.description)) failures.push("description_missing");
  if (!bothLanguagesPresent(p.overview, MIN_OVERVIEW_CHARS)) failures.push("overview_too_thin");
  if (!p.family) failures.push("family_missing");
  if (!p.level) failures.push("level_missing");
  if ((p.responsibilities?.length ?? 0) < MIN_RESPONSIBILITIES) {
    failures.push("responsibilities_too_few");
  }
  if ((p.competencies?.length ?? 0) < MIN_COMPETENCIES) failures.push("competencies_too_few");

  // "Formal requirements where relevant". Relevant means regulated. Some
  // regulated professions are regulated as an ACTIVITY rather than as a
  // personal licence (AML is the case in this dataset: the AML Act binds the
  // firm, not the analyst), and those state the position in regulatoryNotes
  // instead. Either satisfies the rule; neither does not.
  if (p.regulated) {
    const hasRequirements = (p.formalRequirements?.length ?? 0) > 0;
    const hasNotes = bothLanguagesPresent(p.regulatoryNotes);
    if (!hasRequirements && !hasNotes) failures.push("regulated_without_requirements");
  }

  const pathEdges = (p.previousRoles?.length ?? 0) + (p.nextRoles?.length ?? 0);
  if (pathEdges === 0) failures.push("no_career_path");

  // A source with no label is not a source. A URL is preferred but a named
  // publisher without one (a printed regulation, say) is still citable.
  const credibleSources = (p.sources ?? []).filter(
    (s) => bothLanguagesPresent(s.label) && (Boolean(s.url) || Boolean(s.publisher)),
  );
  if (credibleSources.length === 0) failures.push("no_sources");

  if (!p.lastVerified) failures.push("no_review_date");
  if ((p.countries?.length ?? 0) === 0) failures.push("no_jurisdiction");

  return { publishable: failures.length === 0, failures };
}

export function isPublishable(p: Profession): boolean {
  return professionPublishability(p).publishable;
}

/** Every guide the Career Center may link to, card, count or route through. */
export const publishedProfessions: readonly Profession[] = professions.filter(isPublishable);

/** Everything else. Presented as a plain text list under "Kommer" — named so
 *  a reader knows the role exists and is not being hidden, but never carded,
 *  never linked, never badged. */
export const upcomingProfessions: readonly Profession[] = professions.filter(
  (p) => !isPublishable(p),
);

/** The only number the hub is allowed to claim about its own catalogue. */
export const PUBLISHED_PROFESSION_COUNT = publishedProfessions.length;

export function getPublishedProfession(idOrSlug: string): Profession | undefined {
  return publishedProfessions.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}

/** Filters a list of profession ids down to the ones that are public.
 *  Used by related-role lists and career routes, which must never dead-end a
 *  reader on an unavailable guide. */
export function publishedOnly(ids: readonly string[]): Profession[] {
  return ids.map((id) => getPublishedProfession(id)).filter((p): p is Profession => Boolean(p));
}

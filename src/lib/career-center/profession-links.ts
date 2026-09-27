// One place that resolves a profession reference arriving from ANY of this
// product's three slug namespaces, and one place that builds the links out.
//
// ── THE DEFECT THIS MODULE EXISTS TO END ───────────────────────────────
//
// Three surfaces name professions, and they do not use the same slug:
//
//   Career Center     English ids   `security-officer`, `security-manager`
//   CIG catalogue     Swedish slugs `vaktare`,          `sakerhetschef`
//   jobs.profession_slug            FK -> cig_professions.slug
//
// Four slugs happen to be spelled identically in both namespaces
// (`ordningsvakt`, `skyddsvakt`, `risk-manager`, `aml-specialist`), which is
// exactly enough coincidence for a namespace bug to look like it works.
//
// It did not work. Two live surfaces built a Career Center URL out of a CIG
// slug and reached the "this guide is not published yet" state for guides
// that ARE published:
//
//   * My Career -> "Din karriärbild" linked the report's top recommendation
//     with `params={{ profession: role.cigSlug }}`. A candidate whose report
//     recommended Väktare was sent to `/career-center/vaktare`, which is not
//     a Career Center slug — so the single most important link on the
//     candidate's home page dead-ended on eight of the twelve bridged roles.
//
//   * `/jobs/profession/$professionSlug` resolved the route param — a CIG
//     slug, because that is what `jobs.profession_slug` stores — through the
//     Career Center's own `getProfession`, and printed the raw slug as the
//     page's <h1> whenever it missed.
//
// ── WHY A RESOLVER AND NOT A SECOND MAPPING TABLE ──────────────────────
//
// `career-intelligence-engine/slug-map.ts` already holds the one reviewed
// Career-Center <-> CIG bridge, with a guard (career-profession-bridge:check)
// that refuses proxy mappings. Adding a second table here would be a second
// source of truth that agrees today and drifts on the first edit. So this
// module OWNS NO DATA. It composes the existing bridge with the existing
// publishability predicate and nothing else.
//
// ── THE RESOLUTION RULE ────────────────────────────────────────────────
//
//   1. The slug is a Career Center id or slug     -> that profession.
//   2. The slug is a bridged CIG slug             -> the bridged profession.
//   3. Neither                                    -> undefined.
//
// Order matters. Career Center first, so a slug that is valid in BOTH
// namespaces always resolves to the record the URL space belongs to, and a
// future CIG row that reused a Career Center slug for a different occupation
// could never silently take over an existing guide.
//
// `ENRICHMENT_UNAVAILABLE` professions resolve in direction 1 and not in
// direction 2, which is correct: they have a guide, they have no honest CIG
// node, and inventing one here would reintroduce exactly the proxy mapping
// the bridge guard forbids.

import { toCigSlug, toLegacySlug } from "@/lib/career-intelligence-engine/slug-map";
import { getProfession } from "./professions";
import { getPublishedProfession } from "./publishability";
import type { Profession } from "./types";

/** Which namespace a reference was recognised in. Carried so a caller that
 *  needs to explain itself (a guard, a report) can say which bridge it used
 *  rather than asserting a resolution it cannot show. */
export type ProfessionRefNamespace = "career_center" | "cig";

export interface ResolvedProfessionRef {
  readonly profession: Profession;
  readonly namespace: ProfessionRefNamespace;
  /** True when the guide clears the publishability rule and may be linked to. */
  readonly published: boolean;
}

/**
 * Resolve a profession reference from either namespace.
 *
 * Total: an unknown slug yields `undefined` rather than a guess. Never
 * falls back to a "closest" profession — a wrong guide is worse than no
 * guide, which is the same rule the CIG bridge itself enforces.
 */
export function resolveProfessionRef(
  slug: string | null | undefined,
): ResolvedProfessionRef | undefined {
  if (!slug) return undefined;

  const direct = getProfession(slug);
  if (direct) {
    return {
      profession: direct,
      namespace: "career_center",
      published: Boolean(getPublishedProfession(direct.id)),
    };
  }

  const legacy = toLegacySlug(slug);
  if (!legacy) return undefined;
  const bridged = getProfession(legacy);
  if (!bridged) return undefined;
  return {
    profession: bridged,
    namespace: "cig",
    published: Boolean(getPublishedProfession(bridged.id)),
  };
}

/**
 * The published guide a reference points at, or `undefined`.
 *
 * This is what a LINK should be built from: a caller that cannot produce a
 * published guide must render plain text, not a link into the unavailable
 * state. An unpublished-but-real profession is deliberately indistinguishable
 * here from an unknown slug, because the two call for the same treatment.
 */
export function publishedProfessionFromAnySlug(
  slug: string | null | undefined,
): Profession | undefined {
  const resolved = resolveProfessionRef(slug);
  return resolved?.published ? resolved.profession : undefined;
}

/**
 * The Career Center URL path segment for a reference in either namespace, or
 * `null` when no published guide exists.
 *
 * `null` is the whole point: every caller is forced to decide what to render
 * when there is no guide, instead of interpolating a slug into a URL and
 * discovering at click time that it does not resolve.
 */
export function careerCenterProfessionSlug(slug: string | null | undefined): string | null {
  return publishedProfessionFromAnySlug(slug)?.slug ?? null;
}

/**
 * The slug `/jobs/profession/$professionSlug` must be given for a profession
 * — the CIG slug, because `jobs.profession_slug` is a foreign key onto
 * `cig_professions.slug` and a Career Center slug matches no job row.
 *
 * `null` for a profession with no canonical CIG node. A jobs link for one of
 * those would query a slug no job can carry and always render "no openings",
 * which reads as "nobody is hiring" rather than as "we cannot ask that
 * question yet".
 */
export function jobsProfessionSlug(p: Pick<Profession, "id">): string | null {
  return toCigSlug(p.id) ?? null;
}

// ── WHERE "LÄS OM YRKET" GOES, FROM ANY SURFACE ────────────────────────
//
// Every surface that names a profession — the Career Discovery report, the
// Career Center's personal recommendation, the current-profession selector,
// My Career — needs ONE answer to "where can I read about exactly this
// profession". Before this, the report opened an in-card CIG panel for a
// profession without a guide, while the Career Center's recommendation for
// the SAME profession ended at a "no guide yet" sentence. Two surfaces, one
// recommendation, two different answers — and one of them a dead end.
//
// The rule, in order of preference:
//
//   1. A PUBLISHED Career Center guide, `/career-center/$profession`.
//      Reviewed, sourced, bilingual, indexed. Resolved through the same
//      bridge and publishability predicate as every other link in this
//      module, so an unpublished placeholder is never linked into the
//      "not published yet" state.
//
//   2. The profession's page in the reviewed Career Intelligence Graph,
//      `/career-center/yrke/$cigSlug`. Only rows with content_status
//      'published' are readable (the `cig read published` RLS policy), so
//      this shows reviewed catalogue content — overview, formal requirements,
//      education, documented transitions, review date — or says honestly
//      that none is published. Nothing is synthesised, and the page names
//      its source as the catalogue rather than as a guide.
//
//   3. Nothing (`none`), when the reference names no profession either
//      namespace knows. The caller renders plain text.
//
// `/jobs/profession/$professionSlug` is NOT a destination for information
// and is never returned here: a job list is not a description of an
// occupation, and a candidate pressing "read about it" and landing on an
// empty list has been told nobody is hiring, not what the work is.
//
// Pure and deterministic: no I/O, so a guard can walk the whole approved
// catalogue and prove every occupation has a destination with the right
// identity.

/** The route prefix of the reviewed-catalogue profile page. */
export const CATALOGUE_PROFILE_PREFIX = "/career-center/yrke" as const;

/** A CIG slug is lower-case ASCII words joined by hyphens. Anything else is
 *  not a slug any surface stores, and is never interpolated into a URL. */
const CIG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isWellFormedCigSlug(slug: string | null | undefined): slug is string {
  return typeof slug === "string" && slug.length <= 80 && CIG_SLUG_PATTERN.test(slug);
}

export function catalogueProfileHref(cigSlug: string): string {
  return `${CATALOGUE_PROFILE_PREFIX}/${cigSlug}`;
}

export type ProfessionInfoDestination =
  | {
      readonly kind: "career_center";
      /** The Career Center slug — the `$profession` param, never a CIG slug. */
      readonly slug: string;
      readonly href: string;
    }
  | {
      readonly kind: "catalogue_profile";
      /** The CIG slug the page reads — the `$cigSlug` param. */
      readonly cigSlug: string;
      readonly href: string;
    }
  | { readonly kind: "none" };

/**
 * Where "Läs om yrket" leads for a profession named in either namespace.
 *
 * `careerCenterSlug` is tried first (it is what the Career Center's own
 * catalogue carries); `cigSlug` second (what the report, the profile and
 * `jobs.profession_slug` carry). A Career Center profession whose guide is
 * not published falls through to its bridged CIG node, never to a
 * neighbouring guide.
 */
export function professionInfoDestination(ref: {
  readonly careerCenterSlug?: string | null;
  readonly cigSlug?: string | null;
}): ProfessionInfoDestination {
  const guideAt = (slug: string): ProfessionInfoDestination => ({
    kind: "career_center",
    slug,
    href: `/career-center/${slug}`,
  });
  const catalogueAt = (cigSlug: string): ProfessionInfoDestination => ({
    kind: "catalogue_profile",
    cigSlug,
    href: catalogueProfileHref(cigSlug),
  });

  if (ref.careerCenterSlug) {
    const resolved = resolveProfessionRef(ref.careerCenterSlug);
    if (resolved?.published) return guideAt(resolved.profession.slug);
    if (resolved) {
      // A known profession without a published guide: its OWN catalogue
      // node, through the reviewed bridge — or nothing.
      const cig =
        resolved.namespace === "cig" ? ref.careerCenterSlug : toCigSlug(resolved.profession.id);
      if (isWellFormedCigSlug(cig)) return catalogueAt(cig);
      return { kind: "none" };
    }
  }

  if (ref.cigSlug) {
    const guide = careerCenterProfessionSlug(ref.cigSlug);
    if (guide) return guideAt(guide);
    if (isWellFormedCigSlug(ref.cigSlug)) return catalogueAt(ref.cigSlug);
  }
  return { kind: "none" };
}

/**
 * Where "Utforska nu" on a Career Discovery recommendation leads.
 *
 * Takes the recommendation's CIG slug (`ProfessionMatch.cigProfessionSlug`),
 * the one identifier a Career Discovery catalogue row carries. Kept under its
 * original name for the report's callers; it is `professionInfoDestination`
 * with that one input, so the report and the Career Center can never
 * disagree about where the same profession is described.
 */
export function exploreDestinationFor(ref: {
  readonly cigProfessionSlug: string | null;
}): ProfessionInfoDestination {
  return professionInfoDestination({ cigSlug: ref.cigProfessionSlug });
}
export type ProfessionExploreDestination = ProfessionInfoDestination;

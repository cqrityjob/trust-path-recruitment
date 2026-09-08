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

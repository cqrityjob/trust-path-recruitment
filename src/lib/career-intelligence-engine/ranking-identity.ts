// Career Intelligence Engine v1 -- FROZEN ranking identity.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
//
// Before PR-A the engine deduplicated its ranked list on
// `cigSlug || legacySlug || professionKey`: two legacy professions that
// shared a CIG slug were treated as one profession, the lower-scoring one
// was dropped, and the family aggregates were computed from that reduced
// list. Two pairs shared a slug:
//
//   intelligence-analyst  +  security-investigator   (sakerhetsutredare)
//   security-consultant   +  security-coordinator    (sakerhetssamordnare)
//
// PR-A repairs the ENRICHMENT bridge (slug-map.ts) so those pairs no longer
// share a CIG node. If the dedup key had stayed derived from the bridge,
// that repair would have un-collapsed the pairs and changed the engine's
// family ranking for every persona -- a ranking change PR-A is not allowed
// to make. So the dedup key now lives here, frozen at exactly the
// equivalence classes the engine had before, and the bridge is free to be
// honest without touching a single score.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
//
// It is not a CIG bridge and it must never be read for enrichment, titles,
// job relevance or anything user-facing. It encodes a KNOWN collision in
// the ranking layer (the two pairs above are distinct professions and
// still collapse in the ranked list). Un-collapsing them is a ranking
// change that needs Product Owner review; when approved, delete the two
// groups below and re-baseline cie:check.
//
// scripts/career-profession-bridge-check.tsx proves the engine's ranked
// output is byte-identical to the pre-PR-A engine for every persona.

const RANKING_GROUP: Readonly<Record<string, string>> = Object.freeze({
  "intelligence-analyst": "cie-rank-group:investigation",
  "security-investigator": "cie-rank-group:investigation",
  "security-consultant": "cie-rank-group:coordination",
  "security-coordinator": "cie-rank-group:coordination",
});

/**
 * Dedup identity for the ranked list. Every profession is its own identity
 * except the two frozen pairs above, which share one -- exactly the
 * equivalence the engine had when the identity was derived from the bridge.
 */
export function cieRankingIdentity(legacySlug: string): string {
  return RANKING_GROUP[legacySlug] ?? legacySlug;
}

/** Exposed for the guard only. */
export const FROZEN_RANKING_GROUPS: Readonly<Record<string, string>> = RANKING_GROUP;

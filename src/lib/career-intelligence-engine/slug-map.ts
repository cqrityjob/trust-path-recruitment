// Legacy TS profession slug ↔ CIG cig_professions.slug map.
//
// The current source of truth for scoring is the TS `professionProfiles`
// array (English-slug-based). The CIG catalogue uses Swedish slugs. This
// map bridges the two so enrichment (formal requirements, transitions,
// education, certifications, sources, family, disclaimer) can be drawn
// from CIG for professions where a canonical CIG row exists.
//
// When a legacy slug has no CIG counterpart, enrichment gracefully
// degrades (no formal-requirements block, empty transitions, etc.) and a
// `cig_enrichment_missing` warning is surfaced on the envelope.
//
// Adding a new mapping is safe: it never affects scoring, only enrichment.

export const LEGACY_TO_CIG_SLUG: Record<string, string> = {
  "security-officer": "vaktare",
  ordningsvakt: "ordningsvakt",
  skyddsvakt: "skyddsvakt",
  "security-manager": "sakerhetschef",
  "security-technician": "sakerhetstekniker",
  "risk-manager": "risk-manager",
  "aml-specialist": "aml-specialist",
  "data-center-security": "flygplatssakerhet", // closest published CIG proxy; see phase-d-report.md
  "crisis-continuity-manager": "krisberedskapssamordnare",
  "close-protection": "livvakt",
  "soc-analyst": "soc-analytiker",
  "intelligence-analyst": "sakerhetsutredare",
  "fraud-investigator": "civil-utredare",
  "security-investigator": "sakerhetsutredare",
  "security-consultant": "sakerhetssamordnare",
  "security-coordinator": "sakerhetssamordnare",
};

export function toCigSlug(legacySlug: string): string | undefined {
  return LEGACY_TO_CIG_SLUG[legacySlug];
}

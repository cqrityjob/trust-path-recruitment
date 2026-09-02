// Legacy TS profession slug <-> CIG cig_professions.slug bridge.
//
// The scoring source of truth is the TS `professionProfiles` array
// (English-slug-based). The CIG catalogue uses Swedish slugs. This bridge
// lets ENRICHMENT (formal requirements, transitions, education,
// certifications, sources, disclaimer, canonical title) be drawn from CIG
// for professions where a canonical CIG row exists.
//
// ── THE RULE THIS FILE ENFORCES ──────────────────────────────────────────
//
//   ONE profession -> ONE semantically correct canonical CIG profession,
//   or NO enrichment at all.
//
// A profession is never bridged to a *different* profession merely to
// avoid an empty state. No enrichment is better than wrong enrichment:
// a data-centre security specialist must never be shown airport-security
// facts, and a corporate fraud investigator must never inherit the police
// civilian-investigator's formal requirements. Both of those bridges
// existed here before PR-A and are now listed under ENRICHMENT_UNAVAILABLE
// with the proxy they were wrongly pointed at, so the guard
// (scripts/career-profession-bridge-check.tsx) fails if either returns.
//
// ── WHAT THIS BRIDGE DOES AND DOES NOT TOUCH ──────────────────────────────
//
//   * Forward:  legacy slug -> CIG slug   (compute.functions.ts enrichment
//               reads; Match.cigSlug on the engine envelope)
//   * Reverse:  CIG slug -> legacy slug   (job-intelligence/personal-relevance
//               resolves a job's `profession_slug` back to the scoring slug)
//   * It never affects scoring. Ranking dedup identity is deliberately NOT
//     derived from this bridge any more -- see ranking-identity.ts.
//
// Career Discovery v3.1 has its own, database-side bridge
// (cd_professions.cig_profession_slug). That one is reviewed content and
// is not read here; the guard asserts the two agree wherever both exist.
//
// ── CLASSIFICATION VOCABULARY ────────────────────────────────────────────
//
//   exact             the CIG row is the same profession (same Swedish title
//                     or the CIG row's own title/summary names this role)
//   acceptable_alias  the CIG row is the same occupation at a different
//                     seniority, or is declared an alias by the CIG catalogue
//                     itself, and the facts it carries are level-agnostic
//   missing_canonical_node
//                     no honest CIG row exists -> no enrichment, neutral copy
//
// Adding an EXACT mapping is safe. Adding an alias needs the rationale
// written next to it. Adding a proxy is forbidden by the guard.

export type BridgeClassification = "exact" | "acceptable_alias";

export interface ProfessionBridgeEntry {
  readonly legacySlug: string;
  readonly cigSlug: string;
  readonly classification: BridgeClassification;
  /** Why this target and not another. Kept short; the audit doc has the detail. */
  readonly rationale: string;
}

export interface EnrichmentUnavailableEntry {
  readonly legacySlug: string;
  readonly classification: "missing_canonical_node";
  /**
   * CIG slugs this profession was bridged to before PR-A, or that a future
   * edit might be tempted to use. The guard fails if any of them comes back.
   */
  readonly rejectedProxies: readonly string[];
  readonly rationale: string;
}

/** Every active legacy -> CIG enrichment bridge. One row per profession. */
export const CAREER_PROFESSION_BRIDGE: readonly ProfessionBridgeEntry[] = [
  {
    legacySlug: "security-officer",
    cigSlug: "vaktare",
    classification: "exact",
    rationale: "Väktare / Security Officer (Väktare) -- identical role.",
  },
  {
    legacySlug: "ordningsvakt",
    cigSlug: "ordningsvakt",
    classification: "exact",
    rationale: "Same slug, same regulated role.",
  },
  {
    legacySlug: "skyddsvakt",
    cigSlug: "skyddsvakt",
    classification: "exact",
    rationale: "Same slug, same regulated role.",
  },
  {
    legacySlug: "security-manager",
    cigSlug: "sakerhetschef",
    classification: "exact",
    rationale: "Säkerhetschef on both sides; CIG's English title is Head of Security.",
  },
  {
    legacySlug: "security-technician",
    cigSlug: "sakerhetstekniker",
    classification: "exact",
    rationale: "Säkerhetstekniker on both sides.",
  },
  {
    legacySlug: "risk-manager",
    cigSlug: "risk-manager",
    classification: "exact",
    rationale: "Same slug; CIG title Riskchef / Risk Manager.",
  },
  {
    legacySlug: "aml-specialist",
    cigSlug: "aml-specialist",
    classification: "exact",
    rationale: "Same slug, same role.",
  },
  {
    legacySlug: "crisis-continuity-manager",
    cigSlug: "krisberedskapssamordnare",
    classification: "acceptable_alias",
    rationale:
      "CIG summary is 'samordnar planering och övning för kris och kontinuitet' -- the same crisis-and-continuity function at coordinator rather than manager level. The node is unregulated; its facts are level-agnostic.",
  },
  {
    legacySlug: "close-protection",
    cigSlug: "livvakt",
    classification: "acceptable_alias",
    rationale:
      "The CIG catalogue's own alias table declares 'livvakt (auktoriserad)' an alias of personskyddsvakt, and both CIG rows carry the same livvakt-godkannande formal requirement. Career Discovery bridges the same role to personskyddsvakt; that disagreement is reported for consolidation, not silently re-pointed here.",
  },
  {
    legacySlug: "soc-analyst",
    cigSlug: "soc-analytiker",
    classification: "exact",
    rationale: "SOC-analytiker / SOC Analyst on both sides.",
  },
  {
    legacySlug: "security-investigator",
    cigSlug: "sakerhetsutredare",
    classification: "exact",
    rationale: "Säkerhetsutredare / Security Investigator on both sides.",
  },
  {
    legacySlug: "security-coordinator",
    cigSlug: "sakerhetssamordnare",
    classification: "exact",
    rationale: "Säkerhetssamordnare / Security Coordinator on both sides.",
  },
];

/**
 * Professions with NO honest canonical CIG row. They keep their title,
 * their Career Center guide, their scoring and their place in the ranking;
 * only the supplemental CIG enrichment is unavailable, and the UI says so
 * in neutral copy (see labels.ts::enrichmentUnavailableCopy).
 */
export const ENRICHMENT_UNAVAILABLE: readonly EnrichmentUnavailableEntry[] = [
  {
    legacySlug: "data-center-security",
    classification: "missing_canonical_node",
    rejectedProxies: ["flygplatssakerhet"],
    rationale:
      "Airport security screening (EU 2015/1998 certification) is a different profession from data-centre physical security. No CIG row for data-centre / critical-facility security exists yet.",
  },
  {
    legacySlug: "fraud-investigator",
    classification: "missing_canonical_node",
    rejectedProxies: ["civil-utredare", "polisutredare"],
    rationale:
      "civil-utredare is a civilian investigator INSIDE the Police Authority (regulated, police admission). Corporate fraud investigation is not that role. fraud-analyst exists only as a draft and is an analyst, not an investigator.",
  },
  {
    legacySlug: "intelligence-analyst",
    classification: "missing_canonical_node",
    rejectedProxies: ["sakerhetsutredare", "polis-intel-analytiker"],
    rationale:
      "sakerhetsutredare is the Security Investigator (already the exact node of security-investigator). osint-analytiker / threat-intel-analytiker are unpublished drafts and narrower; polis-intel-analytiker is a police role.",
  },
  {
    legacySlug: "security-consultant",
    classification: "missing_canonical_node",
    rejectedProxies: ["sakerhetssamordnare"],
    rationale:
      "sakerhetssamordnare is the in-house Security Coordinator (already the exact node of security-coordinator). External advisory consulting has no CIG row.",
  },
];

/** legacy slug -> the CIG slugs it must never be bridged to. */
export const FORBIDDEN_CIG_PROXIES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(ENRICHMENT_UNAVAILABLE.map((e) => [e.legacySlug, e.rejectedProxies])),
);

/**
 * Flat forward map, kept under its historical name so existing imports
 * keep working. Derived from CAREER_PROFESSION_BRIDGE -- never edit it
 * directly.
 */
export const LEGACY_TO_CIG_SLUG: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(CAREER_PROFESSION_BRIDGE.map((e) => [e.legacySlug, e.cigSlug])),
);

const CIG_TO_LEGACY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(CAREER_PROFESSION_BRIDGE.map((e) => [e.cigSlug, e.legacySlug])),
);

/** Forward: legacy scoring slug -> canonical CIG slug, or undefined (no enrichment). */
export function toCigSlug(legacySlug: string): string | undefined {
  return LEGACY_TO_CIG_SLUG[legacySlug];
}

/**
 * Reverse: CIG slug -> the ONE legacy scoring slug bridged to it, or
 * undefined. The bridge is one-to-one, so a CIG slug that two professions
 * used to share (sakerhetsutredare, sakerhetssamordnare) now resolves to
 * its exact profession only, and a rejected proxy (flygplatssakerhet,
 * civil-utredare) resolves to nothing rather than to the profession it was
 * wrongly attached to.
 */
export function toLegacySlug(cigSlug: string): string | undefined {
  return CIG_TO_LEGACY[cigSlug];
}

/** True when the profession is scored but has no canonical CIG node. */
export function isEnrichmentUnavailable(legacySlug: string): boolean {
  return ENRICHMENT_UNAVAILABLE.some((e) => e.legacySlug === legacySlug);
}

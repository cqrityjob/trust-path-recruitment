// Career Patterns — the interpretation layer.
//
// A pure function of the dimension vector. Patterns EXPLAIN a result; they
// never produce one. Nothing here is an input to profession matching, which
// is a property the guard script asserts rather than a convention this
// comment hopes for.
//
// ── OWNER-APPROVED DEFINITIONS ─────────────────────────────────────────
//
// Ten patterns, each with three central dimensions (weight 1.0) and three
// supporting (0.5), disjoint. Plus CP00 Balanced Profile, which is a
// first-class result and not an error state.
//
// Verified before implementation: maximum pairwise cosine similarity across
// all 45 pairs is 0.667, all ten are reachable as leading pattern in 200/200
// randomised archetype trials, and flat / near-tie / all-high profiles all
// resolve to CP00. The guard script re-runs those checks on every build.
//
// ── CID15 IS EXCLUDED FROM PATTERN SCORING ─────────────────────────────
//
// Its measured range is 0.25. Including it would add nearly the same value
// to all ten pattern scores — shifting every one equally, changing no
// ranking, and implying a precision the evidence cannot support.

import { PATTERN_SCORED_DIMENSION_IDS, type DimensionId } from "./dimensions";
import type { DimensionResult } from "./scoring";
import { PATTERN_DEFINITION_VERSION, type Bilingual } from "./version";

export const PATTERN_IDS = [
  "CP01",
  "CP02",
  "CP03",
  "CP04",
  "CP05",
  "CP06",
  "CP07",
  "CP08",
  "CP09",
  "CP10",
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];
/** CP00 is the Balanced Profile: a result, not a failure to produce one. */
export type ResolvedPatternId = PatternId | "CP00";

export const CENTRAL_WEIGHT = 1.0;
export const SUPPORTING_WEIGHT = 0.5;

export interface PatternDefinition {
  readonly id: PatternId;
  readonly name: Bilingual;
  readonly central: readonly DimensionId[];
  readonly supporting: readonly DimensionId[];
  /** Owner decision B-18: stored so a future Career Roadmap layer has its
   *  first development objective already computed rather than re-derived
   *  from prose. */
  readonly growthEdgeDimension: DimensionId;
  /** The pattern this one most commonly grows toward. A roadmap edge.
   *  null for CP08, which is terminal within the pattern set. */
  readonly progressionTarget: PatternId | null;
  /** The most distinctive central dimension — what other people notice
   *  first, because what people notice is not what you are best at but what
   *  you have that those around you do not. Derived, then frozen here. */
  readonly superpowerDimension: DimensionId;
}

export const PATTERNS: Readonly<Record<PatternId, PatternDefinition>> = {
  CP01: {
    id: "CP01",
    name: { sv: "Operativ trygghetsskapare", en: "Operational Protector" },
    central: ["CID01", "CID06", "CID12"],
    supporting: ["CID16", "CID11", "CID08"],
    superpowerDimension: "CID01",
    growthEdgeDimension: "CID13",
    progressionTarget: "CP07",
  },
  CP02: {
    id: "CP02",
    name: { sv: "Samhällsskyddande insatsperson", en: "Public Safety Responder" },
    central: ["CID09", "CID16", "CID08"],
    supporting: ["CID01", "CID13", "CID07"],
    superpowerDimension: "CID09",
    growthEdgeDimension: "CID02",
    progressionTarget: "CP07",
  },
  CP03: {
    id: "CP03",
    name: { sv: "Utredande analytiker", en: "Investigative Thinker" },
    central: ["CID10", "CID03", "CID12"],
    supporting: ["CID11", "CID14", "CID06"],
    superpowerDimension: "CID10",
    growthEdgeDimension: "CID07",
    progressionTarget: "CP09",
  },
  CP04: {
    id: "CP04",
    name: { sv: "Teknisk problemlösare", en: "Technical Problem Solver" },
    central: ["CID04", "CID03", "CID14"],
    supporting: ["CID11", "CID12", "CID01"],
    superpowerDimension: "CID04",
    growthEdgeDimension: "CID07",
    progressionTarget: "CP09",
  },
  CP05: {
    id: "CP05",
    name: { sv: "Risk- och kontinuitetsplanerare", en: "Risk & Resilience Planner" },
    central: ["CID06", "CID05", "CID11"],
    supporting: ["CID03", "CID13", "CID07"],
    superpowerDimension: "CID05",
    growthEdgeDimension: "CID02",
    progressionTarget: "CP08",
  },
  CP06: {
    id: "CP06",
    name: { sv: "Regelefterlevnadsspecialist", en: "Compliance Guardian" },
    // CID17 (Regulatory & Compliance Orientation) replaces CID09 (Conflict
    // Management) as this pattern's defining trait (Final Autonomous Matching
    // Engine Completion Mandate): conflict handling never actually described
    // compliance work, it was a work-style proxy standing in for a domain
    // signal that did not exist yet. CID09 remains valid supporting evidence.
    central: ["CID11", "CID06", "CID17"],
    supporting: ["CID03", "CID07", "CID09"],
    superpowerDimension: "CID17",
    growthEdgeDimension: "CID10",
    progressionTarget: "CP03",
  },
  CP07: {
    id: "CP07",
    name: { sv: "Samordnande kraft", en: "Collaborative Coordinator" },
    central: ["CID13", "CID02", "CID07"],
    supporting: ["CID11", "CID08", "CID01"],
    superpowerDimension: "CID02",
    growthEdgeDimension: "CID05",
    progressionTarget: "CP08",
  },
  CP08: {
    id: "CP08",
    name: { sv: "Strategisk säkerhetsledare", en: "Strategic Security Leader" },
    central: ["CID05", "CID02", "CID12"],
    supporting: ["CID06", "CID07", "CID13"],
    superpowerDimension: "CID02",
    // Corrected from the derivation: CP08 is terminal in the pattern set, so
    // its edge is depth at executive level. At that level the constraint
    // stops being what you know and becomes whether the board acts on it.
    growthEdgeDimension: "CID07",
    progressionTarget: null,
  },
  CP09: {
    id: "CP09",
    name: { sv: "Betrodd säkerhetsrådgivare", en: "Trusted Security Adviser" },
    central: ["CID07", "CID05", "CID03"],
    supporting: ["CID14", "CID08", "CID12"],
    superpowerDimension: "CID05",
    // Corrected from the derivation, which produced Leadership → CP08. That
    // contradicts the CP08/CP09 fork: advising is a deliberate choice, not a
    // rung below leading. The honest edge is making advice outlive the
    // engagement.
    growthEdgeDimension: "CID11",
    progressionTarget: null,
  },
  CP10: {
    id: "CP10",
    name: { sv: "Digital systemförsvarare", en: "Digital Systems Defender" },
    central: ["CID04", "CID06", "CID16"],
    supporting: ["CID03", "CID10", "CID14"],
    superpowerDimension: "CID04",
    // Corrected: the derivation pointed at CP04, which is sideways rather
    // than upward. Translating technical risk into something the business
    // can act on is the real bottleneck for SOC analysts.
    growthEdgeDimension: "CID07",
    progressionTarget: "CP09",
  },
};

/** Resolution thresholds. Versioned configuration, never literals in a
 *  component (owner decision 6, owner decision B-2). Separate from the
 *  profession-matching values: ten patterns over fifteen shared dimensions
 *  sit closer together than professions do, so the spread is smaller. */
export const PATTERN_CONFIG = {
  minLead: 55,
  minSpread: 6.0,
  supportingMin: 50,
  supportingWindow: 12,
  supportingMax: 2,
} as const;

export interface PatternScore {
  readonly patternId: PatternId;
  /** 0–100. Internal only: never rendered to a candidate (owner decision B-5). */
  readonly score: number;
  readonly rank: number;
  readonly centralValues: Readonly<Partial<Record<DimensionId, number>>>;
  readonly supportingValues: Readonly<Partial<Record<DimensionId, number>>>;
  /** How much of the pattern's definition was actually observed. */
  readonly observedWeight: number;
  readonly definitionWeight: number;
  /** True when any central dimension rests only on tertiary evidence.
   *  Owner decision A-2 forbids such a pattern from leading. */
  readonly centralTertiaryOnly: boolean;
}

export interface PatternResult {
  readonly patternDefinitionVersion: string;
  /** null when the profile is balanced — see `balanced`. */
  readonly leading: PatternId | null;
  readonly supporting: readonly PatternId[];
  /** True when no pattern met the lead thresholds. The report shows CP00. */
  readonly balanced: boolean;
  /** The three strongest directions, named for CP00's story. */
  readonly leaningToward: readonly PatternId[];
  /** Every pattern scored, ranked. Output A. */
  readonly scores: readonly PatternScore[];
  /** Set when a pattern was suppressed by an honesty rule, naming which. */
  readonly suppressions: readonly string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Score every pattern and resolve leading / supporting / balanced.
 *
 * A dimension with no evidence is excluded from BOTH the numerator and the
 * denominator, so a partial profile degrades gracefully instead of scoring
 * low. Scoring an unobserved dimension as zero would make every incomplete
 * run look balanced for the wrong reason.
 */
export function resolvePatterns(dims: DimensionResult): PatternResult {
  const suppressions: string[] = [];

  const scores: PatternScore[] = PATTERN_IDS.map((id) => {
    const def = PATTERNS[id];
    let numerator = 0;
    let observed = 0;
    const centralValues: Partial<Record<DimensionId, number>> = {};
    const supportingValues: Partial<Record<DimensionId, number>> = {};
    let centralTertiaryOnly = false;

    for (const d of def.central) {
      const s = dims.dimensions[d];
      if (s.score === null) continue;
      numerator += s.score * CENTRAL_WEIGHT;
      observed += CENTRAL_WEIGHT;
      centralValues[d] = s.score;
      if (s.tertiaryOnly) centralTertiaryOnly = true;
    }
    for (const d of def.supporting) {
      const s = dims.dimensions[d];
      if (s.score === null) continue;
      numerator += s.score * SUPPORTING_WEIGHT;
      observed += SUPPORTING_WEIGHT;
      supportingValues[d] = s.score;
    }

    return {
      patternId: id,
      score: observed > 0 ? round2((100 * numerator) / observed) : 0,
      rank: 0,
      centralValues,
      supportingValues,
      observedWeight: observed,
      definitionWeight: 3 * CENTRAL_WEIGHT + 3 * SUPPORTING_WEIGHT,
      centralTertiaryOnly,
    };
  });

  // Ties broken by pattern id so the ordering is deterministic rather than
  // dependent on sort stability.
  scores.sort((a, b) => b.score - a.score || a.patternId.localeCompare(b.patternId));
  const ranked = scores.map((s, i) => ({ ...s, rank: i + 1 }));

  const top = ranked[0];
  const second = ranked[1];

  const meetsLead =
    top.score >= PATTERN_CONFIG.minLead && top.score - second.score >= PATTERN_CONFIG.minSpread;

  // Owner decision A-2 / B T6: tertiary evidence may not independently
  // determine a pattern. CP07 and CP08 are the exposed ones, because CID02
  // draws four of its five sources from tertiary loadings.
  const tertiaryBlocked = meetsLead && top.centralTertiaryOnly;
  if (tertiaryBlocked) {
    suppressions.push(
      `${top.patternId}: a central dimension rests only on tertiary evidence (A-2)`,
    );
  }

  const leading = meetsLead && !tertiaryBlocked ? top.patternId : null;

  const supporting = leading
    ? ranked
        .slice(1)
        .filter(
          (s) =>
            s.score >= PATTERN_CONFIG.supportingMin &&
            top.score - s.score <= PATTERN_CONFIG.supportingWindow,
        )
        .slice(0, PATTERN_CONFIG.supportingMax)
        .map((s) => s.patternId)
    : [];

  return {
    patternDefinitionVersion: PATTERN_DEFINITION_VERSION,
    leading,
    supporting,
    balanced: leading === null,
    leaningToward: leading === null ? ranked.slice(0, 3).map((s) => s.patternId) : [],
    scores: ranked,
    suppressions,
  };
}

/** Dimensions used in pattern scoring. Re-exported so a consumer never has
 *  to know that CID15 is the exception. */
export const PATTERN_DIMENSIONS = PATTERN_SCORED_DIMENSION_IDS;

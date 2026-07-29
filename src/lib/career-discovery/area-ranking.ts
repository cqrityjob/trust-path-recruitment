// Security Career Area ranking — deterministic.
//
// Implements career-intelligence-mapping-v3.0.md §4.
//
// ── WHAT RANKS, AND WHAT DOES NOT ──────────────────────────────────────
//
// Input is the DnaResult and NOTHING else. This module does not import the
// adaptive bank, does not accept report tags, and has no parameter through
// which a contextual answer could reach it. Adaptive answers influence
// examples, next steps and tone in report.ts — never the ordering here.
//
// Three properties from §4 that the previous engine got wrong:
//
//   1. Rank on fit ALONE. The old engine sorted on
//      `min(raw, displayCap[confidence])`, so a strong match with thin
//      evidence lost to a weaker one with fuller coverage — the ordering
//      was partly an ordering of coverage (F-5). Here confidence is
//      reported alongside and never folded into the sort.
//   2. Emerging axes contribute NOTHING — not a reduced weight. An axis the
//      platform is unsure about must not quietly move a ranking the user
//      cannot inspect.
//   3. Context-dependence WIDENS rather than narrows. A genuinely flexible
//      person fits more roles, so a context-dependent axis is treated as
//      compatible with both ends, never resolved to a midpoint that fits
//      nothing.

import { AREAS_BY_ID, SECURITY_CAREER_AREAS } from "./career-areas";
import type { AxisBand, SecurityCareerArea, SecurityCareerAreaId } from "./career-areas";
import type { AxisScore, DnaResult } from "./scoring";
import type { CareerOrientationAxisId } from "./types";
import { TAXONOMY_VERSION } from "./version";

export type RecommendationConfidence = "strong" | "moderate" | "exploratory";

export interface AxisContribution {
  axis: CareerOrientationAxisId;
  importance: 1 | 2 | 3;
  /** The person's position, or null when context-dependent. */
  position: number | null;
  band: { low: number; high: number };
  insideBand: boolean;
  contextDependent: boolean;
  /** 0..1 — importance-weighted, before normalisation. */
  contribution: number;
}

export interface AreaRanking {
  areaId: SecurityCareerAreaId;
  area: SecurityCareerArea;
  /** 0..1. The sole sort key. */
  fit: number;
  confidence: RecommendationConfidence;
  /** Axes actually evaluated — emerging ones are absent entirely. */
  evaluated: AxisContribution[];
  /** Axes the profile cares about that could not be evaluated. */
  unevaluatedAxes: CareerOrientationAxisId[];
  /** The three strongest reasons this area fits, strongest first. */
  topReasons: AxisContribution[];
  /** Bands the person sits furthest outside, for development framing. */
  gaps: AxisContribution[];
}

export interface RankingResult {
  taxonomyVersion: typeof TAXONOMY_VERSION;
  /** All evaluable areas, best fit first. */
  ranked: AreaRanking[];
  /** Positions 1–3. */
  top: AreaRanking[];
  /** Positions 4–6 — adjacent directions worth exploring. */
  adjacent: AreaRanking[];
  /** True when too little is known to rank honestly. */
  insufficientEvidence: boolean;
}

function stable(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Distance from a position to the nearest edge of a band. Zero inside. */
function distanceToBand(position: number, band: AxisBand): number {
  if (position < band.low) return band.low - position;
  if (position > band.high) return position - band.high;
  return 0;
}

function evaluateArea(area: SecurityCareerArea, dna: DnaResult): AreaRanking {
  const axisById = new Map<CareerOrientationAxisId, AxisScore>(dna.axes.map((a) => [a.axis, a]));

  const evaluated: AxisContribution[] = [];
  const unevaluatedAxes: CareerOrientationAxisId[] = [];

  for (const band of area.bands) {
    const axis = axisById.get(band.axis);

    // Emerging axes are skipped ENTIRELY — never included at reduced weight.
    if (!axis || !axis.usableForMatching) {
      unevaluatedAxes.push(band.axis);
      continue;
    }

    if (axis.contextDependent) {
      // Compatible with both ends: a full contribution, not a midpoint.
      evaluated.push({
        axis: band.axis,
        importance: band.importance,
        position: null,
        band: { low: band.low, high: band.high },
        insideBand: true,
        contextDependent: true,
        contribution: band.importance * 1.0,
      });
      continue;
    }

    const position = axis.position as number;
    const distance = distanceToBand(position, band);
    const inside = distance === 0;

    evaluated.push({
      axis: band.axis,
      importance: band.importance,
      position,
      band: { low: band.low, high: band.high },
      insideBand: inside,
      contextDependent: false,
      // Outside the band, the contribution falls off with distance, and
      // never below zero.
      contribution: band.importance * Math.max(0, 1 - distance),
    });
  }

  const totalImportance = evaluated.reduce((sum, c) => sum + c.importance, 0);
  const fit =
    totalImportance === 0
      ? 0
      : stable(evaluated.reduce((sum, c) => sum + c.contribution, 0) / totalImportance);

  // Recommendation confidence: how many of the profile's IMPORTANT axes were
  // evaluated, and whether the area profile itself is reviewed. Reported
  // separately; never folded into `fit`.
  const importantBands = area.bands.filter((band) => band.importance >= 2);
  const importantEvaluated = evaluated.filter((c) => c.importance >= 2).length;
  const importantRatio =
    importantBands.length === 0 ? 1 : importantEvaluated / importantBands.length;

  let confidence: RecommendationConfidence;
  if (importantRatio >= 0.99 && dna.axisCoverage >= 0.75) confidence = "strong";
  else if (importantRatio >= 0.6) confidence = "moderate";
  else confidence = "exploratory";

  // Strongest reasons: highest actual contribution, then highest importance,
  // then axis id — fully deterministic, no ties left to sort stability.
  const byStrength = (a: AxisContribution, b: AxisContribution) =>
    b.contribution - a.contribution || b.importance - a.importance || a.axis.localeCompare(b.axis);

  const topReasons = evaluated
    .filter((c) => c.insideBand)
    .slice()
    .sort(byStrength)
    .slice(0, 3);

  const gaps = evaluated
    .filter((c) => !c.insideBand)
    .slice()
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        a.contribution - b.contribution ||
        a.axis.localeCompare(b.axis),
    )
    .slice(0, 3);

  return { areaId: area.id, area, fit, confidence, evaluated, unevaluatedAxes, topReasons, gaps };
}

/**
 * Rank all 14 Security Career Areas against a Security Career DNA.
 *
 * Pure and deterministic: the same DnaResult always produces the same
 * ordering, including ties, which are broken by area id.
 */
export function rankCareerAreas(dna: DnaResult): RankingResult {
  // Below half the axes usable, a ranking would be an ordering of noise.
  // Say so rather than producing a confident-looking list.
  const insufficientEvidence = dna.axisCoverage < 0.5;

  const ranked = SECURITY_CAREER_AREAS.map((area) => evaluateArea(area, dna))
    .filter((r) => r.evaluated.length > 0)
    .sort((a, b) => b.fit - a.fit || a.areaId.localeCompare(b.areaId));

  return {
    taxonomyVersion: TAXONOMY_VERSION,
    ranked,
    top: insufficientEvidence ? [] : ranked.slice(0, 3),
    adjacent: insufficientEvidence ? [] : ranked.slice(3, 6),
    insufficientEvidence,
  };
}

/** Position within an area, per mapping doc §5. CDA-07 and CDA-08 are kept
 *  separate on purpose: a specialist can want organisation-wide scope
 *  without wanting to manage anyone, and collapsing them into one
 *  "seniority" score sends people into the wrong senior track. */
export type AreaCategory = "entry" | "specialist" | "coordination" | "leadership";

export function categoryFor(dna: DnaResult): AreaCategory {
  const at = (id: CareerOrientationAxisId): number | null => {
    const a = dna.axes.find((x) => x.axis === id);
    return a && a.usableForMatching && !a.contextDependent ? a.position : null;
  };

  const responsibility = at("CDA-07");
  const scope = at("CDA-08");
  const tech = at("CDA-05");
  const investigation = at("CDA-06");

  if (responsibility !== null && scope !== null && responsibility >= 0.67 && scope >= 0.67) {
    return "leadership";
  }
  if (responsibility !== null && responsibility >= 0.5 && scope !== null && scope >= 0.33) {
    return "coordination";
  }
  if (
    ((tech !== null && tech >= 0.67) || (investigation !== null && investigation >= 0.67)) &&
    (responsibility === null || responsibility <= 0.5)
  ) {
    return "specialist";
  }
  return "entry";
}

export { AREAS_BY_ID };

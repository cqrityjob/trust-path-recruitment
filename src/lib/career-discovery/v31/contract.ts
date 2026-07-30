// The Career Intelligence output contract.
//
// This is the stable, versioned shape every downstream consumer reads —
// today the report renderer and My Career, later Career Coach AI, Interview
// Coach AI, Learning Advisor AI, CV Optimizer AI, Employer Match AI and
// Career Intelligence AI.
//
// None of those exist and none is implemented here. What this file does is
// make sure they will not require a schema redesign, by fixing three things
// now while they are free:
//
//   1. The layers are named and separated. A consumer asks for Career DNA,
//      or Patterns, or Superpower, without knowing how any of them are
//      computed.
//   2. Every value carries its own confidence and its own evidence sources.
//      A future coach must be able to tell "we don't know" from "low", which
//      is precisely what the v2.1 engine could not do.
//   3. Every output carries the version tuple that produced it. A consumer
//      reading a two-year-old snapshot knows exactly which definitions it
//      was made under, and never silently reinterprets it under current ones.
//
// The flow is one-directional and has no shortcuts:
//
//   database → domain model → scoring engine → this contract → API → UI
//
// Business logic never lives above this line. A UI component receives a
// CareerIntelligence object and renders it; it does not compute, threshold,
// re-rank or re-word anything. Neither will an AI service.

import type { DimensionId } from "./dimensions";
import type { PatternId, PatternScore, ResolvedPatternId } from "./patterns";
import type { Confidence, DimensionScore } from "./scoring";
import type { VersionTuple } from "./version";

/** Layer 1 — Security Career DNA. How you naturally think and work. */
export interface CareerDnaLayer {
  readonly dimensions: Readonly<Record<DimensionId, DimensionScore>>;
  readonly complete: boolean;
  /** Dimensions with no evidence at all. Explicit rather than inferred from
   *  null scores, so a consumer cannot miss them. */
  readonly unobserved: readonly DimensionId[];
}

/** Layer 2 — Career Patterns. Who you are at work. */
export interface CareerPatternLayer {
  readonly leading: PatternId | null;
  readonly supporting: readonly PatternId[];
  readonly balanced: boolean;
  readonly leaningToward: readonly PatternId[];
  readonly scores: readonly PatternScore[];
  readonly suppressions: readonly string[];
}

/** The two named strengths, derived from the leading pattern.
 *
 *  Both resolve to a dimension id, not to prose, so a future consumer can
 *  reason about them — a Learning Advisor can look up content for a growth
 *  edge without parsing a sentence. */
export interface StrengthLayer {
  /** The most distinctive central dimension of the leading pattern. */
  readonly superpowerDimension: DimensionId | null;
  /** What the leading pattern's own progression path needs and it does not
   *  yet hold centrally. A Career Roadmap's first development objective. */
  readonly growthEdgeDimension: DimensionId | null;
  readonly confidence: Confidence;
}

/** Layer 5 — Career Roadmap. NOT IMPLEMENTED.
 *
 *  Declared so the contract has a stable place for it and consumers can
 *  check for absence rather than crash on it. A roadmap needs the profession
 *  calibration that does not exist yet. */
export interface RoadmapLayer {
  readonly available: false;
  /** The pattern a roadmap would start from, already computed. */
  readonly startingPattern: PatternId | null;
  readonly progressionTarget: PatternId | null;
}

/** The complete output. Everything a consumer needs, and nothing it must
 *  compute for itself. */
export interface CareerIntelligence {
  readonly versions: VersionTuple;
  /** When this was computed. Exactly once, at completion. */
  readonly generatedAt: string;
  readonly dna: CareerDnaLayer;
  readonly patterns: CareerPatternLayer;
  readonly strengths: StrengthLayer;
  readonly roadmap: RoadmapLayer;
  /** Which pattern the report actually presents: a pattern id, or CP00. */
  readonly presentedPattern: ResolvedPatternId;
}

/** Everything a consumer may NOT do with this object, stated in code rather
 *  than in documentation nobody reads.
 *
 *  These are the product's standing constraints. They are asserted by the
 *  guard script against rendered output, and they apply equally to a React
 *  component and to a future language model prompt. */
export const CONSUMER_CONSTRAINTS = {
  /** Pattern and dimension scores are internal. Showing a number turns a
   *  story into a grade and invites "why only 71?". */
  neverRenderScores: true,
  /** CID15 informs wording only. It has profession-matching weight 0 and
   *  may never differentiate a recommendation (owner decision A-4). */
  cid15NarrativeOnly: true,
  /** No output may claim competence, eligibility, qualification, suitability
   *  or readiness. The instrument measures preference. */
  neverClaimEligibility: true,
  /** A null score means unobserved. It may not be imputed, defaulted or
   *  rendered as a midpoint. */
  neverImputeMissing: true,
  /** Patterns explain a ranking. They are never an input to one. */
  patternsNeverRankProfessions: true,
} as const;

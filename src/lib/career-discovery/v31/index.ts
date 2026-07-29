// Security Career Discovery v3.1 — domain model.
//
// Pure, deterministic, versioned. No I/O, no React, no database client, no
// clock and no randomness anywhere in this namespace, which is what makes
// every output reproducible and every rule testable without a fixture
// server.
//
// v3.0 remains untouched and running. The cutover happens in a later PR;
// until then nothing outside this directory imports from it.

export * from "./version";
export * from "./dimensions";
export * from "./core-items";
export * from "./option-matrix";
export * from "./scoring";
export * from "./patterns";
export * from "./contract";

import { DIMENSION_IDS } from "./dimensions";
import { PATTERNS } from "./patterns";
import { resolvePatterns } from "./patterns";
import { scoreDimensions, type Answer } from "./scoring";
import type { CareerIntelligence } from "./contract";
import { VERSION_TUPLE } from "./version";

/**
 * The one entry point: answers in, Career Intelligence out.
 *
 * Called exactly once per session, at completion, inside the same
 * transaction that writes the snapshot. Historical reports are then read
 * forever without ever calling this again — which is why no caching layer
 * is needed and none should be built.
 *
 * `generatedAt` is a parameter rather than read from the clock so this stays
 * a pure function: the same inputs must always produce the same output, and
 * a hidden clock read would make the frozen fixtures untestable.
 */
export function computeCareerIntelligence(
  answers: readonly Answer[],
  generatedAt: string,
): CareerIntelligence {
  const dims = scoreDimensions(answers);
  const patterns = resolvePatterns(dims);

  const leadingDef = patterns.leading ? PATTERNS[patterns.leading] : null;
  const superpower = leadingDef?.superpowerDimension ?? null;
  const growthEdge = leadingDef?.growthEdgeDimension ?? null;

  return {
    versions: VERSION_TUPLE,
    generatedAt,
    dna: {
      dimensions: dims.dimensions,
      complete: dims.complete,
      unobserved: DIMENSION_IDS.filter((d) => dims.dimensions[d].score === null),
    },
    patterns: {
      leading: patterns.leading,
      supporting: patterns.supporting,
      balanced: patterns.balanced,
      leaningToward: patterns.leaningToward,
      scores: patterns.scores,
      suppressions: patterns.suppressions,
    },
    strengths: {
      superpowerDimension: superpower,
      growthEdgeDimension: growthEdge,
      confidence: superpower ? dims.dimensions[superpower].confidence : "none",
    },
    roadmap: {
      available: false,
      startingPattern: patterns.leading,
      progressionTarget: leadingDef?.progressionTarget ?? null,
    },
    presentedPattern: patterns.leading ?? "CP00",
  };
}

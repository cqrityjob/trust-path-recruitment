// v3.1 report presentation vocabulary and pure view mappers.
//
// ── THE GAP THIS FILE CLOSES, STATED PLAINLY ───────────────────────────
//
// The stored snapshot carries each dimension's NAME, a numeric score and a
// confidence token ("low" | "medium" | "high"). It does NOT carry
// candidate-facing wording for prominence or confidence.
//
// The report must show prominence without numbers, decimals, percentages or
// internal thresholds. So that wording has to come from somewhere, and there
// were only three places it could:
//
//   1. the i18n dictionaries — REJECTED. Dictionaries are unversioned, so a
//      translation edit would silently change how a historical report reads,
//      which is the property this whole architecture exists to protect.
//   2. the snapshot — correct, but that is a PR3 contract change, and the
//      standing instruction is not to change snapshot contracts without a
//      proven critical defect. Recommended for v3.2.
//   3. here: a VERSIONED presentation module, outside the dictionaries.
//
// Option 3 is what this is. DNA_PRESENTATION_VERSION moves whenever any string
// below changes, exactly like STORY_TEMPLATE_VERSION, so such a change is
// deliberate and reviewable rather than incidental to a translation pass.
//
// Residual risk, named rather than hidden: a deliberate version-bumped change
// to this vocabulary WOULD alter how an already-issued report's DNA section
// reads. The frozen values never change; the sentence describing them could.
// Everything genuinely frozen — the story, the pattern, the areas — comes
// straight from the snapshot and is immune. Closing the residual means moving
// these phrases into the snapshot in v3.2.
//
// ── PURE ───────────────────────────────────────────────────────────────
//
// No I/O, no React, no clock. Type-only imports from the domain, which are
// erased at compile time and cannot recompute anything. The structural guard
// enforces that no VALUE is imported from the calculation modules.

import type { Locale } from "./v31/version";

/** Bumped whenever any candidate-facing string in this file changes. */
export const DNA_PRESENTATION_VERSION = "v3.1-draft-1" as const;

/** How prominent a dimension was in the candidate's answers.
 *
 *  Deliberately not a grade. There is no "high" or "low" band, because a
 *  dimension being less central is not a deficiency — it describes where this
 *  person's answers pointed. */
export type ProminenceBand = "most" | "notable" | "present" | "less_central" | "context";

/**
 * Map a frozen score to a prominence band.
 *
 * These are presentation boundaries, not the scoring model's thresholds. They
 * are never shown to a candidate and never affect a stored value.
 */
export function prominenceFor(score: number | null): ProminenceBand {
  if (score === null) return "context";
  if (score >= 0.78) return "most";
  if (score >= 0.62) return "notable";
  if (score >= 0.45) return "present";
  return "less_central";
}

/** Prominence wording. Describes the ANSWERS, never the person. */
export const PROMINENCE_LABEL: Readonly<Record<ProminenceBand, Record<Locale, string>>> = {
  most: { sv: "Mest framträdande i dina svar", en: "Most prominent in your answers" },
  notable: { sv: "Tydligt framträdande", en: "Clearly present" },
  present: { sv: "Finns med i ditt mönster", en: "Part of your pattern" },
  less_central: { sv: "Mindre central i det här resultatet", en: "Less central in this result" },
  context: { sv: "Kan bero mer på situationen", en: "May depend more on the situation" },
};

/** Confidence, translated into human language.
 *
 *  The internal evidence-weight thresholds are never exposed — not the values,
 *  and not the fact that thresholds exist. */
export const CONFIDENCE_LABEL: Readonly<Record<string, Record<Locale, string>>> = {
  high: { sv: "Väl underbyggt av dina svar", en: "Well supported by your answers" },
  medium: { sv: "Rimligt underbyggt", en: "Reasonably supported" },
  low: { sv: "Bygger på begränsat underlag", en: "Based on limited evidence" },
  none: { sv: "Inget underlag i det här resultatet", en: "No evidence in this result" },
};

/** One dimension, ready to render. Nothing numeric survives as text. */
export interface DnaRow {
  readonly name: string;
  readonly prominence: ProminenceBand;
  readonly prominenceLabel: string;
  readonly confidenceLabel: string;
  /** 0–100, for the visual indicator's width ONLY. Never rendered as text. */
  readonly indicator: number;
  /** The text equivalent of the bar, so no information depends on the visual
   *  or on colour. */
  readonly accessibleLabel: string;
}

interface StoredDimensionLike {
  readonly name: string;
  readonly score: number | null;
  readonly confidence: string;
}

/**
 * Turn stored dimensions into renderable rows, strongest first.
 *
 * Dimensions with `usedForMatching: false` are NOT dropped — CID15 is part of
 * the candidate's DNA and stays visible (owner decision A-4). It simply
 * carries no matching weight, which is not something a candidate needs told.
 */
export function toDnaRows(dimensions: readonly StoredDimensionLike[], locale: Locale): DnaRow[] {
  return [...dimensions]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, locale))
    .map((d) => {
      const band = prominenceFor(d.score);
      const prominenceLabel = PROMINENCE_LABEL[band][locale];
      const confidenceLabel = (CONFIDENCE_LABEL[d.confidence] ?? CONFIDENCE_LABEL.none)[locale];
      return {
        name: d.name,
        prominence: band,
        prominenceLabel,
        confidenceLabel,
        indicator: d.score === null ? 0 : Math.round(d.score * 100),
        accessibleLabel: `${d.name}: ${prominenceLabel}. ${confidenceLabel}.`,
      };
    });
}

/** The seven story sections, in approved presentation order. */
export const STORY_SECTION_ORDER = [
  "howYouWork",
  "givesEnergy",
  "takesEnergy",
  "superpower",
  "growthEdge",
  "whyTheseCareers",
  "whereItLeads",
] as const;

export type StorySectionKey = (typeof STORY_SECTION_ORDER)[number];

/**
 * A v3.1 snapshot is renderable only if it carries every required piece.
 *
 * Returns the missing paths. A non-empty result means the snapshot is
 * MALFORMED and must reach the error state — never a page with empty headings,
 * and never invented text.
 */
export function missingRequiredReportFields(payload: unknown): string[] {
  const missing: string[] = [];
  const p = payload as Record<string, unknown> | null;

  if (!p || typeof p !== "object") return ["report"];

  const outputA = p.outputA as Record<string, unknown> | undefined;
  const outputB = p.outputB as Record<string, unknown> | undefined;

  if (!outputA) missing.push("outputA");
  if (!outputB) missing.push("outputB");
  if (!p.versions) missing.push("versions");
  if (!p.completedAt) missing.push("completedAt");

  if (outputA) {
    if (!Array.isArray(outputA.dimensions) || outputA.dimensions.length === 0) {
      missing.push("outputA.dimensions");
    }
    if (!Array.isArray(outputA.areas)) missing.push("outputA.areas");
  }

  if (outputB) {
    const leading = outputB.leading as Record<string, unknown> | undefined;
    if (!leading) {
      missing.push("outputB.leading");
    } else {
      if (typeof leading.name !== "string" || leading.name.length === 0) {
        missing.push("outputB.leading.name");
      }
      const answers = leading.answers as Record<string, unknown> | undefined;
      if (!answers) {
        missing.push("outputB.leading.answers");
      } else {
        for (const key of STORY_SECTION_ORDER) {
          const value = answers[key];
          if (typeof value !== "string" || value.trim().length === 0) {
            missing.push(`outputB.leading.answers.${key}`);
          }
        }
      }
    }
    if (typeof outputB.presentedPattern !== "string") missing.push("outputB.presentedPattern");
  }

  return missing;
}

/** True when this snapshot presents the Balanced Profile.
 *
 *  CP00 is a result, not a failure to produce one. It reaches the same
 *  component with the same prominence; this flag exists only so the intro can
 *  be honest that no single pattern currently dominates. */
export function isBalancedProfile(payload: unknown): boolean {
  const p = payload as { outputB?: { presentedPattern?: unknown } } | null;
  return p?.outputB?.presentedPattern === "CP00";
}

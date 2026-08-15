// The report snapshot — everything needed to render a report forever.
//
// ── THE ONE RULE ───────────────────────────────────────────────────────
//
// A stored snapshot must be renderable with NO access to this codebase's
// current content, scoring, patterns, story templates or i18n dictionaries.
// Every string a candidate will ever see is written into it at completion, in
// the locale they took it in, and never regenerated.
//
// That is why the snapshot carries rendered text rather than ids to look up.
// An id is a promise that the lookup table will still exist and still say the
// same thing; text is a fact.
//
// ── PURE ───────────────────────────────────────────────────────────────
//
// `buildSnapshot` is a pure function. `completedAt` is a parameter, supplied
// by the orchestration layer, because a domain engine that reads the clock
// cannot be tested for determinism and cannot be replayed.

import type { ContextStatus } from "../types";
import { CAREER_AREAS, rankCareerAreas, type AreaResult, type CareerAreaId } from "./career-areas";
import { DIMENSIONS, type DimensionId } from "./dimensions";
import { PATTERNS, resolvePatterns, type PatternId, type ResolvedPatternId } from "./patterns";
import {
  matchProfessions,
  type ProfessionCatalogEntry,
  type ProfessionMatch,
} from "./professions";
import { scoreDimensions, type Answer, type Confidence, type DimensionResult } from "./scoring";
import {
  buildPatternStory,
  STORY_HEADINGS,
  STORY_TEMPLATE_VERSION,
  type PatternStory,
} from "./story";
import {
  CONTENT_VERSION,
  DEFINITION_VERSION,
  OPTION_MATRIX_VERSION,
  PATTERN_DEFINITION_VERSION,
  SCORING_VERSION,
  TAXONOMY_VERSION,
  type Locale,
} from "./version";

/** The shape of the snapshot payload itself. Bumped when the STRUCTURE
 *  changes, independently of the content and scoring versions — a reader must
 *  be able to tell "this report was scored differently" from "this report is
 *  shaped differently". */
export const REPORT_SCHEMA_VERSION = "cd-report-v3.1.0" as const;

export interface SnapshotVersions {
  readonly definitionVersion: string;
  readonly contentVersion: string;
  readonly scoringVersion: string;
  readonly optionMatrixVersion: string;
  readonly patternDefinitionVersion: string;
  readonly storyTemplateVersion: string;
  readonly taxonomyVersion: string;
  readonly reportSchemaVersion: string;
  /** null until Layer 4 calibration exists and a profession is approved. */
  readonly professionCalibrationVersion: string | null;
}

/** One dimension, as stored. Carries its own name so the report never needs
 *  the current dimension module to render. */
export interface StoredDimension {
  readonly id: DimensionId;
  readonly name: string;
  readonly score: number | null;
  readonly confidence: Confidence;
  readonly evidenceWeight: number;
  readonly coverage: number;
  readonly dominance: number | null;
  /** Which items produced this. The provenance chain, stored. */
  readonly sources: readonly string[];
  readonly tertiaryOnly: boolean;
  /** Whether this dimension contributed to matching under the scoring version
   *  in force at completion. CID15 is false (owner decision A-4). */
  readonly usedForMatching: boolean;
}

export interface StoredArea {
  readonly id: CareerAreaId;
  readonly name: string;
  readonly description: string;
  readonly rank: number;
  readonly score: number;
  /** Dimension NAMES, already resolved: the report shows why without needing
   *  the dimension module. */
  readonly alignedWith: readonly string[];
}

/** Output A — structured system data. Never rendered directly. */
export interface OutputA {
  readonly dimensions: readonly StoredDimension[];
  readonly patternScores: readonly {
    readonly patternId: PatternId;
    readonly score: number;
    readonly rank: number;
    readonly centralTertiaryOnly: boolean;
  }[];
  readonly leadingPattern: PatternId | null;
  readonly supportingPatterns: readonly PatternId[];
  readonly balanced: boolean;
  readonly leaningToward: readonly PatternId[];
  readonly suppressions: readonly string[];
  /** Resolved to dimension ids so a future consumer can reason about them
   *  rather than parse prose (owner decision B-18). */
  readonly superpowerDimension: DimensionId | null;
  readonly growthEdgeDimension: DimensionId | null;
  readonly progressionTargetPattern: PatternId | null;
  readonly areas: readonly StoredArea[];
  readonly areasGrouped: boolean;
  readonly areaEvidenceSufficient: boolean;
  readonly answeredItems: readonly string[];
  readonly complete: boolean;
}

/** Output B — frozen candidate-facing content, in the locale of completion. */
export interface OutputB {
  readonly locale: Locale;
  readonly presentedPattern: ResolvedPatternId;
  readonly headings: Readonly<Record<string, string>>;
  readonly leading: PatternStory;
  /** Supporting patterns show questions 1, 2, 4, 5 and 7 — never
   *  frustrations, which are shown for the leading pattern only. */
  readonly supporting: readonly PatternStory[];
  readonly areas: readonly { readonly name: string; readonly description: string }[];
  /** The single sentence a share link may expose. */
  readonly shareSummary: string;
}

/** Layer 4. A consumer checks `available` rather than finding an absent key
 *  and guessing — `available: false` while no profession is approved for
 *  ranking (the case for every real candidate today), `available: true` once
 *  the orchestration layer supplies an approved catalogue and at least one
 *  profession clears matching. See ./professions.ts for how `matches` and
 *  the three presentation buckets are computed. */
export interface ProfessionOutputUnavailable {
  readonly available: false;
  readonly reason: "no_approved_professions";
  readonly matches: readonly never[];
}

export interface ProfessionOutputAvailable {
  readonly available: true;
  readonly matches: readonly ProfessionMatch[];
  readonly strongestDirections: readonly ProfessionMatch[];
  readonly alsoWorthExploring: readonly ProfessionMatch[];
  readonly longerTermPossibilities: readonly ProfessionMatch[];
  /** stage === "career_pivot" (§12-13) — real affinity, different direction
   *  from where the candidate is heading. Optional so a snapshot frozen
   *  before this bucket existed still satisfies this type unchanged — the
   *  frozen-snapshot reproducibility rule (§36) means an old snapshot must
   *  never be forced to retroactively invent data it never computed. */
  readonly careerPivots?: readonly ProfessionMatch[];
}

export type ProfessionOutput = ProfessionOutputUnavailable | ProfessionOutputAvailable;

export interface ReportSnapshot {
  readonly versions: SnapshotVersions;
  readonly locale: Locale;
  /** Supplied by the orchestration layer, never by the domain engine. */
  readonly completedAt: string;
  readonly outputA: OutputA;
  readonly outputB: OutputB;
  readonly professions: ProfessionOutput;
}

export interface BuildSnapshotInput {
  readonly answers: readonly Answer[];
  readonly locale: Locale;
  readonly completedAt: string;
  /** Professions approved for ranking at completion time — the orchestration
   *  layer's responsibility to filter to `approved_for_ranking = true` rows
   *  before calling here (see ./professions.ts's header). Empty for every
   *  real candidate today, since nothing is yet approved. */
  readonly professionCatalog?: readonly ProfessionCatalogEntry[];
  /** C1, already collected and already unscored (see ../context-items.ts).
   *  Read only to place professions into "explore now" / "possible next
   *  step" / "longer-term" — never fed into dimension scoring. */
  readonly contextStatus?: ContextStatus | null;
  /** Stamped onto the snapshot when professionCatalog is non-empty. A real
   *  calibration_version string from the DB, not invented here. */
  readonly professionCalibrationVersion?: string;
}

function storedDimensions(dims: DimensionResult, locale: Locale): StoredDimension[] {
  return (Object.keys(dims.dimensions) as DimensionId[]).sort().map((id) => {
    const d = dims.dimensions[id];
    return {
      id,
      name: DIMENSIONS[id].name[locale],
      score: d.score,
      confidence: d.confidence,
      evidenceWeight: d.evidenceWeight,
      coverage: d.coverage,
      dominance: d.dominance,
      sources: d.sources,
      tertiaryOnly: d.tertiaryOnly,
      usedForMatching: DIMENSIONS[id].matchingWeight === 1,
    };
  });
}

function storedAreas(areas: AreaResult, locale: Locale): StoredArea[] {
  return areas.ranked.map((a) => ({
    id: a.areaId,
    name: CAREER_AREAS[a.areaId].name[locale],
    description: CAREER_AREAS[a.areaId].description[locale],
    rank: a.rank,
    score: a.score,
    alignedWith: a.alignedDimensions.map((d) => DIMENSIONS[d].name[locale]),
  }));
}

/**
 * Build a complete, self-contained report snapshot.
 *
 * Pure: same answers, locale and timestamp produce a byte-identical result.
 */
export function buildSnapshot(input: BuildSnapshotInput): ReportSnapshot {
  const {
    answers,
    locale,
    completedAt,
    professionCatalog = [],
    contextStatus = null,
    professionCalibrationVersion,
  } = input;

  const dims = scoreDimensions(answers);
  const patterns = resolvePatterns(dims);
  const areas = rankCareerAreas(dims);
  const professionResult = matchProfessions(dims, professionCatalog, contextStatus);

  const presented: ResolvedPatternId = patterns.leading ?? "CP00";
  const leadingDef = patterns.leading ? PATTERNS[patterns.leading] : null;

  const leadingStory = buildPatternStory(presented, locale);

  return {
    versions: {
      definitionVersion: DEFINITION_VERSION,
      contentVersion: CONTENT_VERSION,
      scoringVersion: SCORING_VERSION,
      optionMatrixVersion: OPTION_MATRIX_VERSION,
      patternDefinitionVersion: PATTERN_DEFINITION_VERSION,
      storyTemplateVersion: STORY_TEMPLATE_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      // Stays null while no profession is approved for ranking. A version
      // string here would imply a calibration was applied when none was.
      professionCalibrationVersion:
        professionCatalog.length > 0 ? (professionCalibrationVersion ?? "cal-v1") : null,
    },
    locale,
    completedAt,

    outputA: {
      dimensions: storedDimensions(dims, locale),
      patternScores: patterns.scores.map((s) => ({
        patternId: s.patternId,
        score: s.score,
        rank: s.rank,
        centralTertiaryOnly: s.centralTertiaryOnly,
      })),
      leadingPattern: patterns.leading,
      supportingPatterns: patterns.supporting,
      balanced: patterns.balanced,
      leaningToward: patterns.leaningToward,
      suppressions: patterns.suppressions,
      superpowerDimension: leadingDef?.superpowerDimension ?? null,
      growthEdgeDimension: leadingDef?.growthEdgeDimension ?? null,
      progressionTargetPattern: leadingDef?.progressionTarget ?? null,
      areas: storedAreas(areas, locale),
      areasGrouped: areas.grouped,
      areaEvidenceSufficient: areas.sufficientEvidence,
      answeredItems: dims.answeredItems,
      complete: dims.complete,
    },

    outputB: {
      locale,
      presentedPattern: presented,
      headings: STORY_HEADINGS[locale],
      leading: leadingStory,
      supporting: patterns.supporting.map((p) => buildPatternStory(p, locale)),
      areas: storedAreas(areas, locale)
        .slice(0, 3)
        .map((a) => ({ name: a.name, description: a.description })),
      shareSummary: leadingStory.shareSummary,
    },

    professions: professionResult.available
      ? {
          available: true,
          matches: professionResult.matches,
          strongestDirections: professionResult.strongestDirections,
          alsoWorthExploring: professionResult.alsoWorthExploring,
          longerTermPossibilities: professionResult.longerTermPossibilities,
          careerPivots: professionResult.careerPivots,
        }
      : { available: false, reason: "no_approved_professions", matches: [] },
  };
}

// =========================================================================
// Validation
// =========================================================================
//
// Owner instruction: do not silently recover from invalid domain data. Fail
// safely and leave the session resumable. Every check below is a refusal to
// store something wrong, not an attempt to repair it.

export interface ValidationFailure {
  readonly code: string;
  readonly detail: string;
}

/**
 * Validate a snapshot before it is stored. Returns every failure rather than
 * the first, so a broken build is diagnosed in one pass.
 */
export function validateSnapshot(snapshot: ReportSnapshot): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  // Every version identifier must be present and non-empty.
  for (const [k, v] of Object.entries(snapshot.versions)) {
    if (k === "professionCalibrationVersion") continue;
    if (typeof v !== "string" || v.length === 0) {
      failures.push({ code: "CD_MISSING_VERSION", detail: `${k} is absent` });
    }
  }

  if (!snapshot.completedAt || Number.isNaN(Date.parse(snapshot.completedAt))) {
    failures.push({ code: "CD_INVALID_TIMESTAMP", detail: "completedAt is not a valid ISO time" });
  }

  // The report must be built from a complete run.
  if (!snapshot.outputA.complete) {
    failures.push({
      code: "CD_INCOMPLETE_EVIDENCE",
      detail: `only ${snapshot.outputA.answeredItems.length} items answered`,
    });
  }

  if (snapshot.outputA.dimensions.length !== 16) {
    failures.push({
      code: "CD_DIMENSION_COUNT",
      detail: `expected 16 dimensions, got ${snapshot.outputA.dimensions.length}`,
    });
  }

  // Owner decision A-4: CID15 may never be used for matching.
  const cid15 = snapshot.outputA.dimensions.find((d) => d.id === "CID15");
  if (cid15 && cid15.usedForMatching) {
    failures.push({
      code: "CD_CID15_USED_FOR_MATCHING",
      detail: "CID15 is marked as used for matching, which owner decision A-4 forbids",
    });
  }

  // Pattern honesty: a leading pattern must not rest on tertiary-only central
  // evidence, and CP00 must be presented whenever there is no leading pattern.
  const leading = snapshot.outputA.leadingPattern;
  if (leading) {
    const score = snapshot.outputA.patternScores.find((p) => p.patternId === leading);
    if (score?.centralTertiaryOnly) {
      failures.push({
        code: "CD_TERTIARY_ONLY_PATTERN",
        detail: `${leading} leads on tertiary-only central evidence (owner decision A-2)`,
      });
    }
    if (snapshot.outputB.presentedPattern !== leading) {
      failures.push({
        code: "CD_PATTERN_MISMATCH",
        detail: "Output B presents a different pattern from Output A",
      });
    }
  } else if (snapshot.outputB.presentedPattern !== "CP00") {
    failures.push({
      code: "CD_CP00_EXPECTED",
      detail: "no leading pattern was justified, so CP00 must be presented",
    });
  }

  if (snapshot.outputA.supportingPatterns.length > 2) {
    failures.push({
      code: "CD_TOO_MANY_SUPPORTING",
      detail: `${snapshot.outputA.supportingPatterns.length} supporting patterns, maximum is 2`,
    });
  }
  if (leading && snapshot.outputA.supportingPatterns.includes(leading)) {
    failures.push({
      code: "CD_SUPPORTING_DUPLICATES_LEADING",
      detail: "the leading pattern also appears as a supporting pattern",
    });
  }

  // Output B must be complete: every question answered, in one locale.
  const answers = snapshot.outputB.leading.answers;
  for (const [q, text] of Object.entries(answers)) {
    if (typeof text !== "string" || text.trim().length === 0) {
      failures.push({ code: "CD_STORY_INCOMPLETE", detail: `story answer ${q} is empty` });
    }
  }

  // No numerals in candidate-facing story text (owner decision B-5).
  for (const [q, text] of Object.entries(answers)) {
    if (/\d/.test(text)) {
      failures.push({
        code: "CD_STORY_CONTAINS_NUMERAL",
        detail: `story answer ${q} contains a digit`,
      });
    }
  }

  // No dimension names shown to the candidate in story text.
  for (const [q, text] of Object.entries(answers)) {
    if (/\bCID\d{2}\b/.test(text)) {
      failures.push({
        code: "CD_STORY_LEAKS_DIMENSION_ID",
        detail: `story answer ${q} names a dimension`,
      });
    }
  }

  // Layer 4 must never show matches without a stamped calibration version —
  // that would mean a candidate is being told "these professions fit you"
  // from data the orchestration layer never actually vetted as approved for
  // ranking. This is the only thing distinguishing a legitimate match (real
  // approved catalogue in, calibration version stamped) from the bug this
  // check exists to catch.
  if (
    snapshot.professions.matches.length > 0 &&
    snapshot.versions.professionCalibrationVersion === null
  ) {
    failures.push({
      code: "CD_UNAPPROVED_PROFESSION_RANKING",
      detail: "profession matches present with no calibration version recorded",
    });
  }
  if (
    snapshot.professions.available !== false &&
    snapshot.versions.professionCalibrationVersion === null
  ) {
    failures.push({
      code: "CD_PROFESSION_WITHOUT_CALIBRATION",
      detail: "professions marked available with no calibration version",
    });
  }

  return failures;
}

/** Build and validate in one step. Throws rather than storing bad data. */
export function buildValidatedSnapshot(input: BuildSnapshotInput): ReportSnapshot {
  const snapshot = buildSnapshot(input);
  const failures = validateSnapshot(snapshot);
  if (failures.length > 0) {
    throw new SnapshotValidationError(failures);
  }
  return snapshot;
}

export class SnapshotValidationError extends Error {
  constructor(readonly failures: readonly ValidationFailure[]) {
    super(
      `snapshot validation failed: ${failures.map((f) => `${f.code} (${f.detail})`).join("; ")}`,
    );
    this.name = "SnapshotValidationError";
  }
}

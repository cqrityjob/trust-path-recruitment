// AI Experience Layer — minimal REAL implementation (Master Completion
// Mandate items 13-15). Builds on
// docs/career-discovery/v31-ai-experience-layer-architecture.md's contract.
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────
//
// This is the structural service boundary the architecture doc calls for:
// a typed context assembled from data the candidate can already see, a
// pluggable AI call the boundary invokes IF one is configured, and a
// deterministic template fallback that is ALWAYS correct on its own —
// "the core product must still work correctly if AI is unavailable" is not
// a fallback path bolted onto an AI-first design, it is the only path that
// exists today. No provider is wired in: this codebase has no existing
// AI/LLM integration to reuse, and adding one (a new npm dependency, an API
// key, a billing relationship) is a cost and vendor decision for the owner
// to make explicitly, not something to add unilaterally while proving an
// architecture. `AiCallFn` is the exact seam a real provider plugs into
// later — see generateEnrichedExplanation's own doc comment.
//
// ── THE BOUNDARY IS ONE-WAY ───────────────────────────────────────────────
//
// AiExplanationContext is built ONLY from data already computed by the
// deterministic engine (ProfessionMatch, explainMatch's output, live CIG
// facts, contextual self-report) — never raw Career DNA answers, never
// account identifiers. Nothing in this module can feed back into
// ProfessionMatch, fitScore, priorityScore or stage: it is read-only,
// downstream, additive.

import type { DimensionId } from "./dimensions";
import { DIMENSIONS } from "./dimensions";
import type { ProfessionExplanation } from "./profession-explanations";
import type { ProfessionMatch } from "./professions";
import type { ExperienceBand } from "../career-context";
import type { Locale } from "./version";

// -------------------------------------------------------------------------
// The read-model — matches the architecture doc's AiExplanationContext.
// -------------------------------------------------------------------------

export interface AiExplanationDimensionHighlight {
  readonly id: DimensionId;
  readonly name: string;
  readonly band: "high" | "moderate";
}

export interface AiExplanationCigFact {
  readonly titleSv: string;
  readonly titleEn: string;
}

export interface AiExplanationContext {
  readonly locale: Locale;
  readonly leadingPatternName: string;
  readonly dimensionHighlights: readonly AiExplanationDimensionHighlight[];
  readonly profession: {
    readonly professionId: string;
    readonly title: string;
    readonly stage: ProfessionMatch["stage"];
    readonly stageLabel: string;
    readonly fitTier: ProfessionMatch["fitTier"];
    readonly alignedDimensionNames: readonly string[];
    readonly contextCorroborated: boolean;
  };
  readonly cigFacts: {
    readonly requirements: readonly AiExplanationCigFact[];
    readonly education: readonly AiExplanationCigFact[];
  };
  readonly experienceBand: ExperienceBand | null;
}

/** Pure assembly — every field here already exists on data the candidate
 *  can see (the match itself, its deterministic explanation, live CIG
 *  detail rows already fetched for the report). No new database read, no
 *  raw Career DNA answers, no account identifiers. */
export function buildAiExplanationContext(input: {
  readonly match: ProfessionMatch;
  readonly explanation: ProfessionExplanation;
  readonly locale: Locale;
  readonly leadingPatternName: string;
  readonly dimensionScores: Readonly<Record<DimensionId, number | null>>;
  readonly requirements?: readonly AiExplanationCigFact[];
  readonly education?: readonly AiExplanationCigFact[];
  readonly experienceBand?: ExperienceBand | null;
}): AiExplanationContext {
  const highlights: AiExplanationDimensionHighlight[] = input.match.alignedDimensions
    .map((id) => {
      const score = input.dimensionScores[id];
      if (score === null || score === undefined) return null;
      return {
        id,
        name: DIMENSIONS[id].name[input.locale],
        band: (score >= 0.75 ? "high" : "moderate") as "high" | "moderate",
      };
    })
    .filter((h): h is AiExplanationDimensionHighlight => h !== null);

  return {
    locale: input.locale,
    leadingPatternName: input.leadingPatternName,
    dimensionHighlights: highlights,
    profession: {
      professionId: input.match.professionId,
      title: input.locale === "sv" ? input.match.titleSv : input.match.titleEn,
      stage: input.match.stage,
      stageLabel: input.explanation.stageSentence,
      fitTier: input.match.fitTier,
      alignedDimensionNames: input.explanation.alignedDimensionNames,
      contextCorroborated: input.match.contextCorroborated,
    },
    cigFacts: {
      requirements: input.requirements ?? [],
      education: input.education ?? [],
    },
    experienceBand: input.experienceBand ?? null,
  };
}

// -------------------------------------------------------------------------
// The pluggable call + deterministic fallback.
// -------------------------------------------------------------------------

/** The exact seam a real provider plugs into. Takes the read-only context
 *  above, returns candidate-friendly prose. Must never be given more than
 *  this context — no raw answers, no PII beyond what's already in it (none
 *  today). Whoever wires a real provider implements this signature and
 *  passes it into generateEnrichedExplanation; nothing else in this module
 *  changes. */
export type AiCallFn = (context: AiExplanationContext) => Promise<string>;

export type AiExplanationSource = "ai" | "deterministic_fallback";

export interface AiExplanationProvenance {
  readonly source: AiExplanationSource;
  /** Present only when source === "ai". No provider is wired in today, so
   *  this is always undefined in production — see the file header. */
  readonly provider?: string;
  readonly model?: string;
  readonly promptTemplateVersion?: string;
  readonly generatedAt: string;
}

export interface AiExplanationResult {
  readonly text: string;
  readonly provenance: AiExplanationProvenance;
}

const FALLBACK_TEMPLATE_VERSION = "ai-explanation-fallback-v1";

/** The deterministic fallback — NOT a degraded experience, the only
 *  experience that exists until a provider is wired in. Composes strictly
 *  from the same context an AI call would receive, using the same modest,
 *  non-overclaiming register §38/§12 require elsewhere in this product
 *  ("relates to", never "you qualify for" / "you are suited to"). */
function deterministicFallback(context: AiExplanationContext): string {
  const dims = context.dimensionHighlights.map((h) => h.name).join(", ");
  const experienceNote =
    context.experienceBand !== null
      ? context.locale === "sv"
        ? " Din erfarenhet i din nuvarande roll är också en del av bilden."
        : " Your experience in your current role is also part of the picture."
      : "";

  if (context.locale === "sv") {
    return [
      `${context.profession.title} är en av dina karriärriktningar.`,
      dims.length > 0 ? `Den här riktningen relaterar särskilt till: ${dims}.` : "",
      context.profession.stageLabel,
      context.profession.contextCorroborated
        ? "Dina svar om vad du hoppas jobba med pekar också mot den här typen av riktning."
        : "",
      experienceNote,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${context.profession.title} is one of your career directions.`,
    dims.length > 0 ? `This direction relates especially to: ${dims}.` : "",
    context.profession.stageLabel,
    context.profession.contextCorroborated
      ? "What you said you're hoping to work toward also points toward this kind of direction."
      : "",
    experienceNote,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Generates a candidate-friendly explanation for one profession match.
 * Never determines Career DNA, Profession Affinity, Recommendation
 * Priority or stage — those are already decided by the time this runs; it
 * only writes about them.
 *
 * `aiCall` is optional. When omitted (today, always — no provider is
 * wired), the deterministic fallback runs directly. When supplied, it is
 * tried first and its failure is caught silently: an AI outage must never
 * surface as a broken report, only as a quieter, still-correct one.
 */
export async function generateEnrichedExplanation(
  context: AiExplanationContext,
  aiCall?: AiCallFn,
): Promise<AiExplanationResult> {
  const generatedAt = new Date().toISOString();

  if (aiCall) {
    try {
      const text = await aiCall(context);
      if (text.trim().length > 0) {
        return {
          text,
          provenance: {
            source: "ai",
            promptTemplateVersion: FALLBACK_TEMPLATE_VERSION,
            generatedAt,
          },
        };
      }
    } catch {
      // Fall through to the deterministic path. An AI failure is never a
      // candidate-facing error — see the file header.
    }
  }

  return {
    text: deterministicFallback(context),
    provenance: {
      source: "deterministic_fallback",
      promptTemplateVersion: FALLBACK_TEMPLATE_VERSION,
      generatedAt,
    },
  };
}

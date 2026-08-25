// The AI proposal contract, and the boundary it has to cross.
//
// ── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────
//
// A customer asked why her staff have to score free-text answers by hand. The
// answer the product is going to give is: they will not, but a person will
// always confirm. AI proposes, an authorised human confirms or changes it, and
// the human's action is what gets recorded.
//
// This file is that seam. It is deliberately complete and deliberately inert:
//
//   scp_ai_providers has 'anthropic' registered and is_enabled = false, with
//   no credential anywhere in this environment. So getReviewProposal() returns
//   null today, every time, and the reviewer workspace runs exactly as it does
//   now. Nothing here calls a model, and nothing here should be made to.
//
// Building the contract before the provider is the point. The shape of what an
// AI may return, and the validation it has to survive, are governance
// decisions -- not implementation details to be settled in a hurry once a key
// exists.
//
// ── WHAT AN AI MAY PROPOSE ──────────────────────────────────────────────
//
// A level per rubric dimension, a rationale draft, the evidence it read that
// on, where it is unsure, and a follow-up question worth asking. That is all.
//
// What it may not produce is enforced by this type not having the fields:
// there is no verdict, no pass, no score, no suitability, no recommendation,
// no ranking. A proposal that arrives carrying one is rejected below rather
// than filtered, because a provider that returns fields we never asked for is
// a provider whose output we do not understand.

import type { RubricDimension } from "./academy-employer.functions";

/** Values a provider may never return, in any field. Checked as a whole-object
 *  scan rather than per-field: the risk is not that `verdict` appears where we
 *  expect a level, it is that an employment judgement arrives ANYWHERE and
 *  gets rendered because some surface prints what it is given. */
const FORBIDDEN_IN_OUTPUT = [
  "verdict",
  "pass",
  "fail",
  "hire",
  "reject",
  "suitab",
  "unsuitab",
  "rank",
  "score",
  "readiness",
  "recommend",
  "lämplig",
  "olämplig",
  "anställ",
  "avslå",
  "rangordn",
  "poäng",
] as const;

/** One dimension's proposed level, with what the model read it on.
 *
 *  `evidenceQuote` must be a span the candidate actually wrote. A model that
 *  paraphrases is a model whose reasoning cannot be checked against the answer
 *  in front of the reviewer, so the validator requires the quote to appear in
 *  the response verbatim. */
export type ProposedLevel = {
  dimensionKey: string;
  level: number;
  /** Verbatim from the candidate's answer. Never the model's words. */
  evidenceQuote: string | null;
  /** The model says it is unsure. Renders as a flag the reviewer sees FIRST. */
  uncertain: boolean;
};

/** What a provider is allowed to hand back for one constructed response. */
export type ReviewProposal = {
  /** The scp_ai_scoring_runs row this came from. Written onto
   *  scp_human_reviews.scoring_run_id, which is what makes the human's
   *  confirmation auditable against a specific proposal. */
  scoringRunId: string;
  providerCode: string;
  modelVersion: string | null;
  /** Bound identifiers. A proposal generated against a different rubric
   *  version than the one on screen is not a proposal about this item. */
  rubricVersionId: string | null;
  promptVersionId: string | null;
  levels: ProposedLevel[];
  /** A draft the reviewer edits or replaces. Never saved unread: the form
   *  puts it in the textarea and the reviewer owns it from there. */
  rationaleDraft: string | null;
  /** 0..1. Low confidence is shown, never used to auto-accept anything. */
  confidence: number | null;
  /** A question worth asking at interview. Advisory, never an instruction. */
  suggestedFollowUp: string | null;
};

export type ProposalRejection =
  | "provider_disabled"
  | "no_run"
  | "run_not_complete"
  | "rubric_version_mismatch"
  | "unknown_dimension"
  | "level_out_of_range"
  | "missing_dimension"
  | "quote_not_in_response"
  | "forbidden_field";

export type ProposalResult =
  | { proposal: ReviewProposal; rejected: null }
  | { proposal: null; rejected: ProposalRejection };

/**
 * Server-side validation of whatever a provider returned.
 *
 * Every rejection here means the reviewer sees the manual workspace, which is
 * the same workspace with one section absent. There is deliberately no partial
 * acceptance and no repair: a proposal we had to correct before showing is a
 * proposal we cannot claim a human confirmed.
 */
export function validateProposal(
  raw: unknown,
  context: {
    rubric: RubricDimension[];
    /** The rubric version the item is being reviewed under. */
    rubricVersionId: string | null;
    /** The candidate's answer, for checking quotes are real. */
    responseText: string | null;
    providerEnabled: boolean;
  },
): ProposalResult {
  if (!context.providerEnabled) return { proposal: null, rejected: "provider_disabled" };
  if (raw === null || typeof raw !== "object") return { proposal: null, rejected: "no_run" };

  const o = raw as Record<string, unknown>;

  // ── WHAT THE SCAN MAY AND MAY NOT READ ────────────────────────────────
  //
  // Keys, and the two fields the MODEL writes in its own voice. Not
  // evidenceQuote: that is the candidate's own words, verbatim, and a security
  // answer about access control very plausibly contains "passerkort" or
  // "passage". Scanning it would reject a perfectly good proposal because of
  // something the candidate wrote -- and the reviewer would be told AI
  // assistance was unavailable, with no way to find out why.
  //
  // So the rule is about what the model ASSERTS, which is where an employment
  // judgement could actually come from.
  const authored = [
    ...Object.keys(o),
    typeof o.rationaleDraft === "string" ? o.rationaleDraft : "",
    typeof o.suggestedFollowUp === "string" ? o.suggestedFollowUp : "",
    ...(Array.isArray(o.levels)
      ? o.levels.flatMap((l) =>
          l !== null && typeof l === "object" ? Object.keys(l as Record<string, unknown>) : [],
        )
      : []),
  ]
    .join(" ")
    .toLowerCase();
  if (FORBIDDEN_IN_OUTPUT.some((word) => authored.includes(word))) {
    return { proposal: null, rejected: "forbidden_field" };
  }

  if (typeof o.scoringRunId !== "string" || o.scoringRunId === "") {
    return { proposal: null, rejected: "no_run" };
  }
  if (o.runStatus !== undefined && o.runStatus !== "complete") {
    return { proposal: null, rejected: "run_not_complete" };
  }

  // A proposal about a different version of the rubric is about a different
  // question, however similar it looks.
  const proposedRubricVersion = typeof o.rubricVersionId === "string" ? o.rubricVersionId : null;
  if (context.rubricVersionId !== null && proposedRubricVersion !== context.rubricVersionId) {
    return { proposal: null, rejected: "rubric_version_mismatch" };
  }

  const known = new Map(context.rubric.map((d) => [d.dimension_key, d]));
  const rawLevels = Array.isArray(o.levels) ? o.levels : null;
  if (rawLevels === null) return { proposal: null, rejected: "missing_dimension" };

  const levels: ProposedLevel[] = [];
  for (const entry of rawLevels) {
    if (entry === null || typeof entry !== "object") {
      return { proposal: null, rejected: "unknown_dimension" };
    }
    const e = entry as Record<string, unknown>;
    const key = typeof e.dimensionKey === "string" ? e.dimensionKey : "";
    const dim = known.get(key);
    if (!dim) return { proposal: null, rejected: "unknown_dimension" };

    const level = typeof e.level === "number" ? e.level : NaN;
    const allowed = (dim.levels ?? []).map((l) => l.level);
    if (!allowed.includes(level)) return { proposal: null, rejected: "level_out_of_range" };

    const quote =
      typeof e.evidenceQuote === "string" && e.evidenceQuote.trim() !== ""
        ? e.evidenceQuote.trim()
        : null;
    // A quote the candidate did not write cannot be checked by the person
    // reading their answer, which is the only check that matters here.
    if (quote !== null && !(context.responseText ?? "").includes(quote)) {
      return { proposal: null, rejected: "quote_not_in_response" };
    }

    levels.push({
      dimensionKey: key,
      level,
      evidenceQuote: quote,
      uncertain: e.uncertain === true,
    });
  }

  // Every dimension, or none. A half-proposal makes the reviewer do the
  // hardest part unaided while the interface implies they were helped.
  if (levels.length !== context.rubric.length) {
    return { proposal: null, rejected: "missing_dimension" };
  }

  const confidence =
    typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
      ? o.confidence
      : null;

  return {
    proposal: {
      scoringRunId: o.scoringRunId,
      providerCode: typeof o.providerCode === "string" ? o.providerCode : "unknown",
      modelVersion: typeof o.modelVersion === "string" ? o.modelVersion : null,
      rubricVersionId: proposedRubricVersion,
      promptVersionId: typeof o.promptVersionId === "string" ? o.promptVersionId : null,
      levels,
      rationaleDraft: typeof o.rationaleDraft === "string" ? o.rationaleDraft : null,
      confidence,
      suggestedFollowUp: typeof o.suggestedFollowUp === "string" ? o.suggestedFollowUp : null,
    },
    rejected: null,
  };
}

/**
 * What the human did with the proposal, for the audit trail.
 *
 * `scp_human_reviews.outcome` already exists to hold this and is constrained to
 * upheld / adjusted / overturned. It used to be a question put to the reviewer
 * -- "Utfall: Fastställs / Justeras / Ändras" -- which a security manager
 * could not answer, because with no provider enabled there was no proposal to
 * uphold or adjust. Emma said so in as many words.
 *
 * So it is derived instead of asked. That is both simpler for the reviewer and
 * stricter as an audit record: it can no longer be mislabelled, deliberately
 * or by a tired click.
 */
export function deriveOutcome(
  proposal: ReviewProposal | null,
  finalLevels: Record<string, number>,
  /** A safety finding of concern overrides: the reviewer has contradicted the
   *  proposal on the thing that matters most, whatever the levels say. */
  overturnedBySafety = false,
): "upheld" | "adjusted" | "overturned" {
  // No proposal: the reviewer's own assessment stands on its own. Nothing was
  // adjusted, because nothing was proposed.
  if (proposal === null) return "upheld";
  if (overturnedBySafety) return "overturned";
  const changed = proposal.levels.some((l) => finalLevels[l.dimensionKey] !== l.level);
  return changed ? "adjusted" : "upheld";
}

/** The short, human name for a rubric level.
 *
 *  The governed descriptor stays exactly as authored and is rendered under
 *  this. What changes is which text the reviewer's eye lands on first: a
 *  radio labelled "0 — Inget underlag i svaret för denna dimension." asks a
 *  security manager to compare five sentences of methodology, and the number
 *  is the only thing that scans. These labels are the level's name, not new
 *  governed content, and nothing is scored from them. */
export const RUBRIC_LEVEL_LABEL_KEY: Record<number, string> = {
  0: "academy.reviews.level.0",
  1: "academy.reviews.level.1",
  2: "academy.reviews.level.2",
  3: "academy.reviews.level.3",
  4: "academy.reviews.level.4",
};

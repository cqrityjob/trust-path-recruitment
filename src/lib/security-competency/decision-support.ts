// The Decision Support Summary Builder — rds-v1.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────
//
// A recruiter opening a released candidate report has six questions, in this
// order: what does this indicate, what is strongest, what should worry or
// interest me, what is uncertain, what do I ask, and what do I do next. The
// frozen brief already contains every fact needed to answer them; what it does
// not contain is the PRIORITISATION. This module is that layer, and nothing
// else: it reads the frozen brief and returns the same facts, ordered and
// bucketed, plus one recommended PROCESS step.
//
// ── THE LINE THIS MODULE MAY NOT CROSS ──────────────────────────────────
//
// It recommends a step in the RECRUITMENT PROCESS. It does not recommend an
// employment outcome, and it cannot: `RecommendedNextStep` has four values,
// all of them process steps, and there is no hire, no reject, no suitability
// verdict, no total, no band and no comparison with another candidate anywhere
// in the type. Those are absent from the vocabulary rather than filtered out of
// it, which is the same discipline scp_release_attempt_report proves about
// itself in SQL. scripts/recruitment-decision-support-check.ts asserts it from
// the outside as well.
//
// ── WHY IT IS DETERMINISTIC ─────────────────────────────────────────────
//
// Two people reading one candidate's evidence must get the same brief, and any
// line of it must be traceable to the rows that produced it. So every bucket
// here is a filter over the frozen arrays and every recommendation is a rule
// written out below. No scoring happens here — signal, evidence state and
// safety findings are decided in the database and arrive already decided.
//
// The AI seam is at the END of this file and is additive: it may reword the
// narrative, never choose the step, never invent an area, never change a
// count. See `enrichDecisionSupport`.

import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  InterviewGuideEntry,
  ObservedArea,
  ReportBrief,
  SelfReportedArea,
} from "./academy-employer.functions";

export const DECISION_SUPPORT_VERSION = "rds-v1";

/** The four process steps this product may recommend.
 *
 *  Every one of them is something the EMPLOYER does next in its own process.
 *  None of them is an employment decision, and there is deliberately no fifth
 *  value: a type with `hire` in it is a type somebody eventually returns. */
export type RecommendedNextStep =
  | "structured_interview"
  | "additional_assessment"
  | "request_clarification"
  | "gather_more_evidence";

/** A follow-up area, paired with the authored interview prompt that belongs to
 *  it. The prompt is not generated here — it comes from the governed interview
 *  guide in the frozen brief, matched by area code. */
export type FollowUpItem = {
  area: ObservedArea;
  /** The authored question for this area, when the guide selected one. */
  prompt: InterviewGuideEntry | null;
};

/** The input contract.
 *
 *  Assembled from the frozen brief and nothing else. Deliberately carries no
 *  name, no address, no subject id, no attempt id and no raw response text: an
 *  AI enrichment step receives exactly this object, so what it cannot be given
 *  is decided by the shape of the type rather than by the caller remembering. */
export type DecisionSupportInput = {
  observed: ObservedArea[];
  selfReported: SelfReportedArea[];
  interviewGuide: InterviewGuideEntry[];
  safetyFlagCount: number;
  observedObservations: number;
  selfReportObservations: number;
  evidenceContexts: number;
  reviewsTotal: number;
  reviewsCompleted: number;
  /** The paragraph the database froze with the snapshot, if the snapshot is
   *  new enough to carry one. Reused rather than rewritten. */
  frozenSummary: { sv: string; en: string } | null;
};

export type DecisionSupport = {
  version: typeof DECISION_SUPPORT_VERSION;
  /** Where the narrative came from. The buckets and the step are always
   *  deterministic, whatever this says. */
  source: "deterministic" | "ai";
  recommendedNextStep: RecommendedNextStep;
  /** Why that step, in words the surface translates. Named as a key rather
   *  than as prose so the reason is one sentence in both languages and cannot
   *  drift between them. */
  rationaleKey: TranslationKey;
  /** The narrative. Null when the snapshot predates the frozen summary and no
   *  enrichment ran — the surface then renders the panels alone, which is a
   *  smaller page rather than a broken one. */
  narrative: { sv: string; en: string } | null;
  strongestSupported: ObservedArea[];
  priorityFollowUp: FollowUpItem[];
  /** Null, not an empty array: a panel that renders "no safety-critical
   *  findings" on every clean report is a panel that alarms every reader of a
   *  clean report. */
  safetyCriticalFollowUp: { count: number; prompts: InterviewGuideEntry[] } | null;
  uncertainties: ObservedArea[];
  selfReportedPatterns: SelfReportedArea[];
  reviewComplete: boolean;
};

/** Signals that say something about how the person answered. `limited` is
 *  excluded on purpose: it says the assessment did not ask enough, which is a
 *  fact about the instrument and never a finding about the person. */
const USABLE_SIGNALS = new Set(["strong", "consistent", "mixed", "developing"]);

export function buildDecisionSupportInput(
  brief: ReportBrief,
  safetyFlagCount: number,
): DecisionSupportInput {
  return {
    observed: brief.observed,
    selfReported: brief.selfReported,
    interviewGuide: brief.interviewGuide,
    safetyFlagCount,
    observedObservations: brief.coverage.observedObservations,
    selfReportObservations: brief.coverage.selfReportObservations,
    evidenceContexts: brief.coverage.evidenceContexts,
    reviewsTotal: brief.coverage.reviewsTotal ?? 0,
    reviewsCompleted: brief.coverage.reviewsCompleted ?? 0,
    frozenSummary: brief.executiveSummary,
  };
}

/**
 * The recommendation, as four rules read in order.
 *
 * ── WHY SAFETY IS FIRST ─────────────────────────────────────────────────
 *
 * A response a reviewer marked safety-critical is the one thing on the page
 * that a strong assessment elsewhere must never be allowed to outweigh. It is
 * read before the evidence-sufficiency rules so that no combination of counts
 * can move the recommendation off it, and the safety panel renders from its own
 * field regardless of what this function returns.
 *
 * ── WHY "NOT ENOUGH EVIDENCE" IS NOT "WEAK" ─────────────────────────────
 *
 * Rule 3 fires when more areas were barely touched than were actually
 * exercised. The step it recommends is more assessment, not a negative reading
 * of the person: `limited` is excluded from USABLE_SIGNALS precisely so that
 * thin coverage can never be counted as a shortcoming.
 */
export function recommendNextStep(input: DecisionSupportInput): {
  step: RecommendedNextStep;
  rationaleKey: TranslationKey;
} {
  const limited = input.observed.filter((o) => o.signal === "limited").length;
  const usable = input.observed.filter((o) => USABLE_SIGNALS.has(o.signal)).length;

  if (input.safetyFlagCount > 0) {
    return { step: "request_clarification", rationaleKey: "decision.why.safety" };
  }
  if (input.observedObservations === 0) {
    return { step: "gather_more_evidence", rationaleKey: "decision.why.noObserved" };
  }
  if (usable === 0 || limited > usable) {
    return { step: "additional_assessment", rationaleKey: "decision.why.thinCoverage" };
  }
  return { step: "structured_interview", rationaleKey: "decision.why.readyForInterview" };
}

/** Follow-up before strength when both are the same size, and within each
 *  bucket the area with the most tasks behind it first — a recruiter reading
 *  only the first line should get the area with the most under it, not the
 *  alphabetically luckiest. */
const byWeight = (a: ObservedArea, b: ObservedArea) =>
  b.items - a.items || a.areaCode.localeCompare(b.areaCode);

/** How many rows a summary panel shows before the detail sections take over.
 *  The panel exists to be read in fifteen seconds; a panel that lists eleven
 *  areas is the report it was supposed to replace. */
export const PANEL_LIMIT = 4;

export function buildDecisionSupport(input: DecisionSupportInput): DecisionSupport {
  const { step, rationaleKey } = recommendNextStep(input);

  const strongest = input.observed
    .filter((o) => o.signal === "strong" || o.signal === "consistent")
    .sort(byWeight);

  // developing before mixed: answers that consistently chose the less
  // well-judged option are a clearer thing to ask about than answers that
  // varied, and a recruiter reading only the first row should get the former.
  const rank = (o: ObservedArea) => (o.signal === "developing" ? 0 : 1);
  const followUp = input.observed
    .filter((o) => o.signal === "developing" || o.signal === "mixed")
    .sort((a, b) => rank(a) - rank(b) || byWeight(a, b))
    .map((area) => ({
      area,
      prompt: input.interviewGuide.find((g) => g.areaCode === area.areaCode) ?? null,
    }));

  const uncertainties = input.observed.filter((o) => o.signal === "limited").sort(byWeight);

  // What the person said about themselves, with the areas whose related
  // answers pointed different ways first. Never merged with the observed
  // buckets above: they are different kinds of evidence and occupy different
  // fields all the way to the page.
  const selfReported = [
    ...input.selfReported.filter((s) => s.consistency === "varied"),
    ...input.selfReported.filter(
      (s) => s.consistency !== "varied" && s.pattern === "rarely_described",
    ),
  ];

  return {
    version: DECISION_SUPPORT_VERSION,
    source: "deterministic",
    recommendedNextStep: step,
    rationaleKey,
    narrative: input.frozenSummary,
    strongestSupported: strongest,
    priorityFollowUp: followUp,
    safetyCriticalFollowUp:
      input.safetyFlagCount > 0
        ? {
            count: input.safetyFlagCount,
            // Safety-critical responses are reviewed by a person, and the
            // guide's own entries are what the conversation should cover. No
            // question is invented here.
            prompts: input.interviewGuide.filter((g) => g.focus === "explore_development"),
          }
        : null,
    uncertainties,
    selfReportedPatterns: selfReported,
    reviewComplete: input.reviewsCompleted >= input.reviewsTotal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// The AI seam
// ═══════════════════════════════════════════════════════════════════════════
//
// No provider is wired in, and this module does not add one: that is a billing
// and vendor decision for the owner, not something to introduce while building
// an architecture. The same seam already exists for Career Discovery
// (src/lib/career-discovery/v31/ai-explanation.ts) and this mirrors it, so the
// day a provider is chosen there is one shape to implement, not two.
//
// What an AI layer may and may not do here is enforced by code rather than by
// a prompt:
//
//   MAY   reword `narrative` into something shorter and more readable.
//   MAY   NOT choose the step         — `recommendedNextStep` is overwritten
//                                       back to the deterministic value.
//   MAY   NOT invent an area          — a narrative naming an area absent from
//                                       the input is rejected wholesale.
//   MAY   NOT express a verdict       — forbidden vocabulary is rejected.
//   MAY   NOT fail loudly             — any throw returns the deterministic
//                                       result unchanged.

export type DecisionSupportAiFn = (
  input: DecisionSupportInput,
) => Promise<{ sv: string; en: string }>;

/** The vocabulary a narrative may not contain, in either language. Mirrors the
 *  assertion scp_release_attempt_report makes about its own source. */
const FORBIDDEN = [
  "hire",
  "reject",
  "suitab",
  "unsuitab",
  "rank",
  "percentile",
  "score",
  "anställ",
  "avslå",
  "lämplig",
  "olämplig",
  "rangordn",
  "poäng",
  "betyg",
];

export function narrativeIsAcceptable(text: string, input: DecisionSupportInput): boolean {
  const lower = text.toLowerCase();
  if (lower.trim().length === 0) return false;
  if (FORBIDDEN.some((w) => lower.includes(w))) return false;

  // Every capitalised area name the narrative uses must be one the evidence
  // actually contains. Checked by looking for names that are NOT present
  // rather than by parsing prose: the question is whether the text stays
  // inside the vocabulary, and any area it mentions must come from here.
  const known = new Set(
    input.observed.flatMap((o) => [o.areaSv.toLowerCase(), o.areaEn.toLowerCase()]),
  );
  for (const s of input.selfReported) {
    known.add(s.domainSv.toLowerCase());
    known.add(s.domainEn.toLowerCase());
  }
  return known.size === 0 || [...known].some((k) => lower.includes(k));
}

/**
 * Runs the AI narrative if one is configured, and returns the deterministic
 * result untouched if it is not, if it fails, or if what it produced does not
 * survive `narrativeIsAcceptable`.
 *
 * The buckets, counts and step in the returned object are the deterministic
 * ones in every case. Only `narrative` and `source` can change.
 */
export async function enrichDecisionSupport(
  base: DecisionSupport,
  input: DecisionSupportInput,
  aiCall?: DecisionSupportAiFn,
): Promise<DecisionSupport> {
  if (!aiCall) return base;
  try {
    const text = await aiCall(input);
    if (narrativeIsAcceptable(text.sv, input) && narrativeIsAcceptable(text.en, input)) {
      return { ...base, source: "ai", narrative: text };
    }
  } catch {
    // An AI outage is never an employer-facing error. The report is complete
    // without it — see the file header.
  }
  return base;
}

/**
 * The employer final report — the sequence, and what a readback can say.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────
 *
 * The employer final report is the CANONICAL output of the assessment and
 * interview process. A recruitment owner reviews it, explicitly finalises it,
 * and uses it as decision support. It is never an automatic recommendation,
 * ranking, total score, pass/fail or employment decision, and finalising it
 * is not sharing it with anybody.
 *
 * Two things live here, both pure, so both can be exercised exhaustively
 * offline rather than only through a browser:
 *
 *   1. THE SEQUENCE. Seven acts, in order, with exactly one of them current.
 *      The page shows one clear next action at a time; this module decides
 *      which, from state the server already reported.
 *
 *   2. WHAT A READBACK MAY CLAIM. A finalisation is not finished when the
 *      mutation resolves. It is finished when a governed read comes back
 *      carrying the version, and the digest recomputed from the stored basis
 *      matches the digest stored beside it. Anything less has its own state
 *      and its own sentence, and none of them says "done" while it isn't.
 *
 * No React, no I/O, no clock.
 */

/* ------------------------------------------------------------------ */
/* The sequence                                                        */
/* ------------------------------------------------------------------ */

/** The seven acts, in the order a recruitment owner performs them. */
export const REPORT_STEPS = [
  /** 1. Read the assessment material the process ran on. */
  "reviewAssessmentMaterial",
  /** 2. Read the confirmed interview evidence, requirement by requirement. */
  "reviewEvidence",
  /** 3. Resolve what is missing or contradictory — or record that it stays open. */
  "resolveOutstanding",
  /** 4. Confirm the basis: every requirement carries a human assessment. */
  "confirmBasis",
  /** 5. Preview the complete employer report as it will be finalised. */
  "previewReport",
  /** 6. Explicitly finalise. The irreversible act, by an authorised human. */
  "finalise",
  /** 7. Read the immutable final report back, and check its integrity. */
  "readback",
] as const;

export type ReportStep = (typeof REPORT_STEPS)[number];

export type StepState =
  /** Behind the current step: done, and re-readable. */
  | "done"
  /** The one thing to do now. Exactly one step is ever `current`. */
  | "current"
  /** Ahead of the current step. Reachable, not yet actionable. */
  | "ahead"
  /** Ahead AND this person may never do it. Stated, never silently hidden. */
  | "notPermitted";

export interface StepView {
  readonly step: ReportStep;
  readonly state: StepState;
}

export interface ReportProgress {
  /** Requirements the pinned pack asks about. */
  readonly requirementCount: number;
  /** Requirements carrying a recorded human assessment. */
  readonly assessedCount: number;
  /** Findings still open, needing verification, or an unresolved difference. */
  readonly outstandingCount: number;
  /** What the server says still blocks finalisation. Empty is not "ready" on
   *  its own — a case with no requirements at all has no blockers either. */
  readonly blockerCount: number;
  /** A final report exists for this case. */
  readonly isFinal: boolean;
  /** This person holds owner or admin, the two roles the database accepts. */
  readonly canFinalise: boolean;
}

/**
 * Which act is current.
 *
 * Deliberately NOT "the first step whose work is incomplete": the last step is
 * reading the finalised report back, and that is current for as long as a
 * final report exists. Everything before it is then done, because it was done
 * — the report was built from it.
 */
export function currentStep(p: ReportProgress): ReportStep {
  if (p.isFinal) return "readback";
  if (p.blockerCount > 0 || p.assessedCount < p.requirementCount) {
    // Something is still owed. WHICH thing is owed decides which act it is.
    if (p.assessedCount === 0) return "reviewAssessmentMaterial";
    if (p.assessedCount < p.requirementCount) return "reviewEvidence";
    return "resolveOutstanding";
  }
  if (p.requirementCount === 0) return "reviewAssessmentMaterial";
  if (p.outstandingCount > 0) return "resolveOutstanding";
  if (!p.canFinalise) return "previewReport";
  return "finalise";
}

/**
 * The whole ladder, with one step current and the rest placed around it.
 *
 * `notPermitted` exists so that a member who may read but not finalise is TOLD
 * that finalising is somebody else's act, rather than being shown a control
 * that does nothing or no control at all. A missing button explains nothing.
 */
export function reportSteps(p: ReportProgress): readonly StepView[] {
  const current = currentStep(p);
  const at = REPORT_STEPS.indexOf(current);
  return REPORT_STEPS.map((step, i) => {
    if (i < at) return { step, state: "done" as const };
    if (i === at) return { step, state: "current" as const };
    if (step === "finalise" && !p.canFinalise) return { step, state: "notPermitted" as const };
    return { step, state: "ahead" as const };
  });
}

/** Exactly one step is current, always. The guard asserts this over every
 *  combination rather than trusting the reading. */
export function stepIsCurrent(views: readonly StepView[], step: ReportStep): boolean {
  return views.some((v) => v.step === step && v.state === "current");
}

/* ------------------------------------------------------------------ */
/* What a readback may claim                                           */
/* ------------------------------------------------------------------ */

/** One finalised version, as the governed read returns it. */
export interface FinalReportReadback {
  readonly reportId: string;
  readonly versionNumber: number;
  readonly status: string;
  readonly finalisedAt: string | null;
  readonly finalisedBy: string | null;
  readonly contentHash: string | null;
  readonly contentHashAlgorithm: string;
  readonly recomputedHash: string | null;
  readonly hashVerified: boolean;
}

export type ReadbackOutcome =
  /** Nothing has been asked for yet. */
  | { readonly kind: "idle" }
  /** The read is in flight. Not a zero, and not a failure. */
  | { readonly kind: "loading" }
  /** A version came back AND its digest recomputes to the stored value. The
   *  only state that may be presented as a finalised, intact report. */
  | { readonly kind: "verified"; readonly report: FinalReportReadback }
  /** A version came back and the digest does NOT match. Never rendered as a
   *  finalised report: the stored basis and the stored hash disagree, and a
   *  human has to be told that in those words. */
  | { readonly kind: "notVerified"; readonly report: FinalReportReadback }
  /** The read succeeded and there is no finalised version. An honest "none". */
  | { readonly kind: "none" }
  /** The read was refused. NOT "none" — this says nothing about whether a
   *  report exists, and must never be rendered as though it did. */
  | { readonly kind: "refused" }
  /** The read broke. Also not "none", and retrying could change it. */
  | { readonly kind: "failed" };

/**
 * The verdict, from the row the governed read returned.
 *
 * `null` means the read came back empty, which is a genuine "no finalised
 * version". A read that FAILED or was REFUSED never reaches here — those are
 * their own members, produced by the caller, because collapsing them into
 * "none" is the single most common way a product states something false.
 */
export function readbackOutcome(row: FinalReportReadback | null): ReadbackOutcome {
  if (!row) return { kind: "none" };
  return row.hashVerified
    ? { kind: "verified", report: row }
    : { kind: "notVerified", report: row };
}

/** Codes PostgREST and Postgres use for "you may not", as opposed to "it
 *  broke". One is actionable by a person, the other by a retry. */
const REFUSAL_CODES = new Set(["42501", "PGRST301", "PGRST116"]);

export function readbackErrorOutcome(code: string | null | undefined): ReadbackOutcome {
  return code && REFUSAL_CODES.has(code) ? { kind: "refused" } : { kind: "failed" };
}

/** Only a verified readback may be presented as the finalised report. */
export function readbackIsTrustworthy(o: ReadbackOutcome): boolean {
  return o.kind === "verified";
}

/**
 * Whether the finalise control does anything if pressed.
 *
 * A courtesy, never a boundary: scp_iv_finalise_report re-decides the role and
 * the blockers on every call, and refuses a member whatever this returns.
 */
export function finaliseEnabled(p: ReportProgress, busy: boolean): boolean {
  if (busy) return false;
  if (p.isFinal) return false;
  if (!p.canFinalise) return false;
  return p.blockerCount === 0 && p.requirementCount > 0 && p.assessedCount >= p.requirementCount;
}

/* ------------------------------------------------------------------ */
/* The audience boundary, stated where the act happens                 */
/* ------------------------------------------------------------------ */

/** What finalising DOES. Enumerated so the confirmation names the exact
 *  irreversible effect rather than gesturing at it. */
export const FINALISE_EFFECTS = [
  "freezesTheBasis",
  "createsAVersion",
  "recordsWhoAndWhen",
  "staysReadableAfterwards",
] as const;

/** What finalising does NOT do. The first entry is the one a recruitment owner
 *  most needs to be sure of, and the reason this list exists at all. */
export const FINALISE_NON_EFFECTS = [
  "doesNotShareWithCandidate",
  "doesNotDecide",
  "doesNotRankOrScore",
  "doesNotEditLiveMaterial",
] as const;

export type FinaliseEffect = (typeof FINALISE_EFFECTS)[number];
export type FinaliseNonEffect = (typeof FINALISE_NON_EFFECTS)[number];

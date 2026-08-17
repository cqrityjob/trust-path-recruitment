// Security Passport — professional recognition. Pure and deterministic.
//
// ── THE ONE RULE ───────────────────────────────────────────────────────
//
// A branded recognition badge may be shown ONLY when the whole qualifying
// threshold is supported by VERIFIED experience. There is no partial
// credit and no "mostly verified" tier: mixed evidence produces NO badge
// (Product Architecture v1.1 §6.2).
//
// The alternative — awarding a badge on reported time and annotating it —
// was rejected. A badge is read as an earned credential at a glance, and a
// caveat printed beside it does not survive a screenshot.
//
// ── NOT GAMIFICATION ───────────────────────────────────────────────────
//
// No points, streaks, ranks, leaderboards or comparative language. When a
// threshold is not reached, the holder is told their verified total and how
// much more verified time the next threshold needs — a factual gap, stated
// once, with no encouragement to close it.
//
// ── BASIS ──────────────────────────────────────────────────────────────
//
// Elapsed calendar time in the profession, overlap removed. NOT the
// FTE-weighted figure: a 50% Väktare for four years worked in the
// profession for four years (v1.1 §11). The FTE figure is displayed
// alongside for context and is deliberately not the badge basis.
//
// Recognitions are COMPUTED, never stored. The Security Competence
// Platform establishes the same principle for maturity levels
// ("Maturity levels are PROJECTIONS of this ledger, never stored truths",
// supabase/migrations/20260802090000_scp_phase0_competency_graph.sql).
// Storing a recognition would let it drift from its evidence, which is the
// one failure a credential cannot survive.

import { DAYS_PER_YEAR, type ExperienceTotals } from "./experience";

/** Versioned so a recognition can always be explained by the policy that
 *  produced it. Prototype value — not a production policy version. */
export const RECOGNITION_POLICY_VERSION = "v1-prototype";

/** The ladder, in whole years. `20` is the open-ended top rung ("20+"). */
export const RECOGNITION_THRESHOLD_YEARS: readonly number[] = [1, 3, 5, 10, 15, 20] as const;

export const TOP_THRESHOLD_YEARS = 20;

export interface RecognitionState {
  /** Highest threshold fully covered by VERIFIED time, or null for none. */
  readonly earnedYears: number | null;
  /** The next rung up, or null once the top rung is earned. */
  readonly nextYears: number | null;
  /** Additional VERIFIED days needed to reach `nextYears`. 0 when there is
   *  no next rung. Never negative. */
  readonly remainingVerifiedDays: number;
  /** True when reported time would already have cleared `nextYears` but the
   *  evidence behind it is not all verified. Drives the honest explanation
   *  of why no badge appeared — the single most likely point of confusion
   *  in the whole product. */
  readonly blockedByMixedEvidence: boolean;
  readonly verifiedDays: number;
  readonly reportedDays: number;
  readonly policyVersion: string;
}

export function recognitionFor(totals: ExperienceTotals): RecognitionState {
  const verifiedDays = totals.verified.elapsedDays;
  const reportedDays = totals.reported.elapsedDays;

  let earnedYears: number | null = null;
  for (const years of RECOGNITION_THRESHOLD_YEARS) {
    if (verifiedDays >= years * DAYS_PER_YEAR) earnedYears = years;
  }

  const nextYears =
    RECOGNITION_THRESHOLD_YEARS.find((years) => earnedYears === null || years > earnedYears) ??
    null;

  const remainingVerifiedDays =
    nextYears === null ? 0 : Math.max(0, nextYears * DAYS_PER_YEAR - verifiedDays);

  // Reported time clears the next rung, verified time does not. This is the
  // mixed-evidence case, and it must be explained rather than left as a
  // silently absent badge.
  const blockedByMixedEvidence =
    nextYears !== null &&
    reportedDays >= nextYears * DAYS_PER_YEAR &&
    verifiedDays < nextYears * DAYS_PER_YEAR;

  return {
    earnedYears,
    nextYears,
    remainingVerifiedDays,
    blockedByMixedEvidence,
    verifiedDays,
    reportedDays,
    policyVersion: RECOGNITION_POLICY_VERSION,
  };
}

/** True when a badge may be rendered at all. Kept as a named predicate so
 *  the rule is asserted in one place and tested directly. */
export function mayShowBadge(state: RecognitionState): boolean {
  return state.earnedYears !== null;
}

/** Whether the earned rung is the open-ended top one ("20+"). */
export function isTopThreshold(years: number): boolean {
  return years >= TOP_THRESHOLD_YEARS;
}

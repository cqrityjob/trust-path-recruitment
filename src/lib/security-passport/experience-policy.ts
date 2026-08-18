// Security Passport — the verified-experience policy.
//
// ── WHY THIS IS A MODULE AND NOT A COMPONENT DETAIL ────────────────────
//
// "How much verified experience counts as established" is a product policy
// with real consequences: it decides how a person is presented to employers.
// A threshold buried in a presentation component is a policy nobody reviewed,
// versioned or tested. So it lives here, with its numbers written down, its
// reasoning stated, and a version string that changes when they do.
//
// ── EXPERIENCE IS NOT A TRUST STATE ────────────────────────────────────
//
// The Passport carries two INDEPENDENT dimensions and this module owns only
// the second:
//
//   * trust  — self-declared / documented / verified / expired / …, which is
//     about how well a claim is BACKED. Owned by the two stored axes.
//   * experience — how much verified time the holder has. A quantity.
//
// Conflating them is the classic failure: a colour that means "good person".
// A band here says only "this much verified time has accumulated", never
// anything about competence, suitability or standing, and the exact duration
// is always printed beside it so the reader never has to decode a symbol.
//
// ── WHERE THE NUMBERS COME FROM ────────────────────────────────────────
//
// They mirror the recognition ladder already approved and shipped in
// recognition.ts (1, 3, 5, 10, 15, 20 years), collapsed into four bands. That
// ladder was chosen for the Swedish security labour market, where a first
// year is probationary in practice, three years is an experienced Väktare,
// and ten is a career. Reusing it means the card and the recognition panel
// cannot tell a reader two different stories about the same person.
//
// If the owner wants different thresholds, they change HERE, once, and the
// version below changes with them.

import { DAYS_PER_YEAR } from "./experience";

/** Bumped whenever a threshold moves, so a stored or screenshotted
 *  presentation can be traced to the policy that produced it. */
export const EXPERIENCE_POLICY_VERSION = "sp-exp-v1";

/** Four bands, deliberately fewer than the six recognition thresholds: more
 *  bands invite a reading of "rank". The printed duration carries precision. */
export type ExperienceBand = "none" | "early" | "established" | "senior";

export interface ExperienceBandSpec {
  readonly band: ExperienceBand;
  /** Inclusive lower bound in whole verified years. */
  readonly fromYears: number;
}

/**
 * The bands, ascending. `none` is not "bad" — it is the honest state of a
 * holder whose time has not been verified yet, which is where everybody
 * starts and where most holders legitimately are.
 */
export const EXPERIENCE_BANDS: readonly ExperienceBandSpec[] = [
  { band: "none", fromYears: 0 },
  { band: "early", fromYears: 1 },
  { band: "established", fromYears: 3 },
  { band: "senior", fromYears: 10 },
] as const;

/**
 * Verified days → band.
 *
 * Takes DAYS, not years, because that is what the interval-union calculation
 * produces, and rounding to years before banding would let 2.99 years present
 * as three.
 */
export function experienceBandForDays(verifiedDays: number): ExperienceBand {
  const years = verifiedDays / DAYS_PER_YEAR;
  let current: ExperienceBand = "none";
  for (const spec of EXPERIENCE_BANDS) {
    if (years >= spec.fromYears) current = spec.band;
  }
  return current;
}

/** Whole completed verified years. Truncated, never rounded: one day short
 *  of three years is two years, and saying otherwise would overstate. */
export function completedVerifiedYears(verifiedDays: number): number {
  return Math.max(0, Math.floor(verifiedDays / DAYS_PER_YEAR));
}

export interface ExperienceMarkStyle {
  /** How many of the four segments are filled. Never a percentage. */
  readonly filled: number;
  readonly total: number;
  /** Solid only when there is verified time; dashed while there is none. */
  readonly outline: "dashed" | "solid";
  /** The single metal accent, reserved for the top band exactly as the
   *  recognition emblem reserves it. */
  readonly accent: boolean;
}

/**
 * The visual weight for a band.
 *
 * Restraint is the point: four segments that fill, one gold accent at the
 * top band, and nothing else. No stars, no percentage, no colour scale from
 * red to green — those all read as a score of the person rather than a count
 * of their verified time.
 */
export function experienceMarkStyle(band: ExperienceBand): ExperienceMarkStyle {
  switch (band) {
    case "none":
      return { filled: 0, total: 4, outline: "dashed", accent: false };
    case "early":
      return { filled: 1, total: 4, outline: "solid", accent: false };
    case "established":
      return { filled: 2, total: 4, outline: "solid", accent: false };
    case "senior":
      return { filled: 4, total: 4, outline: "solid", accent: true };
  }
}

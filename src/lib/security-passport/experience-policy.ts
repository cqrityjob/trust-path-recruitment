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
// They are the first five steps of the recognition ladder already approved
// and shipped in recognition.ts (1, 3, 5, 10, 15, 20 years). That ladder was
// chosen for the Swedish security labour market, where a first year is
// probationary in practice, three years is an experienced Väktare, and ten is
// a career. Reusing it means the card and the recognition panel cannot tell a
// reader two different stories about the same person.
//
// ── WHY THE BANDS ARE NAMED AFTER DURATIONS ────────────────────────────
//
// They used to be called none / early / established / senior. Those are words
// about a PERSON, and the moment one of them reaches a label, a tooltip or an
// employer-facing string, the mark has become a rank. The identifiers now name
// only the interval they stand for, so there is nothing to leak.
//
// If the owner wants different thresholds, they change HERE, once, and the
// version below changes with them.

import { DAYS_PER_YEAR } from "./experience";

/** Bumped whenever a threshold moves, so a stored or screenshotted
 *  presentation can be traced to the policy that produced it. */
export const EXPERIENCE_POLICY_VERSION = "sp-exp-v2";

/** Five intervals. Named for the span they cover and nothing else. */
export type ExperienceBand = "under1" | "y1to3" | "y3to5" | "y5to10" | "y10plus";

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
  { band: "under1", fromYears: 0 },
  { band: "y1to3", fromYears: 1 },
  { band: "y3to5", fromYears: 3 },
  { band: "y5to10", fromYears: 5 },
  { band: "y10plus", fromYears: 10 },
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
  let current: ExperienceBand = "under1";
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
  /** How many of the five segments are filled. Never a percentage. */
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
 * Restraint is the point: five segments that fill, one gold accent at the top
 * interval, and nothing else. No stars, no percentage, no colour scale from
 * red to green — those all read as a score of the person rather than a count
 * of their verified time.
 *
 * `verifiedDays` is taken as well as the band because zero and "some, but
 * under a year" share the first interval and must not look identical: nothing
 * verified is dashed and empty, while a verified month has earned its first
 * segment.
 */
export function experienceMarkStyle(band: ExperienceBand, verifiedDays = 0): ExperienceMarkStyle {
  const total = EXPERIENCE_BANDS.length;
  if (verifiedDays <= 0) {
    return { filled: 0, total, outline: "dashed", accent: false };
  }
  const index = EXPERIENCE_BANDS.findIndex((b) => b.band === band);
  return {
    filled: index + 1,
    total,
    outline: "solid",
    accent: band === "y10plus",
  };
}

// Security Passport — experience calculation. Pure, deterministic, testable.
//
// ── WHY SEGMENTS RATHER THAN A NAÏVE SUM ───────────────────────────────
//
// Adding period lengths together double-counts every concurrent job, which
// is common in guarding: a Väktare on a mobile-patrol contract who also
// works events for a second employer has two overlapping periods and one
// career. Product Architecture v1.1 §11 forbids double counting.
//
// So the timeline is cut into elementary segments at every boundary date,
// and each segment contributes ONCE, weighted by the MAX weight among the
// periods covering it — never the sum. Max is what makes overlap safe: two
// concurrent full-time security roles over the same month yield one month,
// not two.
//
// ── ELAPSED TIME AND FTE ARE COMPUTED SEPARATELY, ON PURPOSE ───────────
//
// A 50% Väktare for four years worked in the profession for four years.
// Silently converting that to two FTE-equivalent years would quietly
// rewrite someone's career, so both figures are produced and the UI shows
// them side by side with the distinction explained (v1.1 §11, §6.1).
//
// ── WHAT IS EXCLUDED, AND WHEN ─────────────────────────────────────────
//
// Only `active` periods count. Disputed, revoked and superseded periods
// drop out the moment their state changes — applied here in one place
// (`countsTowardExperience`) rather than trusted to each caller.
//
// Phase 1 is fixture-only; nothing here reads or writes a database.

import {
  assertionAtLeast,
  countsTowardExperience,
  type AssertionLevel,
  type ExperiencePeriod,
  type IsoDate,
} from "./types";
import { effectiveAssertionLevel } from "./provenance";

const MS_PER_DAY = 86_400_000;
/** Gregorian mean year. Used for both thresholds and display so the two can
 *  never disagree about what "one year" means. */
export const DAYS_PER_YEAR = 365.25;
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

/** ISO date → whole days since epoch, in UTC.
 *
 *  UTC deliberately: parsing `YYYY-MM-DD` in local time shifts the instant
 *  by the offset, which in a Swedish summer moves a start date to the
 *  previous day and can silently shorten someone's recorded employment. */
export function toEpochDay(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / MS_PER_DAY);
}

/** How much of a period is security work: 1 for a primary security role,
 *  the stated fraction for a partial one, 0 for none.
 *
 *  A `partial` period with no stated fraction contributes nothing. The
 *  calculation never invents a fraction — guessing one would fabricate
 *  experience the holder never claimed. */
export function securityWeight(period: ExperiencePeriod): number {
  if (period.securityRelevance === "primary") return 1;
  if (period.securityRelevance === "partial") {
    return clamp01(period.securityFraction);
  }
  return 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface ExperienceTotal {
  /** Calendar time in the profession, overlap removed. */
  readonly elapsedDays: number;
  /** The same span weighted by FTE. Shown ALONGSIDE elapsed, never instead. */
  readonly fteWeightedDays: number;
  /** Periods that contributed at all — drives the expandable basis. */
  readonly contributingPeriodIds: readonly string[];
}

const EMPTY_TOTAL: ExperienceTotal = {
  elapsedDays: 0,
  fteWeightedDays: 0,
  contributingPeriodIds: [],
};

/**
 * The core calculation: union of intervals, weighted per segment by the
 * maximum covering weight.
 *
 * `evaluationOn` makes an open-ended ("current") period deterministic, so
 * the same fixtures produce the same totals in a test today and in a year.
 */
export function totalForPeriods(
  periods: readonly ExperiencePeriod[],
  evaluationOn: IsoDate,
): ExperienceTotal {
  const evalDay = toEpochDay(evaluationOn);

  const usable = periods
    .filter((p) => countsTowardExperience(p.lifecycleState))
    .filter((p) => securityWeight(p) > 0)
    .map((p) => ({
      id: p.id,
      start: toEpochDay(p.startedOn),
      end: p.endedOn === null ? evalDay : toEpochDay(p.endedOn),
      weight: securityWeight(p),
      fte: clamp01(p.fteFraction),
    }))
    // A period that ends before it starts, or starts after the evaluation
    // date, is not evidence of anything. Dropped rather than clamped: a
    // clamp would invent a span the holder did not claim.
    .filter((p) => p.end > p.start && p.start < evalDay)
    .map((p) => ({ ...p, end: Math.min(p.end, evalDay) }));

  if (usable.length === 0) return EMPTY_TOTAL;

  // Every boundary at which the covering set can change.
  const boundaries = Array.from(new Set(usable.flatMap((p) => [p.start, p.end]))).sort(
    (a, b) => a - b,
  );

  let elapsedDays = 0;
  let fteWeightedDays = 0;
  const contributing = new Set<string>();

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const length = to - from;
    if (length <= 0) continue;

    const covering = usable.filter((p) => p.start <= from && p.end >= to);
    if (covering.length === 0) continue;

    // MAX, never SUM. This one line is what prevents double counting.
    const weight = Math.max(...covering.map((p) => p.weight));
    const fteWeight = Math.max(...covering.map((p) => p.weight * p.fte));

    elapsedDays += length * weight;
    fteWeightedDays += length * fteWeight;
    for (const p of covering) contributing.add(p.id);
  }

  return {
    elapsedDays,
    fteWeightedDays,
    contributingPeriodIds: Array.from(contributing).sort(),
  };
}

export interface ExperienceTotals {
  /** Everything active, whatever its backing. */
  readonly reported: ExperienceTotal;
  /** Backed by a document or better. */
  readonly documented: ExperienceTotal;
  /** Confirmed by an authorised third party. */
  readonly verified: ExperienceTotal;
  readonly evaluationOn: IsoDate;
}

/**
 * The three tiers shown in the private Passport (v1.1 §6.1).
 *
 * Each is an independent union over its own qualifying subset, which makes
 * them nested by construction: verified ⊆ documented ⊆ reported. A holder
 * can therefore see exactly how much of what they report is actually backed
 * — which is the entire point of showing three numbers instead of one.
 */
export function totalsByEvidenceLevel(
  periods: readonly ExperiencePeriod[],
  evaluationOn: IsoDate,
): ExperienceTotals {
  const atLeast = (floor: AssertionLevel) =>
    totalForPeriods(
      // The EFFECTIVE level: a period whose approval CQrityjob recorded as an
      // employer confirmation about itself counts as documented time, not
      // verified time.
      periods.filter((p) => assertionAtLeast(effectiveAssertionLevel(p), floor)),
      evaluationOn,
    );

  return {
    reported: atLeast("self_declared"),
    documented: atLeast("document_provided"),
    verified: atLeast("verified"),
    evaluationOn,
  };
}

export interface DurationParts {
  readonly years: number;
  readonly months: number;
}

/** Days → whole years and months, for display only. Never rounded up: a
 *  credential should under-state rather than over-state. */
export function toDuration(days: number): DurationParts {
  const safe = Math.max(0, days);
  const years = Math.floor(safe / DAYS_PER_YEAR);
  const months = Math.floor((safe - years * DAYS_PER_YEAR) / DAYS_PER_MONTH);
  return { years, months };
}

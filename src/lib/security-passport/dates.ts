// Passport dates — one definition of "a date", used everywhere.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
//
// Every Passport date was validated by the same shape check, written out
// separately in nine places:
//
//     /^\d{4}-\d{2}-\d{2}$/
//
// That is a check on the SHAPE of a string, not on whether it is a date.
// "2026-13-45" passes it. So does "0000-00-00". The forms use
// `<input type="date">`, and in a browser that renders a real date picker
// the shape check is rarely reached — but the field is still a text input
// underneath, several browsers and every assistive/automated path allow it
// to be typed into freely, and a hand-built request has no picker at all.
// Observed in UAT: a start date of "202005-01-01" reached a form, and the
// only thing standing between it and the database was a regex that would
// have accepted "2020-05-99".
//
// It also failed in the other direction. A date the regex REJECTED — the
// twelve-character string above — produced no field message at all, because
// the shape check lived in a Zod schema on the server: the request was
// refused wholesale and the holder was told "something went wrong".
//
// So: one module, three questions, asked the same way on the client and on
// the server. The database stays the last line of defence and its CHECK
// constraints are untouched; this exists so it stops being the FIRST thing
// to notice.

/** The narrowest year window that admits every real Passport date.
 *
 *  The lower bound is not arbitrary caution: a credential, appointment or
 *  employment start before 1900 is not a data-entry edge case, it is a typo.
 *  The upper bound has to allow genuine future validity — an appointment
 *  runs for years and a qualification can be valid for decades — so it is
 *  generous, and the "not in the future" rule below is what constrains the
 *  fields where a future date is actually wrong. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether this is a real calendar date in `YYYY-MM-DD`.
 *
 * Real, not merely well-shaped: month 1-12, day within that month's actual
 * length, leap years included. The round-trip through Date is what enforces
 * the last part — Date normalises 2026-02-30 into 2026-03-02, so a value
 * that comes back describing a different day was never a date.
 */
export function isCalendarDate(value: string): boolean {
  const m = SHAPE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Today, as YYYY-MM-DD in UTC.
 *
 *  UTC deliberately, and the same UTC on both sides: a holder in Sweden
 *  entering "today" must not be refused because the server is a few hours
 *  behind, so the comparison below is `>` against a UTC day boundary rather
 *  than an instant. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether this date is in the future.
 *
 * Only meaningful for fields where a future date is WRONG — when a course
 * was completed, when an authority decided something. It is emphatically not
 * applied to validity windows: `valid_until` is supposed to be in the
 * future, and an appointment that expires next year is the normal case.
 */
export function isFutureDate(value: string, now: Date = new Date()): boolean {
  return isCalendarDate(value) && value > todayIso(now);
}

/** The `max` a browser date picker should carry for a "this already
 *  happened" field, so the picker refuses what the validator would. */
export function maxPastDateAttr(now: Date = new Date()): string {
  return todayIso(now);
}

/** The `min` every Passport date input should carry. Stops a picker
 *  offering years the validator will reject. */
export const MIN_DATE_ATTR = `${MIN_YEAR}-01-01`;
export const MAX_DATE_ATTR = `${MAX_YEAR}-12-31`;

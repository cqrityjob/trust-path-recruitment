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

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** The length of a month, by the Gregorian rules and nothing else. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Whether year/month/day names a real day inside the Passport year window.
 *
 *  Pure calendar arithmetic, deliberately not a round-trip through `Date`:
 *  a Date is an instant, and an instant is shifted by whatever timezone the
 *  code happens to run in. A calendar date has no timezone to shift by. */
export function isRealDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/**
 * Whether this is a real calendar date in `YYYY-MM-DD`.
 *
 * Real, not merely well-shaped: month 1-12, day within that month's actual
 * length, leap years included. The shape is strict — this is the STORED form,
 * the one the database and every comparison expect. What a holder may TYPE
 * is wider, and `normaliseCalendarDateInput` is what brings it here.
 */
export function isCalendarDate(value: string): boolean {
  const m = SHAPE.exec(value);
  if (!m) return false;
  return isRealDay(Number(m[1]), Number(m[2]), Number(m[3]));
}

// ── WHAT A HOLDER MAY TYPE ─────────────────────────────────────────────
//
// The Passport date fields are text inputs (see CredentialDateInput). The
// placeholder says ÅÅÅÅ-MM-DD, but a holder copying a date off a certificate
// writes it the way they read it, and Swedish documents print both
// 2020-05-09 and 20200509. Both name the same day without any guessing, so
// both are accepted and stored as the ISO form.
//
// What is NOT accepted is anything where a reader has to guess: 01/02/2020
// is 1 February to a Swede and 2 January to an American, and 2020509 could
// be May 9 or 5 September. Refusing those with a message beats picking one.

/** The forms a holder may type: `YYYY-MM-DD`, `YYYYMMDD`, and the dashed
 *  form with an unpadded month or day (`2020-5-9`). The last is unambiguous
 *  only BECAUSE of the dashes and the four-digit year in front: the
 *  separators fix where each part ends. Digits alone are accepted only as
 *  exactly eight, where every position is fixed. */
const TYPED_DASHED = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TYPED_DIGITS = /^(\d{4})(\d{2})(\d{2})$/;

export type CalendarDateInput =
  | { readonly kind: "empty" }
  | { readonly kind: "valid"; readonly iso: string }
  /** `shape`: not one of the accepted forms. `impossible`: well-formed, but
   *  no such day (month 13, 30 February, a year outside the window). */
  | { readonly kind: "invalid"; readonly reason: "shape" | "impossible" };

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Read what a holder typed into a date field, and say what it is.
 *
 * Pure string and calendar arithmetic — `2020-01-01` and `2020-12-31` come
 * back exactly as they went in, regardless of the machine's timezone.
 */
export function normaliseCalendarDateInput(raw: string): CalendarDateInput {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  const m = TYPED_DASHED.exec(text) ?? TYPED_DIGITS.exec(text);
  if (!m) return { kind: "invalid", reason: "shape" };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isRealDay(year, month, day)) return { kind: "invalid", reason: "impossible" };
  return { kind: "valid", iso: `${year}-${pad2(month)}-${pad2(day)}` };
}

/** The ISO form of what was typed, or the input untouched when it is not
 *  (yet) a date. Used to compare two dates that may have been written
 *  differently, and to store a draft in one form. */
export function toIsoDateOrRaw(raw: string): string {
  const read = normaliseCalendarDateInput(raw);
  return read.kind === "valid" ? read.iso : raw;
}

/**
 * Whether `later` is strictly after `earlier`. Both must be real dates in
 * either typed form; anything else is "no".
 *
 * Strict, to match the database: `sp_save_international_credential` refuses
 * `valid_until <= issued_on` (SP_INVALID_DATES). A credential that expires
 * the day it was issued was never valid, and the client must say so before
 * the database does.
 */
export function isStrictlyAfter(later: string, earlier: string): boolean {
  const a = normaliseCalendarDateInput(later);
  const b = normaliseCalendarDateInput(earlier);
  return a.kind === "valid" && b.kind === "valid" && a.iso > b.iso;
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

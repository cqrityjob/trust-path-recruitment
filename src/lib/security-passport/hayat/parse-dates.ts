// HAYAT — reading a date off a document without guessing.
//
// The one rule: a date is either unambiguous or it is not offered as a fact.
// "03/04/2026" is the third of April in Stockholm and the fourth of March in
// Houston, and nothing on the page says which. HAYAT returns BOTH and the
// holder picks; it never picks for them. A two-digit year, a month without a
// day, and an OCR'd "2O26" are not dates at all and come back as nothing.

import { isCalendarDate } from "../dates";

export type DateReading =
  | { readonly kind: "exact"; readonly iso: string; readonly index: number }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[]; readonly index: number };

const MONTHS: Readonly<Record<string, number>> = {
  // English
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
  // Swedish (those that differ)
  januari: 1, februari: 2, mars: 3, maj: 5, juni: 6, juli: 7, augusti: 8,
  oktober: 10, okt: 10,
}; // prettier-ignore

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number): string | null => {
  const value = `${y}-${pad(m)}-${pad(d)}`;
  return isCalendarDate(value) ? value : null;
};

const ISO_SHAPE = /(?<!\d)(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?!\d)/;
const DAY_MONTH_YEAR =
  /(?<!\d)(\d{1,2})(?:st|nd|rd|th|:[ae])?\.?\s+(?:of\s+)?([a-zåäö]{3,9})\.?,?\s+(\d{4})(?!\d)/;
const MONTH_DAY_YEAR = /(?<![a-zåäö])([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/;
const NUMERIC = /(?<!\d)(\d{1,2})([./-])(\d{1,2})\2(\d{4})(?!\d)/;
// "03-Apr-2023", "3/APR/2023", "03 Apr, 2023" — the compact day-month-year that
// Indian certificates print. The month is a word, so it is never ambiguous.
const DAY_MON_YEAR_COMPACT = /(?<!\d)(\d{1,2})([-/])([a-z]{3,9})\.?\2(\d{4})(?!\d)/;

/** Every date in `text`, left to right. Never throws, never guesses. */
export function readDates(text: string): DateReading[] {
  const found: DateReading[] = [];
  let offset = 0;
  let rest = text.toLocaleLowerCase();
  // Bounded: a line is at most a few hundred characters.
  for (let guard = 0; guard < 8 && rest.length > 0; guard += 1) {
    const next = firstDate(rest);
    if (!next) break;
    found.push({ ...next.reading, index: offset + next.reading.index });
    offset += next.end;
    rest = rest.slice(next.end);
  }
  return found;
}

export function readFirstDate(text: string): DateReading | null {
  return readDates(text)[0] ?? null;
}

function firstDate(text: string): { reading: DateReading; end: number } | null {
  const hits: { reading: DateReading; end: number }[] = [];

  const isoMatch = ISO_SHAPE.exec(text);
  if (isoMatch) {
    const value = iso(Number(isoMatch[1]), Number(isoMatch[3]), Number(isoMatch[4]));
    if (value)
      hits.push({
        reading: { kind: "exact", iso: value, index: isoMatch.index },
        end: isoMatch.index + isoMatch[0].length,
      });
  }

  const dmy = DAY_MONTH_YEAR.exec(text);
  if (dmy && MONTHS[dmy[2]]) {
    const value = iso(Number(dmy[3]), MONTHS[dmy[2]], Number(dmy[1]));
    if (value)
      hits.push({
        reading: { kind: "exact", iso: value, index: dmy.index },
        end: dmy.index + dmy[0].length,
      });
  }

  const compact = DAY_MON_YEAR_COMPACT.exec(text);
  if (compact && MONTHS[compact[3]]) {
    const value = iso(Number(compact[4]), MONTHS[compact[3]], Number(compact[1]));
    if (value)
      hits.push({
        reading: { kind: "exact", iso: value, index: compact.index },
        end: compact.index + compact[0].length,
      });
  }

  const mdy = MONTH_DAY_YEAR.exec(text);
  if (mdy && MONTHS[mdy[1]]) {
    const value = iso(Number(mdy[3]), MONTHS[mdy[1]], Number(mdy[2]));
    if (value)
      hits.push({
        reading: { kind: "exact", iso: value, index: mdy.index },
        end: mdy.index + mdy[0].length,
      });
  }

  const numeric = NUMERIC.exec(text);
  if (numeric) {
    const reading = numericDate(
      Number(numeric[1]),
      numeric[2],
      Number(numeric[3]),
      Number(numeric[4]),
      numeric.index,
    );
    if (reading) hits.push({ reading, end: numeric.index + numeric[0].length });
  }

  if (hits.length === 0) return null;
  return hits.reduce((a, b) => (b.reading.index < a.reading.index ? b : a));
}

function numericDate(
  first: number,
  separator: string,
  second: number,
  year: number,
  index: number,
): DateReading | null {
  const dayFirst = iso(year, second, first);
  const monthFirst = iso(year, first, second);
  // A dotted date is day-first wherever dotted dates are written at all.
  if (separator === ".") return dayFirst ? { kind: "exact", iso: dayFirst, index } : null;
  if (dayFirst && monthFirst && dayFirst !== monthFirst)
    return { kind: "ambiguous", candidates: [dayFirst, monthFirst], index };
  const only = dayFirst ?? monthFirst;
  return only ? { kind: "exact", iso: only, index } : null;
}

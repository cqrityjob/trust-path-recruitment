// Security Passport — display formatting. Pure, and domain-local so the
// Passport tree stays free of cross-domain imports.
//
// ── DATES ARE ISO IN BOTH LANGUAGES, ON PURPOSE ────────────────────────
//
// `YYYY-MM-DD` is the everyday Swedish convention, and for a credential
// that may be read outside its country of origin it is the one format no
// reader can misparse. A localised "05/01/2024" is genuinely ambiguous
// between two continents, and a licence expiry is the wrong place to be
// ambiguous. So both languages get the same unambiguous form.

import { toDuration } from "./experience";
import { passportT, type PassportLang } from "./i18n";
import type { IsoDate } from "./types";

/** An absent EXPIRY genuinely means "no expiry" — a permanent qualification.
 *  An absent ISSUE date means only that it was not recorded. Rendering both
 *  with the same fallback printed "Utfärdat: Ingen giltighetstid" on a claim
 *  with no issue date, which is not merely odd but wrong. */
export function formatExpiry(date: IsoDate | null, lang: PassportLang): string {
  if (!date) return passportT("claims.noExpiry", lang);
  return date;
}

export function formatDate(date: IsoDate | null, lang: PassportLang): string {
  if (!date) return passportT("common.notStated", lang);
  return date;
}

/** Days → "2 år 4 månader" / "2 years 4 months".
 *
 *  Anything above zero but below a month is reported as such rather than as
 *  "0 years 0 months", which would read as nothing at all — the honest
 *  wording matters most exactly when someone is days short of a threshold. */
export function formatDuration(days: number, lang: PassportLang): string {
  if (days <= 0) return passportT("duration.zero", lang);

  const { years, months } = toDuration(days);
  if (years === 0 && months === 0) {
    return passportT("recognition.remainingLessThanMonth", lang);
  }

  const parts: string[] = [];
  if (years > 0) {
    parts.push(`${years} ${passportT(years === 1 ? "duration.year" : "duration.years", lang)}`);
  }
  if (months > 0) {
    parts.push(`${months} ${passportT(months === 1 ? "duration.month" : "duration.months", lang)}`);
  }
  return parts.join(" ");
}

/** "A", "A och B", "A, B och C" — and the English equivalent.
 *
 *  Joining every element with "och" produced "Nordvakt AB och Datacenter Syd
 *  AB och Nordic Security Institute" on the Passport Card, which is wrong in
 *  both languages. Attribution is the part of a credential a reader scans
 *  hardest, so it should not read as broken. */
export function formatNameList(names: readonly string[], lang: PassportLang): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  const conjunction = passportT("common.and", lang);
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

/** "2021-03-01 – 2024-03-01" or "2022-06-01 – nu" for an open period. */
export function formatPeriodRange(
  startedOn: IsoDate,
  endedOn: IsoDate | null,
  lang: PassportLang,
): string {
  const end = endedOn ?? passportT("common.present", lang);
  return `${startedOn} – ${end}`;
}

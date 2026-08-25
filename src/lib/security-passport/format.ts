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

/**
 * A jurisdiction or sub-jurisdiction code → the name a reader recognises.
 *
 * ── WHY THIS IS A FUNCTION AND NOT A TERNARY ───────────────────────────
 *
 * It was a ternary. `code === "SE" ? pt("jurisdiction.SE") : code`, written
 * out five times — PassportCard, PassportOverview, RecipientVerification,
 * ClaimRow and SocialFrame — and omitted entirely by the two paths that
 * EXPORT: `renderShareImage` and the LinkedIn section both interpolated the
 * raw code.
 *
 * So the social frame on screen said "Sverige" and the PNG rendered from the
 * same model said "SE": one artefact, two strings, and the divergent one is
 * the copy that leaves the product and cannot be corrected afterwards.
 *
 * A ternary per surface also meant every market after Sweden printed as a bare
 * code by construction. GB and AE-DU are authored and inactive today, so no
 * holder can reach them yet — but the surfaces would have been ready to print
 * "AE" over a Dubai credential, which is the UAE-wide reading the market pack
 * exists to refuse.
 *
 * ── THE FALLBACK IS THE CODE, DELIBERATELY ─────────────────────────────
 *
 * An unknown code returns itself rather than a guess or an empty string. A
 * jurisdiction is a legal claim about where something applies; inventing a
 * name for a code nobody has reviewed would be exactly the kind of invention
 * this module exists to prevent. A visible "XX" is a bug report. A plausible
 * wrong country is not.
 */
export function formatJurisdiction(code: string | null, lang: PassportLang): string {
  if (!code) return passportT("common.notStated", lang);
  switch (code) {
    case "SE":
      return passportT("jurisdiction.SE", lang);
    case "GB":
      return passportT("jurisdiction.GB", lang);
    case "AE":
      return passportT("jurisdiction.AE", lang);
    case "AE-DU":
      return passportT("jurisdiction.AE-DU", lang);
    default:
      return code;
  }
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

/**
 * Where a holder WORKS, as one reader-facing phrase.
 *
 * A country alone is not always the truth. SIRA licenses Dubai and not the
 * United Arab Emirates, so a Dubai holder rendered as "United Arab Emirates"
 * has been widened into a claim the market pack exists to refuse — and one
 * rendered as "Sweden", which is what the old `DEFAULT 'SE'` produced, is
 * simply false.
 *
 * So the emirate leads and the country follows: "Dubai, Förenade
 * Arabemiraten". Both are named, because a reader outside the Gulf may not
 * place Dubai and a reader inside it must not be told the licence is national.
 *
 * Falls back to the country when there is no sub-jurisdiction, and to
 * "not stated" when there is no country — never to a guess.
 */
export function formatWorkLocation(
  jurisdictionCode: string | null,
  subJurisdictionCode: string | null,
  lang: PassportLang,
): string {
  if (!jurisdictionCode) return passportT("common.notStated", lang);
  const country = formatJurisdiction(jurisdictionCode, lang);
  if (!subJurisdictionCode) return country;
  const sub = formatJurisdiction(subJurisdictionCode, lang);
  // An unmapped sub-jurisdiction returns its own code from formatJurisdiction.
  // Printing "AE-SH, Förenade Arabemiraten" is a bug report; printing the
  // country alone would hide it. The code shows, deliberately.
  return sub === country ? country : `${sub}, ${country}`;
}

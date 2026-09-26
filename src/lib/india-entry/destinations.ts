// Where somebody lives, and where they would like to work — the vocabularies.
//
// Both mirror 20261215090000 exactly and scripts/india-entry-check.ts pins the
// mirror, so the form can never offer a value the database refuses.
//
// Kept apart from each other and from everything the Passport knows:
//
//   residence            candidate_current_location   (the Profile)
//   desired destinations candidate_job_preferences    (job preferences)
//   work country         sp_passport_profiles         (unchanged, Passport)
//   credential territory sp_claims / the definition   (never touched here)
//
// Nothing in this module reads or writes a credential, a market pack or a
// work country, and there is no nationality or immigration vocabulary at all.

import type { IndiaCopyKey } from "./copy";

/** The closed destination vocabulary. Order is the display order. */
export const DESTINATIONS = ["AE-DU", "IN", "GB", "AE", "SE"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const DESTINATION_LABEL_KEY: Record<Destination, IndiaCopyKey> = {
  "AE-DU": "dest.AE-DU",
  IN: "dest.IN",
  GB: "dest.GB",
  AE: "dest.AE",
  SE: "dest.SE",
};

export function isDestination(value: string): value is Destination {
  return (DESTINATIONS as readonly string[]).includes(value);
}

export const RELOCATION_INTEREST = ["not_looking", "open", "actively_looking"] as const;
export type RelocationInterest = (typeof RELOCATION_INTEREST)[number];

/** Countries listed first in the residence select: the journey's own
 *  audience, then the Gulf and the product's other markets. Every other
 *  ISO 3166-1 alpha-2 country follows, alphabetically by localised name. */
export const RESIDENCE_FIRST = [
  "IN",
  "AE",
  "SA",
  "QA",
  "OM",
  "KW",
  "BH",
  "NP",
  "GB",
  "SE",
] as const;

/** ISO 3166-1 alpha-2, officially assigned codes. */
export const ISO_COUNTRIES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

export function isResidenceCountry(value: string): boolean {
  return (ISO_COUNTRIES as readonly string[]).includes(value);
}

/** The country's name in the reader's language, from the platform. Falls back
 *  to the code itself — never to a guessed name. */
export function countryName(code: string, lang: "en" | "sv"): string {
  try {
    const names = new Intl.DisplayNames([lang === "sv" ? "sv" : "en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The residence options: the first group, then the rest by name. */
export function residenceOptions(lang: "en" | "sv"): readonly { code: string; name: string }[] {
  const first = RESIDENCE_FIRST.map((code) => ({ code, name: countryName(code, lang) }));
  const firstSet = new Set<string>(RESIDENCE_FIRST);
  const rest = ISO_COUNTRIES.filter((c) => !firstSet.has(c))
    .map((code) => ({ code, name: countryName(code, lang) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  return [...first, ...rest];
}

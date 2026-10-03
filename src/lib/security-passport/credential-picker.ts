// Security Passport — how the credential picker NAMES things.
//
// Pure presentation. Nothing here decides what a holder may select (the
// approved catalogue view does), what a definition is (the governed tables do)
// or whether a credential is true (only a verification does). It turns governed
// fields into the words a holder reads beside a result, and it keeps every
// controlled vocabulary in ONE place with a neutral fallback, so a value the
// database knows and this build does not is shown generically instead of
// raw or not at all.
//
// ── THE DISTINCTIONS THE WORDING KEEPS ─────────────────────────────────
//
//   * The AWARDING ORGANISATION is the organisation beside the name. A training
//     provider or a regulator is never written as the awarding organisation.
//   * A professional CERTIFICATION, a professional QUALIFICATION, a
//     DESIGNATION, an ASSESSED subject certificate and a COURSE certificate are
//     five different things and are labelled as five, never as "certification".
//   * "International" says the definition is not tied to a country. It does not
//     say the holder may work anywhere: a work permission is never implied.
//   * Selecting a definition describes a credential. It verifies nobody.

import type { InternationalCredentialInput } from "./international.functions";
import { credentialClassLabel } from "./international";

export type PickerLang = "sv" | "en";

const GLOBAL_SCOPE = "global_professional";

export interface HeadlineInput {
  readonly name_sv: string;
  readonly name_en: string;
  readonly abbreviation: string | null;
  readonly scope_code: string | null;
}

export interface Headline {
  /** The governed abbreviation, or null: none is invented from the title. */
  readonly abbreviation: string | null;
  /** The full name, without a repeated "(ABBR)" suffix. */
  readonly name: string;
  /** "CPP — Certified Protection Professional", or the name alone. */
  readonly text: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Certified Protection Professional (CPP)" → "Certified Protection Professional". */
export function stripTrailingAbbreviation(name: string, abbreviation: string | null): string {
  const clean = name.trim();
  if (!abbreviation) return clean;
  const stripped = clean
    .replace(new RegExp(`\\s*\\(\\s*${escapeRegExp(abbreviation.trim())}\\s*\\)\\s*$`, "i"), "")
    .trim();
  // A name that IS the abbreviation keeps itself rather than becoming empty.
  return stripped || clean;
}

/**
 * The line a holder recognises a certification by: "CPP — Certified Protection
 * Professional". The abbreviation leads only for an INTERNATIONAL certification,
 * where it is the handle people use; a national licence or card keeps its own
 * name, because its short code ("SCG") is an internal label, not a name anyone
 * says. Never an abbreviation the catalogue does not hold.
 */
export function headlineOf(d: HeadlineInput, lang: PickerLang): Headline {
  const named = lang === "sv" ? d.name_sv || d.name_en : d.name_en || d.name_sv;
  const abbreviation = d.abbreviation?.trim() || null;
  const international = d.scope_code === GLOBAL_SCOPE;
  const name = international ? stripTrailingAbbreviation(named, abbreviation) : named.trim();
  const leads =
    international &&
    abbreviation !== null &&
    name.toLocaleLowerCase() !== abbreviation.toLocaleLowerCase() &&
    !name.toLocaleLowerCase().startsWith(`${abbreviation.toLocaleLowerCase()} `);
  return { abbreviation, name, text: leads ? `${abbreviation} — ${name}` : name };
}

/**
 * "International certification" and its siblings, with the right gender in
 * Swedish. A class this build does not know falls back to the generic
 * "International credential" — shown, never raw, never an error.
 */
const INTERNATIONAL_KIND: Readonly<Record<string, { sv: string; en: string }>> = {
  certification: { sv: "Internationell certifiering", en: "International certification" },
  professional_qualification: {
    sv: "Internationell professionell kvalifikation",
    en: "International professional qualification",
  },
  professional_designation: {
    sv: "Internationell professionell beteckning",
    en: "International professional designation",
  },
  assessed_certificate: {
    sv: "Internationellt examinerat ämnesintyg",
    en: "International assessed subject certificate",
  },
  course_certificate: { sv: "Internationellt kursintyg", en: "International course certificate" },
};
const INTERNATIONAL_FALLBACK = { sv: "Internationell merit", en: "International credential" };

export interface BylineInput {
  readonly scope_code: string | null;
  readonly credential_class: string;
  readonly country: string | null;
  readonly region: string | null;
  /** The governed awarding organisation, or null where it is stated on the document. */
  readonly issuer_name: string | null;
  /** The governed regulator, shown as a regulator and never as the issuer. */
  readonly regulator?: string | null;
}

const REGULATOR_WORD = { sv: "Tillsynsmyndighet", en: "Regulator" } as const;
const ISSUER_ON_DOCUMENT = {
  sv: "Utfärdare anges på intyget",
  en: "Issuer stated on the certificate",
} as const;

/** The kind of award and where it belongs: "International certification". */
export function kindLabel(
  d: Pick<BylineInput, "scope_code" | "credential_class" | "country" | "region">,
  lang: PickerLang,
  placeName: (code: string | null) => string = (code) => code ?? "",
): string {
  if (d.scope_code === GLOBAL_SCOPE)
    return (INTERNATIONAL_KIND[d.credential_class] ?? INTERNATIONAL_FALLBACK)[lang];
  const place = placeName(d.region ?? d.country);
  const kind = credentialClassLabel(d.credential_class, lang);
  return place ? `${kind} · ${place}` : kind;
}

/** "ASIS International · International certification". */
export function bylineOf(
  d: BylineInput,
  lang: PickerLang,
  placeName: (code: string | null) => string = (code) => code ?? "",
): string {
  const organisation = d.issuer_name
    ? d.issuer_name
    : d.regulator
      ? `${REGULATOR_WORD[lang]}: ${d.regulator}`
      : ISSUER_ON_DOCUMENT[lang];
  return `${organisation} · ${kindLabel(d, lang, placeName)}`;
}

/**
 * What the programme's maintenance looks like, as the issuer publishes it. A
 * LABEL: it never produces a date, and a programme that publishes nothing is
 * never described as one that does not expire.
 */
export function maintenanceLabel(
  policy: string | null | undefined,
  months: number | null | undefined,
  lang: PickerLang,
): string | null {
  const say = (sv: string, en: string) => (lang === "sv" ? sv : en);
  switch (policy) {
    case "recertification_cycle":
      return months
        ? say(`Förnyas var ${months}:e månad`, `Renewed every ${months} months`)
        : say("Förnyas i en fast cykel", "Renewed on a fixed cycle");
    case "cycle_plus_annual_maintenance":
      return say(
        "Förnyelsecykel plus årlig skyldighet",
        "A renewal cycle plus an annual obligation",
      );
    case "annual_compliance":
      return say("Årlig skyldighet, ingen fast cykel", "An annual obligation, no fixed cycle");
    case "none_published":
      return say(
        "Utfärdaren har inte publicerat någon förnyelseregel",
        "The issuer has published no renewal rule",
      );
    case "not_assessed":
      return say(
        "Förnyelse har inte bedömts i katalogen",
        "Renewal has not been assessed in the catalogue",
      );
    default:
      return null;
  }
}

/** The three scope filters, named for a holder who may not know the difference yet. */
export const SCOPE_FILTERS = [
  { value: "all", sv: "Alla", en: "All" },
  { value: "international", sv: "Internationella", en: "International" },
  { value: "national", sv: "Nationella eller regionala", en: "National or regional" },
] as const;

/** Why a certification the holder searched for is not selectable yet. */
export const UNAVAILABLE_REASONS = {
  awaiting_source_check: {
    sv: "Väntar på kontroll mot utfärdarens egen sida",
    en: "Awaiting a check against the issuer's own page",
  },
  awaiting_name_check: {
    sv: "Väntar på att den exakta titeln bekräftas",
    en: "Awaiting confirmation of the exact title",
  },
  awaiting_issuer_check: {
    sv: "Väntar på att utfärdande organisation bekräftas",
    en: "Awaiting confirmation of the awarding organisation",
  },
  awaiting_kind_check: {
    sv: "Väntar på att det bekräftas vilken sorts intyg det är",
    en: "Awaiting confirmation of what kind of credential it is",
  },
  retired_for_new_candidates: {
    sv: "Erbjuds inte längre för ny registrering",
    en: "No longer offered for new registrations",
  },
  not_offered: {
    sv: "Ingår inte i katalogen",
    en: "Not part of the catalogue",
  },
} as const satisfies Record<string, { sv: string; en: string }>;

const UNAVAILABLE_FALLBACK = {
  sv: "Inte tillgänglig för registrering ännu",
  en: "Not available for registration yet",
} as const;

export function unavailableReasonLabel(reason: string | null, lang: PickerLang): string {
  const known = reason
    ? (UNAVAILABLE_REASONS as Record<string, { sv: string; en: string }>)[reason]
    : null;
  return (known ?? UNAVAILABLE_FALLBACK)[lang];
}

/** What the "not available yet" group tells the holder it means. */
export const UNAVAILABLE_EXPLANATION = {
  sv: "Vi känner till de här, men de är inte godkända i katalogen ännu, så de går inte att registrera. Det betyder inte att certifieringen är ogiltig.",
  en: "We know of these, but they are not approved in the catalogue yet, so they cannot be registered. That does not mean the certification is not valid.",
} as const;

// ── The "Cannot find your certification?" request ─────────────────────

export const REQUEST_LIMITS = {
  nameMin: 3,
  nameMax: 160,
  issuerMin: 2,
  issuerMax: 160,
  abbreviationMax: 24,
  urlMax: 500,
  noteMax: 600,
} as const;

export interface CatalogueRequestDraft {
  readonly requested_name: string;
  readonly requested_issuer: string;
  readonly requested_abbreviation: string;
  readonly source_url: string;
  readonly note: string;
}

export const EMPTY_REQUEST: CatalogueRequestDraft = {
  requested_name: "",
  requested_issuer: "",
  requested_abbreviation: "",
  source_url: "",
  note: "",
};

export type RequestField = keyof CatalogueRequestDraft;

/**
 * The same limits the database enforces, said in the holder's words BEFORE the
 * request is sent. The database stays the authority: this only saves a round
 * trip and names the field.
 */
export function validateCatalogueRequest(
  draft: CatalogueRequestDraft,
  lang: PickerLang,
): { readonly field: RequestField; readonly message: string } | null {
  const say = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const name = draft.requested_name.trim();
  const issuer = draft.requested_issuer.trim();
  const url = draft.source_url.trim();
  if (name.length < REQUEST_LIMITS.nameMin || name.length > REQUEST_LIMITS.nameMax)
    return {
      field: "requested_name",
      message: say(
        `Ange certifieringens namn (${REQUEST_LIMITS.nameMin}–${REQUEST_LIMITS.nameMax} tecken).`,
        `Enter the certification's name (${REQUEST_LIMITS.nameMin}–${REQUEST_LIMITS.nameMax} characters).`,
      ),
    };
  if (issuer.length < REQUEST_LIMITS.issuerMin || issuer.length > REQUEST_LIMITS.issuerMax)
    return {
      field: "requested_issuer",
      message: say(
        "Ange organisationen som utfärdar certifieringen.",
        "Enter the organisation that awards the certification.",
      ),
    };
  if (draft.requested_abbreviation.trim().length > REQUEST_LIMITS.abbreviationMax)
    return {
      field: "requested_abbreviation",
      message: say(
        `Förkortningen får vara högst ${REQUEST_LIMITS.abbreviationMax} tecken.`,
        `The abbreviation can be at most ${REQUEST_LIMITS.abbreviationMax} characters.`,
      ),
    };
  if (url && (!/^https:\/\/\S+$/.test(url) || url.length > REQUEST_LIMITS.urlMax))
    return {
      field: "source_url",
      message: say(
        "Länken måste börja med https:// och får inte innehålla mellanslag.",
        "The link must start with https:// and contain no spaces.",
      ),
    };
  if (draft.note.length > REQUEST_LIMITS.noteMax)
    return {
      field: "note",
      message: say(
        `Anteckningen får vara högst ${REQUEST_LIMITS.noteMax} tecken.`,
        `The note can be at most ${REQUEST_LIMITS.noteMax} characters.`,
      ),
    };
  return null;
}

/** The refusals the request RPC raises that a holder can act on. */
export function requestErrorMessage(code: string, lang: PickerLang): string {
  const say = (sv: string, en: string) => (lang === "sv" ? sv : en);
  if (code.includes("SP_REQUEST_DUPLICATE"))
    return say(
      "Du har redan en öppen förfrågan för den här certifieringen.",
      "You already have an open request for this certification.",
    );
  if (code.includes("SP_REQUEST_LIMIT"))
    return say(
      "Du har redan tio öppna förfrågningar. Vänta tills någon har besvarats.",
      "You already have ten open requests. Wait until one has been answered.",
    );
  if (code.includes("SP_NO_PASSPORT"))
    return say(
      "Skapa ditt Passport först, så kan du skicka en förfrågan.",
      "Create your Passport first, then you can send a request.",
    );
  if (code.includes("SP_REQUEST_URL_INVALID"))
    return say("Länken måste börja med https://.", "The link must start with https://.");
  return say(
    "Förfrågan kunde inte skickas. Det du skrev finns kvar — försök igen.",
    "The request could not be sent. What you wrote is still here — try again.",
  );
}

export const REQUEST_STATUS_LABELS = {
  open: { sv: "Väntar på granskning", en: "Awaiting review" },
  answered_existing: { sv: "Finns redan i katalogen", en: "Already in the catalogue" },
  in_research: { sv: "Under utredning", en: "Being researched" },
  declined: { sv: "Inte aktuell för katalogen", en: "Not taken into the catalogue" },
} as const satisfies Record<string, { sv: string; en: string }>;

export function requestStatusLabel(status: string, lang: PickerLang): string {
  const known = (REQUEST_STATUS_LABELS as Record<string, { sv: string; en: string }>)[status];
  return (known ?? { sv: "Skickad", en: "Sent" })[lang];
}

// ── Choosing a different credential ──────────────────────────────────

/**
 * The draft after the holder picks another credential (or none).
 *
 * What DEPENDS on which credential it is goes: the issuer named on the document,
 * the authorisation scope, the stated version, a no-expiry choice the new
 * definition does not allow. What does not depend on it stays, because it is the
 * holder's own and still true: the identifier and the two dates. `blank` supplies
 * every other field's empty value, so a field added later is cleared by default
 * rather than carried across by accident.
 */
export function draftAfterDefinitionChange(
  current: InternationalCredentialInput,
  blank: InternationalCredentialInput,
  code: string,
  next: { readonly allows_no_expiry: boolean; readonly requires_valid_until: boolean } | undefined,
): InternationalCredentialInput {
  const keepsNoExpiry =
    current.no_expiry === true && !!next?.allows_no_expiry && !next.requires_valid_until;
  return {
    ...blank,
    definition_code: code,
    identifier: current.identifier,
    issued_on: current.issued_on,
    valid_until: current.no_expiry === true ? "" : current.valid_until,
    no_expiry: keepsNoExpiry ? true : null,
  };
}

// Security Passport — the words an administrator reads on the research queue.
//
// One place for every controlled vocabulary of the research tables, each with a
// neutral fallback: a value the database has and this build does not (a later
// snapshot, a new kind) is shown generically, never as a raw code and never as
// an error that takes the page down.
//
// Nothing here is read by a holder, and nothing here decides anything.

export type Lang = "sv" | "en";
type Words = { readonly sv: string; readonly en: string };

const lookup = (table: Readonly<Record<string, Words>>, key: string | null, fallback: Words) =>
  (key ? table[key] : undefined) ?? fallback;

/** What the reconciliation did with a researched record. */
export const RESEARCH_OUTCOME = {
  matched_existing: {
    sv: "Matchad mot befintlig definition",
    en: "Matched to an existing definition",
  },
  added_approved: { sv: "Tillagd som godkänd definition", en: "Added as an approved definition" },
  retained_for_review: { sv: "Behållen för granskning", en: "Retained for review" },
  excluded: { sv: "Utesluten", en: "Excluded" },
  unreconciled: { sv: "Inte avstämd", en: "Not reconciled yet" },
} as const satisfies Record<string, Words>;
export const researchOutcomeLabel = (value: string | null, lang: Lang): string =>
  lookup(RESEARCH_OUTCOME, value, { sv: "Okänt utfall", en: "Unknown outcome" })[lang];

/** The credential kinds the research distinguishes, and which the brief keeps apart. */
export const RESEARCH_KIND = {
  person_certification: { sv: "Personcertifiering", en: "Professional certification" },
  professional_qualification: {
    sv: "Professionell kvalifikation",
    en: "Professional qualification",
  },
  designation: { sv: "Professionell beteckning", en: "Professional designation" },
  assessed_certificate: { sv: "Examinerat ämnesintyg", en: "Assessed subject certificate" },
  course_certificate: { sv: "Kursintyg", en: "Course certificate" },
} as const satisfies Record<string, Words>;
export const researchKindLabel = (value: string | null, lang: Lang): string =>
  lookup(RESEARCH_KIND, value, { sv: "Annan sorts intyg", en: "Other kind of credential" })[lang];

export const RESEARCH_AREA = {
  cyber: { sv: "Cyber", en: "Cyber" },
  risk: { sv: "Risk", en: "Risk" },
  physical: { sv: "Fysisk säkerhet", en: "Physical security" },
  resilience: { sv: "Resiliens", en: "Resilience" },
  insurance: { sv: "Försäkring", en: "Insurance" },
} as const satisfies Record<string, Words>;
export const researchAreaLabel = (value: string | null, lang: Lang): string =>
  lookup(RESEARCH_AREA, value, { sv: "Annat område", en: "Other area" })[lang];

export const EVIDENCE_LEVEL = {
  official_page: { sv: "Utfärdarens egen sida", en: "The issuer's own page" },
  issuer_badge_page: { sv: "Utfärdarens märkessida", en: "The issuer's badge page" },
  official_search_excerpt: {
    sv: "Utdrag ur sökindex — ej öppnad sida",
    en: "Search-index excerpt — page not opened",
  },
} as const satisfies Record<string, Words>;
export const evidenceLevelLabel = (value: string | null, lang: Lang): string =>
  lookup(EVIDENCE_LEVEL, value, { sv: "Okänd bevisnivå", en: "Unknown evidence level" })[lang];

export const RESEARCH_DECISION = {
  pending: { sv: "Väntar på beslut", en: "Awaiting a decision" },
  approved: { sv: "Godkänd i forskningen", en: "Approved by the research" },
  needs_information: { sv: "Behöver mer underlag", en: "Needs more information" },
  excluded: { sv: "Utesluten", en: "Excluded" },
} as const satisfies Record<string, Words>;
export const researchDecisionLabel = (value: string | null, lang: Lang): string =>
  lookup(RESEARCH_DECISION, value, { sv: "Okänt beslut", en: "Unknown decision" })[lang];

export const RESEARCH_SCOPE = {
  international: { sv: "internationell", en: "international" },
  regional: { sv: "regional", en: "regional" },
  national: { sv: "nationell", en: "national" },
} as const satisfies Record<string, Words>;
export const researchScopeLabel = (value: string | null, lang: Lang): string =>
  lookup(RESEARCH_SCOPE, value, { sv: "okänd", en: "unknown" })[lang];

export const REQUEST_STATUS_ADMIN = {
  open: { sv: "Öppen", en: "Open" },
  answered_existing: { sv: "Besvarad: finns redan", en: "Answered: already exists" },
  in_research: { sv: "Under utredning", en: "In research" },
  declined: { sv: "Avböjd", en: "Declined" },
} as const satisfies Record<string, Words>;
export const requestStatusAdminLabel = (value: string | null, lang: Lang): string =>
  lookup(REQUEST_STATUS_ADMIN, value, { sv: "Okänd status", en: "Unknown status" })[lang];

/** The one sentence every research surface carries. */
export const APPROVAL_IS_A_MIGRATION: Words = {
  sv: "Att en forskningspost godkänns och att en definition publiceras är två olika beslut, och ingen av dem verifierar en innehavare. Godkännande och publicering sker genom granskad migration — inte här. Här kan en post bara sättas till väntar, behöver mer underlag eller utesluten, med en motivering.",
  en: "A research record being approved and a definition being published are two different decisions, and neither verifies a holder. Approval and publication are reviewed migrations — not made here. Here a record can only be set to awaiting, needs information or excluded, with a reason.",
};

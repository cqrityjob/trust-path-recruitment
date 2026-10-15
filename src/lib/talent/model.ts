// Talent discovery -- the shapes the database returns and the pure rules the
// interface uses to explain them. No I/O here; scripts/talent-discovery-check
// tests every rule.
//
// The contract is docs/passport/talent-discovery/talent-search-contract.md.
// Two rules from it shape this file:
//
//   * "not shared" is never "missing". The words the recruiter reads for a
//     requirement come from `requirementStateKey` and there is no key that
//     says a person lacks something.
//   * an administrator's approval is a DOCUMENT review. `levelKey` has no
//     wording that says the issuer confirmed anything unless the database
//     says `source_confirmed`, which no path can produce today.

export type Visibility = "private" | "open" | "active";
export type RequirementClass =
  | "education"
  | "certification"
  | "regulated_authorisation"
  | "experience"
  | "unbound";
export type EntryLevel =
  | "self_declared"
  | "document_provided"
  | "document_reviewed"
  | "employer_confirmed"
  | "source_confirmed";
export type Validity = "valid" | "expiring_soon" | "expired" | "no_expiry" | "not_stated";
export type RequirementState = "evidenced" | "needs_clarification" | "not_shared" | "to_clarify";
export type PreferenceState = "match" | "differs" | "not_stated";

export const CONSENT_TEXT_VERSION = "talent-v1";

export interface TalentMerit {
  readonly code: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly abbreviation: string | null;
  readonly requirementClass: Exclude<RequirementClass, "experience" | "unbound">;
  readonly jurisdiction: string | null;
  readonly subJurisdiction: string | null;
  readonly validityJurisdiction: string | null;
  readonly issuedYear: number | null;
  readonly validUntil: string | null;
  readonly validity: Validity;
  readonly validityRequired?: boolean;
  readonly level: EntryLevel;
  readonly hasScopeLimitation: boolean;
}

export interface TalentExperience {
  readonly roleTitle: string;
  readonly securityRelevance: "primary" | "partial" | "none";
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly months: number;
  readonly level: EntryLevel;
}

export interface TalentPreferences {
  readonly areas: readonly string[];
  readonly countries: readonly string[];
  readonly cities: readonly string[];
  readonly employmentTypes: readonly string[];
  readonly workplaceTypes: readonly string[];
  readonly availableFrom: string | null;
}

export interface TalentCard {
  readonly visibility: Visibility;
  readonly preferences: TalentPreferences;
  readonly merits: readonly TalentMerit[];
  readonly experience: readonly TalentExperience[];
  readonly totalSecurityMonths: number;
}

export interface CriterionEvaluation {
  readonly requirementId: string;
  readonly kind: "mandatory" | "desirable";
  readonly labelSv: string | null;
  readonly labelEn: string | null;
  readonly requirementClass: RequirementClass;
  readonly state: RequirementState;
  readonly reasons: readonly string[];
  readonly evidence: (Partial<TalentMerit> & { months?: number; level?: string }) | null;
}

export interface Evaluation {
  readonly relevant: boolean;
  readonly criteria: readonly CriterionEvaluation[];
  readonly summary: {
    readonly mandatoryTotal: number;
    readonly mandatoryEvidenced: number;
    readonly mandatoryReviewed: number;
    readonly desirableEvidenced: number;
    readonly preferencesMet: number;
    readonly expiredMandatory: boolean;
    readonly toClarify: number;
  };
  readonly preferences: {
    readonly area: PreferenceState;
    readonly location: PreferenceState;
    readonly employmentType: PreferenceState;
    readonly availableFrom: string | null;
  };
}

export interface TalentResult {
  readonly ref: string;
  readonly position: number;
  readonly visibility: Visibility;
  readonly merits: readonly TalentMerit[];
  readonly experience: readonly TalentExperience[];
  readonly totalSecurityMonths: number;
  readonly preferences: TalentPreferences;
  readonly evaluation: Evaluation;
  readonly contact: {
    readonly id: string;
    readonly status: ContactStatus;
    readonly createdAt: string;
  } | null;
}

export type ContactStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface CriterionDraft {
  readonly requirementId: string;
  /** Catalogue codes of ONE class, or empty. */
  readonly credentialCodes: readonly string[];
  readonly jurisdiction: string | null;
  readonly mustBeValid: boolean;
  readonly minLevel: "any" | "document_provided" | "document_reviewed";
  readonly experienceMonths: number | null;
}

export interface CatalogueOption {
  readonly code: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly abbreviation: string | null;
  readonly requirementClass: Exclude<RequirementClass, "experience" | "unbound">;
  readonly jurisdiction: string | null;
  readonly scope: string | null;
}

export const SEARCH_FILTERS = [
  "allMandatory",
  "reviewedOnly",
  "validOnly",
  "activeOnly",
  "preferencesMatch",
] as const;
export type SearchFilter = (typeof SEARCH_FILTERS)[number];

/** The documented order, in the order the database applies it. */
export const ORDERING = [
  "mandatoryEvidenced",
  "mandatoryReviewed",
  "desirableEvidenced",
  "preferencesMet",
  "reference",
] as const;

/** Full name and abbreviation, the way the product names a credential:
 *  "Certified Protection Professional (CPP)". Never the abbreviation alone. */
export function meritDisplayName(
  m: {
    nameSv?: string | null;
    nameEn?: string | null;
    abbreviation?: string | null;
    code?: string | null;
  },
  lang: "sv" | "en",
): string {
  const name = (lang === "sv" ? m.nameSv || m.nameEn : m.nameEn || m.nameSv) || m.code || "";
  const abbr = (m.abbreviation ?? "").trim();
  if (!abbr || name.includes(`(${abbr})`) || name === abbr) return name;
  return `${name} (${abbr})`;
}

/** Copy key for a requirement's state. There is no key for "missing". */
export function requirementStateKey(state: RequirementState): string {
  switch (state) {
    case "evidenced":
      return "talent.state.evidenced";
    case "needs_clarification":
      return "talent.state.needsClarification";
    case "not_shared":
      return "talent.state.notShared";
    case "to_clarify":
      return "talent.state.toClarify";
  }
}

const REASON_KEYS: Record<string, string> = {
  expired: "talent.reason.expired",
  expiring_soon: "talent.reason.expiringSoon",
  validity_not_stated: "talent.reason.validityNotStated",
  other_jurisdiction: "talent.reason.otherJurisdiction",
  level_below_requested: "talent.reason.levelBelowRequested",
  fewer_months_shared: "talent.reason.fewerMonthsShared",
  scope_limited: "talent.reason.scopeLimited",
  self_declared: "talent.reason.selfDeclared",
  experience_declared: "talent.reason.experienceDeclared",
  international_certification_is_not_authorisation: "talent.reason.internationalNotAuthorisation",
};

/** Copy keys for the reasons, unknown ones dropped (fail quiet, not wrong). */
export function reasonKeys(reasons: readonly string[]): string[] {
  return reasons.map((r) => REASON_KEYS[r]).filter((k): k is string => Boolean(k));
}

/** How an entry is backed, in words. A CQrityjob approval is a document
 *  review; only `source_confirmed` may say the source confirmed it. */
export function levelKey(level: string | null | undefined): string {
  switch (level) {
    case "document_reviewed":
      return "talent.level.documentReviewed";
    case "employer_confirmed":
      return "talent.level.employerConfirmed";
    case "source_confirmed":
      return "talent.level.sourceConfirmed";
    case "document_provided":
      return "talent.level.documentProvided";
    case "confirmed":
      return "talent.level.experienceConfirmed";
    case "declared":
      return "talent.level.experienceDeclared";
    default:
      return "talent.level.selfDeclared";
  }
}

export function validityKey(v: Validity | string | null | undefined): string {
  switch (v) {
    case "valid":
      return "talent.validity.valid";
    case "expiring_soon":
      return "talent.validity.expiringSoon";
    case "expired":
      return "talent.validity.expired";
    case "no_expiry":
      return "talent.validity.noExpiry";
    default:
      return "talent.validity.notStated";
  }
}

export function classKey(c: RequirementClass | string): string {
  switch (c) {
    case "education":
      return "talent.class.education";
    case "certification":
      return "talent.class.certification";
    case "regulated_authorisation":
      return "talent.class.regulatedAuthorisation";
    case "experience":
      return "talent.class.experience";
    default:
      return "talent.class.unbound";
  }
}

/** Validate a criteria draft before it is sent: one class per requirement,
 *  months in range. The database checks the same and more; this lets the
 *  form say so before the round trip. */
export function criterionProblem(
  draft: CriterionDraft,
  catalogue: readonly CatalogueOption[],
): "mixed_classes" | "unknown_code" | "months_out_of_range" | "both_kinds" | null {
  if (draft.credentialCodes.length > 0 && draft.experienceMonths !== null) return "both_kinds";
  if (
    draft.experienceMonths !== null &&
    (draft.experienceMonths < 1 || draft.experienceMonths > 480)
  ) {
    return "months_out_of_range";
  }
  const classes = new Set<string>();
  for (const code of draft.credentialCodes) {
    const option = catalogue.find((c) => c.code === code);
    if (!option) return "unknown_code";
    classes.add(option.requirementClass);
  }
  return classes.size > 1 ? "mixed_classes" : null;
}

/** The payload rec_talent_confirm_criteria expects. */
export function criteriaPayload(drafts: readonly CriterionDraft[]): unknown[] {
  return drafts.map((d) => {
    if (d.credentialCodes.length > 0) {
      return {
        requirementId: d.requirementId,
        credentialCodes: [...d.credentialCodes],
        jurisdiction: d.jurisdiction,
        mustBeValid: d.mustBeValid,
        minLevel: d.minLevel,
      };
    }
    if (d.experienceMonths !== null) {
      return { requirementId: d.requirementId, experienceMonths: d.experienceMonths };
    }
    return { requirementId: d.requirementId };
  });
}

/** Why a result is where it is in the list, as the four counts the order is
 *  made of. Shown to the recruiter next to every result. */
export function orderingFacts(e: Evaluation): { key: string; value: string }[] {
  return [
    {
      key: "talent.order.mandatoryEvidenced",
      value: `${e.summary.mandatoryEvidenced}/${e.summary.mandatoryTotal}`,
    },
    { key: "talent.order.mandatoryReviewed", value: String(e.summary.mandatoryReviewed) },
    { key: "talent.order.desirableEvidenced", value: String(e.summary.desirableEvidenced) },
    { key: "talent.order.preferencesMet", value: `${e.summary.preferencesMet}/3` },
  ];
}

/** Discoverability settings as the form holds them, and the save payload. */
export interface DiscoverabilityDraft {
  visibility: Visibility;
  claimIds: string[];
  experienceIds: string[];
  areas: string[];
  countries: string[];
  cities: string[];
  employmentTypes: string[];
  workplaceTypes: string[];
  availableFrom: string;
  consent: boolean;
}

export type DraftProblem = "consent_required" | "nothing_selected" | null;

export function draftProblem(d: DiscoverabilityDraft): DraftProblem {
  if (d.visibility === "private") return null;
  if (d.claimIds.length + d.experienceIds.length === 0) return "nothing_selected";
  if (!d.consent) return "consent_required";
  return null;
}

export function discoverabilityPayload(d: DiscoverabilityDraft): {
  visibility: Visibility;
  consentTextVersion: string | null;
  claimIds: string[];
  experienceIds: string[];
  preferences: Record<string, unknown>;
} {
  return {
    visibility: d.visibility,
    consentTextVersion: d.visibility === "private" ? null : CONSENT_TEXT_VERSION,
    claimIds: [...new Set(d.claimIds)],
    experienceIds: [...new Set(d.experienceIds)],
    preferences: {
      areas: [...new Set(d.areas)],
      countries: [...new Set(d.countries.map((c) => c.trim().toUpperCase()).filter(Boolean))],
      cities: [...new Set(d.cities.map((c) => c.trim()).filter(Boolean))].slice(0, 5),
      employmentTypes: [...new Set(d.employmentTypes)],
      workplaceTypes: [...new Set(d.workplaceTypes)],
      availableFrom: d.availableFrom || null,
    },
  };
}

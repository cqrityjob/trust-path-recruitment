/**
 * Epic 2 — Legacy → Canonical family alias adapter.
 *
 * FROZEN. This map exists solely to translate legacy family identifiers
 * that live in immutable historical data (assessment_runs.result_summary
 * JSON, older analytics, cached URLs) into the canonical 14 snake_case
 * Career Family IDs. New code must NOT read from this map — use the
 * canonical IDs directly.
 *
 * The engine reference numbers and profession IDs are unchanged; only
 * the family label attached to a profession moves under the canonical
 * taxonomy. If you find yourself extending this file for a new feature,
 * you are on the wrong path — extend the canonical taxonomy instead.
 *
 * Where a legacy family has been split (e.g. risk_crisis → {risk_management,
 * crisis_management}) the default here is the more common landing family;
 * profession-level overrides in professionProfiles / researched / placeholders
 * express the finer decision at write-time.
 */

export type CanonicalFamilyId =
  | "protective_operations"
  | "public_safety_justice"
  | "corrections_secure_transport"
  | "defence_national_security"
  | "corporate_security"
  | "critical_infrastructure_security"
  | "risk_management"
  | "crisis_management"
  | "business_continuity_resilience"
  | "cyber_information_security"
  | "financial_crime_compliance"
  | "security_technology"
  | "security_leadership_governance"
  | "investigations_intelligence";

export const CANONICAL_FAMILY_IDS: readonly CanonicalFamilyId[] = [
  "protective_operations",
  "public_safety_justice",
  "corrections_secure_transport",
  "defence_national_security",
  "corporate_security",
  "critical_infrastructure_security",
  "risk_management",
  "crisis_management",
  "business_continuity_resilience",
  "cyber_information_security",
  "financial_crime_compliance",
  "security_technology",
  "security_leadership_governance",
  "investigations_intelligence",
] as const;

/** Kebab-case URL slug per canonical family, derived from the snake_case ID. */
export function familyPublicSlug(id: CanonicalFamilyId | string): string {
  return String(id).replace(/_/g, "-");
}

/** Historical → canonical translation. `exploring` is a UX state, not a family. */
export const LEGACY_FAMILY_ALIASES: Readonly<Record<string, CanonicalFamilyId | null>> = {
  exploring: null,
  guarding: "protective_operations",
  police_public: "public_safety_justice",
  defence_protective: "protective_operations",
  corporate: "security_leadership_governance",
  physical_technical: "security_technology",
  risk_crisis: "risk_management",
  investigations_intel: "investigations_intelligence",
  financial_crime: "financial_crime_compliance",
  critical_infra: "critical_infrastructure_security",
  cyber_infosec: "cyber_information_security",
  consulting_specialist: "security_leadership_governance",
};

/**
 * Also handles the pre-Epic-2 DB kebab-case family slugs that still appear
 * in a small number of catalogue rows during migration. Retire once every
 * caller reads canonical snake_case IDs and no legacy data remains.
 */
export const LEGACY_DB_KEBAB_ALIASES: Readonly<Record<string, CanonicalFamilyId>> = {
  "operational-security": "protective_operations",
  "physical-protective-security": "protective_operations",
  "private-protection-close-security": "protective_operations",
  "public-order": "public_safety_justice",
  "law-enforcement": "public_safety_justice",
  "customs-border": "public_safety_justice",
  defence: "defence_national_security",
  "corporate-security-leadership": "security_leadership_governance",
  "risk-crisis-management": "risk_management",
  "emergency-rescue": "crisis_management",
  "cyber-information-security": "cyber_information_security",
  "security-technology": "security_technology",
  "investigation-intelligence": "investigations_intelligence",
};

/**
 * Normalise any inbound family identifier (legacy snake, DB kebab, or
 * canonical snake) into the canonical set. Returns `undefined` for
 * inputs that intentionally map to no family (e.g. `exploring`) and
 * for anything unrecognised.
 */
export function toCanonicalFamily(input: string | null | undefined): CanonicalFamilyId | undefined {
  if (!input) return undefined;
  if ((CANONICAL_FAMILY_IDS as readonly string[]).includes(input)) return input as CanonicalFamilyId;
  if (input in LEGACY_FAMILY_ALIASES) {
    const mapped = LEGACY_FAMILY_ALIASES[input];
    return mapped ?? undefined;
  }
  if (input in LEGACY_DB_KEBAB_ALIASES) return LEGACY_DB_KEBAB_ALIASES[input];
  return undefined;
}
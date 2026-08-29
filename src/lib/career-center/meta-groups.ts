// Four readable groupings over the fourteen profession families.
//
// ── WHY ────────────────────────────────────────────────────────────────
//
// The explorer's family filter is the one taxonomy a visitor sees, and
// fourteen chips is a wall rather than a choice — particularly on a phone,
// where it pushed the results themselves below two screens of controls. The
// fix is presentational only: the meta-groups group the family chips under
// four headings a newcomer can hold in mind. They are NOT a second taxonomy.
// Nothing is stored against a meta-group, no profession carries one, the URL
// never names one, and filtering still happens on `family`.
//
// The grouping is total and disjoint: every non-entry-path family appears in
// exactly one group, asserted by the guard script, so adding a family without
// placing it is a build-visible failure rather than a chip that quietly stops
// appearing in the explorer.

import type { Bi, ProfessionFamilyId } from "./types";
import { professionFamilies } from "./profession-families";

export type MetaGroupId =
  | "operational_protection"
  | "business_and_society"
  | "analysis_and_investigation"
  | "technology_and_cyber";

export interface MetaGroup {
  readonly id: MetaGroupId;
  readonly name: Bi;
  readonly families: readonly ProfessionFamilyId[];
}

export const metaGroups: readonly MetaGroup[] = [
  {
    id: "operational_protection",
    name: { sv: "Operativt skydd", en: "Operational protection" },
    families: [
      "protective_operations",
      "public_safety_justice",
      "corrections_secure_transport",
      "defence_national_security",
    ],
  },
  {
    id: "business_and_society",
    name: { sv: "Företag och samhälle", en: "Business and society" },
    families: [
      "corporate_security",
      "critical_infrastructure_security",
      "risk_management",
      "crisis_management",
      "business_continuity_resilience",
      "security_leadership_governance",
    ],
  },
  {
    id: "analysis_and_investigation",
    name: { sv: "Analys och utredning", en: "Analysis and investigation" },
    families: ["investigations_intelligence", "financial_crime_compliance"],
  },
  {
    id: "technology_and_cyber",
    name: { sv: "Teknik och cyber", en: "Technology and cyber" },
    families: ["cyber_information_security", "security_technology"],
  },
] as const;

/** Every family that a profession may actually belong to — "exploring" is an
 *  entry path in the taxonomy, not a family, and is excluded everywhere the
 *  explorer reads families. */
export const filterableFamilyIds: readonly ProfessionFamilyId[] = professionFamilies
  .filter((f) => !f.isEntryPath)
  .map((f) => f.id);

export function getMetaGroupForFamily(id: ProfessionFamilyId): MetaGroup | undefined {
  return metaGroups.find((g) => g.families.includes(id));
}

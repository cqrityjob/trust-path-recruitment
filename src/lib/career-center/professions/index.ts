import type { Profession, ProfessionId } from "../types";
import {
  securityOfficer,
  ordningsvakt,
  skyddsvakt,
  securityManager,
  securityTechnician,
  riskManager,
  amlSpecialist,
  dataCenterSecurity,
  crisisContinuityManager,
  closeProtection,
  securityCoordinator,
} from "./researched";
import {
  policeOfficer,
  militarySecuritySpecialist,
  correctionalOfficer,
  customsOfficer,
  securityInvestigator,
  intelligenceAnalyst,
  fraudInvestigator,
  socAnalyst,
  securityConsultant,
} from "./placeholders";

export const professions: readonly Profession[] = [
  // Researched and published (11)
  securityOfficer,
  ordningsvakt,
  skyddsvakt,
  securityManager,
  securityTechnician,
  riskManager,
  amlSpecialist,
  dataCenterSecurity,
  crisisContinuityManager,
  closeProtection,
  securityCoordinator,
  // Placeholder — named under "Kommer", never carded or linked (9)
  policeOfficer,
  militarySecuritySpecialist,
  correctionalOfficer,
  customsOfficer,
  securityInvestigator,
  intelligenceAnalyst,
  fraudInvestigator,
  socAnalyst,
  securityConsultant,
];

export function getProfession(idOrSlug: ProfessionId | string): Profession | undefined {
  return professions.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}

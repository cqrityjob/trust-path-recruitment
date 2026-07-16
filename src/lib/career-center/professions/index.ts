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
} from "./researched";
import {
  policeOfficer,
  militarySecuritySpecialist,
  correctionalOfficer,
  customsOfficer,
  securityCoordinator,
  securityInvestigator,
  intelligenceAnalyst,
  fraudInvestigator,
  socAnalyst,
  securityConsultant,
} from "./placeholders";

export const professions: readonly Profession[] = [
  // Researched pilot (10)
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
  // Placeholder pilot (10)
  policeOfficer,
  militarySecuritySpecialist,
  correctionalOfficer,
  customsOfficer,
  securityCoordinator,
  securityInvestigator,
  intelligenceAnalyst,
  fraudInvestigator,
  socAnalyst,
  securityConsultant,
];

export function getProfession(idOrSlug: ProfessionId | string): Profession | undefined {
  return professions.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}
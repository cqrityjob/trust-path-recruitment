import type { Bi, Region, SourceRef, Verifiable, ProficiencyLevel, ProfessionId, CompetencyId, EducationId, CertificationId } from "@/lib/career-center/types";

// -------------------- FormalRequirement --------------------

// Subtype taxonomy for regulated qualification requirements.
// See Sprint 09B plan §1 for legal anchors.
export type FormalRequirementSubtype =
  | "mandatory_training"          // e.g. Väktarutbildning, Skyddsvaktsutbildning
  | "personnel_approval"          // e.g. Länsstyrelsens godkännande som väktare
  | "government_appointment"      // e.g. Förordnande som ordningsvakt
  | "government_approval"         // e.g. Godkännande som skyddsvakt
  | "company_authorization"       // e.g. Auktorisation av bevakningsföretag
  | "employer_authorization"      // reserved — not used in beta
  | "security_screening_requirement" // Säkerhetsprövning (2018:585)
  | "age_requirement"
  | "eligibility_requirement"
  | "licence_requirement"
  | "medical_fitness_requirement"
  | "gdpr_training_requirement";

export type FormalRequirementAppliesTo = "person" | "organization";

export type FormalRequirementId = string;

export interface FormalRequirement extends Verifiable {
  id: FormalRequirementId; // stable id, e.g. "fr.se.vaktare.training"
  name: Bi;
  definition?: Bi;
  subtype: FormalRequirementSubtype;
  appliesTo: FormalRequirementAppliesTo;
  authority: Bi;                 // approving/appointing authority description
  jurisdiction: Region;          // primary jurisdiction
  legalBlocker: boolean;         // true = missing this legally prevents practising
  authorityConductsSuitabilityCheck?: boolean; // avoids duplicate candidate checks
  renewalOf?: FormalRequirementId; // for renewal facets
  officialSource?: SourceRef;
}

// -------------------- Profession → FormalRequirement link --------------------

export interface ProfessionFormalRequirement {
  professionId: ProfessionId;
  requirementId: FormalRequirementId;
  required: boolean;             // false = "sometimes / role-dependent"
  note?: Bi;
}

// -------------------- Gap engine outputs --------------------

export type GapSeverity = "blocker" | "recommended" | "informational";

export interface CompetenceGap {
  competencyId: CompetencyId;
  requiredLevel: ProficiencyLevel;
  selfReportedLevel: ProficiencyLevel | null;
  severity: GapSeverity;
  critical: boolean;
}

// Formal-gap statuses shown in beta UI (exactly four):
export type FormalGapStatus =
  | "required"              // legal blocker, no user input yet
  | "self_reported_as_met"  // user acknowledged they hold it
  | "not_provided"          // required but no input
  | "not_applicable";       // user marked as N/A for their situation

export interface FormalRequirementGap {
  requirementId: FormalRequirementId;
  subtype: FormalRequirementSubtype;
  appliesTo: FormalRequirementAppliesTo;
  legalBlocker: boolean;
  status: FormalGapStatus;
  authorityConductsSuitabilityCheck?: boolean;
}

export interface ExperienceGap {
  kind: "years" | "role" | "context";
  description: Bi;
  severity: GapSeverity;
}

export interface GapAnalysis {
  graphVersion: string;
  professionId: ProfessionId;
  competenceGaps: CompetenceGap[];
  formalRequirementGaps: FormalRequirementGap[];
  experienceGaps: ExperienceGap[];
  // NOTE: no aggregate readiness percentage — by design.
}

// -------------------- Read contract shapes --------------------

export interface ProfessionGraphView {
  id: ProfessionId;
  slug: string;
  titleSv: string;
  titleEn: string;
  status: Verifiable["status"];
  regulated: boolean;
  legalRequirements: FormalRequirement[];
  developmentRequirements: FormalRequirement[]; // non-blocking (e.g. GDPR training)
  competencyIds: CompetencyId[];
  educationIds: EducationId[];
  certificationIds: CertificationId[];
  sources: SourceRef[];
  lastVerified?: string;
  graphVersion: string;
}

// Signals from Career Guidance Assessment. These are guidance, not verified competence.
export interface AssessmentSignal {
  dimensionId: string;
  label: Bi;
  strength: "development_area" | "signal" | "strength";
  note?: Bi;
}

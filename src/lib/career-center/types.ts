import type { Lang } from "@/i18n/dictionaries";

export type Bi = { sv: string; en: string };
export const L = (b: Bi, lang: Lang): string => b[lang];

// Content lifecycle
export type ContentStatus = "placeholder" | "researched" | "reviewed" | "published";

// Country / region scope
export type Region = "SE" | "NORDICS" | "EU" | "UK" | "US" | "INTL";

// 1-5 proficiency scale
export type ProficiencyLevel = 1 | 2 | 3 | 4 | 5;

export interface SourceRef {
  label: Bi;
  publisher?: string;
  url?: string;
  retrieved?: string; // ISO date (YYYY-MM-DD)
}

export interface Verifiable {
  status: ContentStatus;
  sources?: SourceRef[];
  lastVerified?: string; // ISO date
  reviewedBy?: string;   // must be set manually for status "reviewed"
  publishedBy?: string;  // must be set manually for status "published"
}

// -------------------- Families & categories --------------------

export type ProfessionFamilyId =
  | "exploring"
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

export interface ProfessionFamily {
  id: ProfessionFamilyId;
  name: Bi;
  description: Bi;
  isEntryPath?: boolean; // "exploring" is not a profession family
  icon?: string;
}

export type CategoryId =
  | "guarding"
  | "corporate"
  | "public_safety"
  | "risk"
  | "cyber"
  | "investigations"
  | "aml"
  | "critical_infra"
  | "protective"
  | "tech"
  | "emergency"
  | "leadership";

export interface Category {
  id: CategoryId;
  name: Bi;
  desc: Bi;
  icon: string;
}

export type ExperienceLevel = "entry" | "mid" | "senior" | "executive";

// Cross-cutting orientation used by search/filter
export type Sector = "public" | "private" | "hybrid";
export type Orientation = "operational" | "technical" | "analytical" | "leadership";

// -------------------- Competency --------------------

export type CompetencyCategory =
  | "behavioural"
  | "operational"
  | "analytical"
  | "technical"
  | "regulatory"
  | "leadership"
  | "communication"
  | "service"
  | "risk_safety";

export type CompetencyId = string;

export interface Competency extends Verifiable {
  id: CompetencyId;
  name: Bi;
  definition: Bi;
  category: CompetencyCategory;
  observableBehaviours?: Bi[];
  proficiencyScale?: { level: ProficiencyLevel; label: Bi; descriptor: Bi }[];
  assessmentMethods?: Bi[];
  developmentRecommendations?: Bi[];
  icon?: string;
}

export interface RequiredCompetency {
  competencyId: CompetencyId;
  requiredLevel: ProficiencyLevel;
  critical?: boolean;
}

// -------------------- Education --------------------

export type EducationId = string;

export interface Education extends Verifiable {
  id: EducationId;
  name: Bi;
  provider?: Bi;
  scope: Region[];
  targetLevel?: ExperienceLevel;
  prerequisites?: Bi[];
  relatedProfessions?: ProfessionId[];
  relatedCompetencies?: CompetencyId[];
  officialSource?: SourceRef;
  notes?: Bi;
}

// -------------------- Certification --------------------

export type CertificationId = string;

export interface Certification extends Verifiable {
  id: CertificationId;
  fullName: Bi;
  shortName?: string;
  issuer: Bi;
  scope: Region[];
  careerLevel?: ExperienceLevel;
  prerequisites?: Bi[];
  experienceRequirement?: Bi;
  examination?: Bi;
  validity?: Bi;
  relatedProfessions?: ProfessionId[];
  relatedCompetencies?: CompetencyId[];
  officialSource?: SourceRef;
  mandatory?: boolean; // only true if sources confirm
}

// -------------------- Career path (edge) --------------------

export interface CareerPath extends Verifiable {
  from: ProfessionId;
  to: ProfessionId;
  likelihood: "common" | "possible";
  experienceRequired?: Bi;
  transferableCompetencies?: CompetencyId[];
  competencyGaps?: CompetencyId[];
  recommendedEducation?: EducationId[];
  recommendedCertifications?: CertificationId[];
  notes?: Bi;
}

// -------------------- Profession --------------------

export type ProfessionId = string;

export interface Profession extends Verifiable {
  id: ProfessionId;
  slug: string;
  // Titles
  titleCanonical: string; // english canonical, non-localized
  titleSv: string;
  titleEn: string;
  aliases?: Bi[];

  // Classification
  family: ProfessionFamilyId;
  category: CategoryId;
  level: ExperienceLevel;
  sector: Sector;
  orientation: Orientation[];
  icon?: string;

  // Descriptions
  description: Bi;    // short summary
  overview: Bi;       // longer role description
  roleFor: Bi;
  responsibilities: Bi[];
  workEnvironments?: Bi[];
  industries?: Bi[];

  // Requirements
  competencies: RequiredCompetency[];
  formalRequirements?: Bi[];
  regulated: boolean;
  regulatoryNotes?: Bi;
  countries: Region[];

  // Development
  educationPathways?: EducationId[];
  certifications?: CertificationId[];

  // Relationships
  previousRoles?: ProfessionId[];
  nextRoles?: ProfessionId[];
  related?: ProfessionId[];

  // Assessment linkage
  recommendedAssessment?: "security-career-assessment";
  futureAssessments?: Bi[];

  // Jobs (placeholder)
  relatedJobsQuery?: string;

  // Editorial
  faqs?: { q: Bi; a: Bi }[];
}

// Helper: proficiency scale default labels
export const proficiencyLabels: Record<ProficiencyLevel, Bi> = {
  1: { sv: "Medvetenhet", en: "Awareness" },
  2: { sv: "Grundläggande", en: "Foundational" },
  3: { sv: "Kompetent", en: "Competent" },
  4: { sv: "Skicklig", en: "Proficient" },
  5: { sv: "Expert", en: "Expert" },
};
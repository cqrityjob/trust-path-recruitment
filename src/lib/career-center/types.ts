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
  reviewedBy?: string; // must be set manually for status "reviewed"
  publishedBy?: string; // must be set manually for status "published"
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

/**
 * What kind of thing a "certification" record actually is.
 *
 * ── WHY THIS HAD TO BE MODELLED ────────────────────────────────────────
 *
 * ISO 31000, ISO 22301 and ISO/IEC 27001 were carried in this catalogue as
 * personal certifications with `issuer: "ISO"`, and rendered next to CPP and
 * CAMS under a heading reading "Certifikat". Three things were wrong at once:
 *
 *   * ISO does not issue certificates to anybody. It publishes standards;
 *     conformity assessment is done by accredited certification bodies.
 *   * ISO 31000 is explicitly not intended for certification purposes at all.
 *   * ISO 22301 and ISO/IEC 27001 certify an ORGANISATION's management
 *     system. Neither is automatically a credential a person holds.
 *
 * A career guide that lists an organisational standard as something a reader
 * can obtain, from an issuer that does not issue it, is telling them to go
 * and buy a thing that does not exist.
 */
export type CredentialType =
  /** A credential awarded to a PERSON by a named body. CPP, CAMS, CFE. */
  | "personal_credential"
  /** A published standard. Knowledge to learn; not a personal credential,
   *  and never presented as one. */
  | "standard";

export interface Certification extends Verifiable {
  id: CertificationId;
  /** Personal credential or published standard. Required: the default that
   *  used to be implied — "personal credential" — is the wrong one for three
   *  of the records in this catalogue. */
  credentialType: CredentialType;
  fullName: Bi;
  shortName?: string;
  /** For a `personal_credential`, the body that awards it. For a `standard`,
   *  the body that PUBLISHES it — which is not the same relationship, and the
   *  surface must not print it as though it were. */
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
  /**
   * How usual this move is.
   *
   * ── THIS FIELD IS NOT PUBLISHABLE ON ITS OWN ───────────────────────────
   *
   * "Vanlig övergång" is a claim about FREQUENCY, and the only thing that
   * supports a frequency claim is evidence about that exact transition:
   * labour-market statistics, a register, a study. A statute describing what
   * the destination role requires says nothing about how many people move
   * into it from any particular origin — and every source in this dataset is
   * of that profession-level kind.
   *
   * So this value is editorial shorthand for internal ordering only. The UI
   * may render a likelihood ONLY when `frequencyEvidence` is present, which
   * it is nowhere today. See `transitions.ts`.
   */
  likelihood: "common" | "possible";
  /**
   * Evidence that this exact transition occurs at the stated frequency.
   *
   * Deliberately separate from `sources`. A guide's own statutory sources
   * are evidence about the ROLE; they are not evidence about the MOVE. This
   * distinction is the difference between "an ordningsvakt appointment
   * requires prescribed training" (sourced, true) and "väktare commonly
   * become ordningsvakter" (unsourced, and not something this product knows).
   */
  frequencyEvidence?: SourceRef[];
  /** The jurisdiction this transition claim is made for. A transition with no
   *  stated jurisdiction cannot be published as reviewed: what stands between
   *  two roles is a question of law, and law has a territory. */
  countries?: Region[];
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
  description: Bi; // short summary
  overview: Bi; // longer role description
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

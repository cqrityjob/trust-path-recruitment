// Job Intelligence — shared TypeScript shapes.
//
// Phase A: shapes only, no logic. Kept aligned with the Phase A migration and
// with the public/admin table split. Do not import admin shapes into
// components — they exist for admin server functions only.

export type WorkplaceType = "remote" | "hybrid" | "onsite";

export type ApplicationMethod = "external" | "email" | "internal" | "unavailable";

export type JobStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "expired"
  | "rejected"
  | "archived";

export type JobAuditAction =
  | "created"
  | "updated"
  | "submitted"
  | "published"
  | "rejected"
  | "expired"
  | "archived"
  | "duplicate_marked"
  | "deleted";

export type ImportSourceKind = "manual" | "employer" | "feed";

/** Employer row visible to the public read path. */
export interface Employer {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  country: string | null;
  descriptionSv: string | null;
  descriptionEn: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Admin-only employer metadata. Never sent to browser code. */
export interface EmployerAdminMeta {
  employerId: string;
  verified: boolean;
  verificationNotes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Public job row. Anon and authenticated readers only see this shape. */
export interface Job {
  id: string;
  slug: string;
  shortId: string;

  sourceId: string | null;
  sourceJobId: string | null;
  sourceUrl: string | null;
  canonicalUrl: string | null;

  employerId: string;

  professionSlug: string | null;
  familyId: string | null;
  relatedProfessionSlugs: string[];
  sector: string | null;
  employerType: string | null;

  titleSv: string | null;
  titleEn: string | null;
  descriptionSv: string | null;
  descriptionEn: string | null;
  responsibilities: unknown;
  requirements: unknown;
  benefits: unknown;

  locationText: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: string | null;
  experienceLevel: string | null;
  languageRequirements: string[];
  travelRequired: boolean | null;
  shiftWork: boolean | null;
  nightWork: boolean | null;

  regulated: boolean;
  formalRequirementIds: string[];
  securityVettingMentioned: boolean;
  drivingLicenceRequired: boolean;

  applicationMethod: ApplicationMethod;
  applicationUrl: string | null;
  applicationEmail: string | null;

  status: JobStatus;
  publishedAt: string | null;
  deadlineAt: string | null;
  expiresAt: string | null;

  contentHash: string | null;

  createdAt: string;
  updatedAt: string;
}

/** Admin-only moderation metadata. Never sent to browser code. */
export interface JobAdminMeta {
  jobId: string;
  moderationNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  importedAt: string | null;
  duplicateOf: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedJob {
  userId: string;
  jobId: string;
  savedAt: string;
}

/** Immutable audit event. `jobId` is a plain uuid — not FK — so history
 * survives job deletion. */
export interface JobAuditEvent {
  id: string;
  jobId: string | null;
  jobSlugSnapshot: string | null;
  actorId: string | null;
  action: JobAuditAction;
  before: unknown;
  after: unknown;
  createdAt: string;
}

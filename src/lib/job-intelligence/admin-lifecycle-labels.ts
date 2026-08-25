// Stable-code -> translation-key maps for the Admin Control Center.
//
// Kept in one module because the same codes surface in three places (employer
// detail, person detail, data management) and a code that reaches an
// administrator untranslated is a bug, not a fallback. Anything unmapped
// renders a neutral "unknown" string plus nothing else -- never the raw
// Postgres sentence, which is written for a log, not for a person deciding
// whether to delete a customer.

import type { TranslationKey } from "@/i18n/dictionaries";

export const BLOCKER_LABEL_KEY: Record<string, TranslationKey> = {
  EMPLOYER_HAS_APPLICATIONS: "admin.lifecycle.blocker.employerHasApplications",
  EMPLOYER_HAS_WORKFORCE: "admin.lifecycle.blocker.employerHasWorkforce",
  EMPLOYER_HAS_ASSESSMENT_HISTORY: "admin.lifecycle.blocker.employerHasAssessmentHistory",
  EMPLOYER_HAS_PASSPORT_RELATIONSHIPS: "admin.lifecycle.blocker.employerHasPassportRelationships",
  EMPLOYER_HAS_PUBLISHED_JOBS: "admin.lifecycle.blocker.employerHasPublishedJobs",
  EMPLOYER_HAS_ASSESSMENT_CONTENT: "admin.lifecycle.blocker.employerHasAssessmentContent",
  EMPLOYER_HAS_AUDIT_HISTORY: "admin.lifecycle.blocker.employerHasAuditHistory",
  USER_HAS_APPLICATIONS: "admin.lifecycle.blocker.userHasApplications",
  USER_HAS_EMPLOYER_MEMBERSHIP: "admin.lifecycle.blocker.userHasEmployerMembership",
  USER_IS_EMPLOYEE: "admin.lifecycle.blocker.userIsEmployee",
  USER_HAS_ASSESSMENT_EVIDENCE: "admin.lifecycle.blocker.userHasAssessmentEvidence",
  USER_HAS_PASSPORT_EVIDENCE: "admin.lifecycle.blocker.userHasPassportEvidence",
  USER_HOLDS_PLATFORM_ROLE: "admin.lifecycle.blocker.userHoldsPlatformRole",
  USER_HAS_AUDIT_HISTORY: "admin.lifecycle.blocker.userHasAuditHistory",
  USER_HAS_ACTED_ON_RECORDS: "admin.lifecycle.blocker.userHasActedOnRecords",
};

export function blockerLabelKey(code: string): TranslationKey {
  return BLOCKER_LABEL_KEY[code] ?? "admin.lifecycle.blocker.unknown";
}

/** Every stable refusal code these RPCs can raise, mapped to a sentence an
 *  administrator can act on. The default is deliberately vague: a code this
 *  map has not seen must not be shown verbatim. */
export const LIFECYCLE_ERROR_KEY: Record<string, TranslationKey> = {
  FORBIDDEN_ADMIN_REQUIRED: "admin.lifecycle.error.forbidden",
  ROLE_CHECK_FAILED: "admin.lifecycle.error.forbidden",
  FORBIDDEN_SUPERADMIN_REQUIRED: "admin.lifecycle.error.superadminRequired",
  REASON_REQUIRED: "admin.lifecycle.error.reasonRequired",
  REASON_TOO_LONG: "admin.lifecycle.error.reasonRequired",
  CONFIRMATION_MISMATCH: "admin.lifecycle.error.confirmMismatch",
  EMPLOYER_NOT_DELETABLE: "admin.lifecycle.error.notDeletable",
  USER_NOT_DELETABLE: "admin.lifecycle.error.notDeletable",
  JOB_NOT_DELETABLE: "admin.lifecycle.job.delete.blocked",
  JOB_HAS_APPLICATIONS: "admin.lifecycle.error.notDeletable",
  JOB_HAS_ASSIGNMENTS: "admin.lifecycle.error.notDeletable",
  JOB_HAS_INVITATIONS: "admin.lifecycle.error.notDeletable",
  SELF_DISABLE_NOT_ALLOWED: "admin.lifecycle.error.selfAction",
  SELF_DELETE_NOT_ALLOWED: "admin.lifecycle.error.selfAction",
  SELF_ANONYMISE_NOT_ALLOWED: "admin.lifecycle.error.selfAction",
  LAST_SUPERADMIN_PROTECTED: "admin.lifecycle.error.lastSuperadmin",
  USER_HOLDS_PLATFORM_ROLE: "admin.lifecycle.error.holdsRole",
  USER_HAS_ACTIVE_MEMBERSHIP: "admin.lifecycle.error.activeMembership",
  EMPLOYER_NOT_OPERATIONAL: "admin.lifecycle.error.employerNotOperational",
  EMPLOYER_NOT_FOUND: "admin.lifecycle.error.notFound",
  USER_NOT_FOUND: "admin.lifecycle.error.notFound",
  JOB_NOT_FOUND: "admin.lifecycle.error.notFound",
};

export function lifecycleErrorKey(code: string | null | undefined): TranslationKey {
  if (!code) return "admin.lifecycle.error.generic";
  return LIFECYCLE_ERROR_KEY[code] ?? "admin.lifecycle.error.generic";
}

export const IDENTITY_FINDING_KEY: Record<string, TranslationKey> = {
  UNCLAIMED_SUBJECT: "admin.data.finding.unclaimedSubject",
  DUPLICATE_EMPLOYEE_IN_ORGANISATION: "admin.data.finding.duplicateEmployee",
  EMPLOYEE_NOT_BOUND_TO_ACCOUNT: "admin.data.finding.employeeNotBound",
  EMPLOYEE_SUBJECT_MISMATCH: "admin.data.finding.employeeSubjectMismatch",
};

export function identityFindingKey(code: string): TranslationKey {
  return IDENTITY_FINDING_KEY[code] ?? "admin.data.finding.unknown";
}

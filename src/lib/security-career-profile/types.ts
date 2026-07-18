// Security Career Profile — Phase 1: types only.
//
// This is contextual information about the user (current status,
// profession, experience), NOT scoring data. It is unrelated to
// `CareerProfile` (career-intelligence-engine/career-profile.ts, scoring
// archetypes) and `CareerProfileForJobsV1` (profile-for-jobs.ts, a
// scoring-derived DTO). Nothing in this file is imported by, or imports
// from, the scoring engine (career-profile.ts / scoring.ts /
// family-ranking.ts / target-vector.ts).

import type { Bi } from "@/lib/career-center/types";

export type { Bi };

export const SECURITY_CAREER_PROFILE_VERSION = "scp-v1" as const;

export type CurrentStatus =
  | "new_to_industry"
  | "student"
  | "working_in_industry"
  | "career_change"
  | "changing_role"
  | "other";

export type YearsOfExperience = "<1" | "1-3" | "3-5" | "5-10" | "10+";

/** The durable, user-editable row in `security_career_profiles`. */
export interface SecurityCareerProfileV1 {
  profileVersion: typeof SECURITY_CAREER_PROFILE_VERSION;
  currentStatus: CurrentStatus | null;
  currentProfessionSlug: string | null; // FK to cig_professions.slug
  currentProfessionOther: string | null; // set only when no slug is chosen
  yearsOfExperience: YearsOfExperience | null;
  updatedAt: string;
}

/** The immutable copy stamped onto `assessment_runs.profile_snapshot`. */
export interface SecurityCareerProfileSnapshotV1 {
  profileVersion: typeof SECURITY_CAREER_PROFILE_VERSION;
  currentStatus: CurrentStatus | null;
  currentProfessionSlug: string | null;
  currentProfessionOther: string | null;
  yearsOfExperience: YearsOfExperience | null;
  snapshotAt: string;
}

export const CURRENT_STATUS_VALUES: readonly CurrentStatus[] = [
  "new_to_industry",
  "student",
  "working_in_industry",
  "career_change",
  "changing_role",
  "other",
] as const;

export const YEARS_OF_EXPERIENCE_VALUES: readonly YearsOfExperience[] = [
  "<1",
  "1-3",
  "3-5",
  "5-10",
  "10+",
] as const;

/** Statuses that mean "already working in security" — the only ones that
 * reveal the profession/experience follow-up questions. */
export function isAlreadyWorkingInSecurity(status: CurrentStatus | null): boolean {
  return status === "working_in_industry" || status === "changing_role";
}

/** Editable client-side draft shape shared by ProfileStep and the
 * /my-career card — same fields as SecurityCareerProfileV1 minus the
 * server-owned version/timestamp. */
export interface SecurityCareerProfileDraft {
  currentStatus: CurrentStatus | null;
  currentProfessionSlug: string | null;
  currentProfessionOther: string | null;
  yearsOfExperience: YearsOfExperience | null;
}

export const EMPTY_SECURITY_CAREER_PROFILE_DRAFT: SecurityCareerProfileDraft = {
  currentStatus: null,
  currentProfessionSlug: null,
  currentProfessionOther: null,
  yearsOfExperience: null,
};

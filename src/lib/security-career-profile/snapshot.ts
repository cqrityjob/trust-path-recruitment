// Server-side snapshot helper — shared by every code path that inserts an
// `assessment_runs` row (currently: saveAssessmentRun in
// src/lib/journey/journey.functions.ts, and saveMyCareerProfileForJobs in
// src/lib/job-intelligence/relevance.functions.ts). Always reads the
// caller's OWN row via their RLS-scoped server client — never accepts a
// client-supplied snapshot as input.

import {
  SECURITY_CAREER_PROFILE_VERSION,
  type CurrentStatus,
  type SecurityCareerProfileSnapshotV1,
  type YearsOfExperience,
} from "./types";

type ProfileRow = {
  current_status: string | null;
  current_profession_slug: string | null;
  current_profession_other: string | null;
  years_of_experience: string | null;
};

export async function readSecurityCareerProfileSnapshot(
  supabase: any,
  userId: string,
): Promise<SecurityCareerProfileSnapshotV1 | null> {
  const { data, error } = await supabase
    .from("security_career_profiles")
    .select(
      "current_status, current_profession_slug, current_profession_other, years_of_experience",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as ProfileRow | null;
  if (!row) return null;

  return {
    profileVersion: SECURITY_CAREER_PROFILE_VERSION,
    currentStatus: row.current_status as CurrentStatus | null,
    currentProfessionSlug: row.current_profession_slug,
    currentProfessionOther: row.current_profession_other,
    yearsOfExperience: row.years_of_experience as YearsOfExperience | null,
    snapshotAt: new Date().toISOString(),
  };
}

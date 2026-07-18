// Security Career Profile — Phase 1 server functions.
//
// Pure owner-scoped CRUD, following the exact shape of
// src/lib/journey/journey.functions.ts. RLS on security_career_profiles
// already scopes every query to the caller's own row; these functions add
// no additional trust boundary beyond `requireSupabaseAuth`.
//
// Not consumed anywhere in the scoring engine. Not passed into
// computeCareerIntelligenceMatches. Phase 1 only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CURRENT_STATUS_VALUES,
  SECURITY_CAREER_PROFILE_VERSION,
  YEARS_OF_EXPERIENCE_VALUES,
  type CurrentStatus,
  type SecurityCareerProfileV1,
  type YearsOfExperience,
} from "./types";

type ProfileRow = {
  current_status: string | null;
  current_profession_slug: string | null;
  current_profession_other: string | null;
  years_of_experience: string | null;
  updated_at: string;
};

function toProfile(row: ProfileRow | null): SecurityCareerProfileV1 | null {
  if (!row) return null;
  return {
    profileVersion: SECURITY_CAREER_PROFILE_VERSION,
    currentStatus: row.current_status as CurrentStatus | null,
    currentProfessionSlug: row.current_profession_slug,
    currentProfessionOther: row.current_profession_other,
    yearsOfExperience: row.years_of_experience as YearsOfExperience | null,
    updatedAt: row.updated_at,
  };
}

// -------- Read --------

export const getMySecurityCareerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SecurityCareerProfileV1 | null> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data, error } = await supabase
      .from("security_career_profiles")
      .select(
        "current_status, current_profession_slug, current_profession_other, years_of_experience, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toProfile(data as ProfileRow | null);
  });

// -------- Upsert --------

const upsertSchema = z
  .object({
    currentStatus: z
      .enum(CURRENT_STATUS_VALUES as [CurrentStatus, ...CurrentStatus[]])
      .nullable()
      .optional(),
    currentProfessionSlug: z.string().min(1).nullable().optional(),
    currentProfessionOther: z.string().max(120).nullable().optional(),
    yearsOfExperience: z
      .enum(YEARS_OF_EXPERIENCE_VALUES as [YearsOfExperience, ...YearsOfExperience[]])
      .nullable()
      .optional(),
  })
  .refine((v) => !(v.currentProfessionSlug && v.currentProfessionOther), {
    message: "currentProfessionSlug and currentProfessionOther cannot both be set",
  });

export const upsertMySecurityCareerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }): Promise<SecurityCareerProfileV1> => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: row, error } = await supabase
      .from("security_career_profiles")
      .upsert(
        {
          user_id: userId,
          profile_version: SECURITY_CAREER_PROFILE_VERSION,
          current_status: data.currentStatus ?? null,
          current_profession_slug: data.currentProfessionSlug ?? null,
          current_profession_other: data.currentProfessionOther ?? null,
          years_of_experience: data.yearsOfExperience ?? null,
        },
        { onConflict: "user_id" },
      )
      .select(
        "current_status, current_profession_slug, current_profession_other, years_of_experience, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return toProfile(row as ProfileRow)!;
  });

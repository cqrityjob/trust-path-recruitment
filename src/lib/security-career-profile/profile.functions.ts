// The canonical Professional Profile — server functions.
//
// ── WHAT THIS TABLE IS NOW ─────────────────────────────────────────────
//
// `security_career_profiles` is the CANONICAL, single-writer home for the
// self-reported career facts that used to be collected in more than one
// place: current status, current profession, experience band. Three
// surfaces edit that one row — "Din karriärprofil" on /my-career, the
// pre-assessment profile step, and the Career Discovery career-context step
// — and none of them keeps a copy of its own. The Security Passport shows
// the profession and no longer writes it; the database mirrors the
// canonical value into sp_passport_profiles.cig_profession_slug so the
// disclosure package an employer receives still carries one
// (20261007090000).
//
// ── WHAT IT IS STILL NOT ───────────────────────────────────────────────
//
// Not evidence. Nothing in this file can produce a verified anything, and
// nothing here is read by the scoring engine (career-profile.ts /
// scoring.ts / family-ranking.ts / target-vector.ts). A profile edit
// changes the Career JOURNEY — where a person stands and what is reachable
// from there — and can never change Career DNA or profession affinity,
// which are frozen at the moment an assessment completes.
//
// Pure owner-scoped CRUD. RLS on security_career_profiles already scopes
// every query to the caller's own row; these functions add no additional
// trust boundary beyond `requireSupabaseAuth`.

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

/** The RLS-scoped Supabase client the auth middleware puts on the context.
 *
 *  Declared once, with one suppression, rather than repeated inline at every
 *  handler: the generated `Database` type does not describe every table these
 *  functions reach, and five identical casts with five identical suppressions
 *  is five places for the next one to be added without anybody noticing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScopedClient = any;

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
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };
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
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };

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

// -------- Partial patch: current profession only --------

/**
 * Writes ONLY the profession fields, leaving status and experience alone.
 *
 * `upsertMySecurityCareerProfile` above is a whole-row upsert — it maps
 * every absent field to NULL, which is correct for the editor that renders
 * all four controls at once and catastrophic for a caller that holds one.
 * The Passport's onboarding wizard asks for a profession and nothing else;
 * routing it through the full upsert would blank a candidate's status and
 * experience band as a side effect of a first-run question about their job.
 *
 * Two callers, one row, no second table — which is the whole point of the
 * consolidation. The write is an upsert because a holder may reach Passport
 * onboarding before they have ever opened /my-career.
 */
const professionSchema = z
  .object({
    currentProfessionSlug: z.string().min(1).max(80).nullable(),
    currentProfessionOther: z.string().max(120).nullable().optional(),
  })
  .refine((v) => !(v.currentProfessionSlug && v.currentProfessionOther), {
    message: "currentProfessionSlug and currentProfessionOther cannot both be set",
  });

export const setMyCurrentProfession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => professionSchema.parse(data))
  .handler(async ({ data, context }): Promise<SecurityCareerProfileV1> => {
    const { supabase, userId } = context as { supabase: ScopedClient; userId: string };

    const { data: row, error } = await supabase
      .from("security_career_profiles")
      .upsert(
        {
          user_id: userId,
          profile_version: SECURITY_CAREER_PROFILE_VERSION,
          current_profession_slug: data.currentProfessionSlug,
          current_profession_other: data.currentProfessionOther ?? null,
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

// -------- Unresolved duplicate-value conflicts: DELIBERATELY NOT READ HERE --
//
// The expand migration (20261007090000) records every pre-consolidation
// disagreement in `security_career_profile_reconciliations`, so nothing is
// lost and the rollback can put the Passport values back. There is no server
// function here that reads it, and that absence is a decision rather than an
// omission.
//
// Two reasons.
//
// The release contract. Application code that names an object introduced by
// an unapplied migration cannot merge -- scripts/schema-first-release-check.ts
// refuses it, because Lovable rebuilds from main at merge while migrations run
// when somebody applies them. Reading that table from here would make this
// whole application phase wait on the schema phase, which is exactly the
// coupling the expand/contract split exists to remove.
//
// And the product. The reconciliation may find ZERO conflicts on the hosted
// database. Shipping a "these two disagreed -- which is right?" prompt for a
// state nobody has yet observed is speculative; the log has RLS and grants
// ready for it, so the prompt is a small follow-up once phase A is applied and
// somebody has looked at what it found.

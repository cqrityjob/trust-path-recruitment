// Phase E — Personal Job Relevance server functions.
//
// - `saveMyCareerProfileForJobs` persists the slim Career Profile snapshot
//   the assessment page produces after a completed CIE run. The snapshot
//   is written as an `assessment_runs.result_summary` row so the existing
//   RLS on `assessment_runs` (user reads/writes own rows only) also
//   protects this data. No new tables and no CIE / CIG changes.
//
// - `getMyCareerProfileForJobs` reads the latest run for the caller and,
//   if its `result_summary` decodes into a valid `CareerProfileForJobsV1`,
//   returns it. Otherwise returns `{ hasProfile: false }` so the jobs UI
//   can invite the user to complete the assessment.
//
// Both functions are `.middleware([requireSupabaseAuth])`. Neither
// function can be called by an employer — RLS scopes `assessment_runs`
// to the row's own `user_id` and there is no cross-user read path. The
// Career Profile never leaves the candidate's own device / session
// except to be stored under their own user_id.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GRAPH_VERSION } from "@/lib/knowledge-graph/graph-meta";
import {
  PROFILE_FOR_JOBS_VERSION,
  isCareerProfileForJobsV1,
  type CareerProfileForJobsV1,
} from "@/lib/career-intelligence-engine/profile-for-jobs";
import { ENGINE_VERSION } from "@/lib/career-intelligence-engine/types";

const ASSESSMENT_ID = "career-guidance";

// -------- Save (upsert-style) --------

const saveSchema = z.object({
  locale: z.enum(["sv", "en"]).default("sv"),
  profile: z
    .object({
      version: z.literal(PROFILE_FOR_JOBS_VERSION),
      engineVersion: z.literal(ENGINE_VERSION),
      computedAt: z.string(),
      archetype: z
        .object({
          key: z.string(),
          labelSv: z.string(),
          labelEn: z.string(),
          strength: z.number(),
        })
        .nullable(),
      motivations: z.array(
        z.object({
          key: z.string(),
          labelSv: z.string(),
          labelEn: z.string(),
          strength: z.number(),
        }),
      ),
      familyScores: z.record(
        z.string(),
        z.object({
          currentFit: z.number(),
          potential: z.number(),
          memberCount: z.number(),
        }),
      ),
      slugScores: z.record(
        z.string(),
        z.object({
          familyKey: z.string(),
          currentFit: z.number(),
          potential: z.number(),
          confidence: z.enum(["stronger", "moderate", "limited"]),
          strongDims: z.array(z.string()),
          developDims: z.array(z.string()),
        }),
      ),
    })
    .passthrough(),
});

export const saveMyCareerProfileForJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Resolve the assessment version — required by the FK on
    // assessment_runs. If the row is missing (fresh environment) we can
    // silently no-op; the jobs UI degrades to "no profile" and the user
    // is invited to retake later.
    const { data: version } = await supabase
      .from("assessment_versions")
      .select("id")
      .eq("assessment_id", ASSESSMENT_ID)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version) return { saved: false as const, reason: "no_version" as const };

    const now = new Date().toISOString();
    // We keep one profile "current" per user by inserting a fresh run.
    // getMyCareerProfileForJobs orders by completed_at desc so the latest
    // insert wins. Older rows remain for auditability.
    const { data: run, error } = await supabase
      .from("assessment_runs")
      .insert({
        user_id: userId,
        assessment_id: ASSESSMENT_ID,
        assessment_version_id: version.id,
        graph_version: GRAPH_VERSION,
        locale: data.locale,
        status: "completed",
        completed_at: now,
        result_summary: { careerProfileForJobs: data.profile },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { saved: true as const, runId: run.id as string };
  });

// -------- Read --------

export type CareerProfileForJobsResponse =
  | { hasProfile: false }
  | {
      hasProfile: true;
      profile: CareerProfileForJobsV1;
      runId: string;
      completedAt: string;
    };

export const getMyCareerProfileForJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CareerProfileForJobsResponse> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data, error } = await supabase
      .from("assessment_runs")
      .select("id, completed_at, result_summary")
      .eq("user_id", userId)
      .eq("assessment_id", ASSESSMENT_ID)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const summary = row.result_summary as Record<string, unknown> | null;
      const candidate = summary?.careerProfileForJobs;
      if (isCareerProfileForJobsV1(candidate)) {
        return {
          hasProfile: true,
          profile: candidate,
          runId: row.id as string,
          completedAt: row.completed_at as string,
        };
      }
    }
    return { hasProfile: false };
  });
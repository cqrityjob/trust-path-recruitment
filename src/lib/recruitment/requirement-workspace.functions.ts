// The reviewed-profile workspace: the client side of slot 20270310100000
// (installed on the owner project 2026-10-09). Six read-only RPCs over the
// SAME server state the review panel edits:
//
//   impact      what a profile change touches, before the change is made;
//   history     the motivated changes of the profile (one row per change);
//   compare     two or three applications of ONE recruitment, each read by
//               rec_ri_get_review against the LATEST profile version -- or the
//               server refuses with RI_SOURCE_STALE (PT409) and the screen
//               re-reads instead of comparing against a version that is gone;
//   next        the next unreviewed OPEN application, with how many remain and
//               how many historical ones are excluded (they are never read as
//               confirmations of anything);
//   evidence    up to three requirements for a page of applications, criteria
//               as the server computed them.
//
// Nothing here ranks, scores or recommends. A comparison is a side-by-side of
// the server's own criteria, source-bound, against one profile version.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/database";
import {
  criterionSchema,
  requirementError,
  reviewSchema,
} from "./requirement-intelligence.functions";

type Context = { supabase: SupabaseClient<Database>; userId: string };

async function assertJob(ctx: Context, employerId: string, jobId: string) {
  const { data, error } = await ctx.supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("employer_id", employerId)
    .maybeSingle();
  if (error || !data) throw new Error("RECRUITMENT_NOT_PERMITTED");
}

const impactSchema = z.object({
  version: z.number(),
  received: z.number(),
  active: z.number(),
  archived: z.number(),
  withdrawn: z.number(),
  decided: z.number(),
  reviewedActive: z.number(),
});
export type ProfileChangeImpact = z.infer<typeof impactSchema>;

export const getProfileChangeImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        jobId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertJob(ctx, data.employerId, data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_profile_change_impact", {
      _job_id: data.jobId,
      _expected_version: data.expectedVersion,
    });
    if (result.error) throw requirementError(result.error);
    return impactSchema.parse(result.data);
  });

const historyEntrySchema = z.object({
  version: z.number(),
  reason: z.string(),
  actorId: z.string().nullable(),
  reviewedAt: z.string(),
  impact: impactSchema.partial().nullable(),
});
export type ProfileChangeHistoryEntry = z.infer<typeof historyEntrySchema>;

/** The motivated changes, newest first. A version that is NOT in this list
 *  was confirmed before slot 20270313100000 through the older path and has no
 *  recorded reason; the client shows that absence as such. */
export const getProfileChangeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ProfileChangeHistoryEntry[]> => {
    const ctx = context as Context;
    await assertJob(ctx, data.employerId, data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_profile_change_history", { _job_id: data.jobId });
    if (result.error) throw requirementError(result.error);
    return z.array(historyEntrySchema).parse(result.data);
  });

const comparedSchema = z.object({ name: z.string().nullable(), review: reviewSchema });
export type ComparedApplication = z.infer<typeof comparedSchema>;

export const compareApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        jobId: z.string().uuid(),
        profileId: z.string().uuid(),
        applicationIds: z.array(z.string().uuid()).min(2).max(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ComparedApplication[]> => {
    const ctx = context as Context;
    await assertJob(ctx, data.employerId, data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_compare_applications", {
      _job_id: data.jobId,
      _profile_id: data.profileId,
      _application_ids: data.applicationIds,
    });
    if (result.error) throw requirementError(result.error);
    return z.array(comparedSchema).parse(result.data);
  });

const nextSchema = z.object({
  remaining: z.number(),
  historicalExcluded: z.number(),
  next: z
    .object({
      applicationId: z.string(),
      jobId: z.string(),
      name: z.string().nullable(),
      profileVersion: z.number().nullable(),
    })
    .nullable(),
});
export type NextUnreviewed = z.infer<typeof nextSchema>;

export const getNextUnreviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<NextUnreviewed> => {
    const ctx = context as Context;
    if (data.jobId) await assertJob(ctx, data.employerId, data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_next_unreviewed", {
      _employer_id: data.employerId,
      _job_id: data.jobId,
    });
    if (result.error) throw requirementError(result.error);
    return nextSchema.parse(result.data);
  });

export type PageEvidence = Record<string, z.infer<typeof criterionSchema>[]>;

export const getPageEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        jobId: z.string().uuid(),
        profileId: z.string().uuid(),
        applicationIds: z.array(z.string().uuid()).min(1).max(100),
        requirementIds: z.array(z.string().uuid()).min(1).max(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PageEvidence> => {
    const ctx = context as Context;
    await assertJob(ctx, data.employerId, data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_page_evidence", {
      _job_id: data.jobId,
      _profile_id: data.profileId,
      _application_ids: data.applicationIds,
      _requirement_ids: data.requirementIds,
    });
    if (result.error) throw requirementError(result.error);
    return z.record(z.string(), z.array(criterionSchema)).parse(result.data ?? {});
  });

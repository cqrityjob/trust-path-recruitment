import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SavedCareerReportV1 } from "@/lib/career-intelligence-engine/report-types";

// -----------------------------------------------------------------------------
// Employer Report MVP (Public Assessment v2.0, Phase E) -- admin-only preview.
//
// Deliberately narrow scope, reported explicitly (not silent): this reads a
// completed candidate report for platform-admin preview/testing purposes
// only. It is NOT a general employer self-service sharing feature -- no
// consent/sharing relationship between a specific employer and a specific
// candidate exists in the schema yet (a genuine gap, flagged in the Phase B
// review), and building that safely is out of today's scope. Gated by the
// same is_platform_admin() check used throughout this codebase (e.g.
// admin.functions.ts), backed by the additive admin-read RLS policies in
// 20260721090000_public_assessment_v2.sql -- defense in depth, not a single
// control point.
//
// Returns no candidate PII beyond what the report itself already contains
// (no name/email) -- deliberately minimal, matching this route's role as a
// content/format preview rather than a real employer-candidate relationship
// view.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

export type AdminCandidateReportResponse = {
  run: {
    id: string;
    completedAt: string | null;
    status: string;
    assessmentVersionId: string | null;
  } | null;
  report: SavedCareerReportV1 | null;
};

const getReportSchema = z.object({ runId: z.string().uuid() });

export const adminGetCandidateReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => getReportSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AdminCandidateReportResponse> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { supabase } = ctx;

    const [{ data: run }, { data: reportRow }] = await Promise.all([
      supabase
        .from("assessment_runs")
        .select("id, completed_at, status, assessment_version_id")
        .eq("id", data.runId)
        .maybeSingle(),
      supabase
        .from("assessment_run_reports")
        .select("report")
        .eq("run_id", data.runId)
        .maybeSingle(),
    ]);

    return {
      run: run
        ? {
            id: run.id as string,
            completedAt: run.completed_at as string | null,
            status: run.status as string,
            assessmentVersionId: run.assessment_version_id as string | null,
          }
        : null,
      report: (reportRow?.report as SavedCareerReportV1 | undefined) ?? null,
    };
  });

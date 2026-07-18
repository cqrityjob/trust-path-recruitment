// Phase 2 — Saved Career Intelligence Report server functions.
//
// saveMyCareerReport computes the report using the existing, unmodified
// scoring engine (never trusts a client-supplied result), then persists it
// atomically via the service-role-only `save_career_report` RPC — see
// supabase/migrations/20260718170443_assessment_run_reports.sql. The RPC
// cannot be called by any client-side code; this handler, gated by
// requireSupabaseAuth, is the only path that can ever reach it.
//
// getMySavedReport is a plain owner-scoped read through the caller's own
// RLS-scoped client — reads never go through the service-role client.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GRAPH_VERSION } from "@/lib/knowledge-graph/graph-meta";
import type { AnswerMap } from "@/lib/career-assessment/types";
import { computeEngineResultV1 } from "./index";
import { buildTargetVectorsFromLegacy } from "./target-vector";
import { loadEnrichmentForSlugs } from "./compute.functions";
import { buildCareerProfileForJobs } from "./profile-for-jobs";
import { readSecurityCareerProfileSnapshot } from "@/lib/security-career-profile/snapshot";
import {
  REPORT_VERSION,
  type SavedCareerReportV1,
} from "./report-types";
import { ASSESSMENT_ID, buildCompareEnrichment } from "./report.server";

// -------- Save (atomic, server-only) --------

const saveReportSchema = z.object({
  completionId: z.string().uuid(),
  answers: z.record(z.string(), z.any()),
  locale: z.enum(["sv", "en"]).default("sv"),
  topN: z.number().int().min(1).max(10).optional(),
});

export const saveMyCareerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveReportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Compute via the existing, unmodified scoring engine. Never trust a
    // client-supplied EngineResultV1 — this is the only source of report
    // content, and it is computed here, not accepted as input.
    const targets = buildTargetVectorsFromLegacy();
    const enrichmentByLegacySlug = await loadEnrichmentForSlugs(targets.map((t) => t.legacySlug));
    const engineResult = computeEngineResultV1({
      answers: data.answers as AnswerMap,
      targets,
      enrichmentByLegacySlug,
      options: { topN: data.topN ?? 3 },
    });
    const compareEnrichment = buildCompareEnrichment(engineResult.matches);

    // Still populate result_summary.careerProfileForJobs in its current
    // shape, unchanged, for 100% backward compatibility with
    // getMyCareerProfileForJobs and the /jobs relevance UI.
    const careerProfileForJobs = buildCareerProfileForJobs(data.answers as AnswerMap);

    // One read, reused for both the assessment_runs.profile_snapshot copy
    // and the report's embedded copy — no risk of the two diverging.
    const profileSnapshot = await readSecurityCareerProfileSnapshot(supabase, userId);

    const { data: version } = await supabase
      .from("assessment_versions")
      .select("id")
      .eq("assessment_id", ASSESSMENT_ID)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!version) {
      return { saved: false as const, reason: "no_version" as const };
    }

    const report: SavedCareerReportV1 = {
      reportVersion: REPORT_VERSION,
      completionId: data.completionId,
      savedAt: new Date().toISOString(),
      engineVersion: engineResult.engineVersion,
      graphVersion: GRAPH_VERSION,
      inputsHash: engineResult.inputsHash,
      locale: data.locale,
      engineResult,
      compareEnrichment,
      profileSnapshot,
    };

    // Server-only service-role client — same dynamic-import pattern already
    // used in src/lib/job-intelligence/admin.functions.ts. A top-level
    // import here would be unsafe: this file ships to the client bundle.
    // Cast to `any`: the generated Database type (src/integrations/supabase/
    // types.ts) is regenerated from the connected project and does not yet
    // know about save_career_report until the migration is applied there —
    // same reason context.supabase is typed `any` throughout this codebase.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcResult, error } = await (supabaseAdmin as any).rpc("save_career_report", {
      p_user_id: userId,
      p_completion_id: data.completionId,
      p_assessment_id: ASSESSMENT_ID,
      p_assessment_version_id: version.id,
      p_graph_version: GRAPH_VERSION,
      p_locale: data.locale,
      p_result_summary: { careerProfileForJobs },
      p_profile_snapshot: profileSnapshot,
      p_report: report,
      p_report_version: REPORT_VERSION,
      p_engine_version: engineResult.engineVersion,
      p_profile_version: profileSnapshot?.profileVersion ?? null,
      p_inputs_hash: engineResult.inputsHash,
    });
    if (error) throw new Error(error.message);

    const row = (rpcResult as Array<{ run_id: string; created_new: boolean }> | null)?.[0];
    if (!row) throw new Error("save_career_report returned no result");
    return { saved: true as const, runId: row.run_id, createdNew: row.created_new };
  });

// -------- Read (owner-scoped RLS, never the service-role client) --------

export type GetMySavedReportResponse = {
  run: { id: string; completedAt: string | null; status: string } | null;
  report: SavedCareerReportV1 | null;
};

const getReportSchema = z.object({ runId: z.string().uuid() });

export const getMySavedReport = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => getReportSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<GetMySavedReportResponse> => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const [{ data: run }, { data: reportRow }] = await Promise.all([
      supabase
        .from("assessment_runs")
        .select("id, completed_at, status")
        .eq("id", data.runId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("assessment_run_reports")
        .select("report")
        .eq("run_id", data.runId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    return {
      run: run
        ? {
            id: run.id as string,
            completedAt: run.completed_at as string | null,
            status: run.status as string,
          }
        : null,
      report: (reportRow?.report as SavedCareerReportV1 | undefined) ?? null,
    };
  });

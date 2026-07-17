import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GRAPH_VERSION } from "@/lib/knowledge-graph/graph-meta";
import { computeGapAnalysis } from "@/lib/knowledge-graph/gap-engine";

const ASSESSMENT_ID = "career-guidance";

// -------- Save assessment run --------

const saveRunSchema = z.object({
  locale: z.enum(["sv", "en"]).default("sv"),
  resultSummary: z.record(z.string(), z.any()).default({}),
});

export const saveAssessmentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveRunSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: version, error: vErr } = await supabase
      .from("assessment_versions")
      .select("id")
      .eq("assessment_id", ASSESSMENT_ID)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (vErr || !version) {
      throw new Error("No active assessment version found");
    }

    const now = new Date().toISOString();
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
        result_summary: data.resultSummary,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { runId: run.id as string, graphVersion: GRAPH_VERSION };
  });

// -------- List runs --------

export const listAssessmentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data, error } = await supabase
      .from("assessment_runs")
      .select("id, assessment_id, status, started_at, completed_at, result_summary, graph_version")
      .eq("user_id", userId)
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -------- Target professions --------

const setTargetSchema = z.object({
  professionId: z.string().min(1),
  isPrimary: z.boolean().default(true),
  sourceRunId: z.string().uuid().nullable().optional(),
});

export const setTargetProfession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => setTargetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    if (data.isPrimary) {
      await supabase
        .from("target_professions")
        .update({ is_primary: false })
        .eq("user_id", userId);
    }

    const { data: existing } = await supabase
      .from("target_professions")
      .select("id")
      .eq("user_id", userId)
      .eq("profession_id", data.professionId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("target_professions")
        .update({
          is_primary: data.isPrimary,
          source_run_id: data.sourceRunId ?? null,
          graph_version: GRAPH_VERSION,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { targetId: existing.id as string };
    }

    const { data: inserted, error } = await supabase
      .from("target_professions")
      .insert({
        user_id: userId,
        profession_id: data.professionId,
        is_primary: data.isPrimary,
        source_run_id: data.sourceRunId ?? null,
        graph_version: GRAPH_VERSION,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { targetId: inserted.id as string };
  });

export const listTargetProfessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data, error } = await supabase
      .from("target_professions")
      .select("id, profession_id, is_primary, source_run_id, graph_version, chosen_at, notes")
      .eq("user_id", userId)
      .order("chosen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const removeTargetSchema = z.object({ targetId: z.string().uuid() });

export const removeTargetProfession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => removeTargetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { error } = await supabase
      .from("target_professions")
      .delete()
      .eq("id", data.targetId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Gap snapshot --------

const gapSnapshotSchema = z.object({
  targetId: z.string().uuid(),
  formalReports: z
    .array(
      z.object({
        requirementId: z.string(),
        status: z.enum(["self_reported_as_met", "not_applicable"]),
      }),
    )
    .default([]),
  yearsExperience: z.number().min(0).max(60).nullable().optional(),
});

export const createGapSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gapSnapshotSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: target, error: tErr } = await supabase
      .from("target_professions")
      .select("id, profession_id, source_run_id")
      .eq("id", data.targetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (tErr || !target) throw new Error("Target not found");

    const analysis = computeGapAnalysis({
      professionId: target.profession_id,
      formalReports: data.formalReports,
      yearsExperience: data.yearsExperience ?? null,
    });

    const { data: inserted, error } = await supabase
      .from("gap_snapshots")
      .insert({
        user_id: userId,
        target_profession_id: target.id,
        profession_id: target.profession_id,
        graph_version: analysis.graphVersion,
        source_run_id: target.source_run_id ?? null,
        competence_gaps: analysis.competenceGaps,
        formal_requirement_gaps: analysis.formalRequirementGaps,
        experience_gaps: analysis.experienceGaps,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { snapshotId: inserted.id as string, analysis };
  });

// -------- Milestones (minimal for beta) --------

const addMilestoneSchema = z.object({
  targetId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  milestoneKind: z
    .enum(["action", "education", "certification", "formal_requirement", "experience", "custom"])
    .default("action"),
  targetRef: z.string().max(200).optional(),
});

export const addNextActionMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addMilestoneSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: target, error: tErr } = await supabase
      .from("target_professions")
      .select("id")
      .eq("id", data.targetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (tErr || !target) throw new Error("Target not found");

    let planId: string | undefined;
    const { data: existingPlan } = await supabase
      .from("career_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("target_profession_id", target.id)
      .maybeSingle();
    if (existingPlan) {
      planId = existingPlan.id;
    } else {
      const { data: p, error: pErr } = await supabase
        .from("career_plans")
        .insert({ user_id: userId, target_profession_id: target.id, graph_version: GRAPH_VERSION })
        .select("id")
        .single();
      if (pErr || !p) throw new Error(pErr?.message ?? "Failed to create plan");
      planId = p.id;
    }

    const { data: inserted, error } = await supabase
      .from("career_milestones")
      .insert({
        user_id: userId,
        plan_id: planId!,
        title: data.title,
        description: data.description ?? null,
        milestone_kind: data.milestoneKind,
        target_ref: data.targetRef ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { milestoneId: inserted.id as string, planId };
  });

export const listMilestonesForTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ targetId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: plan } = await supabase
      .from("career_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("target_profession_id", data.targetId)
      .maybeSingle();
    if (!plan) return [];
    const { data: rows, error } = await supabase
      .from("career_milestones")
      .select("id, title, description, milestone_kind, target_ref, status, position, due_date, created_at")
      .eq("plan_id", plan.id)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

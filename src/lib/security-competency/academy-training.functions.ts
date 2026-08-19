// Training delivery — the participant's development surface.
//
// ── ONE ENGINE, NOT TWO ───────────────────────────────────────────────
//
// A training module's activity is delivered by the SAME functions the
// assessment path uses: getAcademyAttemptItems, saveAcademyResponse and
// getLearningFeedback, all in academy-delivery.functions.ts and
// academy-learning.functions.ts. Nothing here re-implements question delivery,
// answer saving or feedback. This file adds only what training needs on top:
// which programme, which modules, and how far through them somebody is.
//
// ── WHY RESUME IS NOT A FEATURE HERE ──────────────────────────────────
//
// `startTrainingModule` is also the resume call. The RPC returns the existing
// in-progress attempt when there is one rather than creating a second, and
// scp_get_attempt_items already returns the participant's saved answers. So
// leaving and coming back is the same code path as arriving for the first
// time, and there is no separate resume branch anywhere that could rot.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx, RpcRow } from "./rpc-types";

export class AcademyTrainingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcademyTrainingError";
  }
}

function fail(message: string, fallback: string): AcademyTrainingError {
  const m = /SCP_[A-Z_]+/.exec(message ?? "");
  return new AcademyTrainingError(m ? m[0] : fallback, message ?? fallback);
}

/** One row of the combined Academy list.
 *
 *  `workKind` discriminates. Everything else is deliberately common so the
 *  Academy renders one list a participant can read top to bottom, rather than
 *  two stacked products they have to reconcile. */
export type AcademyWorkItem = {
  workKind: "assessment" | "training";
  /** Attempt id for an assessment, assignment id for training. */
  workId: string;
  titleSv: string | null;
  titleEn: string | null;
  employerName: string | null;
  status: string;
  progressDone: number;
  progressTotal: number;
  assignedAt: string | null;
  deadline: string | null;
  releasedAt: string | null;
  purposeSv: string | null;
  purposeEn: string | null;
};

export type TrainingProgramme = {
  assignmentId: string;
  programVersionId: string;
  versionNumber: number;
  nameSv: string;
  nameEn: string;
  purposeSv: string | null;
  purposeEn: string | null;
  doesNotMeasureSv: string[];
  doesNotMeasureEn: string[];
  employerName: string | null;
  language: string;
  status: string;
  assignedAt: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  modulesTotal: number;
  modulesCompleted: number;
  estimatedMinutes: number | null;
};

export type TrainingModule = {
  moduleVersionId: string;
  displayOrder: number;
  nameSv: string;
  nameEn: string;
  summarySv: string | null;
  summaryEn: string | null;
  estimatedMinutes: number | null;
  /** Whether this module has a knowledge activity at all. A read-only module
   *  is a legitimate shape, and the UI must not imply questions that do not
   *  exist. */
  hasActivity: boolean;
  status: "not_started" | "in_progress" | "completed";
  attemptId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  answered: number;
  totalItems: number;
};

const assignmentInput = z.object({ assignmentId: z.string().uuid() });
const moduleInput = z.object({
  assignmentId: z.string().uuid(),
  moduleVersionId: z.string().uuid(),
});

/** Assessments and training in one list, from one RPC.
 *
 *  Not an extension of scp_my_academy_assignments: that function selects FROM
 *  scp_attempts, so training could only appear there by minting an attempt that
 *  answers nothing. */
export const listAcademyWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcademyWorkItem[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_my_academy_work");
    if (error) throw fail(error.message, "academy_work_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      workKind: String(r.work_kind) as AcademyWorkItem["workKind"],
      workId: String(r.work_id),
      titleSv: (r.title_sv as string) ?? null,
      titleEn: (r.title_en as string) ?? null,
      employerName: (r.employer_name as string) ?? null,
      status: String(r.status),
      progressDone: Number(r.progress_done ?? 0),
      progressTotal: Number(r.progress_total ?? 0),
      assignedAt: (r.assigned_at as string) ?? null,
      deadline: (r.deadline as string) ?? null,
      releasedAt: (r.released_at as string) ?? null,
      purposeSv: (r.purpose_sv as string) ?? null,
      purposeEn: (r.purpose_en as string) ?? null,
    }));
  });

export const getTrainingProgramme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentInput.parse(d))
  .handler(async ({ data, context }): Promise<TrainingProgramme | null> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_my_training_programme", {
      _assignment_id: data.assignmentId,
    });
    if (error) throw fail(error.message, "training_programme_failed");
    const r = (rows ?? [])[0] as RpcRow | undefined;
    if (!r) return null;
    return {
      assignmentId: String(r.assignment_id),
      programVersionId: String(r.program_version_id),
      versionNumber: Number(r.version_number ?? 1),
      nameSv: String(r.name_sv),
      nameEn: String(r.name_en),
      purposeSv: (r.purpose_sv as string) ?? null,
      purposeEn: (r.purpose_en as string) ?? null,
      doesNotMeasureSv: (r.does_not_measure_sv as string[]) ?? [],
      doesNotMeasureEn: (r.does_not_measure_en as string[]) ?? [],
      employerName: (r.employer_name as string) ?? null,
      language: String(r.language ?? "sv"),
      status: String(r.status),
      assignedAt: (r.assigned_at as string) ?? null,
      dueAt: (r.due_at as string) ?? null,
      startedAt: (r.started_at as string) ?? null,
      completedAt: (r.completed_at as string) ?? null,
      modulesTotal: Number(r.modules_total ?? 0),
      modulesCompleted: Number(r.modules_completed ?? 0),
      estimatedMinutes: (r.estimated_minutes as number) ?? null,
    };
  });

export const listTrainingModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentInput.parse(d))
  .handler(async ({ data, context }): Promise<TrainingModule[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_my_training_modules", {
      _assignment_id: data.assignmentId,
    });
    if (error) throw fail(error.message, "training_modules_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      moduleVersionId: String(r.module_version_id),
      displayOrder: Number(r.display_order ?? 0),
      nameSv: String(r.name_sv),
      nameEn: String(r.name_en),
      summarySv: (r.summary_sv as string) ?? null,
      summaryEn: (r.summary_en as string) ?? null,
      estimatedMinutes: (r.estimated_minutes as number) ?? null,
      hasActivity: Boolean(r.has_activity),
      status: String(r.status) as TrainingModule["status"],
      attemptId: (r.attempt_id as string) ?? null,
      startedAt: (r.started_at as string) ?? null,
      completedAt: (r.completed_at as string) ?? null,
      answered: Number(r.answered ?? 0),
      totalItems: Number(r.total_items ?? 0),
    }));
  });

/** Start OR resume. Returns the learning attempt id, or null for a module with
 *  no activity. */
export const startTrainingModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moduleInput.parse(d))
  .handler(async ({ data, context }): Promise<{ attemptId: string | null }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_start_training_module", {
      _assignment_id: data.assignmentId,
      _module_version_id: data.moduleVersionId,
    });
    if (error) throw fail(error.message, "start_module_failed");
    return { attemptId: id ? String(id) : null };
  });

export const completeTrainingModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moduleInput.parse(d))
  .handler(async ({ data, context }): Promise<{ completed: boolean }> => {
    const ctx = context as Ctx;
    const { data: ok, error } = await ctx.supabase.rpc("scp_complete_training_module", {
      _assignment_id: data.assignmentId,
      _module_version_id: data.moduleVersionId,
    });
    if (error) throw fail(error.message, "complete_module_failed");
    return { completed: Boolean(ok) };
  });

/** Completing the programme records development activity. It writes
 *  training_completion evidence, whose source type carries
 *  counts_toward_maturity = false, so measured competence does not move. */
export const completeTrainingProgramme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignmentInput.parse(d))
  .handler(async ({ data, context }): Promise<{ evidenceRows: number }> => {
    const ctx = context as Ctx;
    const { data: n, error } = await ctx.supabase.rpc("scp_complete_training_programme", {
      _assignment_id: data.assignmentId,
    });
    if (error) throw fail(error.message, "complete_programme_failed");
    return { evidenceRows: Number(n ?? 0) };
  });

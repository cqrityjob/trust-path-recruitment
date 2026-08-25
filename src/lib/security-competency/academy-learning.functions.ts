// Learning Mode — the participant's practice surface.
//
// ── WHY FEEDBACK IS A SECOND CALL ─────────────────────────────────────
//
// Delivery returns questions. Feedback returns the preferred response and why
// the weaker alternatives are weaker. If those travelled together, the answer
// would sit in the payload before the learner had attempted the question, and
// the module would teach nothing — the learner would simply read the right
// answer off the network tab.
//
// So `getLearningFeedback` is called AFTER an answer exists, and the RPC
// enforces all three preconditions itself: a learning attempt, a learning item,
// and an answer already recorded. This file cannot loosen any of them.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx, RpcRow } from "./rpc-types";

export type LearningFeedbackOption = {
  optionId: string;
  label: string;
  isPreferred: boolean;
  feedback: string | null;
  errorType: string | null;
  chosen: boolean;
};

export type MyAssignment = {
  attemptId: string;
  mode: "assessment" | "learning";
  programmeNameSv: string | null;
  programmeNameEn: string | null;
  employerName: string | null;
  attemptStatus: string;
  answered: number;
  totalItems: number;
  deadline: string | null;
  releasedAt: string | null;
  purposeSv: string | null;
  purposeEn: string | null;
};

export type LearningModuleSummary = {
  moduleVersionId: string;
  nameSv: string;
  nameEn: string;
  summarySv: string;
  summaryEn: string;
  estimatedMinutes: number | null;
};

export class AcademyLearningError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcademyLearningError";
  }
}

function fail(message: string, fallback: string): AcademyLearningError {
  const m = /SCP_[A-Z_]+/.exec(message ?? "");
  return new AcademyLearningError(m ? m[0] : fallback, message ?? fallback);
}

/** Everything this person has been asked to do, plus every practice run they
 *  have started. Scoped by subject identity inside the RPC. */
export const listMyAcademyWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAssignment[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_my_academy_assignments");
    if (error) throw fail(error.message, "my_work_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      attemptId: String(r.attempt_id),
      mode: r.mode as "assessment" | "learning",
      programmeNameSv: r.programme_name_sv ?? null,
      programmeNameEn: r.programme_name_en ?? null,
      employerName: r.employer_name ?? null,
      attemptStatus: String(r.attempt_status),
      answered: Number(r.answered ?? 0),
      totalItems: Number(r.total_items ?? 0),
      deadline: r.deadline ?? null,
      releasedAt: r.released_at ?? null,
      purposeSv: r.purpose_sv ?? null,
      purposeEn: r.purpose_en ?? null,
    }));
  });

/** How much assessment work this person actually has, split by whether it still
 *  needs them.
 *
 *  The site header needs to decide whether to show a way in, and to say
 *  something useful when it does. It does not need programme names, employer
 *  names, purpose text or deadlines, so this returns two numbers and the full
 *  rows stay on the server.
 *
 *  Learning attempts are excluded on purpose: practice is self-directed and is
 *  not something an employer asked of anyone, so it must not produce a badge
 *  that reads as an outstanding obligation.
 *
 *  Never throws. A participant's navigation must not break because an Academy
 *  read failed — the entry simply does not appear. */
export const countMyAcademyWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ total: number; actionable: number }> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_my_academy_assignments");
    if (error) return { total: 0, actionable: 0 };
    const assessments = (rows ?? []).filter((r: RpcRow) => r.mode === "assessment");
    return {
      total: assessments.length,
      // Still open, so there is something for the person to go and do. A
      // submitted run awaiting review is deliberately not actionable: nothing
      // is being asked of them and a badge would imply otherwise.
      actionable: assessments.filter((r: RpcRow) => String(r.attempt_status) === "in_progress")
        .length,
    };
  });

/** The published learning forms available to practise on. */
export const listLearningModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LearningModuleSummary[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase
      .from("scp_module_versions")
      .select("id, name_sv, name_en, summary_sv, summary_en, estimated_minutes, display_order")
      .eq("content_status", "published")
      .order("display_order", { ascending: true });
    if (error) throw fail(error.message, "modules_failed");
    return (rows ?? []).map((r: RpcRow) => ({
      moduleVersionId: String(r.id),
      nameSv: String(r.name_sv),
      nameEn: String(r.name_en),
      summarySv: String(r.summary_sv),
      summaryEn: String(r.summary_en),
      estimatedMinutes: r.estimated_minutes ?? null,
    }));
  });

/** The learning form a module practises on. Learning content is published, so
 *  this is a plain read; the mode check that matters happens when the attempt
 *  is started. */
/** Whether practice may be offered to this caller at all.
 *
 *  True when they hold at least one EMPLOYEE-purpose item of work. A person
 *  whose only relationship with the platform is a recruitment assessment gets
 *  false — see getLearningFormForModule's header for why practice beside a
 *  live selection instrument is a claim the product must not make.
 *
 *  Fails closed: a read that did not answer is not permission to practise. */
async function practiceIsOpenTo(ctx: Ctx): Promise<boolean> {
  const { data: work, error } = await ctx.supabase.rpc("scp_my_academy_work");
  if (error) return false;
  return (work ?? []).some((r: RpcRow) => String(r.use_case ?? "workforce") !== "recruitment");
}

/** The practice form, IF practice is open to this person at all.
 *
 *  ── PRACTICE IS AN EMPLOYEE AFFORDANCE, NOT A RECRUITMENT ONE ─────────
 *
 *  Learning Mode serves its own items and never the ones on a live
 *  assessment, so there is no item-exposure route here. The problem is what
 *  offering it MEANS. Beside a recruitment assessment, "practise / try
 *  again" reads to a candidate as another attempt at the thing they are
 *  being selected on — coaching on a live selection instrument, and an
 *  implied unlimited retake. Neither is true, and neither may be implied.
 *
 *  So eligibility is a purpose question, and it is answered here rather
 *  than only in the UI: a surface that merely hides a link still leaves the
 *  route reachable by anybody who types it. Somebody whose ONLY relationship
 *  with the platform is a recruitment assessment gets `null`, exactly as an
 *  account with no subject identity already did — and
 *  /academy/learning/$formId has nothing to open.
 *
 *  Employee-purpose work of ANY kind (assessment or training) opens
 *  practice, including for a person who also happens to be a candidate
 *  somewhere else. Being an applicant at one organisation does not remove
 *  a development affordance you hold at another. */
export const getLearningFormForModule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ formId: string } | null> => {
    const ctx = context as Ctx;

    if (!(await practiceIsOpenTo(ctx))) return null;

    const { data: rows, error } = await ctx.supabase
      .from("scp_forms")
      .select("id, slug")
      .eq("slug", "fixture-learning-form")
      .maybeSingle();
    if (error || !rows) return null;
    return { formId: String(rows.id) };
  });

export const startLearningAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ formId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ attemptId: string }> => {
    const ctx = context as Ctx;
    // The same purpose gate the form lookup applies. Hiding the link is not
    // enough: /academy/learning/<formId> is a typeable URL, and a candidate
    // whose only work is a recruitment assessment must not be able to start
    // a practice run by reaching past the surface that declined to offer one.
    if (!(await practiceIsOpenTo(ctx))) {
      throw new AcademyLearningError("SCP_PRACTICE_NOT_AVAILABLE", "SCP_PRACTICE_NOT_AVAILABLE");
    }
    const { data: id, error } = await ctx.supabase.rpc("scp_start_learning_attempt", {
      _form_id: data.formId,
    });
    if (error) throw fail(error.message, "start_failed");
    return { attemptId: String(id) };
  });

export const getLearningFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        itemVersionId: z.string().uuid(),
        locale: z.enum(["sv", "en"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<LearningFeedbackOption[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_get_learning_feedback", {
      _attempt_id: data.attemptId,
      _item_version_id: data.itemVersionId,
      _language: data.locale === "en" ? "en-GB" : "sv-SE",
    });
    // An empty result is the normal answer when a precondition is unmet — the
    // learner has not answered yet, or this is not a learning item. Not an error.
    if (error) return [];
    return (rows ?? []).map((r: RpcRow) => ({
      optionId: String(r.option_id),
      label: String(r.label),
      isPreferred: Boolean(r.is_preferred),
      feedback: r.feedback ?? null,
      errorType: r.error_type ?? null,
      chosen: Boolean(r.chosen),
    }));
  });

export const completeLearningModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ evidenceWritten: number }> => {
    const ctx = context as Ctx;
    const { data: n, error } = await ctx.supabase.rpc("scp_complete_learning_module", {
      _attempt_id: data.attemptId,
    });
    if (error) throw fail(error.message, "complete_failed");
    return { evidenceWritten: Number(n ?? 0) };
  });

/** The signed-in person's own subject id, for their own progress and
 *  recommendations. Returns null rather than throwing when they have no
 *  competence profile yet — a perfectly normal state. */
export const getMySubjectId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string | null> => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("scp_subject_identities")
      .select("subject_id")
      .maybeSingle();
    if (error || !data) return null;
    return String(data.subject_id);
  });

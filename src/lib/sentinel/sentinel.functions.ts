import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Ctx } from "@/lib/security-competency/rpc-types";
import type { Question, Session, SentinelReport } from "./types";
const attempt = z.object({ attemptId: z.string().uuid() });
function failure(error: { message?: string }) {
  console.error("[sentinel]", error.message);
  return new Error(
    error.message?.includes("SENTINEL_REVISION_CONFLICT")
      ? "SENTINEL_REVISION_CONFLICT"
      : "SENTINEL_REQUEST_FAILED",
  );
}
export const sentinelSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    attempt
      .extend({
        action: z.enum(["get", "start", "save", "finish"]).default("get"),
        questionId: z.string().max(100).nullable().default(null),
        optionId: z.string().max(10).nullable().default(null),
        revision: z.number().int().nonnegative().nullable().default(null),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<Session | null> => {
    const { data: row, error } = await (context as Ctx).supabase.rpc("sentinel_session", {
      _attempt_id: data.attemptId,
      _action: data.action,
      _question_id: data.questionId,
      _option_id: data.optionId,
      _revision: data.revision,
    });
    if (error) throw failure(error);
    return row;
  });
export const sentinelPractice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => attempt.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ question: Question; key: string; explanation: { sv: string; en: string } }[]> => {
      const { data: rows, error } = await (context as Ctx).supabase.rpc("sentinel_practice", {
        _attempt_id: data.attemptId,
      });
      if (error) throw failure(error);
      // Practice keys are deliberately public for permitted participants; scored
      // bank metadata is never imported into this server-function source.
      return (rows ?? []).map(
        (r: { question: Question; key: string; explanation: { sv: string; en: string } }) => ({
          question: r.question,
          key: r.key,
          explanation: r.explanation,
        }),
      );
    },
  );
export const sentinelReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    attempt.extend({ employerId: z.string().uuid().nullable().default(null) }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      sentinel: true;
      status: string;
      report: SentinelReport | null;
      reportVisible: boolean;
    } | null> => {
      const { data: row, error } = await (context as Ctx).supabase.rpc("sentinel_report", {
        _attempt_id: data.attemptId,
        _employer_id: data.employerId,
      });
      if (error) {
        if (["PGRST202", "42883"].includes(error.code)) return null;
        throw failure(error);
      }
      return row;
    },
  );
export const sentinelEmployerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    attempt
      .extend({
        action: z.enum(["release", "accommodation"]),
        durationSeconds: z.number().int().min(60).max(7200).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("sentinel_employer_action", {
      _attempt_id: data.attemptId,
      _action: data.action,
      _duration_seconds: data.durationSeconds,
    });
    if (error) throw failure(error);
    return { ok: true };
  });
export const sentinelReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase.rpc("sentinel_review");
    if (error) throw failure(error);
    return data as {
      version: string;
      bank: {
        question: Question;
        family: string;
        seed: number | string;
        templateId: string;
        templateVersion: string;
        generatorVersion: string;
        key: string;
        explanation: { sv: string; en: string };
        designDifficulty: number;
        engineeringReview: string;
        ownerApproval: null;
      }[];
      items: { question: Question }[];
      owner_approved_at: string | null;
      privacy_approved_at: string | null;
    }[];
  });

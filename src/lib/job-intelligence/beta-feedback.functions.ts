import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// H3.4B — minimal closed-beta feedback mechanism. Single write path
// (submitBetaFeedback), single read path (listBetaFeedback, admin-only),
// both RLS-scoped through the caller's own client -- no supabaseAdmin use
// anywhere in this file, since RLS already grants exactly what each
// caller needs (owner INSERT, admin SELECT).

type Ctx = { supabase: any; userId: string };

const submitSchema = z.object({
  category: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(1).max(4000),
  pagePath: z.string().trim().max(300).optional().nullable(),
});

export const submitBetaFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase.from("beta_feedback").insert({
      user_id: ctx.userId,
      category: data.category,
      message: data.message,
      page_path: data.pagePath || null,
    });
    if (error) {
      console.error("[beta-feedback] submit failed", error);
      throw new Error("FEEDBACK_SUBMIT_FAILED");
    }
    return { ok: true };
  });

export type BetaFeedbackRow = {
  id: string;
  userId: string | null;
  category: "bug" | "idea" | "other";
  message: string;
  pagePath: string | null;
  createdAt: string;
};

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

export const listBetaFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BetaFeedbackRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { data, error } = await ctx.supabase
      .from("beta_feedback")
      .select("id, user_id, category, message, page_path, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[beta-feedback] list failed", error);
      throw new Error("Could not load feedback.");
    }
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      userId: r.user_id as string | null,
      category: r.category as BetaFeedbackRow["category"],
      message: r.message as string,
      pagePath: r.page_path as string | null,
      createdAt: r.created_at as string,
    }));
  });

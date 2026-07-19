// Phase G3 — Employer dashboard stats server function.
//
// Returns simple overview counts for the given employer. Security model:
//
//   1. requireSupabaseAuth verifies the bearer and injects ctx.userId
//      from the verified claims (never client-supplied).
//   2. We re-derive the caller's *active* membership on this employer
//      through ctx.supabase — the caller's own RLS-scoped client. The
//      employer_memberships_self_select policy (Phase G1) is the actual
//      boundary; a suspended/invited/removed membership, a non-member,
//      or a mismatched employer_id all return zero rows and we fail
//      closed with an "Access not available" error before any privileged
//      read.
//   3. Only after (2) do we load supabaseAdmin (server-only import,
//      lazy) to count jobs strictly filtered by the already-verified
//      employer_id. This mirrors the audit-log pattern in
//      membership.functions.ts (privileged write after membership
//      check) — the caller never controls the filter, only the
//      already-authorised employer_id.
//
// Applications and assessment_invitations tables do not exist yet
// (deferred to a later phase); those counters return 0 rather than
// invent records.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

export type EmployerDashboardStats = {
  activeJobs: number;
  draftJobs: number;
  applications: number;
  assessmentInvitations: number;
};

const inputSchema = z.object({
  employerId: z.string().uuid(),
});

export const getEmployerDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerDashboardStats> => {
    const ctx = context as Ctx;

    // Verify active membership through caller's own RLS-scoped client.
    // Both filters are defense-in-depth alongside the
    // employer_memberships_self_select policy — a caller who is not an
    // active member sees zero rows, and we fail closed.
    const { data: membership, error: memErr } = await ctx.supabase
      .from("employer_memberships")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("employer_id", data.employerId)
      .eq("status", "active")
      .maybeSingle();
    if (memErr) throw new Error("Access not available");
    if (!membership) throw new Error("Access not available");

    // Privileged read only after membership is verified. We never expose
    // the admin client to the caller and never accept a caller-supplied
    // filter beyond the already-authorised employer_id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [publishedRes, draftRes] = await Promise.all([
      supabaseAdmin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("employer_id", data.employerId)
        .eq("status", "published"),
      supabaseAdmin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("employer_id", data.employerId)
        .eq("status", "draft"),
    ]);

    if (publishedRes.error || draftRes.error) {
      throw new Error("Could not load dashboard.");
    }

    return {
      activeJobs: publishedRes.count ?? 0,
      draftJobs: draftRes.count ?? 0,
      // No tables yet — return literal zeros rather than fabricate rows.
      applications: 0,
      assessmentInvitations: 0,
    };
  });
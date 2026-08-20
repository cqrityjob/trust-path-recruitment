import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// #51 — The employer's own team, and who among them may review responses.
//
// Every call here goes through a SECURITY DEFINER RPC that re-checks membership
// server-side (scp_employer_team, scp_grant_employer_reviewer,
// scp_revoke_employer_reviewer). The RPC is the authorization boundary, not this
// file: a reviewer authorisation decides who may read a colleague's participants'
// free-text answers, so the rule belongs in the database where the review queue
// and the review write path can both consult the same source.
//
// Deliberately no email addresses: identifying a colleague needs a name, and a
// team list is not a contact export.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

export type EmployerTeamMember = {
  userId: string;
  displayName: string;
  employerRole: "owner" | "admin" | "member";
  membershipStatus: string;
  isReviewer: boolean;
  reviewerUseCases: string[];
  reviewerGrantedAt: string | null;
  isSelf: boolean;
};

const employerIdSchema = z.object({ employerId: z.string().uuid() });

export const getEmployerTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerTeamMember[]> => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_team", {
      _employer_id: data.employerId,
    });
    if (error) throw new Error("Could not load the team.");
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      userId: r.user_id as string,
      displayName: r.display_name as string,
      employerRole: r.employer_role as EmployerTeamMember["employerRole"],
      membershipStatus: r.membership_status as string,
      isReviewer: Boolean(r.is_reviewer),
      reviewerUseCases: (r.reviewer_use_cases as string[]) ?? [],
      reviewerGrantedAt: (r.reviewer_granted_at as string | null) ?? null,
      isSelf: Boolean(r.is_self),
    }));
  });

const grantSchema = z.object({
  employerId: z.string().uuid(),
  userId: z.string().uuid(),
  // Scope is explicit on purpose. Recruitment review carries stricter
  // separation-of-duties rules than workforce, so "both" is a decision the
  // employer makes per person rather than a default the product assumes.
  useCases: z.array(z.enum(["workforce", "recruitment"])).min(1),
});

export const grantEmployerReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => grantSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    const { data: id, error } = await ctx.supabase.rpc("scp_grant_employer_reviewer", {
      _employer_id: data.employerId,
      _user_id: data.userId,
      _use_cases: data.useCases,
    });
    if (error) throw new Error(error.message ?? "Could not authorise the reviewer.");
    return { id: id as string };
  });

export const revokeEmployerReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ revoked: boolean }> => {
    const ctx = context as Ctx;
    const { data: ok, error } = await ctx.supabase.rpc("scp_revoke_employer_reviewer", {
      _employer_id: data.employerId,
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message ?? "Could not revoke the authorisation.");
    return { revoked: Boolean(ok) };
  });

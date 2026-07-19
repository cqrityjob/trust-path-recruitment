import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Phase H3.1 — Candidate / Employer Portal Foundation: self-service employer
// company creation and existing-company access requests.
//
// Source of truth: docs/auth/candidate-employer-portal-spec-v1.md (§6, §12),
// docs/architecture/adr-candidate-employer-portal-separation.md.
//
// Neither createMyEmployerCompany nor approveAccessRequest opens a new
// direct RLS write policy on `employers`/`employer_memberships` — both call
// a SECURITY DEFINER Postgres function (create_my_employer_company /
// approve_access_request, supabase/migrations/20260719190845_...sql) that
// performs its own authorisation check and its own atomic multi-table
// write. This mirrors update_employer_membership()'s existing shape
// (membership.functions.ts) rather than inventing a new pattern, and keeps
// both sensitive tables exactly as admin-write-only at the RLS layer as
// they were before this file existed.
//
// requestAccessToEmployer is the one write in this file that IS a plain
// RLS-scoped insert — creating a pending request carries no privilege by
// itself, so no service-role/DEFINER path is needed for it.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

function slugify(input: string): string {
  // Identical to admin.functions.ts's local slugify() — duplicated rather
  // than imported, matching this codebase's established one-helper-per-file
  // convention (see membership.functions.ts's own local assertPlatformAdmin
  // for the same rationale).
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function writeAudit(params: {
  action: "access_requested";
  employerId: string;
  requestId: string;
  actorId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_role: "candidate_or_employer",
    action: params.action,
    subject_type: "employer_access_request",
    subject_id: params.requestId,
    org_id: params.employerId,
    metadata: params.metadata as any,
  });
}

// -------- findMatchingEmployers (duplicate-check preview for the UI) --------
//
// Read-only. This is a UX convenience only — the authoritative duplicate
// check runs again, server-side, inside create_my_employer_company() itself
// (never trust the browser's prior read). Deliberately conservative
// (exact/near-exact match only, no fuzzy matching) — see the spec's
// "SHOULD HAVE" list for improved matching later.

const findMatchingEmployersSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300).optional(),
  registrationNumber: z.string().trim().max(100).optional(),
});

export type MatchingEmployer = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
};

export const findMatchingEmployers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => findMatchingEmployersSchema.parse(d))
  .handler(async ({ data, context }): Promise<MatchingEmployer[]> => {
    const ctx = context as Ctx;
    const normalizedName = data.name.trim().toLowerCase();

    // Uses the caller's own RLS-scoped client. Only anon/authenticated
    // -selectable employer fields are read (existing employers_public_
    // active_select / employers_member_select policies already gate this
    // — no new grant is needed for a plain SELECT).
    const { data: rows, error } = await ctx.supabase
      .from("employers")
      .select("id, name, slug, country")
      .ilike("name", normalizedName)
      .limit(5);
    if (error) throw new Error("Could not check for an existing company.");
    return (rows ?? []) as MatchingEmployer[];
  });

// -------- createMyEmployerCompany --------

const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  country: z.string().trim().min(1, "Country is required").max(100),
  registrationNumber: z.string().trim().max(100).optional(),
  website: z.string().trim().max(300).optional(),
  jobTitle: z.string().trim().max(150).optional(),
});

export type CreateEmployerCompanyResult =
  | { ok: true; employerId: string; employerSlug: string; membershipId: string }
  | { ok: false; reason: "duplicate"; matchedEmployerId: string };

export const createMyEmployerCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createCompanySchema.parse(d))
  .handler(async ({ data, context }): Promise<CreateEmployerCompanyResult> => {
    const ctx = context as Ctx;
    const slugBase = slugify(data.name) || "company";

    // create_my_employer_company runs as the caller's own RLS-scoped
    // client (ctx.supabase, NOT supabaseAdmin) — it is SECURITY DEFINER at
    // the database layer, so it does not need a service-role client to
    // bypass RLS; auth.uid() inside the function resolves to the same
    // identity requireSupabaseAuth already verified via the bearer token.
    const { data: rows, error } = await ctx.supabase.rpc("create_my_employer_company", {
      _name: data.name,
      _slug_base: slugBase,
      _country: data.country,
      _registration_number: data.registrationNumber || null,
      _website: data.website || null,
      _job_title: data.jobTitle || null,
    });

    if (error) {
      // The DEFINER function raises 'DUPLICATE_EMPLOYER:<id>' with
      // ERRCODE unique_violation specifically so this layer can catch it
      // and return a structured result the UI turns into a "request
      // access instead" offer — never a generic failure for this case.
      const message = String(error.message ?? "");
      const match = message.match(/DUPLICATE_EMPLOYER:([0-9a-fA-F-]{36})/);
      if (match) {
        return { ok: false, reason: "duplicate", matchedEmployerId: match[1] };
      }
      // Fail safely: never surface a raw database error to the client —
      // matches the fail-safely convention already used by
      // listMyEmployerWorkspaces in membership.functions.ts.
      throw new Error("Could not create the company. Please check your details and try again.");
    }

    const row = (rows as any[] | null)?.[0];
    if (!row) throw new Error("Could not create the company. Please try again.");

    return {
      ok: true,
      employerId: row.employer_id as string,
      employerSlug: row.employer_slug as string,
      membershipId: row.membership_id as string,
    };
  });

// -------- requestAccessToEmployer --------

const requestAccessSchema = z.object({
  employerId: z.string().uuid(),
  message: z.string().trim().max(500).optional(),
});

export const requestAccessToEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestAccessSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;

    // Plain RLS-scoped insert — employer_access_requests_requester_insert
    // is the actual boundary (requester_user_id = auth.uid(), status must
    // be 'pending', decided_* / granted_role must be null). The partial
    // unique index (employer_id, requester_user_id) WHERE status='pending'
    // is the authoritative duplicate-request guard, not this pre-check —
    // a second rapid submission simply fails the unique constraint rather
    // than racing an application-level check.
    const { data: inserted, error } = await ctx.supabase
      .from("employer_access_requests")
      .insert({
        employer_id: data.employerId,
        requester_user_id: ctx.userId,
        message: data.message || null,
      })
      .select("id")
      .single();

    if (error) {
      if (String(error.code) === "23505" || /duplicate|unique/i.test(String(error.message))) {
        throw new Error("You already have a pending request for this company.");
      }
      throw new Error("Could not submit the access request. Please try again.");
    }

    await writeAudit({
      action: "access_requested",
      employerId: data.employerId,
      requestId: inserted.id as string,
      actorId: ctx.userId,
      metadata: {},
    });

    return { id: inserted.id as string };
  });

// -------- listMyAccessRequests (candidate-facing: onboarding status view) --------

export type MyAccessRequest = {
  id: string;
  employerId: string;
  employerName: string;
  employerSlug: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
};

export const listMyAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccessRequest[]> => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("employer_access_requests")
      .select("id, employer_id, status, created_at, employers(name, slug)")
      .eq("requester_user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your access requests.");

    const rows = (data ?? []) as any[];
    return rows.map((row) => {
      const employer = Array.isArray(row.employers) ? row.employers[0] : row.employers;
      return {
        id: row.id as string,
        employerId: row.employer_id as string,
        employerName: employer?.name ?? "",
        employerSlug: employer?.slug ?? "",
        status: row.status as MyAccessRequest["status"],
        createdAt: row.created_at as string,
      };
    });
  });

// -------- listAccessRequestsForMyEmployer (owner/admin review queue) --------

const listRequestsForEmployerSchema = z.object({
  employerId: z.string().uuid(),
});

export type IncomingAccessRequest = {
  id: string;
  requesterUserId: string;
  message: string | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
};

export const listAccessRequestsForMyEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRequestsForEmployerSchema.parse(d))
  .handler(async ({ data, context }): Promise<IncomingAccessRequest[]> => {
    const ctx = context as Ctx;
    // employer_access_requests_owner_select is the actual boundary
    // (has_employer_role(auth.uid(), employer_id, ['owner','admin'])) —
    // this query simply reads through it; an unauthorised caller gets an
    // empty result, never an error that would reveal the employer exists.
    const { data: rows, error } = await ctx.supabase
      .from("employer_access_requests")
      .select("id, requester_user_id, message, status, created_at")
      .eq("employer_id", data.employerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load access requests.");
    return (rows ?? []).map((row: any) => ({
      id: row.id as string,
      requesterUserId: row.requester_user_id as string,
      message: row.message as string | null,
      status: row.status as IncomingAccessRequest["status"],
      createdAt: row.created_at as string,
    }));
  });

// -------- decideAccessRequest --------

const decideAccessRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "denied"]),
  grantedRole: z.enum(["owner", "admin", "member"]).default("member"),
});

export const decideAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decideAccessRequestSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      requestId: string;
      employerId: string;
      status: string;
      membershipId: string | null;
    }> => {
      const ctx = context as Ctx;

      // Same rationale as createMyEmployerCompany: approve_access_request
      // is SECURITY DEFINER and performs its own authorisation check
      // against the request's real employer_id — called via the caller's
      // own RLS-scoped client, no service-role needed.
      const { data: rows, error } = await ctx.supabase.rpc("approve_access_request", {
        _request_id: data.requestId,
        _decision: data.decision,
        _granted_role: data.grantedRole,
      });
      if (error) {
        throw new Error("Could not process this request. Please try again.");
      }
      const row = (rows as any[] | null)?.[0];
      if (!row) throw new Error("Request not found.");

      return {
        requestId: row.request_id as string,
        employerId: row.employer_id as string,
        status: row.status as string,
        membershipId: (row.membership_id as string) ?? null,
      };
    },
  );

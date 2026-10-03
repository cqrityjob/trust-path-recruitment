// Platform administration — the certification research queue and the requests
// holders send for a missing certification.
//
// ── WHAT THIS CAN AND CANNOT DO ────────────────────────────────────────
//
//   READ    the 170 researched records and the holders' requests.
//   DECIDE  a research record may be set to pending, needs-information or
//           excluded, with a reason. A request may be answered: pointed at an
//           existing definition, at a research record, or declined with a note
//           the holder can read.
//   NEVER   approve a record, publish a definition or touch a claim. Approval and
//           publication are reviewed migrations
//           (docs/passport/certification-catalogue-integration.md). The database
//           functions refuse them for everyone, an administrator included, and
//           these server functions have no path that asks.
//
// Every call runs as the signed-in administrator's OWN session: the tables'
// RLS and the functions' own is_platform_admin() check are the authority, and
// no service role is involved. The local assertAdmin below is a second,
// earlier refusal, not the only one.
//
// Schema-first: 20270206090000 creates every object used here. Without it the
// reads answer "unavailable" and nothing is written.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

/** The database's own refusal name, so the page can say what to fix. */
function refusal(message: string | undefined, fallback: string): string {
  return /SP_[A-Z_]+/.exec(message ?? "")?.[0] ?? fallback;
}

export interface AdminResearchRecord {
  readonly id: string;
  readonly researchId: string;
  readonly issuerName: string;
  readonly acronym: string | null;
  readonly officialName: string;
  readonly area: string;
  readonly kind: string;
  /** Research metadata only: never an availability, a market or a work permission. */
  readonly researchScope: string;
  readonly jurisdictionContext: string | null;
  readonly priority: string;
  readonly sourceUrl: string;
  readonly sourceCheckedOn: string;
  readonly evidenceLevel: string;
  readonly researchStatus: string;
  readonly renewalNote: string | null;
  readonly decision: string;
  readonly outcome: string;
  readonly credentialCode: string | null;
  readonly holderReason: string | null;
  readonly decisionNote: string | null;
  readonly unresolvedIssue: string | null;
  readonly requiredAction: string | null;
  readonly recheckCheckedOn: string | null;
  readonly recheckNote: string | null;
  readonly reviewer: string | null;
  readonly reviewedAt: string | null;
}

export const adminListResearchRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly AdminResearchRecord[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const result = await ctx.supabase
      .from("sp_catalogue_research_records")
      .select(
        "id,research_id,issuer_name,acronym,official_name,research_area,credential_kind,research_scope,jurisdiction_context,recommended_priority,source_url,source_checked_on,evidence_level,research_status,renewal_note,catalogue_decision,reconciliation_outcome,credential_code,holder_reason,decision_note,unresolved_issue,required_action,recheck_checked_on,recheck_note,reviewer,reviewed_at",
      )
      .order("recommended_priority", { ascending: true })
      .order("issuer_name", { ascending: true })
      .order("official_name", { ascending: true })
      .limit(1000);
    if (result.error) throw new Error("RESEARCH_RECORDS_UNAVAILABLE");
    return (result.data ?? []).map((r) => ({
      id: r.id,
      researchId: r.research_id,
      issuerName: r.issuer_name,
      acronym: r.acronym,
      officialName: r.official_name,
      area: r.research_area,
      kind: r.credential_kind,
      researchScope: r.research_scope,
      jurisdictionContext: r.jurisdiction_context,
      priority: r.recommended_priority,
      sourceUrl: r.source_url,
      sourceCheckedOn: r.source_checked_on,
      evidenceLevel: r.evidence_level,
      researchStatus: r.research_status,
      renewalNote: r.renewal_note,
      decision: r.catalogue_decision,
      outcome: r.reconciliation_outcome,
      credentialCode: r.credential_code,
      holderReason: r.holder_reason,
      decisionNote: r.decision_note,
      unresolvedIssue: r.unresolved_issue,
      requiredAction: r.required_action,
      recheckCheckedOn: r.recheck_checked_on,
      recheckNote: r.recheck_note,
      reviewer: r.reviewer,
      reviewedAt: r.reviewed_at,
    }));
  });

const reviewInput = z
  .object({
    recordId: z.string().uuid(),
    // 'approved' is not here, and the database refuses it too.
    decision: z.enum(["pending", "needs_information", "excluded"]),
    note: z.string().trim().min(1).max(2000),
    unresolvedIssue: z.string().trim().max(2000).optional(),
    requiredAction: z.string().trim().max(2000).optional(),
    holderReason: z
      .enum([
        "awaiting_source_check",
        "awaiting_name_check",
        "awaiting_issuer_check",
        "awaiting_kind_check",
        "retired_for_new_candidates",
      ])
      .optional(),
  })
  .strict();
export type AdminResearchDecisionInput = z.infer<typeof reviewInput>;

export const adminReviewResearchRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => reviewInput.parse(data))
  .handler(async ({ context, data }): Promise<void> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const result = await ctx.supabase.rpc("sp_admin_review_research_record", {
      _record_id: data.recordId,
      _decision: data.decision,
      _note: data.note,
      ...(data.unresolvedIssue ? { _unresolved_issue: data.unresolvedIssue } : {}),
      ...(data.requiredAction ? { _required_action: data.requiredAction } : {}),
      ...(data.holderReason ? { _holder_reason: data.holderReason } : {}),
    });
    if (result.error) throw new Error(refusal(result.error.message, "RESEARCH_DECISION_FAILED"));
  });

export interface AdminCatalogueRequest {
  readonly id: string;
  readonly holderUserId: string;
  readonly name: string;
  readonly issuer: string;
  readonly abbreviation: string | null;
  readonly sourceUrl: string | null;
  readonly note: string | null;
  readonly researchRecordId: string | null;
  readonly status: string;
  readonly resolutionNote: string | null;
  readonly answeredCredentialCode: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export const adminListCatalogueRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly AdminCatalogueRequest[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const result = await ctx.supabase
      .from("sp_catalogue_requests")
      .select(
        "id,holder_user_id,requested_name,requested_issuer,requested_abbreviation,source_url,note,research_record_id,status,resolution_note,answered_credential_code,created_at,resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (result.error) throw new Error("CATALOGUE_REQUESTS_UNAVAILABLE");
    return (result.data ?? []).map((r) => ({
      id: r.id,
      holderUserId: r.holder_user_id,
      name: r.requested_name,
      issuer: r.requested_issuer,
      abbreviation: r.requested_abbreviation,
      sourceUrl: r.source_url,
      note: r.note,
      researchRecordId: r.research_record_id,
      status: r.status,
      resolutionNote: r.resolution_note,
      answeredCredentialCode: r.answered_credential_code,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  });

const resolveInput = z
  .object({
    requestId: z.string().uuid(),
    status: z.enum(["open", "answered_existing", "in_research", "declined"]),
    /** Written FOR THE HOLDER, who reads it: at most 300 characters, never an internal note. */
    note: z.string().trim().max(300).optional(),
    credentialCode: z
      .string()
      .max(64)
      .regex(/^[A-Z0-9_]+$/)
      .optional(),
    researchRecordId: z.string().uuid().optional(),
  })
  .strict();
export type AdminResolveRequestInput = z.infer<typeof resolveInput>;

export const adminResolveCatalogueRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => resolveInput.parse(data))
  .handler(async ({ context, data }): Promise<void> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const result = await ctx.supabase.rpc("sp_admin_resolve_catalogue_request", {
      _request_id: data.requestId,
      _status: data.status,
      ...(data.note ? { _note: data.note } : {}),
      ...(data.credentialCode ? { _credential_code: data.credentialCode } : {}),
      ...(data.researchRecordId ? { _research_record_id: data.researchRecordId } : {}),
    });
    if (result.error) throw new Error(refusal(result.error.message, "REQUEST_RESOLUTION_FAILED"));
  });

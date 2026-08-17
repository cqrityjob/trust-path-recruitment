// Security Passport — credential server functions (Phase 6).
//
// The write path the four launch credential forms use. Separate from
// passport.functions.ts because that file is the general claim/experience
// surface and this one is specifically about the supported-credential
// taxonomy: it reads `sp_credential_types` and it understands drafts.
//
// ── WHAT THIS FILE CANNOT DO ───────────────────────────────────────────
//
// It cannot write `assertion_level`, `verified_by_user_id` or `verified_at` —
// there is no parameter for any of them and the strings never appear here.
// A credential written through this file is `self_declared` by column default,
// and only `sp_attach_evidence` (DOCUMENT_PROVIDED) and `sp_verifier_decide`
// (VERIFIED) can ever move it, both of which live in the database.
//
// It writes exactly two lifecycle states: `draft` and `active`. Every other
// state is a consequence of somebody else's decision.
//
// ── WHY COMPLETENESS IS CHECKED TWICE ──────────────────────────────────
//
// `validateCredential` runs here before the write so the holder gets a
// field-level message in their own language. The database trigger runs
// regardless, for every caller. The check here is a courtesy; the trigger is
// the guarantee. Neither is load-bearing on its own.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import {
  validateCredential,
  type CredentialCategory,
  type CredentialDraft,
  type CredentialType,
} from "./credentials";

/* ------------------------------------------------------------------ */
/* Taxonomy                                                            */
/* ------------------------------------------------------------------ */

/** The supported credentials, straight from the database.
 *
 *  Not a constant in the bundle: the taxonomy is data, and a fifth credential
 *  must appear in the form without a deploy. */
export const listCredentialTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly CredentialType[]> => {
    const { data, error } = await context.supabase
      .from("sp_credential_types")
      .select(
        "code, category, claim_type, name_sv, name_en, symbol_label, requires_valid_until, requires_issuer",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      code: r.code,
      category: r.category as CredentialCategory,
      claimType: r.claim_type,
      nameSv: r.name_sv,
      nameEn: r.name_en,
      symbolLabel: r.symbol_label,
      requiresValidUntil: r.requires_valid_until,
      requiresIssuer: r.requires_issuer,
    }));
  });

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

const draftInput = z.object({
  /** Absent when creating; present when updating an existing draft. */
  claimId: z.string().uuid().nullable(),
  credentialCode: z.string().max(16).nullable(),
  title: z.string().max(200),
  issuerName: z.string().max(160),
  jurisdictionCode: z.string().max(2),
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  validFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  credentialReference: z.string().max(120),
  holderNote: z.string().max(2000),
  /** `true` promotes the draft into the Passport. The database refuses an
   *  incomplete one, and `validateCredential` refuses it first. */
  activate: z.boolean(),
});

type DraftInput = z.infer<typeof draftInput>;

function toDomainDraft(data: DraftInput): CredentialDraft {
  return {
    credentialCode: data.credentialCode,
    title: data.title,
    issuerName: data.issuerName,
    jurisdictionCode: data.jurisdictionCode,
    issuedOn: data.issuedOn,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    credentialReference: data.credentialReference,
    holderNote: data.holderNote,
  };
}

/** Blank strings are how an HTML form says "empty". The database wants NULL,
 *  so that a missing reference is absent rather than an empty string that
 *  looks like a recorded value. */
function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface SavedCredential {
  readonly id: string;
  readonly lifecycleState: string;
  readonly updatedAt: string;
}

/**
 * Creates or updates one credential claim, as a draft or as a live entry.
 *
 * One function rather than four (create-draft / update-draft / create-active /
 * activate) because the holder experiences it as one form with two buttons,
 * and splitting it would put the same field mapping in four places.
 */
export const saveCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => draftInput.parse(data))
  .handler(async ({ context, data }): Promise<SavedCredential> => {
    const { supabase, userId } = context;

    // The taxonomy row decides what "complete" means, so it is read rather
    // than assumed from the code string.
    let type: CredentialType | null = null;
    if (data.credentialCode) {
      const { data: row, error } = await supabase
        .from("sp_credential_types")
        .select(
          "code, category, claim_type, name_sv, name_en, symbol_label, requires_valid_until, requires_issuer",
        )
        .eq("code", data.credentialCode)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("SP_CREDENTIAL_CODE_UNKNOWN");
      type = {
        code: row.code,
        category: row.category as CredentialCategory,
        claimType: row.claim_type,
        nameSv: row.name_sv,
        nameEn: row.name_en,
        symbolLabel: row.symbol_label,
        requiresValidUntil: row.requires_valid_until,
        requiresIssuer: row.requires_issuer,
      };
    }

    const mode = data.activate ? "active" : "draft";
    const problems = validateCredential(toDomainDraft(data), type, mode);
    if (problems.length > 0) {
      // The field-level messages are already on the client, which validated
      // the same way from the same module. This is the server refusing, so it
      // only needs to say that it refused.
      throw new Error(data.activate ? "SP_CREDENTIAL_INCOMPLETE" : "SP_CREDENTIAL_INVALID");
    }
    if (!type) throw new Error("SP_CREDENTIAL_CODE_REQUIRED");

    // assertion_level is deliberately absent: it takes its column default.
    // There is no parameter for it anywhere in this file.
    const fields = {
      claim_type: type.claimType,
      credential_code: type.code,
      title: nullIfBlank(data.title) ?? type.nameSv,
      claimed_issuer_name: nullIfBlank(data.issuerName),
      jurisdiction_code: nullIfBlank(data.jurisdictionCode),
      issued_on: data.issuedOn,
      valid_from: data.validFrom ?? data.issuedOn,
      valid_until: data.validUntil,
      credential_reference: nullIfBlank(data.credentialReference),
      holder_note: nullIfBlank(data.holderNote),
      lifecycle_state: mode,
    };

    if (data.claimId) {
      // RLS already restricts the holder to their own rows, and to draft/active
      // ones. The holder_user_id filter is belt-and-braces, not the boundary.
      const patch: TablesUpdate<"sp_claims"> = fields;
      const { data: row, error } = await supabase
        .from("sp_claims")
        .update(patch)
        .eq("id", data.claimId)
        .eq("holder_user_id", userId)
        .select("id, lifecycle_state, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: row.id,
        lifecycleState: row.lifecycle_state,
        updatedAt: row.updated_at,
      };
    }

    const insert: TablesInsert<"sp_claims"> = { holder_user_id: userId, ...fields };
    const { data: row, error } = await supabase
      .from("sp_claims")
      .insert(insert)
      .select("id, lifecycle_state, updated_at")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: data.activate ? "claim_created" : "claim_drafted",
      subject_type: "claim",
      subject_id: row.id,
      detail: { credential_code: type.code },
    });

    return {
      id: row.id,
      lifecycleState: row.lifecycle_state,
      updatedAt: row.updated_at,
    };
  });

/* ------------------------------------------------------------------ */
/* Resume                                                             */
/* ------------------------------------------------------------------ */

export interface DraftCredential extends CredentialDraft {
  readonly id: string;
  readonly updatedAt: string;
}

/** The holder's unfinished credentials, so a form can be resumed rather than
 *  restarted. Drafts are private by definition and never disclosed. */
export const listMyCredentialDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly DraftCredential[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sp_claims")
      .select(
        "id, credential_code, title, claimed_issuer_name, jurisdiction_code, issued_on, valid_from, valid_until, credential_reference, holder_note, updated_at",
      )
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "draft")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      id: r.id,
      credentialCode: r.credential_code,
      title: r.title,
      issuerName: r.claimed_issuer_name ?? "",
      jurisdictionCode: r.jurisdiction_code ?? "SE",
      issuedOn: r.issued_on,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      credentialReference: r.credential_reference ?? "",
      holderNote: r.holder_note ?? "",
      updatedAt: r.updated_at,
    }));
  });

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export interface ClaimVersion {
  readonly id: string;
  readonly versionNo: number;
  readonly credentialCode: string | null;
  readonly title: string;
  readonly issuerName: string | null;
  readonly jurisdictionCode: string | null;
  readonly issuedOn: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly assertionLevel: string;
  readonly lifecycleState: string;
  readonly supersedesId: string | null;
  readonly updatedAt: string;
}

/**
 * Every version of one credential, newest first.
 *
 * The chain is walked in both directions from the given claim, so the same
 * history renders whether the holder opens the current version or a
 * superseded one. RLS scopes the read to the holder's own rows; there is
 * nothing here a holder cannot already see one row at a time.
 */
export const listClaimVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ claimId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<readonly ClaimVersion[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("sp_claims")
      .select(
        "id, version_no, credential_code, title, claimed_issuer_name, jurisdiction_code, issued_on, valid_from, valid_until, assertion_level, lifecycle_state, supersedes_id, updated_at",
      )
      .eq("holder_user_id", userId);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      version_no: number;
      credential_code: string | null;
      title: string;
      claimed_issuer_name: string | null;
      jurisdiction_code: string | null;
      issued_on: string | null;
      valid_from: string | null;
      valid_until: string | null;
      assertion_level: string;
      lifecycle_state: string;
      supersedes_id: string | null;
      updated_at: string;
    };
    const all = (rows ?? []) as Row[];
    const byId = new Map(all.map((r) => [r.id, r]));
    const bySupersedes = new Map(
      all.filter((r) => r.supersedes_id).map((r) => [r.supersedes_id, r]),
    );

    const chain: Row[] = [];
    const start = byId.get(data.claimId);
    if (!start) return [];

    // Backwards to the origin…
    let cursor: Row | undefined = start;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.supersedes_id ? byId.get(cursor.supersedes_id) : undefined;
    }
    // …and forwards to the newest correction.
    cursor = bySupersedes.get(start.id);
    while (cursor) {
      chain.push(cursor);
      cursor = bySupersedes.get(cursor.id);
    }

    return chain
      .map((r) => ({
        id: r.id,
        versionNo: r.version_no,
        credentialCode: r.credential_code,
        title: r.title,
        issuerName: r.claimed_issuer_name,
        jurisdictionCode: r.jurisdiction_code,
        issuedOn: r.issued_on,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
        assertionLevel: r.assertion_level,
        lifecycleState: r.lifecycle_state,
        supersedesId: r.supersedes_id,
        updatedAt: r.updated_at,
      }))
      .reverse();
  });

/** The two private columns the overview read deliberately omits, fetched
 *  only to prefill the correction form. The correction RPC replaces every
 *  field, so a prefill missing these would silently blank them. */
export const getCredentialPrivateFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ claimId: z.string().uuid() }).parse(data))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ credentialReference: string | null; holderNote: string | null }> => {
      const { supabase, userId } = context;
      const { data: row, error } = await supabase
        .from("sp_claims")
        .select("credential_reference, holder_note")
        .eq("id", data.claimId)
        .eq("holder_user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        credentialReference: (row?.credential_reference as string | null) ?? null,
        holderNote: (row?.holder_note as string | null) ?? null,
      };
    },
  );

/** Removes an unfinished credential. Restricted to drafts on purpose: a real
 *  claim is corrected or withdrawn through the versioning workflow, which
 *  keeps its history, rather than deleted. */
export const discardCredentialDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ claimId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("sp_claims")
      .delete()
      .eq("id", data.claimId)
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

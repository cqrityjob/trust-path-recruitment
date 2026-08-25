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
import { orNull } from "./rpc";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import {
  CREDENTIAL_CODE_MAX_LENGTH,
  clearIncompatible,
  titleIsControlled,
  validateCredential,
  type CredentialCategory,
  type CredentialDraft,
  type CredentialType,
} from "./credentials";

/* ------------------------------------------------------------------ */
/* Taxonomy                                                            */
/* ------------------------------------------------------------------ */

/** One market a holder may actually record a credential in.
 *
 *  ── WHY THIS REPLACED A CONSTANT ───────────────────────────────────────
 *
 *  The form used to offer `["SE", "NO", "DK", "FI", "DE"]` from a literal in
 *  the component. Only the first existed in `sp_jurisdictions`, so four of the
 *  five options produced a raw foreign-key error — a controlled vocabulary
 *  whose control was a list nobody had reconciled with the database.
 *
 *  Read from the market packs instead, so the form can only ever offer what
 *  the database will accept: an unreviewed market is absent because the pack
 *  is inactive, and a new market appears the day its pack is switched on. */
export interface SelectableMarket {
  readonly marketPackCode: string;
  readonly jurisdictionCode: string;
  /** Present only where the regulator is sub-national — an emirate. Recorded
   *  on the claim so a Dubai credential is never stored as UAE-wide. */
  readonly subJurisdictionCode: string | null;
  readonly nameSv: string;
  readonly nameEn: string;
}

/** Every market a holder may currently record a credential in.
 *
 *  Deliberately filtered on `is_active`, which by the
 *  sp_market_pack_active_needs_review constraint cannot be true while the
 *  pack's regulatory content is unreviewed. So an unreviewed market is not
 *  merely discouraged in the UI — it is not offered, and would be refused by
 *  the claim trigger if it were. */
export const listSelectableMarkets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly SelectableMarket[]> => {
    const { data, error } = await context.supabase
      .from("sp_market_packs")
      .select("code, jurisdiction_code, sub_jurisdiction_code, name_sv, name_en")
      .eq("is_active", true)
      .is("superseded_on", null)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      marketPackCode: r.code,
      jurisdictionCode: r.jurisdiction_code,
      subJurisdictionCode: r.sub_jurisdiction_code,
      nameSv: r.name_sv,
      nameEn: r.name_en,
    }));
  });

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
        "code, category, claim_type, name_sv, name_en, symbol_label, requires_valid_until, requires_issuer, requires_scope, narrow_result_only, title_is_holder_written, jurisdiction_code, sub_jurisdiction_code",
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
      requiresScope: r.requires_scope,
      narrowResultOnly: r.narrow_result_only,
      titleIsHolderWritten: r.title_is_holder_written,
      jurisdictionCode: r.jurisdiction_code,
      subJurisdictionCode: r.sub_jurisdiction_code,
    }));
  });

/* ------------------------------------------------------------------ */
/* Market-aware availability                                           */
/* ------------------------------------------------------------------ */

/**
 * Why the credential selector cannot simply be `listCredentialTypes`.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────
 *
 * `listCredentialTypes` returns every ACTIVE credential type and nothing else.
 * Since the UK and Dubai packs ship inactive, the only active types are the
 * eight Swedish ones — so a holder who set their work country to Dubai was
 * offered VU1, VU2, Ordningsvaktsförordnande and Skyddsvaktsförordnande as
 * though they were credentials one registers in Dubai. That is precisely the
 * claim this product exists not to make.
 *
 * ── WHAT THIS FUNCTION DOES INSTEAD ────────────────────────────────────
 *
 * It answers one question: given where this holder says they work, which
 * REGULATED credentials may they register today, and if none, why not. The
 * "why not" is the point — "no credentials" and "Dubai's rules have not been
 * reviewed yet" are different facts, and only the second is true.
 *
 * ── WHAT IT MUST NEVER BE USED FOR ─────────────────────────────────────
 *
 * Deciding what a holder can SEE. Existing credentials are read through the
 * Passport snapshot, which knows nothing about market packs, and a Swedish VU1
 * stays visible, Swedish and verified after its holder moves to Dubai.
 * `listCredentialTypes` is likewise left alone, because the correction form
 * must still resolve the taxonomy row of a credential from a market the holder
 * no longer works in.
 *
 * This governs REGISTRATION of something new. Nothing else.
 */
export type RegulatedMarketState =
  /** The holder has not said where they work. Nothing is offered, because
   *  guessing a country is what the work-country work removed. */
  | "no_work_country"
  /** The pack is active and reviewed; its credentials are below. */
  | "open"
  /** A pack exists for this market and its regulatory content has not been
   *  reviewed. Not "you are not eligible" — the rules are not ready. */
  | "pending_review"
  /** No pack covers this country at all, or covers it only at a
   *  sub-jurisdiction the holder has not named. UAE-other lands here, and
   *  must not be shown Dubai's anything. */
  | "unsupported";

export interface RegulatedCredentialAvailability {
  readonly state: RegulatedMarketState;
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  readonly marketPackCode: string | null;
  /** Non-empty only when `state` is "open". */
  readonly types: readonly CredentialType[];
}

const TAXONOMY_COLUMNS =
  "code, category, claim_type, name_sv, name_en, symbol_label, requires_valid_until, requires_issuer, requires_scope, narrow_result_only, title_is_holder_written, jurisdiction_code, sub_jurisdiction_code";

export const getRegulatedCredentialAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RegulatedCredentialAvailability> => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("sp_passport_profiles")
      .select("jurisdiction_code, sub_jurisdiction_code")
      .eq("holder_user_id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const jurisdictionCode = profile?.jurisdiction_code ?? null;
    const subJurisdictionCode = profile?.sub_jurisdiction_code ?? null;

    const none = {
      jurisdictionCode,
      subJurisdictionCode,
      marketPackCode: null,
      types: [] as readonly CredentialType[],
    };

    if (!jurisdictionCode) return { state: "no_work_country", ...none };

    // The SAME matching rule as `sp_claims_credential_rules`: country plus
    // sub-jurisdiction, treating NULL as a value rather than as a wildcard.
    // Written twice is a risk, so it is written the same way twice — a form
    // that offered a credential the trigger then refused would be worse than
    // either alone.
    let packQuery = supabase
      .from("sp_market_packs")
      .select("code, is_active")
      .eq("jurisdiction_code", jurisdictionCode)
      .is("superseded_on", null);
    packQuery = subJurisdictionCode
      ? packQuery.eq("sub_jurisdiction_code", subJurisdictionCode)
      : packQuery.is("sub_jurisdiction_code", null);

    const { data: pack, error: packError } = await packQuery.maybeSingle();
    if (packError) throw new Error(packError.message);

    // No pack at all. Two different situations reach here and both are
    // honestly "not supported yet": a country nobody has authored rules for,
    // and a country whose rules are authored per region — the UAE — where the
    // holder has named the country but not an emirate.
    if (!pack) return { state: "unsupported", ...none };

    if (!pack.is_active) {
      return { state: "pending_review", ...none, marketPackCode: pack.code };
    }

    const { data, error } = await supabase
      .from("sp_credential_types")
      .select(TAXONOMY_COLUMNS)
      .eq("is_active", true)
      .eq("market_pack_code", pack.code)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      state: "open",
      jurisdictionCode,
      subJurisdictionCode,
      marketPackCode: pack.code,
      types: (data ?? []).map((r) => ({
        code: r.code,
        category: r.category as CredentialCategory,
        claimType: r.claim_type,
        nameSv: r.name_sv,
        nameEn: r.name_en,
        symbolLabel: r.symbol_label,
        requiresValidUntil: r.requires_valid_until,
        requiresIssuer: r.requires_issuer,
        requiresScope: r.requires_scope,
        narrowResultOnly: r.narrow_result_only,
        titleIsHolderWritten: r.title_is_holder_written,
        jurisdictionCode: r.jurisdiction_code,
        subJurisdictionCode: r.sub_jurisdiction_code,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

const draftInput = z.object({
  /** Absent when creating; present when updating an existing draft. */
  claimId: z.string().uuid().nullable(),
  credentialCode: z.string().max(CREDENTIAL_CODE_MAX_LENGTH).nullable(),
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
  // Bounded to match the column's own CHECK, so an over-long scope is refused
  // here with a field message rather than by the database with a 23514.
  authorisationScope: z.string().max(200),
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
    authorisationScope: data.authorisationScope,
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
          "code, category, claim_type, name_sv, name_en, symbol_label, requires_valid_until, requires_issuer, requires_scope, narrow_result_only, title_is_holder_written, jurisdiction_code, sub_jurisdiction_code",
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
        requiresScope: row.requires_scope,
        narrowResultOnly: row.narrow_result_only,
        titleIsHolderWritten: row.title_is_holder_written,
        jurisdictionCode: row.jurisdiction_code,
        subJurisdictionCode: row.sub_jurisdiction_code,
      };
    }

    const mode = data.activate ? "active" : "draft";

    // Drop anything the chosen credential does not ask for, BEFORE validating
    // and before writing. The form does this on the type switch too, but this
    // is the guarantee: a caller that skipped the form — or a form left open
    // across a deploy that changed the taxonomy — cannot write a scope onto a
    // course or an expiry onto a credential that has none.
    const draft = type ? clearIncompatible(toDomainDraft(data), type) : toDomainDraft(data);

    const problems = validateCredential(draft, type, mode);
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
      // A governed credential takes the taxonomy's own label, whatever arrived.
      // The database refuses anything else for every caller, so passing the
      // holder's text through would only turn a rule into an error message.
      //
      // The condition used to be `narrowResultOnly`, which is how a
      // skyddsvakt appointment came to be stored as "Bajskorv": the holder's
      // text was written for every credential that was not a narrow result,
      // which is six of the eight Swedish ones. `titleIsControlled` is the
      // same question asked of the whole governed vocabulary.
      //
      // `nameSv` rather than the reader's language, deliberately: the stored
      // value is one canonical string, and the surfaces resolve the reader's
      // language from `credential_code`. Storing whichever language the form
      // happened to be in would make the same credential two different rows.
      title: titleIsControlled(type) ? type.nameSv : (nullIfBlank(draft.title) ?? type.nameSv),
      claimed_issuer_name: nullIfBlank(draft.issuerName),
      jurisdiction_code: nullIfBlank(draft.jurisdictionCode),
      issued_on: draft.issuedOn,
      valid_from: draft.validFrom ?? draft.issuedOn,
      valid_until: draft.validUntil,
      credential_reference: nullIfBlank(draft.credentialReference),
      // Same reasoning, and this one matters more: a note on a narrow-result
      // credential is where register contents or a medical finding would
      // arrive. Dropped here as well as refused there.
      holder_note: type.narrowResultOnly ? null : nullIfBlank(draft.holderNote),
      authorisation_scope: nullIfBlank(draft.authorisationScope),
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

    // The result is READ. It used to be discarded, and `claim_drafted` was
    // not in the event-type allowlist, so every saved draft created its claim
    // and then dropped its audit event with a 23514 nobody ever saw. An
    // append-only history with silent holes in it is not a history.
    const { error: eventError } = await supabase.from("sp_passport_events").insert({
      holder_user_id: userId,
      actor_user_id: userId,
      event_type: data.activate ? "claim_created" : "claim_drafted",
      subject_type: "claim",
      subject_id: row.id,
      detail: { credential_code: type.code },
    });
    if (eventError) throw new Error(eventError.message);

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
        "id, credential_code, title, claimed_issuer_name, jurisdiction_code, issued_on, valid_from, valid_until, credential_reference, holder_note, authorisation_scope, updated_at",
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
      authorisationScope: r.authorisation_scope ?? "",
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

/**
 * Removes an unfinished credential. Restricted to drafts on purpose: a real
 * claim is corrected or withdrawn through the versioning workflow, which
 * keeps its history.
 *
 * ── WHY IT UPDATES AND DOES NOT DELETE ─────────────────────────────────
 *
 * It used to issue a DELETE, and that silently did nothing. `sp_claims` has
 * RLS enabled and no DELETE policy, so the statement matched zero rows,
 * raised no error, and the function cheerfully returned ok while the draft
 * stayed exactly where it was — "Ta bort utkast" was a button that did
 * nothing. It went unnoticed because a clean local replay has no DELETE
 * grant at all, so the call failed loudly there and passed silently only on
 * the hosted project.
 *
 * Marking the draft withdrawn is what the holder means, works under the
 * policies that actually exist, and matches how every other removal in the
 * Passport behaves. `listMyCredentialDrafts` filters on `lifecycle_state =
 * 'draft'`, so a withdrawn draft disappears from the UI as expected.
 */
export const discardCredentialDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ claimId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true; removed: boolean }> => {
    const { supabase, userId } = context;
    const patch: TablesUpdate<"sp_claims"> = { lifecycle_state: "withdrawn" };
    const { data: rows, error } = await supabase
      .from("sp_claims")
      .update(patch)
      .eq("id", data.claimId)
      .eq("holder_user_id", userId)
      .eq("lifecycle_state", "draft")
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, removed: (rows ?? []).length > 0 };
  });

/* ------------------------------------------------------------------ */
/* Archive                                                             */
/* ------------------------------------------------------------------ */

/**
 * Removes an entry from the holder's ACTIVE Passport without deleting it.
 *
 * ── WHY THIS IS NOT `discardCredentialDraft` ───────────────────────────
 *
 * That one is restricted to drafts, and correctly: a draft is private and
 * unfinished, so marking it withdrawn is the whole story. The tester's
 * question — "how do I remove an appointment?" — was about entries that are
 * not drafts, and for those `sp_claims_self_update` refuses the holder any
 * write at all once the claim is verified. There was no answer, for exactly
 * the entries most likely to need one.
 *
 * ── WHY IT IS AN RPC AND NOT AN UPDATE ─────────────────────────────────
 *
 * A holder-facing UPDATE broad enough to archive a verified credential would
 * also have been broad enough to edit one. `sp_archive_claim` is SECURITY
 * DEFINER so the holder gets exactly one action on a verified row and no
 * others: assertion_level, the verifier, the verification timestamp, the
 * version chain and the evidence are all untouched by it.
 *
 * ── WHY IT IS NOT A DISPUTE ────────────────────────────────────────────
 *
 * "I no longer want this presented" and "this information is wrong" are
 * different statements about different things. The second goes to a reviewer;
 * the first is the holder's alone. Using dispute as a delete button would fill
 * a review queue with entries nobody contests — so the database refuses to
 * archive a disputed entry, and this is the surface that says so.
 */
export const archiveCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        claimId: z.string().uuid(),
        // Bounded to the 300 characters the audit event stores, so an
        // over-long reason is refused here rather than silently truncated
        // into the permanent record.
        reason: z.string().max(300),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("sp_archive_claim", {
      _claim_id: data.claimId,
      _reason: orNull(data.reason.trim() === "" ? null : data.reason.trim()),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

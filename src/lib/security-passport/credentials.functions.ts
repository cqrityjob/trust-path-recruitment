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
  CREDENTIAL_CODE_MAX_LENGTH,
  clearIncompatible,
  validateCredential,
  type CredentialCategory,
  type CredentialDraft,
  type CredentialType,
} from "./credentials";

/* ------------------------------------------------------------------ */
/* Taxonomy                                                            */
/* ------------------------------------------------------------------ */

/** How far a market has actually got.
 *
 *  Three states, because "you cannot record a credential here" has three
 *  different reasons and they are not interchangeable:
 *
 *    supported      — the pack is reviewed and switched on. Record away.
 *    pending_review — a catalogue exists, authored from official sources, and
 *                     nobody has signed it off. The country is real, the
 *                     credentials are real, and they are not offered yet.
 *    not_supported  — there is no pack. Nobody here has read this place's
 *                     regulatory framework, and nothing is being guessed.
 *
 *  Collapsing the last two into one "unavailable" would tell an Abu Dhabi
 *  holder the same thing it tells a Fujairah holder, and those are different
 *  facts about how close the product is to serving them. */
export type MarketSupportState = "supported" | "pending_review" | "not_supported";

/** One sub-national licensing territory: an emirate, or Northern Ireland. */
export interface SubJurisdictionChoice {
  readonly code: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly supportState: MarketSupportState;
}

/** One country the holder may pick, and everything the picker needs to render
 *  it honestly without a second round trip. */
export interface JurisdictionChoice {
  readonly jurisdictionCode: string;
  readonly nameSv: string;
  readonly nameEn: string;
  /** The state of the country-level pack. `not_supported` when the country has
   *  no national pack at all — which is the UAE's situation, not a gap. */
  readonly nationalState: MarketSupportState;
  /** True when there is NO national pack, so a credential cannot be recorded
   *  against the country alone and the region question is mandatory.
   *
   *  The UAE is true: SIRA licenses Dubai and the other emirates have their
   *  own authorities, so "a UAE security licence" is not a thing that exists.
   *  The UK is FALSE even though it has a Northern Ireland pack — the seven
   *  Great Britain licence sectors resolve against the national pack, and
   *  asking every British holder which region they mean would be inventing a
   *  question to serve one licence. */
  readonly requiresSubJurisdiction: boolean;
  readonly subJurisdictions: readonly SubJurisdictionChoice[];
}

/** Every country and region the picker may offer, each with its true state.
 *
 *  ── WHY THIS REPLACED `listSelectableMarkets` ──────────────────────────
 *
 *  That function returned ACTIVE packs only. With Sweden the only active pack,
 *  it returned exactly one country — so the form's country select had one
 *  option, every holder was Swedish by construction, and the credential list
 *  shown underneath it was the Swedish one. A holder working in the UK saw
 *  VU1, VU2, Ordningsvakt and Skyddsvakt, because the product had no way to
 *  say "the United Kingdom exists and we are not ready for it".
 *
 *  Filtering the unreviewed markets out of the UI did not make them
 *  unavailable. It made them INVISIBLE, and invisible reads as Sweden.
 *
 *  So this returns every country the registry knows, with its state attached,
 *  and the caller renders the state. Nothing unreviewed becomes selectable —
 *  `listCredentialCatalogue` still refuses to return credentials for a market
 *  that is not `supported`, and `sp_claims_credential_rules` still refuses the
 *  write. What changes is that the holder is told the truth instead of being
 *  shown somebody else's country. */
export const listJurisdictionChoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly JurisdictionChoice[]> => {
    const { supabase } = context;

    const [countries, packs, subs] = await Promise.all([
      supabase.from("sp_jurisdictions").select("code, name_sv, name_en").order("code"),
      supabase
        .from("sp_market_packs")
        .select("code, jurisdiction_code, sub_jurisdiction_code, is_active")
        .is("superseded_on", null),
      supabase
        .from("sp_sub_jurisdictions")
        .select("code, jurisdiction_code, name_sv, name_en")
        .order("code"),
    ]);
    if (countries.error) throw new Error(countries.error.message);
    if (packs.error) throw new Error(packs.error.message);
    if (subs.error) throw new Error(subs.error.message);

    const packRows = packs.data ?? [];

    // A pack that exists but is inactive is pending review — the
    // sp_market_pack_active_needs_review constraint means is_active cannot be
    // true while the regulatory content is unreviewed, so "inactive" and
    // "unreviewed" are the same set and this mapping is exact rather than
    // approximate.
    const stateOf = (
      jurisdictionCode: string,
      subJurisdictionCode: string | null,
    ): MarketSupportState => {
      const pack = packRows.find(
        (p) =>
          p.jurisdiction_code === jurisdictionCode &&
          (p.sub_jurisdiction_code ?? null) === subJurisdictionCode,
      );
      if (!pack) return "not_supported";
      return pack.is_active ? "supported" : "pending_review";
    };

    return (countries.data ?? []).map((c) => {
      const mySubs = (subs.data ?? []).filter((sj) => sj.jurisdiction_code === c.code);
      const hasNationalPack = packRows.some(
        (p) => p.jurisdiction_code === c.code && p.sub_jurisdiction_code === null,
      );

      return {
        jurisdictionCode: c.code,
        nameSv: c.name_sv,
        nameEn: c.name_en,
        nationalState: stateOf(c.code, null),
        // Mandatory only when the country cannot be resolved on its own.
        requiresSubJurisdiction: !hasNationalPack && mySubs.length > 0,
        subJurisdictions: mySubs.map((sj) => ({
          code: sj.code,
          nameSv: sj.name_sv,
          nameEn: sj.name_en,
          supportState: stateOf(c.code, sj.code),
        })),
      };
    });
  });

/** The credentials that may be recorded in ONE market, and nothing else. */
export interface CredentialCatalogue {
  readonly marketPackCode: string | null;
  readonly supportState: MarketSupportState;
  readonly nameSv: string | null;
  readonly nameEn: string | null;
  /** Empty unless `supportState` is `supported`. Never a fallback list. */
  readonly credentials: readonly CredentialType[];
}

const marketInput = z.object({
  jurisdictionCode: z.string().regex(/^[A-Z]{2}$/),
  subJurisdictionCode: z
    .string()
    .regex(/^[A-Z]{2}-[A-Z0-9]{2,3}$/)
    .nullable(),
});

const CREDENTIAL_COLUMNS =
  "code, category, claim_type, name_sv, name_en, symbol_label, requires_valid_until, " +
  "requires_issuer, requires_scope, narrow_result_only, jurisdiction_code, " +
  "sub_jurisdiction_code, reference_label_en, reference_label_local";

interface CredentialRow {
  code: string;
  category: string;
  claim_type: string;
  name_sv: string;
  name_en: string;
  symbol_label: string;
  requires_valid_until: boolean;
  requires_issuer: boolean;
  requires_scope: boolean;
  narrow_result_only: boolean;
  jurisdiction_code: string | null;
  sub_jurisdiction_code: string | null;
  reference_label_en: string | null;
  reference_label_local: string | null;
}

function toCredentialType(r: CredentialRow): CredentialType {
  return {
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
    jurisdictionCode: r.jurisdiction_code,
    subJurisdictionCode: r.sub_jurisdiction_code,
    referenceLabelEn: r.reference_label_en,
    referenceLabelLocal: r.reference_label_local,
  };
}

/**
 * The credential catalogue for one jurisdiction, and ONLY that jurisdiction.
 *
 * ── THE DEFECT THIS FUNCTION EXISTS TO CLOSE ───────────────────────────
 *
 * `listCredentialTypes` selects every active credential in the database with
 * no jurisdiction filter of any kind. It is the correct query for LABELLING an
 * existing claim — a holder must be able to read an entry whatever market it
 * came from — and it is the wrong query for OFFERING one. Used as the
 * add-credential list, it means the vocabulary a holder may choose from is
 * "whatever is switched on globally", and the only reason a British holder was
 * not shown a Dubai cadre card is that the Dubai pack happens to be off.
 *
 * That is not a jurisdiction rule. It is a coincidence that reads like one.
 *
 * Here the market is resolved FIRST, from the pack registry, and the
 * credentials are those belonging to that pack. A credential belongs to
 * exactly one market pack, so the partition is total: there is no query
 * parameter, no flag and no empty-result path by which a Swedish credential
 * can be returned for a British market.
 *
 * ── AND IT IS STILL NOT THE GUARANTEE ──────────────────────────────────
 *
 * A caller that skips this function entirely and POSTs to the write path meets
 * `sp_claims_credential_rules`, which refuses a cross-market credential for
 * every caller including service_role. This function decides what a holder is
 * OFFERED; the trigger decides what can be STORED. Both are required, and only
 * the second is load-bearing.
 */
export const listCredentialCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketInput.parse(data))
  .handler(async ({ context, data }): Promise<CredentialCatalogue> => {
    const { supabase } = context;

    const { data: pack, error: packError } = await supabase
      .from("sp_market_packs")
      .select("code, name_sv, name_en, is_active")
      .eq("jurisdiction_code", data.jurisdictionCode)
      .is("superseded_on", null)
      .filter(
        "sub_jurisdiction_code",
        data.subJurisdictionCode === null ? "is" : "eq",
        data.subJurisdictionCode === null ? null : data.subJurisdictionCode,
      )
      .maybeSingle();
    if (packError) throw new Error(packError.message);

    // No pack: nobody has read this market's regulatory framework. The honest
    // answer is an empty catalogue and a state the UI can name — never another
    // market's list.
    if (!pack) {
      return {
        marketPackCode: null,
        supportState: "not_supported",
        nameSv: null,
        nameEn: null,
        credentials: [],
      };
    }

    if (!pack.is_active) {
      // Authored, unreviewed. The credentials exist and are deliberately not
      // returned: showing them greyed out would be showing regulatory content
      // no lawyer has approved, which is the thing the review gate is for.
      return {
        marketPackCode: pack.code,
        supportState: "pending_review",
        nameSv: pack.name_sv,
        nameEn: pack.name_en,
        credentials: [],
      };
    }

    const { data: rows, error } = await supabase
      .from("sp_credential_types")
      .select(CREDENTIAL_COLUMNS)
      .eq("market_pack_code", pack.code)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return {
      marketPackCode: pack.code,
      supportState: "supported",
      nameSv: pack.name_sv,
      nameEn: pack.name_en,
      credentials: (rows ?? []).map((r) => toCredentialType(r as unknown as CredentialRow)),
    };
  });

/** The supported credentials, straight from the database.
 *
 *  ── THIS IS THE LABELLING VOCABULARY, NOT THE PICKER ───────────────────
 *
 *  Deliberately unfiltered by jurisdiction, and that is correct HERE: an entry
 *  detail page must be able to name the credential it is showing whatever
 *  market it belongs to, including one whose pack has since been switched off.
 *  Filtering this by the viewer's market would blank the label on a real entry.
 *
 *  It must NOT be used to populate an add-credential list. That is what
 *  `listCredentialCatalogue` is for, and using this instead is precisely the
 *  defect that showed Swedish credentials to holders in other countries. */
export const listCredentialTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly CredentialType[]> => {
    const { data, error } = await context.supabase
      .from("sp_credential_types")
      .select(CREDENTIAL_COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => toCredentialType(r as unknown as CredentialRow));
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
  /** The emirate or devolved region, where the regulator is sub-national.
   *
   *  Absent from this schema until now, which meant a Dubai claim could not be
   *  written AT ALL through this path: `sp_claims_credential_rules` refuses a
   *  UAE claim with no emirate (SP_SUB_JURISDICTION_REQUIRED), and there was
   *  no parameter that could have supplied one. */
  subJurisdictionCode: z
    .string()
    .regex(/^[A-Z]{2}-[A-Z0-9]{2,3}$/)
    .nullable(),
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
    subJurisdictionCode: data.subJurisdictionCode,
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
        .select(CREDENTIAL_COLUMNS)
        .eq("code", data.credentialCode)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("SP_CREDENTIAL_CODE_UNKNOWN");
      type = toCredentialType(row as unknown as CredentialRow);
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
      // A narrow-result credential takes the taxonomy's own label, whatever
      // arrived. The database refuses anything else for every caller, so
      // passing the holder's text through would only turn a rule into an
      // error message.
      title: type.narrowResultOnly ? type.nameSv : (nullIfBlank(draft.title) ?? type.nameSv),
      claimed_issuer_name: nullIfBlank(draft.issuerName),
      jurisdiction_code: nullIfBlank(draft.jurisdictionCode),
      // Taken from the credential's own row when it has one, and from the
      // holder's choice otherwise.
      //
      // The taxonomy wins deliberately: a SIRA cadre card IS a Dubai
      // credential and a vehicle immobilisation licence IS a Northern Ireland
      // one, so neither can be filed anywhere else whatever arrived here. The
      // trigger refuses the mismatch either way; preferring the row means the
      // holder is never refused for a field the form derived on their behalf.
      sub_jurisdiction_code: type.subJurisdictionCode ?? draft.subJurisdictionCode,
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
        "id, credential_code, title, claimed_issuer_name, jurisdiction_code, sub_jurisdiction_code, issued_on, valid_from, valid_until, credential_reference, holder_note, authorisation_scope, updated_at",
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
      // No coalesce to "SE". A draft saved before the holder chose a country
      // has no country, and answering "Sweden" would put a jurisdiction on
      // their record that they never stated.
      jurisdictionCode: r.jurisdiction_code ?? "",
      subJurisdictionCode: r.sub_jurisdiction_code,
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

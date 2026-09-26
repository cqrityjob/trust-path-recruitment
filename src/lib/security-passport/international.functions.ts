import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CredentialDetails,
  CredentialIssuer,
  CredentialJurisdiction,
  CredentialVerificationEvent,
} from "./international";
import {
  PASSPORT_CATALOGUE_CONTRACT,
  PASSPORT_CATALOGUE_CONTRACT_HEADER,
} from "./catalogue-contract";

export interface CredentialOrganisationRole {
  credential_code: string;
  role: "issuer" | "regulator" | "training_provider" | "verification_authority";
  authority_id: string | null;
  certification_issuer_id: string | null;
  document_specific: boolean;
  source_url: string;
  checked_on: string;
}
export interface CredentialDefinitionReview {
  credential_code: string;
  professional_domain: string;
  source_url: string;
  checked_on: string;
  validity_sv: string;
  validity_en: string;
}
/** A governed VERSION of a definition (20261214090000): a revision of the
 *  qualification standard, never a holder's expiry. `catalogue_status`
 *  'superseded' means a newer version of the STANDARD exists — a certificate
 *  awarded against an earlier version is not thereby invalid. */
export interface CredentialDefinitionVersion {
  credential_code: string;
  version_key: string;
  official_title: string;
  qualification_code: string | null;
  qualification_version: string | null;
  register_code: string | null;
  framework_level: number | null;
  awarding_body: string;
  catalogue_status: "current" | "superseded";
  sort_order: number;
  source_url: string;
  checked_on: string;
  note_en: string | null;
}
export interface InternationalPassportMetadata {
  /** Governed versions, where a definition has them (the Indian NSQF
   *  qualifications). Read tolerantly: absent means "no versions offered". */
  definitionVersions?: readonly CredentialDefinitionVersion[];
  /** The version each of the holder's own claims states, by claim id. */
  statedVersions?: readonly { claim_id: string; definition_version: string | null }[];
  definitionScopes?: readonly {
    code: string;
    scope_code: string | null;
    /** The definition demands a holder-written authorisation scope (SV, SIRA cards). */
    requires_scope?: boolean | null;
    symbol_label?: string | null;
  }[];
  /** `sp_certification_definitions.abbreviation` — search only ("CPP", "CISSP"). */
  abbreviations?: readonly { credential_code: string; abbreviation: string | null }[];
  /** Approved issuer aliases — search only, never rendered ("(ISC)²"). */
  issuerAliases?: readonly { issuer_id: string; alias: string }[];
  organisationRoles?: readonly CredentialOrganisationRole[];
  definitionReviews?: readonly CredentialDefinitionReview[];
  definitions?: readonly ApprovedCredentialDefinition[];
  details: readonly CredentialDetails[];
  verificationEvents: readonly CredentialVerificationEvent[];
  jurisdictions: readonly CredentialJurisdiction[];
  issuers: readonly CredentialIssuer[];
  /**
   * `profiles.display_name` -- the same canonical source as the Passport's own
   * identity surface. Used for ONE thing: a consistency check against the name
   * printed on an uploaded document. A match proves nothing about identity and
   * a difference proves nothing about fraud.
   */
  holderDisplayName?: string | null;
}
export const getInternationalPassportMetadata = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InternationalPassportMetadata> => {
    const db = context.supabase;
    const [
      catalogue,
      details,
      jurisdictions,
      authorities,
      issuers,
      requests,
      decisions,
      roles,
      definitionReviews,
      scopes,
      abbreviations,
      issuerAliases,
      versions,
      statedVersions,
    ] = await Promise.all([
      db
        .from("sp_approved_credential_catalogue" as never)
        .select("*")
        .setHeader(PASSPORT_CATALOGUE_CONTRACT_HEADER, PASSPORT_CATALOGUE_CONTRACT),
      // New schema stays explicitly pending in release-state.json. RLS resolves
      // claim ownership; there is no caller-provided holder or service client.
      db
        .from("sp_credential_details" as never)
        .select(
          "claim_id,credential_class,original_language,issuing_country_code,issuing_jurisdiction_code,validity_jurisdiction_code,no_expiry",
        ),
      db
        .from("sp_credential_jurisdictions" as never)
        .select("code,jurisdiction_type,country_code,subdivision_code,name_sv,name_en"),
      db.from("sp_authorities").select("id,name_local,official_url").eq("is_active", true),
      db
        .from("sp_certification_issuers")
        .select("id,display_name,official_url,public_verification_url")
        .eq("is_active", true),
      db.from("sp_verification_requests").select("id,claim_id"),
      db
        .from("sp_verification_decisions")
        .select("request_id,decision,decided_at,valid_until")
        .order("decided_at", { ascending: true }),
      db.from("sp_credential_organisation_roles" as never).select("*"),
      db.from("sp_credential_definition_reviews" as never).select("*"),
      db.from("sp_credential_types").select("code,scope_code,requires_scope,symbol_label"),
      // Search aids only. A failure here must not take the whole wizard down, so
      // these two are read tolerantly below: no abbreviation means a weaker
      // search, never a missing catalogue.
      db.from("sp_certification_definitions").select("credential_code,abbreviation"),
      db.from("sp_certification_issuer_aliases" as never).select("issuer_id,alias"),
      // Versions and the holder's stated version: catalogue facts and the
      // holder's own rows (RLS). Tolerant, like the search aids: without them the
      // form simply offers no version question.
      db
        .from("sp_credential_definition_versions" as never)
        .select(
          "credential_code,version_key,official_title,qualification_code,qualification_version,register_code,framework_level,awarding_body,catalogue_status,sort_order,source_url,checked_on,note_en",
        )
        .order("sort_order", { ascending: true }),
      db.from("sp_credential_details" as never).select("claim_id,definition_version"),
    ]);
    // Tolerant on purpose: a missing profile row must not break the catalogue,
    // it only means the name on a document is shown and not compared.
    const profile = await db
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (
      [
        details,
        jurisdictions,
        authorities,
        issuers,
        requests,
        decisions,
        catalogue,
        roles,
        definitionReviews,
        scopes,
      ].some((r) => r.error)
    ) {
      throw new Error("International Passport metadata unavailable");
    }
    const claimOf = new Map((requests.data ?? []).map((r) => [r.id, r.claim_id]));
    return {
      definitionScopes: scopes.data as unknown as InternationalPassportMetadata["definitionScopes"],
      abbreviations: (abbreviations.error ? [] : (abbreviations.data ?? [])) as unknown as {
        credential_code: string;
        abbreviation: string | null;
      }[],
      issuerAliases: (issuerAliases.error ? [] : (issuerAliases.data ?? [])) as unknown as {
        issuer_id: string;
        alias: string;
      }[],
      definitionVersions: (versions.error
        ? []
        : (versions.data ?? [])) as unknown as CredentialDefinitionVersion[],
      statedVersions: (statedVersions.error ? [] : (statedVersions.data ?? [])) as unknown as {
        claim_id: string;
        definition_version: string | null;
      }[],
      organisationRoles: roles.data as unknown as CredentialOrganisationRole[],
      definitionReviews: definitionReviews.data as unknown as CredentialDefinitionReview[],
      definitions: catalogue.data as unknown as ApprovedCredentialDefinition[],
      verificationEvents: (decisions.data ?? []).flatMap((d) => {
        const claimId = claimOf.get(d.request_id);
        return claimId
          ? [{ claimId, result: d.decision, decidedAt: d.decided_at, validUntil: d.valid_until }]
          : [];
      }),
      holderDisplayName: profile.error ? null : profile.data?.display_name?.trim() || null,
      details: details.data as unknown as CredentialDetails[],
      jurisdictions: jurisdictions.data as unknown as CredentialJurisdiction[],
      issuers: [
        ...(authorities.data ?? []).map((r) => ({
          id: r.id,
          kind: "authority" as const,
          name: r.name_local,
          officialUrl: r.official_url,
          verificationUrl: null,
          trustSource: "governed_catalogue" as const,
        })),
        ...(issuers.data ?? []).map((r) => ({
          id: r.id,
          kind: "certification_body" as const,
          name: r.display_name,
          officialUrl: r.official_url,
          verificationUrl: r.public_verification_url,
          trustSource: "governed_catalogue" as const,
        })),
      ],
    };
  });

import { z } from "zod";
const internationalInput = z
  .object({
    claim_id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    definition_code: z.string().min(1).max(64),
    market_country: z.string().max(2),
    market_region: z.string().max(64),
    identifier: z.string().max(120),
    issued_on: z.string().max(10),
    valid_until: z.string().max(10),
    no_expiry: z.boolean().nullable(),
    /** REQUIRED by the database for a scoped definition, refused for any other. */
    authorisation_scope: z.string().max(200).optional(),
    /** REQUIRED where the issuer is stated on the document, refused where governed. */
    issuer_name: z.string().max(160).optional(),
    /** The governed version the certificate names. Optional, never inferred;
     *  the database refuses a version that is not this definition's. */
    definition_version: z
      .string()
      .max(40)
      .regex(/^([a-z0-9][a-z0-9._-]{0,39})?$/)
      .optional(),
  })
  .strict();
export type InternationalCredentialInput = z.infer<typeof internationalInput>;
export const saveInternationalCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => internationalInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    // The two optional keys are sent ONLY when they carry a value. A database
    // that has not yet received 20261126090000 refuses unknown keys, and it also
    // never lists a definition that needs one — so an empty key must not travel.
    const { authorisation_scope, issuer_name, definition_version, ...core } = data;
    const input: Record<string, unknown> = { ...core };
    if (authorisation_scope?.trim()) input.authorisation_scope = authorisation_scope.trim();
    if (issuer_name?.trim()) input.issuer_name = issuer_name.trim();
    // Same rule for the version (20261214090000): only a stated version travels.
    if (definition_version?.trim()) input.definition_version = definition_version.trim();
    const result = (await context.supabase.rpc(
      "sp_save_international_credential" as never,
      { _input: input } as never,
    )) as unknown as { data: unknown; error: { message?: string } | null };
    if (result.error || typeof result.data !== "string") {
      // Only the two holder-fixable refusals are named; everything else stays generic.
      const message = result.error?.message ?? "";
      if (message.includes("SP_CREDENTIAL_REQUIRES_SCOPE"))
        throw new Error("SP_CREDENTIAL_REQUIRES_SCOPE");
      if (message.includes("SP_CREDENTIAL_REQUIRES_ISSUER"))
        throw new Error("SP_CREDENTIAL_REQUIRES_ISSUER");
      if (message.includes("SP_ISSUER_IS_A_REGULATOR")) throw new Error("SP_ISSUER_IS_A_REGULATOR");
      if (message.includes("SP_DEFINITION_VERSION_UNKNOWN"))
        throw new Error("SP_DEFINITION_VERSION_UNKNOWN");
      throw new Error("Credential could not be saved");
    }
    return { id: result.data };
  });

export interface ApprovedCredentialDefinition {
  code: string;
  name_sv: string;
  name_en: string;
  credential_class: string;
  scope_code: string;
  country: string | null;
  region: string | null;
  /** NULL where the organisation-role model says the issuer is stated on the document. */
  issuer_id: string | null;
  issuer_name: string | null;
  official_url: string | null;
  verification_url: string | null;
  requires_valid_until: boolean;
  allows_no_expiry: boolean;
}

/** The governed facts about ONE definition, for a reviewer: its versions, its
 *  regulator and whether its issuer is stated on the certificate, and the
 *  source it was reviewed against. Catalogue data only -- readable by any
 *  signed-in user under the tables' own RLS; nothing personal is read here. */
export interface DefinitionFacts {
  readonly versions: readonly CredentialDefinitionVersion[];
  readonly regulator: string | null;
  readonly issuerStatedOnDocument: boolean;
  readonly scopeCode: string | null;
  readonly source: { readonly url: string; readonly checkedOn: string } | null;
}
export const getDefinitionFacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        code: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Z0-9_]+$/),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<DefinitionFacts> => {
    const db = context.supabase;
    const [versions, roles, review, type] = await Promise.all([
      db
        .from("sp_credential_definition_versions" as never)
        .select(
          "credential_code,version_key,official_title,qualification_code,qualification_version,register_code,framework_level,awarding_body,catalogue_status,sort_order,source_url,checked_on,note_en",
        )
        .eq("credential_code" as never, data.code as never)
        .order("sort_order" as never, { ascending: true }),
      db
        .from("sp_credential_organisation_roles" as never)
        .select("role,authority_id,document_specific")
        .eq("credential_code" as never, data.code as never),
      db
        .from("sp_credential_definition_reviews" as never)
        .select("source_url,checked_on")
        .eq("credential_code" as never, data.code as never)
        .maybeSingle(),
      db.from("sp_credential_types").select("scope_code").eq("code", data.code).maybeSingle(),
    ]);
    const roleRows = (roles.error ? [] : (roles.data ?? [])) as unknown as {
      role: string;
      authority_id: string | null;
      document_specific: boolean;
    }[];
    const regulatorId = roleRows.find((r) => r.role === "regulator")?.authority_id ?? null;
    const regulator = regulatorId
      ? await db.from("sp_authorities").select("name_local").eq("id", regulatorId).maybeSingle()
      : null;
    const reviewRow = (review.error ? null : review.data) as unknown as {
      source_url: string;
      checked_on: string;
    } | null;
    return {
      versions: (versions.error
        ? []
        : (versions.data ?? [])) as unknown as CredentialDefinitionVersion[],
      regulator: regulator?.data?.name_local ?? null,
      issuerStatedOnDocument: roleRows.some((r) => r.role === "issuer" && r.document_specific),
      scopeCode: type.error ? null : (type.data?.scope_code ?? null),
      source: reviewRow ? { url: reviewRow.source_url, checkedOn: reviewRow.checked_on } : null,
    };
  });

/** Resume an owned governed draft without accepting its old free-text metadata. */
export const readApprovedCredentialDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ context, data }): Promise<InternationalCredentialInput | null> => {
    const result = await context.supabase
      .from("sp_claims")
      .select(
        "id,version_no,credential_code,jurisdiction_code,sub_jurisdiction_code,credential_reference,issued_on,valid_until,authorisation_scope,claimed_issuer_name",
      )
      .eq("holder_user_id", context.userId)
      .eq("id", data.id)
      .eq("lifecycle_state", "draft")
      .maybeSingle();
    if (result.error) throw new Error("Credential draft unavailable");
    const row = result.data;
    if (!row?.credential_code) return null;
    return {
      claim_id: row.id,
      version: row.version_no,
      definition_code: row.credential_code,
      market_country: row.jurisdiction_code ?? "",
      market_region: row.sub_jurisdiction_code ?? "",
      identifier: row.credential_reference ?? "",
      issued_on: row.issued_on ?? "",
      valid_until: row.valid_until ?? "",
      no_expiry: null,
      // Carried so a scoped or document-issuer draft resumes complete. The form
      // sends them back only where the SELECTED definition asks for them.
      authorisation_scope: row.authorisation_scope ?? "",
      issuer_name: row.claimed_issuer_name ?? "",
    };
  });

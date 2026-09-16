import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CredentialDetails,
  CredentialIssuer,
  CredentialJurisdiction,
  CredentialVerificationEvent,
} from "./international";

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
export interface InternationalPassportMetadata {
  definitionScopes?: readonly { code: string; scope_code: string | null }[];
  organisationRoles?: readonly CredentialOrganisationRole[];
  definitionReviews?: readonly CredentialDefinitionReview[];
  definitions?: readonly ApprovedCredentialDefinition[];
  details: readonly CredentialDetails[];
  verificationEvents: readonly CredentialVerificationEvent[];
  jurisdictions: readonly CredentialJurisdiction[];
  issuers: readonly CredentialIssuer[];
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
    ] = await Promise.all([
      db.from("sp_approved_credential_catalogue" as never).select("*"),
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
      db.from("sp_credential_types").select("code,scope_code"),
    ]);
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
      definitionScopes: scopes.data as unknown as { code: string; scope_code: string | null }[],
      organisationRoles: roles.data as unknown as CredentialOrganisationRole[],
      definitionReviews: definitionReviews.data as unknown as CredentialDefinitionReview[],
      definitions: catalogue.data as unknown as ApprovedCredentialDefinition[],
      verificationEvents: (decisions.data ?? []).flatMap((d) => {
        const claimId = claimOf.get(d.request_id);
        return claimId
          ? [{ claimId, result: d.decision, decidedAt: d.decided_at, validUntil: d.valid_until }]
          : [];
      }),
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
  })
  .strict();
export type InternationalCredentialInput = z.infer<typeof internationalInput>;
export const saveInternationalCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => internationalInput.parse(data))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const result = (await context.supabase.rpc(
      "sp_save_international_credential" as never,
      { _input: data } as never,
    )) as unknown as { data: unknown; error: unknown };
    if (result.error || typeof result.data !== "string")
      throw new Error("Credential could not be saved");
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
  issuer_id: string;
  issuer_name: string;
  official_url: string | null;
  verification_url: string | null;
  requires_valid_until: boolean;
  allows_no_expiry: boolean;
}

/** Resume an owned governed draft without accepting its old free-text metadata. */
export const readApprovedCredentialDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ context, data }): Promise<InternationalCredentialInput | null> => {
    const result = await context.supabase
      .from("sp_claims")
      .select(
        "id,version_no,credential_code,jurisdiction_code,sub_jurisdiction_code,credential_reference,issued_on,valid_until",
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
    };
  });

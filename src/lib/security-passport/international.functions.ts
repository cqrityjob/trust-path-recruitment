import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CredentialDetails, CredentialIssuer, CredentialJurisdiction } from "./international";

export interface InternationalPassportMetadata {
  details: readonly CredentialDetails[];
  jurisdictions: readonly CredentialJurisdiction[];
  issuers: readonly CredentialIssuer[];
}
export const getInternationalPassportMetadata = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InternationalPassportMetadata> => {
    const db = context.supabase;
    const [details, jurisdictions, authorities, issuers] = await Promise.all([
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
    ]);
    if ([details, jurisdictions, authorities, issuers].some((r) => r.error)) {
      throw new Error("International Passport metadata unavailable");
    }
    return {
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

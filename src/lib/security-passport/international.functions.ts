import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  CredentialDetails,
  CredentialIssuer,
  CredentialJurisdiction,
  CredentialVerificationEvent,
} from "./international";

export interface InternationalPassportMetadata {
  details: readonly CredentialDetails[];
  verificationEvents: readonly CredentialVerificationEvent[];
  jurisdictions: readonly CredentialJurisdiction[];
  issuers: readonly CredentialIssuer[];
}
export const getInternationalPassportMetadata = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InternationalPassportMetadata> => {
    const db = context.supabase;
    const [details, jurisdictions, authorities, issuers, requests, decisions] = await Promise.all([
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
    ]);
    if ([details, jurisdictions, authorities, issuers, requests, decisions].some((r) => r.error)) {
      throw new Error("International Passport metadata unavailable");
    }
    const claimOf = new Map((requests.data ?? []).map((r) => [r.id, r.claim_id]));
    return {
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
import { CREDENTIAL_CLASSES } from "./international";
const internationalInput = z
  .object({
    claim_id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    class: z.enum(
      Object.keys(CREDENTIAL_CLASSES) as [
        keyof typeof CREDENTIAL_CLASSES,
        ...(keyof typeof CREDENTIAL_CLASSES)[],
      ],
    ),
    title: z.string().trim().min(1).max(240),
    issuer: z.string().trim().min(1).max(240),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .or(z.literal("")),
    issuing_jurisdiction: z.string().max(64),
    validity_jurisdiction: z.string().max(64),
    language: z.string().max(35),
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

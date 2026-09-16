import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RecipientPayload } from "./packages";
import { readCreateResult } from "./selected-sharing.functions";

const selection = z
  .object({
    claimIds: z.array(z.string().uuid()).min(1).max(200),
    permittedFields: z.array(z.enum(["holder_name", "identifier", "profile_title"])).max(3),
    expiresDays: z.number().refine((v) => [7, 30, 90].includes(v)),
    locale: z.enum(["sv", "en"]),
  })
  .strict();
export const previewCredentialShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => selection.parse(data))
  .handler(async ({ context, data }): Promise<RecipientPayload> => {
    const result = await context.supabase.rpc(
      "sp_preview_credential_disclosure_v2" as never,
      {
        _claim_ids: data.claimIds,
        _fields: data.permittedFields,
        _expires_days: data.expiresDays,
        _purpose: null,
        _locale: data.locale,
      } as never,
    );
    if (result.error) throw new Error("Credential preview unavailable");
    return result.data as unknown as RecipientPayload;
  });
export const createCredentialShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => selection.extend({ requestKey: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const result = await context.supabase.rpc(
      "sp_create_credential_disclosure_v2" as never,
      {
        _claim_ids: data.claimIds,
        _fields: data.permittedFields,
        _expires_days: data.expiresDays,
        _purpose: null,
        _recipient_hint: null,
        _locale: data.locale,
        _request_key: data.requestKey,
      } as never,
    );
    if (result.error) throw new Error("Credential share could not be created");
    return readCreateResult(result.data);
  });

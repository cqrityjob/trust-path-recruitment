// Phase H3.1 — self-service employer onboarding.
//
// Thin server function wrapping the SECURITY DEFINER RPC
// `public.create_employer_self_service`. Every privileged decision
// (uniqueness, one-org-per-user rule, forced draft status, forced
// owner+active membership, audit log) lives in the RPC, not here.
// The bearer-attached ctx.supabase is enough: no service_role client
// is imported here.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

const createSelfServiceEmployerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.string().trim().max(500).optional().nullable(),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((v) => v.toUpperCase())
    .optional()
    .nullable(),
  descriptionSv: z.string().trim().max(2000).optional().nullable(),
  descriptionEn: z.string().trim().max(2000).optional().nullable(),
});

export type SelfServiceEmployerResult = {
  employerId: string;
  employerSlug: string;
};

export const createSelfServiceEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSelfServiceEmployerSchema.parse(d))
  .handler(async ({ data, context }): Promise<SelfServiceEmployerResult> => {
    const ctx = context as Ctx;

    const { data: rows, error } = await ctx.supabase.rpc("create_employer_self_service", {
      p_name: data.name,
      p_website: data.website ?? null,
      p_country: data.country ?? null,
      p_description_sv: data.descriptionSv ?? null,
      p_description_en: data.descriptionEn ?? null,
    });

    if (error) {
      // Surface the DB message — validation errors here are user-facing
      // (e.g. "You already own an employer organisation.").
      throw new Error(error.message);
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.employer_id || !row?.employer_slug) {
      throw new Error("Employer creation did not return an identifier.");
    }

    return {
      employerId: row.employer_id as string,
      employerSlug: row.employer_slug as string,
    };
  });
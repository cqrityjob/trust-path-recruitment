import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Phase H3.2 — Employer organisation settings (view + edit).
//
// getEmployerOrganisation is a plain RLS-scoped read (existing
// employers_member_select policy — any active member of the employer can
// read; already granted by Phase G1, unchanged here).
//
// updateEmployerOrganisation writes through the caller's own RLS-scoped
// client too, NOT supabaseAdmin -- the new employers_owner_admin_update
// policy (supabase/migrations/20260720064743_h3_2_employer_settings.sql)
// is the actual authorization boundary (owner/admin role + employer not
// suspended/archived/rejected), and the employers_validate_before_write
// trigger independently rejects any attempt to change status or slug
// regardless of what this function's input schema would otherwise allow
// through. This mirrors the low-privilege-by-default shape already used
// for jobs (jobs_employer_update_editable) rather than the service-role
// pattern used for company creation, because a genuine RLS policy exists
// here and a service-role bypass isn't needed.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

const employerIdSchema = z.object({ employerId: z.string().uuid() });

export type EmployerOrganisation = {
  id: string;
  slug: string;
  name: string;
  website: string | null;
  country: string | null;
  registrationNumber: string | null;
  descriptionSv: string | null;
  descriptionEn: string | null;
  status: "draft" | "pending" | "active" | "rejected" | "suspended" | "archived";
};

export const getEmployerOrganisation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerOrganisation> => {
    const ctx = context as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("employers")
      .select(
        "id, slug, name, website, country, registration_number, description_sv, description_en, status",
      )
      .eq("id", data.employerId)
      .maybeSingle();
    if (error) throw new Error("Could not load the organisation.");
    if (!row) throw new Error("Organisation not found or access denied");
    return {
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      website: row.website as string | null,
      country: row.country as string | null,
      registrationNumber: row.registration_number as string | null,
      descriptionSv: row.description_sv as string | null,
      descriptionEn: row.description_en as string | null,
      status: row.status as EmployerOrganisation["status"],
    };
  });

const updateEmployerOrganisationSchema = z.object({
  employerId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  website: z.string().trim().max(300).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  descriptionSv: z.string().trim().max(2000).nullable().optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
});

export const updateEmployerOrganisation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateEmployerOrganisationSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const ctx = context as Ctx;

    // Only include fields the caller actually sent -- status/slug are
    // never in this schema at all, so there is no risk of accidentally
    // forwarding them even before the trigger's own independent guard
    // would reject them.
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.website !== undefined) patch.website = data.website;
    if (data.country !== undefined) patch.country = data.country;
    if (data.registrationNumber !== undefined) patch.registration_number = data.registrationNumber;
    if (data.descriptionSv !== undefined) patch.description_sv = data.descriptionSv;
    if (data.descriptionEn !== undefined) patch.description_en = data.descriptionEn;

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await ctx.supabase.from("employers").update(patch).eq("id", data.employerId);
    if (error) {
      // RLS denial and the trigger's RAISE EXCEPTION both surface here as
      // a generic PostgREST error -- never echoed raw to the client.
      throw new Error(
        "Could not save organisation settings. You may not have permission to edit this organisation.",
      );
    }
    return { ok: true };
  });

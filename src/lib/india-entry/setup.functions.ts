// India entry — the setup's server calls.
//
// Three calls, each through the holder's own session (RLS decides; there is no
// service client and no caller-supplied user id):
//
//   readIndiaSetup        everything the four steps need to resume where the
//                         holder left off, read from persisted rows
//   saveCurrentLocation   the Profile's "where I live" (candidate_current_location)
//   saveJobPreferences    desired destinations (candidate_job_preferences)
//
// The display name and the occupation are written by the EXISTING writers
// (savePassportBasics, setMyCurrentProfession) and the Passport by
// ensureFirstRunPassport; this file adds no second path to any of them. And it
// is structurally unable to touch a credential, a work country, a market or a
// verification state: none of those tables appears below except sp_claims,
// which is only ever READ, to list what the holder already holds.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DESTINATIONS, RELOCATION_INTEREST, isResidenceCountry } from "./destinations";

export interface IndiaSetupCredential {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  /** The DEFINITION's declared scope; a globe is drawn only for
   *  'global_professional', never inferred from a missing country. */
  readonly scopeCode: string | null;
  readonly jurisdictionCode: string | null;
  readonly subJurisdictionCode: string | null;
  readonly assertion: string;
  readonly validUntil: string | null;
}

export interface IndiaSetupState {
  readonly passportExists: boolean;
  /** The Passport's display name, or the name given at sign-up. */
  readonly displayName: string | null;
  readonly professionSlug: string | null;
  readonly professionOther: string | null;
  readonly location: { readonly countryCode: string; readonly locality: string | null } | null;
  readonly preferences: {
    readonly destinations: readonly string[];
    readonly relocationInterest: string | null;
  } | null;
  /** The holder's CURRENT governed credentials, for the destination checklist. */
  readonly credentials: readonly IndiaSetupCredential[];
}

type Row = Record<string, unknown>;

export const readIndiaSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IndiaSetupState> => {
    const db = context.supabase;
    const me = context.userId;
    const [passport, profile, career, location, prefs, claims] = await Promise.all([
      db.from("sp_passport_profiles").select("display_name").eq("holder_user_id", me).maybeSingle(),
      db.from("profiles").select("display_name").eq("id", me).maybeSingle(),
      db
        .from("security_career_profiles")
        .select("current_profession_slug,current_profession_other")
        .eq("user_id", me)
        .maybeSingle(),
      db
        .from("candidate_current_location" as never)
        .select("country_code,locality")
        .eq("user_id" as never, me as never)
        .maybeSingle(),
      db
        .from("candidate_job_preferences" as never)
        .select("desired_destinations,relocation_interest")
        .eq("user_id" as never, me as never)
        .maybeSingle(),
      db
        .from("sp_claims")
        .select(
          "id,title,credential_code,jurisdiction_code,sub_jurisdiction_code,assertion_level,valid_until",
        )
        .eq("holder_user_id", me)
        .eq("lifecycle_state", "active")
        .not("credential_code", "is", null)
        .order("created_at", { ascending: true }),
    ]);
    for (const r of [passport, profile, career, location, prefs, claims]) {
      if (r.error) throw new Error("INDIA_SETUP_UNAVAILABLE");
    }
    const codes = [
      ...new Set(((claims.data ?? []) as Row[]).map((c) => String(c.credential_code))),
    ];
    const scopes = codes.length
      ? await db.from("sp_credential_types").select("code,scope_code").in("code", codes)
      : { data: [] as Row[], error: null };
    if (scopes.error) throw new Error("INDIA_SETUP_UNAVAILABLE");
    const scopeOf = new Map(
      ((scopes.data ?? []) as Row[]).map((r) => [
        String(r.code),
        (r.scope_code as string | null) ?? null,
      ]),
    );
    const loc = location.data as Row | null;
    const pref = prefs.data as Row | null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      passportExists: passport.data !== null,
      displayName:
        (passport.data?.display_name as string | null)?.trim() ||
        (profile.data?.display_name as string | null)?.trim() ||
        null,
      professionSlug: (career.data?.current_profession_slug as string | null) ?? null,
      professionOther: (career.data?.current_profession_other as string | null) ?? null,
      location: loc
        ? {
            countryCode: String(loc.country_code),
            locality: (loc.locality as string | null) ?? null,
          }
        : null,
      preferences: pref
        ? {
            destinations: (pref.desired_destinations as string[] | null) ?? [],
            relocationInterest: (pref.relocation_interest as string | null) ?? null,
          }
        : null,
      // Current means active AND not lapsed; an expired credential is history.
      credentials: ((claims.data ?? []) as Row[])
        .filter((c) => !c.valid_until || String(c.valid_until) >= today)
        .map((c) => ({
          id: String(c.id),
          title: String(c.title),
          code: (c.credential_code as string | null) ?? null,
          scopeCode: scopeOf.get(String(c.credential_code)) ?? null,
          jurisdictionCode: (c.jurisdiction_code as string | null) ?? null,
          subJurisdictionCode: (c.sub_jurisdiction_code as string | null) ?? null,
          assertion: String(c.assertion_level),
          validUntil: (c.valid_until as string | null) ?? null,
        })),
    };
  });

const locationInput = z
  .object({
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .refine(isResidenceCountry, "not an ISO country"),
    // Unicode, any script; no control characters (the database refuses them too).
    locality: z
      .string()
      .max(80)
      // eslint-disable-next-line no-control-regex
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "control characters")
      .optional(),
  })
  .strict();

export const saveCurrentLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => locationInput.parse(data))
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const locality = data.locality?.trim() || null;
    const { error } = await context.supabase.from("candidate_current_location" as never).upsert(
      {
        user_id: context.userId,
        country_code: data.countryCode,
        locality,
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error("INDIA_LOCATION_NOT_SAVED");
    return { savedAt: new Date().toISOString() };
  });

const preferencesInput = z
  .object({
    destinations: z
      .array(z.enum(DESTINATIONS))
      .max(DESTINATIONS.length)
      .refine((d) => new Set(d).size === d.length, "duplicate destination"),
    relocationInterest: z.enum(RELOCATION_INTEREST).nullable(),
  })
  .strict();

export const saveJobPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => preferencesInput.parse(data))
  .handler(async ({ context, data }): Promise<{ savedAt: string }> => {
    const { error } = await context.supabase.from("candidate_job_preferences" as never).upsert(
      {
        user_id: context.userId,
        desired_destinations: data.destinations,
        relocation_interest: data.relocationInterest,
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error("INDIA_PREFERENCES_NOT_SAVED");
    return { savedAt: new Date().toISOString() };
  });

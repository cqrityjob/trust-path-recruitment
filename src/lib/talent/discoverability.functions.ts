// The person's side of talent discovery (slots 20270317090000 and
// 20270318090000): whether they can be found, with exactly which merits and
// preferences, what an employer would see, and the contact requests they have
// received.
//
// Everything is the database's to decide: consent is required to leave
// `private`, only the holder's own current entries can be selected, a stale
// page is refused (SP_TALENT_STALE), pausing rotates the reference employers
// hold. This file maps refusals to codes the page can say in words.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSchemaMissing } from "@/lib/security-passport/review-thread.functions";
import type { TalentCard, TalentPreferences, Visibility, ContactStatus } from "./model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Ctx = { supabase: Loose; userId: string };

export interface DiscoverabilitySettings {
  readonly visibility: Visibility;
  readonly version: number;
  readonly consentTextVersion: string | null;
  readonly consentedAt: string | null;
  readonly visibilityChangedAt: string | null;
  readonly preferences: TalentPreferences;
  readonly claimIds: readonly string[];
  readonly experienceIds: readonly string[];
  readonly blockedEmployers: readonly { employerId: string; name: string; since: string }[];
}

export type DiscoverabilityRead =
  | { readonly installed: false }
  | {
      readonly installed: true;
      readonly settings: DiscoverabilitySettings;
      readonly preview: { readonly searchable: boolean; readonly card: TalentCard | null };
    };

function toSettings(raw: Loose): DiscoverabilitySettings {
  const p = raw?.preferences ?? {};
  return {
    visibility: (raw?.visibility ?? "private") as Visibility,
    version: Number(raw?.version ?? 0),
    consentTextVersion: raw?.consentTextVersion ?? null,
    consentedAt: raw?.consentedAt ?? null,
    visibilityChangedAt: raw?.visibilityChangedAt ?? null,
    preferences: {
      areas: p.areas ?? [],
      countries: p.countries ?? [],
      cities: p.cities ?? [],
      employmentTypes: p.employmentTypes ?? [],
      workplaceTypes: p.workplaceTypes ?? [],
      availableFrom: p.availableFrom ?? null,
    },
    claimIds: raw?.items?.claims ?? [],
    experienceIds: raw?.items?.experiences ?? [],
    blockedEmployers: raw?.blockedEmployers ?? [],
  };
}

export const getDiscoverability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscoverabilityRead> => {
    const ctx = context as Ctx;
    const [settings, preview] = await Promise.all([
      ctx.supabase.rpc("sp_talent_get_settings"),
      ctx.supabase.rpc("sp_talent_preview"),
    ]);
    const error = settings.error ?? preview.error;
    if (error) {
      if (isSchemaMissing(error)) return { installed: false };
      console.error("[talent] settings read failed", error.code);
      throw new Error("DISCOVERABILITY_UNAVAILABLE");
    }
    return {
      installed: true,
      settings: toSettings(settings.data),
      preview: {
        searchable: Boolean((preview.data as Loose)?.searchable),
        card: ((preview.data as Loose)?.card ?? null) as TalentCard | null,
      },
    };
  });

export const SAVE_ERROR_CODES = [
  "SP_TALENT_STALE",
  "SP_TALENT_CONSENT_REQUIRED",
  "SP_TALENT_NOTHING_SELECTED",
  "SP_TALENT_ITEM_NOT_AVAILABLE",
  "SP_TALENT_INVALID",
] as const;
export type SaveErrorCode = (typeof SAVE_ERROR_CODES)[number] | "DISCOVERABILITY_FAILED";

function saveError(error: { code?: string; message?: string }): Error {
  const message = String(error.message ?? "");
  const code = SAVE_ERROR_CODES.find((c) => message.includes(c));
  if (!code) console.error("[talent] save failed", error.code);
  return new Error(code ?? "DISCOVERABILITY_FAILED");
}

const saveInput = z.object({
  expectedVersion: z.number().int().min(0),
  visibility: z.enum(["private", "open", "active"]),
  consentTextVersion: z
    .string()
    .regex(/^[a-z0-9._-]{1,40}$/)
    .nullable(),
  claimIds: z.array(z.string().uuid()).max(40),
  experienceIds: z.array(z.string().uuid()).max(20),
  preferences: z.object({
    areas: z.array(z.string().max(60)).max(14),
    countries: z.array(z.string().regex(/^[A-Za-z]{2}$/)).max(10),
    cities: z.array(z.string().max(80)).max(5),
    employmentTypes: z.array(z.string().max(20)).max(5),
    workplaceTypes: z.array(z.string().max(20)).max(3),
    availableFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  }),
});

export const saveDiscoverability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data, context }): Promise<DiscoverabilitySettings> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("sp_talent_save_settings", {
      _expected_version: data.expectedVersion,
      _visibility: data.visibility,
      _consent_text_version: data.consentTextVersion,
      _claim_ids: data.claimIds,
      _experience_ids: data.experienceIds,
      _preferences: data.preferences,
    });
    if (result.error) throw saveError(result.error);
    return toSettings(result.data);
  });

export const pauseDiscoverability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscoverabilitySettings> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("sp_talent_pause");
    if (result.error) throw saveError(result.error);
    return toSettings(result.data);
  });

export const unblockEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ employerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DiscoverabilitySettings> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("sp_talent_unblock_employer", {
      _employer_id: data.employerId,
    });
    if (result.error) throw saveError(result.error);
    return toSettings(result.data);
  });

// ── Contact requests received ────────────────────────────────────────────

export interface ReceivedContact {
  readonly id: string;
  readonly status: ContactStatus;
  readonly createdAt: string;
  readonly respondedAt: string | null;
  readonly message: string;
  readonly blockedEmployer: boolean;
  readonly employer: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly logoUrl: string | null;
  };
  readonly job: {
    readonly id: string;
    readonly slug: string;
    readonly titleSv: string | null;
    readonly titleEn: string | null;
    readonly city: string | null;
    readonly country: string | null;
    readonly employmentType: string | null;
    readonly open: boolean;
    readonly acceptsApplications: boolean;
  };
  readonly applicationId: string | null;
}

export type ReceivedContacts =
  | { readonly installed: false }
  | { readonly installed: true; readonly items: readonly ReceivedContact[] };

export const listMyContactRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReceivedContacts> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("sp_talent_my_contacts");
    if (result.error) {
      if (isSchemaMissing(result.error)) return { installed: false };
      console.error("[talent] contacts read failed", result.error.code);
      throw new Error("CONTACTS_UNAVAILABLE");
    }
    return { installed: true, items: (result.data ?? []) as ReceivedContact[] };
  });

export const RESPOND_ERROR_CODES = [
  "TALENT_CONTACT_ALREADY_ANSWERED",
  "TALENT_JOB_CLOSED",
  "TALENT_CONTACT_NOT_FOUND",
] as const;

export const respondToContactRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ contactId: z.string().uuid(), accept: z.boolean(), blockEmployer: z.boolean() })
      .refine((v) => !(v.accept && v.blockEmployer))
      .parse(d),
  )
  .handler(
    async ({ data, context }): Promise<{ status: "accepted" | "declined"; repeat: boolean }> => {
      const ctx = context as Ctx;
      const result = await ctx.supabase.rpc("sp_talent_respond_contact", {
        _contact_id: data.contactId,
        _accept: data.accept,
        _block_employer: data.blockEmployer,
      });
      if (result.error) {
        const message = String(result.error.message ?? "");
        const code = RESPOND_ERROR_CODES.find((c) => message.includes(c));
        if (!code) console.error("[talent] respond failed", result.error.code);
        throw new Error(code ?? "CONTACT_RESPONSE_FAILED");
      }
      const { dispatchUserNoticesSoon } = await import("@/lib/notices/user-notice.server");
      await dispatchUserNoticesSoon();
      const raw = result.data as Loose;
      return {
        status: raw?.status === "accepted" ? "accepted" : "declined",
        repeat: Boolean(raw?.repeat),
      };
    },
  );

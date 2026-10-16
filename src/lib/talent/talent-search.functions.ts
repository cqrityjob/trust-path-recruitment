// The employer's side of talent discovery (slot 20270318090000): bind the
// job's confirmed requirements to the catalogue, find voluntarily
// discoverable people for a published job, read why, and ask them to get in
// touch.
//
// Authority is the database's: rec_talent_user_may_search allows an active
// organisation's owner/admin or the job's responsible recruiter on a
// published, open job. Every other caller gets the same refusal,
// TALENT_SEARCH_NOT_AVAILABLE, which this file passes on as a code. The
// employerId is used only to scope the cache key on the client; the job id is
// what the database checks.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSchemaMissing } from "@/lib/security-passport/review-thread.functions";
import type { CatalogueOption, ContactStatus, Evaluation, TalentCard, TalentResult } from "./model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Ctx = { supabase: Loose; userId: string };

export const TALENT_ERROR_CODES = [
  "TALENT_SEARCH_NOT_AVAILABLE",
  "TALENT_RATE_LIMITED",
  "TALENT_PROFILE_REQUIRED",
  "TALENT_CRITERIA_STALE",
  "TALENT_CRITERIA_INVALID",
  "TALENT_CRITERIA_MIXED_CLASSES",
  "TALENT_CRITERIA_UNKNOWN_CREDENTIAL",
  "TALENT_CRITERIA_UNKNOWN_REQUIREMENT",
  "TALENT_PROFILE_NOT_AVAILABLE",
  "TALENT_CONTACT_INVALID",
  "TALENT_CONTACT_DECLINED_BEFORE",
  "TALENT_CONTACT_LIMIT_REACHED",
] as const;
export type TalentErrorCode =
  | (typeof TALENT_ERROR_CODES)[number]
  | "TALENT_NOT_INSTALLED"
  | "TALENT_FAILED";

export function classifyTalentError(
  error: { code?: string; message?: string } | null,
): TalentErrorCode {
  if (isSchemaMissing(error)) return "TALENT_NOT_INSTALLED";
  const message = String(error?.message ?? "");
  return TALENT_ERROR_CODES.find((c) => message.includes(c)) ?? "TALENT_FAILED";
}

function fail(error: { code?: string; message?: string }, what: string): Error {
  const code = classifyTalentError(error);
  if (code === "TALENT_FAILED") console.error(`[talent] ${what} failed`, error.code);
  return new Error(code);
}

const jobInput = z.object({ employerId: z.string().uuid(), jobId: z.string().uuid() });

export interface TalentCriteriaRead {
  readonly jobId: string;
  readonly jobStatus: string;
  readonly jobActive: boolean;
  readonly canManage: boolean;
  readonly maySearch: boolean;
  readonly profile: {
    readonly id: string;
    readonly version: number;
    readonly confirmedAt: string;
    readonly requirements: readonly {
      requirementId: string;
      kind: "mandatory" | "desirable";
      labelSv: string | null;
      labelEn: string | null;
      position: number;
    }[];
  } | null;
  readonly criteria: {
    readonly id: string;
    readonly version: number;
    readonly profileId: string;
    readonly confirmedAt: string;
    readonly current: boolean;
    readonly items: readonly Loose[];
  } | null;
  readonly jobPreferences: {
    readonly area: string | null;
    readonly country: string | null;
    readonly city: string | null;
    readonly employmentType: string | null;
    readonly workplaceType: string | null;
  };
}

export type TalentCriteriaAnswer =
  | { readonly installed: false }
  | ({ readonly installed: true } & TalentCriteriaRead);

export const getTalentCriteria = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.parse(d))
  .handler(async ({ data, context }): Promise<TalentCriteriaAnswer> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_get_criteria", { _job_id: data.jobId });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { installed: false };
      throw fail(result.error, "criteria read");
    }
    return { installed: true, ...(result.data as TalentCriteriaRead) };
  });

export const listTalentCatalogueOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CatalogueOption[]> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_catalogue_options");
    if (result.error) {
      if (isSchemaMissing(result.error)) return [];
      throw fail(result.error, "catalogue read");
    }
    return (result.data ?? []) as CatalogueOption[];
  });

export const confirmTalentCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    jobInput
      .extend({
        expectedVersion: z.number().int().min(0),
        // The requirement-profile version the editor showed; a newer one is
        // refused (TALENT_CRITERIA_STALE) so criteria never bind to an
        // unseen profile.
        profileId: z.string().uuid(),
        criteria: z.array(z.record(z.unknown())).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TalentCriteriaRead> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_confirm_criteria", {
      _job_id: data.jobId,
      _expected_version: data.expectedVersion,
      _profile_id: data.profileId,
      _criteria: data.criteria,
    });
    if (result.error) throw fail(result.error, "criteria confirm");
    return result.data as TalentCriteriaRead;
  });

const filtersSchema = z
  .object({
    allMandatory: z.boolean().optional(),
    reviewedOnly: z.boolean().optional(),
    validOnly: z.boolean().optional(),
    activeOnly: z.boolean().optional(),
    preferencesMatch: z.boolean().optional(),
  })
  .strict();
export type TalentFilters = z.infer<typeof filtersSchema>;

export type TalentSearchAnswer =
  | { readonly status: "not_installed" }
  | { readonly status: "profile_required" }
  | { readonly status: "criteria_required" }
  | {
      readonly status: "ok";
      readonly total: number;
      readonly shown: number;
      readonly profileVersion: number;
      readonly criteriaVersion: number;
      readonly searchedAt: string;
      readonly ordering: readonly string[];
      readonly results: readonly TalentResult[];
    };

export const searchTalent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.extend({ filters: filtersSchema }).parse(d))
  .handler(async ({ data, context }): Promise<TalentSearchAnswer> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_search", {
      _job_id: data.jobId,
      _filters: data.filters,
    });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { status: "not_installed" };
      throw fail(result.error, "search");
    }
    return result.data as TalentSearchAnswer;
  });

export type TalentProfileAnswer =
  | { readonly status: "not_available" }
  | {
      readonly status: "ok";
      readonly readAt: string;
      readonly card: TalentCard & { ref: string };
      readonly evaluation: Evaluation | null;
      readonly contact: {
        id: string;
        status: ContactStatus;
        createdAt: string;
        respondedAt: string | null;
      } | null;
    };

export const getTalentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.extend({ ref: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TalentProfileAnswer> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_profile", {
      _job_id: data.jobId,
      _ref: data.ref,
    });
    if (result.error) throw fail(result.error, "profile read");
    return result.data as TalentProfileAnswer;
  });

export const CONTACT_MESSAGE_MIN = 20;
export const CONTACT_MESSAGE_MAX = 2000;

export const sendTalentContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    jobInput
      .extend({
        ref: z.string().uuid(),
        message: z.string().trim().min(CONTACT_MESSAGE_MIN).max(CONTACT_MESSAGE_MAX),
        idempotencyKey: z.string().uuid(),
        locale: z.enum(["sv", "en"]),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      status: "sent" | "already_sent" | "already_contacted";
      id: string;
      contactStatus: ContactStatus;
    }> => {
      const ctx = context as Ctx;
      const result = await ctx.supabase.rpc("rec_talent_send_contact", {
        _job_id: data.jobId,
        _ref: data.ref,
        _message: data.message,
        _idempotency_key: data.idempotencyKey,
        _locale: data.locale,
      });
      if (result.error) throw fail(result.error, "contact send");
      const { dispatchUserNoticesSoon } = await import("@/lib/notices/user-notice.server");
      await dispatchUserNoticesSoon();
      return result.data as {
        status: "sent" | "already_sent" | "already_contacted";
        id: string;
        contactStatus: ContactStatus;
      };
    },
  );

export interface SentContact {
  readonly id: string;
  readonly status: ContactStatus;
  readonly createdAt: string;
  readonly respondedAt: string | null;
  readonly message: string;
  readonly sentByMe: boolean;
  /** Only after the person accepted. */
  readonly name: string | null;
  readonly applicationId: string | null;
  readonly currentlyDiscoverable: boolean;
  /** What the organisation saw when it wrote, with the time it was taken. */
  readonly snapshot:
    | (Partial<TalentCard> & { evaluation?: Evaluation | null; takenAt?: string })
    | null;
}

export const listTalentContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.parse(d))
  .handler(async ({ data, context }): Promise<SentContact[]> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_contacts", { _job_id: data.jobId });
    if (result.error) {
      if (isSchemaMissing(result.error)) return [];
      throw fail(result.error, "contacts read");
    }
    return (result.data ?? []) as SentContact[];
  });

export const withdrawTalentContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => jobInput.extend({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("rec_talent_withdraw_contact", {
      _contact_id: data.contactId,
    });
    if (result.error) throw fail(result.error, "contact withdraw");
    return result.data as { status: string };
  });

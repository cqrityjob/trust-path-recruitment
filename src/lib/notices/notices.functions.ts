// The signed-in person's inbox (user_notices, slot 20270316090000): what is
// waiting for them, and what was decided. Read under the person's own rights;
// a notice names ids, a catalogue code and -- for a contact -- the public
// organisation and vacancy, never another person's details.
//
// A failed read is an error, never an empty inbox.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSchemaMissing } from "@/lib/security-passport/review-thread.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Ctx = { supabase: Loose; userId: string };

export type NoticeKind =
  | "passport_review_requested"
  | "passport_clarification_answered"
  | "passport_clarification_requested"
  | "passport_decision_approved"
  | "passport_decision_rejected"
  | "passport_verification_revoked"
  | "talent_contact_received"
  | "talent_contact_accepted"
  | "talent_contact_declined";

export interface UserNotice {
  readonly id: string;
  readonly audience: "holder" | "reviewer" | "recruiter";
  readonly kind: NoticeKind;
  readonly subjectType: "claim" | "experience" | "request" | "contact";
  readonly subjectId: string;
  readonly requestId: string | null;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly credentialCode: string | null;
  readonly title: string | null;
  readonly employerName: string | null;
  readonly employerSlug: string | null;
  readonly jobTitleSv: string | null;
  readonly jobTitleEn: string | null;
  readonly jobId: string | null;
  readonly verificationMethod?: string | null;
}

export type Inbox =
  | { readonly installed: false }
  | { readonly installed: true; readonly unread: number; readonly items: readonly UserNotice[] };

export const listMyNotices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Inbox> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("user_notices_inbox", { _limit: 50 });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { installed: false };
      console.error("[notices] inbox read failed", result.error.code);
      throw new Error("INBOX_UNAVAILABLE");
    }
    const raw = (result.data ?? {}) as Loose;
    return {
      installed: true,
      unread: Number(raw.unread ?? 0),
      items: ((raw.items ?? []) as Loose[]).map((n) => ({
        id: String(n.id),
        audience: n.audience,
        kind: n.kind,
        subjectType: n.subjectType,
        subjectId: String(n.subjectId),
        requestId: n.requestId ?? null,
        createdAt: String(n.createdAt),
        readAt: n.readAt ?? null,
        credentialCode: n.credentialCode ?? null,
        title: n.title ?? null,
        employerName: n.employerName ?? null,
        employerSlug: n.employerSlug ?? null,
        jobTitleSv: n.jobTitleSv ?? null,
        jobTitleEn: n.jobTitleEn ?? null,
        jobId: n.jobId ?? null,
      })),
    };
  });

export const markNoticesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(100).nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ marked: number }> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("user_notices_mark_read", { _ids: data.ids });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { marked: 0 };
      console.error("[notices] mark read failed", result.error.code);
      throw new Error("INBOX_UNAVAILABLE");
    }
    return { marked: Number(result.data ?? 0) };
  });

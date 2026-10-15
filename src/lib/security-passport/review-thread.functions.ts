// Security Passport — the case thread of one entry, and the holder's text
// answer to a clarification (slot 20270316090000).
//
// One read for both sides of a review:
//
//   * the HOLDER reads what was asked, what they answered and what was
//     decided, in order, with the message they were shown each time;
//   * a VERIFIER reads the same thread plus the internal note.
//
// Who may read is decided by `sp_review_reader` in the database. The internal
// note never travels to a holder: the function does not return it to one, and
// this file does not ask for it by name.
//
// The reply is bound to the version the clarification was asked on
// (`submitted_at`). Answering moves the version exactly like answering by
// editing the entry does, so a reviewer page opened before the answer is
// refused (SP_REVIEW_STALE) and must reload -- and the reload shows the answer.
//
// Before the migration is applied the reads say `installed: false` and the
// panel keeps the existing answer-by-correction path; nothing fails.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Ctx = { supabase: Loose; userId: string };

export const REPLY_MAX_LENGTH = 2000;

export type ReviewState =
  | "none"
  | "pending"
  | "clarification_requested"
  | "approved"
  | "rejected"
  | "revoked"
  | "withdrawn";

export interface ReviewCurrent {
  readonly state: ReviewState;
  readonly requestId: string | null;
  readonly since: string | null;
  readonly submittedAt: string | null;
  readonly method: string | null;
  readonly organisation: string | null;
  readonly validUntil: string | null;
  readonly holderMessage: string | null;
}

export type ReviewThreadEvent =
  | {
      readonly type: "decision";
      readonly at: string;
      readonly requestId: string;
      readonly decision: "approved" | "rejected" | "clarification_requested" | "revoked";
      readonly method: string | null;
      readonly organisation: string | null;
      readonly validUntil: string | null;
      readonly holderMessage: string | null;
      /** Present only for a verifier. */
      readonly internalNote: string | null;
    }
  | {
      readonly type: "reply";
      readonly at: string;
      readonly requestId: string;
      readonly body: string;
    };

export type ReviewThread =
  | { readonly installed: false }
  | {
      readonly installed: true;
      readonly current: ReviewCurrent;
      readonly events: readonly ReviewThreadEvent[];
    };

export function isSchemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /Could not find the function|function .* does not exist/i.test(error.message ?? "")
  );
}

const entryInput = z.object({
  kind: z.enum(["claim", "experience"]),
  entryId: z.string().uuid(),
});

function toCurrent(raw: Loose): ReviewCurrent {
  return {
    state: (raw?.state ?? "none") as ReviewState,
    requestId: raw?.requestId ?? null,
    since: raw?.since ?? null,
    submittedAt: raw?.submittedAt ?? null,
    method: raw?.method ?? null,
    organisation: raw?.organisation ?? null,
    validUntil: raw?.validUntil ?? null,
    holderMessage: raw?.holderMessage ?? null,
  };
}

function toEvent(raw: Loose): ReviewThreadEvent | null {
  if (raw?.type === "reply") {
    return {
      type: "reply",
      at: String(raw.at),
      requestId: String(raw.requestId),
      body: String(raw.body ?? ""),
    };
  }
  if (raw?.type === "decision") {
    return {
      type: "decision",
      at: String(raw.at),
      requestId: String(raw.requestId),
      decision: raw.decision,
      method: raw.method ?? null,
      organisation: raw.organisation ?? null,
      validUntil: raw.validUntil ?? null,
      holderMessage: raw.holderMessage ?? null,
      internalNote: raw.internalNote ?? null,
    };
  }
  return null;
}

/** The thread of one entry, for its holder or a verifier. */
export const getReviewThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => entryInput.parse(d))
  .handler(async ({ data, context }): Promise<ReviewThread> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("sp_review_thread", {
      _claim_id: data.kind === "claim" ? data.entryId : null,
      _period_id: data.kind === "experience" ? data.entryId : null,
    });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { installed: false };
      // A thread nobody may read and a failed read are both failures here:
      // the panel says it could not load the history, never "no history".
      console.error("[passport] review thread read failed", result.error.code);
      throw new Error("REVIEW_THREAD_UNAVAILABLE");
    }
    const raw = result.data as Loose;
    return {
      installed: true,
      current: toCurrent(raw?.current),
      events: ((raw?.events ?? []) as Loose[])
        .map(toEvent)
        .filter((e): e is ReviewThreadEvent => e !== null),
    };
  });

export const REPLY_ERROR_CODES = [
  "SP_REVIEW_STALE",
  "SP_REQUEST_NOT_AWAITING_REPLY",
  "SP_REQUEST_NOT_FOUND",
  "SP_REPLY_INVALID",
] as const;
export type ReplyErrorCode =
  | (typeof REPLY_ERROR_CODES)[number]
  | "REPLY_NOT_INSTALLED"
  | "REPLY_FAILED";

const replyInput = z.object({
  requestId: z.string().uuid(),
  /** The request version the holder's page showed the clarification on. */
  reviewedSubmittedAt: z.string().min(10),
  body: z.string().trim().min(1).max(REPLY_MAX_LENGTH),
});

export function classifyReplyError(
  error: { code?: string; message?: string } | null,
): ReplyErrorCode {
  if (isSchemaMissing(error)) return "REPLY_NOT_INSTALLED";
  const message = String(error?.message ?? "");
  return REPLY_ERROR_CODES.find((c) => message.includes(c)) ?? "REPLY_FAILED";
}

/** The holder's text answer to a clarification. Idempotent per version: the
 *  same text sent twice (double click, retry after a lost answer) returns the
 *  reply the first call created. */
export const replyToClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => replyInput.parse(d))
  .handler(async ({ data, context }): Promise<{ status: "answered" | "already_answered" }> => {
    const ctx = context as Ctx;
    const result = await ctx.supabase.rpc("sp_reply_to_clarification", {
      _request_id: data.requestId,
      _reviewed_submitted_at: data.reviewedSubmittedAt,
      _body: data.body,
    });
    if (result.error) {
      const code = classifyReplyError(result.error);
      if (code === "REPLY_FAILED")
        console.error("[passport] clarification reply failed", result.error.code);
      throw new Error(code);
    }
    const status =
      (result.data as Loose)?.status === "already_answered" ? "already_answered" : "answered";
    // The reviewer is told by the database (user_notices); the mail goes out
    // in the background, bounded, and never blocks this answer.
    const { dispatchUserNoticesSoon } = await import("@/lib/notices/user-notice.server");
    await dispatchUserNoticesSoon();
    return { status };
  });

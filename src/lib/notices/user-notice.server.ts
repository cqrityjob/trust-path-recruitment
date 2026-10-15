// The e-mail half of user_notices (slot 20270316090000, widened by
// 20270318090000): claim what is due, render, send, settle.
//
//   enqueue   never here. Notices are written by the database itself
//             (triggers on decisions and requests, the contact RPCs), so who
//             is told about what is the database's decision, not a request's.
//   claim     user_notices_claim_emails (service role): due rows under a
//             3-minute lease, after re-checking at claim time that the
//             recipient may still receive the notice -- a reviewer who lost
//             the role, a recruiter no longer responsible, a contact already
//             answered are settled 'skipped' and never returned. The address
//             is read from auth.users at that moment.
//   send      sendProductNoticeEmail under the provider key
//             `user-notice:<row id>` on every attempt, so a retry after a lost
//             answer cannot make a second mail.
//   settle    user_notices_settle_email with the claim token: only the worker
//             that holds the claim can settle it.
//
// Called opportunistically after an action (bounded, never throws, never
// blocks the action's answer) and by the scheduled sweep
// (/api/recruitment/receipts-sweep, same token, same schedule).
//
// Before the migration is applied every call is a logged no-op.

import {
  isProductNoticeKind,
  sendProductNoticeEmail,
} from "@/lib/email/send-product-notice-email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };
export type NoticeRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcAnswer>;

export type UserNoticeDeps = {
  rpc?: NoticeRpc;
  fetchImpl?: typeof fetch;
  siteOrigin?: string;
};

/** What one dispatch may take. */
export const USER_NOTICE_BUDGET_MS = 3000;

async function defaultRpc(fn: string, args: Record<string, unknown>): Promise<RpcAnswer> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (await (supabaseAdmin as Loose).rpc(fn, args)) as RpcAnswer;
}

function isMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(String(error.code ?? ""))) return true;
  return /could not find the function|schema cache|does not exist/i.test(
    String(error.message ?? ""),
  );
}

type Claimed = {
  id: string;
  claimToken: string;
  kind: string;
  subjectType: "claim" | "experience" | "request" | "contact";
  subjectId: string;
  email: string | null;
  locale: string | null;
  employerName?: string | null;
  jobTitleSv?: string | null;
  jobTitleEn?: string | null;
  jobId?: string | null;
  employerSlug?: string | null;
};

export type DispatchOutcome =
  | { available: false }
  | {
      available: true;
      claimed: number;
      sent: number;
      failed: number;
      skipped: number;
      notConfigured: number;
    };

/** Claim and send what is due. Never throws. */
export async function dispatchUserNotices(
  deps: UserNoticeDeps = {},
  options: { limit?: number; budgetMs?: number } = {},
): Promise<DispatchOutcome> {
  const rpc = deps.rpc ?? defaultRpc;
  const started = Date.now();
  const budget = Math.min(options.budgetMs ?? USER_NOTICE_BUDGET_MS, 30_000);
  const outcome = {
    available: true as const,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    notConfigured: 0,
  };
  try {
    const { data, error } = await rpc("user_notices_claim_emails", { _limit: options.limit ?? 20 });
    if (error) {
      if (isMissing(error)) return { available: false };
      console.error("[user-notice] claim failed", error.code ?? "unknown");
      return outcome;
    }
    const rows = (Array.isArray(data) ? data : []) as Claimed[];
    outcome.claimed = rows.length;
    const origin =
      deps.siteOrigin ??
      (await import("@/lib/site-origin")).serverSiteOrigin(process.env.PUBLIC_SITE_URL);
    for (const row of rows) {
      const remaining = budget - (Date.now() - started);
      if (remaining <= 250) break; // the lease expires; the sweep takes it
      let settleAs: "sent" | "failed" | "skipped" | "not_configured";
      let code: string | null = null;
      if (!isProductNoticeKind(row.kind) || !row.email) {
        settleAs = "skipped";
        code = !row.email ? "no_address" : "unknown_kind";
      } else {
        const language = row.locale === "en" ? "en" : "sv";
        const answer = await sendProductNoticeEmail({
          kind: row.kind,
          language,
          siteOrigin: origin,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          employerName: row.employerName ?? null,
          jobTitle:
            (language === "en"
              ? (row.jobTitleEn ?? row.jobTitleSv)
              : (row.jobTitleSv ?? row.jobTitleEn)) ?? null,
          jobId: row.jobId ?? null,
          employerSlug: row.employerSlug ?? null,
          recipientEmail: row.email,
          idempotencyKey: `user-notice:${row.id}`,
          timeoutMs: Math.max(1000, Math.min(remaining - 200, 10_000)),
          fetchImpl: deps.fetchImpl,
        });
        if (answer.result === "sent") settleAs = "sent";
        else if (answer.result === "not_configured") settleAs = "not_configured";
        else if (answer.result === "not_allowlisted") {
          settleAs = "skipped";
          code = "not_allowlisted";
        } else {
          settleAs = "failed";
          code = answer.result === "failed" ? `HTTP_${answer.status}` : "no_answer";
        }
      }
      const settled = await rpc("user_notices_settle_email", {
        _id: row.id,
        _claim_token: row.claimToken,
        _outcome: settleAs,
        _error_code: code,
      });
      if (settled.error)
        console.error("[user-notice] settle failed", settled.error.code ?? "unknown");
      if (settleAs === "sent") outcome.sent += 1;
      else if (settleAs === "failed") outcome.failed += 1;
      else if (settleAs === "skipped") outcome.skipped += 1;
      else outcome.notConfigured += 1;
    }
  } catch (e) {
    console.error("[user-notice] dispatch failed", e instanceof Error ? e.name : "unknown");
  }
  return outcome;
}

/** After an action: send what is due, bounded, never failing the action. */
export async function dispatchUserNoticesSoon(deps: UserNoticeDeps = {}): Promise<void> {
  try {
    await dispatchUserNotices(deps, { limit: 10, budgetMs: USER_NOTICE_BUDGET_MS });
  } catch {
    // dispatchUserNotices never throws; belt and braces for the action's sake.
  }
}

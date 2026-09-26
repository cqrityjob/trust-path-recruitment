// The e-mail copy of an automatic receipt, driven by the server.
//
// The receipt itself is already in the candidate's CQrityjob inbox by the
// time this runs: the database wrote it in the same transaction as the
// submission (20261213090000). This file drives the second channel, and it
// is the ONLY place that does. The database's claim / settle / recovery
// functions are executable by service_role alone, so nothing a candidate or
// an employer can call through the API records what the provider answered:
//
//   claim    rec_claim_receipt_send hands over ONE attempt (its own id, the
//            provider key of the logical e-mail, the fixed recipient and the
//            envelope) -- or answers already_sent / in_progress / unknown /
//            failed / not_configured / none, in which case nothing is sent.
//            The person the server acts for is named (`actorUserId`) and
//            the database decides what they may do: a retry is a manager's,
//            and accepting a possible duplicate is a manager's explicit
//            decision.
//   send     the shared transport, with the provider's idempotency key and
//            a bounded call. Inert without RESEND_* (not_configured).
//   settle   rec_settle_receipt_send records the answer FOR THAT ATTEMPT.
//            A late answer for an earlier attempt is stale and changes
//            nothing.
//   sweep    rec_claim_due_receipts hands over what is due -- never started,
//            aged out, unknown inside the provider's window, rate-limited --
//            once, to one sweep at a time (SKIP LOCKED), bounded.
//
// Nothing here ever throws to a submission: an outage at the mail provider
// must not fail an application that is already saved, and must never tell a
// candidate to apply again. What could not be done is left on the row for
// the employer to see, and for the recovery to pick up.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type ReceiptEmailOutcome =
  | "sent"
  | "failed"
  | "not_configured"
  | "already_sent"
  | "in_progress"
  | "unknown"
  | "none"
  | "refused";

export type ReceiptDelivery = {
  outcome: ReceiptEmailOutcome;
  code: string | null;
  /** Whether a resend under the same key is still deduplicated by the
   *  provider (null when the row was not looked at). */
  windowOpen: boolean | null;
  attempts: number | null;
};

type Claim = {
  outcome: string;
  message_id: string | null;
  application_id: string | null;
  attempt_id: string | null;
  provider_key: string | null;
  recipient_email: string | null;
  language: string | null;
  subject: string | null;
  body: string | null;
  employer_name: string | null;
  job_title: string | null;
  window_open: boolean | null;
  attempts: number | null;
};

const RECEIPT_CTA = { sv: "Öppna din ansökan", en: "Open your application" } as const;

/** Absolute links in the e-mail only: the row keeps the site-relative link
 *  it was rendered with, and the envelope knows the host. */
export function absolutiseLinks(text: string, siteOrigin: string): string {
  const origin = siteOrigin.replace(/\/$/, "");
  return text.replace(/(^|[\s(])(\/my-career\/applications[^\s)]*)/g, `$1${origin}$2`);
}

/** The button's destination: exactly this application, on the site's own
 *  origin. The candidate route reads `application` from the query string,
 *  which survives the sign-in redirect. */
export function receiptLink(siteOrigin: string, applicationId: string): string {
  return `${siteOrigin.replace(/\/$/, "")}/my-career/applications?application=${encodeURIComponent(applicationId)}`;
}

async function siteOrigin(): Promise<string> {
  const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
  return process.env.PUBLIC_SITE_URL || SITE_ORIGIN;
}

function codeOf(error: { message?: string } | null | undefined): string {
  const message = String(error?.message ?? "");
  for (const known of ["RECRUITMENT_NOT_PERMITTED", "APPLICATION_NOT_FOUND"]) {
    if (message.includes(known)) return known;
  }
  return "RECRUITMENT_ACTION_FAILED";
}

/** Send one claimed attempt and settle it. Never throws. */
async function sendClaimed(
  claim: Claim,
): Promise<"sent" | "failed" | "not_configured" | "unknown"> {
  let result:
    | { result: "sent"; providerId: string | null }
    | { result: "not_configured" }
    | { result: "failed" | "unknown"; error: string };
  try {
    const { sendRecruitmentMessageEmail } =
      await import("@/lib/email/send-recruitment-message-email.server");
    const origin = await siteOrigin();
    const language = claim.language === "en" ? "en" : "sv";
    result =
      claim.recipient_email && claim.application_id
        ? await sendRecruitmentMessageEmail({
            recipientEmail: claim.recipient_email,
            language,
            subject: String(claim.subject ?? ""),
            body: absolutiseLinks(String(claim.body ?? ""), origin),
            employerName: String(claim.employer_name ?? ""),
            jobTitle: String(claim.job_title ?? ""),
            siteOrigin: origin,
            link: receiptLink(origin, claim.application_id),
            cta: RECEIPT_CTA[language],
            idempotencyKey: claim.provider_key ?? undefined,
            timeoutMs: 15_000,
          })
        : { result: "failed", error: "NO_ADDRESS" };
  } catch (e) {
    // The transport itself could not run: we do not know what reached the
    // provider, so this is unknown, and the row is settled as such.
    console.error("[recruitment] receipt transport failed", e);
    result = { result: "unknown", error: "TRANSPORT_ERROR" };
  }
  const { error } = await (supabaseAdmin as Loose).rpc("rec_settle_receipt_send", {
    _attempt_id: claim.attempt_id,
    _result: result.result,
    _error: result.result === "failed" || result.result === "unknown" ? result.error : null,
    _provider_id: result.result === "sent" ? result.providerId : null,
  });
  if (error) {
    // The provider answered and the answer could not be recorded: the row
    // stays 'sending', ages out to 'unknown', and the recovery resends it
    // under the same key inside the provider's window. Said, not hidden.
    console.error("[recruitment] receipt settle failed", error);
    return "unknown";
  }
  return result.result;
}

/** Claim, send and settle one receipt's e-mail. `actorUserId` is the person
 *  the server acts for (null: the system); `retry` and `acceptDuplicate`
 *  are decisions only a manager may take, and the database says so. */
export async function deliverReceiptEmail(
  applicationId: string,
  opts: { actorUserId?: string | null; retry?: boolean; acceptDuplicate?: boolean } = {},
): Promise<ReceiptDelivery> {
  const { data: rows, error } = await (supabaseAdmin as Loose).rpc("rec_claim_receipt_send", {
    _application_id: applicationId,
    _actor: opts.actorUserId ?? null,
    _retry: opts.retry ?? false,
    _accept_duplicate: opts.acceptDuplicate ?? false,
  });
  if (error) return { outcome: "refused", code: codeOf(error), windowOpen: null, attempts: null };
  const claim = (Array.isArray(rows) ? rows[0] : rows) as Claim | undefined;
  if (!claim)
    return {
      outcome: "refused",
      code: "RECRUITMENT_ACTION_FAILED",
      windowOpen: null,
      attempts: null,
    };
  if (claim.outcome !== "claimed") {
    return {
      outcome: claim.outcome as ReceiptEmailOutcome,
      code: null,
      windowOpen: claim.window_open,
      attempts: claim.attempts,
    };
  }
  const outcome = await sendClaimed(claim);
  return { outcome, code: null, windowOpen: true, attempts: claim.attempts };
}

/** Called by the submission right after the application committed. Never
 *  throws; a failure is logged and left on the row for the recovery. */
export async function dispatchApplicationReceipt(applicationId: string): Promise<void> {
  try {
    const r = await deliverReceiptEmail(applicationId);
    if (r.outcome === "refused") console.error("[recruitment] receipt e-mail refused", r.code);
  } catch (e) {
    console.error("[recruitment] receipt e-mail dispatch failed", e);
  }
}

export type ReceiptSweepSummary = {
  claimed: number;
  sent: number;
  failed: number;
  notConfigured: number;
  unknown: number;
};

/** The recovery: take what is due (for one organisation, or for all) and
 *  send it, one attempt per receipt. Bounded by `limit`; the database bounds
 *  the attempts per receipt and never hands the same receipt to two sweeps.
 *  Throws only when the database refused the claim itself. */
export async function sweepReceipts(
  opts: { limit?: number; employerId?: string | null } = {},
): Promise<ReceiptSweepSummary> {
  const summary: ReceiptSweepSummary = {
    claimed: 0,
    sent: 0,
    failed: 0,
    notConfigured: 0,
    unknown: 0,
  };
  const { data, error } = await (supabaseAdmin as Loose).rpc("rec_claim_due_receipts", {
    _limit: opts.limit ?? 20,
    _employer_id: opts.employerId ?? null,
  });
  if (error) {
    console.error("[recruitment] receipt sweep could not claim", error);
    throw new Error("RECRUITMENT_ACTION_FAILED");
  }
  for (const claim of ((data ?? []) as Claim[]).filter((c) => c.outcome === "claimed")) {
    summary.claimed += 1;
    const outcome = await sendClaimed(claim);
    if (outcome === "sent") summary.sent += 1;
    else if (outcome === "failed") summary.failed += 1;
    else if (outcome === "not_configured") summary.notConfigured += 1;
    else summary.unknown += 1;
  }
  return summary;
}

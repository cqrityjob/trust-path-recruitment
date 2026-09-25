// The e-mail copy of an automatic receipt, sent after the application's
// own transaction has committed.
//
// The receipt itself is already in the candidate's CQrityjob inbox by the
// time this runs: the database wrote it at the commit of the submission
// (20261213090000). This file only drives the second channel, through the
// same claim / settle pair the workspace's messages use:
//
//   claim    rec_claim_receipt_send marks the row 'sending' and hands over
//            the address and the envelope -- or answers already_sent /
//            in_progress / unknown / failed / not_configured / none, in
//            which case nothing is sent.
//   send     the same transport as every other recruitment e-mail; inert
//            without RESEND_* and then reported as not_configured.
//   settle   rec_settle_receipt_send records what the provider answered.
//
// Nothing here ever throws to the caller: an outage at the mail provider
// must not fail an application that is already saved, and must never tell
// a candidate to apply again. What it could not do is left on the row for
// the employer to see ("E-post väntar", "misslyckades", "okänt utfall").

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

/** Absolute links in the e-mail only: the row keeps the site-relative link
 *  it was rendered with, and the envelope knows the host. */
export function absolutiseLinks(text: string, siteOrigin: string): string {
  const origin = siteOrigin.replace(/\/$/, "");
  return text.replace(/(^|[\s(])(\/my-career\/applications[^\s)]*)/g, `$1${origin}$2`);
}

export async function deliverReceiptEmail(
  supabase: Loose,
  applicationId: string,
  retry: boolean,
): Promise<{ outcome: ReceiptEmailOutcome; code: string | null }> {
  const { data: rows, error } = await supabase.rpc("rec_claim_receipt_send", {
    _application_id: applicationId,
    _retry: retry,
  });
  if (error)
    return { outcome: "refused", code: String(error.message ?? "RECRUITMENT_ACTION_FAILED") };
  const claim = Array.isArray(rows) ? rows[0] : rows;
  if (!claim) return { outcome: "refused", code: "RECRUITMENT_ACTION_FAILED" };
  if (claim.outcome !== "claimed")
    return { outcome: claim.outcome as ReceiptEmailOutcome, code: null };

  const { sendRecruitmentMessageEmail } =
    await import("@/lib/email/send-recruitment-message-email.server");
  const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
  const siteOrigin = process.env.PUBLIC_SITE_URL || SITE_ORIGIN;
  const result = claim.recipient_email
    ? await sendRecruitmentMessageEmail({
        recipientEmail: String(claim.recipient_email),
        language: claim.language === "en" ? "en" : "sv",
        subject: String(claim.subject),
        body: absolutiseLinks(String(claim.body), siteOrigin),
        employerName: String(claim.employer_name ?? ""),
        jobTitle: String(claim.job_title ?? ""),
        siteOrigin,
      })
    : ({ result: "failed", error: "NO_ADDRESS" } as const);

  const { error: settleErr } = await supabase.rpc("rec_settle_receipt_send", {
    _application_id: applicationId,
    _result: result.result,
    _error: result.result === "failed" ? result.error : null,
  });
  if (settleErr) {
    // The provider answered and the answer could not be recorded: the row
    // stays 'sending' and becomes 'unknown' when next looked at. Said, not
    // hidden.
    console.error("[recruitment] receipt settle failed", settleErr);
    return { outcome: "unknown", code: "RECRUITMENT_ACTION_FAILED" };
  }
  return { outcome: result.result, code: null };
}

/** Called by the submission right after the application committed. Never
 *  throws; a failure is logged and left on the row. */
export async function dispatchApplicationReceipt(
  supabase: Loose,
  applicationId: string,
): Promise<void> {
  try {
    const r = await deliverReceiptEmail(supabase, applicationId, false);
    if (r.outcome === "refused") console.error("[recruitment] receipt e-mail refused", r.code);
  } catch (e) {
    console.error("[recruitment] receipt e-mail dispatch failed", e);
  }
}

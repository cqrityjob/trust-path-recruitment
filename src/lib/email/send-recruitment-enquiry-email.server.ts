// A recruitment enquiry from /contact, handed to CQrityjob's own inbox.
//
// ── TRANSPORT ──────────────────────────────────────────────────────────
//
// Rendered here, sent through the `transactional-email` Edge Function
// (lib/email/transport.server.ts), which alone holds the Resend key. The
// function fixes the recipient of a `contact_enquiry` to CQrityjob's inbox
// (info@) and the From address; the enquirer's address is used only as the
// Reply-To, so answering is one click and nothing the enquirer types can
// choose where the message goes. With the transport not configured nothing
// is sent and /contact says the form is not open rather than pretending.
//
// After the enquiry is accepted, a fixed acknowledgement goes to the
// enquirer (see the end of this file).
//
// Server-only (`.server.ts`). Nothing is persisted.

import type { EnquiryService, RecruitmentEnquiry } from "@/lib/contact/recruitment-enquiry";
import {
  emailTransportReady,
  missingEmailTransportSettings,
  sendTransactionalEmail,
} from "@/lib/email/transport.server";

export type EnquiryEmailOutcome =
  | { readonly status: "sent" }
  | { readonly status: "not_configured"; readonly missing: readonly string[] }
  | { readonly status: "failed"; readonly error: string };

/** Which settings are absent — NAMES only, never values. */
export function missingRecruitmentEnquirySettings(): string[] {
  return missingEmailTransportSettings();
}

/** Whether the form can send at all: the transport is configured AND the
 *  e-mail function is deployed with its key. Never throws. */
export async function recruitmentEnquiryOpen(): Promise<boolean> {
  return emailTransportReady();
}

const SERVICE_LABEL: Record<EnquiryService, string> = {
  recruitment: "Rekrytering",
  executive: "Executive Search",
  interim: "Interim och konsulter",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, for a subject: no line breaks, no runaway length. */
function oneLine(input: string, max: number): string {
  return input
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

export function renderRecruitmentEnquiryEmail(enquiry: RecruitmentEnquiry): {
  subject: string;
  html: string;
} {
  const service = SERVICE_LABEL[enquiry.service];
  const subject = `Förfrågan: ${service} — ${oneLine(enquiry.organisation, 120)}`;
  const rows: [string, string][] = [
    ["Tjänst", service],
    ["Namn", enquiry.name],
    ["Organisation", enquiry.organisation],
    ["E-post", enquiry.email],
    ["Språk", enquiry.language === "sv" ? "Svenska" : "Engelska"],
  ];
  const message = enquiry.message
    ? `<p style="margin:16px 0 4px;font-weight:600">Meddelande</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(enquiry.message)}</p>`
    : `<p style="margin:16px 0 0;color:#555">Inget meddelande.</p>`;
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p style="margin:0 0 12px">En ny förfrågan har skickats via kontaktformuläret på CQrityjob.</p>
<table style="border-collapse:collapse">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#555">${k}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>
${message}
<p style="margin:20px 0 0;color:#555;font-size:13px">Svara på det här mejlet för att svara avsändaren. Uppgifterna sparas inte i plattformen.</p>
</body></html>`;
  return { subject, html };
}

/** Never throws: the outcome is a value the caller turns into words. */
export async function sendRecruitmentEnquiryEmail(
  enquiry: RecruitmentEnquiry,
): Promise<EnquiryEmailOutcome> {
  const missing = missingRecruitmentEnquirySettings();
  if (missing.length > 0) return { status: "not_configured", missing };

  const { subject, html } = renderRecruitmentEnquiryEmail(enquiry);
  try {
    const res = await sendTransactionalEmail({
      kind: "contact_enquiry",
      replyTo: enquiry.email,
      subject,
      html,
    });
    if (res.notConfigured) return { status: "not_configured", missing: [] };
    if (!res.ok) {
      console.error("[send-recruitment-enquiry-email] provider rejected", res.status);
      return { status: "failed", error: `HTTP ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN_ERROR";
    console.error("[send-recruitment-enquiry-email] network failure", error);
    return { status: "failed", error };
  }
}

// ── ACKNOWLEDGEMENT TO THE ENQUIRER ────────────────────────────────────
//
// A short, fixed receipt so the enquirer knows it arrived. Sent only after
// the enquiry itself reached CQrityjob's inbox, and only to the validated
// address the enquirer typed (whose daily count is capped by the durable
// throttle). Replies go to CQrityjob's own inbox (info@, set by the function),
// never to the no-reply sender. It is a transactional receipt: no marketing,
// no subscription, and nothing the enquirer typed is echoed except a first
// name that passes a strict letters-only check — so the form cannot be used
// to relay arbitrary text or links to a stranger.

const ACK_SUBJECT: Record<RecruitmentEnquiry["language"], string> = {
  sv: "Vi har tagit emot din förfrågan – CQrityjob",
  en: "We have received your enquiry – CQrityjob",
};

/** The first name, or null when it is not plainly a name. */
export function acknowledgementFirstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,39}$/u.test(first) ? first : null;
}

export function renderEnquiryAcknowledgementEmail(enquiry: RecruitmentEnquiry): {
  subject: string;
  text: string;
  html: string;
} {
  const first = acknowledgementFirstName(enquiry.name);
  const lines =
    enquiry.language === "sv"
      ? [
          first ? `Hej ${first},` : "Hej,",
          "Tack för att du kontaktar CQrityjob.",
          "Vi har tagit emot din förfrågan och återkommer så snart vi kan.",
          "Med vänlig hälsning\nCQrityjob\nWhere trust comes first.",
        ]
      : [
          first ? `Hi ${first},` : "Hi,",
          "Thank you for contacting CQrityjob.",
          "We have received your enquiry and will get back to you as soon as we can.",
          "Best regards,\nCQrityjob\nWhere trust comes first.",
        ];
  const text = lines.join("\n\n");
  const html = `<!doctype html><html lang="${enquiry.language}"><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111">
${lines
  .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line).replace(/\n/g, "<br>")}</p>`)
  .join("\n")}
</body></html>`;
  return { subject: ACK_SUBJECT[enquiry.language], text, html };
}

/** Never throws; logs the HTTP status only (a provider body can echo the address). */
export async function sendEnquiryAcknowledgementEmail(
  enquiry: RecruitmentEnquiry,
): Promise<EnquiryEmailOutcome> {
  const missing = missingRecruitmentEnquirySettings();
  if (missing.length > 0) return { status: "not_configured", missing };

  const { subject, text, html } = renderEnquiryAcknowledgementEmail(enquiry);
  try {
    const res = await sendTransactionalEmail({
      kind: "contact_acknowledgement",
      to: enquiry.email,
      subject,
      text,
      html,
    });
    if (res.notConfigured) return { status: "not_configured", missing: [] };
    if (!res.ok) {
      console.error("[send-recruitment-enquiry-email] acknowledgement rejected", res.status);
      return { status: "failed", error: `HTTP ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN_ERROR";
    console.error("[send-recruitment-enquiry-email] acknowledgement network failure", error);
    return { status: "failed", error };
  }
}

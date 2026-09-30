// A recruitment enquiry from /contact, handed to CQrityjob's own inbox.
//
// ── SAME TRANSPORT, SAME SECRETS, SAME HONESTY ─────────────────────────
//
// One fetch() at Resend's HTTP API, exactly as the other senders in this
// directory: no new dependency, no new vendor and no new secret name. It
// reads RESEND_API_KEY and RESEND_FROM_EMAIL for the transport and
// ADMIN_NOTIFICATION_EMAIL for the recipient — the address employer
// registrations already notify. With any of them absent it returns
// `not_configured` WITHOUT a network call, and /contact says the form is not
// open rather than pretending to send.
//
// The recipient is configuration and never comes from the request. The
// enquirer's address is used only as `reply_to`, so answering is one click
// and nothing the enquirer types can choose where the message goes.
//
// Server-only (`.server.ts`). Nothing is persisted.

import type { EnquiryService, RecruitmentEnquiry } from "@/lib/contact/recruitment-enquiry";

export type EnquiryEmailOutcome =
  | { readonly status: "sent" }
  | { readonly status: "not_configured"; readonly missing: readonly string[] }
  | { readonly status: "failed"; readonly error: string };

export const ENQUIRY_ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "ADMIN_NOTIFICATION_EMAIL",
] as const;

/** Which settings are absent — NAMES only, never values. */
export function missingRecruitmentEnquirySettings(): string[] {
  return ENQUIRY_ENV_KEYS.filter((key) => !process.env[key]);
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [process.env.ADMIN_NOTIFICATION_EMAIL],
        reply_to: enquiry.email,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      // The status only: a provider body can echo the addresses.
      console.error("[send-recruitment-enquiry-email] provider rejected", res.status);
      return { status: "failed", error: `HTTP ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    console.error("[send-recruitment-enquiry-email] network failure", err);
    return {
      status: "failed",
      error: err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN_ERROR",
    };
  }
}

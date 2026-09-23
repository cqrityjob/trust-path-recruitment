// The e-mail copy of a message an employer wrote to a candidate.
//
// Same transport as every other sender in this directory: one fetch() at
// Resend's HTTP API, no dependency, and inert without RESEND_API_KEY and
// RESEND_FROM_EMAIL -- which returns `not_configured` and makes no call, so
// an environment without mail never claims to have sent any.
//
// The message itself is the employer's own text, reviewed and sent by a
// person. This file adds only the envelope: who it is from, which vacancy it
// is about, and a link to read it (and answer an interview invitation) inside
// CQrityjob, where the message already is by the time this runs.
//
// `sent` means the provider ACCEPTED it. It never means it arrived.

export type RecruitmentMessageEmailParams = {
  recipientEmail: string;
  language: "sv" | "en";
  subject: string;
  body: string;
  employerName: string;
  jobTitle: string;
  siteOrigin: string;
};

export type RecruitmentEmailResult =
  | { result: "sent" }
  | { result: "not_configured" }
  | { result: "failed"; error: string };

const FRAME = {
  sv: {
    about: (employer: string, job: string) => `Meddelande från ${employer} om din ansökan: ${job}`,
    cta: "Läs och svara i CQrityjob",
    footer:
      "Du får det här meddelandet eftersom du har sökt en tjänst via CQrityjob. Meddelandet finns också under Mina ansökningar.",
  },
  en: {
    about: (employer: string, job: string) =>
      `A message from ${employer} about your application: ${job}`,
    cta: "Read and reply in CQrityjob",
    footer:
      "You are receiving this because you applied for a position through CQrityjob. The message is also under My applications.",
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Exported for the guard: exactly what a candidate receives, sending nothing. */
export function renderRecruitmentMessageEmail(params: RecruitmentMessageEmailParams): {
  subject: string;
  html: string;
} {
  const frame = FRAME[params.language];
  const paragraphs = params.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin: 0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const link = `${params.siteOrigin.replace(/\/$/, "")}/my-career/applications`;
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 13px; color: #555;">${escapeHtml(frame.about(params.employerName, params.jobTitle))}</p>
      ${paragraphs}
      <p style="margin-top: 20px;"><a href="${escapeHtml(link)}" style="color: #0b3d91;">${escapeHtml(frame.cta)}</a></p>
      <p style="font-size: 12px; color: #888; margin-top: 20px;">${escapeHtml(frame.footer)}</p>
    </div>
  `;
  return { subject: params.subject, html };
}

export async function sendRecruitmentMessageEmail(
  params: RecruitmentMessageEmailParams,
): Promise<RecruitmentEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return { result: "not_configured" };

  const { subject, html } = renderRecruitmentMessageEmail(params);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [params.recipientEmail], subject, html }),
    });
    if (!res.ok) {
      // The status only: a provider body can carry the recipient address, and
      // the error is stored on a row the employer reads.
      console.error("[send-recruitment-message-email] provider rejected", res.status);
      return { result: "failed", error: `HTTP_${res.status}` };
    }
    return { result: "sent" };
  } catch (err) {
    console.error("[send-recruitment-message-email] network failure", err);
    return { result: "failed", error: "NETWORK_ERROR" };
  }
}

// Assessment and academy invitation e-mail.
//
// Rendered here and sent through the `transactional-email` Edge Function
// (lib/email/transport.server.ts), which alone holds the Resend key and
// decides the From address and Reply-To. Inert unless the transport is
// configured: without it every call returns { ok: false, skipped: true }
// and nothing is sent -- the copy-link behaviour the employer always has.
//
// Server-only (.server.ts suffix, matching client.server.ts's own
// convention) -- never imported from a client component. No key is read
// here, nothing is logged but the HTTP status, and nothing from the
// provider is returned to the caller.

import {
  missingEmailTransportSettings,
  sendTransactionalEmail,
} from "@/lib/email/transport.server";

type SendResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

export type InvitationEmailParams = {
  recipientEmail: string;
  language: "sv" | "en";
  employerName: string;
  assessmentNameSv: string;
  assessmentNameEn: string;
  invitationUrl: string;
  expiresAt: string;
  employerMessage: string | null;
  siteOrigin: string;
  /** Candidate assessment (default) or an employer's academy training. */
  kind?: "assessment_invitation" | "academy_invitation";
};

const SUBJECT: Record<"sv" | "en", (assessmentName: string) => string> = {
  sv: (name) => `Du är inbjuden att genomföra: ${name}`,
  en: (name) => `You are invited to complete: ${name}`,
};

function renderBody(params: InvitationEmailParams): string {
  const assessmentName =
    params.language === "sv" ? params.assessmentNameSv : params.assessmentNameEn;
  const expiresLabel = new Date(params.expiresAt).toLocaleDateString(
    params.language === "sv" ? "sv-SE" : "en-GB",
    { year: "numeric", month: "long", day: "numeric" },
  );

  const employerName = escapeHtml(params.employerName);

  const lines =
    params.language === "sv"
      ? {
          greeting: "Hej,",
          body: `<strong>${employerName}</strong> har bjudit in dig att genomföra ett kompetenstest: <strong>${assessmentName}</strong>.`,
          messageLabel: "Meddelande från arbetsgivaren:",
          cta: "Öppna testet",
          expires: `Länken slutar gälla ${expiresLabel}.`,
          disclaimer:
            "Testet är ett beslutsstöd. Det avgör aldrig ensamt någon anställning — arbetsgivaren ansvarar alltid för det slutliga beslutet.",
          support: "Frågor om den här inbjudan? Kontakta",
          supportLinkText: "CQrityjob support",
          footer:
            "Länken är personlig och ska inte delas vidare. Om du inte förväntade dig detta e-postmeddelande kan du bortse från det.",
        }
      : {
          greeting: "Hi,",
          body: `<strong>${employerName}</strong> has invited you to complete an assessment: <strong>${assessmentName}</strong>.`,
          messageLabel: "Message from the employer:",
          cta: "Open the assessment",
          expires: `This link expires on ${expiresLabel}.`,
          disclaimer:
            "This assessment is decision support only. It never determines any employment outcome by itself — the employer always remains responsible for the final decision.",
          support: "Questions about this invitation? Contact",
          supportLinkText: "CQrityjob support",
          footer:
            "This link is personal and should not be shared. If you were not expecting this email, you can safely ignore it.",
        };

  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #111827;">CQrityjob</p>
      <p>${lines.greeting}</p>
      <p>${lines.body}</p>
      ${
        params.employerMessage
          ? `<p style="margin-top: 16px;"><strong>${lines.messageLabel}</strong><br />${escapeHtml(params.employerMessage)}</p>`
          : ""
      }
      <p style="margin: 24px 0;">
        <a href="${params.invitationUrl}" style="background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
          ${lines.cta}
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">${lines.expires}</p>
      <p style="font-size: 12px; color: #555; margin-top: 20px;">${lines.disclaimer}</p>
      <p style="font-size: 12px; color: #888; margin-top: 20px;">
        ${lines.support} <a href="${params.siteOrigin}/contact" style="color: #555;">${lines.supportLinkText}</a>.
      </p>
      <p style="font-size: 12px; color: #888; margin-top: 12px;">${lines.footer}</p>
    </div>
  `;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendInvitationEmail(params: InvitationEmailParams): Promise<SendResult> {
  // Not configured -- inert by design, and decided before any rendering or
  // network call, exactly the copy-link behaviour.
  if (missingEmailTransportSettings().length > 0) return { ok: false, skipped: true };

  try {
    const res = await sendTransactionalEmail({
      kind: params.kind ?? "assessment_invitation",
      to: params.recipientEmail,
      subject: SUBJECT[params.language](
        params.language === "sv" ? params.assessmentNameSv : params.assessmentNameEn,
      ),
      html: renderBody(params),
    });
    if (res.notConfigured) {
      // Not configured -- inert by design, exactly the copy-link behaviour.
      return { ok: false, skipped: true };
    }

    if (!res.ok) {
      // The status only: a provider body can echo the recipient address,
      // which must not land in the logs. Same rule as the other senders.
      console.error("[send-invitation-email] provider rejected the request", res.status);
      return { ok: false, skipped: false, error: `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN_ERROR";
    console.error("[send-invitation-email] network/call failure", error);
    return { ok: false, skipped: false, error };
  }
}

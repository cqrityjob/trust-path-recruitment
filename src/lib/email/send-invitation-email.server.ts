// MVP stabilization — assessment invitation email delivery.
//
// Root cause of "employer invited a candidate, candidate never received an
// email" (confirmed by tracing createAssessmentAssignment end to end):
// no email provider was ever integrated in this codebase -- no package,
// no env var, no supabase/functions edge function, nothing. The
// invitation link itself has always worked correctly (copy-link, shown
// to the employer); only the "send it by email automatically" step was
// never built.
//
// This file adds that step using Resend's plain HTTP API (no new npm
// dependency -- a single fetch() call, matching this codebase's existing
// preference for minimal surface area). It is entirely inert unless
// RESEND_API_KEY is present in the server environment: with no key, every
// call below returns { ok: false, skipped: true } immediately, without a
// network call, exactly preserving today's copy-link-only behaviour.
//
// Server-only (.server.ts suffix, matching client.server.ts's own
// convention) -- never imported from a client component. The API key is
// read once from process.env inside the function body (never module-
// scope-captured into a client bundle, never logged, never returned to
// the caller on success or failure).
//
// Two required remaining external configuration steps for Mostafa,
// documented in the stabilization report:
//   1. Create a Resend account (or point RESEND_API_KEY at whatever
//      provider CQrityjob decides to use -- see the report for why
//      Resend specifically was chosen as the default, lowest-friction
//      option, not a locked-in decision).
//   2. Verify a sending domain with that provider and set
//      RESEND_FROM_EMAIL to an address on it (e.g.
//      invitations@cqrityjob.com) in Lovable Cloud's environment
//      variables. Until both are set, this code is a safe no-op.

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
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    // Not configured -- inert by design, exactly today's behaviour.
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.recipientEmail],
        subject: SUBJECT[params.language](
          params.language === "sv" ? params.assessmentNameSv : params.assessmentNameEn,
        ),
        html: renderBody(params),
      }),
    });

    if (!res.ok) {
      // Provider's own error body may contain request-identifying detail
      // but never the API key -- safe to log and to persist.
      const body = await res.text().catch(() => "");
      console.error("[send-invitation-email] provider rejected the request", res.status, body);
      return { ok: false, skipped: false, error: `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error("[send-invitation-email] network/call failure", err);
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : "UNKNOWN_ERROR",
    };
  }
}

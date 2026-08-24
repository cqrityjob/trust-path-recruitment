// Telling a candidate what happened, and nothing more than that.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────
//
// A customer asked the obvious thing: when an employer calls a candidate to
// interview, or decides not to go further, the candidate should hear about it
// rather than refreshing a page for a fortnight.
//
// Same transport as send-invitation-email.server.ts -- one fetch() at Resend's
// HTTP API, no new dependency, no new vendor -- and the same inert-by-default
// behaviour: with no RESEND_API_KEY this returns { skipped: true } without a
// network call, which is exactly today's behaviour.
//
// ── WHICH TRANSITIONS ───────────────────────────────────────────────────
//
// Three, and deliberately not four. 'reviewing' is an internal state: it means
// somebody at the employer has opened the application. Emailing "your
// application is being reviewed" tells the candidate nothing they can act on,
// arrives at whatever hour a recruiter happened to click, and trains people to
// ignore mail from us. So it sends nothing.
//
// ── WHAT THE MESSAGES MAY NOT SAY ───────────────────────────────────────
//
// No score. No assessment content. No rubric level. No reason for the
// employer's decision, and specifically no reason derived from an assessment:
// a rejection that explains itself using test results is the product making
// an employment argument on the employer's behalf, which it must never do.
//
// So the rejection says the employer chose to proceed with others, and stops.
// That is the truth, it is neutral, and it is the same sentence for everyone --
// which is also what keeps it from becoming a comparison.
//
// The employer's name is included because a candidate applies to several
// organisations and a message from "CQrityjob" alone is unplaceable.

type SendResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

/** The candidate-facing transitions. `reviewing` is absent on purpose. */
export type NotifiableStatus = "interview" | "rejected" | "hired";

export type ApplicationStatusEmailParams = {
  recipientEmail: string;
  language: "sv" | "en";
  status: NotifiableStatus;
  employerName: string;
  /** The advertisement they applied to, so the message is placeable. */
  jobTitle: string;
  siteOrigin: string;
};

type Copy = { subject: string; body: string; cta: string | null };

/** Written out in full, both languages, rather than composed from fragments.
 *
 *  Every sentence a candidate receives about a recruitment decision is worth
 *  being able to read in one place, in the language it will arrive in. A
 *  template engine here would mean nobody ever reads the rejection. */
const COPY: Record<"sv" | "en", Record<NotifiableStatus, (p: ApplicationStatusEmailParams) => Copy>> =
  {
    sv: {
      interview: (p) => ({
        subject: `${p.employerName} vill träffa dig — ${p.jobTitle}`,
        body:
          `${p.employerName} har gått vidare med din ansökan till ${p.jobTitle} och vill boka en intervju. ` +
          `De kontaktar dig direkt för att komma överens om en tid.`,
        cta: "Se din ansökan",
      }),
      rejected: (p) => ({
        subject: `Din ansökan till ${p.jobTitle}`,
        // No reason, and no reason derived from an assessment. This is the
        // same sentence for everybody, which is what keeps it from becoming a
        // comparison between people.
        body:
          `Tack för din ansökan till ${p.jobTitle} hos ${p.employerName}. ` +
          `Arbetsgivaren har valt att gå vidare med andra kandidater i den här rekryteringen. ` +
          `Dina uppgifter och ditt Security Passport tillhör dig och finns kvar på CQrityjob.`,
        cta: "Se fler jobb",
      }),
      hired: (p) => ({
        subject: `Grattis — ${p.jobTitle} hos ${p.employerName}`,
        body:
          `${p.employerName} har registrerat dig som anställd för ${p.jobTitle}. ` +
          `Din kommande arbetsgivare kontaktar dig om nästa steg.`,
        cta: "Se din ansökan",
      }),
    },
    en: {
      interview: (p) => ({
        subject: `${p.employerName} would like to meet you — ${p.jobTitle}`,
        body:
          `${p.employerName} has taken your application for ${p.jobTitle} forward and would like to arrange an interview. ` +
          `They will contact you directly to agree a time.`,
        cta: "View your application",
      }),
      rejected: (p) => ({
        subject: `Your application for ${p.jobTitle}`,
        body:
          `Thank you for your application for ${p.jobTitle} at ${p.employerName}. ` +
          `The employer has chosen to proceed with other candidates in this recruitment. ` +
          `Your details and your Security Passport belong to you and remain on CQrityjob.`,
        cta: "See more jobs",
      }),
      hired: (p) => ({
        subject: `Congratulations — ${p.jobTitle} at ${p.employerName}`,
        body:
          `${p.employerName} has recorded you as hired for ${p.jobTitle}. ` +
          `Your new employer will be in touch about next steps.`,
        cta: "View your application",
      }),
    },
  };

const CTA_PATH: Record<NotifiableStatus, string> = {
  interview: "/my-career/applications",
  rejected: "/jobs",
  hired: "/my-career/applications",
};

const FOOTER: Record<"sv" | "en", string> = {
  sv: "Det här är ett automatiskt meddelande om din ansökan. Svara inte på detta mail — kontakta arbetsgivaren direkt.",
  en: "This is an automatic message about your application. Please do not reply — contact the employer directly.",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBody(params: ApplicationStatusEmailParams, copy: Copy): string {
  const url = `${params.siteOrigin}${CTA_PATH[params.status]}`;
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color: #111827;">
      <p>${escapeHtml(copy.body)}</p>
      ${
        copy.cta
          ? `<p style="margin: 24px 0;">
               <a href="${url}" style="background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
                 ${escapeHtml(copy.cta)}
               </a>
             </p>`
          : ""
      }
      <p style="font-size: 12px; color: #888; margin-top: 20px;">${escapeHtml(FOOTER[params.language])}</p>
    </div>
  `;
}

/** Exported for the contract test: the exact subject and body a candidate
 *  receives, without sending anything. */
export function renderApplicationStatusEmail(params: ApplicationStatusEmailParams): {
  subject: string;
  html: string;
} {
  const copy = COPY[params.language][params.status](params);
  return { subject: copy.subject, html: renderBody(params, copy) };
}

export async function sendApplicationStatusEmail(
  params: ApplicationStatusEmailParams,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    // Inert by design, exactly as the invitation sender is.
    return { ok: false, skipped: true };
  }

  const { subject, html } = renderApplicationStatusEmail(params);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [params.recipientEmail], subject, html }),
    });

    if (!res.ok) {
      // The status only. A provider body can carry the recipient address, and
      // this value is persisted onto a row the employer can read.
      console.error("[send-application-status-email] provider rejected", res.status);
      return { ok: false, skipped: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[send-application-status-email] network failure", err);
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN_ERROR",
    };
  }
}

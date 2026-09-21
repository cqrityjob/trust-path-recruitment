// What a company is told when it registers, and what an administrator is told
// that it did.
//
// ── THE GAP THIS CLOSES ────────────────────────────────────────────────
//
// A company registered, the organisation row was created `pending`, and then
// nothing happened in anybody's inbox. Not because a send failed: because no
// send existed. `grep -rn sendInvitationEmail\|sendApplicationStatusEmail`
// over this repository returns three call sites, all of them about
// assessments and applications, none of them about a registration.
//
// So the registrant had a screen and no record, and the administrator had a
// queue nobody told them to look at. This file is the missing half.
//
// ── THREE WORDS THAT MUST NOT BE CONFUSED ──────────────────────────────
//
// verified address   the person proved they can read that inbox. Supabase
//                    Auth does this, not us, and it says nothing about a
//                    company.
// received           we hold a company registration awaiting review. THIS is
//                    what the applicant message announces.
// approved           a platform administrator activated the organisation.
//                    Only `moderate_employer` does that, and this file never
//                    implies it has happened.
//
// The applicant message therefore says "we have received" and names the
// approval as a separate, future, human step. It carries no link into the
// employer workspace, because there is no workspace to enter yet.
//
// ── SAME TRANSPORT, SAME INERTNESS ─────────────────────────────────────
//
// One fetch() at Resend's HTTP API, exactly as send-invitation-email.server.ts
// and send-application-status-email.server.ts do: no new dependency, no new
// vendor, no new secret name. With no RESEND_API_KEY / RESEND_FROM_EMAIL the
// functions return `not_configured` WITHOUT a network call.
//
// What is new is that `not_configured` is a distinct answer rather than a
// quiet `skipped`. The caller renders it, so a deployment with no mail
// provider says "no confirmation email was sent" instead of "check your
// inbox" — which is the difference between a product and a lie. Nothing in
// this repository may report a message as sent that was never handed to a
// provider, and nothing may report a message as *received*: the strongest
// claim available here is that Resend accepted it.
//
// ── THE ADMINISTRATOR'S ADDRESS IS CONFIGURATION ───────────────────────
//
// ADMIN_NOTIFICATION_EMAIL, read from the server environment. Never a
// hard-coded address, and never derived from anything in the request — an
// attacker-chosen company name must not be able to steer where the
// notification goes. Absent, the admin channel reports `not_configured` and
// the administrator still sees the application in /admin/employers, which is
// the surface that does not depend on mail working at all.

/** Server-only. Never imported from a client component — `.server.ts`, same
 *  convention as client.server.ts and the two senders beside this file. */

/**
 * The outcome of one channel.
 *
 * `sent` means a provider ACCEPTED the message. It does not mean anybody
 * received it, and no caller may render it as though it did.
 */
export type EmailChannelOutcome =
  | { readonly status: "sent" }
  | { readonly status: "not_configured"; readonly missing: readonly string[] }
  | { readonly status: "failed"; readonly error: string }
  /** Deliberately not attempted, because this channel has already succeeded.
   *  Its own outcome rather than a `sent` or a `failed`, so a catch-up that
   *  correctly did nothing can never be read as either a second delivery or
   *  a problem. Only a caller that has READ the trail may produce it. */
  | { readonly status: "already_sent" };

export type EmployerRegistrationEmailParams = {
  readonly recipientEmail: string;
  readonly language: "sv" | "en";
  readonly companyName: string;
  /** The person who registered, as they named themselves. Null is fine — the
   *  message greets neutrally rather than inventing a name. */
  readonly contactName: string | null;
  readonly siteOrigin: string;
};

export type EmployerRegistrationAdminEmailParams = {
  readonly recipientEmail: string;
  readonly companyName: string;
  readonly companyCountry: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string;
  /** The row an administrator has to open. The link is built from this and
   *  resolves to an authenticated, admin-only route. */
  readonly employerId: string;
  readonly siteOrigin: string;
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------------
// The applicant's message
// -----------------------------------------------------------------------------

type ApplicantCopy = {
  subject: string;
  greeting: string;
  received: string;
  nextSteps: readonly string[];
  approval: string;
  footer: string;
};

/** Written out in full, in both languages, rather than composed from
 *  fragments — the same decision send-application-status-email.server.ts
 *  made, and for the same reason: a message a company reads once, about
 *  whether it is now a customer, is worth being readable in one place. */
const APPLICANT_COPY: Record<"sv" | "en", (p: EmployerRegistrationEmailParams) => ApplicantCopy> = {
  sv: (p) => ({
    subject: `Vi har tagit emot er företagsregistrering — ${p.companyName}`,
    greeting: p.contactName ? `Hej ${p.contactName},` : "Hej,",
    received: `Vi har tagit emot en registrering av <strong>${escapeHtml(p.companyName)}</strong> på CQrityjob. Ansökan är sparad och väntar nu på granskning.`,
    nextSteps: [
      "En administratör på CQrityjob granskar företagets uppgifter.",
      "När registreringen har godkänts aktiveras arbetsgivarytan och du kommer åt den med samma inloggning.",
      "Du kan när som helst logga in för att se var registreringen står.",
    ],
    // Said explicitly, because the one thing this message must not be
    // mistaken for is an approval.
    approval:
      "Registreringen är ännu inte godkänd. Det här mejlet bekräftar bara att vi har tagit emot den.",
    footer:
      "Du får det här mejlet eftersom någon registrerade företaget med den här adressen som kontakt. Var det inte du? Svara på mejlet så tar vi bort registreringen.",
  }),
  en: (p) => ({
    subject: `We have received your company registration — ${p.companyName}`,
    greeting: p.contactName ? `Hi ${p.contactName},` : "Hi,",
    received: `We have received a registration for <strong>${escapeHtml(p.companyName)}</strong> on CQrityjob. It is saved and is now waiting to be reviewed.`,
    nextSteps: [
      "A CQrityjob administrator reviews the company details.",
      "Once the registration is approved, the employer workspace is activated and you reach it with the same sign-in.",
      "You can sign in at any time to see where the registration stands.",
    ],
    approval:
      "The registration is not approved yet. This email only confirms that we have received it.",
    footer:
      "You are receiving this because someone registered the company with this address as the contact. Not you? Reply to this email and we will remove the registration.",
  }),
};

const APPLICANT_HEADINGS: Record<"sv" | "en", { nextSteps: string; status: string }> = {
  sv: { nextSteps: "Så här går det vidare", status: "Status" },
  en: { nextSteps: "What happens next", status: "Status" },
};

const APPLICANT_STATUS_LABEL: Record<"sv" | "en", string> = {
  sv: "Mottagen — väntar på granskning",
  en: "Received — awaiting review",
};

const APPLICANT_CTA: Record<"sv" | "en", string> = {
  sv: "Se din registrering",
  en: "View your registration",
};

/** Exported so the contract guard can read the exact subject and body a
 *  company receives without sending anything. */
export function renderEmployerRegistrationReceivedEmail(params: EmployerRegistrationEmailParams): {
  subject: string;
  html: string;
} {
  const c = APPLICANT_COPY[params.language](params);
  const h = APPLICANT_HEADINGS[params.language];
  // /employer resolves membership server-side and sends a pending
  // organisation to the review page. It grants nothing; it is where the
  // person can read their own status.
  const url = `${params.siteOrigin}/employer`;

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color: #111827;">
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #111827;">CQrityjob</p>
      <p>${escapeHtml(c.greeting)}</p>
      <p>${c.received}</p>

      <p style="margin-top: 20px; font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(h.status)}</p>
      <p style="margin: 4px 0 0; font-size: 14px; color: #111827;">${escapeHtml(APPLICANT_STATUS_LABEL[params.language])}</p>

      <p style="margin-top: 20px; font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(h.nextSteps)}</p>
      <ol style="margin: 6px 0 0; padding-left: 18px; font-size: 14px; color: #111827;">
        ${c.nextSteps.map((s) => `<li style="margin-bottom: 4px;">${escapeHtml(s)}</li>`).join("")}
      </ol>

      <p style="margin-top: 20px; font-size: 14px; color: #111827;">${escapeHtml(c.approval)}</p>

      <p style="margin: 24px 0;">
        <a href="${url}" style="background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
          ${escapeHtml(APPLICANT_CTA[params.language])}
        </a>
      </p>

      <p style="font-size: 12px; color: #888; margin-top: 20px;">${escapeHtml(c.footer)}</p>
    </div>
  `;

  return { subject: c.subject, html };
}

// -----------------------------------------------------------------------------
// The administrator's message
// -----------------------------------------------------------------------------

/**
 * Four facts and one link, which is exactly what a decision needs: which
 * company, who registered it, how to reach them, and where to open the
 * application.
 *
 * English only, deliberately. This goes to one configured internal address,
 * not to a user, so a language toggle here would be a setting nobody sets.
 *
 * The link is to /admin/employers/<id>, which lives under the authenticated
 * admin shell and behind `is_platform_admin` at the database. Possession of
 * the link grants nothing — that is the point of linking to the row rather
 * than pasting the company's details into a mailbox and calling it a queue.
 */
export function renderEmployerRegistrationAdminEmail(
  params: EmployerRegistrationAdminEmailParams,
): { subject: string; html: string } {
  const url = `${params.siteOrigin}/admin/employers/${params.employerId}`;
  const rows: readonly (readonly [string, string])[] = [
    ["Company", params.companyName],
    ["Country", params.companyCountry ?? "—"],
    ["Contact person", params.contactName ?? "—"],
    ["Contact email", params.contactEmail],
  ];

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; color: #111827;">
      <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #111827;">CQrityjob — admin</p>
      <p>A company has registered and is waiting for review.</p>
      <table style="margin-top: 16px; border-collapse: collapse; font-size: 14px;">
        ${rows
          .map(
            ([label, value]) => `<tr>
              <td style="padding: 4px 16px 4px 0; color: #6b7280; vertical-align: top;">${escapeHtml(label)}</td>
              <td style="padding: 4px 0; color: #111827;">${escapeHtml(value)}</td>
            </tr>`,
          )
          .join("")}
      </table>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background: #111827; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Open the registration
        </a>
      </p>
      <p style="font-size: 12px; color: #888;">The organisation is <strong>pending</strong> until an administrator approves it. Opening this link requires an administrator sign-in.</p>
    </div>
  `;

  return { subject: `New company registration: ${params.companyName}`, html };
}

// -----------------------------------------------------------------------------
// Transport
// -----------------------------------------------------------------------------

/** The two secrets the transport needs. Named once, so the guard script and
 *  the deployment documentation assert against the same literals. */
export const RESEND_ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;
/** Where an administrator notification goes. Configuration, never a literal. */
export const ADMIN_RECIPIENT_ENV_KEY = "ADMIN_NOTIFICATION_EMAIL";

function missingTransportEnv(): string[] {
  return RESEND_ENV_KEYS.filter((key) => !process.env[key]);
}

/**
 * Hand one message to Resend.
 *
 * Never throws: every caller in this flow has already saved the registration,
 * and an exception here would turn a delivery problem into a failed
 * registration. The outcome is returned as a value instead, so the caller can
 * record it and say it out loud.
 */
async function deliver(to: string, subject: string, html: string): Promise<EmailChannelOutcome> {
  const missing = missingTransportEnv();
  if (missing.length > 0) return { status: "not_configured", missing };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) {
      // The status only. A provider body can carry the recipient address, and
      // this value is persisted and shown to an administrator.
      console.error("[send-employer-registration-email] provider rejected", res.status);
      return { status: "failed", error: `HTTP ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    console.error("[send-employer-registration-email] network failure", err);
    return {
      status: "failed",
      error: err instanceof Error ? err.message.slice(0, 120) : "UNKNOWN_ERROR",
    };
  }
}

/** The confirmation the registering company receives. */
export async function sendEmployerRegistrationReceivedEmail(
  params: EmployerRegistrationEmailParams,
): Promise<EmailChannelOutcome> {
  const { subject, html } = renderEmployerRegistrationReceivedEmail(params);
  return deliver(params.recipientEmail, subject, html);
}

/**
 * The notification the configured administrator address receives.
 *
 * Takes the recipient from the environment rather than from the caller, so
 * there is exactly one place this address can come from and no request can
 * influence it.
 */
export async function sendEmployerRegistrationAdminEmail(
  params: Omit<EmployerRegistrationAdminEmailParams, "recipientEmail">,
): Promise<EmailChannelOutcome> {
  const recipient = process.env[ADMIN_RECIPIENT_ENV_KEY];
  const missing = [...missingTransportEnv(), ...(recipient ? [] : [ADMIN_RECIPIENT_ENV_KEY])];
  if (missing.length > 0) return { status: "not_configured", missing };

  const { subject, html } = renderEmployerRegistrationAdminEmail({
    ...params,
    recipientEmail: recipient as string,
  });
  return deliver(recipient as string, subject, html);
}

/** Which of this flow's settings are absent, for an administrator who needs
 *  to know whether mail notification is live at all. Returns NAMES, never
 *  values — nothing here may leak a key or an address into a response. */
export function missingEmployerRegistrationEmailSettings(): string[] {
  return [
    ...missingTransportEnv(),
    ...(process.env[ADMIN_RECIPIENT_ENV_KEY] ? [] : [ADMIN_RECIPIENT_ENV_KEY]),
  ];
}

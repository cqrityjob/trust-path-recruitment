// The e-mail an organisation's own people get when a candidate submits a NEW
// application to one of its vacancies: "a new application has arrived, here is
// where to read it". CQrityjob writing to the employer; nobody replies.
//
// Same transport as every other sender in this directory: the
// `transactional-email` Edge Function (lib/email/transport.server.ts), kind
// `employer_new_application`, which alone holds the Resend key, fixes the From
// (CQrityjob -- NO organisation name for this kind), sends no Reply-To, and
// passes the provider's status back unchanged. Without the transport, or with
// the function holding no key, this returns `not_configured` and nothing is
// claimed to have been sent.
//
// ── WHAT IS IN THE MAIL, AND WHAT NEVER IS ─────────────────────────────
//
// The vacancy's title, the organisation's name, the fact that an application
// arrived, why THIS person is written to (they are responsible for the
// recruitment, or an owner / administrator) and a link to the application in
// the employer workspace. Nothing about the candidate: not a name, an address,
// a CV, a message or an answer. This is enforced by the TYPE below -- the
// parameters have no candidate field to put anything in -- and by
// employer-application-notice:check, which renders with hostile values.
//
// Everything that reaches the HTML is escaped; the plain-text part and the
// subject are single-line, length-bounded strings (a title cannot add a line,
// a link or a header). The link is built from the site origin the caller
// resolved with serverSiteOrigin(process.env.PUBLIC_SITE_URL) -- never from a
// browser location or a platform-assigned host -- and is dropped back to the
// workspace's front door if the slug or the id is not the shape the database
// produces.
//
// ── WHAT THE ANSWER MEANS (as in send-recruitment-message-email.server.ts) ──
//
//   sent            the provider ACCEPTED it. Never that it arrived.
//   failed          the provider REFUSED it (a 4xx; 429 included): not sent.
//   unknown         no answer or a non-answer: a timeout, a network error, a
//                   5xx, a 408, or the provider's "this key is busy / was used
//                   with another payload" (409). Not sent and not unsent: the
//                   caller records it as an attempt without a confirmed
//                   outcome and retries it under the SAME idempotency key.
//   not_configured  no mail in this environment; nothing was tried.
//
// `status` is the provider's HTTP status, or 0 when there was no answer. The
// provider's response BODY is never read (it can echo the recipient address),
// and nothing but the status is logged: never an address, a title or a link.
// This function never throws.

import {
  missingEmailTransportSettings,
  sendTransactionalEmail,
} from "@/lib/email/transport.server";
import { classifyProviderResponse } from "@/lib/email/send-recruitment-message-email.server";

export type EmployerApplicationNoticeParams = {
  /** The address the DATABASE chose (rec_claim_employer_notices). Nothing else
   *  may be put here: it is never taken from a request or a candidate. */
  recipientEmail: string;
  language: "sv" | "en";
  /** Why this person is written to: "responsible", "owner" or "admin". */
  via: string;
  employerName: string;
  employerSlug: string;
  jobTitle: string;
  applicationId: string;
  /** serverSiteOrigin(process.env.PUBLIC_SITE_URL), resolved by the caller. */
  siteOrigin: string;
  /** The identity of the logical e-mail at the provider (≤ 256 chars):
   *  `employer-new-application:<outbox row id>`, the same on every attempt. */
  idempotencyKey: string;
  /** Bounded call time; the default is 10 seconds. */
  timeoutMs?: number;
  /** For the guard only: a fetch that never reaches a network. */
  fetchImpl?: typeof fetch;
};

export type EmployerNoticeEmailResult =
  | { result: "sent"; status: number }
  | { result: "failed"; status: number }
  | { result: "unknown"; status: number }
  | { result: "not_configured" };

const MAX_TITLE = 120;
const MAX_ORGANISATION = 80;

const COPY = {
  sv: {
    subject: (job: string) => `Ny ansökan: ${job}`,
    lead: (job: string, org: string) =>
      `En ny ansökan har kommit in till tjänsten ${job} hos ${org}.`,
    detail: "Uppgifter om den sökande finns i CQrityjob, inte i det här meddelandet.",
    cta: "Öppna ansökan i CQrityjob",
    why: {
      responsible: (org: string) =>
        `Du får det här meddelandet eftersom du är ansvarig för rekryteringen hos ${org} i CQrityjob.`,
      owner: (org: string) =>
        `Du får det här meddelandet eftersom du är ägare av ${org} i CQrityjob.`,
      admin: (org: string) =>
        `Du får det här meddelandet eftersom du är administratör för ${org} i CQrityjob.`,
    },
  },
  en: {
    subject: (job: string) => `New application: ${job}`,
    lead: (job: string, org: string) =>
      `A new application has arrived for the position ${job} at ${org}.`,
    detail: "The applicant's details are in CQrityjob, not in this message.",
    cta: "Open the application in CQrityjob",
    why: {
      responsible: (org: string) =>
        `You are receiving this because you are responsible for the recruitment at ${org} in CQrityjob.`,
      owner: (org: string) =>
        `You are receiving this because you are an owner of ${org} in CQrityjob.`,
      admin: (org: string) =>
        `You are receiving this because you are an administrator of ${org} in CQrityjob.`,
    },
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

// eslint-disable-next-line no-control-regex
const LINE_BREAKS_AND_CONTROLS = /[\u0000-\u001f\u007f\u2028\u2029]+/g;

/** One line, no control characters, bounded: what a title or a name may become
 *  before it reaches a subject or the plain-text part. */
function oneLine(value: string, max: number): string {
  const cleaned = value.replace(LINE_BREAKS_AND_CONTROLS, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

const SLUG_SHAPE = /^[A-Za-z0-9][A-Za-z0-9-]{0,100}$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The application in the employer workspace, on the site's own origin. Exported
 *  for the guard. A slug or id of an unexpected shape gives the workspace's front
 *  door instead of a link built from it. */
export function employerApplicationLink(
  siteOrigin: string,
  employerSlug: string,
  applicationId: string,
): string {
  const origin = siteOrigin.replace(/\/$/, "");
  if (!SLUG_SHAPE.test(employerSlug) || !UUID_SHAPE.test(applicationId)) {
    return `${origin}/employer`;
  }
  return `${origin}/employer/${encodeURIComponent(employerSlug)}/applications/${encodeURIComponent(applicationId)}`;
}

/** Exported for the guard: exactly what the employer receives, sending nothing. */
export function renderEmployerApplicationNotice(
  params: Pick<
    EmployerApplicationNoticeParams,
    | "language"
    | "via"
    | "employerName"
    | "employerSlug"
    | "jobTitle"
    | "applicationId"
    | "siteOrigin"
  >,
): { subject: string; html: string; text: string; link: string } {
  const copy = COPY[params.language === "en" ? "en" : "sv"];
  const job =
    oneLine(params.jobTitle, MAX_TITLE) || (params.language === "en" ? "a vacancy" : "en tjänst");
  const org = oneLine(params.employerName, MAX_ORGANISATION) || "CQrityjob";
  const link = employerApplicationLink(
    params.siteOrigin,
    params.employerSlug,
    params.applicationId,
  );
  const whyKey =
    params.via === "responsible" ? "responsible" : params.via === "owner" ? "owner" : "admin";
  const why = copy.why[whyKey](org);
  const lead = copy.lead(job, org);

  const subject = copy.subject(job);
  const text = [lead, "", `${copy.cta}: ${link}`, "", copy.detail, "", why, ""].join("\n");
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <p style="margin: 0 0 12px;">${escapeHtml(lead)}</p>
      <p style="margin: 0 0 12px;">${escapeHtml(copy.detail)}</p>
      <p style="margin-top: 20px;"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #0b3d91; color: #ffffff; text-decoration: none; font-weight: 600;">${escapeHtml(copy.cta)}</a></p>
      <p style="font-size: 12px; color: #888; margin-top: 20px;">${escapeHtml(why)}</p>
    </div>
  `;
  return { subject, html, text, link };
}

export async function sendEmployerApplicationNoticeEmail(
  params: EmployerApplicationNoticeParams,
): Promise<EmployerNoticeEmailResult> {
  if (missingEmailTransportSettings().length > 0) return { result: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 10_000);
  try {
    const { subject, html, text } = renderEmployerApplicationNotice(params);
    const res = await sendTransactionalEmail({
      kind: "employer_new_application",
      to: params.recipientEmail,
      subject,
      html,
      text,
      idempotencyKey: params.idempotencyKey,
      signal: controller.signal,
      fetchImpl: params.fetchImpl,
    });
    if (res.notConfigured) return { result: "not_configured" };
    const classified = classifyProviderResponse(res.status);
    if (classified.result === "sent") return { result: "sent", status: res.status };
    // The status and our own code only: a provider body can carry the address.
    console.error("[send-employer-application-notice-email] provider answered", res.status);
    return { result: classified.result, status: res.status };
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    console.error(
      "[send-employer-application-notice-email]",
      aborted ? "timed out; outcome unknown" : "could not run; outcome unknown",
    );
    return { result: "unknown", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

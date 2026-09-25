// The e-mail copy of a message to a candidate: one an employer wrote, or the
// automatic receipt a recruitment sends when an application has arrived.
//
// Same transport as every other sender in this directory: one fetch() at
// Resend's HTTP API, no dependency, and inert without RESEND_API_KEY and
// RESEND_FROM_EMAIL -- which returns `not_configured` and makes no call, so
// an environment without mail never claims to have sent any.
//
// This file adds only the envelope: who it is from, which vacancy it is
// about, and a button that opens the message inside CQrityjob, where the
// message already is by the time this runs. For a person's message the
// button opens Mina ansökningar; the receipt hands in the exact application
// (`link`) and its own button text (`cta`).
//
// ── WHAT THE ANSWER MEANS ──────────────────────────────────────────────
//
//   sent            the provider ACCEPTED it. Never that it arrived.
//   failed          the provider REFUSED it (a 4xx): definitely not sent.
//   unknown         we do not know: a timeout, a network error, a 5xx, or
//                   the provider's own "this key is busy / was used with
//                   another payload". Not sent and not unsent -- a fact the
//                   caller records as such and never guesses away.
//   not_configured  no mail in this environment; nothing was tried.
//
// ── ONE E-MAIL, HOWEVER OFTEN IT IS TRIED ──────────────────────────────
//
// `idempotencyKey` is the identity of the LOGICAL e-mail. Resend keeps it
// for 24 hours (docs "Idempotency keys", read 2026-09-25): a repeat under
// the same key with the same payload gets the first response back without
// a second send; the same key with a different payload is a 409
// `invalid_idempotent_request`; a repeat while the first is still being
// processed is a 409 `concurrent_idempotent_requests`. The call is bounded
// (`timeoutMs`, 15 s by default): an abort is UNKNOWN, because the request
// may have been accepted after we stopped listening.
//
// The provider's response BODY is never read: it can carry the recipient
// address, and what this file returns ends up on a row the employer reads
// (candidate-notification:check holds that rule). So the status is the
// whole answer -- both 409s are one "the provider already holds this key"
// and the provider's message id is not kept.

export type RecruitmentMessageEmailParams = {
  recipientEmail: string;
  language: "sv" | "en";
  subject: string;
  body: string;
  employerName: string;
  jobTitle: string;
  siteOrigin: string;
  /** Where the button goes: an absolute URL on siteOrigin. Anything else
   *  falls back to Mina ansökningar, so no message can point elsewhere. */
  link?: string;
  /** The button's text, for a message no person wrote. */
  cta?: string;
  /** The identity of the logical e-mail at the provider (≤ 256 chars). */
  idempotencyKey?: string;
  /** Bounded call time; the default is 15 seconds. */
  timeoutMs?: number;
  /** For the guard only: a fetch that never reaches a network. */
  fetchImpl?: typeof fetch;
};

export type RecruitmentEmailResult =
  /** providerId is always null today: the body that carries it is never read. */
  | { result: "sent"; providerId: string | null }
  | { result: "not_configured" }
  | { result: "failed"; error: string }
  | { result: "unknown"; error: string };

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

/** The button's destination: the caller's link only when it lives on the
 *  site's own origin; Mina ansökningar otherwise. Exported for the guard. */
export function resolveMessageLink(siteOrigin: string, link: string | undefined): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const fallback = `${origin}/my-career/applications`;
  if (!link) return fallback;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(fallback).origin) return fallback;
  if (!/^https?:$/.test(url.protocol)) return fallback;
  return url.toString();
}

/** What a provider's status means. Exported for the guard, which runs it
 *  against controlled responses and never a network. */
export function classifyProviderResponse(
  status: number,
): { result: "sent" } | { result: "failed"; error: string } | { result: "unknown"; error: string } {
  if (status >= 200 && status < 300) return { result: "sent" };
  if (status === 409) {
    // Both 409s mean an earlier request under this key exists at the
    // provider: one is still being processed, the other went through with
    // another payload. Neither is "not sent"; a repeat under the same key
    // inside the window is safe either way, and after five the recovery
    // leaves it to a person.
    return { result: "unknown", error: "IDEMPOTENCY_CONFLICT" };
  }
  if (status === 408 || status === 425 || status >= 500) {
    return { result: "unknown", error: `HTTP_${status}` };
  }
  // Every other 4xx is a definite refusal -- 429 included: rate-limited is
  // not accepted, and the recovery retries exactly that one, bounded.
  return { result: "failed", error: `HTTP_${status}` };
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
  const link = resolveMessageLink(params.siteOrigin, params.link);
  const cta = params.cta?.trim() || frame.cta;
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 13px; color: #555;">${escapeHtml(frame.about(params.employerName, params.jobTitle))}</p>
      ${paragraphs}
      <p style="margin-top: 20px;"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #0b3d91; color: #ffffff; text-decoration: none; font-weight: 600;">${escapeHtml(cta)}</a></p>
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 15_000);
  try {
    const res = await (params.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: fromEmail, to: [params.recipientEmail], subject, html }),
      signal: controller.signal,
    });
    const classified = classifyProviderResponse(res.status);
    if (classified.result !== "sent") {
      // The status and our own code only: a provider body can carry the
      // recipient address, and the error is stored on a row the employer reads.
      console.error(
        "[send-recruitment-message-email] provider answered",
        res.status,
        classified.error,
      );
      return classified;
    }
    return { result: "sent", providerId: null };
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    console.error(
      "[send-recruitment-message-email]",
      aborted ? "timed out; outcome unknown" : "network failure; outcome unknown",
    );
    return { result: "unknown", error: aborted ? "TIMEOUT" : "NETWORK_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

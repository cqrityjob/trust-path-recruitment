// How every product e-mail leaves the application: to the Supabase Edge
// Function `transactional-email`, which alone holds the Resend API key.
//
// ── WHY NOT RESEND DIRECTLY ────────────────────────────────────────────
//
// The senders in this directory render the message and decide when it is
// due; they used to post it to Resend with RESEND_API_KEY from the app
// host's environment. That host cannot hold new secrets without a paid
// plan, so the key is a Supabase secret instead and this module posts the
// rendered message to the function (supabase/functions/transactional-email).
//
// The caller authenticates with the service-role key the app server already
// has (the same one client.server.ts uses). It never reaches a browser: this
// is a `.server.ts` module, imported dynamically from server functions only.
//
// ── WHAT A CALLER GETS BACK ────────────────────────────────────────────
//
// The provider's HTTP status, unchanged, so each sender keeps its own
// classification (429, 409 idempotency, 5xx, timeouts via its own signal).
// `notConfigured` is true when no e-mail could possibly have been sent: no
// transport settings here, no RESEND_API_KEY in the function, or the
// function not deployed / not reachable with this key. Nothing was tried,
// which is the same honest "not configured" the senders always reported.
//
// Only the kinds the function knows are accepted; the From address, the
// admin inbox and every Reply-To are decided by the function, not here.

export type TransactionalEmailKind =
  | "contact_enquiry"
  | "contact_acknowledgement"
  | "employer_registration_received"
  | "employer_registration_admin"
  | "application_receipt"
  | "recruitment_message"
  | "assessment_invitation"
  | "academy_invitation"
  | "employer_new_application";

/** The two settings this transport needs, both already present on the app
 *  host for the service-role client. Named once for guards and admin UI. */
export const EMAIL_TRANSPORT_ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export const TRANSACTIONAL_EMAIL_FUNCTION = "transactional-email";

/** Which transport settings are absent — NAMES only, never values. */
export function missingEmailTransportSettings(): string[] {
  return EMAIL_TRANSPORT_ENV_KEYS.filter((key) => !process.env[key]);
}

export type TransactionalEmail = {
  kind: TransactionalEmailKind;
  /** The recipient, for every kind except the two that go to CQrityjob's
   *  own inbox (contact_enquiry, employer_registration_admin). */
  to?: string;
  /** Only for contact_enquiry: the enquirer's own, validated address. */
  replyTo?: string;
  /** An organisation's own message (receipt, recruitment message, invitation):
   *  the organisation's name, shown as the sender's display name in front of
   *  no-reply@cqrityjob.com. A name only; the function cleans it and decides
   *  the address and the Reply-To itself. */
  senderName?: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Test seam, as in send-recruitment-message-email.server.ts. */
  fetchImpl?: typeof fetch;
};

export type TransportAnswer = {
  readonly status: number;
  readonly ok: boolean;
  readonly notConfigured: boolean;
};

function functionUrl(): string {
  const base = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/${TRANSACTIONAL_EMAIL_FUNCTION}`;
}

function authHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { Authorization: `Bearer ${key}`, apikey: key };
}

const NOT_CONFIGURED: TransportAnswer = { status: 0, ok: false, notConfigured: true };

async function isNotConfiguredAnswer(res: Response): Promise<boolean> {
  // 404: the function is not deployed. 401: it does not accept this key.
  if (res.status === 404 || res.status === 401) return true;
  if (res.status !== 503) return false;
  try {
    const body = (await res.clone().json()) as { outcome?: unknown };
    return body?.outcome === "not_configured";
  } catch {
    return false;
  }
}

/**
 * Hand one rendered e-mail to the transactional-email function.
 *
 * Throws only what fetch throws (network failure, or the caller's own
 * abort), exactly as the direct Resend call did, so each sender's existing
 * try/catch and timeout handling stay as they were.
 */
export async function sendTransactionalEmail(email: TransactionalEmail): Promise<TransportAnswer> {
  if (missingEmailTransportSettings().length > 0) return NOT_CONFIGURED;
  const res = await (email.fetchImpl ?? fetch)(functionUrl(), {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      kind: email.kind,
      to: email.to,
      replyTo: email.replyTo,
      senderName: email.senderName,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
    signal: email.signal,
  });
  if (await isNotConfiguredAnswer(res)) {
    await res.body?.cancel().catch(() => {});
    return NOT_CONFIGURED;
  }
  await res.body?.cancel().catch(() => {});
  return { status: res.status, ok: res.ok, notConfigured: false };
}

/** Why product e-mail can or cannot be sent right now. Reasons only: no value
 *  of any setting, no key and no response body is ever part of this. */
export type TransportReadiness =
  | { readonly ready: true; readonly reason: "ready" }
  | {
      readonly ready: false;
      readonly reason: /** SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is absent on the app host. */
        | "settings_missing"
        /** The function answered 404: it is not deployed. */
        | "function_not_deployed"
        /** The function answered 401/403: it does not accept the key this server holds. */
        | "key_rejected"
        /** The function answered 503 not_configured: it holds no RESEND_API_KEY. */
        | "provider_key_missing"
        /** No answer: network failure or the five-second timeout. */
        | "unreachable"
        /** Any other answer. */
        | "unexpected";
      readonly status?: number;
    };

let readiness: { at: number; answer: TransportReadiness } | null = null;
const READINESS_TTL_MS = 60_000;

/**
 * Why product e-mail can or cannot be sent: the function is deployed, accepts
 * this server, and holds RESEND_API_KEY. Cached for a minute per server
 * instance; never throws.
 *
 * "Not ready" used to be one bit, and /contact and the admin page both read
 * it as "the Resend key is missing". A function that rejects the app's key
 * (HTTP 401) looks exactly the same from the page, so the owner was sent to
 * store a key that was already there. The reason is now kept, and the first
 * time a given reason is seen by this instance it is written to the server
 * log (reason and HTTP status only) so the hosting logs say which of the
 * three real causes it is.
 */
export async function emailTransportDiagnosis(
  fetchImpl?: typeof fetch,
): Promise<TransportReadiness> {
  if (missingEmailTransportSettings().length > 0) {
    return { ready: false, reason: "settings_missing" };
  }
  const now = Date.now();
  if (readiness && now - readiness.at < READINESS_TTL_MS) return readiness.answer;

  let answer: TransportReadiness;
  try {
    const res = await (fetchImpl ?? fetch)(functionUrl(), {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    const status = res.status;
    let outcome: unknown;
    if (status === 503) {
      try {
        outcome = ((await res.clone().json()) as { outcome?: unknown })?.outcome;
      } catch {
        outcome = undefined;
      }
    }
    await res.body?.cancel().catch(() => {});
    if (res.ok) answer = { ready: true, reason: "ready" };
    else if (status === 404) answer = { ready: false, reason: "function_not_deployed", status };
    else if (status === 401 || status === 403)
      answer = { ready: false, reason: "key_rejected", status };
    else if (status === 503 && outcome === "not_configured") {
      answer = { ready: false, reason: "provider_key_missing", status };
    } else answer = { ready: false, reason: "unexpected", status };
  } catch {
    answer = { ready: false, reason: "unreachable" };
  }

  if (!answer.ready && readiness?.answer.reason !== answer.reason) {
    console.error(
      `[email-transport] not ready: ${answer.reason}${answer.status ? ` (HTTP ${answer.status})` : ""}`,
    );
  }
  readiness = { at: now, answer };
  return answer;
}

/** Whether product e-mail can be sent at all. Never throws. */
export async function emailTransportReady(fetchImpl?: typeof fetch): Promise<boolean> {
  return (await emailTransportDiagnosis(fetchImpl)).ready;
}

/** Test seam: forget the cached answer. */
export function resetEmailTransportReadinessForTests(): void {
  readiness = null;
}

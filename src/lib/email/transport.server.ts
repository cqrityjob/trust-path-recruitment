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
  | "academy_invitation";

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

let readiness: { at: number; ready: boolean } | null = null;
const READINESS_TTL_MS = 60_000;

/**
 * Whether product e-mail can be sent at all: the function is deployed,
 * accepts this server, and holds RESEND_API_KEY. Cached for a minute per
 * server instance; never throws.
 */
export async function emailTransportReady(fetchImpl?: typeof fetch): Promise<boolean> {
  if (missingEmailTransportSettings().length > 0) return false;
  const now = Date.now();
  if (readiness && now - readiness.at < READINESS_TTL_MS) return readiness.ready;
  let ready = false;
  try {
    const res = await (fetchImpl ?? fetch)(functionUrl(), {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    ready = res.ok;
    await res.body?.cancel().catch(() => {});
  } catch {
    ready = false;
  }
  readiness = { at: now, ready };
  return ready;
}

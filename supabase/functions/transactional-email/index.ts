// CQrityjob product e-mail — the ONLY place that holds the Resend API key.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// The application's server functions render every e-mail (templates, SV/EN,
// escaping) and decide WHEN one is due (auth, rate limits, idempotency
// claims). They used to hand the result straight to Resend with
// RESEND_API_KEY from their own environment. That environment is the
// Lovable host, where secrets need a paid plan, so the key lives here, as a
// Supabase Edge Function secret, and the app hands each rendered message to
// this function instead. See src/lib/email/transport.server.ts.
//
// ── NOT A RELAY ────────────────────────────────────────────────────────
//
//   * Only the application server can call it: the caller must present a
//     service key of this project (Authorization: Bearer, or apikey), the key
//     the app server already holds and a browser never does, and the project
//     confirms it on every call. Anything else is a 401 with no detail.
//   * Only the named kinds below are accepted. Each kind fixes where the
//     message may go and where a reply lands. The admin inbox, the From
//     address and every Reply-To are decided HERE, never by the request.
//     An organisation's message may name the organisation, which is shown
//     as the sender's display name in front of the fixed address.
//   * One recipient per message, size-capped subject/body, no attachments,
//     no headers, no CC/BCC.
//
// ── SAME ANSWERS AS BEFORE ─────────────────────────────────────────────
//
// Resend's HTTP status is passed back unchanged (with no provider body), and
// the caller's Idempotency-Key is forwarded, so the senders' existing
// duplicate-send protection and 409/429/5xx classification keep working.
// A missing RESEND_API_KEY is 503 {"outcome":"not_configured"}: nothing was
// tried, exactly the old "not configured" state.
//
// ── LOGS ───────────────────────────────────────────────────────────────
//
// Kind and status only. Never an address, a subject, a body or a key.

const FROM_ADDRESS = "no-reply@cqrityjob.com"; // automated mail only
const FROM = `CQrityjob <${FROM_ADDRESS}>`;
const ADMIN_INBOX = "info@cqrityjob.com"; // general / employer / contact
const JOB_INBOX = "job@cqrityjob.com"; // job / candidate replies

type Party = "admin" | "caller" | "job" | "none";

/** Every e-mail the product sends, and nothing else. */
const KINDS: Record<string, { to: "admin" | "caller"; replyTo: Party }> = {
  // /contact: to CQrityjob's inbox; a reply goes back to the enquirer.
  contact_enquiry: { to: "admin", replyTo: "caller" },
  // /contact: the enquirer's receipt; a reply reaches CQrityjob.
  contact_acknowledgement: { to: "caller", replyTo: "admin" },
  // Employer registration: to the registering company, and to the admin.
  employer_registration_received: { to: "caller", replyTo: "admin" },
  employer_registration_admin: { to: "admin", replyTo: "none" },
  // Candidate communication: replies land in the job inbox.
  application_receipt: { to: "caller", replyTo: "job" },
  recruitment_message: { to: "caller", replyTo: "job" },
  assessment_invitation: { to: "caller", replyTo: "job" },
  // Academy training invitations go to an employer's staff.
  academy_invitation: { to: "caller", replyTo: "admin" },
  employer_new_application: { to: "caller", replyTo: "none" }, // CQrityjob to an organisation's own people; no Reply-To, no organisation name
};

/** Messages an organisation sends through CQrityjob: the reader sees the
 *  organisation's name as the sender ("Acme AB via CQrityjob"). The ADDRESS
 *  stays no-reply@cqrityjob.com and the Reply-To stays the kind's own (above):
 *  the request supplies a name, never an address. */
const ORGANISATION_SENDER_KINDS = new Set([
  "application_receipt",
  "recruitment_message",
  "assessment_invitation",
  "academy_invitation",
]);
const MAX_SENDER_NAME = 60;

/** A display name that cannot become an address, a second header or a
 *  quoted-string escape: letters, digits, spaces and . & ' - only. */
function senderDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .&'\u2019-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SENDER_NAME)
    .trim();
  return /[\p{L}\p{N}]/u.test(name) ? name : null;
}

/** The From header: always FROM_ADDRESS; the organisation's name in front of
 *  it only for an organisation's own message. */
function fromFor(kind: string, senderName: unknown): string {
  const name = ORGANISATION_SENDER_KINDS.has(kind) ? senderDisplayName(senderName) : null;
  return name ? `${name} via CQrityjob <${FROM_ADDRESS}>` : FROM;
}

const MAX_BODY_BYTES = 300_000;
const MAX_SUBJECT = 300;
const MAX_HTML = 200_000;
const MAX_TEXT = 50_000;
const PROVIDER_TIMEOUT_MS = 15_000;
const EMAIL_SHAPE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function sameSecret(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only something shaped like this project's service key is worth asking
 *  about: a new-format secret key, or a JWT whose payload claims the
 *  service_role (and, where the token names one, this project). The anon
 *  and publishable keys, a user's session token, another project's key and
 *  garbage are refused here, without a network call. The signature, expiry
 *  and revocation are not judged here; the project's answer judges them. */
function couldBeServiceKey(key: string, base: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload || payload.role !== "service_role") return false;
    const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(base)?.[1];
    return !ref || payload.ref === undefined || payload.ref === ref;
  } catch {
    return false;
  }
}

/** Is this key a service key the project accepts RIGHT NOW? The project
 *  itself is asked on every call: only a service key may list Auth users,
 *  and Auth judges the signature, the expiry and whether the key has been
 *  revoked or rotated. A 200 is the only yes. Nothing is remembered between
 *  calls, so a key that expires or is revoked is refused from the next call
 *  on, also in a warm instance. Not even the function's own copy of the
 *  service key is trusted without asking: it may have been rotated since
 *  the instance started (2026-10-03 review). An HTTP error, a network error,
 *  a timeout or any internal error is a refusal. */
const VERIFY_TIMEOUT_MS = 5_000;

async function projectAcceptsServiceKey(key: string): Promise<boolean> {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  if (!base || key.length < 20 || !couldBeServiceKey(key, base)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    // The answer lists a user: it is never read.
    await res.body?.cancel().catch(() => {});
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The caller must present one key, in Authorization: Bearer, in apikey, or
 *  the same key in both, and the project must accept it as a service key.
 *  Two different keys, or an Authorization header that is not a Bearer
 *  token, are refused before anything else is considered. */
async function callerIsServer(req: Request): Promise<boolean> {
  try {
    const auth = req.headers.get("authorization");
    const apikey = (req.headers.get("apikey") ?? "").trim();
    if (auth !== null && !auth.startsWith("Bearer ")) return false;
    const bearer = auth === null ? "" : auth.slice(7).trim();
    if (bearer && apikey && !sameSecret(bearer, apikey)) return false;
    const presented = bearer || apikey;
    if (!presented) return false;
    return await projectAcceptsServiceKey(presented);
  } catch {
    return false;
  }
}

function address(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 && v.length <= 254 && EMAIL_SHAPE.test(v) ? v : null;
}

function party(p: Party, caller: string | null): string | null {
  if (p === "admin") return ADMIN_INBOX;
  if (p === "job") return JOB_INBOX;
  if (p === "caller") return caller;
  return null;
}

Deno.serve(async (req) => {
  if (!(await callerIsServer(req))) return json(401, { outcome: "unauthorized" });

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";

  // Readiness, for the contact page's "is the form open" question.
  if (req.method === "GET") {
    return apiKey ? json(200, { outcome: "ready" }) : json(503, { outcome: "not_configured" });
  }
  if (req.method !== "POST") return json(405, { outcome: "method_not_allowed" });
  if (!apiKey) return json(503, { outcome: "not_configured" });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { outcome: "invalid", reason: "size" });
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { outcome: "invalid", reason: "json" });
  }

  const kind = typeof input.kind === "string" ? input.kind : "";
  const policy = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
  if (!policy) return json(400, { outcome: "invalid", reason: "kind" });

  const subject =
    typeof input.subject === "string" ? input.subject.replace(/[\r\n\t]+/g, " ").trim() : "";
  const html = typeof input.html === "string" ? input.html : "";
  const text = typeof input.text === "string" ? input.text : undefined;
  if (!subject || subject.length > MAX_SUBJECT) {
    return json(400, { outcome: "invalid", reason: "subject" });
  }
  if (!html || html.length > MAX_HTML) return json(400, { outcome: "invalid", reason: "html" });
  if (text !== undefined && text.length > MAX_TEXT) {
    return json(400, { outcome: "invalid", reason: "text" });
  }

  // The only caller-chosen addresses: the recipient of a "caller" kind, and
  // the enquirer's own address as the Reply-To of a contact enquiry.
  const callerTo = policy.to === "caller" ? address(input.to) : null;
  if (policy.to === "caller" && !callerTo) return json(400, { outcome: "invalid", reason: "to" });
  const callerReplyTo = policy.replyTo === "caller" ? address(input.replyTo) : null;
  if (policy.replyTo === "caller" && !callerReplyTo) {
    return json(400, { outcome: "invalid", reason: "replyTo" });
  }

  const to = policy.to === "admin" ? ADMIN_INBOX : (callerTo as string);
  const replyTo = party(policy.replyTo, callerReplyTo);

  const idempotencyKey = (req.headers.get("idempotency-key") ?? "").trim();
  if (idempotencyKey.length > 256) {
    return json(400, { outcome: "invalid", reason: "idempotency_key" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: fromFor(kind, input.senderName),
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html,
        ...(text ? { text } : {}),
      }),
      signal: controller.signal,
    });
    // The provider body is never read: it can echo the recipient address.
    await res.body?.cancel().catch(() => {});
    console.log(`[transactional-email] ${kind} ${res.status}`);
    return json(res.status, { outcome: res.ok ? "sent" : "provider_status" });
  } catch {
    const timedOut = controller.signal.aborted;
    console.error(`[transactional-email] ${kind} ${timedOut ? "timeout" : "network"}`);
    return json(timedOut ? 504 : 502, { outcome: timedOut ? "timeout" : "network" });
  } finally {
    clearTimeout(timer);
  }
});

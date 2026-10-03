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
//   * Only the application server can call it: the caller must present the
//     project's service-role key (Authorization: Bearer, or apikey), the key
//     the app server already holds and a browser never does. Anything else is
//     a 401 with no detail.
//   * Only the named kinds below are accepted. Each kind fixes where the
//     message may go and where a reply lands. The admin inbox, the From
//     address and every Reply-To are decided HERE, never by the request.
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

const FROM = "CQrityjob <no-reply@cqrityjob.com>";
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

/** The service-role keys this project accepts: the legacy JWT and, where the
 *  platform provides them, the newer secret keys. */
function serviceKeys(): string[] {
  const keys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""];
  try {
    const extra = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (extra && typeof extra === "object") {
      for (const v of Object.values(extra)) if (typeof v === "string") keys.push(v);
    }
  } catch {
    // Not present or not JSON: the legacy key alone.
  }
  return keys.filter((k) => k.length >= 20);
}

function callerIsServer(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const apikey = (req.headers.get("apikey") ?? "").trim();
  return serviceKeys().some((k) => sameSecret(bearer, k) || sameSecret(apikey, k));
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
  if (!callerIsServer(req)) return json(401, { outcome: "unauthorized" });

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
        from: FROM,
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

/**
 * Guard: product e-mail goes out only through the `transactional-email` Edge
 * Function, which alone holds the Resend key and is not an open relay.
 *
 * The function's own code is EXECUTED here, under a minimal Deno stand-in
 * (env + serve), against a stub provider. No network, no key, no account.
 *
 *   1. Only a service key the project accepts at the time of the call may
 *      call it (asked on every call, no cache); everything else, and every
 *      failure of the check, is a bare 401.
 *   2. Only the named kinds are accepted; From, the admin inbox and every
 *      Reply-To are decided by the function, never by the request.
 *   3. The provider status is passed back unchanged, the Idempotency-Key is
 *      forwarded, the provider body is never read, and nothing but the kind
 *      and the status is logged.
 *   4. Without RESEND_API_KEY it answers not_configured and calls nothing.
 *   5. In the app: no module reads a Resend key or calls Resend directly, and
 *      the transport is server-only.
 *
 * Run: bun run transactional-email:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let failures = 0;
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`,
  );
  if (!ok) failures += 1;
}

const FN = "supabase/functions/transactional-email/index.ts";
// Test-only keys, assembled at run time so no key-shaped literal sits in the
// source (push protection would rightly refuse one).
const fakeKey = (kind: "secret" | "publishable", tail: string) => ["sb", kind, tail].join("_");
const PROJECT_URL = "https://guardproject.supabase.co";
const SERVICE_KEY = fakeKey("secret", "guard_service_key_0123456789abcdef");
const RESEND_KEY = "re_guard_only_not_a_key";

// ── A Deno stand-in: env from a map, serve() captures the handler ─────
const env = new Map<string, string>();
let handler: ((req: Request) => Promise<Response>) | null = null;
(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (k: string) => env.get(k) },
  serve: (h: (req: Request) => Promise<Response>) => {
    handler = h;
  },
};

const jwt = (claims: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature-part`;
const nowSec = () => Math.floor(Date.now() / 1000);

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const calls: Call[] = [];
let providerStatus = 200;
let providerReadBody = false;
const realFetch = globalThis.fetch;
// The project's own Auth admin endpoint, as the function's caller check asks
// it. Like Supabase Auth: 200 only for a key the project currently holds as a
// service key (revocable: delete it from the set) and, for a JWT, only before
// its `exp`; 403 otherwise. `authMode` plants the failures.
const projectServiceKeys = new Set<string>();
const authChecks: string[] = [];
let authMode: "normal" | "500" | "throw" | "hang" = "normal";
let authBodyRead = false;
function jwtExpired(key: string): boolean {
  const part = key.split(".")[1];
  if (!part) return false;
  try {
    const exp = JSON.parse(Buffer.from(part, "base64url").toString()).exp;
    return typeof exp === "number" && exp <= nowSec();
  } catch {
    return false;
  }
}
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  if (String(url).includes("/auth/v1/admin/users")) {
    const h = new Headers(init?.headers);
    const bearer = (h.get("authorization") ?? "").replace(/^Bearer /, "");
    authChecks.push(bearer);
    if (authMode === "throw") throw new TypeError("network down");
    if (authMode === "hang") {
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }
    const okKey =
      authMode === "normal" &&
      projectServiceKeys.has(bearer) &&
      h.get("apikey") === bearer &&
      !jwtExpired(bearer);
    const status = authMode === "500" ? 500 : okKey ? 200 : 403;
    const read = async () => {
      authBodyRead = true;
      return "{}";
    };
    return {
      status,
      ok: status === 200,
      body: { cancel: async () => {} },
      text: read,
      json: read,
    } as unknown as Response;
  }
  calls.push({
    url: String(url),
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: JSON.parse(String(init?.body ?? "{}")),
  });
  // A response whose every body reader trips the flag; cancelling does not.
  const read = async () => {
    providerReadBody = true;
    return "recipient person@example.test";
  };
  return {
    status: providerStatus,
    ok: providerStatus >= 200 && providerStatus < 300,
    body: { cancel: async () => {} },
    text: read,
    json: read,
    arrayBuffer: read,
    blob: read,
    formData: read,
  } as unknown as Response;
}) as typeof fetch;

const logs: string[] = [];
const realLog = console.log;
const realError = console.error;
const capture =
  (orig: typeof console.log) =>
  (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.startsWith("[transactional-email]")) logs.push(line);
    else orig(...args);
  };
console.log = capture(realLog);
console.error = capture(realError);

await import(path.resolve(FN));
if (!handler) {
  console.error("FAIL: the function did not register a handler");
  process.exit(1);
}
const serve = handler as (req: Request) => Promise<Response>;

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return serve(
    new Request("https://fn.example/functions/v1/transactional-email", {
      method: "POST",
      headers: { authorization: `Bearer ${SERVICE_KEY}`, ...headers },
      body: JSON.stringify(body),
    }),
  );
}
const outcome = async (res: Response) => ((await res.json()) as { outcome?: string }).outcome;

const message = { subject: "Ämne\r\nBcc: x@evil.example", html: "<p>Hej</p>" };

env.set("SUPABASE_URL", PROJECT_URL);
env.set("RESEND_API_KEY", RESEND_KEY);
projectServiceKeys.add(SERVICE_KEY);

console.log("\n1. Only a service key the project accepts right now may call it");
{
  const receipt = { kind: "application_receipt", to: "a@example.test", ...message };
  /** One call with these headers: its status, whether a message went out,
   *  and how many times the project was asked. */
  async function attempt(headers: Record<string, string>, method = "POST") {
    const sent = calls.length;
    const asked = authChecks.length;
    const res = await serve(
      new Request("https://fn.example/functions/v1/transactional-email", {
        method,
        headers,
        ...(method === "POST" ? { body: JSON.stringify(receipt) } : {}),
      }),
    );
    await res.body?.cancel();
    return { status: res.status, sent: calls.length - sent, asked: authChecks.length - asked };
  }
  const both = (key: string) => ({ authorization: `Bearer ${key}`, apikey: key });

  const none = await attempt({});
  ck(
    "no credentials: 401, nothing sent, the project not asked",
    none.status === 401 && none.sent === 0 && none.asked === 0,
  );

  // Both key formats, in either header or both.
  const legacy = jwt({
    iss: "supabase",
    ref: "guardproject",
    role: "service_role",
    exp: nowSec() + 3600,
  });
  projectServiceKeys.add(legacy);
  const asBearer = await attempt({ authorization: `Bearer ${SERVICE_KEY}` });
  const asApikey = await attempt({ apikey: SERVICE_KEY });
  const asBoth = await attempt(both(SERVICE_KEY));
  const legacyBoth = await attempt(both(legacy));
  ck(
    "a new-format secret key the project accepts: 200 as Bearer",
    asBearer.status === 200 && asBearer.sent === 1,
  );
  ck("the same key as apikey only: 200", asApikey.status === 200 && asApikey.sent === 1);
  ck("the same key in both headers: 200", asBoth.status === 200 && asBoth.sent === 1);
  ck(
    "a legacy service_role JWT the project accepts: 200",
    legacyBoth.status === 200 && legacyBoth.sent === 1,
  );
  ck(
    "every call asks the project; nothing is remembered between calls",
    [asBearer, asApikey, asBoth, legacyBoth].every((a) => a.asked === 1),
  );

  // The review's reproduction (2026-10-03): a short-lived, valid service
  // token is accepted; once it has expired the SAME warm instance refuses it.
  const shortLived = jwt({
    iss: "supabase",
    ref: "guardproject",
    role: "service_role",
    exp: nowSec() + 2,
  });
  projectServiceKeys.add(shortLived);
  const beforeExpiry = await attempt(both(shortLived));
  await new Promise((r) => setTimeout(r, 2_500));
  const afterExpiry = await attempt(both(shortLived));
  ck(
    "a short-lived service token: 200 while valid",
    beforeExpiry.status === 200 && beforeExpiry.sent === 1,
  );
  ck(
    "the same token after expiry: 401 in the same instance, nothing sent",
    afterExpiry.status === 401 && afterExpiry.sent === 0 && afterExpiry.asked === 1,
  );

  // Revocation and rotation: the project stops accepting a key it accepted.
  const revocable = fakeKey("secret", "guard_revocable_0123456789abcdef");
  projectServiceKeys.add(revocable);
  const beforeRevoke = await attempt(both(revocable));
  const legacyBefore = await attempt(both(legacy));
  projectServiceKeys.delete(revocable);
  projectServiceKeys.delete(legacy);
  const afterRevoke = await attempt(both(revocable));
  const legacyAfter = await attempt(both(legacy));
  ck(
    "a secret key, then revoked: 200 before",
    beforeRevoke.status === 200 && legacyBefore.status === 200,
  );
  ck(
    "the same keys after revocation: 401 in the same instance, nothing sent (both formats)",
    afterRevoke.status === 401 &&
      afterRevoke.sent === 0 &&
      legacyAfter.status === 401 &&
      legacyAfter.sent === 0,
  );

  // The function's own copy of the service key is not a way round the check:
  // rotated away, it is refused like any other key.
  const envCopy = fakeKey("secret", "guard_env_copy_0123456789abcdef");
  env.set("SUPABASE_SERVICE_ROLE_KEY", envCopy);
  env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: envCopy }));
  const rotated = await attempt(both(envCopy));
  ck(
    "the function's own env copy of a key the project no longer accepts: 401, and it was asked",
    rotated.status === 401 && rotated.sent === 0 && rotated.asked === 1,
  );
  projectServiceKeys.add(envCopy);
  const envAccepted = await attempt(both(envCopy));
  ck("and the same env key while the project accepts it: 200", envAccepted.status === 200);
  env.delete("SUPABASE_SECRET_KEYS");

  // Conflicting headers are refused before any way in, valid key or not.
  const anonKey = jwt({ iss: "supabase", ref: "guardproject", role: "anon" });
  const conflicts: [string, Record<string, string>][] = [
    [
      "a valid service Bearer with the anon apikey",
      { authorization: `Bearer ${SERVICE_KEY}`, apikey: anonKey },
    ],
    [
      "the anon Bearer with a valid service apikey",
      { authorization: `Bearer ${anonKey}`, apikey: SERVICE_KEY },
    ],
    [
      "two different valid service keys",
      { authorization: `Bearer ${SERVICE_KEY}`, apikey: envCopy },
    ],
    [
      "the env copy as Bearer with another apikey",
      { authorization: `Bearer ${envCopy}`, apikey: anonKey },
    ],
    [
      "a bare scheme Authorization with a valid apikey",
      { authorization: "Basic", apikey: SERVICE_KEY },
    ],
    [
      "a lower-case bearer with a valid key",
      { authorization: `bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    ],
    [
      "a non-Bearer Authorization with a valid apikey",
      { authorization: `Basic ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    ],
  ];
  for (const [name, headers] of conflicts) {
    const a = await attempt(headers);
    ck(
      `${name}: 401, nothing sent, the project not asked`,
      a.status === 401 && a.sent === 0 && a.asked === 0,
    );
  }

  // Keys that cannot be this project's service key: refused without asking.
  const notService: [string, string][] = [
    ["the anon key", anonKey],
    [
      "a user's session token",
      jwt({ sub: "u", role: "authenticated", aud: "authenticated", exp: nowSec() + 3600 }),
    ],
    ["the publishable key", fakeKey("publishable", "guard_0123456789abcdef")],
    [
      "another project's service key",
      jwt({ iss: "supabase", ref: "otherproject", role: "service_role" }),
    ],
    ["a malformed JWT", "eyJhbGciOiJIUzI1NiJ9.!!not-base64!!.signature-part"],
    ["garbage", "not-a-key-but-long-enough-0123456789"],
    ["a short value", fakeKey("secret", "x")],
  ];
  for (const [name, key] of notService) {
    const a = await attempt(both(key));
    ck(
      `${name}: 401, nothing sent, the project not asked`,
      a.status === 401 && a.sent === 0 && a.asked === 0,
    );
  }
  const forged = jwt({ iss: "supabase", ref: "guardproject", role: "service_role", n: 2 });
  const forgedTry = await attempt(both(forged));
  ck(
    "a service_role-shaped token the project does not confirm (forged signature): asked, 401",
    forgedTry.status === 401 && forgedTry.sent === 0 && forgedTry.asked === 1,
  );

  // Every failure of the check is a refusal, never an exception or a yes.
  for (const mode of ["500", "throw", "hang"] as const) {
    authMode = mode;
    const started = Date.now();
    const a = await attempt(both(SERVICE_KEY));
    const ready = await attempt(both(SERVICE_KEY), "GET");
    authMode = "normal";
    const label = { "500": "an HTTP 500 from Auth", throw: "a network error", hang: "a timeout" }[
      mode
    ];
    ck(
      `${label}: 401 for a send and for readiness, nothing sent${mode === "hang" ? " (gives up after ~5 s)" : ""}`,
      a.status === 401 &&
        a.sent === 0 &&
        ready.status === 401 &&
        (mode !== "hang" || Date.now() - started < 12_000),
    );
  }
  const afterFailures = await attempt(both(SERVICE_KEY));
  ck("and the key works again once Auth answers", afterFailures.status === 200);
  {
    // An internal error in the check itself: a controlled 401, not a crash.
    const broken = {
      method: "POST",
      headers: {
        get: () => {
          throw new Error("boom");
        },
      },
      text: async () => "{}",
    } as unknown as Request;
    let status = 0;
    try {
      status = (await serve(broken)).status;
    } catch {
      status = -1;
    }
    ck("an internal error while checking the caller: a controlled 401", status === 401);
  }
  ck("the Auth answer (which lists a user) is never read", !authBodyRead);
  ck(
    "no key ever reaches a log line",
    logs.every((l) => !/sb_secret|eyJ/.test(l)),
  );
}

console.log("\n2. Only the named kinds; the function decides From, the admin inbox and Reply-To");
{
  calls.length = 0;
  const bogus = await post({ kind: "newsletter", to: "a@example.test", ...message });
  const proto = await post({ kind: "__proto__", to: "a@example.test", ...message });
  ck("an unknown kind is refused, nothing sent", bogus.status === 400 && calls.length === 0);
  ck("a prototype key is not a kind", proto.status === 400 && calls.length === 0);

  await post({
    kind: "contact_enquiry",
    to: "attacker@evil.example",
    replyTo: "enquirer@example.test",
    from: "ceo@cqrityjob.com",
    ...message,
  });
  const enquiry = calls.at(-1)!;
  ck(
    "contact_enquiry goes to info@, whatever `to` the request names",
    JSON.stringify(enquiry.body.to) === JSON.stringify(["info@cqrityjob.com"]),
    JSON.stringify(enquiry.body.to),
  );
  ck("its Reply-To is the enquirer", enquiry.body.reply_to === "enquirer@example.test");
  ck(
    "From is fixed, whatever the request names",
    enquiry.body.from === "CQrityjob <no-reply@cqrityjob.com>",
  );
  ck(
    "the subject cannot carry a header line",
    typeof enquiry.body.subject === "string" && !/[\r\n]/.test(enquiry.body.subject as string),
  );

  const cases: [string, string | undefined][] = [
    ["contact_acknowledgement", "info@cqrityjob.com"],
    ["employer_registration_received", "info@cqrityjob.com"],
    ["application_receipt", "job@cqrityjob.com"],
    ["recruitment_message", "job@cqrityjob.com"],
    ["assessment_invitation", "job@cqrityjob.com"],
    ["academy_invitation", "info@cqrityjob.com"],
  ];
  for (const [kind, replyTo] of cases) {
    await post({ kind, to: "person@example.test", replyTo: "attacker@evil.example", ...message });
    const c = calls.at(-1)!;
    ck(
      `${kind}: to the named person, Reply-To ${replyTo}`,
      JSON.stringify(c.body.to) === JSON.stringify(["person@example.test"]) &&
        c.body.reply_to === replyTo,
      `${JSON.stringify(c.body.to)} / ${String(c.body.reply_to)}`,
    );
  }
  // An organisation's message shows the organisation as the sender's name;
  // the address and the Reply-To stay the function's own.
  for (const kind of [
    "application_receipt",
    "recruitment_message",
    "assessment_invitation",
    "academy_invitation",
  ]) {
    await post({
      kind,
      to: "person@example.test",
      senderName: "Nordic Säkerhet AB",
      replyTo: "attacker@evil.example",
      ...message,
    });
    const c = calls.at(-1)!;
    ck(
      `${kind}: From names the organisation in front of no-reply@cqrityjob.com`,
      c.body.from === "Nordic Säkerhet AB via CQrityjob <no-reply@cqrityjob.com>",
      String(c.body.from),
    );
  }
  await post({
    kind: "recruitment_message",
    to: "person@example.test",
    senderName: 'Evil" <ceo@evil.example>,\r\nBcc: x@evil.example',
    ...message,
  });
  const injected = String(calls.at(-1)!.body.from);
  ck(
    "a sender name cannot carry an address, a quote or a header line",
    !/[<>"@\r\n,:;]/.test(injected.replace(" <no-reply@cqrityjob.com>", "")) &&
      injected.endsWith(" via CQrityjob <no-reply@cqrityjob.com>"),
    injected,
  );
  await post({
    kind: "recruitment_message",
    to: "person@example.test",
    senderName: "<>@,",
    ...message,
  });
  ck(
    "a sender name with nothing readable left falls back to CQrityjob",
    calls.at(-1)!.body.from === "CQrityjob <no-reply@cqrityjob.com>",
  );
  await post({
    kind: "recruitment_message",
    to: "person@example.test",
    senderName: "A".repeat(200),
    ...message,
  });
  ck(
    "a sender name is capped at 60 characters",
    calls.at(-1)!.body.from === `${"A".repeat(60)} via CQrityjob <no-reply@cqrityjob.com>`,
  );
  for (const kind of ["contact_acknowledgement", "employer_registration_received"]) {
    await post({ kind, to: "person@example.test", senderName: "Somebody Else AB", ...message });
    ck(
      `${kind}: CQrityjob's own mail ignores a sender name`,
      calls.at(-1)!.body.from === "CQrityjob <no-reply@cqrityjob.com>",
    );
  }

  await post({ kind: "employer_registration_admin", to: "attacker@evil.example", ...message });
  const adminMail = calls.at(-1)!;
  ck(
    "employer_registration_admin goes to info@ and carries no Reply-To",
    JSON.stringify(adminMail.body.to) === JSON.stringify(["info@cqrityjob.com"]) &&
      !("reply_to" in adminMail.body),
  );

  const before = calls.length;
  const noTo = await post({ kind: "application_receipt", ...message });
  const twoTo = await post({ kind: "application_receipt", to: "a@x.test,b@y.test", ...message });
  const noReply = await post({ kind: "contact_enquiry", ...message });
  const huge = await post({
    kind: "application_receipt",
    to: "a@example.test",
    subject: "s",
    html: "x".repeat(250_000),
  });
  const noSubject = await post({ kind: "application_receipt", to: "a@example.test", html: "<p/>" });
  ck(
    "a missing or multiple recipient, a missing enquirer, an oversized body or no subject is refused, nothing sent",
    [noTo, twoTo, noReply, huge, noSubject].every((r) => r.status === 400 || r.status === 413) &&
      calls.length === before,
  );
  ck(
    "no request field other than kind/to/replyTo/subject/html/text reaches the provider",
    calls.every(
      (c) =>
        !("cc" in c.body) &&
        !("bcc" in c.body) &&
        !("attachments" in c.body) &&
        !("headers" in c.body),
    ),
  );
}

console.log("\n2b. The function's addresses are the site's published ones");
{
  const site = readFileSync("src/lib/site-contact.ts", "utf8");
  const fn = readFileSync(FN, "utf8");
  for (const [name, fnConst] of [
    ["CONTACT_EMAIL", "ADMIN_INBOX"],
    ["JOB_EMAIL", "JOB_INBOX"],
    ["NO_REPLY_EMAIL", "FROM_ADDRESS"],
  ] as const) {
    const siteValue = new RegExp(`export const ${name} = "([^"]+)";`).exec(site)?.[1];
    const fnValue = new RegExp(`const ${fnConst} = "([^"]+)";`).exec(fn)?.[1];
    ck(
      `${fnConst} equals the site's ${name}`,
      !!siteValue && siteValue === fnValue,
      `${fnValue} / ${siteValue}`,
    );
  }
}

console.log("\n2c. employer_new_application: CQrityjob writes to an organisation's own people");
{
  // The employer's e-mail on a new application. The RECIPIENT is chosen by the
  // database (rec_employer_notice_recipients) and handed over by the app, so the
  // function treats it like the other "caller" kinds: shape-validated, one only.
  // The mail is CQrityjob's own: From fixed, no organisation name, no Reply-To.
  const fn = readFileSync(FN, "utf8");
  // Only what reaches the PROVIDER counts here, so this block says the same
  // whatever the function does to decide who may call it.
  const toProvider = () => calls.filter((c) => c.url === "https://api.resend.com/emails");
  ck(
    "the kind is listed, to the caller's named address, with no Reply-To",
    /employer_new_application: \{ to: "caller", replyTo: "none" \}/.test(fn),
  );
  const sentBefore = toProvider().length;
  await post({
    kind: "employer_new_application",
    to: "owner@example.test",
    replyTo: "attacker@evil.example",
    senderName: "Somebody Else AB",
    from: "ceo@cqrityjob.com",
    ...message,
  });
  // Optional on purpose: with the kind refused nothing was sent, and the
  // assertions must FAIL by name rather than crash on a missing call.
  const c = toProvider().length > sentBefore ? toProvider().at(-1) : undefined;
  ck(
    "it goes to the one address the request names",
    JSON.stringify(c?.body.to) === JSON.stringify(["owner@example.test"]),
    JSON.stringify(c?.body.to),
  );
  ck(
    "and carries no Reply-To, whatever the request names",
    c !== undefined && !("reply_to" in c.body),
    String(c?.body.reply_to),
  );
  ck(
    "From is CQrityjob's own: no organisation name, whatever sender name the request names",
    c?.body.from === "CQrityjob <no-reply@cqrityjob.com>",
    String(c?.body.from),
  );
  const before = toProvider().length;
  const refused = await Promise.all(
    [
      { ...message },
      { ...message, to: "not-an-address" },
      { ...message, to: "a@x.test,b@y.test" },
      { ...message, to: "Owner <owner@example.test>" },
      { ...message, to: ["owner@example.test"] },
    ].map((m) => post({ kind: "employer_new_application", ...m })),
  );
  ck(
    "a missing, malformed, multiple or named recipient is refused, nothing sent",
    refused.every((r) => r.status === 400) && toProvider().length === before,
    refused.map((r) => r.status).join(","),
  );
  await post(
    { kind: "employer_new_application", to: "owner@example.test", ...message },
    { "idempotency-key": "employer-new-application:guard-1" },
  );
  ck(
    "the Idempotency-Key is forwarded, so a retry is deduplicated by the provider",
    toProvider().at(-1)?.headers["idempotency-key"] === "employer-new-application:guard-1",
  );
  const transport = readFileSync("src/lib/email/transport.server.ts", "utf8");
  ck("the app's transport knows the kind", /\|\s+"employer_new_application"/.test(transport));
}

console.log("\n3. Status passthrough, idempotency, no provider body, minimal logs");
{
  calls.length = 0;
  logs.length = 0;
  providerReadBody = false;
  const statuses: number[] = [];
  for (const s of [200, 409, 422, 429, 500]) {
    providerStatus = s;
    const res = await post(
      { kind: "recruitment_message", to: "person@example.test", ...message },
      { "idempotency-key": "msg:guard-1" },
    );
    statuses.push(res.status);
  }
  providerStatus = 200;
  ck(
    "the provider's status comes back unchanged",
    JSON.stringify(statuses) === "[200,409,422,429,500]",
    statuses,
  );
  ck(
    "the Idempotency-Key is forwarded on every call",
    calls.length === 5 && calls.every((c) => c.headers["idempotency-key"] === "msg:guard-1"),
  );
  ck(
    "the Resend key is sent only as the provider's Authorization header",
    calls.every(
      (c) =>
        c.url === "https://api.resend.com/emails" &&
        c.headers.authorization === `Bearer ${RESEND_KEY}` &&
        !JSON.stringify(c.body).includes(RESEND_KEY),
    ),
  );
  ck("the provider body is never read", !providerReadBody);
  ck(
    "logs carry the kind and status only — no address, subject, body or key",
    logs.length === 5 &&
      logs.every((l) => /^\[transactional-email\] recruitment_message \d{3}$/.test(l)),
    logs.join(" | "),
  );
  const answer = await (
    await post({ kind: "recruitment_message", to: "person@example.test", ...message })
  ).text();
  ck(
    "the answer carries no provider detail and no address",
    !/person@|re_guard|Hej/.test(answer),
    answer,
  );
}

console.log("\n4. Without RESEND_API_KEY: not configured, nothing called");
{
  env.delete("RESEND_API_KEY");
  calls.length = 0;
  const res = await post({ kind: "application_receipt", to: "a@example.test", ...message });
  const ready = await serve(
    new Request("https://fn.example/", { headers: { authorization: `Bearer ${SERVICE_KEY}` } }),
  );
  ck(
    "503 not_configured and no provider call",
    res.status === 503 && (await outcome(res)) === "not_configured" && calls.length === 0,
  );
  ck("the readiness probe says not_configured", ready.status === 503);
  env.set("RESEND_API_KEY", RESEND_KEY);
  const readyNow = await serve(
    new Request("https://fn.example/", { headers: { authorization: `Bearer ${SERVICE_KEY}` } }),
  );
  ck("and ready once the secret exists", readyNow.status === 200);
}

globalThis.fetch = realFetch;
console.log = realLog;
console.error = realError;

console.log("\n5. The application holds no Resend key and never calls Resend directly");
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const f = path.join(dir, e);
      return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx)$/.test(e) ? [f] : [];
    });
  // send-application-status-email.server.ts is unused by the application (no
  // caller outside its own check) and stays inert without a key.
  const DORMANT = new Set(["src/lib/email/send-application-status-email.server.ts"]);
  const direct = walk("src").filter(
    (f) =>
      !DORMANT.has(f) &&
      /process\.env\.RESEND_|api\.resend\.com/.test(strip(readFileSync(f, "utf8"))),
  );
  ck(
    "no live app module reads RESEND_* or calls api.resend.com",
    direct.length === 0,
    direct.join(", "),
  );
  const importers = walk("src").filter(
    (f) =>
      !/\.server\.ts$|\.functions\.ts$/.test(f) &&
      /from ["']@\/lib\/email\/transport\.server["']/.test(readFileSync(f, "utf8")),
  );
  ck(
    "the transport is imported only from server-only modules",
    importers.length === 0,
    importers.join(", "),
  );
  const fn = readFileSync(FN, "utf8");
  ck(
    "the function authenticates before anything else",
    /Deno\.serve\(async \(req\) => \{\s*if \(!\(await callerIsServer\(req\)\)\) return json\(401/.test(
      fn,
    ),
  );
  const config = readFileSync("supabase/config.toml", "utf8");
  ck(
    "config.toml lets the function authenticate its own caller",
    /\[functions\.transactional-email\]\s*(#.*\n\s*)*verify_jwt = false/.test(config),
  );
}

if (failures) {
  console.error(`\ntransactional-email:check FAILED (${failures} assertion(s))`);
  process.exit(1);
}
console.log("\ntransactional-email:check — all assertions hold");

/**
 * Guard: product e-mail goes out only through the `transactional-email` Edge
 * Function, which alone holds the Resend key and is not an open relay.
 *
 * The function's own code is EXECUTED here, under a minimal Deno stand-in
 * (env + serve), against a stub provider. No network, no key, no account.
 *
 *   1. Only the service-role key may call it; everything else is a bare 401.
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
const SERVICE_KEY = "guard-service-role-key-0123456789abcdef";
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

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const calls: Call[] = [];
let providerStatus = 200;
let providerReadBody = false;
const realFetch = globalThis.fetch;
// The project's own Auth admin endpoint, as the function's caller check
// asks it: 200 only for a key the "project" holds as a service key.
const projectServiceKeys = new Set<string>();
const authChecks: string[] = [];
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  if (String(url).includes("/auth/v1/admin/users")) {
    const h = new Headers(init?.headers);
    const bearer = (h.get("authorization") ?? "").replace(/^Bearer /, "");
    authChecks.push(bearer);
    const okKey = projectServiceKeys.has(bearer) && h.get("apikey") === bearer;
    return {
      status: okKey ? 200 : 401,
      ok: okKey,
      body: { cancel: async () => {} },
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

console.log("\n1. Only the application server may call it");
env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
env.set("RESEND_API_KEY", RESEND_KEY);
{
  const none = await serve(
    new Request("https://fn.example/", { method: "POST", body: JSON.stringify({}) }),
  );
  const anon = await post(
    { kind: "application_receipt", to: "a@example.test", ...message },
    { authorization: "Bearer some-anon-or-user-jwt-that-is-long-enough" },
  );
  const viaApikey = await serve(
    new Request("https://fn.example/", {
      method: "POST",
      headers: { apikey: SERVICE_KEY },
      body: JSON.stringify({ kind: "application_receipt", to: "a@example.test", ...message }),
    }),
  );
  ck("no credentials: 401", none.status === 401);
  ck("a non-service key: 401, and nothing sent", anon.status === 401 && calls.length === 1);
  ck("the service key as apikey is accepted", viaApikey.status === 200);
  env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_guard_0123456789abcdef" }));
  const newKey = await post(
    { kind: "application_receipt", to: "a@example.test", ...message },
    { authorization: "Bearer sb_secret_guard_0123456789abcdef" },
  );
  ck("a new-format secret key of this project is accepted", newKey.status === 200);
  env.delete("SUPABASE_SECRET_KEYS");

  // The production failure of 2026-10-03: the app holds the project's
  // service key in a form the function's env does not (byte-unequal), and
  // every call was refused. The project itself now decides.
  env.set("SUPABASE_URL", "https://project.example");
  const appForm = "eyJhbGciOiJIUzI1NiJ9.service-role-legacy-form-of-the-key";
  projectServiceKeys.add(appForm);
  const before = calls.length;
  const legacy = await post(
    { kind: "application_receipt", to: "a@example.test", ...message },
    { authorization: `Bearer ${appForm}`, apikey: appForm },
  );
  ck(
    "the project's service key in another form is accepted after the project confirms it",
    legacy.status === 200 && calls.length === before + 1 && authChecks.includes(appForm),
  );
  const checksBefore = authChecks.length;
  await post(
    { kind: "application_receipt", to: "a@example.test", ...message },
    { authorization: `Bearer ${appForm}`, apikey: appForm },
  );
  ck(
    "a confirmed key is remembered, not re-checked on every call",
    authChecks.length === checksBefore,
  );
  const sentBefore = calls.length;
  const userJwt = await post(
    { kind: "application_receipt", to: "a@example.test", ...message },
    {
      authorization: "Bearer eyJ.a-user-or-anon-jwt-the-project-refuses",
      apikey: "eyJ.a-user-or-anon-jwt-the-project-refuses",
    },
  );
  const mixed = await post(
    { kind: "application_receipt", to: "a@example.test", ...message },
    // A confirmed service key as bearer, paired with a different apikey:
    // refused, so one header can never vouch for the other.
    { authorization: `Bearer ${appForm}`, apikey: "eyJ.a-user-or-anon-jwt-the-project-refuses" },
  );
  ck(
    "a key the project refuses, or a bearer paired with someone else's apikey, is 401 and nothing is sent",
    userJwt.status === 401 && mixed.status === 401 && calls.length === sentBefore,
  );
  env.delete("SUPABASE_URL");
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

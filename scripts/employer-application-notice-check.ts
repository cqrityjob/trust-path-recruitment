/**
 * Guard: the employer is told, by e-mail, when a candidate submits a NEW
 * application -- safely, once, without personal data, and without the apply
 * request paying for it.
 *
 * The app's own code is EXECUTED here against a scripted database (a fake rpc)
 * and a stub provider (a fake fetch). No network, no key, no mail, no account.
 * The database half is proved by supabase/tests/employer_new_application_
 * notices_test.sql; this guard proves that the application drives it as
 * documented and that the two agree on names and arguments.
 *
 *   1. The mail renders in Swedish and English, plain text and HTML; the link
 *      is the application in the employer workspace on the PRODUCTION origin,
 *      and ignores a Lovable-assigned PUBLIC_SITE_URL (and any browser origin).
 *   2. Everything is escaped, whatever the vacancy or the organisation is
 *      called; a title cannot add a line, a header, a tag or a link.
 *   3. There is nowhere to put the candidate: not in the parameters, not in
 *      what the database hands over, not in the mail -- even when asked.
 *   4. The recipient is only what the database chose: the application's id is
 *      the only thing handed to enqueue, and the address that is mailed is the
 *      one the claim returned.
 *   5. The provider key is employer-new-application:<outbox row id> on every
 *      attempt; nothing but a status is recorded or logged.
 *   6. Honest outcomes: 2xx -> sent; a refusal, no answer, 5xx, 409, a timeout
 *      -> failed with the status (0 when none), retried by the database; a
 *      missing transport -> not_configured. Never "sent" unless accepted.
 *   7. The apply request is bounded (three seconds, a hard ceiling), never
 *      throws, and a database without the migration is a logged no-op.
 *   8. The wiring: after the commit and the receipt, nothing of it in the
 *      candidate's answer, the replay queues no second set, the sweep sends the
 *      rest under the same token and schedule.
 *   9. The SQL and the app agree: names, arguments, grants, locking.
 *
 * Run: bun run employer-application-notice:check
 */

import { readFileSync } from "node:fs";
import {
  employerApplicationLink,
  renderEmployerApplicationNotice,
  sendEmployerApplicationNoticeEmail,
} from "../src/lib/email/send-employer-application-notice-email.server";
import {
  EMPLOYER_NOTICE_BUDGET_MS,
  dispatchEmployerNotices,
  enqueueEmployerNotices,
  isMissingNoticeObject,
  notifyEmployerOfNewApplication,
  sweepEmployerNotices,
  type EmployerNoticeRpc,
} from "../src/lib/recruitment/employer-notice.server";

let failures = 0;
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` -- ${String(detail)}`}`,
  );
  if (!ok) failures += 1;
}

const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (p: string) => strip(read(p));

const SENDER = "src/lib/email/send-employer-application-notice-email.server.ts";
const SERVER = "src/lib/recruitment/employer-notice.server.ts";
const SUBMIT = "src/lib/job-intelligence/applications.functions.ts";
const ROUTE = "src/routes/api.recruitment.receipts-sweep.ts";
const SWEEP_SCRIPT = "scripts/receipts-sweep.ts";
const WORKFLOW = ".github/workflows/recruitment-receipts-sweep.yml";
const MIGRATION = "supabase/migrations/20270205090000_employer_new_application_notices.sql";
const ROLLBACK = "supabase/rollback/20270205090000_employer_new_application_notices_rollback.sql";
const SUITE = "supabase/tests/employer_new_application_notices_test.sql";
const DOC = "docs/release/2026-10-03-employer-new-application-notification.md";
const EDGE = "supabase/functions/transactional-email/index.ts";

// Every log line the code under test writes, kept so that what is LOGGED can be
// asserted on as well as what is sent.
const logged: string[] = [];
const realError = console.error;
const realWarn = console.warn;
console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));

const SERVICE_URL = "https://stub-project.invalid";
const SERVICE_KEY = "guard-service-role-key-0123456789abcdef";
process.env.SUPABASE_URL = SERVICE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
const savedSiteUrl = process.env.PUBLIC_SITE_URL;

// ── fixtures ────────────────────────────────────────────────────────────
const NOTICE_ID = "11111111-2222-4333-8444-555555555555";
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADDRESS = "owner@example.test";
const claimRow = (over: Record<string, unknown> = {}) => ({
  notice_id: NOTICE_ID,
  attempt_id: "99999999-8888-4777-8666-555555555555",
  provider_key: `employer-new-application:${NOTICE_ID}`,
  kind: "new_application",
  application_id: APP_ID,
  recipient_email: ADDRESS,
  via: "owner",
  language: "sv",
  employer_name: "Notis AB",
  employer_slug: "notis-ab",
  job_title: "Väktare, Gävle",
  attempts: 1,
  ...over,
});

type RpcCall = { fn: string; args: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;
function scriptedRpc(handlers: Record<string, Handler>) {
  const calls: RpcCall[] = [];
  const rpc: EmployerNoticeRpc = async (fn, args) => {
    calls.push({ fn, args });
    const h = handlers[fn];
    if (!h) {
      return {
        data: null,
        error: { code: "PGRST202", message: "Could not find the function in the schema cache" },
      };
    }
    const out = (await h(args)) as { data?: unknown; error?: { code?: string; message?: string } };
    return { data: out?.data ?? null, error: out?.error ?? null };
  };
  return { rpc, calls };
}

type FetchCall = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
let bodyRead = false;
function stubFetch(mode: number | "throw" | "hang", jsonBody?: unknown) {
  const calls: FetchCall[] = [];
  const fn = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    if (mode === "hang") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    }
    if (mode === "throw") throw new Error("connect ECONNREFUSED stub-project.invalid");
    const res = new Response(jsonBody === undefined ? null : JSON.stringify(jsonBody), {
      status: mode,
      headers: { "content-type": "application/json" },
    });
    // The provider's body can echo the recipient: nothing may read it.
    for (const reader of ["json", "text", "arrayBuffer", "blob", "formData"] as const) {
      (res as unknown as Record<string, unknown>)[reader] = async () => {
        bodyRead = true;
        return "";
      };
    }
    return res;
  }) as typeof fetch;
  return { fn, calls };
}

const base = {
  language: "sv" as const,
  via: "owner",
  employerName: "Notis AB",
  employerSlug: "notis-ab",
  jobTitle: "Väktare, Gävle",
  applicationId: APP_ID,
  siteOrigin: "https://www.cqrityjob.com",
};

// ═══════════════════════════════════════════════════════════════════════
console.log("\n1. The mail, in both languages, and where its link goes");
{
  for (const language of ["sv", "en"] as const) {
    const m = renderEmployerApplicationNotice({ ...base, language });
    ck(`${language}: subject, plain text and HTML all exist`, !!m.subject && !!m.text && !!m.html);
    ck(
      `${language}: names the vacancy and the organisation, and says an application arrived`,
      m.text.includes("Väktare, Gävle") &&
        m.text.includes("Notis AB") &&
        (language === "sv"
          ? /ny ansökan/i.test(m.subject + m.text)
          : /new application/i.test(m.subject + m.text)),
    );
    ck(
      `${language}: the link is the application in the employer workspace, on the production domain`,
      m.link === `https://www.cqrityjob.com/employer/notis-ab/applications/${APP_ID}` &&
        m.text.includes(m.link) &&
        m.html.includes(`href="${m.link}"`),
      m.link,
    );
  }
  const sv = renderEmployerApplicationNotice({ ...base, language: "sv" });
  const en = renderEmployerApplicationNotice({ ...base, language: "en" });
  ck(
    "sv and en differ in subject, text and HTML (no missed translation)",
    sv.subject !== en.subject && sv.text !== en.text && sv.html !== en.html,
  );
  for (const via of ["responsible", "owner", "admin"]) {
    const a = renderEmployerApplicationNotice({ ...base, via, language: "en" }).text;
    ck(
      `says why this person is written to (${via})`,
      via === "responsible"
        ? /responsible for the recruitment/.test(a)
        : via === "owner"
          ? /owner of Notis AB/.test(a)
          : /administrator of Notis AB/.test(a),
    );
  }
  ck(
    "a workspace slug or id of an unexpected shape gives the workspace's front door, not a link built from it",
    employerApplicationLink("https://www.cqrityjob.com", "../../x", APP_ID) ===
      "https://www.cqrityjob.com/employer" &&
      employerApplicationLink("https://www.cqrityjob.com", "ok-slug", "not-a-uuid") ===
        "https://www.cqrityjob.com/employer",
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n2. Hostile names are escaped; a title cannot add a line, a tag or a link");
{
  const hostileTitle =
    '<script>alert(1)</script>"><img src=x onerror=alert(1)>\r\nBcc: attacker@evil.test\nhttps://evil.example/phish';
  const hostileOrg = `Evil "AB" <b>bold</b> & 'co'\u2028Subject: pwned`;
  for (const language of ["sv", "en"] as const) {
    const m = renderEmployerApplicationNotice({
      ...base,
      language,
      jobTitle: hostileTitle,
      employerName: hostileOrg,
      employerSlug: '"><script>',
    });
    ck(
      `${language}: no tag from the title or the organisation reaches the HTML`,
      !/<script|<img|<\/?b>|href="https?:\/\/(?!www\.cqrityjob\.com)/.test(m.html),
      m.html,
    );
    ck(
      `${language}: the angle brackets, quotes and ampersands are entities`,
      m.html.includes("&lt;script&gt;") && m.html.includes("&amp;") && m.html.includes("&quot;"),
    );
    ck(
      `${language}: the subject is one short line`,
      !/[\r\n\u2028\u2029]/.test(m.subject) && m.subject.length <= 160,
      m.subject,
    );
    ck(
      `${language}: the plain text gains no line from the title`,
      !m.text.split("\n").some((l) => /^(Bcc|Subject):/i.test(l)) &&
        !m.text.split("\n").some((l) => l.startsWith("https://evil.example")),
      m.text,
    );
    ck(
      `${language}: a hostile slug leaves the front door, not a built link`,
      m.link === "https://www.cqrityjob.com/employer",
      m.link,
    );
  }
  const long = renderEmployerApplicationNotice({ ...base, jobTitle: "V".repeat(5000) });
  ck("a title is bounded", long.subject.length < 200 && long.text.length < 1000);
  const empty = renderEmployerApplicationNotice({ ...base, jobTitle: "", employerName: "" });
  ck(
    "an empty title or name still reads",
    empty.subject.length > 5 && /CQrityjob/.test(empty.text),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n3. There is nowhere to put the candidate, and nothing of them in the mail");
{
  const src = read(SENDER);
  const type = /export type EmployerApplicationNoticeParams = \{[\s\S]*?\n\};/.exec(src)?.[0] ?? "";
  const keys = [...type.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  ck(
    "the parameters are exactly: recipient, language, why, organisation, vacancy, application id, origin, key, timeout, fetch",
    JSON.stringify(keys) ===
      JSON.stringify([
        "recipientEmail",
        "language",
        "via",
        "employerName",
        "employerSlug",
        "jobTitle",
        "applicationId",
        "siteOrigin",
        "idempotencyKey",
        "timeoutMs",
        "fetchImpl",
      ]),
    keys.join(","),
  );
  const claimSql = /RETURNS TABLE \([\s\S]*?\)\s*LANGUAGE plpgsql/.exec(
    read(MIGRATION).slice(read(MIGRATION).indexOf("rec_claim_employer_notices")),
  )?.[0];
  ck(
    "what the claim hands over has no column that can name the candidate",
    !!claimSql &&
      !/applicant|candidate|display_name|cover|phone|cv_|answer|passport/i.test(claimSql),
    claimSql,
  );
  const probe = {
    ...base,
    candidateName: "Kim Kandidat",
    applicantName: "Kim Kandidat",
    candidateEmail: "kim.kandidat@example.test",
    coverNote: "Hej, jag söker tjänsten 070-123 45 67",
    phone: "070-123 45 67",
    cvText: "Tidigare erfarenhet: Väktare 2019-2024",
    answers: [{ answerText: "Ja, jag har körkort" }],
  } as unknown as Parameters<typeof renderEmployerApplicationNotice>[0];
  const m = renderEmployerApplicationNotice(probe);
  const everything = `${m.subject}\n${m.text}\n${m.html}`;
  ck(
    "even handed candidate data the renderer prints none of it",
    !/Kim|Kandidat|kim\.|070|körkort|erfarenhet|Hej, jag/.test(everything),
    everything,
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n4. The recipient is the database's choice; the link ignores a platform host");
{
  const { rpc, calls } = scriptedRpc({
    rec_enqueue_employer_new_application_notices: () => ({ data: 1 }),
    rec_claim_employer_notices: () => ({ data: [claimRow()] }),
    rec_settle_employer_notice: () => ({ data: "sent" }),
  });
  const provider = stubFetch(200);
  process.env.PUBLIC_SITE_URL = "https://trust-path-recruitment.lovable.app";
  const out = await notifyEmployerOfNewApplication(APP_ID, {}, { rpc, fetchImpl: provider.fn });
  ck(
    "enqueue is handed the application id and nothing else",
    calls[0]?.fn === "rec_enqueue_employer_new_application_notices" &&
      JSON.stringify(Object.keys(calls[0].args)) === JSON.stringify(["_application_id"]) &&
      calls[0].args._application_id === APP_ID,
    JSON.stringify(calls[0]),
  );
  ck(
    "the claim is for that application, for the kind this worker renders, and carries no address",
    calls[1]?.fn === "rec_claim_employer_notices" &&
      JSON.stringify(Object.keys(calls[1].args).sort()) ===
        JSON.stringify(["_application_id", "_kinds", "_limit"]) &&
      JSON.stringify(calls[1].args._kinds) === JSON.stringify(["new_application"]),
    JSON.stringify(calls[1]),
  );
  const sent = provider.calls[0];
  ck(
    "the mail goes to the address the claim returned, to nobody else, and says so to the transport",
    out.dispatch?.sent === 1 &&
      provider.calls.length === 1 &&
      sent?.url === `${SERVICE_URL}/functions/v1/transactional-email` &&
      sent.body.kind === "employer_new_application" &&
      sent.body.to === ADDRESS,
    JSON.stringify(sent?.body.to),
  );
  ck(
    "no sender name and no Reply-To is requested: it is CQrityjob writing, and nobody replies",
    sent !== undefined && !("senderName" in sent.body) && !("replyTo" in sent.body),
    JSON.stringify(Object.keys(sent?.body ?? {})),
  );
  ck(
    "both a plain-text and an HTML part are sent",
    typeof sent?.body.text === "string" && typeof sent?.body.html === "string",
  );
  const html = String(sent?.body.html ?? "");
  ck(
    "a Lovable-assigned PUBLIC_SITE_URL is ignored: the link is on the production domain",
    html.includes(`href="https://www.cqrityjob.com/employer/notis-ab/applications/${APP_ID}"`) &&
      !/lovable/i.test(html + String(sent?.body.text)),
  );
  process.env.PUBLIC_SITE_URL = "https://staging.example.test";
  const staging = stubFetch(200);
  await dispatchEmployerNotices(
    APP_ID,
    { deadline: Date.now() + 3000 },
    {
      rpc: scriptedRpc({
        rec_claim_employer_notices: () => ({ data: [claimRow()] }),
        rec_settle_employer_notice: () => ({ data: "sent" }),
      }).rpc,
      fetchImpl: staging.fn,
    },
  );
  ck(
    "a clean https host the deployment names itself is honoured (a staging stack's own links)",
    String(staging.calls[0]?.body.html).includes('href="https://staging.example.test/employer/'),
  );
  if (savedSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = savedSiteUrl;

  const server = code(SERVER);
  ck(
    "the server module reads no table and no address: no .from(), no auth.users, no memberships, no env but the site URL",
    !/\.from\(/.test(server) &&
      !/auth\.users|employer_memberships|recruitment_settings/.test(server) &&
      (server.match(/process\.env\.(\w+)/g) ?? []).every(
        (e) => e === "process.env.PUBLIC_SITE_URL",
      ),
  );
  ck(
    "the origin is the shared server-side resolution, never a browser location",
    /serverSiteOrigin\(process\.env\.PUBLIC_SITE_URL\)/.test(server) &&
      !/window\.|location\.|document\./.test(server + code(SENDER)),
  );
  const migration = read(MIGRATION);
  ck(
    "in the database the address is read from auth.users inside the recipient function",
    /FUNCTION public\.rec_employer_notice_recipients[\s\S]*?JOIN auth\.users u ON u\.id = m\.user_id/.test(
      migration,
    ),
  );
  ck(
    "the notify function takes an application id and options, never an address",
    /export async function notifyEmployerOfNewApplication\(\s*applicationId: string,\s*opts:/.test(
      server,
    ) &&
      !/recipient|email|address/i.test(
        /export async function notifyEmployerOfNewApplication[\s\S]*?\): Promise<NotifyOutcome>/.exec(
          server,
        )?.[0] ?? "recipient",
      ),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n5. The provider key, on every attempt; only statuses are recorded or logged");
{
  const settled: Record<string, unknown>[] = [];
  const keys: string[] = [];
  const mk = (attemptId: string) =>
    scriptedRpc({
      rec_claim_employer_notices: () => ({ data: [claimRow({ attempt_id: attemptId })] }),
      rec_settle_employer_notice: (a) => {
        settled.push(a);
        return { data: "failed" };
      },
    }).rpc;
  for (const [attempt, status] of [
    ["99999999-8888-4777-8666-000000000001", 500],
    ["99999999-8888-4777-8666-000000000002", 200],
  ] as const) {
    const provider = stubFetch(status);
    await dispatchEmployerNotices(
      APP_ID,
      { deadline: Date.now() + 3000 },
      {
        rpc: mk(attempt),
        fetchImpl: provider.fn,
      },
    );
    keys.push(provider.calls[0]?.headers["idempotency-key"] ?? "");
  }
  ck(
    "the key is employer-new-application:<outbox row id>, the same on a retry",
    keys.length === 2 && keys[0] === `employer-new-application:${NOTICE_ID}` && keys[0] === keys[1],
    keys.join(" | "),
  );
  const noKey = stubFetch(200);
  await dispatchEmployerNotices(
    APP_ID,
    { deadline: Date.now() + 3000 },
    {
      rpc: scriptedRpc({
        rec_claim_employer_notices: () => ({ data: [claimRow({ provider_key: null })] }),
        rec_settle_employer_notice: () => ({ data: "sent" }),
      }).rpc,
      fetchImpl: noKey.fn,
    },
  );
  ck(
    "and when the claim names none, the same key is built from the row id",
    noKey.calls[0]?.headers["idempotency-key"] === `employer-new-application:${NOTICE_ID}`,
  );
  const transport = code("src/lib/email/transport.server.ts");
  ck(
    "the transport forwards the Idempotency-Key header",
    /"Idempotency-Key": email\.idempotencyKey/.test(transport),
  );
  ck(
    "a settle carries the attempt, the result and the HTTP status -- nothing else",
    settled.length === 2 &&
      settled.every(
        (s) =>
          JSON.stringify(Object.keys(s).sort()) ===
          JSON.stringify(["_attempt_id", "_http_status", "_result"]),
      ),
    JSON.stringify(settled[0]),
  );
  ck("the provider's response body is never read", !bodyRead);
  const everything = logged.join("\n");
  ck(
    "nothing logged so far names an address, a title, an organisation or a link",
    !/@|Väktare|Notis|https?:|employer\//.test(everything),
    everything.slice(0, 300),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n6. Honest outcomes: sent only when accepted");
{
  const outcomes: Array<[string, number | "throw", string, unknown]> = [
    ["a 200", 200, "sent", 200],
    ["a 202", 202, "sent", 202],
    ["a 429 (rate limited)", 429, "failed", 429],
    ["a 422 (refused)", 422, "failed", 422],
    ["a 500", 500, "failed", 500],
    ["a 502", 502, "failed", 502],
    ["a 409 (the provider holds this key)", 409, "failed", 409],
    ["a 408", 408, "failed", 408],
    ["a network error", "throw", "failed", 0],
    ["a function that is not deployed (404)", 404, "not_configured", null],
    ["a function that rejects the key (401)", 401, "not_configured", null],
  ];
  for (const [label, mode, result, http] of outcomes) {
    const settle: Record<string, unknown>[] = [];
    const provider = stubFetch(mode);
    const summary = await dispatchEmployerNotices(
      APP_ID,
      { deadline: Date.now() + 3000 },
      {
        rpc: scriptedRpc({
          rec_claim_employer_notices: () => ({ data: [claimRow()] }),
          rec_settle_employer_notice: (a) => {
            settle.push(a);
            return { data: result };
          },
        }).rpc,
        fetchImpl: provider.fn,
      },
    ).catch(() => null);
    ck(
      `${label}: recorded as ${result}${http === null ? "" : ` with status ${http}`}`,
      summary !== null &&
        settle.length === 1 &&
        settle[0]._result === result &&
        settle[0]._http_status === http,
      JSON.stringify(settle),
    );
  }
  // The hanging provider, with a short call bound, through the sender itself.
  const hang = stubFetch("hang");
  const t0 = Date.now();
  const res = await sendEmployerApplicationNoticeEmail({
    ...base,
    recipientEmail: ADDRESS,
    idempotencyKey: `employer-new-application:${NOTICE_ID}`,
    timeoutMs: 120,
    fetchImpl: hang.fn,
    // An exception must FAIL the assertion by name, not crash the guard.
  }).catch(() => ({ result: "threw" }) as { result: string; status?: number });
  ck(
    "a call that never answers is cut off at its own timeout and is 'unknown', status 0 -- not 'sent'",
    res.result === "unknown" && "status" in res && res.status === 0 && Date.now() - t0 < 1500,
    JSON.stringify(res),
  );
  const notConfigured = await (async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const probe = stubFetch(200);
    const r = await sendEmployerApplicationNoticeEmail({
      ...base,
      recipientEmail: ADDRESS,
      idempotencyKey: "employer-new-application:x",
      fetchImpl: probe.fn,
    });
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    return { r, called: probe.calls.length };
  })();
  ck(
    "without transport settings: not_configured, and nothing was tried",
    notConfigured.r.result === "not_configured" && notConfigured.called === 0,
  );
  const sender = code(SENDER);
  ck(
    "the 409 / 429 / 5xx classification is the shared one, and the body is never read",
    /classifyProviderResponse/.test(sender) && !/res\.(json|text)\(\)/.test(sender),
  );
  ck(
    "a missing transport is the sender's first question",
    /missingEmailTransportSettings\(\)\.length > 0\) return \{ result: "not_configured" \}/.test(
      sender,
    ),
  );
  ck(
    "the sender never throws: its call is inside try/catch and ends in a result",
    /try \{[\s\S]*\} catch \(err\) \{[\s\S]*result: "unknown", status: 0/.test(sender) &&
      !/\bthrow\b/.test(sender),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n7. The apply request is bounded, never throws, and tolerates a missing migration");
{
  ck("the budget is three seconds", EMPLOYER_NOTICE_BUDGET_MS === 3000);

  // A claim that never answers: the request still returns, inside its budget.
  const hangingRpc: EmployerNoticeRpc = () => new Promise(() => {});
  let t0 = Date.now();
  const hung = await notifyEmployerOfNewApplication(APP_ID, { budgetMs: 200 }, { rpc: hangingRpc });
  let elapsed = Date.now() - t0;
  ck(
    "a database that never answers costs the request its budget and no more",
    elapsed >= 150 && elapsed < 900 && hung.enqueue === "deadline",
    `${elapsed} ms / ${hung.enqueue}`,
  );

  // A slow provider after a prompt claim: the budget still holds.
  const slowProvider = stubFetch("hang");
  t0 = Date.now();
  const slow = await notifyEmployerOfNewApplication(
    APP_ID,
    { budgetMs: 400 },
    {
      rpc: scriptedRpc({
        rec_enqueue_employer_new_application_notices: () => ({ data: 1 }),
        rec_claim_employer_notices: () => ({ data: [claimRow()] }),
        rec_settle_employer_notice: () => ({ data: "failed" }),
      }).rpc,
      fetchImpl: slowProvider.fn,
    },
  );
  elapsed = Date.now() - t0;
  ck(
    "a provider that never answers is cut off inside the budget",
    elapsed < 1200 && slow.enqueue === "queued",
    `${elapsed} ms`,
  );

  // The ceiling: asking for a minute is still three seconds.
  t0 = Date.now();
  await notifyEmployerOfNewApplication(APP_ID, { budgetMs: 60_000 }, { rpc: hangingRpc });
  elapsed = Date.now() - t0;
  ck(
    "a longer budget than the ceiling is clamped to it",
    elapsed >= 2800 && elapsed < 4000,
    `${elapsed} ms`,
  );

  // Never throws, whatever breaks.
  const boom = async () => {
    throw new Error("connection reset");
  };
  let threw = false;
  let boomOut: Awaited<ReturnType<typeof notifyEmployerOfNewApplication>> | null = null;
  try {
    boomOut = await notifyEmployerOfNewApplication(
      APP_ID,
      {},
      { rpc: boom as unknown as EmployerNoticeRpc },
    );
    await enqueueEmployerNotices(APP_ID, { rpc: boom as unknown as EmployerNoticeRpc });
    await sweepEmployerNotices({}, { rpc: boom as unknown as EmployerNoticeRpc });
  } catch {
    threw = true;
  }
  ck(
    "a database that throws fails nothing: no exception reaches the caller",
    !threw && boomOut?.enqueue === "failed",
  );

  const settleFails = await dispatchEmployerNotices(
    APP_ID,
    { deadline: Date.now() + 3000 },
    {
      rpc: scriptedRpc({
        rec_claim_employer_notices: () => ({ data: [claimRow()] }),
        rec_settle_employer_notice: () => ({ error: { code: "XX000", message: "boom" } }),
      }).rpc,
      fetchImpl: stubFetch(200).fn,
    },
  );
  ck(
    "an answer that cannot be recorded is reported as unsettled, never as sent",
    settleFails.unsettled === 1 && settleFails.sent === 0,
    JSON.stringify(settleFails),
  );

  // A database without the migration: a logged no-op.
  for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) {
    logged.length = 0;
    const provider = stubFetch(200);
    const { rpc, calls } = scriptedRpc({
      rec_enqueue_employer_new_application_notices: () => ({
        error: { code, message: "relation or function does not exist" },
      }),
    });
    const r = await notifyEmployerOfNewApplication(APP_ID, {}, { rpc, fetchImpl: provider.fn });
    ck(
      `${code}: a logged no-op -- nothing claimed, nothing sent, nothing thrown`,
      r.enqueue === "unavailable" &&
        r.dispatch === null &&
        calls.length === 1 &&
        provider.calls.length === 0 &&
        logged.some((l) => /not available/.test(l)),
      `${r.enqueue} / ${calls.length} calls / ${logged.join("|")}`,
    );
  }
  {
    const provider = stubFetch(200);
    const swept = await sweepEmployerNotices(
      {},
      { rpc: scriptedRpc({}).rpc, fetchImpl: provider.fn },
    );
    ck(
      "the sweep without the migration says so (available: false) and sends nothing",
      swept.available === false && swept.claimed === 0 && provider.calls.length === 0,
      JSON.stringify(swept),
    );
  }
  ck(
    "isMissingNoticeObject answers only for a missing object, not for any error",
    isMissingNoticeObject({ code: "PGRST202" }) &&
      isMissingNoticeObject({ code: "42P01" }) &&
      !isMissingNoticeObject({ code: "42501", message: "permission denied for function" }) &&
      !isMissingNoticeObject(null),
  );
  // A replay: enqueue only, nothing claimed or sent.
  {
    const provider = stubFetch(200);
    const { rpc, calls } = scriptedRpc({
      rec_enqueue_employer_new_application_notices: () => ({ data: 0 }),
    });
    const r = await notifyEmployerOfNewApplication(
      APP_ID,
      { dispatch: false },
      { rpc, fetchImpl: provider.fn },
    );
    ck(
      "a replay (dispatch: false) enqueues and sends nothing from the request",
      r.enqueue === "queued" && calls.length === 1 && provider.calls.length === 0,
    );
  }
  // The sweep: bounded and in batches.
  {
    const { rpc, calls } = scriptedRpc({
      rec_claim_employer_notices: (a) => ({
        data: Array.from({ length: Number(a._limit) }, (_, i) =>
          claimRow({
            notice_id: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`,
            attempt_id: crypto.randomUUID(),
          }),
        ),
      }),
      rec_settle_employer_notice: () => ({ data: "sent" }),
    });
    const provider = stubFetch(200);
    const swept = await sweepEmployerNotices({ limit: 12 }, { rpc, fetchImpl: provider.fn });
    ck(
      "the sweep claims in batches of at most five, stops at its limit, and sends each once",
      swept.claimed === 12 &&
        swept.sent === 12 &&
        provider.calls.length === 12 &&
        calls
          .filter((c) => c.fn === "rec_claim_employer_notices")
          .every((c) => Number(c.args._limit) <= 5) &&
        calls
          .filter((c) => c.fn === "rec_claim_employer_notices")
          .every((c) => c.args._application_id === null),
      JSON.stringify(swept),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
console.log(
  "\n8. The wiring: after the commit, invisible to the candidate, swept by the existing job",
);
{
  const submit = code(SUBMIT);
  const start = submit.indexOf("export const submitJobApplication");
  const end = submit.indexOf("// -------------------- CANDIDATE HISTORY");
  const fn = submit.slice(start, end);
  const receipt = fn.indexOf("await dispatchApplicationReceipt(result.id);");
  const notify = fn.indexOf("await notifyEmployerOfNewApplication(result.id");
  const ret = fn.indexOf("return {\n        id: result.id,");
  ck(
    "the employer's notice comes after the commit, after the candidate's receipt, and before the answer",
    receipt > 0 && notify > receipt && ret > notify,
    `${receipt} / ${notify} / ${ret}`,
  );
  ck(
    "it is the bounded, never-throwing module's call, with the application id only",
    /await notifyEmployerOfNewApplication\(result\.id, \{ dispatch: result\.replayed !== true \}\);/.test(
      fn,
    ) && /import\("@\/lib\/recruitment\/employer-notice\.server"\)/.test(fn),
  );
  const answer = fn.slice(ret, fn.indexOf("},\n  );", ret));
  ck(
    "the candidate's answer says nothing of it",
    !/notice|notify|employer|e-?post|mail/i.test(answer),
    answer,
  );
  const shortcut = fn.slice(
    fn.indexOf("if (prior) {"),
    fn.indexOf("const { data: job, error: jobErr }"),
  );
  ck(
    "a replayed submission only makes sure the notice is queued (set-once): no send, a one-second bound",
    /notifyEmployerOfNewApplication\(prior\.id as string, \{\s*dispatch: false,\s*budgetMs: 1000,?\s*\}\)/.test(
      shortcut,
    ),
  );
  ck(
    "no mail module is imported at the top of the functions file (the browser bundle never meets it)",
    !/^import .*employer-notice|^import .*send-employer-application/m.test(submit),
  );

  const route = code(ROUTE);
  ck(
    "the sweep endpoint stays closed without its token and presents exactly what it did",
    /if \(!authorised\(request\)\) return notFound\(\);/.test(route) &&
      /process\.env\.RECRUITMENT_SWEEP_TOKEN/.test(route) &&
      !/VITE_/.test(route),
  );
  const afterReceipts = route.slice(route.indexOf("sweepReceipts({ limit, employerId })"));
  ck(
    "the same call sweeps the employer's notices, whatever the receipts did, and reports counts only",
    /sweepEmployerNotices\(\{ limit \}\)/.test(route) &&
      afterReceipts.indexOf("catch (e)") > -1 &&
      afterReceipts.indexOf("catch (e)") < afterReceipts.indexOf("sweepEmployerNotices(") &&
      /employerNotices/.test(route) &&
      /\.\.\.receipts/.test(route),
  );
  ck(
    "the scheduled job needs no change: same token, same schedule, same script, which now prints the second line",
    /RECRUITMENT_SWEEP_TOKEN: \$\{\{ secrets\.RECRUITMENT_SWEEP_TOKEN \}\}/.test(read(WORKFLOW)) &&
      /cron: "7,22,37,52 \* \* \* \*"/.test(read(WORKFLOW)) &&
      /bun run scripts\/receipts-sweep\.ts/.test(read(WORKFLOW)) &&
      /employer-notice-sweep:/.test(read(SWEEP_SCRIPT)),
  );
  const pkg = JSON.parse(read("package.json")).scripts as Record<string, string>;
  ck(
    "wired as employer-application-notice:check and in negative-controls:all",
    pkg["employer-application-notice:check"] ===
      "bun run scripts/employer-application-notice-check.ts" &&
      /negative-controls:employer-application-notice/.test(pkg["negative-controls:all"]) &&
      read(".github/workflows/ci.yml").includes("employer-application-notice:check"),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\n9. The SQL and the app agree");
{
  const sql = read(MIGRATION);
  const server = code(SERVER);
  const calledRpcs = [...server.matchAll(/\)\("(rec_[a-z_]+)", \{/g)].map((m) => m[1]);
  ck(
    "the app calls exactly enqueue, claim and settle",
    JSON.stringify([...new Set(calledRpcs)].sort()) ===
      JSON.stringify([
        "rec_claim_employer_notices",
        "rec_enqueue_employer_new_application_notices",
        "rec_settle_employer_notice",
      ]),
    calledRpcs.join(","),
  );
  ck(
    "and the arguments it names are the parameters the functions declare",
    /rec_enqueue_employer_new_application_notices\(_application_id uuid\)/.test(sql) &&
      /rec_claim_employer_notices\(\s*_application_id uuid DEFAULT NULL,\s*_limit integer DEFAULT 20,\s*_kinds text\[\] DEFAULT NULL\s*\)/.test(
        sql,
      ) &&
      /rec_settle_employer_notice\(\s*_attempt_id uuid,\s*_result text,\s*_http_status integer DEFAULT NULL\s*\)/.test(
        sql,
      ),
  );
  for (const f of [
    "rec_employer_notice_recipients(uuid)",
    "rec_enqueue_employer_new_application_notices(uuid)",
    "rec_claim_employer_notices(uuid, integer, text[])",
    "rec_settle_employer_notice(uuid, text, integer)",
  ]) {
    ck(
      `${f}: SECURITY DEFINER, REVOKE from PUBLIC/anon/authenticated, GRANT to service_role only`,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${f.replace(/[()[\]]/g, "\\$&")} FROM PUBLIC, anon, authenticated;`,
      ).test(sql) &&
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${f.replace(/[()[\]]/g, "\\$&")} TO service_role;`,
        ).test(sql) &&
        !new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${f.replace(/[()[\]]/g, "\\$&")} TO[^;]*(anon|authenticated|PUBLIC)`,
        ).test(sql),
    );
  }
  ck(
    "the outbox: RLS enabled and forced, no policy, no client privilege, one row per application+recipient+kind",
    /ENABLE ROW LEVEL SECURITY/.test(sql) &&
      /FORCE ROW LEVEL SECURITY/.test(sql) &&
      !/CREATE POLICY/.test(sql) &&
      /REVOKE ALL ON TABLE public\.recruitment_employer_notices FROM PUBLIC, anon, authenticated;/.test(
        sql,
      ) &&
      /UNIQUE \(application_id, recipient_user_id, kind\)/.test(sql) &&
      /CHECK \(kind IN \('new_application'\)\)/.test(sql),
  );
  ck(
    "the claim is atomic (FOR UPDATE OF n SKIP LOCKED), leased, capped and bounded",
    /FOR UPDATE OF n SKIP LOCKED/.test(sql) &&
      /n\.claimed_at < now\(\) - interval '3 minutes'/.test(sql) &&
      /n\.attempts < 6/.test(sql) &&
      /least\(coalesce\(_limit, 20\), 50\)/.test(sql) &&
      /LIMIT 10\b/.test(sql),
  );
  ck(
    "a sent row is never claimed: only pending, expired-lease and retryable failed/not_configured rows are due",
    /n\.status = 'pending' AND n\.next_attempt_at <= now\(\)/.test(sql) &&
      /n\.status = 'claimed' AND n\.claimed_at/.test(sql) &&
      /n\.status IN \('failed', 'not_configured'\)/.test(sql) &&
      !/n\.status IN \([^)]*'sent'/.test(sql),
  );
  ck(
    "settle takes only a claimed row, only for the attempt it names",
    /WHERE n\.attempt_id = _attempt_id FOR UPDATE;/.test(sql) &&
      /IF _n\.status <> 'claimed' THEN\s+RETURN _n\.status;/.test(sql),
  );
  ck(
    "no trigger queues a notice: the apply request cannot be failed or slowed by mail",
    !/CREATE (CONSTRAINT )?TRIGGER/i.test(sql),
  );
  ck(
    "the migration, its rollback, its suite and its release note exist, and the suite is wired in db-test.sh",
    read(ROLLBACK).includes("DROP TABLE IF EXISTS public.recruitment_employer_notices") &&
      read(SUITE).includes("EN7.7") &&
      read("scripts/db-test.sh").includes("employer_new_application_notices_test.sql") &&
      read(DOC).length > 2000,
  );
  const state = JSON.parse(read("supabase/release-state.json")) as {
    frontier: { file: string; hostedState: string; verify?: string; rollback?: string }[];
  };
  const entry = state.frontier.find(
    (e) => e.file === "20270205090000_employer_new_application_notices.sql",
  );
  ck(
    "release-state.json: pending, with a read-only verify and the rollback named",
    entry?.hostedState === "pending" &&
      /has_function_privilege/.test(entry.verify ?? "") &&
      !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/.test(
        // Privilege names inside quotes (has_table_privilege(..., 'INSERT')) are not statements.
        (entry.verify ?? "").replace(/'[^']*'/g, "''"),
      ) &&
      entry.rollback ===
        "supabase/rollback/20270205090000_employer_new_application_notices_rollback.sql",
  );
  ck(
    "release-frontier-check expects it pending",
    read("scripts/release-frontier-check.ts").includes(
      '"20270205090000_employer_new_application_notices.sql"',
    ),
  );
  ck(
    "the edge function knows the kind, with no Reply-To and no organisation sender",
    /employer_new_application: \{ to: "caller", replyTo: "none" \}/.test(read(EDGE)) &&
      !/ORGANISATION_SENDER_KINDS = new Set\(\[[^\]]*employer_new_application/.test(read(EDGE)),
  );
}

console.error = realError;
console.warn = realWarn;
if (failures) {
  console.error(`\nemployer-application-notice:check FAILED (${failures} assertion(s))`);
  process.exit(1);
}
console.log("\nemployer-application-notice:check -- all assertions hold");

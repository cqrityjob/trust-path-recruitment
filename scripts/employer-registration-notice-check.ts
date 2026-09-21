/**
 * The company-registration chain, end to end, as a contract.
 *
 * Run via `bun run employer-registration-notice:check`.
 *
 * ── WHAT WENT WRONG, AND WHY A GUARD ───────────────────────────────────
 *
 * A company registered and nothing happened: no confirmation reached the
 * company, and no administrator was told a company wanted to join. Three
 * separate defects produced that one silence, and each of them is the kind
 * that comes back:
 *
 *   1. the employer entrance did not collect a company. "Registrera företag"
 *      led to `/signup?redirect=/employer`, where the organisation section
 *      was collapsed and unticked — so the registration produced a candidate
 *      account, no organisation intent, no `employers` row, and therefore
 *      genuinely nothing for an administrator to see;
 *   2. no registration email existed anywhere in this repository;
 *   3. no administrator notification existed either, in any channel.
 *
 * So this guard asserts the chain rather than any one file: the entrance
 * collects a company, both creation paths announce, the announcement cannot
 * take a saved registration down with it, the applicant message says
 * RECEIVED and never APPROVED, the administrator message carries the four
 * facts and an authenticated link, and no surface claims a send it did not
 * make.
 *
 * Credential-free and network-free, like every other guard here: the
 * transport is exercised with the environment deliberately emptied, and
 * `fetch` is replaced with a trap that fails the run if it is called.
 */

import { readFileSync } from "node:fs";
import { registrationTargetsOrganisation } from "../src/lib/auth/organisation-entrance";
import {
  ADMIN_RECIPIENT_ENV_KEY,
  RESEND_ENV_KEYS,
  missingEmployerRegistrationEmailSettings,
  renderEmployerRegistrationAdminEmail,
  renderEmployerRegistrationReceivedEmail,
  sendEmployerRegistrationAdminEmail,
  sendEmployerRegistrationReceivedEmail,
} from "../src/lib/email/send-employer-registration-email.server";

const fails: string[] = [];
const ck = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) fails.push(name);
};

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

const LANGS = ["sv", "en"] as const;

// -----------------------------------------------------------------------------
console.log("\n1. The employer entrance collects a company");
// -----------------------------------------------------------------------------
{
  // The two real CTAs. Both are literal in the source, so a change to either
  // that stops meaning "register a company" fails here.
  const home = read("src/routes/index.tsx");
  const employers = read("src/routes/employers.tsx");
  ck(
    "the homepage employer CTA targets /employer",
    /const EMPLOYER_INTENT = \{ redirect: "\/employer" \}/.test(home),
    "the CTA this guard reasons about is not in index.tsx",
  );
  ck(
    "/employers offers the same entrance",
    /to="\/signup" search=\{\{ redirect: "\/employer" \}\}/.test(employers.replace(/\s+/g, " ")),
    "the /employers register button no longer carries redirect=/employer",
  );

  ck(
    "arriving from the employer entrance pre-selects organisation registration",
    registrationTargetsOrganisation("?redirect=%2Femployer", true),
    "the organisation section would stay collapsed for somebody who pressed 'register your company'",
  );
  ck(
    "an unencoded destination works too",
    registrationTargetsOrganisation("?redirect=/employer", true),
  );
  ck(
    "a deeper employer destination counts",
    registrationTargetsOrganisation("?redirect=/employer/onboarding", true),
  );

  ck(
    "an invitation to an EXISTING organisation does not",
    !registrationTargetsOrganisation("?redirect=/employer/join/abc", true),
    "a colleague joining a company would be asked to register a second one",
  );
  ck(
    "a candidate destination does not",
    !registrationTargetsOrganisation("?redirect=/my-career", true),
  );
  ck("no destination at all does not", !registrationTargetsOrganisation("", true));
  ck(
    "sign-in never does",
    !registrationTargetsOrganisation("?redirect=/employer", false),
    "there is no organisation section on the sign-in form",
  );
  ck(
    "an off-site destination is refused before it is read",
    !registrationTargetsOrganisation("?redirect=https://evil.test/employer", true),
    "safeReturnPath is the only thing standing between this predicate and an open redirect",
  );
  ck(
    "a protocol-relative destination is refused",
    !registrationTargetsOrganisation("?redirect=//evil.test/employer", true),
  );

  const panel = read("src/components/auth/UnifiedAuthPanel.tsx");
  ck(
    "the form's initial state is derived from that predicate",
    /useState\(\(\) =>[\s\S]{0,200}registrationTargetsOrganisation\(window\.location\.search/.test(
      panel,
    ),
    "the checkbox no longer reads the entrance it was supposed to read",
  );
  ck(
    "the company name and country are still required when it is selected",
    /if \(isSignup && forOrganisation\) \{[\s\S]{0,300}companyNameRequired[\s\S]{0,300}companyCountryRequired/.test(
      panel,
    ),
  );
  ck(
    "both values still travel in user metadata, which is what survives verification",
    /company_name: companyName\.trim\(\)/.test(panel) &&
      /company_country: companyCountry\.trim\(\)/.test(panel),
  );
}

// -----------------------------------------------------------------------------
console.log("\n2. The transport is inert without configuration, and says so");
// -----------------------------------------------------------------------------
{
  const saved = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL,
  };
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.ADMIN_NOTIFICATION_EMAIL;

  // A network call with no key configured would be a bug AND would make this
  // guard non-hermetic. The trap proves neither happens.
  const realFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    throw new Error("the guard's fetch trap was called");
  }) as typeof fetch;

  try {
    const applicant = await sendEmployerRegistrationReceivedEmail({
      recipientEmail: "kontakt@example.test",
      language: "sv",
      companyName: "Testbolaget AB",
      contactName: "Test Testsson",
      siteOrigin: "https://cqrityjob.test",
    });
    ck(
      "the applicant channel reports not_configured",
      applicant.status === "not_configured",
      `got ${applicant.status}`,
    );
    ck(
      "and names both transport settings",
      applicant.status === "not_configured" &&
        RESEND_ENV_KEYS.every((k) => applicant.missing.includes(k)),
      "an operator cannot fix a setting nobody names",
    );

    const admin = await sendEmployerRegistrationAdminEmail({
      companyName: "Testbolaget AB",
      companyCountry: "SE",
      contactName: "Test Testsson",
      contactEmail: "kontakt@example.test",
      employerId: "11111111-1111-1111-1111-111111111111",
      siteOrigin: "https://cqrityjob.test",
    });
    ck(
      "the admin channel reports not_configured",
      admin.status === "not_configured",
      `got ${admin.status}`,
    );
    ck(
      "and names the recipient setting too",
      admin.status === "not_configured" && admin.missing.includes(ADMIN_RECIPIENT_ENV_KEY),
    );

    ck("no network call was made", !fetched, "the sender called out with no key configured");

    ck(
      "the configuration probe names exactly what is absent",
      [...RESEND_ENV_KEYS, ADMIN_RECIPIENT_ENV_KEY].every((k) =>
        missingEmployerRegistrationEmailSettings().includes(k),
      ),
    );
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  // ── A PROVIDER THAT REFUSES ─────────────────────────────────────────
  //
  // The rule is that a failed send may not be hidden behind a claim that mail
  // was sent. `not_configured` proves the no-key branch; this proves the
  // branch that matters more, because it is the one that happens once a key
  // IS configured and something goes wrong with an address.
  //
  // Hermetic: the provider is a stub, so this asserts the real code path
  // without a network call and without a Resend account.
  {
    const saved = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    };
    process.env.RESEND_API_KEY = "re_guard_stub_key";
    process.env.RESEND_FROM_EMAIL = "no-reply@example.test";
    const realFetch = globalThis.fetch;
    let sentBody: string | null = null;
    globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
      sentBody = init.body ?? null;
      return {
        ok: false,
        status: 422,
        text: async () => "recipient kontakt@example.test is suppressed",
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const refused = await sendEmployerRegistrationReceivedEmail({
        recipientEmail: "kontakt@example.test",
        language: "sv",
        companyName: "Testbolaget AB",
        contactName: null,
        siteOrigin: "https://cqrityjob.test",
      });
      ck(
        "a provider refusal is reported as failed, not as sent",
        refused.status === "failed",
        `got ${refused.status}`,
      );
      ck(
        "and carries the provider status so it is traceable",
        refused.status === "failed" && refused.error === "HTTP 422",
        refused.status === "failed" ? refused.error : "",
      );
      ck(
        "and carries no part of the provider's response body",
        refused.status !== "failed" || !/suppressed|kontakt@/.test(refused.error),
        "a provider body can carry the recipient address and this value is persisted and shown",
      );
      ck(
        "the api key is never placed in the message body",
        sentBody !== null && !String(sentBody).includes("re_guard_stub_key"),
      );
    } finally {
      globalThis.fetch = realFetch;
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  const sender = read("src/lib/email/send-employer-registration-email.server.ts");
  ck(
    "the api key is read from the environment, never module-scope-captured",
    /process\.env\.RESEND_API_KEY/.test(sender) &&
      !/const .*= process\.env\.RESEND_API_KEY/.test(sender),
  );
  ck(
    "the administrator address is configuration, not a literal",
    /process\.env\[ADMIN_RECIPIENT_ENV_KEY\]/.test(sender) && !/@cqrityjob\.(com|se)/.test(sender),
    "an address in this file would be a hard-coded recipient",
  );
  ck(
    "a provider failure records the status only, never the response body",
    /error: `HTTP \$\{res\.status\}`/.test(sender) && !/await res\.text\(\)/.test(sender),
    "a provider body can carry the recipient address and this value is shown to an administrator",
  );
  ck(
    "the site origin is configuration with the shared constant as a fallback",
    /process\.env\.PUBLIC_SITE_URL \|\| SITE_ORIGIN/.test(
      read("src/lib/job-intelligence/employer-registration-notice.server.ts"),
    ),
  );
}

// -----------------------------------------------------------------------------
console.log("\n3. The company is told RECEIVED, and never APPROVED");
// -----------------------------------------------------------------------------
{
  /**
   * A sentence that ASSERTS the company is approved.
   *
   * Written as a sentence-level test rather than a word search, because the
   * message legitimately uses "godkänd"/"approved" twice — once to say the
   * registration is NOT approved yet, and once to describe what happens WHEN
   * it is. A word search would either fail on correct copy or pass on the
   * defect, and this has to do neither.
   *
   * So: take each sentence of the rendered text, keep the ones that mention
   * approval or activation, and require every one of them to be either a
   * denial or a condition. A bare "your company has been approved" is neither,
   * which is exactly the sentence this flow must never send.
   */
  const MENTIONS_APPROVAL = /(godkän|aktiver|approv|activat|tillgång|access)/i;
  const IS_DENIAL_OR_CONDITION =
    /(ännu inte|inte godkänd|not approved yet|not yet|\bnär\b|\bwhen\b|\bonce\b|bekräftar bara|only confirms)/i;

  function approvalAssertions(html: string): string[] {
    const text = html
      .replace(/<[^>]*>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ");
    return text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0)
      .filter((sentence) => MENTIONS_APPROVAL.test(sentence))
      .filter((sentence) => !IS_DENIAL_OR_CONDITION.test(sentence));
  }

  for (const language of LANGS) {
    const { subject, html } = renderEmployerRegistrationReceivedEmail({
      recipientEmail: "kontakt@example.test",
      language,
      companyName: "Testbolaget AB",
      contactName: "Test Testsson",
      siteOrigin: "https://cqrityjob.test",
    });

    ck(`[${language}] the subject names the company`, subject.includes("Testbolaget AB"));
    ck(
      `[${language}] the subject says we RECEIVED it`,
      /(tagit emot|received)/i.test(subject),
      subject,
    );
    ck(
      `[${language}] the body says the registration is not approved yet`,
      /(ännu inte godkänd|not approved yet)/i.test(html),
      "without this sentence the message reads as an approval",
    );
    const asserted = approvalAssertions(html);
    ck(
      `[${language}] no sentence asserts the company is approved`,
      asserted.length === 0,
      `asserts an outcome only an administrator can produce: ${JSON.stringify(asserted)}`,
    );
    ck(
      `[${language}] it says what happens next`,
      /(granskar|reviews)/i.test(html),
      "a status with no next step is a dead end",
    );
    ck(
      `[${language}] its link is the status page, not a workspace`,
      html.includes('href="https://cqrityjob.test/employer"') &&
        !/href="[^"]*\/employer\/[a-z0-9-]+"/i.test(html),
      "linking into a workspace the database refuses is a permissions failure dressed up as a product",
    );
  }

  // A company name is user input and it is interpolated into HTML.
  const { html: escaped } = renderEmployerRegistrationReceivedEmail({
    recipientEmail: "kontakt@example.test",
    language: "sv",
    companyName: '<script>alert("x")</script>',
    contactName: null,
    siteOrigin: "https://cqrityjob.test",
  });
  ck(
    "a company name is escaped in the applicant message",
    !escaped.includes("<script>") && escaped.includes("&lt;script&gt;"),
  );
  ck("a missing contact name greets neutrally rather than inventing one", /Hej,/.test(escaped));
}

// -----------------------------------------------------------------------------
console.log("\n4. The administrator is told which company, by whom, and where");
// -----------------------------------------------------------------------------
{
  const employerId = "22222222-2222-2222-2222-222222222222";
  const { subject, html } = renderEmployerRegistrationAdminEmail({
    recipientEmail: "admin@example.test",
    companyName: "Testbolaget AB",
    companyCountry: "Sverige",
    contactName: "Test Testsson",
    contactEmail: "kontakt@example.test",
    employerId,
    siteOrigin: "https://cqrityjob.test",
  });

  ck("the subject names the company", subject.includes("Testbolaget AB"));
  ck("the body carries the company name", html.includes("Testbolaget AB"));
  ck("the body carries the contact person", html.includes("Test Testsson"));
  ck("the body carries the contact address", html.includes("kontakt@example.test"));
  ck(
    "the body links to this exact registration",
    html.includes(`https://cqrityjob.test/admin/employers/${employerId}`),
    "an administrator cannot act on a notification that does not say which row",
  );
  ck(
    "the link is behind an authenticated admin route",
    read("src/routes/_authenticated.admin.employers.$employerId.tsx").includes(
      'createFileRoute("/_authenticated/admin/employers/$employerId")',
    ),
    "the destination must require an administrator sign-in, not merely possession of a URL",
  );
  ck(
    "it says the organisation is still pending",
    /pending/i.test(html),
    "a notification that implies the company is live invites the wrong action",
  );

  const escapedAdmin = renderEmployerRegistrationAdminEmail({
    recipientEmail: "admin@example.test",
    companyName: '<img src=x onerror="alert(1)">',
    companyCountry: null,
    contactName: null,
    contactEmail: "kontakt@example.test",
    employerId,
    siteOrigin: "https://cqrityjob.test",
  }).html;
  ck(
    "a company name is escaped in the admin message",
    !escapedAdmin.includes("<img src=x") && escapedAdmin.includes("&lt;img"),
  );
}

// -----------------------------------------------------------------------------
console.log("\n5. Both creation paths announce, and neither can lose the registration");
// -----------------------------------------------------------------------------
{
  const fns = read("src/lib/job-intelligence/employer-onboarding.functions.ts");

  ck(
    "the signup path announces",
    /ensureMyEmployerCompanyFromSignup[\s\S]*?announceRegistration\(ctx, \{/.test(fns),
    "a registration completed after email verification would be silent again",
  );
  ck(
    "the onboarding-form path announces",
    (fns.match(/await announceRegistration\(ctx, \{/g) ?? []).length === 2,
    "one of the two ways a company is created does not announce itself",
  );
  ck(
    "the announcement runs AFTER the row exists",
    fns.indexOf("create_my_employer_company") < fns.indexOf("announceRegistration(ctx"),
  );
  // Read the catch block ITSELF rather than "somewhere after the catch there
  // is a return". The loose form passed with `throw err;` planted inside the
  // catch, because the match ran on past it into the next function -- which
  // the negative control found and this narrowing is the repair.
  const announceBody = (() => {
    const start = fns.indexOf("async function announceRegistration(");
    const end = fns.indexOf("\nasync function writeAudit(");
    return start >= 0 && end > start ? fns.slice(start, end) : "";
  })();
  const announceCatch = (() => {
    const at = announceBody.indexOf("} catch (err) {");
    return at >= 0 ? announceBody.slice(at) : "";
  })();
  ck(
    "the announcement's catch returns a value",
    /return \{[\s\S]*?applicant: \{ status: "failed"/.test(announceCatch),
    "an exception here would report a SAVED registration as failed and invite a duplicate",
  );
  ck(
    "and rethrows nothing",
    announceCatch.length > 0 && !/\bthrow\b/.test(announceCatch),
    "a rethrow turns a delivery problem into a failed registration",
  );
  ck(
    "the recipient comes from the caller's own verified session",
    /await ctx\.supabase\.auth\.getUser\(\)/.test(fns) && !/recipientEmail: data\./.test(fns),
    "a confirmation must never go to an address a form could nominate",
  );

  const notice = read("src/lib/job-intelligence/employer-registration-notice.server.ts");
  ck(
    "both channels are attempted independently",
    /sendEmployerRegistrationReceivedEmail\(/.test(notice) &&
      /sendEmployerRegistrationAdminEmail\(/.test(notice) &&
      (notice.match(/\.catch\(/g) ?? []).length === 2,
    "a bad applicant address must not silence the administrator",
  );
  ck(
    "the outcome of each channel is written to the audit trail",
    /recordOutcome\(params, "applicant", applicant\)/.test(notice) &&
      /recordOutcome\(params, "admin", admin\)/.test(notice),
  );
  ck(
    "an unwritten audit row does not cost a sent email",
    /async function recordOutcome\([\s\S]*?try \{[\s\S]*?\} catch \(err\) \{/.test(notice),
  );
  ck(
    "no recipient address is copied into the audit row",
    !/contactEmail/.test(
      notice.slice(
        notice.indexOf("async function recordOutcome"),
        notice.indexOf("export async function announceEmployerRegistration"),
      ),
    ),
    "the address belongs to the auth record; a second home for it needs its own justification",
  );
}

// -----------------------------------------------------------------------------
console.log("\n6. Nothing claims a send it did not make");
// -----------------------------------------------------------------------------
{
  const pending = read("src/routes/_authenticated.employer.pending.tsx");
  ck(
    "the review page only claims a send when the outcome says sent",
    /notice\.applicant\.status === "sent"\s*\?\s*"employer\.pending\.email\.sent"\s*:\s*"employer\.pending\.email\.notSent"/.test(
      pending.replace(/\s+/g, " ").replace(/ \? /g, " ? ").replace(/ : /g, " : "),
    ) ||
      /notice\.applicant\.status === "sent"[\s\S]{0,120}employer\.pending\.email\.notSent/.test(
        pending,
      ),
    "the page would assert an inbox it knows nothing about",
  );
  ck(
    "and says nothing at all about email when it does not know",
    /\{notice && \(/.test(pending),
    "a reload must clear the claim rather than repeat it",
  );
  ck(
    "the three steps are stated separately",
    /employer\.pending\.step\.received/.test(pending) &&
      /employer\.pending\.step\.review/.test(pending) &&
      /employer\.pending\.step\.activated/.test(pending),
  );

  const dict = read("src/i18n/dictionaries.ts");
  ck(
    "the 'sent' sentence does not promise delivery",
    /(kommit fram|arriving)/i.test(
      dict.slice(
        dict.indexOf('"employer.pending.email.sent"'),
        dict.indexOf('"employer.pending.email.sent"') + 400,
      ),
    ),
    "handing a message to a provider is not the same as somebody receiving it",
  );
  ck(
    "the 'not sent' sentence still says the registration is safe",
    /(ändå sparad|saved regardless)/i.test(dict),
  );
  for (const key of [
    "employer.pending.nextSteps.heading",
    "employer.pending.step.received",
    "employer.pending.step.review",
    "employer.pending.step.activated",
    "employer.pending.email.sent",
    "employer.pending.email.notSent",
    "auth.unified.organisation.note",
    "admin.overview.section.pendingEmployers",
    "admin.overview.pendingEmployers.empty",
    "admin.overview.pendingEmployers.loadError",
    "admin.overview.pendingEmployers.open",
    "admin.employers.detail.section.notices",
    "admin.employers.detail.notice.status.sent",
    "admin.employers.detail.notice.status.failed",
    "admin.employers.detail.notice.status.notConfigured",
    "admin.employers.detail.notice.resend",
  ]) {
    ck(
      `"${key}" exists in both languages`,
      (dict.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) ?? []).length === 2,
      "a key present in one dictionary renders as a raw identifier in the other",
    );
  }
}

// -----------------------------------------------------------------------------
console.log("\n7. The administrator's notification does not depend on email");
// -----------------------------------------------------------------------------
{
  const overview = read("src/routes/_authenticated.admin.index.tsx");
  ck(
    "the overview lists pending registrations, not only a count",
    /adminListEmployersForModeration/.test(overview) && /status: "pending" as const/.test(overview),
    "a number does not say which company registered or how to reach them",
  );
  ck(
    "it shows the company, the contact person and the contact address",
    /r\.name/.test(overview) &&
      /r\.ownerDisplayName/.test(overview) &&
      /r\.ownerEmail/.test(overview),
  );
  ck("it links to the registration itself", /to="\/admin\/employers\/\$employerId"/.test(overview));
  ck(
    "a failed read is not rendered as an empty queue",
    /pendingEmployers\.loadError/.test(overview),
    "an unread queue and an empty queue are different facts",
  );

  const admin = read("src/lib/job-intelligence/admin-employer-moderation.functions.ts");
  ck(
    "the notice reader is admin-gated",
    /adminGetEmployerRegistrationNotices[\s\S]{0,400}assertAdmin\(/.test(admin),
  );
  ck(
    "the resend is admin-gated",
    /adminResendEmployerRegistrationNotice[\s\S]{0,400}assertAdmin\(ctx\)/.test(admin),
  );
  ck(
    "the resend changes no status and creates nothing",
    !/adminResendEmployerRegistrationNotice[\s\S]*?(moderate_employer|create_my_employer_company|\.update\()/.test(
      admin,
    ),
    "a resend that could approve would be a second approval path",
  );
  ck(
    "a failed trail read is an error, not an empty list",
    /throw new Error\("LOAD_NOTICES_FAILED"\)/.test(admin),
  );
}

// -----------------------------------------------------------------------------
console.log("\n8. A company still cannot approve itself");
// -----------------------------------------------------------------------------
{
  // The boundary is in the database and this guard does not move it. What it
  // asserts is that nothing added here went around it.
  const migration = read(
    "supabase/migrations/20260720114043_h3_3_platform_admin_employer_moderation.sql",
  );
  ck(
    "moderate_employer requires a platform admin",
    /IF NOT public\.is_platform_admin\(_caller\) THEN\s*\n\s*RAISE EXCEPTION/.test(migration),
  );
  ck(
    "the self-service function still creates the organisation as pending",
    /VALUES \(_clean_name, _slug, _clean_country, _clean_website, _clean_registration, 'pending'\)/.test(
      read("supabase/migrations/20260719190845_h3_1_candidate_employer_portal.sql"),
    ),
    "a registration that created an active organisation would be a self-approval",
  );

  const changed = [
    "src/lib/email/send-employer-registration-email.server.ts",
    "src/lib/job-intelligence/employer-registration-notice.server.ts",
    "src/lib/job-intelligence/registration-notice-cache.ts",
    "src/lib/auth/organisation-entrance.ts",
  ];
  ck(
    "nothing this work added writes employers.status",
    changed.every(
      (f) => !/employers[\s\S]{0,80}status/.test(read(f)) || !/update|insert/i.test(read(f)),
    ),
    "status transitions belong to moderate_employer and nowhere else",
  );

  const onboarding = read("src/routes/_authenticated.employer.onboarding.tsx");
  ck(
    "a newly registered company is sent to the review page, not into a workspace",
    /navigate\(\{ to: "\/employer\/pending" \}\)/.test(onboarding),
    "the dashboard loads and then refuses every action for a pending organisation",
  );
  ck(
    "the create button stays disabled after a successful submit",
    /props\.onCreated\(result\.notice\);/.test(onboarding) &&
      !/props\.onCreated\([\s\S]{0,200}finally \{\s*setBusy\(false\);/.test(onboarding),
    "re-enabling the button mid-navigation is how a second submit reaches the server",
  );
}

// -----------------------------------------------------------------------------
if (fails.length > 0) {
  console.error(`\nSELF-TEST FAILED — ${fails.length} assertion(s):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nemployer-registration-notice:check — all assertions hold\n");

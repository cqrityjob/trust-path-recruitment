/**
 * The certification catalogue, end to end, against a REAL backend: real
 * PostgreSQL carrying the full migration history, real PostgREST enforcing real
 * RLS, the real application and its real server functions. No response is
 * substituted anywhere. (GoTrue and Storage are the local gateway's — see
 * scripts/local-stack/README.md for exactly what that means.)
 *
 * One journey, serial, as the people involved would live it:
 *
 *   1. a holder searches, finds a credential by its abbreviation, selects it,
 *      fills only what is their own, attaches evidence and saves; it survives a
 *      reload and appears in the Passport;
 *   2. a credential the catalogue does not offer is explained, cannot be
 *      selected, and a REQUEST for it creates no definition and no claim;
 *   3. the holder asks for a review; an administrator decides it;
 *   4. the holder shares ONLY the selected credential; a logged-out recipient
 *      sees only that; revoking closes it;
 *   5. the administrator reads the research queue and the request, decides
 *      them (audited), and a holder cannot do either.
 *
 * Opt-in and loopback only:
 *
 *   scripts/local-stack/up.sh          (PostgreSQL, PostgREST, gateway, app)
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 PG_PASSWORD=… \
 *     bun run e2e e2e/passport-catalogue-integration-local.spec.ts --project=chromium
 *
 * It creates its own users (`@fixture.invalid`) and a request in the DISPOSABLE
 * database; it never touches a hosted project.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseCredential, resultCodes, searchBox } from "./support/credential-picker";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the journey against a disposable local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The journey runs only against loopback — never a shared or hosted backend.",
);
test.describe.configure({ mode: "serial", timeout: 240_000 });

const DB_NAME = process.env.LOCAL_DB_NAME ?? "beskt_e2e";
const DB_URL = `postgresql://postgres:${process.env.PG_PASSWORD ?? process.env.LOCAL_DB_PASSWORD ?? "postgres"}@127.0.0.1:5432/${DB_NAME}`;
const GATEWAY = process.env.GATEWAY_URL ?? "http://127.0.0.1:54321";
const EVIDENCE_DIR = path.resolve(
  process.env.CATALOGUE_EVIDENCE_DIR ?? "artifacts/catalogue-journey",
);
const PASSWORD = "LocalJourney!2026";
const RUN = randomBytes(4).toString("hex");
/** Unique to this run, so the reviewer can be told apart from earlier runs' open cases. */
const REFERENCE = `JOURNEY-CPP-${RUN}`;
const HOLDER = `catalogue-holder-${RUN}@fixture.invalid`;
const OTHER = `catalogue-other-${RUN}@fixture.invalid`;
const ADMIN = `catalogue-admin-${RUN}@fixture.invalid`;
mkdirSync(EVIDENCE_DIR, { recursive: true });

const sql = (text: string) =>
  execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
    encoding: "utf8",
  }).trim();

function createUser(email: string): string {
  return sql(`
    with u as (
      insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, instance_id,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token,
        reauthentication_token)
      values (gen_random_uuid(), '${email}', crypt('${PASSWORD}', gen_salt('bf')), now(), 'authenticated',
        'authenticated', '00000000-0000-0000-0000-000000000000',
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
      returning id),
    i as (
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select id::text, id, jsonb_build_object('sub', id::text, 'email', '${email}', 'email_verified', true),
             'email', now(), now(), now() from u returning user_id)
    select user_id from i`).split("\n")[0];
}

const idOf = (email: string) => sql(`select id from auth.users where email = '${email}'`);

/** The language is the holder's own choice, stored in the browser; the journey reads in English. */
const english = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));

async function signIn(page: Page, email: string, redirect: string) {
  await english(page);
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** The local stack's anon key, as scripts/local-stack/up.sh wrote it for the app. */
const ANON_KEY =
  process.env.ANON_KEY ??
  /^SUPABASE_PUBLISHABLE_KEY=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1] ??
  "";

/** A signed-in session for a user, to prove what the DATABASE refuses. */
async function tokenOf(email: string): Promise<{ access_token: string }> {
  const response = await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await response.json()) as { access_token: string };
}

async function rpc(email: string, name: string, args: Record<string, unknown>) {
  const { access_token } = await tokenOf(email);
  const response = await fetch(`${GATEWAY}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await response.text() };
}

const shot = async (page: Page, name: string) =>
  page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true });

let claimId = "";
let shareLink = "";
/**
 * The journey proves the catalogue in whichever state the disposable database is in:
 * BEFORE the publication migration (the 140 researched definitions are added but inactive)
 * and AFTER it (they are approved and offered). Which one is read from the database, never
 * assumed, and every assertion that differs says so.
 */
let published = false;
let offered = 0;
let activeInternational = 0;
/** A definition the holder must never reach: the researched OSCP before publication, the closed Abu Dhabi licence after. */
let UNAPPROVED = "INTL_OFFSEC_OSCP";
const EVIDENCE_PDF = {
  name: "journey-certificate.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% synthetic journey evidence, not a real certificate\n"),
};

test.beforeAll(() => {
  activeInternational = Number(
    sql("select count(*) from public.sp_credential_types where is_active and code like 'INTL\\_%'"),
  );
  published = activeInternational > 14;
  // 14 international + 8 Swedish + 4 Indian + 44 public-pilot UK/Dubai definitions = 70, plus the
  // 140 researched definitions once the publication has been applied.
  offered = published ? 210 : 70;
  UNAPPROVED = published ? "AE_AZ_PSBD_LICENCE_GUARD" : "INTL_OFFSEC_OSCP";
  const holder = createUser(HOLDER);
  createUser(OTHER);
  const admin = createUser(ADMIN);
  sql(`insert into public.user_roles (user_id, role) values ('${admin}', 'admin')`);
  sql(
    `insert into public.sp_passport_profiles (holder_user_id, jurisdiction_code, work_location_confirmed_at)
     values ('${holder}', 'SE', now())`,
  );
  sql(
    `insert into public.sp_passport_profiles (holder_user_id, jurisdiction_code, work_location_confirmed_at)
     values ('${idOf(OTHER)}', 'SE', now())`,
  );
});

test("1 · a holder finds CPP by its abbreviation, registers it with evidence, and it survives a reload", async ({
  page,
}) => {
  await signIn(page, HOLDER, "/passport/credentials/new");
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 60_000,
  });
  await shot(page, "01-picker-empty");

  // Everything the catalogue offers this holder, drawn 20 at a time.
  await expect(page.locator("[data-filter-count]")).toContainText(
    `Showing ${offered} of ${offered} credentials`,
  );
  await expect(page.locator("[data-result]")).toHaveCount(20);
  while (await page.locator("[data-results-more]").isVisible())
    await page.locator("[data-results-more]").click();
  const listed = await resultCodes(page);
  expect(listed).toHaveLength(offered);
  for (const code of ["INTL_ASIS_CPP", "INTL_ISC2_CISSP", "VU1", "SV", "IN_MEPSC_Q7101"])
    expect(listed).toContain(code);
  const researched = listed.filter((c) => /OFFSEC|PECB|COMPTIA|BCSP|IAPP|GIAC/.test(c));
  // The 140 researched definitions are offered only once the publication has been applied.
  if (published) expect(researched).toContain("INTL_OFFSEC_OSCP");
  else expect(researched).toEqual([]);

  await searchBox(page).fill("cpp");
  expect(await resultCodes(page)).toEqual(["INTL_ASIS_CPP"]);
  await expect(
    page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"] [data-result-headline]'),
  ).toHaveText("CPP — Certified Protection Professional");
  await expect(
    page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"] [data-result-byline]'),
  ).toHaveText("ASIS International · International certification");
  await chooseCredential(page, "INTL_ASIS_CPP", { proceed: false });
  await shot(page, "02-picker-selected");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Only what is the holder's own is asked.
  await expect(page.locator('[data-field="issuer-name"]')).toHaveCount(0);
  await expect(page.locator('[data-field="authorisation-scope"]')).toHaveCount(0);
  await page.getByLabel("Credential identifier (optional)").fill(REFERENCE);
  await page.getByLabel("Issued", { exact: true }).fill("2025-03-01");
  await page.getByLabel("Valid until", { exact: true }).fill("2028-03-01");
  await page.locator('input[type="file"]').setInputFiles(EVIDENCE_PDF);
  await expect(page.locator("[data-evidence-file-name]")).toContainText("journey-certificate.pdf");
  await shot(page, "03-details");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await shot(page, "04-review");
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 60_000 });
  claimId = page.url().match(/claim\/([0-9a-f-]{36})/)![1];

  // What the DATABASE now holds, read back as the table owner.
  const row = sql(
    `select credential_code || '|' || coalesce(jurisdiction_code,'<null>') || '|' || coalesce(sub_jurisdiction_code,'<null>') || '|' || assertion_level || '|' || lifecycle_state || '|' || coalesce(credential_reference,'') || '|' || coalesce(claimed_issuer_name,'')
       from public.sp_claims where id = '${claimId}'`,
  );
  const [code, jurisdiction, region, assertion, lifecycle, reference, issuer] = row.split("|");
  expect(code).toBe("INTL_ASIS_CPP");
  expect(jurisdiction).toBe("<null>"); // an international certification takes NO country, not the holder's Sweden
  expect(region).toBe("<null>");
  expect(assertion).not.toBe("verified"); // saving, selecting and uploading verify nothing
  expect(lifecycle).toBe("active");
  expect(reference).toBe(REFERENCE);
  expect(issuer).toBe("ASIS International"); // the governed issuer, not typed by the holder
  expect(Number(sql(`select count(*) from public.sp_evidence where claim_id = '${claimId}'`))).toBe(
    1,
  );

  await page.reload();
  await expect(page.locator("main")).toContainText("Certified Protection Professional");
  await shot(page, "05-entry-after-reload");
  await page.goto(`${BASE}/passport`);
  const rows = page.locator("[data-credential-wallet] [data-credential-row]");
  await expect(rows).toHaveCount(1, { timeout: 60_000 });
  await expect(rows.first()).toContainText("Certified Protection Professional");
  await expect(rows.first()).toContainText("CPP");
  await shot(page, "06-passport-wallet");
});

test("2 · a credential the catalogue does not offer is explained, cannot be selected, and a request creates nothing", async ({
  page,
}) => {
  const before = {
    definitions: sql("select count(*) from public.sp_credential_types"),
    claims: sql(`select count(*) from public.sp_claims where holder_user_id = '${idOf(HOLDER)}'`),
    selectable: sql("select count(*) from public.sp_credential_types where is_active"),
  };
  await signIn(page, HOLDER, "/passport/credentials/new");
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 60_000,
  });

  // An award the research found: before its publication it is a definition nobody can select,
  // after it OSCP and OSCP+ are two distinct, selectable results.
  await searchBox(page).fill("oscp");
  if (published) {
    expect((await resultCodes(page)).sort()).toEqual(["INTL_OFFSEC_OSCP", "INTL_OFFSEC_OSCP_PLUS"]);
  } else {
    await expect(page.locator("[data-result]")).toHaveCount(0);
    await expect(page.locator("[data-catalogue-empty]")).toBeVisible();
  }

  // A retained record: explained, with the reason in a controlled vocabulary, and not selectable.
  await searchBox(page).fill("cafs");
  const group = page.locator("[data-unavailable-group]");
  await expect(group).toBeVisible({ timeout: 30_000 });
  await expect(group.locator("[data-unavailable-item]")).toContainText(
    "Certified Anti-Fraud Specialist",
  );
  await expect(group.locator("[data-unavailable-reason]")).toHaveText(
    "Awaiting a check against the issuer's own page",
  );
  await expect(group.locator('input[type="radio"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await shot(page, "07-not-available-yet");

  await group.locator("[data-unavailable-ask]").click();
  await expect(page.locator('[data-field="request-issuer"]')).toHaveValue(/ACAMS/);
  await page
    .locator('[data-field="request-note"]')
    .fill("I hold this certification and would like to register it.");
  await page.locator("[data-request-submit]").click();
  await expect(page.locator("[data-request-sent]")).toBeVisible({ timeout: 30_000 });
  await shot(page, "08-request-sent");
  await expect(page.locator("[data-my-requests]")).toContainText("Certified Anti-Fraud Specialist");
  await expect(page.locator("[data-my-requests] [data-request-status]")).toHaveAttribute(
    "data-request-status",
    "open",
  );

  // A second identical request is refused by the DATABASE, not only by the form.
  await group.locator("[data-unavailable-ask]").click();
  await page.locator("[data-request-submit]").click();
  await expect(page.locator("[data-request-error]")).toContainText("already have an open request", {
    timeout: 30_000,
  });

  // Nothing was published, nothing was registered, nothing became verified.
  expect(sql("select count(*) from public.sp_credential_types")).toBe(before.definitions);
  expect(sql("select count(*) from public.sp_credential_types where is_active")).toBe(
    before.selectable,
  );
  expect(
    sql(`select count(*) from public.sp_claims where holder_user_id = '${idOf(HOLDER)}'`),
  ).toBe(before.claims);
  expect(
    sql(
      `select count(*) from public.sp_catalogue_requests where holder_user_id = '${idOf(HOLDER)}' and status = 'open'`,
    ),
  ).toBe("1");
});

async function asAdmin(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ADMIN, "/admin/passport-catalogue");
  return { context, page };
}

test("3 · an administrator reads the research queue, decides a record, and answers the request — audited", async ({
  browser,
}) => {
  const { context, page } = await asAdmin(browser);
  await expect(page.locator("[data-admin-passport-catalogue]")).toBeVisible({ timeout: 60_000 });
  // The Definitions tab: before the publication the 140 imported definitions await it and nothing is
  // selectable by them; after it none is left awaiting.
  await expect(page.locator('[data-count="awaiting_definition_approval"]')).toHaveText(
    published ? "0" : "140",
    { timeout: 60_000 },
  );
  await shot(page, "09-admin-definitions");

  await page.locator('[data-catalogue-tab="research"]').click();
  await expect(page.locator("[data-research-panel]")).toBeVisible();
  const counts = async (k: string) =>
    (await page.locator(`[data-research-count="${k}"]`).innerText()).trim();
  expect(await counts("total")).toBe("170");
  expect(await counts("matched_existing")).toBe("14");
  expect(await counts("added_approved")).toBe("140");
  expect(await counts("retained_for_review")).toBe("16");
  await expect(page.locator("[data-research-boundary]")).toContainText("reviewed migrations");
  await shot(page, "10-admin-research");

  // A decision is recorded with a reason, and a published record offers none.
  await page.locator('[data-research-filter="search"]').fill("cafs");
  const record = page.locator("[data-research-row]").first();
  await expect(record).toHaveAttribute("data-research-outcome", "retained_for_review");
  await expect(record.locator("[data-research-holder-reason]")).toContainText("Awaiting a check");
  await page.locator('[data-research-filter="search"]').fill("cissp");
  await expect(
    page.locator("[data-research-row]").first().locator("[data-research-locked]"),
  ).toBeVisible();
  await page.locator('[data-research-filter="search"]').fill("cafs");
  await record.locator("[data-research-decide]").click();
  await expect(
    page.locator('[data-research-field="decision"] option[value="approved"]'),
  ).toHaveCount(0);
  await page.locator('[data-research-field="decision"]').selectOption("needs_information");
  await page
    .locator('[data-research-field="note"]')
    .fill("Journey: still waiting for the issuer's own page.");
  await page.locator("[data-research-save]").click();
  await expect(page.locator("[data-research-form]")).toHaveCount(0, { timeout: 30_000 });
  expect(
    Number(
      sql(
        `select count(*) from public.audit_logs where action = 'catalogue_research_decided' and actor_id = '${idOf(ADMIN)}'`,
      ),
    ),
  ).toBe(1);

  // The request: answered by declining with a reason the holder reads.
  await page.locator('[data-catalogue-tab="requests"]').click();
  await expect(page.locator("[data-requests-panel]")).toBeVisible();
  const request = page.locator("[data-request-row]").first();
  await expect(request).toContainText("Certified Anti-Fraud Specialist");
  await request.locator("[data-request-answer]").click();
  await page.locator('[data-request-field="status"]').selectOption("declined");
  await page
    .locator('[data-request-field="note"]')
    .fill("Not taken in yet: the issuer's page could not be confirmed.");
  await page.locator("[data-request-save]").click();
  await expect(page.locator("[data-request-form]")).toHaveCount(0, { timeout: 30_000 });
  expect(
    Number(
      sql(
        `select count(*) from public.audit_logs where action = 'catalogue_request_resolved' and actor_id = '${idOf(ADMIN)}'`,
      ),
    ),
  ).toBe(1);
  await shot(page, "11-admin-requests");
  // The decisions published nothing, and nothing was verified by any of it.
  expect(
    Number(
      sql(
        "select count(*) from public.sp_credential_types where is_active and code like 'INTL\\_%'",
      ),
    ),
  ).toBe(activeInternational);
  expect(sql(`select assertion_level from public.sp_claims where id = '${claimId}'`)).not.toBe(
    "verified",
  );
  await context.close();
});

test("4 · the holder reads the answer, and neither a holder nor a stranger can decide anything", async ({
  page,
}) => {
  await signIn(page, HOLDER, "/passport/credentials/new");
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("[data-catalogue-request] summary").click();
  await expect(page.locator("[data-my-requests] [data-request-status]")).toHaveAttribute(
    "data-request-status",
    "declined",
    { timeout: 30_000 },
  );
  await expect(page.locator("[data-my-requests]")).toContainText(
    "issuer's page could not be confirmed",
  );
  await shot(page, "12-holder-reads-the-answer");

  // The database refuses an ordinary holder — through the same API the app uses.
  const recordId = sql(
    "select id from public.sp_catalogue_research_records where acronym = 'CAFS'",
  );
  const requestId = sql(
    `select id from public.sp_catalogue_requests where holder_user_id = '${idOf(HOLDER)}'`,
  );
  const review = await rpc(HOLDER, "sp_admin_review_research_record", {
    _record_id: recordId,
    _decision: "excluded",
    _note: "holder attempt",
  });
  expect(review.status).toBeGreaterThanOrEqual(400);
  expect(review.body).toContain("SP_CATALOGUE_ADMIN_REQUIRED");
  const resolve = await rpc(HOLDER, "sp_admin_resolve_catalogue_request", {
    _request_id: requestId,
    _status: "answered_existing",
    _credential_code: "INTL_ASIS_CPP",
  });
  expect(resolve.status).toBeGreaterThanOrEqual(400);
  // Neither can an administrator approve or publish through the same functions.
  const approve = await rpc(ADMIN, "sp_admin_review_research_record", {
    _record_id: recordId,
    _decision: "approved",
    _note: "approve attempt",
  });
  expect(approve.status).toBeGreaterThanOrEqual(400);
  expect(approve.body).toContain("SP_RESEARCH_DECISION_INVALID");
  // A second holder cannot read the first one's request or any research record.
  const { access_token } = await tokenOf(OTHER);
  for (const table of ["sp_catalogue_requests", "sp_catalogue_research_records"]) {
    const read = await fetch(`${GATEWAY}/rest/v1/${table}?select=id`, {
      headers: { apikey: ANON_KEY, authorization: `Bearer ${access_token}` },
    });
    expect(await read.json()).toEqual([]);
  }
  expect(sql(`select status from public.sp_catalogue_requests where id = '${requestId}'`)).toBe(
    "declined",
  );
  expect(
    sql(
      `select catalogue_decision from public.sp_catalogue_research_records where id = '${recordId}'`,
    ),
  ).toBe("needs_information");
});

test("5 · a review is requested and decided by an authorised administrator", async ({
  page,
  browser,
}) => {
  await signIn(page, HOLDER, `/passport/entry/claim/${claimId}`);
  await page
    .getByRole("button", { name: /Request verification|Have CQrityjob review the documentation/ })
    .first()
    .click();
  await shot(page, "13-request-verification");
  const cq = page.getByRole("button", { name: "Have CQrityjob review the documentation" });
  if (await cq.isVisible()) await cq.click();
  await expect(page.locator("main")).toContainText(/submitted|Under review|In review/i, {
    timeout: 30_000,
  });
  expect(
    Number(
      sql(`select count(*) from public.sp_verification_requests where claim_id = '${claimId}'`),
    ),
  ).toBe(1);

  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signIn(adminPage, ADMIN, "/admin/passport-verification");
  await expect(adminPage.getByRole("heading", { name: "Verification queue" })).toBeVisible({
    timeout: 60_000,
  });
  // The queue may hold earlier runs' open cases: open them until this run's reference shows.
  const opens = adminPage.getByRole("button", { name: "Open request", exact: true });
  await expect(opens.first()).toBeVisible({ timeout: 30_000 });
  const total = await opens.count();
  let found = false;
  for (let i = 0; i < total && !found; i++) {
    await opens.nth(i).click();
    // The case loads after the click; read the reference only once it has.
    await adminPage
      .getByText("Reference number", { exact: true })
      .first()
      .waitFor({ timeout: 30_000 });
    found = (await adminPage.getByText(REFERENCE, { exact: true }).count()) > 0;
    if (!found) await opens.nth(i).click();
  }
  expect(found, "this run's case is in the verification queue").toBe(true);
  await expect(adminPage.getByText("What the candidate states")).toBeVisible({ timeout: 30_000 });
  // The reviewer sees the catalogue's own facts about the definition, never the holder's e-mail.
  await expect(adminPage.locator("main")).not.toContainText(HOLDER);
  await shot(adminPage, "14-admin-review-case");
  await adminPage.getByLabel("Approve document review").check();
  await adminPage
    .getByLabel("Internal reasoning")
    .fill("Journey: the document names the certification and the holder.");
  // The decision is confirmed in the browser's own dialog, and cannot be edited afterwards.
  adminPage.once("dialog", (dialog) => dialog.accept());
  await adminPage.getByRole("button", { name: "Yes, record the decision" }).click();
  await expect(adminPage.getByText("The decision has been recorded.")).toBeVisible({
    timeout: 30_000,
  });
  await admin.close();
  expect(sql(`select assertion_level from public.sp_claims where id = '${claimId}'`)).toBe(
    "verified",
  );
  await page.reload();
  await expect(page.locator("main")).toContainText(/Verified|Approved/);
  await shot(page, "15-holder-sees-the-decision");
});

test("6 · only the selected credential is shared; a logged-out recipient sees only that; revoking closes it", async ({
  page,
  browser,
}) => {
  await signIn(page, HOLDER, "/passport/share");
  await expect(page.locator("[data-share-screen]")).toBeVisible({ timeout: 60_000 });
  await page.locator(`[data-merit-option="claim:${claimId}"] input`).check();
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 30_000 });
  shareLink = await page.locator("[data-share-link]").inputValue();
  expect(shareLink).toMatch(/^https?:\/\//);
  await shot(page, "16-share-created");

  const recipient = await browser.newContext();
  const view = await recipient.newPage();
  await english(view);
  // The link names the canonical public origin; the recipient route is the same app,
  // so it is opened on this disposable stack, never on a hosted origin.
  const link = new URL(shareLink);
  await view.goto(`${BASE}${link.pathname}${link.search}${link.hash}`);
  await expect(view.locator("[data-recipient-view]")).toBeVisible({ timeout: 60_000 });
  await expect(view.locator("[data-recipient-credential]")).toHaveCount(1);
  await expect(view.locator("main")).toContainText("Certified Protection Professional");
  // Only what was selected, at the level it was selected: no identifier, no e-mail, no evidence.
  const text = await view.locator("main").innerText();
  expect(text).not.toContain(REFERENCE);
  expect(text).not.toContain(HOLDER);
  expect(text).not.toContain("journey-certificate.pdf");
  await shot(view, "17-recipient-view");

  await page.goto(`${BASE}/passport/share`);
  await page.locator("[data-share-revoke]").first().click();
  const confirm = page.getByRole("button", { name: /Revoke|Återkalla/ }).last();
  if (await confirm.isVisible()) await confirm.click();
  await expect
    .poll(() =>
      sql(
        `select count(*) from public.sp_disclosures where revoked_at is not null and holder_user_id = '${idOf(HOLDER)}'`,
      ),
    )
    .toBe("1");
  await view.reload();
  await expect(view.locator("[data-recipient-credential]")).toHaveCount(0);
  await shot(view, "18-recipient-after-revocation");
  await recipient.close();
});

test("7 · an international certification held in another country, a missing date and local details", async ({
  page,
}) => {
  // A holder who works in Great Britain: the certification is still international, and is saved
  // with NO country; with no dates it is saved WITHOUT a lifetime being inferred.
  const uk = `catalogue-uk-${RUN}@fixture.invalid`;
  const ukId = createUser(uk);
  sql(
    `insert into public.sp_passport_profiles (holder_user_id, jurisdiction_code, work_location_confirmed_at)
     values ('${ukId}', 'GB', now())`,
  );
  await signIn(page, uk, "/passport/credentials/new");
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 60_000,
  });
  await chooseCredential(page, "INTL_ISC2_CISSP", { search: "cissp" });
  await page.getByLabel("Credential identifier (optional)").fill("UK-HOLDER-1");
  // No dates at all.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const id = page.url().match(/claim\/([0-9a-f-]{36})/)![1];
  const row = sql(
    `select coalesce(jurisdiction_code,'<null>') || '|' || coalesce(issued_on::text,'<null>') || '|' || coalesce(valid_until::text,'<null>') || '|' || coalesce((select no_expiry::text from public.sp_credential_details d where d.claim_id = c.id),'<null>')
       from public.sp_claims c where c.id = '${id}'`,
  );
  const [jurisdiction, issued, until, noExpiry] = row.split("|");
  expect(jurisdiction).toBe("<null>"); // not Great Britain, not anywhere
  expect(issued).toBe("<null>");
  expect(until).toBe("<null>");
  expect(["<null>", "false"]).toContain(noExpiry); // a missing date is not a lifetime
  await expect(page.locator("main")).not.toContainText(/No expiry|Utan utgångsdatum/);
  await shot(page, "19-uk-holder-international-no-dates");

  // Local jurisdiction and issuer details: a Swedish credential names its issuer on the certificate.
  await page.goto(`${BASE}/passport/credentials/new`);
  await page.locator('[data-filter="scope"] input[value="national"]').check();
  await page.locator('[data-filter="country"]').selectOption("SE");
  await chooseCredential(page, "VU1", { search: "vu1" });
  await page.locator('[data-field="issuer-name"]').fill("Fiktiv Utbildning AB");
  await page.getByLabel("Valid until", { exact: true }).fill("2030-01-31");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const vu1 = page.url().match(/claim\/([0-9a-f-]{36})/)![1];
  expect(
    sql(
      `select jurisdiction_code || '|' || claimed_issuer_name from public.sp_claims where id = '${vu1}'`,
    ),
  ).toBe("SE|Fiktiv Utbildning AB");
});

test("8 · an unapproved definition, a forged save and a direct write are refused by the database", async () => {
  const unapproved = await rpc(HOLDER, "sp_save_international_credential", {
    _input: { definition_code: UNAPPROVED, identifier: "FORGED-1" },
  });
  expect(unapproved.status).toBeGreaterThanOrEqual(400);
  // A forged country on an international certification is refused as well.
  const forged = await rpc(HOLDER, "sp_save_international_credential", {
    _input: { definition_code: "INTL_ASIS_PSP", market_country: "SE", identifier: "FORGED-2" },
  });
  expect(forged.status).toBeGreaterThanOrEqual(400);
  // A direct insert into the claim table, naming an inactive definition, is refused.
  const { access_token } = await tokenOf(HOLDER);
  const direct = await fetch(`${GATEWAY}/rest/v1/sp_claims`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      holder_user_id: idOf(HOLDER),
      claim_type: "certification",
      credential_code: UNAPPROVED,
      title: "Not approved",
      claimed_issuer_name: "Nobody",
    }),
  });
  expect(direct.status).toBeGreaterThanOrEqual(400);
  // A holder cannot write the catalogue.
  const write = await fetch(`${GATEWAY}/rest/v1/sp_credential_types?code=eq.${UNAPPROVED}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({ is_active: true }),
  });
  expect(write.status).toBeGreaterThanOrEqual(400);
  expect(sql(`select is_active from public.sp_credential_types where code = '${UNAPPROVED}'`)).toBe(
    "f",
  );
  expect(
    sql(
      `select count(*) from public.sp_claims where holder_user_id = '${idOf(HOLDER)}' and credential_code in ('${UNAPPROVED}','INTL_ASIS_PSP')`,
    ),
  ).toBe("0");
});

test("9 · a researched certification, once published, is found, registered with no country and no inferred lifetime", async ({
  page,
}) => {
  test.skip(
    !published,
    "The 140 researched definitions are not published in this database: step 8 proves they are refused.",
  );
  await signIn(page, HOLDER, "/passport/credentials/new");
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 60_000,
  });
  // Two awards whose abbreviations differ by one character are told apart by name and issuer.
  await searchBox(page).fill("oscp");
  const headline = async (code: string) =>
    (
      await page
        .locator(`[data-result][data-credential-code="${code}"] [data-result-headline]`)
        .innerText()
    ).trim();
  const plain = await headline("INTL_OFFSEC_OSCP");
  const plus = await headline("INTL_OFFSEC_OSCP_PLUS");
  expect(plain).not.toBe(plus);
  await expect(
    page.locator('[data-result][data-credential-code="INTL_OFFSEC_OSCP"] [data-result-byline]'),
  ).toContainText("OffSec · International certification");
  await shot(page, "20-researched-results");

  await chooseCredential(page, "INTL_OFFSEC_OSCP", { search: "oscp" });
  await page.getByLabel("Credential identifier (optional)").fill(`OSCP-${RUN}`);
  // No dates: the catalogue does not say this certification never expires, and neither do we.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const id = page.url().match(/claim\/([0-9a-f-]{36})/)![1];
  const row = sql(
    `select credential_code || '|' || coalesce(jurisdiction_code,'<null>') || '|' || assertion_level || '|' || coalesce(claimed_issuer_name,'') || '|' || coalesce(valid_until::text,'<null>') || '|' || coalesce((select no_expiry::text from public.sp_credential_details d where d.claim_id = c.id),'<null>')
       from public.sp_claims c where c.id = '${id}'`,
  );
  const [code, jurisdiction, assertion, issuer, until, noExpiry] = row.split("|");
  expect(code).toBe("INTL_OFFSEC_OSCP");
  expect(jurisdiction).toBe("<null>");
  expect(assertion).not.toBe("verified"); // approval of the definition is not verification of the holder
  expect(issuer).toBe("OffSec");
  expect(until).toBe("<null>");
  expect(["<null>", "false"]).toContain(noExpiry);
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/No expiry|Utan utgångsdatum/);
  await shot(page, "21-researched-saved-after-reload");
  await page.goto(`${BASE}/passport`);
  await expect(page.locator("[data-credential-wallet]")).toContainText("OSCP", { timeout: 60_000 });
});

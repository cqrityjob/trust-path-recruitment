// The employer journey, connected, in a real browser (2026-10-17):
//
//   1 a new employer registers the company through /signup → pending
//   2 a platform administrator approves it in the admin UI → active
//   3 the owner writes the job (with the requirement "Ordningsvaktsförordnande")
//     and publishes it → published
//   4 the owner confirms the requirement profile, binds the requirement to the
//     Passport catalogue (OV) and finds Bo -- never Petra
//   5 the owner sends Bo a contact request
//   6 Bo reads it, accepts, and applies with his CV and his Passport
//   7 the application is in the employer's recruitment case
//
// Nothing the walk is about is seeded: the organisation, membership, job,
// requirement, requirement profile and talent criteria are all made here,
// through the product's own pages. The database is only READ, to assert.
// The seeded people (scripts/fixtures/employer-journey-fixture.sql) are the
// candidates, a Passport reviewer and the administrator.
//
// Stack: the real CLI stack of scripts/employer-journey-real-ci-run.mjs
// (GoTrue with open sign-up and no confirmation mail, Storage, PostgREST,
// Postgres 17; no Edge runtime). It needs a fresh stack every run: the
// employer's address and company name are fixed so that a scenario re-run
// after a failure reads the same state from the database.
//
// Run (the runner does this): E2E_LOCAL_STACK=1 EJ_REAL_STACK=1 \
//   E2E_BASE_URL=http://127.0.0.1:3160 E2E_SUPABASE_URL=http://127.0.0.1:55890 \
//   E2E_DB_URL=postgresql://...@127.0.0.1:55891/postgres E2E_SUPABASE_ANON_KEY=... \
//   bunx playwright test e2e/employer-journey-local.spec.ts --project=chromium

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1" && process.env.EJ_REAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const DB = process.env.E2E_DB_URL ?? "";
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 and EJ_REAL_STACK=1 to run the employer journey.");
test.skip(
  !LOOPBACK.test(BASE) ||
    !LOOPBACK.test(API) ||
    !/@(127\.0\.0\.1|localhost)[:/]/.test(DB) ||
    ANON === "",
  "This spec registers an employer and writes; it runs against loopback only.",
);
// Ordered (one worker) but NOT serial: every scenario reads what it needs
// from the database, so a failure is reported where it happens and the
// scenarios after it still run and say what they can.
test.describe.configure({ mode: "default", timeout: 240_000 });

const PASSWORD = "LocalJourney!2026";
const SHOTS = path.resolve(process.env.EJ_EVIDENCE_DIR ?? "test-results/employer-journey");
const OWNER = "ej-owner@local.test";
const OWNER_NAME = "Olle Nyföretagare";
const COMPANY = "EJ Nyföretag Bevakning AB";
const ADMIN = "ej-admin@local.test";
const B = "ej-cand-b@local.test";
const B_ID = "7e000000-0000-4000-8000-0000000000b1";
const C_ID = "7e000000-0000-4000-8000-0000000000c1";
const JOB_TITLE = "Ordningsvakt Stockholm – resande team";
const REQUIREMENT = "Ordningsvaktsförordnande";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function sql(text: string): string {
  return execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
    encoding: "utf8",
  }).trim();
}

/** The organisation the new owner registered, as the database holds it. */
function employer(): { id: string; slug: string; status: string } {
  const [id = "", slug = "", status = ""] = sql(
    `select e.id || '|' || e.slug || '|' || e.status from employers e
       join employer_memberships m on m.employer_id = e.id and m.role = 'owner'
       join auth.users u on u.id = m.user_id
      where lower(u.email) = '${OWNER}'`,
  ).split("|");
  return { id, slug, status };
}

/** The job the owner wrote, as the database holds it. */
function job(): { id: string; slug: string; status: string } {
  const [id = "", slug = "", status = ""] = sql(
    `select j.id || '|' || coalesce(j.slug, '') || '|' || j.status from jobs j
      where j.employer_id = '${employer().id}' and j.title_sv = '${JOB_TITLE}'
      order by j.created_at desc limit 1`,
  ).split("|");
  return { id, slug, status };
}

const jobPath = () => `/employer/${employer().slug}/jobs/${job().id}`;

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function signIn(browser: Browser, email: string, redirect: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  return page;
}

/** A date input value `days` from today. */
const daysAhead = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("1 · a new employer registers the company through /signup and waits as pending", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  // The employer entrance's own link: /signup carrying the employer destination.
  await page.goto(`${BASE}/signup?redirect=${encodeURIComponent("/employer")}`);
  await page.waitForSelector('input[name="email"]', { timeout: 90_000 });
  // "Register company": set explicitly, whatever the entrance pre-selected.
  await page.getByRole("checkbox", { name: /Jag skapar kontot för en organisation/ }).check();
  await page.locator('input[name="name"]').fill(OWNER_NAME);
  await page.locator('input[name="email"]').fill(OWNER);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[name="organization"]').fill(COMPANY);
  await page.locator('input[name="country"]').fill("Sverige");
  await page.getByTestId("signup-terms").check();
  await shot(page, "1-signup-company-sv-1440");
  await page.getByRole("button", { name: /^(skapa konto|create account)$/i }).click();

  // Sign-up returns a session on this stack: straight to the waiting page.
  await expect(
    page.getByRole("heading", { name: /företagskonto granskas|company account under review/i }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(/\/employer\/pending/);
  await expect(page.locator("body")).toContainText(COMPANY);
  await shot(page, "1-pending-sv-1440");

  await expect.poll(() => employer().status, { timeout: 30_000 }).toBe("pending");
  expect(
    sql(
      `select count(*) from employer_memberships m join auth.users u on u.id = m.user_id
        where lower(u.email) = '${OWNER}'`,
    ),
  ).toBe("1");
  await context.close();
});

test("2 · a platform administrator approves the organisation in the admin UI", async ({
  browser,
}) => {
  const { id } = employer();
  expect(id, "scenario 1 registered the organisation").not.toBe("");
  const page = await signIn(browser, ADMIN, `/admin/employers/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: COMPANY })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "Godkänn", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Godkänn den här arbetsgivaren?");
  await dialog.getByRole("button", { name: "Bekräfta", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Beslutet har registrerats." }),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, "2-approved-sv-1440");
  await expect.poll(() => employer().status, { timeout: 30_000 }).toBe("active");
  expect(
    sql(
      `select count(*) from employer_moderation_events where employer_id = '${id}' and action = 'approved' and new_status = 'active'`,
    ),
  ).toBe("1");
  await page.context().close();
});

test("3 · the owner writes the job with the OV requirement and publishes it", async ({
  browser,
}) => {
  const { slug, status } = employer();
  expect(status, "scenario 2 approved the organisation").toBe("active");
  const page = await signIn(browser, OWNER, `/employer/${slug}/jobs/new`);
  const next = () => page.getByRole("button", { name: "Nästa", exact: true }).click();

  // 1 Jobbet
  await expect(page.locator("#job-title")).toBeVisible({ timeout: 90_000 });
  await page.locator("#job-title").fill(JOB_TITLE);
  await page.getByRole("radio", { name: "På plats", exact: true }).check();
  await page.locator("#job-city").fill("Stockholm");
  await page.locator("#job-employment-type").selectOption("full_time");
  await page.locator("#job-family").selectOption("corporate_security");
  await next();
  // 2 Krav: one mandatory requirement, the one Bo's Passport answers.
  await page.getByRole("button", { name: "Lägg till krav", exact: true }).click();
  await page.getByLabel("På svenska", { exact: true }).fill(REQUIREMENT);
  await next();
  // 3 Beskrivning
  await page
    .locator("#job-description")
    .fill("Syntetisk annons: ordningsvakt i ett resande team i Stockholm, kvällar och helger.");
  await next();
  // 4 Ansökan: through CQrityjob, shown for thirty days.
  await page.getByRole("radio", { name: /Ansökan via CQrityjob/ }).check();
  await page.locator("#job-expires").fill(daysAhead(30));
  await shot(page, "3-job-form-application-sv-1440");
  await page.getByRole("button", { name: "Spara utkast", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\/edit/, { timeout: 60_000 });

  const draft = job();
  expect(draft.status).toBe("draft");
  expect(
    sql(
      `select count(*) from recruitment_requirements where job_id = '${draft.id}' and kind = 'mandatory' and label_sv = '${REQUIREMENT}'`,
    ),
  ).toBe("1");

  // Publish from the recruitment case's publishing step.
  await page.goto(`${BASE}/employer/${slug}/jobs/${draft.id}?step=publishing`);
  const publish = page.getByRole("button", { name: "Publicera annonsen", exact: true });
  await expect(publish).toBeEnabled({ timeout: 90_000 });
  await publish.click();
  await expect.poll(() => job().status, { timeout: 30_000 }).toBe("published");
  expect(job().slug).not.toBe("");
  await shot(page, "3-published-sv-1440");
  await page.context().close();
});

test("4 · the owner confirms the requirement profile, binds OV to the catalogue and finds Bo, never Petra", async ({
  browser,
}) => {
  expect(job().status, "scenario 3 published the job").toBe("published");
  const page = await signIn(browser, OWNER, `${jobPath()}?step=requirements`);

  // The requirement profile, version 1, through its own form.
  const profile = page.locator("[data-testid='requirement-profile']");
  await expect(profile).toBeVisible({ timeout: 90_000 });
  const rules = profile.locator("fieldset[data-requirement-id]");
  await expect(rules).toHaveCount(1);
  await rules.first().getByLabel("Inskickat CV / dokument").check();
  await rules
    .first()
    .getByLabel("Regel och kontrollinstruktion (svenska)")
    .fill("Kontrollera förordnandet och dess giltighet mot underlaget.");
  await profile.locator("[data-testid='profile-confirm-ack']").check();
  await profile.getByRole("button", { name: "Fastställ ny kravprofilversion" }).click();
  await expect(page.locator("[data-testid='requirement-profile']")).toContainText(
    "Fastställd version 1",
    { timeout: 60_000 },
  );

  // The talent criteria: the requirement bound to the catalogue's OV.
  const panel = page.locator("[data-talent-criteria]");
  const row = panel.locator("[data-criterion]").filter({ hasText: REQUIREMENT });
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  await row.getByLabel("Merit i katalogen").check();
  await row.getByPlaceholder("Sök i katalogen").fill("Ordningsvakt");
  await row
    .getByRole("button", { name: /Ordningsvaktsförordnande|Public Order Guard/ })
    .first()
    .click();
  await row.getByLabel(/^Land/).selectOption("SE");
  await panel.locator("[data-confirm-criteria]").click();
  await expect(panel).toContainText("Matchningsvillkoren är bekräftade", { timeout: 30_000 });
  await expect(panel.locator("[data-criteria-in-use]")).toBeVisible();
  await shot(page, "4-criteria-confirmed-sv-1440");

  // The search, opened from the panel.
  await panel.getByRole("link", { name: "Hitta kandidater" }).click();
  await expect(page).toHaveURL(/\/talent/, { timeout: 30_000 });
  await expect(page.locator("[data-talent-total]")).toHaveAttribute("data-talent-total", "1", {
    timeout: 60_000,
  });
  const results = page.locator("[data-talent-result]");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText("Ordningsvaktsförordnande (OV)");
  await expect(results.first()).toContainText("Granskad, dokumenterad uppgift");
  // Anonymous until he accepts; the private person neither shown nor counted.
  await expect(page.locator("main")).not.toContainText("Bo Kandidat");
  await expect(page.locator("main")).not.toContainText("Petra");
  expect(sql(`select count(*) from sp_talent_profiles where holder_user_id = '${C_ID}'`)).toBe("0");
  await shot(page, "4-talent-results-sv-1440");
  await page.context().close();
});

test("5 · the owner sends Bo a contact request about the job", async ({ browser }) => {
  const { id: jobId } = job();
  const page = await signIn(browser, OWNER, `${jobPath()}/talent`);
  const result = page.locator("[data-talent-result]").first();
  await expect(result).toBeVisible({ timeout: 90_000 });
  await result.locator("[data-contact-open]").click();
  const context = page.locator("[data-contact-context]");
  await expect(context).toContainText(COMPANY);
  await expect(context).toContainText(JOB_TITLE);
  await page
    .getByLabel("Meddelande")
    .fill("Hej! Vi söker ordningsvakter till ett resande team i Stockholm och din profil passar.");
  await page.locator("[data-contact-send]").click();
  await expect(page.getByText("Förfrågan är skickad.")).toBeVisible({ timeout: 30_000 });
  await shot(page, "5-contact-sent-sv-1440");
  expect(
    sql(
      `select status from rec_talent_contact_requests where holder_user_id = '${B_ID}' and job_id = '${jobId}'`,
    ),
  ).toBe("pending");
  await page.context().close();
});

test("6 · Bo reads the request, accepts it and applies with his CV and his Passport", async ({
  browser,
}) => {
  const { id: jobId, slug: jobSlug } = job();
  const page = await signIn(browser, B, "/passport/discoverability");
  const request = page.locator('[data-contact-request="pending"]');
  await expect(request).toContainText(COMPANY, { timeout: 90_000 });
  await expect(request).toContainText(JOB_TITLE);
  await request.getByRole("button", { name: "Acceptera och dela mitt namn" }).click();
  const accepted = page.locator('[data-contact-request="accepted"]');
  await expect(accepted).toBeVisible({ timeout: 30_000 });
  expect(
    sql(
      `select status from rec_talent_contact_requests where holder_user_id = '${B_ID}' and job_id = '${jobId}'`,
    ),
  ).toBe("accepted");

  await accepted.getByRole("link", { name: "Läs annonsen och sök tjänsten" }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobSlug}`), { timeout: 30_000 });
  await page
    .getByRole("button", { name: /^(Sök jobbet|Apply)$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.setInputFiles("#apply-cv", {
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  // His Passport goes with the application because he says so -- set
  // explicitly, whether the dialog starts ticked or not.
  const passport = dialog.getByRole("checkbox", { name: /Security Passport/ });
  await passport.check();
  await expect(passport).toBeChecked();
  await dialog
    .getByText("Jag samtycker till att min ansökan och mitt CV delas med arbetsgivaren.")
    .click();
  await shot(page, "6-apply-sv-1440");
  await dialog.getByRole("button", { name: "Skicka ansökan", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Ansökan skickad", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog).toContainText("Security Passport skickades med ansökan.");
  await expect
    .poll(
      () =>
        sql(
          `select count(*) from job_applications where applicant_user_id = '${B_ID}' and job_id = '${jobId}'`,
        ),
      { timeout: 60_000 },
    )
    .toBe("1");
  expect(
    sql(
      `select application_id is not null from rec_talent_contact_requests where holder_user_id = '${B_ID}' and job_id = '${jobId}'`,
    ),
  ).toBe("t");
  await shot(page, "6-applied-sv-1440");
  await page.context().close();
});

test("7 · the employer sees Bo's application in the recruitment case", async ({ browser }) => {
  const { id: jobId } = job();
  const applicationId = sql(
    `select id from job_applications where applicant_user_id = '${B_ID}' and job_id = '${jobId}'`,
  );
  expect(applicationId, "scenario 6 created the application").toMatch(/^[0-9a-f-]{36}$/);
  const page = await signIn(browser, OWNER, `${jobPath()}?step=applications`);
  const row = page
    .getByTestId("candidate-table")
    .locator(`[data-application-id="${applicationId}"]`)
    .first();
  await expect(row).toBeVisible({ timeout: 90_000 });
  await expect(row).toContainText("Bo Kandidat");
  await shot(page, "7-case-applications-sv-1440");
  await row
    .getByRole("link", { name: /Bo Kandidat/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}`), { timeout: 30_000 });
  await expect(page.getByText("Bo Kandidat").first()).toBeVisible({ timeout: 60_000 });
  await page.context().close();
});

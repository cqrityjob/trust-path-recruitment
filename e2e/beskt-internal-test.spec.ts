/**
 * BESKT — the owner's internal test activation, walked end to end.
 *
 * Runs against the local test environment built by
 *   scripts/local-stack/test-env.sh
 * WITHOUT the synthetic import: everything the owner does happens through
 * the product, exactly as it will in production.
 *
 *   1. the platform administrator gives themself the editor role under
 *      Innehållsroller — a logged, reasoned change, not a database edit;
 *   2. they install BESKT v0.1 with their own documented lawful basis;
 *      the validator finds nothing blocking and NOTHING is reviewed;
 *   3. on the version's Behörigheter tab they record the test activation
 *      for one organisation — the method stays a draft;
 *   4. the recruiter sees "BESKT – intern testversion" in Testbibliotek and
 *      starts it with "Starta test" on an existing application; another
 *      organisation sees nothing;
 *   5. the candidate prepares and submits;
 *   6. the recruiter links the preparation to a case under Intervjuer, sees
 *      the test banner in BESKT, documents, locks and signs the report.
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the routed walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The routed walk runs only against loopback — never a shared or hosted backend.",
);
test.describe.configure({ mode: "serial", timeout: 300_000 });

const OUT = process.env.BCP_ITA_EVIDENCE_DIR ?? "artifacts/beskt-internal-test/live";
mkdirSync(OUT, { recursive: true });
const PASSWORD = "LocalJourney!2026";
const ADMIN = "beskt-journey-admin@local.test";
const RECRUITER = "beskt-recruiter@local.test";
const CANDIDATE = "beskt-candidate@local.test";
const OUTSIDER = "beskt-outsider@local.test";
const EMPLOYER = "beskt-journey-ab";
const RIVAL = "beskt-rival-ab";
const APPLICATION = "b4000000-0000-4000-8000-00000000aa01";
const APPLICATION_PATH = `/employer/${EMPLOYER}/applications/${APPLICATION}`;
const LABEL = "BESKT – intern testversion";
const FACT = "TESTDATA kandidaten beskrev hur misstaget rapporterades samma dag";

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function saveAndReopen(page: Page): Promise<void> {
  await page.getByTestId("beskt-save").click();
  const list = page.getByTestId("beskt-my-preparations");
  await expect(list).toBeVisible({ timeout: 60_000 });
  await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${OUT}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}

async function expectFitsViewport(page: Page): Promise<void> {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw, `the page scrolls sideways at ${iw}px`).toBeLessThanOrEqual(iw + 1);
}

test.describe("BESKT internal test — owner activation → Starta test → report", () => {
  test("1 · the administrator takes the editor role through Innehållsroller", async ({ page }) => {
    await signIn(page, ADMIN, "/admin/beskt-methods");
    const roles = page.getByTestId("beskt-content-roles");
    await expect(roles).toBeVisible({ timeout: 60_000 });
    await roles.locator("#beskt-role-email").fill(ADMIN);
    await roles.locator("#beskt-role-role").selectOption("editor");
    await roles.locator("#beskt-role-reason").fill("Installera BESKT v0.1 för intern test");
    await roles.getByTestId("beskt-content-role-submit").click();
    await expect(roles.getByTestId("beskt-content-role-done")).toBeVisible({ timeout: 60_000 });
    await expectFitsViewport(page);
    await shot(page, "1-role-granted");
  });

  test("2 · they install BESKT v0.1 with their own lawful basis; nothing is reviewed", async ({
    page,
  }) => {
    await signIn(page, ADMIN, "/admin/beskt-methods");
    const card = page.getByTestId("beskt-install-v01");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card
      .locator("#beskt-install-lawful")
      .fill("Intern funktionstest med testdata enligt ägarens beslut 2026-09-18");
    await card.getByTestId("beskt-install-v01-submit").click();
    const done = card.getByTestId("beskt-install-v01-done");
    await expect(done).toBeVisible({ timeout: 240_000 });
    await expect(done).toContainText(/Innehållet är installerat och komplett/);
    await shot(page, "2-installed");
    await done.getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/beskt-methods\/[0-9a-f-]{36}/, { timeout: 60_000 });
  });

  test("3 · the test activation is recorded for one organisation; the method stays a draft", async ({
    page,
  }) => {
    await signIn(page, ADMIN, "/admin/beskt-methods");
    await page.getByTestId("beskt-install-v01-existing").getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/beskt-methods\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const url = new URL(page.url());
    await page.goto(`${url.pathname}?tab=access`);
    const panel = page.getByTestId("beskt-test-activations");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel).toContainText(/Det här är inte en granskning/);
    await panel.locator("#beskt-ta-employer").fill(EMPLOYER);
    await panel
      .locator("#beskt-ta-decision")
      .fill("Ägarbeslut 2026-09-18: intern funktionstest med testdata");
    await panel.getByTestId("beskt-test-activation-submit").click();
    await expect(panel).toContainText(/BESKT Journey AB/, { timeout: 60_000 });
    await expect(panel).toContainText(/Aktiv/);
    await expectFitsViewport(page);
    await shot(page, "3-activated");
  });

  test("4 · the recruiter starts it from Testbibliotek; another organisation sees nothing", async ({
    page,
    browser,
  }) => {
    await signIn(page, RECRUITER, `/employer/${EMPLOYER}/assessments/library`);
    const row = page
      .getByTestId("beskt-method-row")
      .filter({ hasText: /BESKT – rekryteringsstöd/ });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await expect(row.getByTestId("beskt-internal-test-label")).toHaveText(LABEL);
    await expectFitsViewport(page);
    await shot(page, "4-library");
    await row.getByTestId("beskt-start-test").click();
    const dialog = page.getByTestId("beskt-start-test-dialog");
    await expect(dialog).toBeVisible();
    const app = dialog.locator("#beskt-start-test-application");
    await expect(app.locator(`option[value="${APPLICATION}"]`)).toHaveCount(1, {
      timeout: 60_000,
    });
    await app.selectOption(APPLICATION);
    await shot(page, "4-start-dialog");
    await dialog.getByTestId("beskt-start-test-submit").click();
    await expect(page).toHaveURL(new RegExp(`/applications/${APPLICATION}`), { timeout: 60_000 });
    await expect(
      page.getByTestId("beskt-application-panel").getByTestId("beskt-readback-state"),
    ).toBeVisible({ timeout: 60_000 });

    const ctx = await browser.newContext();
    const rival = await ctx.newPage();
    await signIn(rival, OUTSIDER, `/employer/${RIVAL}/assessments/library`);
    await expect(rival.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
    await expect(rival.getByTestId("beskt-internal-test-label")).toHaveCount(0);
    await expect(rival.getByText(/BESKT – rekryteringsstöd/)).toHaveCount(0);
    await ctx.close();
  });

  test("5 · the candidate prepares and submits", async ({ page }) => {
    await signIn(page, CANDIDATE, "/my-career/applications");
    const list = page.getByTestId("beskt-my-preparations");
    await expect(list).toBeVisible({ timeout: 60_000 });
    await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();

    await expect(page.getByTestId("beskt-notice")).toBeVisible({ timeout: 60_000 });
    await page.getByLabel(/jag har läst informationen/i).check();
    await page.getByTestId("beskt-acknowledge").click();

    await expect(page.getByTestId("beskt-item-t01_forstaelse")).toBeVisible({ timeout: 60_000 });
    await page.locator("#beskt-input-t01_forstaelse").check();
    await page
      .locator("#beskt-input-q01_sakerhetsregel")
      .fill("TESTDATA jag följde tvåpersonsregeln vid larmkvittering.");
    await page.locator("#beskt-input-q02_misstag-ja").click();
    await page.locator("#beskt-input-q03_kringga_regel-nej").click();
    await saveAndReopen(page);

    await expect(page.getByTestId("beskt-item-q02_misstag__aktualitet")).toBeVisible({
      timeout: 60_000,
    });
    await page.locator("#beskt-input-q02_misstag__aktualitet-manader_7_24").click();
    await page.locator("#beskt-input-q02_misstag__beskrivning").fill(FACT);
    await page.getByTestId("beskt-item-q05_konflikt_atgard-oral").click();
    await page.getByTestId("beskt-item-q06_olost_oforratt-skip").click();
    await saveAndReopen(page);
    await expect(page.locator("#beskt-input-q02_misstag__beskrivning")).toHaveValue(FACT, {
      timeout: 60_000,
    });
    await expectFitsViewport(page);

    for (const key of [
      "t02_tidigare_ansvar",
      "q02_misstag__monster",
      "q02_misstag__nulage",
      "q02_misstag__forandring",
      "q02_misstag__stod",
      "q02_misstag__verifiering",
      "q04_rollens_ansvar",
      "q07_ilska_regelbrott",
      "q08_motgang",
      "s1_akut_order",
      "s2_lana_inloggning",
      "s3_eget_misstag",
      "s4_litet_undantag",
      "s5_ej_godkand_ai",
      "s6_distansarbete",
    ]) {
      await page.getByTestId(`beskt-item-${key}-skip`).click();
    }
    await saveAndReopen(page);
    await page.getByTestId("beskt-to-review").click();
    await expect(page.getByTestId("beskt-review-list")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("beskt-submit").click();
    await expect(page.getByTestId("beskt-submitted")).toBeVisible({ timeout: 60_000 });
    await shot(page, "5-submitted");
  });

  test("6 · Intervjuer → BESKT (test banner) → documented, locked and signed report", async ({
    page,
  }) => {
    await signIn(page, RECRUITER, APPLICATION_PATH);
    const panel = page.getByTestId("beskt-application-panel");
    await expect(panel.getByTestId("beskt-readback-answers")).toContainText(FACT, {
      timeout: 60_000,
    });
    const link = page.getByTestId("beskt-case-link");
    await expect(link.getByTestId("beskt-case-link-none")).toBeVisible({ timeout: 30_000 });
    await link.getByRole("link", { name: /Skapa ett intervjufall för ansökan/ }).click();
    const pack = page.locator("#ii-pack");
    await expect(page.locator("#ii-title")).not.toHaveValue("", { timeout: 60_000 });
    const value = await pack
      .locator("option")
      .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).find((v) => v !== ""));
    await pack.selectOption(value!);
    await page.getByRole("button", { name: /^Planera intervjun$/ }).click();
    await expect(page).toHaveURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare/, {
      timeout: 60_000,
    });

    await page.goto(APPLICATION_PATH);
    await link.getByTestId("beskt-case-link-submit").first().click();
    await expect(link.getByTestId("beskt-case-link-linked")).toBeVisible({ timeout: 60_000 });
    await link.getByRole("link", { name: /Öppna BESKT i intervjufallet/ }).click();
    await expect(page).toHaveURL(/\/beskt$/, { timeout: 60_000 });
    await expect(page.getByTestId("beskt-internal-test-banner").first()).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: /Öppna samtalsstödet/ }).click();
    await expect(page.getByTestId("beskt-stage-prompts")).toContainText("Vad hände konkret?", {
      timeout: 60_000,
    });
    const theme = page.getByTestId("beskt-theme-q05_konflikt_atgard");
    await theme.getByRole("button", { name: /Dokumentera temat/ }).click();
    await page
      .getByLabel(/^Observerbart faktum$/i)
      .first()
      .fill("TESTDATA konflikten avslutades med en dokumenterad överenskommelse");
    await theme.getByRole("button", { name: /Spara dokumentation/ }).click();
    await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
    await shot(page, "6-beskt-in-case");

    const base = new URL(page.url()).pathname;
    await page.goto(`${base}?view=position`);
    await page.getByRole("button", { name: /Lås min ståndpunkt/ }).click();
    await page.getByRole("button", { name: /Ja, lås min ståndpunkt/ }).click();
    await expect(page.getByTestId("beskt-position")).toContainText(/Din ståndpunkt är låst/, {
      timeout: 60_000,
    });

    await page.goto(`${base}?view=report`);
    const doc = page.getByTestId("beskt-report-document");
    await expect(doc).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("beskt-report-finalise").click();
    await expect(page.getByTestId("beskt-report-versions")).toContainText(/Version 1/, {
      timeout: 60_000,
    });
    await expect(doc).toContainText(/Signerad version/);
    await expectFitsViewport(page);
    await shot(page, "6-signed");
  });
});

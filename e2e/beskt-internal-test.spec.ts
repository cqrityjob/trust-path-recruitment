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
 *   4. the recruiter sees "BESKT – intern testversion" in Rekryteringsstöd and
 *      starts it with "Starta test" on an existing application; another
 *      organisation sees nothing;
 *   5. the candidate prepares and submits;
 *   6. the recruiter links the preparation to a case under Intervjuer, sees
 *      the test banner in BESKT, documents, locks and signs the report.
 *
 * Only the product's own entry points are typed (/admin, /employer/<org>,
 * /my-career); every step below them is CLICKED, so nothing depends on a
 * hand-built address. The one typed deep link is the hostile one: another
 * organisation trying this organisation's library.
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ifShown, openThemeArea, recordStance, walkSteps } from "./support/beskt-walk";

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
const LAWFUL_BASIS = "Intern funktionstest med testdata enligt ägarens beslut 2026-09-18";
const RECRUITER_NAME = "Rekryterare Journey";
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

/** Click a navigation link, opening the mobile menu first when it is hidden. */
async function navTo(page: Page, name: RegExp): Promise<void> {
  const link = page.getByRole("link", { name }).filter({ visible: true });
  const menu = page
    .getByRole("button", { name: /^Öppna meny$|^Open menu$/ })
    .filter({ visible: true });
  await expect(link.or(menu).first()).toBeVisible({ timeout: 60_000 });
  if ((await link.count()) === 0) {
    await menu.first().click();
    // The drawer slides in; wait for it to settle before clicking inside it.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400);
  }
  await link.first().click();
}

async function openAdminMethods(page: Page): Promise<void> {
  await signIn(page, ADMIN, "/admin");
  await navTo(page, /^BESKT-metoder$/);
  await expect(page).toHaveURL(/\/admin\/beskt-methods$/, { timeout: 60_000 });
}

async function openVersionAccess(page: Page): Promise<void> {
  await openAdminMethods(page);
  await page.getByTestId("beskt-install-v01-existing").getByRole("link").click();
  await expect(page).toHaveURL(/\/admin\/beskt-methods\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await page.getByRole("link", { name: /^Behörigheter$/ }).click();
  await expect(page.getByTestId("beskt-test-activations")).toBeVisible({ timeout: 60_000 });
}

async function openLibrary(page: Page, email: string, employer: string): Promise<void> {
  await signIn(page, email, `/employer/${employer}`);
  await navTo(page, /^Tester & bedömningar$|^Tests & assessments$/);
  await page
    .getByRole("link", { name: /^Rekryteringsstöd$|^Recruitment support$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/assessments\/library$/, { timeout: 60_000 });
  // The library's order, clicked: BESKT → operational role → general environment.
  await page.getByTestId("lib-method-beskt-choose").click();
  await page.getByTestId("lib-group-operational").check();
  await page.getByTestId("lib-env-general").check();
  await expect(page.getByTestId("lib-setup")).toBeVisible({ timeout: 60_000 });
}

async function openApplication(page: Page): Promise<void> {
  await navTo(page, /^Ansökningar$/);
  await page.locator(`a[href$="/applications/${APPLICATION}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/applications/${APPLICATION}$`), { timeout: 60_000 });
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
    await openAdminMethods(page);
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
    await openAdminMethods(page);
    const card = page.getByTestId("beskt-install-v01");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card.locator("#beskt-install-lawful-rekrytering").fill(LAWFUL_BASIS);
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
    await openVersionAccess(page);
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
    await expect(page.getByText(/Läge:\s*Utkast/).first()).toBeVisible();
    await expectFitsViewport(page);
    await shot(page, "3-activated");
  });

  test("3b · re-running the install duplicates nothing and keeps the activation live", async ({
    page,
  }) => {
    await openAdminMethods(page);
    const card = page.getByTestId("beskt-install-v01");
    await expect(card.getByTestId("beskt-install-v01-existing")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/BESKT – rekryteringsstöd/)).toHaveCount(1);
    await card.locator("#beskt-install-lawful-rekrytering").fill(LAWFUL_BASIS);
    await card.getByTestId("beskt-install-v01-submit").click();
    await expect(card.getByTestId("beskt-install-v01-done")).toContainText(
      /Innehållet är installerat och komplett/,
      { timeout: 240_000 },
    );
    await expect(page.getByText(/BESKT – rekryteringsstöd/)).toHaveCount(1);
    await card.getByTestId("beskt-install-v01-done").getByRole("link").click();
    const panel = page.getByTestId("beskt-test-activations");
    await expect(panel).toContainText(/BESKT Journey AB · Aktiv/, { timeout: 60_000 });
  });

  test("4 · the recruiter starts it from Rekryteringsstöd; another organisation sees nothing", async ({
    page,
    browser,
  }) => {
    await openLibrary(page, RECRUITER, EMPLOYER);
    // The installed version says it runs under the organisation's recorded
    // activation, as an internal test version -- never as reviewed.
    const row = page
      .getByTestId("lib-setup-status")
      .locator("li")
      .filter({ hasText: /BESKT – rekryteringsstöd/ });
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await expect(row).toContainText(/Intern testversion enligt organisationens aktivering/);
    await expectFitsViewport(page);
    await shot(page, "4-library");
    await page.getByTestId("lib-start-beskt").click();
    const dialog = page.getByTestId("beskt-start-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("beskt-purpose-recruitment_support").check();
    const version = dialog.locator("#beskt-start-version");
    const installed = await version
      .locator("option")
      .evaluateAll(
        (o) =>
          (o as HTMLOptionElement[]).find((x) => /BESKT – rekryteringsstöd/.test(x.text))?.value,
      );
    await version.selectOption(installed!);
    const app = dialog.locator("#beskt-start-application");
    await expect(app.locator(`option[value="${APPLICATION}"]`)).toHaveCount(1, {
      timeout: 60_000,
    });
    await app.selectOption(APPLICATION);
    await dialog.locator("#beskt-start-interviewer").selectOption({ label: RECRUITER_NAME });
    await shot(page, "4-start-dialog");
    await dialog.getByTestId("beskt-start-dialog-submit").click();
    await expect(page.getByTestId("beskt-assignment")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("beskt-readback-state")).toBeVisible({ timeout: 60_000 });

    const ctx = await browser.newContext();
    const rival = await ctx.newPage();
    // No activation of its own: this organisation's activated version is
    // not in the rival's offer, and none of its assignments are listed.
    await openLibrary(rival, OUTSIDER, RIVAL);
    await expect(
      rival
        .getByTestId("lib-setup-status")
        .locator("li")
        .filter({ hasText: /BESKT – rekryteringsstöd/ }),
    ).toHaveCount(0);
    await expect(rival.getByTestId("beskt-assignment-row")).toHaveCount(0);
    await expect(rival.getByText(/BESKT – rekryteringsstöd/)).toHaveCount(0);
    await shot(rival, "4-rival-library");
    // The hostile deep link: this organisation's library, typed by an outsider.
    await rival.goto(`/employer/${EMPLOYER}/assessments/library`);
    // A positive refusal, not merely an absence on a page still loading.
    await expect(rival.getByText(/Åtkomst ej tillgänglig/)).toBeVisible({ timeout: 60_000 });
    await expect(rival.getByTestId("lib-start-beskt")).toHaveCount(0, { timeout: 30_000 });
    await expect(rival.getByText(/BESKT – rekryteringsstöd/)).toHaveCount(0);
    await shot(rival, "4-rival-deep-link");
    await ctx.close();
  });

  test("5 · the candidate prepares and submits", async ({ page }) => {
    await signIn(page, CANDIDATE, "/my-career");
    await page
      .locator('a[href="/my-career/applications"]')
      .filter({ visible: true })
      .first()
      .click();
    const list = page.getByTestId("beskt-my-preparations");
    await expect(list).toBeVisible({ timeout: 60_000 });
    await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();

    await expect(page.getByTestId("beskt-notice")).toBeVisible({ timeout: 60_000 });
    await page.getByLabel(/jag har läst informationen/i).check();
    await page.getByTestId("beskt-acknowledge").click();

    // One area per step. On each: the answers this walk gives, and a neutral
    // "Vill inte svara" for the rest. q02 = Ja opens its follow-ups on the
    // same step; q05 is taken orally.
    await walkSteps(page, async () => {
      await ifShown(page, "#beskt-input-t01_forstaelse", () =>
        page.locator("#beskt-input-t01_forstaelse").check(),
      );
      await ifShown(page, "#beskt-input-q01_sakerhetsregel", () =>
        page
          .locator("#beskt-input-q01_sakerhetsregel")
          .fill("TESTDATA jag följde tvåpersonsregeln vid larmkvittering."),
      );
      await ifShown(page, "#beskt-input-q02_misstag-ja", () =>
        page.locator("#beskt-input-q02_misstag-ja").click(),
      );
      await ifShown(page, "#beskt-input-q03_kringga_regel-nej", () =>
        page.locator("#beskt-input-q03_kringga_regel-nej").click(),
      );
      await ifShown(page, "#beskt-input-q02_misstag__aktualitet-manader_7_24", () =>
        page.locator("#beskt-input-q02_misstag__aktualitet-manader_7_24").click(),
      );
      await ifShown(page, "#beskt-input-q02_misstag__beskrivning", () =>
        page.locator("#beskt-input-q02_misstag__beskrivning").fill(FACT),
      );
      await ifShown(page, '[data-testid="beskt-item-q05_konflikt_atgard-oral"]', async () => {
        const oral = page.getByTestId("beskt-item-q05_konflikt_atgard-oral");
        if ((await oral.getAttribute("aria-pressed")) !== "true") await oral.click();
      });
      await expectFitsViewport(page);
    });
    // Saved answers survive leaving and coming back.
    await saveAndReopen(page);
    await expect(page.getByTestId("beskt-steps")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("beskt-to-review").click();
    await expect(page.getByTestId("beskt-review-list")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("beskt-submit").click();
    await expect(page.getByTestId("beskt-submitted")).toBeVisible({ timeout: 60_000 });
    await shot(page, "5-submitted");
  });

  test("6 · Intervjuer → BESKT (test banner) → documented, locked and signed report", async ({
    page,
  }) => {
    await signIn(page, RECRUITER, `/employer/${EMPLOYER}`);
    await openApplication(page);
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

    // Back to the application from the case, by the case's own link.
    await page
      .getByRole("link", { name: /^Öppna ansökan$/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/applications/${APPLICATION}$`), { timeout: 60_000 });
    // Started from the preparation, the case arrives linked: one atomic start.
    await expect(link.getByTestId("beskt-case-link-linked")).toBeVisible({ timeout: 60_000 });
    await expect(link.getByTestId("beskt-case-link-submit")).toHaveCount(0);
    await link.getByRole("link", { name: /Öppna BESKT i intervjufallet/ }).click();
    await expect(page).toHaveURL(/\/beskt$/, { timeout: 60_000 });
    await expect(page.getByTestId("beskt-internal-test-banner").first()).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: /Öppna samtalsstödet/ }).click();
    await expect(page.getByTestId("beskt-stage-prompts")).toContainText("Vad hände konkret?", {
      timeout: 60_000,
    });
    const theme = await openThemeArea(page, "q05_konflikt_atgard");
    await theme.getByRole("button", { name: /Dokumentera temat/ }).click();
    await page
      .getByLabel(/^Observerbart faktum$/i)
      .first()
      .fill("TESTDATA konflikten avslutades med en dokumenterad överenskommelse");
    await theme.getByRole("button", { name: /Spara dokumentation/ }).click();
    await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
    await shot(page, "6-beskt-in-case");

    const parts = page.getByRole("navigation", { name: /Delar av BESKT-metodstödet/ });
    await parts.getByRole("link", { name: /^Min ståndpunkt$/ }).click();
    await page.getByRole("button", { name: /Lås min ståndpunkt/ }).click();
    await page.getByRole("button", { name: /Ja, lås min ståndpunkt/ }).click();
    await expect(page.getByTestId("beskt-position")).toContainText(/Din ståndpunkt är låst/, {
      timeout: 60_000,
    });

    await parts.getByRole("link", { name: /^Rapport$/ }).click();
    const doc = page.getByTestId("beskt-report-document");
    await expect(doc).toBeVisible({ timeout: 60_000 });
    await recordStance(page, RECRUITER_NAME);
    await page.getByTestId("beskt-report-finalise").click();
    await expect(page.getByTestId("beskt-report-versions")).toContainText(/Version 1/, {
      timeout: 60_000,
    });
    await expect(doc).toContainText(/Signerad version/);
    await expectFitsViewport(page);
    await shot(page, "6-signed");
  });
});

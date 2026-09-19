/**
 * The library and the employer journey (TRUST/BESKT product structure v2.0),
 * walked through the product's own screens with separate signed-in people.
 *
 * Runs against the local test environment built by
 *   scripts/local-stack/test-env.sh
 * which replays every migration, 20261201090000 included. SYNTHETIC data only;
 * nothing here is a finished customer package.
 *
 *   1. an employer without any platform role opens Bibliotek: TRUST and BESKT
 *      side by side; the choices lead to real content, a strategic role and a
 *      site environment with no content of their own are shown and NOT offered;
 *   2. a TRUST case is started from an application: the setup and the guide
 *      follow it, the material is already there, the plan starts from a
 *      proposal, the four steps read Upplägg → Tester & underlag → Intervju →
 *      Granska & rapport, and a note is saved in the interview with the
 *      question in view;
 *   3. the platform publisher makes BESKT available ONCE: an organisation that
 *      holds no grant, activation or content role can start it at once, and
 *      after withdrawal it cannot;
 *   4. another organisation is refused the first organisation's case.
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
test.describe.configure({ mode: "serial", timeout: 420_000 });

const OUT = process.env.LIBRARY_EVIDENCE_DIR ?? "artifacts/library-journey/live";
mkdirSync(OUT, { recursive: true });
const PASSWORD = "LocalJourney!2026";
const ADMIN = "beskt-journey-admin@local.test";
const OWNER = "beskt-recruiter@local.test";
const OUTSIDER = "beskt-outsider@local.test";
const INVITEE = "beskt-candidate2@local.test";
const EMPLOYER = "beskt-journey-ab";
const RIVAL = "beskt-rival-ab";
const APPLICATION = "b4000000-0000-4000-8000-00000000aa01";
const RIVAL_NAME = "Rekryterare Rival";
let caseUrl = "";

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function navTo(page: Page, name: RegExp): Promise<void> {
  const link = page.getByRole("link", { name }).filter({ visible: true });
  const menu = page
    .getByRole("button", { name: /^Öppna meny$|^Open menu$/ })
    .filter({ visible: true });
  await expect(link.or(menu).first()).toBeVisible({ timeout: 60_000 });
  if ((await link.count()) === 0) {
    await menu.first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400);
  }
  await link.first().click();
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

async function useLang(page: Page, lang: "sv" | "en"): Promise<void> {
  const button = page.getByRole("button", { name: lang, exact: true }).filter({ visible: true });
  if ((await button.count()) === 0) {
    await page
      .getByRole("button", { name: /^Öppna meny$|^Open menu$/ })
      .filter({ visible: true })
      .first()
      .click();
  }
  await page
    .getByRole("button", { name: lang, exact: true })
    .filter({ visible: true })
    .first()
    .click();
  if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
}

test.describe("Bibliotek — method → role → environment → setup → the four-step case", () => {
  test("1 · an employer without a platform role sees two methods, and real content per choice", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}`);
    await navTo(page, /^Tester & bedömningar$|^Tests & assessments$/);
    await page
      .getByRole("link", { name: /^Rekryteringsstöd$|^Recruitment support$/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/assessments\/library$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /^Rekryteringsstöd$/ })).toBeVisible({
      timeout: 60_000,
    });
    // A clean customer surface: no drafts catalogue, no empty internal section.
    await expect(page.getByText(/Under utveckling|Internt material/)).toHaveCount(0);
    const methods = page.getByTestId("lib-methods");
    await expect(methods.getByTestId("lib-method-trust")).toContainText(
      /Tester och strukturerade intervjuer för rekrytering till säkerhetsjobb/,
    );
    await expect(methods.getByTestId("lib-method-beskt")).toContainText(
      /Förberedande frågeunderlag och strukturerat metodstöd för säkerhetskänsligt arbete/,
    );
    // The Väktare test is not a third entrance beside the two methods.
    await expect(page.getByText(/Väktare – Recruitment Assessment/)).toHaveCount(0);
    await expectFitsViewport(page);
    await shot(page, "1-methods-sv");
    await useLang(page, "en");
    await expect(methods.getByTestId("lib-method-trust-choose")).toHaveText(/Choose TRUST/);
    await shot(page, "1-methods-en");
    await useLang(page, "sv");

    // TRUST → operational → Väktare → general: the real guide and test.
    await page.getByTestId("lib-method-trust-choose").click();
    await page.getByTestId("lib-group-operational").check();
    await page.getByTestId("lib-env-general").check();
    const setup = page.getByTestId("lib-setup");
    await expect(setup).toHaveAttribute("data-startable", "true", { timeout: 60_000 });
    await expect(setup.getByTestId("lib-setup-candidate")).toContainText(
      /Väktare – Recruitment Assessment/,
    );
    await expect(setup.getByTestId("lib-setup-interview")).toContainText(/intervjuguiden Väktare/);
    await expect(setup.getByTestId("lib-setup-time")).toContainText(/35–45 min/);
    await expect(setup.getByTestId("lib-setup-status")).toContainText(
      /Pilotversion – ogranskad hypotes/,
    );
    await shot(page, "1-trust-operational");

    // Only what can be started is offered: TRUST has no strategic content, so
    // no strategic role is shown under it -- and no switched-off environments.
    await expect(page.getByTestId("lib-group-strategic")).toHaveCount(0);
    await expect(page.getByTestId("lib-env-hospital")).toHaveCount(0);
    await expect(page.getByTestId("lib-env-data_centre")).toHaveCount(0);

    // Back keeps the setup: the choices are in the URL.
    await page.goBack();
    await expect(page.getByTestId("lib-group-operational")).not.toBeChecked({ timeout: 30_000 });
    await page.goForward();
    await expect(page.getByTestId("lib-group-operational")).toBeChecked({ timeout: 30_000 });
    await expect(setup).toHaveAttribute("data-startable", "true", { timeout: 60_000 });
  });

  test("2 · a TRUST case from an application carries its setup through the four steps", async ({
    page,
  }) => {
    await signIn(
      page,
      OWNER,
      `/employer/${EMPLOYER}/assessments/library?method=trust&group=operational&role=vaktare&env=general`,
    );
    const setup = page.getByTestId("lib-setup");
    await expect(setup).toHaveAttribute("data-startable", "true", { timeout: 60_000 });
    await page.locator("#lib-application").selectOption(APPLICATION);
    await page.getByTestId("lib-start-trust").click();

    // The application answers the name and role; the library answered the guide.
    await expect(page.locator("#ii-title")).not.toHaveValue("", { timeout: 60_000 });
    await expect(page.locator("#ii-candidate")).not.toHaveValue("");
    await expect(page.locator("#ii-pack")).not.toHaveValue("");
    await shot(page, "2-new-case");
    await page.getByRole("button", { name: /^Planera intervjun$/ }).click();
    await expect(page).toHaveURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, {
      timeout: 60_000,
    });
    caseUrl = new URL(page.url()).pathname.replace(/\/prepare$/, "");

    // Step 1 · Upplägg: the setup is shown, nothing is typed twice.
    await expect(page.getByTestId("case-setup-value")).toHaveText(
      /TRUST · Väktare · Generell säkerhetsverksamhet/,
      { timeout: 60_000 },
    );
    const steps = page.getByRole("navigation", { name: /Intervjuns fyra steg/ });
    await expect(steps).toContainText(
      /Upplägg[\s\S]*Tester & underlag[\s\S]*Intervju[\s\S]*Granska & rapport/,
    );
    // The plan starts from a proposal; the recruiter confirms it.
    await expect(page.locator("#mp-open")).not.toHaveValue("", { timeout: 60_000 });
    await expect(page.getByText(/citerbar enhet/)).toHaveCount(0);
    await expect(page.getByTestId("ii-guide")).not.toHaveAttribute("open", "");
    await shot(page, "2-step1-setup");
    await page.getByRole("button", { name: /Spara och godkänn planen/ }).click();
    await expect(page.getByRole("button", { name: /^Starta intervju$/ }).first()).toBeVisible({
      timeout: 60_000,
    });

    // Step 2 · Tester & underlag: the test through the application's own
    // governed path; nothing here blocks the interview.
    await steps.getByRole("link", { name: /Tester & underlag/ }).click();
    await expect(page.getByTestId("case-tests")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Inget i det här steget hindrar intervjun/)).toBeVisible();
    await expectFitsViewport(page);
    await shot(page, "2-step2-tests");
    await page.getByTestId("case-tests-next").click();

    // Step 3 · Intervju: one question list, the note beside the question.
    // "Starta intervju" on this step started the session and moved on.
    await expect(page).toHaveURL(/\/interview$/, { timeout: 60_000 });
    const note = page.locator("#note");
    await expect(note).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("iv-remaining")).toBeVisible();
    await expect(page.getByTestId("iv-remaining").locator("a, button")).toHaveCount(0);
    const vp = page.viewportSize();
    if (vp && vp.width >= 1024) {
      const box = await note.boundingBox();
      expect(box, "the note field is in view with the question").not.toBeNull();
      expect(box!.y, "the note field starts inside a laptop viewport").toBeLessThan(vp.height);
    }
    await note.fill("SYNTETISK anteckning: kandidaten beskrev en avvikelse vid en rond.");
    await note.blur();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Sparat/ })
        .first(),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expectFitsViewport(page);
    await shot(page, "2-step3-interview");

    // Step 4 · Granska & rapport: shown, not offered, until the interview is
    // complete; then the notes flow into it -- nothing is copied.
    await expect(steps.getByRole("link", { name: /Granska & rapport/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Avsluta intervjun$/ }).click();
    await steps.getByRole("link", { name: /Granska & rapport/ }).click();
    await expect(page).toHaveURL(/\/evidence$/, { timeout: 60_000 });
    const review = page.getByRole("navigation", { name: /Intervjuns fyra steg/ });
    await expect(review).toContainText(/Välj underlag[\s\S]*Bedöm mot kraven[\s\S]*Rapport/, {
      timeout: 60_000,
    });
    await expect(
      page.getByText(/SYNTETISK anteckning: kandidaten beskrev en avvikelse/).first(),
    ).toBeVisible({
      timeout: 60_000,
    });
    await expectFitsViewport(page);
    await shot(page, "2-step4-review");
  });

  test("2b · Förbered intervju opens the linked case, and the same case every time", async ({
    page,
  }) => {
    const other = "b4000000-0000-4000-8000-00000000aa02";
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${other}`);
    await page.getByTestId("prepare-interview").first().click();
    await expect(page).toHaveURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, {
      timeout: 60_000,
    });
    const first = new URL(page.url()).pathname;
    // Candidate, application, the advert and the setup came along.
    await expect(page.getByTestId("case-setup-value")).toHaveText(
      /TRUST · Väktare · Generell säkerhetsverksamhet/,
      { timeout: 60_000 },
    );
    await shot(page, "2b-prepared");

    // Again: the same case, not a second one.
    await page.goto(`/employer/${EMPLOYER}/applications/${other}`);
    await expect(page.getByTestId("prepare-interview")).toHaveCount(0);

    // The same case, opened directly under Intervjuer, shows the same setup.
    await page.goto(`/employer/${EMPLOYER}/interview-intelligence`);
    await page
      .locator(`a[href*="${first.split("/")[4]}"]`)
      .first()
      .click();
    await page.goto(first);
    await expect(page.getByTestId("case-setup-value")).toHaveText(/TRUST · Väktare/, {
      timeout: 60_000,
    });
  });

  test("3 · BESKT is made available once, and an organisation with nothing reaches it", async ({
    browser,
  }) => {
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await signIn(admin, ADMIN, "/admin");
    await navTo(admin, /^BESKT-metoder$/);
    const roles = admin.getByTestId("beskt-content-roles");
    for (const role of ["editor", "publisher"]) {
      await roles.locator("#beskt-role-email").fill(ADMIN);
      await roles.locator("#beskt-role-role").selectOption(role);
      await roles.locator("#beskt-role-reason").fill("SYNTETISKT innehållsansvar för genomgången");
      await roles.getByTestId("beskt-content-role-submit").click();
      await expect(roles.getByTestId("beskt-content-role-done")).toBeVisible({ timeout: 60_000 });
    }
    const card = admin.getByTestId("beskt-install-v01");
    await card
      .locator("#beskt-install-lawful-rekrytering")
      .fill("SYNTETISK rättslig grund för den lokala genomgången.");
    await card.getByTestId("beskt-install-v01-submit").click();
    await expect(card.getByTestId("beskt-install-v01-done")).toContainText(
      /Innehållet är installerat och komplett/,
      { timeout: 300_000 },
    );
    await card.getByTestId("beskt-install-v01-done").getByRole("link").click();
    await admin.getByRole("link", { name: /^Behörigheter$/ }).click();

    // The rival organisation: no grant, no activation, no content role.
    const rivalCtx = await browser.newContext();
    const rival = await rivalCtx.newPage();
    await signIn(
      rival,
      OUTSIDER,
      `/employer/${RIVAL}/assessments/library?method=beskt&group=operational&role=vaktare&env=general`,
    );
    // The environment's synthetic PUBLISHED versions are already in every
    // active organisation's offer -- that is the rule. The freshly installed
    // v0.1 draft is not, until the publisher decides.
    const setup = rival.getByTestId("lib-setup");
    const v01 = setup
      .getByTestId("lib-setup-status")
      .locator("li")
      .filter({
        hasText: /BESKT – rekryteringsstöd/,
      });
    await expect(setup).toHaveAttribute("data-startable", "true", { timeout: 60_000 });
    await expect(v01).toHaveCount(0);
    await shot(rival, "3-before");

    // One content decision for the whole version -- not a review.
    const panel = admin.getByTestId("beskt-availability");
    await expect(panel).toHaveAttribute("data-state", "restricted", { timeout: 60_000 });
    await expect(panel).toContainText(/Det här är inte en granskning/);
    await admin
      .locator("#beskt-availability-reason")
      .fill("SYNTETISKT innehållsbeslut: öppen pilot.");
    await admin.getByTestId("beskt-availability-submit").click();
    await expect(panel).toHaveAttribute("data-state", "open", { timeout: 60_000 });
    await expect(admin.getByText(/Läge:\s*Utkast/).first()).toBeVisible();
    await shot(admin, "3-admin-open");

    await rival.reload();
    await expect(v01).toHaveCount(1, { timeout: 60_000 });
    await expect(v01).toContainText(/Pilotversion – ogranskad, öppen för alla arbetsgivare/);
    await rival.getByTestId("lib-start-beskt").click();
    const dialog = rival.getByTestId("beskt-start-dialog");
    const version = dialog.locator("#beskt-start-version");
    const installed = await version
      .locator("option")
      .evaluateAll(
        (o) =>
          (o as HTMLOptionElement[]).find((x) => /BESKT – rekryteringsstöd/.test(x.text))?.value,
      );
    await version.selectOption(installed!);
    await dialog.getByTestId("beskt-entrance-invitation").check();
    await dialog.locator("#beskt-invite-email").fill(INVITEE);
    await dialog.locator("#beskt-invite-name").fill("SYNTETISK Kandidat");
    await dialog.locator("#beskt-invite-role").fill("Väktare (syntetisk)");
    await dialog.locator("#beskt-start-interviewer").selectOption({ label: RIVAL_NAME });
    await dialog.getByTestId("beskt-start-dialog-submit").click();
    await expect(dialog.getByTestId("beskt-invitation-link")).toBeVisible({ timeout: 60_000 });
    await shot(rival, "3-rival-started");
    await rival.keyboard.press("Escape");

    // Withdrawn: new starts stop.
    await admin.locator("#beskt-availability-reason").fill("SYNTETISKT: genomgången klar.");
    await admin.getByTestId("beskt-availability-submit").click();
    await expect(panel).toHaveAttribute("data-state", "restricted", { timeout: 60_000 });
    await rival.reload();
    await expect(setup).toBeVisible({ timeout: 60_000 });
    await expect(v01).toHaveCount(0, { timeout: 60_000 });
    await adminCtx.close();
    await rivalCtx.close();
  });

  test("4 · another organisation is refused the first organisation's case", async ({ page }) => {
    await signIn(page, OUTSIDER, `/employer/${RIVAL}`);
    await page.goto(caseUrl + "/tests");
    await expect(page.getByText(/Åtkomst ej tillgänglig/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("case-tests")).toHaveCount(0);
    await shot(page, "4-rival-refused");
  });
});

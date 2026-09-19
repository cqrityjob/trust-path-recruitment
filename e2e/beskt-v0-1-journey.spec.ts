/**
 * BESKT v0.1 — the whole journey on the IMPORTED method content.
 *
 * Runs against the local test environment after
 *   scripts/beskt-import/import-beskt-v0-1.ts --method rekrytering --synthetic
 *   scripts/beskt-import/synthetic-release.ts <version>
 * so the method on screen is the specification's own question bank, grammar,
 * FAKTA chain and anchors — published through five SYNTHETIC test reviews in
 * a disposable database, never a real review.
 *
 *   1. the library shows the v0.1 method, and the employer starts it from an
 *      existing application;
 *   2. the candidate reads the notice, answers Ja (the §4.2 follow-ups
 *      appear), Nej (none do), takes one question orally, skips one, and
 *      submits;
 *   3. the employer reads the basis back, creates the interview case under
 *      Intervjuer and links the preparation;
 *   4. BESKT in the case carries the v0.1 conversation plan, the FAKTA chain
 *      included, and the themes the candidate's own choices produced;
 *   5. the interviewer documents a theme, locks, and signs the report.
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

const OUT = process.env.BCP_V01_EVIDENCE_DIR ?? "artifacts/beskt-v0-1/live";
mkdirSync(OUT, { recursive: true });
const PASSWORD = "LocalJourney!2026";
const RECRUITER = "beskt-recruiter@local.test";
const CANDIDATE = "beskt-candidate@local.test";
const EMPLOYER = "beskt-journey-ab";
const APPLICATION = "b4000000-0000-4000-8000-00000000aa01";
const APPLICATION_PATH = `/employer/${EMPLOYER}/applications/${APPLICATION}`;
const METHOD = /SYNTETISK TEST – BESKT – rekryteringsstöd/;
const RECRUITER_NAME = "Rekryterare Journey";
const FACT = "SYNTETISKT-V01 kandidaten beskrev hur misstaget rapporterades samma dag";

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** Saving returns to My Career; the preparation is reopened from its row. */
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

test.describe("BESKT v0.1 — candidate preparation → interview → report on the imported content", () => {
  test("1 · the library shows v0.1 and the employer starts it from an application", async ({
    page,
  }) => {
    await signIn(
      page,
      RECRUITER,
      `/employer/${EMPLOYER}/assessments/library?method=beskt&group=operational&role=vaktare&env=general`,
    );
    const rows = page.getByTestId("lib-setup-status").locator("li");
    await expect(rows.filter({ hasText: METHOD })).toHaveCount(1, { timeout: 60_000 });
    await shot(page, "1-library-sv");

    await page.goto(APPLICATION_PATH);
    const panel = page.getByTestId("beskt-application-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await panel.getByTestId("beskt-start-open").click();
    const dialog = page.getByTestId("beskt-start-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const version = dialog.locator("#beskt-start-version");
    if ((await version.count()) > 0) {
      const v01 = await version
        .locator("option")
        .evaluateAll(
          (o) =>
            (o as HTMLOptionElement[]).find((x) =>
              /SYNTETISK TEST – BESKT – rekryteringsstöd/.test(x.text),
            )?.value,
        );
      await version.selectOption(v01!);
    }
    await dialog.locator("#beskt-start-interviewer").selectOption({ label: RECRUITER_NAME });
    await dialog.getByTestId("beskt-start-dialog-submit").click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    await expect(panel.getByTestId("beskt-readback-state")).toBeVisible({ timeout: 60_000 });
    await shot(page, "1-started-sv");
  });

  test("2 · the candidate answers the v0.1 questions, with the grammar and the neutral states", async ({
    page,
  }) => {
    await signIn(page, CANDIDATE, "/my-career/applications");
    const list = page.getByTestId("beskt-my-preparations");
    await expect(list).toBeVisible({ timeout: 60_000 });
    await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();

    await expect(page.getByTestId("beskt-notice")).toBeVisible({ timeout: 60_000 });
    await page.getByLabel(/jag har läst informationen/i).check();
    await page.getByTestId("beskt-acknowledge").click();

    // One area per step. The answers below, on whichever step shows them;
    // every other question gets "Vill inte svara" as the state it is.
    let sawQ01 = false;
    let sawQ02FollowUp = false;
    await walkSteps(page, async () => {
      // T: the candidate only confirms the role description (§4.3 T).
      await ifShown(page, "#beskt-input-t01_forstaelse", () =>
        page.locator("#beskt-input-t01_forstaelse").check(),
      );
      await ifShown(page, "#beskt-input-q01_sakerhetsregel", async () => {
        sawQ01 = true;
        // §4.3 fråga 1, in the specification's own words.
        await expect(page.getByTestId("beskt-item-q01_sakerhetsregel")).toContainText(
          "Beskriv en situation där du följde en säkerhetsregel trots att den gjorde arbetet svårare.",
        );
        await page
          .locator("#beskt-input-q01_sakerhetsregel")
          .fill("SYNTETISKT-V01 jag följde tvåpersonsregeln vid larmkvittering.");
      });
      // Ja on fråga 2 opens the §4.2 follow-ups; Nej on fråga 3 opens none.
      await ifShown(page, "#beskt-input-q02_misstag-ja", () =>
        page.locator("#beskt-input-q02_misstag-ja").click(),
      );
      await ifShown(page, "#beskt-input-q03_kringga_regel-nej", () =>
        page.locator("#beskt-input-q03_kringga_regel-nej").click(),
      );
      await ifShown(page, "#beskt-input-q02_misstag__aktualitet-manader_7_24", async () => {
        sawQ02FollowUp = true;
        await expect(page.getByTestId("beskt-item-q03_kringga_regel__aktualitet")).toHaveCount(0);
        await page.locator("#beskt-input-q02_misstag__aktualitet-manader_7_24").click();
        await page.locator("#beskt-input-q02_misstag__beskrivning").fill(FACT);
        await shot(page, "2-grammar-sv");
      });
      // "Tar muntligt" and "Vill inte svara" are neutral states, not options.
      await ifShown(page, '[data-testid="beskt-item-q05_konflikt_atgard-oral"]', async () => {
        const oral = page.getByTestId("beskt-item-q05_konflikt_atgard-oral");
        if ((await oral.getAttribute("aria-pressed")) !== "true") await oral.click();
      });
      await ifShown(page, '[data-testid="beskt-item-q06_olost_oforratt-skip"]', async () => {
        const skip = page.getByTestId("beskt-item-q06_olost_oforratt-skip");
        if ((await skip.getAttribute("aria-pressed")) !== "true") await skip.click();
      });
      await expectFitsViewport(page);
    });
    expect(sawQ01 && sawQ02FollowUp).toBe(true);
    // Saved answers survive leaving and coming back.
    await saveAndReopen(page);
    await expect(page.getByTestId("beskt-steps")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("beskt-to-review").click();
    await expect(page.getByTestId("beskt-review-list")).toBeVisible({ timeout: 60_000 });
    await shot(page, "2-review-sv");
    await page.getByTestId("beskt-submit").click();
    await expect(page.getByTestId("beskt-submitted")).toBeVisible({ timeout: 60_000 });
    await shot(page, "2-submitted-sv");
  });

  test("3 · the employer reads it back and links it to a case under Intervjuer", async ({
    page,
  }) => {
    await signIn(page, RECRUITER, APPLICATION_PATH);
    const panel = page.getByTestId("beskt-application-panel");
    await expect(panel.getByTestId("beskt-readback-answers")).toContainText(FACT, {
      timeout: 60_000,
    });
    await expect(panel.getByTestId("beskt-readback-topics")).toBeVisible();

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
    // Started from the preparation, the case arrives linked: one atomic start.
    await expect(link.getByTestId("beskt-case-link-linked")).toBeVisible({ timeout: 60_000 });
    await expect(link.getByTestId("beskt-case-link-submit")).toHaveCount(0);
    await shot(page, "3-linked-sv");
  });

  test("4 · BESKT in the case carries the v0.1 plan, the FAKTA chain and the candidate's themes", async ({
    page,
  }) => {
    await signIn(page, RECRUITER, APPLICATION_PATH);
    await page
      .getByTestId("beskt-case-link")
      .getByRole("link", { name: /Öppna BESKT i intervjufallet/ })
      .click();
    await expect(page).toHaveURL(/\/beskt$/, { timeout: 60_000 });

    // The method's wordings are read for a conduct session, so the session
    // is opened first -- the same order an interviewer follows.
    const start = page.getByRole("button", { name: /Öppna samtalsstödet/ });
    await expect(start).toBeVisible({ timeout: 60_000 });
    await start.click();
    const stages = page.getByTestId("beskt-stage-prompts");
    await expect(stages).toBeVisible({ timeout: 60_000 });
    // §5.2 FAKTA, step 1, in the specification's own words; §5.1 step 6.
    await expect(stages).toContainText("Vad hände konkret?");
    await expect(stages).toContainText("Hur förklarar du själv det som hände?");
    await expect(stages).toContainText(/Systemet fattar inget beslut/);
    // The candidate's own choices, and nothing else, became themes.
    await expect(await openThemeArea(page, "q05_konflikt_atgard")).toBeVisible();
    await expect(page.getByTestId("beskt-theme-q06_olost_oforratt")).toBeVisible();
    // Ja on fråga 2 fired its follow-up rule: a theme too, naming the rule.
    // It sits in its own area (the common base), not in B's.
    await expect(await openThemeArea(page, "q02_misstag")).toHaveAttribute(
      "data-reason",
      "candidate_disclosed",
    );
    await expectFitsViewport(page);
    await shot(page, "4-beskt-in-case-sv");
  });

  test("5 · the interviewer documents, locks and signs the report", async ({ page }) => {
    await signIn(page, RECRUITER, APPLICATION_PATH);
    await page
      .getByTestId("beskt-case-link")
      .getByRole("link", { name: /Öppna BESKT i intervjufallet/ })
      .click();
    await expect(page).toHaveURL(/\/beskt$/, { timeout: 60_000 });

    // The session was opened in step 4; the conversation support is shown.
    const theme = await openThemeArea(page, "q05_konflikt_atgard");
    await expect(theme.getByRole("button", { name: /Dokumentera temat/ })).toBeVisible({
      timeout: 60_000,
    });
    await theme.getByRole("button", { name: /Dokumentera temat/ }).click();
    await page
      .getByLabel(/^Observerbart faktum$/i)
      .first()
      .fill("SYNTETISKT-V01 konflikten avslutades med en dokumenterad överenskommelse");
    await theme.getByRole("button", { name: /Spara dokumentation/ }).click();
    await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });

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
    await expect(doc).toContainText(METHOD);
    await recordStance(page, RECRUITER_NAME);
    await page.getByTestId("beskt-report-finalise").click();
    await expect(page.getByTestId("beskt-report-versions")).toContainText(/Version 1/, {
      timeout: 60_000,
    });
    await expect(doc).toContainText(/Signerad version/);
    await expectFitsViewport(page);
    await shot(page, "5-signed-sv");
  });
});

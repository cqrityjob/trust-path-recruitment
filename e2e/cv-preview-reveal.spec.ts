// Getting to the document, in a real browser, on the real routes.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// The owner's report, in two sentences: after filling in everything, there
// was no button at the bottom of the page to show the CV, and pressing the
// one at the top did not take anybody to it. Both were true. On a phone
// the preview rendered below the fold; on a desktop it rendered above the
// scrolled position; a failed generation rendered nothing at all. Nothing
// moved, nothing was announced.
//
// ── WHAT IS PROVED HERE ────────────────────────────────────────────────
//
//   1  On a 375px phone, "Preview" puts the document IN the viewport and
//      moves focus INTO its region -- the two things a static check cannot
//      see and the two things that make "the button did nothing" false.
//   2  A failed generation is a sentence with a retry, never silence.
//   3  The bottom "Show my CV" on /my-career/cv opens the latest saved CV,
//      opens the creator when there is none, and refuses to leave with an
//      unsaved, invalid form open.
//   4  The bottom "Show my CV" on the saved CV's editor saves and reveals.
//   5  The English labels are English.
//
// Seen failing: with the reveal effect and the bottom controls reverted,
// test 1 fails on `activeElement` (body) and the region's top is below the
// 812px viewport; test 2 fails waiting for the failure region; test 3 fails
// finding the button.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/cv-preview-reveal.spec.ts --project=chromium --project=mobile-375

import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  CV_ID,
  ServerModel,
  assertNoUnstubbedServerFns,
  createAndSave,
  doc,
  exportOf,
  gotoNew,
  resetStubTracking,
  savedUrl,
  signedIn,
} from "./support/cv-fixture";

test.beforeEach(resetStubTracking);
test.afterEach(assertNoUnstubbedServerFns);

/** The region that carries `attr` is inside the viewport and holds focus.
 *  Waited for, because the scroll is smooth unless the system asks
 *  otherwise. */
async function expectRevealed(page: Page, attr: string) {
  await page.waitForFunction(
    (a) => {
      const el = document.querySelector(`[${a}]`);
      if (!(el instanceof HTMLElement)) return false;
      const r = el.getBoundingClientRect();
      const inView = r.top >= -1 && r.top < window.innerHeight && r.bottom > 0;
      return (
        inView && el.contains(document.activeElement) && document.activeElement !== document.body
      );
    },
    attr,
    { timeout: 10_000 },
  );
}

test.describe("CV — the preview is brought to the reader", () => {
  test("preview scrolls the document into view and focuses it", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);

    // The form is long. On a phone the document stacks below it; on a
    // desktop it sits at the top of the page while the reader is at the
    // bottom. Either way the reader is nowhere near it when they press.
    await page.getByRole("button", { name: /Förhandsgranska CV/ }).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();

    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expectRevealed(page, "data-cv-preview");
    // The region reached is the one with the document in it.
    await expect(page.locator("[data-cv-preview] article.cv-document")).toBeVisible();

    // And the page says which kind of CV this is: without a provider, it
    // was built directly from the person's own information.
    await expect(page.locator("[data-cv-built-without-ai]")).toContainText(/utan AI/i);

    // Sanity: on a phone the reader started well below the document.
    const vw = page.viewportSize()?.width ?? 1280;
    if (vw < 1024) expect(before).toBeGreaterThan(0);
  });

  test('"Visa mitt CV" at the end of the form makes the preview and reveals it', async ({
    page,
  }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);

    // No preview yet. The bottom control has to make one.
    await expect(doc(page)).toHaveCount(0);
    const show = page.locator("[data-cv-show-mine]");
    await expect(show).toHaveText(/Visa mitt CV/);
    await show.click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expectRevealed(page, "data-cv-preview");

    // Scroll away and ask again: no second generation, just the reveal.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("[data-cv-show-mine]").click();
    await expectRevealed(page, "data-cv-preview");
    expect(model.cvs.size).toBe(0);
  });

  test("a failed generation is said, with a retry", async ({ page }) => {
    const model = new ServerModel();
    const outage = { broken: true, calls: 0 };
    await signedIn(page, model);
    await page.route("**/_serverFn/**", async (route) => {
      if (exportOf(route.request().url()) !== "generateMyCv") return route.fallback();
      outage.calls += 1;
      if (outage.broken) {
        return route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
      }
      return route.fallback();
    });
    await gotoNew(page, /Skapa nytt CV/);

    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();
    const failed = page.locator("[data-cv-preview-failed]");
    await expect(failed).toBeVisible({ timeout: 20_000 });
    await expect(failed).toContainText(/kunde inte tas fram/);
    await expect(failed).toContainText(/Ingenting gick förlorat/);
    // Not the "awaiting" placeholder pretending nothing was pressed.
    await expect(page.getByText(/Ditt CV visas här när du har skapat det/)).toHaveCount(0);
    await expectRevealed(page, "data-cv-preview-failed");

    // The retry re-runs the generation, and the document arrives.
    const before = outage.calls;
    outage.broken = false;
    await failed.getByRole("button", { name: /Försök igen/ }).click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    expect(outage.calls).toBeGreaterThan(before);
    await expect(failed).toHaveCount(0);
  });

  test("not ready is a list of what is missing and a way back", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await page.route("**/_serverFn/**", async (route) => {
      if (exportOf(route.request().url()) !== "generateMyCv") return route.fallback();
      // The server's own shape for "readiness failed after the page loaded":
      // a person who removed their last employment in another tab.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            status: "not_ready",
            readiness: { state: "needs_information", missingFields: ["professionalHistory"] },
            presentation: null,
            document: null,
            providerMode: null,
            model: null,
            quarantinedPassages: [],
            failureReason: null,
            violationCount: 0,
          },
          error: null,
          context: {},
        }),
      });
    });
    await gotoNew(page, /Skapa nytt CV/);
    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();

    const notReady = page.locator("[data-cv-preview-not-ready]");
    await expect(notReady).toBeVisible({ timeout: 20_000 });
    await expect(notReady).toContainText(/Minst en anställning eller utbildning/);
    await expect(notReady.getByRole("link", { name: /Komplettera uppgifterna/ })).toHaveAttribute(
      "href",
      /\/my-career\/cv$/,
    );
    await expectRevealed(page, "data-cv-preview-not-ready");
  });
});

test.describe("CV — “Visa mitt CV” at the bottom of the information editor", () => {
  test("opens the latest saved CV", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    await page.goto(`${BASE}/my-career/cv`, { waitUntil: "domcontentloaded" });
    const show = page.locator("[data-cv-show-mine]");
    await expect(show).toBeVisible({ timeout: 30_000 });
    // It is BELOW the editors, where a person who has just typed is.
    const editorsBottom = await page
      .locator("[data-general-profile-claims]")
      .evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY);
    const buttonTop = await show.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(buttonTop).toBeGreaterThan(editorsBottom);

    await show.click();
    await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });
    await expect(doc(page)).toContainText("Nordic Security AB", { timeout: 20_000 });
    expect(model.cvs.has(CV_ID)).toBe(true);
  });

  test("opens the creator when nothing is saved yet", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await page.goto(`${BASE}/my-career/cv`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-cv-show-mine]").click();
    await expect(page).toHaveURL(/\/my-career\/cv\/new$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Skapa nytt CV/, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("does not leave with an unsaved, invalid form open", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    await page.goto(`${BASE}/my-career/cv`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-add-employment]").click();
    // An open, empty employment form. Leaving now would lose it; saving it
    // is impossible until the fields are filled.
    await page.locator("[data-cv-show-mine]").click();

    const error = page.locator("[data-cv-show-mine-error]");
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toContainText(/behöver rättas/);
    await expect(page).toHaveURL(/\/my-career\/cv$/);
    // The form is still open, with its own field errors shown.
    await expect(
      page.locator("[data-cv-employment] form, [data-cv-employment] fieldset").first(),
    ).toBeVisible();
    expect(model.cvs.size).toBe(1);
  });
});

test.describe("CV — “Visa mitt CV” from the saved CV's editor", () => {
  test("saves the edit, closes the editor and reveals the document", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    await page.getByRole("button", { name: /Redigera texten/ }).click();
    await page.getByLabel(/Namn på CV:t/).fill("Mitt väktar-CV");
    await expect(doc(page)).toHaveCount(0);

    await page.locator("[data-cv-show-mine]").click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expectRevealed(page, "data-cv-saved-document");
    // The write happened, and it is what the page now shows.
    expect(model.cvs.get(CV_ID)!.title).toBe("Mitt väktar-CV");
    await expect(page.getByRole("heading", { name: "Mitt väktar-CV", level: 1 })).toBeVisible();
  });
});

test.describe("CV — the English labels", () => {
  test("every new control reads in English", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model, { lang: "en" });
    await gotoNew(page, /Create a new CV/);

    const show = page.locator("[data-cv-show-mine]");
    await expect(show).toHaveText(/Show my CV/);
    await expect(page.getByText(/takes you straight to the document/)).toBeVisible();
    await show.click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-cv-built-without-ai]")).toHaveText(/Built without AI/);
    await expectRevealed(page, "data-cv-preview");

    await page.getByRole("button", { name: /^Save CV$/ }).click();
    await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });
    await page.getByRole("button", { name: /Edit the wording/ }).click();
    await expect(page.locator("[data-cv-show-mine]")).toHaveText(/Show my CV/);
    await expect(page.getByText(/Saves your changes and shows the document/)).toBeVisible();

    await page.goto(`${BASE}/my-career/cv`, { waitUntil: "domcontentloaded" });
    const panel = page.locator("[data-cv-show-mine-panel]");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText(/Show my CV/);
    await expect(panel).toContainText(/opens your latest CV/);
    // No Swedish leaking into the English page.
    await expect(panel).not.toContainText(/Visa mitt CV|Sparar|öppnar/);
  });
});

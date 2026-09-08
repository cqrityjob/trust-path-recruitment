// The signed-in CV journey, in a real browser, on the real routes.
//
// ── WHAT THIS PROVES THAT NOTHING ELSE DOES ────────────────────────────
//
// `cv-pilot:check` renders components to markup and the SQL suites execute
// the boundary. Neither can see a person USING this: a preview that stays on
// screen after the selection changes, a save button that stays enabled when
// it should not, a second tab quietly overwriting the first, a retry that
// creates a second CV, a confirmation dialog that asks somebody to approve a
// change they cannot see.
//
// Those are the failures this feature is most likely to ship, and every one
// of them is invisible to a static check.
//
// The session, the stub table and the model of the server contract live in
// e2e/support/cv-fixture.ts, which explains what they do and do not prove.
//
// ── EVERY TEST HERE WAS SEEN FAILING ───────────────────────────────────
//
// A green suite proves nothing until each assertion has been shown to bite.
// These nine mutations were applied to the real implementation one at a time;
// each made exactly the named test fail, and reverting it made it pass again.
// Re-run any of them before trusting a line of this file.
//
//   1  `const previewStale = false` in cv.new
//      → "a material change withdraws the preview and blocks saving"
//   2  `operationId: crypto.randomUUID()` inline in the save payload
//      → "a lost response does not create a second CV"
//   3  delete the `CV_CHANGED` branch in cv.$cvId
//      → "a stale second tab is refused…"
//   4  stop rendering `change.before` / `change.after` in the drift panel
//      → "update from profile shows the exact change…"
//   5  seed the contact form with `showPhone: true`
//      → "contact details are opt-in, one field at a time"
//   6  send `selectableIds(bundle)` instead of the person's selection
//      → "preview what is selected, save it, and find it again"
//   7  `onClick={() => undefined}` on the export button
//      → "the export button opens the print dialog, and says so"
//   8  remove the `refetch()` calls behind the retry button
//      → "a failed load offers a retry rather than a dead end"
//   9  hard-code `locale: "sv"` in the generate payload
//      → "the document's language is not the interface's"
//
// Run:  E2E_BASE_URL=http://localhost:3100 bun run e2e:cv

import { test, expect } from "@playwright/test";
import {
  ACCOUNT_EMAIL,
  BASE,
  CV_ID,
  EMP_NOW,
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

/* ------------------------------------------------------------------ */
/* The journey                                                         */
/* ------------------------------------------------------------------ */

test.describe("CV — the signed-in journey", () => {
  test("preview what is selected, save it, and find it again", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);

    // The CTA makes a PREVIEW. Saving is a separate, consented act.
    await expect(page.getByRole("button", { name: /Förhandsgranska CV/ })).toBeVisible();

    // Leaving one employment off must remove it from the document.
    await page.getByRole("checkbox", { name: /Stadsvakt i Malmö AB/ }).uncheck();
    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();

    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expect(doc(page)).toContainText("Nordic Security AB");
    await expect(doc(page)).not.toContainText("Stadsvakt");

    await page.getByRole("button", { name: /^Spara CV$/ }).click();
    await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });
    await expect(doc(page)).toContainText("Nordic Security AB");

    // What was saved is what was previewed: the deselected employment is
    // absent from the stored bundle, not merely hidden on the page.
    expect(model.cvs.get(CV_ID)!.frozen.employment.map((e) => e.id)).toEqual([EMP_NOW]);

    // And the saved CV says what it leaves out, rather than saying nothing.
    await expect(page.getByText(/Detta finns i din profil men inte på det här CV:t/)).toBeVisible();

    // Reopen from the list: a saved CV is a destination, not a wizard.
    await page.goto(`${BASE}/my-career/cv`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /^Öppna$/ }).click();
    await expect(doc(page)).toContainText("Nordic Security AB", { timeout: 20_000 });
    await expect(doc(page)).not.toContainText("Stadsvakt");
  });

  test("a material change withdraws the preview and blocks saving", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);

    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });

    // Change what the document is ABOUT. Reading one CV and saving another is
    // the single failure this screen exists to prevent.
    await page.getByRole("checkbox", { name: /Stadsvakt i Malmö AB/ }).uncheck();

    await expect(page.getByText(/Förhandsgranskningen gäller inte längre/)).toBeVisible();
    await expect(doc(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Uppdatera förhandsgranskningen/ }),
    ).toBeVisible();
    // No save control at all while there is no document to save.
    await expect(page.getByRole("button", { name: /^Spara CV$/ })).toHaveCount(0);
    expect(model.cvs.size).toBe(0);
  });

  test("contact details are opt-in, one field at a time", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);

    const contact = page.locator("fieldset").filter({ hasText: "Kontaktuppgifter" });
    // Prefilled from the account, and switched OFF.
    await expect(page.getByLabel("E-post")).toHaveValue(ACCOUNT_EMAIL);
    await expect(contact.getByRole("checkbox").first()).not.toBeChecked();

    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expect(doc(page)).not.toContainText(ACCOUNT_EMAIL);

    await page.getByLabel("Telefon").fill("070-123 45 67");
    await contact.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: /Uppdatera förhandsgranskningen/ }).click();

    await expect(doc(page)).toContainText(ACCOUNT_EMAIL, { timeout: 20_000 });
    // The number was typed and NOT switched on, so it stays off the document.
    await expect(doc(page)).not.toContainText("070-123 45 67");

    await page.getByRole("button", { name: /^Spara CV$/ }).click();
    await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });
    const stored = model.cvs.get(CV_ID)!.presentation.contact;
    expect(stored.showEmail).toBe(true);
    expect(stored.showPhone).toBe(false);
  });

  test("the document's language is not the interface's", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model, { lang: "sv" });
    await gotoNew(page, /Skapa nytt CV/);

    await page.getByRole("radio", { name: /Engelska/ }).check();
    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();

    await expect(doc(page)).toBeVisible({ timeout: 20_000 });
    await expect(doc(page)).toContainText("Experience");
    // The interface around it is still Swedish.
    await expect(page.getByRole("button", { name: /^Spara CV$/ })).toBeVisible();

    await page.getByRole("button", { name: /^Spara CV$/ }).click();
    await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });
    expect(model.cvs.get(CV_ID)!.locale).toBe("en");
  });

  test("a lost response does not create a second CV", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model, { dropFirstCreateResponse: true });
    await gotoNew(page, /Skapa nytt CV/);

    await page.getByRole("button", { name: /Förhandsgranska CV/ }).click();
    await expect(doc(page)).toBeVisible({ timeout: 20_000 });

    // The write commits and the answer is lost.
    await page.getByRole("button", { name: /^Spara CV$/ }).click();
    await expect(page.getByText(/Kunde inte sparas/)).toBeVisible({ timeout: 20_000 });
    // Nothing the person had on screen was thrown away.
    await expect(doc(page)).toBeVisible();
    expect(model.cvs.size).toBe(1);

    // Pressing save again sends the SAME operation id, so the server replays
    // instead of creating a second document.
    await page.getByRole("button", { name: /^Spara CV$/ }).click();
    await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });

    expect(model.createCalls).toBe(2);
    expect(model.cvs.size).toBe(1);
    expect(model.operations.size).toBe(1);
  });

  test("a stale second tab is refused, and the first writer's change stands", async ({
    page,
    context,
  }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    // A second tab, opened on the same CV and then left alone.
    const stale = await context.newPage();
    await signedIn(stale, model);
    await stale.goto(`${BASE}/my-career/cv/${CV_ID}`, { waitUntil: "domcontentloaded" });
    await expect(doc(stale)).toBeVisible({ timeout: 30_000 });

    // The first tab writes.
    await page.getByRole("button", { name: /Redigera texten/ }).click();
    await page.getByLabel("Namn på CV:t").fill("Uppdaterat i flik ett");
    await page.getByRole("button", { name: /^Spara CV$/ }).click();
    await expect(page.getByText("Sparat", { exact: true })).toBeVisible({ timeout: 20_000 });

    // The second tab tries, holding a revision that is no longer current.
    await stale.getByRole("button", { name: /Redigera texten/ }).click();
    await stale.getByLabel("Namn på CV:t").fill("Uppdaterat i flik två");
    await stale.getByRole("button", { name: /^Spara CV$/ }).click();

    await expect(stale.getByText(/CV:t har ändrats i ett annat fönster/)).toBeVisible({
      timeout: 20_000,
    });
    expect(model.cvs.get(CV_ID)!.title).toBe("Uppdaterat i flik ett");

    // The reload is a way forward, not a dead end: it shows the version that
    // won, so the second writer can decide what to do about it.
    await stale.getByRole("button", { name: /Ladda om CV:t/ }).click();
    await expect(
      stale.getByRole("heading", { name: "Uppdaterat i flik ett", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });
    await stale.close();
  });

  test("update from profile shows the exact change, and cancelling writes nothing", async ({
    page,
  }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    // The profile moves under the saved CV.
    model.employerNameNow = "Nordic Security Group AB";
    await page.reload({ waitUntil: "domcontentloaded" });

    const panel = page.locator("section").filter({ hasText: "Din profil har ändrats" });
    await expect(panel).toBeVisible({ timeout: 30_000 });
    // THE EXACT VALUES, not a summary. A confirmation about a change somebody
    // cannot see is a confirmation in shape only.
    await expect(panel).toContainText("Nordic Security AB");
    await expect(panel).toContainText("Nordic Security Group AB");
    // The saved document itself has NOT moved on its own.
    await expect(doc(page)).toContainText("Nordic Security AB");
    await expect(doc(page)).not.toContainText("Nordic Security Group AB");

    // Cancelling writes nothing.
    const before = model.cvs.get(CV_ID)!.updatedAt;
    await panel.getByRole("button", { name: /Uppdatera från profilen/ }).click();
    await panel.getByRole("button", { name: /Nej, behåll CV:t/ }).click();
    await expect(panel.getByRole("button", { name: /Uppdatera från profilen/ })).toBeVisible();
    expect(model.cvs.get(CV_ID)!.updatedAt).toBe(before);
    expect(model.cvs.get(CV_ID)!.frozen.employment[0]!.employerName).toBe("Nordic Security AB");

    // Confirming applies it, and the news then stops being news.
    await panel.getByRole("button", { name: /Uppdatera från profilen/ }).click();
    await panel.getByRole("button", { name: /Ja, uppdatera CV:t/ }).click();
    await expect(doc(page)).toContainText("Nordic Security Group AB", { timeout: 20_000 });
    await expect(page.getByText(/Din profil har ändrats/)).toHaveCount(0);
  });

  test("the export button opens the print dialog, and says so", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    // The label says what it does, and the help text says it again.
    const print = page.getByRole("button", { name: /Skriv ut \/ spara som PDF/ });
    await expect(print).toBeVisible();
    await expect(page.getByText(/Öppnar webbläsarens utskriftsdialog/)).toBeVisible();

    const before = model.cvs.get(CV_ID)!.updatedAt;
    await print.click();
    expect(
      await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls),
    ).toBe(1);
    // Exporting is not the moment to change what the document says.
    expect(model.cvs.get(CV_ID)!.updatedAt).toBe(before);
  });

  test("a failed load offers a retry rather than a dead end", async ({ page }) => {
    const model = new ServerModel();
    // The read stays broken until the scenario repairs it. A single refused
    // response would prove nothing: react-query retries three times on its
    // own, so the person would never see the banner this test is about.
    const outage = { broken: true, calls: 0 };
    await signedIn(page, model);
    // Registered last, so Playwright consults it first; `fallback` hands
    // everything else to the stub table.
    await page.route("**/_serverFn/**", async (route) => {
      if (exportOf(route.request().url()) !== "listMyCvs") return route.fallback();
      outage.calls += 1;
      if (outage.broken) {
        return route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
      }
      return route.fallback();
    });

    await page.goto(`${BASE}/my-career/cv`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/kunde inte hämtas just nu/)).toBeVisible({ timeout: 30_000 });
    // "Nothing has been lost" — and it says so rather than only failing.
    await expect(page.getByText(/Ingenting har gått förlorat/)).toBeVisible();

    const before = outage.calls;
    outage.broken = false;
    await page.getByRole("button", { name: /Försök igen/ }).click();
    await expect(page.getByText(/kunde inte hämtas just nu/)).toHaveCount(0, { timeout: 20_000 });
    // The repair is the working list, not a blank page.
    await expect(page.getByText(/Du har inget CV ännu/)).toBeVisible();
    // And the button REFETCHED rather than merely hiding the banner.
    expect(outage.calls).toBeGreaterThan(before);
  });
});

/* ------------------------------------------------------------------ */
/* English, and small screens                                          */
/* ------------------------------------------------------------------ */

test.describe("CV — English and small screens", () => {
  test("the whole creator works in English", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model, { lang: "en" });
    await gotoNew(page, /Create a new CV/);

    await page.getByRole("checkbox", { name: /Stadsvakt i Malmö AB/ }).uncheck();
    await createAndSave(page, /Preview CV/, /^Save CV$/);

    await expect(doc(page)).toContainText("Experience");
    await expect(page.getByRole("button", { name: /Print \/ save as PDF/ })).toBeVisible();
    await expect(page.getByText(/In your profile, but not on this CV/)).toBeVisible();
    expect(model.cvs.size).toBe(1);
  });

  test("nothing overflows sideways at 375px", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);

    // The controls are still reachable, not merely present in the markup.
    await expect(page.getByRole("button", { name: /Skriv ut \/ spara som PDF/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Redigera texten/ })).toBeVisible();
  });

  test("the saved CV survives 200% zoom", async ({ page }) => {
    const model = new ServerModel();
    await signedIn(page, model);
    // 200% zoom in a 1440-wide window is a 720-wide layout viewport.
    await page.setViewportSize({ width: 720, height: 450 });
    await gotoNew(page, /Skapa nytt CV/);
    await createAndSave(page);

    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
    await expect(doc(page)).toContainText("Nordic Security AB");
  });
});

import { test, expect, type Page } from "@playwright/test";
import {
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  assertNoRefusals,
  exportOf,
} from "./support/public-entry-harness";
import { table, SLUG, JOB_UPPSALA } from "./support/employer-portal-fixture";

for (const lang of ["sv", "en"] as const) {
  test(`job draft survives a refused save and cancelled navigation (${lang})`, async ({ page }) => {
    const refusals = await installBoundary(page, {
      ...table,
      listPublishedProfessionsV2: { data: [] },
      saveEmployerJobDraft: { id: JOB_UPPSALA },
      saveVacancyStructure: {},
    });
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key);
    await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
    await page.goto(`/employer/${SLUG}/jobs/new`);
    const field = page.locator("#job-title");
    await field.fill("Synthetic UX draft");
    let fail = true;
    await page.route("**/_serverFn/**", (route) =>
      exportOf(route.request().url()) === "saveEmployerJobDraft" && fail
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "SAVE_DRAFT_FAILED" }),
          })
        : route.fallback(),
    );
    await page
      .getByRole("button", { name: lang === "sv" ? "Spara utkast" : "Save draft", exact: true })
      .click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(field).toHaveValue("Synthetic UX draft");
    const menu = page.getByRole("button", {
      name: /Öppna menyn|Open menu|Öppna meny|Open navigation/,
    });
    if (await menu.isVisible()) await menu.click();
    const jobs = page.locator(`a[href="/employer/${SLUG}/jobs"]`).filter({ visible: true }).first();
    let confirmed = false;
    page.once("dialog", async (dialog) => {
      confirmed = true;
      await dialog.dismiss();
    });
    await jobs.click();
    await expect.poll(() => confirmed).toBe(true);
    await expect(field).toHaveValue("Synthetic UX draft");
    // A subsequent successful save may navigate without asking to discard the saved draft.
    fail = false;
    const openMenu = page.getByRole("dialog");
    if (await openMenu.isVisible()) await page.keyboard.press("Escape");
    let unexpectedPrompt = false;
    page.once("dialog", async (dialog) => {
      unexpectedPrompt = true;
      await dialog.dismiss();
    });
    await page
      .getByRole("button", { name: lang === "sv" ? "Spara utkast" : "Save draft", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${JOB_UPPSALA}/edit`));
    expect(unexpectedPrompt).toBe(false);
    assertNoRefusals(refusals);
  });
}

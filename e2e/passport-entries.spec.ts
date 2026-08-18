// Security Passport — Phase 8 browser evidence: entering a record.
//
// Drives the DEV fixture harness (/dev/security-passport), so it needs no
// account and no backend. The forms and the experience mark under test are
// the same components the authenticated routes render.
//
// Run with the dev server up:
//   E2E_BASE_URL=http://localhost:8080 npx playwright test e2e/passport-entries.spec.ts

import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = "docs/passport-credential-ui-evidence";

async function openHarness(page: Page, screen: string, lang?: "sv" | "en") {
  await page.goto("/dev/security-passport");
  await page.locator("#sp-screen").selectOption(screen);
  if (lang) await page.locator("#sp-lang").selectOption(lang);
}

test.describe("verified experience is separate from trust", () => {
  test("bands fill with verified time; self-declared time is stated apart", async ({ page }) => {
    await openHarness(page, "entries", "sv");

    // The exact duration is always printed — the mark is never the only signal.
    await expect(page.getByText("Ingen verifierad tid ännu")).toBeVisible();
    await expect(page.getByText("1 år", { exact: true })).toBeVisible();
    await expect(page.getByText("5 år", { exact: true })).toBeVisible();
    await expect(page.getByText("12 år", { exact: true })).toBeVisible();

    // Self-declared time is shown, and shown as the different thing it is.
    await expect(page.getByText(/Egenrapporterat, inte kontrollerat/).first()).toBeVisible();

    // No scoring vocabulary in the experience presentation itself. Scoped to
    // that section deliberately: "50%" is a legitimate employment EXTENT in
    // the form below, and banning the character globally would be testing the
    // wrong thing.
    const marks = page.locator("section").filter({ hasText: "Verifierad tid i yrket" }).first();
    const text = (await marks.innerText()).toLowerCase();
    for (const banned of ["poäng", "score", "rankn", "betyg", "%"]) {
      expect(text).not.toContain(banned);
    }

    await page.screenshot({ path: `${EVIDENCE}/experience-bands-sv.png`, fullPage: true });
  });
});

test.describe("structured employment entry", () => {
  test("relevance and extent are asked, never inferred", async ({ page }) => {
    await openHarness(page, "entries", "sv");

    await expect(page.getByLabel("Arbetsgivare")).toBeVisible();
    await expect(page.getByLabel("Roll")).toBeVisible();
    await expect(page.getByLabel(/Omfattning/)).toBeVisible();
    await expect(page.getByText("Hur mycket av arbetet var säkerhetsarbete?")).toBeVisible();
    await expect(page.getByText(/Vi gissar aldrig utifrån titeln/)).toBeVisible();
  });

  test("ongoing employment hides the end date; unticking asks for it", async ({ page }) => {
    await openHarness(page, "entries", "sv");

    // Ongoing is the default, so there is no ambiguous empty end date.
    const ongoing = page.getByLabel("Jag arbetar kvar här");
    await expect(ongoing).toBeChecked();
    await expect(page.getByLabel("Till och med")).toHaveCount(0);

    await ongoing.uncheck();
    await expect(page.getByLabel("Till och med")).toBeVisible();
  });

  test("validation refuses an impossible range and a missing employer", async ({ page }) => {
    await openHarness(page, "entries", "sv");

    await page.getByRole("button", { name: "Spara" }).first().click();
    await expect(page.getByText("Ange arbetsgivare.")).toBeVisible();
    await expect(page.getByText("Ange roll.")).toBeVisible();
    await expect(page.getByText("Ange startdatum.")).toBeVisible();

    await page.getByLabel("Arbetsgivare").fill("Testbevakning AB (fiktiv)");
    await page.getByLabel("Roll").fill("Väktare");
    await page.getByLabel("Från och med").fill("2023-01-01");
    await page.getByLabel("Jag arbetar kvar här").uncheck();
    await page.getByLabel("Till och med").fill("2022-01-01");
    await page.getByRole("button", { name: "Spara" }).first().click();
    await expect(page.getByText("Slutdatumet måste vara efter startdatumet.")).toBeVisible();

    await page.screenshot({ path: `${EVIDENCE}/employment-validation-sv.png`, fullPage: true });
  });

  test("a partial-relevance role must state its share explicitly", async ({ page }) => {
    await openHarness(page, "entries", "sv");
    await page.getByLabel("Hur mycket av arbetet var säkerhetsarbete?").selectOption("partial");
    await expect(page.getByLabel("Ungefär hur stor del?")).toBeVisible();
    await expect(page.getByText(/beräkningen antar aldrig en andel/)).toBeVisible();
  });
});

test.describe("structured claim entry", () => {
  test("expiry is opt-in, so nothing invents one", async ({ page }) => {
    await openHarness(page, "entries", "sv");

    await expect(page.getByLabel("Skola eller lärosäte")).toBeVisible();
    const expires = page.getByLabel("Uppgiften har ett slutdatum");
    await expect(expires).not.toBeChecked();
    await expect(page.getByLabel("Gäller till")).toHaveCount(0);

    await expires.check();
    await expect(page.getByLabel("Gäller till")).toBeVisible();
  });

  test("English parity across the whole entry surface", async ({ page }) => {
    await openHarness(page, "entries", "en");
    await expect(page.getByRole("heading", { name: "My information" })).toBeVisible();
    await expect(page.getByLabel("Employer")).toBeVisible();
    await expect(page.getByText("How much of the work was security work?")).toBeVisible();
    await expect(page.getByLabel("School or institution")).toBeVisible();
    await expect(page.getByText("No verified time yet")).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/entries-en.png`, fullPage: true });
  });
});

test.describe("mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the entry surface has no horizontal overflow", async ({ page }) => {
    await openHarness(page, "entries", "sv");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await page.screenshot({ path: `${EVIDENCE}/entries-375-sv.png`, fullPage: true });
  });

  test("keyboard-only: tab reaches the form and focus stays visible", async ({ page }) => {
    await openHarness(page, "entries", "sv");
    await page.getByLabel("Arbetsgivare").focus();
    await page.keyboard.type("Tangentbord AB (fiktiv)");
    await page.keyboard.press("Tab");
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]).toContain(tag);
    await expect(page.getByLabel("Arbetsgivare")).toHaveValue("Tangentbord AB (fiktiv)");
  });
});

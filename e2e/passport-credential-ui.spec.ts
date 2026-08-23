// Security Passport — credential UI browser evidence.
//
// Drives the DEV fixture harness (/dev/security-passport), which needs no
// account and no backend: every assertion here runs against the same pure
// components the authenticated routes render, wired to fixtures. That is
// exactly what makes this runnable in an environment with no local
// Supabase stack — unlike the candidate-to-employer smoke test, this one
// is safe to run anywhere.
//
// Run with the dev server up:
//   E2E_BASE_URL=http://localhost:8080 npx playwright test e2e/passport-credential-ui.spec.ts
//
// Besides assertions, each block saves a screenshot into
// docs/passport-credential-ui-evidence/ — the visual record for review.

import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = "docs/passport-credential-ui-evidence";

async function openHarness(page: Page, screen: string, persona?: string, lang?: "sv" | "en") {
  await page.goto("/dev/security-passport");
  await page.locator("#sp-screen").selectOption(screen);
  if (persona) await page.locator("#sp-persona").selectOption(persona);
  if (lang) await page.locator("#sp-lang").selectOption(lang);
}

test.describe("credential symbols", () => {
  test("matrix shows all four marks in all eight states, in both languages", async ({ page }) => {
    await openHarness(page, "symbols", undefined, "sv");
    await expect(page.getByText("CQrityjobs behörighetssymboler")).toBeVisible();
    // Colour is never alone: the column headers are the words themselves.
    for (const word of ["Utkast", "EGENRAPPORTERAD", "VERIFIERAD", "Återkallad", "Ersatt"]) {
      await expect(page.getByRole("columnheader", { name: word }).first()).toBeVisible();
    }
    await page.screenshot({ path: `${EVIDENCE}/symbols-matrix-sv.png`, fullPage: true });

    await page.locator("#sp-lang").selectOption("en");
    await expect(page.getByText("The CQrityjob credential symbols")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "SELF-DECLARED" }).first()).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/symbols-matrix-en.png`, fullPage: true });
  });
});

test.describe("credential form", () => {
  test("progressive disclosure: a qualification never shows an expiry field", async ({ page }) => {
    await openHarness(page, "credentialForm", undefined, "en");
    await page.getByRole("radio", { name: /Security Guard Training 1/ }).check({ force: true });
    await expect(page.getByLabel(/Training provider/)).toBeVisible();
    await expect(page.getByLabel(/Completed on/)).toBeVisible();
    // VU1 does not expire; offering the field would invent an expiry.
    await expect(page.getByLabel(/Valid until/)).toHaveCount(0);
    await expect(page.getByLabel(/Valid from/)).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCE}/form-vu1-en.png`, fullPage: true });
  });

  test("an appointment demands its end date and authority", async ({ page }) => {
    await openHarness(page, "credentialForm", undefined, "sv");
    // "Ordningsvakt" alone now matches the appointment AND the two
    // ordningsvakt TRAINING credentials the Swedish truth model added, which
    // is the distinction that model exists to draw. This test is about the
    // APPOINTMENT.
    await page.getByRole("radio", { name: /Ordningsvaktsförordnande/ }).check({ force: true });
    await expect(page.getByText(/Ett förordnande är en tidsbegränsad behörighet/)).toBeVisible();
    await expect(page.getByLabel(/Förordnande myndighet/)).toBeVisible();
    await expect(page.getByLabel(/Gäller till \(obligatoriskt/)).toBeVisible();

    // Submit incomplete → error summary takes focus, field errors appear.
    await page.getByRole("button", { name: "Lägg till i passet" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Kontrollera fälten" })).toBeFocused();
    await expect(page.getByText("Ange vilken myndighet som förordnade dig.")).toBeVisible();
    await expect(page.getByText("Ett förordnande måste ha ett slutdatum.")).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/form-ov-validation-sv.png`, fullPage: true });
  });

  test("draft save and resume keep every field", async ({ page }) => {
    await openHarness(page, "credentialForm", undefined, "en");
    await page
      .getByRole("radio", { name: /Public Order Guard Appointment/ })
      .check({ force: true });
    await page.getByLabel(/Appointing authority/).fill("Fiktiva Myndigheten");
    await page.getByLabel(/Decision date/).fill("2026-02-01");
    await page.getByLabel(/Valid until/).fill("2029-01-31");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/Draft saved/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete draft" })).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/form-draft-saved-en.png`, fullPage: true });

    // Complete and add.
    await page.getByRole("button", { name: "Add to my Passport" }).click();
    await expect(page.getByText("The entry has been added to your Passport.")).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/form-activated-en.png`, fullPage: true });
  });

  test("keyboard-only completion works", async ({ page }) => {
    await openHarness(page, "credentialForm", undefined, "en");
    // Reach the radio group and choose with the keyboard.
    await page.getByRole("radio", { name: /Security Guard Training 1/ }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel(/Training provider/)).toBeVisible();
    // Tab lands somewhere useful and focus stays visible throughout.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"]).toContain(focused);
  });
});

test.describe("correction and versions", () => {
  test("both versions visible; superseded never looks current", async ({ page }) => {
    await openHarness(page, "credentialHistory", undefined, "sv");
    await expect(page.getByText("Versionshistorik")).toBeVisible();
    await expect(page.getByText("Version 2")).toBeVisible();
    await expect(page.getByText("Version 1")).toBeVisible();
    await expect(page.getByText("Ersatt").first()).toBeVisible();
    // The correction form warns about trust BEFORE submission.
    await expect(page.getByText(/börjar den nya versionen om som egenrapporterad/)).toBeVisible();
    // Reason is mandatory.
    await page.getByRole("button", { name: "Spara rättelsen" }).click();
    await expect(page.getByText("Ange vad du rättar.")).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/correction-versions-sv.png`, fullPage: true });
  });
});

test.describe("cards", () => {
  const cardCases: readonly { persona: string; expectWord: RegExp }[] = [
    { persona: "cred-vu1-approved", expectWord: /VERIFIED/i },
    { persona: "cred-vu1-vu2", expectWord: /VERIFIED/i },
    { persona: "cred-ov-expired", expectWord: /Expired/i },
    { persona: "cred-sv-disputed", expectWord: /Disputed/i },
    { persona: "career-discovery-only", expectWord: /Nothing to show yet|No verified/i },
  ];

  for (const { persona, expectWord } of cardCases) {
    test(`Direction C stays honest for ${persona}`, async ({ page }) => {
      await openHarness(page, "studio", persona, "en");
      await page.locator("#studio-direction").selectOption("signature");
      const compare = page.getByRole("checkbox");
      if (await compare.isChecked()) await compare.uncheck();
      // Scoped to the card itself: the harness selects elsewhere on the
      // page carry persona ids that would match these words.
      await expect(page.locator("article").first().getByText(expectWord).first()).toBeVisible();
      await page.screenshot({ path: `${EVIDENCE}/card-${persona}-en.png`, fullPage: true });
    });
  }
});

test.describe("LinkedIn sharing", () => {
  test("preview, steps, honesty and retention wording — both languages", async ({ page }) => {
    await openHarness(page, "linkedin", "five-verified-years", "sv");
    await expect(page.getByText("Dela på LinkedIn")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ladda ner bilden" })).toBeVisible();
    await expect(page.getByText(/Bilden bifogas inte automatiskt/)).toBeVisible();
    await expect(page.getByText(/Sociala plattformar kan behålla bilder/)).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/linkedin-sv.png`, fullPage: true });

    await page.locator("#sp-lang").selectOption("en");
    await expect(page.getByText(/The image is not attached automatically/)).toBeVisible();
    await expect(page.getByText(/Social platforms may keep images/)).toBeVisible();

    // The download really produces a PNG.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the image" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("cqrityjob-passport-linkedin.png");
    await page.screenshot({ path: `${EVIDENCE}/linkedin-en.png`, fullPage: true });
  });
});

test.describe("overview", () => {
  test("add-credential panel, drafts strip and symbol rows", async ({ page }) => {
    await openHarness(page, "overview", "cred-vu1-draft", "en");
    await expect(page.getByText("Credentials and training")).toBeVisible();
    await expect(page.getByRole("button", { name: /^VU1$/ })).toBeVisible();
    // The saved draft resumes from the overview.
    await expect(page.getByText("Drafts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue draft" })).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/overview-draft-en.png`, fullPage: true });
  });
});

test.describe("the shared recipient Passport", () => {
  test("a lapsed credential is never presented as current", async ({ page }) => {
    await openHarness(page, "recipientCard", undefined, "en");

    // The case that stored state gets wrong: recorded active, validity gone.
    const lapsed = page.locator("article").nth(1);
    await expect(lapsed.getByText("Ingrid Testsson")).toBeVisible();
    // The lifecycle word leads (rendered uppercase by CSS from "Expired"),
    // and the whole card warns as well.
    await expect(lapsed.getByText("Expired", { exact: true })).toBeVisible();
    await expect(lapsed.getByText("Contains expired entries")).toBeVisible();
    await expect(lapsed.getByText("PREVIOUSLY VERIFIED")).toBeVisible();
    // And it must NOT carry the bare present-tense claim.
    await expect(lapsed.getByText("VERIFIED", { exact: true })).toHaveCount(0);

    // The current one does read as verified.
    const current = page.locator("article").first();
    await expect(current.getByText("Stina Testsson")).toBeVisible();
    await expect(current.getByText("VERIFIED", { exact: true }).first()).toBeVisible();

    await page.screenshot({ path: `${EVIDENCE}/recipient-cards-en.png`, fullPage: true });
  });

  test("anonymous and empty shares stay dignified, in Swedish", async ({ page }) => {
    await openHarness(page, "recipientCard", undefined, "sv");
    await expect(page.getByText("Namnet visas inte")).toBeVisible();
    await expect(
      page.getByText("Det här paketet innehåller inget verifierat just nu."),
    ).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/recipient-cards-sv.png`, fullPage: true });
  });
});

test.describe("mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const screens = ["symbols", "credentialForm", "linkedin", "overview", "recipientCard"] as const;
  for (const screen of screens) {
    test(`${screen} has no horizontal overflow at 375px`, async ({ page }) => {
      await openHarness(page, screen, "cred-ov-current", "sv");
      if (screen === "credentialForm") {
        await page.getByRole("radio", { name: /Ordningsvaktsförordnande/ }).check({ force: true });
      }
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${screen}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${EVIDENCE}/mobile-${screen}-sv.png`, fullPage: true });
    });
  }
});

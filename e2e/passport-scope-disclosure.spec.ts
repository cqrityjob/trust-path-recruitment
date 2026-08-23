// Security Passport — what a scope looks like to each audience, rendered.
//
// ── WHY A BROWSER TEST AND NOT ONLY A DATABASE ONE ─────────────────────
//
// The database boundary is asserted in
// supabase/tests/security_passport_scope_disclosure_boundary_test.sql, and it
// passed the whole time the defect below existed.
//
// `sp_disclosure_payload` carried the exact protected object to an
// application-scoped employer. `buildRecipientPresentation` read it. And
// `RecipientPassportCard` — the component the employer's
// ApplicationPassportPanel actually renders — never mentioned it. The employer
// saw a skyddsvakt approval with no limits stated at all, which reads as a
// general national licence: broader than the authority granted.
//
// A payload can be perfectly correct and the screen can still be wrong. This
// asserts the screen.
//
// ── WHY THE PROTOTYPE ROUTE ────────────────────────────────────────────
//
// Same reason as the other Passport specs: the authenticated employer route
// needs a Supabase session, and a skipped test is not evidence. The harness
// renders the REAL RecipientPassportCard from fictional payloads shaped
// exactly as sp_disclosure_payload emits them — the same component the
// employer panel draws, not a copy of it.

import { test, expect, type Page } from "@playwright/test";

const PROTOTYPE = "/dev/security-passport";

/** The protected object in the application-scoped fixture. Deliberately
 *  distinctive, so "it does not appear" is a real assertion and not a
 *  coincidence of common words. */
const PROTECTED_OBJECT = "Kaj 12";

async function openRecipientCards(page: Page) {
  await page.goto(PROTOTYPE, { waitUntil: "domcontentloaded" });
  await page.selectOption("#sp-screen", "recipientCard");
  await page.waitForTimeout(300);
}

test.describe("Security Passport — the scope reaches one audience and not the other", () => {
  test("the application-scoped employer sees the exact protected object", async ({ page }) => {
    await openRecipientCards(page);

    // The card the employer's ApplicationPassportPanel renders.
    const employerCard = page
      .locator("div", { hasText: "Scoped SV — application employer" })
      .last();
    const scope = employerCard.locator('[data-testid="sp-credential-scope"]').first();

    await expect(scope, "the employer card renders no scope line at all").toBeVisible();
    await expect(scope).toContainText(PROTECTED_OBJECT);
  });

  test("the public card says the approval is limited without naming the object", async ({
    page,
  }) => {
    await openRecipientCards(page);

    const publicCard = page.locator("div", { hasText: "Scoped SV — public card" }).last();
    const scope = publicCard.locator('[data-testid="sp-credential-scope"]').first();

    // Silence would be worse than this: a reader told nothing assumes the
    // approval is unlimited, which is the exact misreading the scope prevents.
    await expect(scope, "the public card says nothing about limits").toBeVisible();
    await expect(scope).not.toContainText(PROTECTED_OBJECT);
  });

  test("the protected object appears nowhere on the public card", async ({ page }) => {
    await openRecipientCards(page);

    const publicCard = page.locator("div", { hasText: "Scoped SV — public card" }).last();
    const text = (await publicCard.textContent()) ?? "";

    expect(
      text.includes(PROTECTED_OBJECT),
      "the protected object leaked somewhere on the public card",
    ).toBe(false);
  });

  test("both readings render in Swedish and English without overflowing", async ({ page }) => {
    for (const lang of ["sv", "en"]) {
      await page.goto(`${PROTOTYPE}?lang=${lang}`, { waitUntil: "domcontentloaded" });
      await page.selectOption("#sp-screen", "recipientCard");
      await page.waitForTimeout(300);

      const lines = page.locator('[data-testid="sp-credential-scope"]');
      expect(await lines.count(), `no scope line rendered in ${lang}`).toBeGreaterThan(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `the recipient cards scroll sideways by ${overflow}px in ${lang}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

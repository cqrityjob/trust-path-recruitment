// Image 0's login panel, on the real public landing page, in a browser.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// candidate-journey-composition:check proves there is ONE authentication
// implementation and that / mounts it. It reads source. It cannot tell you
// that the panel is actually on screen, that its fields are labelled and
// fillable, that it is absent for a signed-in visitor, that nothing
// scrolls sideways beside it, or that the primary action is reachable.
//
// The panel is deliberately NOT exercised to the point of submitting real
// credentials: the sign-in call belongs to Supabase and every other suite
// that needs a session plants one directly. What is proved here is that
// the panel is present, complete, labelled, focusable and correctly
// absent — the things the composition can get wrong.

import { test, expect, type Page } from "@playwright/test";
import {
  BASE,
  horizontalOverflow,
  observeSupabaseStorageKey,
  plantSession,
  setLang,
} from "./support/public-entry-harness";

/** The owner's six widths. 1920 is not in the shared REQUIRED_WIDTHS,
 *  which stops at 1440; it is added here rather than widened globally,
 *  because every other public suite is pinned to that list. */
const WIDTHS = [320, 375, 768, 1024, 1440, 1920] as const;

/** Where the panel lives on the landing page. */
const PANEL = "[data-home-auth-panel]";

async function gotoHome(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  return errors;
}

test.describe("image 0 · the landing page carries a working login panel", () => {
  test("a signed-out visitor gets the panel, with labelled and fillable fields", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = await gotoHome(page);

    const panel = page.locator(PANEL);
    await expect(panel, "the panel is on the landing page").toBeVisible({ timeout: 30_000 });

    // Labelled, not merely present: a password manager needs real labels,
    // and so does a screen reader.
    const email = panel.getByLabel(/e-?post|email/i).first();
    const password = panel.getByLabel(/lösenord|password/i).first();
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    await email.fill("someone@example.com");
    await password.fill("not-a-real-password");
    await expect(email).toHaveValue("someone@example.com");

    // The submit control exists and is reachable.
    const submit = panel.locator('button[type="submit"]').first();
    await expect(submit).toBeVisible();
    await expect(submit).toBeInViewport();

    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  // The panel navigates an authenticated visitor to their workspace. That
  // is right on /login and would eject somebody from the public homepage,
  // so / must not mount it for them at all.
  test("a signed-in visitor is not shown the panel, and is not redirected away", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    await expect(page.locator(PANEL)).toHaveCount(0);
    expect(new URL(page.url()).pathname, "a signed-in visitor was ejected from /").toBe("/");
  });

  test("the panel is keyboard reachable and draws a focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHome(page);
    const email = page.locator(PANEL).getByLabel(/e-?post|email/i).first();
    await email.focus();
    await expect(email).toBeFocused();
    const outline = await email.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`;
    });
    expect(outline, "focused field draws no visible ring").not.toBe("none|0px|none");
  });

  for (const lang of ["sv", "en"] as const) {
    test(`the panel renders in ${lang} with no mixed-language leakage`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoHome(page);
      await setLang(page, lang);
      const panel = page.locator(PANEL);
      await expect(panel).toBeVisible({ timeout: 30_000 });
      const text = (await panel.innerText()).toLowerCase();
      // The other language's password word must not appear beside this one.
      if (lang === "en") expect(text).not.toMatch(/lösenord/);
      else expect(text).not.toMatch(/\bpassword\b/);
    });
  }

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px with the panel present`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ["sv", "en"] as const) {
        await gotoHome(page);
        await setLang(page, lang);
        await expect(page.locator(PANEL)).toBeVisible({ timeout: 30_000 });
        const overflow = await horizontalOverflow(page);
        expect(overflow, `${lang}: ${overflow}px of sideways scroll at ${width}px`).toBeLessThanOrEqual(
          1,
        );
        // The primary action must not be clipped by the viewport edge.
        const submit = page.locator(`${PANEL} button[type="submit"]`).first();
        const box = await submit.boundingBox();
        expect(box, "the submit control has no box").not.toBeNull();
        if (box) {
          expect(box.x, `${lang}: submit starts off-screen left at ${width}px`).toBeGreaterThanOrEqual(-1);
          expect(
            box.x + box.width,
            `${lang}: submit is clipped at the right edge at ${width}px`,
          ).toBeLessThanOrEqual(width + 1);
        }
      }
    });
  }

  // At xl the hero splits and the cards share their row with the panel.
  // They must still be peers — that is what makes them two entrances
  // rather than a primary and a fallback — and the density that buys the
  // fold is applied to BOTH or neither.
  test("the two entry cards are still peers beside the panel", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoHome(page);
    const boxes = await page.locator("#hero article").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
      }),
    );
    expect(boxes).toHaveLength(2);
    expect(Math.abs(boxes[0].w - boxes[1].w)).toBeLessThanOrEqual(2);
    expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(2);
  });

  // The reason the hero tightens when the panel shows. public-homepage.spec
  // already asserts this at 1440 without the panel; this asserts it holds
  // WITH the panel, at the widths where the split is active, in both
  // languages. If the density ever stops paying for the column, this fails
  // here rather than in the suite that does not know the panel exists.
  for (const width of [1440, 1920] as const) {
    test(`both entrances stay above the fold beside the panel at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ["sv", "en"] as const) {
        await gotoHome(page);
        await setLang(page, lang);
        await expect(page.locator(PANEL)).toBeVisible({ timeout: 30_000 });
        const cards = await page.locator("#hero article").all();
        expect(cards).toHaveLength(2);
        for (const card of cards) {
          await expect(card, `${lang}: an entrance is below the fold at ${width}px`).toBeInViewport();
        }
        // And its action, not merely its top edge.
        for (const action of await page.locator("#hero article a").all()) {
          await expect(
            action,
            `${lang}: an entrance action is below the fold at ${width}px`,
          ).toBeInViewport();
        }
      }
    });
  }
});

test.describe("/login keeps working, on the same implementation", () => {
  test("the direct route renders the same fields", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.getByLabel(/e-?post|email/i).first()).toBeVisible();
    await expect(page.getByLabel(/lösenord|password/i).first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    // /login is the PAGE: it has the proposition the landing page states in
    // its own hero, so the panel is not duplicated there.
    await expect(page.locator("h1")).toBeVisible();
  });

  test("refresh, back and forward keep both surfaces intact", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(page.locator(PANEL)).toBeVisible({ timeout: 30_000 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator(PANEL)).toBeVisible({ timeout: 30_000 });
    await page.goForward({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

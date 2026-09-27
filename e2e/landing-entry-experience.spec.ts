// Product-led homepage entry and the canonical direct login route.
//
// The homepage presents three equal core parts (MVP text specification,
// 2026-09-27): security work, Security Passport, and career and jobs. The
// illustrative Passport card lives in the Passport section, not the hero.
// The homepage's one read on arrival -- is the career analysis open? -- is
// answered locally, so nothing reaches a backend through the dev server.

import { test, expect, type Page } from "@playwright/test";
import {
  ANALYSIS_OPEN,
  BASE,
  horizontalOverflow,
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  setLang,
  stubServerFn,
} from "./support/public-entry-harness";

/** The owner's six widths. 1920 is not in the shared REQUIRED_WIDTHS,
 *  which stops at 1440; it is added here rather than widened globally,
 *  because every other public suite is pinned to that list. */
const WIDTHS = [320, 375, 768, 1024, 1440, 1920] as const;

const PREVIEW = "[data-home-passport-preview]";
const CORE = "#hero [data-home-core]";

async function gotoHome(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  return errors;
}

test.describe("the landing page is product-led", () => {
  test("a signed-out visitor sees the three core parts and the Passport example", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = await gotoHome(page);
    await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(CORE)).toHaveCount(3);
    await expect(page.locator(`#hero ${PREVIEW}`)).toHaveCount(0);
    await expect(page.locator('#hero input[type="email"]')).toHaveCount(0);
    await expect(page.locator('#hero a[href="/login"]')).toBeVisible();
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("a signed-in visitor still reaches their workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const key = await observeSupabaseStorageKey(page);

    // Mechanism copied from public-homepage.spec.ts's own signed-in test,
    // which passes: stub what the shell and header fetch on arrival, plant
    // the session, then WAIT for the redirect instead of reading the URL
    // straight after goto. The redirect is client-side, so a bare read
    // races it.
    await installBoundary(page, {
      listMyEmployerWorkspaces: [],
      countMyAcademyWork: 0,
      countMyReviewQueue: 0,
      ensureMyEmployerCompanyFromSignup: null,
      getV31Availability: ANALYSIS_OPEN,
      getV31TesterStatus: { allowed: false },
    });
    await plantSession(page, key);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/my-career**", { timeout: 20_000 });

    expect(
      new URL(page.url()).pathname.startsWith("/my-career"),
      "a signed-in visitor should reach their workspace",
    ).toBe(true);
    await expect(page.locator('#hero input[type="email"]')).toHaveCount(0);
  });

  test("the returning-user link is keyboard reachable and draws a focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHome(page);
    const signIn = page.locator('#hero a[href="/login"]');
    await signIn.focus();
    await expect(signIn).toBeFocused();
    const outline = await signIn.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`;
    });
    expect(outline, "focused link draws no visible ring").not.toBe("none|0px|none");
  });

  for (const lang of ["sv", "en"] as const) {
    test(`the product preview renders in ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoHome(page);
      await setLang(page, lang);
      const text = (await page.locator(PREVIEW).innerText()).toLowerCase();
      if (lang === "en") expect(text).toContain("private by default");
      else expect(text).toContain("privat som standard");
    });
  }

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ["sv", "en"] as const) {
        await gotoHome(page);
        await setLang(page, lang);
        await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
        const overflow = await horizontalOverflow(page);
        expect(
          overflow,
          `${lang}: ${overflow}px of sideways scroll at ${width}px`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  test("the three core parts are equal peers, each with one button", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoHome(page);
    const cards = page.locator(CORE);
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card).toBeVisible();
      await expect(card.locator("a.h-11")).toHaveCount(1);
      await expect(card.locator("a.h-11")).toBeVisible();
    }
  });

  for (const width of [1440, 1920] as const) {
    test(`all three core parts stay in the first screen at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
      for (const lang of ["sv", "en"] as const) {
        await gotoHome(page);
        await setLang(page, lang);
        const headings = await page.locator(`${CORE} h2`).all();
        expect(headings).toHaveLength(3);
        for (const heading of headings) {
          await expect(
            heading,
            `${lang}: a core part is below the fold at ${width}px`,
          ).toBeInViewport();
        }
      }
    });
  }
});

test.describe("/login remains the canonical authentication page", () => {
  test("the direct route renders the same fields", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.getByLabel(/e-?post|email/i).first()).toBeVisible();
    await expect(page.getByLabel(/lösenord|password/i).first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
  });

  test("refresh, back and forward keep both surfaces intact", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
    await page.goForward({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

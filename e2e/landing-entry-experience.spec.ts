// Audience-led homepage entry and the canonical direct login route.
//
// The homepage (locked public website, 2026-09-30) points the way: the
// headline, two equal audience entrances, and four "För dig" cards that each
// open that area's own page. The illustrative Passport card lives on the
// Passport's own page, /security-passport. The homepage's one read on
// arrival -- the latest published adverts -- is answered locally, so nothing
// reaches a backend through the dev server.

import { test, expect, type Page } from "@playwright/test";
import {
  ANALYSIS_OPEN,
  answerPublicJobs,
  BASE,
  horizontalOverflow,
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  setLang,
} from "./support/public-entry-harness";

/** The owner's six widths. 1920 is not in the shared REQUIRED_WIDTHS,
 *  which stops at 1440; it is added here rather than widened globally,
 *  because every other public suite is pinned to that list. */
const WIDTHS = [320, 375, 768, 1024, 1440, 1920] as const;

const PREVIEW = "[data-home-passport-preview]";
const ENTRY = "#for-dig [data-home-entry]";
const AUDIENCE = "#hero [data-home-audience]";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function gotoHome(page: Page): Promise<string[]> {
  const errors = collectErrors(page);
  await answerPublicJobs(page);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  return errors;
}

test.describe("the landing page is audience-led", () => {
  test("a signed-out visitor sees two audience entrances and four entries", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = await gotoHome(page);
    await expect(page.locator(AUDIENCE)).toHaveCount(2);
    await expect(page.locator(ENTRY)).toHaveCount(4);
    // No product explained in depth on the homepage, and no inline sign-in.
    await expect(page.locator(PREVIEW)).toHaveCount(0);
    await expect(page.locator('main input[type="email"]')).toHaveCount(0);
    await expect(page.locator('header a[href="/login"]').filter({ visible: true })).toHaveCount(1);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("a signed-in visitor still reaches their workspace", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await answerPublicJobs(page);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const key = await observeSupabaseStorageKey(page);

    // Stub what the shell and header fetch on arrival, plant the session,
    // then WAIT for the redirect instead of reading the URL straight after
    // goto. The redirect is client-side, so a bare read races it.
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
    await expect(page.locator('main input[type="email"]')).toHaveCount(0);
  });

  test("the returning-user link is keyboard reachable and draws a focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHome(page);
    const signIn = page.locator('header a[href="/login"]').filter({ visible: true }).first();
    await signIn.focus();
    await expect(signIn).toBeFocused();
    const outline = await signIn.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`;
    });
    expect(outline, "focused link draws no visible ring").not.toBe("none|0px|none");
  });

  for (const lang of ["sv", "en"] as const) {
    test(`the Passport preview renders on its own page in ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const errors = collectErrors(page);
      await page.goto(`${BASE}/security-passport`, { waitUntil: "networkidle" });
      await setLang(page, lang);
      const text = (await page.locator(PREVIEW).innerText()).toLowerCase();
      if (lang === "en") expect(text).toContain("private by default");
      else expect(text).toContain("privat som standard");
      expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
    });
  }

  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ["sv", "en"] as const) {
        await gotoHome(page);
        await setLang(page, lang);
        await expect(page.locator(ENTRY).first()).toBeVisible({ timeout: 30_000 });
        const overflow = await horizontalOverflow(page);
        expect(
          overflow,
          `${lang}: ${overflow}px of sideways scroll at ${width}px`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  test("the four entries are equal peers, each with one action", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoHome(page);
    const cards = page.locator(ENTRY);
    await expect(cards).toHaveCount(4);
    for (const card of await cards.all()) {
      await expect(card).toBeVisible();
      await expect(card.locator("a")).toHaveCount(1);
      await expect(card.locator("a")).toBeVisible();
    }
  });

  for (const width of [1440, 1920] as const) {
    test(`the headline and both entrances stay in the first screen at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
      for (const lang of ["sv", "en"] as const) {
        await gotoHome(page);
        await setLang(page, lang);
        await expect(page.locator("main h1")).toBeInViewport();
        for (const entrance of await page.locator(AUDIENCE).all()) {
          await expect(
            entrance,
            `${lang}: an audience entrance is below the fold at ${width}px`,
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
    await answerPublicJobs(page);
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(page.locator(ENTRY).first()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator(ENTRY).first()).toBeVisible({ timeout: 30_000 });
    await page.goForward({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

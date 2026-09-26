// The signed-in header on an ordinary PC.
//
// Owner bug report (2026-09-26, "Första sidan skall välkomna arbetsgivaren"):
// on a PC the candidate's profile page had no top menu, everything sat to
// the left, and the menu that did open covered the whole screen. Reproduced
// on the loopback stack: the seven-destination header switched on at xl
// (1280px) and a Windows PC at the 125% display scaling Windows ships with
// has a CSS viewport of 1093px (1366 wide), 1152px (1440) or 1229px (1536).
// Between 1024 and 1279px the header showed nothing but a hamburger.
//
// These are MEASUREMENTS against the routed application on the stubbed
// backend (e2e/support/career-home-harness.ts), in both languages:
//
//   1. at every desktop width a Windows PC produces, the seven destinations
//      are in the bar, the hamburger is gone, and nothing overflows;
//   2. below the breakpoint the compact sheet is offered instead;
//   3. the sheet closes on its own: on Escape, on a back navigation, and when
//      the window grows past the breakpoint -- and it does NOT reappear when
//      the window shrinks again;
//   4. the sticky header never covers a field the browser scrolls to.
//
// Run:  E2E_BASE_URL=http://127.0.0.1:3200 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium \
//         bunx playwright test e2e/candidate-header-desktop.spec.ts --project=chromium

import { test, expect, type Page } from "@playwright/test";
import { mount, takeMountBookkeeping } from "./support/career-home-harness";

test.describe.configure({ timeout: 120_000 });

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(c.errors, c.errors.join("\n")).toEqual([]);
});

/** The CSS viewport widths that matter: 1024 is the breakpoint itself; 1093,
 *  1152 and 1229 are 1366/1440/1536-wide Windows laptops at 125% scaling;
 *  1280 is a 1920 monitor at 150%; 1536 is the same monitor at 125%. */
const DESKTOP_WIDTHS = [1024, 1093, 1152, 1229, 1280, 1536] as const;

const SEVEN = [
  "/my-career",
  "/passport",
  "/security-work",
  "/my-career/cv",
  "/jobs",
  "/career-center",
  "/academy",
];

async function settled(page: Page) {
  await page.locator("header").first().waitFor({ timeout: 20_000 });
  await page
    .locator('[data-candidate-app-nav="desktop"]')
    .first()
    .waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForTimeout(300);
}

function menuButton(page: Page) {
  return page.getByRole("button", { name: /Öppna menyn|Stäng menyn|Open menu|Close menu/ });
}

for (const lang of ["sv", "en"] as const) {
  test.describe(`signed-in header · ${lang}`, () => {
    for (const width of DESKTOP_WIDTHS) {
      test(`${width}px: the seven destinations are in the bar and nothing overflows`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await mount(page, "hub_active", { lang });
        await settled(page);

        const bar = page.locator('[data-candidate-app-nav="desktop"]');
        await expect(bar).toBeVisible();
        const links = bar.locator("a");
        await expect(links).toHaveCount(7);
        expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(
          SEVEN,
        );
        for (let i = 0; i < 7; i += 1) {
          const box = await links.nth(i).boundingBox();
          expect(box, `destination ${i} has a box`).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(
            box!.x + box!.width,
            `destination ${i} is inside the viewport`,
          ).toBeLessThanOrEqual(width);
          expect(box!.height, `destination ${i} is a 44px target`).toBeGreaterThanOrEqual(44);
        }
        // The account control shares the row and is reachable too.
        const account = page.getByRole("button", { name: /konto|account/i }).first();
        await expect(account).toBeVisible();
        const accountBox = await account.boundingBox();
        expect(accountBox!.x + accountBox!.width).toBeLessThanOrEqual(width);
        // No hamburger, no horizontal scroll: a bar that fits by scrolling
        // the page sideways is the defect in another form.
        await expect(menuButton(page)).toBeHidden();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "horizontal overflow").toBe(0);
        // The bar and the brand sit on ONE row: nothing wrapped under the logo.
        const headerRow = await page.locator("header").first().boundingBox();
        expect(headerRow!.height).toBeLessThanOrEqual(72);
      });
    }

    test("1023px: the compact sheet is offered instead, and closes by itself", async ({ page }) => {
      await page.setViewportSize({ width: 1023, height: 800 });
      await mount(page, "hub_active", { lang });
      await settled(page);
      await expect(page.locator('[data-candidate-app-nav="desktop"]')).toBeHidden();
      const button = menuButton(page);
      await expect(button).toBeVisible();

      // Escape closes it.
      await button.click();
      await expect(page.locator("#site-menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#site-menu")).toBeHidden();

      // Growing past the breakpoint closes it -- and shrinking back does not
      // bring it back. It used to be only CSS-hidden, with `open` still true.
      await button.click();
      await expect(page.locator("#site-menu")).toBeVisible();
      await page.setViewportSize({ width: 1100, height: 800 });
      await expect(page.locator('[data-candidate-app-nav="desktop"]')).toBeVisible();
      // The header must have SEEN the growth before the viewport shrinks
      // again: the media-query change is reported at the next rendering
      // frame, and two resizes inside one frame are, to the page, no resize
      // at all. aria-expanded is the header's own record of the sheet state;
      // the button itself is CSS-hidden past the breakpoint, so it is read
      // by its control relation rather than by role.
      await expect(page.locator('[aria-controls="site-menu"]')).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await page.setViewportSize({ width: 1023, height: 800 });
      await expect(page.locator("#site-menu")).toBeHidden();
      await expect(button).toHaveAttribute("aria-expanded", "false");

      // A navigation through the sheet, then Back: the sheet stays closed on
      // the page the person returns to.
      await button.click();
      await page.locator('#site-menu a[href="/my-career/cv"]').click();
      await page.waitForURL(/\/my-career\/cv$/);
      await expect(page.locator("#site-menu")).toBeHidden();
      await page.goBack();
      await page.waitForURL(/\/my-career$/);
      await expect(page.locator("#site-menu")).toBeHidden();
    });
  });
}

test("the sticky header never covers a field the browser scrolls to", async ({ page }) => {
  await page.setViewportSize({ width: 1093, height: 600 });
  await mount(page, "hub_active", { lang: "sv" });
  await settled(page);
  // scroll-padding-top is the page's promise; measure it rather than the class.
  const padding = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollPaddingTop,
  );
  expect(padding).toBe("80px");
  // Focus something far down the page and check the header did not land on it.
  const target = page
    .locator("a, button")
    .filter({ hasText: /Redigera CV|Edit CV/ })
    .first();
  await target.focus();
  await page.waitForTimeout(200);
  const box = await target.boundingBox();
  const header = await page.locator("header").first().boundingBox();
  expect(box!.y, "the focused control sits below the sticky header").toBeGreaterThanOrEqual(
    header!.y + header!.height,
  );
});

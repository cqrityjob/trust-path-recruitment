import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const routes = ["/about", "/employers", "/contact"] as const;

async function setLanguage(page: Page, lang: "sv" | "en") {
  await page.evaluate((value) => localStorage.setItem("cqrityjob.lang", value), lang);
  await page.reload({ waitUntil: "networkidle" });
}

test.describe("premium public landings", () => {
  for (const route of routes) {
    test(`${route} has one h1 and no horizontal overflow`, async ({ page }) => {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await expect(page.locator("main h1")).toHaveCount(1);
      for (const width of [375, 640, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          `overflow on ${route} at ${width}px`,
        ).toBe(0);
      }
    });
  }

  test("all three pages have complete English compositions", async ({ page }) => {
    const expected = ["Why CQrityjob exists", "What CQrityjob is building", "Let us start"];
    for (let index = 0; index < routes.length; index += 1) {
      await page.goto(`${BASE}${routes[index]}`, { waitUntil: "networkidle" });
      await setLanguage(page, "en");
      await expect(page.locator("main h1")).toContainText(expected[index]!);
    }
  });

  test("employer services stay unlinked until their routes and gates exist", async ({ page }) => {
    await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
    await expect(page.locator('main a[href^="/employers/"]')).toHaveCount(0);
    await expect(page.getByText("Under uppbyggnad")).toHaveCount(4);
  });

  test("contact is a working direct route, not a dead form", async ({ page }) => {
    await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
    await expect(page.locator("main form")).toHaveCount(0);
    await expect(page.locator('main a[href^="mailto:info@cqrityjob.com"]')).toHaveCount(2);
  });
});

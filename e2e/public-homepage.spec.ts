import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SECTION_ORDER = [
  "hero",
  "starting-point",
  "security-passport",
  "path",
  "employers",
  "record",
  "close",
];

async function setLanguage(page: Page, lang: "sv" | "en") {
  await page.evaluate((value) => localStorage.setItem("cqrityjob.lang", value), lang);
  await page.reload({ waitUntil: "networkidle" });
}

test.describe("premium public homepage", () => {
  test.beforeEach(async ({ page }) => page.goto(`${BASE}/`, { waitUntil: "networkidle" }));

  test("uses the approved seven-band narrative", async ({ page }) => {
    const ids = await page
      .locator("main > section")
      .evaluateAll((sections) => sections.map((section) => section.id));
    expect(ids).toEqual(SECTION_ORDER);
    await expect(page.locator("main h1")).toHaveText("Bättre karriärbeslut. Tryggare rekrytering.");
  });

  test("has no horizontal overflow at the five contract widths", async ({ page }) => {
    for (const width of [375, 640, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        `overflow at ${width}px`,
      ).toBe(0);
    }
  });

  test("renders equivalent Swedish and English compositions", async ({ page }) => {
    await setLanguage(page, "en");
    await expect(page.locator("main h1")).toHaveText(
      "Better career decisions. More confident hiring.",
    );
    await expect(page.locator("main > section")).toHaveCount(7);
    await expect(page.locator("main")).not.toContainText("Utforska säkerhetsyrken");
  });

  test("ships only destinations that exist now", async ({ page }) => {
    expect(await page.locator('main a[href*="signup"]').count()).toBe(0);
    expect(await page.locator('main a[href="/security-passport"]').count()).toBe(0);
    expect(await page.locator('main a[href="/career-discovery"]').count()).toBe(0);
    await expect(page.locator('#hero a[href="/career-center"]')).toHaveText(
      /Utforska säkerhetsyrken/,
    );
    await expect(page.locator('#employers a[href="/employers"]')).toBeVisible();
  });

  test("keeps controls usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const links = page.locator("#hero a");
    for (let index = 0; index < (await links.count()); index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

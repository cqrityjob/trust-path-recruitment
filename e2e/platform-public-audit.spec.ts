import { test, expect } from "@playwright/test";
import {
  installBoundary,
  answerPublicJobs,
  horizontalOverflow,
} from "./support/public-entry-harness";
import fs from "node:fs";
const paths = [
  "/",
  "/careers",
  "/security-passport",
  "/sakerhetsarbete",
  "/employers",
  "/about",
  "/contact",
  "/integritetspolicy",
  "/villkor",
  "/login",
  "/signup",
  "/reset-password",
  "/admin/login",
];
for (const lang of ["sv", "en"]) {
  test(`public pages and keyboard entry (${lang})`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await installBoundary(page, {});
    await answerPublicJobs(page);
    await page.addInitScript((l) => localStorage.setItem("cqrityjob.lang", l), lang);
    const dir = `artifacts/platform-ux/public-audit/${info.project.name}-${lang}`;
    fs.mkdirSync(dir, { recursive: true });
    for (const path of paths) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(1);
      const skip = page.getByRole("link", {
        name: lang === "sv" ? "Hoppa till innehållet" : "Skip to content",
      });
      if (await skip.count()) {
        await skip.focus();
        await skip.press("Enter");
        await expect(page.locator("#main-content")).toBeFocused();
      }
      await page.screenshot({ path: `${dir}/${path.slice(1) || "home"}.png`, fullPage: false });
    }
  });
}

// 640 CSS pixels is the reflow equivalent of a 1280px desktop at 200% browser zoom.
for (const width of [768, 640]) {
  test(`tablet / 200% reflow at ${width} CSS pixels`, async ({ page }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop reflow coverage");
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await installBoundary(page, {});
    await answerPublicJobs(page);
    for (const lang of ["sv", "en"]) {
      await page.addInitScript((l) => localStorage.setItem("cqrityjob.lang", l), lang);
      for (const path of paths) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(page.locator("h1").first()).toBeVisible();
        expect(await horizontalOverflow(page), path + " " + lang).toBeLessThanOrEqual(1);
      }
    }
  });
}

// Deterministic browser evidence; synthetic catalogue, no backend writes.
// Before images were captured on f785dd5 before applying this implementation.
import { chromium, expect } from "@playwright/test";
import { installJobsFixture } from "../e2e/support/jobs-fixture";
import { mkdirSync } from "node:fs";
const browser = await chromium.launch();
const output = "docs/jobs-product-experience/screenshots";
mkdirSync(output, { recursive: true });
for (const lang of ["sv", "en"] as const) {
  const page = await browser.newPage();
  await installJobsFixture(page, lang);
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(`${process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100"}/jobs`);
    await page
      .getByRole("heading", {
        name: lang === "sv" ? "Hitta jobb inom säkerhet" : "Find jobs in security",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("link", {
        name: lang === "sv" ? "Säkerhetschef" : "Head of security",
        exact: true,
      })
      .first()
      .waitFor();
    if (width >= 1024) await page.locator('[data-job-detail="test-sakerhetschef"]').waitFor();
    await page.screenshot({ path: `${output}/after-${lang}-${width}.png`, fullPage: true });
  }
  await page
    .getByRole("link", { name: lang === "sv" ? "Säkerhetschef" : "Head of security", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/jobs\/test-sakerhetschef/);
  await page
    .getByRole("heading", {
      name: lang === "sv" ? "Säkerhetschef" : "Head of security",
      exact: true,
    })
    .waitFor();
  await page.locator('[data-job-detail="test-sakerhetschef"]').waitFor();
  await page
    .getByRole("heading", {
      name: lang === "sv" ? "Säkerhetschef" : "Head of security",
      level: 1,
      exact: true,
    })
    .waitFor();
  await page.screenshot({ path: `${output}/detail-${lang}-390.png`, fullPage: true });
  await page.close();
}
await browser.close();

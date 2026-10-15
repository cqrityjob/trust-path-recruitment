import { test, expect } from "@playwright/test";
import {
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  assertNoRefusals,
  horizontalOverflow,
} from "./support/public-entry-harness";
import { table, SLUG } from "./support/employer-portal-fixture";

for (const lang of ["sv", "en"]) {
  test(`dense employer tables and actions fit at the current viewport (${lang})`, async ({
    page,
  }, info) => {
    const refusals = await installBoundary(page, table);
    await plantSession(page, await observeSupabaseStorageKey(page));
    await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
    for (const path of ["jobs", "applications"]) {
      await page.goto(`/employer/${SLUG}/${path}`);
      if (path === "applications" && page.viewportSize()!.width < 768) {
        await expect(
          page.getByTestId("candidate-table").locator("ul.md\\:hidden > li").first(),
        ).toBeVisible();
      } else {
        await expect(page.locator("table")).toBeVisible();
        await expect(page.locator("table tbody tr").first()).toBeVisible();
      }
      expect(await horizontalOverflow(page)).toBe(0);
      // A larger button must grow its table cell, never clip into adjacent rows.
      const clipped = await page.locator("table td button:visible").evaluateAll((buttons) =>
        buttons
          .filter((b) => {
            const rect = b.getBoundingClientRect();
            const cell = b.closest("td")!.getBoundingClientRect();
            return rect.top < cell.top - 1 || rect.bottom > cell.bottom + 1;
          })
          .map((b) => b.textContent),
      );
      expect(clipped).toEqual([]);
      const controls = page.locator("main button:visible");
      expect(await controls.count()).toBeGreaterThan(0);
      await page.screenshot({
        path: `artifacts/platform-ux/dense/${info.project.name}-${lang}-${path}.png`,
        fullPage: true,
      });
    }
    assertNoRefusals(refusals);
  });
}

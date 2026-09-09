// PR #211 — visual evidence for the My Career hub, from the REAL route.
//
// Every image below is a browser screenshot of the routed application
// running against the same stubbed backend the assertion spec uses
// (e2e/support/career-home-harness.ts): synthetic fixtures, no database,
// no hosted project. There is no component harness and no mockup here —
// the point of the evidence is the real visual hierarchy, and a component
// rendered on its own has none.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test \
//         e2e/my-career-hub-screens.spec.ts --project=chromium
//
// Images land in docs/my-career-home/screenshots/pr211/.

import { test, expect } from "@playwright/test";
import { mount, takeMountBookkeeping } from "./support/career-home-harness";

const OUT = "docs/my-career-home/screenshots/pr211";

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(c.unmatched, `unstubbed: ${[...new Set(c.unmatched)].join(", ")}`).toEqual([]);
  expect(c.errors, c.errors.join("\n")).toEqual([]);
});

test.describe("PR #211 evidence", () => {
  test("before · the long landing page at 1440 and 375", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, "established");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/00-before-1440-sv.png`, fullPage: true });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/00-before-375-sv.png`, fullPage: true });
  });
});

// PR #211 — visual evidence for the My Career hub, from the REAL route.
//
// Every image below is a browser screenshot of the routed application
// running against the same stubbed backend the assertion spec uses
// (e2e/support/career-home-harness.ts): synthetic fixtures, no database,
// no hosted project, invented people and invented companies. There is no
// component harness and no mockup here — the point of the evidence is the
// real visual hierarchy, and a component rendered on its own has none.
//
// ── THE "BEFORE" IMAGES ARE NOT REPRODUCIBLE FROM THIS BRANCH ─────────
//
// 00-before-* were captured from the same harness at 0d697ea, the commit
// this branch starts from, BEFORE any change — which is the only moment
// they could be taken. The scenario that produced them is the `established`
// case below at the same two viewports; the test is kept so the pairing is
// legible, and it writes the "after" halves.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test \
//         e2e/my-career-hub-screens.spec.ts --project=chromium
//
// Images land in docs/my-career-home/screenshots/pr211/.

import { test, expect } from "@playwright/test";
import { mount, ok, takeMountBookkeeping } from "./support/career-home-harness";

const OUT = process.env.HUB_SHOTS ?? "docs/my-career-home/screenshots/pr211";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(c.unmatched, `unstubbed: ${[...new Set(c.unmatched)].join(", ")}`).toEqual([]);
  expect(c.errors, c.errors.join("\n")).toEqual([]);
});

/** The page has to have SETTLED before it is photographed. Every module
 *  resolves from its own query, and a screenshot taken mid-flight would
 *  show skeletons the owner would reasonably read as the design. */
async function settled(page: import("@playwright/test").Page) {
  await page.locator("[data-hub-status-grid]").waitFor({ timeout: 20_000 });
  await expect(page.locator("[data-hub-loading]")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(500);
}

test.describe("PR #211 · the hub", () => {
  test.describe.configure({ timeout: 120_000 });

  // ── THE MAIN PAIR: every area occupied, both languages, both widths ──
  for (const lang of ["sv", "en"] as const) {
    test(`hub · every area occupied · ${lang}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await mount(page, "hub_active", { lang });
      await settled(page);
      await page.screenshot({ path: `${OUT}/01-hub-1440-${lang}.png`, fullPage: true });

      // The page must be a DASHBOARD, not a document. Asserted, not eyeballed:
      // the same measurement that showed 2838px before the correction.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height, `hub at 1440 (${lang}) is ${height}px`).toBeLessThan(1800);

      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/03-hub-375-${lang}.png`, fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at 375 (${lang})`).toBeLessThanOrEqual(0);
    });
  }

  // ── THE STATE A REAL PILOT CANDIDATE STARTS IN ──────────────────────
  test("hub · a brand-new candidate", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mount(page, "new_user", { overrides: { listMyShares: ok([]), listMyCvs: ok([]) } });
    await settled(page);
    await page.screenshot({ path: `${OUT}/05-new-candidate-1440-sv.png`, fullPage: true });

    // Four empty modules, four different sentences, four live invitations —
    // and not one of them a failure state.
    await expect(page.locator("[data-hub-module]")).toHaveCount(4);
    await expect(page.locator("[data-hub-go]")).toHaveCount(4);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/06-new-candidate-375-sv.png`, fullPage: true });
  });

  // ── THE STATE THE MOMENT AFTER THE FIRST SAVE ───────────────────────
  test("hub · the first merit is saved", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mount(page, "first_merit");
    await settled(page);
    await page.screenshot({ path: `${OUT}/07-first-merit-1440-sv.png`, fullPage: true });
    // The merit is counted, and honestly: registered, not source-confirmed.
    const passport = page.locator("[data-passport-summary]");
    await expect(passport.locator('[data-merit-count="total-current"]')).toContainText("1");
    await expect(passport.locator('[data-merit-count="verified"]')).toContainText("0");
  });

  // ── A FAILED LOAD IS NOT AN EMPTY ONE ───────────────────────────────
  test("hub · reads that failed say so, module by module", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mount(page, "hub_active", {
      overrides: { listMyCvs: { error: "stubbed failure" }, listMyShares: { error: "stubbed" } },
    });
    await page.locator("[data-hub-status-grid]").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/08-unavailable-1440-sv.png`, fullPage: true });

    // Two modules failed and say so with a retry; the other two are
    // untouched, which is the whole point of per-source state.
    await expect(page.locator('[data-hub-module="cv"] [data-failed]')).toBeVisible();
    await expect(page.locator('[data-hub-module="sharing"] [data-failed]')).toBeVisible();
    await expect(page.locator('[data-hub-module="cv"] [data-retry]')).toBeVisible();
    await expect(page.locator('[data-hub-module="applications"]')).toContainText(
      "aktiva ansökningar",
    );
    // Never "you have none" for a read that failed.
    await expect(page.locator('[data-hub-module="cv"]')).not.toContainText(
      "Du har inget sparat CV",
    );
  });

  // ── THE DESTINATIONS, REACHED BY CLICKING ───────────────────────────
  //
  // Not asserted from the table — clicked, in a browser, so a tab that
  // resolves in the config and 404s in the router cannot pass.
  test("hub · every tab navigates, and marks itself current on arrival", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mount(page, "hub_active", {
      overrides: {
        // The two destinations under /my-career that the hub reaches and
        // this stub table does not otherwise cover.
        prepareMyCv: ok({ ready: false, missing: [] }),
        listMyApplicationDisclosures: ok([]),
      },
    });
    await settled(page);

    for (const [key, url, shot] of [
      ["cv", "/my-career/cv", "10-cv-list-1440-sv"],
      ["applications", "/my-career/applications", "12-applications-1440-sv"],
    ] as const) {
      await page.locator('[data-my-career-hub-nav] [data-hub-key="overview"]').click();
      await page.waitForURL("**/my-career");
      await page.locator(`[data-my-career-hub-nav] [data-hub-key="${key}"]`).click();
      await page.waitForURL(`**${url}`);
      await page.waitForTimeout(800);
      // The strip survives the navigation and moves its mark with the
      // reader — the property the whole shell exists for.
      await expect(page.locator(`[data-hub-key="${key}"]`)).toHaveAttribute("aria-current", "page");
      await expect(page.locator('[data-hub-key="overview"]')).not.toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.locator("h1")).toHaveCount(1);
      await page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: true });
    }
  });

  // ── THE PASSPORT ITSELF, ONE MERIT IN ───────────────────────────────
  test("passport · the holder's record after the first merit", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mount(page, "first_merit", { path: "/passport", ready: "h1" });
    await page.waitForTimeout(1500);
    await expect(page.locator("h1")).toHaveCount(1);
    await page.screenshot({ path: `${OUT}/09-passport-first-merit-1440-sv.png`, fullPage: true });
  });
});

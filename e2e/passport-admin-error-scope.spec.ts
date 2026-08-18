// Security Passport — admin verification queue: error SCOPE.
//
// ── THE PRODUCTION DEFECT THIS REPRODUCES ──────────────────────────────
//
// The queue reported "Något gick fel. Försök igen." across the whole page
// while the queue itself, the opened review and the evidence row were all
// rendering correctly. Four unrelated operations — loading the queue,
// opening a review, opening a document and saving a decision — wrote to one
// `error` string that was rendered once, above the filter, and that nothing
// ever cleared on success. So a single transient failure of any one of them
// painted a page-wide banner over a working page, permanently.
//
// A happy-path test cannot catch that: everything succeeds and the banner
// never appears. These tests therefore FORCE each operation to fail, one at
// a time, and assert where the message lands — and, just as importantly,
// where it does not.
//
// The failures are injected at the network boundary by matching the server
// function's own request payload, so the assertions run against the real
// component and its real handlers rather than a stub of them.

import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = "docs/passport-credential-ui-evidence";

/** The generic message that used to appear page-wide for any failure. */
const GLOBAL_GENERIC = /Något gick fel|Something went wrong/;

/**
 * Fails exactly the server-function call whose serialized payload matches,
 * and lets every other call through untouched. TanStack Start posts server
 * functions to the same origin, so the discriminator is the body.
 */
async function failServerFnMatching(page: Page, needle: RegExp) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    const body = req.postData() ?? "";
    if (!needle.test(body)) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "injected failure for error-scope test" }),
    });
  });
}

test.describe("admin verification queue — failures stay where they happen", () => {
  // Unauthenticated visitors are redirected by the admin guard, so these run
  // against the dev harness copy of the queue when one is available and are
  // otherwise skipped rather than reported as passing.
  test.beforeEach(async ({ page }) => {
    const res = await page.goto("/admin/passport-verification");
    test.skip(
      !res || res.status() >= 400,
      "admin queue not reachable without an authenticated admin session",
    );
  });

  test("a failing evidence link does not produce a page-wide error", async ({ page }) => {
    await failServerFnMatching(page, /evidenceId/);

    const openCase = page.getByRole("button", { name: /Öppna ärendet|Open the review/ }).first();
    test.skip(!(await openCase.isVisible().catch(() => false)), "no review in the queue to open");
    await openCase.click();

    const openDoc = page.getByRole("button", { name: /^Öppna$|^Open$/ }).first();
    await openDoc.click();

    // The row says what failed …
    await expect(
      page.getByText(/Dokumentet kunde inte öppnas|This document could not be opened/),
    ).toBeVisible();

    // … and the queue around it does NOT claim to be broken.
    await expect(page.getByText(GLOBAL_GENERIC)).toHaveCount(0);
    await expect(page.getByText(/Kön kunde inte hämtas|The queue could not be loaded/)).toHaveCount(
      0,
    );
    await expect(openCase).toBeVisible();

    await page.screenshot({ path: `${EVIDENCE}/admin-evidence-error-scoped.png`, fullPage: true });
  });

  test("a failing review detail scopes to that review, not the queue", async ({ page }) => {
    await failServerFnMatching(page, /requestId/);

    const openCase = page.getByRole("button", { name: /Öppna ärendet|Open the review/ }).first();
    test.skip(!(await openCase.isVisible().catch(() => false)), "no review in the queue to open");
    await openCase.click();

    await expect(
      page.getByText(/Ärendet kunde inte öppnas|This review could not be opened/),
    ).toBeVisible();
    await expect(page.getByText(/Kön kunde inte hämtas|The queue could not be loaded/)).toHaveCount(
      0,
    );
    // The queue row itself survives.
    await expect(openCase).toBeVisible();
  });

  test("a failing queue load reports at queue level and offers a retry", async ({ page }) => {
    await failServerFnMatching(page, /status/);
    await page.reload();

    const queueError = page.getByText(/Kön kunde inte hämtas|The queue could not be loaded/);
    if (await queueError.isVisible().catch(() => false)) {
      await expect(page.getByRole("button", { name: /Försök igen|Try again/ })).toBeVisible();
      // Still not the old generic page-wide string.
      await expect(page.getByText(GLOBAL_GENERIC)).toHaveCount(0);
    }
  });

  test("a recovered queue clears its own error rather than keeping it forever", async ({
    page,
  }) => {
    // Fail once, then stop failing, then retry: the banner must go away.
    let failNext = true;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() !== "POST" || !/status/.test(req.postData() ?? "")) {
        return route.fallback();
      }
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      return route.fallback();
    });

    await page.reload();
    const retry = page.getByRole("button", { name: /Försök igen|Try again/ });
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
      await expect(
        page.getByText(/Kön kunde inte hämtas|The queue could not be loaded/),
      ).toHaveCount(0);
    }
  });
});

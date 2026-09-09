/**
 * E1 browser evidence — the screenshots, and nothing that is not evidence.
 *
 * Ten captures, each one a state a reviewer would otherwise have to take on
 * trust. They SUPPORT the assertions in employer-process-continuity.spec.ts;
 * they do not replace them, and nothing here asserts.
 *
 * Everything shown is synthetic and local. No real candidate, name, address or
 * CV appears in any capture, and no filename contains a person's name.
 *
 * Reproduce (see artifacts/employer-continuity-e1/INDEX.md):
 *   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
 *        -f scripts/fixtures/interview-journey-fixture.sql
 *   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
 *        -f scripts/fixtures/employer-process-continuity-fixture.sql
 *   bun run dev -- --port 3117 --strictPort
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3117 \
 *     bunx playwright test e2e/employer-process-continuity-evidence.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to capture evidence against the local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE),
  "Evidence is captured only against localhost.",
);

const OUT = "artifacts/employer-continuity-e1";
const PASSWORD = "LocalJourney!2026";
const OWNER = "journey@local.test";
const MEMBER = "interviewer@local.test";
const SLUG = "journey-ab";

const F = {
  appUnderway: "e1000000-0000-4000-8000-00000000aa01",
  caseUnderway: "e1000000-0000-4000-8000-00000000cc01",
  appMaterial: "e1000000-0000-4000-8000-00000000aa02",
  appNothing: "e1000000-0000-4000-8000-00000000aa03",
  caseStandalone: "e1000000-0000-4000-8000-00000000cc03",
  appFinalised: "9e000000-0000-4000-8000-00000000e001",
} as const;

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
}

const main = (page: Page) => page.locator("main").first();
const strip = (page: Page) => page.locator('section[aria-labelledby="continuity-heading"]');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function openApplication(page: Page, id: string) {
  await page.goto(`/employer/${SLUG}/applications/${id}`);
  await expect(strip(page)).toBeVisible({ timeout: 30_000 });
}

test("01-06 · the Swedish desktop walk", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, OWNER);

  // 1. The recruitment-linked Candidate 360.
  await openApplication(page, F.appUnderway);
  await shot(page, "01-sv-1440-candidate-360-linked");

  // 2. The linked interview, reached with preserved context.
  await page.goto(`/employer/${SLUG}/interview-intelligence/${F.caseUnderway}`);
  await expect(main(page)).toContainText(/Kopplad till ansökan/, { timeout: 30_000 });
  await shot(page, "02-sv-1440-interview-linked-context");

  // 3. Back to the SAME application.
  await main(page)
    .getByRole("link", { name: /Tillbaka till ansökan/i })
    .click();
  await page.waitForURL(new RegExp(`applications/${F.appUnderway}`), { timeout: 30_000 });
  // Wait for the page to have actually drawn, not merely for the URL to have
  // changed: a capture taken between the two is a screenshot of the screen the
  // recruiter just left.
  await expect(strip(page)).toBeVisible({ timeout: 30_000 });
  await expect(main(page)).toContainText(/Processen för den här ansökan/);
  await shot(page, "03-sv-1440-returned-to-application");

  // 4. Report material, which is not a report.
  await openApplication(page, F.appMaterial);
  await shot(page, "04-sv-1440-report-material-ready");

  // 5. A finalised report, which is.
  await openApplication(page, F.appFinalised);
  await shot(page, "05-sv-1440-report-finalised");

  // 6. An intentionally standalone interview.
  await page.goto(`/employer/${SLUG}/interview-intelligence/${F.caseStandalone}`);
  await expect(main(page)).toContainText(/Fristående intervju/, { timeout: 30_000 });
  await shot(page, "06-sv-1440-standalone-interview");
});

test("07 · a member, and the work they are not offered", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, MEMBER);
  await openApplication(page, F.appNothing);
  await shot(page, "07-sv-1440-member-permission-state");
});

test("08 · a failed read, named rather than zeroed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, OWNER);
  await page.route("**/_serverFn/**", async (route) => {
    const segment = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    let decoded = "";
    try {
      decoded = Buffer.from(decodeURIComponent(segment), "base64").toString("utf8");
    } catch {
      decoded = "";
    }
    if (decoded.includes("listInterviewCasesForApplication")) {
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return;
    }
    await route.continue();
  });
  await openApplication(page, F.appUnderway);
  await expect(strip(page)).toContainText(/Kunde inte hämtas/, { timeout: 30_000 });
  await shot(page, "08-sv-1440-partial-read-failure");
});

test("09 · nothing started, and no funnel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, OWNER);
  await openApplication(page, F.appNothing);
  await shot(page, "09-sv-1440-nothing-started");
});

test("10 · the English mobile journey at 375", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, OWNER);
  await page.goto(`/employer/${SLUG}/applications/${F.appUnderway}`);
  await expect(strip(page)).toBeVisible({ timeout: 30_000 });
  // Scoped to the visible language group: at 375 there is a second copy inside
  // the navigation drawer, and a name-based lookup opens the drawer instead.
  await page
    .getByRole("group", { name: /Språk|Language/i })
    .locator("visible=true")
    .first()
    .getByRole("button", { name: /^en$/i })
    .click();
  await expect(strip(page)).toContainText(/This application's process/, { timeout: 15_000 });
  await shot(page, "10-en-375-candidate-360");

  // And the focused primary action, so the focus ring is evidence rather than
  // a claim.
  const cta = strip(page).getByRole("link").first();
  await expect(cta).toBeVisible({ timeout: 15_000 });

  // REACHED BY KEYBOARD, not by locator.focus().
  //
  // The ring is a `focus-visible` style, and Chromium does not apply
  // `:focus-visible` to focus set programmatically -- so a capture taken after
  // .focus() shows a focused control with no ring and proves the opposite of
  // what it claims. Tabbing to it is also the stronger evidence: it shows the
  // control is REACHABLE in the focus order, not merely focusable.
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await cta.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  await expect(cta).toBeFocused();
  await page.screenshot({ path: `${OUT}/11-en-375-primary-action-focus.png` });
});

/**
 * The public India page, in CI: no backend needed and nothing written.
 * English first, an example that says it is one, the sign-up intent that
 * survives safeReturnPath, no OCR engine fetched, and no horizontal scroll
 * on a phone. The signed-in journey is e2e/india-entry-journey.spec.ts.
 *
 * Served by the job's own dev server (BASE, E2E_BASE_URL) behind the
 * public-entry boundary: every server function is answered here, a Supabase
 * host is unreachable, and anything the page grows unasked fails the test.
 *
 * The two hydration tests hold every script until AFTER the click, so the
 * tap lands on the server-rendered link with no handler attached -- the slow
 * phone case. What must survive it is in the URL, not in a click handler.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { BASE, assertNoRefusals, installBoundary } from "./support/public-entry-harness";

const PAGE = `${BASE}/security-passport/india`;
const INTENT = "/passport/start?market=IN";
/** Nothing leaves the page. Version 1 measures nothing, so the funnel call that
 *  used to be answered here is no longer made, and the boundary refuses any
 *  server function the page grows unasked, that one included. */
const TABLE = {};

/** Hold every script until released. Registered after the boundary, so it is
 *  consulted first and hands everything else back to it. */
async function holdScripts(page: Page) {
  const held: string[] = [];
  let released = false;
  await page.route("**/*", (route: Route) => {
    if (released || route.request().resourceType() !== "script") return route.fallback();
    held.push(route.request().url());
    // Never answered: the document that asked for it is navigated away from.
  });
  return {
    held,
    release: () => {
      released = true;
    },
  };
}

test("the India page: English, labelled example, the right intent, no OCR", async ({ page }) => {
  const refusals = await installBoundary(page, TABLE);
  const fetched: string[] = [];
  page.on("request", (r) => fetched.push(r.url()));
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your security qualifications, in one place",
  );
  await expect(page.locator("[data-india-example-label]")).toHaveText("Example");
  await expect(page.locator("[data-india-example]")).toContainText("Q7101");
  await expect(page.locator("[data-india-example]")).toContainText("India");
  await expect(page.locator("[data-india-example]")).not.toContainText(/verified/i);
  const cta = page.getByRole("link", { name: "Create my Security Passport" }).first();
  await expect(cta).toHaveAttribute(
    "href",
    `/signup?redirect=${encodeURIComponent(`${INTENT}&lang=en`)}&lang=en`,
  );
  await expect(page.getByRole("link", { name: /SIRA: Security Cadre Card/ })).toHaveAttribute(
    "href",
    "https://www.sira.gov.ae/en/services/security-cadre-card",
  );
  await expect(page.locator("main")).not.toContainText(/guaranteed|Dubai-ready|testimonial/i);
  expect(fetched.filter((u) => /hayat-ocr|tesseract|pdf\.worker|traineddata/.test(u))).toEqual([]);
  // Version 1 measures nothing: once the page is idle (the arrival effect has run
  // long since), no server function was called and no "once" marker was written.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  expect(
    fetched.filter((u) => u.includes("/_serverFn/")),
    "the page made a server-function call: version 1 measures nothing",
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith("cqj:funnel")),
    ),
    "a statistics marker was written to sessionStorage",
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  assertNoRefusals(refusals);
});

test("a first-time visitor who taps the CTA before hydration signs up in English", async ({
  page,
}) => {
  const refusals = await installBoundary(page, TABLE);
  const gate = await holdScripts(page);
  await page.goto(PAGE, { waitUntil: "commit" });
  const cta = page.getByRole("link", { name: "Create my Security Passport" }).first();
  await expect(cta).toBeVisible();
  // Genuinely before hydration: the app's scripts are still held, and the
  // visitor has chosen nothing on this device.
  expect(gate.held.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("cqrityjob.lang"))).toBeNull();

  gate.release();
  await cta.click();
  await page.waitForURL((url) => url.pathname === "/signup");
  const url = new URL(page.url());
  expect(url.searchParams.get("lang")).toBe("en");
  expect(url.searchParams.get("redirect")).toBe(`${INTENT}&lang=en`);
  // Registration is in English, and stays English for the rest of the visit:
  // the setup the sign-up returns to carries the language too.
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => localStorage.getItem("cqrityjob.lang"))).toBe("en");
  assertNoRefusals(refusals);
});

test("an explicit Swedish choice survives the same pre-hydration tap", async ({ page }) => {
  const refusals = await installBoundary(page, TABLE);
  await page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "sv"));
  const gate = await holdScripts(page);
  await page.goto(PAGE, { waitUntil: "commit" });
  // The server cannot know the choice, so the tapped link says English.
  const cta = page.getByRole("link", { name: "Create my Security Passport" }).first();
  await expect(cta).toHaveAttribute("href", /&lang=en$/);
  expect(gate.held.length).toBeGreaterThan(0);

  gate.release();
  await cta.click();
  await page.waitForURL((url) => url.pathname === "/signup");
  expect(new URL(page.url()).searchParams.get("lang")).toBe("en");
  // ...and the visitor's own choice still wins over it.
  await expect(page.getByRole("textbox", { name: "E-post", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  expect(await page.evaluate(() => localStorage.getItem("cqrityjob.lang"))).toBe("sv");
  assertNoRefusals(refusals);
});

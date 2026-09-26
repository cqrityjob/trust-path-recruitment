/**
 * The public India page, in CI: no backend needed and nothing written.
 * English first, an example that says it is one, the sign-up intent that
 * survives safeReturnPath, no OCR engine fetched, and no horizontal scroll
 * on a phone. The signed-in journey is e2e/india-entry-journey.spec.ts.
 */
import { test, expect } from "@playwright/test";

test("the India page: English, labelled example, the right intent, no OCR", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => fetched.push(r.url()));
  await page.goto("/security-passport/india");
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
    `/signup?redirect=${encodeURIComponent("/passport/start?market=IN")}`,
  );
  await expect(page.getByRole("link", { name: /SIRA: Security Cadre Card/ })).toHaveAttribute(
    "href",
    "https://www.sira.gov.ae/en/services/security-cadre-card",
  );
  await expect(page.locator("main")).not.toContainText(/guaranteed|Dubai-ready|testimonial/i);
  expect(fetched.filter((u) => /hayat-ocr|tesseract|pdf\.worker|traineddata/.test(u))).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

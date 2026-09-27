import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// Real Auth + PostgREST + Storage + RLS, with synthetic fixture data only.
// Run job-back-navigation-fixture.sql and jobs-application-proof-fixture.sql
// on a disposable local stack. No provider is configured: the receipt must
// exist in-app while its email delivery must remain truthfully not configured.
const base = process.env.E2E_BASE_URL ?? "";
const api = process.env.E2E_SUPABASE_URL ?? "";
const loopback = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
test.skip(
  process.env.E2E_LOCAL_STACK !== "1" || !loopback.test(base) || !loopback.test(api),
  "Disposable loopback stack only.",
);
const slug = "jobbnav-sakerhetschef-stockholm";
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

test("real sign-in, PDF application, confirmation, saved application and duplicate state", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  await page.goto(`${base}/jobs/${slug}?from=location%3DStockholm`);
  await page.getByRole("link", { name: "Sign in to apply", exact: true }).click();
  await page.getByLabel(/^email$/i).fill("jonna.jobb@test.local");
  await page.getByLabel(/^password$/i).fill("LocalJourney!2026");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.setInputFiles("#apply-cv", {
    name: "synthetic-proof-cv.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page
    .getByLabel("Cover note", { exact: false })
    .fill("Synthetic isolated jobs UX application proof.");
  await page.getByText("I consent to my application and CV being shared").click();
  await dialog.getByRole("button", { name: "Submit application", exact: true }).click();
  await expect(dialog.getByText("Application submitted", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const historyLink = dialog.getByRole("link", { name: /application/i });
  const destination = await historyLink.getAttribute("href");
  expect(destination).toMatch(/\/my-career\/applications\?application=/);
  const applicationId = new URL(destination!, base).searchParams.get("application");
  mkdirSync("test-results/jobs-live-proof", { recursive: true });
  await page.screenshot({
    path: "test-results/jobs-live-proof/real-application-confirmation.png",
    fullPage: false,
  });
  await historyLink.click();
  await expect(page).toHaveURL(/\/my-career\/applications\?application=/);
  await expect(page.getByText("Head of security, Stockholm", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({
    path: "test-results/jobs-live-proof/real-saved-application.png",
    fullPage: false,
  });
  await page.goto(`${base}/jobs/${slug}`);
  await expect(
    page.getByText("You already have an active application for this role.", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Apply for this job", exact: true })).toHaveCount(
    0,
  );
  writeFileSync(
    "test-results/jobs-live-proof/application-proof.json",
    JSON.stringify(
      {
        applicationId,
        slug,
        authentication: "real local GoTrue",
        storage: "real local private bucket",
        submission: "real server function and database",
        confirmation: "passed",
        savedApplication: "passed",
        duplicateState: "passed",
      },
      null,
      2,
    ),
  );
});

test("employer preview shows the same real vacancy and company content as the public ad", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  await page.goto(`${base}/jobs/${slug}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Head of security, Stockholm");
  const publicTitle = await page.getByRole("heading", { level: 1 }).innerText();
  const requirement = "Erfarenhet av säkerhetsledning.";
  await expect(page.getByText(requirement, { exact: true })).toBeVisible();
  await expect(page.getByText("Jobbnav Test AB", { exact: true }).first()).toBeVisible();
  const edit = "/employer/jobbnav-test/jobs/b7200000-0000-4000-8000-000000000003/edit?step=review";
  await page.goto(`${base}/login?redirect=${encodeURIComponent(edit)}`);
  await page.getByLabel(/^email$/i).fill("jonna.jobb@test.local");
  await page.getByLabel(/^password$/i).fill("LocalJourney!2026");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.getByRole("button", { name: "Preview ad", exact: true }).click();
  const preview = page
    .getByText("This is how the ad looks to candidates.", { exact: true })
    .locator("../..");
  await expect(
    preview.getByRole("heading", { level: 2, name: publicTitle, exact: true }),
  ).toBeVisible();
  await expect(preview.getByText(requirement, { exact: true })).toBeVisible();
  await expect(preview.getByText("Jobbnav Test AB", { exact: true }).first()).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "About the employer", exact: true }),
  ).toBeVisible();
  mkdirSync("test-results/jobs-live-proof", { recursive: true });
  await preview.screenshot({ path: "test-results/jobs-live-proof/real-employer-preview.png" });
});

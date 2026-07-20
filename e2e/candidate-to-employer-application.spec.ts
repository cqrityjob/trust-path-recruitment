import { test, expect, type Page } from "@playwright/test";

// H3.4A — beta-critical candidate-to-employer smoke test.
//
// Exercises the one true end-to-end path this phase adds: a candidate
// signs in, applies to a published on-platform ("internal") job with a
// PDF CV, the application appears in their own history, and the owning
// employer sees it, can advance its status, and the candidate sees the
// updated status reflected back.
//
// -----------------------------------------------------------------------
// NOT auto-run against a live backend by default.
// -----------------------------------------------------------------------
// This repository has no local Supabase stack (no Docker/Supabase CLI
// available when this spec was written) -- the only backend reachable
// from a browser session driven against `bun run dev` is whatever
// SUPABASE_URL/VITE_SUPABASE_URL in .env point to, which for this project
// is the live, connected Lovable Cloud project. Running this spec
// therefore creates REAL rows (an application, a CV file in the
// job-application-cvs bucket, status-change audit events) in that shared
// environment.
//
// This test is intentionally gated on explicit environment variables and
// SKIPS itself (rather than failing) when they are not set, so it is
// never accidentally executed against production/shared data by a bare
// `bunx playwright test`:
//
//   E2E_RUN_LIVE=1                 -- explicit opt-in; without this the
//                                      whole file is skipped.
//   E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD
//                                   -- an existing, clearly-labelled beta
//                                      test candidate account (see
//                                      docs/beta/beta-test-data.md).
//   E2E_EMPLOYER_EMAIL / E2E_EMPLOYER_PASSWORD
//                                   -- an existing, clearly-labelled beta
//                                      test employer account that owns
//                                      E2E_JOB_SLUG.
//   E2E_EMPLOYER_SLUG              -- that employer's slug (for
//                                      /employer/$employerSlug/applications).
//   E2E_JOB_SLUG                   -- an already-published,
//                                      application_method=internal job
//                                      owned by that employer.
//
// Run via: E2E_RUN_LIVE=1 E2E_CANDIDATE_EMAIL=... ... bunx playwright test
const LIVE = process.env.E2E_RUN_LIVE === "1";
const CANDIDATE_EMAIL = process.env.E2E_CANDIDATE_EMAIL;
const CANDIDATE_PASSWORD = process.env.E2E_CANDIDATE_PASSWORD;
const EMPLOYER_EMAIL = process.env.E2E_EMPLOYER_EMAIL;
const EMPLOYER_PASSWORD = process.env.E2E_EMPLOYER_PASSWORD;
const EMPLOYER_SLUG = process.env.E2E_EMPLOYER_SLUG;
const JOB_SLUG = process.env.E2E_JOB_SLUG;

const READY =
  LIVE &&
  CANDIDATE_EMAIL &&
  CANDIDATE_PASSWORD &&
  EMPLOYER_EMAIL &&
  EMPLOYER_PASSWORD &&
  EMPLOYER_SLUG &&
  JOB_SLUG;

// Minimal, valid, single-page PDF -- real "%PDF-" magic bytes, satisfies
// both the client-side and server-side (submitJobApplication) PDF checks.
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF",
  "utf-8",
);

async function forceEnglish(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cqrityjob.lang", "en");
  });
}

async function signIn(page: Page, loginPath: string, email: string, password: string) {
  await page.goto(loginPath);
  await page.getByLabel("Email", { exact: false }).fill(email);
  await page.getByLabel("Password", { exact: false }).fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
}

test.describe("H3.4A candidate-to-employer application flow", () => {
  test.skip(
    !READY,
    "Set E2E_RUN_LIVE=1 and the E2E_* fixture env vars to run this against a real backend.",
  );

  test("candidate applies, employer reviews, candidate sees the status change", async ({
    page,
  }) => {
    await forceEnglish(page);

    // ---- 1. Candidate applies ----
    await signIn(page, "/candidate/login", CANDIDATE_EMAIL!, CANDIDATE_PASSWORD!);
    await page.waitForURL(/\/my-career/);

    await page.goto(`/jobs/${JOB_SLUG}`);
    await page.getByRole("button", { name: "Apply via CQrityjob" }).click();

    await page.getByLabel("Phone number", { exact: false }).fill("+46701234567");
    await page
      .getByLabel("Cover note", { exact: false })
      .fill("H3.4A beta smoke test application -- safe to delete.");
    await page.setInputFiles("#apply-cv", {
      name: "beta-smoke-test-cv.pdf",
      mimeType: "application/pdf",
      buffer: MINIMAL_PDF,
    });
    await page.getByText("I consent to my application and CV being shared").click();
    await page.getByRole("button", { name: "Submit application" }).click();

    await expect(page.getByText("Application submitted")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Close" }).click();

    // ---- 2. Candidate sees it in their own history ----
    await page.goto("/my-career/applications");
    await expect(page.getByText("Submitted")).toBeVisible();

    // ---- 3. Employer reviews it ----
    await page.context().clearCookies();
    await signIn(page, "/employer/login", EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!);
    await page.waitForURL(/\/employer/);

    await page.goto(`/employer/${EMPLOYER_SLUG}/applications`);
    await expect(page.getByText("Submitted").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Mark as reviewing" }).first().click();
    await expect(page.getByText("Reviewing").first()).toBeVisible();

    // ---- 4. Candidate sees the updated status ----
    await page.context().clearCookies();
    await signIn(page, "/candidate/login", CANDIDATE_EMAIL!, CANDIDATE_PASSWORD!);
    await page.goto("/my-career/applications");
    await expect(page.getByText("Reviewing").first()).toBeVisible({ timeout: 15_000 });
  });
});

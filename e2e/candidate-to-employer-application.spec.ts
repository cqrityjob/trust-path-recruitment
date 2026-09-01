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
// A SECOND published internal job owned by the same employer, for the
// CQrityjob-CV scenario. It has to be a different advertisement: the
// duplicate-active-application index means one candidate cannot apply twice
// to the same job, which is correct and is not what that test is about.
const JOB_SLUG_CV = process.env.E2E_JOB_SLUG_CV;
// Set only when E2E_CANDIDATE_EMAIL owns at least one SENDABLE saved CV --
// one with a name and real professional history on it. The scenario asserts
// that the option is offered, so it must not run against an account where
// its absence would be the correct behaviour.
const CANDIDATE_HAS_CV = process.env.E2E_CANDIDATE_HAS_CQRITYJOB_CV === "1";

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

// ---------------------------------------------------------------------------
// Candidate overview — the application opened as the person who made it.
// ---------------------------------------------------------------------------
//
// Same live-backend gate as the flow above, and for the same reason: there is
// no local Supabase stack, so the only backend a browser session can reach is
// the shared Lovable Cloud project. Both specs skip themselves unless the
// E2E_* fixture variables are set explicitly.
//
// This one starts from an application that already exists (the flow above
// creates one), navigates the way a recruiter actually would -- by clicking
// the person -- and then asserts the three things that are properties of the
// PAGE rather than of the database:
//
//   * the journey is reachable by clicking a name, not by knowing a URL;
//   * no Security Passport appears merely because somebody applied;
//   * it works at 375px, which is where a large share of this product's
//     users are.
//
// Everything about identity, tenancy and disclosure is proven far more
// strongly in supabase/tests/scp_recruitment_journey_test.sql (group RJ7),
// against a real Postgres with RLS in force. A browser cannot prove a
// boundary; it can only prove the surface behaves.
test.describe("Candidate overview", () => {
  test.skip(
    !READY,
    "Set E2E_RUN_LIVE=1 and the E2E_* fixture env vars to run this against a real backend.",
  );

  test("an application opens the candidate, and shows no Passport", async ({ page }) => {
    await forceEnglish(page);
    await signIn(page, "/employer/login", EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!);
    await page.waitForURL(/\/employer/);

    await page.goto(`/employer/${EMPLOYER_SLUG}/applications`);

    // The candidate's name is the way in. Clicking the row's heading link is
    // the assertion: a page reachable only by typing a URL is not a journey.
    const firstCandidate = page.locator("main a[href*='/applications/']").first();
    await expect(firstCandidate).toBeVisible({ timeout: 15_000 });
    await firstCandidate.click();

    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);

    // The four sections that make it a candidate view rather than a row.
    // The page is named for what it actually contains. "Candidate overview",
    // never a "360 profile": the employer holds no authorised access to a
    // professional profile, and a heading promising one would describe data
    // that is not there.
    await expect(page.getByText("Candidate overview").first()).toBeVisible();
    await expect(page.getByText(/\b360\b/)).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Application" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assessment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Next step" })).toBeVisible();

    // Applying for a job is not consent to disclose a Passport. The section
    // exists to SAY that, and to show nothing: the heading is present, the
    // statement is the "nothing shared" one, and there is no way through to a
    // Passport from here.
    await expect(page.getByRole("heading", { name: "Security Passport" })).toBeVisible();
    await expect(
      page.getByText(
        "No Security Passport information has been shared with your organisation for this application.",
      ),
    ).toBeVisible();

    // No link out, in either direction: /p/$token is the recipient boundary
    // and /passport is the holder's own product.
    await expect(page.locator("a[href*='/passport'], a[href^='/p/']")).toHaveCount(0);

    // And no Passport DATA. The section is a sentence; anything that looked
    // like a credential, a claim, an issuer or a validity date would mean the
    // employer had been given something.
    const passportSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Security Passport" }),
    });
    await expect(passportSection.locator("a, button, img, table, ul, ol")).toHaveCount(0);

    // The statement is about what the EMPLOYER was given, never about what the
    // candidate holds -- a page that said "none found" would disclose exactly
    // the fact the candidate never consented to.
    await expect(
      page.getByText(/no security passport (found|available|on file|registered)/i),
    ).toHaveCount(0);

    // The decision is offered as named human actions, and never as a verdict.
    await expect(page.getByText(/recommend|suitab|ranking|score|match/i)).toHaveCount(0);

    // Back the way we came.
    await page.getByRole("link", { name: "Back to applications" }).click();
    await expect(page).toHaveURL(new RegExp(`/employer/${EMPLOYER_SLUG}/applications$`));
  });

  test("the candidate page works in Swedish", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("cqrityjob.lang", "sv"));
    await signIn(page, "/employer/login", EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!);
    await page.goto(`/employer/${EMPLOYER_SLUG}/applications`);

    const firstCandidate = page.locator("main a[href*='/applications/']").first();
    await expect(firstCandidate).toBeVisible({ timeout: 15_000 });
    await firstCandidate.click();

    // Swedish copy, and no raw translation keys leaking through -- a missing
    // key renders as "employer.candidate.something", which t() returns
    // verbatim rather than throwing.
    await expect(page.getByRole("heading", { name: "Ansökan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bedömning" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nästa steg" })).toBeVisible();
    await expect(page.getByText(/employer\.candidate\./)).toHaveCount(0);

    // The page names itself for what it holds, in Swedish.
    await expect(page.getByText("Kandidatöversikt").first()).toBeVisible();

    // Same Passport statement, same absence of anything behind it.
    await expect(page.getByRole("heading", { name: "Security Passport" })).toBeVisible();
    await expect(
      page.getByText("Ingen Security Passport-information har delats med er för den här ansökan."),
    ).toBeVisible();
    await expect(page.locator("a[href*='/passport'], a[href^='/p/']")).toHaveCount(0);
  });

  test("the candidate page does not scroll sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await forceEnglish(page);
    await signIn(page, "/employer/login", EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!);
    await page.goto(`/employer/${EMPLOYER_SLUG}/applications`);

    const firstCandidate = page.locator("main a[href*='/applications/']").first();
    await expect(firstCandidate).toBeVisible({ timeout: 15_000 });
    await firstCandidate.click();
    await expect(page.getByRole("heading", { name: "Application" })).toBeVisible();

    // Horizontal overflow at 375 is the failure this catches: a cover note,
    // a long job title or the status buttons pushing the page wider than the
    // screen. One pixel of tolerance for sub-pixel layout rounding.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Applying with the CV this platform already holds.
// ---------------------------------------------------------------------------
//
// Same live-backend gate as everything above, plus two of its own:
// E2E_JOB_SLUG_CV (a second published internal job, because a candidate
// cannot apply twice to one advertisement) and
// E2E_CANDIDATE_HAS_CQRITYJOB_CV=1 (the candidate account genuinely owns a
// sendable saved CV -- without that, "the option is not offered" would be the
// CORRECT behaviour and asserting its presence would be asserting a bug).
//
// What a browser can prove is the surface: that the option is there, that
// choosing it needs no file, that the confirmation says which CV went, and
// that the employer's page then renders it as a CQrityjob CV rather than
// offering a download that cannot work.
//
// What a browser CANNOT prove is any of the boundaries, and this spec does
// not pretend to. That one candidate cannot attach another's CV, that one
// employer cannot read another's application, and -- the reason the
// application stores a copy at all -- that editing the saved CV afterwards
// leaves the employer's copy exactly where it was, are proved against a real
// Postgres with RLS in force, in
// supabase/tests/job_application_cv_source_test.sql (groups C, E and H).
const CV_READY = READY && JOB_SLUG_CV && CANDIDATE_HAS_CV;

test.describe("Applying with a CQrityjob CV", () => {
  test.skip(
    !CV_READY,
    "Set E2E_RUN_LIVE=1, the E2E_* fixture vars, E2E_JOB_SLUG_CV and " +
      "E2E_CANDIDATE_HAS_CQRITYJOB_CV=1 to run this against a real backend.",
  );

  test("the candidate applies with their saved CV and the employer reads it", async ({ page }) => {
    await forceEnglish(page);

    // ---- 1. The option is offered, and no upload is required ----
    await signIn(page, "/candidate/login", CANDIDATE_EMAIL!, CANDIDATE_PASSWORD!);
    await page.waitForURL(/\/my-career/);

    await page.goto(`/jobs/${JOB_SLUG_CV}`);
    await page.getByRole("button", { name: "Apply via CQrityjob" }).click();

    const useMyCv = page.getByRole("radio", { name: "Use my CQrityjob CV" });
    await expect(useMyCv).toBeVisible({ timeout: 15_000 });
    await useMyCv.check();

    // The external route is still there. It is an alternative, never a
    // replacement -- a candidate with a PDF must not be forced onto the
    // platform document.
    await expect(page.getByRole("radio", { name: "Upload another CV" })).toBeVisible();

    // Selecting a CV is a disclosure, and it is named as one where it is made.
    await expect(page.getByText(/is sent to .* with your application/i)).toBeVisible();

    // ---- 2. Submitting attaches no file at all ----
    await page.getByText("I consent to my application and CV being shared").click();
    await page.getByRole("button", { name: "Submit application" }).click();

    await expect(page.getByText("Application submitted")).toBeVisible({ timeout: 15_000 });
    // The confirmation reports what the SERVER recorded, not what was ticked.
    await expect(page.getByText("Your CQrityjob CV was sent with your application.")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // ---- 3. The candidate's own history says which CV went ----
    await page.goto("/my-career/applications");
    await expect(page.getByText("CQrityjob CV").first()).toBeVisible({ timeout: 15_000 });

    // ---- 4. The employer reads the submitted CV, on the candidate page ----
    await page.context().clearCookies();
    await signIn(page, "/employer/login", EMPLOYER_EMAIL!, EMPLOYER_PASSWORD!);
    await page.waitForURL(/\/employer/);

    await page.goto(`/employer/${EMPLOYER_SLUG}/applications`);
    const firstCandidate = page.locator("main a[href*='/applications/']").first();
    await expect(firstCandidate).toBeVisible({ timeout: 15_000 });
    await firstCandidate.click();

    await expect(page.getByText("Submitted CV")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("CQrityjob CV").first()).toBeVisible();
    // It is a document, rendered. Not a download that would fail, and not an
    // identifier a recruiter has to decode.
    await expect(page.getByRole("button", { name: "Download CV" })).toHaveCount(0);
    await expect(page.getByText(/cv_document|snapshot|uuid/i)).toHaveCount(0);
    // And it is labelled as the point-in-time artefact it is.
    await expect(page.getByText(/as it stood when the application was submitted/i)).toBeVisible();
  });

  test("the CV choice is usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await forceEnglish(page);
    await signIn(page, "/candidate/login", CANDIDATE_EMAIL!, CANDIDATE_PASSWORD!);
    await page.goto(`/jobs/${JOB_SLUG_CV}`);
    await page.getByRole("button", { name: "Apply via CQrityjob" }).click();

    await expect(page.getByRole("radio", { name: "Use my CQrityjob CV" })).toBeVisible({
      timeout: 15_000,
    });
    // The submit control has to be reachable at 375x812 with the CV block on
    // the page -- the exact regression application-dialog-scroll:check exists
    // to prevent, observed rather than inferred.
    await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/**
 * BESKT PR 3 — the live candidate-preparation walk.
 *
 * The whole journey through the real routed application, signed in as real
 * fixture accounts against a LOCAL Supabase stack:
 *
 *   1. the employer's Testbibliotek shows "Metodstöd för rekrytering" as a
 *      sibling section, and says "under development" while nothing governed
 *      is published;
 *   2. once a synthetic method is published and the employer admitted, the
 *      employer starts a preparation from an EXISTING application;
 *   3. the candidate opens it in My Career, reads the nine notices and
 *      acknowledges them — and cannot answer anything before that;
 *   4. answers, saves, leaves, returns, and finds the exact answers again;
 *   5. skips one question and takes another orally;
 *   6. reviews every response and corrects one;
 *   7. submits once, and sees a read-only confirmation;
 *   8. the employer reads back the submitted basis, the explicit omitted and
 *      discuss-orally states, and the topics for the interview — having seen
 *      NOTHING while it was still a draft;
 *   9. a second candidate is refused the first candidate's preparation, and a
 *      member of another employer is refused the readback.
 *
 * In Swedish and English, at 1440 and 375.
 *
 * ── WHY IT SKIPS BY DEFAULT ────────────────────────────────────────────
 *
 * It writes real rows through the governed RPCs, so it runs only against a
 * local stack, never a shared or hosted backend. Set E2E_LOCAL_STACK=1 and
 * point E2E_BASE_URL at localhost.
 *
 * ── WHAT PROVES THE SAME THING WITHOUT A BROWSER ───────────────────────
 *
 * Every transition and every refusal above is proved end to end by
 * supabase/tests/bcp_candidate_preparation_test.sql (206 assertions), which
 * runs in the database job on every push. The screens themselves are captured
 * in real Chromium, in both languages at both widths, by
 * scripts/beskt-candidate-preparation-evidence.ts, which needs no stack.
 * What THIS spec adds on top of those two is the wiring between them.
 *
 * Reproduce:
 *   supabase start
 *   DB_URL=$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')
 *   psql "$DB_URL" -f scripts/fixtures/beskt-candidate-preparation-fixture.sql
 *   bun run dev -- --port 3119 --strictPort
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3119 \
 *     bunx playwright test e2e/beskt-candidate-preparation.spec.ts \
 *       --project=chromium --project=mobile-375
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the live walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE),
  "The live walk runs only against localhost — never a shared or hosted backend.",
);

// The walk signs in three times, starts a preparation, answers it, submits it
// and reads it back. Playwright's 30 s default caps everything inside the
// test, so it is raised here rather than in playwright.config.ts, where it
// would change every other suite's timing.
test.describe.configure({ timeout: 240_000 });

const OUT = "artifacts/beskt-candidate-preparation/live";
const PASSWORD = "LocalJourney!2026";
const RECRUITER = "journey@local.test";
const CANDIDATE = "kandidat@local.test";
const OTHER_CANDIDATE = "kandidat2@local.test";
const OTHER_RECRUITER = "other-employer@local.test";
const EMPLOYER_SLUG = "journey-ab";

mkdirSync(OUT, { recursive: true });

/** Sign in through the one door the product has. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?post|email/i).fill(email);
  await page.getByLabel(/lösenord|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /logga in|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Switch language through the real control, never by resetting storage. */
async function useEnglish(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /language|språk|EN/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /english/i }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", /en/);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test.describe("BESKT candidate preparation — the live journey", () => {
  test("the employer library names the method and states its real state", async ({ page }) => {
    await signIn(page, RECRUITER);
    await page.goto(`/employer/${EMPLOYER_SLUG}/assessments/library`);

    const section = page.getByTestId("beskt-method-support");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Metodstöd för rekrytering");
    // Never a test. The claim the PR 1 contract forbids must not be on screen.
    await expect(section).not.toContainText(/personlighetstest|lämplighetstest/i);
    await expect(section).toContainText(/ingen poäng/i);
    await shot(page, "employer-library-sv-desktop");

    await useEnglish(page);
    await expect(section).toContainText("Method support for recruitment");
    await expect(section).not.toContainText(/personality test|suitability test/i);
    await shot(page, "employer-library-en-desktop");
  });

  test("the employer starts a preparation from an existing application", async ({ page }) => {
    await signIn(page, RECRUITER);
    await page.goto(`/employer/${EMPLOYER_SLUG}/applications/${process.env.E2E_APPLICATION_ID}`);

    const panel = page.getByTestId("beskt-application-panel");
    await expect(panel).toBeVisible();
    await panel.getByLabel(/rollexponering|role exposure/i).click();
    await page.getByRole("option").first().click();
    await panel.getByTestId("beskt-start-submit").click();

    await expect(panel.getByTestId("beskt-readback-state")).toBeVisible();
    // Nothing of the candidate's is readable yet, because there is nothing.
    await expect(panel.getByTestId("beskt-readback-draft-private")).toBeVisible();
    await shot(page, "employer-started-sv-desktop");
  });

  test("the candidate reads the notice, answers, saves, resumes and submits", async ({ page }) => {
    await signIn(page, CANDIDATE);
    await page.goto("/my-career/applications");

    const list = page.getByTestId("beskt-my-preparations");
    await expect(list).toBeVisible();
    await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();

    // ── the notice, before anything can be answered ──────────────────────
    const notice = page.getByTestId("beskt-notice");
    await expect(notice).toBeVisible();
    for (const key of [
      "purpose",
      "use_of_information",
      "human_decision",
      "not_a_test_with_score",
      "may_omit_questions",
      "oral_discussion",
      "review_and_correct",
      "who_can_access",
      "retention",
    ]) {
      await expect(page.getByTestId(`beskt-notice-${key}`)).toBeVisible();
    }
    // An information receipt, said to be one, and not consent.
    await expect(notice).toContainText(/inte ett samtycke/i);
    await shot(page, "candidate-notice-sv");

    await page.getByLabel(/jag har läst informationen/i).check();
    await page.getByTestId("beskt-acknowledge").click();

    // ── answering, skipping and taking one orally ────────────────────────
    const first = page.getByTestId("beskt-item-lone_working_experience");
    await expect(first).toBeVisible();
    await first.getByLabel("Ja", { exact: true }).check();

    await page.getByTestId("beskt-item-incident_context-skip").click();
    await expect(first).toBeVisible();
    await page.getByTestId("beskt-item-lone_working_example-oral").click();
    await shot(page, "candidate-answering-sv");

    // ── save and exit, then resume with the EXACT answers ────────────────
    await page.getByTestId("beskt-save").click();
    await expect(page.getByText(/^Sparat$/)).toBeVisible();
    await page.goto("/my-career/applications");
    await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();
    await expect(page.getByTestId("beskt-item-lone_working_experience")).toBeVisible();
    await expect(page.getByLabel("Ja", { exact: true })).toBeChecked();
    await shot(page, "candidate-resumed-sv");

    // ── review, correct, submit ──────────────────────────────────────────
    await page.getByTestId("beskt-to-review").click();
    await expect(page.getByTestId("beskt-review-list")).toBeVisible();
    await shot(page, "candidate-review-sv");

    await page.getByTestId("beskt-back-to-answers").click();
    await page.getByLabel("Nej", { exact: true }).check();
    await page.getByTestId("beskt-to-review").click();
    await page.getByTestId("beskt-submit").click();

    const submitted = page.getByTestId("beskt-submitted");
    await expect(submitted).toBeVisible();
    await expect(submitted).toContainText(/inlämnad/i);
    // Read-only means read-only: no control offers a change.
    await expect(page.getByTestId("beskt-save")).toHaveCount(0);
    await expect(page.getByTestId("beskt-submit")).toHaveCount(0);
    await shot(page, "candidate-submitted-sv");

    await useEnglish(page);
    await expect(submitted).toContainText(/submitted/i);
    await shot(page, "candidate-submitted-en");
  });

  test("the employer reads the submitted basis, and nothing it interprets", async ({ page }) => {
    await signIn(page, RECRUITER);
    await page.goto(`/employer/${EMPLOYER_SLUG}/applications/${process.env.E2E_APPLICATION_ID}`);

    const panel = page.getByTestId("beskt-application-panel");
    await expect(panel.getByTestId("beskt-readback-answers")).toBeVisible();
    await expect(panel.getByTestId("beskt-readback-topics")).toBeVisible();
    await expect(panel).toContainText(/Hoppade över|Tar muntligt/);
    // No judgement anywhere on the surface.
    await expect(panel).not.toContainText(/poäng|betyg|rangordn|lämplig/i);
    await shot(page, "employer-readback-sv-desktop");

    await useEnglish(page);
    await expect(panel).not.toContainText(/score|ranking|grade|suitab/i);
    await shot(page, "employer-readback-en-desktop");
  });

  test("a wrong candidate and a wrong employer are both refused", async ({ page }) => {
    await signIn(page, OTHER_CANDIDATE);
    await page.goto(`/my-career/preparation/${process.env.E2E_ASSIGNMENT_ID}`);
    await expect(page.getByText(/tillhör inte dig|does not belong to you/i)).toBeVisible();
    await shot(page, "denied-wrong-candidate-sv");

    await signIn(page, OTHER_RECRUITER);
    await page.goto(`/employer/${EMPLOYER_SLUG}/applications/${process.env.E2E_APPLICATION_ID}`);
    await expect(page.getByTestId("beskt-readback-answers")).toHaveCount(0);
    await shot(page, "denied-cross-tenant-sv");
  });
});

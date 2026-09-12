/**
 * BESKT PR 3 — the ROUTED candidate-preparation walk.
 *
 * Not exported components, not a rendered fragment: the real application, on
 * its real routes, signed in as real fixture accounts, writing real rows
 * through the governed RPCs against a real PostgREST enforcing real RLS.
 *
 * The whole journey, in order, because the order is the contract:
 *
 *   1. the employer's Testbibliotek names "Metodstöd för rekrytering" as a
 *      sibling section and never as a test;
 *   2. the employer starts a preparation from an EXISTING application, and
 *      sees NOTHING of the candidate's while it is still a draft;
 *   3. the candidate finds it in My Career, reads the nine notices and
 *      acknowledges them — and cannot answer anything before that;
 *   4. answers, saves, leaves, returns, and finds the exact answers again;
 *   5. takes one question orally and skips another;
 *   6. reviews every response and corrects one;
 *   7. submits once, and the screen becomes read-only;
 *   8. the employer reads back the submitted basis, the explicit omitted and
 *      discuss-orally states and the interview topics;
 *   9. a second candidate is refused this preparation, and a member of
 *      another employer is refused the readback.
 *
 * ── WHY IT SKIPS BY DEFAULT ────────────────────────────────────────────
 *
 * It writes rows, so it runs only against a disposable local stack, never a
 * shared or hosted backend. `scripts/local-stack/up.sh` builds that stack and
 * writes the .env.local it needs; the spec additionally refuses any base URL
 * that is not loopback.
 *
 * Reproduce:
 *   scripts/local-stack/up.sh
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *     bunx playwright test e2e/beskt-candidate-preparation.spec.ts \
 *       --project=chromium --project=mobile-375 --workers=1 --trace on
 */

import { expect, test, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the routed walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The routed walk runs only against loopback — never a shared or hosted backend.",
);

// The walk signs in five times, starts a preparation, answers it, submits it
// and reads it back. Playwright's 30 s default caps everything inside one
// test, so it is raised here rather than in playwright.config.ts, where it
// would change every other suite's timing.
test.describe.configure({ mode: "serial", timeout: 240_000 });

const OUT = process.env.BCP_EVIDENCE_DIR ?? "artifacts/beskt-candidate-preparation/live";
const PASSWORD = "LocalJourney!2026";
const RECRUITER = "beskt-recruiter@local.test";
const CANDIDATE = "beskt-candidate@local.test";
const OTHER_CANDIDATE = "beskt-candidate2@local.test";
const OTHER_RECRUITER = "beskt-outsider@local.test";
const EMPLOYER_SLUG = process.env.E2E_EMPLOYER_SLUG ?? "beskt-journey-ab";
const APPLICATION_ID = process.env.E2E_APPLICATION_ID ?? "b4000000-0000-4000-8000-00000000aa01";

mkdirSync(OUT, { recursive: true });

/**
 * Phase and step durations, measured rather than asserted-about. Written as
 * one JSON object per line so a partial run still leaves a readable record,
 * and so nothing has to be held in memory to the end.
 */
const TIMINGS = `${OUT}/timings.jsonl`;
async function step<T>(phase: string, name: string, body: () => Promise<T>): Promise<T> {
  return test.step(`${phase} · ${name}`, async () => {
    const started = Date.now();
    try {
      return await body();
    } finally {
      appendFileSync(
        TIMINGS,
        `${JSON.stringify({
          phase,
          step: name,
          ms: Date.now() - started,
          project: test.info().project.name,
          at: new Date().toISOString(),
        })}\n`,
      );
    }
  });
}

/** The assignment the employer creates, read back from the candidate's URL. */
let assignmentId = "";

/** Sign in through the one door the product has, and land on `destination`. */
async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  // No sleep: the URL leaving /login IS the signal that the session exists.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

/**
 * Switch language through the real control -- the two-letter toggle in the
 * header -- and never by resetting storage. The assertion is on <html lang>,
 * which is what a screen reader reads, so a switch that changed only the
 * visible copy would fail here.
 */
async function useEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "en", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^en/, { timeout: 15_000 });
}

/**
 * Scoring vocabulary is allowed on screen ONLY inside a sentence that denies
 * or distinguishes a score -- "no result, no score, no ranking" is the
 * product's own promise and must be sayable. So the check is per sentence,
 * exactly as scripts/beskt-candidate-preparation-check.ts makes it over the
 * source: any sentence that reaches for the vocabulary has to be refusing it.
 */
const SCORING =
  /\b(scores?|scored|scoring|ranks?|ranked|ranking|grades?|graded|suitability|poäng|poängsätt\w*|betyg\w*|rangordn\w*|lämplighet\w*)\b/i;
/**
 * Denying OR distinguishing. The English sibling note says the method support
 * is "distinct from the scored assessments in the test library above" -- which
 * reaches for the vocabulary in order to put the product on the other side of
 * it, and is exactly the sentence the product needs to be able to write.
 */
const DENIES_OR_DISTINGUISHES =
  /\b(no|not|never|without|neither|nor|doesn'?t|distinct|separate|unlike|rather than|instead of|different from|inte|ingen|inget|inga|aldrig|utan|varken|skil[dt]|eget|åtskil\w*|till skillnad)\b/i;

async function expectNoScoringClaim(page: Page, testId: string): Promise<void> {
  const text = (await page.getByTestId(testId).innerText()).replace(/\s+/g, " ");
  const offenders = text
    .split(/(?<=[.!?·])\s+|\n+/)
    .filter((sentence) => SCORING.test(sentence) && !DENIES_OR_DISTINGUISHES.test(sentence));
  expect(offenders, `scoring vocabulary outside a denial in ${testId}`).toEqual([]);
}

/**
 * Nothing on the candidate's own screen may scroll sideways. At 375 that is
 * not a polish question: a preparation the candidate has to pan across is a
 * preparation they will answer badly, and this is the one route PR 3 owns
 * end to end, so it is asserted here rather than hoped for.
 */
async function expectFitsViewport(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `the page scrolls sideways at ${innerWidth}px (scrollWidth ${scrollWidth})`,
  ).toBeLessThanOrEqual(innerWidth + 1);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${OUT}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    // CSS pixels, not device pixels. The mobile presets run at DPR 3, and a
    // full-page capture at that density is four times the size for nothing a
    // reviewer can see -- these are evidence of what was on screen, not
    // pixel-comparison baselines.
    scale: "css",
  });
}

test.describe("BESKT candidate preparation — the routed journey", () => {
  test("1 · the library names the method and states its real state", async ({ page }) => {
    await step("library", "sign in as the recruiter", () =>
      signIn(page, RECRUITER, `/employer/${EMPLOYER_SLUG}/assessments/library`),
    );

    const section = page.getByTestId("beskt-method-support");
    await step("library", "the section is present and is not a test", async () => {
      await expect(section).toBeVisible({ timeout: 30_000 });
      await expect(section).toContainText(/Metodstöd för rekrytering/i);
      // The claim PR 1's contract forbids must not be on screen, ever.
      await expect(section).not.toContainText(/personlighetstest|lämplighetstest/i);
      await expectNoScoringClaim(page, "beskt-method-support");
      await shot(page, "1-library-sv");
    });

    await step("library", "the same page in English", async () => {
      await useEnglish(page);
      await expect(section).toContainText(/Method support for recruitment/i);
      await expect(section).not.toContainText(/personality test|suitability test/i);
      await expectNoScoringClaim(page, "beskt-method-support");
      await shot(page, "1-library-en");
    });
  });

  test("2 · the employer starts a preparation from an existing application", async ({ page }) => {
    await step("assign", "sign in and open the application", () =>
      signIn(page, RECRUITER, `/employer/${EMPLOYER_SLUG}/applications/${APPLICATION_ID}`),
    );

    const panel = page.getByTestId("beskt-application-panel");
    await step("assign", "the panel offers a governed exposure profile", async () => {
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await panel
        .getByLabel(/rollexponering|role exposure|välj|choose/i)
        .first()
        .click();
      await page.getByRole("option").first().click();
      await shot(page, "2-employer-before-start");
    });

    await step("assign", "start it", async () => {
      await panel.getByTestId("beskt-start-submit").click();
      await expect(panel.getByTestId("beskt-readback-state")).toBeVisible({ timeout: 30_000 });
    });

    await step("assign", "a draft shows the employer NOTHING of the candidate's", async () => {
      await expect(panel.getByTestId("beskt-readback-draft-private")).toBeVisible();
      await expect(panel.getByTestId("beskt-readback-answers")).toHaveCount(0);
      await shot(page, "2-employer-started");
    });
  });

  test("3 · the candidate reads the notice before anything can be answered", async ({ page }) => {
    await step("notice", "sign in and find it in My Career", async () => {
      await signIn(page, CANDIDATE, "/my-career/applications");
      const list = page.getByTestId("beskt-my-preparations");
      await expect(list).toBeVisible({ timeout: 30_000 });
      await shot(page, "3-my-career-list");
      await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();
      await page.waitForURL(/\/my-career\/preparation\/[0-9a-f-]{36}/);
      assignmentId = page.url().split("/").pop() ?? "";
      expect(assignmentId).toMatch(/^[0-9a-f-]{36}$/);
    });

    await step("notice", "all nine matters are disclosed", async () => {
      const notice = page.getByTestId("beskt-notice");
      await expect(notice).toBeVisible({ timeout: 30_000 });
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
    });

    await step("notice", "it says plainly that it is not a consent", async () => {
      await expect(page.getByTestId("beskt-notice")).toContainText(/inte ett samtycke/i);
      // And nothing can be answered yet: no question is on screen at all.
      await expect(page.getByTestId("beskt-item-lone_working_experience")).toHaveCount(0);
      await expect(page.getByTestId("beskt-save")).toHaveCount(0);
      await expectFitsViewport(page);
      await shot(page, "3-notice-sv");
    });

    await step("notice", "acknowledge it", async () => {
      await page.getByLabel(/jag har läst informationen/i).check();
      await page.getByTestId("beskt-acknowledge").click();
      await expect(page.getByTestId("beskt-item-lone_working_experience")).toBeVisible({
        timeout: 30_000,
      });
      await shot(page, "3-acknowledged");
    });
  });

  test("4 · answering, saving, leaving and resuming", async ({ page }) => {
    await step("answer", "reopen the preparation", async () => {
      await signIn(page, CANDIDATE, `/my-career/preparation/${assignmentId}`);
      await expect(page.getByTestId("beskt-item-lone_working_experience")).toBeVisible({
        timeout: 30_000,
      });
    });

    await step("answer", "answer the first question and save", async () => {
      // By id, not by the label "Ja": two different questions on this page
      // carry that label, and a locator that matched both would be a test
      // that did not know which question it was answering.
      await page.locator("#beskt-input-lone_working_experience-yes").check();
      await page.getByTestId("beskt-save").click();
      await expect(page.getByText(/^Sparat$/)).toBeVisible({ timeout: 30_000 });
    });

    await step("answer", "the saved answer OPENS the follow-up question", async () => {
      // Routing is the database's decision, taken by PR #218's resolver over
      // the answers actually stored -- so the follow-up appears after the
      // save, not on the local change. That is the point: what the candidate
      // is asked is never decided in the browser.
      await expect(page.getByTestId("beskt-item-lone_working_example")).toBeVisible({
        timeout: 30_000,
      });
    });

    await step("answer", "take that question orally instead", async () => {
      await page.getByTestId("beskt-item-lone_working_example-oral").click();
      await expect(page.getByTestId("beskt-item-lone_working_example")).toContainText(
        /tar den här frågan muntligt/i,
      );
    });

    await step(
      "answer",
      "answer the boolean and save, which opens the context question",
      async () => {
        await page.locator("#beskt-input-reported_incident-yes").check();
        await page.locator("#beskt-input-information_acknowledged").check();
        await page.getByTestId("beskt-save").click();
        await expect(page.getByText(/^Sparat$/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("beskt-item-incident_context")).toBeVisible({
          timeout: 30_000,
        });
      },
    );

    await step("answer", "skip the context question", async () => {
      await page.getByTestId("beskt-item-incident_context-skip").click();
      await expect(page.getByTestId("beskt-item-incident_context")).toContainText(
        /hoppat över den här frågan/i,
      );
      await expectFitsViewport(page);
      await shot(page, "4-answered-sv");
    });

    await step("answer", "save the omission and the oral choice too", async () => {
      await page.getByTestId("beskt-save").click();
      await expect(page.getByText(/^Sparat$/)).toBeVisible({ timeout: 30_000 });
    });

    await step("resume", "leave the preparation entirely", async () => {
      await page.goto("/my-career/applications");
      await expect(page.getByTestId("beskt-my-preparations")).toBeVisible({ timeout: 30_000 });
    });

    await step("resume", "come back and find the EXACT same answers", async () => {
      await page.goto(`/my-career/preparation/${assignmentId}`);
      await expect(page.getByTestId("beskt-item-lone_working_experience")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator("#beskt-input-lone_working_experience-yes")).toBeChecked();
      await expect(page.locator("#beskt-input-reported_incident-yes")).toBeChecked();
      await expect(page.getByTestId("beskt-item-lone_working_example")).toContainText(
        /tar den här frågan muntligt/i,
      );
      await expect(page.getByTestId("beskt-item-incident_context")).toContainText(
        /hoppat över den här frågan/i,
      );
      await expect(page.locator("#beskt-input-information_acknowledged")).toBeChecked();
      await shot(page, "4-resumed-sv");
    });
  });

  test("5 · review, correct, and submit once", async ({ page }) => {
    await step("review", "reopen and go to the review", async () => {
      await signIn(page, CANDIDATE, `/my-career/preparation/${assignmentId}`);
      await page.getByTestId("beskt-to-review").click();
      const list = page.getByTestId("beskt-review-list");
      await expect(list).toBeVisible({ timeout: 30_000 });
      // Every response, including the two that are states instead of answers.
      await expect(list).toContainText(/Du tar den här frågan muntligt/i);
      await expect(list).toContainText(/Du har hoppat över den här frågan/i);
      await expectFitsViewport(page);
      await shot(page, "5-review-sv");
    });

    await step("review", "go back and CORRECT one response", async () => {
      await page.getByTestId("beskt-back-to-answers").click();
      // Undo the oral choice and answer it after all — a real correction on
      // the real control, not a state poke.
      await page.getByTestId("beskt-item-lone_working_example-oral").click();
      const field = page.locator("#beskt-input-lone_working_example");
      await expect(field).toBeVisible();
      await field.fill("Jag larmade och dokumenterade händelsen samma natt.");
      await shot(page, "5-corrected-sv");
    });

    await step("review", "the correction is what the review now shows", async () => {
      await page.getByTestId("beskt-to-review").click();
      await expect(page.getByTestId("beskt-review-list")).toContainText(
        /Jag larmade och dokumenterade händelsen samma natt\./,
      );
    });

    await step("submit", "submit it once", async () => {
      await page.getByTestId("beskt-submit").click();
      const submitted = page.getByTestId("beskt-submitted");
      await expect(submitted).toBeVisible({ timeout: 30_000 });
      await expect(submitted).toContainText(/Inlämnad/i);
    });

    await step("submit", "read-only means read-only", async () => {
      await expect(page.getByTestId("beskt-save")).toHaveCount(0);
      await expect(page.getByTestId("beskt-submit")).toHaveCount(0);
      await expect(page.getByTestId("beskt-to-review")).toHaveCount(0);
      await expectFitsViewport(page);
      await shot(page, "6-submitted-sv");
    });

    await step("submit", "and in English", async () => {
      await useEnglish(page);
      await expect(page.getByTestId("beskt-submitted")).toContainText(/Submitted/i);
      await shot(page, "6-submitted-en");
    });
  });

  test("6 · the employer reads back the basis, and nothing it interprets", async ({ page }) => {
    await step("readback", "sign in and open the application", () =>
      signIn(page, RECRUITER, `/employer/${EMPLOYER_SLUG}/applications/${APPLICATION_ID}`),
    );

    const panel = page.getByTestId("beskt-application-panel");
    await step("readback", "the submitted basis is readable now", async () => {
      await expect(panel.getByTestId("beskt-readback-answers")).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByTestId("beskt-readback-draft-private")).toHaveCount(0);
      await expect(panel).toContainText(/Jag larmade och dokumenterade händelsen samma natt\./);
    });

    await step("readback", "the neutral states are shown AS states", async () => {
      await expect(panel).toContainText(/Hoppade över/);
      await expect(panel.getByTestId("beskt-readback-topics")).toBeVisible();
      await shot(page, "7-readback-sv");
    });

    await step("readback", "no judgement anywhere on the surface", async () => {
      await expectNoScoringClaim(page, "beskt-application-panel");
      await useEnglish(page);
      await expect(panel).toContainText(/does not interpret, score or recommend/i);
      await expectNoScoringClaim(page, "beskt-application-panel");
      await shot(page, "7-readback-en");
    });
  });

  test("7 · a wrong candidate and a wrong employer are both refused", async ({ browser }) => {
    // A separate browser context per person, because they ARE separate people:
    // reusing one context would leave the previous session in place and the
    // sign-in form would never be reached.
    await step("refusal", "another candidate is refused this preparation", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signIn(page, OTHER_CANDIDATE, `/my-career/preparation/${assignmentId}`);
        await expect(page.getByText(/tillhör inte dig|does not belong to you/i)).toBeVisible({
          timeout: 30_000,
        });
        // Not "empty": absent. No notice, no questions, no review, no text.
        await expect(page.getByTestId("beskt-notice")).toHaveCount(0);
        await expect(page.getByTestId("beskt-review-list")).toHaveCount(0);
        await expect(page.getByTestId("beskt-submitted")).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText(
          /Jag larmade och dokumenterade händelsen samma natt\./,
        );
        await shot(page, "8-refused-wrong-candidate");
      } finally {
        await context.close();
      }
    });

    await step("refusal", "a member of another employer is refused the readback", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await signIn(
          page,
          OTHER_RECRUITER,
          `/employer/${EMPLOYER_SLUG}/applications/${APPLICATION_ID}`,
        );
        await expect(page.getByTestId("beskt-readback-answers")).toHaveCount(0);
        await expect(page.getByTestId("beskt-readback-topics")).toHaveCount(0);
        await expect(page.locator("body")).not.toContainText(
          /Jag larmade och dokumenterade händelsen samma natt\./,
        );
        await shot(page, "8-refused-cross-tenant");
      } finally {
        await context.close();
      }
    });
  });
});

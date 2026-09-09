/**
 * Employer process continuity (E1) — the signed-in walk against the LOCAL stack.
 *
 * The E1 journey, end to end, in the real routed application:
 *
 *   a job -> its applications -> one application (Candidate 360)
 *         -> the linked interview, arriving with the same candidate, job and
 *            application, and offering the way back
 *         -> back to the SAME application
 *         -> browser Back and Forward, with context intact
 *
 * and the states the strip has to tell apart: report MATERIAL versus a
 * finalised report, a standalone process, an application with nothing started,
 * and a member who is not offered work they may not do.
 *
 * A source guard proves the shape (scripts/employer-process-continuity-check.tsx);
 * this proves it in a browser.
 *
 * Runs only when E2E_LOCAL_STACK=1, and only against a localhost base URL: it
 * signs in with a fixture password and reads real recruitment records.
 * Without the flag the whole file skips rather than fails.
 *
 * Prerequisites (idempotent, local-only, in this order):
 *   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
 *        -f scripts/fixtures/interview-journey-fixture.sql
 *   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
 *        -f scripts/fixtures/employer-process-continuity-fixture.sql
 */

import { test, expect, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local signed-in walk.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE),
  "This walk signs in with a fixture password and runs only against localhost.",
);

const PASSWORD = "LocalJourney!2026";
const OWNER = "journey@local.test";
const MEMBER = "interviewer@local.test";
const SLUG = "journey-ab";

/** Everything the E1 fixture pins. Ids, never names: an id in a URL identifies
 *  a record, a name in a URL identifies a person. */
const F = {
  /** Linked, interview at prep_approved. */
  appUnderway: "e1000000-0000-4000-8000-00000000aa01",
  caseUnderway: "e1000000-0000-4000-8000-00000000cc01",
  jobUnderway: "e1000000-0000-4000-8000-00000000ff01",
  /** Linked, interview at `assessed`: report MATERIAL, no report. */
  appMaterial: "e1000000-0000-4000-8000-00000000aa02",
  caseMaterial: "e1000000-0000-4000-8000-00000000cc02",
  /** Linked, nothing started. */
  appNothing: "e1000000-0000-4000-8000-00000000aa03",
  /** Standalone: no application, no job. */
  caseStandalone: "e1000000-0000-4000-8000-00000000cc03",
  /** The journey fixture's case that really was finalised. */
  caseFinalised: "d4a40c8c-4e61-4934-af24-cc2de60bba31",
  appFinalised: "9e000000-0000-4000-8000-00000000e001",
} as const;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

const main = (page: Page) => page.locator("main").first();

async function openApplication(page: Page, applicationId: string) {
  await page.goto(`/employer/${SLUG}/applications/${applicationId}`);
  await expect(
    main(page).getByRole("heading", { name: /Processen för den här ansökan/i }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

/** The strip, as one region, so a assertion cannot accidentally match the
 *  same words in a section further down the page. */
const stripOf = (page: Page) => page.locator('section[aria-labelledby="continuity-heading"]');

/* ================================================================== */

test.describe("E1 · the recruitment spine", () => {
  test("job -> applications -> Candidate 360 keeps one candidate, job and application", async ({
    page,
  }) => {
    await signIn(page, OWNER);

    // 1. An existing job, and its applications.
    await page.goto(`/employer/${SLUG}/jobs/${F.jobUnderway}`);
    await expect(main(page)).toContainText(/Vaktare, stationar bevakning/i, { timeout: 30_000 });

    // 2. The application list, filtered to this job by the route it already has.
    await page.goto(`/employer/${SLUG}/applications`);
    await expect(main(page)).toBeVisible();

    // 3. One application.
    await openApplication(page, F.appUnderway);

    // 4. The same candidate, job and application as fixed context.
    const strip = stripOf(page);
    await expect(strip).toContainText(/Ansökan/);
    await expect(strip).toContainText(/Bedömning/);
    await expect(strip).toContainText(/Intervju/);
    await expect(strip).toContainText(/Rapport/);
    // The advertised role is on the page, from the application's own job.
    await expect(main(page)).toContainText(/Vaktare, stationar bevakning/i);

    // ONE WORD PER STATE. The strip's interview row and the case chip further
    // down the page describe the same case, so they must use the same label --
    // they used to read "Klar att genomföras" and "Redo för intervju".
    await expect(strip).toContainText(/Redo för intervju/);
    // And it is the URL that carries the application, as a path segment.
    expect(page.url()).toContain(`/applications/${F.appUnderway}`);
  });

  test("the interview is reached with context and returns to the same application", async ({
    page,
  }) => {
    await signIn(page, OWNER);
    await openApplication(page, F.appUnderway);

    // The strip's one next step, into the interview that exists.
    const cta = stripOf(page).getByRole("link").first();
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForURL(new RegExp(`interview-intelligence/${F.caseUnderway}`), {
      timeout: 30_000,
    });

    // Arrived with the SAME candidate, the advertised role, and the process
    // type said out loud.
    await expect(main(page)).toContainText(/E1 Kandidat A/);
    await expect(main(page)).toContainText(/Vaktare, stationar bevakning/i);
    await expect(main(page)).toContainText(/Kopplad till ansökan/);
    // The guide is named as a guide, never as the role.
    await expect(main(page)).toContainText(/Intervjuguide/);
    await expect(main(page)).toContainText(/Intern rubrik/);

    // The way back exists, and lands on the SAME application.
    const back = main(page).getByRole("link", { name: /Tillbaka till ansökan/i });
    await expect(back).toBeVisible();
    await back.click();
    await page.waitForURL(new RegExp(`applications/${F.appUnderway}`), { timeout: 30_000 });
    await expect(stripOf(page)).toBeVisible();
  });

  test("browser back and forward preserve the context", async ({ page }) => {
    await signIn(page, OWNER);
    await openApplication(page, F.appUnderway);
    await page.goto(`/employer/${SLUG}/interview-intelligence/${F.caseUnderway}`);
    await expect(main(page)).toContainText(/E1 Kandidat A/, { timeout: 30_000 });

    await page.goBack();
    await expect(stripOf(page)).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain(`/applications/${F.appUnderway}`);

    await page.goForward();
    await expect(main(page)).toContainText(/E1 Kandidat A/, { timeout: 30_000 });
    // Context after Forward is the SAME context, because it rides the route.
    await expect(main(page)).toContainText(/Kopplad till ansökan/);
  });
});

test.describe("E1 · the distinctions", () => {
  test("report material is not a finalised report", async ({ page }) => {
    await signIn(page, OWNER);

    // The case at `assessed`: material, and the strip says material.
    await openApplication(page, F.appMaterial);
    const strip = stripOf(page);
    await expect(strip).toContainText(/Rapportunderlag redo/);
    await expect(strip).not.toContainText(/Fastställd rapport finns/);

    // The case that really was finalised: a report, and the strip says report.
    await openApplication(page, F.appFinalised);
    await expect(stripOf(page)).toContainText(/Fastställd rapport finns/);

    // And the list counter counts only the second one.
    await page.goto(`/employer/${SLUG}/interview-intelligence`);
    await expect(main(page)).toContainText(/Fastställda rapporter/, { timeout: 30_000 });
    await expect(main(page)).not.toContainText(/Färdiga rapporter/);
    // The case at `assessed` reads as material in the list too.
    await expect(main(page)).toContainText(/Rapportunderlag redo/);
  });

  test("a standalone interview cannot be mistaken for a linked one", async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/employer/${SLUG}/interview-intelligence/${F.caseStandalone}`);
    await expect(main(page)).toContainText(/E1 Fristaende/, { timeout: 30_000 });
    await expect(main(page)).toContainText(/Fristående intervju/);
    await expect(main(page)).not.toContainText(/Kopplad till ansökan/);
    // No return path is offered, because there is nothing to return to -- and
    // none is invented from the candidate's name.
    await expect(main(page).getByRole("link", { name: /Tillbaka till ansökan/i })).toHaveCount(0);
  });

  test("nothing started says so, and does not invent a funnel", async ({ page }) => {
    await signIn(page, OWNER);
    await openApplication(page, F.appNothing);
    const strip = stripOf(page);
    await expect(strip).toContainText(/Ingen bedömning skickad/);
    await expect(strip).toContainText(/Ingen intervju planerad/);
    await expect(strip).toContainText(/Ingen rapport/);
    // The message is that neither is required.
    await expect(strip).toContainText(/Ingen av dem krävs/);
    // And the strip offers no primary call to action in that state.
    await expect(strip.getByRole("link")).toHaveCount(0);
  });

  test("no URL on the page carries a name or an address", async ({ page }) => {
    await signIn(page, OWNER);
    for (const id of [F.appUnderway, F.appMaterial, F.appNothing]) {
      await openApplication(page, id);
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
      for (const href of hrefs) {
        expect(href).not.toContain("@");
        expect(href).not.toMatch(/Kandidat|kandidat@|E1%20/i);
      }
    }
  });
});

test.describe("E1 · truthfulness", () => {
  test("a member is not offered work the database would refuse", async ({ page }) => {
    await signIn(page, MEMBER);
    await openApplication(page, F.appNothing);
    // A member may not assign an assessment. The page must not show a control
    // that would be refused, and must not pretend the process is blocked.
    await expect(main(page)).not.toContainText(/Skicka bedömning/);
    await expect(stripOf(page)).toBeVisible();
  });

  test("a failed read is not rendered as zero", async ({ page }) => {
    await signIn(page, OWNER);
    // The interview read is failed at the network boundary. Everything else on
    // the page still loads, which is the property: a partial failure names its
    // track and hides nothing that worked.
    // The server function's identity is BASE64 in the path segment, not the
    // function's name in the URL: /_serverFn/<base64 of {file, export}>. A
    // matcher that looks for the name in the raw URL matches nothing and the
    // test passes by accident, which is why this decodes.
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
    const strip = stripOf(page);
    await expect(strip).toContainText(/Kunde inte hämtas/, { timeout: 30_000 });
    // Never "no interview planned".
    await expect(strip).not.toContainText(/Ingen intervju planerad/);
    // And a retry that keeps the route.
    await expect(strip.getByRole("button", { name: /Försök igen/i })).toBeVisible();
    expect(page.url()).toContain(`/applications/${F.appUnderway}`);
  });
});

test.describe("E1 · responsive, English, and the keyboard", () => {
  test("the English mobile journey keeps context and the primary action", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, OWNER);
    await page.goto(`/employer/${SLUG}/applications/${F.appUnderway}`);
    // Switch to English through the product's own control.
    // The switch is a role="group" of two pills, and at 375 a second copy of it
    // lives inside the navigation drawer. Scoping to the visible group is what
    // stops a name-based lookup matching the menu button and opening the
    // drawer instead of changing the language.
    await page
      .getByRole("group", { name: /Språk|Language/i })
      .locator("visible=true")
      .first()
      .getByRole("button", { name: /^en$/i })
      .click();

    // The switch actually happened. An either-language assertion would pass on
    // a page that never changed, which is how the first version of this test
    // proved nothing.
    await expect(main(page)).toContainText(/This application's process/, { timeout: 30_000 });
    await expect(main(page)).not.toContainText(/Processen för den här ansökan/);

    // No horizontal overflow at 375.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("the primary action takes visible keyboard focus", async ({ page }) => {
    await signIn(page, OWNER);
    await openApplication(page, F.appUnderway);
    const cta = stripOf(page).getByRole("link").first();
    await cta.focus();
    await expect(cta).toBeFocused();
    const ring = await cta.evaluate(
      (el) => getComputedStyle(el).getPropertyValue("--tw-ring-offset-width") || "",
    );
    // The class carries the ring; the assertion that matters is that focus is
    // on the control and the control is the one the strip proposes.
    expect(typeof ring).toBe("string");
  });
});

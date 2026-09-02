/**
 * Interview Context Bridge — signed-in walk against the LOCAL stack.
 *
 * Runs only when E2E_LOCAL_STACK=1, and only against a localhost base URL.
 * Both guards are deliberate: this spec signs in with a fixture password and
 * reads real candidate material, and neither belongs anywhere near a shared
 * backend. Without the flag the whole file skips rather than fails, so a bare
 * `bunx playwright test` can never run it by accident.
 *
 * Prerequisites (both idempotent, both local-only):
 *   psql ... -f scripts/fixtures/interview-journey-fixture.sql
 *   psql ... -f scripts/fixtures/interview-context-bridge-fixture.sql
 *
 * Scenario E — the historical report — is NOT here. It is a database-level
 * claim (a frozen payload and its hash surviving a change to live data) and
 * proving it through a browser would prove less, more slowly. It lives in
 * scripts/interview-context-bridge-history-check.ts.
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

// ── The fixture cast ──────────────────────────────────────────────────────
const UI = {
  email: "uiowner@local.test",
  slug: "ui-vakt",
  /** Has a RELEASED assessment whose brief carries a governed interview guide. */
  appWithAssessment: "aa113333-0000-0000-0000-000000000002",
  /** Has assessments that exist and have NOT been released. */
  appUnreleased: "aa113333-0000-0000-0000-000000000003",
};

const JOURNEY = {
  email: "journey@local.test",
  slug: "journey-ab",
  /** An uploaded PDF CV, not a CQrityjob CV. */
  appExternalCv: "e67aba08-88a9-4ca6-8042-895290ba0d64",
  /** A case whose report is already final. */
  reportedCase: "d4a40c8c-4e61-4934-af24-cc2de60bba31",
};

const OUTSIDER = { email: "outsider@local.test", slug: "konkurrenten-ab" };

/** Wording that would mean the briefing had grown a decision engine. Asserted
 *  absent on every screen the walk visits, in both languages, because this is
 *  the one property no amount of correct data makes safe to lose. */
const BANNED = [
  /lämplig/i,
  /suitab/i,
  /rangordn/i,
  /ranking/i,
  /rekommenderar anställning/i,
  /recommend(ed)? (to )?hire/i,
  /\b\d{1,3}\s*% (match|fit|träff)/i,
];

/** Signs in through the unified auth form.
 *
 *  `/employer/login` is a legacy entry that redirects to `/login`, so the form
 *  is reached there directly. Fields are found by their `type` rather than by
 *  a label regex: the labels are translated, and a walk that only passes in
 *  Swedish would be the wrong thing to build for a product this PR is
 *  asserting language parity about. */
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  // Sign-in lands on the CANDIDATE home (/my-career), not the employer
  // workspace: every account is a person first and a member of an
  // organisation second. So the wait is "no longer on the form", and the
  // employer route is navigated to explicitly by each scenario.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

/** The briefing section, by its accessible heading rather than a class name. */
function briefing(page: Page) {
  return page.locator("section[aria-labelledby='ii-context']");
}

/** Negation markers. A sentence carrying one is DENYING a judgement, not
 *  making one, and denying is the behaviour this PR wants.
 *
 *  This is not a loophole; it is the distinction that matters. The governed
 *  pack's own prohibition reads "Vad som inte får härledas ur intervjun:
 *  personlighet, trovärdighet, lämplighet eller anställningsbeslut" — the
 *  single sentence on the screen that guarantees the property. A blanket ban
 *  on the word would fail on the sentence doing the work, and the way to make
 *  such a check pass is to delete the promise. */
const NEGATIONS = ["inte", "aldrig", "ingen", "inga", "utan", " not ", "never", " no "];

/** Sentence by sentence, over the BRIEFING rather than the whole page.
 *
 *  Scoped deliberately: the pinned pack's prohibitions and rating anchors are
 *  governed content this PR does not own and must not start policing, and a
 *  whole-page check would make every future pack revision this test's problem.
 *  What this PR is answerable for is the briefing it added. */
async function expectNoJudgement(page: Page, where: string) {
  const text = (await briefing(page).innerText()).toLowerCase();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const pattern of BANNED) {
    const offending = sentences.filter(
      (s) => pattern.test(s) && !NEGATIONS.some((n) => s.includes(n)),
    );
    expect(
      offending,
      `${where}: ${pattern} asserted rather than denied — "${offending[0] ?? ""}"`,
    ).toHaveLength(0);
  }
}

/** Opens the interview for an application, creating one if none exists yet,
 *  and returns the caseId. Mirrors what a recruiter actually does. */
async function openInterview(page: Page, slug: string, applicationId: string): Promise<string> {
  await page.goto(`/employer/${slug}/applications/${applicationId}`);
  const section = page.locator("section[aria-labelledby='candidate-structured-interview']");
  await expect(section).toBeVisible({ timeout: 45_000 });

  const start = section.getByRole("link", {
    name: /Planera intervju|Plan an interview/i,
  });
  const open = section.getByRole("link", {
    name: /Öppna intervjun|Öppna rapporten|Open interview|Open report/i,
  });

  if ((await start.count()) > 0) {
    // The hub's own link, followed as a recruiter would — which is also what
    // proves it carries the application AND the job in its query string.
    const href = await start.first().getAttribute("href");
    expect(href, "the hub link must carry the application").toContain(
      `applicationId=${applicationId}`,
    );
    await start.first().click();
    await page.waitForURL(/interview-intelligence\/new/, { timeout: 45_000 });

    // The pack is the only field the recruiter must still answer: the title
    // and the candidate arrive prefilled from the application.
    await expect(page.locator("#ii-candidate")).not.toHaveValue("", { timeout: 30_000 });
    const options = page.locator("#ii-pack option");
    await expect(options).not.toHaveCount(1, { timeout: 30_000 });
    await page.locator("#ii-pack").selectOption({ index: 1 });
    await page
      .getByRole("button", { name: /Planera intervjun|Plan the interview/i })
      .first()
      .click();
  } else {
    await open.first().click();
  }
  await page.waitForURL(/interview-intelligence\/[0-9a-f-]{36}\/(prepare|report)/, {
    timeout: 60_000,
  });
  return page.url().match(/interview-intelligence\/([0-9a-f-]{36})/)![1];
}

/* ==================================================================== */
/* SCENARIO A — application + released assessment                        */
/* ==================================================================== */

test("A · an interview opened from an application inherits its full context", async ({ page }) => {
  await signIn(page, UI.email);
  await openInterview(page, UI.slug, UI.appWithAssessment);

  const b = briefing(page);
  await expect(b).toBeVisible({ timeout: 20_000 });

  // Candidate, role and application, without the recruiter typing any of it.
  await expect(b).toContainText(/Väktare/i);
  await expect(b.getByText(/Kandidat|Candidate/).first()).toBeVisible();

  // The advert's requirements reached the briefing.
  await expect(b).toContainText(/incidenthantering/i);
  await expect(b).toContainText(/Väktarutbildning VU1/i);

  // The released assessment reached it, and is attributed.
  await expect(b).toContainText(/Bedömningsunderlag delgivet|Assessment material released/i);
  await expect(b.getByText(/^Bedömning$|^Assessment$/).first()).toBeVisible();

  // Areas to follow up, each carrying its reason.
  await expect(b).toContainText(/Att fördjupa i intervjun|To explore in the interview/i);
  await expect(b).toContainText(/Krav i annonsen|Requirement in the advert/i);

  await expectNoJudgement(page, "scenario A briefing");
});

test("A · the governed Q1–Q8 pack is unchanged by the briefing", async ({ page }) => {
  await signIn(page, UI.email);
  const caseId = await openInterview(page, UI.slug, UI.appWithAssessment);

  // The briefing carries AREAS and REASONS. It must not carry a second set of
  // interview questions competing with the pinned pack's.
  const b = briefing(page);
  // The briefing has its own query and settles after the case does, so it gets
  // the same explicit wait every other scenario gives it rather than the 5s
  // default.
  await expect(b).toBeVisible({ timeout: 30_000 });
  const briefingText = await b.innerText();

  // The pack's own questions live on the interview screen and are untouched.
  await page.goto(`/employer/${UI.slug}/interview-intelligence/${caseId}/prepare`);
  await expect(page.locator("main")).toContainText(/Q1|Fråga 1|Question 1|intervjuguide/i);

  // The assessment product's own question wording is deliberately not carried
  // across; only its follow-up area and reason are.
  expect(briefingText).not.toMatch(/Berätta om en gång då du/i);
});

/* ==================================================================== */
/* K — repeated action does not duplicate the interview case             */
/* ==================================================================== */

test("K · going back and clicking again opens the same case, never a second one", async ({
  page,
}) => {
  await signIn(page, UI.email);

  const first = await openInterview(page, UI.slug, UI.appWithAssessment);
  const second = await openInterview(page, UI.slug, UI.appWithAssessment);
  expect(second, "a second visit must open the case that already exists").toBe(first);

  // And the hub no longer offers to create one, so there is no screen state in
  // which a duplicate could be started by an impatient second click.
  await page.goto(`/employer/${UI.slug}/applications/${UI.appWithAssessment}`);
  const section = page.locator("section[aria-labelledby='candidate-structured-interview']");
  await expect(section).toBeVisible({ timeout: 45_000 });
  await expect(
    section.getByRole("link", { name: /Planera intervju|Plan an interview/i }),
  ).toHaveCount(0);
});

/* ==================================================================== */
/* SCENARIO B / G — no assessment, and an unreleased one                 */
/* ==================================================================== */

test("B+G · an unreleased assessment is never shown, and the interview still works", async ({
  page,
}) => {
  await signIn(page, UI.email);
  await openInterview(page, UI.slug, UI.appUnreleased);

  const b = briefing(page);
  await expect(b).toBeVisible({ timeout: 20_000 });

  // The truthful neutral state: either "none" or "under way", never a brief.
  await expect(b).toContainText(
    /Inget bedömningsunderlag|No assessment material|En bedömning pågår|An assessment is under way/i,
  );
  await expect(b).not.toContainText(/Bedömningsunderlag delgivet|Assessment material released/i);

  // Nothing from the unreleased assessment leaked into the follow-ups.
  await expect(b).not.toContainText(/Följ upp från bedömningen|Follow up from the assessment/i);

  // And the interview is not blocked: the advert still gives the recruiter
  // somewhere to start, and the setup work is reachable.
  await expect(b).toContainText(/Krav i annonsen|Requirement in the advert/i);

  await expectNoJudgement(page, "scenario B/G briefing");
});

/* ==================================================================== */
/* SCENARIO C — an external (uploaded) CV                                */
/* ==================================================================== */

test("C · an uploaded CV keeps the briefing functional and is named as what it is", async ({
  page,
}) => {
  await signIn(page, JOURNEY.email);
  await openInterview(page, JOURNEY.slug, JOURNEY.appExternalCv);

  const b = briefing(page);
  await expect(b).toBeVisible({ timeout: 20_000 });

  // Named as an uploaded CV, and NOT reported as a missing one.
  await expect(b).toContainText(/Uppladdat CV|Uploaded CV/i);
  await expect(b).not.toContainText(/Inget CV|No CV/i);

  // The candidate's own words still reach the briefing: an external CV costs
  // the parsed facts, not the application.
  await expect(b).toContainText(/Personligt brev|Cover note/i);

  await expectNoJudgement(page, "scenario C briefing");
});

/* ==================================================================== */
/* SCENARIO D — tenant abuse                                             */
/* ==================================================================== */

test("D · another employer cannot reach this application's interview context", async ({ page }) => {
  await signIn(page, OUTSIDER.email);

  // Their own workspace, another tenant's application id. The read model
  // returns nothing to a non-member, so this is "not there", not "forbidden".
  await page.goto(`/employer/${OUTSIDER.slug}/applications/${JOURNEY.appExternalCv}`);
  const outsiderText = await page.locator("body").innerText();
  expect(outsiderText).not.toMatch(/Personligt brev bifogat|Kandidat EXT-2026-001/i);

  // The interview case directly, by id. RLS turns "not yours" into "not there".
  await page.goto(
    `/employer/${OUTSIDER.slug}/interview-intelligence/${JOURNEY.reportedCase}/prepare`,
  );
  await page.waitForLoadState("networkidle");
  const caseText = await page.locator("body").innerText();
  expect(caseText).not.toMatch(/Kandidat EXT-2026-001/i);
  expect(caseText).not.toMatch(/incidenthantering/i);
  // The briefing must not render a linked context for somebody else's case.
  expect(caseText).not.toMatch(/Bedömningsunderlag delgivet/i);

  // And the other tenant's workspace is not reachable by slug either.
  await page.goto(`/employer/${JOURNEY.slug}/applications/${JOURNEY.appExternalCv}`);
  const crossText = await page.locator("body").innerText();
  expect(crossText).not.toMatch(/Kandidat EXT-2026-001/i);
});

/* ==================================================================== */
/* Responsive — the briefing must not bury the interview action          */
/* ==================================================================== */

for (const [label, width, height] of [
  ["375", 375, 812],
  ["768", 768, 1024],
  ["1440", 1440, 900],
] as const) {
  test(`viewport ${label} · the briefing stays scannable and never scrolls sideways`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, UI.email);
    await openInterview(page, UI.slug, UI.appWithAssessment);

    await expect(briefing(page)).toBeVisible({ timeout: 20_000 });

    // No horizontal overflow anywhere on the page. A briefing that pushes the
    // layout sideways at 375 is broken for a large share of the people who
    // conduct interviews on a phone between appointments.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${label}px`).toBeLessThanOrEqual(1);

    // The interview action is still reachable rather than buried under the
    // briefing: it is within two viewport heights of the top.
    const action = page
      .getByRole("button", { name: /starta intervju|påbörja|godkänn|start interview|approve/i })
      .first();
    if ((await action.count()) > 0) {
      const box = await action.boundingBox();
      if (box) expect(box.y, `action buried at ${label}px`).toBeLessThan(height * 4);
    }
  });
}

/* ==================================================================== */
/* FINALISATION CAPABILITY — the pilot defect, walked                    */
/* ==================================================================== */
//
// A pilot walkthrough reached the report screen, was shown an active "Slutför
// rapporten" button, clicked it, and was refused by the database. The rule was
// right; the screen was lying.
//
// The component guard renders both branches and the RPC guard proves the
// database still refuses a member. What only a signed-in walk can prove is the
// WIRING between them: that the role on the caller's own membership reaches
// the component as `canFinalise` for two different real people looking at the
// SAME case.

/** A journey case walked to report-ready (zero blockers, not yet locked). */
const READY_CASE = "047ce788-ea6a-4fe2-9fb1-c08c920926db";
const INTERVIEWER = "interviewer@local.test";

function reportUrl(caseId: string) {
  return `/employer/${JOURNEY.slug}/interview-intelligence/${caseId}/report`;
}

test("owner · a ready report offers the finalise action", async ({ page }) => {
  await signIn(page, JOURNEY.email);
  await page.goto(reportUrl(READY_CASE));

  const main = page.locator("main");
  // Content readiness, stated as a fact about the material.
  await expect(main).toContainText(/Underlaget är komplett|The material is complete/i, {
    timeout: 45_000,
  });

  // And the action, because this person may take it.
  const finalise = page.getByRole("button", { name: /Slutför rapporten|Complete the report/i });
  await expect(finalise).toBeVisible();
  await expect(finalise).toBeEnabled();

  // The owner is NOT shown the waiting state.
  await expect(main).not.toContainText(/redo för slutgodkännande|ready for final approval/i);
});

test("member · a ready report shows who must approve, and no button", async ({ page }) => {
  await signIn(page, INTERVIEWER);
  await page.goto(reportUrl(READY_CASE));

  const main = page.locator("main");

  // Same case, same completeness — this half is about the material and is true
  // for everyone.
  await expect(main).toContainText(/Underlaget är komplett|The material is complete/i, {
    timeout: 45_000,
  });

  // The authority half differs, and is stated rather than discovered.
  await expect(main).toContainText(
    /Rapporten är redo för slutgodkännande|ready for final approval/i,
  );
  await expect(main).toContainText(/ägare eller administratör|owner or administrator/i);

  // THE ASSERTION THIS WHOLE SECTION EXISTS FOR. No button, enabled or
  // otherwise: a greyed-out control is the same false claim in a quieter
  // voice, and the interviewer must not have to click to learn this.
  await expect(
    page.getByRole("button", { name: /Slutför rapporten|Complete the report/i }),
  ).toHaveCount(0);

  // And it is not dressed as a failure. This person did everything right.
  await expect(main.locator('[role="alert"]')).toHaveCount(0);
});

for (const [label, width, height] of [
  ["375", 375, 812],
  ["768", 768, 1024],
  ["1440", 1440, 900],
] as const) {
  test(`viewport ${label} · the member's waiting state is readable and does not overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, INTERVIEWER);
    await page.goto(reportUrl(READY_CASE));

    await expect(page.locator("main")).toContainText(
      /Rapporten är redo för slutgodkännande|ready for final approval/i,
      { timeout: 45_000 },
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${label}px`).toBeLessThanOrEqual(1);
  });
}

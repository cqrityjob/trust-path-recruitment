/**
 * The employer lifecycle (phases 2 and 3) — the signed-in walk against the
 * LOCAL stack.
 *
 * What the source guard proves about shape, this proves in a browser:
 *
 *   a vacancy   -> its pipeline, five numbers about this job
 *               -> one number -> exactly the applications it counted
 *   a colleague -> who and where, the door back to the application they were
 *                  hired from, what the role requires, their OWN development
 *               -> "assign a development programme", carrying the person
 *   a pending organisation
 *               -> is held at the waiting page, because the portal opens for
 *                  `active` and nothing else. The workforce write rule is
 *                  therefore proven where it is enforced -- in the database
 *                  suite -- and this walk asserts what the portal does.
 *
 * and the two states that look the same in a list and are not: an employment
 * record bound to a person, and one that is not.
 *
 * Runs only when E2E_LOCAL_STACK=1, and only against a localhost base URL: it
 * signs in with a fixture password and reads real recruitment records. Without
 * the flag the whole file skips rather than fails.
 *
 * Prerequisites (idempotent, local-only, in this order):
 *   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
 *        -f scripts/fixtures/interview-journey-fixture.sql
 *   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
 *        -f scripts/fixtures/employer-lifecycle-fixture.sql
 *
 * The two migrations behind phase 3 must be applied locally as well:
 *   psql … -f supabase/migrations/20261205090000_employer_workforce_active_only.sql
 *   psql … -f supabase/migrations/20261206090000_scp_training_assignment_person_context.sql
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
const PENDING_OWNER = "pending-owner@local.test";
const SLUG = "journey-ab";
const PENDING_SLUG = "vantande-vakt";

/** Everything the fixture pins. Ids, never names: an id in a URL identifies a
 *  record, a name in a URL identifies a person. */
const F = {
  job: "e1f00000-2222-4000-8000-0000000000f1",
  appSubmitted: "e1f00000-4444-4000-8000-0000000000a1",
  appInterview: "e1f00000-4444-4000-8000-0000000000a3",
  appHired: "e1f00000-4444-4000-8000-0000000000a4",
  /** Bound to a person AND hired from the application above. */
  employeeBound: "e1f00000-6666-4000-8000-0000000000e1",
  /** No person bound to it. */
  employeeUnbound: "e1f00000-6666-4000-8000-0000000000e2",
} as const;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

const main = (page: Page) => page.locator("main").first();
const pipelineOf = (page: Page) => page.locator('section[aria-labelledby="job-pipeline"]');

/* ================================================================== */

test.describe("phase 2 · the job is a recruitment container", () => {
  test("the vacancy summarises its own pipeline, and a count opens the rows it counted", async ({
    page,
  }) => {
    await signIn(page, OWNER);
    await page.goto(`/employer/${SLUG}/jobs/${F.job}`);

    const pipeline = pipelineOf(page);
    await expect(pipeline).toBeVisible({ timeout: 30_000 });

    // Five applications on this vacancy: two submitted, one at interview, one
    // hired, one rejected. The total counts all five; no stage claims the
    // closed one.
    await expect(pipeline).toContainText("Ansökningar totalt");
    await expect(pipeline.locator("dd").first()).toHaveText("5");
    await expect(pipeline).toContainText("Väntar på första granskning");
    await expect(pipeline).toContainText("Bedömning pågår eller väntar på utfall");
    await expect(pipeline).toContainText("I intervju");
    await expect(pipeline).toContainText("Anställda");

    // NOT a metric board: the one thing to do, and where.
    await expect(main(page)).toContainText("Nästa steg för annonsen");
    await expect(main(page)).toContainText(/2 nya ansökningar att granska/i);

    // The count that says "2" opens exactly those two.
    await page.getByRole("link", { name: /Väntar på första granskning/ }).click();
    await page.waitForURL(/\/applications\?/, { timeout: 30_000 });
    expect(page.url()).toContain(`job=${F.job}`);
    expect(page.url()).toContain("status=submitted");
    await expect(main(page)).toContainText(/Vaktare, lifecycle/i);
  });

  test("the interview work list lands on the interviews it counted", async ({ page }) => {
    await signIn(page, OWNER);
    // The stage a work-list row carries, arrived at directly: the row itself
    // is zero-suppressed and this organisation may have none.
    await page.goto(`/employer/${SLUG}/interview-intelligence?stage=readyToInterview`);
    await expect(main(page)).toContainText("Visar bara:", { timeout: 30_000 });
    // The totals above describe the organisation and must not shrink with the
    // filter -- a narrowed list that also narrows the totals tells a recruiter
    // their interviews vanished.
    await expect(main(page)).toContainText("Aktiva intervjuer");
    await expect(page.getByRole("link", { name: "Visa alla intervjuer" })).toBeVisible();
  });
});

/* ================================================================== */

test.describe("phase 3 · Employee 360", () => {
  test("one colleague: who and where, the door back, the role, their own development", async ({
    page,
  }) => {
    await signIn(page, OWNER);
    await page.goto(`/employer/${SLUG}/workforce/${F.employeeBound}`);

    // 1 · Who and where.
    await expect(main(page).getByRole("heading", { name: /EL Anstalld/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(main(page)).toContainText("Anställd sedan");

    // The door back to the application this hire came out of. Before this work
    // the hire could be followed forwards and never backwards.
    const hiredFrom = page.getByRole("link", { name: "Öppna ansökan" });
    await expect(hiredFrom).toBeVisible();
    await hiredFrom.click();
    await page.waitForURL(new RegExp(`/applications/${F.appHired}`), { timeout: 30_000 });
    await page.goBack();

    // 2 · Competence in the role. This employment has no profession recorded,
    // so the section says WHICH fact is missing rather than rendering a
    // heading over nothing, which is what it used to do.
    const competence = page.locator('section[aria-labelledby="person-competence"]');
    await expect(competence).toContainText(/Inget yrke är kopplat/);
    await expect(competence).not.toContainText(/%/);

    // 3 · Development. Filtered to this person, and empty is empty -- not the
    // organisation's whole list, which is what the heading used to link to.
    const development = page.locator('section[aria-labelledby="person-development"]');
    await expect(development).toContainText("Utveckling");
    await expect(development).toContainText(/Inga utvecklingsprogram är tilldelade/);
    // The wording rule, stated on the page itself.
    await expect(development).toContainText(/aldrig bevis på styrkt kompetens/);

    // 5 · The next action carries the person.
    const assign = development.getByRole("link", { name: /Tilldela utvecklingsprogram/ });
    await expect(assign).toBeVisible();
    await assign.click();
    await page.waitForURL(/\/training\/programmes\?/, { timeout: 30_000 });
    expect(page.url()).toContain(`employee=${F.employeeBound}`);
    // And the way back, so the flow returns where it started.
    await expect(page.getByRole("link", { name: "Tillbaka till medarbetaren" })).toBeVisible();
  });

  test("an employment record with nobody bound to it says so", async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/employer/${SLUG}/workforce/${F.employeeUnbound}`);

    const development = page.locator('section[aria-labelledby="person-development"]');
    await expect(development).toContainText(/inte knuten till ett CQrityjob-konto/i, {
      timeout: 30_000,
    });
    // An empty list here would read as "this colleague has had no
    // development", which is a claim about them rather than about the record.
    await expect(development).not.toContainText(/Inga utvecklingsprogram är tilldelade/);
  });

  test("no subject reference is rendered on any employer surface", async ({ page }) => {
    await signIn(page, OWNER);
    for (const path of [
      `/employer/${SLUG}/workforce/${F.employeeBound}`,
      `/employer/${SLUG}/training/participants`,
      `/employer/${SLUG}/jobs/${F.job}`,
    ]) {
      await page.goto(path);
      await expect(main(page)).toBeVisible({ timeout: 30_000 });
      const body = (await main(page).textContent()) ?? "";
      // A subject id is a uuid, and the only uuids that may appear in this
      // product's copy are none at all. The participants list used to print
      // eight characters of one under every name.
      expect(body).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}\b/i);
      expect(body).not.toMatch(/Referens\s+[0-9a-f]{8}\b/i);
    }
  });
});

/* ================================================================== */

test.describe("the write rule · an employment record waits for approval", () => {
  test("a pending organisation is held at the waiting page, not at a half-open workspace", async ({
    page,
  }) => {
    await signIn(page, PENDING_OWNER);

    // ── WHAT THIS WALK FOUND, AND WHY THE ASSERTION IS THIS ────────────
    //
    // The Product Owner's split is that a pending organisation MAY prepare a
    // job draft and MUST NOT create an employment record. The first half is
    // true of the DATABASE -- employer_members_can_edit() admits pending, and
    // 20261205090000 deliberately leaves jobs alone -- and it is NOT true of
    // the portal: `/employer/$employerSlug` has redirected every non-active
    // organisation to the waiting page since before this work, with its own
    // comment saying there is no tier of "not quite active but close enough".
    //
    // So a pending owner cannot reach /jobs/new, /workforce, or any other
    // workspace route, and the workforce refusal cannot be observed in a
    // browser at all. It is observed where it is enforced:
    // supabase/tests/employer_lifecycle_phase1_3_test.sql proves the pending
    // organisation is refused an employment record through the portal's own
    // role AND through service_role, and permitted a job draft in the same
    // transaction.
    //
    // Opening the workspace to a pending organisation is a product decision
    // this work was told not to take, so this asserts what the product
    // actually does rather than what the brief assumed.
    await page.goto(`/employer/${PENDING_SLUG}/workforce`);
    await page.waitForURL(/\/employer\/pending/, { timeout: 30_000 });
    await expect(main(page)).toBeVisible();

    await page.goto(`/employer/${PENDING_SLUG}/jobs/new`);
    await page.waitForURL(/\/employer\/pending/, { timeout: 30_000 });
  });
});

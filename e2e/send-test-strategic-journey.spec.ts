/**
 * "Skicka test" for the STRATEGIC level, end to end -- on the loopback stack
 * with separate signed-in synthetic people, mirroring the operational walk in
 * e2e/send-test-journey.spec.ts step for step, on a different application.
 *
 * Owner update (2026-09-26): both assessment levels must be available at
 * launch, and the strategic level must not be a visible-but-disabled choice
 * or the operational test renamed. Since 20261216090000 the strategic level
 * has content of its own -- the Säkerhetschef guide and the Security Manager
 * recruitment test -- authored as a governed DRAFT that CQrityjob has not
 * released. This walk proves both halves of that:
 *
 *   1. BEFORE any release: the dialog shows the strategic level as a draft
 *      awaiting content approval, with its own test named and refused, and
 *      nothing can be sent; the library route offers no strategic setup;
 *   2. the content is released to THIS organisation the only way the model
 *      allows short of the owner's approval -- a time-boxed closed-test grant
 *      on the test and a synthetic pilot grant on the guide (the fixture of
 *      this walk, never a production act) -- and the owner sends the
 *      strategic test: the level is recorded, the assignment pins the
 *      strategic version, the invitation reaches the candidate; the
 *      operational level stays independently sendable;
 *   3. the dialog says "already sent" for the strategic level only, and a
 *      repeat of the underlying send lands on the same attempt;
 *   4. the candidate, signed out, is sent through the sign-in with the
 *      destination kept and finds the strategic test, named as such;
 *   5. the candidate is interrupted, continues, answers all 37 items of the
 *      STRATEGIC form and submits once;
 *   6. a colleague with review permission reads the three written reflections
 *      against the strategic rubrics, the attempt is scored, the owner
 *      releases the material and opens the completion: never a failure;
 *   7. Förbered intervju on that test opens a case whose setup is
 *      TRUST · Security Manager and whose guide is the Säkerhetschef pack;
 *   8. another organisation reads none of it, on screen or over the API.
 *
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *   E2E_SUPABASE_URL=http://127.0.0.1:54331 \
 *   E2E_SUPABASE_ANON_KEY=... JOURNEY_DATABASE_URL=postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e \
 *   bunx playwright test e2e/send-test-strategic-journey.spec.ts --project=chromium
 *
 * Not idempotent by design: run on a reseeded stack (up.sh --reseed).
 */

import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const DB = process.env.JOURNEY_DATABASE_URL ?? "";
test.skip(
  !LOCAL,
  "Set E2E_LOCAL_STACK=1 to run the strategic send-test walk against a local stack.",
);
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The walk runs only against loopback — never a shared or hosted backend.",
);
test.skip(
  LOCAL && (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API) || !ANON_KEY),
  "E2E_SUPABASE_URL (loopback) and E2E_SUPABASE_ANON_KEY are needed for the data-plane assertions.",
);
test.skip(
  LOCAL && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/beskt_e2e$/.test(DB),
  "JOURNEY_DATABASE_URL must be the loopback beskt_e2e test database.",
);
test.describe.configure({ mode: "serial", timeout: 600_000 });

const OUT = "artifacts/bugfix-2026-09-26/strategic";
mkdirSync(OUT, { recursive: true });
const PASSWORD = "LocalJourney!2026";
const OWNER = "beskt-recruiter@local.test";
const REVIEWER = "beskt-assessor@local.test";
const CANDIDATE = "beskt-candidate2@local.test";
const RIVAL = "beskt-outsider@local.test";
const EMPLOYER = "beskt-journey-ab";
const EMPLOYER_ID = "b4000000-0000-4000-8000-00000000ee01";
const OWNER_ID = "b4000000-0000-4000-8000-0000000000d1";
const APPLICATION = "b4000000-0000-4000-8000-00000000aa02";
const TEST_SLUG = "security-manager-recruitment";
const TEST_NAME = "Säkerhetschef – Recruitment Assessment";
const GUIDE_SLUG = "security-manager-se";
const ITEMS = 37;

const state = { assignmentId: "", attemptId: "", caseId: "", casePath: "" };

function sql(query: string): string {
  return execFileSync("psql", [DB, "-tAq", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8",
  }).trim();
}

async function accessToken(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.ok, `local sign-in for ${email}`).toBe(true);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, scale: "css" });
}

function released(): boolean {
  return (
    sql(
      `SELECT count(*) FROM scp_test_grants g JOIN scp_assessment_definitions d ON d.id = g.definition_id
        WHERE g.employer_id = '${EMPLOYER_ID}' AND d.slug = '${TEST_SLUG}' AND g.revoked_at IS NULL`,
    ) !== "0"
  );
}

function recover(): void {
  if (!state.assignmentId) {
    const row = sql(
      `SELECT aa.id || '|' || coalesce(t.id::text, '') FROM assessment_assignments aa
         LEFT JOIN scp_attempts t ON t.assignment_id = aa.id
        WHERE aa.application_id = '${APPLICATION}' AND aa.cancelled_at IS NULL`,
    );
    if (row) [state.assignmentId, state.attemptId] = row.split("|") as [string, string];
  }
  if (!state.caseId && state.assignmentId) {
    state.caseId = sql(
      `SELECT interview_case_id FROM scp_interview_starts
        WHERE source_id = '${state.assignmentId}' AND superseded_at IS NULL`,
    );
    if (state.caseId)
      state.casePath = `/employer/${EMPLOYER}/interview-intelligence/${state.caseId}`;
  }
}
test.beforeEach(() => {
  if (LOCAL && DB) recover();
});

test.describe("Skicka test — the strategic level, end to end", () => {
  test("1 · before any release: a draft awaiting content approval, its own test named, nothing sendable", async ({
    page,
  }) => {
    test.skip(
      released(),
      "the fixture grants already exist on this stack; step 1 is the pre-release state",
    );
    // The content is installed (the migration replayed) but not released.
    expect(
      sql(
        `SELECT standard_for_recruitment FROM scp_assessment_definitions WHERE slug = '${TEST_SLUG}'`,
      ),
    ).toBe("f");
    expect(
      sql(
        `SELECT v.content_status || '|' || v.validation_label || '|' || v.pilot_availability
           FROM scp_interview_pack_versions v JOIN scp_interview_packs p ON p.id = v.pack_id
          WHERE p.slug = '${GUIDE_SLUG}'`,
      ),
    ).toBe("draft|pilot_hypothesis|restricted");

    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications`);
    await page.locator(`[data-testid="send-test"][data-application-id="${APPLICATION}"]`).click();
    const strategic = page.getByTestId("send-test-level-strategic");
    await expect(strategic).toHaveAttribute("data-state", "not_assignable", { timeout: 60_000 });
    await expect(page.getByTestId("send-test-level-operational")).toHaveAttribute(
      "data-state",
      "sendable",
    );
    const pending = page.getByTestId("send-test-strategic-pending");
    await expect(pending).toContainText(/utkast under granskning/i);
    await expect(pending).toContainText(/inte frisläppt för rekrytering/i);
    await expect(pending).toContainText(/samlat innehållsgodkännande/i);
    await expect(page.getByTestId("send-test-card-strategic")).toContainText(TEST_NAME);
    await expect(page.getByTestId("send-test-card-strategic")).toHaveAttribute(
      "data-content-status",
      "draft",
    );
    await expect(strategic).not.toContainText(/Väktare – Recruitment Assessment/);
    await expect(strategic).not.toContainText(/kommer snart|coming soon|validerat/i);
    await strategic.locator('input[type="radio"]').check();
    await expect(page.getByTestId("send-test-submit")).toBeDisabled();
    await expect(page.getByTestId("send-test-blocked")).toBeVisible();
    await shot(page, "1-before-release");

    // The library route offers no strategic setup either: the guide is
    // restricted, so nothing can be started with it.
    await page.goto(`${BASE}/employer/${EMPLOYER}/assessments/library`);
    await page.getByTestId("lib-method-trust-choose").click();
    await expect(page.getByTestId("lib-group-operational")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("lib-group-strategic")).toHaveCount(0);
    expect(
      sql(`SELECT count(*) FROM assessment_assignments WHERE application_id = '${APPLICATION}'`),
    ).toBe("0");
  });

  test("2 · released to this organisation (fixture), the strategic test is sent with its level", async ({
    page,
  }) => {
    if (!released()) {
      // THE FIXTURE, and the only release this walk performs: a time-boxed
      // closed-test grant on the test and a synthetic pilot grant on the guide
      // for this one organisation -- the model's own instruments for a
      // restricted cohort (20260818162445, 20260921090000). Neither is the
      // owner's content approval, and neither exists outside this database.
      sql(
        `INSERT INTO scp_test_grants (employer_id, purpose, definition_id, reason, expires_at)
         SELECT '${EMPLOYER_ID}', 'closed_test', d.id, 'loopback walk: strategic level under review', now() + interval '7 days'
           FROM scp_assessment_definitions d WHERE d.slug = '${TEST_SLUG}'`,
      );
      sql(
        `INSERT INTO scp_interview_pack_pilot_grants
           (employer_id, pack_version_id, granted_by, rationale, usage_mode, environment, starts_on, expires_on)
         SELECT '${EMPLOYER_ID}', v.id, '${OWNER_ID}', 'loopback walk: strategic guide under review', 'synthetic_test', 'development', current_date, current_date + 7
           FROM scp_interview_pack_versions v JOIN scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = '${GUIDE_SLUG}'`,
      );
    }
    // Released, the library offers the strategic setup with ITS OWN guide and
    // test -- the setup the send will record.
    await signIn(page, OWNER, `/employer/${EMPLOYER}/assessments/library`);
    await page.getByTestId("lib-method-trust-choose").click();
    await page.getByTestId("lib-group-strategic").check();
    await page.getByTestId("lib-env-general").check();
    const setup = page.getByTestId("lib-setup");
    await expect(setup).toHaveAttribute("data-startable", "true", { timeout: 60_000 });
    await expect(setup.getByTestId("lib-setup-candidate")).toContainText(TEST_NAME);
    await expect(setup.getByTestId("lib-setup-interview")).toContainText(/Säkerhetschef/);
    await expect(setup.getByTestId("lib-setup-candidate")).not.toContainText(
      /Väktare – Recruitment Assessment/,
    );
    await shot(page, "2-library-strategic-setup");

    await page.goto(`${BASE}/employer/${EMPLOYER}/applications`);
    await page.locator(`[data-testid="send-test"][data-application-id="${APPLICATION}"]`).click();
    const strategic = page.getByTestId("send-test-level-strategic");
    await expect(strategic).toHaveAttribute("data-state", "sendable", { timeout: 60_000 });
    await expect(strategic).toContainText(/Strategiska och ledande roller/);
    await expect(strategic).toContainText(TEST_NAME);
    await expect(strategic).toContainText(new RegExp(`${ITEMS} uppgifter i 5 delar`));
    await expect(strategic).toContainText(/sluten test/i);
    await expect(strategic).not.toContainText(/Väktare – Recruitment Assessment/);
    await expect(page.getByTestId("send-test-level-operational")).toHaveAttribute(
      "data-state",
      "sendable",
    );
    await strategic.locator('input[type="radio"]').check();
    const submit = page.getByTestId("send-test-submit");
    await expect(submit).toBeEnabled();
    await submit.click();
    await submit.click({ force: true, noWaitAfter: true }).catch(() => undefined);
    await expect(page.getByTestId("send-test-sent")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("send-test-setup")).toHaveAttribute("data-recorded", "true");
    await expect(page.getByTestId("send-test-invitation")).toHaveAttribute(
      "data-delivery",
      /delivered|already_sent/,
    );
    await shot(page, "2-sent");

    const row = sql(
      `SELECT aa.id || '|' || t.id || '|' || s.role_group || '|' || s.role_profile || '|' || d.slug || '|' || f.slug || '|' ||
              (SELECT count(*) FROM assessment_assignments x WHERE x.application_id = '${APPLICATION}' AND x.cancelled_at IS NULL) || '|' ||
              (SELECT count(*) FROM recruitment_messages m WHERE m.application_id = '${APPLICATION}' AND m.idempotency_key = 'test-invitation:' || aa.id::text AND m.status = 'sent') || '|' ||
              coalesce(t.governance_mode::text, '')
         FROM assessment_assignments aa
         JOIN scp_attempts t ON t.assignment_id = aa.id
         JOIN scp_assessment_setups s ON s.assessment_assignment_id = aa.id
         JOIN scp_assessment_versions av ON av.id = t.assessment_version_id
         JOIN scp_assessment_definitions d ON d.id = av.definition_id
         JOIN scp_forms f ON f.id = t.form_id
        WHERE aa.application_id = '${APPLICATION}' AND aa.cancelled_at IS NULL`,
    );
    const [assignmentId, attemptId, group, profile, slug, form, assignments, messages, mode] =
      row.split("|");
    expect(group, "the level travels with the test").toBe("strategic");
    expect(profile).toBe("security_manager");
    expect(slug, "the assignment pins the strategic test, not the operational one").toBe(TEST_SLUG);
    expect(form).toBe("security-manager-recruitment-form-a");
    expect(assignments, "one assignment, whatever the number of clicks").toBe("1");
    expect(messages, "one invitation, delivered").toBe("1");
    expect(mode, "a draft runs as a closed test, and the attempt says so").toBe("closed_test");
    state.assignmentId = assignmentId!;
    state.attemptId = attemptId!;
  });

  test("3 · a second send is not offered for that level, and a repeat lands on the same attempt", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await page.getByTestId("send-test").click();
    const strategic = page.getByTestId("send-test-level-strategic");
    await expect(strategic).toHaveAttribute("data-state", "already_sent", { timeout: 60_000 });
    await expect(strategic).toContainText(/Redan skickat/);
    // The levels are independent: the operational test was not sent here.
    await expect(page.getByTestId("send-test-level-operational")).toHaveAttribute(
      "data-state",
      "sendable",
    );
    await strategic.locator('input[type="radio"]').check();
    await expect(page.getByTestId("send-test-submit")).toBeDisabled();
    await shot(page, "3-already-sent");

    const token = await accessToken(OWNER);
    const version = sql(
      `SELECT av.id FROM scp_assessment_versions av JOIN scp_assessment_definitions d ON d.id = av.definition_id
        WHERE d.slug = '${TEST_SLUG}' ORDER BY av.version_number DESC LIMIT 1`,
    );
    const res = await fetch(`${API}/rest/v1/rpc/scp_assign_from_application`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        _employer_id: EMPLOYER_ID,
        _application_id: APPLICATION,
        _assessment_version_id: version,
        _deadline: null,
        _language: "sv",
      }),
    });
    expect(res.status, "the repeat is accepted, not refused").toBe(200);
    const body = (await res.json()) as Array<{ assignment_id: string; attempt_id: string }>;
    expect(body[0]!.assignment_id).toBe(state.assignmentId);
    expect(body[0]!.attempt_id).toBe(state.attemptId);
    expect(
      sql(`SELECT count(*) FROM scp_attempts WHERE assignment_id = '${state.assignmentId}'`),
    ).toBe("1");
  });

  test("4 · the signed-out candidate is sent through the sign-in and finds the strategic test", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/academy`);
    await page.waitForURL(/\/login\?redirect=%2Facademy/, { timeout: 60_000 });
    await page.getByLabel(/^e-?post$|^email$/i).fill(CANDIDATE);
    await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
    await page.waitForURL(/\/academy$/, { timeout: 60_000 });
    await expect(page.locator(`a[href$="/academy/${state.attemptId}"]`).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator("main")).toContainText(TEST_NAME);
    await expect(page.locator("main")).toContainText(/BESKT Journey AB/);
    await expect(page.locator("main")).not.toContainText(/Väktare – Recruitment Assessment/);
    await shot(page, "4-candidate-academy");
    await page.goto(`${BASE}/my-career/applications`);
    await expect(page.locator("main")).toContainText(
      new RegExp(`Test att göra: ${TEST_NAME.replace(/[–]/g, ".")}`),
      { timeout: 60_000 },
    );
    await shot(page, "4-candidate-inbox");
    await ctx.close();
  });

  test(`5 · the candidate is interrupted, continues, answers all ${ITEMS} items of the strategic form and submits once`, async ({
    page,
  }) => {
    await signIn(page, CANDIDATE, "/academy");
    await page.locator(`a[href$="/academy/${state.attemptId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/academy/${state.attemptId}$`), { timeout: 60_000 });
    // The introduction counts the strategic form's own structure -- five
    // named parts, 37 tasks -- never the security-officer form's.
    const intro = page.locator("main");
    await expect(intro).toContainText(new RegExp(`5 delar · ${ITEMS} uppgifter`), {
      timeout: 60_000,
    });
    await expect(intro).toContainText(/Riskbaserad prioritering och styrning/);
    await expect(intro).toContainText(/Incident- och krisledning/);
    await expect(intro).toContainText(/Arbetsbeteende som ledare/);
    await expect(intro).not.toContainText(/50 uppgifter/);
    await page
      .getByRole("button", { name: /^Börja$|^Fortsätt där du slutade$/ })
      .first()
      .click();

    let answered = 0;
    let interrupted = false;
    for (let guard = 0; guard < 200; guard += 1) {
      const cont = page.getByRole("button", { name: /^Fortsätt$/ });
      const next = page.getByRole("button", { name: /^Nästa$/ });
      const submit = page.getByRole("button", { name: /^Lämna in$/ });
      await expect(cont.or(next).or(submit).first()).toBeVisible({ timeout: 60_000 });
      if (await cont.isVisible()) {
        await cont.click();
        continue;
      }
      const text = page.locator("textarea[id^='cr-']");
      if (await text.isVisible()) {
        await text.fill(
          `SYNTETISKT svar ${answered + 1}: jag redovisade underlaget för ledningen, stod fast vid bedömningen och följde upp beslutet med teamet.`,
        );
        await text.blur();
      } else {
        const groups = page.locator("main fieldset");
        const n = await groups.count();
        for (let g = 0; g < n; g += 1) await groups.nth(g).locator("label").first().click();
      }
      await expect(page.getByText(/Sparat|Saved/).first()).toBeVisible({ timeout: 30_000 });
      answered += 1;
      if (answered === 10 && !interrupted) {
        interrupted = true;
        await page.reload();
        await page
          .getByRole("button", { name: /^Fortsätt där du slutade$|^Börja$/ })
          .first()
          .click();
        expect(
          Number(
            sql(
              `SELECT count(*) FROM scp_candidate_responses WHERE attempt_id = '${state.attemptId}'`,
            ),
          ),
          "the answers saved before the interruption survive it",
        ).toBeGreaterThanOrEqual(10);
        continue;
      }
      if (await submit.isVisible()) {
        await submit.click();
        break;
      }
      await next.click();
    }
    expect(answered, "every item of the strategic form was answered").toBe(ITEMS);
    await expect(page.getByText(/inlämnad|Tack/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^Lämna in$/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Lämna in$|^Nästa$/ })).toHaveCount(0);
    await shot(page, "5-submitted");
    expect(
      sql(
        `SELECT status || '|' || (SELECT count(*) FROM scp_candidate_responses WHERE attempt_id = '${state.attemptId}') || '|' || (SELECT count(*) FROM scp_attempts WHERE assignment_id = '${state.assignmentId}') || '|' ||
                (SELECT count(DISTINCT i.slug) FROM scp_candidate_responses r JOIN scp_item_versions iv ON iv.id = r.item_version_id JOIN scp_items i ON i.id = iv.item_id WHERE r.attempt_id = '${state.attemptId}' AND i.slug LIKE 'sm-rj-%')
           FROM scp_attempts WHERE id = '${state.attemptId}'`,
      ),
    ).toMatch(new RegExp(`^(submitted|scored)\\|${ITEMS}\\|1\\|${ITEMS}$`));
  });

  test("6 · the reflections are read against the strategic rubrics, the material is released, and the employer sees a completion", async ({
    browser,
  }) => {
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await signIn(owner, OWNER, `/employer/${EMPLOYER}/settings`);
    const row = owner.locator("tr").filter({ hasText: "beskt-assessor" });
    await expect(row).toBeVisible({ timeout: 60_000 });
    const grant = row.getByRole("button", { name: /Ge granskningsbehörighet/ });
    if (await grant.isVisible()) await grant.click();
    await expect(
      row.getByRole("button", { name: /Ta bort granskningsbehörighet|Återkalla/ }),
    ).toBeVisible({ timeout: 60_000 });

    const status = () => sql(`SELECT status FROM scp_attempts WHERE id = '${state.attemptId}'`);
    const revCtx = await browser.newContext();
    const reviewer = await revCtx.newPage();
    if ((await status()) === "submitted") {
      await signIn(reviewer, REVIEWER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
      await reviewer
        .getByRole("link", { name: /^Granska svaren/ })
        .first()
        .click();
      await expect(reviewer).toHaveURL(/\/assessments\/reviews\//, { timeout: 60_000 });
      let reviewed = 0;
      for (let guard = 0; guard < 80; guard += 1) {
        const form = reviewer.locator("main form").first();
        const present = await form
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        if (!present) break;
        // The strategic rubric dimensions are on screen, not the operational ones.
        await expect(form).toContainText(/Konkret situation/);
        await expect(form).toContainText(
          /Redovisat resonemang|Vad som ändrades|Redovisad avvägning/,
        );
        const names = await form
          .locator("input[type=radio]")
          .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))]);
        for (const name of names) {
          const options = form.locator(`input[type=radio][name="${name}"]`);
          const count = await options.count();
          const pick = name.startsWith("finding-") ? 0 : Math.floor(count / 2);
          await options.nth(pick).check({ force: true });
        }
        await form
          .locator("textarea[id^='rationale-']")
          .fill("SYNTETISK granskning: svaret beskriver ett konkret beslut och dess uppföljning.");
        await form.getByRole("button", { name: /^Slutför granskning$/ }).click();
        reviewed += 1;
        await reviewer.waitForTimeout(1500);
      }
      expect(reviewed, "the three written reflections needed a human review").toBe(3);
      await expect.poll(status, { timeout: 60_000 }).toBe("scored");
      await shot(reviewer, "6-reviewed");
    }
    expect(await status()).not.toBe("submitted");

    if ((await status()) === "scored") {
      await owner.goto(`/employer/${EMPLOYER}/assessments/participants`);
      const card = owner
        .locator("article, li, section")
        .filter({ hasText: new RegExp(`${ITEMS} av ${ITEMS} besvarade`) })
        .filter({ has: owner.getByRole("button", { name: /^Dela kandidatunderlaget$/ }) });
      await card
        .getByRole("button", { name: /^Dela kandidatunderlaget$/ })
        .first()
        .click();
      await owner.getByRole("button", { name: /^Ja, dela kandidatunderlaget$/ }).click();
      await expect.poll(status, { timeout: 60_000 }).toBe("released");
      await shot(owner, "6-released");
    }
    expect(await status()).toBe("released");

    // The completion on the candidate page: the right test, all items, and
    // never a failure. The report keeps the closed-test basis.
    await owner.goto(`/employer/${EMPLOYER}/applications/${APPLICATION}`);
    const main = owner.locator("main");
    await expect(main).toContainText(TEST_NAME, { timeout: 60_000 });
    await expect(main).toContainText(new RegExp(`${ITEMS}/${ITEMS}`));
    await expect(main).toContainText(/Slutförd|Underlag klart|Delat|Väntar på granskning/);
    await expect(main).not.toContainText(/misslyckad|underkänd|failed/i);
    await shot(owner, "6-employer-completion");

    // The employer opens the released results from the application: the
    // strategic test's own report, never the operational one, and never a
    // verdict.
    const openResults = main.getByRole("link", { name: /^Öppna kandidatunderlag/ }).first();
    await expect(openResults).toBeVisible({ timeout: 60_000 });
    await openResults.click();
    await expect(owner).toHaveURL(
      new RegExp(`/employer/${EMPLOYER}/assessments/results/${state.attemptId}`),
      { timeout: 60_000 },
    );
    const results = owner.locator("main");
    await expect(results).toContainText(TEST_NAME, { timeout: 60_000 });
    await expect(results).not.toContainText(/Väktare/);
    await expect(results).not.toContainText(
      /godkänd|underkänd|lämplig|olämplig|approved|rejected/i,
    );
    await shot(owner, "6-results-opened");
    expect(
      sql(`SELECT count(*) FROM scp_report_snapshots s WHERE s.attempt_id = '${state.attemptId}'`),
      "the released material exists as report snapshots of this attempt",
    ).not.toBe("0");
    await ownerCtx.close();
    await revCtx.close();
  });

  test("7 · Förbered intervju on that test opens a case with the strategic setup and the Säkerhetschef guide", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    const button = page.getByTestId(`prepare-interview-${state.assignmentId}`);
    await expect(button).toBeVisible({ timeout: 60_000 });
    await button.click();
    await expect(page).toHaveURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, {
      timeout: 60_000,
    });
    state.casePath = new URL(page.url()).pathname.replace(/\/prepare$/, "");
    state.caseId = state.casePath.split("/").pop()!;
    await expect(page.getByTestId("case-setup-value")).toHaveText(
      /TRUST · Security Manager \/ säkerhetschef · Generell säkerhetsverksamhet/,
      { timeout: 60_000 },
    );
    await expect(page.locator("main")).toContainText(/Säkerhetschef/);
    await shot(page, "7-interview-prepare");

    expect(
      sql(
        `SELECT p.slug || '|' || s.role_group || '|' || s.role_profile || '|' || c.status
           FROM scp_interview_cases c
           JOIN scp_interview_pack_versions v ON v.id = c.pack_version_id
           JOIN scp_interview_packs p ON p.id = v.pack_id
           JOIN scp_recruitment_setups s ON s.interview_case_id = c.id
          WHERE c.id = '${state.caseId}'`,
      ),
      "the case pins the Säkerhetschef guide and carries the strategic setup",
    ).toMatch(new RegExp(`^${GUIDE_SLUG}\\|strategic\\|security_manager\\|`));

    // A retry opens the same case, and the tests tab names the strategic test.
    await page.goto(`${BASE}/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await page.getByTestId(`prepare-interview-${state.assignmentId}`).click();
    await expect(page).toHaveURL(new RegExp(`${state.caseId}/prepare$`), { timeout: 60_000 });
    await page.goto(`${BASE}${state.casePath}/tests`);
    const source = page.getByTestId("case-source-test");
    await expect(source).toBeVisible({ timeout: 60_000 });
    await expect(source).toHaveAttribute("data-assignment-id", state.assignmentId);
    await expect(page.getByTestId("case-tests")).toContainText(new RegExp(`${ITEMS}/${ITEMS}`));
    await expect(page.getByTestId("case-tests")).toContainText(TEST_NAME);
    await shot(page, "7-case-tests");
  });

  test("8 · another organisation reads none of it, on screen or over the API", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, RIVAL, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await expect(page.locator("body")).not.toContainText(TEST_NAME, { timeout: 30_000 });
    await expect(page.getByTestId("send-test")).toHaveCount(0);
    await ctx.close();

    const token = await accessToken(RIVAL);
    for (const [table, filter] of [
      ["assessment_assignments", `id=eq.${state.assignmentId}`],
      ["scp_attempts", `id=eq.${state.attemptId}`],
      ["scp_assessment_setups", `assessment_assignment_id=eq.${state.assignmentId}`],
      ["scp_recruitment_setups", `interview_case_id=eq.${state.caseId}`],
      ["scp_interview_cases", `id=eq.${state.caseId}`],
      ["scp_report_snapshots", `attempt_id=eq.${state.attemptId}`],
      ["recruitment_messages", `application_id=eq.${APPLICATION}`],
    ] as const) {
      const res = await fetch(`${API}/rest/v1/${table}?${filter}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      });
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect((await res.json()) as unknown[], `${table} leaks to another organisation`).toEqual(
          [],
        );
      }
    }
    // And the candidate never reads the recruiter's report material.
    const candidate = await accessToken(CANDIDATE);
    const res = await fetch(
      `${API}/rest/v1/scp_report_snapshots?attempt_id=eq.${state.attemptId}&audience=eq.employer&select=*`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${candidate}` } },
    );
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) expect((await res.json()) as unknown[]).toEqual([]);
  });
});

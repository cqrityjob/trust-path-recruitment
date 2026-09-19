/**
 * Test → interview → final report, walked end to end with separate signed-in
 * SYNTHETIC people on the local test environment (scripts/local-stack/
 * test-env.sh, which replays every migration, 20261202090000 included).
 *
 *   1. the employer sends the Väktare test for an application from
 *      Rekryteringsstöd, with its setup (TRUST · Väktare · general);
 *   2. the candidate answers all 50 items through the ordinary test page and
 *      submits -- nothing is set complete in the database;
 *   3. the owner gives a colleague review permission, the colleague completes
 *      every required review, and the owner shares the candidate brief under
 *      the existing release rule;
 *   4. the employer clicks Förbered intervju ON THAT TEST; a second click (a
 *      retry) opens the same case;
 *   5. the case carries the right candidate, the test it came from (50/50),
 *      the setup and the guide, and the released test material;
 *   6. the same case, opened through Intervjuer, shows the same;
 *   7. the interview is held: a note per question, the test's follow-up
 *      areas in view;
 *   8. the material is chosen and assessed by the recruiter;
 *   9. the report is previewed, finalised and read back after a reload;
 *  10. the database read-back: the start names the exact test, the case the
 *      applicant's own account, the report version 1, the application its one
 *      TRUST case beside its separate BESKT case;
 *  11. the candidate and another organisation are refused the report.
 *
 * The database is READ at step 10 (never written): JOURNEY_DATABASE_URL must be
 * the loopback test database.
 *
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *   JOURNEY_DATABASE_URL=postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e \
 *   E2E_SUPABASE_URL=http://127.0.0.1:54331 \
 *   E2E_SUPABASE_ANON_KEY="$(sed -n 's/^VITE_SUPABASE_PUBLISHABLE_KEY=//p' .env.local)" \
 *   bunx playwright test e2e/test-interview-report-journey.spec.ts --project=chromium
 *
 * Run it on a freshly reseeded stack (test-env.sh --reseed): the walk is not
 * idempotent, deliberately -- a second run would find the test already taken.
 */

import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const DB = process.env.JOURNEY_DATABASE_URL ?? "";
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the routed walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The routed walk runs only against loopback — never a shared or hosted backend.",
);
test.skip(
  LOCAL && !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/beskt_e2e$/.test(DB),
  "JOURNEY_DATABASE_URL must be the loopback beskt_e2e test database.",
);
test.describe.configure({ mode: "serial", timeout: 600_000 });

const OUT = process.env.JOURNEY_EVIDENCE_DIR ?? "artifacts/test-interview-report-journey";
mkdirSync(OUT, { recursive: true });
const PASSWORD = "LocalJourney!2026";
const OWNER = "beskt-recruiter@local.test";
const REVIEWER = "beskt-assessor@local.test";
const CANDIDATE = "beskt-interviewee@local.test";
const RIVAL = "beskt-outsider@local.test";
const EMPLOYER = "beskt-journey-ab";
const APPLICATION = "b5000000-0000-4000-8000-00000000aa05";

const state: { assignmentId: string; attemptId: string; casePath: string; caseId: string } = {
  assignmentId: "",
  attemptId: "",
  casePath: "",
  caseId: "",
};

const API = process.env.E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
test.skip(
  LOCAL && (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API) || !ANON_KEY),
  "E2E_SUPABASE_URL (loopback) and E2E_SUPABASE_ANON_KEY are needed for the data-plane refusal.",
);

/** A synthetic local account's access token, from the local auth gateway. */
async function accessToken(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.ok, `local sign-in for ${email}`).toBe(true);
  return ((await res.json()) as { access_token: string }).access_token;
}

function sql(query: string): string {
  return execFileSync("psql", [DB, "-tAq", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8",
  }).trim();
}

/** Each step can be re-run alone: what an earlier step produced is read back
 *  from the test database (reads only). */
function recover(): void {
  if (!state.assignmentId) {
    const row = sql(
      `SELECT aa.id || '|' || t.id FROM assessment_assignments aa
         JOIN scp_attempts t ON t.assignment_id = aa.id
        WHERE aa.application_id = '${APPLICATION}' AND aa.cancelled_at IS NULL`,
    );
    [state.assignmentId, state.attemptId] = row.split("|") as [string, string];
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

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${OUT}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}

test.describe("Test → interview → final report", () => {
  test("1 · the employer sends the Väktare test with its setup", async ({ page }) => {
    await signIn(
      page,
      OWNER,
      `/employer/${EMPLOYER}/assessments/library?method=trust&group=operational&role=vaktare&env=general`,
    );
    await expect(page.getByTestId("lib-setup")).toHaveAttribute("data-startable", "true", {
      timeout: 60_000,
    });
    await page.locator("#lib-application").selectOption(APPLICATION);
    await page.getByTestId("lib-send-test").click();
    await expect(page.getByTestId("lib-send-test-done")).toContainText(
      /skickat till kandidaten, med det här upplägget/,
      { timeout: 60_000 },
    );
    await shot(page, "1-test-sent");
    const row = sql(
      `SELECT aa.id || '|' || t.id || '|' || s.role_profile || '|' || s.environment
         FROM assessment_assignments aa
         JOIN scp_attempts t ON t.assignment_id = aa.id
         JOIN scp_assessment_setups s ON s.assessment_assignment_id = aa.id
        WHERE aa.application_id = '${APPLICATION}' AND aa.cancelled_at IS NULL`,
    );
    const [assignmentId, attemptId, role, env] = row.split("|");
    expect(role, "the test carries its setup").toBe("vaktare");
    expect(env).toBe("general");
    state.assignmentId = assignmentId!;
    state.attemptId = attemptId!;
  });

  test("2 · the candidate answers all 50 items and submits", async ({ page }) => {
    await signIn(page, CANDIDATE, "/academy");
    await page.locator(`a[href$="/academy/${state.attemptId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/academy/${state.attemptId}$`), { timeout: 60_000 });
    await page
      .getByRole("button", { name: /^Börja$|^Fortsätt där du slutade$/ })
      .first()
      .click();

    let answered = 0;
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
          `SYNTETISKT svar ${answered + 1}: jag kontaktar arbetsledaren, säkrar platsen och dokumenterar händelsen.`,
        );
        await text.blur();
      } else {
        // Every choice item: the first option of each group. Deterministic.
        const groups = page.locator("main fieldset");
        const n = await groups.count();
        for (let g = 0; g < n; g += 1) {
          await groups.nth(g).locator("label").first().click();
        }
      }
      await expect(page.getByText(/Sparat|Saved/).first()).toBeVisible({ timeout: 30_000 });
      answered += 1;
      if (await submit.isVisible()) {
        await submit.click();
        break;
      }
      await next.click();
    }
    expect(answered, "every item was answered through the test page").toBe(50);
    await expect(page.getByText(/inlämnad|Tack/i).first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "2-submitted");
    expect(
      sql(
        `SELECT status || '|' || (SELECT count(*) FROM scp_candidate_responses WHERE attempt_id = '${state.attemptId}') FROM scp_attempts WHERE id = '${state.attemptId}'`,
      ),
    ).toMatch(/^(submitted|scored)\|50$/);
  });

  test("3 · a colleague with review permission reviews, and the owner shares the brief", async ({
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
    ).toBeVisible({
      timeout: 60_000,
    });

    const status = () => sql(`SELECT status FROM scp_attempts WHERE id = '${state.attemptId}'`);
    const revCtx = await browser.newContext();
    const reviewer = await revCtx.newPage();
    // A re-run of this step alone finds the reviews done; it never redoes them.
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
        // Locator.isVisible() does not wait; the cards render after the queue read.
        const present = await form
          .waitFor({ state: "visible", timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
        if (!present) break;
        const names = await form
          .locator("input[type=radio]")
          .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))]);
        for (const name of names) {
          const options = form.locator(`input[type=radio][name="${name}"]`);
          const count = await options.count();
          // Rubric levels: the middle one; a finding: "no concern" (the first).
          const pick = name.startsWith("finding-") ? 0 : Math.floor(count / 2);
          await options.nth(pick).check({ force: true });
        }
        await form
          .locator("textarea[id^='rationale-']")
          .fill("SYNTETISK granskning: svaret beskriver ett konkret och säkert handlande.");
        await form.getByRole("button", { name: /^Slutför granskning$/ }).click();
        reviewed += 1;
        await reviewer.waitForTimeout(1500);
      }
      expect(reviewed, "at least one response needed a human review").toBeGreaterThan(0);
      await expect
        .poll(() => sql(`SELECT status FROM scp_attempts WHERE id = '${state.attemptId}'`), {
          timeout: 60_000,
        })
        .toBe("scored");
      await shot(reviewer, "3-reviewed");
    }
    expect(await status()).not.toBe("submitted");

    if ((await status()) === "scored") {
      await owner.goto(`/employer/${EMPLOYER}/assessments/participants`);
      const card = owner
        .locator("article, li, section")
        // The card names a pseudonymous reference; the posting and the 50 answers
        // identify this candidate's card.
        .filter({ hasText: /Skyddsvakt \(syntetisk annons\)/ })
        .filter({ hasText: /50 av 50 besvarade/ })
        .filter({
          has: owner.getByRole("button", { name: /^Dela kandidatunderlaget$/ }),
        });
      await card
        .getByRole("button", { name: /^Dela kandidatunderlaget$/ })
        .first()
        .click();
      await owner.getByRole("button", { name: /^Ja, dela kandidatunderlaget$/ }).click();
      await expect
        .poll(() => sql(`SELECT status FROM scp_attempts WHERE id = '${state.attemptId}'`), {
          timeout: 60_000,
        })
        .toBe("released");
      await shot(owner, "3-released");
    }
    expect(await status()).toBe("released");
    await ownerCtx.close();
    await revCtx.close();
  });

  test("4–6 · Förbered intervju on that test opens ONE case with the test, setup and candidate", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    const button = page.getByTestId(`prepare-interview-${state.assignmentId}`);
    await expect(button).toBeVisible({ timeout: 60_000 });
    await shot(page, "4-application-before");
    await button.click();
    await expect(page).toHaveURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, {
      timeout: 60_000,
    });
    state.casePath = new URL(page.url()).pathname.replace(/\/prepare$/, "");
    state.caseId = state.casePath.split("/").pop()!;

    // A retry -- the same click again -- opens the same case.
    await page.goto(`/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await page.getByTestId(`prepare-interview-${state.assignmentId}`).click();
    await expect(page).toHaveURL(new RegExp(`${state.caseId}/prepare$`), { timeout: 60_000 });

    // 5 · the right candidate, setup and guide; nothing typed.
    await expect(page.getByTestId("case-setup-value")).toHaveText(
      /TRUST · Väktare · Generell säkerhetsverksamhet/,
      { timeout: 60_000 },
    );
    await expect(page.locator("main")).toContainText(/beskt-interviewee/);
    await expect(page.locator("main")).not.toContainText(
      /Uppgifterna sparades inte|could not be saved/,
    );
    await shot(page, "5-prepare");

    // The test it came from, marked, with all 50 answers.
    await page.goto(`${state.casePath}/tests`);
    const source = page.getByTestId("case-source-test");
    await expect(source).toBeVisible({ timeout: 60_000 });
    await expect(source).toHaveAttribute("data-assignment-id", state.assignmentId);
    await expect(page.getByTestId("case-tests")).toContainText(/50\/50/);
    await shot(page, "5-tests-source");

    // 6 · the same case through Intervjuer.
    await page.goto(`/employer/${EMPLOYER}/interview-intelligence`);
    await page.locator(`a[href*="${state.caseId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(state.caseId), { timeout: 60_000 });
    await page.goto(`${state.casePath}/prepare`);
    await expect(page.getByTestId("case-setup-value")).toHaveText(/TRUST · Väktare/, {
      timeout: 60_000,
    });
  });

  test("7–9 · the interview is held, assessed, and the report finalised and read back", async ({
    page,
  }) => {
    const caseStatus = () =>
      sql(`SELECT status FROM scp_interview_cases WHERE id = '${state.caseId}'`);
    await signIn(page, OWNER, `${state.casePath}/prepare`);
    const initial = caseStatus();
    if (["draft", "sources_ready", "prep_generated", "prep_approved"].includes(initial)) {
      if (initial !== "prep_approved") {
        await expect(page.locator("#mp-open")).not.toHaveValue("", { timeout: 60_000 });
        await page.getByRole("button", { name: /Spara och godkänn planen/ }).click();
      }
      const start = page.getByRole("button", { name: /^Starta intervju$/ }).first();
      await expect(start).toBeVisible({ timeout: 60_000 });
      await start.click();
      await expect(page).toHaveURL(/\/interview$/, { timeout: 60_000 });
    } else {
      // A re-run of this step alone: the interview already exists.
      await page.goto(`${state.casePath}/interview`);
    }

    // The released test's follow-up areas are in view in the interview: the
    // test material reached the interview it was started from.
    await expect(page.locator("main")).toContainText(/Områden att följa upp/, {
      timeout: 60_000,
    });
    await expect(page.locator("main")).toContainText(/Följ upp från bedömningen/);
    const total = Number(
      (await page.locator("main").textContent())?.match(/Fråga \d+ av (\d+)/)?.[1] ?? "0",
    );
    expect(total, "the Väktare guide's questions are in the interview").toBeGreaterThan(0);
    for (let i = 1; i <= total; i += 1) {
      await expect(page.locator("main")).toContainText(new RegExp(`Fråga ${i} av ${total}`));
      await page
        .locator("#note")
        .fill(
          `SYNTETISK anteckning ${i}: kandidaten gav ett konkret exempel; följdfråga om rapportering ställd.`,
        );
      await page.getByRole("button", { name: /Markera som genomgången/ }).click();
      await expect(page.locator("main")).toContainText(/Besvarad/, { timeout: 30_000 });
      if (i < total) await page.getByRole("button", { name: /^Nästa$/ }).click();
    }
    await shot(page, "7-interview");
    await page.getByRole("button", { name: /Avsluta intervjun/ }).click();
    await expect(page.locator("main")).toContainText(/Intervjun är genomförd/, { timeout: 30_000 });
    await page
      .getByRole("link", { name: /Gå till bedömning/ })
      .first()
      .click();
    await page.waitForURL(/\/evidence$/, { timeout: 60_000 });

    const questions = page
      .getByRole("navigation", { name: /^Frågor$/ })
      .first()
      .locator("button");
    await expect(questions).toHaveCount(total, { timeout: 60_000 });
    for (let i = 0; i < total; i += 1) {
      await questions.nth(i).click();
      const use = page.getByRole("button", { name: /Använd som bedömningsunderlag/ });
      await expect(use.first()).toBeVisible({ timeout: 30_000 });
      await use.first().click();
      await expect(page.locator("main")).toContainText(/Bekräftat underlag/, { timeout: 30_000 });
    }
    await page
      .getByRole("link", { name: /Gör din bedömning/ })
      .first()
      .click();
    await page.waitForURL(/\/assessment$/, { timeout: 60_000 });
    for (let i = 0; i < total; i += 1) {
      const form = page.locator("main form").first();
      await expect(form).toBeVisible({ timeout: 30_000 });
      await form.getByText(/^Tydligt visat$/).click();
      await form
        .locator("textarea[id^='rat-']")
        .fill("SYNTETISK bedömning: konkret exempel med eget handlande och resultat.");
      await form.getByRole("button", { name: /Spara bedömning/ }).click();
      await expect(page.locator("main")).toContainText(new RegExp(`${i + 1} / ${total}`), {
        timeout: 30_000,
      });
    }
    await shot(page, "8-assessed");
    await page.getByRole("button", { name: /Klar med bedömningen/ }).click();
    await page.waitForURL(/\/report$/, { timeout: 60_000 });

    const finalise = page.getByRole("button", { name: /Slutför rapporten/ });
    await expect(finalise).toBeDisabled({ timeout: 60_000 });
    await page.getByRole("button", { name: /Förhandsgranska rapporten/i }).click();
    await expect(finalise).toBeEnabled({ timeout: 60_000 });
    await shot(page, "9-preview");
    await finalise.click();
    await expect(page.locator("main")).toContainText(/Rapport fastställd/, { timeout: 60_000 });
    await page.reload();
    await expect(page.locator("main")).toContainText(/Slutlig och oföränderlig/, {
      timeout: 60_000,
    });
    await expect(page.locator("main")).toContainText(/beskt-interviewee/);
    await shot(page, "9-final-readback");
  });

  test("10 · source links, report version and the application's status", async ({ page }) => {
    const facts = sql(
      `SELECT s.source_kind || '|' || s.source_id || '|' || c.candidate_user_id::text || '|' ||
              coalesce(c.candidate_external_ref, '-') || '|' || c.application_id || '|' ||
              rs.method || ':' || rs.role_profile || ':' || rs.environment || '|' ||
              (SELECT count(*) FROM scp_interview_reports r WHERE r.case_id = c.id) || '|' ||
              (SELECT max(r.version_number) FROM scp_interview_reports r WHERE r.case_id = c.id)
         FROM scp_interview_starts s
         JOIN scp_interview_cases c ON c.id = s.interview_case_id
         JOIN scp_recruitment_setups rs ON rs.interview_case_id = c.id
        WHERE c.id = '${state.caseId}'`,
    );
    const applicant = sql(
      `SELECT applicant_user_id FROM job_applications WHERE id = '${APPLICATION}'`,
    );
    const [kind, sourceId, candidate, extRef, app, setup, reports, version] = facts.split("|");
    expect(kind).toBe("assessment_assignment");
    expect(sourceId, "the start names the exact test").toBe(state.assignmentId);
    expect(candidate, "the case is bound to the applicant's own account").toBe(applicant);
    expect(extRef, "no invented reference").toBe("-");
    expect(app).toBe(APPLICATION);
    expect(setup).toBe("trust:vaktare:general");
    expect(reports).toBe("1");
    expect(version).toBe("1");
    // One TRUST start for this test; the application's BESKT case is separate.
    expect(
      sql(
        `SELECT count(*) FROM scp_interview_cases c
          WHERE c.application_id = '${APPLICATION}'
            AND EXISTS (SELECT 1 FROM scp_recruitment_setups rs
                         WHERE rs.interview_case_id = c.id AND rs.method = 'trust')`,
      ),
    ).toBe("1");
    writeFileSync(
      `${OUT}/${test.info().project.name}-10-readback.txt`,
      `start=${kind}:${sourceId}\ncandidate=${candidate}\nsetup=${setup}\nreports=${reports} version=${version}\n`,
    );

    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await expect(page.locator(`a[href*="${state.caseId}"]`).first()).toBeVisible({
      timeout: 60_000,
    });
    await shot(page, "10-application-after");
  });

  test("11 · the candidate and another organisation are refused the report", async ({
    browser,
  }) => {
    // The control: the same request, made by the owner, does see the report
    // and the start -- so an empty answer below is a refusal, not a bad query.
    const ownerToken = await accessToken(OWNER);
    for (const [table, filter] of [
      ["scp_interview_reports", `case_id=eq.${state.caseId}`],
      ["scp_interview_starts", `interview_case_id=eq.${state.caseId}`],
    ] as const) {
      const res = await fetch(`${API}/rest/v1/${table}?${filter}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.ok && ((await res.json()) as unknown[]).length, `the owner reads ${table}`).toBe(
        1,
      );
    }

    for (const who of [CANDIDATE, RIVAL]) {
      // The screen refuses...
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await signIn(page, who, `${state.casePath}/report`);
      await page.goto(`${state.casePath}/report`);
      await expect(page.getByRole("heading", { name: /^Åtkomst ej tillgänglig$/ })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.locator("body")).not.toContainText(
        /SYNTETISK anteckning|SYNTETISK bedömning|Slutlig och oföränderlig/,
      );
      await shot(page, `11-denied-${who.split("@")[0]}`);
      await ctx.close();

      // ...and so does the data plane: the same person, over the real API,
      // reads no report, case, start or setup row of this employer.
      const token = await accessToken(who);
      for (const [table, filter] of [
        ["scp_interview_reports", `case_id=eq.${state.caseId}`],
        ["scp_interview_cases", `id=eq.${state.caseId}`],
        ["scp_interview_starts", `interview_case_id=eq.${state.caseId}`],
        ["scp_assessment_setups", `assessment_assignment_id=eq.${state.assignmentId}`],
      ] as const) {
        const res = await fetch(`${API}/rest/v1/${table}?${filter}&select=*`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
        });
        const body = res.ok ? ((await res.json()) as unknown[]) : [];
        expect(res.ok ? body.length : 0, `${who} reads no ${table} row (HTTP ${res.status})`).toBe(
          0,
        );
      }
    }
  });
});

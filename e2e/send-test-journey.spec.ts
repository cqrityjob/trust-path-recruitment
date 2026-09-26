/**
 * "Skicka test" from the recruitment, both levels, end to end -- on the
 * loopback stack with separate signed-in synthetic people.
 *
 * Owner bug report (2026-09-26): "Under översikt rekrytering på
 * arbetsgivarytan så saknas möjlighet att skicka tester till den sökande."
 * Owner update: both assessment levels must be available at launch.
 *
 *   1. from the applications list, the owner opens "Skicka test" for one
 *      applicant: both levels are shown with audience and purpose; the
 *      operational level names its test; the strategic level names its own
 *      test as a draft awaiting the owner's content approval (or, once
 *      released to this organisation, as sendable) -- and the operational
 *      test is never offered under it;
 *   2. the owner sends the operational test: the level (setup) is recorded,
 *      the invitation reaches the candidate's CQrityjob inbox, and the row
 *      shows the test as assigned;
 *   3. the same dialog opened again says "already sent" and offers no
 *      second send; a repeat of the underlying send lands on the SAME
 *      attempt (one assignment, one attempt);
 *   4. the candidate, signed out, opens the invitation destination, is sent
 *      through the sign-in with the destination kept, and finds the test
 *      under Tester & utveckling -- for the right job, from the right
 *      employer -- with the invitation in their inbox;
 *   5. the candidate starts, is interrupted (a reload mid-test), continues
 *      where they were, answers every item and submits; a second submit is
 *      not offered and the database holds one submitted attempt;
 *   6. the employer sees the completion on the candidate page -- as
 *      "waiting for review", never as a failed assessment -- and the
 *      interview preparation is offered on that test with its setup;
 *   7. another organisation reads none of it, on screen or over the API.
 *
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *   E2E_SUPABASE_URL=http://127.0.0.1:54331 \
 *   E2E_SUPABASE_ANON_KEY=... JOURNEY_DATABASE_URL=postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e \
 *   bunx playwright test e2e/send-test-journey.spec.ts --project=chromium
 *
 * Not idempotent by design: run on a reseeded stack (up.sh --reseed).
 */

import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const DB = process.env.JOURNEY_DATABASE_URL ?? "";
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the send-test walk against a local stack.");
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

const PASSWORD = "LocalJourney!2026";
const OWNER = "beskt-recruiter@local.test";
const CANDIDATE = "beskt-candidate@local.test";
const RIVAL = "beskt-outsider@local.test";
const EMPLOYER = "beskt-journey-ab";
const APPLICATION = "b4000000-0000-4000-8000-00000000aa01";

const state = { assignmentId: "", attemptId: "" };

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

function recover(): void {
  if (state.assignmentId) return;
  const row = sql(
    `SELECT aa.id || '|' || coalesce(t.id::text, '') FROM assessment_assignments aa
       LEFT JOIN scp_attempts t ON t.assignment_id = aa.id
      WHERE aa.application_id = '${APPLICATION}' AND aa.cancelled_at IS NULL`,
  );
  if (row) [state.assignmentId, state.attemptId] = row.split("|") as [string, string];
}
test.beforeEach(() => {
  if (LOCAL && DB) recover();
});

test.describe("Skicka test — both levels, end to end", () => {
  test("1 · both levels are offered from the applications list, honestly", async ({ page }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications`);
    const button = page.locator(`[data-testid="send-test"][data-application-id="${APPLICATION}"]`);
    await expect(button).toBeVisible({ timeout: 60_000 });
    await button.click();
    const dialog = page.getByTestId("send-test-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("send-test-recipient")).not.toHaveText("");

    const operational = page.getByTestId("send-test-level-operational");
    const strategic = page.getByTestId("send-test-level-strategic");
    await expect(operational).toHaveAttribute("data-state", "sendable", { timeout: 60_000 });
    await expect(operational).toContainText(/Operativa roller/);
    await expect(operational).toContainText(/väktare/i);
    await expect(operational).toContainText(/Väktare – Recruitment Assessment/);
    await expect(operational).toContainText(/50 uppgifter i 5 delar/);

    // The strategic level: shown, explained, and precise about its own
    // content (20261216090000). On a freshly seeded stack the content is a
    // governed draft awaiting the owner's content approval; once the
    // strategic journey has released it to this organisation it is
    // sendable. Either way it names its own test -- never "kommer snart",
    // never the security-officer test under the strategic heading.
    await expect(strategic).toContainText(/Strategiska och ledande roller/);
    await expect(strategic).toContainText(/säkerhetschefer/i);
    await expect(strategic).toHaveAttribute("data-state", /^(not_assignable|sendable)$/);
    const strategicCard = page.getByTestId("send-test-card-strategic");
    await expect(strategicCard).toContainText(/Säkerhetschef – Recruitment Assessment/);
    await expect(strategic).not.toContainText(/Väktare – Recruitment Assessment/);
    await expect(strategic).not.toContainText(/kommer snart|coming soon|validerat/i);
    if ((await strategic.getAttribute("data-state")) === "not_assignable") {
      await expect(strategicCard).toHaveAttribute("data-content-status", "draft");
      const pending = page.getByTestId("send-test-strategic-pending");
      await expect(pending).toContainText(/utkast under granskning/i);
      await expect(pending).toContainText(/samlat innehållsgodkännande/i);
      await expect(pending).toContainText(/Kravprofil/);
      await expect(pending).toContainText(/Intervjuguide/);
      await expect(pending).toContainText(/Kandidattest/);
      await expect(pending).toContainText(/Rapportavsnitt/);
      await expect(pending).toContainText(/granskning/i);
      await strategic.locator('input[type="radio"]').check();
      await expect(page.getByTestId("send-test-submit")).toBeDisabled();
      await expect(page.getByTestId("send-test-blocked")).toBeVisible();
    }

    // Nothing was sent by looking.
    expect(
      sql(`SELECT count(*) FROM assessment_assignments WHERE application_id = '${APPLICATION}'`),
    ).toBe("0");
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-1-levels.png",
      fullPage: true,
    });
  });

  test("2 · the operational test is sent with its level, and the candidate is told", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications`);
    await page.locator(`[data-testid="send-test"][data-application-id="${APPLICATION}"]`).click();
    await expect(page.getByTestId("send-test-level-operational")).toHaveAttribute(
      "data-state",
      "sendable",
      { timeout: 60_000 },
    );
    await page.getByTestId("send-test-level-operational").locator('input[type="radio"]').check();
    const submit = page.getByTestId("send-test-submit");
    await expect(submit).toBeEnabled();
    // Two clicks in quick succession: the second lands on a disabled button.
    await submit.click();
    await submit.click({ force: true, noWaitAfter: true }).catch(() => undefined);
    await expect(page.getByTestId("send-test-sent")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("send-test-setup")).toHaveAttribute("data-recorded", "true");
    await expect(page.getByTestId("send-test-invitation")).toHaveAttribute(
      "data-delivery",
      /delivered|already_sent/,
    );
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-2-sent.png",
      fullPage: true,
    });

    const row = sql(
      `SELECT aa.id || '|' || t.id || '|' || s.role_group || '|' || s.role_profile || '|' ||
              (SELECT count(*) FROM assessment_assignments x WHERE x.application_id = '${APPLICATION}' AND x.cancelled_at IS NULL) || '|' ||
              (SELECT count(*) FROM recruitment_messages m WHERE m.application_id = '${APPLICATION}' AND m.idempotency_key = 'test-invitation:' || aa.id::text AND m.status = 'sent')
         FROM assessment_assignments aa
         JOIN scp_attempts t ON t.assignment_id = aa.id
         JOIN scp_assessment_setups s ON s.assessment_assignment_id = aa.id
        WHERE aa.application_id = '${APPLICATION}' AND aa.cancelled_at IS NULL`,
    );
    const [assignmentId, attemptId, group, profile, assignments, messages] = row.split("|");
    expect(group, "the level travels with the test").toBe("operational");
    expect(profile).toBe("vaktare");
    expect(assignments, "one assignment, whatever the number of clicks").toBe("1");
    expect(messages, "one invitation, delivered").toBe("1");
    state.assignmentId = assignmentId!;
    state.attemptId = attemptId!;

    // The list row now says the test is assigned.
    await page.getByRole("button", { name: /^Stäng$/ }).click();
    await expect(
      page.locator("li", { has: page.locator(`a[href*="${APPLICATION}"]`) }).first(),
    ).toContainText(/Tilldelad/, { timeout: 60_000 });
  });

  test("3 · a second send is not offered, and a repeat lands on the same attempt", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await page.getByTestId("send-test").click();
    const operational = page.getByTestId("send-test-level-operational");
    await expect(operational).toHaveAttribute("data-state", "already_sent", { timeout: 60_000 });
    await expect(operational).toContainText(/Redan skickat/);
    await expect(page.getByTestId("send-test-submit")).toBeDisabled();
    await page.screenshot({ path: "artifacts/bugfix-2026-09-26/send-test-3-already-sent.png" });

    // The underlying send, repeated over the real API with the owner's own
    // token: the database answers with the SAME attempt.
    const token = await accessToken(OWNER);
    const version = sql(
      `SELECT av.id FROM scp_assessment_versions av JOIN scp_assessment_definitions d ON d.id = av.definition_id
        WHERE d.slug = 'security-officer-recruitment' ORDER BY av.version_number DESC LIMIT 1`,
    );
    const employerId = sql(`SELECT id FROM employers WHERE slug = '${EMPLOYER}'`);
    const res = await fetch(`${API}/rest/v1/rpc/scp_assign_from_application`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        _employer_id: employerId,
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

  test("4 · the signed-out candidate is sent through the sign-in and finds the test", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // The destination the invitation names, opened signed out.
    await page.goto(`${BASE}/academy`);
    await page.waitForURL(/\/login\?redirect=%2Facademy/, { timeout: 60_000 });
    await page.getByLabel(/^e-?post$|^email$/i).fill(CANDIDATE);
    await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
    await page.waitForURL(/\/academy$/, { timeout: 60_000 });
    const card = page.locator("main").locator("section, article, div", {
      has: page.locator(`a[href$="/academy/${state.attemptId}"]`),
    });
    await expect(page.locator(`a[href$="/academy/${state.attemptId}"]`).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator("main")).toContainText(/Väktare – Recruitment Assessment/);
    await expect(page.locator("main")).toContainText(/BESKT Journey AB/);
    await expect(page.locator("main")).toContainText(/Väktare \(syntetisk annons\)/);
    void card;
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-4-candidate-academy.png",
      fullPage: true,
    });

    // The invitation, in the candidate's own inbox.
    await page.goto(`${BASE}/my-career/applications`);
    await expect(page.locator("main")).toContainText(
      /Test att göra: Väktare – Recruitment Assessment/,
      {
        timeout: 60_000,
      },
    );
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-4-candidate-inbox.png",
      fullPage: true,
    });
    await ctx.close();
  });

  test("5 · the candidate is interrupted, continues, answers all 50 items and submits once", async ({
    page,
  }) => {
    await signIn(page, CANDIDATE, "/academy");
    await page.locator(`a[href$="/academy/${state.attemptId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/academy/${state.attemptId}$`), { timeout: 60_000 });
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
          `SYNTETISKT svar ${answered + 1}: jag kontaktar arbetsledaren, säkrar platsen och dokumenterar händelsen.`,
        );
        await text.blur();
      } else {
        const groups = page.locator("main fieldset");
        const n = await groups.count();
        for (let g = 0; g < n; g += 1) await groups.nth(g).locator("label").first().click();
      }
      await expect(page.getByText(/Sparat|Saved/).first()).toBeVisible({ timeout: 30_000 });
      answered += 1;

      // The interruption: after the 10th answer the tab is reloaded. The
      // answers already saved must be there, and the run continues.
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
    expect(answered, "every item was answered through the test page").toBe(50);
    await expect(page.getByText(/inlämnad|Tack/i).first()).toBeVisible({ timeout: 60_000 });
    // No second submit is offered, and reloading the run does not reopen it.
    await expect(page.getByRole("button", { name: /^Lämna in$/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Lämna in$|^Nästa$/ })).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-5-submitted.png",
      fullPage: true,
    });
    expect(
      sql(
        `SELECT status || '|' || (SELECT count(*) FROM scp_candidate_responses WHERE attempt_id = '${state.attemptId}') || '|' || (SELECT count(*) FROM scp_attempts WHERE assignment_id = '${state.assignmentId}') FROM scp_attempts WHERE id = '${state.attemptId}'`,
      ),
    ).toMatch(/^(submitted|scored)\|50\|1$/);
  });

  test("6 · the employer sees the completion, never a failure, and the interview follows that test", async ({
    page,
  }) => {
    await signIn(page, OWNER, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    const main = page.locator("main");
    await expect(main).toContainText(/Väntar på granskning|Underlag klart/, { timeout: 60_000 });
    await expect(main).toContainText(/50\/50/);
    await expect(main).not.toContainText(/misslyckad|underkänd|failed/i);
    await expect(page.getByTestId(`prepare-interview-${state.assignmentId}`)).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-6-employer-completion.png",
      fullPage: true,
    });
    await page.getByTestId(`prepare-interview-${state.assignmentId}`).click();
    await expect(page).toHaveURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("case-setup-value")).toHaveText(
      /TRUST · Väktare · Generell säkerhetsverksamhet/,
      { timeout: 60_000 },
    );
    await page.screenshot({
      path: "artifacts/bugfix-2026-09-26/send-test-6-interview-prepare.png",
      fullPage: true,
    });
  });

  test("7 · another organisation reads none of it, on screen or over the API", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, RIVAL, `/employer/${EMPLOYER}/applications/${APPLICATION}`);
    await expect(page.locator("body")).not.toContainText(/Väktare – Recruitment Assessment/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("send-test")).toHaveCount(0);
    await ctx.close();

    const token = await accessToken(RIVAL);
    for (const [table, filter] of [
      ["assessment_assignments", `id=eq.${state.assignmentId}`],
      ["scp_attempts", `id=eq.${state.attemptId}`],
      ["scp_assessment_setups", `assessment_assignment_id=eq.${state.assignmentId}`],
      ["recruitment_messages", `application_id=eq.${APPLICATION}`],
    ] as const) {
      const res = await fetch(`${API}/rest/v1/${table}?${filter}&select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      });
      const body = res.ok ? ((await res.json()) as unknown[]) : [];
      expect(res.ok ? body.length : 0, `${RIVAL} reads no ${table} row (HTTP ${res.status})`).toBe(
        0,
      );
    }
    // The control: the owner reads them.
    const ownerToken = await accessToken(OWNER);
    const res = await fetch(
      `${API}/rest/v1/scp_assessment_setups?assessment_assignment_id=eq.${state.assignmentId}&select=*`,
      {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ownerToken}` },
      },
    );
    expect(res.ok && ((await res.json()) as unknown[]).length, "the owner reads the setup").toBe(1);
  });
});

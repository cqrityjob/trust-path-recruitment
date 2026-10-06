import { test, expect as baseExpect, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { Session } from "../src/lib/sentinel/types";
const expect = baseExpect.configure({ timeout: 15000 });
test.setTimeout(60000);

// These tests write only to the existing disposable, synthetic Sentinel stack.
// Refuse instead of skipping: CI must never report green without running them.
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3127";
const gateway = process.env.SENTINEL_GATEWAY_URL ?? "http://127.0.0.1:59231";
const db = process.env.SENTINEL_TEST_DB_URL ?? "";
for (const url of [base, gateway, db]) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1") throw new Error("SENTINEL_LOOPBACK_REQUIRED");
}
if (process.env.E2E_LOCAL_STACK !== "1" || new URL(db).pathname !== "/sentinel_e2e")
  throw new Error("SENTINEL_DISPOSABLE_FIXTURE_REQUIRED");

function sql(statement: string) {
  return execFileSync(
    process.env.SENTINEL_PSQL ?? "psql",
    [db, "-X", "-At", "-v", "ON_ERROR_STOP=1"],
    {
      input: `DO $$ BEGIN
      IF current_database()<>'sentinel_e2e' OR NOT EXISTS(
        SELECT 1 FROM public.sentinel_forms WHERE preview_only AND version='sentinel-v1-a.preview'
      ) THEN RAISE EXCEPTION 'SYNTHETIC_LOCAL_ONLY'; END IF;
    END $$;\n${statement}`,
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .filter((line) => line !== "DO")
    .join("\n");
}
async function candidate(context: BrowserContext, sv: boolean) {
  const email = sv ? "anna@journey.test" : "bo@journey.test";
  const response = await fetch(`${gateway}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "LocalJourney!2026" }),
  });
  expect(response.ok).toBeTruthy();
  const auth = await response.json();
  await context.addInitScript(
    ({ auth, lang }) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(auth));
      // The assigned language must win over the opposite site preference.
      localStorage.setItem("cqrityjob.lang", lang);
    },
    { auth, lang: sv ? "en" : "sv" },
  );
  async function rpc(name: string, body: object) {
    const result = await fetch(`${gateway}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify(body),
    });
    expect(result.ok).toBeTruthy();
    return result.json();
  }
  const work = await rpc("scp_my_academy_work", {});
  const id = work.find((row: { title_sv: string }) => row.title_sv?.includes("Sentinel"))?.work_id;
  expect(id).toMatch(/^[\da-f-]{36}$/);
  const state = (action = "get") =>
    rpc("sentinel_session", { _attempt_id: id, _action: action }) as Promise<Session>;
  return { id, state, rpc };
}
async function beforeUnloadBlocked(page: Page) {
  return page.evaluate(
    () => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
  );
}
function isPracticeRequest(url: string) {
  // TanStack's dev function id includes the source/export identity. Match that
  // identity, not a generated id or unrelated, cancellable route-loader GETs.
  const encoded = new URL(url).pathname.split("/_serverFn/")[1];
  if (!encoded) return false;
  const identity: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString());
  return (
    typeof identity === "object" &&
    identity !== null &&
    "file" in identity &&
    typeof identity.file === "string" &&
    identity.file.includes("/src/lib/sentinel/sentinel.functions.ts") &&
    "export" in identity &&
    typeof identity.export === "string" &&
    identity.export.startsWith("sentinelPractice_")
  );
}
async function shareSyntheticReport(id: string) {
  const auth = await fetch(`${gateway}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@journey.test", password: "LocalJourney!2026" }),
  }).then((response) => response.json());
  const result = await fetch(`${gateway}/rest/v1/rpc/sentinel_employer_action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.access_token}` },
    body: JSON.stringify({ _attempt_id: id, _action: "release" }),
  });
  expect(result.ok).toBeTruthy();
}
async function failSave(page: Page, sv: boolean, option = 0) {
  await page.route("**/_serverFn/**", async (route) => {
    if (route.request().postData()?.includes('"save"')) await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("radio").nth(option).press("Space");
  await expect(
    page.getByText(sv ? "Svar ej sparat" : "Response not saved", { exact: true }),
  ).toBeVisible();
  expect(await beforeUnloadBlocked(page)).toBe(true);
}
const heading = (status: string, sv: boolean) =>
  status === "completed"
    ? sv
      ? "Tack! Ditt test är avslutat."
      : "Thank you! Your assessment is complete."
    : status === "timed_out"
      ? sv
        ? "Testtiden är slut."
        : "Your assessment time has ended."
      : sv
        ? "Testet har avbrutits."
        : "This assessment has been stopped.";

test.beforeEach(() => {
  execFileSync(
    process.env.SENTINEL_PSQL ?? "psql",
    [db, "-X", "-v", "ON_ERROR_STOP=1", "-f", "scripts/fixtures/sentinel-browser-reset.sql"],
    { stdio: "pipe" },
  );
});

for (const sv of [true, false]) {
  const language = sv ? "SV" : "EN";
  test(`${language}: timeout confirmation failure shows no success; status retry confirms closure`, async ({
    page,
    context,
  }) => {
    const { id, state } = await candidate(context, sv);
    await state("start");
    sql(
      `UPDATE sentinel_sessions SET deadline=clock_timestamp()+interval '10 seconds' WHERE attempt_id='${id}';`,
    );
    await page.goto(`${base}/academy/${id}`);
    await expect(page.getByRole("timer")).toBeVisible();
    let failed = false;
    await page.route("**/_serverFn/**", async (route) => {
      if (!failed && route.request().postData()?.includes('"get"')) {
        failed = true;
        await route.abort("failed");
      } else await route.continue();
    });
    const retry = page.getByRole("button", { name: sv ? "Försök igen" : "Retry", exact: true });
    await expect(retry).toBeVisible();
    const title = page.getByRole("heading", { name: heading("timed_out", sv), exact: true });
    await expect(title).toHaveCount(0);
    await retry.click();
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    expect((await state()).status).toBe("timed_out");
    await page
      .getByRole("link", { name: sv ? "Till mina tester" : "Back to my assessments", exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/academy`);
  });
  test(`${language}: delayed practice failure cannot block a session started in another tab`, async ({
    page,
    context,
  }) => {
    const { id, state } = await candidate(context, sv);
    let release!: () => void;
    let failed = false;
    await page.route("**/_serverFn/**", async (route) => {
      if (route.request().method() === "GET" && isPracticeRequest(route.request().url())) {
        const response = await route.fetch();
        if ((await response.text()).includes('"explanation"')) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          await route.abort("failed");
          failed = true;
        } else await route.fulfill({ response });
      } else await route.continue();
    });
    await page.goto(`${base}/academy/${id}`);
    await expect.poll(() => !!release).toBe(true);
    const running = await state("start");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("timer")).toBeVisible();
    release();
    await expect.poll(() => failed).toBe(true);
    await expect(
      page.getByRole("button", { name: sv ? "Hämta övningarna igen" : "Retry loading practice" }),
    ).toHaveCount(0);
    await expect(
      page.getByText(sv ? "Övningarna kunde inte hämtas" : "Practice could not be loaded", {
        exact: false,
      }),
    ).toHaveCount(0);
    await page.getByRole("radio").first().press("Space");
    await expect(
      page.getByText(
        sv ? "Dina svar sparas automatiskt." : "Your responses are saved automatically.",
      ),
    ).toBeVisible();
    const saved = await state();
    expect(Object.keys(saved.answers)).toHaveLength(1);
    expect(saved.deadline).toBe(running.deadline);
  });

  for (const accepted of [true, false]) {
    test(`${language}: late save ${accepted ? "acknowledgement" : "failure"} after confirmed closure cannot restore running or pending`, async ({
      page,
      context,
    }) => {
      const { id, state } = await candidate(context, sv);
      await state("start");
      await page.goto(`${base}/academy/${id}`);
      await expect(page.getByRole("timer")).toBeVisible();
      let refreshHeld = false;
      let saveHeld = false;
      let releaseRefresh!: () => void;
      let releaseSave!: () => void;
      let delivered = false;
      await page.route("**/_serverFn/**", async (route) => {
        if (!refreshHeld && route.request().postData()?.includes('"get"')) {
          refreshHeld = true;
          await new Promise<void>((resolve) => {
            releaseRefresh = resolve;
          });
          await route.continue();
        } else if (!saveHeld && route.request().postData()?.includes('"save"')) {
          saveHeld = true;
          // Hold an actual running acknowledgement, or fail before transmission.
          const response = accepted ? await route.fetch() : null;
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
          if (response) await route.fulfill({ response });
          else await route.abort("failed");
          delivered = true;
        } else await route.continue();
      });
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => !!releaseRefresh).toBe(true);
      await page.getByRole("radio").first().press("Space");
      await expect.poll(() => !!releaseSave).toBe(true);
      expect(await beforeUnloadBlocked(page)).toBe(true);
      const closed = await state("finish");
      expect(Object.keys(closed.answers)).toHaveLength(accepted ? 1 : 0);
      releaseRefresh();
      const title = page.getByRole("heading", { name: heading("completed", sv), exact: true });
      await expect(title).toBeVisible();
      expect(await beforeUnloadBlocked(page)).toBe(false);
      releaseSave();
      await expect.poll(() => delivered).toBe(true);
      await expect(title).toBeVisible();
      await expect(page.getByRole("timer")).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(await beforeUnloadBlocked(page)).toBe(false);
      await page
        .getByRole("link", {
          name: sv ? "Till mina tester" : "Back to my assessments",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(`${base}/academy`);
    });
  }
  test(`${language}: practice fails once; single-flight retry completes practice without reload or starting time`, async ({
    page,
    context,
  }) => {
    const { id, state } = await candidate(context, sv);
    let requests = 0;
    let release!: () => void;
    // Fetch only the practice response; allow route-loader GETs to continue
    // normally, including cancellation during background revalidation.
    await page.route("**/_serverFn/**", async (route) => {
      if (route.request().method() === "GET" && isPracticeRequest(route.request().url())) {
        const response = await route.fetch();
        if ((await response.text()).includes('"explanation"')) {
          requests++;
          if (requests === 1) return route.abort("failed");
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return route.fulfill({ response });
      }
      await route.continue();
    });
    await page.goto(`${base}/academy/${id}`);
    const retry = page.getByRole("button", {
      name: sv ? "Hämta övningarna igen" : "Retry loading practice",
    });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    await retry.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(retry).toBeDisabled();
    await expect.poll(() => requests).toBe(2);
    const ready = await state();
    expect(ready.status).toBe("ready");
    expect(ready.deadline).toBeNull();
    release();
    await page.getByRole("button", { name: sv ? "Gå till övningarna" : "Go to practice" }).click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("radio").first().press("Space");
      await page.getByRole("button", { name: sv ? "Visa förklaring" : "Show explanation" }).click();
      await page
        .getByRole("button", {
          name:
            i < 2
              ? sv
                ? "Nästa övning"
                : "Next practice task"
              : sv
                ? "Till teststart"
                : "Continue to start",
        })
        .click();
    }
    expect((await state()).deadline).toBeNull();
    await page
      .getByRole("button", { name: sv ? "Starta test" : "Start assessment", exact: true })
      .click();
    await expect(page.getByRole("timer")).toBeVisible();
    expect(requests).toBe(2);
  });

  test(`${language}: active unsaved response blocks navigation and reload, then saves by retry without resetting deadline`, async ({
    page,
    context,
  }) => {
    const { id, state } = await candidate(context, sv);
    const started = await state("start");
    await page.goto(`${base}/academy/${id}`);
    await failSave(page, sv);
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL(`${base}/academy/${id}`);
    await page.unroute("**/_serverFn/**");
    await page.getByRole("button", { name: sv ? "Spara igen" : "Save again", exact: true }).click();
    await expect(
      page.getByText(
        sv ? "Dina svar sparas automatiskt." : "Your responses are saved automatically.",
      ),
    ).toBeVisible();
    expect(await beforeUnloadBlocked(page)).toBe(false);
    const saved = await state();
    expect(Object.keys(saved.answers)).toHaveLength(1);
    expect(saved.deadline).toBe(started.deadline);
    await page.reload();
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByRole("radio").first()).toBeChecked();
    expect((await state()).deadline).toBe(started.deadline);
  });

  for (const status of ["timed_out", "completed", "abandoned"]) {
    test(`${language}: save failure then server ${status} clears guards; accepted-only score, persistent closure, reload and back`, async ({
      page,
      context,
    }) => {
      const { id, state, rpc } = await candidate(context, sv);
      const started = await state("start");
      // Read keys only from the guarded synthetic preview, never production.
      const items = JSON.parse(
        sql(
          `SELECT jsonb_agg(jsonb_build_object('id',i->'question'->>'id','key',i->>'key')) FROM sentinel_sessions s, LATERAL jsonb_array_elements(s.items) i WHERE s.attempt_id='${id}';`,
        ),
      );
      await rpc("sentinel_session", {
        _attempt_id: id,
        _action: "save",
        _question_id: items[0].id,
        _option_id: items[0].key,
        _revision: started.revision,
      });
      if (status === "timed_out")
        // Shorten this fake run's remaining time only. The product duration
        // and timeout/scoring functions are unchanged; let the UI timer expire.
        sql(
          `UPDATE sentinel_sessions SET deadline=clock_timestamp()+interval '10 seconds' WHERE attempt_id='${id}';`,
        );
      await page.goto(`${base}/academy/${id}`);
      await page.getByRole("button", { name: sv ? "Nästa" : "Next", exact: true }).click();
      await failSave(page, sv, Number(items[1].key.slice(1)));
      if (status === "completed")
        await state("finish"); // another tab
      else if (status === "abandoned")
        sql(
          `UPDATE assessment_assignments SET status='cancelled' WHERE id=(SELECT assignment_id FROM sentinel_sessions WHERE attempt_id='${id}');`,
        );
      if (status !== "timed_out")
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByRole("timer")).toHaveCount(0);
      expect(await beforeUnloadBlocked(page)).toBe(false);
      const title = page.getByRole("heading", { name: heading(status, sv), exact: true });
      await expect(title).toBeVisible();
      await expect(title).toBeFocused();
      expect(await beforeUnloadBlocked(page)).toBe(false);
      await expect(
        page.getByText(
          sv
            ? "Det osparade svaret har inte skickats in."
            : "The unsaved response has not been submitted.",
        ),
      ).toBeVisible();
      if (status !== "completed")
        await expect(
          page.getByText(
            sv
              ? "Dina svar har sparats och testet har skickats in"
              : "Your responses have been saved and the assessment has been submitted",
            { exact: false },
          ),
        ).toHaveCount(0);
      const closed = await state();
      expect(closed.status).toBe(status);
      expect(Object.keys(closed.answers)).toHaveLength(1);
      expect(closed.report).toBeNull(); // employer has not shared it
      if (status !== "abandoned") {
        const report = JSON.parse(
          sql(`SELECT report FROM sentinel_sessions WHERE attempt_id='${id}';`),
        );
        expect(report).toMatchObject({ correct: 1, incorrect: 0, unanswered: 19, total: 20 });
      }
      let submissions = 0;
      page.on("request", (request) => {
        if (/"(start|finish)"/.test(request.postData() ?? "")) submissions++;
      });
      await page.reload();
      await expect(title).toBeVisible();
      expect(await beforeUnloadBlocked(page)).toBe(false);
      expect((await state()).revision).toBe(closed.revision);
      const back = page.getByRole("link", {
        name: sv ? "Till mina tester" : "Back to my assessments",
        exact: true,
      });
      await back.focus();
      await back.press("Enter");
      await expect(page).toHaveURL(`${base}/academy`);
      await page.goBack();
      await expect(title).toBeVisible();
      expect(submissions).toBe(0);
      expect((await state()).revision).toBe(closed.revision);
    });
  }

  test(`${language}: unconfirmed submission has retry; server-confirmed completion remains visible with report withheld`, async ({
    page,
    context,
  }) => {
    const { id, state } = await candidate(context, sv);
    await state("start");
    await page.goto(`${base}/academy/${id}`);
    await page
      .getByRole("button", { name: sv ? "Uppgift 20" : "Question 20", exact: true })
      .click();
    await page
      .getByRole("button", { name: sv ? "Granska och skicka in" : "Review and submit" })
      .click();
    let failed = false;
    await page.route("**/_serverFn/**", async (route) => {
      if (!failed && route.request().postData()?.includes('"finish"')) {
        failed = true;
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: sv ? "Skicka in test" : "Submit assessment", exact: true })
      .click();
    const title = page.getByRole("heading", { name: heading("completed", sv), exact: true });
    await expect(title).toHaveCount(0);
    expect((await state()).status).toBe("running");
    await page
      .getByRole("button", { name: sv ? "Försök skicka in igen" : "Retry submission" })
      .click();
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
    await expect(
      page.getByText(
        sv
          ? "Dina svar har sparats och testet har skickats in till arbetsgivaren. Arbetsgivaren går igenom underlaget och återkommer till dig inom kort med information om nästa steg."
          : "Your responses have been saved and the assessment has been submitted to the employer. The employer will review your responses and contact you shortly about the next steps.",
      ),
    ).toBeVisible();
    expect((await state()).report).toBeNull();
    await page.screenshot({
      path: test.info().outputPath("completion-withheld.png"),
      fullPage: true,
    });
    await shareSyntheticReport(id);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(sv ? "rätt svar" : "correct answers", { exact: false }),
    ).toBeVisible();
    await expect(title).toBeVisible();
    expect((await state()).reportVisible).toBe(true);
    expect(await beforeUnloadBlocked(page)).toBe(false);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("completion-shared.png"),
      fullPage: true,
    });
  });

  test(`${language}: delayed earlier refresh cannot reopen a closed session`, async ({
    page,
    context,
  }) => {
    const { id, state } = await candidate(context, sv);
    await state("start");
    await page.goto(`${base}/academy/${id}`);
    await expect(page.getByRole("timer")).toBeVisible();
    let held = false;
    let release!: () => void;
    let delivered = false;
    await page.route("**/_serverFn/**", async (route) => {
      if (!held && route.request().postData()?.includes('"get"')) {
        held = true;
        const response = await route.fetch(); // actual older server snapshot
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route.fulfill({ response });
        delivered = true;
      } else await route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => !!release).toBe(true);
    await state("finish");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("heading", { name: heading("completed", sv), exact: true }),
    ).toBeVisible();
    release();
    await expect.poll(() => delivered).toBe(true);
    await expect(page.getByRole("timer")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: heading("completed", sv), exact: true }),
    ).toBeVisible();
  });
}

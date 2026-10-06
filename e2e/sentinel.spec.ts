import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3127";
const gateway = "http://127.0.0.1:59231";
const local = process.env.E2E_LOCAL_STACK === "1" && new URL(base).hostname === "127.0.0.1";
test.skip(!local, "Sentinel writes only to a disposable loopback fixture");
const shots = "docs/assessment/sentinel/screenshots";
async function account(context: BrowserContext, email: string, lang = "sv") {
  const auth = await fetch(`${gateway}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "LocalJourney!2026" }),
  }).then((r) => r.json());
  expect(auth.access_token).toBeTruthy();
  await context.addInitScript(
    ({ auth, lang }) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(auth));
      localStorage.setItem("cqrityjob.lang", lang);
    },
    { auth, lang },
  );
  return auth;
}
async function runPractice(page: Page, sv: boolean) {
  await page.getByRole("button", { name: sv ? "Gå till övningarna" : "Go to practice" }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("radio").first().focus();
    await page.getByRole("radio").first().press("Space");
    await expect(page.getByRole("radio").first()).toBeChecked();
    await page.getByRole("button", { name: sv ? "Visa förklaring" : "Show explanation" }).click();
    await expect(
      page.getByText(sv ? "Rätt alternativ" : "Correct option", { exact: false }),
    ).toBeVisible();
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
  await page
    .getByRole("button", { name: sv ? "Starta test" : "Start assessment", exact: true })
    .click();
  await expect(page.getByRole("timer")).toBeVisible();
}
test("Sentinel actual shared assignment, practice, twenty responses, refresh, reports and SV/EN", async ({
  browser,
}) => {
  test.setTimeout(180000);
  mkdirSync(shots, { recursive: true });
  const employer = await browser.newContext();
  const ownerAuth = await account(employer, "owner@journey.test");
  const ep = await employer.newPage();
  await ep.goto(`${base}/employer/nordvakt-journey/assessments/library`);
  const card = ep.getByTestId("sentinel-test-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("25 min");
  await ep.screenshot({ path: `${shots}/testbank-sv.png`, fullPage: true });
  const existing = await fetch(`${gateway}/rest/v1/rpc/scp_application_assessments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ownerAuth.access_token}`,
    },
    body: JSON.stringify({ _application_id: "ea000000-3333-0000-0000-000000000001" }),
  }).then((r) => r.json());
  if (
    !existing.some(
      (r: { assessment_slug: string }) => r.assessment_slug === "abstract_reasoning_v1",
    )
  ) {
    await card.getByRole("button", { name: "Skicka test" }).click();
    await ep.getByRole("combobox").selectOption("ea000000-2222-0000-0000-000000000001");
    await expect(ep.getByRole("checkbox")).toHaveCount(2);
    await ep.getByRole("checkbox").first().check();
    await ep.getByRole("checkbox").nth(1).check();
    await ep.getByRole("button", { name: /Välj test/ }).click();
    await expect(ep.getByRole("radio", { name: /Sentinel/ })).toBeChecked();
    await ep.getByRole("button", { name: "Granska utskick" }).click();
    await ep.getByRole("button", { name: "Skicka test", exact: true }).click();
    await expect(ep.getByText("Testet är skickat", { exact: false }).first()).toBeVisible({
      timeout: 45000,
    });
    await ep.screenshot({ path: `${shots}/batch-assigned-sv.png`, fullPage: true });
  }
  // Read exact opaque attempt ids from the candidate's existing authorised list.
  for (const [email, sv] of [
    ["anna@journey.test", true],
    ["bo@journey.test", false],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const auth = await account(ctx, email, sv ? "en" : "sv");
    const rpc = async (name: string, body: object) => {
      const r = await fetch(`${gateway}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify(body),
      });
      expect(r.ok).toBeTruthy();
      return r.json();
    };
    const work = await rpc("scp_my_academy_work", {});
    const target = work.find((r: { title_sv: string }) => r.title_sv?.includes("Sentinel"));
    expect(target).toBeTruthy();
    const page = await ctx.newPage();
    await page.goto(`${base}/academy/${target.work_id}`);
    // Synthetic fixture exercises assigned Swedish and English.
    await expect(
      page.getByRole("button", { name: sv ? "Gå till övningarna" : "Go to practice" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${shots}/candidate-information-${sv ? "sv" : "en"}.png`,
      fullPage: true,
    });
    await runPractice(page, sv);
    await page.screenshot({ path: `${shots}/question-${sv ? "sv" : "en"}.png`, fullPage: true });
    const state = await rpc("sentinel_session", { _attempt_id: target.work_id });
    const deadline = state.deadline;
    const networkBodies: string[] = [];
    page.on("response", async (r) => {
      if (r.url().includes("_server") && r.request().method() === "POST") {
        try {
          networkBodies.push(await r.text());
        } catch {
          // A closed page may no longer expose this response body.
        }
      }
    });
    const mirror = await ctx.newPage();
    await mirror.goto(`${base}/academy/${target.work_id}`);
    await expect(mirror.getByRole("timer")).toBeVisible();
    expect((await rpc("sentinel_session", { _attempt_id: target.work_id })).deadline).toBe(
      deadline,
    );
    await mirror.close();
    let failSave = true;
    await page.route("**/_serverFn/**", async (route) => {
      if (
        failSave &&
        route.request().method() === "POST" &&
        route.request().postData()?.includes('"save"')
      ) {
        failSave = false;
        await route.abort("failed");
      } else await route.continue();
    });
    for (let i = 0; i < 20; i++) {
      await page.getByRole("radio").first().focus();
      await page.getByRole("radio").first().press("Space");
      await expect(page.getByRole("radio").first()).toBeChecked();
      if (i === 0) {
        await expect(
          page.getByText(sv ? "Svar ej sparat" : "Response not saved", { exact: true }),
        ).toBeVisible();
        expect(failSave).toBe(false);
        await expect(
          page.getByRole("button", { name: sv ? "Nästa" : "Next", exact: true }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: sv ? "Spara igen" : "Save again", exact: true })
          .click();
      }
      await expect(
        page.getByText(
          sv
            ? "Serverbekräftade svar sparas automatiskt."
            : "Server-confirmed responses are saved automatically.",
        ),
      ).toBeVisible();
      if (i === 3) {
        await page.reload();
        await expect(page.getByRole("timer")).toBeVisible();
        await page
          .getByRole("button", {
            name: sv ? "Uppgift 4, besvarad" : "Question 4, answered",
            exact: true,
          })
          .click();
      }
      if (i < 19)
        await page.getByRole("button", { name: sv ? "Nästa" : "Next", exact: true }).click();
    }
    expect((await rpc("sentinel_session", { _attempt_id: target.work_id })).deadline).toBe(
      deadline,
    );
    expect(networkBodies.length).toBeGreaterThan(0);
    expect(
      networkBodies.some((body) => /"(strategies|explanation|templateId|seed)"/.test(body)),
    ).toBe(false);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator("body")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      path: `${shots}/question-mobile-${sv ? "sv" : "en"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: sv ? "Granska och skicka in" : "Review and submit" })
      .click();
    await page
      .getByRole("button", { name: sv ? "Skicka in test" : "Submit assessment", exact: true })
      .click();
    await expect(
      page.getByText(sv ? "Testtillfället är avslutat." : "This attempt is closed."),
    ).toBeVisible();
    await expect(
      page.getByText(
        sv
          ? "Arbetsgivaren avgör när resultatet delas med dig."
          : "The employer decides when to share the result with you.",
        { exact: false },
      ),
    ).toBeVisible();
    await ep.goto(`${base}/employer/nordvakt-journey/assessments/results/${target.work_id}`);
    await expect(ep.getByText("Separat testresultat")).toBeVisible();
    await ep.screenshot({ path: `${shots}/employer-report-sv.png`, fullPage: true });
    await ep.getByRole("button", { name: "Dela resultat med kandidaten" }).click();
    await expect(ep.getByRole("button", { name: "Dela resultat med kandidaten" })).toHaveCount(0);
    await page.goto(`${base}/academy/report/${target.work_id}`);
    await expect(
      page.getByText(sv ? "correct answers" : "rätt svar", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: `${shots}/candidate-report-${sv ? "en" : "sv"}.png`,
      fullPage: true,
    });
    await ctx.close();
  }
  await ep.goto(`${base}/employer/nordvakt-journey/assessments/library`);
  await ep.getByRole("button", { name: /^en$/i }).click();
  await expect(card).toContainText("Abstract Reasoning");
  await ep.screenshot({ path: `${shots}/testbank-en.png`, fullPage: true });
  await employer.close();
});

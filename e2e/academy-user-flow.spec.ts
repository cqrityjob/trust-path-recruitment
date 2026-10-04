import { selectSiteLanguage } from "./support/site-language";
import { fromJSON } from "seroval";
import { test, expect, type Route } from "@playwright/test";
import { mount, ok, takeMountBookkeeping, ATTEMPT_ID } from "./support/career-home-harness";

// Real routes, synthetic accounts and a stateful transport stub only. No
// live backend requests or production writes are needed for these checks.
test.describe.configure({ timeout: 90_000 });
test.afterEach(() => {
  const result = takeMountBookkeeping();
  if (result) {
    expect(result.unmatched).toEqual([]);
    expect(result.errors).toEqual([]);
  }
});
const itemId = "11111111-1111-4111-8111-111111111111";
const response = (route: Route, value: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: value, error: null, context: {} }),
  });

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: save failure, retry, resume, submit and reload`, async ({ page }) => {
    let savedText: string | null = null;
    let failSave = true;
    let submitted = false;
    let selectedOption: string | null = null;
    let submitCount = 0;
    const state = () => ({
      status: submitted ? "submitted" : "in_progress",
      isOpen: !submitted,
      language: lang,
      minutesMin: 2,
      minutesMax: 4,
    });
    const item = () => ({
      itemVersionId: itemId,
      displayOrder: 1,
      blockKey: "reflection",
      itemFormat: "constructed_response",
      scenario: "Synthetic scenario",
      prompt: "Synthetic reflection question",
      isSafetyCritical: false,
      options: [],
      savedOptionId: null,
      savedBestId: null,
      savedWorstId: null,
      savedText,
    });
    await mount(page, "hub_active", {
      lang,
      path: "/academy",
      ready: "main h1",
      overrides: {
        getLearningFormForModule: ok(null),
        getAcademyAttemptState: (r) => response(r, state()),
        getAcademyAttemptItems: (r) =>
          response(r, [
            item(),
            {
              ...item(),
              itemVersionId: "22222222-2222-4222-8222-222222222222",
              displayOrder: 2,
              itemFormat: "sjt_best_response",
              prompt: "Synthetic choice question",
              savedText: null,
              savedOptionId: selectedOption,
              options: [
                {
                  optionId: "33333333-3333-4333-8333-333333333333",
                  optionKey: "A",
                  label: "Synthetic choice",
                },
              ],
            },
          ]),
        getAcademyAttemptBlocks: ok([
          {
            blockKey: "reflection",
            name: "Reflection",
            intro: "Original introduction",
            asks: "your_own_experience",
            itemCount: 2,
          },
        ]),
        listAcademyWork: (r) =>
          response(r, [
            {
              workId: ATTEMPT_ID,
              workKind: "assessment",
              useCase: "recruitment",
              status: "in_progress",
              progressDone: savedText ? 1 : 0,
              progressTotal: 2,
              titleSv: "Syntetiskt rekryteringstest",
              titleEn: "Synthetic recruitment test",
              employerName: "Example employer",
              deadline: "2030-11-01T00:00:00Z",
              releasedAt: null,
            },
          ]),
        saveAcademyResponse: async (r) => {
          if (failSave)
            return r.fulfill({
              status: 500,
              contentType: "text/plain",
              body: "Synthetic save failure",
            });
          const payload = fromJSON(JSON.parse(r.request().postData() ?? "{}")) as {
            data?: { responseText?: string; itemVersionId?: string; selectedOptionId?: string };
            responseText?: string;
          };
          if (payload.data?.itemVersionId === itemId)
            savedText = payload.data?.responseText ?? null;
          else selectedOption = payload.data?.selectedOptionId ?? null;
          await response(r, null);
        },
        submitAcademyAttempt: async (r) => {
          submitCount++;
          submitted = true;
          await response(r, { reviewsOpened: 1 });
        },
      },
    });
    await expect(page.locator("main")).toContainText("Example employer");
    await page
      .getByRole("link", { name: lang === "sv" ? "Starta testet" : "Start the test", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      lang === "sv" ? "Rekryteringstest" : "Recruitment test",
    );
    await expect(page.locator("main")).toContainText("2–4");
    await page.screenshot({
      path: `artifacts/cqrity-flow-${lang}-intro-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: lang === "sv" ? "Starta testet" : "Start the test",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: lang === "sv" ? "Fortsätt" : "Continue", exact: true })
      .click();
    await page.getByRole("textbox").fill("Synthetic answer remains available after a failed save.");
    await page.getByRole("textbox").scrollIntoViewIfNeeded();
    const fieldClear = await page
      .getByRole("textbox")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top >=
          Math.max(0, document.querySelector("header")!.getBoundingClientRect().bottom),
      );
    expect(fieldClear).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const pause = () =>
      page
        .getByRole("button", {
          name: lang === "sv" ? "Spara och fortsätt senare" : "Save and continue later",
          exact: true,
        })
        .last();
    await pause().click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue(
      "Synthetic answer remains available after a failed save.",
    );
    // Logo navigation must not discard a failed answer.
    await page
      .getByRole("link")
      .filter({ has: page.getByAltText("CQrityjob") })
      .click();
    await expect(page).toHaveURL(new RegExp(`/academy/${ATTEMPT_ID}$`));
    await expect(page.getByRole("textbox")).toHaveValue(
      "Synthetic answer remains available after a failed save.",
    );
    await page.evaluate(() => history.back());
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/academy/${ATTEMPT_ID}$`));
    expect(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
    failSave = false;
    await pause().click();
    await expect(page.getByRole("status")).toContainText(lang === "sv" ? "sparade" : "saved");
    expect(savedText).toBe("Synthetic answer remains available after a failed save.");
    await page.screenshot({
      path: `artifacts/cqrity-flow-${lang}-paused-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.locator('main a[href="/academy"]').click();
    await page
      .getByRole("link", {
        name: lang === "sv" ? "Fortsätt testet" : "Continue the test",
        exact: true,
      })
      .click();
    await page.reload();
    await page
      .getByRole("button", {
        name: lang === "sv" ? "Fortsätt testet" : "Continue the test",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: lang === "sv" ? "Fortsätt" : "Continue", exact: true })
      .click();
    await expect(page.getByRole("textbox")).toHaveValue(savedText!);
    await page.getByRole("button", { name: lang === "sv" ? "Nästa" : "Next", exact: true }).click();
    await page.getByText("Synthetic choice", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Synthetic choice" })).toBeChecked();
    await page
      .getByRole("button", {
        name: lang === "sv" ? "Lämna in testet" : "Submit the test",
        exact: true,
      })
      .click();
    await expect(page.locator('main a[href="/academy"]')).toBeVisible();
    await expect(page.locator('main a[href="/my-career"]')).toBeVisible();
    await page.screenshot({
      path: `artifacts/cqrity-flow-${lang}-submitted-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator('main a[href="/academy"]')).toBeVisible();
    expect(submitCount).toBe(1);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    const overlap = await page
      .locator("main")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top <
          document.querySelector("header")!.getBoundingClientRect().bottom,
      );
    expect(overlap).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: security work offers shared navigation and an overview return`, async ({
    page,
  }) => {
    await mount(page, "hub_active", {
      lang,
      path: "/security-work",
      ready: '[data-testid="sw-entry"]',
      overrides: { getSecurityWorkEntry: ok({ ok: true, data: { workspaces: [] } }) },
    });
    await expect(page.getByAltText("CQrityjob").first()).toHaveAttribute(
      "src",
      "/brand/cqrityjob-logo.svg",
    );
    if (test.info().project.name === "mobile-375") {
      await page
        .getByRole("button", { name: lang === "sv" ? "Öppna menyn" : "Open menu", exact: true })
        .click();
    }
    const nav = page.locator(
      `[data-candidate-app-nav="${test.info().project.name === "mobile-375" ? "mobile" : "desktop"}"]`,
    );
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `artifacts/cqrity-flow-${lang}-security-work-${test.info().project.name}.png`,
      fullPage: true,
    });
    const overview = nav.locator('a[href="/my-career"]');
    await overview.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/my-career$/);
    await expect(page.locator("[data-career-header]")).toBeVisible();
  });
}

test("same-document account switch clears answers, and a fresh session resumes saved work", async ({
  page,
}) => {
  const accountA = "00000000-0000-4000-8000-000000000001";
  const accountB = "00000000-0000-4000-8000-000000000002";
  let account = accountA;
  let wrongAccountWrites = 0;
  const savedText = "Saved synthetic answer belonging to account A";
  await mount(page, "hub_active", {
    path: `/academy/${ATTEMPT_ID}`,
    ready: "main h1",
    overrides: {
      getAcademyAttemptState: (r) =>
        response(
          r,
          account === accountA
            ? { status: "in_progress", isOpen: true, language: "sv", minutesMin: 2, minutesMax: 4 }
            : null,
        ),
      getAcademyAttemptItems: (r) =>
        response(
          r,
          account === accountA
            ? [
                {
                  itemVersionId: itemId,
                  displayOrder: 1,
                  blockKey: "reflection",
                  itemFormat: "constructed_response",
                  scenario: "Synthetic scenario",
                  prompt: "Synthetic reflection question",
                  isSafetyCritical: false,
                  options: [],
                  savedOptionId: null,
                  savedBestId: null,
                  savedWorstId: null,
                  savedText,
                },
              ]
            : [],
        ),
      getAcademyAttemptBlocks: ok([
        {
          blockKey: "reflection",
          name: "Reflection",
          intro: "Synthetic introduction",
          asks: "your_own_experience",
          itemCount: 1,
        },
      ]),
      listAcademyWork: ok([{ workId: ATTEMPT_ID, useCase: "recruitment" }]),
      saveAcademyResponse: async (r) => {
        if (account !== accountA) wrongAccountWrites++;
        await response(r, null);
      },
    },
  });
  await page.route("**/auth/v1/user**", async (r) => {
    const token =
      r
        .request()
        .headers()
        .authorization?.replace(/^Bearer /, "") ?? "";
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    await r.fulfill({
      json: {
        id: payload.sub,
        aud: "authenticated",
        role: "authenticated",
        email: `${payload.sub}@example.test`,
      },
    });
  });
  const switchTo = async (id: string) => {
    account = id;
    await page.evaluate(async (userId) => {
      const clientPath = "/src/integrations/supabase/client.ts";
      const { supabase } = await import(/* @vite-ignore */ clientPath);
      const encode = (v: unknown) =>
        btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" })}.c3ludGhldGlj`;
      const { error } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: "synthetic-refresh",
      });
      if (error) throw error;
    }, id);
  };
  const resume = async () => {
    await page.getByRole("button", { name: "Fortsätt testet", exact: true }).click();
    await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await expect(page.getByRole("textbox")).toHaveValue(savedText);
  };
  await resume();
  await page.getByRole("textbox").fill("Unsaved synthetic buffer belonging to A");
  await switchTo(accountB);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(savedText);
  await expect(page.locator("main")).not.toContainText("Unsaved synthetic buffer belonging to A");
  await page.waitForTimeout(1000); // beyond the text debounce; no old-owner write may start
  expect(wrongAccountWrites).toBe(0);
  await switchTo(accountA);
  await resume();
  await page.getByRole("button", { name: "Spara och fortsätt senare", exact: true }).last().click();
  await expect(page.getByRole("status")).toContainText("sparade");
  await page.evaluate(async () => {
    const clientPath = "/src/integrations/supabase/client.ts";
    const { supabase } = await import(/* @vite-ignore */ clientPath);
    await supabase.auth.signOut();
  });
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await switchTo(accountA);
  await page.goto(`/academy/${ATTEMPT_ID}`);
  await resume();
});

test("shared language controls switch both ways from Security Work", async ({ page }) => {
  await mount(page, "hub_active", {
    lang: "sv",
    path: "/security-work",
    ready: '[data-testid="sw-entry"]',
    overrides: { getSecurityWorkEntry: ok({ ok: true, data: { workspaces: [] } }) },
  });
  await selectSiteLanguage(page, "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My Security Work");
  await expect(page).toHaveURL((url) => url.pathname === "/security-work");
  if ((page.viewportSize()?.width ?? 1280) >= 1024) {
    const account = page
      .locator("header")
      .getByRole("button", { name: "Account and settings", exact: true });
    await account.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const swedish = page.getByRole("menuitemradio", { name: "Svenska", exact: true });
    await swedish.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  } else {
    await selectSiteLanguage(page, "sv");
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mitt säkerhetsarbete");
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
});

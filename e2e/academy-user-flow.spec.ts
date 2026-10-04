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
    await page
      .getByRole("button", { name: lang === "sv" ? "Stanna kvar" : "Stay here", exact: true })
      .click();
    await page.evaluate(() => history.back());
    await expect(page.getByRole("alert").first()).toBeVisible();
    // Browser Back changes the address while its transition is awaiting a
    // decision; the player and answers remain mounted until it resolves.
    expect(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(true);
    await page
      .getByRole("button", { name: lang === "sv" ? "Stanna kvar" : "Stay here", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/academy/${ATTEMPT_ID}$`));
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
    if ((page.viewportSize()?.width ?? 1280) < 1024) {
      await page
        .getByRole("button", { name: lang === "sv" ? "Öppna menyn" : "Open menu", exact: true })
        .click();
    }
    const nav = page.locator(
      `[data-candidate-app-nav="${(page.viewportSize()?.width ?? 1280) < 1024 ? "mobile" : "desktop"}"]`,
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

for (const pendingSubmission of [false, true]) {
  test(`expired session ${pendingSubmission ? "during pending submission" : "with failed answers"} reaches login without saving under a new identity`, async ({
    page,
  }) => {
    let releaseSave: (() => void) | undefined;
    let submissions = 0;
    let saves = 0;
    await mount(page, "hub_active", {
      path: `/academy/${ATTEMPT_ID}`,
      ready: "main h1",
      overrides: {
        getAcademyAttemptState: ok({
          status: "in_progress",
          isOpen: true,
          language: "sv",
          minutesMin: 2,
          minutesMax: 4,
        }),
        getAcademyAttemptItems: ok([
          {
            itemVersionId: itemId,
            displayOrder: 1,
            blockKey: "reflection",
            itemFormat: "constructed_response",
            scenario: "Synthetic scenario",
            prompt: "Synthetic question",
            isSafetyCritical: false,
            options: [],
            savedOptionId: null,
            savedBestId: null,
            savedWorstId: null,
            savedText: null,
          },
        ]),
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
        submitAcademyAttempt: async (r) => {
          submissions++;
          await response(r, { reviewsOpened: 0 });
        },
        saveAcademyResponse: async (r) => {
          saves++;
          if (pendingSubmission) {
            await new Promise<void>((resolve) => {
              releaseSave = resolve;
            });
            await response(r, null).catch(() => {});
          } else await r.abort("failed");
        },
      },
    });
    await page.getByRole("button", { name: "Starta testet", exact: true }).click();
    await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await page.getByRole("textbox").fill("Unsaved synthetic answer before expiry");
    await expect.poll(() => saves).toBeGreaterThan(0);
    if (pendingSubmission)
      await page.getByRole("button", { name: "Lämna in testet", exact: true }).click();
    await page.route("**/auth/v1/token**", (r) =>
      r.fulfill({
        status: 400,
        json: { code: "refresh_token_not_found", msg: "Synthetic session expired" },
      }),
    );
    const expiresAt = await page.evaluate(async () => {
      const path = "/src/integrations/supabase/client.ts";
      const { supabase } = await import(/* @vite-ignore */ path);
      return (await supabase.auth.getSession()).data.session!.expires_at!;
    });
    // Advance Date beyond the real synthetic session's expiry. A proactive
    // refresh failure while its access token is valid correctly preserves it.
    await page.clock.setFixedTime(new Date((expiresAt + 1) * 1000));
    // The real SDK emits SIGNED_OUT when refresh is rejected. No reload or
    // storage replacement: this reproduces expiry while the player is mounted.
    await page.evaluate(async () => {
      const path = "/src/integrations/supabase/client.ts";
      const { supabase } = await import(/* @vite-ignore */ path);
      await supabase.auth.refreshSession();
    });
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(page.locator('input[type="password"]')).toBeVisible();
    const afterExpiry = saves;
    const accountB = "00000000-0000-4000-8000-000000000002";
    await page.route("**/auth/v1/user**", (r) =>
      r.fulfill({
        json: {
          id: accountB,
          aud: "authenticated",
          role: "authenticated",
          email: "synthetic-b@example.test",
        },
      }),
    );
    const signedInId = await page.evaluate(async (userId) => {
      const path = "/src/integrations/supabase/client.ts";
      const { supabase } = await import(/* @vite-ignore */ path);
      const encode = (v: unknown) =>
        btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" })}.c3ludGhldGlj`;
      const { data, error } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: "synthetic-b-refresh",
      });
      if (error) throw error;
      return data.user?.id;
    }, accountB);
    expect(signedInId).toBe(accountB);
    releaseSave?.();
    await page.waitForTimeout(1000);
    expect(saves).toBe(afterExpiry);
    expect(submissions).toBe(0);
    await expect(
      page.getByText("Unsaved synthetic answer before expiry", { exact: true }),
    ).toHaveCount(0);
  });
}

for (const lang of ["sv", "en"] as const) {
  for (const mode of ["pause", "back", "hanging"] as const) {
    const navigation = mode === "back";
    test(`${lang}: network outage allows explicit leave after ${mode}`, async ({ page }) => {
      let releaseRequest: (() => void) | undefined;
      let saveCalls = 0;
      let offline = false;
      let savedText = "Previously saved synthetic answer";
      await mount(page, "hub_active", {
        lang,
        path: "/academy",
        ready: "main h1",
        overrides: {
          getLearningFormForModule: ok(null),
          getAcademyAttemptState: ok({
            status: "in_progress",
            isOpen: true,
            language: lang,
            minutesMin: 2,
            minutesMax: 4,
          }),
          getAcademyAttemptItems: (r) =>
            response(r, [
              {
                itemVersionId: itemId,
                displayOrder: 1,
                blockKey: "reflection",
                itemFormat: "constructed_response",
                scenario: "Synthetic scenario",
                prompt: "Synthetic question",
                isSafetyCritical: false,
                options: [],
                savedOptionId: null,
                savedBestId: null,
                savedWorstId: null,
                savedText,
              },
            ]),
          getAcademyAttemptBlocks: ok([
            {
              blockKey: "reflection",
              name: "Reflection",
              intro: "Synthetic introduction",
              asks: "your_own_experience",
              itemCount: 1,
            },
          ]),
          listAcademyWork: ok([
            {
              workId: ATTEMPT_ID,
              workKind: "assessment",
              useCase: "recruitment",
              status: "in_progress",
              progressDone: 1,
              progressTotal: 1,
              titleSv: "Syntetiskt test",
              titleEn: "Synthetic test",
            },
          ]),
          saveAcademyResponse: async (r) => {
            saveCalls++;
            if (offline) {
              if (mode === "hanging")
                await new Promise<void>((resolve) => {
                  releaseRequest = resolve;
                });
              await r.abort("failed").catch(() => {});
              return;
            }
            const payload = fromJSON(JSON.parse(r.request().postData()!)) as {
              data: { responseText: string };
            };
            savedText = payload.data.responseText;
            await response(r, null);
          },
        },
      });
      const open = () =>
        page
          .getByRole("link", {
            name: lang === "sv" ? "Fortsätt testet" : "Continue the test",
            exact: true,
          })
          .click();
      const begin = async () => {
        await page
          .getByRole("button", {
            name: lang === "sv" ? "Fortsätt testet" : "Continue the test",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: lang === "sv" ? "Fortsätt" : "Continue", exact: true })
          .click();
      };
      await open();
      await begin();
      offline = true;
      await page.getByRole("textbox").fill("Unsaved change during synthetic outage");
      if (navigation) await page.evaluate(() => history.back());
      else
        await page
          .getByRole("button", {
            name: lang === "sv" ? "Spara och fortsätt senare" : "Save and continue later",
            exact: true,
          })
          .last()
          .click();
      const notice = page.getByTestId("academy-unsaved-exit");
      const retry = notice.getByRole("button", {
        name: lang === "sv" ? "Försök spara igen" : "Try saving again",
        exact: true,
      });
      await expect(notice).toContainText(
        lang === "sv" ? "osparade svar gå förlorade" : "unsaved answers may be lost",
      );
      if (mode === "hanging") {
        await expect.poll(() => saveCalls).toBeGreaterThan(0);
        await expect(retry).toBeDisabled();
      } else {
        await expect(retry).toBeEnabled();
        const beforeRetry = saveCalls;
        await retry.click();
        await expect.poll(() => saveCalls).toBeGreaterThan(beforeRetry);
        await expect(retry).toBeEnabled();
      }
      await expect(page.getByRole("textbox")).toHaveValue("Unsaved change during synthetic outage");
      await notice
        .getByRole("button", {
          name: lang === "sv" ? "Lämna utan att spara" : "Leave without saving",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/academy$/);
      releaseRequest?.();
      expect(savedText).toBe("Previously saved synthetic answer");
      offline = false;
      await open();
      await begin();
      await expect(page.getByRole("textbox")).toHaveValue("Previously saved synthetic answer");
    });
  }
}

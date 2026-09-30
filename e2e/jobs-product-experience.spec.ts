/** Routed UI acceptance with a synthetic read-only catalogue. This suite does
 * not replace the local-stack application/RLS integration tests. No data is
 * inserted in a shared backend and no external application is submitted. */
import { test, expect, type Page } from "@playwright/test";
import {
  installJobsFixture,
  JOBS_FIXTURE,
  CLOSED_JOB,
  JOBS_EMPLOYER,
} from "./support/jobs-fixture";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const first = JOBS_FIXTURE[0]!;
const second = JOBS_FIXTURE[1]!;
const keyword = (page: Page) =>
  page.getByRole("textbox", { name: "Roll, kompetens eller nyckelord", exact: true });
const card = (page: Page, title: string) =>
  page
    .locator('[aria-label="Jobblista"], [aria-label="Job list"]')
    .getByRole("link", { name: title, exact: true });
async function open(page: Page, path = "/jobs") {
  await page.goto(`${BASE}${path}`);
  await expect(keyword(page)).toBeVisible({ timeout: 30000 });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    "Page overflows horizontally",
  ).toBeLessThanOrEqual(1);
}
async function choose(page: Page, label: string, option: RegExp) {
  const control = page.getByRole("combobox", { name: label, exact: true });
  if (await control.evaluate((element) => element.tagName === "SELECT")) {
    const matching = await control
      .locator("option")
      .evaluateAll(
        (items, source) =>
          items
            .filter((item) => new RegExp(source, "i").test(item.textContent ?? ""))
            .map((item) => (item as HTMLOptionElement).value),
        option.source,
      );
    await control.selectOption(matching[0]!);
  } else {
    await control.click();
    await page.getByRole("option", { name: option }).click();
  }
}

test("search, database filter parameters, sort and browser history remain connected", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  await open(page);
  await expect(card(page, first.title_sv)).toBeVisible();
  await keyword(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Plats", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sök jobb", exact: true })).toBeFocused();
  await keyword(page).fill("Säkerhetschef");
  await page.getByRole("textbox", { name: "Plats", exact: true }).fill("Stockholm");
  await page.getByRole("button", { name: "Sök jobb", exact: true }).click();
  await expect(page).toHaveURL(/q=S%C3%A4kerhetschef/);
  await expect(card(page, second.title_sv)).toHaveCount(0);
  await expect
    .poll(() =>
      fixture.requests.some(
        (url) =>
          url.searchParams
            .getAll("or")
            .some((value) => /title_sv\.ilike\."?%Säkerhetschef%/.test(value)) &&
          url.searchParams.getAll("or").some((value) => /city\.ilike\."?%Stockholm%/.test(value)),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: /^Filter/ }).click();
  await choose(page, "Anställningsform", /Heltid/);
  await expect(page).toHaveURL(/employment=full_time/);
  await expect
    .poll(() =>
      fixture.requests.some((url) => url.searchParams.get("employment_type") === "eq.full_time"),
    )
    .toBe(true);
  await choose(page, "Sortera", /ansökningsdag|deadline/i);
  await expect(page).toHaveURL(/sort=deadline/);
  await expect
    .poll(() =>
      fixture.requests.some((url) => url.searchParams.get("order")?.startsWith("deadline_at")),
    )
    .toBe(true);
  await page.goBack();
  await expect(page).not.toHaveURL(/sort=deadline/);
  await page.goForward();
  await expect(page).toHaveURL(/sort=deadline/);
  await page.reload();
  await expect(keyword(page)).toHaveValue("Säkerhetschef");
  await expect(page.getByRole("textbox", { name: "Plats", exact: true })).toHaveValue("Stockholm");
  await page.getByRole("button", { name: /Rensa (alla|filter)/ }).click();
  await expect(keyword(page)).toHaveValue("");
  await expect(card(page, second.title_sv)).toBeVisible();
  // This checks what the real client sends. The read-only fixture does not
  // claim to prove database/RLS enforcement of these visibility predicates.
  const catalogueRequests = fixture.requests.filter((url) => !url.searchParams.has("slug"));
  expect(catalogueRequests.length).toBeGreaterThan(0);
  for (const url of catalogueRequests) {
    expect(url.searchParams.get("status")).toBe("eq.published");
    const published = url.searchParams.get("published_at");
    expect(published).toMatch(/^lte\.\d{4}-/);
    expect(Date.parse(published!.slice(4))).toBeLessThanOrEqual(Date.now());
    expect(url.searchParams.getAll("or")).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\(deadline_at\.is\.null,deadline_at\.gt\.\d{4}-.*\)$/),
        expect.stringMatching(/^\(expires_at\.is\.null,expires_at\.gt\.\d{4}-.*\)$/),
      ]),
    );
  }
  fixture.assertClean();
});

test("every card opens the advert's own page, and the way back restores the results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  await open(page, "/jobs?country=SE");
  // No second copy of an advert beside the list: the list is the page.
  await expect(page.locator("[data-job-detail]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Vald annons|Selected job/ })).toHaveCount(0);
  await expect(card(page, first.title_sv)).toContainText("Läs annonsen");
  await card(page, first.title_sv).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${first.slug}\\?from=`));
  const from = new URLSearchParams(new URL(page.url()).searchParams.get("from")!);
  expect(from.get("country")).toBe("SE");
  expect(from.get("selected"), "a way back must never carry `selected`").toBeNull();
  await expect(
    page.getByRole("heading", { level: 1, name: first.title_sv, exact: true }),
  ).toBeVisible();
  // Keyboard: the way back is a real link, and it lands on the same card.
  await page.locator("[data-job-back]").first().click();
  await expect(page).toHaveURL(/\/jobs\?country=SE$/);
  await expect(card(page, first.title_sv)).toBeFocused();
  // And the browser's own Back/Forward still work.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/jobs/${first.slug}`));
  await page.goForward();
  await expect(page).toHaveURL(/\/jobs\?country=SE$/);
  await noOverflow(page);
  fixture.assertClean();
});

test("an old ?selected= link forwards to the advert's own page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  await page.goto(`${BASE}/jobs?q=chef&selected=${first.slug}`);
  await expect(page).toHaveURL(new RegExp(`/jobs/${first.slug}\\?from=q%3Dchef$`), {
    timeout: 30000,
  });
  await expect(
    page.getByRole("heading", { level: 1, name: first.title_sv, exact: true }),
  ).toBeVisible();
  // The forward REPLACED the entry: Back leaves, it does not bounce.
  await page.goBack();
  await expect(page).not.toHaveURL(/selected=/);
  fixture.assertClean();
});

test("external application explains the destination and Escape returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  await page.goto(`${BASE}/jobs/${second.slug}`);
  const apply = page.getByRole("button", { name: /Ansök.*arbetsgivar|Ansök externt/ }).first();
  await expect(apply).toBeVisible({ timeout: 30000 });
  await apply.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveAccessibleName("Du lämnar CQrityjob");
  await expect(dialog.getByRole("link", { name: "Fortsätt till arbetsgivaren" })).toHaveAttribute(
    "href",
    second.application_url!,
  );
  await expect(dialog).toContainText("employer.example.test");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(apply).toBeFocused();
  fixture.assertClean();
});

test("empty results and failed reads offer understandable recovery", async ({ page }) => {
  const fixture = await installJobsFixture(page);
  await open(page, "/jobs?q=no-match-fixture");
  await expect(page.getByRole("heading", { name: "Inga jobb matchar din sökning" })).toBeVisible();
  await page
    .getByRole("button", { name: /Rensa (alla|filter)/ })
    .first()
    .click();
  await expect(card(page, first.title_sv)).toBeVisible();
  fixture.state.fail = true;
  await keyword(page).fill("network-failure-fixture");
  await page.getByRole("button", { name: "Sök jobb", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jobben kunde inte hämtas just nu" })).toBeVisible(
    { timeout: 20000 },
  );
  fixture.state.fail = false;
  await page.getByRole("button", { name: /Försök igen/ }).click();
  await expect(page.getByRole("heading", { name: "Inga jobb matchar din sökning" })).toBeVisible();
  fixture.assertClean();
});

test("sign-in keeps the vacancy, the search and the apply intent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  // Through an old shared link, so the forward is part of what is proven.
  await page.goto(`${BASE}/jobs?q=Säkerhetschef&selected=${first.slug}`);
  const signIn = page.getByRole("link", { name: "Logga in för att ansöka", exact: true }).first();
  await expect(signIn).toBeVisible({ timeout: 30000 });
  const login = new URL((await signIn.getAttribute("href"))!, BASE);
  const returned = new URL(login.searchParams.get("redirect")!, BASE);
  expect(returned.pathname).toBe(`/jobs/${first.slug}`);
  expect(returned.searchParams.get("apply")).toBe("1");
  const from = new URLSearchParams(returned.searchParams.get("from")!);
  expect(from.get("q")).toBe("Säkerhetschef");
  expect(from.get("selected")).toBeNull();
  fixture.assertClean();
});

test("a closed vacancy explains its state before any application", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  await page.goto(`${BASE}/jobs/${CLOSED_JOB.slug}`);
  await expect(page.getByText("Ansökan är stängd", { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("link", { name: "Logga in för att ansöka", exact: true }),
  ).toHaveCount(0);
  fixture.assertClean();
});

test("mobile opens a standalone vacancy and returns to the same search and list position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installJobsFixture(page);
  await open(page, "/jobs?country=SE&sort=deadline");
  const job = card(page, second.title_sv);
  await job.scrollIntoViewIfNeeded();
  const listY = await page.evaluate(() => window.scrollY);
  await job.click();
  const remembered = await page.evaluate(() =>
    Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith("jobs-"))),
  );
  await expect(page).toHaveURL(new RegExp(`/jobs/${second.slug}\\?`));
  await expect(
    page.getByRole("heading", { level: 1, name: second.title_sv, exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  const back = page.locator("[data-job-back]").first();
  await expect(back).toBeVisible();
  const returning = new URL((await back.getAttribute("href"))!, BASE);
  expect(returning.searchParams.get("country")).toBe("SE");
  expect(returning.searchParams.get("sort")).toBe("deadline");
  await back.click();
  await expect(keyword(page)).toBeVisible();
  await expect
    .poll(() => page.evaluate((previous) => Math.abs(window.scrollY - previous), listY), {
      message: `List was at ${listY}; stored ${JSON.stringify(remembered)}`,
    })
    .toBeLessThanOrEqual(5);
  fixture.assertClean();
});

test("no published jobs has a truthful empty state and useful next step", async ({ page }) => {
  const fixture = await installJobsFixture(page);
  fixture.state.empty = true;
  await open(page);
  await expect(page.getByRole("heading", { name: "Inga publicerade jobb just nu" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Utforska säkerhetsyrken", exact: true }),
  ).toHaveAttribute("href", "/career-center");
  await expect(page.locator('[aria-label="Jobblista"]')).toHaveCount(0);
  fixture.assertClean();
});

test("a removed vacancy keeps the results as a recovery path", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  // An old link to an advert that no longer exists.
  await page.goto(`${BASE}/jobs?country=SE&selected=test-removed`);
  await expect(page).toHaveURL(/\/jobs\/test-removed/, { timeout: 30000 });
  await expect(page.locator("[data-job-back]").first()).toBeVisible({ timeout: 30000 });
  await page.locator("[data-job-back]").first().click();
  await expect(page).toHaveURL(/\/jobs\?country=SE$/);
  await card(page, first.title_sv).click();
  await expect(
    page.getByRole("link", { name: "Logga in för att ansöka", exact: true }).first(),
  ).toBeVisible();
  fixture.assertClean();
});

test("a broken company logo falls back while company links remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await installJobsFixture(page);
  await page.route("**/rest/v1/employers**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { ...JOBS_EMPLOYER, logo_url: "https://company.example.test/missing-logo.png" },
      ]),
    }),
  );
  await page.route("https://company.example.test/missing-logo.png", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await open(page);
  await expect(card(page, first.title_sv)).toBeVisible();
  await expect(card(page, first.title_sv).locator("img")).toHaveCount(0);
  await expect(card(page, first.title_sv).getByText("NS", { exact: true })).toBeVisible();
  // The company links live on the advert's own page.
  await card(page, first.title_sv).click();
  const company = page.getByRole("link", { name: /Besök företagets webbplats/ });
  await expect(company).toHaveAttribute("href", "https://employer.example.test/");
  await expect(company).toHaveAttribute("target", "_blank");
  await expect(company).toHaveAccessibleName(/öppnas i en ny flik/);
  await expect(
    page.locator("[data-job-detail]").getByRole("link", { name: second.title_sv, exact: true }),
  ).toHaveAttribute("href", /\/jobs\/test-vaktare/);
  fixture.assertClean();
});

test("an outdated result page returns to page one without losing the search", async ({ page }) => {
  const fixture = await installJobsFixture(page);
  await open(page, "/jobs?q=säkerhet&country=SE&sort=deadline&page=2");
  await expect(
    page.getByRole("heading", { name: "Inga fler jobb på den här sidan", exact: true }),
  ).toBeVisible();
  expect(
    fixture.requests.some(
      (url) => url.searchParams.get("offset") === "20" && url.searchParams.get("limit") === "21",
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "Inga publicerade jobb just nu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Till första sidan", exact: true }).click();
  await expect(card(page, first.title_sv)).toBeVisible();
  const restored = new URL(page.url());
  expect(restored.searchParams.get("page")).toBeNull();
  expect(restored.searchParams.get("q")).toBe("säkerhet");
  expect(restored.searchParams.get("country")).toBe("SE");
  expect(restored.searchParams.get("sort")).toBe("deadline");
  await expect(keyword(page)).toHaveValue("säkerhet");
  await expect(card(page, second.title_sv)).toBeVisible();
  fixture.assertClean();
});

for (const width of [1440, 1280, 768, 390]) {
  for (const language of ["sv", "en"] as const) {
    test(`${language} job content fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const fixture = await installJobsFixture(page, language);
      await page.goto(`${BASE}/jobs`);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(
        page.getByRole("textbox", {
          name: language === "sv" ? "Roll, kompetens eller nyckelord" : "Role, skill or keyword",
          exact: true,
        }),
      ).toBeVisible({ timeout: 30000 });
      await expect(card(page, language === "sv" ? second.title_sv : second.title_en)).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await noOverflow(page);
      const button = page.getByRole("button", {
        name: language === "sv" ? "Sök jobb" : "Search jobs",
        exact: true,
      });
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: `test-results/jobs-product-experience/${language}-${width}.png`,
        fullPage: true,
      });
      fixture.assertClean();
    });
  }
}

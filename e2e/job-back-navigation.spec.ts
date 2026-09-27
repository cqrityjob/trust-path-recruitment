// "Tillbaka till sökresultatet", walked in the RUNNING application against a
// LOCAL stack: a filtered /jobs search, an ad opened from it, the way back, a
// related ad, a direct entry, a reload, and signing in to apply through the
// real /login form -- then back to the same search.
//
// What a static guard cannot prove and this does: that the router, the jobs
// list, the ad's server-rendered loader and the one sign-in door together keep
// the search a person was looking at, on a desktop and on a phone.
//
// Runs only when E2E_LOCAL_STACK=1 and both URLs are loopback: it signs a
// synthetic person in. It expects scripts/fixtures/job-back-navigation-fixture.sql
// to have run:
//
//   jonna.jobb@test.local       a candidate (local password LocalJourney!2026)
//   "Väktare, Göteborg"         the ad the walk opens
//   "Väktare natt, Göteborg"    its related ad
//   "Säkerhetschef, Stockholm"  outside the search
//
// Configuration (all local, none secret):
//   E2E_BASE_URL      the app, e.g. http://localhost:3119
//   E2E_SUPABASE_URL  the local API, e.g. http://127.0.0.1:54321
//
// CI: .github/workflows/job-back-navigation-evidence.yml, which also refuses
// a report in which these tests were skipped, and uploads the screenshots.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local walk.");
test.skip(
  !LOOPBACK.test(BASE) || !LOOPBACK.test(API),
  "This spec signs a person in; it runs against loopback only.",
);

const FILTERS = { q: "väktare", location: "Göteborg", employment: "full_time" } as const;
const SEARCH = `/jobs?${new URLSearchParams(FILTERS).toString()}`;
const AD = "jobbnav-vaktare-goteborg";
const RELATED = "jobbnav-vaktare-natt-goteborg";
const EMAIL = "jonna.jobb@test.local";
const PASSWORD = "LocalJourney!2026";

const TITLE = {
  sv: {
    ad: "Väktare, Göteborg",
    related: "Väktare natt, Göteborg",
    outside: "Säkerhetschef, Stockholm",
  },
  en: {
    ad: "Security officer, Gothenburg",
    related: "Night security officer, Gothenburg",
    outside: "Head of security, Stockholm",
  },
} as const;
/** The /jobs search form's own name, and the ad's "similar jobs" heading. */
const SEARCH_LABEL = { sv: "Hitta jobb inom säkerhet", en: "Find security jobs" } as const;
const RELATED_HEADING = "Liknande jobb";
const BACK = {
  sv: { results: "← Tillbaka till sökresultatet", all: "← Alla jobb" },
  en: { results: "← Back to search results", all: "← All jobs" },
} as const;

const EVIDENCE = path.resolve("test-results/job-back-navigation");

async function inLanguage(page: Page, lang: "sv" | "en") {
  await page.addInitScript((value) => localStorage.setItem("cqrityjob.lang", value), lang);
}

async function evidence(page: Page, name: string) {
  mkdirSync(EVIDENCE, { recursive: true });
  const project = test.info().project.name;
  await page.screenshot({ path: path.join(EVIDENCE, `${project}-${name}.png`), fullPage: false });
}

/** The filters /jobs is showing, read from its own URL. */
function filtersOf(url: string) {
  const u = new URL(url);
  return {
    q: u.searchParams.get("q"),
    location: u.searchParams.get("location"),
    employment: u.searchParams.get("employment"),
  };
}

/** The search the ad carries, read from its `from`. */
function carriedBy(url: string) {
  const from = new URL(url).searchParams.get("from") ?? "";
  const params = new URLSearchParams(from);
  return {
    q: params.get("q"),
    location: params.get("location"),
    employment: params.get("employment"),
  };
}

async function openSearch(page: Page, lang: "sv" | "en" = "sv") {
  await page.goto(`${BASE}${SEARCH}`);
  // The stored language has taken: <html lang> is what a screen reader reads.
  await expect(page.locator("html")).toHaveAttribute("lang", lang, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: TITLE[lang].ad, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  // The search is the search: the ad outside it is not listed.
  await expect(page.getByRole("link", { name: TITLE[lang].outside, exact: true })).toHaveCount(0);
}

/** The ad's own page is on screen. The router keeps the page it came from
 *  mounted until the next one is ready, and that page may list the same
 *  titles -- so a URL alone does not say which page an element belongs to. */
async function onAd(page: Page, title: string) {
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/** A card under the ad's "Liknande jobb", and nowhere else. */
function relatedCard(page: Page, title: string) {
  return page
    .getByRole("heading", { level: 2, name: RELATED_HEADING, exact: true })
    .locator("xpath=..")
    .getByRole("link", { name: title, exact: true });
}

async function expectFilteredList(page: Page, lang: "sv" | "en" = "sv") {
  await page.waitForURL((url) => url.pathname === "/jobs", { timeout: 15_000 });
  expect(filtersOf(page.url()), "the way back lost a filter").toEqual(FILTERS);
  // The list itself is on screen, and nothing of the ad is left: the cards
  // below are the search's results, not the ad's related cards.
  await expect(page.getByRole("search", { name: SEARCH_LABEL[lang] })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-job-back]")).toHaveCount(0);
  // And the page is showing it, not just carrying it.
  await expect(page.getByRole("link", { name: TITLE[lang].ad, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: TITLE[lang].outside, exact: true })).toHaveCount(0);
}

async function backLink(page: Page, kind: "results" | "all") {
  const link = page.locator(`[data-job-back="${kind}"]`).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  const box = await link.boundingBox();
  expect(box?.height ?? 0, "the back link is a 44px target").toBeGreaterThanOrEqual(44);
  return link;
}

test.describe("job ad -> back to the search it came from", () => {
  test("a filtered search survives the ad and the way back", async ({ page }) => {
    await inLanguage(page, "sv");
    await openSearch(page);
    await expect(
      page.getByRole("textbox", { name: "Yrke, kompetens eller nyckelord" }),
    ).toHaveValue(FILTERS.q);

    await page.getByRole("link", { name: TITLE.sv.ad, exact: true }).click();
    await page.waitForURL(`**/jobs/${AD}?from=**`, { timeout: 15_000 });
    expect(carriedBy(page.url()), "the card dropped the search").toEqual(FILTERS);
    await onAd(page, TITLE.sv.ad);

    const back = await backLink(page, "results");
    await expect(back).toHaveText(BACK.sv.results);
    await evidence(page, "ad-with-search-sv");
    await back.click();

    await expectFilteredList(page);
    await expect(
      page.getByRole("textbox", { name: "Yrke, kompetens eller nyckelord" }),
    ).toHaveValue(FILTERS.q);
    await expect(page.getByRole("textbox", { name: "Ort, region eller land" })).toHaveValue(
      FILTERS.location,
    );
    await evidence(page, "back-on-search-sv");
  });

  test("a related ad keeps the way back to the same search", async ({ page }) => {
    await inLanguage(page, "sv");
    await openSearch(page);
    await page.getByRole("link", { name: TITLE.sv.ad, exact: true }).click();
    await page.waitForURL(`**/jobs/${AD}?from=**`, { timeout: 15_000 });
    await onAd(page, TITLE.sv.ad);

    const related = relatedCard(page, TITLE.sv.related);
    await expect(related).toBeVisible({ timeout: 30_000 });
    await related.click();
    await page.waitForURL(`**/jobs/${RELATED}?from=**`, { timeout: 15_000 });
    expect(carriedBy(page.url()), "the related card dropped the search").toEqual(FILTERS);
    await onAd(page, TITLE.sv.related);
    await evidence(page, "related-ad-sv");

    await (await backLink(page, "results")).click();
    await expectFilteredList(page);
  });

  test("a direct entry goes back to all jobs, and a reload keeps the search", async ({ page }) => {
    await inLanguage(page, "sv");
    await page.goto(`${BASE}/jobs/${AD}`);
    const all = await backLink(page, "all");
    await expect(all).toHaveText(BACK.sv.all);
    expect(await all.getAttribute("href")).toBe("/jobs");

    await openSearch(page);
    await page.getByRole("link", { name: TITLE.sv.ad, exact: true }).click();
    await page.waitForURL(`**/jobs/${AD}?from=**`, { timeout: 15_000 });
    const before = await (await backLink(page, "results")).getAttribute("href");

    await page.reload();
    expect(carriedBy(page.url()), "the reload lost the search").toEqual(FILTERS);
    const after = await (await backLink(page, "results")).getAttribute("href");
    expect(after, "the reload changed the way back").toBe(before);
  });

  test("signing in to apply comes back to the ad, with its search", async ({ page }) => {
    await inLanguage(page, "sv");
    await openSearch(page);
    await page.getByRole("link", { name: TITLE.sv.ad, exact: true }).click();
    await page.waitForURL(`**/jobs/${AD}?from=**`, { timeout: 15_000 });
    const adUrl = new URL(page.url());

    const signIn = page.getByRole("link", { name: "Logga in för att ansöka" });
    await expect(signIn).toBeVisible({ timeout: 30_000 });
    // Where the door will send the person back to: this ad, with the search.
    const redirect = new URL(`${BASE}${await signIn.getAttribute("href")}`).searchParams.get(
      "redirect",
    );
    expect(redirect?.startsWith("/"), "the sign-in link must return in-app").toBe(true);
    const returnUrl = new URL(`${BASE}${redirect}`);
    expect(returnUrl.pathname, "the sign-in link lost the ad").toBe(adUrl.pathname);
    expect(carriedBy(returnUrl.href), "the sign-in link dropped the search").toEqual(FILTERS);
    await evidence(page, "sign-in-to-apply-sv");
    await signIn.click();

    // The one door, as every other local walk signs in through it.
    await page.waitForURL("**/login?**", { timeout: 15_000 });
    await page.getByLabel(/^e-?post$|^email$/i).fill(EMAIL);
    await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();

    // It hands the person back to the ad, search and all.
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
    expect(new URL(page.url()).pathname, "signing in did not come back to the ad").toBe(
      `/jobs/${AD}`,
    );
    expect(carriedBy(page.url()), "signing in lost the search").toEqual(FILTERS);
    // Signed in: the ad now offers the application itself.
    await expect(page.getByRole("button", { name: "Ansök via CQrityjob" })).toBeVisible({
      timeout: 30_000,
    });
    await evidence(page, "signed-in-on-ad-sv");

    await (await backLink(page, "results")).click();
    await expectFilteredList(page);
  });

  test("in English the link says where it goes", async ({ page }) => {
    await inLanguage(page, "en");
    await openSearch(page, "en");
    await page.getByRole("link", { name: TITLE.en.ad, exact: true }).click();
    await page.waitForURL(`**/jobs/${AD}?from=**`, { timeout: 15_000 });
    await expect(await backLink(page, "results")).toHaveText(BACK.en.results);
    await evidence(page, "ad-with-search-en");
    await (await backLink(page, "results")).click();
    await expectFilteredList(page, "en");

    await page.goto(`${BASE}/jobs/${AD}`);
    await expect(await backLink(page, "all")).toHaveText(BACK.en.all);
  });
});

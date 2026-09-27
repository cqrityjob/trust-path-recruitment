// The saved profession, walked in the RUNNING application against a REAL
// local backend: GoTrue signs the people in, PostgREST and row-level security
// store and return their rows. No server response here is simulated.
//
//   A saves a profession in the profile  →  the Career Center shows it
//   (without a reload: the save refreshes what the page had already read)
//   →  a reload shows it again  →  signing out leaves nothing of it
//   →  B signs in, in the same tab  →  B's own profession, never A's
//   →  A signs in again  →  A's profession, still saved
//
// What the stubbed journey spec (career-center-journey.spec.ts) and the
// database evidence (scripts/career-center-persistence-local.ts) cannot prove
// between them, and this does: that the profile form, the server function,
// the database and the Career Center's account-keyed reads agree, in one
// browser tab, on a desktop and on a phone.
//
// Runs only when E2E_LOCAL_STACK=1 and both URLs are loopback: it signs
// synthetic people in and saves a profession. It expects
// scripts/fixtures/career-center-persistence-fixture.sql to have run: per
// project, A with nothing saved and B with "ordningsvakt" saved.
//
// CI: .github/workflows/career-center-persistence-evidence.yml, which also
// refuses a report in which these tests were skipped, and uploads the
// screenshots.

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
  "This spec signs people in and saves a profession; it runs against loopback only.",
);
// One walk: the second test reads back what the first one saved.
test.describe.configure({ mode: "serial" });

const PASSWORD = "LocalJourney!2026";
/** One pair per project, so each walk starts from the fixture's state. */
const PEOPLE: Record<string, { a: string; b: string }> = {
  chromium: { a: "cc-walk-a-desktop@local.test", b: "cc-walk-b-desktop@local.test" },
  "mobile-375": { a: "cc-walk-a-mobile@local.test", b: "cc-walk-b-mobile@local.test" },
};
/** What A saves in the walk, and what B has saved in the fixture. */
const A_SAVES = { slug: "vaktare", sv: "Väktare", en: "Security Officer (Väktare)" };
const B_SAVED = "ordningsvakt";

const EVIDENCE = path.resolve("test-results/career-center-persistence");

function people() {
  const pair = PEOPLE[test.info().project.name];
  if (!pair) throw new Error(`no synthetic people for project ${test.info().project.name}`);
  return pair;
}

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

async function inLanguage(page: Page, lang: "sv" | "en") {
  await page.addInitScript((value) => localStorage.setItem("cqrityjob.lang", value), lang);
}

async function evidence(page: Page, name: string) {
  mkdirSync(EVIDENCE, { recursive: true });
  const project = test.info().project.name;
  await page.screenshot({ path: path.join(EVIDENCE, `${project}-${name}.png`), fullPage: false });
}

/** The one door, filled in as a person fills it in. */
async function fillSignIn(page: Page, email: string) {
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  // No sleep: the URL leaving /login IS the signal that the session exists.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** On a phone the navigation and the account entries live in the menu. */
async function openPhoneMenu(page: Page) {
  await page.getByRole("button", { name: /^öppna menyn$|^open menu$/i }).click();
}

/** "Karriär" in the signed-in navigation -- a client-side navigation, so the
 *  page keeps everything it has already read. */
async function goToCareerCenter(page: Page) {
  if (isPhone(page)) await openPhoneMenu(page);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: /^karriär$|^career$/i })
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForURL((url) => url.pathname === "/career-center", { timeout: 15_000 });
}

/** "Min profil", from the account menu -- also client-side. */
async function goToProfile(page: Page) {
  if (isPhone(page)) {
    await openPhoneMenu(page);
    await page
      .getByRole("link", { name: /^min profil$|^my profile$/i })
      .filter({ visible: true })
      .first()
      .click();
  } else {
    await page
      .getByRole("button", { name: /^konto och inställningar$|^account and settings$/i })
      .click();
    await page.getByRole("menuitem", { name: /^min profil$|^my profile$/i }).click();
  }
  await page.waitForURL((url) => url.pathname === "/my-career/profile", { timeout: 15_000 });
}

async function signOut(page: Page) {
  if (isPhone(page)) {
    await openPhoneMenu(page);
    await page
      .getByRole("button", { name: /^logga ut$|^sign out$/i })
      .filter({ visible: true })
      .first()
      .click();
  } else {
    await page
      .getByRole("button", { name: /^konto och inställningar$|^account and settings$/i })
      .click();
    await page.getByRole("menuitem", { name: /^logga ut$|^sign out$/i }).click();
  }
  // Signed out: the session is gone from this browser, not just from view.
  await page.waitForFunction(
    () => !Object.keys(localStorage).some((key) => /^sb-.*-auth-token$/.test(key)),
    undefined,
    { timeout: 15_000 },
  );
}

/** The header's own "Logga in" -- the account switch stays in this tab. */
async function signInFromHeader(page: Page, email: string) {
  const door = page.getByRole("link", { name: /^logga in$|^sign in$/i }).filter({ visible: true });
  if ((await door.count()) === 0 && isPhone(page)) await openPhoneMenu(page);
  await door.first().click();
  await fillSignIn(page, email);
}

/** "Vilket yrke arbetar du i i dag?" -- what the Career Center shows. */
function pathFrom(page: Page) {
  return page.locator("[data-path-from]");
}

async function expectSavedProfession(page: Page, slug: string) {
  const section = pathFrom(page);
  await expect(section).toHaveAttribute("data-path-state", "ready", { timeout: 30_000 });
  await expect(section.locator("[data-path-provenance]")).toHaveAttribute(
    "data-path-provenance",
    "profile",
  );
  await expect(section.locator("[data-path-select]")).toHaveValue(slug);
}

async function expectNothingSaved(page: Page) {
  const section = pathFrom(page);
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.locator('[data-path-provenance="profile"]')).toHaveCount(0);
  await expect(section.locator("[data-path-select]")).toHaveValue("");
}

test.describe("saved profession → Career Center → reload → sign-out → another account", () => {
  test("what A saves in the profile is what the Career Center shows, and only to A", async ({
    page,
  }) => {
    const { a, b } = people();
    await inLanguage(page, "sv");

    // A, with nothing saved, opens the Career Center.
    await page.goto(`${BASE}/login?redirect=${encodeURIComponent("/career-center")}`);
    await fillSignIn(page, a);
    await page.waitForURL((url) => url.pathname === "/career-center", { timeout: 30_000 });
    await expectNothingSaved(page);

    // The profile: status, then the profession, then save.
    await goToProfile(page);
    await page.getByRole("button", { name: /^fyll i din profil$|^fill in your profile$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Arbetar inom säkerhetsbranschen" }).click();
    await dialog.locator("select").first().selectOption(A_SAVES.slug);
    await dialog.getByRole("button", { name: /^spara$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    // The profile says so.
    await expect(page.locator("#career-profile")).toContainText(A_SAVES.sv, { timeout: 30_000 });
    await evidence(page, "a-profile-saved");

    // Back to the Career Center without a reload: it had read "nothing
    // saved" before, and must now show what was saved.
    await goToCareerCenter(page);
    await expectSavedProfession(page, A_SAVES.slug);
    await evidence(page, "a-career-center-updated");

    // A reload reads it from the database, not from the page.
    await page.reload();
    await expectSavedProfession(page, A_SAVES.slug);

    // Signed out, the Career Center keeps nothing of A.
    await signOut(page);
    await expect(page).toHaveURL(/\/career-center/);
    await expectNothingSaved(page);
    await evidence(page, "signed-out");

    // B signs in, in the same tab, and sees B's own profession.
    await signInFromHeader(page, b);
    await goToCareerCenter(page);
    await expectSavedProfession(page, B_SAVED);
    await expect(pathFrom(page).locator("[data-path-select]")).not.toHaveValue(A_SAVES.slug);
    await evidence(page, "b-career-center");
  });

  test("a new sign-in reads A's profession back, in English too", async ({ page }) => {
    const { a } = people();
    await inLanguage(page, "en");

    await page.goto(`${BASE}/login?redirect=${encodeURIComponent("/career-center")}`);
    await fillSignIn(page, a);
    await page.waitForURL((url) => url.pathname === "/career-center", { timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en", { timeout: 15_000 });
    await expectSavedProfession(page, A_SAVES.slug);

    // And the profile, read afresh, says the same.
    await goToProfile(page);
    await expect(page.locator("#career-profile")).toContainText(A_SAVES.en, { timeout: 30_000 });
    await evidence(page, "a-new-sign-in-en");
  });
});

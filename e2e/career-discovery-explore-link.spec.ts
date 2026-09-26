// "Utforska nu" on the Career Discovery recommendation, in a real browser.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ─────────────────────
//
// career-discovery-explore-link:check renders the card and proves the chip
// is an anchor with the right href. It cannot prove that pressing it lands
// on the occupation's page, nor — the part that matters most for an
// anonymous candidate whose answers live only in this tab — that pressing
// Back afterwards shows the same result rather than the intro, a retake, or
// "your result is gone". Both are asserted here, for the anonymous flow and
// for a saved report, at desktop and 375px widths.
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// It is not reached. Every `/_serverFn/*` call is answered from a stub
// table; an unstubbed one fails loudly and the test asserts none happened.
// The report is a REAL snapshot — built by the same `buildSnapshot` the
// server runs, from a fixed answer set against the first-wave catalogue
// mirror — so the ranking under test is the engine's, not a hand-written
// one. The answer set was chosen because, for a security leader, it ranks
// Krisberedskapssamordnare (a published guide) first and Polis (no
// published guide) third: one card of each destination kind on one page.
//
// Run:
//   E2E_BASE_URL=http://127.0.0.1:3200 bunx playwright test \
//     e2e/career-discovery-explore-link.spec.ts --project=chromium --project=mobile-375

import { test, expect, type Page } from "@playwright/test";
import { buildSnapshot } from "../src/lib/career-discovery/v31/snapshot";
import type { Answer } from "../src/lib/career-discovery/v31/scoring";
import { FIRST_WAVE_CATALOG } from "../scripts/fixtures/first-wave-profession-catalog";
import { getPublishedProfession } from "../src/lib/career-center/publishability";
import { exploreDestinationFor } from "../src/lib/career-center/profession-links";
import {
  BASE,
  exportOf,
  HANG,
  mount,
  ok,
  takeMountBookkeeping,
} from "./support/career-home-harness";

const AT = "2026-09-01T09:00:00.000Z";
const SNAPSHOT_ID = "0f3c2a1e-7b6d-4c5e-9a8b-1234567890ab";

/* ------------------------------------------------------------------ */
/* The result under test                                               */
/* ------------------------------------------------------------------ */

/** Twenty-two Career DNA answers. Found by search, kept as a literal so the
 *  ranking this spec depends on is pinned rather than recomputed. */
const ANSWERS: readonly Answer[] = [
  { itemId: "CQ01", format: "scale", value: 4 },
  { itemId: "CQ02", format: "single_choice", optionId: "CQ02_D" },
  { itemId: "CQ03", format: "single_choice", optionId: "CQ03_C" },
  { itemId: "CQ04", format: "scale", value: 1 },
  { itemId: "CQ05", format: "scale", value: 5 },
  { itemId: "CQ06", format: "single_choice", optionId: "CQ06_A" },
  { itemId: "CQ07", format: "scale", value: 5 },
  { itemId: "CQ08", format: "scale", value: 3 },
  { itemId: "CQ09", format: "single_choice", optionId: "CQ09_C" },
  { itemId: "CQ10", format: "scale", value: 2 },
  { itemId: "CQ11", format: "scale", value: 3 },
  { itemId: "CQ12", format: "single_choice", optionId: "CQ12_B" },
  { itemId: "CQ13", format: "scale", value: 3 },
  { itemId: "CQ14", format: "scale", value: 7 },
  { itemId: "CQ15", format: "single_choice", optionId: "CQ15_B" },
  { itemId: "CQ16", format: "scale", value: 1 },
  { itemId: "CQ17", format: "single_choice", optionId: "CQ17_B" },
  { itemId: "CQ18", format: "scale", value: 1 },
  { itemId: "CQ19", format: "scale", value: 5 },
  { itemId: "CQ20", format: "single_choice", optionId: "CQ20_A" },
  { itemId: "CQ21", format: "scale", value: 3 },
  { itemId: "CQ22", format: "scale", value: 2 },
];

const snapshot = buildSnapshot({
  answers: ANSWERS,
  locale: "sv",
  completedAt: AT,
  professionCatalog: FIRST_WAVE_CATALOG,
  contextStatus: "security_leader",
  professionCalibrationVersion: "e2e-fixture",
});

const ranked = snapshot.professions?.ranked ?? [];
const TOP = ranked[0]?.match;
const POLIS = ranked.find((r) => r.match.professionId === "SP005")?.match;
const TOP_DESTINATION = TOP ? exploreDestinationFor(TOP) : null;
const TOP_GUIDE =
  TOP_DESTINATION?.kind === "career_center"
    ? getPublishedProfession(TOP_DESTINATION.slug)
    : undefined;

/** Live-CIG content for Polis, as `getProfessionDetails` returns it. The
 *  panel renders this; nothing about the occupation is invented client-side. */
const POLIS_DETAIL = {
  polis: {
    slug: "polis",
    summarySv: "Polisen upprätthåller allmän ordning och säkerhet.",
    summaryEn: "The police maintain public order and safety.",
    overviewSv:
      "Polis är en statlig myndighetsroll med befogenheter enligt polislagen. Yrket kräver genomgången polisutbildning.",
    overviewEn:
      "Police officer is a state-authority role with powers under the Police Act. The profession requires completed police training.",
    ssykCode: "3355",
    requirements: [
      {
        titleSv: "Genomgången polisutbildning",
        titleEn: "Completed police training",
        level: "formally_required",
        jurisdiction: "SE",
      },
    ],
    education: [
      { titleSv: "Polisprogrammet", titleEn: "Police programme", level: "formally_required" },
    ],
    certifications: [],
    pathway: [],
  },
};

/* ------------------------------------------------------------------ */
/* Anonymous-flow harness                                              */
/* ------------------------------------------------------------------ */

type Calls = { unmatched: string[]; counts: Record<string, number> };

async function stubAnonymous(page: Page): Promise<Calls> {
  const calls: Calls = { unmatched: [], counts: {} };
  const replies: Record<string, unknown> = {
    getV31Availability: { available: true },
    getV31TesterStatus: { allowed: true },
    trackV31FunnelEvent: { recorded: false },
    previewPublicV31Run: { snapshot, completedAt: AT },
    getProfessionDetails: POLIS_DETAIL,
  };
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    calls.counts[name] = (calls.counts[name] ?? 0) + 1;
    if (!(name in replies)) {
      calls.unmatched.push(name);
      return route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: `UNSTUBBED_SERVER_FN:${name}`,
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: replies[name], error: null, context: {} }),
    });
  });
  // No Supabase host is ever reached: the anonymous flow has nothing to read.
  await page.route(/^https?:\/\/[^/]+\/(?:auth|rest)\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  return calls;
}

/** Answer every question by taking the first offered option — the same
 *  walk e2e/career-discovery-conversion.spec.ts takes. */
async function completeAssessment(page: Page) {
  const start = page.getByRole("button", { name: /Börja vägledningen|Start the assessment/ });
  await expect(start).toBeVisible({ timeout: 60_000 });
  await start.click();
  for (let i = 0; i < 40; i += 1) {
    if ((await page.getByTestId("cd-pattern-name").count()) > 0) return;
    const options = page.locator("label:has(input[type=radio])");
    if ((await options.count()) === 0) break;
    await options.first().click();
    await page.waitForTimeout(80);
  }
}

/* ------------------------------------------------------------------ */
/* Shared assertions                                                   */
/* ------------------------------------------------------------------ */

async function expectTarget44(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} is rendered`).not.toBeNull();
  expect(box!.height, `${selector} is at least 44px tall`).toBeGreaterThanOrEqual(44);
}

/** The surfaces this change owns fit the viewport: every recommendation
 *  card, every explore control and the open panel end inside the page's
 *  client width. Scoped to these elements rather than to
 *  documentElement.scrollWidth, because the saved-report route's page chrome
 *  already measures 376px on a 375px phone with no element extending past
 *  the edge — a pre-existing rounding of the header, not this surface. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflowing = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const selectors = [
      "[data-recommendation-card]",
      "[data-explore-link]",
      "[data-explore-panel]:not([hidden])",
      "[data-explore-panel]:not([hidden]) *",
    ];
    return Array.from(document.querySelectorAll(selectors.join(",")))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.right > cw + 0.5 || r.left < -0.5))
      .map(({ el, r }) => `${el.tagName} right=${r.right.toFixed(1)} of ${cw}`);
  });
  expect(overflowing, "no recommendation surface extends past the viewport").toEqual([]);
}

/** Click the top card's "Utforska nu", land on the guide, press Back. */
async function exploreTopAndComeBack(page: Page, resultPath: RegExp) {
  const link = page.locator(`[data-recommendation-card="${TOP.professionId}"] [data-explore-link]`);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute(
    "href",
    TOP_DESTINATION!.kind === "career_center" ? TOP_DESTINATION!.href : "",
  );
  await expect(link).toHaveAttribute("aria-label", new RegExp(TOP.titleSv));
  await expect(link).toHaveText(/Utforska nu/);
  await expectTarget44(
    page,
    `[data-recommendation-card="${TOP.professionId}"] [data-explore-link]`,
  );

  const patternBefore = await page.getByTestId("cd-pattern-name").innerText();

  await link.click();
  await page.waitForURL(
    new RegExp(
      `/career-center/${TOP_DESTINATION!.kind === "career_center" ? TOP_DESTINATION!.slug : ""}$`,
    ),
    {
      timeout: 30_000,
    },
  );
  // The occupation's own page: its title, not the "not published yet" state.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TOP_GUIDE!.titleSv, {
    timeout: 30_000,
  });
  await expect(page.getByText(/Den här yrkesguiden är inte publicerad ännu/)).toHaveCount(0);

  await page.goBack();
  await page.waitForURL(resultPath, { timeout: 30_000 });
  // The result is intact: same pattern, same recommendation, no intro and
  // no "answer again".
  await expect(page.getByTestId("cd-pattern-name")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("cd-pattern-name")).toHaveText(patternBefore);
  await expect(page.locator(`[data-recommendation-card="${TOP.professionId}"]`)).toContainText(
    TOP.titleSv,
  );
  await expect(page.locator(`[data-recommendation-card="SP005"]`)).toContainText("Polis");
  await expect(
    page.getByRole("button", { name: /Börja vägledningen|Start the assessment/ }),
  ).toHaveCount(0);
}

/** Polis has no published guide: its chip is a real button opening live
 *  CIG content in the card. */
async function openPolisPanel(page: Page) {
  const chip = page.locator('[data-recommendation-card="SP005"] [data-explore-link="SP005"]');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(chip).toHaveAttribute("aria-label", /Polis/);
  await expect(chip).toHaveText(/Utforska nu/);
  await expectTarget44(page, '[data-recommendation-card="SP005"] [data-explore-link="SP005"]');

  const panel = page.locator('[data-explore-panel="SP005"]');
  await expect(panel).toBeHidden();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(POLIS_DETAIL.polis.overviewSv, { timeout: 30_000 });
  await expect(panel).toContainText("Vad som krävs");
  await expect(panel).toContainText(POLIS_DETAIL.polis.requirements[0].titleSv);
  await expect(panel).toContainText(POLIS_DETAIL.polis.education[0].titleSv);

  // Keyboard: the chip is focusable and Enter toggles it closed again.
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test.describe("Career Discovery — 'Utforska nu' on the recommendation", () => {
  test.beforeAll(() => {
    // The premise, stated: if the engine's ranking for this answer set
    // changes, this fails here and says so, rather than in a click.
    expect(ranked.map((r) => r.match.professionId)).toEqual(["SP012", "SP007", "SP005"]);
    expect(TOP_DESTINATION?.kind).toBe("career_center");
    expect(TOP_GUIDE, "the top recommendation has a published guide").toBeDefined();
    expect(POLIS, "Polis is on the page").toBeDefined();
    expect(exploreDestinationFor(POLIS!).kind).toBe("inline_details");
  });

  test.afterEach(() => {
    const b = takeMountBookkeeping();
    if (b)
      expect(b.unmatched, "every server function the saved report needed was stubbed").toEqual([]);
  });

  test("anonymous result: the link works and Back keeps the result", async ({ page }) => {
    const calls = await stubAnonymous(page);

    await page.goto(`${BASE}/security-career-assessment`, { waitUntil: "domcontentloaded" });
    await completeAssessment(page);
    await expect(page.getByTestId("cd-pattern-name")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: /Din rekommenderade yrkesinriktning/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await exploreTopAndComeBack(page, /\/security-career-assessment\/?$/);

    // The finished run is still in this tab: nothing was discarded by the
    // round trip, and the report was not silently rebuilt from scratch.
    const buffer = await page.evaluate(() =>
      window.sessionStorage.getItem("cqj:discovery:v31:public-buffer:v1"),
    );
    expect(buffer, "the anonymous run is still buffered").not.toBeNull();
    expect(JSON.parse(buffer as string).completedAt, "and still marked complete").toBeTruthy();
    expect(
      calls.counts.previewPublicV31Run ?? 0,
      "the report was built once and served from cache after Back",
    ).toBe(1);

    await openPolisPanel(page);
    await expectNoHorizontalOverflow(page);
    expect(calls.unmatched, "every server function the flow needed was stubbed").toEqual([]);
  });

  test("saved report: the link works and Back keeps the report", async ({ page }) => {
    await mount(page, "new_user", {
      path: `/security-career-assessment/report/${SNAPSHOT_ID}`,
      ready: '[data-testid="cd-pattern-name"]',
      overrides: {
        getStoredDiscoveryReport: ok({
          status: "v3.1",
          snapshotId: SNAPSHOT_ID,
          sessionId: "sess-1",
          generatedAt: AT,
          versions: { definition: "3.1.0", content: "3.1.0", scoring: "3.1.0", taxonomy: "3.1.0" },
          snapshot,
        }),
        getMyCareerJourney: HANG,
        getProfessionDetails: ok(POLIS_DETAIL),
      },
    });
    await expect(
      page.getByRole("heading", { name: /Din rekommenderade yrkesinriktning/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await exploreTopAndComeBack(
      page,
      new RegExp(`/security-career-assessment/report/${SNAPSHOT_ID}`),
    );
    await openPolisPanel(page);
    await expectNoHorizontalOverflow(page);
  });
});

// The employer portal as one journey, in a real browser, on the stubbed
// backend: overview → recruitments → applications → tests → interviews →
// reports, in Swedish and English, on a desktop and a 375px phone.
//
// Two jobs in one file:
//
//   1. EVIDENCE. Every page is photographed as rendered, so a reviewer can look
//      at the state the assertions ran against. Run with UX_EVIDENCE_MODE=before
//      on the base commit and with the default on the head, with the same
//      fixture, and the two sets of images are the before/after pair.
//   2. BEHAVIOUR (head only). The flow strip is on every area page and marks
//      the current one; the overview's rows link to exactly the rows they
//      count; a requirement status is text and a symbol, never colour alone;
//      the menu says what each recruitment area is for; nothing overflows a
//      phone sideways.
//
// Nothing reaches production: e2e/support/public-entry-harness.ts refuses every
// request to a Supabase host and every unstubbed server function.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test \
//         e2e/employer-portal-ux-evidence.spec.ts --project=chromium --project=mobile-375

import { test, expect, type Page } from "@playwright/test";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  assertNoRefusals,
  BASE,
  horizontalOverflow,
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  shot,
} from "./support/public-entry-harness";
import { SLUG, table } from "./support/employer-portal-fixture";

const SV = dictionaries.sv as Record<string, string>;
const EN = dictionaries.en as Record<string, string>;
const BEFORE = process.env.UX_EVIDENCE_MODE === "before";

type Area = {
  key: "overview" | "jobs" | "applications" | "assessments" | "interviews" | "reports";
  path: string;
  /** A locator that proves the page's own content rendered, not the shell. */
  ready: string;
  flow: string;
};

const AREAS: Area[] = [
  { key: "overview", path: "", ready: "#employer-actions", flow: "overview" },
  { key: "jobs", path: "jobs", ready: "table", flow: "requirements" },
  {
    key: "applications",
    path: "applications",
    ready: "[data-testid='candidate-table']",
    flow: "applications",
  },
  { key: "assessments", path: "assessments", ready: "h1", flow: "tests" },
  {
    key: "interviews",
    path: "interview-intelligence",
    ready: "#ii-cases-heading",
    flow: "interviews",
  },
  { key: "reports", path: "reports", ready: "[data-testid='reports']", flow: "report" },
];

/** The boundary, a planted session, and the refusals to assert empty. The
 *  session key is observed on the homepage (the harness answers that load's
 *  own two public reads); no employer page is opened before the session is
 *  planted, so nothing is asked by a signed-out shell. */
async function signedIn(page: Page) {
  const refusals = await installBoundary(page, table);
  const key = await observeSupabaseStorageKey(page);
  await plantSession(page, key, { display_name: "Rita Rekryterare" });
  return refusals;
}

/** The language, set where the app reads it (localStorage) BEFORE the first
 *  employer page loads. Not the harness's setLang: that reloads the page the
 *  session was observed on, the homepage, which signed in is the candidate's
 *  home and asks for the candidate's reads -- none of which this suite
 *  answers, by design. */
async function primeLang(page: Page, lang: "sv" | "en") {
  await page.evaluate((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
}

async function open(page: Page, area: Area) {
  await page.goto(`${BASE}/employer/${SLUG}/${area.path}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(area.ready).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

test.describe("employer portal — one journey", () => {
  for (const lang of ["sv", "en"] as const) {
    test(`every area renders and is photographed (${lang})`, async ({ page }, info) => {
      test.setTimeout(240_000);
      // A 1440px desktop for the desktop project; the phone projects keep
      // their device viewport.
      if (info.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 900 });
      const refusals = await signedIn(page);
      const width = page.viewportSize()?.width ?? 0;
      await primeLang(page, lang);
      for (const area of AREAS) {
        await open(page, area);
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
        // The shell names the organisation on every page: in the sidebar on
        // a desktop, in the top bar on a phone (where the sidebar is a closed
        // drawer, so the first match in the DOM is hidden by design).
        await expect(page.getByText("Exempelvakt AB").filter({ visible: true }).first()).toBeVisible();
        expect(
          await horizontalOverflow(page),
          `${area.key} (${lang}, ${width}px) scrolls sideways`,
        ).toBe(0);
        await shot(
          page,
          `${BEFORE ? "before" : "after"}-${area.key}-${lang}-${width}`,
          `${area.key} in ${lang} at ${width}px (${info.project.name})`,
        );
      }
      assertNoRefusals(refusals);
    });
  }

  test.describe("the journey has one thread (head only)", () => {
    test.skip(BEFORE, "behaviour assertions describe the head, not the base");

    test("the flow strip is on every area page and marks the current step", async ({ page }) => {
      test.setTimeout(240_000);
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      for (const area of AREAS) {
        await open(page, area);
        const strip = page.locator("[data-testid='recruitment-flow']").first();
        await expect(strip, `${area.key} has no flow strip`).toBeVisible();
        await expect(strip).toHaveAttribute("data-current", area.flow);
        // Seven stations, always, in the same order (the current one is a
        // plain span with a visually hidden "you are here"; the rest are links).
        const labels = await strip.locator("li").allInnerTexts();
        const expected = [
          SV["rec.flow.requirements"],
          SV["rec.flow.applications"],
          SV["rec.flow.review"],
          SV["rec.flow.tests"],
          SV["rec.flow.interviews"],
          SV["rec.flow.report"],
          SV["rec.flow.decision"],
        ];
        expect(labels).toHaveLength(7);
        expected.forEach((label, i) => expect(labels[i]).toContain(label));
        // It says it is the order of work, not a checklist.
        await expect(strip.getByText(SV["rec.flow.lede"]!)).toBeVisible();
        // "Decision & close" opens the recruitments where decisions are made.
        await expect(strip.locator("li a").last()).toHaveAttribute("href", /phase=active/);
        if (area.flow === "overview") {
          await expect(strip.locator("li a")).toHaveCount(7);
          await expect(strip.locator("[aria-current='step']")).toHaveCount(0);
        } else {
          await expect(strip.locator("li a")).toHaveCount(6);
          await expect(strip.locator("[aria-current='step']")).toHaveText(
            new RegExp(SV[`rec.flow.${area.flow}`]!),
          );
        }
      }
      assertNoRefusals(refusals);
    });

    test("the overview explains its numbers and each row opens exactly what it counted", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[0]!);

      // The summary numbers say what they cover.
      for (const key of [
        "rec.overview.stat.active.hint",
        "rec.overview.stat.new.hint",
        "rec.overview.stat.interviews.hint",
      ]) {
        await expect(page.getByText(SV[key]!)).toBeVisible();
      }
      // The review block: a heading, an explanation and a disclosure.
      const counts = page.locator("[data-testid='recruiter-counts']");
      await expect(counts.getByRole("heading")).toHaveText(SV["rec.overview.counts.title"]!);
      await expect(counts.getByText(SV["rec.overview.counts.intro"]!)).toBeVisible();
      const details = counts.locator("[data-testid='counts-explanation']");
      await details.locator("summary").click();
      await expect(details.getByText(SV["rec.counts.explain.remaining"]!)).toBeVisible();
      // Requirement status: text AND a symbol, in each of the four buttons.
      for (const status of ["green", "yellow", "gray", "not_established"]) {
        const btn = counts.locator(`[data-testid='count-${status}']`);
        await expect(btn.locator("svg")).toHaveCount(1);
        await expect(btn).toContainText(
          {
            green: "Skallkrav uppfyllda",
            yellow: "Skallkrav inte uppfyllda",
            gray: "Behöver klarläggas",
            not_established: "Skallkrav inte fastställda",
          }[status]!,
        );
      }
      // The two populations differ, and both are on the page: 2 new, 5 received.
      await expect(page.locator("dl").first()).toContainText(SV["rec.overview.stat.new"]!);
      await expect(counts.locator("[data-testid='count-received'] strong")).toHaveText("5");

      // Each to-do row links to its own rows.
      const todo = page.locator("section[aria-labelledby='employer-actions']");
      const href = async (text: RegExp) =>
        (await todo.getByRole("link", { name: text }).getAttribute("href")) ?? "";
      expect(await href(/nya ansökningar/)).toContain("status=submitted");
      expect(await href(/väntar på nästa steg/)).toContain("stage=review");
      expect(await href(/intervjusteget/)).toContain("stage=interview");
      expect(await href(/utkast till annons/)).toContain("phase=draft");
      expect(await href(/redo att avslutas/)).toContain("phase=ready");
      expect(await href(/intervjuplan/)).toContain("stage=awaitingPlanApproval");
      // The interview card's single-stage numbers are links; the combined one is not.
      await expect(page.locator("a[href*='stage=readyToInterview']").first()).toBeVisible();
      await expect(page.locator("a[href*='stage=inEvidenceReview']").first()).toBeVisible();

      assertNoRefusals(refusals);
    });

    test("the menu says what each recruitment area is for, and Rapporter keeps Intervjuer lit", async ({
      page,
    }) => {
      const width = page.viewportSize()?.width ?? 0;
      test.skip(width < 768, "the sidebar is a drawer on a phone");
      const refusals = await signedIn(page);
      await primeLang(page, "en");
      await open(page, AREAS[0]!);
      const nav = page.locator("aside");
      for (const key of ["jobs", "applications", "assessments", "interviewIntelligence"]) {
        await expect(nav.getByText(EN[`employer.nav.${key}.desc`]!)).toBeVisible();
      }
      await open(page, AREAS[5]!);
      const interviews = nav.getByRole("link", { name: EN["employer.nav.interviewIntelligence"]! });
      await expect(interviews).toHaveClass(/text-accent/);
      assertNoRefusals(refusals);
    });

    test("the recruitment list can show exactly the recruitments ready to complete", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await page.goto(`${BASE}/employer/${SLUG}/jobs?phase=ready`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.locator("tbody")).toContainText("Skyddsvakt, Västerås");
      await expect(page.locator("select").first()).toContainText(SV["rec.list.phase.ready"]!);
      assertNoRefusals(refusals);
    });
  });
});

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
//      the current one -- including the two stations that share a route with
//      another and are told apart by the URL; the overview's rows link to
//      exactly the rows they count; the review queue is the open, unreviewed
//      applications and stands apart from the historical coverage, whose
//      numbers obey the server's own arithmetic; a requirement status is text
//      and a symbol, never colour alone; the menu says what each recruitment
//      area is for, and on a phone it opens, marks the page, navigates and
//      closes with the keyboard; nothing overflows a phone sideways.
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
      if (info.project.name === "chromium")
        await page.setViewportSize({ width: 1440, height: 900 });
      const refusals = await signedIn(page);
      const width = page.viewportSize()?.width ?? 0;
      await primeLang(page, lang);
      for (const area of AREAS) {
        await open(page, area);
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
        // The shell names the organisation on every page: in the sidebar on
        // a desktop, in the top bar on a phone (where the sidebar is a closed
        // drawer, so the first match in the DOM is hidden by design).
        await expect(
          page.getByText("Exempelvakt AB").filter({ visible: true }).first(),
        ).toBeVisible();
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
        // "Decision & close" opens the recruitments where decisions are made;
        // "Kravgranskning" opens the open, unreviewed applications (not the
        // historical remainder, which would be stage=received).
        await expect(strip.locator("li a").last()).toHaveAttribute("href", /phase=active/);
        const review = strip.getByRole("link", { name: SV["rec.flow.review"]! });
        if (area.flow !== "review") {
          await expect(review).toHaveAttribute("href", /review=remaining/);
          await expect(review).not.toHaveAttribute("href", /stage=received/);
        }
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

    test("the two shared stations light up for the link that was clicked", async ({ page }) => {
      test.setTimeout(120_000);
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[0]!);
      const strip = () => page.locator("[data-testid='recruitment-flow']").first();

      // Overview → Kravgranskning: the application list, filtered to the open
      // unreviewed applications, marks "review" (not "applications").
      await strip().getByRole("link", { name: SV["rec.flow.review"]! }).click();
      await expect(page).toHaveURL(/\/applications\?review=remaining$/);
      await expect(page.locator("[data-testid='candidate-table']").first()).toBeVisible();
      await expect(strip()).toHaveAttribute("data-current", "review");
      await expect(strip().locator("[aria-current='step']")).toHaveText(
        new RegExp(SV["rec.flow.review"]!),
      );
      // Exactly the three open, unreviewed applications -- never the archived one.
      await expect(page.locator("[data-testid='filtered-review-counts']")).toContainText(
        "Vald lista: 3 ansökningar · 0 granskade · 3 återstående.",
      );
      await expect(page.locator("tbody tr")).toHaveCount(3);
      await expect(page.locator("tbody")).not.toContainText("Erik Efterhand");

      // Kravgranskning → Ansökningar & underlag: the same list without the
      // filter marks "applications".
      await strip().getByRole("link", { name: SV["rec.flow.applications"]! }).click();
      await expect(page).toHaveURL(/\/applications$/);
      await expect(strip()).toHaveAttribute("data-current", "applications");

      // → Beslut & avslut: the recruitment list under the active filter marks
      // "decision" and says where outcomes and closing happen; the same list
      // unfiltered marks "requirements".
      await strip().getByRole("link", { name: SV["rec.flow.decision"]! }).click();
      await expect(page).toHaveURL(/\/jobs\?phase=active$/);
      await expect(page.locator("table").first()).toBeVisible();
      await expect(strip()).toHaveAttribute("data-current", "decision");
      await expect(page.locator("[data-testid='decision-station-context']")).toHaveText(
        SV["rec.flow.decisionContext"]!,
      );
      await strip().getByRole("link", { name: SV["rec.flow.requirements"]! }).click();
      await expect(page).toHaveURL(/\/jobs$/);
      await expect(strip()).toHaveAttribute("data-current", "requirements");
      await expect(page.locator("[data-testid='decision-station-context']")).toHaveCount(0);
      // The lede says what the marker means.
      await expect(strip().getByText(/inte hur långt en kandidat/)).toBeVisible();
      assertNoRefusals(refusals);
    });

    test("the review queue is the work that can be done; the historical numbers add up", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[0]!);
      const counts = page.locator("[data-testid='recruiter-counts']");
      const n = async (testId: string) =>
        Number(await counts.locator(`[data-testid='${testId}'] strong`).innerText());
      // The queue first, apart from the historical block, with its own heading.
      const queue = counts.locator("[data-testid='review-queue']");
      await expect(queue).toBeVisible();
      await expect(queue.getByText(SV["rec.counts.queue.label"]!)).toBeVisible();
      await expect(queue.getByText(SV["rec.counts.queue.hint"]!)).toBeVisible();
      await expect(counts.getByText(SV["rec.counts.history.heading"]!)).toBeVisible();
      const queued = Number(await queue.locator("[data-testid='review-queue-count']").innerText());
      // Historical coverage: the status groups partition "received", and
      // reviewed + remaining = received. The queue is never larger than the
      // historical remainder and is drawn from the open applications only.
      const received = await n("count-received");
      const reviewed = await n("count-reviewed");
      const remaining = await n("count-remaining");
      const groups =
        (await n("count-green")) +
        (await n("count-yellow")) +
        (await n("count-gray")) +
        (await n("count-not_established"));
      expect(groups).toBe(received);
      expect(reviewed + remaining).toBe(received);
      expect(queued).toBeLessThanOrEqual(remaining);
      expect({ received, reviewed, remaining, queued }).toEqual({
        received: 5,
        reviewed: 2,
        remaining: 3,
        queued: 3,
      });
      // The "selected list" line describes the list the block asked for: all received.
      await expect(counts.locator("[data-testid='filtered-review-counts']")).toHaveText(
        "Vald lista: 5 ansökningar · 2 granskade · 3 återstående.",
      );
      // Its button opens exactly that queue, and the strip marks the review station.
      await queue.locator("[data-testid='review-queue-open']").click();
      await expect(page).toHaveURL(/\/applications\?review=remaining$/);
      await expect(page.locator("tbody tr")).toHaveCount(queued);
      await expect(page.locator("[data-testid='recruitment-flow']").first()).toHaveAttribute(
        "data-current",
        "review",
      );
      // The historical "Återstående" opens the wider population (received), where
      // the archived application is listed too when it is still unreviewed --
      // here it is reviewed, so the lists coincide but the scope differs.
      await page.goBack();
      await counts.locator("[data-testid='count-remaining']").click();
      await expect(page).toHaveURL(/stage=received/);
      await expect(page).toHaveURL(/review=remaining/);
      assertNoRefusals(refusals);
    });

    test("on a phone the menu opens, marks the page, navigates, and closes with the keyboard", async ({
      page,
    }) => {
      const width = page.viewportSize()?.width ?? 0;
      test.skip(width >= 768, "the sidebar is a drawer only on a phone");
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[0]!);
      const trigger = page.getByRole("button", { name: SV["employer.nav.openMenu"]! });
      await expect(trigger).toBeVisible();
      // Closed: no drawer, the sidebar's links are not reachable.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await trigger.click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      // Focus is inside the drawer, so the keyboard user is where the menu is.
      expect(
        await page.evaluate(() => Boolean(document.activeElement?.closest("[role='dialog']"))),
      ).toBe(true);
      // The current page is marked beyond colour.
      const active = drawer.locator("nav a[data-active='true']");
      await expect(active).toHaveCount(1);
      await expect(active).toContainText(SV["employer.nav.overview"]!);
      await expect(active.locator(".sr-only")).toHaveText(`(${SV["rec.flow.current"]!})`);
      // Choosing a page closes the drawer and lands on that page.
      await drawer
        .getByRole("link", { name: new RegExp(SV["employer.nav.applications"]!) })
        .click();
      await expect(page).toHaveURL(/\/applications$/);
      await expect(page.locator("[data-testid='candidate-table']").first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // Open again: the marker moved; Escape closes and returns focus to the button.
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").locator("nav a[data-active='true']")).toContainText(
        SV["employer.nav.applications"]!,
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await horizontalOverflow(page)).toBe(0);
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

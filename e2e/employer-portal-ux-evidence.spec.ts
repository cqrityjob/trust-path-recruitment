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
  overflowingElements,
  observeSupabaseStorageKey,
  plantSession,
  shot,
} from "./support/public-entry-harness";
import {
  APP_CLOSED,
  APP_REVIEW,
  JOB_UPPSALA,
  SLUG,
  table,
} from "./support/employer-portal-fixture";

const SV = dictionaries.sv as Record<string, string>;
const EN = dictionaries.en as Record<string, string>;
const BEFORE = process.env.UX_EVIDENCE_MODE === "before";

type Area = {
  key:
    | "overview"
    | "jobs"
    | "applications"
    | "assessments"
    | "interviews"
    | "reports"
    | "requirements"
    | "application"
    | "closed";
  path: string;
  /** The base commit (main c2be0b39) scrolls sideways on this page at 375px;
   *  the head is asserted, the base only recorded. */
  overflowOnBase?: boolean;
  /** A locator that proves the page's own content rendered, not the shell. */
  ready: string;
  /** The flow strip's station, or null on a page inside one recruitment,
   *  which has the recruitment's own step nav instead of the strip. */
  flow: string | null;
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
  // One recruitment's Kravprofil step: the requirement-profile form.
  {
    key: "requirements",
    path: `jobs/${JOB_UPPSALA}?step=requirements`,
    ready: "[data-testid='requirement-profile']",
    flow: null,
  },
  // One open application: the requirement summary in the header, assembled
  // from the candidate's own answer, with nothing ticked for them.
  // The ready anchors are the decision section, which exists on the base
  // commit too: the pair photographs the same page before and after.
  {
    key: "application",
    path: `applications/${APP_REVIEW}`,
    ready: "#candidate-decision",
    flow: null,
  },
  // One closed application: "ej aktuell", told, archived -- the closed view.
  {
    key: "closed",
    path: `applications/${APP_CLOSED}`,
    ready: "#candidate-decision",
    flow: null,
    overflowOnBase: true,
  },
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

/** The historical statistics are folded by default (the queue and the list
 *  are the work); a number inside is clicked or read after opening the fold. */
async function openStatistics(page: Page) {
  const fold = page.locator("[data-testid='counts-history']");
  if (
    (await fold.count()) > 0 &&
    !(await fold.first().evaluate((d) => (d as HTMLDetailsElement).open))
  )
    await fold.first().locator(":scope > summary").click();
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
        const overflow = await horizontalOverflow(page);
        if (overflow !== 0) {
          // Which element, not only how many pixels.
          const culprits = await overflowingElements(page);
          // The base commit is photographed as it is; its own sideways scroll
          // on a page this pass changed is recorded in the trace, not asserted
          // -- the head asserts it.
          if (!(BEFORE && area.overflowOnBase)) {
            expect(
              overflow,
              `${area.key} (${lang}, ${width}px) scrolls sideways: ${culprits.join(" | ")}`,
            ).toBe(0);
          } else {
            console.warn(
              `base: ${area.key} (${lang}, ${width}px) scrolls ${overflow}px: ${culprits.join(" | ")}`,
            );
          }
        }
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

    test("the application list is a working list: Aktiva first, sub-steps, the rest behind a fold, a next step per row", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[2]!);
      const views = page.locator("[data-testid='list-views']");
      await expect(views.locator("button")).toHaveText([
        /^Aktiva/,
        /^Avslutade/,
        /^Arkiv/,
        /^Alla/,
      ]);
      await expect(views.locator("[data-testid='view-open']")).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Aktiva: the open applications only (four of the five received).
      await expect(page.locator("tbody tr")).toHaveCount(4);
      await expect(page.locator("[data-testid='list-substeps'] button")).toHaveCount(5);
      await expect(page.locator("[data-testid='substep-all']")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // The everyday filters are in the open; the rest is folded, closed.
      await expect(page.locator("[data-testid='owner-filter']")).toBeVisible();
      await expect(page.locator("[data-testid='recruitment-filter']")).toBeVisible();
      const fold = page.locator("[data-testid='more-filters']");
      await expect(fold).not.toHaveAttribute("open", "");
      await expect(page.locator("[data-testid='requirement-filter']")).toBeHidden();
      // Every row says what to do next, from the shared projection: Ali (new,
      // gray, unreviewed) → clarify; Birgitta (reviewing, green, reviewed) →
      // prepare the interview; Kim (interview) → interview; Dana (no
      // profile status) → the profile.
      const kinds = await page
        .locator("tbody tr [data-testid='next-step']")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
      expect(kinds.sort()).toEqual(["clarify", "interview", "prepareInterview", "profile"]);
      // "Technical analysis: not used" is said once, not per row.
      await expect(page.getByText(SV["rec.table.analysisNote"]!)).toHaveCount(1);
      // The statistics come after the list and are folded.
      const stats = page.locator("[data-testid='counts-history']");
      await expect(stats).toHaveCount(1);
      await expect(stats).not.toHaveAttribute("open", "");
      // Avslutade: the decided, not archived -- none here (Erik is archived).
      await views.locator("[data-testid='view-decided']").click();
      await expect(page).toHaveURL(/stage=decided/);
      await expect(page.locator("[data-testid='candidate-empty']")).toBeVisible();
      // Arkiv: Erik.
      await views.locator("[data-testid='view-archived']").click();
      await expect(page).toHaveURL(/stage=archived/);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.locator("tbody tr").first()).toContainText("Erik Efterhand");
      // Back to Aktiva, then the clarify sub-step: the server's open+gray list.
      await views.locator("[data-testid='view-open']").click();
      await expect(page).not.toHaveURL(/stage=/);
      await page.locator("[data-testid='substep-clarify']").click();
      await expect(page).toHaveURL(/requirement=gray/);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.locator("tbody tr").first()).toContainText("Ali Ansökande");
      // A filter from behind the fold, arriving by URL, opens the fold.
      await open(page, { ...AREAS[2]!, path: "applications?review=stale" });
      await expect(fold).toHaveAttribute("open", "");
      assertNoRefusals(refusals);
    });

    test("the application header counts human-confirmed mandatory requirements, and a blank answer ticks nothing", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[7]!);
      const summary = page.locator("[data-testid='requirement-summary']");
      await expect(summary).toBeVisible();
      await expect(summary).toHaveAttribute("data-status", "gray");
      await expect(summary).toHaveAttribute("data-review", "pending");
      await expect(summary.locator("[data-testid='requirement-summary-count']")).toHaveText(
        "0 av 1 skallkrav bekräftade av en person",
      );
      await expect(summary.locator("[data-testid='requirement-summary-preliminary']")).toHaveCount(
        0,
      );
      await expect(summary.locator("[data-testid='requirement-summary-gaps']")).toContainText(
        /Oklart eller otillräckligt underlag:\s*Godkänd väktarutbildning/,
      );
      // Colour + text + symbol, from the server's status.
      const badge = summary.locator("[data-testid='requirement-status']");
      await expect(badge).toContainText("Behöver klarläggas");
      await expect(badge.locator("svg")).toHaveCount(1);
      // Every status opens to its basis: source, reviewer, version.
      const details = summary.locator("[data-testid='requirement-summary-details']");
      await details.locator("summary").click();
      const rows = details.locator("[data-testid='requirement-summary-criterion']");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toHaveAttribute("data-human", "false");
      await expect(rows.nth(0)).toContainText("Inget underlag valt");
      await expect(rows.nth(0)).toContainText("Kravprofil v1");
      await expect(rows.nth(1)).toContainText("Merit – påverkar inte kravstatusen");
      // The next actions, and the supplement request carries the reviewer's
      // own neutral question into a DRAFT, which is not sent.
      const actions = summary.locator("[data-testid='requirement-summary-actions']");
      await expect(actions.locator("button")).toHaveText([
        "Bekräfta granskning",
        "Begär komplettering",
        "Förbered intervju",
        "Markera som under granskning",
        "Ej aktuell",
      ]);
      await actions.locator("[data-testid='summary-action-supplement']").click();
      const composer = page.locator("#candidate-communication");
      await expect(composer.locator("textarea").first()).toHaveValue(
        /Vilket år fick du ditt utbildningsbevis/,
      );
      await expect(composer.getByRole("button", { name: "Granska och skicka" })).toBeVisible();
      assertNoRefusals(refusals);
    });

    test("a closed application: the record stays, the notice state is a separate fact, no actions", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[8]!);
      const summary = page.locator("[data-testid='requirement-summary']");
      await expect(summary).toBeVisible();
      await expect(summary).toHaveAttribute("data-status", "gray");
      await expect(summary.locator("[data-testid='requirement-summary-count']")).toHaveText(
        "1 av 1 skallkrav bekräftade av en person",
      );
      await expect(summary.locator("[data-testid='requirement-summary-actions']")).toHaveCount(0);
      const closed = page.locator("[data-testid='decision-closed-view']");
      await expect(closed).toContainText(SV["rec.decision.closedView.rejected"]!);
      await expect(closed).toContainText(SV["rec.decision.reopenNote"]!);
      const notice = page.locator("[data-testid='candidate-notice-state']");
      await expect(notice).toHaveAttribute("data-state", "delivered");
      await expect(notice).not.toContainText(/\bSkickat\b/);
      await expect(page.locator("[data-testid='archived-state']")).toBeVisible();
      assertNoRefusals(refusals);
    });

    test("the flow strip is on every area page and marks the current step", async ({ page }) => {
      test.setTimeout(240_000);
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      for (const area of AREAS) {
        if (!area.flow) continue;
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
      // The historical block is folded until a reader opens it: the queue is
      // the work, the statistics are the explanation.
      const queue = counts.locator("[data-testid='review-queue']");
      await expect(queue).toBeVisible();
      await expect(counts.locator("[data-testid='counts-history']")).not.toHaveAttribute(
        "open",
        "",
      );
      await expect(counts.locator("[data-testid='count-received']")).toBeHidden();
      await openStatistics(page);
      await expect(counts.locator("[data-testid='count-received']")).toBeVisible();
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
      await openStatistics(page);
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

    test("the requirement profile reads krav → underlag → kontroll → fastställ, ids behind details", async ({
      page,
    }) => {
      const refusals = await signedIn(page);
      await primeLang(page, "sv");
      await open(page, AREAS[6]!);
      const form = page.locator("[data-testid='requirement-profile']");
      await expect(form.getByText("Fastställd version 1")).toBeVisible();
      // Per requirement, the three steps in order; then the fourth once.
      const headings = await form.locator("h4").allInnerTexts();
      expect(headings.map((h) => h.replace(/^\d\s*/, "").trim())).toEqual([
        "Krav",
        "Godtagbart underlag",
        "Kontrollinstruktion",
        "Krav",
        "Godtagbart underlag",
        "Kontrollinstruktion",
        "Fastställ",
      ]);
      // The rule's help text follows the chosen rule.
      await expect(form.getByText(/giltigt på referensdatumet nedan/).first()).toBeVisible();
      await expect(
        form.getByText(/En person bekräftar kravet enligt instruktionen/).first(),
      ).toBeVisible();
      // Identifiers are behind closed details: not visible until opened.
      const details = form.locator("details");
      await expect(details).toHaveCount(3);
      await expect(form.getByText(/Befintligt krav-ID/)).toHaveCount(2);
      await expect(form.getByText(/Befintligt krav-ID/).first()).toBeHidden();
      await details.first().locator("summary").click();
      await expect(form.getByText(/Befintligt krav-ID/).first()).toBeVisible();
      // The confirmation explains what it does, and stays gated by the acknowledgement.
      await expect(form.getByText(/skapar version 2 av kravprofilen/)).toBeVisible();
      await expect(
        form.getByRole("button", { name: "Fastställ ny kravprofilversion" }),
      ).toBeDisabled();
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
      await expect(counts.getByRole("heading", { level: 2 })).toHaveText(
        SV["rec.overview.counts.title"]!,
      );
      await expect(counts.getByText(SV["rec.overview.counts.intro"]!)).toBeVisible();
      await openStatistics(page);
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

// The REAL /my-career route, mounted in a browser, against stubbed backends.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// The guard renders components to markup; it cannot see query timing, a
// refetch after an invitation claim, a mutation's pending/success/error
// states, a click that changes the URL, focus rings, contrast, or a
// horizontal scrollbar. This spec mounts the actual route file under the
// actual authenticated layout and drives it with a real browser.
//
// ── HOW THE BACKEND IS STUBBED ─────────────────────────────────────────
//
// Every server function call is an HTTP request to /_serverFn/<id>, where
// <id> is base64url JSON naming the module and the export. The stub decodes
// it, answers from the fixture the scenario names, and returns plain
// application/json — which the client accepts as-is when no
// x-tss-serialized header is present. A Supabase session is planted in
// localStorage the way supabase-js stores one; the auth "who am I" call and
// the two REST reads the page makes directly (jobs, employers) are stubbed
// too. Nothing reaches a database.
//
// The fixtures are the SAME module the static guard and the dev preview use.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/my-career-home.spec.ts

import { test, expect, type Page } from "@playwright/test";
import {
  FIXTURES,
  work,
  history,
} from "../src/lib/professional-identity/fixtures/career-home-fixtures";
import {
  ASSIGNMENT_ID,
  ATTEMPT_ID,
  FAILING_ASSIGNMENT_ID,
  LINKED_RUN_ID,
  fail,
  mount,
  ok,
  takeMountBookkeeping,
} from "./support/career-home-harness";

// The harness — the stub table, the planted session and the fixtures —
// moved to ./support/career-home-harness.ts when the PR #211 hub evidence
// run needed the same mount. This file keeps the scenarios and nothing
// else; everything the comment above describes still happens, in there.

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(
    c.unmatched,
    `unstubbed server functions: ${[...new Set(c.unmatched)].join(", ")}`,
  ).toEqual([]);
  expect(c.errors, c.errors.join("\n")).toEqual([]);
});

const settled = async (page: Page) => {
  await page.waitForTimeout(400);
};

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

test.describe("/my-career — the real route", () => {
  test("1 · career report ready while history is still loading: no disclosure, no crash", async ({
    page,
  }) => {
    // #211: the career picture is a hub MODULE now, not a full section.
    // What is asserted is unchanged — the analysis renders from the frozen
    // report while the history read is still pending, and the earlier-
    // analyses disclosure does not open onto a list nobody has counted.
    const { errors } = await mount(page, "history_loading");
    const discovery = page.locator('[data-hub-module="discovery"]');
    await expect(discovery).toContainText("Säkerhetssamordnare");
    await expect(page.locator("[data-earlier-reports]")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("2 · identity read failure: error with retry, other sections usable, no permanent skeleton", async ({
    page,
  }) => {
    const { errors } = await mount(page, "identity_failed");
    await expect(page.locator("[data-career-header]")).toHaveAttribute(
      "data-profile-state",
      "unavailable",
    );
    await expect(page.locator("[data-career-header] [data-retry]")).toBeVisible();
    // The deadlined test does not need the identity, so it is still the step.
    await expect(page.locator("[data-primary-cta]")).toHaveCount(1);
    await expect(page.locator('[data-next-action="primary"]')).toHaveAttribute(
      "data-state-key",
      /p0:complete_assessment_assignment/,
    );
    await expect(page.locator("[data-passport-summary]")).toHaveAttribute(
      "data-passport-state",
      "unavailable",
    );
    await expect(page.locator("[data-passport-summary] [data-retry]")).toBeVisible();
    // The four hub modules are fed by reads that ANSWERED, so a failed
    // identity read costs the header and the Passport figures and nothing
    // else. This is the property the whole "each source stands on its own"
    // design exists for, asserted at the new granularity.
    await expect(page.locator('[data-hub-module="discovery"]')).toContainText(
      "Säkerhetssamordnare",
    );
    await expect(page.locator('[data-hub-module="applications"]')).toContainText("1 aktiv ansökan");
    await expect(page.locator("[data-loading]")).toHaveCount(0);
    // A hub module stuck in its skeleton is the same defect one level down.
    await expect(page.locator("[data-hub-loading]")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  // ── 3, 4 AND 5: THE SAME RULE, ONE LEVEL SMALLER ────────────────────
  //
  // The overview used to list three open roles and had to be careful never
  // to present UNFILTERED vacancies as matching the candidate. #211 took
  // the list to /jobs, which is where a list of jobs belongs, and left one
  // conditional link behind: "see open roles in this area", offered ONLY
  // when the frozen analysis named a career family AND that family has
  // vacancies right now.
  //
  // So the rule survives in a stronger form — the hub cannot present
  // unfiltered jobs as matching, because it presents no jobs at all — and
  // these three tests pin the condition from both sides. 4 is the positive
  // control; without it, 3 and 5 would pass against a link that had simply
  // been deleted.
  test("3 · no career profile: no career-filtered jobs link is offered at all", async ({
    page,
  }) => {
    await mount(page, "general_jobs");
    const discovery = page.locator('[data-hub-module="discovery"]');
    await expect(discovery).toBeVisible();
    await expect(discovery.locator("[data-hub-jobs]")).toHaveCount(0);
    // And nothing on the page claims a match it cannot support.
    await expect(page.locator("main")).not.toContainText(
      /matchar din inriktning|yrkesinriktning som framgår/,
    );
  });

  test("4 · family-filtered jobs: the link is offered, inside the analysis module, carrying the family", async ({
    page,
  }) => {
    await mount(page, "eight_unverified");
    const link = page.locator('[data-hub-module="discovery"] [data-hub-jobs]');
    await expect(link).toBeVisible();
    // The family the ANALYSIS named, carried as a search param — not a
    // query string inside `to`, which the router would not parse.
    await expect(link).toHaveAttribute("href", "/jobs?family=guarding");
  });

  test("5 · jobs query failure: no link, and never 'no matching jobs'", async ({ page }) => {
    await mount(page, "partial_failure");
    // A failed read is not an empty result. The hub withholds the link
    // rather than offering one into a list it could not count, and says
    // nothing at all about vacancies.
    await expect(page.locator("[data-hub-jobs]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Vi hittade inga jobb");
    // The module itself is unaffected: the jobs read is not the analysis.
    await expect(page.locator('[data-hub-module="discovery"]')).toBeVisible();
  });

  test("6 · a pending emailed invitation appears during the same visit", async ({ page }) => {
    let listed = 0;
    const invited = work({
      workId: "att-invited",
      deadline: "2026-09-15T23:59:00Z",
      progressDone: 0,
    });
    await mount(page, "eight_unverified", {
      overrides: {
        claimAssessmentInvitations: ok({ bound: 1, expired: 0 }),
        // First list: nothing yet. After the claim bound one, the refetch sees it.
        listAcademyWork: async (route) => {
          listed += 1;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              result: listed === 1 ? [] : [invited],
              error: null,
              context: {},
            }),
          });
        },
        getMyAssessmentHistory: ok([
          history({ attemptId: "att-invited", lifecycleState: "invited" }),
        ]),
      },
    });
    // The claimed invitation is an open test with a deadline, so it becomes
    // the recommended step on THIS visit — no reload, no second visit.
    await expect(page.locator("[data-primary-cta]")).toHaveAttribute(
      "href",
      "/academy/att-invited",
      { timeout: 10_000 },
    );
    expect(listed).toBeGreaterThanOrEqual(2);
    await expect(page.locator('[data-next-action="primary"] [data-primary-meta]')).toContainText(
      "Begärt av Nordväkt AB",
    );
    // #211: the tests LIST left the overview for /academy, which is the
    // page that owns it; that the list does not then pretend the test does
    // not exist is asserted against the component, over these same
    // fixtures, by my-career-premium-overview:check. What this spec still
    // proves is the part that is timing and cannot be proved statically:
    // the claim ran, the list was refetched, and the invitation became the
    // recommended step on THIS visit.
  });

  test("7 · a recruitment test names the requesting organisation and the role, never an employer of the applicant", async ({
    page,
  }) => {
    await mount(page, "assessment_deadline");
    const primary = page.locator('[data-next-action="primary"]');
    await expect(primary).toContainText("Slutför testet");
    await expect(primary.locator("[data-primary-meta]")).toContainText("Begärt av Nordväkt AB");
    await expect(primary.locator("[data-primary-meta]")).toContainText(
      "för tjänsten Väktare, Stockholm",
    );
    await expect(primary).not.toContainText(/din arbetsgivare|anställd/i);
    await expect(primary.locator("[data-primary-cta]")).toHaveAttribute(
      "href",
      "/academy/att-open",
    );
    await expect(primary).not.toContainText("ingen annan");
  });

  test("8 · employer-assigned training with a deadline is the recommended step, in its own section", async ({
    page,
  }) => {
    await mount(page, "training_deadline");
    const primary = page.locator('[data-next-action="primary"]');
    await expect(primary).toHaveAttribute("data-state-key", "p0:complete_training_assignment");
    await expect(primary.locator("[data-primary-cta]")).toHaveAttribute(
      "href",
      "/academy/training/tr-1",
    );
    await expect(primary.locator("[data-primary-meta]")).toContainText("Tilldelat av Nordväkt AB");
    // The training and tests SECTIONS moved to /academy with #211. That a
    // featured row says so rather than vanishing, and that training never
    // leaks into tests, is asserted against those components over these
    // same fixtures by my-career-premium-overview:check.
    await expect(page.locator("[data-development]")).toHaveCount(0);
    await expect(page.locator("[data-tests-and-results]")).toHaveCount(0);
  });

  test("9 · the sole open test is the recommended step and the tests list does not claim no test exists", async ({
    page,
  }) => {
    await mount(page, "sole_primary_test");
    await expect(page.locator('[data-next-action="primary"]')).toContainText("Slutför testet");
    // No disclosure on the page opens onto nothing — the rule that kept
    // "Tidigare karriäranalyser" and "Senaste aktivitet" from becoming two
    // empty summaries when #211 folded them away.
    await expect(page.locator("details:not([open])").filter({ hasText: /^$/ })).toHaveCount(0);
  });

  test("10 · a released result is a dated row, not the recommended step, and never 'new' or 'unread'", async ({
    page,
  }) => {
    await mount(page, "released_and_waiting");
    const primary = page.locator('[data-next-action="primary"]');
    // A released result is NOT the recommended step. It is the rule that
    // stops the ladder telling somebody to go and read something.
    await expect(primary).not.toHaveAttribute("data-state-key", /read_released_report/);
    // The released row, the waiting count, the expired attempt and the
    // "not a merit" sentence are properties of the tests section, which is
    // on /academy since #211 and asserted against its component by
    // my-career-premium-overview:check over this same fixture.
    await expect(page.locator("[data-tests-and-results]")).toHaveCount(0);
    // Applications: the withdrawn one, updated most recently, never leads
    // the count or the status. The hub module is where that shows now.
    const apps = page.locator('[data-hub-module="applications"]');
    await expect(apps).toContainText("4 aktiva ansökningar");
    await expect(apps).not.toContainText("Återkallad");
  });

  test("11 · a reviewer's question opens the exact merit", async ({ page }) => {
    await mount(page, "clarification_exact");
    const cta = page.locator("[data-primary-cta]");
    await expect(cta).toHaveAttribute("href", "/passport/entry/claim/c3");
    await expect(page.locator('[data-next-action="primary"]')).toContainText("Svara granskaren");
    await cta.click();
    await page.waitForURL(/\/passport\/entry\/claim\/c3$/);
    expect(page.url()).toContain("/passport/entry/claim/c3");
  });

  test("12 · an approval on a merit since archived is said so, and the counts stay current", async ({
    page,
  }) => {
    await mount(page, "established");
    const passport = page.locator("[data-passport-summary]");
    // ── A STALE EXPECTATION, RED ON main BEFORE #211 ──────────────────
    //
    // "Registrerade" meant `addedCount` — every current merit — when this
    // line was written. PR #189's containment made the six figures
    // MUTUALLY EXCLUSIVE and gave the total its own name, so "Registrerade"
    // is now the self-reported rung alone. The card was right and the
    // assertion was six months out of date; it asserted 6 against a
    // rendered 2 and had been failing ever since.
    //
    // Both are asserted now, which is the assertion that could not have
    // gone stale silently: the TOTAL is 6, the self-reported rung is 2, and
    // the five exclusive figures below add up to the total.
    await expect(passport.locator('[data-merit-count="total-current"]')).toContainText("6");
    await expect(passport.locator('[data-merit-count="registered"]')).toContainText("2");
    await expect(passport.locator('[data-merit-count="under-review"]')).toContainText("1");
    // PR #189: both standing approvals in this fixture are CQrityjob document
    // reviews. A review is a decision and it is not the source confirming the
    // merit, so the card counts them as documented and leaves the verified
    // figure at nothing. What this test defends is unchanged -- the archived
    // approval does not inflate a current count, and the decided merits are
    // not reported as none.
    await expect(passport.locator('[data-merit-count="documented"]')).toContainText("2");
    await expect(passport.locator('[data-merit-count="verified"]')).toContainText("0");
    await expect(passport.locator('[data-merit-count="expired"]')).toContainText("1");
    const activity = page.locator("[data-recent-activity]");
    await expect(
      activity.locator('[data-activity-kind="verification_approved_archived"]'),
    ).toHaveCount(1);
    await expect(activity).toContainText("meriten är sedan dess arkiverad");
    await expect(activity).not.toContainText(/^.*En merit i ditt Security Passport verifierades$/);
  });

  test("13 · linking an earlier result: pending → success → the CAREER REPORT destination renders", async ({
    page,
  }) => {
    // The identifier domains are deliberately unmistakable. The link
    // creates an `assessment_runs` row (save_career_report), so the CTA
    // must carry LINKED_RUN_ID to /my-career/reports/$runId — never
    // ATTEMPT_ID, and never the ASSIGNMENT_ID it was claimed from.
    await mount(page, "eight_unverified", {
      overrides: {
        getMyLinkableAssignments: ok([
          {
            id: ASSIGNMENT_ID,
            assessmentNameSv: "Väktare – rekryteringstest",
            assessmentNameEn: "Security officer – recruitment test",
            completedAt: "2026-07-01T09:00:00Z",
          },
          {
            id: FAILING_ASSIGNMENT_ID,
            assessmentNameSv: "Ordningsvakt – test",
            assessmentNameEn: "Public order officer – test",
            completedAt: "2026-06-01T09:00:00Z",
          },
        ]),
        claimAssessmentAssignment: async (route) => {
          const body = route.request().postData() ?? "";
          if (body.includes(FAILING_ASSIGNMENT_ID))
            return route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
          await new Promise((r) => setTimeout(r, 300));
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              result: { linked: true, runId: LINKED_RUN_ID },
              error: null,
              context: {},
            }),
          });
        },
      },
    });

    const okRow = page.locator(`[data-linkable-row="${ASSIGNMENT_ID}"]`);
    await expect(okRow.locator("[data-link-earlier-cta]")).toHaveText(
      /Koppla resultatet till mitt konto/,
    );
    await okRow.locator("[data-link-earlier-cta]").click();
    await expect(okRow.locator("[data-link-earlier-cta]")).toHaveAttribute("aria-busy", "true");
    await expect(okRow.locator("[data-link-success]")).toBeVisible();

    const open = okRow.locator("[data-link-open]");
    await expect(open).toHaveAttribute("href", `/my-career/reports/${LINKED_RUN_ID}`);
    // The wrong domains must not appear anywhere on the row.
    const rowHtml = (await okRow.innerHTML()) ?? "";
    expect(rowHtml).not.toContain(ATTEMPT_ID);
    expect(rowHtml).not.toContain("/academy/");

    // ── AND IT ACTUALLY OPENS ───────────────────────────────────────
    await open.click();
    await page.waitForURL(`**/my-career/reports/${LINKED_RUN_ID}`);
    // The destination resolved THIS run: the route's not-found branch is
    // what an id from the wrong domain would produce, and it is absent.
    await expect(page.locator("body")).not.toContainText("Rapporten kunde inte hittas.");
    await expect(page.locator("body")).toContainText("Gör om testet");
    expect(page.url()).toContain(LINKED_RUN_ID);
    expect(page.url()).not.toContain(ATTEMPT_ID);

    await page.goBack();
    await page.locator("[data-career-header]").waitFor();
    const badRow = page.locator(`[data-linkable-row="${FAILING_ASSIGNMENT_ID}"]`);
    await badRow.locator("[data-link-earlier-cta]").click();
    await expect(badRow.locator("[data-link-error]")).toBeVisible();
    await expect(badRow.locator("[data-link-earlier-cta]")).toHaveText(/Försök igen/);
  });

  test("13b · linked=true with no runId is a failure, not a success", async ({ page }) => {
    // `linkAssignmentRun` returns null when no published assessment version
    // exists or the RPC refuses. A confirmation with nothing to open is the
    // same class of untruth as a confident zero.
    await mount(page, "eight_unverified", {
      overrides: {
        getMyLinkableAssignments: ok([
          {
            id: ASSIGNMENT_ID,
            assessmentNameSv: "Väktare – rekryteringstest",
            assessmentNameEn: "Security officer – recruitment test",
            completedAt: "2026-07-01T09:00:00Z",
          },
        ]),
        claimAssessmentAssignment: ok({ linked: true, runId: null }),
      },
    });
    const row = page.locator(`[data-linkable-row="${ASSIGNMENT_ID}"]`);
    await row.locator("[data-link-earlier-cta]").click();
    await expect(row.locator("[data-link-error]")).toBeVisible();
    await expect(row.locator("[data-link-success]")).toHaveCount(0);
    await expect(row.locator("[data-link-earlier-cta]")).toHaveText(/Försök igen/);
  });

  test("13c · several reviewer questions open the Passport's attention region, focused", async ({
    page,
  }) => {
    await mount(page, "clarifications_many");
    const cta = page.locator("[data-primary-cta]");
    // No single entry to open, so the action names the REGION.
    await expect(cta).toHaveAttribute("href", "/passport#attention");
    await expect(page.locator('[data-next-action="primary"]')).toContainText("Svara granskaren");
    await expect(page.locator('[data-next-action="primary"]')).toContainText(
      "3 granskare väntar på svar från dig.",
    );

    await cta.click();
    await page.waitForURL("**/passport#attention");
    expect(page.url()).toMatch(/\/passport#attention$/);

    // The target exists, is the one the hash named, and holds BOTH panels.
    const region = page.locator("#attention");
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute("data-hash-target", "attention");
    await expect(region.locator("[data-verification-attention]")).toHaveCount(1);
    // And focus moved there, so a keyboard user arrives where the link said.
    const focused = await page.evaluate(() => ({
      id: document.activeElement?.id ?? "",
      inRegion: !!document.activeElement?.closest("#attention"),
    }));
    expect(focused.id).toBe("attention");
    expect(focused.inRegion).toBe(true);
    // The region is scrolled into view rather than left above the fold.
    const top = await region.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(200);
  });

  for (const lang of ["sv", "en"] as const) {
    test(`14 · ${lang}: the brief's eight-merit state reads in ${lang}`, async ({ page }) => {
      const { errors } = await mount(page, "eight_unverified", { lang });
      const primary = page.locator('[data-next-action="primary"]');
      await expect(primary).toContainText(
        lang === "sv" ? "Verifiera dina meriter" : "Get your merits verified",
      );
      await expect(primary).toContainText(
        lang === "sv" ? "Du har 8 registrerade meriter" : "You have 8 recorded merits",
      );
      await expect(page.locator('[data-merit-count="registered"]')).toContainText("8");
      await expect(page.locator("[data-primary-cta]")).toHaveAttribute("href", "/passport#merits");
      if (lang === "sv") await expect(page.locator("main")).not.toContainText("Career Discovery");
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }

  for (const [name, width, height] of [
    ["1440", 1440, 1000],
    ["375", 375, 812],
  ] as const) {
    test(`15 · ${name}px: no overflow, one h1, one primary CTA, labelled sections, 44px targets, AA contrast, focus rings`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await mount(page, "released_and_waiting");
      const r = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        const out = {
          h1: main.querySelectorAll("h1").length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          unlabelled: 0,
          small: [] as string[],
          lowContrast: [] as string[],
          skeletons: main.querySelectorAll("[data-loading]").length,
          emptyDetails: 0,
        };
        for (const s of main.querySelectorAll("section"))
          if (
            !s.getAttribute("aria-labelledby") &&
            !s.getAttribute("aria-label") &&
            !s.closest("[data-career-header]") &&
            s.className !== "py-8 md:py-10"
          )
            out.unlabelled += 1;
        for (const el of main.querySelectorAll("a[href],button,summary")) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.height < 43.5)
            out.small.push(
              `${el.tagName}:${(el.textContent || "").trim().slice(0, 30)} ${Math.round(b.height)}`,
            );
        }
        for (const d of main.querySelectorAll("details"))
          if (!d.querySelector("ul, li, p, a")) out.emptyDetails += 1;
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        const cx = cv.getContext("2d", { willReadFrequently: true })!;
        const parse = (c: string) => {
          cx.clearRect(0, 0, 1, 1);
          cx.fillStyle = c;
          cx.fillRect(0, 0, 1, 1);
          const d = cx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!, d[3]! / 255] as const;
        };
        const over = (fg: readonly number[], bg: readonly number[]) =>
          [0, 1, 2].map((k) => fg[k]! * fg[3]! + bg[k]! * (1 - fg[3]!));
        const bgOf = (el: Element) => {
          const layers: (readonly number[])[] = [];
          let n: Element | null = el;
          while (n && n !== document.documentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c[3] > 0) {
              layers.push(c);
              if (c[3] >= 0.999) break;
            }
            n = n.parentElement;
          }
          let base: number[] = [255, 255, 255];
          for (let k = layers.length - 1; k >= 0; k--) base = over(layers[k]!, base);
          return base;
        };
        const srgb = (c: number) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const lum = (c: number[]) =>
          0.2126 * srgb(c[0]!) + 0.7152 * srgb(c[1]!) + 0.0722 * srgb(c[2]!);
        for (const el of main.querySelectorAll(
          "p,span,h1,h2,h3,h4,a,button,li,dt,dd,time,summary",
        )) {
          const text = [...el.childNodes]
            .filter((n) => n.nodeType === 3 && n.textContent!.trim())
            .map((n) => n.textContent!.trim())
            .join("");
          if (!text) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          const bg = bgOf(el);
          const fg = over(parse(cs.color), bg);
          const l1 = lum(fg),
            l2 = lum(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const px = parseFloat(cs.fontSize);
          const bold = parseInt(cs.fontWeight, 10) >= 700;
          const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
          if (ratio < need) out.lowContrast.push(`${text.slice(0, 30)} ${ratio.toFixed(2)}`);
        }
        return out;
      });
      expect(r.h1).toBe(1);
      expect(r.overflow).toBe(0);
      expect(r.unlabelled).toBe(0);
      expect(r.small, r.small.join(" | ")).toEqual([]);
      expect(r.lowContrast, r.lowContrast.join(" | ")).toEqual([]);
      expect(r.skeletons).toBe(0);
      expect(r.emptyDetails).toBe(0);
      await expect(page.locator("[data-primary-cta]")).toHaveCount(1);
      // Keyboard: the first tab stops inside main paint a ring.
      let ringed = 0,
        checked = 0;
      for (let k = 0; k < 40 && checked < 8; k++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body || !el.closest("main")) return null;
          const cs = getComputedStyle(el);
          return { outline: parseFloat(cs.outlineWidth), shadow: cs.boxShadow };
        });
        if (!info) continue;
        checked += 1;
        if (info.outline > 0 || (info.shadow && info.shadow !== "none")) ringed += 1;
      }
      expect(checked).toBeGreaterThan(0);
      expect(ringed).toBe(checked);
      await page.screenshot({ path: `test-results/my-career-home-${name}.png`, fullPage: true });
    });
  }

  test("15b · 200% zoom (640px logical): no overflow, one primary CTA", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await mount(page, "eight_unverified");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator("[data-primary-cta]")).toHaveCount(1);
  });

  // ── THE HUB'S OWN ACCESSIBILITY, IN A BROWSER ──────────────────────
  //
  // my-career-hub:check proves aria-current, the weight and the rule from
  // rendered markup. It cannot prove that a keyboard can REACH the tabs, or
  // that reaching one draws a visible ring, or that the page has exactly one
  // <h1> once every query has answered. Those are what this is for.
  test("hub · the section strip is reachable by keyboard, with a visible ring", async ({
    page,
  }) => {
    await mount(page, "hub_active");
    await page.locator("[data-hub-status-grid]").waitFor();

    // Exactly one h1, after everything has settled — not one per module and
    // not zero because the header is still a skeleton.
    await expect(page.locator("h1")).toHaveCount(1);

    // Tab from the top of the document until the first hub tab has focus.
    // A strip that a keyboard cannot get to is not navigation.
    await page.evaluate(() => document.body.focus());
    let reached = false;
    for (let i = 0; i < 40 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(
        () => document.activeElement?.getAttribute("data-hub-key") === "overview",
      );
    }
    expect(reached, "the first hub tab was not reachable within 40 tab stops").toBe(true);

    // Focus must be VISIBLE. The class is the contract the design system
    // renders; an element focused with no focus style is a keyboard user
    // navigating blind.
    const focusClass = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focusClass).toMatch(/focus-visible:outline/);

    // And the rest of the strip follows, in order, on plain Tab.
    for (const key of ["passport", "cv", "discovery", "applications", "sharing"]) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-hub-key")))
        .toBe(key);
    }
  });

  // ── EVERY MODULE'S ACTION IS A REAL LINK ───────────────────────────
  //
  // "No dead button, no dead card." A control that looks actionable and
  // navigates nowhere is the failure; asserted by CLICKING, because an href
  // that resolves in the route table and 404s in the router passes a static
  // check.
  test("hub · every module action navigates somewhere real", async ({ page }) => {
    await mount(page, "new_user", { overrides: { listMyShares: ok([]), listMyCvs: ok([]) } });
    await page.locator("[data-hub-status-grid]").waitFor();
    const hrefs = await page
      .locator("[data-hub-go]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs).toHaveLength(4);
    expect(hrefs.every((h) => typeof h === "string" && h.startsWith("/"))).toBe(true);
    // No two modules offer the same destination: four modules, four places.
    expect(new Set(hrefs).size).toBe(4);
  });

  for (const f of FIXTURES) {
    test(`fixture ${f.id}: mounts without a page error, exactly one primary CTA, no permanent skeleton`, async ({
      page,
    }) => {
      const { errors } = await mount(page, f.id);
      await expect(page.locator("[data-primary-cta]")).toHaveCount(1);
      await page.waitForTimeout(1500);
      const skeletons = await page.evaluate(() =>
        [...document.querySelectorAll("main [data-loading]")].map((e) => {
          const s = e.closest(
            "[data-passport-summary],[data-career-direction],[data-job-recommendations],[data-applications],[data-tests-and-results],[data-career-header],[data-next-best-action]",
          );
          return s
            ? [...s.attributes]
                .filter((a) => a.name.startsWith("data-"))
                .map((a) => `${a.name}=${a.value}`)
                .join(" ")
            : e.outerHTML.slice(0, 80);
        }),
      );
      expect(skeletons, `permanent skeleton in: ${skeletons.join(" | ")}`).toEqual([]);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

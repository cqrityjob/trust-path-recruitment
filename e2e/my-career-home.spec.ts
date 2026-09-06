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

import { test, expect, type Page, type Route } from "@playwright/test";
import {
  FIXTURES,
  fixtureById,
  work,
  history,
  type HomeFixture,
} from "../src/lib/professional-identity/fixtures/career-home-fixtures";
import type { HomePresentationInput } from "../src/lib/professional-identity/home-presentation";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
const USER_ID = "00000000-0000-4000-8000-000000000001";

/* ------------------------------------------------------------------ */
/* Stubbing                                                            */
/* ------------------------------------------------------------------ */

type Reply = { body: unknown } | { error: string } | { hang: true };

function exportOf(url: string): string | null {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return String(json.export ?? "").replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}

const ok = (body: unknown): Reply => ({ body });
const fail = (error = "stubbed failure"): Reply => ({ error });
const HANG: Reply = { hang: true };

const src = <T>(s: { state: string; rows?: readonly T[] }): Reply =>
  s.state === "ready" ? ok(s.rows ?? []) : s.state === "error" ? fail() : HANG;

/** The stub table for one fixture. Any scenario may override entries. */
function repliesFor(f: HomeFixture): Record<string, Reply> {
  const i: HomePresentationInput = f.input;
  const identity =
    i.identity.state === "ready"
      ? ok(i.identity.identity)
      : i.identity.state === "error"
        ? fail("identity failed")
        : HANG;
  const profile =
    i.jobFilter.state === "family"
      ? ok({
          hasProfile: true,
          profile: {
            profileVersion: "career-profile-for-jobs-v1",
            familyScores: { [i.jobFilter.familyId]: { currentFit: 0.8, potential: 0.9 } },
          },
          runId: "run-cd-1",
          completedAt: "2026-08-20T09:00:00Z",
        })
      : i.jobFilter.state === "none"
        ? ok({ hasProfile: false })
        : HANG;
  return {
    getMyProfessionalIdentity: identity,
    listMyCvs: ok(Array.from({ length: i.savedCvCount ?? 0 }, (_, n) => ({ id: `cv-${n}` }))),
    getV31Availability: ok({ available: i.careerDiscoveryOpen === true }),
    getV31TesterStatus: ok({ allowed: i.careerDiscoveryOpen === true }),
    getActiveCareerReport: i.activeReportError
      ? fail()
      : i.activeReport
        ? ok(i.activeReport)
        : HANG,
    getStoredDiscoveryReport: i.storedReportError
      ? fail()
      : i.storedReport
        ? ok(i.storedReport)
        : HANG,
    listAssessmentRuns: src(i.legacyRuns),
    listMyDiscoveryReports:
      i.discoveryReports.state === "ready"
        ? ok({ reports: i.discoveryReports.rows })
        : i.discoveryReports.state === "error"
          ? fail()
          : HANG,
    listAcademyWork: src(i.academyWork),
    claimAssessmentInvitations: ok({ bound: 0, expired: 0 }),
    getMyAssessmentHistory: src(i.assessmentHistory),
    getMyLinkableAssignments: ok([]),
    listMyApplications: src(i.applications),
    listMyInterviews: src(i.interviews),
    listMyVerificationRequests:
      f.requests === "error"
        ? fail("verification read failed")
        : f.requests
          ? ok({ requests: f.requests, decisions: [] })
          : HANG,
    getMyCareerProfileForJobs: profile,
    // header chrome
    countMyAcademyWork: ok({ total: 0, actionable: 0 }),
    countMyReviewQueue: ok(0),
    listMyEmployerWorkspaces: ok([]),
    trackV31FunnelEvent: ok({ recorded: false }),
  };
}

async function mount(
  page: Page,
  fixtureId: string,
  opts: {
    lang?: "sv" | "en";
    overrides?: Record<string, Reply | ((route: Route) => Promise<void>)>;
    jobs?: unknown[];
  } = {},
) {
  const f = fixtureById(fixtureId);
  if (!f) throw new Error(`unknown fixture ${fixtureId}`);
  const replies = { ...repliesFor(f), ...(opts.overrides ?? {}) };
  const unmatched: string[] = [];

  await page.addInitScript(
    ({ ref, lang, userId }) => {
      try {
        localStorage.setItem("cqrityjob.lang", lang);
        localStorage.setItem(
          `sb-${ref}-auth-token`,
          JSON.stringify({
            access_token: "stub-access-token",
            refresh_token: "stub-refresh-token",
            token_type: "bearer",
            expires_in: 3600 * 24 * 365,
            expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
            user: {
              id: userId,
              aud: "authenticated",
              email: "amina@example.test",
              user_metadata: { display_name: "Amina" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { ref: SUPABASE_REF, lang: opts.lang ?? "sv", userId: USER_ID },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    const reply = replies[name];
    if (process.env.E2E_DEBUG)
      console.log(
        `[rpc] ${name} -> ${reply ? ("hang" in reply ? "hang" : "error" in reply ? "500" : "200") : "UNMATCHED"}`,
      );
    if (!reply) {
      unmatched.push(name);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: null, error: null, context: {} }),
      });
    }
    if (typeof reply === "function") return reply(route);
    if ("hang" in reply) return; // never answers: the query stays pending
    if ("error" in reply)
      return route.fulfill({ status: 500, contentType: "text/plain", body: reply.error });
    // The client unwraps `{ result, error, context }` from every server
    // function response; a bare value would read as `undefined`.
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: reply.body, error: null, context: {} }),
    });
  });

  // Supabase: the auth "who am I" call, and the two direct REST reads.
  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: USER_ID,
          aud: "authenticated",
          email: "amina@example.test",
          user_metadata: { display_name: "Amina" },
          app_metadata: {},
        }),
      });
    }
    if (url.includes("/rest/v1/jobs")) {
      const rows = f.input.jobs.state === "ready" ? (opts.jobs ?? f.input.jobs.rows) : null;
      if (f.input.jobs.state === "error")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "stubbed" }),
        });
      if (rows === null) return; // hang
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
    }
    if (url.includes("/rest/v1/employers")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (process.env.E2E_DEBUG) console.log(`[page:${m.type()}] ${m.text().slice(0, 300)}`);
    // A 500 from a stub IS the scenario ("this read failed"); the browser's
    // own "Failed to load resource" line for it is not a page defect.
    if (m.type() === "error" && !/favicon|funnel event|Failed to load resource/i.test(m.text()))
      errors.push(m.text());
  });

  await page.goto(`${BASE}/my-career`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-career-header]").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  return { f, errors, unmatched };
}

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
    const { errors } = await mount(page, "history_loading");
    await expect(page.locator("[data-career-direction]")).toHaveAttribute(
      "data-career-state",
      "ready",
    );
    await expect(page.locator("[data-top-role]")).toContainText("Säkerhetssamordnare");
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
    await expect(page.locator("[data-career-direction]")).toHaveAttribute(
      "data-career-state",
      "ready",
    );
    await expect(page.locator("[data-job-recommendations]")).toHaveAttribute(
      "data-jobs-state",
      "filtered",
    );
    await expect(page.locator("[data-active-applications]")).toHaveText(/1 aktiv ansökan/);
    await expect(page.locator("[data-loading]")).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("3 · no career profile: general jobs, never presented as matching", async ({ page }) => {
    await mount(page, "general_jobs");
    const jobs = page.locator("[data-job-recommendations]");
    await expect(jobs).toHaveAttribute("data-jobs-state", "general");
    await expect(jobs).toContainText("Utforska lediga jobb inom säkerhetsbranschen.");
    await expect(jobs).not.toContainText(/matchar din inriktning|yrkesinriktning som framgår/);
    await expect(jobs.locator("[data-job-row]")).toHaveCount(3);
  });

  test("4 · family-filtered jobs, attributed to the career analysis", async ({ page }) => {
    await mount(page, "eight_unverified");
    const jobs = page.locator("[data-job-recommendations]");
    await expect(jobs).toHaveAttribute("data-jobs-state", "filtered");
    await expect(jobs).toContainText(
      "Urvalet bygger på den yrkesinriktning som framgår av din karriäranalys.",
    );
    await expect(jobs).not.toContainText(/yrkesområde du har angett/);
  });

  test("5 · jobs query failure: unavailable with retry and the jobs page, never 'no matching jobs'", async ({
    page,
  }) => {
    await mount(page, "partial_failure");
    const jobs = page.locator("[data-job-recommendations]");
    await expect(jobs).toHaveAttribute("data-jobs-state", "unavailable");
    await expect(jobs.locator("[data-retry]")).toBeVisible();
    await expect(jobs.locator('a[href="/jobs"]')).toBeVisible();
    await expect(jobs).not.toContainText("Vi hittade inga jobb");
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
    // And the tests list does not pretend it does not exist.
    await expect(page.locator("[data-tests-and-results]")).toContainText(
      "Testet visas som rekommenderat nästa steg ovan.",
    );
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
    await expect(page.locator("[data-development] [data-training-row]")).toHaveAttribute(
      "data-featured-above",
      "",
    );
    await expect(page.locator("[data-development]")).toContainText(
      "Utbildningen visas som rekommenderat nästa steg ovan.",
    );
    // Training never leaks into tests.
    await expect(page.locator("[data-tests-and-results]")).toContainText(
      "Ingen arbetsgivare har bett dig göra ett test.",
    );
  });

  test("9 · the sole open test is the recommended step and the tests list does not claim no test exists", async ({
    page,
  }) => {
    await mount(page, "sole_primary_test");
    await expect(page.locator('[data-next-action="primary"]')).toContainText("Slutför testet");
    const tests = page.locator("[data-tests-and-results]");
    await expect(tests).toContainText("Testet visas som rekommenderat nästa steg ovan.");
    await expect(tests).not.toContainText("Ingen arbetsgivare har bett dig göra ett test.");
    await expect(page.locator("details:not([open])").filter({ hasText: /^$/ })).toHaveCount(0);
  });

  test("10 · a released result is a dated row, not the recommended step, and never 'new' or 'unread'", async ({
    page,
  }) => {
    await mount(page, "released_and_waiting");
    const primary = page.locator('[data-next-action="primary"]');
    await expect(primary).not.toHaveAttribute("data-state-key", /read_released_report/);
    const tests = page.locator("[data-tests-and-results]");
    await expect(tests.locator('[data-test-row="released"]')).toHaveCount(1);
    await expect(tests.locator('[data-test-row="released"]')).toContainText("Delat med dig");
    await expect(tests.locator('[data-test-link="att-released"]')).toHaveAttribute(
      "href",
      "/academy/report/att-released",
    );
    await expect(tests).not.toContainText(/Nytt för dig|oläst/i);
    await expect(tests).toContainText("3 tester väntar på resultat från arbetsgivaren.");
    // The expired attempt is neither waiting nor released.
    await expect(tests.locator('[data-test-row="unknown"]')).toHaveCount(1);
    await expect(tests.locator('[data-test-row="unknown"]')).toContainText("(expired)");
    await expect(tests).toContainText("blir inte en merit i ditt Security Passport");
    // Applications: the withdrawn one, updated most recently, never leads.
    await expect(page.locator("[data-active-applications]")).toHaveText("4 aktiva ansökningar");
    await expect(page.locator("[data-latest-application]")).toContainText(
      "Väktare, Stockholm · Nordväkt AB",
    );
    await expect(page.locator("[data-latest-application]")).not.toContainText("Återkallad");
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
    await expect(passport.locator('[data-merit-count="registered"]')).toContainText("6");
    await expect(passport.locator('[data-merit-count="verified"]')).toContainText("2");
    await expect(passport.locator('[data-merit-count="expired"]')).toContainText("1");
    const activity = page.locator("[data-recent-activity]");
    await expect(
      activity.locator('[data-activity-kind="verification_approved_archived"]'),
    ).toHaveCount(1);
    await expect(activity).toContainText("meriten är sedan dess arkiverad");
    await expect(activity).not.toContainText(/^.*En merit i ditt Security Passport verifierades$/);
  });

  test("13 · linking an earlier result shows pending, success with an open link, and an inline error with retry", async ({
    page,
  }) => {
    await mount(page, "eight_unverified", {
      overrides: {
        getMyLinkableAssignments: ok([
          {
            id: "asg-ok",
            assessmentNameSv: "Väktare – rekryteringstest",
            assessmentNameEn: "Security officer – recruitment test",
            completedAt: "2026-07-01T09:00:00Z",
          },
          {
            id: "asg-bad",
            assessmentNameSv: "Ordningsvakt – test",
            assessmentNameEn: "Public order officer – test",
            completedAt: "2026-06-01T09:00:00Z",
          },
        ]),
        claimAssessmentAssignment: async (route) => {
          const body = route.request().postData() ?? "";
          if (body.includes("asg-bad"))
            return route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
          await new Promise((r) => setTimeout(r, 300));
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              result: { linked: true, runId: "att-linked" },
              error: null,
              context: {},
            }),
          });
        },
      },
    });
    const okRow = page.locator('[data-linkable-row="asg-ok"]');
    await expect(okRow.locator("[data-link-earlier-cta]")).toHaveText(
      /Koppla resultatet till mitt konto/,
    );
    await okRow.locator("[data-link-earlier-cta]").click();
    await expect(okRow.locator("[data-link-earlier-cta]")).toHaveAttribute("aria-busy", "true");
    await expect(okRow.locator("[data-link-success]")).toBeVisible();
    await expect(okRow.locator("[data-link-open]")).toHaveAttribute("href", "/academy/att-linked");

    const badRow = page.locator('[data-linkable-row="asg-bad"]');
    await badRow.locator("[data-link-earlier-cta]").click();
    await expect(badRow.locator("[data-link-error]")).toBeVisible();
    await expect(badRow.locator("[data-link-earlier-cta]")).toHaveText(/Försök igen/);
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

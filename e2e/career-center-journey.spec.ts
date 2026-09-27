// The Career Center journey, clicked through in a real browser.
//
//   choose or receive a profession → open the correct information →
//   understand the next step → continue without losing context
//
// Covers what the render-level guard (scripts/career-center-journey-check.tsx)
// and the database evidence (scripts/career-center-persistence-local.ts)
// cannot: navigation, the browser's Back, scroll position after a direct
// link, keyboard operation, and layout at phone width (run it under the
// `mobile-375` project as well as `chromium`).
//
// Backend handling follows e2e/career-center-pilot.spec.ts: every
// `/_serverFn/*` call is intercepted and an unstubbed one fails loudly.
//
// Run: E2E_BASE_URL=http://localhost:3100 bunx playwright test \
//        e2e/career-center-journey.spec.ts --project=chromium --project=mobile-375
//
// CI runs it in the `public-entry-browser` job, against the dev server that
// job pins to port 3100 and without setting E2E_BASE_URL -- the same default
// e2e/support/public-entry-harness.ts gives the explore-link suite beside it.

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const HUB = `${BASE}/career-center`;
const USER_ID = "00000000-0000-4000-8000-00000000c0de";

type Reply = { body: unknown } | { error: string };
const ok = (body: unknown): Reply => ({ body });

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

async function stubServerFns(page: Page, replies: Record<string, Reply>): Promise<string[]> {
  const unmatched: string[] = [];
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    const reply = replies[name];
    if (!reply) {
      unmatched.push(name);
      return route.fulfill({ status: 500, contentType: "text/plain", body: `UNSTUBBED:${name}` });
    }
    if ("error" in reply) {
      return route.fulfill({ status: 500, contentType: "text/plain", body: reply.error });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: reply.body, error: null, context: {} }),
    });
  });
  return unmatched;
}

const BASE_REPLIES: Record<string, Reply> = {
  trackV31FunnelEvent: ok({ recorded: true }),
  countMyAcademyWork: ok({ total: 0, actionable: 0 }),
  countMyReviewQueue: ok(0),
  listMyEmployerWorkspaces: ok([]),
  getMySecurityCareerProfile: ok(null),
};

async function signIn(page: Page): Promise<void> {
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: USER_ID, aud: "authenticated", email: "journey@example.test" }),
    }),
  );
  await page.addInitScript((uid) => {
    // Plant the session under whatever sb-*-auth-token key the client reads.
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.*-auth-token$/.test(key)) {
        return JSON.stringify({
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: "authenticated", role: "authenticated", email: "j@example.test" },
        });
      }
      return getItem.call(this, key);
    };
  }, USER_ID);
}

async function setLang(page: Page, lang: "sv" | "en"): Promise<void> {
  await page.addInitScript((l) => {
    try {
      window.localStorage.setItem("cqrityjob.lang", l);
    } catch {
      /* private mode */
    }
  }, lang);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(o.scrollW).toBeLessThanOrEqual(o.clientW + 1);
}

/** A stored v3.1 result whose first-ranked profession (Säkerhetssamordnare)
 *  differs from the saved current profession (Väktare), with Polis — which
 *  has no published guide — among the alternatives. */
const SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222";
const STORED = {
  status: "v3.1",
  snapshotId: SNAPSHOT_ID,
  sessionId: null,
  generatedAt: "2026-09-20T09:00:00Z",
  versions: { definition: "v3.1", content: "1", scoring: "1", taxonomy: "1" },
  snapshot: {
    completedAt: "2026-09-20T09:00:00Z",
    locale: "sv",
    professions: {
      ranked: [
        {
          rank: 1,
          confidence: "moderate",
          match: {
            titleSv: "Säkerhetssamordnare",
            titleEn: "Security Coordinator",
            cigProfessionSlug: "sakerhetssamordnare",
            inclusionRationaleSv: "Du trivs med att samordna och strukturera säkerhetsarbete.",
            inclusionRationaleEn: "You enjoy coordinating and structuring security work.",
            stage: "possible_next_step",
            alignedDimensions: [],
          },
        },
        {
          rank: 2,
          confidence: "indicative",
          match: { titleSv: "Polis", titleEn: "Police Officer", cigProfessionSlug: "polis" },
        },
      ],
    },
    outputB: { leading: { patternId: "p1", name: "Strukturerad" }, supporting: [] },
  },
};
const ACTIVE = {
  kind: "discovery_v3_1",
  contract: "v3.1",
  snapshotId: SNAPSHOT_ID,
  generatedAt: STORED.generatedAt,
  definitionVersion: "v3.1",
  scoringVersion: "1",
  isInternalTest: false,
  locale: "sv",
  identity: {},
};
const PROFILE_VAKTARE = {
  profileVersion: "security-career-profile-v1",
  currentStatus: "working_in_industry",
  currentProfessionSlug: "vaktare",
  currentProfessionOther: null,
  yearsOfExperience: "3-5",
  updatedAt: "2026-09-01T00:00:00Z",
};
const POLIS_DETAIL = {
  polis: {
    slug: "polis",
    titleSv: "Polis",
    titleEn: "Police Officer",
    isRegulated: true,
    jurisdiction: "SE",
    lastVerified: "2026-09-01",
    disclaimerSv: null,
    disclaimerEn: null,
    sources: [{ organisation: "Polismyndigheten", title: "Bli polis", url: "https://polisen.se/" }],
    summarySv: "Polisyrket kräver antagning till polisprogrammet via Polismyndigheten.",
    summaryEn: "Becoming a police officer requires admission to the police programme.",
    overviewSv: null,
    overviewEn: null,
    ssykCode: null,
    requirements: [
      {
        titleSv: "Säkerhetsprövning",
        titleEn: "Security screening",
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

const SIGNED_IN = {
  ...BASE_REPLIES,
  getMySecurityCareerProfile: ok(PROFILE_VAKTARE),
  getActiveCareerReport: ok(ACTIVE),
  getStoredDiscoveryReport: ok(STORED),
  getProfessionDetails: ok(POLIS_DETAIL),
};

/* ================================================================== */

test.describe("public catalogue", () => {
  test("the direct link opens the catalogue and lands on it", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?all=true#utforska-yrken`, { waitUntil: "networkidle" });
    await expect(page.locator("#yrkeskatalog")).toBeVisible();
    await expect(page.locator("[data-catalogue-toggle]")).toHaveAttribute("aria-expanded", "true");
    const top = await page
      .locator("#utforska-yrken")
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(top, "the catalogue section is at the top of the viewport").toBeLessThan(160);
    expect(top).toBeGreaterThan(-40);
    await noHorizontalScroll(page);
  });

  test("a hand-typed ?all=1 opens it too", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?all=1`, { waitUntil: "networkidle" });
    await expect(page.locator("#yrkeskatalog")).toBeVisible();
  });

  test("every published card reaches its own guide, and the way back keeps the filters", async ({
    page,
  }) => {
    // Every published guide is opened from a fresh catalogue -- eleven or
    // more full page loads before the filter round trip -- which is longer
    // than Playwright's 30-second default on a CI runner.
    test.setTimeout(120_000);
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?all=true#utforska-yrken`, { waitUntil: "networkidle" });
    const hrefs = await page
      .locator('#yrkeskatalog a[href^="/career-center/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThanOrEqual(11);
    for (const href of new Set(hrefs)) {
      await page.goto(`${HUB}?all=true#utforska-yrken`, { waitUntil: "networkidle" });
      await page.locator(`#yrkeskatalog a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator("h1")).not.toHaveText(/inte publicerad/);
    }

    // Filters survive the round trip, by the named way back and by Back.
    await page.goto(`${HUB}?all=true&level=entry#utforska-yrken`, { waitUntil: "networkidle" });
    const first = page.locator('#yrkeskatalog a[href^="/career-center/"]').first();
    await first.click();
    const back = page.locator('[data-profession-back="catalogue"]');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/level=entry/);
    await expect(page.locator("#yrkeskatalog")).toBeVisible();
    await page.locator('#yrkeskatalog a[href^="/career-center/"]').first().click();
    await page.goBack();
    await expect(page).toHaveURL(/level=entry/);
  });

  test("a guide's deep links still land (#karriarsteg, #utbildning)", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    for (const hash of ["karriarsteg", "utbildning"]) {
      await page.goto(`${HUB}/security-officer#${hash}`, { waitUntil: "networkidle" });
      await expect(page.locator(`#${hash}`)).toBeInViewport();
    }
    // A CIG slug in the guide's URL space reaches the right guide.
    await page.goto(`${HUB}/vaktare`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/career-center\/security-officer$/);
  });
});

test.describe("Vilket yrke arbetar du i i dag?", () => {
  test("choosing a profession shows it, reads about it and explains the next step", async ({
    page,
  }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}#fran-mitt-yrke`, { waitUntil: "networkidle" });
    const path = page.locator("[data-path-from]");
    // Keyboard: the control is labelled and operable.
    await page.getByLabel("Ditt yrke").focus();
    await page.getByLabel("Ditt yrke").selectOption("ordningsvakt");
    await expect(page).toHaveURL(/from=ordningsvakt/);
    await expect(path.locator('[data-path-selected="ordningsvakt"]')).toBeVisible();
    await expect(path.locator("[data-path-next-link]")).toBeVisible();
    await path.locator('[data-profession-info="ordningsvakt"]').click();
    await expect(page).toHaveURL(/\/career-center\/ordningsvakt$/);
    await expect(page.locator("h1")).toHaveText("Ordningsvakt");
    await page.locator('[data-profession-back="current_role"]').click();
    await expect(page).toHaveURL(/from=ordningsvakt/);
    await noHorizontalScroll(page);
  });

  test("signed in: the saved profession is the default; temporary, reset and clear behave", async ({
    page,
  }) => {
    await signIn(page);
    await stubServerFns(page, SIGNED_IN);
    await page.goto(HUB, { waitUntil: "networkidle" });
    const path = page.locator("[data-path-from]");
    await expect(path.locator('[data-path-selected="security-officer"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(path.locator("[data-path-provenance]")).toHaveAttribute(
      "data-path-provenance",
      "profile",
    );

    await page.getByLabel("Ditt yrke").selectOption("skyddsvakt");
    await expect(path.locator("[data-path-provenance]")).toHaveAttribute(
      "data-path-provenance",
      "selected",
    );
    await expect(path).toContainText("Din profil är oförändrad");

    await path.locator("[data-path-clear]").click();
    await expect(page).toHaveURL(/from=none/);
    await expect(path).toHaveAttribute("data-path-state", "unknown");
    await expect(path.locator("[data-path-selected]")).toHaveCount(0);

    await path.locator("[data-path-reset]").click();
    await expect(page).not.toHaveURL(/from=/);
    await expect(path.locator('[data-path-selected="security-officer"]')).toBeVisible();
  });
});

test.describe("signed in with a completed assessment", () => {
  test("the first-ranked profession leads, differs from the current one, and both open correctly", async ({
    page,
  }) => {
    await signIn(page);
    await stubServerFns(page, SIGNED_IN);
    await page.goto(HUB, { waitUntil: "networkidle" });
    const fit = page.locator("[data-personal-direction]");
    await expect(fit).toHaveAttribute("data-personal-state", "ready", { timeout: 15_000 });

    // Near the top: the personal section comes before the current-role one.
    const fitTop = await fit.evaluate((el) => el.getBoundingClientRect().top);
    const pathTop = await page
      .locator("[data-path-from]")
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(fitTop).toBeLessThan(pathTop);

    const primary = fit.locator("[data-personal-primary]");
    await expect(primary).toContainText("Säkerhetssamordnare");
    await expect(primary).toContainText("samordna och strukturera");
    await expect(page.locator('[data-path-selected="security-officer"]')).toBeVisible();

    await primary.locator('[data-profession-info="security-coordinator"]').click();
    await expect(page).toHaveURL(/\/career-center\/security-coordinator$/);
    await page.locator('[data-profession-back="recommendation"]').click();
    await expect(page).toHaveURL(/\/career-center#min-riktning$/);

    // An alternative without a guide opens its own catalogue page.
    await fit.locator('[data-profession-info="polis"]').click();
    await expect(page).toHaveURL(/\/career-center\/yrke\/polis$/);
    await expect(page.locator("h1")).toHaveText("Polis");
    await expect(page.locator("[data-profession-section-nav]")).toBeVisible();
    await expect(page.locator("#kallor")).toContainText("Bli polis");
    await noHorizontalScroll(page);
  });

  test("English, and a failed read is its own state", async ({ page }) => {
    await setLang(page, "en");
    await signIn(page);
    await stubServerFns(page, { ...SIGNED_IN, getActiveCareerReport: { error: "boom" } });
    await page.goto(HUB, { waitUntil: "networkidle" });
    const fit = page.locator("[data-personal-direction]");
    await expect(fit).toHaveAttribute("data-personal-state", "unreadable", { timeout: 15_000 });
    await expect(fit.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator("[data-path-from]")).toContainText("Possible next steps from");
  });
});

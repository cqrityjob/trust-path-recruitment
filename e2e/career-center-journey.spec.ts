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

/** Every published guide's link in the hub's list. */
async function listHrefs(page: Page): Promise<string[]> {
  return page
    .locator('#yrkeskatalog a[href^="/career-center/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
}

test.describe("every profession, shown", () => {
  test("the hub lists every guide as a card, with no search or filter in the way", async ({
    page,
  }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}#utforska-yrken`, { waitUntil: "networkidle" });
    const list = page.locator("#utforska-yrken");
    await expect(page.locator("#yrkeskatalog")).toBeVisible();
    expect(new Set(await listHrefs(page)).size).toBeGreaterThanOrEqual(11);
    // The retired explorer: no search box, no filter, no "show all" toggle.
    await expect(list.locator("input, select")).toHaveCount(0);
    await expect(list.getByRole("button")).toHaveCount(0);
    await expect(list).not.toContainText("Sök bland yrkesguiderna");
    const top = await list.evaluate((el) => el.getBoundingClientRect().top);
    expect(top, "the list is at the top of the viewport").toBeLessThan(160);
    expect(top).toBeGreaterThan(-40);
    await noHorizontalScroll(page);
  });

  test("an old catalogue link still lands on the list, and its filters narrow nothing", async ({
    page,
  }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}#utforska-yrken`, { waitUntil: "networkidle" });
    const all = new Set(await listHrefs(page));

    for (const legacy of ["all=true", "all=1&level=senior&q=zzz&family=nope&more=1"]) {
      await page.goto(`${HUB}?${legacy}#utforska-yrken`, { waitUntil: "networkidle" });
      await expect(page.locator("#yrkeskatalog")).toBeVisible();
      expect(new Set(await listHrefs(page)), `?${legacy} shows every guide`).toEqual(all);
      // The address is cleaned: a filter that does nothing is not kept, and
      // not passed on when the link is shared.
      await expect(page).toHaveURL(/\/career-center#utforska-yrken$/);
      await expect(page.locator("#utforska-yrken")).toBeInViewport();
    }

    // The reader's current profession is not a filter, and survives.
    await page.goto(`${HUB}?from=ordningsvakt&level=entry`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\?from=ordningsvakt$/);
    await expect(page.locator('[data-path-selected="ordningsvakt"]')).toBeVisible();
  });

  test("every card reaches its own guide, and the way back returns to the list", async ({
    page,
  }) => {
    // Every published guide is opened from a fresh hub -- eleven or more full
    // page loads before the round trip -- which is longer than Playwright's
    // 30-second default on a CI runner.
    test.setTimeout(120_000);
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}#utforska-yrken`, { waitUntil: "networkidle" });
    const hrefs = await listHrefs(page);
    for (const href of new Set(hrefs)) {
      await page.goto(`${HUB}#utforska-yrken`, { waitUntil: "networkidle" });
      await page.locator(`#yrkeskatalog a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.locator("h1")).not.toHaveText(/inte publicerad/);
    }

    // By the named way back…
    await page.goto(`${HUB}#utforska-yrken`, { waitUntil: "networkidle" });
    await page.locator('#yrkeskatalog a[href^="/career-center/"]').first().click();
    const back = page.locator('[data-profession-back="catalogue"]');
    await expect(back).toHaveText(/Tillbaka till alla yrken/);
    await back.click();
    await expect(page).toHaveURL(/\/career-center#utforska-yrken$/);
    await expect(page.locator("#utforska-yrken")).toBeInViewport();
    // …and by the browser's Back.
    await page.locator('#yrkeskatalog a[href^="/career-center/"]').first().click();
    await expect(page).toHaveURL(/\/career-center\/[a-z-]+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/career-center#utforska-yrken$/);
    await expect(page.locator("#yrkeskatalog")).toBeVisible();
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
  test("choosing a profession shows it and its next professions, each one click away", async ({
    page,
  }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}#fran-mitt-yrke`, { waitUntil: "networkidle" });
    const path = page.locator("[data-path-from]");
    // Keyboard: the control is labelled and operable.
    await page.getByLabel("Ditt yrke").focus();
    await page.getByLabel("Ditt yrke").selectOption("security-officer");
    await expect(page).toHaveURL(/from=security-officer/);

    // The profession itself: named, with what the work involves.
    const selected = path.locator('[data-path-selected="security-officer"]');
    await expect(selected).toBeVisible();
    await expect(selected.locator("h3")).toHaveText("Väktare");
    await expect(selected.locator("[data-path-tasks] li").first()).toBeVisible();

    // Its next professions, on the page — no further choice in between.
    await expect(path.locator("#nasta-steg-fran-yrke h3").first()).toHaveText(
      /Möjliga nästa yrken från Väktare/,
    );
    const links = path.locator("[data-path-next] [data-next-profession-link]");
    await expect(links).toHaveCount(4);
    await expect(path.locator("[data-path-next] [data-next-connection]")).toHaveCount(4);
    for (const label of await links.allTextContents()) {
      expect(label.trim()).toMatch(/^Läs om \S/);
    }

    // One click opens the named profession, and the way back returns here.
    const card = path.locator('[data-next-profession="skyddsvakt"]');
    await expect(card.locator("h4")).toHaveText("Skyddsvakt");
    await card.locator("[data-next-profession-link]").click();
    await expect(page).toHaveURL(/\/career-center\/skyddsvakt$/);
    await expect(page.locator("h1")).toHaveText("Skyddsvakt");
    await page.locator('[data-profession-back="current_role"]').click();
    await expect(page).toHaveURL(/from=security-officer#fran-mitt-yrke$/);
    await expect(path.locator('[data-path-selected="security-officer"]')).toBeVisible();

    // The chosen profession's own guide, and Back.
    await path.locator('[data-profession-info="security-officer"]').click();
    await expect(page).toHaveURL(/\/career-center\/security-officer$/);
    await expect(page.locator("h1")).toHaveText("Väktare");
    await page.goBack();
    await expect(page).toHaveURL(/from=security-officer/);
    await expect(path.locator('[data-path-selected="security-officer"]')).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("a profession with no recorded next profession says so, and is not a dead end", async ({
    page,
  }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?from=aml-specialist#fran-mitt-yrke`, { waitUntil: "networkidle" });
    const path = page.locator("[data-path-from]");
    await expect(path.locator('[data-path-selected="aml-specialist"]')).toBeVisible();
    const empty = path.locator('[data-path-next="empty"]');
    await expect(empty).toContainText("AML-specialist");
    await expect(path.locator("[data-next-profession-link]")).toHaveCount(0);
    // What the guide does record, labelled as related — not as a next step.
    await expect(empty.locator("[data-path-related]")).toContainText("Risk Manager");
    await empty.locator('[data-path-related] a[href="/career-center/risk-manager"]').click();
    await expect(page).toHaveURL(/\/career-center\/risk-manager$/);
    await page.goBack();
    // And every other profession, one link away.
    await path.locator("[data-path-all]").click();
    await expect(page).toHaveURL(/#utforska-yrken$/);
    await expect(page.locator("#utforska-yrken")).toBeInViewport();
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
    await expect(path.locator("[data-path-next] [data-next-profession-link]")).toHaveCount(4);

    await page.getByLabel("Ditt yrke").selectOption("skyddsvakt");
    await expect(path.locator("[data-path-provenance]")).toHaveAttribute(
      "data-path-provenance",
      "selected",
    );
    await expect(path).toContainText("Din profil är oförändrad");
    // The temporary choice lives in the address, so a reload keeps it.
    await page.reload({ waitUntil: "networkidle" });
    await expect(path.locator('[data-path-selected="skyddsvakt"]')).toBeVisible({
      timeout: 15_000,
    });

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

  // A saved report is data. An unknown confidence word ("high"), a missing
  // one and null used to take the whole hub down ("This page didn't load").
  // The recommendation stays — same professions, same order, rank 1 first —
  // and only the strength word reads as unavailable.
  for (const [lang, primaryTitle, neutral] of [
    ["sv", "Säkerhetssamordnare", "Bedömningsstyrka saknas"],
    ["en", "Security Coordinator", "Assessment confidence unavailable"],
  ] as const) {
    test(`[${lang}] a saved report with unknown confidence words keeps its recommendation`, async ({
      page,
    }) => {
      const [first, second] = STORED.snapshot.professions.ranked;
      const { confidence: _dropped, ...secondWithoutConfidence } = second;
      const odd = {
        ...STORED,
        snapshot: {
          ...STORED.snapshot,
          professions: {
            ranked: [
              { ...first, confidence: "high" },
              secondWithoutConfidence,
              {
                rank: 3,
                confidence: null,
                match: {
                  titleSv: "Väktare",
                  titleEn: "Security Officer",
                  cigProfessionSlug: "vaktare",
                },
              },
            ],
          },
        },
      };
      await setLang(page, lang);
      await signIn(page);
      await stubServerFns(page, { ...SIGNED_IN, getStoredDiscoveryReport: ok(odd) });
      await page.goto(HUB, { waitUntil: "networkidle" });
      const fit = page.locator("[data-personal-direction]");
      await expect(fit).toHaveAttribute("data-personal-state", "ready", { timeout: 15_000 });

      const primary = fit.locator("[data-personal-primary]");
      await expect(primary).toHaveAttribute("data-rank", "1");
      await expect(primary.locator("h3")).toHaveText(primaryTitle);
      await expect(primary.locator("[data-confidence]")).toHaveAttribute(
        "data-confidence",
        "unavailable",
      );
      await expect(primary.locator("[data-confidence]")).toHaveText(neutral);
      const ranks = await fit
        .locator("[data-personal-recommendation]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-rank")));
      expect(ranks).toEqual(["1", "2", "3"]);
      await expect(fit.locator('[data-confidence="unavailable"]')).toHaveCount(3);
      // The rest of the hub is intact.
      await expect(page.locator("[data-path-from]")).toBeVisible();
      await expect(page.locator("#yrkeskatalog")).toBeVisible();
      await noHorizontalScroll(page);
    });
  }

  test("English, and a failed read is its own state", async ({ page }) => {
    await setLang(page, "en");
    await signIn(page);
    await stubServerFns(page, { ...SIGNED_IN, getActiveCareerReport: { error: "boom" } });
    await page.goto(HUB, { waitUntil: "networkidle" });
    const fit = page.locator("[data-personal-direction]");
    await expect(fit).toHaveAttribute("data-personal-state", "unreadable", { timeout: 15_000 });
    await expect(fit.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator("[data-path-from]")).toContainText(
      "Possible next professions from Security Officer",
    );
  });
});

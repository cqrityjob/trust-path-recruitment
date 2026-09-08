// The Career Center, in a real browser, walked the way a reader walks it.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// `scripts/career-center-check.ts` reads source text and pure data: it can
// assert that a transition is classified `long_term`, that the ordering
// function cannot see a placement, that the copy says "inte registrerad".
// It cannot tell you that the badge renders, that the personal section
// actually swaps when a session appears, that every link on the hub LANDS on
// a guide rather than on "den här yrkesguiden är inte publicerad ännu", or
// that nothing scrolls sideways at 375px.
//
// So this spec walks the pilot's own acceptance list:
//
//   * an anonymous reader can understand the page and reach a guide
//   * a signed-in reader with a report sees at most three real
//     recommendations, each with a stated reason
//   * a signed-in reader WITHOUT a report gets no personal claims at all
//   * Väktare -> Ordningsvakt is marked as an authority gate
//   * Väktare -> Säkerhetschef is marked long-term and names the middle role
//   * formal requirements are visually separated from recommended development
//   * a merit not in the Passport is "inte registrerad", never "saknas"
//   * no sponsored placement exists, and none influences anything
//   * every internal Career Center link resolves to a published guide
//   * Swedish and English both work
//   * 375px, 1440px and 200% zoom hold without horizontal scroll
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// It is not reached. Every `/_serverFn/*` call is intercepted; an unstubbed
// one fails loudly rather than resolving to nothing, because a silently
// empty read is how a scenario passes while testing a page that never
// loaded. The signed-in scenarios plant a session under the key supabase-js
// actually asks for, OBSERVED rather than hardcoded, since that key is
// derived from the project URL and differs between environments.
//
// Run:  E2E_BASE_URL=http://localhost:3141 bunx playwright test e2e/career-center-pilot.spec.ts

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3141";
const USER_ID = "00000000-0000-4000-8000-0000000000cc";
const HUB = `${BASE}/career-center`;

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

/** supabase-js derives its storage key from the project URL, so it differs
 *  between a local stack, a preview and production. Observe it rather than
 *  guessing: a wrong key plants a session nothing reads, and every signed-in
 *  assertion then quietly tests the signed-out page. */
async function observeStorageKey(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __sbKeys: string[] }).__sbKeys = seen;
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.*-auth-token$/.test(key) && !seen.includes(key)) seen.push(key);
      return getItem.call(this, key);
    };
  });
}

/** Reads the key the client actually asked for. Fails loudly when nothing was
 *  observed: planting a session under an empty key writes a value nothing
 *  reads, and every signed-in assertion below would then quietly re-test the
 *  signed-out page. */
async function storageKey(page: Page): Promise<string> {
  await page.waitForTimeout(500);
  const key = await page.evaluate(
    () => (window as unknown as { __sbKeys?: string[] }).__sbKeys?.[0] ?? null,
  );
  expect(key, "the Career Center never read a Supabase session key").not.toBeNull();
  return key as string;
}

async function plantSession(page: Page, key: string): Promise<void> {
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: USER_ID, aud: "authenticated", email: "cc@example.test" }),
    }),
  );
  await page.evaluate(
    ([k, uid]) =>
      window.localStorage.setItem(
        k,
        JSON.stringify({
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: "authenticated", role: "authenticated", email: "cc@example.test" },
        }),
      ),
    [key, USER_ID] as const,
  );
}

/* ------------------------------------------------------------------ */
/* Server-function stubbing                                            */
/* ------------------------------------------------------------------ */

type Reply = { body: unknown } | { error: string };

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

/** A v3.1 snapshot shaped exactly as `deriveCareerDirection` reads it: three
 *  ranked occupations, one of them flagged `indicative`, one of them a role
 *  with no published Career Center guide. All three cases in one fixture. */
const V31_SNAPSHOT = {
  status: "v3.1",
  snapshotId: "11111111-1111-4111-8111-111111111111",
  sessionId: null,
  generatedAt: "2026-09-01T09:00:00Z",
  versions: { definition: "v3.1", content: "1", scoring: "1", taxonomy: "1" },
  snapshot: {
    completedAt: "2026-09-01T09:00:00Z",
    locale: "sv",
    professions: {
      ranked: [
        {
          rank: 1,
          confidence: "high",
          match: {
            titleSv: "Väktare",
            titleEn: "Security Officer",
            cigProfessionSlug: "vaktare",
          },
        },
        {
          rank: 2,
          confidence: "indicative",
          match: {
            titleSv: "Säkerhetssamordnare",
            titleEn: "Security Coordinator",
            cigProfessionSlug: "sakerhetssamordnare",
          },
        },
        {
          rank: 3,
          confidence: "high",
          match: { titleSv: "Polis", titleEn: "Police Officer", cigProfessionSlug: "polis" },
        },
      ],
    },
    outputB: { leading: { patternId: "p1", name: "Strukturerad" }, supporting: [] },
  },
};

async function stubServerFns(page: Page, replies: Record<string, Reply>): Promise<string[]> {
  const unmatched: string[] = [];
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    const reply = replies[name];
    if (!reply) {
      // An unstubbed server function is a HOLE IN THE TEST, not a passing
      // case: answering with null lets a query succeed with nothing and hides
      // whichever read the scenario forgot.
      unmatched.push(name);
      return route.fulfill({ status: 500, contentType: "text/plain", body: `UNSTUBBED:${name}` });
    }
    if ("error" in reply) {
      return route.fulfill({ status: 500, contentType: "text/plain", body: reply.error });
    }
    // The client unwraps `{ result, error, context }`; a bare value reads as
    // `undefined`.
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: reply.body, error: null, context: {} }),
    });
  });
  return unmatched;
}

/** Every read a Career Center page can make. Funnel tracking is
 *  fire-and-forget and must never affect a click, so it always answers.
 *
 *  The three header reads only fire for a signed-in visitor — the site header
 *  renders its own badges — and are stubbed here rather than per scenario so
 *  the "no unstubbed reads" assertion stays meaningful. */
const BASE_REPLIES: Record<string, Reply> = {
  trackV31FunnelEvent: ok({ recorded: true }),
  countMyAcademyWork: ok({ total: 0, actionable: 0 }),
  countMyReviewQueue: ok(0),
  listMyEmployerWorkspaces: ok([]),
};

async function setLang(page: Page, lang: "sv" | "en"): Promise<void> {
  await page.addInitScript(
    (l) => {
      try {
        window.localStorage.setItem("cqrityjob.lang", l);
      } catch {
        /* private mode */
      }
    },
    lang,
  );
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth };
  });
  // One pixel of tolerance for sub-pixel layout rounding; anything more is a
  // real overflow a reader has to scroll sideways past.
  expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
}

/* ================================================================== */
/* 1. An anonymous reader                                              */
/* ================================================================== */

test.describe("anonymous reader", () => {
  test("understands the page, sees no personal claim, and reaches a guide", async ({ page }) => {
    await observeStorageKey(page);
    const unmatched = await stubServerFns(page, BASE_REPLIES);
    await page.goto(HUB);

    await expect(
      page.getByRole("heading", { level: 1, name: /Utforska yrken och hitta din nästa karriärväg/ }),
    ).toBeVisible();

    // ONE primary action in the hero. The pilot's whole complaint about the
    // old page was three competing calls to action above the fold.
    const hero = page.locator("section").first();
    await expect(hero.getByRole("link", { name: /Utforska alla yrken/ })).toBeVisible();
    await expect(hero.getByRole("link", { name: /karriäranalys|karriärtest/i })).toHaveCount(0);

    // The personal section resolves to a state that claims nothing personal.
    const personal = page.locator("[data-personal-direction]");
    await expect(personal).toHaveAttribute("data-personal-state", "anonymous", { timeout: 10_000 });
    await expect(personal.locator("[data-personal-recommendation]")).toHaveCount(0);
    await expect(personal).toContainText("Har du gjort analysen tidigare?");

    // The catalogue is reachable and every card leads somewhere.
    const cards = page.locator('a[href^="/career-center/"]');
    expect(await cards.count()).toBeGreaterThan(5);

    await page.getByRole("link", { name: /^Väktare$/ }).first().click();
    await expect(page).toHaveURL(/\/career-center\/security-officer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Väktare" })).toBeVisible();
    await expect(page.getByText("Den här yrkesguiden är inte publicerad ännu.")).toHaveCount(0);

    expect(unmatched).toEqual([]);
  });

  test("every internal Career Center link lands on a published guide", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(HUB);
    await page.waitForSelector("[data-personal-direction]");

    const hrefs = await page.evaluate(() =>
      Array.from(new Set(
        Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/career-center/"]')).map(
          (a) => a.getAttribute("href")!,
        ),
      )),
    );
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of hrefs) {
      await page.goto(`${BASE}${href}`);
      // The unavailable state is a real, deliberate state — but nothing the
      // hub links to may reach it.
      await expect(
        page.getByText("Den här yrkesguiden är inte publicerad ännu."),
        `${href} dead-ends on the unavailable state`,
      ).toHaveCount(0);
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("holds at 375px, at 1440px and at 200% zoom", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(HUB);
    await page.waitForSelector("[data-personal-direction]");
    await noHorizontalScroll(page);

    await page.goto(`${BASE}/career-center/security-officer`);
    await noHorizontalScroll(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HUB);
    await noHorizontalScroll(page);

    // 200% zoom is emulated as half the CSS viewport at the same device
    // width, which is exactly what a browser zoom does to layout.
    await page.setViewportSize({ width: 720, height: 900 });
    await page.goto(HUB);
    await page.waitForSelector("[data-personal-direction]");
    await noHorizontalScroll(page);
  });
});

/* ================================================================== */
/* 2. The Väktare journey                                              */
/* ================================================================== */

test.describe("Väktare", () => {
  test.beforeEach(async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${BASE}/career-center/security-officer`);
  });

  test("can follow a comprehensible route towards Ordningsvakt", async ({ page }) => {
    const step = page.locator('[data-transition][data-transition-to="ordningsvakt"]');
    await expect(step).toBeVisible();
    // An authority decision, not a promotion.
    await expect(step).toHaveAttribute("data-transition-kind", "formal_gate");
    await expect(step).toContainText("Kräver utbildning eller myndighetsbeslut");
    await expect(step).toContainText("Förordnande från Polismyndigheten.");
    // Why it is possible at all.
    await expect(step).toContainText("Kompetenser som båda rollerna efterfrågar");
    await step.getByRole("link", { name: "Se hela yrkesguiden" }).click();
    await expect(page).toHaveURL(/\/career-center\/ordningsvakt$/);
  });

  test("sees a realistic long route towards Säkerhetssamordnare and Säkerhetschef", async ({
    page,
  }) => {
    const near = page.locator('[data-transition][data-transition-to="security-coordinator"]');
    await expect(near).toHaveAttribute("data-transition-kind", "adjacent");
    await expect(near).toContainText("Närliggande steg");

    const far = page.locator('[data-transition][data-transition-to="security-manager"]');
    await expect(far).toHaveAttribute("data-transition-kind", "long_term");
    await expect(far).toContainText("Långsiktigt mål");
    // The whole point: it does not assert the leap, it names the middle.
    await expect(far).toContainText("Möjligt mellansteg");
    await expect(far.locator('[data-transition-via="security-coordinator"]')).toBeVisible();

    // And the middle role is a finished guide that continues the chain.
    await page.goto(`${BASE}/career-center/security-coordinator`);
    await expect(page.getByRole("heading", { level: 1, name: "Säkerhetssamordnare" })).toBeVisible();
    // It is not regulated, and the guide says so where a reader would
    // otherwise assume the opposite.
    await expect(page.locator('[data-regulatory-note="boundary"]')).toContainText(
      "inte ett reglerat yrke",
    );
    await expect(
      page.locator('[data-transition][data-transition-to="security-manager"]'),
    ).toBeVisible();
  });

  test("separates formal requirements from recommended development", async ({ page }) => {
    const panel = page.locator("[data-education-panel]");
    await expect(panel).toBeVisible();
    const formal = panel.locator('[data-education-relevance="formal_requirement"]');
    await expect(formal).toHaveCount(1);
    await expect(formal).toContainText("Väktarutbildning");
    await expect(formal).toContainText("Formellt krav");
    // Four facts per row: what, where, when reviewed, on whose authority.
    await expect(formal).toContainText("Gäller i");
    await expect(formal).toContainText("Granskad");
    await expect(formal).toContainText("Källa");
    // The neutrality statement is on the page, not only in a code comment.
    await expect(page.locator("[data-education-neutrality]")).toContainText(
      "påverkas inte av betalning",
    );
    // No paid placement ships in the pilot, so no disclosure badge renders.
    await expect(page.locator('[data-education-placement="sponsored"]')).toHaveCount(0);
    await expect(page.getByText("Sponsrad utbildningsanordnare")).toHaveCount(0);
  });

  test("describes an unregistered Passport merit as not registered", async ({ page }) => {
    const passport = page.locator("[data-passport-boundary]");
    await expect(passport).toBeVisible();
    await expect(passport).toContainText("inte är registrerad");
    await expect(passport).toContainText("inte att du saknar den");
    await expect(passport).toContainText("kontrollerar inte om du uppfyller kraven");
  });

  test("offers related open jobs through the job catalogue", async ({ page }) => {
    const jobs = page.locator("[data-related-jobs]");
    await expect(jobs).toHaveAttribute("data-jobs-available", "true");
    // The jobs link must carry the CIG slug, because that is what
    // jobs.profession_slug is a foreign key onto.
    await expect(jobs.locator('[data-jobs-link="vaktare"]')).toBeVisible();
  });
});

/* ================================================================== */
/* 3. A signed-in reader                                               */
/* ================================================================== */

test.describe("signed-in reader", () => {
  test("with a report sees at most three real recommendations, each explained", async ({
    page,
  }) => {
    await observeStorageKey(page);
    const unmatched = await stubServerFns(page, {
      ...BASE_REPLIES,
      getActiveCareerReport: ok({
        kind: "discovery_v3_1",
        contract: "v3.1",
        snapshotId: V31_SNAPSHOT.snapshotId,
        generatedAt: V31_SNAPSHOT.generatedAt,
        definitionVersion: "v3.1",
        scoringVersion: "1",
        isInternalTest: false,
        locale: "sv",
        identity: {},
      }),
      getStoredDiscoveryReport: ok(V31_SNAPSHOT),
    });

    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const personal = page.locator("[data-personal-direction]");
    await expect(personal).toHaveAttribute("data-personal-state", "ready", { timeout: 15_000 });

    const items = personal.locator("[data-personal-recommendation]");
    await expect(items).toHaveCount(3);

    // Rank 1 links to the guide the CIG slug bridges to — NOT to
    // /career-center/vaktare, which is not a Career Center slug at all.
    await expect(personal.locator('[data-personal-guide="security-officer"]')).toBeVisible();
    await expect(personal.locator('a[href="/career-center/vaktare"]')).toHaveCount(0);
    await expect(personal.locator('[data-personal-guide="security-coordinator"]')).toBeVisible();

    // Every card says why it is there, and the indicative one says so.
    await expect(items.nth(0)).toContainText("rankade det här yrket högst");
    await expect(items.nth(1)).toContainText("närmaste i katalogen");

    // A recommendation with no published guide is text, not a broken link.
    await expect(items.nth(2)).toContainText("Polis");
    await expect(items.nth(2)).toContainText("ingen publicerad yrkesguide");

    // The boundary sentence, rendered from the model rather than from copy
    // discipline.
    await expect(personal.locator("[data-personal-not-assessed]")).toContainText(
      "har inte prövat formella krav",
    );

    // The hero's primary action follows the reader's state.
    await expect(
      page.locator("section").first().getByRole("link", { name: "Utgå från mitt resultat" }),
    ).toBeVisible();

    expect(unmatched).toEqual([]);
  });

  test("without a report is never given a false personal recommendation", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      getActiveCareerReport: ok({ kind: "none" }),
    });

    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const personal = page.locator("[data-personal-direction]");
    await expect(personal).toHaveAttribute("data-personal-state", "no_result", {
      timeout: 15_000,
    });
    await expect(personal.locator("[data-personal-recommendation]")).toHaveCount(0);
    await expect(personal).toContainText("Vet du inte var du passar in?");
    await expect(personal.getByRole("link", { name: "Gör karriäranalysen" })).toBeVisible();
    // And the hero's primary action stays the general one.
    await expect(
      page.locator("section").first().getByRole("link", { name: "Utforska alla yrken" }),
    ).toBeVisible();
  });

  test("whose report cannot be read is told that, not that they have none", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      getActiveCareerReport: { error: "read failed" },
    });

    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const personal = page.locator("[data-personal-direction]");
    await expect(personal).toHaveAttribute("data-personal-state", "unreadable", {
      timeout: 15_000,
    });
    await expect(personal).toContainText("Vi kan inte läsa din senaste analys just nu");
    await expect(personal.getByRole("button", { name: "Försök igen" })).toBeVisible();
    await expect(personal).not.toContainText("Du har ingen");
  });
});

/* ================================================================== */
/* 4. Language                                                         */
/* ================================================================== */

test.describe("language", () => {
  test("the hub and a guide both work in English", async ({ page }) => {
    await setLang(page, "en");
    await stubServerFns(page, BASE_REPLIES);

    await page.goto(HUB);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Explore professions and find your next career step/,
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore all professions" }).first()).toBeVisible();

    await page.goto(`${BASE}/career-center/security-officer`);
    await expect(page.getByRole("heading", { level: 1, name: "Security Officer" })).toBeVisible();
    await expect(
      page.locator('[data-transition][data-transition-to="ordningsvakt"]'),
    ).toContainText("Requires training or an authority decision");
    await expect(
      page.locator('[data-education-relevance="formal_requirement"]').first(),
    ).toContainText("Formal requirement");
    await expect(page.locator("[data-passport-boundary]")).toContainText("not registered");
    // No untranslated Swedish leaks into the English guide's own chrome.
    await expect(page.locator("[data-education-neutrality]")).toContainText("not affected by");
  });
});

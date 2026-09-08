// The Career Center, in a real browser, walked the way a reader walks it.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARDS CANNOT ─────────────────────
//
// `career-center:check` reads source text and pure data; `career-center:
// negative-controls` proves that guard actually bites; `career-center:sources`
// checks the citations. None of them can tell you that a disclosure opens on
// Enter, that a focus ring is drawn, that the page does not scroll sideways at
// 375px, that the catalogue is genuinely absent from the DOM until asked for,
// or — the one that matters most — that a Supabase read error reaches the
// reader as "we could not read this" rather than as "you have no result".
//
// So this spec walks the corrected acceptance list:
//
//   * pathFrom and fit are two sections, each stating its own basis
//   * neither ever claims eligibility
//   * no Passport request is made from any Career Center page
//   * the operational route renders as independent branches, not a ladder
//   * no published route consumes a placeholder transition as evidence
//   * no transition shows an unsupported frequency label
//   * Act 2023:421 and age 20; the repealed 1980:578 is absent
//   * skyddsvakt: training, approval and assignment are three things
//   * the säkerhetsskyddschef boundary carries scope and the qualifier
//   * ISO 31000/22301 are never presented as ISO-issued personal certificates
//   * progressive disclosure keeps 11 guides and every route detail out of the
//     initial DOM, and deep links still work
//   * Supabase-shaped `{ data, error }` failures fail closed
//   * an empty successful report read does not hang on loading
//   * keyboard navigation, visible focus, 44px targets, heading structure
//   * 1440, 375 and real 200% zoom with no horizontal overflow
//   * Swedish and English throughout
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// It is not reached. Every `/_serverFn/*` call is intercepted; an unstubbed
// one fails loudly rather than resolving to nothing, because a silently empty
// read is how a scenario passes while testing a page that never loaded.
//
// Run: E2E_BASE_URL=http://localhost:3141 bunx playwright test e2e/career-center-pilot.spec.ts

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3141";
const USER_ID = "00000000-0000-4000-8000-0000000000cc";
const HUB = `${BASE}/career-center`;

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

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

/** Fails loudly when nothing was observed: planting a session under an empty
 *  key writes a value nothing reads, and every signed-in assertion would then
 *  quietly re-test the signed-out page. */
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
          match: { titleSv: "Väktare", titleEn: "Security Officer", cigProfessionSlug: "vaktare" },
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

const ACTIVE_V31 = {
  kind: "discovery_v3_1",
  contract: "v3.1",
  snapshotId: V31_SNAPSHOT.snapshotId,
  generatedAt: V31_SNAPSHOT.generatedAt,
  definitionVersion: "v3.1",
  scoringVersion: "1",
  isInternalTest: false,
  locale: "sv",
  identity: {},
};

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

/** Every read a Career Center page can make. The three header reads only fire
 *  for a signed-in visitor. */
const BASE_REPLIES: Record<string, Reply> = {
  trackV31FunnelEvent: ok({ recorded: true }),
  countMyAcademyWork: ok({ total: 0, actionable: 0 }),
  countMyReviewQueue: ok(0),
  listMyEmployerWorkspaces: ok([]),
  getMySecurityCareerProfile: ok(null),
};

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
  // One pixel for sub-pixel rounding; more than that is a real overflow.
  expect(o.scrollW).toBeLessThanOrEqual(o.clientW + 1);
}

/* ================================================================== */
/* 1. The product model: pathFrom, fit, eligibility                    */
/* ================================================================== */

test.describe("the three concepts", () => {
  test("pathFrom answers from a stated role, without a career analysis", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    // Anonymous, no analysis, no account — and the question still gets an
    // answer, because the reader can name their own job.
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });

    const path = page.locator("[data-path-from]");
    await expect(path).toHaveAttribute("data-path-state", "ready");
    await expect(path).toContainText("Vägar från Väktare");
    await expect(path.locator("[data-path-provenance]")).toHaveAttribute(
      "data-path-provenance",
      "selected",
    );

    // The three directions the review asked for, as independent cards.
    for (const slug of ["ordningsvakt", "skyddsvakt", "security-coordinator"]) {
      await expect(path.locator(`[data-transition][data-transition-to="${slug}"]`)).toBeVisible();
    }

    // Never an eligibility claim.
    await expect(path.locator("[data-path-not-eligibility]")).toContainText(
      "inte ett besked om att du är behörig",
    );
  });

  test("the selector writes the URL, is keyboard operable, and deep-links", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    // networkidle plus the section's own marker: interacting with a control
    // before React has attached its handler changes the DOM value and nothing
    // else, which looks exactly like a navigation bug.
    await page.goto(HUB, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");

    const select = page.locator("[data-path-select]");
    await expect(select).toBeVisible();
    // A real labelled control: focusing by keyboard and choosing a value.
    await select.focus();
    await expect(select).toBeFocused();
    await select.selectOption("security-coordinator");

    await expect(page).toHaveURL(/from=security-coordinator/);
    await expect(page.locator("[data-path-from]")).toContainText("Vägar från Säkerhetssamordnare");
    // And the resulting view is a link somebody else can open.
    await page.goto(page.url());
    await expect(page.locator("[data-path-from]")).toHaveAttribute("data-path-state", "ready");
  });

  test("fit and pathFrom are separate sections, each naming its own basis", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      getMySecurityCareerProfile: ok({
        profileVersion: "security-career-profile-v1",
        currentStatus: "employed",
        currentProfessionSlug: "vaktare",
        currentProfessionOther: null,
        yearsOfExperience: "1_3",
        updatedAt: "2026-09-01T00:00:00Z",
      }),
      getActiveCareerReport: ok(ACTIVE_V31),
      getStoredDiscoveryReport: ok(V31_SNAPSHOT),
    });

    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const path = page.locator("[data-path-from]");
    const fit = page.locator("[data-personal-direction]");

    // Two sections, both present, neither merged.
    await expect(path).toHaveAttribute("data-path-state", "ready", { timeout: 15_000 });
    await expect(fit).toHaveAttribute("data-personal-state", "ready", { timeout: 15_000 });

    // pathFrom took the role from the PROFILE and says so.
    await expect(path.locator("[data-path-provenance]")).toHaveAttribute(
      "data-path-provenance",
      "profile",
    );
    await expect(path).toContainText("Utgår från yrket i din profil");
    await expect(path).toContainText("inte från karriäranalysen");

    // fit says its own basis, and neither is headed "recommended for you".
    await expect(fit).toContainText("kommer från din egen karriäranalys");
    await expect(page.getByText(/Rekommenderat för dig/i)).toHaveCount(0);

    // Neither claims eligibility.
    await expect(fit.locator("[data-personal-not-assessed]")).toContainText(
      "har inte prövat formella krav",
    );
    await expect(path.locator("[data-path-not-eligibility]")).toContainText("prövar inte");

    // The report's CIG slug resolves to the Career Center guide, not to a
    // URL that does not exist.
    await expect(fit.locator('[data-personal-guide="security-officer"]')).toBeVisible();
    await expect(fit.locator('a[href="/career-center/vaktare"]')).toHaveCount(0);
  });

  test("an explicit selection overrides the stored profile and says so", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      getMySecurityCareerProfile: ok({
        profileVersion: "security-career-profile-v1",
        currentStatus: "employed",
        currentProfessionSlug: "vaktare",
        currentProfessionOther: null,
        yearsOfExperience: "1_3",
        updatedAt: "2026-09-01T00:00:00Z",
      }),
      getActiveCareerReport: ok({ kind: "none" }),
    });
    await page.goto(`${HUB}?from=security-coordinator`, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const path = page.locator("[data-path-from]");
    await expect(path).toContainText("Vägar från Säkerhetssamordnare", { timeout: 15_000 });
    await expect(path.locator("[data-path-provenance]")).toHaveAttribute(
      "data-path-provenance",
      "selected",
    );
  });

  test("no Career Center page reads the Passport", async ({ page }) => {
    const passportCalls: string[] = [];
    await page.route("**/_serverFn/**", async (route) => {
      const name = exportOf(route.request().url()) ?? "?";
      if (/passport|ProfessionalIdentity|Merit/i.test(name)) passportCalls.push(name);
      const reply = BASE_REPLIES[name];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: reply && "body" in reply ? reply.body : null,
          error: null,
          context: {},
        }),
      });
    });
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
    expect(passportCalls, "the Career Center must not read Passport data").toEqual([]);
    // And it still states the rule for the reader.
    await expect(page.locator("[data-passport-boundary]")).toContainText("inte är registrerad");
    await expect(page.locator("[data-passport-boundary]")).toContainText("inte att du saknar den");
  });
});

/* ================================================================== */
/* 2. Routes are branches, and evidence is earned                      */
/* ================================================================== */

test.describe("routes and evidence", () => {
  test.beforeEach(async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
  });

  test("the route out of Väktare is three independent branches", async ({ page }) => {
    await page.goto(HUB, { waitUntil: "networkidle" });
    const route = page.locator('[data-career-route="from_security_officer"]');
    await expect(route).toHaveAttribute("data-route-origin", "security-officer");
    await expect(route).toHaveAttribute("data-route-branches", "3");
    for (const slug of ["ordningsvakt", "skyddsvakt", "security-coordinator"]) {
      await expect(route.locator(`[data-transition][data-transition-to="${slug}"]`)).toBeVisible();
    }
    // Säkerhetschef is NOT a direction out of Väktare.
    await expect(
      route.locator('[data-transition][data-transition-to="security-manager"]'),
    ).toHaveCount(0);
    // The independence is stated in words, not only implied by layout.
    await expect(route.locator("[data-route-independent]")).toContainText("oberoende av varandra");
    // And nothing numbers the entries.
    await expect(route.getByText(/^Steg \d/)).toHaveCount(0);

    // Säkerhetschef is its own route, from Säkerhetssamordnare. It sits
    // behind the "more routes" disclosure, which is itself the progressive
    // disclosure this section needed — so open it the way a reader would.
    await page.locator("[data-routes-more] summary").click();
    await expect(page.locator("[data-routes-more]")).toHaveAttribute("open", "");
    const onward = page.locator('[data-career-route="from_security_coordinator"]');
    await expect(onward).toHaveAttribute("data-route-origin", "security-coordinator");
    await expect(
      onward.locator('[data-transition][data-transition-to="security-manager"]'),
    ).toBeVisible();
  });

  test("a sourced gate describes itself; an unsourced direction does not", async ({ page }) => {
    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });

    const gate = page.locator('[data-transition][data-transition-to="ordningsvakt"]').first();
    await expect(gate).toHaveAttribute("data-transition-kind", "formal_gate");
    await expect(gate).toHaveAttribute("data-transition-evidence", "reviewed");
    await expect(gate).toContainText("Kräver utbildning eller myndighetsbeslut");

    const unsourced = page
      .locator('[data-transition][data-transition-to="security-coordinator"]')
      .first();
    await expect(unsourced).toHaveAttribute("data-transition-evidence", "under_review");
    await expect(unsourced.locator("[data-transition-under-review]")).toContainText(
      "Möjlig riktning under granskning",
    );
    await expect(unsourced).toContainText("ingen granskad källa");

    // No transition anywhere claims a frequency, because nothing has evidence
    // about transition frequency.
    await expect(page.getByText(/Vanlig övergång|Common transition/)).toHaveCount(0);
  });

  test("the long jump names the intermediate role rather than asserting the leap", async ({
    page,
  }) => {
    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
    const far = page.locator('[data-transition][data-transition-to="security-manager"]').first();
    await expect(far).toHaveAttribute("data-transition-kind", "long_term");
    await far.locator("[data-transition-detail] summary").click();
    await expect(far.locator('[data-transition-via="security-coordinator"]')).toBeVisible();
  });
});

/* ================================================================== */
/* 3. Swedish regulatory facts                                         */
/* ================================================================== */

test.describe("regulatory facts", () => {
  test.beforeEach(async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
  });

  test("ordningsvakt states Act 2023:421 and age 20, and no repealed Act", async ({ page }) => {
    await page.goto(`${BASE}/career-center/ordningsvakt`, { waitUntil: "networkidle" });
    const body = page.locator("body");
    await expect(body).toContainText("2023:421");
    await expect(body).not.toContainText("1980:578");
    await expect(body).toContainText("Ha fyllt 20 år");
    await expect(body).toContainText("föreskriven utbildning");
    await expect(body).toContainText("Bedömas lämplig");
    await expect(body).toContainText("Polismyndigheten");
    // Being a väktare is not a legal prerequisite.
    await expect(body).toContainText("inget rättsligt krav");
  });

  test("skyddsvakt separates training, approval and assignment", async ({ page }) => {
    await page.goto(`${BASE}/career-center/skyddsvakt`, { waitUntil: "networkidle" });
    const body = page.locator("body");
    await expect(body).toContainText("föreskriven utbildning");
    await expect(body).toContainText("länsstyrelsen");
    await expect(body).toContainText("skyddsobjekt");
    await expect(body).not.toContainText("utbildning enligt skyddsobjektets krav");
  });

  test("the säkerhetsskyddschef boundary carries scope and the qualifier", async ({ page }) => {
    await page.goto(`${BASE}/career-center/security-coordinator`, { waitUntil: "networkidle" });
    const note = page.locator('[data-regulatory-note="boundary"]');
    await expect(note).toContainText("inte ett reglerat yrke");
    await expect(note).toContainText("säkerhetskänslig verksamhet");
    await expect(note).toContainText("uppenbart obehövligt");
    await expect(note).toContainText("inte källbelagt");
  });

  test("ISO standards are knowledge areas, never ISO-issued personal certificates", async ({
    page,
  }) => {
    await page.goto(`${BASE}/career-center/security-manager`, { waitUntil: "networkidle" });
    await page.locator("#utbildning").scrollIntoViewIfNeeded();
    const iso = page.locator('[data-education-offer="iso-31000"]');
    await expect(iso).toHaveAttribute("data-education-standard", "true");
    await expect(iso).toHaveAttribute("data-education-relevance", "recommended_development");
    await expect(iso).toContainText("Kunskapsområde");
    await expect(iso).toContainText("inte avsedd för certifiering");
    // The standing statement that a course guarantees nothing.
    await expect(page.locator("[data-education-not-guarantee]")).toContainText("garanterar aldrig");
  });

  test("a formal requirement says which part of the requirement it satisfies", async ({ page }) => {
    await page.goto(`${BASE}/career-center/ordningsvakt`, { waitUntil: "networkidle" });
    const offer = page.locator('[data-education-relevance="formal_requirement"]').first();
    await expect(offer).toBeVisible();
    await expect(offer.locator("[data-education-supports]")).toContainText("9 §");
    await expect(offer.locator("[data-education-supports]")).toContainText(
      "ger i sig inget förordnande",
    );
    await expect(offer).toContainText("Gäller i");
    await expect(offer).toContainText("Granskad");
    await expect(offer).toContainText("Källa");
    // No paid placement ships, so no advertisement renders.
    await expect(page.locator('[data-education-placement="sponsored"]')).toHaveCount(0);
    await expect(page.getByText(/Annons – betald placering/)).toHaveCount(0);
  });
});

/* ================================================================== */
/* 4. Progressive disclosure                                           */
/* ================================================================== */

test.describe("progressive disclosure", () => {
  test("the catalogue and every route detail are absent until asked for", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    // With a stated role, so the pathFrom section renders its detail cards —
    // the surface whose disclosures are being asserted below.
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");

    // The 11-guide catalogue is not rendered on arrival.
    const panel = page.locator("#yrkeskatalog");
    await expect(panel).toBeHidden();
    const toggle = page.locator("[data-catalogue-toggle]");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Path detail is collapsed: the disclosures exist and none is open.
    const details = page.locator("[data-transition-detail]");
    expect(await details.count()).toBeGreaterThan(0);
    expect(await page.locator("[data-transition-detail][open]").count()).toBe(0);

    // The routes section shows SUMMARIES, not detail cards: a summary carries
    // no disclosure at all, which is why it costs a fifth of the height.
    expect(await page.locator("[data-transition-summary] [data-transition-detail]").count()).toBe(
      0,
    );
    // And only the first route group is open.
    await expect(page.locator("[data-routes-more]")).not.toHaveAttribute("open", "");

    // Materially shorter than the flat version, measured where the review
    // measured it: a 375px screen. The hub was ~11,700px there.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, "the 375px hub is still as long as the version that was rejected").toBeLessThan(
      7000,
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");

    // Opening the catalogue is one click, keyboard operable, and lands in the
    // URL so the view is shareable.
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/all=/);
  });

  test("a deep link with a filter opens the catalogue already narrowed", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?level=entry`, { waitUntil: "networkidle" });
    await expect(page.locator("#yrkeskatalog")).toBeVisible();
    await expect(page.locator("[data-catalogue-toggle]")).toHaveAttribute("aria-expanded", "true");
  });

  test("a transition detail opens from the keyboard", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
    const summary = page.locator("[data-transition-detail] summary").first();
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-transition-detail][open]").first()).toBeVisible();
  });

  test("the guide's competencies and sources are folded", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
    await expect(page.locator("[data-competency-disclosure]")).not.toHaveAttribute("open", "");
    await expect(page.locator("[data-sources-disclosure]")).not.toHaveAttribute("open", "");
    // The review date and jurisdiction stay visible — they are what a reader
    // uses to decide whether to trust the page at all.
    await expect(page.getByText("Senast granskad:")).toBeVisible();
    // The inbound routes and the related-profession list are folded too.
    await expect(page.locator("[data-related-disclosure]")).not.toHaveAttribute("open", "");

    // At 375px the guide was ~13,600px and its career-steps section alone
    // was ~4,200px.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(
      height,
      "the 375px guide is still as long as the version that was rejected",
    ).toBeLessThan(9500);
    const steps = await page.evaluate(
      () => document.querySelector("#karriarsteg")?.getBoundingClientRect().height ?? 0,
    );
    expect(steps, "the career-steps section is still as long as it was").toBeLessThan(2600);
  });
});

/* ================================================================== */
/* 5. Read failures fail closed                                        */
/* ================================================================== */

test.describe("personal-data read states", () => {
  test("a Supabase-shaped read error is never reported as 'you have no result'", async ({
    page,
  }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      // NOT an HTTP 500. This is the shape that actually broke: the server
      // function RESOLVES, carrying the failure the handler produced from
      // Supabase's `{ data, error }`. The old code discarded `error` and
      // returned `{ kind: "none" }`.
      getActiveCareerReport: ok({
        kind: "read_failed",
        reason: "cd_report_snapshots: permission denied",
      }),
    });
    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const fit = page.locator("[data-personal-direction]");
    await expect(fit).toHaveAttribute("data-personal-state", "unreadable", { timeout: 15_000 });
    await expect(fit).toContainText("Vi kan inte läsa din senaste analys just nu");
    await expect(fit.getByRole("button", { name: "Försök igen" })).toBeVisible();
    await expect(fit).not.toContainText("Du har ingen");
    await expect(fit).not.toContainText("Vet du inte var du passar in?");
  });

  test("a stored-report read failure also fails closed", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      getActiveCareerReport: ok(ACTIVE_V31),
      getStoredDiscoveryReport: ok({
        status: "read_failed",
        reason: "cd_report_snapshots: timeout",
      }),
    });
    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const fit = page.locator("[data-personal-direction]");
    await expect(fit).toHaveAttribute("data-personal-state", "unreadable", { timeout: 15_000 });
  });

  test("a completed read with empty data does not hang on loading", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, {
      ...BASE_REPLIES,
      // The query SETTLES successfully and carries nothing. This used to
      // leave the section rendering its loading state forever, with no retry.
      getActiveCareerReport: ok(null),
    });
    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const fit = page.locator("[data-personal-direction]");
    await expect(fit).not.toHaveAttribute("data-personal-state", "loading", { timeout: 15_000 });
    await expect(fit).toHaveAttribute("data-personal-state", "unreadable");
    await expect(fit.getByRole("button", { name: "Försök igen" })).toBeVisible();
  });

  test("a signed-in reader with genuinely no analysis is told exactly that", async ({ page }) => {
    await observeStorageKey(page);
    await stubServerFns(page, { ...BASE_REPLIES, getActiveCareerReport: ok({ kind: "none" }) });
    await page.goto(HUB, { waitUntil: "networkidle" });
    await plantSession(page, await storageKey(page));
    await page.reload({ waitUntil: "networkidle" });

    const fit = page.locator("[data-personal-direction]");
    await expect(fit).toHaveAttribute("data-personal-state", "no_result", { timeout: 15_000 });
    await expect(fit.locator("[data-personal-recommendation]")).toHaveCount(0);
    await expect(fit).toContainText("Vet du inte var du passar in?");
  });
});

/* ================================================================== */
/* 6. Links, accessibility, viewports, language                        */
/* ================================================================== */

test.describe("structure and access", () => {
  test("every internal Career Center link lands on a published guide", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?all=1&from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");

    const hrefs = await page.evaluate(() =>
      Array.from(
        new Set(
          Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[href^="/career-center/"]'),
          ).map((a) => a.getAttribute("href")!),
        ),
      ),
    );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
      await expect(
        page.getByText("Den här yrkesguiden är inte publicerad ännu."),
        `${href} dead-ends on the unavailable state`,
      ).toHaveCount(0);
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("headings nest, landmarks exist, and focus is visible", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");

    // Exactly one h1, and no heading level is skipped on the way down.
    expect(await page.locator("h1").count()).toBe(1);
    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
        Number(h.tagName.slice(1)),
      ),
    );
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1], `heading jump at index ${i}`).toBeLessThanOrEqual(1);
    }

    // Landmarks: a main region and named navigation.
    expect(await page.locator("main").count()).toBeGreaterThan(0);
    expect(await page.locator("nav[aria-label]").count()).toBeGreaterThan(0);

    // A visible focus indicator, not merely a focusable element.
    const toggle = page.locator("[data-catalogue-toggle]");
    await toggle.focus();
    const ring = await toggle.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    expect(
      ring.outline !== "none" || ring.shadow !== "none",
      "the focused control draws no visible indicator",
    ).toBeTruthy();
  });

  test("interactive targets are at least 44px", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");

    const small = await page.evaluate(() => {
      const out: string[] = [];
      const scope = document.querySelectorAll(
        "[data-path-from] a, [data-path-from] button, [data-path-from] select, [data-catalogue-toggle], [data-transition] a, [data-transition] summary",
      );
      for (const el of Array.from(scope)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < 44)
          out.push(
            `${el.tagName}: ${Math.round(r.height)}px — ${el.textContent?.trim().slice(0, 40)}`,
          );
      }
      return out;
    });
    expect(small, "controls below the 44px minimum").toEqual([]);
  });

  test("1440, 640, 375 and real 200% zoom hold without horizontal scroll", async ({ page }) => {
    await stubServerFns(page, BASE_REPLIES);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");
    await noHorizontalScroll(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${HUB}?from=security-officer&all=1`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-path-from]");
    await noHorizontalScroll(page);

    await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
    await noHorizontalScroll(page);

    // 640 CSS pixels — the layout width a 1280px window has at 200% zoom, and
    // the size a reader who has turned browser zoom up actually gets.
    await page.setViewportSize({ width: 640, height: 900 });
    for (const url of [
      `${HUB}?from=security-officer`,
      `${HUB}?from=security-officer&all=1`,
      `${BASE}/career-center/security-officer`,
      `${BASE}/career-center/ordningsvakt`,
    ]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await noHorizontalScroll(page);
    }

    // Real 200% zoom: the browser's own page zoom, which changes device pixel
    // ratio as well as layout width — not merely a narrower window. Asserted
    // at both the desktop and the 1280px window a 640px layout comes from.
    const cdp = await page.context().newCDPSession(page);
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
      await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-path-from]");
      await noHorizontalScroll(page);
      await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
      await noHorizontalScroll(page);
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    }
  });

  test("nothing overflows at 375px or 640px in English either", async ({ page }) => {
    await setLang(page, "en");
    await stubServerFns(page, BASE_REPLIES);
    for (const width of [375, 640]) {
      await page.setViewportSize({ width, height: 900 });
      for (const url of [
        `${HUB}?from=security-officer&all=1`,
        `${BASE}/career-center/security-officer`,
        `${BASE}/career-center/security-coordinator`,
      ]) {
        await page.goto(url, { waitUntil: "networkidle" });
        await noHorizontalScroll(page);
      }
    }
  });

  test("the whole journey works in English", async ({ page }) => {
    await setLang(page, "en");
    await stubServerFns(page, BASE_REPLIES);

    await page.goto(`${HUB}?from=security-officer`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Explore professions and find your next career step/,
      }),
    ).toBeVisible();
    const path = page.locator("[data-path-from]");
    await expect(path).toContainText("Paths from Security Officer");
    await expect(path).toContainText("not a decision that you are eligible");
    await expect(page.locator('[data-career-route="from_security_officer"]')).toContainText(
      "independent of one another",
    );

    await page.goto(`${BASE}/career-center/ordningsvakt`, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText("2023:421");
    await expect(page.locator("body")).toContainText("at least 20 years old");
    await expect(
      page.locator('[data-transition][data-transition-to="security-coordinator"]').first(),
    ).toContainText("Possible direction under review");
    await expect(page.locator("[data-passport-boundary]")).toContainText("not registered");
    await expect(page.locator("[data-education-not-guarantee]")).toContainText("never guarantees");
  });
});

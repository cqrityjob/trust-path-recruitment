// The REAL employer landing page (/employers), in a real browser.
//
// ── WHY IT NEEDS ITS OWN SPEC ──────────────────────────────────────────
//
// /employers is where an employer decides whether CQrityjob is for them,
// and it is the one public page that names BESKT — a governed method that
// is assignable only under an owner-issued pilot grant. scripts/
// employer-landing-check.tsx proves the copy and the destinations against
// rendered markup. This proves the things only a browser answers: that the
// three actions LAND somewhere that renders, that the same-page anchor
// actually moves the page and lands ON its target rather than under the
// sticky header, that nothing overflows at 320-1440, and that every control
// is a real 44px target with a visible focus ring.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/employer-landing.spec.ts

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function setLang(page: Page, lang: "sv" | "en"): Promise<void> {
  await page.evaluate((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
  await page.reload({ waitUntil: "networkidle" });
}

test.describe("the employer landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
  });

  // P1 ──────────────────────────────────────────────────────────────────
  test("one h1, and it is the approved sentence", async ({ page }) => {
    expect(await page.locator("main h1").count()).toBe(1);
    await expect(page.locator("main h1")).toHaveText(
      "Hela rekryteringen av säkerhetspersonal i en plattform",
    );
    const text = await page.locator("main").innerText();
    expect(text).toContain(
      "Publicera säkerhetsjobb, hantera ansökningar och använd strukturerade bedömningar och intervjumodeller för både vanliga säkerhetsroller och säkerhetsskyddskänsliga befattningar.",
    );
    // The four abstract benefit tiles are gone.
    for (const gone of [
      "Kandidatbedömning",
      "Kompetensverifiering",
      "Kompetenstest av befintlig personal",
      "Prata med oss",
    ]) {
      expect(text, `"${gone}" is still rendered`).not.toContain(gone);
    }
  });

  // P2 ──────────────────────────────────────────────────────────────────
  test("the connected path is six ordered steps ending in a documented human decision", async ({
    page,
  }) => {
    const steps = await page.locator("#how-it-works h3").allInnerTexts();
    expect(steps.map((s) => s.replace(/^\d+\.\s*/, ""))).toEqual([
      "Publicera jobbet",
      "Ta emot och ordna ansökningarna",
      "Välj bedömning och intervjumodell",
      "Granska underlaget tillsammans",
      "Fatta och dokumentera beslutet",
      "Fortsätt med utveckling",
    ]);
    expect(await page.locator("#how-it-works ol").count()).toBe(1);
    const text = await page.locator("#how-it-works").innerText();
    expect(text).toContain(
      "Människor fattar beslutet, och beslutet dokumenteras med sitt underlag.",
    );
  });

  // P3 ──────────────────────────────────────────────────────────────────
  test("two recruitment examples, and BESKT carries its boundary where it is read", async ({
    page,
  }) => {
    const examples = await page.locator("#examples h3").allInnerTexts();
    expect(examples).toEqual([
      "Ordinarie säkerhetsrekrytering",
      "Säkerhetsskyddskänslig rekrytering",
    ]);
    const text = await page.locator("#examples").innerText();
    expect(text).toContain(
      "BESKT är ett metodstöd. Det ger inget resultat, ingen poäng och ingen rangordning, och det ersätter inte säkerhetsprövning enligt säkerhetsskyddslagen.",
    );
    expect(text).toContain(
      "BESKT är under utveckling och kan användas först efter granskning och ett uttryckligt godkännande för er organisation.",
    );
    expect(text).toContain(
      "Varken CQrityjob eller AI avgör om en kandidat är lämplig — arbetsgivaren fattar och dokumenterar alltid det slutliga beslutet.",
    );
    // The boundary sentence lives INSIDE the example, not in a footnote at
    // the bottom of the page that a reader meets after the claim.
    const card = await page.locator("#examples article").nth(1).innerText();
    expect(card).toContain("ersätter inte säkerhetsprövning");
    // No action into BESKT from a public page — it is not open.
    expect(await page.locator('main a[href*="beskt" i]').count()).toBe(0);
  });

  // P4 ──────────────────────────────────────────────────────────────────
  test("the three actions, and each lands somewhere that renders", async ({ page }) => {
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")),
    );
    expect(hrefs).toEqual([
      "/signup?redirect=%2Femployer",
      "#how-it-works",
      "/login?redirect=%2Femployer",
    ]);

    // Register → the one door, carrying /employer.
    await page.getByRole("link", { name: "Registrera företag" }).click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/employer");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    // The form RESOLVED the intent rather than echoing the URL.
    const swapHref = await page.locator('a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref).toContain("redirect=%2Femployer");

    await page.goBack({ waitUntil: "networkidle" });

    // Existing customer → the same door, same return path.
    await page.getByRole("link", { name: "Logga in i företagsportalen" }).click();
    await page.waitForURL("**/login**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/employer");
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  // P5 ──────────────────────────────────────────────────────────────────
  test('"Se hur plattformen fungerar" scrolls this page, opening no second journey', async ({
    page,
  }) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole("link", { name: "Se hur plattformen fungerar" }).click();
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname, "it must not navigate away").toBe("/employers");
    expect(new URL(page.url()).hash).toBe("#how-it-works");
    expect(await page.evaluate(() => window.scrollY), "the page did not move").toBeGreaterThan(
      before,
    );
    // And it landed ON the section, not under the sticky header.
    const top = await page
      .locator("#how-it-works h2")
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(top, "the heading is hidden behind the sticky header").toBeGreaterThan(0);
  });

  // P6 ──────────────────────────────────────────────────────────────────
  test("English says the same thing, and renders no Swedish", async ({ page }) => {
    await setLang(page, "en");
    const text = await page.locator("main").innerText();
    expect(text).toContain("The complete security recruitment process in one platform");
    expect(text).toContain(
      "BESKT is method support. It produces no result, no score and no ranking, and it does not replace security vetting under the Protective Security Act.",
    );
    expect(text).toContain(
      "Neither CQrityjob nor AI determines whether a candidate is suitable — the employer always makes and documents the final decision.",
    );
    const diacritics = text.match(/\S*[åäöÅÄÖ]\S*/g) ?? [];
    expect(diacritics, `Swedish on the English page: ${diacritics.join(", ")}`).toEqual([]);
    // Career Discovery data is candidate-owned: an employer page never
    // offers it, in either language.
    expect(text).not.toMatch(/career discovery/i);
  });

  // P7 ──────────────────────────────────────────────────────────────────
  test("every interactive target is at least 44px and keeps a visible focus ring", async ({
    page,
  }) => {
    const undersized = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main a, main button")]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? "").trim().slice(0, 30),
            h: Math.round(r.height),
            w: Math.round(r.width),
          };
        })
        .filter((x) => x.h > 0 && (x.h < 44 || x.w < 44)),
    );
    expect(undersized, `Under 44x44 inside main: ${JSON.stringify(undersized)}`).toEqual([]);

    const seen = new Set<string>();
    for (let i = 0; i < 16; i += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return {
          key: `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 24)}`,
          ring: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
        };
      });
      if (!state) continue;
      expect(state.ring, `No visible focus ring on ${state.key}`).toBe(true);
      seen.add(state.key);
    }
    expect(seen.size, "Focus never moved — keyboard trap.").toBeGreaterThan(3);
  });
});

// ── EVERY REQUIRED WIDTH ────────────────────────────────────────────────
test.describe("the employer landing page at every required width", () => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    test(`no horizontal overflow at ${width}px, sv and en`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
      for (const lang of ["sv", "en"] as const) {
        await setLang(page, lang);
        const over = await horizontalOverflow(page);
        expect(over, `${lang} at ${width}px scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});

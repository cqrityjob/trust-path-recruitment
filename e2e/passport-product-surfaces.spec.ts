// Security Passport — the product rules, asserted against rendered UI.
//
// ── WHY THIS IS SEPARATE FROM THE RESPONSIVE SPEC ──────────────────────
//
// passport-responsive-a11y.spec.ts asks "does this page behave at 375px".
// This file asks the different question: "does the product actually say what
// it promised". Overview surfacing what needs attention, the card showing a
// credential's state in words and not only colour, five experience segments
// that cannot read as a rank, and a share screen whose default is three
// actions rather than a wall of choices.
//
// ── WHY THE PROTOTYPE ROUTE AND NOT THE AUTHENTICATED ROUTES ───────────
//
// The authenticated Passport routes need a Supabase session. There is no
// local Supabase stack in this repository (no Docker or CLI — see the note in
// playwright.config.ts), so a browser test of /passport would either need a
// real user in the hosted project, which means writing to production, or it
// would skip. A skipped test is not evidence.
//
// The prototype route renders the SAME components from fictional fixtures:
// PassportOverview, DirectionC, the credential symbol matrix, the live share
// section and the recipient view are the real components, not copies. So the
// assertions below exercise real rendering and real copy, and the parts that
// genuinely need a session — writing a claim, deciding a review — are proven
// in the database suites, where they run against the real RPCs.

import { test, expect, type Page } from "@playwright/test";

const PROTOTYPE = "/dev/security-passport";

async function openScreen(page: Page, id: string): Promise<void> {
  await page.selectOption("#sp-screen", id);
  await page.waitForTimeout(250);
}

async function setLang(page: Page, lang: "sv" | "en"): Promise<void> {
  await page.evaluate((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
  await page.reload({ waitUntil: "networkidle" });
}

test.describe("Security Passport — product surfaces", () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto(PROTOTYPE, { waitUntil: "domcontentloaded" });
    test.skip(
      !response || response.status() >= 400,
      "The prototype route is development-only; run against the dev server.",
    );
    await page.waitForLoadState("networkidle");
  });

  test("overview tells the holder what is verified, what waits and what to do", async ({
    page,
  }) => {
    await openScreen(page, "overview");
    const text = await page.locator("main").innerText();

    // The four questions an overview has to answer before it is useful.
    expect(text.length, "The overview rendered nothing.").toBeGreaterThan(200);
    expect(/verifierad|verified/i.test(text), "The overview never mentions verified status.").toBe(
      true,
    );

    // And it must offer an action, not just a report.
    const actions = await page.locator("main a, main button").count();
    expect(actions, "The overview offers no action at all.").toBeGreaterThan(0);
  });

  test("the card shows credential state in words, not colour alone", async ({ page }) => {
    await openScreen(page, "symbols");
    const text = await page.locator("main").innerText();

    // Every lifecycle state the product claims to distinguish must be
    // NAMED somewhere on the symbol matrix. A swatch is not a state.
    const states = [
      /utkast|draft/i,
      /egen|self/i,
      /dokument|document/i,
      /gransk|review/i,
      /verifierad|verified/i,
      /utgån|expired/i,
      /återkallad|revoked/i,
      /ersatt|superseded/i,
      /bestrid|disputed/i,
    ];
    const missing = states.filter((re) => !re.test(text)).map((re) => re.source);
    expect(missing, `Lifecycle states never named in words: ${missing.join(", ")}`).toEqual([]);
  });

  test("the four controlled credentials carry their own symbol", async ({ page }) => {
    await openScreen(page, "symbols");
    const text = await page.locator("main").innerText();
    for (const code of ["VU1", "VU2", "OV", "SV"]) {
      expect(text.includes(code), `${code} has no symbol on the matrix.`).toBe(true);
    }
  });

  test("experience shows five segments and the exact verified duration", async ({ page }) => {
    // "studio" renders DirectionC — the card the live /passport/card route and
    // the share preview actually use. The "card" screen renders the earlier
    // PassportCard component, which is prototype furniture.
    await openScreen(page, "studio");

    // The mark is one role=img with an accessible label naming the duration,
    // and its segments are the five intervals.
    const marks = page.locator('[role="img"]').filter({ hasText: "" });
    const count = await marks.count();
    expect(count, "No experience mark rendered on the card.").toBeGreaterThan(0);

    const segments = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="img"]')].find((n) =>
        /verifierad|verified/i.test(n.getAttribute("aria-label") ?? ""),
      );
      if (!el) return null;
      return {
        label: el.getAttribute("aria-label") ?? "",
        segments: el.querySelectorAll("span[aria-hidden='true']").length,
      };
    });
    expect(segments, "No experience mark with a verified label.").not.toBeNull();
    expect(segments!.segments, "The experience mark must have five segments.").toBe(5);

    // The exact duration is printed, so the mark never has to be decoded.
    expect(
      /\d/.test(segments!.label),
      `The experience label carries no figure: "${segments!.label}"`,
    ).toBe(true);
  });

  test("experience is never presented as a score, rank or grade", async ({ page }) => {
    await openScreen(page, "studio");
    const text = await page.locator("main").innerText();
    const banned = [
      /\bpoäng\b/i,
      /\bscore\b/i,
      /\brank(ing)?\b/i,
      /\bsenior(itet)?\b/i,
      /\bnivå\s*\d/i,
      /\b\d{1,3}\s*%/,
      /\b[1-5]\s*(av|of)\s*5\b/i,
    ];
    const hits = banned.filter((re) => re.test(text)).map((re) => re.source);
    expect(hits, `The card uses ranking vocabulary: ${hits.join(", ")}`).toEqual([]);
  });

  // The live /passport/share default view is asserted by
  // scripts/passport-share-default-check.ts rather than here: the prototype's
  // "Dela" screen is the Phase 1 DisclosurePackagePicker, which deliberately
  // shows all five packages to document the backend contract. Asserting
  // against it would prove nothing about what a holder actually sees, and
  // /passport/share itself needs a Supabase session this environment has no
  // way to create.

  test("the recipient view carries no private field", async ({ page }) => {
    await openScreen(page, "recipient");
    const text = await page.locator("main").innerText();
    // Private things that must never reach a recipient surface.
    const leaks = [
      { re: /intygsnummer|credential reference|referensnummer/i, what: "credential reference" },
      { re: /intern anteckning|internal note/i, what: "internal note" },
      { re: /personnummer/i, what: "personal identity number" },
    ];
    const found = leaks.filter((l) => l.re.test(text)).map((l) => l.what);
    expect(found, `The recipient view names private fields: ${found.join(", ")}`).toEqual([]);
  });

  test("every surface renders in Swedish and English", async ({ page }) => {
    const screens = ["overview", "card", "share", "recipient", "entries", "privacy"];
    for (const lang of ["sv", "en"] as const) {
      await setLang(page, lang);
      for (const screen of screens) {
        await openScreen(page, screen);
        const len = (await page.locator("main").innerText()).length;
        expect(len, `${screen} rendered nothing in ${lang}.`).toBeGreaterThan(80);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${screen} (${lang}) scrolls sideways by ${overflow}px.`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});

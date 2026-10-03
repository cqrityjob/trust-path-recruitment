// The REAL employer landing page (/employers), in a real browser.
//
// ── WHY IT NEEDS ITS OWN SPEC ──────────────────────────────────────────
//
// /employers is where an employer decides whether CQrityjob is for them,
// and it is the one public page that names BESKT — a governed method that
// is assignable only under an owner-issued pilot grant. scripts/
// employer-landing-check.tsx proves the copy and the destinations against
// rendered markup. This proves the things only a browser answers: that its
// actions LAND somewhere that renders, that the same-page anchor
// actually moves the page and lands ON its target rather than under the
// sticky header, that nothing overflows at 320-1440, and that every control
// is a real 44px target with a visible focus ring.
//
// ── THIS SUITE IS BLOCKING CI (2026-09-13) ─────────────────────────────
//
// `public-entry-browser` in .github/workflows/ci.yml starts the real
// application and runs this file against it, with no `continue-on-error`.
// Its screenshots are uploaded as a CI artifact.
//
// Nothing reaches production: e2e/support/public-entry-harness.ts refuses
// every request to a Supabase host and every unstubbed server function, so
// the employer journey below is driven entirely inside the browser context.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/employer-landing.spec.ts

import { test, expect } from "@playwright/test";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  assertNoRefusals,
  BASE,
  horizontalOverflow,
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  REQUIRED_WIDTHS,
  setLang,
  shot,
  stubServerFn,
  undersizedTargets,
} from "./support/public-entry-harness";

const SV = dictionaries.sv as Record<string, string>;
const EN = dictionaries.en as Record<string, string>;

test.describe("the employer landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
  });

  // P1 ──────────────────────────────────────────────────────────────────
  test("one h1, and it is the approved sentence", async ({ page }) => {
    expect(await page.locator("main h1").count()).toBe(1);
    await expect(page.locator("main h1")).toHaveText(SV["employers.title"]);
    const text = await page.locator("main").innerText();
    expect(text).toContain(SV["employers.lead"]);
    // The review's own words: "ta emot", never "samla" ansökningar.
    expect(text).not.toMatch(/samla ansökningar/i);
    // The four abstract benefit tiles and the two worked examples are gone.
    for (const gone of [
      "Kandidatbedömning",
      "Kompetensverifiering",
      "Prata med oss",
      "Ordinarie säkerhetsrekrytering",
      "Säkerhetsskyddskänslig rekrytering",
    ]) {
      expect(text, `"${gone}" is still rendered`).not.toContain(gone);
    }
  });

  // P2 ──────────────────────────────────────────────────────────────────
  test("the locked journey, ending in a documented human decision, then a separate continuation", async ({
    page,
  }) => {
    const numbered = await page.locator("#how-it-works ol li h3").allInnerTexts();
    // `innerText` reflects `text-transform: uppercase`; compare the words.
    expect(numbered.map((s) => s.toLowerCase())).toEqual(
      ["Annonsera", "Ta emot och hantera", "Bedöm", "Intervjua", "Besluta"].map((s) =>
        s.toLowerCase(),
      ),
    );
    expect(await page.locator("#how-it-works ol").count()).toBe(1);
    expect(await page.locator("#how-it-works ol > li").count()).toBe(5);
    const text = await page.locator("#how-it-works").innerText();
    expect(text).toContain("Ni fattar och dokumenterar beslutet.");
    expect(text).toMatch(/och sedan/i);
    expect(text).toContain("Fortsätt med kompetensutveckling");
    const inList = await page.locator("#how-it-works ol").innerText();
    expect(inList, "the continuation is inside the numbered list").not.toContain(
      "Fortsätt med kompetensutveckling",
    );
  });

  // P3 ──────────────────────────────────────────────────────────────────
  test("the benefit comes before the method, and BESKT carries its boundary where it is read", async ({
    page,
  }) => {
    const assessment = await page.locator("#bedomning").innerText();
    // A fair, structured assessment first — then TRUST and BESKT.
    const benefit = assessment.indexOf(SV["employers.assessment.body"]);
    expect(benefit).toBeGreaterThanOrEqual(0);
    expect(assessment.indexOf("TRUST")).toBeGreaterThan(benefit);
    expect(assessment).toContain("inte vetenskapligt validerad");
    const beskt = await page.locator('[data-employer-method="beskt"]').innerText();
    expect(beskt).toContain(SV["employers.assessment.beskt.body"]);
    expect(beskt).toContain(
      "BESKT är under utveckling och kan användas först efter granskning och ett uttryckligt godkännande för er organisation.",
    );
    // A structured interview first — then the tool.
    const interview = await page.locator("#intervju").innerText();
    expect(interview.indexOf(SV["employers.interview.body"])).toBeLessThan(
      interview.indexOf("Interview Intelligence"),
    );
    await expect(page.locator("main")).toContainText(SV["employers.disclaimer"]);
    // No action into BESKT from a public page — it is not open.
    expect(await page.locator('main a[href*="beskt" i]').count()).toBe(0);
  });

  // P4 ──────────────────────────────────────────────────────────────────
  test("the actions, and each lands somewhere that renders", async ({ page }) => {
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")),
    );
    expect(hrefs).toEqual([
      "/signup?redirect=%2Femployer",
      "#how-it-works",
      "/login?redirect=%2Femployer",
      // Way A: use the platform yourselves.
      "/signup?redirect=%2Femployer",
      // Way B: CQrityjob helps — the working contact path.
      "/contact",
    ]);

    // Register → the one door, carrying /employer.
    await page.getByRole("link", { name: "Registrera företag" }).first().click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/employer");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref).toContain("redirect=%2Femployer");
    await page.goBack({ waitUntil: "networkidle" });

    // Existing customer → a plain "Logga in" link, the same door.
    await page.locator("main [data-employer-login]").click();
    await page.waitForURL("**/login**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/employer");
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await page.goBack({ waitUntil: "networkidle" });

    // CQrityjob helps → the contact page, which says honestly whether it
    // can send (answered here: not configured).
    await stubServerFn(page, "getRecruitmentEnquiryAvailability", { open: false });
    await page.locator('[data-employer-way="help"]').getByRole("link").click();
    await page.waitForURL((u) => u.pathname === "/contact", { timeout: 15_000 });
    await expect(page.locator("main h1")).toHaveText("Kontakta oss om rekrytering");
    await expect(page.locator("[data-contact-closed]")).toBeVisible({ timeout: 15_000 });
  });

  // P5 ──────────────────────────────────────────────────────────────────
  test('"Så fungerar det" scrolls this page, opening no second journey', async ({ page }) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.getByRole("link", { name: "Så fungerar det" }).first().click();
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
    expect(text).toContain(EN["employers.title"]);
    expect(text).toContain(EN["employers.assessment.beskt.body"]);
    expect(text).toContain(EN["employers.disclaimer"]);
    expect(text).toMatch(/and then/i);
    const diacritics = text.match(/\S*[åäöÅÄÖ]\S*/g) ?? [];
    expect(diacritics, `Swedish on the English page: ${diacritics.join(", ")}`).toEqual([]);
    // Career Discovery data is candidate-owned: an employer page never
    // offers it, in either language.
    expect(text).not.toMatch(/career discovery|career analysis/i);
  });

  // P7 ──────────────────────────────────────────────────────────────────
  //
  // 44 x 44 across header, main AND footer, both dimensions, with no exempt
  // region — see the same test in e2e/public-homepage.spec.ts for why the
  // old desktop-header exemption was removed rather than re-argued.
  test("every public control is at least 44 x 44 in header, main and footer", async ({ page }) => {
    for (const width of REQUIRED_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
      const under = await undersizedTargets(page);
      expect(under, `under 44x44 at ${width}px: ${JSON.stringify(under)}`).toEqual([]);
    }
  });

  test("every control keeps a visible focus ring, and focus never traps", async ({ page }) => {
    const seen = new Set<string>();
    for (let i = 0; i < 18; i += 1) {
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

// ── THE EMPLOYER JOURNEY, IN A ROUTED BROWSER ───────────────────────────
//
// Specification §8.4 and §15.4. Four claims, each driven against the real
// routes with the network boundary installed, so nothing reaches production
// and an unstubbed server call fails the scenario rather than passing quietly.
//
// ── WHAT A BROWSER CAN AND CANNOT PROVE HERE ─────────────────────────
//
// It proves what the PRODUCT does with the answer the server gives: which
// destination it routes to, and that it routes from that answer rather than
// from anything the user supplied. It does NOT prove row-level security —
// the stub IS the server in these tests. The server half is proven by the
// database job (`employer_memberships`, `has_employer_role`) and by
// `employer-registration:check`, and this suite does not restate it.
test.describe("the employer journey", () => {
  /** Everything the authenticated shell and the public header ask for on the
   *  way to /employer. Listed once; each scenario overrides the one answer it
   *  is actually about. */
  const shell = {
    countMyAcademyWork: 0,
    countMyReviewQueue: 0,
    ensureMyEmployerCompanyFromSignup: null,
  };

  test("Register company opens unified signup carrying redirect=/employer", async ({ page }) => {
    await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Registrera företag" }).first().click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.pathname, "a second, employer-specific signup route appeared").toBe("/signup");
    expect(url.searchParams.get("redirect")).toBe("/employer");
    // The SAME form every other visitor uses.
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await shot(
      page,
      "employer-signup-destination",
      "Register company -> /signup?redirect=/employer, the one unified form",
    );
  });

  test("switching between signup and login preserves the redirect, both ways", async ({ page }) => {
    await page.goto(`${BASE}/signup?redirect=%2Femployer`, { waitUntil: "networkidle" });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });

    // signup -> login. The swap link is built from the VALIDATED return path,
    // so its href is the observable proof that safeReturnPath accepted the
    // value rather than silently replacing it with the default destination.
    const toLogin = page.locator('main a[href^="/login?"]').first();
    expect(await toLogin.getAttribute("href")).toContain("redirect=%2Femployer");
    await toLogin.click();
    await page.waitForURL("**/login**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/employer");

    // login -> signup, and back again.
    const toSignup = page.locator('main a[href^="/signup?"]').first();
    expect(await toSignup.getAttribute("href")).toContain("redirect=%2Femployer");
    await toSignup.click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/employer");
    await shot(
      page,
      "employer-signup-login-swap",
      "redirect=/employer preserved across signup <-> login",
    );
  });

  test("neither intent nor user metadata grants an employer role", async ({ page }) => {
    // The session claims everything a forged client could claim: an employer
    // signup intent, an organisation id, a slug and an owner role, all in
    // user_metadata, which is user-supplied and is never a permission.
    // The SERVER answer is the truth, and it says: no membership.
    const refusals = await installBoundary(page, {
      ...shell,
      listMyEmployerWorkspaces: [],
      // /employer/onboarding is where a person with no membership belongs,
      // and it asks for this on arrival. Stubbed so the strict refusal
      // assertion below is about THIS journey and not about the destination
      // having its own reads.
      listMyAccessRequests: [],
      // ...and it asks for the caller's own memberships, to tell a person who
      // never had one from somebody who was removed (they are shown an
      // explanation instead of the company form).
      listMyEmployerMemberships: [],
    });
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key, {
      employer_signup_intent: true,
      employer_company_name: "Forged Security AB",
      employer_id: "00000000-0000-4000-8000-000000000abc",
      employer_slug: "forged-security",
      role: "owner",
      is_platform_admin: true,
    });

    await page.goto(`${BASE}/employer`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname !== "/employer", { timeout: 20_000 });

    const landed = new URL(page.url()).pathname;
    // A workspace would be /employer/<slug>. Metadata named one; the product
    // must not have believed it.
    expect(landed, `metadata routed the visitor into a workspace: ${landed}`).not.toMatch(
      /^\/employer\/forged-security/,
    );
    expect(landed, "a person with no membership belongs in onboarding").toBe(
      "/employer/onboarding",
    );
    const body = await page.evaluate(() => document.body.innerText);
    expect(body, "the forged organisation name was rendered as if real").not.toContain(
      "Forged Security AB",
    );
    // The security claim, which is what this test is for: nothing reached a
    // Supabase host. The stricter unstubbed-export assertion is deliberately
    // NOT made here — the destination is /employer/onboarding, whose own
    // reads are not the subject, and failing this scenario on one of them
    // would report the wrong defect. The pending scenario below, where the
    // destination IS the subject, keeps the strict assertion.
    expect(
      refusals.production,
      `the journey reached a Supabase host: ${refusals.production.join(", ")}`,
    ).toEqual([]);
    await shot(
      page,
      "employer-metadata-grants-nothing",
      "Forged employer metadata routes to onboarding, not to a workspace",
    );
  });

  test("a pending organisation reaches the pending destination and is explained", async ({
    page,
  }) => {
    // The server returns one organisation, and it is NOT active. §8.4: the
    // pending screen must say what was received, what is being reviewed and
    // what the person can do while waiting.
    const refusals = await installBoundary(page, {
      ...shell,
      listMyEmployerWorkspaces: [
        {
          employerId: "00000000-0000-4000-8000-0000000000p1",
          employerSlug: "pending-security",
          employerName: "Pending Security AB",
          employerLogoUrl: null,
          employerStatus: "pending",
          employerCreatedAt: "2026-09-01T09:00:00.000Z",
          role: "owner",
        },
      ],
    });
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key, { employer_signup_intent: true });

    await page.goto(`${BASE}/employer`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/employer/pending**", { timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe("/employer/pending");

    // A pending organisation is not an active one: no workspace route, and
    // no active-employer action offered here.
    //
    // WAIT for the explanation rather than reading innerText the instant the
    // URL settles: /employer/pending renders its own loading state while the
    // workspace query resolves, and a one-shot read catches that instead.
    await expect(page.getByText("Tack för din registrering.")).toBeVisible({ timeout: 20_000 });
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain(
      "Organisationens registrering granskas. Här ser du när statusen ändras.",
    );
    // The receipt: what CQrityjob holds about them.
    expect(text).toContain("Pending Security AB");
    // And a way to re-check without leaving.
    await expect(page.getByRole("button", { name: /Kontrollera status/i })).toBeVisible();
    assertNoRefusals(refusals);
    await shot(
      page,
      "employer-pending-destination",
      "Pending organisation lands on /employer/pending with the explanation and the receipt",
    );
  });
});

// ── ROUTED EVIDENCE — THE EMPLOYER LANDING ──────────────────────────────
test.describe("routed evidence — the employer entrance", () => {
  for (const [lang, h1] of [
    ["sv", SV["employers.title"]!],
    ["en", EN["employers.title"]!],
  ] as const) {
    for (const width of [1440, 375] as const) {
      test(`employer landing ${lang} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width >= 1440 ? 900 : 812 });
        await page.goto(`${BASE}/employers`, { waitUntil: "networkidle" });
        await setLang(page, lang);

        await expect(page.locator("main h1")).toHaveText(h1);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        expect(await undersizedTargets(page)).toEqual([]);

        await shot(
          page,
          `employers-${lang}-${width}`,
          `Employer landing ${lang.toUpperCase()} at ${width}px — 0px overflow, no target under 44x44`,
        );
      });
    }
  }
});

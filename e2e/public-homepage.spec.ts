// The REAL public homepage, in a real browser, clicked with a real mouse.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/public-homepage-check.tsx renders the route to markup: it counts
// sections, headings and words and reads the copy. It cannot see a layout.
// It cannot tell you that the page is 2,118 CSS pixels tall at 1440x900,
// that nothing scrolls sideways at 320px, that a control is 44px, that a
// focus ring is actually drawn, or — the one that matters most — that a
// call to action LANDS somewhere that renders.
//
// Every homepage and header CTA here is clicked. For each one the spec
// asserts the resulting URL, that the destination rendered a heading or an
// explicit next step, that it is not a placeholder or an unexpected
// authentication wall, and that Back returns to the homepage.
//
// The primary action gets more than that: it is followed THROUGH to the
// account form, and the spec asserts that the Passport intent survives —
// that /signup carries `?redirect=/passport`, that the form RESOLVED it
// rather than silently swapping in the default destination, and that
// /passport tells a brand-new account what to do next instead of showing
// it a dashboard.
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// Mostly it is not, because the homepage does not need one: static copy
// plus a single `supabase.auth.getSession()`. The two signed-in tests plant
// a session the way supabase-js stores one — under the key the client
// actually asks for, OBSERVED rather than hardcoded, because that key is
// derived from the project URL and differs between a local stack, a preview
// and production. Nothing reaches a database.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/public-homepage.spec.ts

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const USER_ID = "00000000-0000-4000-8000-00000000home";

/** The four sections the homepage is allowed to have, in order. */
const SECTION_ORDER = ["hero", "how", "passport", "employers"] as const;

/** Headings, claims and calls to action that were removed and must not come
 *  back — whole sections of the old page, duplicate actions, and phrases the
 *  product cannot support. "Starta karriäranalysen" is in this list because
 *  the Career Analysis is no longer the page's primary action. */
const REMOVED_SV = [
  "Karriär · Rekrytering · Tester",
  "Gör karriärtestet",
  "Starta karriäranalysen",
  "Tre sätt vi stöttar din utveckling",
  "Din säkerhetskarriär. En yrkesidentitet.",
  "Byggd för individer och organisationer",
  "Utforska roller i säkerhetsbranschen",
  "Kostnadsfritt karriärtest inom säkerhet",
  "Rollbaserade kompetenstest för organisationer",
  "Bli anställd",
  "Möt arbetsgivare",
  "mät din kompetens",
  "Prata med oss",
  "verifierade meriter",
  "kompetensverifiering",
  "testa personal",
  "rätt kandidat",
  "säkrare rekrytering",
] as const;

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector("main")!.innerText);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function setLang(page: Page, lang: "sv" | "en"): Promise<void> {
  await page.evaluate((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
  await page.reload({ waitUntil: "networkidle" });
}

/** supabase-js derives its storage key from the project URL. Rather than
 *  hardcode one and silently stop testing anything the day that URL changes,
 *  the key is OBSERVED: `getItem` is wrapped before the first load and
 *  records every `sb-*-auth-token` the client asks for. */
async function observeSupabaseStorageKey(page: Page): Promise<string> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __sbKeys: string[] }).__sbKeys = seen;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function patched(key: string) {
      if (/^sb-.*-auth-token$/.test(key) && !seen.includes(key)) seen.push(key);
      return original.call(this, key);
    };
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const key = await page.evaluate(
    () => (window as unknown as { __sbKeys: string[] }).__sbKeys[0] ?? null,
  );
  expect(key, "the homepage never read a Supabase session key").not.toBeNull();
  return key as string;
}

async function plantSession(page: Page, storageKey: string): Promise<void> {
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: USER_ID, aud: "authenticated", email: "e2e@example.test" }),
    }),
  );
  await page.evaluate(
    ([key, uid]) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: "authenticated", role: "authenticated", email: "e2e@example.test" },
        }),
      );
    },
    [storageKey, USER_ID] as const,
  );
}

test.describe("the public homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  });

  // T1 ──────────────────────────────────────────────────────────────────
  test("main carries exactly four sections, in the settled order", async ({ page }) => {
    const sections = await page.evaluate(() =>
      [...document.querySelector("main")!.children].map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id,
      })),
    );
    expect(sections.map((s) => s.tag)).toEqual(["section", "section", "section", "section"]);
    expect(sections.map((s) => s.id)).toEqual([...SECTION_ORDER]);

    // The landmarks the static guard has to mock away.
    for (const landmark of ["header", "main", "footer"]) {
      expect(await page.locator(landmark).count(), `${landmark} landmark`).toBe(1);
    }
    expect(await page.locator("header nav").count()).toBeGreaterThan(0);
  });

  // T2 ──────────────────────────────────────────────────────────────────
  test("the removed sections are gone from the page AND from the DOM", async ({ page }) => {
    const text = await visibleText(page);
    for (const phrase of REMOVED_SV) {
      expect(text.toLowerCase(), `"${phrase}" is still rendered`).not.toContain(
        phrase.toLowerCase(),
      );
    }
    // Not merely hidden: the nodes must not exist. `innerText` already skips
    // display:none, so this is what separates "removed" from "hidden".
    const html = await page.evaluate(() => document.querySelector("main")!.innerHTML);
    for (const phrase of REMOVED_SV) {
      expect(html.toLowerCase(), `"${phrase}" is still in the DOM, only hidden`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  // T3 + T4 ─────────────────────────────────────────────────────────────
  test("one h1, three h2, and Security Passport is what the page is about", async ({ page }) => {
    expect(await page.locator("main h1").count()).toBe(1);
    expect(await page.locator("main h2").count()).toBe(3);
    await expect(page.locator("main h1")).toHaveText("Din säkerhetskarriär. Samlad på ett ställe.");

    const hero = page.locator("#hero");
    const heroText = await hero.innerText();
    expect(heroText).toContain("Security Passport");
    expect(heroText.toUpperCase()).toContain("DIN YRKESIDENTITET INOM SÄKERHET");
    // The Career Analysis is a SUPPORTING tool: not in the hero, in words or
    // as a control.
    expect(heroText.toLowerCase()).not.toContain("karriäranalys");
    expect(await hero.locator('a[href*="security-career-assessment"]').count()).toBe(0);
  });

  // T5 ──────────────────────────────────────────────────────────────────
  test("exactly one visually primary CTA, and it creates a Security Passport", async ({ page }) => {
    // "Primary" is a COMPUTED fact, not a class name: a control whose own
    // background is the navy primary. A future edit that reaches for
    // bg-primary a second time fails here rather than shipping two equally
    // loud actions.
    const primaries = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--primary)";
      document.body.append(probe);
      const navy = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [...document.querySelectorAll<HTMLElement>("main a, main button")]
        .filter((el) => getComputedStyle(el).backgroundColor === navy)
        .map((el) => ({ text: (el.textContent ?? "").trim(), href: el.getAttribute("href") }));
    });
    expect(primaries).toHaveLength(1);
    expect(primaries[0].text).toContain("Skapa ditt Security Passport");
    // The intent rides along, so the account somebody creates knows what it
    // was created for.
    expect(primaries[0].href).toBe("/signup?redirect=%2Fpassport");
  });

  // T5b ─────────────────────────────────────────────────────────────────
  test('the hero\'s "Se hur det fungerar" scrolls down this page, opening no second path', async ({
    page,
  }) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.locator("#hero").getByRole("link", { name: "Se hur det fungerar" }).click();
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname, "it must not navigate away").toBe("/");
    expect(new URL(page.url()).hash).toBe("#how");
    const after = await page.evaluate(() => window.scrollY);
    expect(after, "the page did not move").toBeGreaterThan(before);
    // And it landed ON the section, not under the sticky header.
    const top = await page.locator("#how h2").evaluate((el) => el.getBoundingClientRect().top);
    expect(top, "the heading is hidden behind the sticky header").toBeGreaterThan(0);
  });

  // T6 ──────────────────────────────────────────────────────────────────
  test("the Career Analysis is offered once, quietly, and is never called a test", async ({
    page,
  }) => {
    expect(await page.locator('main a[href="/security-career-assessment"]').count()).toBe(1);
    expect(
      await page.locator('#passport a[href="/security-career-assessment"]').count(),
      "it belongs to section 3",
    ).toBe(1);
    const text = await visibleText(page);
    expect(text).toContain(
      "Security Passport visar vad du har gjort. Karriäranalysen hjälper dig att se vad du kan göra härnäst.",
    );
    for (const banned of [/kompetenstest/i, /karriärtest/i, /mät din kompetens/i, /\bprov\b/i]) {
      expect(text, `"${banned.source}" appears`).not.toMatch(banned);
    }
  });

  // T7 + T8 ─────────────────────────────────────────────────────────────
  test("three trust levels, distinct, and only source-confirmed reads as confirmed", async ({
    page,
  }) => {
    const how = page.locator("#how");
    const raw = await how.innerText();
    const folded = raw.toLocaleLowerCase("sv");
    for (const level of ["Registrerat", "Dokumenterat", "Källbekräftat"]) {
      expect(folded, `"${level}" is missing`).toContain(level.toLocaleLowerCase("sv"));
    }
    expect(raw).toContain("Se tydligt vad som är registrerat, dokumenterat eller källbekräftat.");

    // Each level differs by WORD and by GLYPH before any colour is
    // perceived, and the green confirmation treatment is reserved for the
    // one level that has actually been confirmed by its source.
    const chips = await how.evaluate((root) =>
      // The legend `<ul>`, not the steps `<ol>`: both hold `li > span`, and
      // matching loosely picked up the three step icons as level chips.
      [...root.querySelectorAll("ul > li > span")].map((el) => {
        const cs = getComputedStyle(el);
        const disc = el.querySelector("span");
        return {
          text: (el.textContent ?? "").trim(),
          borderStyle: cs.borderTopStyle,
          glyphs: el.querySelectorAll("svg").length,
          glyphPath: el.querySelector("svg")?.innerHTML ?? "",
          discBackground: disc ? getComputedStyle(disc).backgroundColor : "",
        };
      }),
    );
    expect(chips).toHaveLength(3);
    for (const c of chips) expect(c.glyphs, `${c.text} has no glyph`).toBe(1);
    expect(new Set(chips.map((c) => c.glyphPath)).size, "two levels share a glyph").toBe(3);
    expect(new Set(chips.map((c) => c.discBackground)).size, "two levels share a colour").toBe(3);
    // Border style is a fourth channel: the weakest level is dashed.
    expect(chips.find((c) => /registrerat/i.test(c.text))?.borderStyle).toBe("dashed");

    // Green is reserved. Read as a HUE, not as a class name, so a rename
    // cannot quietly hand the confirmation treatment to another level.
    //
    // The browser reports these as `oklab(L a b / alpha)` rather than rgb,
    // because the palette is authored in oklch — and in oklab a NEGATIVE `a`
    // is what "green" means. Both notations are handled: reading an oklab
    // triple as if it were rgb is how this assertion quietly passed on all
    // three chips.
    const greenish = chips.filter((c) => {
      const oklab = c.discBackground.match(/^oklab\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
      if (oklab) return Number(oklab[2]) < -0.05;
      const rgb = c.discBackground.match(/-?[\d.]+/g);
      if (!rgb) return false;
      const [r, g, b] = rgb.map(Number);
      return g > r + 12 && g > b + 12;
    });
    expect(greenish.map((c) => c.text.trim().toLocaleLowerCase("sv"))).toEqual(["källbekräftat"]);

    // No issuer claim, and no lifecycle state mixed into a trust state.
    const main = (await visibleText(page)).toLowerCase();
    for (const banned of ["utfärdare", "verifierade meriter", "kompetensverifiering"]) {
      expect(main, `"${banned}" appears`).not.toContain(banned);
    }
    for (const lifecycle of ["utgången", "återkallad", "arkiverad"]) {
      expect(main, `lifecycle word "${lifecycle}" appears`).not.toContain(lifecycle);
    }

    // And the page never sends a signed-out visitor into an authenticated
    // Passport route.
    expect(await page.locator('main a[href^="/passport"]').count()).toBe(0);
  });

  // T9 ──────────────────────────────────────────────────────────────────
  //
  // Every call to action, clicked. Not "the href is right" — clicked, with
  // the destination asserted to have actually rendered, and Back asserted to
  // come home.
  const CTAS = [
    {
      name: 'section 3 "Utforska din karriärväg"',
      scope: "main",
      label: "Utforska din karriärväg",
      url: "/security-career-assessment",
    },
    {
      name: 'employer "Se lösningar för arbetsgivare"',
      scope: "main",
      label: "Se lösningar för arbetsgivare",
      url: "/employers",
    },
    { name: 'header "Logga in"', scope: "header", label: "Logga in", url: "/login" },
    {
      name: 'header "Karriärvägar"',
      scope: "header",
      label: "Karriärvägar",
      url: "/career-center",
    },
    { name: 'header "Jobb"', scope: "header", label: "Jobb", url: "/jobs" },
    { name: 'header "Arbetsgivare"', scope: "header", label: "Arbetsgivare", url: "/employers" },
    { name: 'header "Om oss"', scope: "header", label: "Om oss", url: "/about" },
  ] as const;

  for (const cta of CTAS) {
    test(`${cta.name} reaches ${cta.url} and can be left again`, async ({ page }) => {
      const root = page.locator(cta.scope);
      await root.getByRole("link", { name: cta.label, exact: false }).first().click();
      await page.waitForURL(`**${cta.url}`, { timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe(cta.url);

      // It rendered, and it rendered something a person can act on. A blank
      // screen, a 404 and a spinner that never resolves all fail here.
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
      const body = await page.evaluate(() => document.body.innerText);
      expect(body.trim().length, "the destination is blank").toBeGreaterThan(40);
      expect(body).not.toMatch(/404|Not Found|Sidan kunde inte hittas/i);
      expect(body, "the destination is a placeholder").not.toMatch(
        /lorem ipsum|coming soon|placeholder/i,
      );

      // Not an unexpected authentication wall. /login is the one destination
      // that is supposed to ask for credentials.
      if (cta.url !== "/login") {
        expect(await page.locator('input[type="password"]').count()).toBe(0);
      }

      await page.goBack({ waitUntil: "networkidle" });
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page.locator("main h1")).toBeVisible();
    });
  }

  // T9b ─────────────────────────────────────────────────────────────────
  test('the header\'s "Security Passport" reaches the homepage section it names', async ({
    page,
  }) => {
    await page.locator("header").getByRole("link", { name: "Om oss" }).first().click();
    await page.waitForURL("**/about");
    await page.locator("header").getByRole("link", { name: "Security Passport" }).first().click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
    await page.waitForTimeout(600);
    await expect(page.locator("#passport h2")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("#passport");
  });

  // T10 ─────────────────────────────────────────────────────────────────
  //
  // The promise the primary CTA makes, followed through the account form.
  test("the primary CTA carries the Passport intent into the account form", async ({ page }) => {
    await page.locator("#hero").getByRole("link", { name: "Skapa ditt Security Passport" }).click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("redirect"), "the intent was dropped in transit").toBe("/passport");

    // A working account form, not a blank page.
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // And the form RESOLVED the intent rather than merely echoing the URL:
    // the swap link to sign-in is built from the validated return path, so
    // its href is the observable proof that safeReturnPath accepted the
    // value instead of silently replacing it with the default destination.
    // `a[href^="/login"]` also matches the header's own "Logga in", which
    // correctly carries no return path. The swap link is the one with a
    // query string on it.
    const swapHref = await page.locator('a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref, "the intent is lost if you already have an account").toContain(
      "redirect=%2Fpassport",
    );

    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
  });

  // T11 ─────────────────────────────────────────────────────────────────
  test("and the landing tells a brand-new account what to do next", async ({ page }) => {
    // The landing itself, signed in. The Passport read is stubbed to the
    // shape a BRAND-NEW account has — no profile row — because that is the
    // arrival this CTA creates, and the one that must not be a shrug.
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key);

    // Every server-function call is an HTTP request to /_serverFn/<id>, where
    // <id> is base64url JSON naming the module and the export, and the client
    // unwraps `{ result, error, context }` — a bare value reads as
    // `undefined` and sends the page down its own error branch, which is a
    // real state but not the one under test.
    const REPLIES: Record<string, unknown> = {
      getMyPassport: { profile: null, claims: [], periods: [], employment: [] },
      listMyVerificationRequests: { requests: [] },
      // The real `RegulatedCredentialAvailability` shape. An approximation
      // here threw inside the Passport shell and the route rendered its
      // error boundary, which reads as "the landing is broken" when what was
      // broken was the stub.
      getRegulatedCredentialAvailability: {
        state: "unsupported",
        jurisdictionCode: null,
        subJurisdictionCode: null,
        marketPackCode: null,
        types: [],
      },
      // The site header's own reads, for a signed-in visitor. Answered so an
      // UNMATCHED name below is a real hole in the stub rather than the
      // chrome doing its normal job.
      countMyAcademyWork: { total: 0, actionable: 0 },
      countMyReviewQueue: 0,
      // An ARRAY. `{ workspaces: [] }` made SiteHeader throw on `.map`, the
      // route error boundary caught it, and the page under test never
      // rendered — a stub failing as if the product had.
      listMyEmployerWorkspaces: [],
    };
    const unmatched: string[] = [];
    await page.route("**/_serverFn/**", (route) => {
      const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(route.request().url());
      let name = "?";
      try {
        const json = JSON.parse(
          Buffer.from(m![1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
        );
        name = String(json.export ?? "").replace(/_createServerFn_handler$/, "");
      } catch {
        /* leave it unmatched */
      }
      if (!(name in REPLIES)) unmatched.push(name);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: REPLIES[name] ?? null, error: null, context: {} }),
      });
    });

    await page.goto(`${BASE}/passport`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    expect(new URL(page.url()).pathname, "the landing bounced to login").toBe("/passport");

    const body = await page.evaluate(() => document.body.innerText);
    expect(body.trim().length, "the landing is blank").toBeGreaterThan(60);
    // A NAMED next step, not a dashboard, not an empty container and not the
    // read-failure state — which is a legitimate screen, but not the arrival
    // this call to action creates.
    expect(body, "the landing rendered its read-failure state").not.toContain(
      "Vi kunde inte hämta ditt Security Passport",
    );
    await expect(page.locator("h1, h2").first()).toBeVisible();
    expect(
      await page.locator("main a, main button").count(),
      "the landing offers nothing to do",
    ).toBeGreaterThan(0);
    expect(unmatched, `unstubbed server functions: ${unmatched.join(", ")}`).toEqual([]);
  });

  // T13 ─────────────────────────────────────────────────────────────────
  test("a signed-out visitor stays on the public homepage", async ({ page }) => {
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main h1")).toHaveText("Din säkerhetskarriär. Samlad på ett ställe.");
  });

  // T14 ─────────────────────────────────────────────────────────────────
  test("Swedish and English carry the same structure, and the document lang follows", async ({
    page,
  }) => {
    const shape = async () =>
      page.evaluate(() => ({
        lang: document.documentElement.lang,
        sections: [...document.querySelector("main")!.children].map((el) => el.id),
        h1: document.querySelectorAll("main h1").length,
        h2: document.querySelectorAll("main h2").length,
        links: [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")),
      }));

    await setLang(page, "sv");
    const sv = await shape();
    expect(sv.lang).toBe("sv");

    await setLang(page, "en");
    const en = await shape();
    expect(en.lang).toBe("en");

    expect(en.sections).toEqual(sv.sections);
    expect(en.h1).toBe(sv.h1);
    expect(en.h2).toBe(sv.h2);
    // Same destinations, in the same order: switching language may change
    // words, never where a control goes.
    expect(en.links).toEqual(sv.links);

    const enText = await visibleText(page);
    expect(enText).toContain("Create your Security Passport");
    expect(enText).toContain("Collect. Support. Share.");
    expect(enText).toContain("Your information · You choose what to share");
    // One name for the supporting tool in English, every time.
    expect(enText).toContain("Career Analysis");
    expect(enText).not.toMatch(/career test/i);
  });

  // T14b ────────────────────────────────────────────────────────────────
  test("switching language preserves the current route", async ({ page }) => {
    await page.locator("header").getByRole("link", { name: "Om oss" }).first().click();
    await page.waitForURL("**/about");
    await page.getByRole("button", { name: /^en$/i }).first().click();
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe("/about");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  // T18 ─────────────────────────────────────────────────────────────────
  test("the page stays inside the desktop height budget at 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    const height = await page.evaluate(() =>
      Math.round(document.querySelector("main")!.getBoundingClientRect().height),
    );
    expect(height, `main is ${height}px tall`).toBeLessThanOrEqual(2700);
    // Not a floor the brief demands, but a page that collapses far below the
    // target has usually lost a section rather than got tighter.
    expect(height).toBeGreaterThan(1600);
  });

  // T16 + T17 ───────────────────────────────────────────────────────────
  //
  // ── WHAT "44 x 44" IS ASSERTED ON, AND WHAT IT IS NOT ────────────────
  //
  // Every control the homepage itself renders: 44 x 44, both dimensions, at
  // every width. All three clear it.
  //
  // The shared chrome is asserted where touch is the input — the compact
  // menu's rows and toggle, and the footer's link rows, all of which this PR
  // touched — by HEIGHT. A 33px-wide "Jobb" in a horizontal footer row is a
  // 33 x 44 target, and widening a text link into a 44px box would space the
  // row out into something nobody asked for.
  //
  // The desktop header bar's own 36px control height and the two-letter
  // language toggle are PRE-EXISTING, are mouse targets on a >=1024px
  // viewport, clear WCAG 2.5.8 (AA, 24 x 24), and changing them is a
  // redesign of a component shared by every route on the site. They are
  // reported rather than silently altered.
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

    const shortRows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("footer a")]
        .map((el) => ({
          text: (el.textContent ?? "").trim().slice(0, 30),
          h: Math.round(el.getBoundingClientRect().height),
        }))
        .filter((x) => x.h > 0 && x.h < 44),
    );
    expect(shortRows, `Footer rows under 44px tall: ${JSON.stringify(shortRows)}`).toEqual([]);

    const seen = new Set<string>();
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return {
          key: `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 24)}`,
          ring: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
          hidden: el.closest('[aria-hidden="true"]') !== null,
        };
      });
      if (!state) continue;
      expect(state.hidden, "Focus landed inside an aria-hidden subtree.").toBe(false);
      expect(state.ring, `No visible focus ring on ${state.key}`).toBe(true);
      seen.add(state.key);
    }
    expect(seen.size, "Focus never moved — keyboard trap.").toBeGreaterThan(3);
  });

  // ── THE ENGLISH PAGE IS ENGLISH, DECORATION INCLUDED ────────────────
  //
  // Every visible word in the two Passport compositions used to be inlined
  // in the component, so the English homepage rendered "Din
  // säkerhetsprofil", "Utbildningar" and "Stockholm, Sverige" beside
  // English prose. Nothing caught it, because every text assertion — here
  // and in the static guard — read a projection that skipped aria-hidden
  // subtrees. aria-hidden removes a subtree from the ACCESSIBILITY TREE,
  // not from the screen; it is not a localisation mechanism.
  //
  // This reads `innerText`: what a person actually sees.
  test("the English homepage renders no Swedish, including the illustrations", async ({ page }) => {
    await setLang(page, "en");
    const seen = await visibleText(page);

    // One line, and it catches most of the class outright.
    const diacritics = seen.match(/\S*[åäöÅÄÖ]\S*/g) ?? [];
    expect(diacritics, `Swedish characters on the English page: ${diacritics.join(", ")}`).toEqual(
      [],
    );

    // And the words with no diacritic to give them away.
    for (const phrase of [
      "Din säkerhetsprofil",
      "Redigera profil",
      "Säkerhetsspecialist",
      "Stockholm, Sverige",
      "Erfarenhet",
      "Utbildningar",
      "Certifikat",
      "Meriter",
      "Delad profil",
      "Utveckling",
      "Skapa CV",
      "Dela valda uppgifter",
    ]) {
      expect(seen, `"${phrase}" is rendered on the English page`).not.toContain(phrase);
    }

    // The illustration is translated, not deleted.
    for (const phrase of [
      "Your security profile",
      "Security specialist",
      "Stockholm, Sweden",
      "Experience",
      "Education",
      "Certificates",
      "Merits",
      "Edit profile",
    ]) {
      expect(seen, `"${phrase}" is missing from the English illustration`).toContain(phrase);
    }

    // And the Swedish page still says the Swedish words.
    await setLang(page, "sv");
    const svSeen = await visibleText(page);
    for (const phrase of ["Din säkerhetsprofil", "Utbildningar", "Stockholm, Sverige"]) {
      expect(svSeen, `"${phrase}" is missing from the Swedish illustration`).toContain(phrase);
    }
  });

  // The illustrations are decoration, and must not be reachable or read.
  test("the product illustrations are out of the accessibility tree", async ({ page }) => {
    const decorative = page.locator('main [aria-hidden="true"]');
    expect(await decorative.count()).toBeGreaterThan(0);

    // The mock person's name is DRAWN — it is a picture of the product — and
    // is never announced. `innerText` is the wrong instrument for that, and
    // knowing which instrument answers which question is the whole lesson of
    // the localisation defect asserted above: aria-hidden removes a node
    // from the accessibility tree, not from the rendered text. So the name
    // IS in innerText, and every node carrying it sits inside an
    // aria-hidden subtree.
    expect(await page.locator("main").innerText()).toContain("Alex Karlsson");
    const exposed = await page.evaluate(
      () =>
        [...document.querySelectorAll("main *")]
          .filter(
            (el) => el.children.length === 0 && (el.textContent ?? "").includes("Alex Karlsson"),
          )
          .filter((el) => el.closest('[aria-hidden="true"]') === null).length,
    );
    expect(exposed, "the illustration's mock person is in the accessibility tree").toBe(0);

    // And nothing in the picture is a control: a card that looks clickable
    // and is not is worse than no card.
    expect(await decorative.locator("a, button").count()).toBe(0);
  });
});

// T15 ───────────────────────────────────────────────────────────────────
//
// The widths the brief names, plus 200% zoom, in both languages. Swedish is
// the longer language for most of this copy, so a layout that survives
// English can still break in Swedish.
test.describe("the homepage at every required width", () => {
  for (const width of [320, 360, 375, 390, 768, 1440]) {
    test(`no horizontal overflow at ${width}px, sv and en`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      for (const lang of ["sv", "en"] as const) {
        await setLang(page, lang);
        const over = await horizontalOverflow(page);
        expect(over, `${lang} at ${width}px scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
      }
    });
  }

  test("no horizontal overflow at 200% browser zoom", async ({ page }) => {
    // 200% zoom is a 1440px window reporting a 720px layout viewport, which
    // a halved viewport reproduces and `deviceScaleFactor` does not.
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the footer is reachable and readable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    const hrefs = await footer.evaluate((el) =>
      [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    );
    expect(hrefs, "the footer promotes a form that sends nothing").not.toContain("/contact");
    const text = await footer.innerText();
    expect(text).toContain("Där förtroende kommer först.");
    // Rendered, and rendered as text: the routes do not exist yet.
    for (const dead of ["Integritetspolicy", "Användarvillkor"]) {
      expect(text).toContain(dead);
      expect(
        await footer.getByRole("link", { name: dead, exact: true }).count(),
        `"${dead}" is presented as a link but has no destination`,
      ).toBe(0);
    }
  });
});

// T12 ───────────────────────────────────────────────────────────────────
test.describe("the signed-in visitor", () => {
  test("a signed-in visitor at / is redirected to /my-career", async ({ page }) => {
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key);

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/my-career**", { timeout: 15_000 });
    expect(new URL(page.url()).pathname.startsWith("/my-career")).toBe(true);

    // And it is a redirect, not a loop: the URL settles and stays settled.
    const first = page.url();
    await page.waitForTimeout(2000);
    expect(page.url()).toBe(first);
  });
});

// The REAL public homepage, in a real browser, clicked with a real mouse.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/public-homepage-check.tsx renders the route to markup: it counts
// sections, headings and words and reads the copy. It cannot see a layout.
// It cannot tell you that nothing scrolls sideways at 320px, that a control
// is 44px, that a focus ring is actually drawn, that the two entry cards are
// the SAME SIZE ON SCREEN — or, the one that matters most, that a call to
// action LANDS somewhere that renders.
//
// ── WHAT CHANGED (2026-09-13) ──────────────────────────────────────────
//
// This file used to assert the single-product page: one h1, three h2, ONE
// visually primary CTA, and "the Career Analysis is a supporting tool, not
// in the hero, in words or as a control". That is superseded. The page now
// has TWO PEER individual entrances and the spec's job is to prove they are
// peers where only a browser can see it: same rendered width, same rendered
// height, same computed button background, both above the fold on a laptop.
//
// Every homepage and header CTA here is clicked. For each one the spec
// asserts the resulting URL, that the destination rendered a heading or an
// explicit next step, that it is not a placeholder or an unexpected
// authentication wall, and that Back returns to the homepage.
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// Mostly it is not, because the homepage does not need one: static copy
// plus a single `supabase.auth.getSession()`. The signed-in tests plant a
// session the way supabase-js stores one — under the key the client actually
// asks for, OBSERVED rather than hardcoded, because that key is derived from
// the project URL and differs between a local stack, a preview and
// production. Nothing reaches a database.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/public-homepage.spec.ts

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const USER_ID = "00000000-0000-4000-8000-00000000home";

/** The four sections the homepage is allowed to have, in order. */
const SECTION_ORDER = ["hero", "employers", "lifecycle", "passport"] as const;

/** Headings, claims and calls to action that were removed and must not come
 *  back — the superseded single-product page, and phrases the product cannot
 *  support. */
const REMOVED_SV = [
  "Din säkerhetskarriär. Samlad på ett ställe.",
  "Din yrkesidentitet inom säkerhet",
  "Samla. Styrk. Dela.",
  "Ett Passport genom hela karriären",
  "Utforska din karriärväg",
  "Se lösningar för arbetsgivare",
  "Gör karriärtestet",
  "Kostnadsfritt karriärtest inom säkerhet",
  "mät din kompetens",
  "Prata med oss",
  "verifierade meriter",
  "kompetensverifiering",
  "rätt kandidat",
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

  // H1 ──────────────────────────────────────────────────────────────────
  test("main carries exactly four sections, in the settled order", async ({ page }) => {
    const sections = await page.evaluate(() =>
      [...document.querySelector("main")!.children].map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id,
      })),
    );
    expect(sections.map((s) => s.tag)).toEqual(["section", "section", "section", "section"]);
    expect(sections.map((s) => s.id)).toEqual([...SECTION_ORDER]);

    for (const landmark of ["header", "main", "footer"]) {
      expect(await page.locator(landmark).count(), `${landmark} landmark`).toBe(1);
    }
    expect(await page.locator("header nav").count()).toBeGreaterThan(0);
  });

  // H2 ──────────────────────────────────────────────────────────────────
  test("the superseded single-product page is gone from the page AND the DOM", async ({ page }) => {
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

  // H3 ──────────────────────────────────────────────────────────────────
  test("one h1, five h2, and the framing the brief settled", async ({ page }) => {
    expect(await page.locator("main h1").count()).toBe(1);
    expect(await page.locator("main h2").count()).toBe(5);
    expect(await page.locator("main h3").count()).toBe(6);
    await expect(page.locator("main h1")).toHaveText("Bygg din framtid inom säkerhet");

    const hero = page.locator("#hero");
    const heroText = await hero.innerText();
    expect(heroText.toUpperCase()).toContain("SÄKERHETSKARRIÄREN SAMLAD PÅ ETT STÄLLE");
    expect(heroText).toContain(
      "Samla dina meriter i ett Security Passport eller upptäck vilka säkerhetsroller som passar din riktning.",
    );
    // BOTH products are named in the hero. Neither is the page's subject at
    // the other's expense.
    expect(heroText).toContain("Bygg ditt Security Passport");
    expect(heroText).toContain("Upptäck din säkerhetskarriär");
  });

  // H4 ──────────────────────────────────────────────────────────────────
  //
  // THE PEER TEST. This is the assertion the static guard cannot make: two
  // cards that are class-identical in source can still render at different
  // sizes if something inside one of them forces a different box.
  test("the two entry cards are peers on screen: same size, same weight", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });

    const boxes = await page.locator("#hero article").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
      }),
    );
    expect(boxes, "the hero must hold exactly two entry cards").toHaveLength(2);
    expect(Math.abs(boxes[0].w - boxes[1].w), "the cards are different widths").toBeLessThanOrEqual(
      2,
    );
    expect(
      Math.abs(boxes[0].h - boxes[1].h),
      "the cards are different heights",
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(boxes[0].top - boxes[1].top),
      "the cards start at different heights",
    ).toBeLessThanOrEqual(2);

    // ── AND THE TWO ACTIONS ARE EQUALLY LOUD ─────────────────────────
    //
    // "Primary" is a COMPUTED fact, not a class name: a control whose own
    // background is the navy primary. Two, and exactly two, inside the hero
    // — and their computed backgrounds are identical, so Career Discovery
    // cannot quietly become the quiet one again.
    const primaries = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--primary)";
      document.body.append(probe);
      const navy = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [...document.querySelectorAll<HTMLElement>("#hero a, #hero button")]
        .filter((el) => getComputedStyle(el).backgroundColor === navy)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? "").trim(),
            href: el.getAttribute("href"),
            h: Math.round(r.height),
            y: Math.round(r.top),
            font: getComputedStyle(el).fontSize,
          };
        });
    });
    expect(primaries).toHaveLength(2);
    expect(primaries[0].text).toContain("Skapa mitt Security Passport");
    expect(primaries[1].text).toContain("Starta Career Discovery");
    expect(primaries[0].href).toBe("/signup?redirect=%2Fpassport");
    expect(primaries[1].href).toBe("/security-career-assessment");
    expect(primaries[0].h, "the two actions are different heights").toBe(primaries[1].h);
    expect(primaries[0].font).toBe(primaries[1].font);
    // ── AND THEY SIT ON THE SAME LINE ────────────────────────────────
    //
    // The specific regression this catches: putting the Career Discovery
    // card's "you can start without an account" note BELOW its button
    // pushes that button ~50px up the card, and two peers whose actions are
    // 50px apart do not read as peers however identical their classes are.
    expect(
      Math.abs(primaries[0].y - primaries[1].y),
      "the two actions are not on the same baseline",
    ).toBeLessThanOrEqual(2);

    // Career Discovery is not a text link anywhere in the hero.
    const discoveryLinks = await page
      .locator('#hero a[href="/security-career-assessment"]')
      .count();
    expect(discoveryLinks, "Career Discovery must be offered once, as the card's action").toBe(1);
  });

  // H5 ──────────────────────────────────────────────────────────────────
  test("both entry cards are visible without scrolling on a laptop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    for (const card of await page.locator("#hero article").all()) {
      await expect(card).toBeInViewport();
    }
  });

  // H6 ──────────────────────────────────────────────────────────────────
  test("the anonymous-start disclosure sits beside the Career Discovery action", async ({
    page,
  }) => {
    const hero = page.locator("#hero");
    const text = await hero.innerText();
    expect(text).toContain(
      "Du kan börja utan konto. Skapa ett konto när du vill spara resultatet och fortsätta i My Career.",
    );
    // Inside the SECOND card, not stranded at the bottom of the section.
    const secondCard = await page.locator("#hero article").nth(1).innerText();
    expect(secondCard).toContain("Du kan börja utan konto.");
    expect(secondCard).toContain("Starta Career Discovery");
  });

  // H7 ──────────────────────────────────────────────────────────────────
  test("the employer strip is separate, below the cards, and is not a third product card", async ({
    page,
  }) => {
    const strip = page.locator("#employers");
    const text = await strip.innerText();
    expect(text).toContain("Rekryterar du inom säkerhet?");
    expect(text).toContain(
      "Publicera jobb, hantera kandidater och använd strukturerade tester och intervjuer i samma plattform.",
    );
    const [heroBottom, stripTop] = await page.evaluate(() => [
      document.querySelector("#hero")!.getBoundingClientRect().bottom + window.scrollY,
      document.querySelector("#employers")!.getBoundingClientRect().top + window.scrollY,
    ]);
    expect(stripTop, "the employer strip is not below the two cards").toBeGreaterThanOrEqual(
      heroBottom - 2,
    );
    // Its own band: a different background from the hero, which is what
    // "visually separate" means to a reader.
    const [heroBg, stripBg] = await page.evaluate(() => [
      getComputedStyle(document.querySelector("#hero")!).backgroundColor,
      getComputedStyle(document.querySelector("#employers")!).backgroundColor,
    ]);
    expect(stripBg).not.toBe(heroBg);
    expect(await strip.locator('a[href="/signup?redirect=%2Femployer"]').count()).toBe(1);
    expect(await strip.locator('a[href="/employers"]').count()).toBe(1);
  });

  // H8 ──────────────────────────────────────────────────────────────────
  test("the connected lifecycle explains six stages and offers no solid action", async ({
    page,
  }) => {
    const lifecycle = page.locator("#lifecycle");
    const stages = await lifecycle.locator("h3").allInnerTexts();
    expect(stages.map((s) => s.replace(/^\d+\.\s*/, ""))).toEqual([
      "Upptäck",
      "Förstå",
      "Utvecklas",
      "Visa",
      "Arbeta",
      "Fortsätt",
    ]);
    const solid = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--primary)";
      document.body.append(probe);
      const navy = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return [...document.querySelectorAll<HTMLElement>("#lifecycle a")].filter(
        (el) => getComputedStyle(el).backgroundColor === navy,
      ).length;
    });
    expect(solid, "the lifecycle is an explanation, not six product cards").toBe(0);
    // Every stage offers a way onward.
    expect(await lifecycle.locator("a").count()).toBeGreaterThanOrEqual(6);
  });

  // H9 ──────────────────────────────────────────────────────────────────
  test("the Passport section names three markets and carries the disclaimer", async ({ page }) => {
    const passport = page.locator("#passport");
    const text = await passport.innerText();
    for (const market of ["Sverige", "Storbritannien", "Dubai"]) {
      expect(text, `"${market}" is missing`).toContain(market);
    }
    expect(text).toContain(
      "Security Passport hjälper dig att strukturera och dela information. Det ersätter inte en myndighetslicens, säkerhetsprövning, rätt att arbeta eller arbetsgivarens egna kontroller.",
    );
    // Northern Ireland is a SUBMARKET, Abu Dhabi is closed: neither is a
    // market this page may name.
    for (const absent of ["Nordirland", "Abu Dhabi"]) {
      expect(text, `"${absent}" must not be presented as a market`).not.toContain(absent);
    }
    // And the page never sends a signed-out visitor into an authenticated
    // Passport route.
    expect(await page.locator('main a[href^="/passport"]').count()).toBe(0);
  });

  // H10 ─────────────────────────────────────────────────────────────────
  test("three trust levels, distinct, and only source-confirmed reads as confirmed", async ({
    page,
  }) => {
    const passport = page.locator("#passport");
    const legend = "De tre nivåerna i ditt Security Passport";
    const chips = await passport.evaluate((root, label) => {
      const list = root.querySelector(`ul[aria-label="${label}"]`);
      if (!list) return [];
      return [...list.querySelectorAll("li > span")].map((el) => {
        const cs = getComputedStyle(el);
        const disc = el.querySelector("span");
        return {
          text: (el.textContent ?? "").trim(),
          borderStyle: cs.borderTopStyle,
          glyphs: el.querySelectorAll("svg").length,
          glyphPath: el.querySelector("svg")?.innerHTML ?? "",
          discBackground: disc ? getComputedStyle(disc).backgroundColor : "",
        };
      });
    }, legend);
    expect(chips, "the trust legend is missing or unlabelled").toHaveLength(3);
    for (const c of chips) expect(c.glyphs, `${c.text} has no glyph`).toBe(1);
    expect(new Set(chips.map((c) => c.glyphPath)).size, "two levels share a glyph").toBe(3);
    expect(new Set(chips.map((c) => c.discBackground)).size, "two levels share a colour").toBe(3);
    expect(chips.find((c) => /registrerat/i.test(c.text))?.borderStyle).toBe("dashed");

    // Green is reserved. Read as a HUE, not as a class name, so a rename
    // cannot quietly hand the confirmation treatment to another level.
    // The browser reports these as `oklab(L a b / alpha)` rather than rgb,
    // because the palette is authored in oklch — and in oklab a NEGATIVE `a`
    // is what "green" means. Both notations are handled.
    const greenish = chips.filter((c) => {
      const oklab = c.discBackground.match(/^oklab\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
      if (oklab) return Number(oklab[2]) < -0.05;
      const rgb = c.discBackground.match(/-?[\d.]+/g);
      if (!rgb) return false;
      const [r, g, b] = rgb.map(Number);
      return g > r + 12 && g > b + 12;
    });
    expect(greenish.map((c) => c.text.trim().toLocaleLowerCase("sv"))).toEqual(["källbekräftat"]);

    const main = (await visibleText(page)).toLowerCase();
    for (const banned of ["utfärdare", "verifierade meriter", "kompetensverifiering"]) {
      expect(main, `"${banned}" appears`).not.toContain(banned);
    }
    for (const lifecycle of ["utgången", "återkallad", "arkiverad"]) {
      expect(main, `lifecycle word "${lifecycle}" appears`).not.toContain(lifecycle);
    }
  });

  // H11 ─────────────────────────────────────────────────────────────────
  //
  // Every call to action, clicked. Not "the href is right" — clicked, with
  // the destination asserted to have actually rendered, and Back asserted to
  // come home.
  const CTAS = [
    {
      name: 'hero "Starta Career Discovery"',
      scope: "#hero",
      label: "Starta Career Discovery",
      url: "/security-career-assessment",
    },
    {
      name: 'employer strip "Se företagsplattformen"',
      scope: "#employers",
      label: "Se företagsplattformen",
      url: "/employers",
    },
    {
      name: 'lifecycle "Karriärvägar"',
      scope: "#lifecycle",
      label: "Karriärvägar",
      url: "/career-center",
    },
    { name: 'lifecycle "Jobb"', scope: "#lifecycle", label: "Jobb", url: "/jobs" },
    { name: 'header "Logga in"', scope: "header", label: "Logga in", url: "/login" },
    {
      name: 'header "Career Discovery"',
      scope: "header",
      label: "Career Discovery",
      url: "/security-career-assessment",
    },
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

  // H12 ─────────────────────────────────────────────────────────────────
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

  // H13 ─────────────────────────────────────────────────────────────────
  //
  // The promise the Passport card makes, followed through the account form.
  test("the Passport card carries its intent into the account form", async ({ page }) => {
    await page.locator("#hero").getByRole("link", { name: "Skapa mitt Security Passport" }).click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("redirect"), "the intent was dropped in transit").toBe("/passport");

    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // And the form RESOLVED the intent rather than merely echoing the URL:
    // the swap link to sign-in is built from the validated return path, so
    // its href is the observable proof that safeReturnPath accepted the
    // value instead of silently replacing it with the default destination.
    const swapHref = await page.locator('a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref, "the intent is lost if you already have an account").toContain(
      "redirect=%2Fpassport",
    );

    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
  });

  // H14 ─────────────────────────────────────────────────────────────────
  test("the employer strip carries /employer into the same one door", async ({ page }) => {
    await page.locator("#employers").getByRole("link", { name: "Registrera företag" }).click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("redirect")).toBe("/employer");
    // The SAME form, not a second employer-specific one.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    const swapHref = await page.locator('a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref).toContain("redirect=%2Femployer");
  });

  // H15 ─────────────────────────────────────────────────────────────────
  test("a signed-out visitor stays on the public homepage", async ({ page }) => {
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main h1")).toHaveText("Bygg din framtid inom säkerhet");
  });

  // H16 ─────────────────────────────────────────────────────────────────
  test("Swedish and English carry the same structure, and the document lang follows", async ({
    page,
  }) => {
    const shape = async () =>
      page.evaluate(() => ({
        lang: document.documentElement.lang,
        sections: [...document.querySelector("main")!.children].map((el) => el.id),
        h1: document.querySelectorAll("main h1").length,
        h2: document.querySelectorAll("main h2").length,
        h3: document.querySelectorAll("main h3").length,
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
    expect(en.h3).toBe(sv.h3);
    // Same destinations, in the same order: switching language may change
    // words, never where a control goes.
    expect(en.links).toEqual(sv.links);

    const enText = await visibleText(page);
    expect(enText).toContain("Build your Security Passport");
    expect(enText).toContain("Discover your security career");
    expect(enText).toContain("Create my Security Passport");
    expect(enText).toContain("Start Career Discovery");
    expect(enText).toContain(
      "You can start without an account. Create one when you want to save the result and continue in My Career.",
    );
    expect(enText).toContain(
      "It does not replace a government licence, security vetting, right-to-work check or an employer's own due diligence.",
    );
    for (const market of ["Sweden", "Great Britain", "Dubai"]) {
      expect(enText, `"${market}" is missing from the English page`).toContain(market);
    }
    // One name for the second product in English, every time.
    expect(enText).toContain("Career Discovery");
    expect(enText).not.toMatch(/career test/i);
    expect(enText).not.toMatch(/career analysis/i);
  });

  // H17 ─────────────────────────────────────────────────────────────────
  test("the English homepage renders no Swedish", async ({ page }) => {
    await setLang(page, "en");
    const seen = await visibleText(page);
    const diacritics = seen.match(/\S*[åäöÅÄÖ]\S*/g) ?? [];
    expect(diacritics, `Swedish characters on the English page: ${diacritics.join(", ")}`).toEqual(
      [],
    );
    for (const phrase of [
      "Bygg ditt Security Passport",
      "Registrera företag",
      "Sverige",
      "Storbritannien",
    ]) {
      expect(seen, `"${phrase}" is rendered on the English page`).not.toContain(phrase);
    }
  });

  // H18 ─────────────────────────────────────────────────────────────────
  test("switching language preserves the current route", async ({ page }) => {
    await page.locator("header").getByRole("link", { name: "Om oss" }).first().click();
    await page.waitForURL("**/about");
    await page.getByRole("button", { name: /^en$/i }).first().click();
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe("/about");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  // H19 ─────────────────────────────────────────────────────────────────
  //
  // ── WHAT "44 x 44" IS ASSERTED ON, AND WHAT IT IS NOT ────────────────
  //
  // Every control the homepage itself renders: 44 x 44, both dimensions, at
  // every width.
  //
  // The shared chrome is asserted where touch is the input — the footer's
  // link rows — by HEIGHT. A 33px-wide "Jobb" in a horizontal footer row is
  // a 33 x 44 target, and widening a text link into a 44px box would space
  // the row out into something nobody asked for.
  //
  // The desktop header bar's own 36px control height and the two-letter
  // language toggle are PRE-EXISTING, are mouse targets on a >=1024px
  // viewport, clear WCAG 2.5.8 (AA, 24 x 24), and changing them is a
  // redesign of a component shared by every route on the site.
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
    for (let i = 0; i < 16; i += 1) {
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

  // H20 ─────────────────────────────────────────────────────────────────
  test("the decorative washes are out of the accessibility tree and hold no control", async ({
    page,
  }) => {
    const decorative = page.locator('main [aria-hidden="true"]');
    expect(await decorative.count()).toBeGreaterThan(0);
    expect(await decorative.locator("a, button").count()).toBe(0);
  });
});

// ── EVERY REQUIRED WIDTH ────────────────────────────────────────────────
//
// The widths the brief names, plus 200% zoom, in both languages. Swedish is
// the longer language for most of this copy, so a layout that survives
// English can still break in Swedish.
test.describe("the homepage at every required width", () => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    test(`no horizontal overflow at ${width}px, sv and en`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      for (const lang of ["sv", "en"] as const) {
        await setLang(page, lang);
        const over = await horizontalOverflow(page);
        expect(over, `${lang} at ${width}px scrolls sideways by ${over}px`).toBeLessThanOrEqual(1);
      }
    });

    test(`the two entry cards stay peers at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      const boxes = await page.locator("#hero article").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );
      expect(boxes).toHaveLength(2);
      // Below `md` the grid stacks to one column, so the two cards share a
      // width but not a height. Equal WIDTH is the property that survives
      // every breakpoint, and it is the one asserted here.
      expect(
        Math.abs(boxes[0].w - boxes[1].w),
        `the cards are different widths at ${width}px`,
      ).toBeLessThanOrEqual(2);
    });
  }

  test("no horizontal overflow at 200% browser zoom", async ({ page }) => {
    // 200% zoom is a 1440px window reporting a 720px layout viewport, which
    // a halved viewport reproduces and `deviceScaleFactor` does not.
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the compact menu carries all six destinations at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /meny/i }).first().click();
    await page.waitForTimeout(300);
    const labels = await page.locator("header nav a").allInnerTexts();
    for (const label of [
      "Security Passport",
      "Career Discovery",
      "Karriärvägar",
      "Jobb",
      "Arbetsgivare",
      "Om oss",
    ]) {
      expect(labels.join(" | "), `"${label}" is missing from the compact menu`).toContain(label);
    }
    // One Login and one Create account, on a phone as on a laptop.
    const header = await page.locator("header").innerText();
    expect(header).toContain("Logga in");
    expect(header).toContain("Skapa konto");
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
    expect(hrefs, "the footer must name the second individual product too").toContain(
      "/security-career-assessment",
    );
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

// ── CAREER DISCOVERY'S LOW-FRICTION MODEL, END TO END ───────────────────
//
// The homepage promises "start without an account". This is the half of that
// promise only a browser can check: the canonical route opens signed-out,
// asks no credential, and the anonymous buffer is this TAB's sessionStorage
// rather than a row in a database.
test.describe("Career Discovery still starts without an account", () => {
  test("the canonical route opens signed-out and asks for no credential", async ({ page }) => {
    await page.goto(`${BASE}/security-career-assessment`, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname, "it bounced to an auth surface").toBe(
      "/security-career-assessment",
    );
    expect(await page.locator('input[type="password"]').count()).toBe(0);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("the temporary alias still redirects to the canonical route", async ({ page }) => {
    await page.goto(`${BASE}/discovery`, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/security-career-assessment");
  });

  test("a claim token is carried, not discarded", async ({ page }) => {
    // The claim path is what makes "create an account later to keep the
    // result" true. The homepage must not have broken the shape of it: the
    // route accepts the parameter and stays on the canonical path rather
    // than stripping it or bouncing to /login.
    await page.goto(`${BASE}/security-career-assessment?claim=e2e-token`, {
      waitUntil: "networkidle",
    });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/security-career-assessment");
    expect(await page.locator('input[type="password"]').count()).toBe(0);
  });
});

// ── THE SIGNED-IN VISITOR ───────────────────────────────────────────────
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

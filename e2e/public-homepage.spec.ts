// The REAL public homepage, in a real browser, clicked with a real mouse.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/public-homepage-check.tsx renders the route to markup: it counts
// sections, headings and words and reads the copy. It cannot see a layout.
// It cannot tell you that nothing scrolls sideways at 320px, that a control
// is 44px, that a focus ring is actually drawn, that the three core cards are
// the SAME SIZE ON SCREEN — or, the one that matters most, that a call to
// action LANDS somewhere that renders.
//
// ── WHAT CHANGED (MVP text specification, 2026-09-27) ──────────────────
//
// This file used to assert the two-peer-entrance page: the Passport as the
// hero's dark anchor, Career Discovery beside it, and a five-item public bar
// with no product names. That is superseded. The page now presents THREE
// EQUAL core parts — security work, Security Passport, career and jobs — and
// a separate employer band, and the public bar names the three parts first.
// The spec's job is to prove those are equals where only a browser can see
// it: same rendered width, same rendered height, one equally styled button
// each, all three in the first screen.
//
// Every homepage and header CTA here is clicked. For each one the spec
// asserts the resulting URL, that the destination rendered a heading or an
// explicit next step, that it is not a placeholder or an unexpected
// authentication wall, and that Back returns to the homepage.
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// The homepage makes one read on arrival — is the career analysis open? —
// and every test answers it locally (`stubServerFn`), so nothing reaches a
// backend through the dev server. The signed-in tests plant a session the
// way supabase-js stores one — under the key the client actually asks for,
// OBSERVED rather than hardcoded. Nothing reaches a database.
//
// ── THIS SUITE IS BLOCKING CI (2026-09-13) ─────────────────────────────
//
// `public-entry-browser` in .github/workflows/ci.yml starts the real
// application and runs this file against it, with no `continue-on-error` and
// no skip path. The screenshots it writes are uploaded as a CI artifact.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/public-homepage.spec.ts

import { test, expect, type Page } from "@playwright/test";
import {
  ANALYSIS_CLOSED,
  ANALYSIS_OPEN,
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

/** The seven sections the MVP text specification sets, in order. */
const SECTION_ORDER = [
  "hero",
  "security-intelligence",
  "passport",
  "career",
  "employers",
  "get-started",
  "faq",
] as const;

/** The headline, in both languages — kept by the specification. */
const H1 = {
  sv: "Din karriär och ditt säkerhetsarbete. På samma plats.",
  en: "Your career and your security work. In one place.",
} as const;

/** The three core cards' headings, in order. */
const CORE = {
  sv: [
    "Stöd i ditt säkerhetsarbete",
    "Visa dina meriter med Security Passport",
    "Hitta rätt yrkesväg och jobb",
  ],
  en: [
    "Support for your security work",
    "Present your credentials with Security Passport",
    "Find your career path and next role",
  ],
} as const;

/** The public bar, in both languages. */
const NAV = {
  sv: ["Säkerhetsarbete", "Security Passport", "Karriär", "Jobb", "För arbetsgivare", "Om oss"],
  en: ["Security work", "Security Passport", "Career", "Jobs", "For employers", "About"],
} as const;

/** Headings, claims and calls to action that were removed and must not come
 *  back — the superseded pages, and phrases the product cannot support. */
const REMOVED_SV = [
  "Din säkerhetskarriär. Samlad på ett ställe.",
  "Din yrkesidentitet inom säkerhet",
  "Samla. Styrk. Dela.",
  "Ett Passport genom hela karriären",
  "Utforska din karriärväg",
  "Se lösningar för arbetsgivare",
  "Gör karriärtestet",
  "Kostnadsfritt karriärtest inom säkerhet",
  "kostnadsfri",
  "mät din kompetens",
  "Prata med oss",
  "Kontakta oss",
  "verifierade meriter",
  "kompetensverifiering",
  "rätt kandidat",
  "Skapa ditt Security Passport",
  "rangordn",
  // The two-peer-entrance page (2026-09-13 to 2026-09-27).
  "Upptäck din säkerhetskarriär",
  "Starta Career Discovery",
  "fortsätta i My Career",
  "Se företagsplattformen",
  "Öppna Security Intelligence",
] as const;

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector("main")!.innerText);
}

/** The homepage, with the career analysis's status answered locally. */
async function gotoHome(page: Page, analysis = ANALYSIS_OPEN): Promise<void> {
  await stubServerFn(page, "getV31Availability", analysis);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
}

test.describe("the public homepage", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
  });

  // H1 ──────────────────────────────────────────────────────────────────
  test("main carries exactly seven sections, in the specified order", async ({ page }) => {
    const sections = await page.evaluate(() =>
      [...document.querySelector("main")!.children].map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id,
      })),
    );
    expect(sections.map((s) => s.tag)).toEqual(SECTION_ORDER.map(() => "section"));
    expect(sections.map((s) => s.id)).toEqual([...SECTION_ORDER]);

    for (const landmark of ["header", "main", "footer"]) {
      expect(await page.locator(landmark).count(), `${landmark} landmark`).toBe(1);
    }
    expect(await page.locator("header nav").count()).toBeGreaterThan(0);
  });

  // H2 ──────────────────────────────────────────────────────────────────
  test("the superseded pages are gone from the page AND the DOM", async ({ page }) => {
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
  test("one h1, nine h2, five h3, and the specified framing", async ({ page }) => {
    expect(await page.locator("main h1").count()).toBe(1);
    // The three core cards in the hero, then one per section below it.
    expect(await page.locator("main h2").count()).toBe(9);
    expect(await page.locator("#hero h2").allInnerTexts()).toEqual([...CORE.sv]);
    for (const id of SECTION_ORDER.slice(1)) {
      expect(await page.locator(`#${id} h2`).count(), `#${id} has one h2`).toBe(1);
    }
    // h3 is the three security-work examples and the two get-started
    // audiences.
    expect(await page.locator("main h3").count()).toBe(5);
    expect(await page.locator("#security-intelligence h3").allInnerTexts()).toEqual([
      "Omvärldsanalys",
      "Riskanalys",
      "Underlag för beredskap",
    ]);
    expect(await page.locator("#get-started h3").allInnerTexts()).toEqual([
      "För dig som person",
      "För arbetsgivare",
    ]);
    await expect(page.locator("main h1")).toHaveText(H1.sv);

    const heroText = await page.locator("#hero").innerText();
    expect(heroText).toContain(
      "Samla dina meriter i Security Passport, hitta rätt yrkesväg och jobb, och få stöd i ditt arbete med säkerhet, risk och krisberedskap.",
    );
    expect(heroText).toContain("Har du redan ett konto?");
    expect(heroText).toContain("Rekryterar du?");
    // Said inside the career card.
    expect(await page.locator('[data-home-core="career"]').innerText()).toContain(
      "Du kan läsa yrkesinformation och jobbannonser utan konto.",
    );
  });

  // H4 ──────────────────────────────────────────────────────────────────
  //
  // Equal where only a browser can see it: the same rendered width and
  // height, and one button each wearing the same computed style.
  test("the three core cards are equals on screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });

    const cards = page.locator("#hero [data-home-core]");
    await expect(cards).toHaveCount(3);
    const shapes = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const buttons = [...el.querySelectorAll<HTMLElement>("a")].filter((a) =>
          a.className.split(/\s+/).includes("h-11"),
        );
        const b = buttons[0];
        const cs = b ? getComputedStyle(b) : null;
        const h = el.querySelector("h2");
        return {
          key: el.getAttribute("data-home-core"),
          w: Math.round(r.width),
          h: Math.round(r.height),
          buttons: buttons.length,
          buttonStyle: cs ? `${cs.backgroundColor}|${cs.borderTopColor}|${cs.height}` : "",
          href: b?.getAttribute("href"),
          heading: h ? getComputedStyle(h).fontSize : "",
        };
      }),
    );
    expect(shapes.map((s) => s.key)).toEqual(["work", "passport", "career"]);
    for (const s of shapes) expect(s.buttons, `${s.key} has one button`).toBe(1);
    const [first] = shapes;
    for (const s of shapes) {
      expect(Math.abs(s.w - first.w), `${s.key} is not as wide as the others`).toBeLessThanOrEqual(
        1,
      );
      expect(Math.abs(s.h - first.h), `${s.key} is not as tall as the others`).toBeLessThanOrEqual(
        1,
      );
      expect(s.buttonStyle, `${s.key} wears a different button`).toBe(first.buttonStyle);
      expect(s.heading, `${s.key} has a different heading size`).toBe(first.heading);
    }
    expect(shapes.map((s) => s.href)).toEqual([
      "/#security-intelligence",
      "/#passport",
      "/career-center?all=true#utforska-yrken",
    ]);
    // No large Passport visual in the hero: the example lives in its section.
    await expect(page.locator("#hero [data-home-passport-preview]")).toHaveCount(0);
    await expect(page.locator("#passport [data-home-passport-preview]")).toHaveCount(1);
  });

  // H5 ──────────────────────────────────────────────────────────────────
  //
  // "The reader understands the three core parts within the first screen":
  // each card's heading is on screen before any scroll, on a small desktop
  // and on a laptop, in both languages.
  for (const [width, height] of [
    [1024, 768],
    [1440, 900],
  ] as const) {
    test(`all three core parts are in the first screen at ${width} by ${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      for (const lang of ["sv", "en"] as const) {
        await setLang(page, lang);
        for (const heading of await page.locator("#hero [data-home-core] h2").all()) {
          await expect(heading, `${lang}: a core part is below the fold`).toBeInViewport();
        }
      }
    });
  }

  test("on a large screen the three buttons are in the first screen too", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const lang of ["sv", "en"] as const) {
      await setLang(page, lang);
      for (const card of await page.locator("#hero [data-home-core]").all()) {
        await expect(
          card.locator("a.h-11"),
          `${lang}: a core button is below the fold`,
        ).toBeInViewport();
      }
    }
  });

  // H5b ─────────────────────────────────────────────────────────────────
  //
  // The two product entries in the bar, and the two core buttons that
  // explain before they ask, land on their own section of this page.
  for (const [scope, label, section] of [
    ["header", "Säkerhetsarbete", "security-intelligence"],
    ["header", "Security Passport", "passport"],
    ["#hero", "Utforska säkerhetsarbetet", "security-intelligence"],
    ["#hero", "Utforska Security Passport", "passport"],
  ] as const) {
    test(`${scope} "${label}" lands on #${section}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload({ waitUntil: "networkidle" });
      await page
        .locator(scope)
        .getByRole("link", { name: label, exact: true })
        .filter({ visible: true })
        .first()
        .click();
      await page.waitForURL((u) => u.hash === `#${section}`, { timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page.locator(`#${section} h2`)).toBeInViewport();
    });
  }

  // H5c ─────────────────────────────────────────────────────────────────
  //
  // On the bare homepage the bar is neutral; a section entry is current only
  // on its own section, and the marker follows navigation.
  test("the public bar is neutral on /, and the current item follows the reader", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });

    const items = page.locator('header nav[aria-label="Primary"] a:visible');
    const currentLabels = async () =>
      (
        await items.evaluateAll((els) =>
          els
            .filter((e) => e.getAttribute("aria-current") === "page")
            .map((e) => e.textContent ?? ""),
        )
      ).map((x) => x.trim());

    expect(await currentLabels(), "on / no item is current").toEqual([]);

    await items.filter({ hasText: "Security Passport" }).first().click();
    await page.waitForURL((u) => u.hash === "#passport", { timeout: 15_000 });
    await expect.poll(currentLabels).toEqual(["Security Passport"]);

    await items.filter({ hasText: "Jobb" }).first().click();
    await page.waitForURL((u) => u.pathname === "/jobs", { timeout: 15_000 });
    await expect.poll(currentLabels).toEqual(["Jobb"]);
  });

  // H6 ──────────────────────────────────────────────────────────────────
  //
  // The career analysis follows its existing access status. Open: a direct
  // action to the canonical route. Not open: the specified sentence, and the
  // career card drops its analysis link rather than advertise a closed door.
  test("the career analysis action is offered while it is open", async ({ page }) => {
    const career = page.locator("#career");
    await expect(career.getByRole("link", { name: "Gör karriäranalysen" })).toHaveAttribute(
      "href",
      "/security-career-assessment",
    );
    await expect(
      page.locator('[data-home-core="career"]').getByRole("link", { name: "Gör karriäranalysen" }),
    ).toHaveCount(1);
    await expect(career).toContainText(
      "Karriäranalysen ger vägledning. Den avgör inte din kompetens, behörighet eller om du får ett jobb.",
    );
    await expect(page.locator("[data-career-analysis-closed]")).toHaveCount(0);
  });

  test("when the analysis is not open, the page says so in the specified words", async ({
    page,
  }) => {
    await gotoHome(page, ANALYSIS_CLOSED);
    const closed = page.locator("[data-career-analysis-closed]");
    await expect(closed).toHaveText(
      "Karriäranalysen är inte öppen för nya deltagare just nu. Du kan fortfarande utforska yrken och jobb.",
    );
    await expect(
      page.locator("#career").getByRole("link", { name: "Gör karriäranalysen" }),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-home-core="career"]').getByRole("link", { name: "Gör karriäranalysen" }),
    ).toHaveCount(0);
    // Professions and jobs are still one click away.
    await expect(page.locator("#career a[href='/career-center']")).toHaveCount(1);
    await expect(page.locator("#career a[href='/jobs']")).toHaveCount(1);
    await shot(
      page,
      "homepage-sv-career-analysis-closed",
      "Career section when the career analysis is not open: the specified sentence, no action",
    );
  });

  // H7 ──────────────────────────────────────────────────────────────────
  test("the employer band is separate, after the three parts, and is not a fourth card", async ({
    page,
  }) => {
    const band = page.locator("#employers");
    const text = await band.innerText();
    expect(text).toContain("Rekrytera och utveckla säkerhetspersonal");
    expect(text).toContain(
      "Samla jobbannonser, ansökningar, rekryteringstester och strukturerade intervjuer i Företagsportalen. Fortsätt med kompetensutveckling för medarbetarna. Ni fattar och dokumenterar besluten.",
    );
    const [careerBottom, bandTop] = await page.evaluate(() => [
      document.querySelector("#career")!.getBoundingClientRect().bottom + window.scrollY,
      document.querySelector("#employers")!.getBoundingClientRect().top + window.scrollY,
    ]);
    expect(bandTop, "the employer band is not after the three parts").toBeGreaterThanOrEqual(
      careerBottom - 2,
    );
    // Its own band: a different background from the hero, which is what
    // "visually separate" means to a reader.
    const [heroBg, bandBg] = await page.evaluate(() => [
      getComputedStyle(document.querySelector("#hero")!).backgroundColor,
      getComputedStyle(document.querySelector("#employers")!).backgroundColor,
    ]);
    expect(bandBg).not.toBe(heroBg);
    expect(await band.locator('a[href="/signup?redirect=%2Femployer"]').count()).toBe(1);
    expect(await band.locator('a[href="/employers"]').count()).toBe(1);
    await expect(page.locator("#hero [data-home-core]")).toHaveCount(3);
  });

  // H8 ──────────────────────────────────────────────────────────────────
  //
  // The deep dives explain and link, and none of them draws a solid action
  // of its own: the page's solid actions are the hero's account action and
  // the employer registration.
  test("the sections below the hero explain and link, and draw no solid action", async ({
    page,
  }) => {
    const solid = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--primary)";
      document.body.append(probe);
      const navy = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return ["security-intelligence", "passport", "career", "get-started", "faq"].map((id) => ({
        id,
        solid: [...document.querySelectorAll<HTMLElement>(`#${id} a`)].filter(
          (el) => getComputedStyle(el).backgroundColor === navy,
        ).length,
      }));
    });
    for (const s of solid) expect(s.solid, `#${s.id} draws a solid action`).toBe(0);
    // The career section offers the analysis, the professions and the jobs.
    expect(await page.locator("#career a").count()).toBe(3);
    // Three steps for a person and three for an employer, each in order.
    await expect(page.locator("#get-started ol")).toHaveCount(2);
    for (const list of await page.locator("#get-started ol").all()) {
      await expect(list.locator(":scope > li")).toHaveCount(3);
    }
  });

  // H8b ─────────────────────────────────────────────────────────────────
  test("the employer decides, security work keeps its boundary, and the steps are there", async ({
    page,
  }) => {
    const band = page.locator("#employers");
    await expect(band).toContainText("För arbetsgivare");
    const flow = (await band.locator("ol > li").allInnerTexts()).map((s) =>
      s.replace(/^\s*\d+\.\s*/, "").trim(),
    );
    expect(flow, "the employer flow").toEqual([
      "Publicera jobb",
      "Hantera ansökningar",
      "Använd rekryteringstester",
      "Förbered intervjun",
      "Fatta och dokumentera beslutet",
    ]);
    // Learning and development after the steps, as continued use.
    await expect(band).toContainText("Därefter: kompetensutveckling för medarbetarna.");

    const si = page.locator("#security-intelligence");
    const siText = await si.innerText();
    expect(siText).toContain(
      "Lägg inte in säkerhetsskyddsklassificerad eller hemlig information. Ditt säkerhetsarbete delas inte automatiskt med din karriärprofil, Security Passport eller arbetsgivare.",
    );
    expect(siText).toContain(
      "Arbetsytan kan användas manuellt. AI-stöd och dokumentbearbetning har separat tillgänglighet som visas när du öppnar arbetsytan.",
    );
    expect(siText).toContain("När AI-stödet är tillgängligt");
    // Task, evidence, results and review.
    expect(await si.locator("dt").allInnerTexts()).toEqual([
      "Uppgift",
      "Underlag",
      "Resultat",
      "Din granskning",
    ]);
    expect(siText).toContain(
      "Kontrollera källor, osäkerheter och slutsatser. Du väljer vilka förslag du använder och godkänner rapporten.",
    );
    expect(await si.locator("a").count()).toBe(1);
    await expect(si.locator("a")).toHaveAttribute("href", "/signup?redirect=%2Fsecurity-work");
    await expect(si.locator("a")).toHaveText("Öppna Mitt säkerhetsarbete");

    const start = await page.locator("#get-started").innerText();
    expect(start).toContain("Följ organisationens status medan registreringen granskas.");
    expect(start).toContain("Du behöver inte fylla i alla delar för att börja.");
  });

  // H8c ─────────────────────────────────────────────────────────────────
  //
  // Six questions, each a native disclosure: closed until asked, opened by
  // the keyboard, and the answers that matter most -- who decides, what is
  // verified, and what AI does -- are exactly what they say.
  test("the six questions open by keyboard, and say who decides, what is verified and what AI does", async ({
    page,
  }) => {
    const faq = page.locator("#faq");
    const items = faq.locator("details");
    await expect(items).toHaveCount(6);
    await expect(faq).toContainText("Priser och paket är inte publicerade ännu.");
    await expect(faq.locator('a[href="/contact"]')).toHaveCount(0);

    const open = async (question: string) => {
      const item = items.filter({ hasText: question });
      const summary = item.locator("summary");
      await summary.focus();
      await expect(summary).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(item).toHaveAttribute("open", "");
      const answer = item.locator("p");
      await expect(answer).toBeVisible();
      return answer;
    };

    const who = await open("Beslutar AI vem som anställs?");
    await expect(who).toContainText(
      "Arbetsgivaren granskar underlaget och fattar och dokumenterar beslutet.",
    );

    const verified = await open("Är mina meriter verifierade?");
    await expect(verified).toContainText(
      "En egen uppgift eller en uppladdad handling är inte automatiskt källbekräftad.",
    );

    const jobs = await open("Behöver jag konto för att läsa jobbannonser?");
    await expect(jobs).toContainText("Du kan söka och läsa annonser utan konto.");

    const ai = await open("Hur hjälper AI till i säkerhetsarbetet?");
    await expect(ai).toContainText("Arbetsytan kan också användas manuellt.");
  });

  // H9 ──────────────────────────────────────────────────────────────────
  test("the Passport section: what it holds, the fictional example, three markets and the disclaimer", async ({
    page,
  }) => {
    const passport = page.locator("#passport");
    const text = await passport.innerText();
    for (const market of ["Sverige", "Storbritannien", "Dubai"]) {
      expect(text, `"${market}" is missing`).toContain(market);
    }
    expect(text).toContain(
      "Security Passport hjälper dig att strukturera och dela information. Det ersätter inte en myndighetslicens, säkerhetsprövning, rätt att arbeta eller arbetsgivarens egna kontroller.",
    );
    expect(text).toContain(
      "Ett uppladdat dokument innebär inte i sig att uppgiften har verifierats.",
    );
    expect(text).toContain(
      "Du väljer vad som delas. En jobbansökan delar inte ditt Security Passport automatiskt.",
    );
    await expect(passport.locator("[data-home-passport-example-caption]")).toHaveText(
      "Exempel – påhittad person och påhittade meriter.",
    );
    await expect(passport.locator("[data-home-passport-example] a")).toHaveCount(0);
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
      name: 'hero "Se företagsportalen"',
      scope: "#hero",
      label: "Se företagsportalen",
      url: "/employers",
    },
    {
      name: 'career card "Utforska yrken"',
      scope: "#hero",
      label: "Utforska yrken",
      url: "/career-center",
    },
    { name: 'career card "Hitta jobb"', scope: "#hero", label: "Hitta jobb", url: "/jobs" },
    {
      name: 'career section "Gör karriäranalysen"',
      scope: "#career",
      label: "Gör karriäranalysen",
      url: "/security-career-assessment",
    },
    {
      name: 'career section "Utforska yrken och karriärvägar"',
      scope: "#career",
      label: "Utforska yrken och karriärvägar",
      url: "/career-center",
    },
    {
      name: 'career section "Se lediga jobb"',
      scope: "#career",
      label: "Se lediga jobb",
      url: "/jobs",
    },
    {
      name: 'employer band "Utforska Företagsportalen"',
      scope: "#employers",
      label: "Utforska Företagsportalen",
      url: "/employers",
    },
    { name: 'header "Logga in"', scope: "header", label: "Logga in", url: "/login" },
    { name: 'header "Karriär"', scope: "header", label: "Karriär", url: "/career-center" },
    { name: 'header "Jobb"', scope: "header", label: "Jobb", url: "/jobs" },
    {
      name: 'header "För arbetsgivare"',
      scope: "header",
      label: "För arbetsgivare",
      url: "/employers",
    },
    { name: 'header "Om oss"', scope: "header", label: "Om oss", url: "/about" },
  ] as const;

  for (const cta of CTAS) {
    test(`${cta.name} reaches ${cta.url} and can be left again`, async ({ page }) => {
      const menu = page.getByRole("button", { name: /Öppna meny|Open menu/ });
      if (cta.scope === "header" && (await menu.isVisible())) await menu.click();
      const root =
        cta.scope === "header"
          ? page.locator("header").filter({ visible: true })
          : page.locator(cta.scope);
      await root
        .getByRole("link", { name: cta.label, exact: cta.scope === "header" })
        .filter({ visible: true })
        .first()
        .click();
      await page.waitForURL((u) => u.pathname === cta.url, { timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe(cta.url);

      // It rendered, and it rendered something a person can act on. A blank
      // screen, a 404 and a spinner that never resolves all fail here.
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
      const body = await page.evaluate(() => document.body.innerText);
      expect(body.trim().length, "the destination is blank").toBeGreaterThan(40);
      expect(body).not.toMatch(/404|Not Found|Sidan kunde inte hittas/i);

      // Not an unexpected authentication wall. /login is the one destination
      // that is supposed to ask for credentials.
      //
      // toHaveCount RETRIES; a bare .count() is a single sample. waitForURL
      // resolves when the router commits the URL, which is before the
      // outgoing route unmounts, so a one-shot read here can still see the
      // page we just left.
      if (cta.url !== "/login") {
        await expect(page.locator('input[type="password"]')).toHaveCount(0);
      }

      await page.goBack({ waitUntil: "networkidle" });
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page.locator("main h1")).toBeVisible();
    });
  }

  // H12 ─────────────────────────────────────────────────────────────────
  //
  // The six, in order, in BOTH languages, at the desktop bar. Exact and
  // ordered.
  for (const lang of ["sv", "en"] as const) {
    test(`${lang}: the public bar is exactly the specified six, in order`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setLang(page, lang);
      // `:visible`, because the desktop bar and the compact menu BOTH carry
      // aria-label="Primary" and both are in the DOM at every width — only
      // one of them is on screen.
      const labels = (
        await page.locator('header nav[aria-label="Primary"] a:visible').allInnerTexts()
      ).map((x) => x.trim());
      expect(labels, `${lang} public nav`).toEqual([...NAV[lang]]);
      // Career Discovery is not an entry of its own.
      expect(labels.join(" | ")).not.toContain("Career Discovery");
    });
  }

  // H13 ─────────────────────────────────────────────────────────────────
  //
  // The promise the Passport section makes, followed through the account form.
  test("the Passport section carries its intent into the account form", async ({ page }) => {
    await page
      .locator("#passport")
      .getByRole("link", { name: "Skapa mitt Security Passport" })
      .click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("redirect"), "the intent was dropped in transit").toBe("/passport");

    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // And the form RESOLVED the intent rather than merely echoing the URL:
    // the swap link to sign-in is built from the validated return path.
    const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref, "the intent is lost if you already have an account").toContain(
      "redirect=%2Fpassport",
    );

    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
  });

  // H14 ─────────────────────────────────────────────────────────────────
  test("the employer band carries /employer into the same one door", async ({ page }) => {
    await page.locator("#employers").getByRole("link", { name: "Registrera företag" }).click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("redirect")).toBe("/employer");
    // The SAME form, not a second employer-specific one.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref).toContain("redirect=%2Femployer");
  });

  // H14b ────────────────────────────────────────────────────────────────
  //
  // The page's two other account actions go through the same door, and each
  // keeps its own landing through the form and the login swap.
  for (const intent of [
    { name: '"Skapa konto"', scope: "#hero", label: "Skapa konto", landing: "/my-career" },
    {
      name: '"Öppna Mitt säkerhetsarbete"',
      scope: "#security-intelligence",
      label: "Öppna Mitt säkerhetsarbete",
      landing: "/security-work",
    },
  ] as const) {
    test(`${intent.name} carries ${intent.landing} into the same one door`, async ({ page }) => {
      await page.locator(intent.scope).getByRole("link", { name: intent.label }).click();
      await page.waitForURL("**/signup**", { timeout: 15_000 });
      const url = new URL(page.url());
      expect(url.pathname).toBe("/signup");
      expect(url.searchParams.get("redirect")).toBe(intent.landing);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
      const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
      expect(swapHref).toContain(`redirect=${encodeURIComponent(intent.landing)}`);
    });
  }

  // H15 ─────────────────────────────────────────────────────────────────
  test("a signed-out visitor stays on the public homepage", async ({ page }) => {
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main h1")).toHaveText(H1.sv);
  });

  // H16 ─────────────────────────────────────────────────────────────────
  test("Swedish and English carry the same structure, and the document lang follows", async ({
    page,
  }) => {
    const shape = async () =>
      page.evaluate(() => ({
        lang: document.documentElement.lang,
        title: document.title,
        sections: [...document.querySelector("main")!.children].map((el) => el.id),
        h1: document.querySelectorAll("main h1").length,
        h2: document.querySelectorAll("main h2").length,
        h3: document.querySelectorAll("main h3").length,
        links: [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href")),
      }));

    await setLang(page, "sv");
    const sv = await shape();
    expect(sv.lang).toBe("sv");
    expect(sv.title).toBe("CQrityjob – din karriär och ditt säkerhetsarbete");

    await setLang(page, "en");
    const en = await shape();
    expect(en.lang).toBe("en");
    // The English reader gets the English title as well as the English page.
    expect(en.title).toBe("CQrityjob – your career and security work");

    expect(en.sections).toEqual(sv.sections);
    expect(en.h1).toBe(sv.h1);
    expect(en.h2).toBe(sv.h2);
    expect(en.h3).toBe(sv.h3);
    // Same destinations, in the same order: switching language may change
    // words, never where a control goes.
    expect(en.links).toEqual(sv.links);

    const enText = await visibleText(page);
    for (const heading of CORE.en) expect(enText).toContain(heading);
    expect(enText).toContain("Create my Security Passport");
    expect(enText).toContain("Explore professions");
    expect(enText).toContain(
      "It does not replace a government licence, security vetting, right-to-work check or an employer's own due diligence.",
    );
    for (const market of ["Sweden", "Great Britain", "Dubai"]) {
      expect(enText, `"${market}" is missing from the English page`).toContain(market);
    }
    expect(enText).toContain("Career Discovery");
    expect(enText).not.toMatch(/career test/i);
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
      "Visa dina meriter med Security Passport",
      "Registrera företag",
      "Sverige",
      "Storbritannien",
    ]) {
      expect(seen, `"${phrase}" is rendered on the English page`).not.toContain(phrase);
    }
  });

  // H18 ─────────────────────────────────────────────────────────────────
  test("switching language preserves the current route", async ({ page }) => {
    const menu = page.getByRole("button", { name: /Öppna meny|Open menu/ });
    if (await menu.isVisible()) await menu.click();
    await page
      .locator("header")
      .getByRole("link", { name: "Om oss" })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForURL("**/about");
    await page.getByRole("button", { name: /^en$/i }).filter({ visible: true }).first().click();
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe("/about");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  // H19 ─────────────────────────────────────────────────────────────────
  //
  // ── 44 x 44, EVERYWHERE, WITH NO EXEMPT REGION ───────────────────────
  //
  // The Platform Entry Specification requires the public destinations to be
  // reachable "with 44 pixel minimum targets" and requires it of every
  // control. So header, main and footer are all measured, both dimensions
  // are measured, and the components are changed to meet it rather than the
  // assertion weakened to accept them.
  test("every public control is at least 44 x 44 in header, main and footer", async ({ page }) => {
    for (const width of REQUIRED_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      const under = await undersizedTargets(page);
      expect(under, `under 44x44 at ${width}px: ${JSON.stringify(under)}`).toEqual([]);
    }
    // And inside the compact menu, where the six destinations live below lg.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /meny/i }).first().click();
    // `#site-menu nav a`, not `header nav a`: below lg the header carries BOTH
    // navs in the DOM and the desktop one comes first.
    await expect(page.locator("#site-menu nav a").first()).toBeVisible();
    const inMenu = await undersizedTargets(page);
    expect(inMenu, `under 44x44 inside the open menu: ${JSON.stringify(inMenu)}`).toEqual([]);
    await shot(
      page,
      "homepage-sv-375-menu-open",
      "Compact menu open at 375px; all six destinations at >= 44 x 44",
    );
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
  test.beforeEach(async ({ page }) => {
    await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
  });

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

    test(`all three core parts remain visible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      const cards = page.locator("#hero [data-home-core]");
      await expect(cards).toHaveCount(3);
      for (const card of await cards.all()) {
        await expect(card).toBeVisible();
        await expect(card.locator("a.h-11")).toBeVisible();
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

  test("the compact menu carries the same six destinations, in the same order, at 375px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /meny/i }).first().click();
    await expect(page.locator("#site-menu nav a").first()).toBeVisible();
    const labels = (await page.locator("#site-menu nav a").allInnerTexts()).map((x) => x.trim());

    // Same ORDER, not merely the same set: one information architecture at
    // both viewports is the whole point of the single definition.
    expect(labels).toEqual([...NAV.sv]);
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
    // The same six as the header.
    for (const href of [
      "/#security-intelligence",
      "/#passport",
      "/career-center",
      "/jobs",
      "/employers",
      "/about",
    ]) {
      expect(hrefs, `the footer lacks ${href}`).toContain(href);
    }
    const text = await footer.innerText();
    expect(text).toContain("Där förtroende kommer först.");
    // Said plainly, and not presented as a link: the documents are not
    // published yet.
    const legal = "Integritetspolicy och användarvillkor är inte publicerade ännu.";
    expect(text).toContain(legal);
    expect(
      await footer.getByRole("link", { name: /Integritetspolicy|användarvillkor/i }).count(),
    ).toBe(0);
  });
});

// ── CAREER DISCOVERY'S LOW-FRICTION MODEL, END TO END ───────────────────
//
// The canonical route opens signed-out, asks no credential, and the
// anonymous buffer is this TAB's sessionStorage rather than a row in a
// database.
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
    // result" true. The route accepts the parameter and stays on the
    // canonical path rather than stripping it or bouncing to /login.
    await page.goto(`${BASE}/security-career-assessment?claim=e2e-token`, {
      waitUntil: "networkidle",
    });
    const url = new URL(page.url());
    expect(url.pathname).toBe("/security-career-assessment");
    expect(url.searchParams.get("claim"), "the token was stripped in transit").toBe("e2e-token");
    expect(await page.locator('input[type="password"]').count()).toBe(0);
    await shot(
      page,
      "career-discovery-claim-token",
      "Canonical Career Discovery route with ?claim= preserved, signed out, no credential asked",
    );
  });

  // ── THE TOKEN SURVIVES THE ROUND TRIP THROUGH THE ONE DOOR ───────────
  test("the claim survives a signup/login swap", async ({ page }) => {
    const returnTo = "/security-career-assessment?claim=e2e-token";
    await page.goto(`${BASE}/signup?redirect=${encodeURIComponent(returnTo)}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });

    // Scoped to `main` throughout this file: the HEADER's own
    // "Företagsinloggning" is also a `/login?…` link, it carries
    // `redirect=/employer`, and it precedes <main> in the DOM.
    const swap = page.locator('main a[href^="/login?"]').first();
    const swapHref = await swap.getAttribute("href");
    expect(swapHref, "the claim is lost for somebody who already has an account").toContain(
      "claim%3De2e-token",
    );

    await swap.click();
    await page.waitForURL("**/login**", { timeout: 15_000 });
    const back = new URL(page.url()).searchParams.get("redirect");
    expect(back, "the swap dropped the return path").toBe(returnTo);
    await shot(
      page,
      "career-discovery-claim-swap",
      "Claim token preserved across the signup -> login swap",
    );
  });
});

// ── THE SIGNED-IN VISITOR ───────────────────────────────────────────────
test.describe("the signed-in visitor", () => {
  test("a signed-in visitor at / is redirected to /my-career, without a loop", async ({ page }) => {
    // observeSupabaseStorageKey loads / before the boundary is installed.
    await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
    const refusals = await installBoundary(page, {
      // Everything the shell and the header ask for on arrival. A `null`
      // answer is a legitimate one for each; what matters here is the
      // redirect, not the dashboard's contents.
      listMyEmployerWorkspaces: [],
      countMyAcademyWork: 0,
      countMyReviewQueue: 0,
      ensureMyEmployerCompanyFromSignup: null,
      getV31Availability: ANALYSIS_OPEN,
      getV31TesterStatus: { allowed: false },
    });
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key);

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/my-career**", { timeout: 20_000 });
    expect(new URL(page.url()).pathname.startsWith("/my-career")).toBe(true);

    // And it is a redirect, not a loop: the URL settles and stays settled.
    const first = page.url();
    await page.waitForTimeout(3000);
    expect(page.url(), "the redirect is looping").toBe(first);
    // The security claim, which is what this test is for: nothing reached a
    // Supabase host. The destination's own reads are not the subject of a
    // redirect test; they never leave the browser either (an unstubbed
    // export is refused by the harness, not forwarded).
    expect(
      refusals.production,
      `the page tried to reach a Supabase host: ${refusals.production.join(", ")}`,
    ).toEqual([]);
    await shot(
      page,
      "signed-in-redirect-no-loop",
      "Signed-in visitor at / settles on /my-career and stays there",
    );
  });
});

// ── ROUTED EVIDENCE ─────────────────────────────────────────────────────
//
// The screenshots the review asks for, taken from the RUNNING application
// rather than from statically rendered HTML. Each one follows an assertion
// in the same test, so a picture cannot show a state nothing verified.
//
// Written to artifacts/public-entry-browser/ with a manifest, and uploaded
// by the `public-entry-browser` CI job whatever the outcome.
test.describe("routed evidence — the three core parts", () => {
  test.beforeEach(async ({ page }) => {
    await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
  });

  for (const lang of ["sv", "en"] as const) {
    for (const width of [1440, 375, 390] as const) {
      test(`homepage ${lang} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width >= 1440 ? 900 : 812 });
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await setLang(page, lang);

        await expect(page.locator("main h1")).toHaveText(H1[lang]);
        // The three parts are present, in order, and each has its button.
        const cards = page.locator("#hero [data-home-core]");
        await expect(cards.locator("h2")).toHaveText([...CORE[lang]]);
        for (const card of await cards.all()) {
          await expect(card.locator("a.h-11")).toBeVisible();
        }
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        expect(await undersizedTargets(page)).toEqual([]);

        // At 1440 all three parts are in the first screen.
        if (width === 1440) {
          for (const heading of await cards.locator("h2").all()) {
            await expect(heading).toBeInViewport();
          }
        }

        await shot(
          page,
          `homepage-${lang}-${width}`,
          `Homepage ${lang.toUpperCase()} at ${width}px — three equal core parts, 0px overflow`,
        );
      });
    }
  }

  test("the Passport signup destination", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page
      .locator("#passport")
      .getByRole("link", { name: "Skapa mitt Security Passport" })
      .click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/passport");
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref, "the Passport intent is lost on the swap").toContain("redirect=%2Fpassport");
    await shot(
      page,
      "passport-signup-destination",
      "Passport section -> /signup?redirect=/passport, intent resolved by the form",
    );
  });

  test("the career analysis anonymous landing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.locator("#career").getByRole("link", { name: "Gör karriäranalysen" }).click();
    await page.waitForURL("**/security-career-assessment**", { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/security-career-assessment");
    // Signed out, and no credential asked for before the first question.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 20_000 });
    await shot(
      page,
      "career-discovery-anonymous-landing",
      "Career analysis canonical landing reached signed out, no credential requested",
    );
  });
});

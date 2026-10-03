// The REAL public homepage, in a real browser, clicked with a real mouse.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/public-homepage-check.tsx renders the route to markup: it counts
// sections, headings and words and reads the copy. It cannot see a layout.
// It cannot tell you that nothing scrolls sideways at 320px, that a control
// is 44px, that a focus ring is actually drawn, that the four entry cards are
// the SAME SIZE ON SCREEN — or, the one that matters most, that a call to
// action LANDS somewhere that renders.
//
// ── WHAT CHANGED (locked public website, 2026-09-30) ───────────────────
//
//   HOMEPAGE = BREADTH. SUBPAGE = DEPTH. CTA = THE PATH FORWARD.
//
// The seven-section page, which explained each product in depth, is
// replaced by six sections that point the way: the hero with two equal
// audience entrances, "För dig i säkerhetsbranschen" (four equal cards, one
// action each, to each area's own page), real latest jobs, the employer
// journey, recruitment services, and "Varför CQrityjob". Every one of those
// actions is clicked here, and for each the spec asserts the resulting URL,
// that the destination rendered, and that Back returns to the homepage.
//
// ── HOW THE BACKEND IS HANDLED ─────────────────────────────────────────
//
// The homepage makes one read on arrival: the latest published adverts, a
// GET on `rest/v1/jobs`. Every test answers it locally (`answerPublicJobs`)
// from a synthetic catalogue, so nothing reaches a backend through the dev
// server. The signed-in test plants a session the way supabase-js stores
// one — under the key the client actually asks for, OBSERVED rather than
// hardcoded. Nothing reaches a database.
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
  ANALYSIS_OPEN,
  answerNetworkStats,
  answerPublicJobs,
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
import { installJobsFixture, JOBS_FIXTURE } from "./support/jobs-fixture";

/** The six sections, in the locked order. */
const SECTION_ORDER = [
  "hero",
  "for-dig",
  "senaste-jobben",
  "for-arbetsgivare",
  "rekryteringstjanster",
  "varfor",
] as const;

/** The locked hero (owner decision, 2026-10-01): one English brand
 *  statement, the same in both languages. */
const H1 = {
  sv: "Security careers, without limits.",
  en: "Security careers, without limits.",
} as const;

/** The four "För dig" entries: card, action label, destination. */
const ENTRIES = [
  { key: "career", label: "Utforska karriärvägar", to: "/career-center" },
  { key: "jobs", label: "Se lediga jobb", to: "/jobs" },
  { key: "passport", label: "Upptäck Security Passport", to: "/security-passport" },
  { key: "work", label: "Upptäck säkerhetsarbetet", to: "/sakerhetsarbete" },
] as const;

/** The locked public bar, in both languages. */
const NAV = {
  sv: ["Karriär", "Jobb", "Security Passport", "Säkerhetsarbete", "För arbetsgivare", "Om oss"],
  en: ["Career", "Jobs", "Security Passport", "Security work", "For employers", "About"],
} as const;

/** The locked employer journey. */
const JOURNEY = ["Annonsera", "Ta emot och hantera", "Bedöm", "Intervjua", "Besluta"] as const;

/** Headings, claims and calls to action that were removed and must not come
 *  back — the superseded pages, the owner's review, and phrases the product
 *  cannot support. */
const REMOVED_SV = [
  "Din karriär och ditt säkerhetsarbete. På samma plats.",
  "Din säkerhetskarriär. Samlad på ett ställe.",
  "AI-stöd finns där det är aktiverat",
  "samla ansökningar",
  "Gör karriärtestet",
  "Kostnadsfritt karriärtest inom säkerhet",
  "kostnadsfri",
  "mät din kompetens",
  "verifierade meriter",
  "kompetensverifiering",
  "rangordn",
  "Starta Career Discovery",
  "Öppna Security Intelligence",
  "Vanliga frågor",
] as const;

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector("main")!.innerText);
}

/** The homepage, with its one read — the latest adverts — answered locally. */
async function gotoHome(page: Page, jobs: readonly unknown[] = JOBS_FIXTURE): Promise<void> {
  await answerPublicJobs(page, jobs);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
}

/** Click, land, assert the destination rendered, and come back. */
async function landsAndReturns(page: Page, pathname: string): Promise<void> {
  await page.waitForURL((u) => u.pathname === pathname, { timeout: 15_000 });
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15_000 });
  await page.goBack({ waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).toBe("/");
}

test.describe("the public homepage", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
  });

  // H1 ──────────────────────────────────────────────────────────────────
  test("main carries exactly six sections, in the locked order", async ({ page }) => {
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
  });

  // H2 ──────────────────────────────────────────────────────────────────
  test("the superseded pages are gone from the page AND the DOM", async ({ page }) => {
    const text = (await visibleText(page)).toLowerCase();
    const html = (
      await page.evaluate(() => document.querySelector("main")!.innerHTML)
    ).toLowerCase();
    for (const phrase of REMOVED_SV) {
      expect(text, `"${phrase}" is still rendered`).not.toContain(phrase.toLowerCase());
      expect(html, `"${phrase}" is still in the DOM, only hidden`).not.toContain(
        phrase.toLowerCase(),
      );
    }
    // No product is explained in depth here: the Passport example lives on
    // the Passport's own page.
    await expect(page.locator("[data-home-passport-preview]")).toHaveCount(0);
  });

  // H3 ──────────────────────────────────────────────────────────────────
  test("one h1, five h2, and the hero is centred and says one thing", async ({ page }) => {
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator("main h1")).toHaveText(H1.sv);
    await expect(page.locator("main h2")).toHaveText([
      "Hela karriären. På samma plats.",
      "Nästa möjlighet kan finnas här.",
      "Hitta människorna som stärker er säkerhet.",
      "Vill ni ha hjälp med hela rekryteringen?",
      "En bransch. Många yrkesliv. En plats att utvecklas och mötas.",
    ]);
    const h1 = await page.locator("main h1").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        align: getComputedStyle(el).textAlign,
        centre: r.left + r.width / 2,
        viewport: document.documentElement.clientWidth / 2,
      };
    });
    expect(h1.align).toBe("center");
    expect(Math.abs(h1.centre - h1.viewport), "the headline is off centre").toBeLessThanOrEqual(24);
    await expect(page.locator("#hero")).toContainText(
      "Upptäck din riktning, bygg ditt Security Passport, hitta nästa möjlighet och utveckla din karriär inom säkerhet – lokalt eller internationellt.",
    );
  });

  // H4 ──────────────────────────────────────────────────────────────────
  //
  // Two EQUAL audience entrances and no other hero action.
  test("the hero's two audience entrances are equals and jump to their sections", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    const links = page.locator("#hero a");
    await expect(links).toHaveCount(2);
    const shapes = await links.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          key: el.getAttribute("data-home-audience"),
          href: el.getAttribute("href"),
          w: Math.round(r.width),
          h: Math.round(r.height),
          top: Math.round(r.top),
        };
      }),
    );
    expect(shapes.map((s) => s.key)).toEqual(["individual", "employer"]);
    expect(Math.abs(shapes[0]!.w - shapes[1]!.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(shapes[0]!.h - shapes[1]!.h)).toBeLessThanOrEqual(1);
    expect(shapes[0]!.top).toBe(shapes[1]!.top);
    for (const [key, section] of [
      ["individual", "for-dig"],
      ["employer", "for-arbetsgivare"],
    ] as const) {
      await page.locator(`#hero [data-home-audience="${key}"]`).click();
      await page.waitForURL((u) => u.hash === `#${section}`, { timeout: 15_000 });
      await expect(page.locator(`#${section} h2`)).toBeInViewport();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  // H5 ──────────────────────────────────────────────────────────────────
  test("the four entries are equals on screen, one action each", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "networkidle" });
    const cards = page.locator("#for-dig [data-home-entry]");
    await expect(cards).toHaveCount(4);
    const shapes = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          key: el.getAttribute("data-home-entry"),
          w: Math.round(r.width),
          h: Math.round(r.height),
          hrefs: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")),
        };
      }),
    );
    expect(shapes.map((s) => s.key)).toEqual(ENTRIES.map((e) => e.key));
    for (const [i, s] of shapes.entries()) {
      expect(s.hrefs, `${s.key} has one action`).toEqual([ENTRIES[i]!.to]);
      expect(Math.abs(s.w - shapes[0]!.w), `${s.key} is not as wide`).toBeLessThanOrEqual(1);
      expect(Math.abs(s.h - shapes[0]!.h), `${s.key} is not as tall`).toBeLessThanOrEqual(1);
    }
  });

  // H6 ──────────────────────────────────────────────────────────────────
  //
  // Each card is its action's target — the whole card, not only the words.
  for (const entry of ENTRIES) {
    test(`the ${entry.key} card lands on ${entry.to}, and Back returns`, async ({ page }) => {
      await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
      // A real mouse click on the card's HEADING, not on its link: the
      // stretched link must make the whole card the target. (Playwright's
      // own click() would refuse, because the link's overlay covers the
      // heading — which is the point.)
      const heading = page.locator(`#for-dig [data-home-entry="${entry.key}"] h3`);
      await heading.scrollIntoViewIfNeeded();
      const box = (await heading.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await landsAndReturns(page, entry.to);
      // And the link's own words are its accessible name.
      await expect(
        page.locator("#for-dig").getByRole("link", { name: entry.label, exact: true }),
      ).toHaveAttribute("href", entry.to);
    });
  }

  // H7 ──────────────────────────────────────────────────────────────────
  test("the latest jobs are real adverts, and each opens its own page", async ({ page }) => {
    const section = page.locator("#senaste-jobben");
    const cards = section.locator("[data-home-job]");
    await expect(cards).toHaveCount(JOBS_FIXTURE.length);
    await expect(cards.first()).toContainText(JOBS_FIXTURE[0]!.title_sv);
    await expect(
      section.getByRole("link", { name: /Se alla lediga jobb/ }).first(),
    ).toHaveAttribute("href", "/jobs");
  });

  test("a latest-jobs card opens the advert, and Back returns", async ({ page }) => {
    const fixture = await installJobsFixture(page, "sv");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const slug = JOBS_FIXTURE[0]!.slug;
    await page.locator(`#senaste-jobben [data-home-job="${slug}"]`).click();
    await page.waitForURL((u) => u.pathname === `/jobs/${slug}`, { timeout: 15_000 });
    await expect(page.locator("h1").first()).toHaveText(JOBS_FIXTURE[0]!.title_sv, {
      timeout: 15_000,
    });
    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
    fixture.assertClean();
  });

  test("an empty market says so, rather than showing invented jobs", async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await gotoHome(page, []);
    const section = page.locator("#senaste-jobben");
    await expect(section.locator("[data-home-jobs-empty]")).toContainText(
      "Just nu finns inga publicerade jobb.",
    );
    await expect(section.locator("[data-home-job]")).toHaveCount(0);
  });

  // H8 ──────────────────────────────────────────────────────────────────
  test("the employer journey ends in the employer's decision", async ({ page }) => {
    const band = page.locator("#for-arbetsgivare");
    await expect(band.locator("ol > li h3")).toHaveText([...JOURNEY]);
    await expect(band).toContainText("Ni fattar beslutet.");
    await band.getByRole("link", { name: "Så fungerar det" }).click();
    await landsAndReturns(page, "/employers");
  });

  test("the employer band carries /employer into the same one door", async ({ page }) => {
    await page
      .locator("#for-arbetsgivare")
      .getByRole("link", { name: "Registrera företag" })
      .click();
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

  // H9 ──────────────────────────────────────────────────────────────────
  test("the recruitment services band leads to the contact page", async ({ page }) => {
    const band = page.locator("#rekryteringstjanster");
    await expect(band.locator("h3")).toHaveText([
      "Rekrytering",
      "Executive Search",
      "Interim och konsulter",
    ]);
    // The contact page asks the server whether the form can send; answered
    // here, so the test proves the page and not a mail provider.
    await stubServerFn(page, "getRecruitmentEnquiryAvailability", { open: false });
    await band.getByRole("link", { name: /Kontakta oss/ }).click();
    await page.waitForURL((u) => u.pathname === "/contact", { timeout: 15_000 });
    await expect(page.locator("main h1")).toHaveText("Kontakta oss om rekrytering");
    // Mail not configured: the page says so, and draws no form that sends
    // nothing.
    await expect(page.locator("[data-contact-closed]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-contact-form]")).toHaveCount(0);
    await page.goBack({ waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/");
  });

  // H10 ─────────────────────────────────────────────────────────────────
  test("why CQrityjob ends in the brand line and links on to /about", async ({ page }) => {
    const why = page.locator("#varfor");
    await expect(why.locator('[lang="en"]')).toHaveText("Where trust comes first.");
    await why.getByRole("link", { name: "Läs mer om oss" }).click();
    await landsAndReturns(page, "/about");
  });

  // H11 ─────────────────────────────────────────────────────────────────
  test("a signed-out visitor stays on the public homepage", async ({ page }) => {
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main h1")).toHaveText(H1.sv);
  });

  // H12 ─────────────────────────────────────────────────────────────────
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
    expect(sv.title).toBe("CQrityjob – Security careers, without limits.");
    await setLang(page, "en");
    const en = await shape();
    expect(en.lang).toBe("en");
    expect(en.title).toBe("CQrityjob – Security careers, without limits.");
    expect(en.sections).toEqual(sv.sections);
    expect(en.h1).toBe(sv.h1);
    expect(en.h2).toBe(sv.h2);
    expect(en.h3).toBe(sv.h3);
    // Same destinations, in the same order: switching language may change
    // words, never where a control goes.
    expect(en.links).toEqual(sv.links);
    await expect(page.locator("main h1")).toHaveText(H1.en);
  });

  test("the English homepage renders no Swedish copy", async ({ page }) => {
    await setLang(page, "en");
    // The latest adverts are DATA, in whatever language the employer wrote
    // them; everything else is the page's own copy.
    const seen = await page.evaluate(() =>
      [...document.querySelector("main")!.children]
        .filter((el) => el.id !== "senaste-jobben")
        .map((el) => (el as HTMLElement).innerText)
        .join("\n"),
    );
    const diacritics = seen.match(/\S*[åäöÅÄÖ]\S*/g) ?? [];
    expect(diacritics, `Swedish characters on the English page: ${diacritics.join(", ")}`).toEqual(
      [],
    );
    for (const phrase of ["För dig i säkerhetsbranschen", "Registrera företag", "Kontakta oss"]) {
      expect(seen, `"${phrase}" is rendered on the English page`).not.toContain(phrase);
    }
  });

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
    await page
      .locator("header")
      .getByRole("button", { name: /^en$|Switch to English/i })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForTimeout(400);
    expect(new URL(page.url()).pathname).toBe("/about");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  // H13 ─────────────────────────────────────────────────────────────────
  //
  // ── 44 x 44, EVERYWHERE, WITH NO EXEMPT REGION ───────────────────────
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
    await expect(page.locator("#site-menu nav a").first()).toBeVisible();
    // Open the employer group too, so its five rows are measured as well.
    await page.locator("#site-menu").getByRole("button", { name: "För arbetsgivare" }).click();
    const inMenu = await undersizedTargets(page);
    expect(inMenu, `under 44x44 inside the open menu: ${JSON.stringify(inMenu)}`).toEqual([]);
    await shot(
      page,
      "homepage-sv-375-menu-open",
      "Compact menu open at 375px with the employer group expanded; all targets >= 44 x 44",
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

  test("the decorative washes are out of the accessibility tree and hold no control", async ({
    page,
  }) => {
    const decorative = page.locator('main [aria-hidden="true"]');
    expect(await decorative.count()).toBeGreaterThan(0);
    expect(await decorative.locator("a, button").count()).toBe(0);
  });
});

// ── THE HEADER ──────────────────────────────────────────────────────────
test.describe("the locked navigation", () => {
  test.beforeEach(async ({ page }) => {
    await answerPublicJobs(page, JOBS_FIXTURE);
  });

  for (const lang of ["sv", "en"] as const) {
    test(`the desktop bar is the locked six, in order (${lang})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await setLang(page, lang);
      // The desktop bar only: the compact sheet carries a second "Primary"
      // nav in the DOM.
      const labels = (
        await page
          .locator('header nav[aria-label="Primary"]')
          .first()
          .locator(":scope > a, :scope > div > button")
          .allInnerTexts()
      ).map((x) => x.trim());
      expect(labels).toEqual([...NAV[lang]]);
      const header = await page.locator("header").innerText();
      expect(header).toContain(lang === "sv" ? "Logga in" : "Sign in");
      expect(header).toContain(lang === "sv" ? "Skapa konto" : "Create account");
      expect(header).not.toContain("Career Discovery");
    });
  }

  test('"För arbetsgivare" is a disclosure, and every entry lands on its section', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const trigger = page.locator("[data-employer-menu-trigger]");
    const panel = page.locator("[data-employer-menu]");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    // Escape closes it and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    for (const [label, hash] of [
      ["Arbetsgivarplattform", ""],
      ["Assessment", "#bedomning"],
      ["Intervjustöd", "#intervju"],
      ["Rekrytering & Executive Search", "#rekrytering"],
      ["Interim och konsulter", "#interim"],
    ] as const) {
      // The menu closes itself on every route change; re-open it only once
      // the previous navigation has rendered and the menu has settled shut.
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await expect(panel).toBeVisible();
      await panel.getByRole("link", { name: new RegExp(`^${label}`) }).click();
      await page.waitForURL((u) => u.pathname === "/employers" && u.hash === hash, {
        timeout: 15_000,
      });
      await expect(page.locator("main h1")).toBeVisible();
      if (hash) await expect(page.locator(hash)).toBeInViewport();
      await expect(panel).toBeHidden();
    }
  });

  test("the product entries open their own public pages", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    for (const [label, to, h1] of [
      [
        "Security Passport",
        "/security-passport",
        "Din professionella profil ska kunna följa med dig",
      ],
      ["Säkerhetsarbete", "/sakerhetsarbete", "Stöd för ditt säkerhetsarbete"],
    ] as const) {
      await page
        .locator('header nav[aria-label="Primary"]')
        .getByRole("link", { name: label, exact: true })
        .click();
      await page.waitForURL((u) => u.pathname === to && u.hash === "", { timeout: 15_000 });
      await expect(page.locator("main h1")).toHaveText(h1);
      await expect(
        page.locator('header nav[aria-label="Primary"]').getByRole("link", { name: label }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  test("an old link to a retired homepage section lands on its new page", async ({ page }) => {
    for (const [anchor, to] of [
      ["passport", "/security-passport"],
      ["security-intelligence", "/sakerhetsarbete"],
    ] as const) {
      await page.goto(`${BASE}/#${anchor}`, { waitUntil: "networkidle" });
      await page.waitForURL((u) => u.pathname === to, { timeout: 15_000 });
      await expect(page.locator("main h1")).toBeVisible();
    }
  });
});

// ── EVERY REQUIRED WIDTH ────────────────────────────────────────────────
test.describe("the homepage at every required width", () => {
  test.beforeEach(async ({ page }) => {
    await answerPublicJobs(page, JOBS_FIXTURE);
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

    test(`the hero and all four entries remain visible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await expect(page.locator("#hero [data-home-audience]")).toHaveCount(2);
      const cards = page.locator("#for-dig [data-home-entry]");
      await expect(cards).toHaveCount(4);
      for (const card of await cards.all()) await expect(card).toBeVisible();
    });
  }

  // The locked hero is an English brand statement on both pages: marked
  // lang="en", never hyphenated, and at most three intentional lines on a
  // phone -- not shrunk onto one.
  for (const width of [390, 1440] as const) {
    test(`the hero h1 breaks between words at ${width}px, sv and en`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      for (const lang of ["sv", "en"] as const) {
        await setLang(page, lang);
        const h1 = page.locator("main h1");
        await expect(h1).toHaveText(H1[lang]);
        await expect(h1).toHaveAttribute("lang", "en");
        const box = await h1.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            hyphens: cs.hyphens,
            fontSize: parseFloat(cs.fontSize),
            lines: Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
          };
        });
        // "none" or "manual": either way the browser never inserts a hyphen.
        expect(box.hyphens, `${lang} at ${width}px`).not.toBe("auto");
        expect(box.lines, `${lang} at ${width}px`).toBeLessThanOrEqual(width < 768 ? 3 : 2);
        expect(box.fontSize, `${lang} at ${width}px`).toBeGreaterThanOrEqual(32);
      }
    });
  }

  test("no horizontal overflow at 200% browser zoom", async ({ page }) => {
    // 200% zoom is a 1440px window reporting a 720px layout viewport.
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
    const labels = (
      await page.locator("#site-menu nav > a, #site-menu nav > div > button").allInnerTexts()
    ).map((x) => x.trim());
    // Same ORDER, not merely the same set.
    expect(labels).toEqual([...NAV.sv]);
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
    // The same six as the header, and the contact page that now sends.
    for (const href of [
      "/career-center",
      "/jobs",
      "/security-passport",
      "/sakerhetsarbete",
      "/employers",
      "/about",
      "/contact",
      // The published documents and the contact address (owner, 2026-10-03).
      "/villkor",
      "/integritetspolicy",
      "mailto:info@cqrityjob.com",
    ]) {
      expect(hrefs, `the footer lacks ${href}`).toContain(href);
    }
    const text = await footer.innerText();
    expect(text).toContain("Where trust comes first.");
    expect(text).not.toContain("inte publicerade ännu");
    await expect(footer.getByRole("link", { name: "Användarvillkor", exact: true })).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Integritetspolicy", exact: true }),
    ).toBeVisible();
  });
});

// ── THE PRODUCTS' OWN PAGES ─────────────────────────────────────────────
test.describe("the products' own public pages", () => {
  for (const width of [375, 1440] as const) {
    test(`/security-passport at ${width}px: the product, its disclaimer, and one door`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await answerNetworkStats(page);
      await page.goto(`${BASE}/security-passport`, { waitUntil: "networkidle" });
      await expect(page.locator("main h1")).toHaveText(
        "Din professionella profil ska kunna följa med dig",
      );
      await expect(page.locator("[data-passport-disclaimer]")).toHaveText(
        "Security Passport hjälper dig att strukturera och dela information. Det ersätter inte en myndighetslicens, säkerhetsprövning, rätt att arbeta eller arbetsgivarens egna kontroller.",
      );
      await expect(page.locator("[data-passport-status]")).toHaveCount(4);
      await expect(page.locator("[data-home-passport-example]")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      expect(await undersizedTargets(page)).toEqual([]);
      await shot(
        page,
        `security-passport-sv-${width}`,
        `/security-passport at ${width}px — status levels, disclaimer, one door`,
      );
    });

    test(`/sakerhetsarbete at ${width}px: honest AI status, and one door`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE}/sakerhetsarbete`, { waitUntil: "networkidle" });
      await expect(page.locator("main h1")).toHaveText("Stöd för ditt säkerhetsarbete");
      await expect(page.locator("[data-security-work-status]")).toContainText(
        "AI-stödet är förberett men ännu inte aktiverat.",
      );
      await expect(page.locator("main")).toContainText(
        "AI hjälper dig med arbetet. Du ansvarar för besluten.",
      );
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      expect(await undersizedTargets(page)).toEqual([]);
      await shot(
        page,
        `sakerhetsarbete-sv-${width}`,
        `/sakerhetsarbete at ${width}px — AI not yet activated, stated in the page`,
      );
    });
  }

  test("the Passport page carries its intent into the account form", async ({ page }) => {
    await answerNetworkStats(page);
    await page.goto(`${BASE}/security-passport`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Skapa mitt Security Passport" }).first().click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/passport");
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
    const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref, "the Passport intent is lost on the swap").toContain("redirect=%2Fpassport");
    await shot(
      page,
      "passport-signup-destination",
      "/security-passport -> /signup?redirect=/passport, intent resolved by the form",
    );
  });

  test("the security work page carries its intent into the account form", async ({ page }) => {
    await page.goto(`${BASE}/sakerhetsarbete`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Kom igång" }).first().click();
    await page.waitForURL("**/signup**", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/security-work");
    const swapHref = await page.locator('main a[href^="/login?"]').first().getAttribute("href");
    expect(swapHref).toContain("redirect=%2Fsecurity-work");
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

  test("the claim survives a signup/login swap", async ({ page }) => {
    const returnTo = "/security-career-assessment?claim=e2e-token";
    await page.goto(`${BASE}/signup?redirect=${encodeURIComponent(returnTo)}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
    // Scoped to `main`: the header's employer door is also a `/login?…` link.
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

  test("the Career page's analysis action reaches the anonymous landing", async ({ page }) => {
    await stubServerFn(page, "getV31Availability", ANALYSIS_OPEN);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/career-center`, { waitUntil: "networkidle" });
    await page
      .locator("[data-career-entry-cards]")
      .getByRole("link", { name: "Gör karriäranalysen" })
      .click();
    await page.waitForURL("**/security-career-assessment**", { timeout: 15_000 });
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 20_000 });
    await shot(
      page,
      "career-discovery-anonymous-landing",
      "Career page -> career analysis canonical landing, signed out, no credential requested",
    );
  });
});

// ── THE SIGNED-IN VISITOR ───────────────────────────────────────────────
test.describe("the signed-in visitor", () => {
  test("a signed-in visitor at / is redirected to /my-career, without a loop", async ({ page }) => {
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
// The screenshots the review asks for, taken from the RUNNING application.
// Each one follows an assertion in the same test, so a picture cannot show a
// state nothing verified.
test.describe("routed evidence — the homepage", () => {
  test.beforeEach(async ({ page }) => {
    await answerPublicJobs(page, JOBS_FIXTURE);
  });

  for (const lang of ["sv", "en"] as const) {
    for (const width of [1440, 375, 390] as const) {
      test(`homepage ${lang} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width >= 1440 ? 900 : 812 });
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await setLang(page, lang);
        await expect(page.locator("main h1")).toHaveText(H1[lang]);
        await expect(page.locator("#for-dig [data-home-entry]")).toHaveCount(4);
        await expect(page.locator("#senaste-jobben [data-home-job]")).toHaveCount(
          JOBS_FIXTURE.length,
        );
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        expect(await undersizedTargets(page)).toEqual([]);
        // At 1440 the headline and both audience entrances are in the first
        // screen.
        if (width === 1440) {
          await expect(page.locator("main h1")).toBeInViewport();
          for (const entrance of await page.locator("#hero [data-home-audience]").all()) {
            await expect(entrance).toBeInViewport();
          }
        }
        await shot(
          page,
          `homepage-${lang}-${width}`,
          `Homepage ${lang.toUpperCase()} at ${width}px — six sections, 0px overflow`,
        );
      });
    }
  }
});

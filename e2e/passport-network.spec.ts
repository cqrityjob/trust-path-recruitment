// Security Passport Network -- the public statistics band, in a real browser.
//
// The band draws ONLY what `sp_network_stats()` approved to publish, and draws
// NOTHING while it is hidden, unavailable or malformed. Every request is
// answered locally (answerNetworkStats): production is unreachable by
// construction and the owner's publication setting stays `hidden`.
//
// What this proves, per state and per language:
//   * hidden / failed / malformed read      -> no band, the page is intact
//   * display `passport_page`               -> the Passport page only
//   * display `public`                      -> the homepage as well
//   * zero, one, a small number, a large one, a populated market list
//   * placement: directly after the Passport entry band, before the jobs
//   * layout at 1440 and 390 px: no sideways scroll, stacked on a phone
//   * metric name + value are one <dt>/<dd> pair; markets are plain text
//   * exactly ONE request to the aggregate per page load
//   * no ranking or leaderboard language
//
// Run: bun run e2e:public-entry

import { test, expect, type Page } from "@playwright/test";
import {
  answerNetworkStats,
  answerPublicJobs,
  BASE,
  horizontalOverflow,
  shot,
} from "./support/public-entry-harness";

type Lang = "sv" | "en";

const BAND = "[data-passport-network]";
const FIGURE = (key: string) => `${BAND} [data-network-figure="${key}"]`;

const POPULATED = {
  display: "public",
  passports: 1247,
  credentials: 3841,
  markets: ["AE", "GB", "SE"],
  otherMarkets: true,
};
const ZERO = { display: "public", passports: 0, credentials: 0, markets: [], otherMarkets: false };
const ONE = { display: "public", passports: 1, credentials: 3, markets: [], otherMarkets: true };
const LOW = {
  display: "public",
  passports: 7,
  credentials: 12,
  markets: ["SE"],
  otherMarkets: false,
};
const LARGE = {
  display: "public",
  passports: 1234567,
  credentials: 9876543,
  markets: [],
  otherMarkets: false,
};

/** NBSP and narrow NBSP are what sv-SE uses between thousands. */
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ").trim();

type Session = { errors: string[]; aggregateRequests: () => number };

/** Open a page with the aggregate answered locally and the language fixed
 *  before the first paint, so there is exactly ONE navigation and ONE read. */
async function open(
  page: Page,
  path: "/" | "/security-passport",
  answer: unknown | number,
  lang: Lang,
  width = 1440,
): Promise<Session> {
  const errors: string[] = [];
  let aggregate = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    // A stubbed failure IS the scenario; the browser's own line for it is not
    // a page defect.
    if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
  });
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/sp_network_stats")) aggregate += 1;
  });
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
  await answerPublicJobs(page); // jobs + the hidden default...
  await answerNetworkStats(page, answer); // ...then the answer under test wins
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
  return { errors, aggregateRequests: () => aggregate };
}

// ── NOTHING TO SHOW: the page is exactly the page it was ───────────────
test.describe("while the statistics are hidden or unavailable", () => {
  const CASES: [string, unknown | number][] = [
    ["hidden (what production says today)", { display: "hidden" }],
    ["an HTTP failure", 500],
    ["an empty answer", null],
    ["a malformed answer", { display: "public", passports: -1, credentials: 0, markets: [] }],
    ["an answer with numbers but hidden", { ...POPULATED, display: "hidden" }],
  ];
  for (const [label, answer] of CASES) {
    for (const lang of ["sv", "en"] as const) {
      test(`${label}: neither page draws a band (${lang})`, async ({ page }) => {
        const home = await open(page, "/", answer, lang);
        await expect(page.locator("#for-dig [data-home-entry]")).toHaveCount(4);
        await expect(page.locator("#senaste-jobben")).toBeVisible();
        await expect(page.locator(BAND)).toHaveCount(0);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        expect(home.errors, `page errors: ${home.errors.join(" | ")}`).toEqual([]);

        const passport = await open(page, "/security-passport", answer, lang);
        await expect(page.locator("main h1")).toBeVisible();
        await expect(page.locator("[data-passport-status]")).toHaveCount(4);
        await expect(page.locator(BAND)).toHaveCount(0);
        expect(passport.errors, `page errors: ${passport.errors.join(" | ")}`).toEqual([]);
      });
    }
  }
});

// ── THE OWNER'S PUBLICATION SETTING decides WHERE it may appear ────────
test.describe("the publication setting", () => {
  test("passport_page: the Passport page shows it, the homepage does not", async ({ page }) => {
    const answer = { ...POPULATED, display: "passport_page" };
    await open(page, "/", answer, "en");
    await expect(page.locator(BAND)).toHaveCount(0);
    await open(page, "/security-passport", answer, "en");
    await expect(page.locator(BAND)).toHaveCount(1);
    await expect(page.locator(`${BAND} a[href="/security-passport"]`)).toHaveCount(0);
  });

  test("public: the homepage shows it as well, with one door to the Passport page", async ({
    page,
  }) => {
    await open(page, "/", POPULATED, "en");
    await expect(page.locator(BAND)).toHaveCount(1);
    await expect(page.locator(`${BAND} a[href="/security-passport"]`)).toHaveCount(1);
  });
});

// ── THE VALUES, in both languages ──────────────────────────────────────
test.describe("what the band says", () => {
  test("populated, English: name + value as one pair, markets as text", async ({ page }) => {
    await open(page, "/", POPULATED, "en");
    await expect(page.locator(`${FIGURE("passports")} dt`)).toHaveText(
      "Security Passports created",
    );
    await expect(page.locator(`${FIGURE("passports")} dd`)).toHaveText("1,247");
    await expect(page.locator(`${FIGURE("credentials")} dt`)).toHaveText("Credentials represented");
    await expect(page.locator(`${FIGURE("credentials")} dd`)).toHaveText("3,841");
    const markets = plain(await page.locator("[data-network-markets]").innerText());
    expect(markets).toBe(
      "Growing across United Arab Emirates · United Kingdom · Sweden · Other markets",
    );
    await expect(page.locator(`${BAND} h2`)).toHaveText(
      "One Security Passport. A growing security community.",
    );
  });

  test("populated, Swedish: natural wording, the product name untouched", async ({ page }) => {
    await open(page, "/", POPULATED, "sv");
    await expect(page.locator(`${FIGURE("passports")} dt`)).toHaveText("Security Passport skapade");
    expect(plain(await page.locator(`${FIGURE("passports")} dd`).innerText())).toBe("1 247");
    await expect(page.locator(`${FIGURE("credentials")} dt`)).toHaveText("Registrerade meriter");
    expect(plain(await page.locator(`${FIGURE("credentials")} dd`).innerText())).toBe("3 841");
    const markets = plain(await page.locator("[data-network-markets]").innerText());
    expect(markets).toBe(
      "Växer i Förenade Arabemiraten · Storbritannien · Sverige · Övriga marknader",
    );
    await expect(page.locator(`${BAND} h2`)).toHaveText(
      "Ett Security Passport. En växande säkerhetsgemenskap.",
    );
  });

  test("zero is the real zero, with nothing invented beside it", async ({ page }) => {
    await open(page, "/", ZERO, "en");
    await expect(page.locator(`${FIGURE("passports")} dd`)).toHaveText("0");
    await expect(page.locator(FIGURE("credentials"))).toHaveCount(0);
    await expect(page.locator("[data-network-markets]")).toHaveCount(0);
  });

  test("one Passport reads in the singular, in both languages", async ({ page }) => {
    await open(page, "/", ONE, "en");
    await expect(page.locator(`${FIGURE("passports")} dt`)).toHaveText("Security Passport created");
    await expect(page.locator(`${FIGURE("passports")} dd`)).toHaveText("1");
    await expect(page.locator("[data-network-markets]")).toContainText("Other markets");
    await open(page, "/", ONE, "sv");
    await expect(page.locator(`${FIGURE("passports")} dt`)).toHaveText("Security Passport skapat");
  });

  test("a small number is shown as it is", async ({ page }) => {
    await open(page, "/", LOW, "en");
    await expect(page.locator(`${FIGURE("passports")} dd`)).toHaveText("7");
    await expect(page.locator(`${FIGURE("credentials")} dd`)).toHaveText("12");
  });

  test("a large number formats for the language", async ({ page }) => {
    await open(page, "/", LARGE, "en");
    await expect(page.locator(`${FIGURE("passports")} dd`)).toHaveText("1,234,567");
    await open(page, "/", LARGE, "sv");
    expect(plain(await page.locator(`${FIGURE("passports")} dd`).innerText())).toBe("1 234 567");
  });

  test("no ranking, leaderboard or per-market number appears", async ({ page }) => {
    for (const lang of ["sv", "en"] as const) {
      await open(page, "/", POPULATED, lang);
      const text = await page.locator(BAND).innerText();
      expect(text).not.toMatch(/#\s?\d|\b(rank|ranking|leaderboard|top)\b|nummer 1|\bplats \d/i);
      // The only numbers in the band are the two figures.
      const numbers = plain(text).match(/\d[\d ,]*/g) ?? [];
      expect(numbers.map((n) => n.replace(/\D/g, ""))).toEqual(["1247", "3841"]);
    }
  });
});

// ── PLACEMENT ──────────────────────────────────────────────────────────
test.describe("placement", () => {
  test("directly after the Passport entry band and before the jobs", async ({ page }) => {
    await open(page, "/", POPULATED, "en");
    const order = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const ids = [...main.children].map(
        (el) => el.id || (el.hasAttribute("data-passport-network") ? "network" : ""),
      );
      return ids.filter(Boolean);
    });
    // The band is one top-level section; it sits between "for-dig" and the jobs.
    const at = (id: string) => order.indexOf(id);
    expect(at("for-dig"), `order: ${order.join(" > ")}`).toBeGreaterThanOrEqual(0);
    expect(at("security-passport-network")).toBe(at("for-dig") + 1);
    expect(at("senaste-jobben")).toBe(at("security-passport-network") + 1);
  });

  test("on the Passport page it follows the hero and precedes what the Passport holds", async ({
    page,
  }) => {
    await open(page, "/security-passport", POPULATED, "en");
    const before = await page.evaluate(() => {
      const band = document.querySelector("#security-passport-network")!;
      const holds = document.querySelector("#innehall")!;
      const hero = document.querySelector("main section")!;
      return {
        afterHero: Boolean(hero.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING),
        beforeHolds: Boolean(
          band.compareDocumentPosition(holds) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
    expect(before).toEqual({ afterHero: true, beforeHolds: true });
  });
});

// ── ONE REQUEST, NO LIVE CHANNEL ───────────────────────────────────────
test.describe("cost", () => {
  for (const path of ["/", "/security-passport"] as const) {
    test(`${path}: exactly one request to the aggregate per page load`, async ({ page }) => {
      const session = await open(page, path, POPULATED, "en");
      await expect(page.locator(BAND)).toHaveCount(1);
      await page.waitForTimeout(1500);
      expect(session.aggregateRequests()).toBe(1);
    });
  }

  test("the band opens no socket", async ({ page }) => {
    let sockets = 0;
    page.on("websocket", () => (sockets += 1));
    await open(page, "/", POPULATED, "en");
    await page.waitForTimeout(1000);
    expect(sockets).toBe(0);
  });
});

// ── ACCESSIBILITY ──────────────────────────────────────────────────────
test.describe("accessibility", () => {
  for (const lang of ["sv", "en"] as const) {
    test(`${lang}: a labelled group; each figure is a term and its definition`, async ({
      page,
    }) => {
      await open(page, "/", POPULATED, lang);
      const title =
        lang === "sv"
          ? "Ett Security Passport. En växande säkerhetsgemenskap."
          : "One Security Passport. A growing security community.";
      await expect(page.getByRole("group", { name: title })).toHaveCount(1);
      const pairs = await page.evaluate((band) => {
        const root = document.querySelector(band)!;
        return [...root.querySelectorAll("dl > div")].map((d) => ({
          kids: [...d.children].map((c) => c.tagName),
          // the DOM order a screen reader follows
          term: d.querySelector("dt")?.textContent,
          value: d.querySelector("dd")?.textContent,
        }));
      }, BAND);
      expect(pairs).toHaveLength(2);
      for (const p of pairs) {
        expect(p.kids).toEqual(["DT", "DD"]);
        expect(p.term).toBeTruthy();
        expect(p.value).toMatch(/\d/);
      }
      // Meaning is carried by text: nothing in the band is hidden from assistive technology
      // except decorative icons.
      const hiddenText = await page.evaluate(
        (band) =>
          [...document.querySelectorAll(`${band} [aria-hidden="true"]`)].filter(
            (el) => (el.textContent ?? "").trim() !== "",
          ).length,
        BAND,
      );
      expect(hiddenText).toBe(0);
    });
  }

  test("the link to the Passport page is a 44px target with a visible focus ring", async ({
    page,
  }) => {
    await open(page, "/", POPULATED, "en");
    const link = page.locator(`${BAND} a[href="/security-passport"]`);
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.focus();
    await expect(link).toBeFocused();
    const ring = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`;
    });
    expect(ring, "the focused link draws no ring").not.toBe("none|0px|none");
  });
});

// ── LAYOUT: desktop and a 390px phone ──────────────────────────────────
test.describe("layout", () => {
  for (const [path, label] of [
    ["/", "homepage"],
    ["/security-passport", "Passport page"],
  ] as const) {
    for (const width of [1440, 390] as const) {
      for (const lang of ["sv", "en"] as const) {
        test(`${label} at ${width}px (${lang}): no sideways scroll, band inside the viewport`, async ({
          page,
        }) => {
          await open(page, path, POPULATED, lang, width);
          await expect(page.locator(BAND)).toBeVisible();
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
          const rect = await page.locator(BAND).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right };
          });
          expect(rect.left).toBeGreaterThanOrEqual(0);
          expect(rect.right).toBeLessThanOrEqual(width + 1);
        });
      }
    }
  }

  test("figures stack on a phone and sit side by side on a desktop", async ({ page }) => {
    const tops = async () =>
      page.evaluate((band) => {
        const f = [...document.querySelectorAll(`${band} [data-network-figure]`)].map((el) =>
          el.getBoundingClientRect(),
        );
        return { firstBottom: f[0].bottom, secondTop: f[1].top, firstTop: f[0].top };
      }, BAND);

    await open(page, "/", POPULATED, "en", 390);
    const phone = await tops();
    expect(phone.secondTop, "stacked on a phone").toBeGreaterThanOrEqual(phone.firstBottom - 1);

    await open(page, "/", POPULATED, "en", 1440);
    const desktop = await tops();
    expect(Math.abs(desktop.secondTop - desktop.firstTop), "side by side").toBeLessThanOrEqual(2);
  });

  test("a long Swedish market list wraps instead of overflowing at 320px", async ({ page }) => {
    await open(
      page,
      "/",
      { ...POPULATED, markets: ["AE", "GB", "SE", "US", "FR", "DE"] },
      "sv",
      320,
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});

// ── EVIDENCE: the screenshots the owner asked for ──────────────────────
test.describe("visual evidence", () => {
  const SHOTS: [string, "/" | "/security-passport", unknown, Lang, number][] = [
    ["home-populated-sv-1440", "/", POPULATED, "sv", 1440],
    ["home-populated-en-1440", "/", POPULATED, "en", 1440],
    ["home-populated-sv-390", "/", POPULATED, "sv", 390],
    ["home-populated-en-390", "/", POPULATED, "en", 390],
    ["home-zero-sv-390", "/", ZERO, "sv", 390],
    ["home-zero-en-1440", "/", ZERO, "en", 1440],
    ["home-low-sv-390", "/", LOW, "sv", 390],
    ["home-low-en-1440", "/", LOW, "en", 1440],
    ["home-hidden-en-1440", "/", { display: "hidden" }, "en", 1440],
    ["passport-populated-sv-1440", "/security-passport", POPULATED, "sv", 1440],
    ["passport-populated-en-390", "/security-passport", POPULATED, "en", 390],
    ["passport-zero-en-1440", "/security-passport", ZERO, "en", 1440],
  ];
  for (const [name, path, answer, lang, width] of SHOTS) {
    test(`evidence: ${name}`, async ({ page }) => {
      await open(page, path, answer, lang, width);
      if ((answer as { display?: string }).display !== "hidden")
        await expect(page.locator(BAND)).toBeVisible();
      await shot(page, `network-${name}`, `Security Passport Network — ${name}`);
    });
  }
});

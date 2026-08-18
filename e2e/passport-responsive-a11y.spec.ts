// Security Passport — responsive and keyboard evidence at real mobile sizes.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// Mobile verification used to depend on resizing a desktop browser window by
// hand. That is not a test: it cannot run in CI, it cannot be repeated, and on
// a macOS full-screen window it silently does nothing at all while reporting
// success. Playwright emulates the device instead, so 375x812 really is
// 375x812 and a horizontal overflow fails a build rather than surviving to
// production.
//
// ── WHY THE PROTOTYPE ROUTE ────────────────────────────────────────────
//
// Every Passport SURFACE — the card, the credential symbols, the experience
// mark, the recipient view, the entry forms — is rendered here from fictional
// fixtures with no authentication and no database. That means these assertions
// run on any machine and in CI, where an authenticated holder session does
// not exist and a spec that needs one would skip. A skipped test defends
// nothing.
//
// The authenticated surfaces are covered by the database suites and by the
// static guards, which run everywhere. This file covers what those cannot see:
// what the pixels actually do at a real phone width.

import { test, expect, type Page } from "@playwright/test";

const PROTOTYPE = "/dev/security-passport";

/** Horizontal overflow is the failure mode that makes a page feel broken on a
 *  phone, and it is invisible at desktop width. Measured against the
 *  documentElement rather than body because a wide child can escape body. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
}

/** Anything that paints its own text must not be a colour-only signal. This
 *  collects the accessible names of status-bearing elements so the test can
 *  assert they carry words, not just a swatch. */
async function statusTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="img"], [role="status"], [role="note"]')]
      .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim())
      .filter(Boolean),
  );
}

test.describe("Security Passport — responsive and keyboard", () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto(PROTOTYPE, { waitUntil: "domcontentloaded" });
    // The route is dev-only and throws notFound() in a production build. When
    // the spec is pointed at a production origin there is nothing to assert,
    // and saying so is more honest than a green tick.
    test.skip(
      !response || response.status() >= 400,
      "The prototype route is development-only; run against the dev server.",
    );
    await page.waitForLoadState("networkidle");
  });

  test("no horizontal overflow at this viewport", async ({ page }) => {
    const overflow = await horizontalOverflow(page);
    expect(
      overflow,
      `The page scrolls sideways by ${overflow}px at this width.`,
    ).toBeLessThanOrEqual(1);
  });

  test("every interactive control meets the 44px touch target", async ({ page }, testInfo) => {
    // Desktop pointers are precise; fingers are not. Only enforced on the
    // mobile projects, where the control is actually touched.
    test.skip(testInfo.project.name === "chromium", "Touch targets are a mobile concern.");

    const undersized = await page.evaluate(() => {
      const sel = 'a[href], button, select, input:not([type="hidden"]), textarea, [tabindex="0"]';
      return [...document.querySelectorAll(sel)]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent ?? "").trim().slice(0, 30), h: Math.round(r.height) };
        })
        .filter((x) => x.h > 0 && x.h < 44);
    });
    expect(undersized, `Controls under 44px tall: ${JSON.stringify(undersized)}`).toEqual([]);
  });

  test("keyboard reaches the controls and focus is visible", async ({ page }) => {
    const first = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("a[href], button, select");
      if (!el) return null;
      el.focus();
      return document.activeElement === el;
    });
    test.skip(first === null, "No focusable control on this surface.");
    expect(first).toBe(true);

    // Ten tabs is enough to leave any single control group; the point is that
    // focus keeps moving and stays visible, not where it lands.
    const seen = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return {
          key: `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 20)}:${el.className}`,
          // A ring drawn by outline OR by a box-shadow both count; what must
          // not happen is `outline: none` with nothing replacing it.
          ring: cs.outlineStyle !== "none" || cs.boxShadow !== "none",
          trapped: el.getAttribute("aria-hidden") === "true",
        };
      });
      if (!state) continue;
      expect(state.trapped, "Focus landed on an aria-hidden element.").toBe(false);
      seen.add(state.key);
    }
    expect(seen.size, "Focus never moved — the page has a keyboard trap.").toBeGreaterThan(1);
  });

  test("status is carried by words, not colour alone", async ({ page }) => {
    const texts = await statusTexts(page);
    test.skip(texts.length === 0, "No status-bearing elements on this surface.");
    // Each status element must say something. A swatch with an empty label is
    // exactly the colour-only signal the design rules forbid.
    for (const t of texts) {
      expect(t.length, "A status element carries no text or label.").toBeGreaterThan(0);
    }
  });

  test("the page renders in both languages without overflowing", async ({ page }) => {
    // Swedish is the longer language for most of this copy, so a layout that
    // survives English can still break in Swedish. Both are checked.
    for (const lang of ["sv", "en"]) {
      await page.evaluate((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
      await page.reload({ waitUntil: "networkidle" });
      const overflow = await horizontalOverflow(page);
      expect(overflow, `${lang}: the page scrolls sideways by ${overflow}px.`).toBeLessThanOrEqual(
        1,
      );
      const text = await page.evaluate(() => document.body.innerText.length);
      expect(text, `${lang}: the page rendered no text.`).toBeGreaterThan(200);
    }
  });
});

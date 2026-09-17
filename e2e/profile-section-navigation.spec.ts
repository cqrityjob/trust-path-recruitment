// Profile and CV — every section reaches its editor, in a browser.
//
// ── WHY THIS IS A SPEC OF ITS OWN ───────────────────────────────────────
//
// These scenarios were written into e2e/my-career-home.spec.ts first, which
// was a mistake: that file deliberately does not run in CI -- ci.yml says so
// where it explains that the layout half of the public checks "runs locally
// rather than here -- the same arrangement as e2e/my-career-home.spec.ts".
// A browser proof no job executes is not a proof, so the scenarios live here
// instead, in a file CI runs.
//
// What the deterministic guard cannot see is the whole point of these: the
// guard reads the route's source and can prove the markup asks for a link.
// Only a browser can show that following the row puts the editor on screen
// rather than merely changing the URL, that the row clears 44px once it is
// laid out, and that none of it overflows at 375px.
//
// Nothing reaches a real backend: the shared harness answers every server
// function inside the browser context. So this file proves navigation and
// layout, and claims nothing about persistence.
import { test, expect } from "@playwright/test";
import { SECTION_DESTINATIONS } from "../src/lib/professional-identity/profile-destinations";
import { mount, ok, takeMountBookkeeping } from "./support/career-home-harness";

// An unstubbed server function must fail the scenario rather than pass
// quietly: the same rule the rest of these suites hold themselves to.
test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(
    c.unmatched,
    `unstubbed server functions: ${[...new Set(c.unmatched)].join(", ")}`,
  ).toEqual([]);
  expect(c.errors, c.errors.join("\n")).toEqual([]);
});

// The Profile and CV pages ask for server functions the career-home stub
// table does not carry -- it was built for /my-career, where none of these
// editors mount. Empty is the right answer for these scenarios: what is
// under test is whether a link opens its editor, not what the editor holds.
// Shapes match the ones e2e/passport-first-run.spec.ts already returns for
// the same functions.
const EDITOR_STUBS = {
  getMySecurityCareerProfile: ok(null),
  listMyEntries: ok({ experience: [], claims: [] }),
  listJurisdictions: ok([]),
  listSkillTypes: ok([]),
  prepareMyCv: ok({ readiness: { state: "ready", missingFields: [], satisfiedFields: [] } }),
};

const PROFILE_OWNED = (
  Object.keys(SECTION_DESTINATIONS) as (keyof typeof SECTION_DESTINATIONS)[]
).filter((s) => SECTION_DESTINATIONS[s].owner === "profile");
const CV_OWNED = (
  Object.keys(SECTION_DESTINATIONS) as (keyof typeof SECTION_DESTINATIONS)[]
).filter((s) => SECTION_DESTINATIONS[s].owner === "cv");

/** Every anchor a set of sections resolves to, once each. */
const anchorsOf = (sections: readonly (keyof typeof SECTION_DESTINATIONS)[]) => [
  ...new Set(sections.map((s) => SECTION_DESTINATIONS[s].href.split("#")[1]!).filter(Boolean)),
];

test.describe("Profile and CV sections reach their editors", () => {
  // ── WHAT CHANGED, AND WHAT DID NOT ──────────────────────────────────
  //
  // The Profile page used to open with an index of all ten sections, each a
  // link and each labelled "edited here". The owner's 2026-09-17 refinement
  // removed the index: the Profile holds the Profile's editors, the CV page
  // holds the CV's, and only what is MISSING is offered as a link.
  //
  // The rule these scenarios were written for is unchanged: a destination in
  // SECTION_DESTINATIONS must put a real editor on screen. The static guard
  // proves the markup; these prove what a person can actually do with it.
  for (const lang of ["sv", "en"] as const) {
    test(`${lang}: every Profile destination is a rendered editor on the Profile page`, async ({
      page,
    }) => {
      await mount(page, "general_jobs", {
        lang,
        path: "/my-career/profile",
        ready: "[data-profile-basics]",
        overrides: EDITOR_STUBS,
      });
      // Read from SECTION_DESTINATIONS rather than written again here: a
      // test that re-spells an anchor stops being able to catch a move.
      for (const anchor of anchorsOf(PROFILE_OWNED)) {
        await expect(page.locator(`#${anchor}`), `#${anchor} is not on the Profile`).toHaveCount(1);
      }
      // And none of the CV's: career history has one editing home.
      for (const anchor of anchorsOf(CV_OWNED)) {
        await expect(page.locator(`#${anchor}`), `#${anchor} leaked onto the Profile`).toHaveCount(
          0,
        );
      }
      await expect(page.locator("main")).not.toContainText(/Redigeras här|Edited here/);
    });

    test(`${lang}: every CV destination is a rendered editor on the CV page`, async ({ page }) => {
      await mount(page, "general_jobs", {
        lang,
        path: "/my-career/cv",
        ready: "[data-cv-content]",
        overrides: EDITOR_STUBS,
      });
      for (const anchor of anchorsOf(CV_OWNED)) {
        await expect(page.locator(`#${anchor}`), `#${anchor} is not on the CV page`).toHaveCount(1);
      }
      // The page's own section links carry the contract's anchors.
      const rendered = await page
        .locator("[data-cv-page-nav] a[data-section-link]")
        .evaluateAll((els) =>
          els.map((el) => ({
            section: el.getAttribute("data-section-link"),
            href: el.getAttribute("href"),
          })),
        );
      expect(rendered.map((r) => r.section).sort()).toEqual([...CV_OWNED].sort());
      for (const row of rendered) {
        const section = row.section as keyof typeof SECTION_DESTINATIONS;
        expect(`/my-career/cv${row.href}`, `${row.section} points somewhere else`).toBe(
          SECTION_DESTINATIONS[section].href,
        );
      }
    });
  }

  test("a missing Profile section is offered as a link to its canonical destination", async ({
    page,
  }) => {
    // `new_user` has answered nothing, so every Profile section it is asked
    // is missing.
    await mount(page, "new_user", {
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides: EDITOR_STUBS,
    });
    const links = page.locator("[data-profile-missing] a[data-section-link]");
    await expect(links).not.toHaveCount(0);
    const rendered = await links.evaluateAll((els) =>
      els.map((el) => ({
        section: el.getAttribute("data-section-link"),
        href: el.getAttribute("href"),
      })),
    );
    for (const row of rendered) {
      const section = row.section as keyof typeof SECTION_DESTINATIONS;
      expect(SECTION_DESTINATIONS[section]?.owner, `${row.section} is not the Profile's`).toBe(
        "profile",
      );
      expect(row.href, `${row.section} points somewhere else`).toBe(
        SECTION_DESTINATIONS[section].href,
      );
    }
  });

  test("a completed section is still editable", async ({ page }) => {
    await mount(page, "general_jobs", {
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides: EDITOR_STUBS,
    });
    // Whatever this fixture has filled in, the editors are there: the moment
    // somebody wants to correct an answer is exactly the moment it is
    // already answered.
    await expect(page.locator("#sp-basics-identity-displayName")).toBeEditable();
    await expect(page.locator("#sp-basics-identity-headline")).toBeEditable();
    await expect(page.locator("#career-profile button").first()).toBeEnabled();
  });

  test("following a CV section link reaches the rendered editor, not just the URL", async ({
    page,
  }) => {
    await mount(page, "general_jobs", {
      path: "/my-career/cv",
      ready: "[data-cv-content]",
      overrides: EDITOR_STUBS,
    });
    await page.locator('[data-cv-page-nav] a[data-section-link="education"]').click();
    const anchor = SECTION_DESTINATIONS.education.href.split("#")[1]!;
    // The whole point: the editor is on screen afterwards. A URL that
    // changed while the page stayed put is the defect, not the fix.
    await expect(page.locator(`#${anchor}`)).toBeInViewport({ timeout: 15_000 });
    expect(page.url()).toContain(anchor);
  });

  test("arriving on a contract destination from elsewhere lands on the editor", async ({
    page,
  }) => {
    const { href } = SECTION_DESTINATIONS.employment;
    await mount(page, "general_jobs", {
      path: href,
      ready: "[data-cv-content]",
      overrides: EDITOR_STUBS,
    });
    await expect(page.locator(`#${href.split("#")[1]!}`)).toBeInViewport({ timeout: 15_000 });
  });

  test("section links are reachable by keyboard", async ({ page }) => {
    await mount(page, "general_jobs", {
      path: "/my-career/cv",
      ready: "[data-cv-content]",
      overrides: EDITOR_STUBS,
    });
    const link = page.locator('[data-cv-page-nav] a[data-section-link="education"]');
    await link.focus();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-section-link")),
    ).toBe("education");
  });

  for (const [name, path, ready, fixture] of [
    ["Profile", "/my-career/profile", "[data-profile-basics]", "new_user"],
    ["CV", "/my-career/cv", "[data-cv-content]", "general_jobs"],
  ] as const) {
    test(`375px: the ${name} page's section links clear 44px and nothing overflows`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await mount(page, fixture, { path, ready, overrides: EDITOR_STUBS });

      const small = await page.locator("a[data-section-link]").evaluateAll((els) =>
        els
          .filter((el) => {
            const b = el.getBoundingClientRect();
            return !(b.width === 0 && b.height === 0) && b.height < 43.5;
          })
          .map((el) => el.getAttribute("data-section-link")),
      );
      expect(small, `section links under 44px: ${JSON.stringify(small)}`).toEqual([]);

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });
  }
});

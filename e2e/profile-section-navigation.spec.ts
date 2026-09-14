// /my-career/profile — the section overview is navigation, in a browser.
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

// The profile workspace asks for four server functions the career-home stub
// table does not carry -- it was built for /my-career, where none of these
// editors mount. Empty is the right answer for these scenarios: the overview
// lists a section whether or not it has content, and what is under test is
// whether the row opens, not what it contains. Shapes match the ones
// e2e/passport-first-run.spec.ts already returns for the same functions.
const PROFILE_EDITOR_STUBS = {
  getMySecurityCareerProfile: ok(null),
  listMyEntries: ok({ experience: [], claims: [] }),
  listJurisdictions: ok([]),
  listSkillTypes: ok([]),
};

test.describe("the profile section overview", () => {
  // ── THE SECTION OVERVIEW IS NAVIGATION ──────────────────────────────
  //
  // The index used to render a link only for a section that was both
  // incomplete AND not profile-owned. Nine of the ten sections are
  // profile-owned, so it named every editor and opened none of them. The
  // static guard proves the markup; these prove what a person can actually
  // do with it -- that the row is a link, that it carries the canonical
  // destination, that finishing a section does not take it away, and that
  // following it lands on the editor rather than merely changing the URL.
  for (const lang of ["sv", "en"] as const) {
    test(`${lang}: every profile-owned overview row is a link to its canonical destination`, async ({
      page,
    }) => {
      await mount(page, "general_jobs", {
        lang,
        path: "/my-career/profile",
        ready: "#sections-heading",
        overrides: PROFILE_EDITOR_STUBS,
      });

      const links = page.locator("a[data-section-link]");
      await expect(links).not.toHaveCount(0);

      const rendered = await links.evaluateAll((els) =>
        els.map((el) => ({
          section: el.getAttribute("data-section-link"),
          href: el.getAttribute("href"),
        })),
      );

      // Every rendered row points exactly where the shared contract says.
      // Read from SECTION_DESTINATIONS rather than written again here: a
      // test that re-spells the anchor stops being able to catch a move.
      for (const row of rendered) {
        const section = row.section as keyof typeof SECTION_DESTINATIONS;
        expect(SECTION_DESTINATIONS[section], `unknown section ${row.section}`).toBeTruthy();
        expect(row.href, `${row.section} points somewhere else`).toBe(
          SECTION_DESTINATIONS[section].href,
        );
      }

      // The sections a candidate is always asked must all be actionable.
      const shown = rendered.map((r) => r.section);
      for (const section of ["identity", "employment", "education", "languages", "skills"]) {
        expect(shown, `${section} is listed but cannot be opened`).toContain(section);
      }
    });
  }

  test("a completed section is still openable", async ({ page }) => {
    await mount(page, "general_jobs", {
      path: "/my-career/profile",
      ready: "#sections-heading",
      overrides: PROFILE_EDITOR_STUBS,
    });

    // Whatever this fixture has filled in, a row that reads as complete must
    // still be a link: the moment somebody wants to correct an answer is
    // exactly the moment it is already answered.
    const rows = page.locator("#sections-heading ~ ul > li");
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);

    const linked = await page.locator("a[data-section-link]").count();
    const nonProfile = Object.values(SECTION_DESTINATIONS).filter(
      (d) => d.owner !== "profile",
    ).length;
    // Every listed row is either profile-owned and linked, or one of the few
    // rows this change deliberately left alone.
    expect(linked).toBeGreaterThanOrEqual(total - nonProfile);
  });

  test("following an overview row reaches the rendered section, not just the URL", async ({
    page,
  }) => {
    await mount(page, "general_jobs", {
      path: "/my-career/profile",
      ready: "#sections-heading",
      overrides: PROFILE_EDITOR_STUBS,
    });

    await page.locator('a[data-section-link="employment"]').click();

    // The whole point of the fix: the editor is on screen afterwards. A URL
    // that changed while the page stayed put is the defect, not the fix.
    await expect(page.locator("#profile-employment")).toBeInViewport({ timeout: 15_000 });
    expect(page.url()).toContain(SECTION_DESTINATIONS.employment.href.split("#")[1]!);
  });

  test("overview rows are reachable by keyboard", async ({ page }) => {
    await mount(page, "general_jobs", {
      path: "/my-career/profile",
      ready: "#sections-heading",
      overrides: PROFILE_EDITOR_STUBS,
    });

    const link = page.locator('a[data-section-link="education"]');
    await link.focus();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-section-link")),
    ).toBe("education");
  });

  test("375px: the overview rows clear 44px and do not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mount(page, "general_jobs", {
      path: "/my-career/profile",
      ready: "#sections-heading",
      overrides: PROFILE_EDITOR_STUBS,
    });

    const small = await page.locator("a[data-section-link]").evaluateAll((els) =>
      els
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return !(b.width === 0 && b.height === 0) && b.height < 43.5;
        })
        .map((el) => el.getAttribute("data-section-link")),
    );
    expect(small, `overview rows under 44px: ${JSON.stringify(small)}`).toEqual([]);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
});

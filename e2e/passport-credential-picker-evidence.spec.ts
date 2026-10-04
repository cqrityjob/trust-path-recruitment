/**
 * Screenshots of the registration flow, before and after the certification
 * research integration, from the SAME fixture, at phone and desktop width, in
 * Swedish and English.
 *
 * Not a test of behaviour (e2e/passport-credential-picker.spec.ts is) and not
 * run in CI: it does nothing unless PICKER_EVIDENCE_VARIANT is `before` or
 * `after`. `before` drives the five-step wizard as it was on main (scope,
 * location and category, credential, details, review); `after` drives the
 * single "Find your credential" step. Every image is taken from the page the
 * assertions just ran against, so a screenshot cannot show a state nothing
 * verified.
 *
 *   PICKER_EVIDENCE_VARIANT=after PICKER_EVIDENCE_DIR=… bun run e2e \
 *     e2e/passport-credential-picker-evidence.spec.ts --project=mobile-390 --project=chromium
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { assertNoRefusals } from "./support/public-entry-harness";
import { mount } from "./support/picker-fixture";

const variant = process.env.PICKER_EVIDENCE_VARIANT;
const dir = path.resolve(process.env.PICKER_EVIDENCE_DIR ?? "artifacts/picker-evidence");

test.skip(
  variant !== "before" && variant !== "after",
  "evidence only: set PICKER_EVIDENCE_VARIANT",
);

const words = {
  sv: {
    next: "Fortsätt",
    search: "Sök",
    approved: "Godkänd merit",
    identifier: "Certifikats- eller licensnummer (valfritt)",
  },
  en: {
    next: "Continue",
    search: "Search catalogue",
    approved: "Approved credential",
    identifier: "Credential identifier (optional)",
  },
} as const;

for (const lang of ["sv", "en"] as const) {
  test(`registration flow (${variant}, ${lang})`, async ({ page }, info) => {
    test.setTimeout(120_000);
    mkdirSync(dir, { recursive: true });
    const w = words[lang];
    let n = 0;
    const shot = async (name: string) => {
      n += 1;
      // A sticky site header would lie across the top of an element screenshot.
      await page.addStyleTag({
        content:
          "header, nav, [class*='sticky'], [class*='fixed'] { position: static !important; }",
      });
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      await page.locator("[data-international-credential-form]").screenshot({
        path: path.join(dir, `${variant}-${n}-${name}-${lang}-${info.project.name}.png`),
      });
    };
    const next = (p: Page) => p.getByRole("button", { name: w.next, exact: true }).click();
    const probe = await mount(page, lang);

    if (variant === "before") {
      // Step 1: scope. The holder must already know whether it is international or national.
      await shot("scope");
      await next(page);
      // Step 2: location and category, four selects before a single credential is seen.
      await shot("filters");
      await next(page);
      // Step 3: a search box and an unlabelled dropdown of "name — issuer".
      await page.locator('[data-filter="search"]').fill("cpp");
      await shot("credential");
      await page.getByLabel(w.approved).selectOption("INTL_ASIS_CPP");
      await next(page);
    } else {
      await shot("find");
      await page.locator('[data-filter="search"]').fill("cpp");
      await expect(page.locator("[data-result]").first()).toBeVisible();
      await shot("results");
      await page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"]').click();
      await expect(page.locator("[data-credential-facts]")).toBeVisible();
      await shot("selected");
      await page.locator('[data-filter="search"]').fill("cafs");
      await expect(page.locator("[data-unavailable-group]")).toBeVisible();
      await page.locator("[data-catalogue-request] summary").click();
      await shot("not-available-and-request");
      await page.locator('[data-filter="search"]').fill("cpp");
      await page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"]').click();
      await next(page);
    }
    await page.getByLabel(w.identifier).fill("EXAMPLE-0001");
    await shot("details");
    await next(page);
    await shot("review");
    assertNoRefusals(probe.refusals);
  });
}

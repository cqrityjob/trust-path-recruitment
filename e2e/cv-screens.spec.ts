// The pictures somebody looks at before approving this.
//
// ── WHY THIS IS A SPEC AND NOT A FOLDER OF PNGs ────────────────────────
//
// A screenshot committed to a repository is a claim about a version of the
// product that stopped being true at some point nobody noticed. This
// regenerates them from the same fixture the behavioural suite uses, so a
// picture cannot show a screen the tests never reached, and a stale picture
// is one command away from being current.
//
// It writes to artifacts/cv-screens/ and asserts nothing beyond "the screen
// arrived". The assertions are in e2e/cv-flow.spec.ts; this is the review
// material, and it is deliberately NOT part of the blocking CI job — a
// picture is evidence for a person, not a gate.
//
// The three widths are the ones the brief names:
//
//   1440  a desktop window
//    375  a phone, where a large share of the people this is for will read it
//    720  a 1440-wide window at 200% browser zoom, which is what a person who
//         needs larger text actually gets: the LAYOUT viewport halves, so the
//         page must reflow rather than force sideways scrolling
//
// Run:  E2E_BASE_URL=http://localhost:3100 bun run e2e:cv-screens

import { test, expect } from "@playwright/test";
import {
  CV_ID,
  ServerModel,
  assertNoUnstubbedServerFns,
  createAndSave,
  doc,
  gotoNew,
  resetStubTracking,
  signedIn,
} from "./support/cv-fixture";

test.beforeEach(resetStubTracking);
test.afterEach(assertNoUnstubbedServerFns);

const OUT = "artifacts/cv-screens";

const SIZES = [
  { tag: "1440", width: 1440, height: 900 },
  { tag: "375", width: 375, height: 812 },
  { tag: "720-zoom200", width: 720, height: 450 },
] as const;

const LANGS = [
  {
    lang: "sv" as const,
    heading: /Skapa nytt CV/,
    preview: /Förhandsgranska CV/,
    save: /^Spara CV$/,
  },
  { lang: "en" as const, heading: /Create a new CV/, preview: /Preview CV/, save: /^Save CV$/ },
];

for (const { lang, heading, preview, save } of LANGS) {
  for (const size of SIZES) {
    test(`screens — ${lang} @ ${size.tag}`, async ({ page }) => {
      const model = new ServerModel();
      await signedIn(page, model, { lang });
      await page.setViewportSize({ width: size.width, height: size.height });

      // 1 · The creator, with everything the person has, all of it ticked.
      await gotoNew(page, heading);
      await page.screenshot({
        path: `${OUT}/${lang}-${size.tag}-1-creator.png`,
        fullPage: true,
      });

      // 2 · The preview, before anything has been saved.
      await page.getByRole("button", { name: preview }).click();
      await expect(doc(page)).toBeVisible({ timeout: 20_000 });
      await page.screenshot({
        path: `${OUT}/${lang}-${size.tag}-2-preview.png`,
        fullPage: true,
      });

      // 3 · The saved CV, with the export control and what it leaves out.
      await page.getByRole("button", { name: save }).click();
      await expect(doc(page)).toBeVisible({ timeout: 20_000 });
      await page.screenshot({
        path: `${OUT}/${lang}-${size.tag}-3-saved.png`,
        fullPage: true,
      });

      // 4 · The profile moved. The exact before-and-after, and a two-step
      //     confirm — the screen a reviewer most needs to see.
      model.employerNameNow = "Nordic Security Group AB";
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(doc(page)).toBeVisible({ timeout: 30_000 });
      await page.screenshot({
        path: `${OUT}/${lang}-${size.tag}-4-drift.png`,
        fullPage: true,
      });

      // 5 · The document as it PRINTS: A4, page breaks, no interface
      //     furniture. What an employer receives, not what the app shows.
      await page.emulateMedia({ media: "print" });
      await page.screenshot({
        path: `${OUT}/${lang}-${size.tag}-5-print.png`,
        fullPage: true,
      });
      await page.emulateMedia({ media: "screen" });

      expect(model.cvs.get(CV_ID)).toBeTruthy();
    });
  }
}

test("screens — the CV list, and the empty state", async ({ page }) => {
  const model = new ServerModel();
  await signedIn(page, model);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3100"}/my-career/cv`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText(/Du har inget CV ännu/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/sv-1440-0-list-empty.png`, fullPage: true });

  await gotoNew(page, /Skapa nytt CV/);
  await createAndSave(page);
  await page.goto(`${process.env.E2E_BASE_URL ?? "http://localhost:3100"}/my-career/cv`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("link", { name: /^Öppna$/ })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/sv-1440-0-list.png`, fullPage: true });
});

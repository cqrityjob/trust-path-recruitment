// Shared steps for the credential picker (step 1 of the add-credential wizard).
//
// The picker is one screen: a search, a scope, optional filters and a ranked
// list of results, each a radio named "ABBR — Full name" over "Issuer · kind".
// Choosing one shows the catalogue's own facts; Continue then leads to the
// holder's own details. These helpers say that in one place, so a spec states
// WHICH credential it picks and not how many Continue clicks used to precede it.

import { expect, type Page } from "@playwright/test";

export type PickerLang = "sv" | "en";

export const continueLabel = (lang: PickerLang) => (lang === "sv" ? "Fortsätt" : "Continue");

export const searchBox = (page: Page) => page.locator('[data-filter="search"]');

/** Every result row currently listed, by stable definition code. */
export const resultCodes = (page: Page) =>
  page
    .locator("[data-result]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-credential-code") ?? ""));

/**
 * Pick a definition by code and, unless told not to, go on to the details step.
 * `search` narrows the list first (what a holder does); a code that is not
 * listed fails here, with the list the picker actually showed.
 */
export async function chooseCredential(
  page: Page,
  code: string,
  options: { search?: string; lang?: PickerLang; proceed?: boolean } = {},
) {
  const { search, lang = "en", proceed = true } = options;
  if (search !== undefined) await searchBox(page).fill(search);
  const row = page.locator(`[data-result][data-credential-code="${code}"]`);
  await expect(
    row,
    `the picker lists ${code}; it listed ${(await resultCodes(page)).join(", ")}`,
  ).toBeVisible();
  await row.click();
  await expect(page.locator("[data-credential-facts]")).toBeVisible();
  if (proceed) await page.getByRole("button", { name: continueLabel(lang), exact: true }).click();
}

/** Open the optional filters (closed until used, so a phone is not a wall of selects). */
export async function openFilters(page: Page) {
  const panel = page.locator("[data-filter-panel]");
  if ((await panel.getAttribute("open")) === null) await panel.locator("summary").click();
}

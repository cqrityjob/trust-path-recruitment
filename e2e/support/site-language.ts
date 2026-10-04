import { expect, type Page } from "@playwright/test";

/** Choose a language through the signed-in shared chrome, then leave its
 * menus closed so the next interaction targets the page rather than a sheet. */
export async function selectSiteLanguage(page: Page, locale: "sv" | "en") {
  await expect(page.locator('[data-candidate-app-nav="desktop"]')).toBeAttached();
  const header = page.locator("header").first();
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const openMenu = header.getByRole("button", { name: /^(Öppna menyn|Open menu)$/i });
    if (await openMenu.isVisible()) await openMenu.click();
    const menu = page.locator("#site-menu");
    await expect(menu).toBeVisible();
    const choice = menu.getByRole("button", { name: locale, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await header.getByRole("button", { name: /^(Stäng menyn|Close menu)$/i }).click();
  } else {
    await header
      .getByRole("button", { name: /^(Konto och inställningar|Account and settings)$/i })
      .click();
    await page
      .getByRole("menuitemradio", { name: locale === "sv" ? "Svenska" : "English", exact: true })
      .click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${locale}`));
}

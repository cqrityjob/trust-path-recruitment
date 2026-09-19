// The BESKT routed walks — the pieces every walk repeats, defined once.
//
// Since the complete product (20261130), the candidate preparation is shown
// one area per step, the interview is worked one area per tab, and a report
// is finalised only after a human stance with its reasons has been recorded.
// A walk that clicked a question on another step, looked for a theme in
// another area, or finalised without a stance would fail for a reason the
// product intends, so the walks share these helpers rather than copies.

import { expect, type Page } from "@playwright/test";

/** Skip ("Vill inte svara") every question on screen that is still open. */
export async function skipOpen(page: Page): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    const open = page.locator('[data-testid^="beskt-item-"][data-addressed="false"]');
    if ((await open.count()) === 0) return;
    const id = await open.first().getAttribute("data-testid");
    await page.getByTestId(`${id}-skip`).click();
  }
}

/**
 * Walk every step: `onStep` answers what the walk wants on screen, anything
 * still open is skipped, then "Spara och fortsätt". A save that opened
 * follow-ups keeps the step, so that step is handled again before moving on.
 * Returns on the last step, where "Granska" is next.
 */
export async function walkSteps(
  page: Page,
  onStep: (label: string) => Promise<void>,
): Promise<void> {
  const label = page.getByTestId("beskt-step-label");
  const open = page.locator('[data-testid^="beskt-item-"][data-addressed="false"]');
  for (let i = 0; i < 30; i += 1) {
    await expect(page.getByTestId("beskt-steps")).toBeVisible({ timeout: 60_000 });
    const before = (await label.textContent()) ?? "";
    await onStep(before);
    await skipOpen(page);
    const next = page.getByTestId("beskt-step-next");
    if ((await next.count()) === 0) return;
    await next.click();
    // Settled: either the next step is shown, or this one gained follow-ups.
    await expect
      .poll(async () => ((await label.textContent()) !== before ? 1 : 0) + (await open.count()), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
  }
  throw new Error("the preparation never reached its last step");
}

/** Run `act` when the element is on the current step. */
export async function ifShown(
  page: Page,
  selector: string,
  act: () => Promise<void>,
): Promise<void> {
  if ((await page.locator(selector).count()) > 0) await act();
}

/** Open the interview area whose tab holds the theme, and return the theme. */
export async function openThemeArea(page: Page, itemKey: string) {
  const theme = page.getByTestId(`beskt-theme-${itemKey}`);
  const tabs = page.locator('[data-testid^="beskt-area-tab-"]');
  await expect(tabs.first()).toBeVisible({ timeout: 60_000 });
  for (let i = 0; i < (await tabs.count()); i += 1) {
    if ((await theme.count()) > 0) break;
    await tabs.nth(i).click();
  }
  await expect(theme).toBeVisible({ timeout: 60_000 });
  return theme;
}

/**
 * The documented human stance the report requires before it can be
 * finalised — a signature alone does not replace it.
 */
export async function recordStance(page: Page, name: string): Promise<void> {
  const decision = page.getByTestId("beskt-decision");
  await expect(decision).toBeVisible({ timeout: 60_000 });
  await decision.getByTestId("beskt-sufficiency-sufficient").check();
  await decision
    .locator("#beskt-decision-sufficiency-reason")
    .fill("TESTDATA underlaget täcker rollens krav.");
  await decision.locator("#beskt-decision-stance").fill("TESTDATA inget hinder konstaterat.");
  await decision
    .locator("#beskt-decision-rationale")
    .fill("TESTDATA kandidatens redovisning och intervjun stämmer överens.");
  await decision.locator("#beskt-decision-name").fill(name);
  await decision.locator("#beskt-decision-role").fill("Rekryterare");
  await decision.getByTestId("beskt-decision-submit").click();
  await expect(decision.getByTestId("beskt-decision-current")).toBeVisible({ timeout: 60_000 });
}

/**
 * The library's BESKT setup (product structure v2.0): method → role →
 * environment, carried in the URL. Opens it for an operational role in the
 * general environment and waits for the resolved setup.
 */
export async function openBesktSetup(
  page: Page,
  employerSlug: string,
  opts: { group?: "operational" | "strategic"; role?: "vaktare" | "security_manager" } = {},
): Promise<void> {
  const group = opts.group ?? "operational";
  const role = opts.role ?? (group === "operational" ? "vaktare" : "security_manager");
  await page.goto(
    `/employer/${employerSlug}/assessments/library?method=beskt&group=${group}&role=${role}&env=general`,
  );
  await expect(page.getByTestId("lib-setup")).toBeVisible({ timeout: 60_000 });
}

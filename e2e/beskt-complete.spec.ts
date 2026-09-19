/**
 * BESKT as a complete product (20261130090000), walked end to end through the
 * product's own screens, with separate signed-in people.
 *
 * Runs against the local test environment built by
 *   scripts/local-stack/test-env.sh
 * WITHOUT the synthetic import: the platform administrator installs both
 * v0.1 methods through the admin surface, exactly as in production.
 *
 *   1. admin: editor role, install recruitment + security vetting, record the
 *      organisation's activation for both -- nothing reviewed or published;
 *   2. owner: Rekryteringsstöd shows BESKT; appoints the security function;
 *      "Visa innehåll" shows E, S and K to the security function only;
 *   3. owner: "Starta BESKT" -- security vetting, existing application,
 *      responsible interviewer, security owner, attestation, lawful basis;
 *   4. an admin outside the security function and another organisation are
 *      refused;
 *   5. candidate (sv): the vetting notice with contact route and lawful
 *      basis, one step per area, E answered Yes -> follow-ups, S taken
 *      orally, submitted, then a dated correction;
 *   6. owner: case under Intervjuer, link, the E area carries the disclosed
 *      topic with its rule, the whole FAKTA chain, lock, stance, action,
 *      finalised report with purpose, E, the supplement and the stance;
 *   7. owner invites by e-mail (en); the invited account accepts, prepares,
 *      submits; the standalone case is created and linked without any job
 *      application.
 */

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { openThemeArea, walkSteps } from "./support/beskt-walk";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the routed walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The routed walk runs only against loopback — never a shared or hosted backend.",
);
test.describe.configure({ mode: "serial", timeout: 420_000 });

const OUT = process.env.BESKT_COMPLETE_EVIDENCE_DIR ?? "artifacts/beskt-complete/live";
mkdirSync(OUT, { recursive: true });
const PASSWORD = "LocalJourney!2026";
const ADMIN = "beskt-journey-admin@local.test";
const OWNER = "beskt-recruiter@local.test";
const OWNER_NAME = "Rekryterare Journey";
const OTHER_ADMIN = "beskt-assessor@local.test";
const CANDIDATE = "beskt-candidate@local.test";
const INVITEE = "beskt-candidate2@local.test";
const OUTSIDER = "beskt-outsider@local.test";
const EMPLOYER = "beskt-journey-ab";
const RIVAL = "beskt-rival-ab";
const APPLICATION = "b4000000-0000-4000-8000-00000000aa01";
const E_FACT = "TESTDATA betalningsplan sedan 2024, följs enligt plan";
let vettingAssignmentId = "";
const LAWFUL = "Intern funktionstest med testdata enligt ägarens beslut 2026-09-19";

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function navTo(page: Page, name: RegExp): Promise<void> {
  const link = page.getByRole("link", { name }).filter({ visible: true });
  const menu = page
    .getByRole("button", { name: /^Öppna meny$|^Open menu$/ })
    .filter({ visible: true });
  await expect(link.or(menu).first()).toBeVisible({ timeout: 60_000 });
  if ((await link.count()) === 0) {
    await menu.first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400);
  }
  await link.first().click();
}

async function openLibrary(page: Page, email: string, employer: string): Promise<void> {
  await signIn(page, email, `/employer/${employer}`);
  await navTo(page, /^Tester & bedömningar$|^Tests & assessments$/);
  await page
    .getByRole("link", { name: /^Rekryteringsstöd$|^Recruitment support$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/assessments\/library$/, { timeout: 60_000 });
  await expect(page.getByTestId("library")).toBeVisible({ timeout: 60_000 });
}

/** The library's order, clicked: BESKT → operational role → general environment. */
async function openBeskt(page: Page, email: string, employer: string): Promise<void> {
  await openLibrary(page, email, employer);
  await page.getByTestId("lib-method-beskt-choose").click();
  await page.getByTestId("lib-group-operational").check();
  await page.getByTestId("lib-env-general").check();
  await expect(page.getByTestId("lib-setup")).toBeVisible({ timeout: 60_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${OUT}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}

async function expectFitsViewport(page: Page): Promise<void> {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw, `the page scrolls sideways at ${iw}px`).toBeLessThanOrEqual(iw + 1);
}

test.describe("BESKT complete — security vetting with E, S and K, and a standalone invitation", () => {
  test("1 · the administrator installs both methods and records the activation", async ({
    page,
  }) => {
    await signIn(page, ADMIN, "/admin");
    await navTo(page, /^BESKT-metoder$/);
    const roles = page.getByTestId("beskt-content-roles");
    await expect(roles).toBeVisible({ timeout: 60_000 });
    await roles.locator("#beskt-role-email").fill(ADMIN);
    await roles.locator("#beskt-role-role").selectOption("editor");
    await roles.locator("#beskt-role-reason").fill("Installera BESKT v0.1");
    await roles.getByTestId("beskt-content-role-submit").click();
    await expect(roles.getByTestId("beskt-content-role-done")).toBeVisible({ timeout: 60_000 });

    for (const [testId, method] of [
      ["beskt-install-v01", "rekrytering"],
      ["beskt-install-v01-sakerhet", "sakerhet"],
    ] as const) {
      const card = page.getByTestId(testId);
      await card.locator(`#beskt-install-lawful-${method}`).fill(LAWFUL);
      await card.getByTestId("beskt-install-v01-submit").click();
      await expect(card.getByTestId("beskt-install-v01-done")).toContainText(
        /Innehållet är installerat och komplett/,
        { timeout: 300_000 },
      );
    }
    await shot(page, "1-installed");

    for (const testId of ["beskt-install-v01", "beskt-install-v01-sakerhet"]) {
      await page.goto("/admin");
      await navTo(page, /^BESKT-metoder$/);
      await page
        .getByTestId(testId)
        .getByTestId("beskt-install-v01-existing")
        .getByRole("link")
        .click();
      await page.getByRole("link", { name: /^Behörigheter$/ }).click();
      const panel = page.getByTestId("beskt-test-activations");
      await expect(panel).toBeVisible({ timeout: 60_000 });
      await panel.locator("#beskt-ta-employer").fill(EMPLOYER);
      await panel
        .locator("#beskt-ta-decision")
        .fill("Ägarbeslut 2026-09-19: BESKT för organisationen");
      await panel.getByTestId("beskt-test-activation-submit").click();
      await expect(panel).toContainText(/BESKT Journey AB · Aktiv/, { timeout: 60_000 });
      await expect(page.getByText(/Läge:\s*Utkast/).first()).toBeVisible();
    }
    await shot(page, "1-activated");
  });

  test("2 · the owner sees BESKT, appoints the security function and views the content", async ({
    page,
  }) => {
    await openBeskt(page, OWNER, EMPLOYER);
    const module = page.getByTestId("lib-setup");
    await expect(module).toHaveAttribute("data-startable", "true");
    // The two installed v0.1 methods, next to the environment's synthetic
    // pilot versions: each says its real standing -- here the organisation's
    // internal test activation, never a review.
    const rows = module.getByTestId("lib-setup-status").locator("li");
    await expect(rows.filter({ hasText: /säkerhetsprövningsstöd/ })).toHaveCount(1);
    await expect(
      rows.filter({ hasText: /Intern testversion enligt organisationens aktivering/ }),
    ).toHaveCount(2);

    // Before the appointment, the vetting wording is withheld.
    await module.getByTestId("lib-preview-beskt").click();
    const preview = page.getByTestId("beskt-preview-dialog");
    await preview.getByTestId("beskt-preview-purpose-security_vetting_support").click();
    await expect(
      preview.getByText(/visas bara för organisationens utsedda säkerhetsfunktion/),
    ).toBeVisible({
      timeout: 60_000,
    });
    await page.keyboard.press("Escape");

    const sec = page.getByTestId("beskt-security-function");
    await sec.locator("#beskt-security-person").selectOption({ label: OWNER_NAME });
    await sec.locator("#beskt-security-reason").fill("Säkerhetsskyddschef för testet");
    await sec.getByTestId("beskt-security-appoint").click();
    await expect(sec.getByTestId("beskt-security-officer")).toContainText(OWNER_NAME, {
      timeout: 60_000,
    });

    await module.getByTestId("lib-preview-beskt").click();
    await preview.getByTestId("beskt-preview-purpose-security_vetting_support").click();
    await expect(preview.getByTestId("beskt-preview-section-e_ekonomi")).toContainText(
      /förfallna åtaganden/,
      { timeout: 60_000 },
    );
    await expect(preview.getByTestId("beskt-preview-section-k_kontakter")).toBeVisible();
    await shot(page, "2-preview-vetting");
    await page.keyboard.press("Escape");
    await expectFitsViewport(page);
  });

  test("3 · the owner starts a security vetting on an application", async ({ page }) => {
    await openBeskt(page, OWNER, EMPLOYER);
    await page.getByTestId("lib-start-beskt").click();
    const dialog = page.getByTestId("beskt-start-dialog");
    await dialog.getByTestId("beskt-purpose-security_vetting_support").check();
    await expect(
      dialog.locator(`#beskt-start-application option[value="${APPLICATION}"]`),
    ).toHaveCount(1, {
      timeout: 60_000,
    });
    await dialog.locator("#beskt-start-application").selectOption(APPLICATION);
    await dialog.locator("#beskt-start-interviewer").selectOption({ label: OWNER_NAME });
    await expect(dialog.locator("#beskt-start-contact")).not.toHaveValue("");
    await dialog.locator("#beskt-start-owner").selectOption({ label: OWNER_NAME });
    await dialog
      .locator("#beskt-start-attestation")
      .fill("Befattningen deltar i säkerhetskänslig verksamhet enligt vår befattningsanalys.");
    await dialog
      .locator("#beskt-start-lawful")
      .fill("Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c (testdata).");
    await dialog.getByTestId("beskt-start-questions").locator("summary").click();
    await expect(dialog.getByTestId("beskt-preview-section-s_social_situation")).toBeVisible({
      timeout: 60_000,
    });
    await shot(page, "3-start-dialog");
    await dialog.getByTestId("beskt-start-dialog-submit").click();
    await expect(page.getByTestId("beskt-assignment")).toHaveAttribute(
      "data-mode",
      "security_vetting_support",
      {
        timeout: 60_000,
      },
    );
    await expect(page.getByTestId("beskt-assignment-purpose")).toHaveText(/Säkerhetsprövning/);
    vettingAssignmentId = page.url().split("/").pop()!;
    await shot(page, "3-assignment");
  });

  test("4 · an admin outside the security function, and another organisation, are refused", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await openBeskt(other, OTHER_ADMIN, EMPLOYER);
    await expect(other.getByTestId("beskt-assignments")).toBeVisible({ timeout: 60_000 });
    // An administrator who is not the security function: the organisation's
    // recruitment assignments are listed, the security vetting is not -- and
    // its address answers the same as one that does not exist.
    await expect(other.getByTestId("beskt-assignment-row").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      other.getByTestId("beskt-assignment-row").filter({ hasText: /Säkerhetsprövning/ }),
    ).toHaveCount(0);
    await other.goto(`/employer/${EMPLOYER}/assessments/beskt/${vettingAssignmentId}`);
    await expect(other.getByTestId("beskt-assignment-unavailable")).toBeVisible({
      timeout: 60_000,
    });
    await expect(other.getByText(E_FACT)).toHaveCount(0);
    await ctx.close();

    const ctx2 = await browser.newContext();
    const rival = await ctx2.newPage();
    // The other organisation holds no activation: the v0.1 methods activated
    // for this one are not in its offer (only the environment's synthetic
    // PUBLISHED versions are, as for every active organisation), and none of
    // this organisation's assignments are listed to it.
    await openBeskt(rival, OUTSIDER, RIVAL);
    await expect(
      rival
        .getByTestId("lib-setup-status")
        .locator("li")
        .filter({ hasText: /BESKT – (rekryteringsstöd|säkerhetsprövningsstöd)/ }),
    ).toHaveCount(0);
    await expect(rival.getByTestId("beskt-assignment-row")).toHaveCount(0);
    await rival.goto(`/employer/${EMPLOYER}/assessments/library`);
    await expect(rival.getByText(/Åtkomst ej tillgänglig/)).toBeVisible({ timeout: 60_000 });
    await ctx2.close();
  });

  test("5 · the candidate prepares the security vetting, one area per step", async ({ page }) => {
    await signIn(page, CANDIDATE, "/my-career");
    await page
      .locator('a[href="/my-career/applications"]')
      .filter({ visible: true })
      .first()
      .click();
    const list = page.getByTestId("beskt-my-preparations");
    await expect(list).toBeVisible({ timeout: 60_000 });
    await list.getByTestId("beskt-my-preparation-row").first().getByRole("link").click();

    const notice = page.getByTestId("beskt-notice");
    await expect(notice).toContainText(/Förberedande personalsäkerhetsunderlag/, {
      timeout: 60_000,
    });
    await expect(notice.getByTestId("beskt-notice-contact-route")).toContainText(OWNER_NAME);
    await expect(notice).toContainText(/Säkerhetsskyddslagen 3 kap\./);
    await expect(notice).toContainText(/utsedda behöriga säkerhetsfunktion/);
    await shot(page, "5-notice");
    await page.getByLabel(/jag har läst informationen/i).check();
    await page.getByTestId("beskt-acknowledge").click();

    await walkSteps(page, async () => {
      if ((await page.getByTestId("beskt-item-t01_forstaelse").count()) > 0)
        await page.locator("#beskt-input-t01_forstaelse").check();
      if ((await page.locator("#beskt-input-q09_ekonomisk_press-ja").count()) > 0)
        await page.locator("#beskt-input-q09_ekonomisk_press-ja").click();
      if ((await page.locator("#beskt-input-q09_ekonomisk_press__beskrivning").count()) > 0)
        await page.locator("#beskt-input-q09_ekonomisk_press__beskrivning").fill(E_FACT);
      if ((await page.getByTestId("beskt-item-q16_hot_tvang-oral").count()) > 0)
        await page.getByTestId("beskt-item-q16_hot_tvang-oral").click();
      await expectFitsViewport(page);
    });
    await shot(page, "5-steps");
    await page.getByTestId("beskt-to-review").click();
    await expect(page.getByTestId("beskt-review-list")).toContainText(E_FACT, { timeout: 60_000 });
    await page.getByTestId("beskt-submit").click();
    await expect(page.getByTestId("beskt-submitted")).toBeVisible({ timeout: 60_000 });

    const sup = page.getByTestId("beskt-supplement");
    await sup.locator("#beskt-supplement-item").selectOption("q09_ekonomisk_press");
    await sup.locator("#beskt-supplement-body").fill("TESTDATA rättelse: planen började 2023.");
    await sup.getByTestId("beskt-supplement-submit").click();
    await expect(sup.getByTestId("beskt-supplement-list")).toContainText(/planen började 2023/, {
      timeout: 60_000,
    });
    await shot(page, "5-submitted");
  });

  test("6 · Intervjuer → BESKT with E, the FAKTA chain, stance and the signed report", async ({
    page,
  }) => {
    await openBeskt(page, OWNER, EMPLOYER);
    await page
      .getByTestId("beskt-assignment-row")
      .first()
      .getByTestId("beskt-assignment-open")
      .click();
    await expect(page.getByTestId("beskt-readback-answers")).toContainText(E_FACT, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("beskt-readback-supplements")).toContainText(
      /planen började 2023/,
    );
    const link = page.getByTestId("beskt-case-link");
    await link.getByRole("link", { name: /Skapa ett intervjufall/ }).click();
    const pack = page.locator("#ii-pack");
    await expect(page.locator("#ii-title")).not.toHaveValue("", { timeout: 60_000 });
    const value = await pack
      .locator("option")
      .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).find((v) => v !== ""));
    await pack.selectOption(value!);
    await page.getByRole("button", { name: /^Planera intervjun$/ }).click();
    await page
      .getByRole("link", { name: /^Öppna ansökan$/ })
      .first()
      .click();
    // The case was started FROM the preparation and is linked already
    // (scp_iv_start_interview, one transaction) -- nothing left to link.
    await expect(page.getByTestId("beskt-case-link-linked")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("beskt-case-link-submit")).toHaveCount(0);
    await page.getByRole("link", { name: /Öppna BESKT i intervjufallet/ }).click();
    await expect(page).toHaveURL(/\/beskt$/, { timeout: 60_000 });

    await page.getByRole("button", { name: /Öppna samtalsstödet/ }).click();
    await expect(page.getByTestId("beskt-role-profile")).toContainText(
      /säkerhetskänslig verksamhet/,
      {
        timeout: 60_000,
      },
    );
    await page.getByTestId("beskt-area-tab-e").click();
    const theme = await openThemeArea(page, "q09_ekonomisk_press");
    await expect(theme).toHaveAttribute("data-reason", "candidate_disclosed");
    await expect(theme.getByTestId("beskt-theme-rule")).toBeVisible();
    await expect(page.getByTestId("beskt-workspace-supplements")).toContainText(
      /planen började 2023/,
    );
    await theme.getByRole("button", { name: /Dokumentera temat/ }).click();
    await theme
      .getByLabel(/^Observerbart faktum$/i)
      .fill("TESTDATA betalningsplan hos kronofogden, avslutas 2027");
    await theme.getByLabel(/^Tid och aktualitet$/i).fill("Sedan 2023, pågående");
    await theme.getByLabel(/^Konsekvens$/i).fill("Ingen påverkan på arbetet");
    await theme.getByLabel(/^Stödjande information$/i).fill("Planen visades");
    await theme.getByLabel(/^Motsägande information$/i).fill("Ingen");
    await theme.getByLabel(/^Åtgärder$/i).fill("Betalningsplan följs");
    await theme
      .getByLabel(/^Konkret rollkoppling$/i)
      .fill("Begränsad: ingen ekonomisk behörighet i rollen");
    await theme.getByLabel(/^Osäkerhet och kvarstående informationslucka$/i).fill("Intyg saknas");
    await theme.getByLabel(/^Kandidatens bemötande och rättelser$/i).fill("Rättade startåret");
    await theme.getByRole("button", { name: /Spara dokumentation/ }).click();
    await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
    await shot(page, "6-beskt-e-area");
    await expectFitsViewport(page);

    const parts = page.getByRole("navigation", { name: /Delar av BESKT-metodstödet/ });
    await parts.getByRole("link", { name: /^Min ståndpunkt$/ }).click();
    await page.getByRole("button", { name: /Lås min ståndpunkt/ }).click();
    await page.getByRole("button", { name: /Ja, lås min ståndpunkt/ }).click();
    await expect(page.getByTestId("beskt-position")).toContainText(/Din ståndpunkt är låst/, {
      timeout: 60_000,
    });

    await parts.getByRole("link", { name: /^Rapport$/ }).click();
    const decision = page.getByTestId("beskt-decision");
    await expect(decision).toBeVisible({ timeout: 60_000 });
    await decision.getByTestId("beskt-sufficiency-more_information_required").check();
    await decision
      .locator("#beskt-decision-sufficiency-reason")
      .fill("Intyget om betalningsplanen saknas ännu.");
    await decision
      .locator("#beskt-decision-stance")
      .fill("Inget hinder konstaterat för rollen, med villkor om intyg.");
    await decision
      .locator("#beskt-decision-rationale")
      .fill("Kandidatens egen redovisning och planen talar för att situationen hanteras.");
    await decision.locator("#beskt-decision-name").fill(OWNER_NAME);
    await decision.locator("#beskt-decision-role").fill("Säkerhetsskyddschef");
    await decision.getByTestId("beskt-decision-submit").click();
    await expect(decision.getByTestId("beskt-decision-current")).toBeVisible({ timeout: 60_000 });
    await decision.locator("#beskt-action-description").fill("Begär intyg om betalningsplan");
    await decision.locator("#beskt-action-responsible").fill("Säkerhetsskyddschefen");
    await decision.getByTestId("beskt-action-submit").click();
    await expect(decision.getByTestId("beskt-decision-actions")).toContainText(/Begär intyg/, {
      timeout: 60_000,
    });

    const doc = page.getByTestId("beskt-report-document");
    await expect(doc.getByTestId("beskt-report-purpose")).toHaveText(/Säkerhetsprövning/, {
      timeout: 60_000,
    });
    await expect(doc.getByTestId("beskt-report-stance")).toContainText(
      /Ytterligare information krävs/,
    );
    await expect(doc.getByTestId("beskt-report-supplements")).toContainText(/planen började 2023/);
    await expect(doc).toContainText(/Intyg saknas/);
    await page.getByTestId("beskt-report-finalise").click();
    await expect(page.getByTestId("beskt-report-versions")).toContainText(/Version 1/, {
      timeout: 60_000,
    });
    await expect(doc).toContainText(/Signerad version/);
    await expectFitsViewport(page);
    await shot(page, "6-signed");
  });

  test("7 · a standalone invitation (en): accepted, prepared, linked without an application", async ({
    page,
    browser,
  }) => {
    await openBeskt(page, OWNER, EMPLOYER);
    await page.getByTestId("lib-start-beskt").click();
    const dialog = page.getByTestId("beskt-start-dialog");
    await dialog.getByTestId("beskt-purpose-recruitment_support").check();
    const version = dialog.locator("#beskt-start-version");
    const installed = await version
      .locator("option")
      .evaluateAll(
        (o) =>
          (o as HTMLOptionElement[]).find((x) => /BESKT – rekryteringsstöd/.test(x.text))?.value,
      );
    await version.selectOption(installed!);
    await dialog.getByTestId("beskt-entrance-invitation").check();
    await dialog.locator("#beskt-invite-email").fill(INVITEE);
    await dialog.locator("#beskt-invite-name").fill("Annan Kandidat");
    await dialog.locator("#beskt-invite-role").fill("Larmoperatör (test)");
    await dialog.locator("#beskt-start-interviewer").selectOption({ label: OWNER_NAME });
    await dialog.getByTestId("beskt-start-dialog-submit").click();
    const linkField = dialog.getByTestId("beskt-invitation-link");
    await expect(linkField).toBeVisible({ timeout: 60_000 });
    const invitation = await linkField.inputValue();
    await shot(page, "7-invitation");

    const ctx = await browser.newContext();
    const cand = await ctx.newPage();
    await signIn(cand, INVITEE, new URL(invitation).pathname);
    await cand.getByRole("button", { name: "en", exact: true }).first().click();
    await expect(cand.getByTestId("beskt-invitation-employer")).toHaveText(/BESKT Journey AB/, {
      timeout: 60_000,
    });
    await cand.getByTestId("beskt-invitation-accept").click();
    const notice = cand.getByTestId("beskt-notice");
    await expect(notice).toContainText(/Before you begin/, { timeout: 60_000 });
    await expect(notice.getByTestId("beskt-notice-contact-route")).toContainText(OWNER_NAME);
    await cand.getByLabel(/i have read the information/i).check();
    await cand.getByTestId("beskt-acknowledge").click();
    await walkSteps(cand, async () => {
      if ((await cand.getByTestId("beskt-item-t01_forstaelse").count()) > 0)
        await cand.locator("#beskt-input-t01_forstaelse").check();
      await expectFitsViewport(cand);
    });
    await cand.getByTestId("beskt-to-review").click();
    await cand.getByTestId("beskt-submit").click();
    await expect(cand.getByTestId("beskt-submitted")).toBeVisible({ timeout: 60_000 });
    await shot(cand, "7-invitee-submitted");
    await ctx.close();

    await page.goto(
      `/employer/${EMPLOYER}/assessments/library?method=beskt&group=operational&role=vaktare&env=general`,
    );
    const row = page.getByTestId("beskt-assignment-row").filter({ hasText: /Larmoperatör/ });
    await row.first().getByTestId("beskt-assignment-open").click();
    await expect(page.getByTestId("beskt-assignment")).toContainText(/via inbjudan/, {
      timeout: 60_000,
    });
    await page
      .getByTestId("beskt-case-link")
      .getByRole("link", { name: /Skapa ett intervjufall för uppdraget/ })
      .click();
    const pack = page.locator("#ii-pack");
    await expect(page.locator("#ii-title")).not.toHaveValue("", { timeout: 60_000 });
    const value = await pack
      .locator("option")
      .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).find((v) => v !== ""));
    await pack.selectOption(value!);
    await page.getByRole("button", { name: /^Planera intervjun$/ }).click();
    await expect(page).toHaveURL(/\/assessments\/beskt\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    // The case was started FROM the preparation and is linked already
    // (scp_iv_start_interview, one transaction) -- nothing left to link.
    await expect(page.getByTestId("beskt-case-link-linked")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("beskt-case-link-submit")).toHaveCount(0);
    await page.getByRole("link", { name: /Öppna BESKT i intervjufallet/ }).click();
    await page.getByRole("button", { name: /Öppna samtalsstödet/ }).click();
    await expect(page.getByTestId("beskt-interview-workspace")).toBeVisible({ timeout: 60_000 });
    await shot(page, "7-standalone-beskt");
  });
});

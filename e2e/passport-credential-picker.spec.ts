/**
 * The credential picker — step 1 of the add-credential wizard — in a real
 * browser, at desktop and phone width, in Swedish and English.
 *
 * Routed integration with stubbed server responses. What it proves is the
 * holder's experience of finding the credential they hold; what the database
 * enforces (RLS, the closed catalogue, the request function) is proven by the
 * local SQL suites, and the whole path against a real backend by
 * e2e/passport-catalogue-integration-local.spec.ts.
 *
 * The fixture is in ./support/picker-fixture.ts.
 */
import { test, expect } from "@playwright/test";
import {
  chooseCredential,
  continueLabel,
  openFilters,
  resultCodes,
  searchBox,
} from "./support/credential-picker";
import { assertNoRefusals, exportOf, horizontalOverflow } from "./support/public-entry-harness";
import { base, copy, mount, ROWS, CAFS } from "./support/picker-fixture";

for (const lang of ["sv", "en"] as const) {
  const t = copy[lang];

  test(`search finds a credential by abbreviation, full name or issuer, with no category chosen (${lang})`, async ({
    page,
  }) => {
    const probe = await mount(page, lang);
    // Everything the catalogue offers is listed before anything is typed: scope starts at all.
    await expect(page.locator("[data-result]")).toHaveCount(ROWS.length);
    await expect(page.locator('[data-filter="scope"] input[value="all"]')).toBeChecked();

    await searchBox(page).fill("cpp");
    expect(await resultCodes(page)).toEqual(["INTL_ASIS_CPP", "FX_PARKING_CPP"]);
    const asis = page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"]');
    await expect(asis.locator("[data-result-headline]")).toHaveText(t.cpp);
    await expect(asis.locator("[data-result-byline]")).toHaveText(t.byline);
    // The second CPP is told apart by its full name and its awarding organisation.
    const parking = page.locator('[data-result][data-credential-code="FX_PARKING_CPP"]');
    await expect(parking.locator("[data-result-headline]")).toHaveText(
      "CPP — Certified Parking Professional",
    );
    await expect(parking.locator("[data-result-byline]")).toContainText(
      "Example Parking Institute",
    );

    // Not IFCPP's CISS, though its issuer's name contains "cpp".
    expect(await resultCodes(page)).not.toContain("INTL_IFCPP_CISS");

    await searchBox(page).fill("certified protection professional");
    expect(await resultCodes(page)).toEqual(["INTL_ASIS_CPP"]);
    // Every word may match somewhere, so a looser search lists more — best answer first.
    await searchBox(page).fill("certified protection");
    expect((await resultCodes(page))[0]).toBe("INTL_ASIS_CPP");
    await searchBox(page).fill("offsec");
    expect(await resultCodes(page)).toEqual(["INTL_OFFSEC_OSCP", "INTL_OFFSEC_OSCP_PLUS"]);
    await searchBox(page).fill("(ISC)²");
    expect(await resultCodes(page)).toEqual(["INTL_ISC2_CISSP"]);
    await searchBox(page).fill("former title");
    expect(await resultCodes(page)).toEqual(["INTL_ICA_CIP"]);
    // The former name found it; it is never printed as its name.
    await expect(page.locator("[data-result]").first()).not.toContainText("former title");
    await searchBox(page).fill("managing safely");
    expect(await resultCodes(page)).toEqual(["INTL_IOSH_MANAGING_SAFELY"]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    assertNoRefusals(probe.refusals);
  });

  test(`filters narrow by subject, type, organisation and scope, and clear (${lang})`, async ({
    page,
  }) => {
    const probe = await mount(page, lang);
    await openFilters(page);
    await page.locator('[data-filter="domain"]').selectOption("insurance");
    expect(await resultCodes(page)).toEqual(["INTL_ICA_CIP"]);
    await page.locator("[data-clear-filters]").click();
    await expect(page.locator("[data-result]")).toHaveCount(ROWS.length);

    await page.locator('[data-filter="category"]').selectOption("course_certificate");
    expect(await resultCodes(page)).toEqual(["INTL_IOSH_MANAGING_SAFELY"]);
    await page.locator("[data-clear-filters]").click();

    // International and national are narrowings the holder chooses, never made for them.
    await page.locator('[data-filter="scope"] input[value="national"]').check();
    await page.locator('[data-filter="country"]').selectOption("SE");
    expect(await resultCodes(page)).toEqual(["VU2", "SV"]);
    await page.locator('[data-filter="scope"] input[value="international"]').check();
    await expect(page.locator('[data-filter="country"]')).toHaveCount(0);
    await expect(page.locator("[data-result]")).toHaveCount(ROWS.filter((r) => !r.national).length);
    assertNoRefusals(probe.refusals);
  });

  test(`choosing shows what the catalogue knows and asks only what is the holder's own (${lang})`, async ({
    page,
  }) => {
    const probe = await mount(page, lang);
    await chooseCredential(page, "INTL_ASIS_CPP", { search: "cpp", lang, proceed: false });
    const facts = page.locator("[data-credential-facts]");
    await expect(facts.locator("[data-credential-headline]")).toHaveText(t.cpp);
    await expect(facts.locator("[data-credential-roles]")).toContainText("ASIS International");
    await expect(facts.locator("[data-credential-international-note]")).toBeVisible();
    await expect(facts.locator("[data-credential-maintenance]")).toContainText("36");
    // Nothing is verified by choosing it.
    await expect(page.locator("main")).not.toContainText(/Verified by|Verifierad av/);

    await page.getByRole("button", { name: continueLabel(lang), exact: true }).click();
    await expect(page.getByRole("heading", { name: t.details })).toBeVisible();
    // Fixed information is shown, not asked; no country and no issuer for an international certification.
    await expect(page.getByLabel(t.identifier)).toBeVisible();
    await expect(page.locator('[data-field="issuer-name"]')).toHaveCount(0);
    await expect(page.locator('[data-field="authorisation-scope"]')).toHaveCount(0);
    await expect(page.locator("[data-credential-territory]")).toContainText(
      lang === "sv" ? "inget land" : "no country",
    );
    assertNoRefusals(probe.refusals);
  });

  test(`changing the selection clears what depended on it and keeps what is the holder's own (${lang})`, async ({
    page,
  }) => {
    const probe = await mount(page, lang);
    await chooseCredential(page, "VU2", { lang });
    const issuer = page.locator('[data-field="issuer-name"]');
    await issuer.fill("Fiktiv Utbildning AB");
    await page.getByLabel(t.identifier).fill("ID-7");
    const issued = page.getByLabel(t.issued, { exact: true });
    await issued.fill("2025-03-01");
    await page
      .getByRole("button", { name: lang === "sv" ? "Tillbaka" : "Back", exact: true })
      .click();
    await page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"]').click();
    await page.getByRole("button", { name: continueLabel(lang), exact: true }).click();
    // The issuer typed for the old credential is gone; the identifier and the date are the holder's own.
    await expect(issuer).toHaveCount(0);
    await expect(page.getByLabel(t.identifier)).toHaveValue("ID-7");
    await expect(page.getByLabel(t.issued, { exact: true })).toHaveValue("2025-03-01");
    // Back to the first credential: the issuer is NOT silently restored.
    await page
      .getByRole("button", { name: lang === "sv" ? "Tillbaka" : "Back", exact: true })
      .click();
    await page.locator('[data-result][data-credential-code="VU2"]').click();
    await page.getByRole("button", { name: continueLabel(lang), exact: true }).click();
    await expect(page.locator('[data-field="issuer-name"]')).toHaveValue("");
    expect(probe.saves).toHaveLength(0);
    assertNoRefusals(probe.refusals);
  });

  test(`a credential the catalogue does not offer yet is explained, cannot be selected, and can be asked for (${lang})`, async ({
    page,
  }) => {
    const probe = await mount(page, lang);
    await searchBox(page).fill("cafs");
    const group = page.locator("[data-unavailable-group]");
    await expect(group).toBeVisible();
    await expect(group).toContainText(t.notAvailable);
    await expect(group.locator("[data-unavailable-item]")).toContainText(
      "CAFS — Certified Anti-Fraud Specialist",
    );
    await expect(group.locator("[data-unavailable-reason]")).toHaveText(t.awaiting);
    // No control selects it, and nothing is listed as a result.
    await expect(group.locator('input[type="radio"]')).toHaveCount(0);
    await expect(page.locator("[data-result]")).toHaveCount(0);
    await expect(page.locator("[data-catalogue-empty]")).toBeVisible();
    await expect(
      page.getByRole("button", { name: continueLabel(lang), exact: true }),
    ).toBeDisabled();

    // Asking about it opens the request, filled from the record.
    await group.locator("[data-unavailable-ask]").click();
    await expect(page.locator('[data-field="request-name"]')).toHaveValue(
      "Certified Anti-Fraud Specialist",
    );
    await expect(page.locator('[data-field="request-issuer"]')).toHaveValue("ACAMS");
    expect(probe.requests).toHaveLength(0);
    assertNoRefusals(probe.refusals);
  });

  test(`"${copy[lang].cannotFind}" sends one request, keeps the draft on failure, and creates nothing (${lang})`, async ({
    page,
  }) => {
    const probe = await mount(page, lang);
    let calls = 0;
    await page.route("**/_serverFn/**", async (route) => {
      if (exportOf(route.request().url()) !== "requestCatalogueDefinition") return route.fallback();
      calls += 1;
      await new Promise((r) => setTimeout(r, 400));
      if (calls === 1)
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "SP_REQUEST_FAILED" }),
        });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: { id: "f3000000-0000-4000-8000-000000000001" },
          error: null,
          context: {},
        }),
      });
    });
    await searchBox(page).fill("Certified Cryptoasset Specialist");
    await page.locator("[data-catalogue-request] summary").click();
    await expect(page.locator("[data-request-explanation]")).toContainText(
      lang === "sv" ? "verifierar ingenting" : "verifies nothing",
    );
    // The name is offered from the search, not forced.
    await expect(page.locator('[data-field="request-name"]')).toHaveValue(
      "Certified Cryptoasset Specialist",
    );

    // Missing issuer: refused before anything is sent, on the field.
    await page.locator("[data-request-submit]").click();
    await expect(page.locator("[data-catalogue-request]").getByRole("alert")).toBeVisible();
    expect(calls).toBe(0);

    await page.locator('[data-field="request-issuer"]').fill("Fiktivt Institut");
    await page.locator('[data-field="request-url"]').fill("https://example.org/programme");
    // A double click is ONE request, and a failure keeps exactly what was typed.
    await page.locator("[data-request-submit]").dblclick();
    await expect(page.locator("[data-request-error]")).toBeVisible();
    expect(calls).toBe(1);
    await expect(page.locator('[data-field="request-issuer"]')).toHaveValue("Fiktivt Institut");
    await expect(page.locator('[data-field="request-url"]')).toHaveValue(
      "https://example.org/programme",
    );

    await page.locator("[data-request-submit]").click();
    await expect(page.locator("[data-request-sent]")).toBeVisible();
    expect(calls).toBe(2);
    // It says what a request is not.
    await expect(page.locator("[data-request-sent]")).toContainText(
      lang === "sv" ? "inte registrerad" : "not registered yet",
    );
    // A request is not a credential: nothing was saved, and the wizard still has no selection.
    expect(probe.saves).toHaveLength(0);
    await expect(
      page.getByRole("button", { name: continueLabel(lang), exact: true }),
    ).toBeDisabled();
    const sent = JSON.parse(probe.requests[1] ?? probe.requests[0] ?? "{}");
    expect(JSON.stringify(sent)).not.toMatch(/assertion|verified|credential_code|claim/i);
    assertNoRefusals(probe.refusals);
  });
}

test("asking about an unavailable credential works while another is selected", async ({ page }) => {
  const probe = await mount(page, "en");
  await chooseCredential(page, "INTL_ASIS_CPP", { search: "cpp", proceed: false });
  await searchBox(page).fill("cafs");
  await page.locator("[data-unavailable-ask]").click();
  await expect(page.locator('[data-field="request-name"]')).toHaveValue(
    "Certified Anti-Fraud Specialist",
  );
  // The selection is still the holder's, and nothing was registered or requested by looking.
  await expect(page.locator("[data-selected-credential]")).toContainText(
    "CPP — Certified Protection",
  );
  expect(probe.requests).toHaveLength(0);
  expect(probe.saves).toHaveLength(0);
  assertNoRefusals(probe.refusals);
});

test("a country handed over at the start is a starting point only, never rewritten", async ({
  page,
}) => {
  const probe = await mount(page, "en", "/passport/credentials/new?country=SE");
  await expect(page.locator('[data-filter="scope"] input[value="national"]')).toBeChecked();
  await expect(page.locator('[data-filter="country"]')).toHaveValue("SE");
  expect(await resultCodes(page)).toEqual(["VU2", "SV"]);
  // The holder widens it; nothing puts it back.
  await page.locator('[data-filter="scope"] input[value="all"]').check();
  await expect(page.locator('[data-filter="country"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-filter="scope"] input[value="national"]')).toBeChecked();
  assertNoRefusals(probe.refusals);
});

test("a definition that is not available for this account says so instead of silently showing nothing", async ({
  page,
}) => {
  const probe = await mount(page, "en", "/passport/credentials/new?code=NOT_IN_THIS_CATALOGUE");
  await expect(page.locator("[data-preselect-unavailable]")).toContainText("cannot be selected");
  await expect(page.locator("[data-catalogue-request]")).toBeVisible();
  await expect(page.locator("[data-result]")).toHaveCount(ROWS.length);
  assertNoRefusals(probe.refusals);
});

test("the picker is usable by keyboard and a phone: labelled controls, 44px targets, no sideways scroll", async ({
  page,
}) => {
  const probe = await mount(page, "en");
  await expect(page.locator('[data-filter="search"]')).toHaveAccessibleName(/Search by name/);
  await expect(
    page.getByRole("radiogroup").or(page.locator("fieldset[data-credential-results]")),
  ).toBeVisible();
  const rows = await page
    .locator("[data-result]")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...rows)).toBeGreaterThanOrEqual(44);
  for (const name of ["Continue"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // Arrow keys move through the results; the list stays in place while they do.
  await page.locator('[data-result][data-credential-code="INTL_ASIS_CPP"] input').focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-result]")).toHaveCount(ROWS.length);
  await expect(page.locator("[data-credential-facts]")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  assertNoRefusals(probe.refusals);
});

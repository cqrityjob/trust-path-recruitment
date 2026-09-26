/** The Security Passport credential date fields (Utfärdad / Giltig till) read
 * a date with or without hyphens and store one form.
 *
 * Owner report, from a screenshot of the two fields with their ÅÅÅÅ-MM-DD
 * placeholders: "Ändra datum så att den automatiskt kan läsa av bindestreck
 * eller inte bindestreck." A certificate prints 2020-05-09 or 20200509; a
 * holder copying it must not be refused for leaving the hyphens out.
 *
 * Routed browser integration with stubbed server responses, the same harness
 * as passport-international.spec.ts; the database rule this mirrors
 * (valid_until strictly after issued_on) is exercised by the SQL suites. */
import { test, expect, type Page } from "@playwright/test";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import {
  installBoundary,
  assertNoRefusals,
  observeSupabaseStorageKey,
  plantSession,
} from "./support/public-entry-harness";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3119";
const source = personaById("overlapping-employers");
const snapshot = {
  profileIdentity: { displayName: "Fixture Owner", titleSv: "Analytiker", titleEn: "Analyst" },
  profile: {
    displayName: "Fixture Owner",
    headline: "",
    privacyMode: "full_name",
    onboardingState: "completed",
    onboardingAnswers: {},
  },
  holder: { ...source, claims: [], periods: source.periods },
  eventCount: 0,
};
const metadata = {
  definitions: [
    {
      code: "INTL_ASIS_CPP",
      name_sv: "ASIS CPP",
      name_en: "ASIS CPP",
      credential_class: "certification",
      scope_code: "global_professional",
      country: null,
      region: null,
      issuer_id: "existing-asis",
      issuer_name: "ASIS International",
      official_url: null,
      verification_url: null,
      requires_valid_until: false,
      allows_no_expiry: false,
    },
  ],
  details: [],
  verificationEvents: [],
  issuers: [],
  jurisdictions: [],
};
const copy = {
  sv: {
    continue: "Fortsätt",
    back: "Tillbaka",
    approved: "Godkänd merit",
    issued: "Utfärdad",
    validUntil: "Giltig till",
    review: "Granska och spara",
    details: "Dina uppgifter",
    placeholder: "ÅÅÅÅ-MM-DD",
  },
  en: {
    continue: "Continue",
    back: "Back",
    approved: "Approved credential",
    issued: "Issued",
    validUntil: "Valid until",
    review: "Review & save",
    details: "Your details",
    placeholder: "YYYY-MM-DD",
  },
} as const;

async function openDetailsStep(page: Page, lang: "sv" | "en") {
  const refusals = await installBoundary(page, {
    getMyPassport: snapshot,
    getInternationalPassportMetadata: metadata,
    listMyVerificationRequests: { requests: [], decisions: [] },
    listMyShares: [],
    countMyAcademyWork: { total: 0, actionable: 0 },
    countMyReviewQueue: 0,
    listMyEmployerWorkspaces: [],
    trackV31FunnelEvent: { recorded: false },
    listMyEvidence: [],
    listClaimVersions: [],
    listMyCredentialDrafts: [],
    listCredentialTypes: [],
    listPassportMarketOverview: { markets: [], current: null },
    getHayatAvailability: { linkSources: [] },
  });
  const storageKey = await observeSupabaseStorageKey(page);
  await plantSession(page, storageKey);
  await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
  await page.goto(`${base}/passport/credentials/new`);
  const t = copy[lang];
  const next = () => page.getByRole("button", { name: t.continue, exact: true }).click();
  await expect(page.locator("[data-international-credential-form]")).toBeVisible();
  await next();
  await next();
  await page.getByLabel(t.approved).selectOption("INTL_ASIS_CPP");
  await next();
  await expect(page.getByRole("heading", { name: t.details })).toBeVisible();
  await expect(page.getByPlaceholder(t.placeholder)).toHaveCount(2);
  return { refusals, next, t };
}

const validationMessage = (field: ReturnType<Page["getByLabel"]>) =>
  field.evaluate((el) => (el as HTMLInputElement).validationMessage);

for (const lang of ["sv", "en"] as const) {
  test(`a date typed without hyphens is read and stored as ISO (${lang})`, async ({ page }) => {
    test.setTimeout(60_000);
    const { refusals, next, t } = await openDetailsStep(page, lang);
    const issued = page.getByLabel(t.issued, { exact: true });
    const validUntil = page.getByLabel(t.validUntil, { exact: true });

    // 20200509 → 2020-05-09, settled once the field is left.
    await issued.click();
    await issued.pressSequentially("20200509");
    await page.keyboard.press("Tab");
    await expect(issued).toHaveValue("2020-05-09");
    expect(await validationMessage(issued)).toBe("");

    // The dashed form is stored identically.
    await validUntil.fill("2030-05-09");
    await expect(validUntil).toHaveValue("2030-05-09");

    // An impossible date blocks the step with a message that says why.
    await issued.fill("2020-02-30");
    await next();
    await expect(page.getByRole("heading", { name: t.details })).toBeVisible();
    await expect(issued).toBeVisible();
    expect(await validationMessage(issued)).toContain(
      lang === "sv" ? "finns inte" : "does not exist",
    );

    // So does the digits-only spelling of the same non-date.
    await issued.fill("20200230");
    await next();
    await expect(page.getByRole("heading", { name: t.details })).toBeVisible();
    expect(await validationMessage(issued)).toContain(
      lang === "sv" ? "finns inte" : "does not exist",
    );

    // An ambiguous form is refused, not guessed.
    await issued.fill("01/02/2020");
    await next();
    await expect(page.getByRole("heading", { name: t.details })).toBeVisible();
    expect(await validationMessage(issued)).toContain(lang === "sv" ? "ÅÅÅÅMMDD" : "YYYYMMDD");

    // valid_until on the issue date is refused, as the database refuses it.
    await issued.fill("20300509");
    await page.keyboard.press("Tab");
    await expect(issued).toHaveValue("2030-05-09");
    await next();
    await expect(page.getByRole("heading", { name: t.details })).toBeVisible();
    expect(await validationMessage(validUntil)).toContain(
      lang === "sv" ? "efter utfärdandedatumet (2030-05-09)" : "after the issue date (2030-05-09)",
    );

    // A real pair, typed without hyphens, goes through and survives the trip
    // to the review step and back.
    await issued.fill("20200509");
    await validUntil.fill("20300510");
    await next();
    await expect(page.getByRole("heading", { name: t.review })).toBeVisible();
    const review = page.locator("dl").filter({ hasText: lang === "sv" ? "Slutdatum" : "Expiry" });
    await expect(review).toContainText("2020-05-09");
    await expect(review).toContainText("2030-05-10");
    await page.getByRole("button", { name: t.back, exact: true }).click();
    await expect(page.getByLabel(t.issued, { exact: true })).toHaveValue("2020-05-09");
    await expect(page.getByLabel(t.validUntil, { exact: true })).toHaveValue("2030-05-10");
    assertNoRefusals(refusals);
  });
}

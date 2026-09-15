/** Routed browser integration with stubbed server responses; database enforcement
 * is independently exercised by the local PostgreSQL/RLS suites. */
import { test, expect, type Page } from "@playwright/test";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import {
  installBoundary,
  assertNoRefusals,
  observeSupabaseStorageKey,
  plantSession,
  horizontalOverflow,
} from "./support/public-entry-harness";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3119";
const source = personaById("overlapping-employers");
const claim = {
  ...source.claims[0],
  id: "f1900000-0000-4000-8000-000000000010",
  claimType: "certification",
  credentialCode: null,
  titleSv: "Original international credential",
  titleEn: "Original international credential",
  issuerName: "Example issuer",
  assertionLevel: "self_declared",
  lifecycleState: "active",
  issuedOn: "2025-01-01",
  validUntil: "2030-01-01",
  versionNo: 1,
};
const snapshot = {
  profileIdentity: {
    displayName: "Fixture Owner",
    titleSv: "Säkerhetsanalytiker",
    titleEn: "Security analyst",
  },
  profile: {
    displayName: "Old mirrored name",
    headline: "OLD TITLE MUST NOT APPEAR",
    privacyMode: "full_name",
    onboardingState: "completed",
    onboardingAnswers: {},
  },
  holder: {
    ...source,
    claims: [
      claim,
      { ...claim, id: "cv-row", claimType: "education", titleSv: "PRIVATE CV EDUCATION" },
    ],
    periods: source.periods,
  },
  eventCount: 0,
};
const metadata = {
  definitions: ["CPP", "PSP", "PCI"].map((code) => ({
    code: "INTL_ASIS_" + code,
    name_sv: "ASIS " + code,
    name_en: "ASIS " + code,
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
  })),

  details: [],
  verificationEvents: [],
  issuers: [],
  jurisdictions: [
    {
      code: "SE",
      jurisdiction_type: "national",
      country_code: "SE",
      subdivision_code: null,
      name_sv: "Sverige",
      name_en: "Sweden",
    },
    {
      code: "GB",
      jurisdiction_type: "national",
      country_code: "GB",
      subdivision_code: null,
      name_sv: "Storbritannien",
      name_en: "United Kingdom",
    },
  ],
};
async function mount(page: Page, path: string, lang: "sv" | "en" = "en", empty = false) {
  const table = {
    getMyPassport: empty
      ? { ...snapshot, holder: { ...snapshot.holder, claims: [snapshot.holder.claims[1]] } }
      : snapshot,
    getInternationalPassportMetadata: metadata,
    listMyVerificationRequests: { requests: [], decisions: [] },
    listMyShares: [],
    countMyAcademyWork: { total: 0, actionable: 0 },
    countMyReviewQueue: 0,
    listMyEmployerWorkspaces: [],
    trackV31FunnelEvent: { recorded: false },
    listMyEvidence: [],
    listClaimVersions: [],
    getCredentialPrivateFields: { credentialReference: null, holderNote: null },
    listMyCredentialDrafts: [],
    listCredentialTypes: [],
    getRegulatedCredentialAvailability: {
      state: "open",
      jurisdictionCode: "SE",
      marketPackCode: "SE-CORE",
      types: [],
    },
    listPassportMarketOverview: { markets: [], current: null },
  };
  const refusals = await installBoundary(page, table);
  const storageKey = await observeSupabaseStorageKey(page);
  await plantSession(page, storageKey);
  await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
  await page.goto(`${base}${path}`);
  return refusals;
}
for (const lang of ["sv", "en"] as const) {
  test(`wallet and compact Card preserve boundaries (${lang})`, async ({ page }) => {
    const refusals = await mount(page, "/passport", lang);
    const wallet = page.locator("[data-credential-wallet]");
    await expect(wallet).toBeVisible();
    await expect(wallet.locator("[data-credential-row]")).toHaveCount(1);
    await expect(wallet).toContainText("Original international credential");
    await expect(page.locator("[data-compact-passport-card]")).toContainText(
      lang === "sv" ? "Säkerhetsanalytiker" : "Security analyst",
    );
    await expect(page.locator("main")).not.toContainText("PRIVATE CV EDUCATION");
    await expect(page.locator("main")).not.toContainText("OLD TITLE MUST NOT APPEAR");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `/private/tmp/passport-wallet-${lang}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.goto(`${base}/passport/card`);
    await expect(page.locator("[data-compact-passport-card]")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("PRIVATE CV EDUCATION");
    assertNoRefusals(refusals);
  });
}
test("CV-only holder gets a credential empty state, not repeated onboarding", async ({ page }) => {
  const refusals = await mount(page, "/passport", "en", true);
  await expect(page.locator("[data-credential-wallet]")).toContainText("No credentials here yet");
  await expect(page).toHaveURL(/\/passport\/?$/);
  assertNoRefusals(refusals);
});
test("closed catalogue selects approved definitions and never accepts custom metadata", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const refusals = await mount(page, "/passport/credentials/new");
  await page.getByLabel("Search catalogue").fill("ASIS");
  const selector = page.getByLabel("Approved credential");
  await expect(selector.locator("option")).toHaveCount(4);
  await selector.selectOption("INTL_ASIS_CPP");
  await expect(page.getByLabel("Credential identifier (optional)")).toBeVisible();
  await expect(page.getByLabel("Original credential name", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Issuer (self-reported)", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByLabel("Search catalogue").fill("Unlisted custom credential");
  await expect(page.getByRole("status")).toHaveText(
    "Your credential is not currently available in CQrityjob Security Passport.",
  );
  await page.getByRole("combobox", { name: "Scope", exact: true }).selectOption("national");
  await page.getByRole("combobox", { name: "Country", exact: true }).selectOption("GB");
  await expect(selector.locator("option")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save as self-reported" })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  assertNoRefusals(refusals);
});
test("sharing offers credentials only and defaults optional fields off", async ({ page }) => {
  const refusals = await mount(page, "/passport/share");
  await expect(page.locator("[data-share-screen]")).toBeVisible();
  await expect(page.locator("main")).toContainText("Original international credential");
  await expect(page.locator("main")).not.toContainText("PRIVATE CV EDUCATION");
  await expect(page.getByLabel("My name (subject to privacy settings)")).not.toBeChecked();
  await expect(page.getByLabel("Credential identifiers", { exact: true })).not.toBeChecked();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  assertNoRefusals(refusals);
});

test("v2 consent travels to preview and creation, then the link can be revoked", async ({
  page,
}) => {
  const refusals = await mount(page, "/passport/share");
  const requests: string[] = [];
  let revoked = false;
  const shareId = "f2000000-0000-4000-8000-000000000010";
  await page.route("**/_serverFn/**", async (route) => {
    const { exportOf } = await import("./support/public-entry-harness");
    const name = exportOf(route.request().url());
    const ok = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, error: null, context: {} }),
      });
    if (name === "previewCredentialShare") {
      requests.push(route.request().postData() ?? "");
      return ok({
        status: "active",
        package: "selected_merits",
        schema_version: 2,
        last_updated: "2026-09-15T00:00:00Z",
        authorised_at: "2026-09-15T00:00:00Z",
        checked_at: "2026-09-15T00:00:00Z",
        focus: "passport",
        locale: "en",
        holder: null,
        privacy_mode: "anonymous",
        profession_slug: null,
        jurisdiction: null,
        verified_experience: [],
        verified_experience_days: 0,
        verified_claims: [
          {
            key: "c1",
            type: "certification",
            title: claim.titleSv,
            credential_code: null,
            issuer: claim.issuerName,
            jurisdiction: "SE",
            issued_on: "2025-01-01",
            valid_until: "2030-01-01",
            assertion: "self_declared",
            lifecycle: "active",
            verified_at: null,
            verifier_organisation: null,
            verification_method: null,
            credential_identifier: "EXAMPLE-123",
          },
        ],
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    if (name === "createCredentialShare") {
      requests.push(route.request().postData() ?? "");
      return ok({
        status: "created",
        token: "a".repeat(64),
        disclosureId: shareId,
        expiresAt: "2030-01-01T00:00:00Z",
        previousRevoked: null,
      });
    }
    if (name === "listMyShares")
      return ok([
        {
          id: shareId,
          createdAt: "2026-09-15T00:00:00Z",
          expiresAt: "2030-01-01T00:00:00Z",
          revokedAt: revoked ? "2026-09-15T01:00:00Z" : null,
          accessCount: 0,
          state: revoked ? "revoked" : "active",
          meritCount: 1,
          currentMeritCount: 1,
        },
      ]);
    if (name === "revokeShare") {
      revoked = true;
      return ok({ ok: true });
    }
    return route.fallback();
  });
  await page.locator(`[data-merit-option="claim:${claim.id}"] input`).check();
  await page.getByLabel("Credential identifiers", { exact: true }).check();
  await page.getByRole("button", { name: /Preview.*recipient/ }).click();
  await expect(page.locator("[data-share-preview]")).toContainText("EXAMPLE-123");
  await expect(page.locator("[data-share-preview] [data-recipient-employment]")).toHaveCount(0);
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible();
  expect(requests).toHaveLength(2);
  for (const body of requests) {
    expect(body).toContain("permittedFields");
    expect(body).toContain("identifier");
    expect(body).toContain(claim.id);
    expect(body).not.toContain("experienceIds");
  }
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(`[data-share-revoke="${shareId}"]`).click();
  await expect.poll(() => revoked).toBe(true);
  assertNoRefusals(refusals);
});

test("international add, correction successor and archive remain reachable", async ({ page }) => {
  test.setTimeout(60_000);
  const refusals = await mount(page, "/passport/credentials/new");
  let current = {
    ...claim,
    credentialCode: "INTL_ASIS_CPP",
    titleSv: "ASIS CPP",
    titleEn: "ASIS CPP",
    issuerName: "ASIS International",
    jurisdictionCode: null,
    subJurisdictionCode: null,
  };
  const writes: string[] = [];
  let archived = false;
  const detail = () => ({
    claim_id: current.id,
    credential_class: "certification",
    original_language: "en",
    issuing_country_code: "SE",
    issuing_jurisdiction_code: null,
    validity_jurisdiction_code: "SE",
    no_expiry: null,
  });
  await page.route("**/_serverFn/**", async (route) => {
    const { exportOf } = await import("./support/public-entry-harness");
    const name = exportOf(route.request().url());
    const ok = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, error: null, context: {} }),
      });
    if (name === "saveInternationalCredential") {
      writes.push(route.request().postData() ?? "");
      if (writes.length === 2)
        current = {
          ...current,
          id: "f1900000-0000-4000-8000-000000000011",
          versionNo: 2,
        };
      return ok({ id: current.id });
    }
    if (name === "getMyPassport")
      return ok({ ...snapshot, holder: { ...snapshot.holder, claims: [current] } });
    if (name === "getInternationalPassportMetadata")
      return ok({ ...metadata, details: [detail()] });
    if (name === "archiveCredential") {
      archived = true;
      return ok({ ok: true });
    }
    return route.fallback();
  });

  await page.getByLabel("Approved credential").selectOption("INTL_ASIS_CPP");
  await page.getByLabel("Credential identifier (optional)").fill("ORIGINAL-1");
  await page.getByRole("button", { name: "Save as self-reported", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(current.id));
  await expect(
    page.getByRole("link", { name: "Select credentials and permitted fields", exact: true }),
  ).toHaveAttribute("href", "/passport/share");
  await page.getByRole("button", { name: "Correct this entry", exact: true }).click();

  await page.getByLabel("Credential identifier (optional)").fill("CORRECTED-2");
  await page.getByRole("button", { name: "Save as self-reported", exact: true }).click();
  await expect(page).toHaveURL(/f1900000-0000-4000-8000-000000000011/);
  await expect(page.locator("main")).toContainText("ASIS CPP");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toContain("version");
  expect(writes[1]).toContain(claim.id);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive this entry", exact: true }).click();
  await expect.poll(() => archived).toBe(true);
  await expect(page).toHaveURL(/\/passport\/?$/);
  assertNoRefusals(refusals);
});

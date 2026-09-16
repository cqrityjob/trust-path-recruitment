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
  credentialCode: "INTL_ASIS_CPP",
  titleSv: "Certified Protection Professional (CPP)",
  titleEn: "Certified Protection Professional (CPP)",
  issuerName: "ASIS International",
  assertionLevel: "self_declared",
  lifecycleState: "active",
  issuedOn: "2025-01-01",
  validUntil: "2030-01-01",
  versionNo: 1,
};
const snapshot = {
  profileIdentity: {
    displayName: "Alex Morgan",
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
const programmeNames: Record<string, string> = {
  CPP: "Certified Protection Professional (CPP)",
  PSP: "Physical Security Professional (PSP)",
  PCI: "Professional Certified Investigator (PCI)",
};
const metadata = {
  definitions: ["CPP", "PSP", "PCI"].map((code) => ({
    code: "INTL_ASIS_" + code,
    name_sv: programmeNames[code],
    name_en: programmeNames[code],
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

for (const lang of ["en", "sv"] as const) {
  test(`product visual approval ${lang}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const { mkdirSync } = await import("node:fs");
    const folder = "docs/passport/product-finalization/screenshots";
    mkdirSync(folder, { recursive: true });
    const capture = async (name: string) => {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.screenshot({
        path: `${folder}/${name}-${lang}-${info.project.name}.png`,
        fullPage: true,
      });
    };
    const refusals = await mount(page, "/passport", lang);
    await expect(page.locator("[data-credential-wallet]")).toBeVisible({ timeout: 30_000 });
    const demoClaims = [
      {
        ...claim,
        titleSv: "Certified Protection Professional (CPP)",
        titleEn: "Certified Protection Professional (CPP)",
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2026-09-10",
      },
      {
        ...claim,
        id: "f1900000-0000-4000-8000-000000000011",
        credentialCode: "INTL_ASIS_PSP",
        titleSv: "Physical Security Professional (PSP)",
        titleEn: "Physical Security Professional (PSP)",
        assertionLevel: "document_provided",
      },
      {
        ...claim,
        id: "f1900000-0000-4000-8000-000000000012",
        credentialCode: "INTL_ASIS_PCI",
        titleSv: "Professional Certified Investigator (PCI)",
        titleEn: "Professional Certified Investigator (PCI)",
      },
      {
        ...claim,
        id: "f1900000-0000-4000-8000-000000000013",
        credentialCode: "OV",
        claimType: "licence",
        titleSv: "Ordningsvaktsförordnande",
        titleEn: "Public Order Guard Appointment",
        issuerName: "Polis",
        jurisdictionCode: "SE",
        validUntil: "2025-01-01",
      },
      {
        ...claim,
        id: "f1900000-0000-4000-8000-000000000014",
        credentialCode: "VU2",
        claimType: "training",
        titleSv: "Väktarutbildning 2 (VU2)",
        titleEn: "Security Guard Training 2 (VU2)",
        issuerName: "Polis",
        jurisdictionCode: "SE",
        assertionLevel: "document_provided",
      },
    ];
    const { exportOf } = await import("./support/public-entry-harness");
    const demoMetadata = {
      ...metadata,
      verificationEvents: [
        {
          claimId: claim.id,
          result: "approved",
          decidedAt: "2026-09-10T12:00:00Z",
          validUntil: "2030-01-01",
        },
      ],
      issuers: [
        {
          id: "existing-police",
          kind: "authority",
          name: "Polismyndigheten",
          officialUrl: "https://polisen.se/",
          verificationUrl: null,
          trustSource: "governed_catalogue",
        },
        {
          id: "existing-asis",
          kind: "certification_body",
          name: "ASIS International",
          officialUrl: "https://www.asisonline.org/certification/",
          verificationUrl: null,
          trustSource: "governed_catalogue",
        },
      ],
      organisationRoles: [
        {
          credential_code: "OV",
          role: "issuer",
          authority_id: "existing-police",
          certification_issuer_id: null,
          document_specific: false,
        },
        {
          credential_code: "VU2",
          role: "issuer",
          authority_id: null,
          certification_issuer_id: null,
          document_specific: true,
        },
        {
          credential_code: "INTL_ASIS_CPP",
          role: "issuer",
          certification_issuer_id: "existing-asis",
          authority_id: null,
          document_specific: false,
        },
      ],
      definitionReviews: [
        {
          credential_code: "INTL_ASIS_CPP",
          professional_domain: "security_management",
          source_url:
            "https://www.asisonline.org/certification/certified-protection-professional-cpp/",
          checked_on: "2026-09-16",
          validity_sv: "Treårig omcertifiering enligt ASIS. Aktuell status kontrolleras separat.",
          validity_en:
            "Three-year recertification according to ASIS. Current standing is checked separately.",
        },
      ],
    };
    const reviewHistory = {
      requests: [
        {
          id: "demo-review",
          claimId: claim.id,
          periodId: null,
          kind: "cqrityjob_review",
          status: "approved",
          submittedAt: "2026-09-09T12:00:00Z",
          decidedAt: "2026-09-10T12:00:00Z",
          method: "document_review",
          holderMessage: null,
          validFrom: "2026-09-10",
          validUntil: "2030-01-01",
          targetEmployerId: null,
        },
      ],
      decisions: [
        {
          id: "demo-decision",
          requestId: "demo-review",
          decision: "approved",
          organisation: "CQrityjob",
          method: "document_review",
          decidedAt: "2026-09-10T12:00:00Z",
          validFrom: "2026-09-10",
          validUntil: "2030-01-01",
        },
      ],
    };
    const evidence = [
      {
        id: "demo-private-evidence",
        claimId: claim.id,
        periodId: null,
        fileName: "cpp-document.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
        uploadedAt: "2026-09-09T11:00:00Z",
        lifecycleState: "active",
      },
    ];
    const recipientPayload = {
      status: "active",
      package: "selected_merits",
      schema_version: 2,
      focus: "passport",
      locale: lang,
      holder: "Alex Morgan",
      privacy_mode: "full_name",
      profession_slug: null,
      jurisdiction: null,
      sub_jurisdiction: null,
      purpose: "recruitment",
      authorised_at: "2026-09-16T12:00:00Z",
      checked_at: "2026-09-16T12:05:00Z",
      last_updated: "2026-09-16T12:00:00Z",
      expires_at: "2030-01-01T00:00:00Z",
      verified_experience: [],
      verified_experience_days: 0,
      verified_claims: demoClaims.slice(0, 3).map((c, i) => ({
        key: `c${i}`,
        type: "certification",
        title: lang === "sv" ? c.titleSv : c.titleEn,
        credential_code: c.credentialCode,
        issuer: "ASIS International",
        jurisdiction: null,
        sub_jurisdiction: null,
        scope_limited: false,
        issued_on: c.issuedOn,
        valid_until: c.validUntil,
        assertion: i === 0 ? "verified" : c.assertionLevel,
        lifecycle: i === 2 ? "revoked" : "active",
        verified_at: i === 0 ? "2026-09-10T12:00:00Z" : null,
        verification_method: i === 0 ? "document_review" : null,
        verifier_organisation: i === 0 ? "CQrityjob" : null,
        credential_identifier: null,
        credential_class: "certification",
      })),
    };
    await page.route("**/_serverFn/**", async (route) => {
      const name = exportOf(route.request().url());
      const result =
        name === "getMyPassport"
          ? { ...snapshot, holder: { ...snapshot.holder, claims: demoClaims } }
          : name === "getInternationalPassportMetadata"
            ? demoMetadata
            : name === "listMyVerificationRequests"
              ? reviewHistory
              : name === "listMyEvidence"
                ? evidence
                : name === "getPublicDisclosureFromCookie"
                  ? recipientPayload
                  : undefined;
      if (result !== undefined)
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result, error: null, context: {} }),
        });
      return route.fallback();
    });
    await page.reload();
    await expect(page.locator("[data-credential-row]")).toHaveCount(5, { timeout: 30_000 });
    const training = page.locator("[data-credential-row]").filter({ hasText: "VU2" });
    await expect(training).not.toContainText("Polis");
    await expect(training).toContainText(
      lang === "sv" ? "Utfärdare enligt dokumentet" : "Issuer recorded on the document",
    );
    await expect(
      page.locator("[data-credential-row]").filter({ hasText: "Polismyndigheten" }),
    ).toHaveCount(1);
    await capture("overview-wallet");
    await page.goto(`${base}/passport/credentials/new`);
    const next = () =>
      page
        .getByRole("button", { name: lang === "sv" ? "Fortsätt" : "Continue", exact: true })
        .click();
    await expect(page.locator("[data-international-credential-form]")).toBeVisible();
    await capture("add-scope");
    await next();
    await capture("add-filters");
    await next();
    await page
      .getByLabel(lang === "sv" ? "Godkänt yrkesbevis" : "Approved credential")
      .selectOption("INTL_ASIS_CPP");
    await capture("add-catalogue");
    await next();
    await page
      .getByLabel(lang === "sv" ? "Bevisnummer (valfritt)" : "Credential identifier (optional)")
      .fill("DEMO-ONLY-123");
    await capture("add-details");
    await next();
    await capture("add-review");
    await page.goto(`${base}/passport/entry/claim/${claim.id}`);
    await expect(page.locator("[data-definition-context]")).toBeVisible();
    await expect(page.locator("[data-verification-history]")).toContainText("2026-09-10");
    await expect(page.locator("[data-verification-history]")).not.toContainText("2026-09-09");
    await capture("credential-detail");
    await page.goto(`${base}/passport/card`);
    await expect(page.locator("[data-compact-passport-card]")).toContainText(
      lang === "sv" ? "0 valda" : "0 selected",
    );
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await capture("trust-card");
    await page.goto(`${base}/passport/share`);
    await expect(page.locator("[data-share-screen]")).toBeVisible();
    await capture("sharing");
    await page.goto(`${base}/passport/privacy`);
    await expect(page.locator("main")).toContainText(lang === "sv" ? "Integritet" : "Privacy");
    await capture("privacy");
    await page.goto(`${base}/p/${"f".repeat(64)}`);
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main")).toContainText(lang === "sv" ? "Återkallad" : "Revoked");
    await expect(page.locator("main")).not.toContainText("DEMO-ONLY-123");
    await capture("recipient");
    assertNoRefusals(refusals);
  });
}

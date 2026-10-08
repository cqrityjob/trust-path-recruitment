// The shape of the real catalogue, for the credential picker's browser specs.
//
// Drawn from the research package's own awards (similar abbreviations — CPP twice,
// OSCP / OSCP+ — a course certificate, a designation, a definition whose issuer
// is stated on the certificate, one that needs a scope, and an award the catalogue
// does not offer yet), NOT a copy of it: what is pinned is behaviour. The real rows
// are pinned against the real database by the local SQL suites.

import { expect, type Page } from "@playwright/test";
import { personaById } from "../../src/lib/security-passport/fixtures/personas";
import {
  exportOf,
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
} from "./public-entry-harness";

export const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3119";
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
  holder: { ...source, claims: [], periods: [] },
  eventCount: 0,
};

const ISSUERS = {
  asis: "ASIS International",
  parking: "Example Parking Institute",
  ifcpp: "International Foundation for Cultural Property Protection (IFCPP)",
  isc2: "ISC2",
  offsec: "OffSec",
  iosh: "Institution of Occupational Safety and Health",
  ica: "Insurance Institute of Canada",
} as const;
type IssuerKey = keyof typeof ISSUERS;

interface Row {
  code: string;
  name: string;
  issuer: IssuerKey | null;
  cls: string;
  abbreviation: string | null;
  domain: string;
  national?: boolean;
  requiresScope?: boolean;
}
export const ROWS: readonly Row[] = [
  {
    code: "INTL_ASIS_CPP",
    name: "Certified Protection Professional (CPP)",
    issuer: "asis",
    cls: "certification",
    abbreviation: "CPP",
    domain: "physical_security",
  },
  {
    code: "INTL_ASIS_PSP",
    name: "Physical Security Professional (PSP)",
    issuer: "asis",
    cls: "certification",
    abbreviation: "PSP",
    domain: "physical_security",
  },
  {
    code: "FX_PARKING_CPP",
    name: "Certified Parking Professional (CPP)",
    issuer: "parking",
    cls: "certification",
    abbreviation: "CPP",
    domain: "physical_security",
  },
  {
    code: "INTL_IFCPP_CISS",
    name: "Certified Institutional Security Supervisor (CISS)",
    issuer: "ifcpp",
    cls: "certification",
    abbreviation: "CISS",
    domain: "physical_security",
  },
  {
    code: "INTL_ISC2_CISSP",
    name: "Certified Information Systems Security Professional (CISSP)",
    issuer: "isc2",
    cls: "certification",
    abbreviation: "CISSP",
    domain: "information_security",
  },
  {
    code: "INTL_OFFSEC_OSCP",
    name: "OffSec Certified Professional",
    issuer: "offsec",
    cls: "certification",
    abbreviation: "OSCP",
    domain: "information_security",
  },
  {
    code: "INTL_OFFSEC_OSCP_PLUS",
    name: "OffSec Certified Professional (OSCP+)",
    issuer: "offsec",
    cls: "certification",
    abbreviation: "OSCP+",
    domain: "information_security",
  },
  {
    code: "INTL_IOSH_MANAGING_SAFELY",
    name: "IOSH Managing Safely",
    issuer: "iosh",
    cls: "course_certificate",
    abbreviation: null,
    domain: "resilience_safety",
  },
  {
    code: "INTL_ICA_CIP",
    name: "Chartered Insurance Professional (CIP)",
    issuer: "ica",
    cls: "professional_designation",
    abbreviation: "CIP",
    domain: "insurance",
  },
  {
    code: "VU2",
    name: "Väktarutbildning 2 (VU2)",
    issuer: null,
    cls: "mandatory_training",
    abbreviation: "VU2",
    domain: "security_operations",
    national: true,
  },
  {
    code: "SV",
    name: "Skyddsvakt (SV)",
    issuer: null,
    cls: "regulated_authorisation",
    abbreviation: "SV",
    domain: "security_operations",
    national: true,
    requiresScope: true,
  },
];

const GLOBAL = "global_professional";
export const metadata = {
  definitions: ROWS.map((r) => ({
    code: r.code,
    name_sv: r.name,
    name_en: r.name,
    credential_class: r.cls,
    scope_code: r.national ? "national_regulated" : GLOBAL,
    country: r.national ? "SE" : null,
    region: null,
    issuer_id: r.issuer ? `iss-${r.issuer}` : null,
    issuer_name: r.issuer ? ISSUERS[r.issuer] : null,
    official_url: r.issuer ? `https://example.org/${r.code}` : null,
    verification_url: null,
    requires_valid_until: false,
    allows_no_expiry: false,
  })),
  definitionScopes: ROWS.map((r) => ({
    code: r.code,
    scope_code: r.national ? "national_regulated" : GLOBAL,
    requires_scope: r.requiresScope === true,
    symbol_label: r.abbreviation,
    is_active: true,
    pilot_state: null,
  })),
  abbreviations: ROWS.map((r) => ({
    credential_code: r.code,
    abbreviation: r.abbreviation,
    maintenance_policy_type: r.issuer ? "recertification_cycle" : null,
    maintenance_cycle_months: r.issuer ? 36 : null,
  })),
  issuerAliases: [{ issuer_id: "iss-isc2", alias: "(ISC)²" }],
  definitionAliases: [
    { credential_code: "INTL_ICA_CIP", alias: "Associate in General Insurance (former title)" },
  ],
  organisationRoles: [
    ...ROWS.filter((r) => r.issuer).map((r) => ({
      credential_code: r.code,
      role: "issuer",
      authority_id: null,
      certification_issuer_id: `iss-${r.issuer}`,
      document_specific: false,
      source_url: "https://example.org",
      checked_on: "2026-10-03",
    })),
    ...ROWS.filter((r) => r.national).flatMap((r) => [
      {
        credential_code: r.code,
        role: "regulator",
        authority_id: "auth-police",
        certification_issuer_id: null,
        document_specific: false,
        source_url: "https://example.org",
        checked_on: "2026-10-03",
      },
      {
        credential_code: r.code,
        role: "issuer",
        authority_id: null,
        certification_issuer_id: null,
        document_specific: true,
        source_url: "https://example.org",
        checked_on: "2026-10-03",
      },
    ]),
  ],
  definitionReviews: ROWS.map((r) => ({
    credential_code: r.code,
    professional_domain: r.domain,
    source_url: "https://example.org",
    checked_on: "2026-10-03",
    validity_sv: "",
    validity_en: "",
  })),
  definitionVersions: [],
  statedVersions: [],
  details: [],
  verificationEvents: [],
  issuers: [
    ...(Object.keys(ISSUERS) as IssuerKey[]).map((k) => ({
      id: `iss-${k}`,
      kind: "certification_body",
      name: ISSUERS[k],
      officialUrl: null,
      verificationUrl: null,
      trustSource: "governed_catalogue",
    })),
    {
      id: "auth-police",
      kind: "authority",
      name: "Polismyndigheten",
      officialUrl: null,
      verificationUrl: null,
      trustSource: "governed_catalogue",
    },
  ],
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

export const CAFS = {
  researchId: "cred_2ca9c5005925857d",
  name: "Certified Anti-Fraud Specialist",
  abbreviation: "CAFS",
  issuer: "ACAMS",
  reason: "awaiting_source_check",
};

export interface Probe {
  refusals: Awaited<ReturnType<typeof installBoundary>>;
  requests: string[];
  saves: string[];
}

export async function mount(
  page: Page,
  lang: "sv" | "en",
  path = "/passport/credentials/new",
): Promise<Probe> {
  const requests: string[] = [];
  const saves: string[] = [];
  const table = {
    getMyPassport: snapshot,
    getInternationalPassportMetadata: metadata,
    listMyVerificationRequests: { requests: [], decisions: [] },
    listMyShares: [],
    countMyAcademyWork: { total: 0, actionable: 0 },
    countMyReviewQueue: 0,
    listMyEmployerWorkspaces: [],
    trackV31FunnelEvent: { recorded: false },
    listMyEvidence: [],
    listMyUploadAttempts: [],
    listClaimVersions: [],
    listMyCredentialDrafts: [],
    listCredentialTypes: [],
    listPassportMarketOverview: { markets: [], current: null },
    getHayatAvailability: { linkSources: [] },
    listMyCatalogueRequests: [],
  };
  const refusals = await installBoundary(page, table);
  const storageKey = await observeSupabaseStorageKey(page);
  await plantSession(page, storageKey);
  await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url());
    const ok = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, error: null, context: {} }),
      });
    if (name === "searchUnavailableDefinitions") {
      const url = decodeURIComponent(route.request().url());
      return ok(/cafs|anti-fraud/i.test(url) ? [CAFS] : []);
    }
    if (name === "saveInternationalCredential") saves.push(route.request().postData() ?? "");
    if (name === "requestCatalogueDefinition") requests.push(route.request().postData() ?? "");
    return route.fallback();
  });
  await page.goto(`${base}${path}`);
  await expect(page.locator("[data-international-credential-form]")).toBeVisible();
  return { refusals, requests, saves };
}

export const copy = {
  sv: {
    cpp: "CPP — Certified Protection Professional",
    byline: "ASIS International · Internationell certifiering",
    details: "Dina uppgifter",
    notAvailable: "Inte tillgängliga ännu",
    awaiting: "Väntar på kontroll mot utfärdarens egen sida",
    cannotFind: "Hittar du inte din certifiering?",
    clear: "Rensa valet",
    identifier: "Certifikats- eller licensnummer (valfritt)",
    issued: "Utfärdad",
  },
  en: {
    cpp: "CPP — Certified Protection Professional",
    byline: "ASIS International · International certification",
    details: "Your details",
    notAvailable: "Not available yet",
    awaiting: "Awaiting a check against the issuer's own page",
    cannotFind: "Cannot find your certification?",
    clear: "Clear selection",
    identifier: "Credential identifier (optional)",
    issued: "Issued",
  },
} as const;

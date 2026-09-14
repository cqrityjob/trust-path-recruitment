// Security Passport — three markets, one catalogue, in a real browser.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/passport-market-catalogue-check.tsx reads the route source and
// renders the components to markup. It cannot see the ROUTE run: the
// governed availability answer arriving as "open_pilot" and the catalogue
// actually appearing under the pilot status line, a search field narrowing
// thirty Dubai choices while the chosen one stays put, an administrator's
// grant reaching the server function with the right market, or a 375px
// phone with no sideways scroll. Those are what this file is for.
//
// ── HOW THE BACKEND IS STUBBED ─────────────────────────────────────────
//
// The same protocol e2e/passport-workspace.spec.ts uses: a Supabase session
// planted in localStorage, every `/_serverFn/<id>` answered from the
// scenario, an unstubbed call answered with a 500 and recorded so a scenario
// fails loudly rather than passing quietly. Nothing reaches a real database,
// and every name on screen is fictional.
//
// The fixture screens on /dev/security-passport need no session at all.
//
// Run:  E2E_BASE_URL=http://127.0.0.1:3100 bunx playwright test e2e/passport-three-market.spec.ts
//
// Set PASSPORT_SHOTS=<dir> to write the review screenshots (desktop and
// 375, Swedish and English) into that directory.

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";
import { fromJSON } from "seroval";
import { FIXTURE_CREDENTIAL_TYPES } from "../src/lib/security-passport/fixtures/credential-types";
import {
  FIXTURE_AE_DU_CATALOGUE,
  FIXTURE_GB_CATALOGUE,
  FIXTURE_GB_NI_CATALOGUE,
} from "../src/lib/security-passport/fixtures/market-catalogues";
import {
  credentialClaimFields,
  type CredentialClaimFields,
  type CredentialDraft,
  type CredentialType,
} from "../src/lib/security-passport/credentials";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
const USER_ID = "00000000-0000-4000-8000-0000000003a1";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000ad";
const SHOT_DIR = process.env.PASSPORT_SHOTS ?? "";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type Availability = {
  state: "no_work_country" | "open" | "open_pilot" | "pending_review" | "unsupported";
  jurisdictionCode: string | null;
  subJurisdictionCode: string | null;
  marketPackCode: string | null;
  types: readonly unknown[];
};

const AVAIL = {
  se: {
    state: "open",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    marketPackCode: "SE",
    types: FIXTURE_CREDENTIAL_TYPES,
  },
  gbPilot: {
    state: "open_pilot",
    jurisdictionCode: "GB",
    subJurisdictionCode: null,
    marketPackCode: "GB",
    types: FIXTURE_GB_CATALOGUE,
  },
  niPilot: {
    state: "open_pilot",
    jurisdictionCode: "GB",
    subJurisdictionCode: "GB-NI",
    marketPackCode: "GB-NI",
    types: FIXTURE_GB_NI_CATALOGUE,
  },
  duPilot: {
    state: "open_pilot",
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    marketPackCode: "AE-DU",
    types: FIXTURE_AE_DU_CATALOGUE,
  },
  gbPending: {
    state: "pending_review",
    jurisdictionCode: "GB",
    subJurisdictionCode: null,
    marketPackCode: "GB",
    types: [],
  },
} satisfies Record<string, Availability>;

type MarketRow = {
  marketPackCode: string;
  jurisdictionCode: string;
  subJurisdictionCode: string | null;
  nameSv: string;
  nameEn: string;
  availability: "available" | "internal_pilot" | "closed";
  holderAccess: "production" | "pilot" | "closed";
  isCurrentWorkMarket: boolean;
};

function markets(opts: { work: string; pilot: readonly string[] }): MarketRow[] {
  const row = (
    code: string,
    j: string,
    sub: string | null,
    nameSv: string,
    nameEn: string,
    active: boolean,
  ): MarketRow => ({
    marketPackCode: code,
    jurisdictionCode: j,
    subJurisdictionCode: sub,
    nameSv,
    nameEn,
    availability: active ? "available" : "internal_pilot",
    holderAccess: active ? "production" : opts.pilot.includes(code) ? "pilot" : "closed",
    isCurrentWorkMarket: opts.work === code,
  });
  return [
    row("SE", "SE", null, "Sverige", "Sweden", true),
    row("GB", "GB", null, "Storbritannien", "Great Britain", false),
    row("GB-NI", "GB", "GB-NI", "Nordirland", "Northern Ireland", false),
    row("AE-DU", "AE", "AE-DU", "Dubai", "Dubai", false),
  ];
}

function claim(over: Record<string, unknown>) {
  return {
    id: "c-x",
    claimType: "licence",
    credentialCode: null,
    skillCode: null,
    skillLevel: null,
    titleSv: "Fiktiv behörighet",
    titleEn: "Fictional credential",
    issuerName: "Fiktiv myndighet",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2025-01-10",
    validFrom: "2025-01-10",
    validUntil: "2028-01-09",
    assertionLevel: "self_declared",
    lifecycleState: "active",
    versionNo: 1,
    supersedesId: null,
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    limitationSv: null,
    limitationEn: null,
    ...over,
  };
}

/** One Passport with a record in each of the three markets. */
const THREE_MARKET_CLAIMS = [
  claim({
    id: "c-se-ov",
    credentialCode: "OV",
    titleSv: "Ordningsvaktsförordnande",
    titleEn: "Public Order Guard Appointment",
    assertionLevel: "verified",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2025-02-01",
  }),
  claim({
    id: "c-gb-ds",
    credentialCode: "UK_SIA_LICENCE_DS",
    titleSv: "SIA Licence — Door Supervision",
    titleEn: "SIA Licence — Door Supervision",
    issuerName: "SIA (fiktiv referens)",
    jurisdictionCode: "GB",
  }),
  claim({
    id: "c-gb-qds",
    claimType: "training",
    credentialCode: "UK_SIA_QUAL_DS",
    titleSv: "Licence-linked qualification — Door Supervision",
    titleEn: "Licence-linked qualification — Door Supervision",
    issuerName: "Fiktivt utbildningsföretag",
    jurisdictionCode: "GB",
    validUntil: null,
  }),
  claim({
    id: "c-du-guard",
    credentialCode: "AE_DU_SIRA_CARD_GUARD",
    titleSv: "SIRA Security Cadre Card — Security Guard",
    titleEn: "SIRA Security Cadre Card — Security Guard",
    issuerName: "SIRA (fiktiv referens)",
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    authorisationScope: "Fiktivt bevakningsbolag LLC",
  }),
];

interface Scenario {
  readonly availability?: Availability;
  readonly availabilityFails?: boolean;
  /** When set, the availability read answers per CURRENT work market (as the
   *  save stub updates it), after the given delay — so a test can hold one
   *  market's answer in flight while the holder moves to another. */
  readonly availabilityByMarket?: Record<string, { body: Availability; delayMs: number }>;
  readonly markets?: MarketRow[];
  readonly marketsFail?: boolean;
  readonly claims?: ReturnType<typeof claim>[];
  readonly work?: { jurisdictionCode: string; subJurisdictionCode: string | null };
  /** The admin pilot-access rows, kept as mutable state so a grant or a
   *  revoke changes what the next read returns. */
  readonly pilotRows?: PilotRow[];
  /** Unfinished credential drafts the form offers to resume. */
  readonly drafts?: readonly Record<string, unknown>[];
}

type PilotRow = {
  marketPackCode: "GB" | "GB-NI" | "AE-DU";
  nameSv: string;
  nameEn: string;
  inPilot: boolean;
  entitlement: {
    active: boolean;
    grantedAt: string;
    revokedAt: string | null;
    note: string | null;
  } | null;
};

function pilotRows(): PilotRow[] {
  return [
    {
      marketPackCode: "GB",
      nameSv: "Storbritannien",
      nameEn: "Great Britain",
      inPilot: true,
      entitlement: null,
    },
    {
      marketPackCode: "GB-NI",
      nameSv: "Nordirland",
      nameEn: "Northern Ireland",
      inPilot: true,
      entitlement: null,
    },
    { marketPackCode: "AE-DU", nameSv: "Dubai", nameEn: "Dubai", inPilot: true, entitlement: null },
  ];
}

/* ------------------------------------------------------------------ */
/* Mount                                                               */
/* ------------------------------------------------------------------ */

function exportOf(url: string): string | null {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { export?: string };
    return String(json.export ?? "").replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}

function payloadOf(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) return {};
  try {
    const decoded = fromJSON(JSON.parse(raw)) as { data?: unknown };
    const data = decoded?.data ?? decoded;
    return (data ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const ok = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });
const boom = (route: Route, message: string) =>
  route.fulfill({ status: 500, contentType: "text/plain", body: message });

let unmatched: string[] = [];
let pageErrors: string[] = [];
/** Every grant and revoke the admin surface sent, exactly as the server
 *  function received it. */
let adminWrites: Array<{ fn: string; data: Record<string, unknown> }> = [];

/* ------------------------------------------------------------------ */
/* The write path                                                      */
/* ------------------------------------------------------------------ */

/** Every credential payload the browser sent, and the row the SERVER would
 *  store for it.
 *
 *  ── WHY THE STUB DOES NOT SIMPLY SAY "SAVED" ──────────────────────────
 *
 *  A stub that returns success for whatever arrives proves that a button
 *  was clicked. The defect this covers was invisible to exactly that: the
 *  form sent a British licence with `jurisdictionCode: "SE"`, every stub in
 *  the suite accepted it, and only the database refused it — in production,
 *  as "Något gick fel. Försök igen."
 *
 *  So the stub runs the application's OWN mapping, `credentialClaimFields`,
 *  over the payload it received, and then applies the two rules
 *  `sp_claims_credential_rules` applies to the result: a credential is
 *  filed in its definition's jurisdiction and its definition's
 *  sub-jurisdiction, or it is refused with the same SP_ code the trigger
 *  raises. The scenario therefore fails for the same reason production
 *  failed. */
let savedPayloads: Array<Record<string, unknown>> = [];
let savedRows: CredentialClaimFields[] = [];

const ALL_FIXTURE_TYPES: readonly CredentialType[] = [
  ...FIXTURE_CREDENTIAL_TYPES,
  ...FIXTURE_GB_CATALOGUE,
  ...FIXTURE_GB_NI_CATALOGUE,
  ...FIXTURE_AE_DU_CATALOGUE,
];

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

/** The payload as the server's `toDomainDraft` reads it. */
function draftOfPayload(data: Record<string, unknown>): CredentialDraft {
  return {
    credentialCode: strOrNull(data.credentialCode),
    title: str(data.title),
    issuerName: str(data.issuerName),
    jurisdictionCode: str(data.jurisdictionCode),
    issuedOn: strOrNull(data.issuedOn),
    validFrom: strOrNull(data.validFrom),
    validUntil: strOrNull(data.validUntil),
    credentialReference: str(data.credentialReference),
    holderNote: str(data.holderNote),
    authorisationScope: str(data.authorisationScope),
  };
}

async function mount(
  page: Page,
  scenario: Scenario,
  lang: "sv" | "en",
  pathname: string,
  who: "holder" | "admin" = "holder",
) {
  unmatched = [];
  pageErrors = [];
  adminWrites = [];
  savedPayloads = [];
  savedRows = [];
  const userId = who === "admin" ? ADMIN_ID : USER_ID;
  const work = scenario.work ?? { jurisdictionCode: "SE", subJurisdictionCode: null };

  await page.addInitScript(
    ({ ref, l, uid }) => {
      try {
        localStorage.setItem("cqrityjob.lang", l);
        localStorage.setItem(
          `sb-${ref}-auth-token`,
          JSON.stringify({
            access_token: "stub-access-token",
            refresh_token: "stub-refresh-token",
            token_type: "bearer",
            expires_in: 3600 * 24 * 365,
            expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
            user: {
              id: uid,
              aud: "authenticated",
              email: "three-market@example.test",
              user_metadata: { display_name: "Testperson" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { ref: SUPABASE_REF, l: lang, uid: userId },
  );

  const rows = scenario.pilotRows ?? pilotRows();
  // Mutable: the work-country save stub moves it, and the profile and
  // availability stubs answer for wherever it is NOW.
  const state = { work: { ...work } };

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    switch (name) {
      /* ── the holder's Passport ─────────────────────────────────────── */
      case "getMyPassport":
        return ok(route, {
          profile: {
            displayName: "Testperson (fiktiv)",
            headline: null,
            cigProfessionSlug: null,
            jurisdictionCode: state.work.jurisdictionCode,
            subJurisdictionCode: state.work.subJurisdictionCode,
            workLocationConfirmedAt: "2026-08-01T09:00:00.000Z",
            privacyMode: "full_name",
            onboardingState: "completed",
            onboardingStep: 3,
            onboardingAnswers: {},
            onboardingDraftRevision: 3,
            questionVersion: "sp-q-v1",
            declaredAccurateAt: "2026-08-01T09:00:00.000Z",
            recognitionPolicyVersion: "v1",
            updatedAt: "2026-09-06T09:00:00.000Z",
          },
          holder: {
            id: USER_ID,
            displayName: "Testperson (fiktiv)",
            professionSlug: null,
            identity: {
              engineVersion: "identity-v1",
              evaluatedOn: "2026-09-12",
              includesSelfDeclared: true,
              educationCompleted: [],
              professionalCompetence: [],
              localEligibility: [],
              activeTitles: [],
            },
            jurisdictionCode: state.work.jurisdictionCode,
            subJurisdictionCode: state.work.subJurisdictionCode,
            periods: [],
            claims: scenario.claims ?? [
              claim({
                id: "c-se-vu1",
                credentialCode: "VU1",
                claimType: "training",
                titleSv: "Väktarutbildning 1 (VU1)",
                titleEn: "Security Guard Training 1 (VU1)",
                validUntil: null,
              }),
            ],
            hasCareerDiscoveryResult: false,
          },
          eventCount: 2,
        });
      case "listMyVerificationRequests":
        return ok(route, { requests: [], decisions: [] });
      case "listPassportMarketOverview":
        if (scenario.marketsFail) return boom(route, "market overview failed");
        return ok(route, scenario.markets ?? markets({ work: "SE", pilot: [] }));
      case "getRegulatedCredentialAvailability": {
        if (scenario.availabilityFails) return boom(route, "availability failed");
        const perMarket =
          scenario.availabilityByMarket?.[
            state.work.subJurisdictionCode ?? state.work.jurisdictionCode
          ];
        if (perMarket) {
          await new Promise((r) => setTimeout(r, perMarket.delayMs));
          return ok(route, perMarket.body);
        }
        return ok(route, scenario.availability ?? AVAIL.se);
      }
      case "setWorkCountry": {
        const chosen = String(payloadOf(route).workCountry ?? "");
        state.work =
          chosen === "GB-NI"
            ? { jurisdictionCode: "GB", subJurisdictionCode: "GB-NI" }
            : chosen === "AE-DU"
              ? { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" }
              : { jurisdictionCode: chosen, subJurisdictionCode: null };
        return ok(route, { savedAt: "2026-09-12T12:00:00.000Z" });
      }
      case "listMyEntries":
        return ok(route, {
          experience: [],
          claims: (scenario.claims ?? []).map((c) => ({
            ...c,
            title: c.titleSv,
            editable: true,
          })),
          skills: [],
        });
      case "listJurisdictions":
        return ok(route, [{ code: "SE", nameSv: "Sverige", nameEn: "Sweden" }]);
      case "listSkillTypes":
        return ok(route, []);
      case "listMyCredentialDrafts":
        return ok(route, scenario.drafts ?? []);
      case "discardCredentialDraft":
        return ok(route, { ok: true });
      case "saveCredential": {
        const data = payloadOf(route);
        savedPayloads.push(data);
        const type = ALL_FIXTURE_TYPES.find((t) => t.code === data.credentialCode) ?? null;
        if (!type) return boom(route, "SP_CREDENTIAL_CODE_UNKNOWN");
        const mode = data.activate === true ? "active" : "draft";
        // The real mapping, over the real payload.
        const row = credentialClaimFields(draftOfPayload(data), type, mode);
        savedRows.push(row);
        // And the trigger's two market rules, applied to its output.
        if (row.jurisdiction_code !== type.jurisdictionCode) {
          return boom(
            route,
            `SP_CREDENTIAL_JURISDICTION_MISMATCH: ${type.code} is a ${type.jurisdictionCode} credential, filed as ${row.jurisdiction_code}`,
          );
        }
        if (row.sub_jurisdiction_code !== type.subJurisdictionCode) {
          return boom(
            route,
            type.subJurisdictionCode === null
              ? `SP_SUB_JURISDICTION_NOT_SUPPORTED: ${type.code}`
              : `SP_SUB_JURISDICTION_REQUIRED: ${type.jurisdictionCode} regulates security locally`,
          );
        }
        return ok(route, {
          id: `saved-${savedRows.length}`,
          lifecycleState: mode,
          updatedAt: "2026-09-12T12:00:00.000Z",
        });
      }
      case "getMyProfessionalIdentity":
      case "getMyPassportProfileBasics":
        return ok(route, null);
      case "listCurrentProfessionOptions":
        return ok(route, []);
      case "trackV31FunnelEvent":
        return ok(route, { recorded: false });

      /* ── the admin portal ──────────────────────────────────────────── */
      case "adminWhoAmI":
        return ok(route, { userId: ADMIN_ID, isAdmin: true, isSuperadmin: false });
      case "adminGetUserDetail":
        return ok(route, {
          id: USER_ID,
          email: "pilot-tester@example.test",
          displayName: "Pilottestare (fiktiv)",
          createdAt: "2026-06-01T09:00:00.000Z",
          lastSignInAt: "2026-09-10T09:00:00.000Z",
          emailConfirmedAt: "2026-06-01T09:05:00.000Z",
          isCandidate: true,
          isAdmin: false,
          isSuperadmin: false,
          memberships: [],
        });
      case "adminGetPersonOverview":
        return ok(route, {
          account: {
            id: USER_ID,
            email: "pilot-tester@example.test",
            createdAt: "2026-06-01T09:00:00.000Z",
            lastSignInAt: "2026-09-10T09:00:00.000Z",
            emailConfirmedAt: "2026-06-01T09:05:00.000Z",
            disabled: false,
            disabledUntil: null,
          },
          profile: { displayName: "Pilottestare (fiktiv)", country: "SE", locale: "sv" },
          roles: [],
          subjectId: null,
          memberships: [],
          employment: [],
          applications: [],
          assessments: { assignments: 0, runs: 0, attempts: 0, releasedReports: 0 },
          passport: {
            hasProfile: true,
            claims: 1,
            evidence: 0,
            activeDisclosures: 0,
            verificationRequests: 0,
          },
        });
      case "adminGetUserDeletionImpact":
        return ok(route, {
          userId: USER_ID,
          email: "pilot-tester@example.test",
          deletable: true,
          blockers: [],
          actedOn: [],
          removedOnDelete: {},
          deleted: {},
          detached: {},
          preserved: {},
          hasHistory: false,
          form: "hard_delete",
          alreadyErased: false,
        });
      case "adminListPassportPilotAccess":
        return ok(route, rows);
      case "adminGrantPassportPilotAccess": {
        const data = payloadOf(route);
        adminWrites.push({ fn: name, data });
        const r = rows.find((x) => x.marketPackCode === data.marketPackCode);
        if (r) {
          r.entitlement = {
            active: true,
            grantedAt: "2026-09-12T10:00:00.000Z",
            revokedAt: null,
            note: (data.note as string | undefined) ?? null,
          };
        }
        return ok(route, { ok: true });
      }
      case "adminRevokePassportPilotAccess": {
        const data = payloadOf(route);
        adminWrites.push({ fn: name, data });
        const r = rows.find((x) => x.marketPackCode === data.marketPackCode);
        if (r && r.entitlement) {
          r.entitlement = {
            ...r.entitlement,
            active: false,
            revokedAt: "2026-09-12T11:00:00.000Z",
          };
        }
        return ok(route, { ok: true });
      }
      case "adminCountPendingEmployers":
        return ok(route, 0);
      case "passportReviewCounts":
        return ok(route, { open: 0, clarification: 0, total: 0 });

      /* ── header chrome, on every authenticated page ────────────────── */
      case "countMyAcademyWork":
        return ok(route, { total: 0, actionable: 0 });
      case "countMyReviewQueue":
        return ok(route, 0);
      case "listMyEmployerWorkspaces":
        return ok(route, []);

      default:
        unmatched.push(name);
        return boom(route, `UNSTUBBED_SERVER_FN:${name}`);
    }
  });

  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    if (route.request().url().includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: userId,
          aud: "authenticated",
          email: "three-market@example.test",
          user_metadata: { display_name: "Testperson" },
          app_metadata: {},
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}${pathname}`, { waitUntil: "domcontentloaded" });
}

async function openHarness(page: Page, lang: "sv" | "en") {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("cqrityjob.lang", l);
    } catch {
      /* ignore */
    }
  }, lang);
  const res = await page.goto(`${BASE}/dev/security-passport`, { waitUntil: "domcontentloaded" });
  test.skip(!res || res.status() >= 400, "The prototype route is development-only.");
  await page.locator("#sp-screen").selectOption("threeMarkets");
  await page.locator("#sp-lang").selectOption(lang);
  await expect(page.locator('[data-testid="catalogue-ae-du"]')).toBeVisible();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function shoot(page: Page, name: string, projectName: string) {
  if (!SHOT_DIR) return;
  const dir = path.resolve(SHOT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${projectName}-${name}.png`),
    fullPage: true,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   The fixture screen: counts, search, keyboard, 375px, 200% zoom
   ══════════════════════════════════════════════════════════════════════ */

test.describe("three markets — the fixture screen", () => {
  test.describe.configure({ timeout: 90_000 });

  for (const lang of ["sv", "en"] as const) {
    test(`${lang} · 3/5, 7/6, 1/0 and 15/15, grouped and counted`, async ({ page }, info) => {
      await openHarness(page, lang);

      const counts = async (panel: string) => {
        const p = page.locator(`[data-testid="${panel}"]`);
        const a = await p
          .locator('[data-catalogue-group="appointments"]')
          .getAttribute("data-count");
        const q = await p.locator('[data-catalogue-group="qualifications"]').count();
        const qn = q
          ? await p.locator('[data-catalogue-group="qualifications"]').getAttribute("data-count")
          : "0";
        const total = await p.locator("[data-credential-code]").count();
        return { a: Number(a), q: Number(qn), total };
      };
      expect(await counts("catalogue-se")).toEqual({ a: 3, q: 5, total: 8 });
      expect(await counts("catalogue-gb")).toEqual({ a: 7, q: 6, total: 13 });
      expect(await counts("catalogue-gb-ni")).toEqual({ a: 1, q: 0, total: 1 });
      expect(await counts("catalogue-ae-du")).toEqual({ a: 15, q: 15, total: 30 });

      // Vehicle Immobilisation is Northern Ireland's and nobody else's.
      await expect(
        page.locator('[data-testid="catalogue-gb"] [data-credential-code="UK_SIA_LICENCE_VI"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="catalogue-gb-ni"] [data-credential-code="UK_SIA_LICENCE_VI"]'),
      ).toHaveCount(1);

      // Only the two large catalogues get a search field.
      await expect(page.locator('[data-testid="catalogue-se"] input[type="search"]')).toHaveCount(
        0,
      );
      await expect(
        page.locator('[data-testid="catalogue-gb-ni"] input[type="search"]'),
      ).toHaveCount(0);
      await expect(page.locator('[data-testid="catalogue-gb"] input[type="search"]')).toHaveCount(
        1,
      );
      await expect(
        page.locator('[data-testid="catalogue-ae-du"] input[type="search"]'),
      ).toHaveCount(1);

      // The market cards: Sweden available, the two pilot markets under review.
      const pub = page.locator('[data-testid="markets-public"]');
      await expect(pub.locator("[data-market-card]")).toHaveCount(3);
      await expect(pub.locator('[data-market-submarket="GB-NI"]')).toHaveCount(1);
      // Sweden is this holder's market and usable; the two pilot markets are not.
      await expect(pub.locator('[data-market-card="SE"] [data-market-action="add"]')).toHaveCount(
        1,
      );
      await expect(pub.locator('[data-market-card="GB"] [data-market-action="add"]')).toHaveCount(
        0,
      );
      await expect(
        pub.locator('[data-market-card="AE-DU"] [data-market-action="add"]'),
      ).toHaveCount(0);
      await expect(
        page.locator(
          '[data-testid="markets-pilot"] [data-market-card="GB"] [data-market-action="add"]',
        ),
      ).toHaveCount(1);
      await expect(
        page.locator('[data-testid="markets-pilot"] [data-market-pilot-note]'),
      ).toHaveCount(1);
      // A Northern Ireland pilot holder: the UK card's action is for GB-NI,
      // ordinary Great Britain stays closed, and no "choose" is offered there.
      const ni = page.locator('[data-testid="markets-pilot-ni"] [data-market-card="GB"]');
      await expect(ni).toHaveAttribute("data-holder-access", "closed");
      await expect(ni.locator('[data-market-action="add"]')).toHaveAttribute(
        "data-market-action-for",
        "GB-NI",
      );
      await expect(ni.locator('[data-market-action="choose"]')).toHaveCount(0);
      await expect(
        ni.locator('[data-market-submarket="GB-NI"] [data-market-pilot-note]'),
      ).toHaveCount(1);

      expect(pageErrors).toEqual([]);
      await shoot(page, `${lang}-harness-three-markets`, info.project.name);
    });
  }

  test("search narrows Dubai's thirty without losing the selection", async ({ page }) => {
    await openHarness(page, "sv");
    const panel = page.locator('[data-testid="catalogue-select"]');
    await expect(panel.locator('[data-selected="true"]')).toHaveAttribute(
      "data-credential-code",
      "AE_DU_SIRA_CARD_GUARD",
    );
    const search = panel.getByRole("searchbox");
    await search.fill("systems");
    // 3 cards + 3 courses match, and the selected guard card is pinned.
    await expect(panel.locator("[data-credential-code]")).toHaveCount(7);
    await expect(panel.locator('[data-selected="true"]')).toHaveCount(1);
    await expect(
      panel.getByRole("radio", { name: /^SIRA Security Cadre Card — Security Guard\s/ }),
    ).toBeChecked();

    await search.fill("zzz");
    await expect(panel.locator("[data-credential-code]")).toHaveCount(1);
    await expect(panel.locator('[data-catalogue-status="no-match"]')).toHaveCount(0);
    await expect(panel.locator('[data-selected="true"]')).toHaveCount(1);

    await panel.getByRole("button", { name: /Rensa sökningen/ }).click();
    await expect(panel.locator("[data-credential-code]")).toHaveCount(30);
  });

  test("a keyboard user can reach and choose a credential", async ({ page }) => {
    await openHarness(page, "en");
    const gb = page.locator('[data-testid="catalogue-gb"]');
    await gb.locator('[data-credential-code="UK_SIA_LICENCE_SG"]').focus();
    await expect(gb.locator('[data-credential-code="UK_SIA_LICENCE_SG"]')).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(gb.locator('[data-credential-code="UK_SIA_LICENCE_DS"]')).toBeFocused();

    // Radios: arrow keys move the choice within the group.
    const panel = page.locator('[data-testid="catalogue-select"]');
    await panel
      .getByRole("radio", { name: /^SIRA Security Cadre Card — Security Guard\s/ })
      .focus();
    await page.keyboard.press("ArrowDown");
    await expect(panel.locator('[data-selected="true"]')).toHaveAttribute(
      "data-credential-code",
      "AE_DU_SIRA_CARD_MONEY_TRANSPORT",
    );
  });

  test("no horizontal overflow at this width", async ({ page }) => {
    await openHarness(page, "sv");
    const overflow = await horizontalOverflow(page);
    expect(overflow, `the page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  });

  test("no horizontal overflow at 200% zoom", async ({ page }, info) => {
    // Browser zoom on a desktop window: 1280px at 200% is a 640px layout.
    // A phone is already at its own scale, so this is a desktop concern.
    test.skip(info.project.name !== "chromium", "200% zoom is a desktop concern.");
    await openHarness(page, "sv");
    await page.evaluate(() => {
      (document.documentElement.style as unknown as { zoom: string }).zoom = "2";
    });
    await page.waitForTimeout(250);
    const overflow = await horizontalOverflow(page);
    expect(overflow, `at 200% zoom the page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(
      1,
    );
  });

  test("every action meets the 44px minimum", async ({ page }, info) => {
    test.skip(info.project.name === "chromium", "Touch targets are a mobile concern.");
    await openHarness(page, "sv");
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("[data-credential-code], [data-market-action]")]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => el.getBoundingClientRect().height)
        .filter((h) => h < 44),
    );
    expect(small).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   The write path — a pilot credential can actually be SAVED
   ══════════════════════════════════════════════════════════════════════

   The catalogues became visible and selectable, the right credential was
   preselected from `?code=`, and then every save failed with "Något gick
   fel. Försök igen."

   Choosing a credential settles which regulated market the entry belongs
   to. That assignment lived only in the radio button's onChange, so a
   holder arriving from the catalogue kept the empty draft's "SE" under a
   heading that said Great Britain or Dubai — and the write path wrote the
   DRAFT's country and never wrote a sub-jurisdiction at all.

   Every scenario below asserts THE PAYLOAD the browser sent and THE ROW the
   server's own mapping makes of it — see `savedRows`, which is computed by
   `credentialClaimFields` and refused by the same two market rules the
   database trigger applies. None of them passes on a stub that merely says
   "saved".
   ══════════════════════════════════════════════════════════════════════ */

test.describe("three markets — the write path", () => {
  test.describe.configure({ timeout: 120_000 });

  /** Fill what the taxonomy asks of this credential, by field id so the
   *  scenario reads the same in both languages. */
  async function fill(page: Page, opts: { issuer?: string; validUntil?: string; scope?: string }) {
    if (opts.issuer !== undefined) await page.locator("#sp-cred-issuerName").fill(opts.issuer);
    if (opts.validUntil !== undefined) {
      await page.locator("#sp-cred-validUntil").fill(opts.validUntil);
    }
    if (opts.scope !== undefined) {
      await page.locator("#sp-cred-authorisationScope").fill(opts.scope);
    }
  }

  const noGenericError = async (page: Page) => {
    // The sentence the holder actually met. A successful write must not
    // produce it, and neither must a successful draft save.
    await expect(page.getByText(/Något gick fel|Something went wrong/)).toHaveCount(0);
  };

  test("A · THE DEFECT: a British licence reached by ?code= saves, in GB", async ({ page }) => {
    await mount(
      page,
      { availability: AVAIL.gbPilot, work: { jurisdictionCode: "GB", subJurisdictionCode: null } },
      "sv",
      "/passport/credentials/new?code=UK_SIA_LICENCE_DS",
    );
    await expect(
      page.getByRole("radio", { name: /^SIA Licence — Door Supervision\s/ }),
    ).toBeChecked({ timeout: 30_000 });
    await fill(page, { issuer: "Security Industry Authority", validUntil: "2030-01-01" });

    // ── Save draft ───────────────────────────────────────────────────
    await page.getByRole("button", { name: "Spara utkast" }).click();
    await expect.poll(() => savedRows.length, { timeout: 30_000 }).toBe(1);
    // The PAYLOAD: the draft the browser sent carried the credential's own
    // market, not `emptyCredentialDraft()`'s "SE". This is the assertion the
    // defect fails.
    expect(savedPayloads[0]!.jurisdictionCode).toBe("GB");
    // The ROW the server mapping makes of it, which the trigger judges.
    expect(savedRows[0]).toMatchObject({
      credential_code: "UK_SIA_LICENCE_DS",
      jurisdiction_code: "GB",
      sub_jurisdiction_code: null,
      lifecycle_state: "draft",
    });
    await noGenericError(page);

    // ── Add to the Passport ──────────────────────────────────────────
    await page.getByRole("button", { name: "Lägg till i passet" }).click();
    await expect.poll(() => savedRows.length, { timeout: 30_000 }).toBe(2);
    expect(savedRows[1]).toMatchObject({
      credential_code: "UK_SIA_LICENCE_DS",
      jurisdiction_code: "GB",
      sub_jurisdiction_code: null,
      lifecycle_state: "active",
    });
    await noGenericError(page);
    expect(pageErrors).toEqual([]);
    expect(unmatched.filter((u) => u !== "getEntryDetail")).toEqual([]);
  });

  test("A2 · and the saved British licence is there after a reload", async ({ page }) => {
    // The stored row, re-read: the entry exists in the holder's Passport,
    // under Great Britain, with no emirate.
    await mount(
      page,
      {
        availability: AVAIL.gbPilot,
        work: { jurisdictionCode: "GB", subJurisdictionCode: null },
        claims: [
          claim({
            id: "c-gb-saved",
            credentialCode: "UK_SIA_LICENCE_DS",
            titleSv: "SIA Licence — Door Supervision",
            titleEn: "SIA Licence — Door Supervision",
            jurisdictionCode: "GB",
            subJurisdictionCode: null,
            validUntil: "2030-01-01",
          }),
        ],
      },
      "sv",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open_pilot", { timeout: 30_000 });
    await expect(section).toHaveAttribute("data-market", "GB");
    await expect(section.getByText("SIA Licence — Door Supervision").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("B · THE DEFECT: a Dubai cadre card reached by ?code= saves, in AE / AE-DU", async ({
    page,
  }) => {
    await mount(
      page,
      {
        availability: AVAIL.duPilot,
        work: { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
      },
      "en",
      "/passport/credentials/new?code=AE_DU_SIRA_CARD_GUARD",
    );
    await expect(
      page.getByRole("radio", { name: /^SIRA Security Cadre Card — Security Guard\s/ }),
    ).toBeChecked({ timeout: 30_000 });
    // A cadre card asks for all three, the scope included.
    await fill(page, {
      issuer: "Security Industry Regulatory Agency",
      validUntil: "2030-01-01",
      scope: "Fictional security company",
    });

    await page.getByRole("button", { name: "Add to my Passport" }).click();
    await expect.poll(() => savedRows.length, { timeout: 30_000 }).toBe(1);
    // The payload carries Dubai's country — never "SE" — and the row the
    // server builds carries the EMIRATE, which the old write path never
    // wrote at all.
    expect(savedPayloads[0]!.jurisdictionCode).toBe("AE");
    expect(savedRows[0]).toMatchObject({
      credential_code: "AE_DU_SIRA_CARD_GUARD",
      jurisdiction_code: "AE",
      sub_jurisdiction_code: "AE-DU",
      authorisation_scope: "Fictional security company",
      lifecycle_state: "active",
    });
    await noGenericError(page);
    expect(pageErrors).toEqual([]);
  });

  test("B2 · and the saved Dubai card is on the Passport after a reload", async ({ page }) => {
    await mount(
      page,
      {
        availability: AVAIL.duPilot,
        work: { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
        claims: [
          claim({
            id: "c-du-saved",
            credentialCode: "AE_DU_SIRA_CARD_GUARD",
            titleSv: "SIRA Security Cadre Card — Security Guard",
            titleEn: "SIRA Security Cadre Card — Security Guard",
            jurisdictionCode: "AE",
            subJurisdictionCode: "AE-DU",
            authorisationScope: "Fictional security company",
            validUntil: "2030-01-01",
          }),
        ],
      },
      "en",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open_pilot", { timeout: 30_000 });
    await expect(section).toHaveAttribute("data-market", "AE-DU");
    await expect(
      section.getByText("SIRA Security Cadre Card — Security Guard").first(),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("C · the same holds for a credential chosen by hand, with no ?code=", async ({ page }) => {
    // Great Britain, chosen from the form's own catalogue.
    await mount(
      page,
      { availability: AVAIL.gbPilot, work: { jurisdictionCode: "GB", subJurisdictionCode: null } },
      "sv",
      "/passport/credentials/new",
    );
    await page
      .getByRole("radio", { name: /^SIA Licence — Door Supervision\s/ })
      .check({ force: true, timeout: 30_000 });
    await fill(page, { issuer: "Security Industry Authority", validUntil: "2030-01-01" });
    await page.getByRole("button", { name: "Lägg till i passet" }).click();
    await expect.poll(() => savedRows.length, { timeout: 30_000 }).toBe(1);
    expect(savedPayloads[0]!.jurisdictionCode).toBe("GB");
    expect(savedRows[0]).toMatchObject({
      credential_code: "UK_SIA_LICENCE_DS",
      jurisdiction_code: "GB",
      sub_jurisdiction_code: null,
    });
    await noGenericError(page);

    // Dubai, chosen from the form's own catalogue — and then CHANGED to a
    // course, which is the path that used to leave the previous choice's
    // fields behind.
    await mount(
      page,
      {
        availability: AVAIL.duPilot,
        work: { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
      },
      "sv",
      "/passport/credentials/new",
    );
    await page
      .getByRole("radio", { name: /^SIRA Security Cadre Card — Security Guard\s/ })
      .check({ force: true, timeout: 30_000 });
    await fill(page, { issuer: "SIRA", validUntil: "2030-01-01", scope: "Fiktivt uppdrag" });
    await page.getByRole("radio", { name: /^SIRA Security Guard course\s/ }).check({ force: true });
    await page.getByRole("button", { name: "Lägg till i passet" }).click();
    await expect.poll(() => savedRows.length, { timeout: 30_000 }).toBe(1);
    expect(savedRows[0]).toMatchObject({
      credential_code: "AE_DU_SIRA_GUARD_COURSE",
      jurisdiction_code: "AE",
      sub_jurisdiction_code: "AE-DU",
      // The card's expiry and scope went with the card.
      valid_until: null,
      authorisation_scope: null,
    });
    await noGenericError(page);
    expect(pageErrors).toEqual([]);
  });

  test("E · a Swedish credential is untouched by any of this", async ({ page }) => {
    await mount(
      page,
      { availability: AVAIL.se, work: { jurisdictionCode: "SE", subJurisdictionCode: null } },
      "sv",
      "/passport/credentials/new?code=OV",
    );
    await expect(page.getByRole("radio", { name: /^Ordningsvaktsförordnande\s/ })).toBeChecked({
      timeout: 30_000,
    });
    await fill(page, { issuer: "Fiktiva Polismyndigheten", validUntil: "2029-06-30" });
    await page.getByRole("button", { name: "Lägg till i passet" }).click();
    await expect.poll(() => savedRows.length, { timeout: 30_000 }).toBe(1);
    expect(savedPayloads[0]!.jurisdictionCode).toBe("SE");
    expect(savedRows[0]).toMatchObject({
      credential_code: "OV",
      jurisdiction_code: "SE",
      sub_jurisdiction_code: null,
    });
    await noGenericError(page);
    expect(pageErrors).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   The real routes
   ══════════════════════════════════════════════════════════════════════ */

test.describe("three markets — the real routes", () => {
  test.describe.configure({ timeout: 120_000 });

  test("THE DEFECT: an entitled GB pilot holder gets the 13 governed choices on My information", async ({
    page,
  }, info) => {
    await mount(
      page,
      { availability: AVAIL.gbPilot, work: { jurisdictionCode: "GB", subJurisdictionCode: null } },
      "sv",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open_pilot", { timeout: 30_000 });
    await expect(section.locator('[data-testid="market-pilot-status"]')).toBeVisible();
    await expect(section.locator("[data-credential-code]")).toHaveCount(13);
    await expect(section.locator('[data-catalogue-group="appointments"]')).toHaveAttribute(
      "data-count",
      "7",
    );
    await expect(section.locator('[data-catalogue-group="qualifications"]')).toHaveAttribute(
      "data-count",
      "6",
    );
    expect(unmatched).toEqual([]);
    await shoot(page, "sv-information-gb-pilot", info.project.name);

    // Choosing one lands on the form with that credential preselected.
    await section.locator('[data-credential-code="UK_SIA_LICENCE_DS"]').click();
    await expect(page).toHaveURL(/\/passport\/credentials\/new\?code=UK_SIA_LICENCE_DS/);
    await expect(
      page.getByRole("radio", { name: /^SIA Licence — Door Supervision\s/ }),
    ).toBeChecked({
      timeout: 30_000,
    });
    await expect(page.getByLabel(/Gäller till \(obligatoriskt/)).toBeVisible();
    await shoot(page, "sv-form-gb-licence-preselected", info.project.name);
  });

  test("a Dubai pilot holder gets 30 choices, 15/15, with a search field", async ({
    page,
  }, info) => {
    await mount(
      page,
      {
        availability: AVAIL.duPilot,
        work: { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
      },
      "en",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open_pilot", { timeout: 30_000 });
    await expect(section.locator("[data-credential-code]")).toHaveCount(30);
    await expect(section.locator('[data-catalogue-group="appointments"]')).toHaveAttribute(
      "data-count",
      "15",
    );
    await expect(section.locator('[data-catalogue-group="qualifications"]')).toHaveAttribute(
      "data-count",
      "15",
    );
    await expect(section.getByRole("searchbox")).toBeVisible();
    await expect(section.locator("h2")).toContainText("Dubai");
    await shoot(page, "en-information-dubai-pilot", info.project.name);

    // A cadre card asks for issuer, expiry and scope; a course asks for none of the last two.
    await section.locator('[data-credential-code="AE_DU_SIRA_CARD_GUARD"]').click();
    await expect(
      page.getByRole("radio", { name: /^SIRA Security Cadre Card — Security Guard\s/ }),
    ).toBeChecked({ timeout: 30_000 });
    await expect(page.getByLabel(/Valid until \(required/)).toBeVisible();
    await expect(
      page.getByLabel(/Scope of authorisation|Authorisation scope|scope/i).first(),
    ).toBeVisible();
    await page.getByRole("radio", { name: /^SIRA Security Guard course\s/ }).check({ force: true });
    await expect(page.getByLabel(/Valid until/)).toHaveCount(0);
    await shoot(page, "en-form-dubai-course-selected", info.project.name);
  });

  test("Northern Ireland shows Vehicle Immobilisation alone", async ({ page }) => {
    await mount(
      page,
      {
        availability: AVAIL.niPilot,
        work: { jurisdictionCode: "GB", subJurisdictionCode: "GB-NI" },
      },
      "sv",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market", "GB-NI", { timeout: 30_000 });
    await expect(section.locator("[data-credential-code]")).toHaveCount(1);
    await expect(section.locator('[data-credential-code="UK_SIA_LICENCE_VI"]')).toHaveCount(1);
    await expect(section.locator('[data-catalogue-group="qualifications"]')).toHaveCount(0);
    await expect(section.locator("h2")).toContainText("Nordirland");
  });

  test("a holder without pilot access sees the UK under review and nothing selectable", async ({
    page,
  }) => {
    await mount(
      page,
      {
        availability: AVAIL.gbPending,
        work: { jurisdictionCode: "GB", subJurisdictionCode: null },
      },
      "sv",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "pending_review", {
      timeout: 30_000,
    });
    await expect(section.locator("[data-credential-code]")).toHaveCount(0);
    await expect(section.locator('[data-testid="market-closed-notice"]')).toBeVisible();
  });

  test("Sweden still offers its eight, and a failed catalogue read says so", async ({ page }) => {
    await mount(page, { availability: AVAIL.se }, "sv", "/passport/information");
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open", { timeout: 30_000 });
    await expect(section.locator("[data-credential-code]")).toHaveCount(8);
    await expect(section.locator('[data-testid="market-pilot-status"]')).toHaveCount(0);

    await mount(page, { availabilityFails: true }, "sv", "/passport/information");
    // The work-country control survives, and the catalogue's failure is in
    // words: a failed read is drawn AS a failed read with a retry — never as
    // "no work country", which would tell a holder who named Sweden that
    // they had not.
    await expect(page.locator("#sp-work-country")).toBeVisible({ timeout: 30_000 });
    const failed = page.locator('[data-testid="market-credential-section"]');
    await expect(failed).toHaveAttribute("data-market-read", "failed", { timeout: 30_000 });
    await expect(failed).not.toHaveAttribute("data-market-state", "no_work_country");
    await expect(failed.locator('[data-testid="market-read-failed"]')).toBeVisible();
    await expect(failed.locator('[data-testid="market-read-retry"]')).toBeVisible();
    await expect(failed.locator('[data-testid="market-closed-notice"]')).toHaveCount(0);
    await expect(failed.locator("[data-credential-code]")).toHaveCount(0);
  });

  test("the market read renders loading, then failure with a retry, never 'no work country'", async ({
    page,
  }) => {
    // The first read of Sweden's rules is slow, then fails; a retry succeeds.
    let calls = 0;
    await mount(
      page,
      {
        availabilityByMarket: { SE: { body: AVAIL.se, delayMs: 1200 } },
        work: { jurisdictionCode: "SE", subJurisdictionCode: null },
      },
      "en",
      "/passport/information",
    );
    // Second layer on the same route: the first availability answer breaks.
    await page.route("**/_serverFn/**", async (route) => {
      if (
        exportOf(route.request().url()) === "getRegulatedCredentialAvailability" &&
        calls++ === 0
      ) {
        await new Promise((r) => setTimeout(r, 600));
        return boom(route, "availability failed");
      }
      return route.fallback();
    });
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-read", "loading");
    await expect(section.locator('[data-testid="market-read-loading"]')).toBeVisible();
    // Loading is NOT "no work country": the holder named Sweden.
    await expect(section).not.toHaveAttribute("data-market-state", "no_work_country");
    await expect(section.locator('[data-testid="market-closed-notice"]')).toHaveCount(0);

    await expect(section).toHaveAttribute("data-market-read", "failed", { timeout: 10_000 });
    await expect(section.locator('[data-testid="market-read-failed"]')).toBeVisible();
    await expect(section.locator('[data-testid="market-closed-notice"]')).toHaveCount(0);
    await expect(section.locator("[data-credential-code]")).toHaveCount(0);

    await section.locator('[data-testid="market-read-retry"]').click();
    await expect(section).toHaveAttribute("data-market-read", "loading");
    await expect(section).toHaveAttribute("data-market-read", "ready", { timeout: 10_000 });
    await expect(section).toHaveAttribute("data-market-state", "open");
    await expect(section.locator("[data-credential-code]")).toHaveCount(8);
    expect(pageErrors).toEqual([]);
  });

  test("REGRESSION: changing Sweden to Great Britain never shows a Swedish option under the new market, even when Sweden's answer arrives last", async ({
    page,
  }) => {
    // Sweden's rules answer SLOWLY (3s); Great Britain's answer fast (200ms).
    // The holder changes country while Sweden's first read is still open, so
    // the reads settle out of order: GB first, then the stale Swedish one.
    await mount(
      page,
      {
        availabilityByMarket: {
          SE: { body: AVAIL.se, delayMs: 3000 },
          GB: { body: AVAIL.gbPilot, delayMs: 200 },
        },
        work: { jurisdictionCode: "SE", subJurisdictionCode: null },
      },
      "sv",
      "/passport/information",
    );
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-read", "loading");

    await page.locator("#sp-work-country").selectOption("GB");
    await page.getByRole("button", { name: "Spara arbetsland" }).click();

    // While Great Britain's catalogue loads: the section is loading, names
    // no Swedish option, and offers nothing selectable.
    await expect(section).toHaveAttribute("data-market-read", "loading");
    await expect(section.locator('[data-credential-code="VU1"]')).toHaveCount(0);
    await expect(section.locator("[data-credential-code]")).toHaveCount(0);

    // Great Britain settles: 13 governed choices, the pilot status line.
    await expect(section).toHaveAttribute("data-market-read", "ready", { timeout: 10_000 });
    await expect(section).toHaveAttribute("data-market", "GB");
    await expect(section.locator("[data-credential-code]")).toHaveCount(13);
    await expect(section.locator('[data-credential-code="VU1"]')).toHaveCount(0);

    // Sweden's stale answer lands now (3s after mount). It must lose: still
    // Great Britain, still 13, still no VU1, no flicker back.
    await page.waitForTimeout(3500);
    await expect(section).toHaveAttribute("data-market", "GB");
    await expect(section.locator("[data-credential-code]")).toHaveCount(13);
    await expect(section.locator('[data-credential-code="VU1"]')).toHaveCount(0);
    await expect(section.locator('[data-testid="market-pilot-status"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  for (const lang of ["sv", "en"] as const) {
    test(`${lang} · the overview shows one Passport with records from three markets and three market cards`, async ({
      page,
    }, info) => {
      await mount(
        page,
        {
          claims: THREE_MARKET_CLAIMS,
          markets: markets({ work: "GB", pilot: ["GB"] }),
          work: { jurisdictionCode: "GB", subJurisdictionCode: null },
        },
        lang,
        "/passport",
      );
      await expect(page.locator("[data-passport-workspace]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-market-overview="ready"]')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-market-card]")).toHaveCount(3);
      await expect(page.locator('[data-market-card="GB"]')).toHaveAttribute(
        "data-holder-access",
        "pilot",
      );
      await expect(
        page.locator('[data-market-card="GB"] [data-market-action="add"]'),
      ).toBeVisible();
      await expect(
        page.locator('[data-market-card="AE-DU"] [data-market-action="choose"]'),
      ).toBeVisible();
      await expect(page.locator("[data-market-headline]")).toContainText(
        lang === "sv" ? "Ett Security Passport" : "One Security Passport",
      );
      // All four records are on the page, each under its own name.
      for (const id of ["c-se-ov", "c-gb-ds", "c-gb-qds", "c-du-guard"]) {
        await expect(page.locator(`[data-merit-row="${id}"]`)).toBeVisible();
      }
      expect(unmatched).toEqual([]);
      expect(pageErrors).toEqual([]);
      await shoot(page, `${lang}-overview-three-markets`, info.project.name);
    });
  }

  test("a failed market read costs the cards and nothing else", async ({ page }) => {
    await mount(page, { marketsFail: true }, "sv", "/passport");
    await expect(page.locator("[data-passport-workspace]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-market-overview="failed"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-market-overview="failed"] [role="alert"]')).toContainText(
      /kunde inte hämtas/,
    );
    await expect(page.locator("[data-market-card]")).toHaveCount(0);
  });

  for (const lang of ["sv", "en"] as const) {
    test(`${lang} · an administrator grants GB pilot access, then revokes it after a confirmation`, async ({
      page,
    }, info) => {
      const rows = pilotRows();
      await mount(page, { pilotRows: rows }, lang, `/admin/users/${USER_ID}`, "admin");
      const section = page.locator("[data-passport-pilot-access]");
      await expect(section).toHaveAttribute("data-passport-pilot-access", "ready", {
        timeout: 30_000,
      });
      await expect(section.locator("[data-pilot-market]")).toHaveCount(3);
      await expect(section.locator('[data-pilot-market="GB"]')).toHaveAttribute(
        "data-pilot-state",
        "none",
      );
      await shoot(page, `${lang}-admin-pilot-access-before`, info.project.name);

      // Grant, with a short internal note.
      const gb = section.locator('[data-pilot-market="GB"]');
      await gb.getByLabel(/Intern anteckning|Internal note/).fill("UAT: SIA-katalogen");
      await gb.locator('[data-pilot-action="grant"]').click();
      await expect(gb).toHaveAttribute("data-pilot-state", "active", { timeout: 30_000 });
      expect(adminWrites).toEqual([
        {
          fn: "adminGrantPassportPilotAccess",
          data: { userId: USER_ID, marketPackCode: "GB", note: "UAT: SIA-katalogen" },
        },
      ]);
      // One market, one user: nothing else was granted.
      await expect(section.locator('[data-pilot-market="GB-NI"]')).toHaveAttribute(
        "data-pilot-state",
        "none",
      );
      await expect(section.locator('[data-pilot-market="AE-DU"]')).toHaveAttribute(
        "data-pilot-state",
        "none",
      );
      await shoot(page, `${lang}-admin-pilot-access-granted`, info.project.name);

      // Revoke: a dialog first, then the write.
      await gb.locator('[data-pilot-action="revoke"]').click();
      const dialog = page.locator("[data-pilot-revoke-dialog]");
      await expect(dialog).toBeVisible();
      expect(adminWrites).toHaveLength(1);
      await shoot(page, `${lang}-admin-pilot-access-revoke-dialog`, info.project.name);
      await dialog.locator('[data-pilot-action="confirm-revoke"]').click();
      await expect(gb).toHaveAttribute("data-pilot-state", "revoked", { timeout: 30_000 });
      expect(adminWrites[1]).toEqual({
        fn: "adminRevokePassportPilotAccess",
        data: { userId: USER_ID, marketPackCode: "GB" },
      });
      await expect(gb.locator('[data-pilot-action="grant"]')).toBeVisible();
      expect(unmatched).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
});

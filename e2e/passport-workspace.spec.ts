// The REAL /passport route, in a browser, once the first run is over.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/passport-workspace-check.tsx renders the workspace to markup from
// plain objects. It cannot see a route, a link resolving to a real URL, a
// section that survives one read failing, a horizontal scrollbar at 375px,
// a focus ring, or a 200% zoom. All of those are what this file is for.
//
// ── HOW THE BACKEND IS STUBBED ─────────────────────────────────────────
//
// Every server-function call is an HTTP request to /_serverFn/<id>, where
// <id> is base64url JSON naming the module and the export. The stub decodes
// it and answers from a fixture the scenario chose. A Supabase session is
// planted in localStorage the way supabase-js stores one. Nothing reaches a
// real database, so these scenarios run on any machine and in CI.
//
// An UNSTUBBED server function is answered with a 500 and recorded, so a
// scenario fails loudly on a read it forgot rather than passing quietly.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/passport-workspace.spec.ts
//
// Set PASSPORT_SHOTS=<dir> to also write the review screenshots (1440 and
// 375, Swedish and English, one per scenario) into that directory.

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SUPABASE_REF = process.env.E2E_SUPABASE_REF ?? "wrygicdfxwjnrugduxnt";
const USER_ID = "00000000-0000-4000-8000-0000000000f1";

/** Where review screenshots go, when they are asked for. */
const SHOT_DIR = process.env.PASSPORT_SHOTS ?? "";
/** Which side of the change these shots belong to. */
const SHOT_TAG = process.env.PASSPORT_SHOTS_TAG ?? "after";

/* ------------------------------------------------------------------ */
/* Fixtures — rows in the shape getMyPassport returns                  */
/* ------------------------------------------------------------------ */

type Claim = Record<string, unknown>;
type Period = Record<string, unknown>;
type Request = Record<string, unknown>;

function claim(over: Partial<Claim> = {}): Claim {
  return {
    id: "c-1",
    claimType: "certification",
    credentialCode: "INTL_ASIS_CPP",
    skillCode: null,
    skillLevel: null,
    titleSv: "Certified Protection Professional (CPP)",
    titleEn: "Certified Protection Professional (CPP)",
    issuerName: "ASIS International",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2024-05-02",
    validFrom: "2024-05-02",
    validUntil: null,
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

function period(over: Partial<Period> = {}): Period {
  return {
    id: "p-1",
    employerName: "Nordic Security AB",
    roleTitle: "Väktare",
    professionSlug: null,
    jurisdictionCode: "SE",
    employmentType: "full_time",
    fteFraction: 1,
    securityRelevance: "primary",
    securityFraction: 1,
    startedOn: "2023-02-01",
    endedOn: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

function request(over: Partial<Request> = {}): Request {
  return {
    id: "r-1",
    claimId: null,
    periodId: null,
    kind: "cqrityjob_review",
    status: "pending",
    submittedAt: "2026-09-01T09:00:00.000Z",
    decidedAt: null,
    method: null,
    holderMessage: null,
    validFrom: null,
    validUntil: null,
    targetEmployerId: null,
    ...over,
  };
}

interface Scenario {
  readonly claims: readonly Claim[];
  readonly periods: readonly Period[];
  readonly requests: readonly Request[];
  /** The verification read fails. The page must survive it and say so. */
  readonly verificationFails?: boolean;
  /** The verification read is SLOW but healthy. A page that announces a
   *  failure here is announcing one that has not happened. */
  readonly verificationDelayMs?: number;
  /** The Passport read fails. The only failure with no page. */
  readonly passportFails?: boolean;
  /** No profile row and no merit: the first run owns this holder. */
  readonly noProfile?: boolean;
}

/** Just after the first run: one merit, recorded by the holder, nothing else. */
const JUST_ADDED: Scenario = {
  claims: [claim()],
  periods: [period()],
  requests: [],
};

/** A document CQrityjob reviewed. Documented — never source-confirmed. */
const DOCUMENTED: Scenario = {
  claims: [
    claim({
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
      verifiedOn: "2026-06-01",
    }),
  ],
  periods: [period()],
  requests: [],
};

/** An employer confirming an employment they were party to. Source-confirmed. */
const SOURCE_CONFIRMED: Scenario = {
  claims: [claim()],
  periods: [
    period({
      assertionLevel: "verified",
      verifierName: "Nordic Security AB",
      verificationMethod: "employer_confirmation",
      verifiedOn: "2026-07-15",
    }),
  ],
  requests: [],
};

/** A review is open. Somebody else is acting; the holder waits. */
const IN_REVIEW: Scenario = {
  claims: [claim()],
  periods: [period()],
  requests: [request({ claimId: "c-1", status: "pending" })],
};

/** A reviewer asked the holder a question. The one state that is a task. */
const CLARIFICATION: Scenario = {
  claims: [claim()],
  periods: [period()],
  requests: [
    request({
      claimId: "c-1",
      status: "clarification_requested",
      holderMessage: "Vi behöver ett intyg som visar kursens omfattning.",
    }),
  ],
};

/** History: a verified credential whose lifecycle has moved on. */
const ARCHIVED: Scenario = {
  claims: [
    claim({
      id: "c-old",
      titleSv: "Ordningsvaktsförordnande",
      titleEn: "Public order officer appointment",
      issuerName: "Polismyndigheten",
      lifecycleState: "expired",
      validUntil: "2025-03-31",
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
      verifiedOn: "2022-04-01",
    }),
  ],
  periods: [period()],
  requests: [],
};

/** Several states at once, which is what a real Passport looks like. */
const MIXED: Scenario = {
  claims: [
    claim({
      id: "c-doc",
      titleSv: "Väktarutbildning grundkurs",
      titleEn: "Security officer foundation course",
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
      verifiedOn: "2026-06-01",
    }),
    claim({
      id: "c-open",
      titleSv: "Skyddsvaktsutbildning",
      titleEn: "Protective security training",
      issuerName: "Försvarsmakten",
      issuedOn: "2025-09-12",
    }),
    claim({
      id: "c-ask",
      titleSv: "Hjärt- och lungräddning",
      titleEn: "Cardiopulmonary resuscitation",
      issuerName: "Röda Korset",
      issuedOn: "2026-01-20",
    }),
    claim({
      id: "c-draft",
      titleSv: "Väktarutbildning del 2",
      titleEn: "Security officer course part 2",
      issuerName: "BYA",
      lifecycleState: "draft",
      issuedOn: null,
    }),
    claim({
      id: "c-old",
      titleSv: "Ordningsvaktsförordnande",
      titleEn: "Public order officer appointment",
      issuerName: "Polismyndigheten",
      lifecycleState: "expired",
      validUntil: "2025-03-31",
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
      verifiedOn: "2022-04-01",
    }),
  ],
  periods: [
    period({
      assertionLevel: "verified",
      verifierName: "Nordic Security AB",
      verificationMethod: "employer_confirmation",
      verifiedOn: "2026-07-15",
    }),
    period({
      id: "p-2",
      employerName: "Väktarbolaget Syd AB",
      roleTitle: "Ordningsvakt",
      startedOn: "2021-03-01",
      endedOn: "2023-01-31",
    }),
  ],
  requests: [
    request({ id: "r-open", claimId: "c-open", status: "pending" }),
    request({
      id: "r-ask",
      claimId: "c-ask",
      status: "clarification_requested",
      holderMessage: "Vi behöver ett intyg som visar kursens omfattning.",
    }),
  ],
};

/** The verification read did not answer. Nothing may be claimed about it. */
const VERIFICATION_DOWN: Scenario = { ...MIXED, verificationFails: true };

/**
 * THE FAIL-CLOSED REGRESSION.
 *
 * One merit that really is pending, one with a reviewer's question against
 * it, one ordinary self-reported merit — and then the verification read
 * fails. Before the correction the first two came back from the shared
 * labeller as `added_by_you` (the empty review sets said nothing was open)
 * and sat among the ordinary merits under "Aktuella meriter".
 */
const REVIEW_STATE_DOWN: Scenario = {
  claims: [
    claim({ id: "c-pending", titleSv: "Under granskning", titleEn: "Under review" }),
    claim({ id: "c-ask", titleSv: "Har en fråga", titleEn: "Has a question" }),
    claim({ id: "c-plain", titleSv: "Vanlig uppgift", titleEn: "Ordinary entry" }),
  ],
  periods: [],
  requests: [
    request({ id: "r-p", claimId: "c-pending", status: "pending" }),
    request({ id: "r-a", claimId: "c-ask", status: "clarification_requested" }),
  ],
  verificationFails: true,
};

/** The same three merits with the read answering, as the control. */
const REVIEW_STATE_UP: Scenario = { ...REVIEW_STATE_DOWN, verificationFails: false };

/** A decision that went against the holder, and nothing else outstanding. */
const REJECTED: Scenario = {
  claims: [claim()],
  periods: [period()],
  requests: [
    request({
      claimId: "c-1",
      status: "rejected",
      decidedAt: "2026-09-05T09:00:00.000Z",
      holderMessage: "Underlaget visar inte kursens omfattning.",
    }),
  ],
};

/** Two open questions: no single entry to open, so the region is the target. */
const TWO_QUESTIONS: Scenario = {
  claims: [
    claim({ id: "c-a", titleSv: "Hjärt- och lungräddning", titleEn: "CPR" }),
    claim({ id: "c-b", titleSv: "Skyddsvaktsutbildning", titleEn: "Protective security" }),
  ],
  periods: [period()],
  requests: [
    request({ id: "r-a", claimId: "c-a", status: "clarification_requested" }),
    request({ id: "r-b", claimId: "c-b", status: "clarification_requested" }),
  ],
};

/** A healthy read that takes its time. */
const SLOW_REVIEW: Scenario = { ...MIXED, verificationDelayMs: 4000 };

/** Two merits nobody has reviewed: the merits list is the target. */
const TWO_UNREVIEWED: Scenario = {
  claims: [claim({ id: "c-a" }), claim({ id: "c-b", titleSv: "Kurs B", titleEn: "Course B" })],
  periods: [period()],
  requests: [],
};

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

const ok = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });
const boom = (route: Route, message: string) =>
  route.fulfill({ status: 500, contentType: "text/plain", body: message });

function snapshotOf(s: Scenario) {
  return {
    profileIdentity: {
      displayName: "Nina Lindqvist",
      titleSv: "Säkerhetsanalytiker",
      titleEn: "Security analyst",
    },
    profile: s.noProfile
      ? null
      : {
          displayName: "Nina Lindqvist",
          headline: null,
          cigProfessionSlug: null,
          jurisdictionCode: "SE",
          subJurisdictionCode: null,
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
      displayName: "Nina Lindqvist",
      professionSlug: null,
      identity: {
        engineVersion: "identity-v1",
        evaluatedOn: "2026-09-07",
        includesSelfDeclared: true,
        educationCompleted: [],
        professionalCompetence: [],
        localEligibility: [],
        activeTitles: [],
      },
      jurisdictionCode: "SE",
      subJurisdictionCode: null,
      periods: s.periods,
      claims: s.claims,
      hasCareerDiscoveryResult: false,
    },
    eventCount: 4,
  };
}

let pageErrors: string[] = [];
let unmatched: string[] = [];

async function mount(
  page: Page,
  scenario: Scenario,
  lang: "sv" | "en" = "sv",
  /** The URL to open, hash included. A hash-only change is a same-document
   *  navigation that does not remount the route, so a scenario about arriving
   *  AT an anchor has to arrive there on the first load. */
  path = "/passport",
) {
  pageErrors = [];
  unmatched = [];

  await page.addInitScript(
    ({ ref, lang: l, userId }) => {
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
              id: userId,
              aud: "authenticated",
              email: "workspace@example.test",
              user_metadata: { display_name: "Nina" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { ref: SUPABASE_REF, lang, userId: USER_ID },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    switch (name) {
      case "getInternationalPassportMetadata":
        return ok(route, {
          definitions: [
            {
              code: "INTL_ASIS_CPP",
              name_sv: "Certified Protection Professional (CPP)",
              name_en: "Certified Protection Professional (CPP)",
              credential_class: "certification",
              scope_code: "global_professional",
              country: null,
              region: null,
              issuer_id: "asis",
              issuer_name: "ASIS International",
              requires_valid_until: false,
              allows_no_expiry: false,
            },
          ],
          details: [],
          verificationEvents: scenario.claims
            .filter((c) => c.assertionLevel === "verified")
            .map((c) => ({
              claimId: c.id,
              result: "approved",
              decidedAt: "2026-06-01",
              validUntil: null,
            })),
          jurisdictions: [],
          issuers: [],
        });
      case "getMyPassport":
        if (scenario.passportFails) return boom(route, "read failed");
        return ok(route, snapshotOf(scenario));

      // The three-market overview cards, on their own clock. Sweden is the
      // scenario's market and the only one open to this holder.
      case "listPassportMarketOverview":
        return ok(route, [
          {
            marketPackCode: "SE",
            jurisdictionCode: "SE",
            subJurisdictionCode: null,
            nameSv: "Sverige",
            nameEn: "Sweden",
            availability: "available",
            holderAccess: "production",
            isCurrentWorkMarket: true,
          },
          {
            marketPackCode: "GB",
            jurisdictionCode: "GB",
            subJurisdictionCode: null,
            nameSv: "Storbritannien",
            nameEn: "Great Britain",
            availability: "internal_pilot",
            holderAccess: "closed",
            isCurrentWorkMarket: false,
          },
          {
            marketPackCode: "GB-NI",
            jurisdictionCode: "GB",
            subJurisdictionCode: "GB-NI",
            nameSv: "Nordirland",
            nameEn: "Northern Ireland",
            availability: "internal_pilot",
            holderAccess: "closed",
            isCurrentWorkMarket: false,
          },
          {
            marketPackCode: "AE-DU",
            jurisdictionCode: "AE",
            subJurisdictionCode: "AE-DU",
            nameSv: "Dubai",
            nameEn: "Dubai",
            availability: "internal_pilot",
            holderAccess: "closed",
            isCurrentWorkMarket: false,
          },
        ]);

      case "listMyVerificationRequests":
        if (scenario.verificationDelayMs)
          await new Promise((r) => setTimeout(r, scenario.verificationDelayMs));
        if (scenario.verificationFails) return boom(route, "verification read failed");
        return ok(route, { requests: scenario.requests, decisions: [] });

      // ── EVERY DESTINATION THIS PAGE LINKS TO, RENDERABLE ───────────
      //
      // The dead-end scenarios do not check an HTTP status; they CLICK, and
      // the page they land on has to render from real reads. So the reads
      // those pages make are stubbed here too, with data consistent with the
      // scenario — the same claims and periods, so a merit opened from the
      // list is the merit that opens.
      case "getRegulatedCredentialAvailability":
        return ok(route, {
          state: "open",
          jurisdictionCode: "SE",
          subJurisdictionCode: null,
          marketPackCode: "SE-CORE",
          types: [
            {
              code: "VU1",
              category: "qualification",
              nameSv: "Väktare grund 1",
              nameEn: "Guard 1",
              symbolLabel: null,
            },
            {
              code: "OV",
              category: "appointment",
              nameSv: "Ordningsvakt",
              nameEn: "Public order",
              symbolLabel: null,
            },
          ],
        });
      case "listMyEntries":
        return ok(route, {
          experience: scenario.periods.map((p) => ({ ...p, editable: true })),
          claims: scenario.claims.map((c) => ({
            ...c,
            title: c.titleSv,
            issuerName: c.issuerName,
            editable: true,
          })),
          skills: [],
        });
      case "listJurisdictions":
        return ok(route, [{ code: "SE", nameSv: "Sverige", nameEn: "Sweden" }]);
      case "listSkillTypes":
        return ok(route, []);
      case "getMyProfessionalIdentity":
        return ok(route, null);
      case "getMyPassportProfileBasics":
        return ok(route, null);

      // /passport/share — the holder's own list of links. The sharing screen
      // reads this one now (PR #197); the old package list is gone.
      case "listMyShares":
        return ok(route, []);

      // /passport/credentials/new
      case "listMyCredentialDrafts":
        return ok(route, []);
      case "listCredentialTypes":
        return ok(route, []);

      // /passport/entry/$kind/$entryId
      case "listMyEvidence":
        return ok(route, []);
      case "listClaimVersions":
        return ok(route, []);
      case "getCredentialPrivateFields":
        return ok(route, null);
      case "searchAttestableEmployers":
        // The REAL shape. `[]` is not what this function returns, and a route
        // that does `suggestions: r.suggestions` on it sets `undefined` — so
        // the employment entry page crashed inside its own error boundary
        // whenever the debounced search happened to resolve before the
        // assertion. A stub that answers in the wrong shape is a test that
        // passes for the wrong reason on a good day.
        return ok(route, { suggestions: [], truncated: false, linkedEmployer: null });

      // /my-career/cv
      case "prepareMyCv":
        return ok(route, {
          readiness: { state: "ready", missingFields: [] },
          bundle: null,
          factualDocument: null,
          hasCareerInsight: false,
        });
      case "listMyCvs":
        return ok(route, []);

      // Header chrome, on every authenticated page.
      case "countMyAcademyWork":
        return ok(route, { total: 0, actionable: 0 });
      case "countMyReviewQueue":
        return ok(route, 0);
      case "listMyEmployerWorkspaces":
        return ok(route, []);
      case "trackV31FunnelEvent":
        return ok(route, { recorded: false });

      default:
        unmatched.push(name);
        return boom(route, `UNSTUBBED_SERVER_FN:${name}`);
    }
  });

  await page.route(/^https?:\/\/[^/]+\/(?:auth|rest)\/v1\//, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: USER_ID,
          aud: "authenticated",
          email: "workspace@example.test",
          user_metadata: { display_name: "Nina" },
          app_metadata: {},
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  page.on("pageerror", (e) => pageErrors.push(String(e)));
  if (process.env.E2E_DEBUG) page.on("console", (m) => console.log(`[page] ${m.text()}`));

  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
}

/** The workspace has rendered. Everything below asserts against it. */
async function ready(page: Page) {
  await expect(page.locator("[data-passport-workspace]")).toBeVisible({ timeout: 30_000 });
  expect(unmatched, `unstubbed server functions: ${unmatched.join(", ")}`).toEqual([]);
}

/** Horizontal overflow is the failure mode that makes a page feel broken on
 *  a phone, and it is invisible at desktop width. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function shoot(page: Page, name: string) {
  if (!SHOT_DIR) return;
  const dir = path.resolve(SHOT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${SHOT_TAG}-${name}.png`), fullPage: true });
}

/* ══════════════════════════════════════════════════════════════════════
   The scenarios
   ══════════════════════════════════════════════════════════════════════ */

const wallet = (page: Page) => page.locator("[data-credential-wallet]");
const rows = (page: Page) => wallet(page).locator("[data-credential-row]");
async function noErrors() {
  expect(pageErrors).toEqual([]);
  expect(unmatched).toEqual([]);
}

test.describe("Security Passport — governed wallet regression", () => {
  test("1 registered credential stays self-declared and offers a governed next credential", async ({
    page,
  }) => {
    await mount(page, JUST_ADDED);
    await ready(page);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(/Egen|Registrerat|Tillagd/i);
    await expect(wallet(page).getByRole("link", { name: "Lägg till meriter" })).toHaveAttribute(
      "href",
      "/passport/credentials/new",
    );
    await noErrors();
  });
  test("2 document review is documented and never an issuer confirmation", async ({ page }) => {
    await mount(page, DOCUMENTED, "en");
    await ready(page);
    await expect(rows(page)).toContainText(/Document/);
    await expect(rows(page)).not.toContainText("Source-confirmed");
  });
  test("3 employer-confirmed employment belongs to CV and cannot raise credential trust", async ({
    page,
  }) => {
    await mount(page, SOURCE_CONFIRMED, "en");
    await ready(page);
    await expect(wallet(page)).not.toContainText("Nordic Security AB");
    await expect(rows(page)).not.toContainText("Source-confirmed");
    // Nowhere on the page -- the wallet, the next step or the sharing status.
    // (A compact card used to sit in the side column; the Passport overview
    // shows exactly one Passport now, so the whole workspace is the scope.)
    await expect(page.locator("[data-passport-workspace]")).not.toContainText("Nordic Security AB");
  });
  test("4 pending review is stated without a verification promise", async ({ page }) => {
    await mount(page, IN_REVIEW, "en");
    await ready(page);
    await expect(rows(page)).toContainText("Under review");
    await expect(rows(page)).not.toContainText("Source-confirmed");
  });
  test("5 reviewer question names and opens its own credential", async ({ page }) => {
    await mount(page, CLARIFICATION);
    await ready(page);
    const attention = page.locator("#attention");
    await expect(attention).toContainText("Vi behöver ett intyg");
    // CORRECTED CONTRACT (owner, 2026-09-17): one claim-route link per
    // credential on the whole page, and the row owns it. The question names
    // its credential and takes the reader to that credential's ROW; the row's
    // own action then opens the claim. Still one credential, still reachable.
    const toRow = attention.getByRole("link", { name: "Visa meriten" });
    await expect(toRow).toHaveAttribute("href", "/passport#sp-credential-c-1");
    await expect(page.locator('a[href="/passport/entry/claim/c-1"]')).toHaveCount(1);
    await toRow.click();
    const row = page.locator("#sp-credential-c-1");
    await expect(row).toBeInViewport();
    await expect(row).toBeFocused();
    await row.getByRole("link", { name: "Komplettera uppgifter" }).click();
    await expect(page).toHaveURL(/\/passport\/entry\/claim\/c-1$/);
    await noErrors();
  });
  test("6 historical expiry remains visible and is never current verification", async ({
    page,
  }) => {
    await mount(page, ARCHIVED, "en");
    await ready(page);
    await expect(rows(page)).toContainText(/Expired|Past/);
    await expect(rows(page)).not.toContainText("Source-confirmed");
  });
  test("7 mixed states retain each credential exactly once and exclude employment", async ({
    page,
  }) => {
    await mount(page, MIXED, "en");
    await ready(page);
    await expect(rows(page)).toHaveCount(5);
    // Once in the COLLECTION. The action panel now sits inside the wallet and
    // may also link to the credential it recommends acting on; this is about
    // the list not repeating a record, so it is scoped to the list.
    for (const c of MIXED.claims)
      await expect(
        wallet(page).locator(`#merits a[href="/passport/entry/claim/${c.id}"]`),
      ).toHaveCount(1);
    await expect(wallet(page)).not.toContainText("Nordic Security AB");
    await expect(wallet(page)).not.toContainText("Väktarbolaget Syd AB");
  });
  test("8 failed review read preserves credentials and explains uncertainty once", async ({
    page,
  }) => {
    await mount(page, VERIFICATION_DOWN, "en");
    await ready(page);
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByText("Review status unavailable", { exact: true })).toHaveCount(1);
    await expect(wallet(page)).not.toContainText("Under review");
  });
  test("9 failed Passport read retries without losing navigation", async ({ page }) => {
    const state = { ...JUST_ADDED, passportFails: true };
    await mount(page, state, "en");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(wallet(page)).toHaveCount(0);
    state.passportFails = false;
    await page.getByRole("button", { name: /Try again|Retry/ }).click();
    await ready(page);
    await expect(rows(page)).toHaveCount(1);
    await noErrors();
  });
  const forbidden = ["employment", "education", "language", "practical_skill", "membership"];
  for (const kind of forbidden)
    test(`ownership — ${kind} remains outside credential wallet`, async ({ page }) => {
      await mount(page, {
        ...JUST_ADDED,
        claims: [
          claim(),
          claim({
            id: "cv-only",
            claimType: kind,
            credentialCode: null,
            titleSv: "PRIVATE CV FACT",
            titleEn: "PRIVATE CV FACT",
          }),
        ],
      });
      await ready(page);
      await expect(rows(page)).toHaveCount(1);
      await expect(page.locator("[data-passport-workspace]")).not.toContainText("PRIVATE CV FACT");
    });
  for (const state of ["draft", "disputed", "revoked", "superseded", "expired"])
    test(`lifecycle — ${state} is explicitly marked`, async ({ page }) => {
      await mount(page, { ...JUST_ADDED, claims: [claim({ lifecycleState: state })] }, "en");
      await ready(page);
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText(
        new RegExp(state === "superseded" ? "Replaced" : state, "i"),
      );
    });
  test("empty credentials preserve CV privacy and offer approved add flow", async ({ page }) => {
    await mount(page, { claims: [], periods: [period()], requests: [] }, "en");
    await ready(page);
    await expect(wallet(page)).toContainText("Your first credential");
    await expect(rows(page)).toHaveCount(0);
    await wallet(page).getByRole("link", { name: "Add credential" }).click();
    await expect(page.getByRole("heading", { name: "Add credential" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^International/ })).toBeVisible();
    await noErrors();
  });
  for (const target of [
    { name: "Preview and share", url: "/passport/share", heading: /Share|Select/ },
    { name: "Add credential", url: "/passport/credentials/new", heading: /Add credential/ },
  ])
    test(`navigation — ${target.name} loads its real destination`, async ({ page }) => {
      await mount(page, JUST_ADDED, "en");
      await ready(page);
      await wallet(page).getByRole("link", { name: target.name }).click();
      await expect(page).toHaveURL(new RegExp(target.url + "$"));
      await expect(
        page.getByRole("heading").filter({ hasText: target.heading }).first(),
      ).toBeVisible();
      await noErrors();
    });
  for (const id of ["c-doc", "c-draft", "c-old"])
    test(`details — ${id} opens the selected record`, async ({ page }) => {
      await mount(page, MIXED, "en");
      await ready(page);
      await wallet(page).locator(`a[href="/passport/entry/claim/${id}"]`).click();
      await expect(page).toHaveURL(new RegExp("/passport/entry/claim/" + id + "$"));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noErrors();
    });
  test("rejected review preserves explanation and correction destination", async ({ page }) => {
    await mount(page, REJECTED);
    await ready(page);
    await expect(page.locator("#attention")).toContainText(
      "Underlaget visar inte kursens omfattning.",
    );
    // The correction destination is the credential's row, whose own action
    // opens the claim — not a second copy of that link in this section.
    await expect(page.locator('#attention a[href="/passport#sp-credential-c-1"]')).toBeVisible();
    await expect(page.locator('a[href="/passport/entry/claim/c-1"]')).toHaveCount(1);
    await page.locator('#attention a[href="/passport#sp-credential-c-1"]').click();
    const row = page.locator("#sp-credential-c-1");
    await expect(row).toBeFocused();
    await row.locator('a[href="/passport/entry/claim/c-1"]').click();
    await expect(page).toHaveURL(/\/passport\/entry\/claim\/c-1$/);
  });
  test("multiple questions link separately to their subjects", async ({ page }) => {
    await mount(page, TWO_QUESTIONS);
    await ready(page);
    // Still SEPARATELY, still to their own subjects — each to its own row.
    for (const id of ["c-a", "c-b"]) {
      await expect(
        page.locator(`#attention a[href="/passport#sp-credential-${id}"]`),
      ).toBeVisible();
      await expect(page.locator(`a[href="/passport/entry/claim/${id}"]`)).toHaveCount(1);
      await expect(
        page.locator(`#sp-credential-${id} a[href="/passport/entry/claim/${id}"]`),
      ).toBeVisible();
    }
  });
  test("unreviewed claims cannot be described as pending or verified", async ({ page }) => {
    await mount(page, TWO_UNREVIEWED, "en");
    await ready(page);
    await expect(rows(page)).toHaveCount(2);
    await expect(wallet(page)).not.toContainText("Under review");
    await expect(rows(page).first()).not.toContainText("Source-confirmed");
  });
  test("failed read does not invent pending or clarification status", async ({ page }) => {
    await mount(page, REVIEW_STATE_DOWN, "en");
    await ready(page);
    await expect(rows(page)).toHaveCount(3);
    await expect(wallet(page)).toContainText("Review status unavailable");
    await expect(wallet(page)).not.toContainText("More information needed");
  });
  test("healthy control distinguishes pending and clarification", async ({ page }) => {
    await mount(page, REVIEW_STATE_UP, "en");
    await ready(page);
    await expect(wallet(page)).toContainText("Under review");
    await expect(wallet(page)).toContainText("More information needed");
  });
  test("slow review read shows loading then real states, never failure", async ({ page }) => {
    await mount(page, SLOW_REVIEW, "en");
    await ready(page);
    await expect(page.locator("[data-review-read-status]")).toHaveText("Loading review status…");
    await expect(wallet(page)).not.toContainText("Review status unavailable");
    await expect(wallet(page)).toContainText("Under review", { timeout: 10000 });
    await expect(page.locator("[data-review-read-status]")).toHaveCount(0);
  });
  for (const anchor of ["attention", "merits"])
    test(`deep link #${anchor} has a labelled focusable target`, async ({ page }) => {
      await mount(page, MIXED, "en", `/passport#${anchor}`);
      await ready(page);
      const region = page.locator("#" + anchor);
      await expect(region).toBeVisible();
      await expect(region).toHaveAttribute("aria-labelledby", /.+/);
      await expect(region).toHaveAttribute("tabindex", "-1");
    });
  for (const lang of ["sv", "en"] as const)
    test(`language — ${lang} uses translated titles and Profile identity`, async ({ page }) => {
      await mount(page, MIXED, lang);
      await ready(page);
      await expect(wallet(page)).toContainText(
        lang === "sv" ? "Säkerhetsanalytiker" : "Security analyst",
      );
      await expect(wallet(page)).toContainText("Certified Protection Professional (CPP)");
      await expect(wallet(page)).toContainText(
        lang === "sv" ? "Internationella certifieringar" : "International certifications",
      );
      await expect(wallet(page)).not.toContainText("Protective security training");
      // The name comes from Profile and is stated ONCE, by the identity
      // surface -- there is no second Passport card to repeat it.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nina Lindqvist");
      await expect(page.locator("[data-compact-passport-card]")).toHaveCount(0);
    });
  test("private summary never creates a link or exposes a QR token", async ({ page }) => {
    await mount(page, MIXED, "en");
    await ready(page);
    await expect(page.locator("[data-passport-privacy-summary]")).toBeVisible();
    await expect(
      page.locator('[data-passport-workspace] a[href*="token"], [data-passport-workspace] canvas'),
    ).toHaveCount(0);
    // And no recipient-style card at all: that lives under Preview and share.
    await expect(page.locator("[data-compact-passport-card]")).toHaveCount(0);
  });
  test("all workspace controls have 44px targets and visible keyboard focus", async ({ page }) => {
    await mount(page, MIXED, "en");
    await ready(page);
    const controls = page.locator("[data-passport-workspace] a, [data-passport-workspace] button");
    expect(await controls.count()).toBeGreaterThan(6);
    for (const el of await controls.all()) {
      if (!(await el.isVisible())) continue;
      const b = await el.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.width).toBeGreaterThanOrEqual(44);
      await el.focus();
      await expect(el).toBeFocused();
      expect(
        await el.evaluate((n) => {
          const s = getComputedStyle(n);
          return s.outlineStyle !== "none" || s.boxShadow !== "none";
        }),
      ).toBe(true);
    }
    await expect(page.locator("h1")).toHaveCount(1);
  });
  test("keyboard alone reaches and activates the approved credential selector", async ({
    page,
  }) => {
    await mount(page, JUST_ADDED, "en");
    await ready(page);
    await wallet(page).getByRole("link", { name: "Add credential" }).focus();
    await page.keyboard.press("Enter");
    const international = page.getByRole("radio", { name: /^International/ });
    await expect(international).toBeVisible();
    await international.focus();
    await page.keyboard.press("Space");
    await expect(international).toBeChecked();
    await noErrors();
  });
  for (const width of [1440, 720, 390, 375])
    for (const lang of ["sv", "en"] as const)
      test(`layout — ${width}px ${lang} preserves readable wallet without overflow`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await mount(page, MIXED, lang);
        await ready(page);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        await expect(rows(page)).toHaveCount(5);
        await expect(page.locator("h1")).toHaveCount(1);
        await shoot(page, `wallet-${lang}-${width}`);
      });
});

// Former screenshot-only skips now assert the rendered state at every capture.
for (const state of [
  { name: "mixed", scenario: MIXED, widths: [1440, 375, 720] },
  { name: "clarification", scenario: CLARIFICATION, widths: [1440, 375] },
  { name: "review-read-failed", scenario: VERIFICATION_DOWN, widths: [1440, 375] },
  { name: "just-added", scenario: JUST_ADDED, widths: [1440] },
])
  for (const width of state.widths)
    for (const lang of ["sv", "en"] as const)
      test(`review evidence — ${state.name} ${lang} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await mount(page, state.scenario, lang);
        await ready(page);
        await expect(rows(page)).toHaveCount(state.scenario.claims.length);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        await noErrors();
        await shoot(page, `${state.name}-${lang}-${width}`);
      });

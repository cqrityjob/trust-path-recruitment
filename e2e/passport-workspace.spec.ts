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
const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
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
    credentialCode: null,
    skillCode: null,
    skillLevel: null,
    titleSv: "Väktarutbildning grundkurs",
    titleEn: "Security officer foundation course",
    issuerName: "BYA",
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
  /** The Passport read fails. The only failure with no page. */
  readonly passportFails?: boolean;
  /** No profile row and no merit: the first run owns this holder. */
  readonly noProfile?: boolean;
}

/** Just after the first run: one merit, recorded by the holder, nothing else. */
const JUST_ADDED: Scenario = {
  claims: [],
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
      case "getMyPassport":
        if (scenario.passportFails) return boom(route, "read failed");
        return ok(route, snapshotOf(scenario));

      case "listMyVerificationRequests":
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
            { code: "VU1", nameSv: "Väktare grund 1", nameEn: "Guard 1", symbolLabel: null },
            { code: "OV", nameSv: "Ordningsvakt", nameEn: "Public order", symbolLabel: null },
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

      // /passport/share
      case "listMyDisclosures":
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
        return ok(route, []);

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

  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
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

test.describe("Security Passport — the workspace", () => {
  test.describe.configure({ timeout: 90_000 });

  test("1 · one recorded merit reads as registered, and asks for one more", async ({ page }) => {
    await mount(page, JUST_ADDED);
    await ready(page);

    // One H1, and it names the product.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Mitt Security Passport");

    // The ladder, with the merit on the bottom rung and nothing above it.
    await expect(page.locator('[data-status-tile="registered"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-status-tile="documented"]')).toHaveAttribute(
      "data-count",
      "0",
    );
    await expect(page.locator('[data-status-tile="source-confirmed"]')).toHaveAttribute(
      "data-count",
      "0",
    );
    await expect(page.locator('[data-status-tile="in-review"]')).toHaveAttribute("data-count", "0");

    // Exactly one recommended step, and it retires on a stated condition.
    await expect(page.locator("[data-next-step]")).toHaveCount(1);
    await expect(page.locator("[data-next-step]")).toHaveAttribute(
      "data-next-step",
      "add_more_merits",
    );
    await expect(page.locator("[data-next-step-cta]")).toHaveAttribute(
      "data-retires-when",
      "a second current merit is recorded",
    );

    // The merit itself, listed with its status.
    await expect(page.locator('[data-merit-row="p-1"]')).toBeVisible();
    await expect(page.locator('[data-merit-row="p-1"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "added_by_you",
    );

    // Empty categories are not rendered.
    await expect(page.locator('[data-merit-group="in-review"]')).toHaveCount(0);
    await expect(page.locator('[data-merit-group="archived"]')).toHaveCount(0);
    await expect(page.locator('[data-merit-group="drafts"]')).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    await shoot(page, "just-added-sv-1440");
  });

  test("2 · a document review reads as documented, never as source-confirmed", async ({ page }) => {
    await mount(page, DOCUMENTED);
    await ready(page);

    await expect(page.locator('[data-status-tile="documented"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-status-tile="source-confirmed"]')).toHaveAttribute(
      "data-count",
      "0",
    );
    await expect(page.locator('[data-merit-row="c-1"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "documented",
    );
    await expect(page.locator('[data-merit-row="c-1"]')).toContainText("Dokumenterad");
    await expect(page.locator('[data-merit-row="c-1"]')).not.toContainText("Källbekräftad");
    expect(pageErrors).toEqual([]);
  });

  test("3 · an employer confirmation reads as source-confirmed", async ({ page }) => {
    await mount(page, SOURCE_CONFIRMED);
    await ready(page);

    await expect(page.locator('[data-status-tile="source-confirmed"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-merit-row="p-1"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "verified",
    );
    await expect(page.locator('[data-merit-row="p-1"]')).toContainText("Källbekräftad");
    expect(pageErrors).toEqual([]);
  });

  test("4 · an open review is a status, never the recommended action", async ({ page }) => {
    await mount(page, IN_REVIEW);
    await ready(page);

    await expect(page.locator('[data-status-tile="in-review"]')).toHaveAttribute("data-count", "1");
    await expect(
      page.locator('[data-merit-group="in-review"] [data-merit-row="c-1"]'),
    ).toBeVisible();
    // The step is about something else entirely — never "wait".
    await expect(page.locator("[data-next-step]")).not.toHaveAttribute(
      "data-next-step",
      "verification_requested",
    );
    expect(pageErrors).toEqual([]);
  });

  test("5 · a reviewer's question outranks everything and opens that entry", async ({ page }) => {
    await mount(page, CLARIFICATION);
    await ready(page);

    await expect(page.locator("[data-next-step]")).toHaveAttribute(
      "data-next-step",
      "respond_to_clarification",
    );
    const cta = page.locator("[data-next-step-cta]");
    await expect(cta).toHaveAttribute("href", "/passport/entry/claim/c-1");
    await expect(cta).toHaveAttribute(
      "data-retires-when",
      "the holder has answered and the request leaves clarification_requested",
    );
    // The reviewer's own message reaches the holder, in the attention region.
    await expect(page.locator("#attention")).toContainText("kursens omfattning");
    // And the merit itself says what state it is in.
    await expect(page.locator('[data-merit-row="c-1"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "clarification_needed",
    );
    expect(pageErrors).toEqual([]);
    await shoot(page, "clarification-sv-1440");
  });

  test("6 · an archived merit is history, and is never counted as current", async ({ page }) => {
    await mount(page, ARCHIVED);
    await ready(page);

    await expect(
      page.locator('[data-merit-group="archived"] [data-merit-row="c-old"]'),
    ).toBeVisible();
    // One employment is the only CURRENT merit; the expired credential is not
    // on any rung of the ladder.
    await expect(page.locator('[data-status-tile="registered"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-status-tile="documented"]')).toHaveAttribute(
      "data-count",
      "0",
    );
    expect(pageErrors).toEqual([]);
  });

  test("7 · several states at once, each in exactly one group", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);

    await expect(
      page.locator('[data-merit-group="drafts"] [data-draft-row="c-draft"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-merit-group="in-review"] [data-merit-row="c-open"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-merit-group="archived"] [data-merit-row="c-old"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-merit-group="current"] [data-merit-row="c-doc"]'),
    ).toBeVisible();

    // No merit appears twice.
    for (const id of ["c-doc", "c-open", "c-ask", "c-old", "p-1", "p-2"]) {
      await expect(page.locator(`[data-merit-row="${id}"]`)).toHaveCount(1);
    }

    // The counts and the list describe the same merits.
    await expect(page.locator('[data-status-tile="documented"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-status-tile="source-confirmed"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-status-tile="in-review"]')).toHaveAttribute("data-count", "2");
    expect(pageErrors).toEqual([]);
    await shoot(page, "mixed-sv-1440");
  });

  test("8 · a failed verification read costs its figures, not the page", async ({ page }) => {
    await mount(page, VERIFICATION_DOWN);
    await ready(page);

    // The merits still render — the Passport read succeeded.
    await expect(page.locator('[data-merit-row="c-doc"]')).toBeVisible();
    // The review-derived figure says it could not be read. Never 0.
    await expect(page.locator('[data-status-tile="in-review"]')).toHaveAttribute(
      "data-count",
      "unknown",
    );
    // And no step is recommended on a standing nobody could read.
    await expect(page.locator("[data-next-step]")).toHaveAttribute("data-next-step", "unavailable");
    await expect(page.locator("[data-next-step] [data-retry]")).toBeVisible();
    expect(pageErrors).toEqual([]);
    await shoot(page, "verification-down-sv-1440");
  });

  test("9 · a failed Passport read says so and offers a retry", async ({ page }) => {
    await mount(page, { ...JUST_ADDED, passportFails: true });
    await expect(page.getByRole("alert")).toContainText("Security Passport", {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Försök igen" })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  /* ────────────────────────────────────────────────────────────────
     10 · THE DEAD-END CONTRACT, PROVED BY CLICKING
     ────────────────────────────────────────────────────────────────
     An HTTP 200 for a route is not proof that a button works. It says the
     server would serve a document; it says nothing about whether the click
     navigates, whether the page renders, whether it renders the RIGHT
     object, or whether the person can get back. Each scenario below presses
     the control a person would press and then asserts all four.
     ──────────────────────────────────────────────────────────────── */

  /** Everything that must be true of any page a Passport CTA lands on. */
  async function landed(
    page: Page,
    expected: { url: RegExp; heading?: RegExp; contains?: (string | RegExp)[] },
  ) {
    await page.waitForURL(expected.url, { timeout: 30_000 });

    // Not a login wall. The stub keeps a session, so being bounced to
    // sign-in means the destination is not reachable for a signed-in holder.
    expect(page.url()).not.toMatch(/\/(login|signin|signup)\b/);

    // Not a not-found page, and not a placeholder.
    const body = await page.locator("main, body").first().innerText();
    for (const dud of [
      "404",
      "Sidan finns inte",
      "Page not found",
      "Kommer snart",
      "Coming soon",
      "Not implemented",
    ]) {
      expect(body, `placeholder "${dud}" on ${page.url()}`).not.toContain(dud);
    }

    if (expected.heading) {
      await expect(page.getByRole("heading", { name: expected.heading }).first()).toBeVisible({
        timeout: 30_000,
      });
    }
    for (const needle of expected.contains ?? []) {
      await expect(page.locator("body")).toContainText(needle, { timeout: 30_000 });
    }

    // A CLEAR ROUTE BACK TO THE PASSPORT.
    //
    // Reachable, not merely present in the DOM: `.first()` on this selector
    // resolves to the site header's link, which is real but collapsed into
    // the menu sheet at phone widths. A link nobody can see is not a route
    // back, and a link one tap inside a labelled menu is — so the assertion
    // accepts either, and fails when neither is true.
    const backHome = page.locator('a[href="/passport"]');
    const anyVisible = async () => {
      const n = await backHome.count();
      for (let i = 0; i < n; i += 1) if (await backHome.nth(i).isVisible()) return true;
      return false;
    };
    if (!(await anyVisible())) {
      await page.locator("[aria-controls='site-menu']").first().click();
      await expect(page.locator("#site-menu")).toBeVisible();
    }
    expect(await anyVisible(), `no reachable route back to /passport from ${page.url()}`).toBe(
      true,
    );

    expect(pageErrors, `page errors on ${page.url()}`).toEqual([]);
  }

  /** Open the add-merit chooser and click one of its three options. */
  async function chooseMerit(page: Page, kind: "employment" | "education" | "credential") {
    await page.locator('[data-cta="add-merit"]').click();
    await expect(page.locator(`[data-add-merit="${kind}"]`)).toBeVisible();
    await page.locator(`[data-add-merit="${kind}"]`).click();
  }

  test("10a · Add merit → employment lands on the employment section", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await chooseMerit(page, "employment");
    await landed(page, {
      url: /\/passport\/information#sp-employment$/,
      heading: /Mina uppgifter/,
    });
    // The SECTION, not merely the page: the anchor is resolved and focused
    // once the sections exist, which the browser cannot do on its own here.
    await expect(page.locator("#sp-employment")).toHaveAttribute(
      "data-hash-target",
      "sp-employment",
    );
    await expect(page.locator("#sp-employment")).toContainText("Lägg till anställning");
  });

  test("10b · Add merit → education lands on the education section", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await chooseMerit(page, "education");
    await landed(page, {
      url: /\/passport\/information#sp-education$/,
      heading: /Mina uppgifter/,
    });
    await expect(page.locator("#sp-education")).toHaveAttribute("data-hash-target", "sp-education");
    await expect(page.locator("#sp-education")).toContainText("Utbildning");
  });

  test("10c · Add merit → authorisation lands on the credential form", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await chooseMerit(page, "credential");
    await landed(page, {
      url: /\/passport\/credentials\/new$/,
      heading: /Lägg till behörighet eller utbildning/,
    });
  });

  test("10d · Share Passport lands on the sharing centre", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await page.locator('[data-cta="share"]').click();
    await landed(page, { url: /\/passport\/share$/, heading: /Dela ditt Passport/ });
  });

  test("10e · the CV link lands on the CV list", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await page.locator('[data-use-link="cv"]').click();
    await landed(page, { url: /\/my-career\/cv$/, heading: /CV/ });
  });

  test("10f · the recipient view lands on the Passport Card", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await page.locator('[data-use-link="card"]').click();
    await landed(page, { url: /\/passport\/card$/ });
    // The card itself, not merely the route: the article the recipient sees.
    await expect(page.getByRole("article", { name: "Security Passport" })).toBeVisible();
    // And the tab that names where we are.
    await expect(page.locator('a[href="/passport/card"][aria-current="page"]')).toBeVisible();
  });

  test("10g · a merit row opens THAT merit, not the route family", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await page.locator('[data-merit-row="c-doc"]').click();
    await landed(page, {
      url: /\/passport\/entry\/claim\/c-doc$/,
      contains: ["Väktarutbildning grundkurs"],
    });
    // The CORRECT object: a neighbouring merit's title must not be here.
    await expect(page.locator("body")).not.toContainText("Skyddsvaktsutbildning");
  });

  test("10h · an employment row opens that employment", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await page.locator('[data-merit-row="p-2"]').click();
    await landed(page, {
      url: /\/passport\/entry\/experience\/p-2$/,
      contains: ["Ordningsvakt", "Väktarbolaget Syd AB"],
    });
  });

  test("10i · a draft resumes IN the form, carrying its id", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);
    await page.locator('[data-draft-row="c-draft"]').click();
    await landed(page, {
      url: /\/passport\/credentials\/new\?draft=c-draft$/,
      heading: /Lägg till behörighet eller utbildning/,
    });
  });

  test("10j · a reviewer's question opens the merit it is about", async ({ page }) => {
    await mount(page, CLARIFICATION);
    await ready(page);
    await expect(page.locator("[data-next-step]")).toHaveAttribute(
      "data-next-step",
      "respond_to_clarification",
    );
    await page.locator("[data-next-step-cta]").click();
    await landed(page, {
      url: /\/passport\/entry\/claim\/c-1$/,
      contains: ["Väktarutbildning grundkurs"],
    });
  });

  test("10k · a refused request opens the merit it decided", async ({ page }) => {
    await mount(page, REJECTED);
    await ready(page);
    await expect(page.locator("[data-next-step]")).toHaveAttribute(
      "data-next-step",
      "review_verification_outcome",
    );
    await page.locator("[data-next-step-cta]").click();
    await landed(page, {
      url: /\/passport\/entry\/claim\/c-1$/,
      contains: ["Väktarutbildning grundkurs"],
    });
  });

  test("10l · several questions open the attention region, which is really there", async ({
    page,
  }) => {
    await mount(page, TWO_QUESTIONS);
    await ready(page);
    await expect(page.locator("[data-next-step-cta]")).toHaveAttribute(
      "href",
      "/passport#attention",
    );
    await page.locator("[data-next-step-cta]").click();
    await expect(page.locator("#attention")).toBeVisible();
    await expect(page.locator("#attention")).toContainText("Hjärt- och lungräddning");
    await expect(page.locator("#attention")).toContainText("Skyddsvaktsutbildning");
    expect(pageErrors).toEqual([]);
  });

  test("10m · asking for verification opens the merits list, which is really there", async ({
    page,
  }) => {
    await mount(page, TWO_UNREVIEWED);
    await ready(page);
    await expect(page.locator("[data-next-step]")).toHaveAttribute(
      "data-next-step",
      "submit_passport_verification",
    );
    await expect(page.locator("[data-next-step-cta]")).toHaveAttribute("href", "/passport#merits");
    await page.locator("[data-next-step-cta]").click();
    await expect(page.locator("#merits")).toBeVisible();
    await expect(page.locator('[data-merit-group="current"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("10n · REGRESSION: a failed review read never shows a pending merit as ordinary", async ({
    page,
  }) => {
    // The control first: with the read answering, the three merits really are
    // three different things, so the scenario is not asserting a tautology.
    await mount(page, REVIEW_STATE_UP);
    await ready(page);
    await expect(
      page.locator('[data-merit-group="in-review"] [data-merit-row="c-pending"]'),
    ).toBeVisible();
    await expect(page.locator('[data-merit-row="c-ask"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "clarification_needed",
    );
    await expect(page.locator('[data-merit-row="c-plain"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "added_by_you",
    );
    await expect(page.locator('[data-status-tile="registered"]')).toHaveAttribute(
      "data-count",
      "1",
    );

    // Now the read fails.
    await mount(page, REVIEW_STATE_DOWN);
    await ready(page);

    // Not one of them is described as an ordinary registered merit.
    for (const id of ["c-pending", "c-ask", "c-plain"]) {
      await expect(
        page.locator(`[data-merit-row="${id}"] [data-merit-status]`),
        id,
      ).toHaveAttribute("data-merit-status", "unknown");
    }
    // There is no "current merits" group to be mistaken for one, and no
    // "under review" group falsely asserting the opposite.
    await expect(page.locator('[data-merit-group="current"]')).toHaveCount(0);
    await expect(page.locator('[data-merit-group="in-review"]')).toHaveCount(0);
    // They are under a heading that names the reason, in words.
    await expect(page.locator('[data-merit-group="review-unknown"]')).toBeVisible();
    await expect(page.locator('[data-merit-group="review-unknown"]')).toContainText(
      "Granskningsstatus kunde inte läsas",
    );
    // Both review-derived figures are unknown, never a number.
    await expect(page.locator('[data-status-tile="registered"]')).toHaveAttribute(
      "data-count",
      "unknown",
    );
    await expect(page.locator('[data-status-tile="in-review"]')).toHaveAttribute(
      "data-count",
      "unknown",
    );
    // And nothing is recommended off the back of it.
    await expect(page.locator("[data-next-step]")).toHaveAttribute("data-next-step", "unavailable");
    // The settled word appears nowhere on the page.
    await expect(page.locator("[data-passport-workspace]")).not.toContainText("Egen uppgift");
    expect(pageErrors).toEqual([]);
    await shoot(page, "review-state-down-sv-1440");
  });

  test("10o · an intrinsically known standing survives the same failure", async ({ page }) => {
    await mount(page, VERIFICATION_DOWN);
    await ready(page);
    // A CQrityjob document review and an employer confirmation are functions
    // of stored provenance, not of the request table.
    await expect(page.locator('[data-merit-row="c-doc"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "documented",
    );
    await expect(page.locator('[data-merit-row="p-1"] [data-merit-status]')).toHaveAttribute(
      "data-merit-status",
      "verified",
    );
    await expect(page.locator('[data-status-tile="documented"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(page.locator('[data-status-tile="source-confirmed"]')).toHaveAttribute(
      "data-count",
      "1",
    );
    expect(pageErrors).toEqual([]);
  });

  // One test per anchor, deliberately: two `goto`s that differ only in the
  // fragment are a same-document navigation, so the route never remounts and
  // the second arrival would be asserted against the first one's effect.
  for (const anchor of ["attention", "merits"] as const) {
    test(`11 · the career home's /passport#${anchor} link lands on a real region`, async ({
      page,
    }) => {
      await mount(page, MIXED, "sv", `/passport#${anchor}`);
      await ready(page);
      await expect(page.locator(`#${anchor}`)).toHaveAttribute("data-hash-target", anchor);
      await expect(page.locator(`#${anchor}`)).toBeVisible();
    });
  }

  test("12 · English is fully translated, including the merit titles", async ({ page }) => {
    await mount(page, MIXED, "en");
    await ready(page);

    await expect(page.locator("h1")).toHaveText("My Security Passport");
    await expect(page.locator('[data-status-tile="registered"]')).toContainText("Registered");
    await expect(page.locator('[data-status-tile="source-confirmed"]')).toContainText(
      "Source-confirmed",
    );
    await expect(page.locator('[data-merit-row="c-doc"]')).toContainText(
      "Security officer foundation course",
    );
    await expect(page.locator('[data-merit-row="c-doc"]')).toContainText("Documented");
    // The one place that used to fall back to Swedish: the attention list.
    await expect(page.locator("#attention")).toContainText("Cardiopulmonary resuscitation");

    const swedishOnly = ["Mitt Security Passport", "Dokumenterad", "Källbekräftad", "Registrerade"];
    const body = (await page.locator("[data-passport-workspace]").innerText()).toLowerCase();
    for (const word of swedishOnly) expect(body).not.toContain(word.toLowerCase());

    await shoot(page, "mixed-en-1440");
  });

  test("13 · the interactive targets are big enough and the focus ring is visible", async ({
    page,
  }) => {
    await mount(page, MIXED);
    await ready(page);

    const boxes = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "[data-passport-workspace] a, [data-passport-workspace] button",
        ),
      ]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent?.trim() };
        })
        .filter((b) => b.w > 0),
    );
    for (const b of boxes) {
      expect(b.h, `height of "${b.text}"`).toBeGreaterThanOrEqual(44);
      expect(b.w, `width of "${b.text}"`).toBeGreaterThanOrEqual(44);
    }

    await page.locator('[data-cta="add-merit"]').focus();
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? getComputedStyle(el).outlineStyle : "none";
    });
    expect(outline).not.toBe("none");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   Real phone widths, and 200% zoom
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Security Passport — the workspace at small widths", () => {
  test.describe.configure({ timeout: 90_000 });

  test("14 · nothing overflows horizontally at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mount(page, MIXED);
    await ready(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, "mixed-sv-375");
  });

  test("15 · nor at 375px in English", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mount(page, MIXED, "en");
    await ready(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, "mixed-en-375");
  });

  test("16 · nor for a Passport with one merit at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mount(page, JUST_ADDED);
    await ready(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, "just-added-sv-375");
  });

  test("17 · nor at 200% zoom, which is 720 CSS pixels wide", async ({ page }) => {
    // WCAG 1.4.10: 1440 at 200% is a 720px viewport. Emulated as the width
    // rather than by a zoom setting, which is what a browser actually does.
    await page.setViewportSize({ width: 720, height: 900 });
    await mount(page, MIXED);
    await ready(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, "mixed-sv-720-zoom200");
  });
});

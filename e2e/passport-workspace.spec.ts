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

      // Reads other Passport pages make. Present so a stray navigation in a
      // scenario does not fail for the wrong reason.
      case "getRegulatedCredentialAvailability":
        return ok(route, {
          state: "open",
          jurisdictionCode: "SE",
          subJurisdictionCode: null,
          marketPackCode: "SE-CORE",
          types: [],
        });
      case "listMyEntries":
        return ok(route, { experience: scenario.periods, claims: scenario.claims });
      case "listJurisdictions":
        return ok(route, []);
      case "listSkillTypes":
        return ok(route, []);
      case "getMyProfessionalIdentity":
        return ok(route, null);
      case "getMyPassportProfileBasics":
        return ok(route, null);

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

  test("10 · every CTA lands on a real destination, and none is a dead end", async ({ page }) => {
    await mount(page, MIXED);
    await ready(page);

    const expected: readonly [string, string][] = [
      ['[data-cta="add-merit"]', "/passport/information#sp-employment"],
      ['[data-cta="share"]', "/passport/share"],
      ['[data-use-link="share"]', "/passport/share"],
      ['[data-use-link="cv"]', "/my-career/cv"],
      ['[data-use-link="card"]', "/passport/card"],
      ['[data-merit-row="c-doc"]', "/passport/entry/claim/c-doc"],
      ['[data-merit-row="p-1"]', "/passport/entry/experience/p-1"],
      ['[data-draft-row="c-draft"]', "/passport/credentials/new?draft=c-draft"],
    ];
    for (const [selector, href] of expected) {
      await expect(page.locator(selector), selector).toHaveAttribute("href", href);
    }

    // Every one of them resolves to a page that renders. A 404 or a blank
    // screen behind a working-looking button is the defect this asserts away.
    for (const [selector] of expected) {
      const href = await page.locator(selector).getAttribute("href");
      const response = await page.request.get(`${BASE}${href!.split("#")[0]}`);
      expect(response.status(), href!).toBeLessThan(400);
    }
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

// "Dela Passport", end to end, in a real browser.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/passport-sharing-flow-check.tsx renders the recipient view to
// markup and exercises the selection model as plain objects. It cannot see a
// checkbox that a keyboard cannot reach, a create button that stays disabled
// after a merit is ticked, a clipboard that refuses, a link that leads
// somewhere else, a page that scrolls sideways at 320px, or the moment a lost
// response would have minted a second link. All of those are what this file
// is for.
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
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/passport-sharing.spec.ts
//
// Set PASSPORT_SHOTS=<dir> to also write the review screenshots.

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
const USER_ID = "00000000-0000-4000-8000-0000000000f1";
const SHOT_DIR = process.env.PASSPORT_SHOTS ?? "";
const SHOT_TAG = process.env.PASSPORT_SHOTS_TAG ?? "after";

/* ------------------------------------------------------------------ */
/* Fixtures. Invented people, invented companies.                      */
/* ------------------------------------------------------------------ */

const CLAIM_SHAREABLE = {
  id: "c-vu1",
  claimType: "training",
  credentialCode: "VU1",
  skillCode: null,
  skillLevel: null,
  titleSv: "Väktarutbildning 1 (VU1)",
  titleEn: "Security Guard Training 1 (VU1)",
  issuerName: "Utbildaren AB (fiktiv)",
  jurisdictionCode: "SE",
  subJurisdictionCode: null,
  authorisationScope: null,
  issuedOn: "2024-03-01",
  validFrom: "2024-03-01",
  validUntil: null,
  assertionLevel: "verified",
  lifecycleState: "active",
  versionNo: 1,
  supersedesId: null,
  verifierName: "CQrityjob",
  verificationMethod: "document_review",
  verifiedOn: "2024-03-10",
  limitationSv: null,
  limitationEn: null,
};

const CLAIM_SELF_REPORTED = {
  ...CLAIM_SHAREABLE,
  id: "c-self",
  credentialCode: null,
  titleSv: "Egen anteckning (fiktiv)",
  titleEn: "Own note (fictional)",
  assertionLevel: "self_declared",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
};

const CLAIM_ARCHIVED = {
  ...CLAIM_SHAREABLE,
  id: "c-old",
  titleSv: "Gammal utbildning (fiktiv)",
  titleEn: "Old training (fictional)",
  lifecycleState: "superseded",
};

const PERIOD_SHAREABLE = {
  id: "p-nordvakt",
  employerName: "Nordvakt AB (fiktiv)",
  roleTitle: "Väktare",
  cigProfessionSlug: null,
  jurisdictionCode: "SE",
  employmentType: null,
  fteFraction: null,
  securityRelevance: null,
  securityFraction: null,
  startedOn: "2021-01-01",
  endedOn: "2023-01-01",
  assertionLevel: "verified",
  lifecycleState: "active",
  verifierName: "Nordvakt AB (fiktiv)",
  verificationMethod: "employer_confirmation",
  verifiedOn: "2023-02-01",
};

const SNAPSHOT = {
  profile: {
    displayName: "Selma Delare (fiktiv)",
    headline: null,
    cigProfessionSlug: null,
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    workLocationConfirmedAt: "2026-01-01T00:00:00Z",
    privacyMode: "full_name",
    onboardingState: "completed",
    onboardingStep: null,
    onboardingAnswers: null,
    onboardingDraftRevision: 0,
    questionVersion: 1,
    declaredAccurateAt: "2026-01-01T00:00:00Z",
    recognitionPolicyVersion: 1,
    updatedAt: "2026-09-01T00:00:00Z",
  },
  holder: {
    claims: [CLAIM_SHAREABLE, CLAIM_SELF_REPORTED, CLAIM_ARCHIVED],
    periods: [PERIOD_SHAREABLE],
    recognitions: [],
    skills: [],
  },
  rules: [],
  eventCount: 3,
};

/** The payload sp_selected_merits_payload builds for the two ticked merits. */
function recipientPayload(locale: "sv" | "en") {
  return {
    status: "active",
    package: "selected_merits",
    focus: "passport",
    purpose: null,
    locale,
    expires_at: "2026-10-07T09:00:00Z",
    authorised_at: "2026-09-07T09:00:00Z",
    last_updated: "2026-09-07T09:00:00Z",
    holder: "Selma Delare (fiktiv)",
    privacy_mode: "full_name",
    profession_slug: null,
    jurisdiction: "SE",
    sub_jurisdiction: null,
    verified_claims: [
      {
        id: "c-vu1",
        type: "training",
        title: "Väktarutbildning 1 (VU1)",
        credential_code: "VU1",
        issuer: "Utbildaren AB (fiktiv)",
        jurisdiction: "SE",
        sub_jurisdiction: null,
        scope_limited: false,
        authorisation_scope: null,
        issued_on: "2024-03-01",
        valid_until: null,
        assertion: "verified",
        lifecycle: "active",
        verified_at: "2024-03-10T00:00:00Z",
        verifier_organisation: "CQrityjob",
        verification_method: "document_review",
      },
    ],
    verified_experience: [
      {
        id: "p-nordvakt",
        employer: "Nordvakt AB (fiktiv)",
        role: "Väktare",
        started_on: "2021-01-01",
        ended_on: "2023-01-01",
        jurisdiction: "SE",
        assertion: "verified",
        lifecycle: "active",
        verifier_organisation: "Nordvakt AB (fiktiv)",
        verification_method: "employer_confirmation",
      },
    ],
    verified_experience_days: 731,
  };
}

const SHARE_ROW = {
  id: "d-1",
  createdAt: "2026-09-01T09:00:00Z",
  expiresAt: "2026-10-01T09:00:00Z",
  revokedAt: null,
  accessCount: 3,
  state: "active",
  meritCount: 2,
  currentMeritCount: 2,
};

/* ------------------------------------------------------------------ */
/* Mount                                                               */
/* ------------------------------------------------------------------ */

interface Scenario {
  readonly shares?: unknown[];
  readonly passportFails?: boolean;
  readonly sharesFail?: boolean;
  readonly previewFails?: boolean;
  /** The create commits but the answer is lost; the retry reconciles. */
  readonly createAlreadyExists?: boolean;
  readonly createFails?: boolean;
  readonly noClipboard?: boolean;
  readonly noMerits?: boolean;
  readonly lang?: "sv" | "en";
  /** For the public page. */
  readonly publicPayload?: unknown;
}

let unmatched: string[] = [];
let pageErrors: string[] = [];
let createCalls = 0;
let lastCreateBody = "";

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

async function mount(page: Page, urlPath: string, scenario: Scenario) {
  unmatched = [];
  pageErrors = [];
  createCalls = 0;
  lastCreateBody = "";
  const lang = scenario.lang ?? "sv";

  await page.addInitScript(
    ({ ref, lang, userId, noClipboard }) => {
      try {
        window.localStorage.setItem("cqrityjob.lang", lang);
        window.localStorage.setItem("lang", lang);
        window.localStorage.setItem(
          `sb-${ref}-auth-token`,
          JSON.stringify({
            access_token: "e2e-access-token",
            refresh_token: "e2e-refresh-token",
            token_type: "bearer",
            expires_in: 3600 * 24 * 365,
            expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
            user: {
              id: userId,
              aud: "authenticated",
              email: "sharing@example.test",
              user_metadata: { display_name: "Selma" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* ignore */
      }
      if (noClipboard) {
        // The ordinary case this must survive: an insecure context, a denied
        // permission, an old browser. The page must offer a way through.
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          get: () => undefined,
        });
      }
    },
    { ref: SUPABASE_REF, lang, userId: USER_ID, noClipboard: scenario.noClipboard === true },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    switch (name) {
      case "getMyPassport":
        if (scenario.passportFails) return boom(route, "passport read failed");
        return ok(
          route,
          scenario.noMerits
            ? {
                ...SNAPSHOT,
                holder: { ...SNAPSHOT.holder, claims: [CLAIM_SELF_REPORTED], periods: [] },
              }
            : SNAPSHOT,
        );

      case "listMyVerificationRequests":
        return ok(route, { requests: [], decisions: [] });

      case "listMyShares":
        if (scenario.sharesFail) return boom(route, "share read failed");
        return ok(route, scenario.shares ?? []);

      case "previewSelectedShare":
        if (scenario.previewFails) return boom(route, "preview failed");
        return ok(route, recipientPayload(scenario.lang === "en" ? "en" : "sv"));

      case "createSelectedShare": {
        createCalls += 1;
        lastCreateBody = route.request().postData() ?? "";
        if (scenario.createFails) return boom(route, "create failed");
        if (scenario.createAlreadyExists) {
          return ok(route, {
            status: "already_created",
            disclosureId: "d-1",
            expiresAt: "2026-10-07T09:00:00Z",
          });
        }
        return ok(route, {
          status: "created",
          token: "a".repeat(64),
          disclosureId: "d-2",
          expiresAt: "2026-10-07T09:00:00Z",
        });
      }

      case "revokeShare":
        return ok(route, { ok: true });

      case "getPublicDisclosureFromCookie":
        return ok(route, scenario.publicPayload ?? { status: "unavailable" });

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

  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        aud: "authenticated",
        email: "sharing@example.test",
        user_metadata: { display_name: "Selma" },
        app_metadata: {},
      }),
    }),
  );

  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}${urlPath}`, { waitUntil: "domcontentloaded" });
}

async function shareReady(page: Page) {
  await expect(page.locator("[data-share-screen]")).toBeVisible({ timeout: 30_000 });
  expect(unmatched, `unstubbed server functions: ${unmatched.join(", ")}`).toEqual([]);
}

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
   The holder
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Security Passport — sharing, as the holder", () => {
  test.describe.configure({ timeout: 90_000 });

  test("1 · only shareable merits are offered, nothing is preselected", async ({ page }) => {
    await mount(page, "/passport/share", {});
    await shareReady(page);

    await expect(page.locator("h1")).toHaveCount(1);

    // The two groups that have something in them, and no empty third.
    await expect(page.locator('[data-share-group="employment"]')).toBeVisible();
    await expect(page.locator('[data-share-group="qualification"]')).toBeVisible();
    await expect(page.locator('[data-share-group="authorisation"]')).toHaveCount(0);

    // The shareable merits, and NOT the self-reported or archived ones.
    await expect(page.locator('[data-merit-option="claim:c-vu1"]')).toBeVisible();
    await expect(page.locator('[data-merit-option="experience:p-nordvakt"]')).toBeVisible();
    await expect(page.locator('[data-merit-option="claim:c-self"]')).toHaveCount(0);
    await expect(page.locator('[data-merit-option="claim:c-old"]')).toHaveCount(0);

    // Nothing chosen for the holder, and no link until they choose.
    expect(await page.locator('[data-share-screen] input[type="checkbox"]:checked').count()).toBe(
      0,
    );
    await expect(page.locator("[data-share-cta]")).toBeDisabled();

    // Each row carries the canonical trust word, from the shared labeller.
    await expect(
      page.locator('[data-merit-option="claim:c-vu1"] [data-merit-status]'),
    ).toHaveAttribute("data-merit-status", "documented");
    await expect(
      page.locator('[data-merit-option="experience:p-nordvakt"] [data-merit-status]'),
    ).toHaveAttribute("data-merit-status", "verified");

    expect(pageErrors).toEqual([]);
    await shoot(page, "share-select-sv");
  });

  test("2 · the preview is the recipient page, with exactly what was ticked", async ({ page }) => {
    await mount(page, "/passport/share", {});
    await shareReady(page);

    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await page.locator('[data-merit-option="experience:p-nordvakt"] input').check();
    await expect(page.locator("[data-share-cta]")).toBeEnabled();

    await page.getByRole("button", { name: /Förhandsgranska mottagarens vy/ }).click();
    await expect(page.locator("[data-share-preview] [data-recipient-view]")).toBeVisible({
      timeout: 20_000,
    });

    // Exactly the two, and the merits that were not ticked appear nowhere.
    await expect(page.locator("[data-share-preview] [data-recipient-credential]")).toHaveCount(1);
    await expect(
      page.locator('[data-share-preview] [data-recipient-credential="c-vu1"]'),
    ).toBeVisible();
    await expect(page.locator("[data-share-preview] [data-recipient-employment]")).toHaveCount(1);
    await expect(page.locator("[data-share-preview]")).not.toContainText("Egen anteckning");
    await expect(page.locator("[data-share-preview]")).not.toContainText("Gammal utbildning");

    // The trust words the recipient reads.
    await expect(page.locator("[data-share-preview]")).toContainText("Vad orden betyder");
    await expect(page.locator("[data-share-preview]")).toContainText(
      "Anställningen är bekräftad av Nordvakt AB (fiktiv)",
    );
    // A CQrityjob review is never dressed as source confirmation.
    await expect(
      page.locator('[data-share-preview] [data-recipient-credential="c-vu1"]'),
    ).not.toContainText("Källbekräftad");

    expect(pageErrors).toEqual([]);
    await shoot(page, "share-preview-sv");
  });

  test("3 · creating a link: copy, open, expiry, and a way back", async ({ page }) => {
    await mount(page, "/passport/share", {});
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();

    await page.locator("[data-share-cta]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 20_000 });

    // The link the holder actually sends, on the canonical public origin.
    const link = await page.locator("[data-share-link]").inputValue();
    expect(link).toMatch(/\/p\/[0-9a-f]{64}$/);

    // The expiry the holder chose, stated — as a localised date, because an
    // ISO string is not what a person reads.
    await expect(page.locator("[data-share-created]")).toContainText("7 oktober 2026");

    // Both onward doors, and neither of them a dead end.
    const open = page.getByRole("link", { name: /Öppna mottagarens vy/ });
    await expect(open).toHaveAttribute("href", link);
    await expect(page.getByRole("link", { name: /Tillbaka till mitt Passport/ })).toHaveAttribute(
      "href",
      "/passport",
    );

    // The copy confirmation is a state change, not a hope.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: /^Kopiera länk$/ }).click();
    await expect(page.getByRole("button", { name: /^Kopierad$/ })).toBeVisible();

    expect(pageErrors).toEqual([]);
    await shoot(page, "share-created-sv");
  });

  test("4 · a blocked clipboard offers a usable way through", async ({ page }) => {
    await mount(page, "/passport/share", { noClipboard: true });
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await page.locator("[data-share-cta]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^Kopiera länk$/ }).click();
    await expect(page.getByRole("alert")).toContainText("kopiera den för hand");
    // The link is selected in a field the holder can copy from by hand.
    await expect(page.locator("[data-share-link]")).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test("5 · a lost response reconciles instead of minting a second link", async ({ page }) => {
    await mount(page, "/passport/share", { createAlreadyExists: true, shares: [SHARE_ROW] });
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await page.locator("[data-share-cta]").click();

    await expect(page.locator("[data-share-already]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-share-already]")).toContainText("Länken skapades redan");
    // No token is offered, because none can be: only the hash was stored.
    await expect(page.locator("[data-share-link]")).toHaveCount(0);
    expect(createCalls).toBe(1);
    expect(lastCreateBody).toContain("requestKey");
    expect(pageErrors).toEqual([]);
  });

  test("6 · a failed create keeps the same request key, so a retry cannot duplicate", async ({
    page,
  }) => {
    await mount(page, "/passport/share", { createFails: true });
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();

    // The body is seroval, not JSON, so the key is read out of the raw text.
    // A uuid is unmistakable there and this is asserting IDENTITY, not shape.
    const keyIn = (body: string) =>
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(body)?.[0] ?? null;

    await page.locator("[data-share-cta]").click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    const first = keyIn(lastCreateBody);

    await page.locator("[data-share-cta]").click();
    await expect.poll(() => createCalls).toBe(2);
    const second = keyIn(lastCreateBody);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(pageErrors).toEqual([]);
  });

  test("7 · existing links: states, revocation, and no false read receipt", async ({ page }) => {
    await mount(page, "/passport/share", {
      shares: [
        SHARE_ROW,
        { ...SHARE_ROW, id: "d-2", state: "expired" },
        { ...SHARE_ROW, id: "d-3", state: "revoked", revokedAt: "2026-09-02T09:00:00Z" },
        { ...SHARE_ROW, id: "d-4", meritCount: 3, currentMeritCount: 2 },
      ],
    });
    await shareReady(page);

    await expect(page.locator('[data-share-row="d-1"]')).toHaveAttribute(
      "data-share-state",
      "active",
    );
    await expect(page.locator('[data-share-row="d-2"]')).toHaveAttribute(
      "data-share-state",
      "expired",
    );
    await expect(page.locator('[data-share-row="d-3"]')).toHaveAttribute(
      "data-share-state",
      "revoked",
    );

    // Only an active link can be revoked.
    await expect(page.locator('[data-share-revoke="d-1"]')).toBeVisible();
    await expect(page.locator('[data-share-revoke="d-2"]')).toHaveCount(0);
    await expect(page.locator('[data-share-revoke="d-3"]')).toHaveCount(0);

    // A share whose selection has partly lapsed says so.
    await expect(page.locator('[data-share-row="d-4"]')).toContainText("är inte längre aktuell");

    // Opens are opens, never "the recipient read it".
    await expect(page.locator("[data-share-screen]")).toContainText("inte ett kvitto");

    await page.locator('[data-share-revoke="d-1"]').click();
    await expect.poll(() => unmatched).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("8 · keyboard only, from choosing a merit to revoking a link", async ({ page }) => {
    await mount(page, "/passport/share", { shares: [SHARE_ROW] });
    await shareReady(page);

    // Reach the first checkbox by keyboard alone and tick it with Space.
    const box = page.locator('[data-merit-option="experience:p-nordvakt"] input');
    await box.focus();
    await expect(box).toBeFocused();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();
    await expect(page.locator("[data-share-cta]")).toBeEnabled();

    // Create with Enter from the button itself.
    await page.locator("[data-share-cta]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 20_000 });

    // Revoke, also by keyboard.
    const revoke = page.locator('[data-share-revoke="d-1"]');
    await revoke.focus();
    await expect(revoke).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => unmatched).toEqual([]);

    // Every interactive target is at least 44px tall.
    const short = await page.evaluate(() =>
      [...document.querySelectorAll("[data-share-screen] button, [data-share-screen] a")]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => el.textContent?.trim().slice(0, 40) ?? "?"),
    );
    expect(short).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("9 · failure states say what happened and offer a way on", async ({ page }) => {
    await mount(page, "/passport/share", { passportFails: true });
    await expect(page.getByRole("alert")).toContainText("kunde inte hämta ditt Security Passport", {
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Försök igen/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tillbaka till mitt Passport/ })).toBeVisible();

    await mount(page, "/passport/share", { sharesFail: true });
    await shareReady(page);
    await expect(page.getByRole("alert")).toContainText("kunde inte hämta dina delningslänkar");

    await mount(page, "/passport/share", { previewFails: true });
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await page.getByRole("button", { name: /Förhandsgranska mottagarens vy/ }).click();
    await expect(page.locator("[data-share-preview]")).toContainText(
      "kunde inte visa mottagarens vy",
      { timeout: 20_000 },
    );
    // The failure costs the preview, never the link.
    await expect(page.locator("[data-share-cta]")).toBeEnabled();

    await mount(page, "/passport/share", { noMerits: true });
    await shareReady(page);
    await expect(page.locator("[data-share-screen]")).toContainText("inget att dela ännu");
    await expect(page.locator("[data-share-cta]")).toBeDisabled();
    expect(pageErrors).toEqual([]);
    await shoot(page, "share-empty-sv");
  });

  test("10 · the screen fits every width, and 200% zoom", async ({ page }) => {
    await mount(page, "/passport/share", { shares: [SHARE_ROW] });
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await page.getByRole("button", { name: /Förhandsgranska mottagarens vy/ }).click();
    await expect(page.locator("[data-share-preview] [data-recipient-view]")).toBeVisible({
      timeout: 20_000,
    });

    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await horizontalOverflow(page),
        `horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }

    // 200% zoom, emulated the way a browser's own zoom behaves: half the
    // CSS pixels, same content.
    await page.setViewportSize({ width: 720, height: 900 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
    await shoot(page, "share-zoom-200");
  });

  test("11 · English renders completely", async ({ page }) => {
    await mount(page, "/passport/share", { lang: "en", shares: [SHARE_ROW] });
    await shareReady(page);
    await expect(page.locator("h1")).toHaveText("Share your Security Passport");
    await expect(page.locator("[data-share-screen]")).toContainText("Employment");
    await expect(page.locator("[data-share-screen]")).toContainText(
      "Training, courses and certificates",
    );
    await expect(page.locator("[data-share-screen]")).not.toContainText("Anställningar");
    expect(pageErrors).toEqual([]);
    await shoot(page, "share-select-en");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   The recipient
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Security Passport — the recipient link", () => {
  test.describe.configure({ timeout: 90_000 });

  test("12 · an active link explains itself before it shows anything", async ({ page }) => {
    await mount(page, "/p/abcdef0123456789", { publicPayload: recipientPayload("sv") });
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("[data-recipient-view]")).toContainText("Selma Delare (fiktiv)");
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "innehavaren har valt att dela",
    );
    await expect(page.locator("[data-recipient-view]")).toContainText("Vad orden betyder");
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "Anställningen är bekräftad av Nordvakt AB (fiktiv)",
    );
    // The public explanation of what a Security Passport is.
    await expect(page.getByRole("link", { name: /Läs mer/ })).toHaveAttribute("href", "/#passport");
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-sv");
  });

  test("13 · the share's own language wins over the reader's", async ({ page }) => {
    // The visitor's stored preference is Swedish; the holder chose English.
    await mount(page, "/p/abcdef0123456789", { lang: "sv", publicPayload: recipientPayload("en") });
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-recipient-view]")).toContainText("What the words mean");
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "Employment confirmed by Nordvakt AB (fiktiv)",
    );
    await expect(page.locator("[data-recipient-view]")).not.toContainText("Vad orden betyder");
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-en");
  });

  test("14 · an expired, revoked or invalid link is one safe, identical page", async ({ page }) => {
    await mount(page, "/p/abcdef0123456789", { publicPayload: { status: "unavailable" } });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("main")).toContainText("Länken är inte tillgänglig");
    await expect(page.locator("main")).toContainText("Be personen om en ny länk");
    await expect(page.locator("main")).toContainText("säger ingenting om personen");
    // Nothing about an account, a holder or an id.
    await expect(page.locator("main")).not.toContainText("Selma");
    await expect(page.locator("main")).not.toContainText("abcdef0123456789");
    await expect(page.locator("[data-recipient-view]")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-unavailable");
  });

  test("15 · the recipient page fits every width", async ({ page }) => {
    await mount(page, "/p/abcdef0123456789", { publicPayload: recipientPayload("sv") });
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await horizontalOverflow(page),
        `horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await shoot(page, "recipient-375");
    expect(pageErrors).toEqual([]);
  });
});

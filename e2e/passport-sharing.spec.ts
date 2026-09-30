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
import { fromJSON } from "seroval";
import { passportT } from "../src/lib/security-passport/i18n";
import { deriveVerifiedIdentity } from "../src/lib/security-passport/identity/visibility";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SUPABASE_REF = process.env.E2E_SUPABASE_REF ?? "wrygicdfxwjnrugduxnt";
const USER_ID = "00000000-0000-4000-8000-0000000000f1";
const SHOT_DIR = process.env.PASSPORT_SHOTS ?? "";
const SHOT_TAG = process.env.PASSPORT_SHOTS_TAG ?? "after";

/* ------------------------------------------------------------------ */
/* Fixtures. Invented people, invented companies.                      */
/* ------------------------------------------------------------------ */

const CLAIM_SHAREABLE = {
  id: "c-vu1",
  claimType: "training",
  credentialCode: "OV_TRAINING",
  skillCode: null,
  skillLevel: null,
  titleSv: "Ordningsvaktsutbildning (grundutbildning)",
  titleEn: "Public Order Guard Basic Training",
  issuerName: "Polismyndigheten",
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
  claimType: "certification",
  credentialCode: "INTL_ASIS_CPP",
  titleSv: "Certified Protection Professional (CPP)",
  titleEn: "Certified Protection Professional (CPP)",
  assertionLevel: "self_declared",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
};

/** Four current credentials in three controlled scopes -- Sweden twice, an
 *  international certification and a Great Britain licence -- for the ONE
 *  Passport image: more than the three the old drawing held, grouped. */
const CLAIM_VU1 = {
  ...CLAIM_SHAREABLE,
  id: "c-vu1-training",
  credentialCode: "VU1",
  titleSv: "Väktarutbildning 1",
  titleEn: "Security Guard Training 1",
  assertionLevel: "self_declared",
  verifierName: null,
  verificationMethod: null,
  verifiedOn: null,
};
const CLAIM_SIA = {
  ...CLAIM_SELF_REPORTED,
  id: "c-sia",
  claimType: "licence",
  credentialCode: null,
  titleSv: "SIA Licence — Security Guarding",
  titleEn: "SIA Licence — Security Guarding",
  jurisdictionCode: "GB",
};
const FOUR_CLAIMS = [CLAIM_SHAREABLE, CLAIM_VU1, CLAIM_SELF_REPORTED, CLAIM_SIA];

/** The densest realistic Passport: eleven current credentials in three
 *  controlled scopes -- four Swedish, five international, two Dubai. */
const ownClaim = (
  id: string,
  code: string | null,
  title: string,
  over: Record<string, unknown> = {},
) => ({
  ...CLAIM_VU1,
  id,
  credentialCode: code,
  titleSv: title,
  titleEn: title,
  ...over,
});
const ELEVEN_CLAIMS = [
  CLAIM_VU1,
  ownClaim("c-vu2", "VU2", "Väktarutbildning 2"),
  ownClaim("c-ov", "OV", "Ordningsvaktsförordnande"),
  ownClaim("c-sv", "SV", "Skyddsvaktsutbildning"),
  CLAIM_SELF_REPORTED,
  ownClaim("c-psp", "INTL_ASIS_PSP", "Physical Security Professional (PSP)", {
    jurisdictionCode: null,
  }),
  ownClaim("c-pci", "INTL_ASIS_PCI", "Professional Certified Investigator (PCI)", {
    jurisdictionCode: null,
  }),
  ownClaim("c-cc", "INTL_ISC2_CC", "Certified in Cybersecurity (CC)", { jurisdictionCode: null }),
  ownClaim("c-cams", "INTL_ACAMS_CAMS", "Certified Anti-Money Laundering Specialist (CAMS)", {
    jurisdictionCode: null,
  }),
  ownClaim("c-sira-g", "AE_DU_SIRA_CARD_GUARD", "SIRA Security Cadre Card — Security Guard", {
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
  }),
  ownClaim("c-sira-s", "AE_DU_SIRA_CARD_SUP", "SIRA Security Cadre Card — Security Supervisor", {
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
  }),
];

const CLAIM_DRAFT = {
  ...CLAIM_SHAREABLE,
  id: "c-draft",
  credentialCode: null,
  titleSv: "Påbörjat utkast (fiktivt)",
  titleEn: "Unfinished draft (fictional)",
  assertionLevel: "self_declared",
  lifecycleState: "draft",
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
    claims: [CLAIM_SHAREABLE, CLAIM_SELF_REPORTED, CLAIM_DRAFT, CLAIM_ARCHIVED],
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
    last_updated: "2026-08-30T09:00:00Z",
    holder: "Selma Delare (fiktiv)",
    privacy_mode: "full_name",
    profession_slug: null,
    jurisdiction: "SE",
    sub_jurisdiction: null,
    checked_at: "2026-09-07T07:00:00Z",
    verified_claims: [
      {
        key: "c1",
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
      {
        key: "c2",
        type: "training",
        title: "Egen anteckning (fiktiv)",
        credential_code: null,
        issuer: "Ingen",
        jurisdiction: "SE",
        sub_jurisdiction: null,
        scope_limited: false,
        authorisation_scope: null,
        issued_on: "2025-02-01",
        valid_until: null,
        assertion: "self_declared",
        lifecycle: "active",
        verified_at: null,
        verifier_organisation: null,
        verification_method: null,
      },
    ],
    verified_experience: [
      {
        key: "e1",
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

/** The payload for the four ticked credentials, as the image reads it: the
 *  definition's scope_code decides the international group. */
function fourCredentialPayload(locale: "sv" | "en") {
  const base = recipientPayload(locale);
  const own = (key: string, title: string, code: string | null, over: Record<string, unknown>) => ({
    ...base.verified_claims[1]!,
    key,
    title,
    credential_code: code,
    scope_code: "national_regulated",
    ...over,
  });
  return {
    ...base,
    verified_claims: [
      { ...base.verified_claims[0]!, scope_code: "national_regulated" },
      own("c-vu1-training", "Väktarutbildning 1", "VU1", {}),
      own("c-self", "Certified Protection Professional (CPP)", "INTL_ASIS_CPP", {
        jurisdiction: null,
        scope_code: "global_professional",
      }),
      own("c-sia", "SIA Licence — Security Guarding", null, { jurisdiction: "GB" }),
    ],
    verified_experience: [],
    verified_experience_days: 0,
  };
}

/** The payload for the eleven ticked credentials. */
function elevenCredentialPayload(locale: "sv" | "en") {
  const base = recipientPayload(locale);
  const global = new Set(["c-self", "c-psp", "c-pci", "c-cc", "c-cams"]);
  return {
    ...base,
    verified_claims: ELEVEN_CLAIMS.map((c) => ({
      ...base.verified_claims[1]!,
      key: c.id,
      title: c.titleSv,
      credential_code: c.credentialCode,
      jurisdiction: global.has(c.id) ? null : c.jurisdictionCode,
      sub_jurisdiction: c.subJurisdictionCode ?? null,
      scope_code: global.has(c.id) ? "global_professional" : "national_regulated",
    })),
    verified_experience: [],
    verified_experience_days: 0,
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
  /** The verification-request read fails: every merit's review state becomes
   *  unknown, and the screen has to say so rather than fall back to a settled
   *  word. */
  readonly reviewFails?: boolean;
  readonly reissueFails?: boolean;
  readonly reissueLapsed?: boolean;
  readonly reissueAlreadyExists?: boolean;
  readonly lang?: "sv" | "en";
  /** For the public page. */
  readonly publicPayload?: unknown;
  /** Four current credentials in three scopes, and a preview that returns
   *  exactly them: the ONE-Passport image scenario. Also gives the page a
   *  share sheet that takes files, and records what it and window.open get. */
  readonly fourCredentials?: boolean;
  /** Eleven current credentials in three scopes: the densest realistic
   *  holder, on ONE image. Same share sheet and window.open recording. */
  readonly elevenCredentials?: boolean;
}

interface SharedRecord {
  readonly files: readonly { readonly name: string; readonly type: string; readonly png: string }[];
  readonly text: string | null;
  readonly url: string | null;
}

let unmatched: string[] = [];
let pageErrors: string[] = [];
let createCalls = 0;
let lastCreateBody = "";
let reissueCalls = 0;
let lastReissueBody = "";

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

/**
 * What the page actually sent.
 *
 * A server-function request body is SEROVAL, not JSON: `true` arrives as
 * `{"t":2,"s":2}`, so `body.includes("true")` is always false and a stub that
 * looks for it silently reports the wrong flag. seroval's own reviver is the
 * only stable way to read one — the wire format is its internal business and
 * has no contract with this file.
 */
function serverFnArgs(body: string | null): Record<string, unknown> {
  if (!body) return {};
  try {
    const revived = fromJSON(JSON.parse(body) as never) as { data?: Record<string, unknown> };
    return revived?.data ?? {};
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

async function mount(page: Page, urlPath: string, scenario: Scenario) {
  unmatched = [];
  pageErrors = [];
  createCalls = 0;
  lastCreateBody = "";
  reissueCalls = 0;
  lastReissueBody = "";
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
        if (scenario.fourCredentials || scenario.elevenCredentials)
          return ok(route, {
            ...SNAPSHOT,
            holder: {
              ...SNAPSHOT.holder,
              // The image reads the holder's derived identity, as the real
              // snapshot carries it; the link-only scenarios never needed it.
              id: USER_ID,
              displayName: SNAPSHOT.profile.displayName,
              professionSlug: null,
              jurisdictionCode: "SE",
              subJurisdictionCode: null,
              identity: deriveVerifiedIdentity([], MIRRORED_TITLE_RULES, "2026-09-07"),
              claims: scenario.elevenCredentials ? ELEVEN_CLAIMS : FOUR_CLAIMS,
              periods: [],
            },
          });
        return ok(
          route,
          scenario.noMerits
            ? {
                ...SNAPSHOT,
                // A DRAFT and an ARCHIVED merit. Both are real rows the
                // holder owns, and neither may ever be shared — which is what
                // makes this the empty state rather than an error. A
                // self-declared merit no longer belongs here: it IS shareable.
                holder: { ...SNAPSHOT.holder, claims: [CLAIM_DRAFT, CLAIM_ARCHIVED], periods: [] },
              }
            : SNAPSHOT,
        );

      case "listMyVerificationRequests":
        if (scenario.reviewFails) return boom(route, "verification read failed");
        return ok(route, { requests: [], decisions: [] });

      case "listMyShares":
        if (scenario.sharesFail) return boom(route, "share read failed");
        return ok(route, scenario.shares ?? []);

      case "previewCredentialShare":
        if (scenario.previewFails) return boom(route, "preview failed");
        if (scenario.fourCredentials || scenario.elevenCredentials)
          return ok(route, {
            ...(scenario.elevenCredentials ? elevenCredentialPayload : fourCredentialPayload)(
              scenario.lang === "en" ? "en" : "sv",
            ),
            schema_version: 2,
            holder: null,
            privacy_mode: "full_name",
          });
        return ok(route, {
          ...recipientPayload(scenario.lang === "en" ? "en" : "sv"),
          schema_version: 2,
          holder: null,
          privacy_mode: "anonymous",
          verified_experience: [],
          verified_experience_days: 0,
        });

      case "createCredentialShare": {
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

      case "replaceShare": {
        reissueCalls += 1;
        lastReissueBody = route.request().postData() ?? "";
        if (scenario.reissueLapsed) return boom(route, "SP_MERIT_NOT_SHAREABLE: lapsed");
        if (scenario.reissueFails) return boom(route, "reissue failed");
        if (scenario.reissueAlreadyExists) {
          return ok(route, {
            status: "already_created",
            disclosureId: "d-9",
            expiresAt: "2026-10-07T09:00:00Z",
          });
        }
        return ok(route, {
          status: "created",
          token: "b".repeat(64),
          disclosureId: "d-9",
          expiresAt: "2026-10-07T09:00:00Z",
          // Echoed back from what the page SENT, so the assertion downstream
          // is about the flag travelling and not about the stub's own opinion.
          previousRevoked: serverFnArgs(lastReissueBody).revokePrevious === true,
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

  await page.route(/^https?:\/\/[^/]+\/(?:auth|rest)\/v1\//, async (route) =>
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

  if (scenario.fourCredentials || scenario.elevenCredentials) {
    await page.addInitScript(() => {
      const w = window as unknown as { __opened: string[]; __shared: SharedRecord[] };
      w.__opened = [];
      w.__shared = [];
      window.open = ((url?: string | URL) => {
        w.__opened.push(String(url));
        return null;
      }) as typeof window.open;
      const dataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: (data?: ShareData) => Boolean(data?.files?.length),
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          w.__shared.push({
            files: await Promise.all(
              (data.files ?? []).map(async (f) => ({
                name: f.name,
                type: f.type,
                png: await dataUrl(f),
              })),
            ),
            text: data.text ?? null,
            url: data.url ?? null,
          });
        },
      });
    });
  }

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
  // The owner reviews at roughly 1440 and 390: a desktop run is widened for
  // its pictures; a phone project keeps its own viewport.
  const size = page.viewportSize();
  if (size && size.width > 600 && size.width !== 1440)
    await page.setViewportSize({ width: 1440, height: 900 });
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
    await expect(page.locator('[data-share-group="employment"]')).toHaveCount(0);
    await expect(page.locator('[data-share-group="qualification"]')).toBeVisible();
    await expect(page.locator('[data-share-group="authorisation"]')).toHaveCount(0);

    // EVERY current merit, at whatever standing it has — including the one
    // nobody has checked. Drafts and archived rows are never offered.
    await expect(page.locator('[data-merit-option="claim:c-vu1"]')).toBeVisible();
    await expect(page.locator('[data-merit-option="experience:p-nordvakt"]')).toHaveCount(0);
    await expect(page.locator('[data-merit-option="claim:c-self"]')).toBeVisible();
    await expect(page.locator('[data-merit-option="claim:c-draft"]')).toHaveCount(0);
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
    await expect(page.locator("[data-share-screen]")).not.toContainText("Nordvakt AB (fiktiv)");
    // The self-declared one wears its own word, so the list itself keeps the
    // holder from thinking everything on it is checked.
    await expect(
      page.locator('[data-merit-option="claim:c-self"] [data-merit-status]'),
    ).toHaveAttribute("data-merit-status", "added_by_you");

    expect(pageErrors).toEqual([]);
    await shoot(page, "share-select-sv");
  });

  test("2 · the preview is the recipient page, with exactly what was ticked", async ({ page }) => {
    await mount(page, "/passport/share", {});
    await shareReady(page);

    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await page.locator('[data-merit-option="claim:c-self"] input').check();
    await expect(page.locator("[data-share-cta]")).toBeEnabled();

    await page.getByRole("button", { name: /Förhandsgranska mottagarens vy/ }).click();
    await expect(page.locator("[data-share-preview] [data-recipient-view]")).toBeVisible({
      timeout: 20_000,
    });

    // Exactly the two, and the merits that were not ticked appear nowhere.
    await expect(page.locator("[data-share-preview] [data-recipient-credential]")).toHaveCount(2);
    await expect(
      page.locator('[data-share-preview] [data-recipient-credential="c1"]'),
    ).toBeVisible();
    await expect(page.locator("[data-share-preview] [data-recipient-employment]")).toHaveCount(0);
    await expect(page.locator("[data-share-preview]")).not.toContainText("Påbörjat utkast");
    await expect(page.locator("[data-share-preview]")).not.toContainText("Gammal utbildning");

    // The trust words the recipient reads.
    await expect(page.locator("[data-share-preview]")).toContainText("Vad orden betyder");
    await expect(page.locator("[data-share-preview]")).not.toContainText("Nordvakt AB (fiktiv)");
    await expect(page.locator("[data-share-preview]")).not.toContainText("Selma Delare (fiktiv)");
    // A CQrityjob review is never dressed as source confirmation, and the
    // holder's own entry is never dressed as either.
    await expect(
      page.locator('[data-share-preview] [data-recipient-credential="c1"]'),
    ).not.toContainText("Källbekräftad");
    await expect(
      page.locator('[data-share-preview] [data-recipient-credential="c2"]'),
    ).not.toContainText("Dokumenterad");

    // NO DATABASE IDENTIFIER reaches the DOM — not as text, not as an
    // attribute. The uuid shape is what is forbidden, not a particular id.
    const previewHtml = (await page.locator("[data-share-preview]").innerHTML()) ?? "";
    expect(previewHtml).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    expect(pageErrors).toEqual([]);
    await shoot(page, "share-preview-sv");
  });

  test("3 · creating a link: copy, open, expiry, and a way back", async ({ page }) => {
    await mount(page, "/passport/share", {});
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();

    await page.locator("[data-share-cta]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 20_000 });

    // ── A STALE ASSERTION, RED SINCE #207 ──────────────────────────
    //
    // This asserted `<origin>/p/<64 hex>`, which is the shape the link had
    // BEFORE the private share transport landed. #207 moved the durable
    // bearer token into the URL FRAGMENT behind the Supabase gateway —
    // `<gateway>/functions/v1/passport-share#<token>` — precisely so the
    // token never appears in a request line, a server log or a Referer
    // header. The product was right and this line was a release behind it.
    //
    // Both halves are asserted now: the entry path AND the token in the
    // fragment. A regression to a path-carried token fails the second
    // half, which is the half that matters.
    //
    // The entry is now the application's own domain, `/p#<token>` (the
    // owner's requested outcome, PR 5): the server answers `GET /p` with a
    // body-less redirect to the same gateway, and the browser carries the
    // fragment across. The token is still never in a path or a query.
    const link = await page.locator("[data-share-link]").inputValue();
    expect(link).toMatch(/^https:\/\/[^/]+\/p#[0-9a-f]{64}$/);
    expect(link).not.toMatch(/\/p\/[0-9a-f]{64}/);
    expect(new URL(link).search).toBe("");

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
    expect(serverFnArgs(lastCreateBody).requestKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(pageErrors).toEqual([]);
  });

  test("6 · a failed create keeps the same request key, so a retry cannot duplicate", async ({
    page,
  }) => {
    await mount(page, "/passport/share", { createFails: true });
    await shareReady(page);
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();

    const keyIn = (body: string) => (serverFnArgs(body).requestKey as string | undefined) ?? null;

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
    const box = page.locator('[data-merit-option="claim:c-self"] input');
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
    await expect(page.locator("[data-share-screen]")).not.toContainText("Employment");
    await expect(page.locator("[data-share-screen]")).toContainText(
      "Training, courses and certificates",
    );
    await expect(page.locator("[data-share-screen]")).not.toContainText("Anställningar");
    expect(pageErrors).toEqual([]);
    await shoot(page, "share-select-en");
  });

  test("16 · a review read that fails is said out loud, never smoothed over", async ({ page }) => {
    await mount(page, "/passport/share", { reviewFails: true });
    await shareReady(page);

    // Once, at the top.
    await expect(page.locator("[data-review-unavailable]")).toBeVisible();
    await expect(page.locator("[data-review-unavailable]")).toContainText(
      "kunde inte läsa dina granskningsärenden",
    );

    // And beside every merit, because a settled word here would be a guess.
    const options = page.locator("[data-merit-option]");
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(options.nth(i)).toHaveAttribute("data-merit-caveat", "unknown");
    }
    // The merits are still shareable: the recipient reads their stored
    // standing either way, and a briefly unreadable queue table must not take
    // the whole feature down.
    await page.locator('[data-merit-option="claim:c-vu1"] input').check();
    await expect(page.locator("[data-share-cta]")).toBeEnabled();
    expect(pageErrors).toEqual([]);
    await shoot(page, "share-review-unknown");
  });

  test("17 · a new link over the same contents, with the old one revoked", async ({ page }) => {
    await mount(page, "/passport/share", { shares: [SHARE_ROW] });
    await shareReady(page);

    await page.locator('[data-share-reissue="d-1"]').click();
    await expect(page.locator("[data-share-reissue-panel]")).toBeVisible();

    // The choice is explicit and visible, and it defaults to the safer answer.
    const revoke = page.locator("[data-share-reissue-revoke]");
    await expect(revoke).toBeChecked();

    await page.locator("[data-share-reissue-confirm]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 20_000 });

    // A FRESH token, not a recovered one.
    const link = await page.locator("[data-share-link]").inputValue();
    expect(link).toContain("b".repeat(64));
    expect(reissueCalls).toBe(1);

    // The holder's choice reached the server AND came back as a sentence they
    // can act on. Asserted through the rendered answer rather than by decoding
    // the request body, which is seroval and not a stable contract.
    await expect(page.locator("[data-previous-revoked]")).toHaveAttribute(
      "data-previous-revoked",
      "true",
    );
    await expect(page.locator("[data-share-created]")).toContainText("är återkallad");
    expect(serverFnArgs(lastReissueBody).revokePrevious).toBe(true);
    expect(pageErrors).toEqual([]);
    await shoot(page, "share-reissue-sv");
  });

  test("18 · or with the old one kept, when the holder says so", async ({ page }) => {
    await mount(page, "/passport/share", { shares: [SHARE_ROW] });
    await shareReady(page);

    await page.locator('[data-share-reissue="d-1"]').click();
    await page.locator("[data-share-reissue-revoke]").uncheck();
    await expect(page.locator("[data-share-reissue-revoke]")).not.toBeChecked();
    await page.locator("[data-share-reissue-confirm]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 20_000 });

    // The flag travels exactly as the holder set it. Both answers are
    // legitimate and neither is assumed — and the two requests must therefore
    // differ in the encoded flag, whatever encoding the transport uses.
    await expect(page.locator("[data-previous-revoked]")).toHaveAttribute(
      "data-previous-revoked",
      "false",
    );
    await expect(page.locator("[data-share-created]")).toContainText("fungerar fortfarande");
    expect(serverFnArgs(lastReissueBody).revokePrevious).toBe(false);
    expect(pageErrors).toEqual([]);
  });

  test("19 · a lost reissue response reconciles, and a lapsed one is refused", async ({ page }) => {
    await mount(page, "/passport/share", { shares: [SHARE_ROW], reissueAlreadyExists: true });
    await shareReady(page);
    await page.locator('[data-share-reissue="d-1"]').click();
    await page.locator("[data-share-reissue-confirm]").click();
    await expect(page.locator("[data-share-already]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-share-link]")).toHaveCount(0);
    expect(reissueCalls).toBe(1);

    await mount(page, "/passport/share", { shares: [SHARE_ROW], reissueLapsed: true });
    await shareReady(page);
    await page.locator('[data-share-reissue="d-1"]').click();
    await page.locator("[data-share-reissue-confirm]").click();
    await expect(page.locator("[data-share-reissue-panel] [role=alert]")).toContainText(
      "inte längre aktuell",
      { timeout: 20_000 },
    );
    // The panel stays open with the holder's choice intact, so the retry is
    // one click and not a restart.
    await expect(page.locator("[data-share-reissue-panel]")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   The holder's ONE Passport image
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Security Passport — social sharing, ONE Passport image", () => {
  test.describe.configure({ timeout: 120_000 });

  test("23 · social sharing: four credentials are ONE Passport image, grouped, previewed, downloaded and shared as one file", async ({
    page,
  }) => {
    await mount(page, "/passport/share", { fourCredentials: true });
    await shareReady(page);
    await page.locator('[data-share-choice="social"]').click();
    const flow = page.locator("[data-social-flow]");
    await expect(flow).toBeVisible();

    // Four credentials, none blocked: the old fourth-checkbox stop is gone.
    const boxes = flow.locator('[data-merit-option^="claim:"] input');
    await expect(boxes).toHaveCount(4);
    for (const box of await boxes.all()) await box.check();
    await expect(flow.locator('[data-merit-option^="claim:"] input:disabled')).toHaveCount(0);

    // ONE preview, ONE Passport, every credential on it exactly once.
    const preview = flow.locator('[data-social-preview="square"]');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(flow.locator("[data-social-passport]")).toHaveCount(1);
    await expect(flow.locator("[data-social-preview]")).toHaveCount(1);
    const svgOf = async () =>
      decodeURIComponent(
        ((await preview.getAttribute("src")) ?? "").replace(
          /^data:image\/svg\+xml;charset=utf-8,/,
          "",
        ),
      );
    const svg = await svgOf();
    const words = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? "");
    expect((svg.match(/data-passport-shield=/g) ?? []).length).toBe(4);
    expect(svg).toContain('data-passport-credentials="4"');
    expect(svg).toContain('data-passport-groups="3"');
    expect(svg).toContain('data-passport-fits="true"');
    expect(svg).not.toContain("data-social-page");
    expect(words.join("\n")).not.toMatch(/SECURITY PASSPORT · \d+ \/ \d+/);
    // Grouped by controlled scope: Sweden twice under one heading, the
    // international certification under the globe, the licence under Great
    // Britain -- and each shield with its own trust word.
    expect(svg).toContain('data-passport-shield="c1" data-passport-group="jurisdiction:SE"');
    expect(svg).toContain(
      'data-passport-shield="c-vu1-training" data-passport-group="jurisdiction:SE"',
    );
    expect(svg).toContain('data-passport-shield="c-self" data-passport-group="global"');
    expect(svg).toContain('data-passport-shield="c-sia" data-passport-group="jurisdiction:GB"');
    expect((svg.match(/data-flag="SE"/g) ?? []).length).toBe(1);
    expect(words).toContain("SVERIGE");
    expect(words).toContain("GLOBAL");
    expect(words).toContain("STORBRITANNIEN");
    expect(words.filter((w) => w === "EGEN UPPGIFT").length).toBe(3);
    expect(words.filter((w) => w === "DOKUMENTERAD").length).toBe(1);
    expect(words.join("\n")).not.toMatch(/VERIFIERAD|KÄLLBEKRÄFTAD/);
    // Nothing private, no link, no QR code.
    // The stub's issuers, the identifier shape, a link and a QR code: none.
    for (const absent of ["Utbildaren AB", "Polismyndigheten", "/p#", "<image", USER_ID])
      expect(svg).not.toContain(absent);
    await expect(flow.locator('[data-social-link-state="none"]')).toBeVisible();
    expect(createCalls, "no link is created by previewing").toBe(0);

    // The same Passport in words, for whoever cannot see it.
    const list = flow.locator("[data-passport-group-list]");
    await expect(list).toBeVisible();
    await expect(list.locator("[data-passport-group]")).toHaveCount(3);
    await expect(list.locator("[data-passport-shield]")).toHaveCount(4);
    await expect(flow.locator("[data-passport-one]")).toHaveText(
      "Alla 4 valda meriter visas i ett Security Passport, grupperade efter område.",
    );
    await expect(flow).not.toContainText(/bild \d+ av \d+|tre på varje/i);

    // One download: the previewed image, as one file.
    await expect(flow.locator("[data-social-download]")).toBeEnabled({ timeout: 30_000 });
    const got: string[] = [];
    page.on("download", (d) => got.push(d.suggestedFilename()));
    await flow.locator("[data-social-download]").click();
    await expect.poll(() => got.length, { timeout: 30_000 }).toBe(1);
    expect(got).toEqual(["cqrityjob-passport-square.png"]);

    // One file to the share sheet, the previewed one.
    await flow.locator("[data-social-device]").click();
    await expect(flow.locator('[data-social-notice="attached"]')).toHaveText(
      "Bilden finns nu i appen du valde. Slutför inlägget där.",
    );
    const shared = await page.evaluate(
      () => (window as unknown as { __shared: SharedRecord[] }).__shared,
    );
    expect(shared.length).toBe(1);
    expect(shared[0]!.files.map((f) => f.name)).toEqual(["cqrityjob-passport-square.png"]);
    expect(shared[0]!.url).toBeNull();

    // LinkedIn: the one image as a download, the feed opened, and the truth.
    await flow.locator('[data-social-channel="linkedin"]').click();
    await expect.poll(() => got.length, { timeout: 30_000 }).toBe(2);
    expect(got[1]).toBe("cqrityjob-passport-square.png");
    await expect(flow.locator('[data-social-notice="added_by_holder"]')).toHaveText(
      "Din Security Passport-bild är klar. Lägg till bilden i ditt inlägg.",
    );
    expect(
      await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened),
    ).toEqual(["https://www.linkedin.com/feed/"]);
    expect(createCalls, "sharing created no link").toBe(0);

    // Every format is the same Passport: the complete selection, one image.
    for (const format of ["og", "story", "compact"] as const) {
      await flow.locator(`[data-social-format="${format}"]`).click();
      const shown = flow.locator(`[data-social-preview="${format}"]`);
      await expect(shown).toBeVisible({ timeout: 30_000 });
      await expect(flow.locator("[data-social-preview]")).toHaveCount(1);
      const image = decodeURIComponent(
        ((await shown.getAttribute("src")) ?? "").replace(
          /^data:image\/svg\+xml;charset=utf-8,/,
          "",
        ),
      );
      expect((image.match(/data-passport-shield=/g) ?? []).length, format).toBe(4);
      expect(image, format).toContain('data-passport-fits="true"');
    }

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(pageErrors).toEqual([]);
    await flow.locator('[data-social-format="square"]').click();
    await shoot(page, `social-one-passport-4-sv-${page.viewportSize()!.width > 600 ? 1440 : 375}`);
  });

  for (const lang of ["sv", "en"] as const) {
    test(`24 · ${lang}: the densest realistic Passport -- eleven credentials in three groups -- is ONE image in every format`, async ({
      page,
    }) => {
      await mount(page, "/passport/share", { elevenCredentials: true, lang });
      await shareReady(page);
      await page.locator('[data-share-choice="social"]').click();
      const flow = page.locator("[data-social-flow]");
      const boxes = flow.locator('[data-merit-option^="claim:"] input');
      await expect(boxes).toHaveCount(11);
      for (const box of await boxes.all()) await box.check();
      await expect(flow.locator('[data-merit-option^="claim:"] input:disabled')).toHaveCount(0);
      await expect(flow.locator('[data-social-preview="square"]')).toBeVisible({
        timeout: 30_000,
      });
      await expect(flow.locator("[data-social-passport]")).toHaveCount(1);
      await expect(flow.locator("[data-passport-group-list] [data-passport-group]")).toHaveCount(3);
      await expect(flow.locator("[data-passport-group-list] [data-passport-shield]")).toHaveCount(
        11,
      );
      await expect(flow.locator("[data-passport-one]")).toHaveText(
        lang === "sv"
          ? "Alla 11 valda meriter visas i ett Security Passport, grupperade efter område."
          : "All 11 selected credentials are shown in one Security Passport, grouped by area.",
      );
      for (const format of ["square", "og", "story", "compact"] as const) {
        await flow.locator(`[data-social-format="${format}"]`).click();
        const shown = flow.locator(`[data-social-preview="${format}"]`);
        await expect(shown).toBeVisible({ timeout: 30_000 });
        await expect(flow.locator("[data-social-preview]")).toHaveCount(1);
        const image = decodeURIComponent(
          ((await shown.getAttribute("src")) ?? "").replace(
            /^data:image\/svg\+xml;charset=utf-8,/,
            "",
          ),
        );
        expect((image.match(/data-passport-shield=/g) ?? []).length, format).toBe(11);
        expect(image, format).toContain('data-passport-groups="3"');
        expect(image, format).toContain('data-passport-fits="true"');
        expect(image, format).not.toContain("data-social-page");
        expect(
          Math.min(...[...image.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]))),
          `${format}: every text at least 14px per 1080`,
        ).toBeGreaterThanOrEqual(14 * (format === "compact" ? 0.6 : 1) - 0.05);
        await expect(flow.locator("[data-social-crowded]")).toHaveCount(0);
        await expect(flow.locator("[data-social-download]")).toBeEnabled({ timeout: 30_000 });
        await shoot(
          page,
          `social-one-passport-11-${format}-${lang}-${page.viewportSize()!.width > 600 ? 1440 : 375}`,
        );
      }
      expect(createCalls, "no link is created").toBe(0);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(pageErrors).toEqual([]);
    });
  }
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

    // The renamed public framing: a share, not a verification, and a duration
    // named for what it counts.
    await expect(page.locator("h1")).toHaveText("Delade uppgifter från Security Passport");
    await expect(page.locator("[data-recipient-view]")).toContainText("Bekräftad anställningstid");
    await expect(page.locator("[data-recipient-view]")).toContainText("Länkstatus kontrollerad");
    await expect(page.locator("[data-recipient-view]")).not.toContainText(
      "Den här sidan är källan",
    );

    // The glossary comes AFTER the evidence a reader opened the link to see.
    const order = (await page.locator("[data-recipient-view]").innerText()) ?? "";
    expect(order.indexOf("Väktarutbildning 1")).toBeLessThan(order.indexOf("Vad orden betyder"));

    // A mixed share: the holder's own entry sits beside the reviewed one, and
    // neither borrows the other's word.
    await expect(page.locator('[data-recipient-credential="c2"]')).not.toContainText(
      "Dokumenterad",
    );

    // Localised dates, and no database identifier anywhere in the DOM.
    await expect(page.locator("[data-recipient-view]")).toContainText("1 januari 2021");
    const html = (await page.locator("[data-recipient-view]").innerHTML()) ?? "";
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // The public explanation of what a Security Passport is. The link's name
    // comes from the copy, not a literal: this line asserted "Läs mer" and
    // went stale when 93e6f939 made the link say where it goes. e2e/ is
    // outside every typecheck, so a renamed key would arrive here as
    // undefined, and a nameless getByRole matches any link at all.
    const readAbout = passportT("rec.ctaAction", "sv");
    expect(readAbout, "rec.ctaAction has no Swedish copy").toMatch(/\S/);
    await expect(
      page.locator("[data-recipient-view]").getByRole("link", { name: readAbout, exact: true }),
    ).toHaveAttribute("href", "/security-passport");
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
    await expect(page.locator("h1")).toHaveText("Information shared from Security Passport");
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "Confirmed employment duration",
    );
    await expect(page.locator("[data-recipient-view]")).toContainText("Share status checked");
    // English dates, in English, with no Swedish month left over.
    await expect(page.locator("[data-recipient-view]")).toContainText("1 January 2021");
    await expect(page.locator("[data-recipient-view]")).not.toContainText("januari");
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-en");
  });

  test("14 · an expired, revoked or invalid link is one safe, identical page", async ({ page }) => {
    await mount(page, "/p/abcdef0123456789", { publicPayload: { status: "unavailable" } });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("main")).toContainText("Delningslänken är inte längre tillgänglig");
    await expect(page.locator("main")).toContainText("Be innehavaren om en ny länk");
    await expect(page.locator("main")).toContainText("säger ingenting om personen");
    await expect(page.getByRole("link", { name: /Om Security Passport/ })).toHaveAttribute(
      "href",
      "/security-passport",
    );
    // Nothing about an account, a holder or an id.
    await expect(page.locator("main")).not.toContainText("Selma");
    await expect(page.locator("main")).not.toContainText("abcdef0123456789");
    await expect(page.locator("[data-recipient-view]")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-unavailable");
  });

  test("20 · a legacy package share still renders, id and all", async ({ page }) => {
    // `sp_get_disclosure` reshapes ONLY a chosen-merit share: the five older
    // packages keep the byte-identical payload they had, which is what made
    // the schema safe to apply before this code shipped. So the page has to
    // read BOTH shapes — `key` for a selected share, `id` for a package one —
    // and this is the shape nothing else in the suite exercises.
    await mount(page, "/p/abcdef0123456789", {
      publicPayload: {
        status: "active",
        package: "public_card",
        focus: "passport",
        purpose: null,
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
            id: "3f1c2d40-0000-4000-8000-000000000001",
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
        verified_experience: [],
        verified_experience_days: 0,
      },
    });

    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-recipient-credential]")).toHaveCount(1);
    await expect(page.locator("[data-recipient-view]")).toContainText("Väktarutbildning 1 (VU1)");
    await expect(page.locator("[data-recipient-view]")).toContainText("Dokumenterad");
    // No check time, because a package payload carries none — and the page
    // must omit the row rather than print a blank or the visitor's clock.
    await expect(page.locator("[data-recipient-view]")).not.toContainText(
      "Länkstatus kontrollerad",
    );
    expect(pageErrors).toEqual([]);
  });

  test("21 · each employment shows the status it actually has", async ({ page }) => {
    // The regression: the view passed a hard-coded `assertionLevel: "verified"`
    // for every employment, so a self-declared one carrying stale decision
    // metadata read as confirmed by the employer named in it.
    await mount(page, "/p/abcdef0123456789", {
      publicPayload: {
        ...recipientPayload("sv"),
        verified_claims: [],
        verified_experience: [
          {
            key: "e1",
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
          {
            key: "e2",
            employer: "Sydvakt AB (fiktiv)",
            role: "Ordningsvakt",
            started_on: "2019-01-01",
            ended_on: "2021-01-01",
            jurisdiction: "SE",
            assertion: "verified",
            lifecycle: "active",
            verifier_organisation: "CQrityjob",
            verification_method: "document_review",
          },
          {
            key: "e3",
            employer: "Nedgraderad AB (fiktiv)",
            role: "Väktare",
            started_on: "2017-01-01",
            ended_on: "2019-01-01",
            jurisdiction: "SE",
            // Self-declared TODAY, with an approval still attached from before.
            assertion: "self_declared",
            lifecycle: "active",
            verifier_organisation: "Nedgraderad AB (fiktiv)",
            verification_method: "employer_confirmation",
          },
        ],
        verified_experience_days: 731,
      },
    });
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('[data-recipient-employment="e1"]')).toHaveAttribute(
      "data-employment-level",
      "source_verified",
    );
    await expect(page.locator('[data-recipient-employment="e2"]')).toHaveAttribute(
      "data-employment-level",
      "documented",
    );
    await expect(page.locator('[data-recipient-employment="e3"]')).toHaveAttribute(
      "data-employment-level",
      "self_declared",
    );

    // The employer's own confirmation names the employer, in employment's own
    // register. The document review names the reviewer, in its own.
    await expect(page.locator('[data-recipient-employment="e1"]')).toContainText(
      "Anställningen är bekräftad av Nordvakt AB (fiktiv)",
    );
    await expect(page.locator('[data-recipient-employment="e2"]')).toContainText(
      "Dokument granskat av CQrityjob",
    );
    await expect(page.locator('[data-recipient-employment="e2"]')).not.toContainText(
      "Anställningen är bekräftad",
    );

    // THE ONE THAT MATTERED. Stale metadata must not speak for the employer.
    await expect(page.locator('[data-recipient-employment="e3"]')).not.toContainText(
      "bekräftad av",
    );
    await expect(page.locator('[data-recipient-employment="e3"]')).toContainText("Egen uppgift");
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-employment-levels-sv");
  });

  test("22 · a legacy package's employment total is not called confirmed time", async ({
    page,
  }) => {
    // The five older packages sum every period that reached `verified`, which
    // includes a CQrityjob document review. `selected_merits` sums only
    // employer-confirmed periods. One heading for both would put an employer's
    // confirmation on time no employer confirmed.
    const legacy = {
      ...recipientPayload("sv"),
      package: "public_card",
      checked_at: undefined,
      verified_claims: [],
      verified_experience: [],
      verified_experience_days: 731,
    };
    await mount(page, "/p/abcdef0123456789", { publicPayload: legacy });
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("[data-employment-days-basis]")).toHaveAttribute(
      "data-employment-days-basis",
      "reviewed_or_confirmed",
    );
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "Granskad eller bekräftad anställningstid",
    );
    await expect(page.locator("[data-recipient-view]")).not.toContainText(
      "Bekräftad anställningstid",
    );
    // The card is the part people screenshot, so it takes the same name.
    await expect(page.locator("[data-card-employment-basis]")).toHaveAttribute(
      "data-card-employment-basis",
      "reviewed_or_confirmed",
    );
    // And no blanket claim that the whole share is substantiated.
    await expect(page.locator("[data-recipient-view]")).not.toContainText("styrkta uppgifter");
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "Ingenting på den här sidan är ett omdöme om personen",
    );
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-legacy-package-sv");

    // English says the same thing.
    await mount(page, "/p/abcdef0123456789", {
      publicPayload: { ...legacy, locale: "en" },
    });
    await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-recipient-view]")).toContainText(
      "Reviewed or confirmed employment duration",
    );
    await expect(page.locator("[data-recipient-view]")).not.toContainText(
      "Confirmed employment duration",
    );
    await expect(page.locator("[data-recipient-view]")).not.toContainText("substantiated facts");
    expect(pageErrors).toEqual([]);
    await shoot(page, "recipient-legacy-package-en");
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

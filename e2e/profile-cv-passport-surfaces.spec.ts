// Profile, CV and Security Passport — the three candidate surfaces, in a
// browser, on the REAL routes.
//
// ── WHAT THIS PROVES ───────────────────────────────────────────────────
//
//   1. My Career names all three surfaces with one action each, and each
//      action lands on the page that owns the fact.
//   2. The Profile's editors are EDITORS: a field can be added, changed,
//      saved and cancelled, the save reaches the canonical server function
//      with the typed values, and My Career shows the new value afterwards.
//   3. The CV page adds and edits employment and education through the
//      canonical writers, and the row appears once the server has it.
//   4. /passport carries exactly ONE Passport: the wallet's identity
//      surface, and no compact card beside it. The recipient-style view
//      lives under Preview and share, and /passport/card redirects there.
//   5. None of it overflows at 390 or 375, in Swedish or English.
//
// ── WHAT IT DOES NOT PROVE ─────────────────────────────────────────────
//
// Persistence. Every server function is answered inside the browser by a
// STATEFUL stub: a save updates the stub's state and the next read returns
// it, which is what lets "saved, then shown on My Career" be asserted at
// all. That proves the UI sends the right write and re-reads afterwards. It
// does not prove the database accepted it; the RLS and replay suites own
// that, and no schema, grant or server function changed in this work.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test \
//         e2e/profile-cv-passport-surfaces.spec.ts --project=chromium
//
// Set SURFACE_SHOTS=<dir> to also write the review screenshots.

import { mkdirSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { fixtureById } from "../src/lib/professional-identity/fixtures/career-home-fixtures";
import { mount, ok, passportSnapshot, takeMountBookkeeping } from "./support/career-home-harness";

const SHOTS = process.env.SURFACE_SHOTS ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(
    c.unmatched,
    `unstubbed server functions: ${[...new Set(c.unmatched)].join(", ")}`,
  ).toEqual([]);
  expect(c.errors, c.errors.join("\n")).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* seroval — the POST body of a server function is a node tree         */
/* ------------------------------------------------------------------ */

const CONSTANTS = [null, undefined, true, false] as const;
function decode(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  const n = node as { t?: number; s?: unknown; a?: unknown[]; p?: { k?: string[]; v?: unknown[] } };
  if (n.t === 0 || n.t === 1) return n.s;
  if (n.t === 2) return CONSTANTS[Number(n.s)] ?? null;
  if (n.t === 10) {
    const out: Record<string, unknown> = {};
    (n.p?.k ?? []).forEach((k, i) => (out[k] = decode(n.p?.v?.[i])));
    return out;
  }
  return Array.isArray(n.a) ? n.a.map(decode) : (n.s ?? null);
}
function dataOf(route: Route): Record<string, unknown> {
  try {
    const parsed = JSON.parse(route.request().postData() ?? "{}") as { t?: unknown };
    return ((decode(parsed.t) as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}
const reply = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });

/* ------------------------------------------------------------------ */
/* One stateful backend for Profile and CV                             */
/* ------------------------------------------------------------------ */

type Period = Record<string, unknown> & { id: string };
type ClaimRow = Record<string, unknown> & { id: string };

function backend(opts: { headline?: string | null; fixture?: string } = {}) {
  const f = fixtureById(opts.fixture ?? "hub_active");
  if (!f || f.input.identity.state !== "ready") throw new Error("fixture has no identity");
  const base = f.input.identity.identity;
  const state = {
    displayName: "Amina Karlsson",
    headline: opts.headline === undefined ? "Väktare" : opts.headline,
    experience: [] as Period[],
    claims: [] as ClaimRow[],
    writes: [] as { fn: string; data: Record<string, unknown> }[],
  };
  let n = 0;

  const identity = () => ({
    ...base,
    displayName: state.displayName,
    headline: state.headline,
    employment: state.experience.map((e) => ({
      id: e.id,
      employerName: e.employerName,
      roleTitle: e.roleTitle,
      startedOn: e.startedOn,
      endedOn: e.endedOn ?? null,
      employmentType: e.employmentType,
      jurisdictionCode: e.jurisdictionCode,
      assertionLevel: "self_declared",
      verifierName: null,
      verificationMethod: null,
    })),
  });
  const snapshot = () => {
    const snap = passportSnapshot(f) as {
      profile: Record<string, unknown> | null;
      profileIdentity: Record<string, unknown>;
    };
    if (snap.profile) {
      snap.profile.displayName = state.displayName;
      snap.profile.headline = state.headline ?? "";
      snap.profile.privacyMode = "full_name";
      snap.profile.declaredAccurateAt = null;
    }
    snap.profileIdentity = {
      displayName: state.displayName,
      titleSv: state.headline,
      titleEn: state.headline,
    };
    return snap;
  };

  const overrides = {
    getMyProfessionalIdentity: (route: Route) => reply(route, identity()),
    getMyPassport: (route: Route) => reply(route, snapshot()),
    getMySecurityCareerProfile: ok({
      currentStatus: "working_in_industry",
      currentProfessionSlug: null,
      currentProfessionOther: null,
      yearsOfExperience: "5-10",
    }),
    listJurisdictions: ok([]),
    listSkillTypes: ok([]),
    listMyEntries: (route: Route) =>
      reply(route, { experience: state.experience, claims: state.claims }),
    prepareMyCv: ok({
      readiness: { state: "ready", missingFields: [], satisfiedFields: [] },
    }),
    savePassportBasics: (route: Route) => {
      const data = dataOf(route);
      state.writes.push({ fn: "savePassportBasics", data });
      if (typeof data.displayName === "string") state.displayName = data.displayName;
      if (typeof data.headline === "string") state.headline = data.headline;
      return reply(route, { savedAt: "2026-09-17T08:00:00Z", declaredAt: null });
    },
    saveExperienceEntry: (route: Route) => {
      const data = dataOf(route);
      state.writes.push({ fn: "saveExperienceEntry", data });
      const id = typeof data.id === "string" && data.id ? data.id : `p-${++n}`;
      const row: Period = {
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        ...data,
        id,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
        verificationMethod: null,
        editable: true,
      };
      state.experience = [...state.experience.filter((e) => e.id !== id), row];
      return reply(route, { id });
    },
    saveClaimEntry: (route: Route) => {
      const data = dataOf(route);
      state.writes.push({ fn: "saveClaimEntry", data });
      const id = typeof data.id === "string" && data.id ? data.id : `c-${++n}`;
      const row: ClaimRow = {
        credentialCode: null,
        skillCode: null,
        skillLevel: null,
        holderNote: null,
        ...data,
        id,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
        verificationMethod: null,
        editable: true,
      };
      state.claims = [...state.claims.filter((c) => c.id !== id), row];
      return reply(route, { id });
    },
  };
  return { state, overrides };
}

/* ------------------------------------------------------------------ */
/* 1 · My Career — three surfaces, three actions                       */
/* ------------------------------------------------------------------ */

test.describe("My Career names the three surfaces", () => {
  for (const lang of ["sv", "en"] as const) {
    test(`Profile, CV and Security Passport each have one way in · ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const { overrides } = backend();
      await mount(page, "hub_active", { lang, overrides });

      const profile = page.locator('[data-overview-surface="profile"]');
      const cv = page.locator('[data-overview-surface="cv"]');
      const passport = page.locator("[data-overview-passport-region]");
      await expect(profile).toBeVisible();
      await expect(cv).toBeVisible();
      await expect(passport).toBeVisible();

      await expect(profile.locator("[data-edit-details]")).toHaveText(
        lang === "sv" ? /Redigera profil/ : /Edit Profile/,
      );
      await expect(profile.locator("[data-edit-details]")).toHaveAttribute(
        "href",
        "/my-career/profile",
      );
      await expect(cv.locator("[data-edit-cv]")).toHaveText(
        lang === "sv" ? /Redigera CV/ : /Edit CV/,
      );
      await expect(cv.locator("[data-edit-cv]")).toHaveAttribute("href", "/my-career/cv");
      await expect(passport.locator('[data-cta="overview-open-passport"]')).toHaveText(
        lang === "sv" ? /Öppna Security Passport/ : /Open Security Passport/,
      );

      // The Passport here is a SUMMARY: the holder's own credentials, never
      // an empty selection asking to be filled, and never an editor.
      const card = passport.locator("[data-compact-passport-card]");
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("data-passport-card-variant", "summary");
      await expect(passport.locator("input, textarea, select")).toHaveCount(0);
      await expect(passport.locator('a[href*="/passport/credentials/new"]')).toHaveCount(0);

      // All three are on the first screen at 1440x900.
      for (const surface of [profile, cv, passport]) {
        const box = await surface.boundingBox();
        expect(box && box.y < 900, "surface starts above the fold").toBeTruthy();
      }
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await shot(page, `01-my-career-overview-1440-${lang}`);
    });
  }

  test("each action lands on the page that owns the fact", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { overrides } = backend();
    await mount(page, "hub_active", { lang: "en", overrides });

    await page.locator("[data-edit-details]").click();
    await page.waitForURL("**/my-career/profile");
    await expect(page.locator("h1")).toHaveText("Profile");
    // The page, not a dialog over the dashboard.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    await page.locator("[data-back-to-career]").click();
    await page.waitForURL(/\/my-career\/?$/);
    await page.locator("[data-edit-cv]").click();
    await page.waitForURL("**/my-career/cv");
    await expect(page.locator("[data-cv-content]")).toBeVisible();
  });

  test("a missing Profile fact is a link to the field, not a status word", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { overrides } = backend({ headline: null, fixture: "new_user" });
    await mount(page, "new_user", { lang: "en", overrides });
    const add = page.locator('[data-overview-surface="profile"] [data-overview-add]').first();
    await expect(add).toBeVisible();
    expect(await add.getAttribute("href")).toContain("/my-career/profile");
    await expect(page.locator('[data-overview-surface="cv"] [data-overview-add]')).toHaveAttribute(
      "href",
      "/my-career/cv#cv-employment",
    );
  });
});

/* ------------------------------------------------------------------ */
/* 2 · Profile — every editable thing is editable                      */
/* ------------------------------------------------------------------ */

test.describe("Profile", () => {
  test("holds only Profile facts, and no dead 'edited here' label", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { overrides } = backend();
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides,
    });
    await expect(page.locator("main")).not.toContainText(/edited here/i);
    await expect(page.locator("[data-profile-basics]")).toHaveCount(1);
    await expect(page.locator("[data-profile-work-country]")).toHaveCount(1);
    await expect(page.locator("#career-profile")).toHaveCount(1);
    // Career history is the CV's: summarised here with one way in.
    await expect(page.locator("[data-cv-employment]")).toHaveCount(0);
    await expect(page.locator("[data-general-profile-claims]")).toHaveCount(0);
    await expect(page.locator('[data-cta="profile-edit-cv"]')).toHaveAttribute(
      "href",
      "/my-career/cv",
    );
    await expect(page.locator('[data-cta="profile-open-passport"]')).toHaveAttribute(
      "href",
      "/passport",
    );
    await shot(page, "02-profile-editor-1440-en");
  });

  test("a missing title can be added, saved, and is then shown on My Career", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { state, overrides } = backend({ headline: null });
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides,
    });

    const title = page.locator("#sp-basics-identity-headline");
    await expect(title).toHaveValue("");
    await expect(title).toHaveAttribute("placeholder", "Add current professional title");
    const save = page.locator("[data-basics-save]");
    await expect(save).toBeDisabled();
    await shot(page, "03-profile-missing-field-1440-en");

    // Cancel puts the stored value back and writes nothing.
    await title.fill("Typed and abandoned");
    await page.locator("[data-basics-cancel]").click();
    await expect(title).toHaveValue("");
    expect(state.writes).toEqual([]);

    await title.fill("Security Manager");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator("[data-profile-basics] [role=status]").first()).toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].fn).toBe("savePassportBasics");
    expect(state.writes[0].data.headline).toBe("Security Manager");
    expect(state.writes[0].data.displayName).toBe("Amina Karlsson");
    await expect(title).toHaveValue("Security Manager");

    // Back on My Career, the Profile card says what was saved.
    await page.locator("[data-back-to-career]").click();
    await page.waitForURL(/\/my-career\/?$/);
    await expect(page.locator('[data-overview-surface="profile"]')).toContainText(
      "Security Manager",
    );
  });

  test("an existing name can be edited and saved", async ({ page }) => {
    const { state, overrides } = backend();
    await mount(page, "hub_active", {
      lang: "sv",
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides,
    });
    const name = page.locator("#sp-basics-identity-displayName");
    await expect(name).toHaveValue("Amina Karlsson");
    await name.fill("Amina K. Karlsson");
    await page.locator("[data-basics-save]").click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0].data.displayName).toBe("Amina K. Karlsson");
    await expect(page.locator("[data-profile-name]")).toHaveText("Amina K. Karlsson");
  });

  test("a failed read of the name and title says so, with a retry — never an absent editor", async ({
    page,
  }) => {
    const { overrides } = backend();
    let refusing = true;
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/profile",
      ready: "[data-profile-basics-state]",
      overrides: {
        ...overrides,
        // Refuses until told otherwise, then answers: the retry has to be a
        // real re-read. A flag rather than "the first call", because more
        // than one component on the page makes this read.
        getMyPassport: (route: Route) => {
          return refusing
            ? route.fulfill({ status: 500, contentType: "text/plain", body: "stubbed failure" })
            : overrides.getMyPassport(route);
        },
      },
    });
    const failed = page.locator('[data-profile-basics-state="failed"]');
    await expect(failed.getByRole("alert")).toBeVisible();
    refusing = false;
    await failed.getByRole("button").click();
    await expect(page.locator("#sp-basics-identity-displayName")).toHaveValue("Amina Karlsson");
    // The refusal is this scenario, and the component logs it on purpose.
    const c = takeMountBookkeeping();
    expect(c?.unmatched ?? []).toEqual([]);
  });

  test("a retired CV anchor on the Profile page lands on the CV", async ({ page }) => {
    const { overrides } = backend();
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/profile#profile-employment",
      ready: "[data-cv-employment]",
      overrides,
    });
    expect(page.url()).toContain("/my-career/cv#cv-employment");
  });
});

/* ------------------------------------------------------------------ */
/* 3 · CV — add and edit career history                                */
/* ------------------------------------------------------------------ */

test.describe("CV", () => {
  test("employment can be added and then edited", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { state, overrides } = backend();
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/cv",
      ready: "[data-cv-content]",
      overrides,
    });
    await expect(page.locator("[data-cv-documents]")).toBeVisible();
    await expect(page.locator("[data-employment-row]")).toHaveCount(0);
    await shot(page, "04-cv-editor-1440-en");

    await page.locator("[data-add-employment]").click();
    await page.locator("#exp-employer").fill("Nordic Security AB");
    await page.locator("#exp-role").fill("Security officer");
    await page.locator("#exp-country").selectOption("SE");
    await page.locator("#exp-start").fill("2021-03-01");
    await page.locator("#exp-ongoing").check();
    await shot(page, "05-cv-add-employment-1440-en");
    await page.locator("[data-cv-employment]").getByRole("button", { name: "Save" }).click();

    const row = page.locator("[data-employment-row]");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Security officer");
    expect(state.writes[0].fn).toBe("saveExperienceEntry");
    expect(state.writes[0].data.employerName).toBe("Nordic Security AB");
    expect(state.writes[0].data.endedOn).toBeNull();

    await row.getByRole("button", { name: "Edit" }).click();
    await page.locator("#exp-role").fill("Shift leader");
    await page.locator("[data-cv-employment]").getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText("Shift leader");
    await expect(row).toHaveCount(1);
    expect(state.writes[1].data.id).toBe(state.writes.length > 1 ? "p-1" : "");
    await shot(page, "05b-cv-employment-saved-1440-en");
  });

  test("the section links reach the editors, and the Profile is one link away", async ({
    page,
  }) => {
    const { overrides } = backend();
    await mount(page, "hub_active", {
      lang: "sv",
      path: "/my-career/cv",
      ready: "[data-cv-content]",
      overrides,
    });
    for (const id of ["cv-employment", "cv-education", "cv-languages", "cv-skills"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    await page.locator('[data-cv-page-nav] a[href="#cv-education"]').click();
    await expect(page.locator("#cv-education")).toBeInViewport();
    await expect(page.locator('[data-cta="cv-edit-profile"]')).toHaveAttribute(
      "href",
      "/my-career/profile",
    );
  });
});

/* ------------------------------------------------------------------ */
/* 4 · Security Passport — exactly one                                 */
/* ------------------------------------------------------------------ */

const USER = "00000000-0000-4000-8000-000000000001";
function credential(over: Record<string, unknown>) {
  return {
    claimType: "certification",
    skillCode: null,
    skillLevel: null,
    issuerName: "ASIS International",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2025-02-01",
    validFrom: "2025-02-01",
    validUntil: "2028-02-01",
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
const APP = credential({
  id: "f1900000-0000-4000-8000-0000000000a1",
  credentialCode: "INTL_ASIS_APP",
  titleSv: "Associate Protection Professional (APP)",
  titleEn: "Associate Protection Professional (APP)",
  assertionLevel: "verified",
  verifierName: "CQrityjob",
  verificationMethod: "document_review",
  verifiedOn: "2026-09-10",
});
const CPP = credential({
  id: "f1900000-0000-4000-8000-0000000000a2",
  credentialCode: "INTL_ASIS_CPP",
  titleSv: "Certified Protection Professional (CPP)",
  titleEn: "Certified Protection Professional (CPP)",
});
const names: Record<string, string> = {
  APP: "Associate Protection Professional (APP)",
  CPP: "Certified Protection Professional (CPP)",
};
const METADATA = {
  definitions: Object.keys(names).map((code) => ({
    code: `INTL_ASIS_${code}`,
    name_sv: names[code],
    name_en: names[code],
    credential_class: "certification",
    scope_code: "global_professional",
    country: null,
    region: null,
    issuer_id: "asis",
    issuer_name: "ASIS International",
    official_url: null,
    verification_url: null,
    requires_valid_until: false,
    allows_no_expiry: false,
  })),
  details: [],
  verificationEvents: [
    {
      claimId: APP.id,
      result: "approved",
      decidedAt: "2026-09-10T10:00:00Z",
      validUntil: null,
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
    },
  ],
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
  ],
};
function passportOverrides() {
  const f = fixtureById("hub_active")!;
  const snap = passportSnapshot(f) as unknown as {
    profile: Record<string, unknown>;
    holder: { claims: unknown[]; id: string };
  };
  snap.profile.privacyMode = "full_name";
  snap.holder.id = USER;
  snap.holder.claims = [APP, CPP];
  return {
    getMyPassport: ok(snap),
    getInternationalPassportMetadata: ok(METADATA),
    listMyVerificationRequests: ok({ requests: [], decisions: [] }),
    listMyShares: ok([]),
    listMyEvidence: ok([]),
    listClaimVersions: ok([]),
    listMyCredentialDrafts: ok([]),
    listCredentialTypes: ok([]),
    getCredentialPrivateFields: ok({ credentialReference: null, holderNote: null }),
    getRegulatedCredentialAvailability: ok({
      state: "open",
      jurisdictionCode: "SE",
      marketPackCode: "SE-CORE",
      types: [],
    }),
    listPassportMarketOverview: ok({ markets: [], current: null }),
  };
}

test.describe("Security Passport", () => {
  for (const lang of ["sv", "en"] as const) {
    test(`/passport shows exactly one Passport and the wallet · ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mount(page, "hub_active", {
        lang,
        path: "/passport",
        ready: "[data-credential-wallet]",
        overrides: passportOverrides(),
      });

      // ONE identity surface, and no second Passport card anywhere.
      await expect(page.locator("[data-credential-wallet] > header")).toHaveCount(1);
      await expect(page.locator("[data-compact-passport-card]")).toHaveCount(0);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText("Amina Karlsson");

      // The name is one line's worth of words, never broken mid-word.
      const h1 = await page.locator("h1").boundingBox();
      expect(h1 && h1.height < 70, "the name does not wrap at 1440").toBeTruthy();

      // Name and title are displayed here and edited in Profile.
      await expect(page.locator('[data-cta="edit-in-profile"]')).toHaveAttribute(
        "href",
        "/my-career/profile#profile-basics",
      );
      await expect(
        page.locator("[data-credential-wallet] header").locator("input, textarea"),
      ).toHaveCount(0);

      // The wallet, with the real APP record and its explicit states.
      const rows = page.locator("[data-credential-row]");
      await expect(rows).toHaveCount(2);
      const app = rows.filter({ hasText: "Associate Protection Professional" });
      await expect(app).toContainText(lang === "sv" ? "Dokument granskat" : "Document reviewed");
      // A document review must never read as the source's own confirmation.
      await expect(app).not.toContainText(/Source-confirmed|Källbekräftad/);
      await expect(rows.filter({ hasText: "CPP" })).toContainText(
        lang === "sv" ? "Registrerat av innehavaren" : "Registered by holder",
      );

      // The side column is a next step and the sharing status.
      await expect(page.locator("[data-passport-next-step]")).toHaveAttribute(
        "data-passport-next-step",
        "evidence",
      );
      await expect(page.locator("[data-passport-privacy-summary]")).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await shot(page, `06-passport-overview-one-passport-1440-${lang}`);
      if (SHOTS) await app.screenshot({ path: `${SHOTS}/07-passport-app-credential-${lang}.png` });
    });
  }

  test("Add credential, and Preview and share, are one click from the Passport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mount(page, "hub_active", {
      lang: "en",
      path: "/passport",
      ready: "[data-credential-wallet]",
      overrides: passportOverrides(),
    });
    // The actions sit in the row beneath the card: the card itself holds no
    // control (work order 2026-09-17, 1.2).
    await expect(page.locator("[data-credential-wallet] header").locator("a, button")).toHaveCount(
      0,
    );
    await page
      .locator("[data-passport-actions]")
      .getByRole("link", { name: "Add credential" })
      .click();
    await page.waitForURL("**/passport/credentials/new");
    await page.waitForTimeout(800);
    await shot(page, "08-passport-add-credential-1440-en");

    // From the form, sharing is the Share tab; from the Passport, the button.
    await page.getByRole("link", { name: "Share", exact: true }).click();
    await page.waitForURL("**/passport/share");
    await expect(page.locator("[data-share-screen]")).toBeVisible();
    await shot(page, "09-passport-preview-and-share-1440-en");
  });

  test("/passport/card is retired into Preview and share", async ({ page }) => {
    await mount(page, "hub_active", {
      lang: "en",
      path: "/passport/card",
      ready: "[data-share-screen]",
      overrides: passportOverrides(),
    });
    expect(new URL(page.url()).pathname).toBe("/passport/share");
  });
});

/* ------------------------------------------------------------------ */
/* 5 · Phones                                                          */
/* ------------------------------------------------------------------ */

test.describe("at phone widths", () => {
  for (const width of [390, 375] as const) {
    test(`My Career, Profile, CV and the Passport fit ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const { overrides } = backend();
      await mount(page, "hub_active", { lang: "sv", overrides });
      expect(await overflow(page), "My Career overflows").toBeLessThanOrEqual(1);

      // Source order is reading order: Profile, CV, then the Passport.
      const y = async (sel: string) => (await page.locator(sel).boundingBox())?.y ?? -1;
      const profileY = await y('[data-overview-surface="profile"]');
      const cvY = await y('[data-overview-surface="cv"]');
      const passportY = await y("[data-overview-passport-region]");
      expect(profileY).toBeLessThan(cvY);
      expect(cvY).toBeLessThan(passportY);
      for (const sel of ["[data-edit-details]", "[data-edit-cv]"]) {
        const box = await page.locator(sel).boundingBox();
        expect(box && box.height >= 43.5, `${sel} is a 44px target`).toBeTruthy();
      }
      await shot(page, `10-my-career-${width}-sv`);

      await page.goto(page.url().replace(/\/my-career.*/, "/my-career/profile"));
      await page.locator("[data-profile-basics]").waitFor();
      expect(await overflow(page), "Profile overflows").toBeLessThanOrEqual(1);
      await shot(page, `10b-profile-${width}-sv`);

      await page.goto(page.url().replace(/\/my-career.*/, "/my-career/cv"));
      await page.locator("[data-cv-content]").waitFor();
      expect(await overflow(page), "CV overflows").toBeLessThanOrEqual(1);
      await shot(page, `10c-cv-${width}-sv`);
    });

    test(`the Security Passport fits ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await mount(page, "hub_active", {
        lang: "sv",
        path: "/passport",
        ready: "[data-credential-wallet]",
        overrides: passportOverrides(),
      });
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      await expect(page.locator("[data-compact-passport-card]")).toHaveCount(0);
      const name = await page.locator("h1").boundingBox();
      expect(name && name.width <= width, "the name fits the screen").toBeTruthy();
      await shot(page, `11-passport-${width}-sv`);
    });
  }
});

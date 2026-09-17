/** Security Passport overview and the credential shield system — rendered proof.
 *
 * Routed browser acceptance with stubbed server responses, on the same harness
 * as passport-product-visual: nothing reaches a real backend, and the session
 * is planted rather than obtained.
 *
 * What only a browser can prove, and source guards cannot:
 *   * the identity line is the Career Profile's role, never a derived title;
 *   * the card keeps its height whether the holder has 3 credentials or 9;
 *   * shields, flags and written scope are what is actually on screen;
 *   * the holder's name never breaks inside a word, at three widths;
 *   * a shared view's "+N" counts only what was disclosed.
 *
 * Screenshots are a by-product of the assertions. They go to PASSPORT_SHOTS
 * when set, otherwise to the run's own output directory — never over tracked
 * files.
 */
import { test, expect, type Page } from "@playwright/test";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import { derivePreviewIdentity } from "../src/lib/security-passport/identity/visibility";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import type { Claim } from "../src/lib/security-passport/types";
import {
  installBoundary,
  observeSupabaseStorageKey,
  plantSession,
  horizontalOverflow,
} from "./support/public-entry-harness";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3141";
// The spec's clock is the machine's: expiry is derived against the real today.
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = day(0);
const source = personaById("overlapping-employers");

let seq = 0;
function claim(over: Partial<Claim> & { credentialCode: string | null; titleEn: string }): Claim {
  seq += 1;
  return {
    ...source.claims[0],
    id: `f1900000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    claimType: "certification",
    assertionLevel: "self_declared",
    lifecycleState: "active",
    issuedOn: "2025-01-01",
    validUntil: day(900),
    versionNo: 1,
    jurisdictionCode: null,
    subJurisdictionCode: null,
    titleSv: over.titleEn,
    ...over,
  } as unknown as Claim;
}

const CPP = claim({
  credentialCode: "INTL_ASIS_CPP",
  titleEn: "Certified Protection Professional (CPP)",
  issuerName: "ASIS International",
});
const PSP = claim({
  credentialCode: "INTL_ASIS_PSP",
  titleEn: "Physical Security Professional (PSP)",
  issuerName: "ASIS International",
  assertionLevel: "document_provided",
});
const PCI = claim({
  credentialCode: "INTL_ASIS_PCI",
  titleEn: "Professional Certified Investigator (PCI)",
  issuerName: "ASIS International",
});
const CISSP = claim({
  credentialCode: "INTL_ISC2_CISSP",
  titleEn: "Certified Information Systems Security Professional (CISSP)",
  issuerName: "ISC2",
});
const OV = claim({
  credentialCode: "OV",
  claimType: "licence",
  titleSv: "Ordningsvaktsförordnande",
  titleEn: "Public Order Guard Appointment",
  issuerName: "Polismyndigheten",
  jurisdictionCode: "SE",
  validUntil: day(18),
});
const VU1 = claim({
  credentialCode: "VU1",
  claimType: "training",
  titleSv: "Väktarutbildning 1 (VU1)",
  titleEn: "Security Guard Training 1 (VU1)",
  issuerName: "Utbildaren AB",
  jurisdictionCode: "SE",
  assertionLevel: "verified",
  verifierName: "CQrityjob",
  verificationMethod: "document_review",
  verifiedOn: "2026-09-10",
} as never);
const SIA = claim({
  credentialCode: "GB_SIA_SG",
  claimType: "licence",
  titleEn: "SIA Licence — Security Guarding",
  issuerName: "Security Industry Authority (SIA)",
  jurisdictionCode: "GB",
});
const SIA_NI = claim({
  credentialCode: "GB_SIA_DS",
  claimType: "licence",
  titleEn: "SIA Licence — Door Supervision",
  issuerName: "Security Industry Authority (SIA)",
  jurisdictionCode: "GB",
  subJurisdictionCode: "GB-NI",
});
const SIRA = claim({
  credentialCode: "AE_DU_SIRA_GUARD",
  claimType: "licence",
  titleEn: "SIRA Security Guard Card",
  issuerName: "Security Industry Regulatory Agency (SIRA)",
  jurisdictionCode: "AE",
  subJurisdictionCode: "AE-DU",
});
const FUTURE = claim({
  credentialCode: null,
  claimType: "licence",
  titleEn: "Vekterkurs",
  issuerName: "Politiet",
  jurisdictionCode: "NO",
});
const EXPIRED = claim({
  credentialCode: "SV",
  claimType: "licence",
  titleSv: "Skyddsvaktsförordnande",
  titleEn: "Protective Security Guard Appointment",
  issuerName: "Länsstyrelsen",
  jurisdictionCode: "SE",
  validUntil: day(-40),
});
const DRAFT = claim({
  credentialCode: "INTL_ISACA_CISM",
  titleEn: "Certified Information Security Manager (CISM)",
  lifecycleState: "draft",
});

const THREE = [CPP, OV, SIA];
const NINE = [CPP, PSP, PCI, CISSP, OV, VU1, SIA, SIA_NI, SIRA];
const GLOBAL_CODES = [
  "INTL_ASIS_CPP",
  "INTL_ASIS_PSP",
  "INTL_ASIS_PCI",
  "INTL_ISC2_CISSP",
  "INTL_ISACA_CISM",
];

const metadata = {
  definitions: GLOBAL_CODES.map((code) => {
    const c = [...NINE, DRAFT].find((x) => x.credentialCode === code)!;
    return {
      code,
      name_sv: c.titleEn,
      name_en: c.titleEn,
      credential_class: "certification",
      scope_code: "global_professional",
      country: null,
      region: null,
      issuer_id: null,
      issuer_name: c.issuerName,
      official_url: null,
      verification_url: null,
      requires_valid_until: false,
      allows_no_expiry: false,
    };
  }),
  details: [],
  verificationEvents: [
    { claimId: VU1.id, result: "approved", decidedAt: "2026-09-10T12:00:00Z", validUntil: null },
  ],
  issuers: [],
  jurisdictions: [],
};

function snapshotFor(
  displayName: string,
  claims: readonly Claim[],
  role: { sv: string | null; en: string | null } = { sv: "Säkerhetschef", en: "Head of Security" },
) {
  return {
    profileIdentity: { displayName, titleSv: role.sv, titleEn: role.en },
    profile: {
      displayName,
      headline: "OLD TITLE MUST NOT APPEAR",
      privacyMode: "full_name",
      onboardingState: "completed",
      onboardingAnswers: {},
    },
    holder: {
      ...source,
      displayName,
      claims,
      periods: [],
      // The real engine over these claims — the stub must not hand-write a
      // title, or this suite would be asserting its own fixture.
      identity: derivePreviewIdentity(claims, MIRRORED_TITLE_RULES, TODAY),
    },
    eventCount: 0,
  };
}

async function mount(
  page: Page,
  path: string,
  lang: "sv" | "en",
  snapshot: ReturnType<typeof snapshotFor>,
  extra: Record<string, unknown> = {},
) {
  const refusals = await installBoundary(page, {
    getMyPassport: snapshot,
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
    ...extra,
  });
  const storageKey = await observeSupabaseStorageKey(page);
  await plantSession(page, storageKey);
  await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
  await page.goto(`${base}${path}`);
  return refusals;
}

/** How many lines the name takes, and whether any single WORD spans two. */
async function nameLayout(page: Page) {
  return page.locator("[data-passport-holder-name]").evaluate((el) => {
    const node = el.firstChild as Text;
    const text = node.textContent ?? "";
    const brokenWords: string[] = [];
    const tops = new Set<number>();
    for (const m of text.matchAll(/\S+/g)) {
      const r = document.createRange();
      r.setStart(node, m.index!);
      r.setEnd(node, m.index! + m[0].length);
      const lines = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
      if (lines.size > 1) brokenWords.push(m[0]);
      for (const t of lines) tops.add(t);
    }
    return { brokenWords, lines: tops.size };
  });
}

const WIDTHS = [390, 768, 1440] as const;
const NAMES = ["Mostafa Alshawi", "Jean-Baptiste de la Rochefoucauld", "Madonna"] as const;
const card = (page: Page) => page.locator("[data-passport-identity-surface]");
const shields = (page: Page) => card(page).locator("[data-credential-shield]");

for (const lang of ["sv", "en"] as const) {
  test(`overview and shields · ${lang}`, async ({ page }, info) => {
    test.setTimeout(420_000);
    const shots = process.env.PASSPORT_SHOTS ?? info.outputPath("shots");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shots, { recursive: true });
    const T = (sv: string, en: string) => (lang === "sv" ? sv : en);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });

      // ── Three credentials, one of which the engine derives a title from ──
      await mount(page, "/passport", lang, snapshotFor("Mostafa Alshawi", THREE));
      await expect(card(page)).toBeVisible({ timeout: 30_000 });

      // 15 · one Passport surface; 16 · nothing to press inside it.
      await expect(card(page)).toHaveCount(1);
      await expect(page.locator("[data-compact-passport-card]")).toHaveCount(0);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        card(page).locator(
          "button, input, select, textarea, [role=button], [role=tab], [role=menu]",
        ),
      ).toHaveCount(0);
      // Three fit, so there is no "+N" and therefore no link at all.
      await expect(card(page).locator("a")).toHaveCount(0);

      // 1–3 · the Profile's role is the identity; the derived title is not.
      await expect(page.locator("[data-passport-current-role]")).toHaveText(
        T("Säkerhetschef", "Head of Security"),
      );
      await expect(page.locator("[data-passport-role-source]")).toHaveText(
        T("Nuvarande yrke · Egen uppgift", "Current professional role · Self-declared"),
      );
      const cardText = await card(page).innerText();
      expect(cardText).not.toMatch(/Ordningsvakt\b|Public Order Guard \(/);
      expect(cardText).not.toMatch(/Ingen aktiv yrkestitel|No active professional title/);
      // …and the engine's title lives in the panel's trust layer, labelled.
      const derived = page.locator("[data-passport-panel] [data-passport-derived-title]");
      await expect(derived).toContainText(T("Ordningsvakt", "Public Order Guard (Ordningsvakt)"));
      await expect(derived.getByTestId("sp-self-declared-marker")).toBeVisible();
      await expect(page.getByText("OLD TITLE MUST NOT APPEAR")).toHaveCount(0);

      // 4 · three current credentials, three shields.
      await expect(shields(page)).toHaveCount(3);
      const threeHeight = (await card(page).boundingBox())!.height;

      // ONE claim-specific link per credential on the whole overview, and it
      // is the row's. The next step and "Needs attention" name a credential;
      // they do not link to it. No .first(): a second link must FAIL here.
      for (const c of THREE) {
        const link = page.locator(`a[href="/passport/entry/claim/${c.id}"]`);
        await expect(link).toHaveCount(1);
        await expect(link).toBeVisible();
        await expect(
          page.locator(`[data-credential-row] a[href="/passport/entry/claim/${c.id}"]`),
        ).toHaveCount(1);
      }
      await expect(page.locator("[data-passport-panel] a[href*='/passport/entry/']")).toHaveCount(
        0,
      );
      const step = page.locator('[data-cta="next-step"]');
      await expect(step).toHaveCount(1);
      await expect(step).toHaveAttribute("href", /\/passport#attention$/);
      // Still says WHICH credential, and the expiring one is still named.
      await expect(page.locator("[data-passport-next-step]")).toContainText(CPP.titleEn);
      await expect(page.locator(`[data-passport-expiring-item="${OV.id}"]`)).toBeVisible();

      // 14 · exactly one Add credential on the page, in the panel.
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: T("Lägg till meriter", "Add credential") }),
      ).toHaveCount(1);
      const actions = page.locator("[data-passport-actions] a");
      await expect(actions).toHaveCount(2);
      for (const a of await actions.all()) {
        expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.locator('[data-cta="edit-in-profile"]')).toHaveText(
        T("Ändra nuvarande yrke", "Edit current professional role"),
      );
      await expect(page.locator('[data-cta="edit-in-profile"]')).toHaveAttribute(
        "href",
        /\/my-career\/profile#profile-basics$/,
      );

      // Four tabs, one current.
      const tabs = page.locator("nav").filter({ has: page.locator('a[href$="#attention"]') });
      await expect(tabs.locator("a")).toHaveText(
        lang === "sv"
          ? ["Översikt", "Meriter", "Granskning", "Dela"]
          : ["Overview", "Credentials", "Verification", "Share"],
      );
      await expect(tabs.locator('a[aria-current="page"]')).toHaveCount(1);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      if (width !== 768) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${shots}/holder-3-credentials-${width}-${lang}.png`,
          fullPage: true,
        });
      }

      // ── Nine current, plus one expired, one draft, one future scope ───
      await mount(
        page,
        "/passport",
        lang,
        snapshotFor("Mostafa Alshawi", [...NINE, EXPIRED, DRAFT, FUTURE]),
      );
      await expect(card(page)).toBeVisible({ timeout: 30_000 });

      // 5 · three shields and the exact count. Ten are current: the nine and
      // the future-scope one. The expired and the draft are not.
      await expect(shields(page)).toHaveCount(3);
      const more = card(page).locator("[data-shield-overflow]");
      await expect(more).toHaveAttribute("data-shield-overflow", "7");
      // 11 · history is never a shield.
      await expect(card(page).locator(`[data-credential-shield="${EXPIRED.id}"]`)).toHaveCount(0);
      await expect(card(page).locator(`[data-credential-shield="${DRAFT.id}"]`)).toHaveCount(0);
      expect(
        await shields(page).evaluateAll((els) =>
          els.map((e) => e.getAttribute("data-shield-state")),
        ),
      ).toEqual(["documented", "documented", "self_declared"]);
      // What was checked leads, and inside one standing the page's own order
      // holds: PSP is listed before VU1. (A CQrityjob document review presents
      // as Documented — no credential can read as Verified in this phase, so
      // the three-way distinction is proven on the component, in the guard.)
      expect(
        await shields(page).evaluateAll((els) =>
          els.map((e) => e.getAttribute("data-credential-shield")),
        ),
      ).toEqual([PSP.id, VU1.id, CPP.id]);

      // The card does not grow with the collection.
      const nineHeight = (await card(page).boundingBox())!.height;
      expect(Math.abs(nineHeight - threeHeight)).toBeLessThanOrEqual(24);

      // 10 · the three standings differ in shape and in words, not in hue only.
      const treatments = await shields(page).evaluateAll((els) =>
        els.map((e) => {
          const path = e.querySelector("[data-shield-mark] path")!;
          return {
            dash: path.getAttribute("stroke-dasharray"),
            paths: e.querySelectorAll("[data-shield-mark] path").length,
            label: e.getAttribute("aria-label")!,
            text: (e as HTMLElement).innerText,
          };
        }),
      );
      expect(treatments[0].dash).toBeNull();
      expect(treatments[2].dash).not.toBeNull();
      expect(treatments[0].paths).toBeGreaterThan(treatments[2].paths);
      expect(treatments[0].text.toLowerCase()).toContain(T("dokument", "document"));
      expect(treatments[2].label).toMatch(lang === "sv" ? /egen/i : /self-declared/i);

      // 7 · 8 · 9 · scope, in the rows where every credential is listed.
      const scopeOf = (c: Claim) =>
        page
          .locator("[data-credential-row]")
          .filter({ hasText: lang === "sv" ? c.titleSv : c.titleEn })
          .locator("[data-credential-scope]");
      await expect(scopeOf(CPP)).toHaveText("Global");
      await expect(scopeOf(CPP).locator('[data-scope-mark="globe"]')).toHaveCount(1);
      await expect(scopeOf(CPP).locator("[data-flag]")).toHaveCount(0);
      for (const [c, flag, label] of [
        [OV, "SE", T("Sverige", "Sweden")],
        [SIA, "GB", T("Storbritannien", "Great Britain")],
        [SIA_NI, "GB", T("Nordirland", "Northern Ireland")],
        [SIRA, "AE", "Dubai"],
      ] as const) {
        await expect(scopeOf(c)).toHaveText(label);
        await expect(scopeOf(c).locator(`[data-flag="${flag}"]`)).toHaveCount(1);
      }
      await expect(scopeOf(FUTURE)).toHaveText("NO");
      await expect(scopeOf(FUTURE).locator('[data-scope-mark="generic"]')).toHaveCount(1);
      await expect(page.locator("[data-credential-row] img")).toHaveCount(0);

      // International certifications are not filed under a country.
      await expect(
        page.locator('[data-credential-group="global"] [data-credential-row]'),
      ).toHaveCount(5);
      for (const key of ["SE", "GB", "GB-NI", "AE-DU", "NO"]) {
        await expect(page.locator(`[data-credential-group="${key}"]`)).toHaveCount(1);
      }
      // The expired one is listed — as expired.
      await expect(
        page
          .locator("[data-credential-row]")
          .filter({ hasText: T(EXPIRED.titleSv, EXPIRED.titleEn) }),
      ).toContainText(T("Utgång", "Expired"));

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      if (width !== 768) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${shots}/holder-12-credentials-${width}-${lang}.png`,
          fullPage: true,
        });
        await card(page).screenshot({ path: `${shots}/card-${width}-${lang}.png` });
      }

      // 6 · "+N" is a real link, reachable by keyboard, to Credentials.
      const overflowLink = card(page).locator("a[data-shield-overflow-link]");
      await expect(card(page).locator("a")).toHaveCount(1);
      await expect(overflowLink).toHaveAccessibleName(/\+7/);
      await overflowLink.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/passport#merits$/);

      // ── Exactly four: all four, no count ─────────────────────────────
      await mount(page, "/passport", lang, snapshotFor("Mostafa Alshawi", [CPP, OV, SIA, SIRA]));
      await expect(shields(page)).toHaveCount(4, { timeout: 30_000 });
      await expect(card(page).locator("[data-shield-overflow]")).toHaveCount(0);

      // ── None, and no role: a calm card, and no negative title ─────────
      await mount(
        page,
        "/passport",
        lang,
        snapshotFor("Mostafa Alshawi", [], { sv: null, en: null }),
      );
      await expect(card(page).locator('[data-shield-constellation="empty"]')).toBeVisible({
        timeout: 30_000,
      });
      expect(await card(page).innerText()).not.toMatch(
        /Ingen aktiv yrkestitel|No active professional title/,
      );
      await expect(page.locator('[data-cta="edit-in-profile"]')).toHaveText(
        T("Lägg till nuvarande yrke", "Add current professional role"),
      );
      await expect(
        page
          .getByRole("main")
          .getByRole("link", { name: T("Lägg till meriter", "Add credential") }),
      ).toHaveCount(1);

      // ── Names ────────────────────────────────────────────────────────
      for (const name of NAMES) {
        await mount(page, "/passport", lang, snapshotFor(name, NINE));
        await expect(page.locator("[data-passport-holder-name]")).toHaveText(name, {
          timeout: 30_000,
        });
        const layout = await nameLayout(page);
        expect(layout.brokenWords, `${name} @${width}`).toEqual([]);
        expect(layout.lines, `${name} @${width}`).toBeLessThanOrEqual(2);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      }
    }

    // ── The absorbed routes keep exactly one current tab ───────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/passport/privacy", "/passport/share"]) {
      await mount(page, path, lang, snapshotFor("Mostafa Alshawi", THREE));
      const sections = page.locator("[data-passport-share-sections]");
      await expect(sections).toBeVisible({ timeout: 30_000 });
      const tabs = page.locator("nav").filter({ has: page.locator('a[href$="#attention"]') });
      await expect(tabs.locator('a[aria-current="page"]')).toHaveText([T("Dela", "Share")]);
      await expect(sections.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(sections.locator("a")).toHaveCount(2);
    }
  });

  test(`a shared view counts only what was disclosed · ${lang}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const shots = process.env.PASSPORT_SHOTS ?? info.outputPath("shots");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shots, { recursive: true });

    // The holder has nine. SIX were chosen for this share. The other three —
    // PCI, CISSP and the Northern Ireland licence — must not exist here.
    const disclosed = [CPP, PSP, OV, VU1, SIA, SIRA];
    const withheld = [PCI, CISSP, SIA_NI];
    const payload = {
      status: "active",
      package: "selected_merits",
      focus: "passport",
      purpose: null,
      locale: lang,
      expires_at: `${day(30)}T09:00:00Z`,
      authorised_at: `${TODAY}T09:00:00Z`,
      last_updated: `${TODAY}T09:00:00Z`,
      holder: "Mostafa Alshawi",
      profile_title: lang === "sv" ? "Säkerhetschef" : "Head of Security",
      privacy_mode: "full_name",
      profession_slug: null,
      jurisdiction: "SE",
      sub_jurisdiction: null,
      checked_at: `${TODAY}T07:00:00Z`,
      verified_claims: disclosed.map((c, i) => ({
        key: `c${i + 1}`,
        type: c.claimType,
        title: lang === "sv" ? c.titleSv : c.titleEn,
        credential_code: c.credentialCode,
        issuer: c.issuerName,
        jurisdiction: c.jurisdictionCode,
        sub_jurisdiction: c.subJurisdictionCode,
        scope_limited: false,
        authorisation_scope: null,
        issued_on: c.issuedOn,
        valid_until: c.validUntil,
        assertion: c.assertionLevel,
        lifecycle: "active",
        verified_at: c.assertionLevel === "verified" ? "2026-09-10T00:00:00Z" : null,
        verifier_organisation: c.assertionLevel === "verified" ? "CQrityjob" : null,
        verification_method: c.assertionLevel === "verified" ? "document_review" : null,
      })),
      verified_experience: [],
      verified_employment_days: 0,
      rules: [],
    };

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await mount(page, "/p/abcdef0123456789", lang, snapshotFor("Mostafa Alshawi", NINE), {
        getPublicDisclosureFromCookie: payload,
      });
      const region = page.locator("[data-recipient-shields]");
      await expect(region).toBeVisible({ timeout: 30_000 });

      // 12 · six disclosed → three shields and "+3". Never "+6" of nine.
      await expect(region.locator("[data-credential-shield]")).toHaveCount(3);
      await expect(region.locator("[data-shield-overflow]")).toHaveAttribute(
        "data-shield-overflow",
        "3",
      );
      // A recipient has nowhere further to go: the count is not a link.
      await expect(region.locator("a")).toHaveCount(0);

      // 13 · nothing withheld appears anywhere on the page, in any form.
      const body = await page.locator("body").innerText();
      for (const c of withheld) {
        expect(body).not.toContain(c.titleEn);
        expect(body).not.toContain(c.titleSv);
      }
      expect(body).not.toMatch(/PCI|CISSP/);
      expect(body).not.toMatch(/Nordirland|Northern Ireland/);
      expect(body).not.toMatch(/\+6|\b9\b/);

      // Same flags, same written scope, as the holder's own card.
      await expect(region.locator('[data-shield-scope="SE"] [data-flag="SE"]')).toHaveCount(1);

      // No QR on a page that was not handed a share link to encode.
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${shots}/recipient-subset-${width}-${lang}.png`,
        fullPage: true,
      });
    }
  });
}

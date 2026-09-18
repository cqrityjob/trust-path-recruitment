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
import { credentialRowAnchor } from "../src/lib/security-passport/credential-passport";
import { CAREER_PROFILE_PROFESSION_EDIT_HREF } from "../src/lib/security-passport/profile-basics";
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
      await expect(step).toHaveAttribute("href", `/passport#${credentialRowAnchor(CPP.id)}`);
      await expect(step).toHaveText(T("Visa meriten", "View credential"));
      await expect(step).not.toHaveText(/Lägg till underlag|Add evidence/);
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
        CAREER_PROFILE_PROFESSION_EDIT_HREF,
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

  test(`the next step takes the holder to that credential's row · ${lang}`, async ({ page }) => {
    test.setTimeout(180_000);
    const T = (sv: string, en: string) => (lang === "sv" ? sv : en);
    /** Whether the row is on screen and owns keyboard focus. */
    const arrived = async (c: Claim) => {
      const row = page.locator(`#${credentialRowAnchor(c.id)}`);
      await expect(row).toHaveAttribute("data-credential-row");
      await expect(row).toBeInViewport();
      await expect(row).toBeFocused();
      await expect(row).toHaveAttribute("data-hash-target", credentialRowAnchor(c.id));
      // A VISIBLE focus state, not only a programmatic one.
      expect(
        await row.evaluate((el) => {
          const cs = getComputedStyle(el);
          return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
        }),
      ).toBe(true);
      return row;
    };

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 800 });

      // ── evidence: twelve records, so the row is far below the fold ─────
      await mount(
        page,
        "/passport",
        lang,
        snapshotFor("Mostafa Alshawi", [...NINE, EXPIRED, DRAFT, FUTURE]),
      );
      const step = page.locator('[data-cta="next-step"]');
      await expect(step).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator("[data-passport-next-step]")).toHaveAttribute(
        "data-passport-next-step",
        "evidence",
      );
      await expect(step).toHaveText(T("Visa meriten", "View credential"));
      const target = await step.getAttribute("data-next-step-target");
      expect(target).toBe(credentialRowAnchor(CPP.id));
      // The target EXISTS before anybody presses anything: never an empty region.
      await expect(page.locator(`#${target}`)).toHaveCount(1);

      await step.click();
      await expect(page).toHaveURL(new RegExp(`/passport#${target}$`));
      const row = await arrived(CPP);
      await expect(row).toContainText(CPP.titleEn);
      // Its REAL action is still there, and still the only claim link for it.
      const action = row.getByRole("link", { name: T("Lägg till underlag", "Add evidence") });
      await expect(action).toBeVisible();
      await expect(action).toHaveAttribute("href", `/passport/entry/claim/${CPP.id}`);
      await expect(page.locator(`a[href="/passport/entry/claim/${CPP.id}"]`)).toHaveCount(1);
      // Exactly one row is marked as the arrival.
      await expect(page.locator("[data-hash-target]")).toHaveCount(1);

      // A second press, fragment unchanged, still arrives.
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        (document.activeElement as HTMLElement | null)?.blur();
      });
      await expect(row).not.toBeFocused();
      await step.click();
      await arrived(CPP);

      // By keyboard too.
      await page.evaluate(() => window.scrollTo(0, 0));
      await step.focus();
      await page.keyboard.press("Enter");
      await arrived(CPP);

      // ── clarify: a reviewer is waiting on the Swedish appointment ──────
      await mount(page, "/passport", lang, snapshotFor("Mostafa Alshawi", NINE), {
        listMyVerificationRequests: {
          requests: [
            {
              id: "vr-1",
              claimId: OV.id,
              status: "clarification_requested",
              createdAt: `${TODAY}T08:00:00Z`,
            },
          ],
          decisions: [],
        },
      });
      await expect(page.locator("[data-passport-next-step]")).toHaveAttribute(
        "data-passport-next-step",
        "clarify",
        { timeout: 30_000 },
      );
      await expect(step).toHaveText(T("Visa meriten", "View credential"));
      await step.click();
      const ovRow = await arrived(OV);
      const provide = ovRow.getByRole("link", {
        name: T("Komplettera uppgifter", "Provide information"),
      });
      await expect(provide).toBeVisible();
      await expect(provide).toHaveAttribute("href", `/passport/entry/claim/${OV.id}`);
      // EXACTLY ONE claim-route link per credential on the COMPLETE page —
      // the reviewer's credential included. No scoping, no .first().
      for (const c of NINE) {
        await expect(page.locator(`a[href="/passport/entry/claim/${c.id}"]`)).toHaveCount(1);
        await expect(
          page.locator(`[data-credential-row] a[href="/passport/entry/claim/${c.id}"]`),
        ).toHaveCount(1);
      }
      await expect(page.locator('#attention a[href*="/passport/entry/"]')).toHaveCount(0);

      // The Verification section still names the outcome — and takes the
      // reader to the credential's row rather than duplicating its link.
      const outcome = page.locator(`#attention a[data-outcome-link="${OV.id}"]`);
      await expect(outcome).toHaveCount(1);
      await expect(outcome).toHaveText(T("Visa meriten", "View credential"));
      await expect(outcome).toHaveAttribute("href", `/passport#${credentialRowAnchor(OV.id)}`);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      await outcome.scrollIntoViewIfNeeded();
      await outcome.click();
      const viaOutcome = await arrived(OV);
      // …and the outcome is USABLE from there: the row action opens the claim.
      await viaOutcome
        .getByRole("link", { name: T("Komplettera uppgifter", "Provide information") })
        .click();
      await expect(page).toHaveURL(new RegExp(`/passport/entry/claim/${OV.id}$`));
      await page.goBack();
      await expect(page.locator("[data-credential-wallet]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-hash-target]")).toHaveCount(1);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    }
  });

  test(`a long credential title never collides with its status · ${lang}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const shots = process.env.PASSPORT_SHOTS ?? info.outputPath("shots");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shots, { recursive: true });
    const T = (sv: string, en: string) => (lang === "sv" ? sv : en);

    // Deliberately long, in both languages, with one long unbroken word —
    // the shape that collided: "Ordningsvaktsförordnande".
    const LONG = T(
      "Ordningsvaktsförordnande med särskild behörighet för kollektivtrafik och domstolar",
      "Ordningsvaktsförordnande — Public Order Guard Appointment with special authority for public transport",
    );
    const entry = (key: string, title: string, over: Record<string, unknown>) => ({
      key,
      type: "licence",
      title,
      credential_code: "OV",
      issuer: "Polismyndigheten",
      jurisdiction: "SE",
      sub_jurisdiction: null,
      scope_limited: false,
      authorisation_scope: null,
      issued_on: "2025-01-01",
      valid_until: day(400),
      assertion: "self_declared",
      lifecycle: "active",
      verified_at: null,
      verifier_organisation: null,
      verification_method: null,
      ...over,
    });
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
      privacy_mode: "full_name",
      profession_slug: null,
      jurisdiction: "SE",
      sub_jurisdiction: null,
      checked_at: `${TODAY}T07:00:00Z`,
      verified_claims: [
        entry("long-self", LONG, {}),
        // The widest chip the product prints, on the same long title.
        entry("long-doc", LONG, { assertion: "document_provided" }),
        // …and one that is no longer current: a different lifecycle chip.
        entry("long-expired", LONG, { valid_until: day(-30) }),
      ],
      verified_experience: [],
      verified_employment_days: 0,
      rules: [],
    };

    type Box = { x: number; y: number; width: number; height: number };
    const intersects = (a: Box, b: Box) =>
      a.x < b.x + b.width - 0.5 &&
      b.x < a.x + a.width - 0.5 &&
      a.y < b.y + b.height - 0.5 &&
      b.y < a.y + a.height - 0.5;

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await mount(page, "/p/abcdef0123456789", lang, snapshotFor("Mostafa Alshawi", NINE), {
        getPublicDisclosureFromCookie: payload,
      });
      const items = page.locator("[data-recipient-credential]");
      await expect(items).toHaveCount(3, { timeout: 30_000 });

      for (const key of ["long-self", "long-doc", "long-expired"]) {
        const item = page.locator(`[data-recipient-credential="${key}"]`);
        const title = item.locator("[data-recipient-credential-title]");
        const status = item.locator("[data-recipient-credential-status]");
        await expect(title).toHaveText(LONG);

        // The painted text, not the box: a word that overflows its box paints
        // OUTSIDE it, which is exactly how the collision hid from a box check.
        const ink = await title.evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          const rects = [...r.getClientRects()];
          const x = Math.min(...rects.map((q) => q.left));
          const y = Math.min(...rects.map((q) => q.top));
          return {
            x,
            y,
            width: Math.max(...rects.map((q) => q.right)) - x,
            height: Math.max(...rects.map((q) => q.bottom)) - y,
          };
        });
        const chips = await status.locator(":scope > *").all();
        expect(chips.length, `${key} @${width}: trust and lifecycle`).toBe(2);
        for (const chip of chips) {
          await expect(chip).toBeVisible();
          expect((await chip.innerText()).trim().length).toBeGreaterThan(0);
          const box = (await chip.boundingBox())!;
          expect(intersects(ink, box), `${key} @${width}: title ink over a status chip`).toBe(
            false,
          );
          // Inside the card, fully: not clipped at the right edge.
          const card = (await item.boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
        }
        // The two chips do not overlap each other either.
        const [a, b] = await Promise.all(chips.map((c) => c.boundingBox()));
        expect(intersects(a!, b!), `${key} @${width}: chips overlap`).toBe(false);
        // The title's ink stays inside its card.
        const card = (await item.boundingBox())!;
        expect(ink.x + ink.width).toBeLessThanOrEqual(card.x + card.width + 0.5);

        // No word is broken across lines.
        const broken = await title.evaluate((el) => {
          const node = el.firstChild as Text;
          const out: string[] = [];
          for (const m of (node.textContent ?? "").matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(node, m.index!);
            r.setEnd(node, m.index! + m[0].length);
            if (new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size > 1)
              out.push(m[0]);
          }
          return out;
        });
        expect(broken, `${key} @${width}`).toEqual([]);

        // The layout is DELIBERATE: stacked on a phone, side by side on desktop.
        const tBox = (await title.boundingBox())!;
        const sBox = (await status.boundingBox())!;
        if (width === 390) {
          expect(sBox.y).toBeGreaterThanOrEqual(tBox.y + tBox.height - 0.5);
        } else {
          expect(sBox.x).toBeGreaterThanOrEqual(tBox.x + tBox.width - 0.5);
          expect(Math.abs(sBox.y - tBox.y)).toBeLessThan(12);
          // Desktop keeps its right-aligned column of chips.
          expect(sBox.x + sBox.width).toBeGreaterThan(card.x + card.width - 24);
        }
      }
      // The labels say what they are, in this language.
      const first = page.locator('[data-recipient-credential="long-self"]');
      await expect(first.locator("[data-recipient-credential-status]")).toContainText(
        T("Gällande", "Active"),
      );
      await expect(
        page
          .locator('[data-recipient-credential="long-expired"]')
          .locator("[data-recipient-credential-status]"),
      ).toContainText(T("Utgång", "Expired"));

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await first.scrollIntoViewIfNeeded();
      await page
        .locator("[data-recipient-credential]")
        .locator("xpath=ancestor::ul[1]")
        .screenshot({ path: `${shots}/recipient-long-title-${width}-${lang}.png` });
    }
  });

  test(`the card finish: one quiet ground, on the overview and the homepage · ${lang}`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    // PASSPORT_EVIDENCE_ONLY renders the SAME fixture against another build
    // (the "before" pictures) without asserting the new contract against it.
    const evidenceOnly = process.env.PASSPORT_EVIDENCE_ONLY === "1";
    const tag = process.env.PASSPORT_SHOT_TAG ?? "after";
    const shots = process.env.PASSPORT_SHOTS ?? info.outputPath("shots");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shots, { recursive: true });
    const T = (sv: string, en: string) => (lang === "sv" ? sv : en);

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });

      // ── the holder's card, same fixture as every other test here ──────
      await mount(page, "/passport", lang, snapshotFor("Mostafa Alshawi", NINE));
      await expect(card(page)).toBeVisible({ timeout: 30_000 });
      await card(page).screenshot({ path: `${shots}/${tag}-card-${width}-${lang}.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${shots}/${tag}-overview-${width}-${lang}.png` });

      if (!evidenceOnly) {
        const ground = await card(page).evaluate((el) => {
          const cs = getComputedStyle(el);
          return { image: cs.backgroundImage, border: cs.borderTopWidth, shadow: cs.boxShadow };
        });
        expect(ground.image).toContain("linear-gradient");
        expect(ground.image).not.toContain("repeating-linear-gradient");
        expect((ground.image.match(/gradient\(/g) ?? []).length).toBe(1);
        expect(ground.border).toBe("1px");
        expect(ground.shadow).not.toBe("none");
        // No decorative layer is mounted inside the card at all.
        await expect(card(page).locator('[aria-hidden="true"][class*="absolute"]')).toHaveCount(0);
        // The content is untouched: shields, flags, globe, trust words, +N.
        await expect(shields(page)).toHaveCount(3);
        await expect(card(page).locator("[data-shield-overflow]")).toHaveCount(1);
        // At 390px and up the holder's card is wide enough for ONE row of four.
        const tops = await card(page)
          .locator("[data-shield-constellation] > li")
          .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        expect(new Set(tops).size, `one row @${width}`).toBe(1);
        await expect(card(page).locator('[data-scope-mark="globe"]')).not.toHaveCount(0);
        await expect(card(page).locator("[data-flag]")).not.toHaveCount(0);
        // White identity text on navy: the name is the token's ink-on-navy.
        const name = await page
          .locator("[data-passport-holder-name]")
          .evaluate((el) => getComputedStyle(el).color);
        expect(name).toMatch(/rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)|oklch\(0\.9/);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      }

      // ── the public homepage, signed out ───────────────────────────────
      await page.context().clearCookies();
      await page.goto(`${base}/`);
      await page.evaluate((l) => {
        localStorage.clear();
        localStorage.setItem("cqrityjob.lang", l);
      }, lang);
      await page.goto(`${base}/`);
      const panel = page.locator("[data-home-passport-preview]");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await panel.scrollIntoViewIfNeeded();
      await panel.screenshot({ path: `${shots}/${tag}-homepage-panel-${width}-${lang}.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${shots}/${tag}-homepage-${width}-${lang}.png`,
        fullPage: true,
      });

      if (!evidenceOnly) {
        const image = await panel.evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(image).not.toContain("repeating-linear-gradient");
        await expect(panel.locator('[class*="passport-grid"]')).toHaveCount(0);

        // The owner's sentence, to the letter.
        await expect(panel).toContainText(
          T(
            "Samla dina certifieringar, licenser och yrkesbehörigheter — internationellt och per land. Lägg till underlag och välj vad du delar.",
            "Bring together your certifications, licences and professional authorisations — internationally and by country. Add supporting evidence and choose what you share.",
          ),
        );
        expect(await panel.innerText()).not.toMatch(
          /Samla erfarenhet|experience, education|Dokumenterad källa|Documented source|Tillitstillstånd|Trust state/i,
        );

        // A labelled, fictional example drawn with the REAL shield system.
        const example = panel.locator("[data-home-passport-example]");
        await expect(example.locator("[data-home-passport-example-label]")).toHaveText(
          T("Exempel", "Example"),
        );
        await expect(example).toHaveAttribute(
          "aria-label",
          T(/Exempel — Påhittad person/, /Example — Fictional person/),
        );
        await expect(example).toContainText(T("Exempel Exempelsson", "Example Holder"));
        await expect(example.locator("[data-credential-shield]")).toHaveCount(3);
        await expect(example.locator('[data-scope-mark="globe"]')).toHaveCount(1);
        for (const flag of ["SE", "GB"]) {
          await expect(example.locator(`[data-flag="${flag}"]`)).toHaveCount(1);
        }
        await expect(example.locator('[data-shield-state="verified"]')).toHaveCount(0);
        // No shield's words run into its neighbour's — the collision the
        // narrow example card had at 390px. Measured on the painted text.
        const inks = await example.locator("[data-credential-shield]").evaluateAll((els) =>
          els.map((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            const rects = [...r.getClientRects()].filter((q) => q.width > 0);
            return {
              left: Math.min(...rects.map((q) => q.left)),
              right: Math.max(...rects.map((q) => q.right)),
              top: Math.min(...rects.map((q) => q.top)),
              bottom: Math.max(...rects.map((q) => q.bottom)),
            };
          }),
        );
        for (let i = 0; i < inks.length; i += 1)
          for (let j = i + 1; j < inks.length; j += 1) {
            const [p1, p2] = [inks[i]!, inks[j]!];
            const overlap =
              p1.left < p2.right - 0.5 &&
              p2.left < p1.right - 0.5 &&
              p1.top < p2.bottom - 0.5 &&
              p2.top < p1.bottom - 0.5;
            expect(overlap, `shields ${i} and ${j} overlap @${width}`).toBe(false);
          }
        await expect(panel).toContainText(
          T("Registrerad är inte verifierad", "Registered is not verified"),
        );

        // The action: inside the entrance, OUTSIDE the example, above it,
        // carrying the Passport destination through registration.
        const cta = panel.locator('a[href^="/signup"]');
        await expect(cta).toHaveCount(1);
        await expect(cta).toHaveAttribute("href", "/signup?redirect=%2Fpassport");
        await expect(example.locator("a, button")).toHaveCount(0);
        const [c, e] = [await cta.boundingBox(), await example.boundingBox()];
        expect(c!.y + c!.height).toBeLessThanOrEqual(e!.y);
        expect(c!.height).toBeGreaterThanOrEqual(44);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      }
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
        // The DEFINITION's scope, as sp_credential_payload_v2 emits it since
        // 20261125090000. SIA is left WITHOUT the key: an older payload.
        scope_code: GLOBAL_CODES.includes(c.credentialCode ?? "")
          ? "global_professional"
          : c === SIA
            ? undefined
            : "national_regulated",
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

      // Same flags, same written scope, as the holder's own card — and the
      // definition's scope from the payload: the globe for an international
      // certification, the flag for a national one, nothing for a payload
      // that carries no scope (SIA here), never a guess.
      await expect(region.locator('[data-shield-scope="SE"] [data-flag="SE"]')).toHaveCount(1);
      // Every DRAWN shield carries the mark its definition scope earns.
      const marks = await region.locator("[data-credential-shield]").evaluateAll((els) =>
        els.map((el) => ({
          scope: el.getAttribute("data-shield-scope"),
          globe: el.querySelectorAll('[data-scope-mark="globe"]').length,
          flag: el.querySelector("[data-flag]")?.getAttribute("data-flag") ?? null,
          text: (el as HTMLElement).innerText,
        })),
      );
      expect(marks.length).toBe(3);
      expect(marks.some((m) => m.scope === "global")).toBe(true);
      for (const m of marks) {
        if (m.scope === "global") {
          expect(m.globe, m.text).toBe(1);
          expect(m.flag).toBeNull();
          expect(m.text).toContain("Global");
        } else if (m.scope === "not_stated") {
          expect(m.globe).toBe(0);
          expect(m.flag).toBeNull();
        } else {
          expect(m.globe).toBe(0);
          expect(m.flag).toBe(m.scope!.slice(0, 2));
        }
      }

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

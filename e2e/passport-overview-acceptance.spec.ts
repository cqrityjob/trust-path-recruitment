/** Work order 2026-09-17, Part 1 — `/passport` renders correctly.
 *
 * Routed browser acceptance with stubbed server responses, on the same harness
 * as passport-product-visual: nothing reaches a real backend, and the session
 * is planted rather than obtained.
 *
 * What only a browser can prove, and source guards cannot:
 *   * the holder's name never breaks inside a word, at three widths;
 *   * the identity surface holds no interactive control once rendered;
 *   * the primary title line is the engine's, never the Profile title;
 *   * exactly one tab is current, including on the two absorbed routes.
 *
 * Screenshots are a by-product of the assertions. They go to
 * PASSPORT_SHOTS when set, otherwise to the run's own output directory —
 * never over tracked files.
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
const TODAY = "2026-09-17";
const source = personaById("overlapping-employers");

const baseClaim = {
  ...source.claims[0],
  claimType: "certification",
  assertionLevel: "self_declared",
  lifecycleState: "active",
  issuedOn: "2025-01-01",
  validUntil: "2030-01-01",
  versionNo: 1,
} as unknown as Claim;

const CPP = {
  ...baseClaim,
  id: "f1900000-0000-4000-8000-000000000010",
  credentialCode: "INTL_ASIS_CPP",
  titleSv: "Certified Protection Professional (CPP)",
  titleEn: "Certified Protection Professional (CPP)",
  issuerName: "ASIS International",
} as Claim;

const OV = {
  ...baseClaim,
  id: "f1900000-0000-4000-8000-000000000013",
  credentialCode: "OV",
  claimType: "licence",
  titleSv: "Ordningsvaktsförordnande",
  titleEn: "Public Order Guard Appointment",
  issuerName: "Polismyndigheten",
  jurisdictionCode: "SE",
  // Lapses inside the 30-day window, so the side column lists it.
  validUntil: "2026-10-05",
} as Claim;

const metadata = {
  definitions: [
    {
      code: "INTL_ASIS_CPP",
      name_sv: "Certified Protection Professional (CPP)",
      name_en: "Certified Protection Professional (CPP)",
      credential_class: "certification",
      scope_code: "global_professional",
      country: null,
      region: null,
      issuer_id: "existing-asis",
      issuer_name: "ASIS International",
      official_url: null,
      verification_url: null,
      requires_valid_until: false,
      allows_no_expiry: false,
    },
  ],
  details: [],
  verificationEvents: [],
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

function snapshotFor(displayName: string, claims: readonly Claim[]) {
  return {
    profileIdentity: { displayName, titleSv: "Säkerhetschef", titleEn: "Head of Security" },
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

for (const lang of ["sv", "en"] as const) {
  test(`part 1 acceptance · ${lang}`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const shots = process.env.PASSPORT_SHOTS ?? info.outputPath("shots");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shots, { recursive: true });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });

      // ── With no qualifying credential: the neutral fallback ──────────
      await mount(page, "/passport", lang, snapshotFor("Mostafa Alshawi", [CPP]));
      const surface = page.locator("[data-passport-identity-surface]");
      await expect(surface).toBeVisible({ timeout: 30_000 });

      // Exactly one Passport surface, and no second card anywhere.
      await expect(surface).toHaveCount(1);
      await expect(page.locator("[data-security-passport-preview]")).toHaveCount(0);
      await expect(page.locator("h1")).toHaveCount(1);

      // No control of any kind renders inside it.
      await expect(
        surface.locator(
          "a, button, input, select, textarea, [role=button], [role=tab], [role=menu], [tabindex]",
        ),
      ).toHaveCount(0);
      // …and the actions are directly beneath it.
      const actions = page.locator("[data-passport-actions]");
      await expect(actions.locator("a")).toHaveCount(3);
      for (const a of await actions.locator("a").all()) {
        expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }

      // The title line is the engine's; the Profile title is not the fallback.
      const derived = page.locator("[data-passport-derived-title]");
      await expect(derived).toHaveText(
        lang === "sv" ? "Ingen aktiv yrkestitel" : "No active professional title",
      );
      await expect(derived).not.toContainText(/Head of Security|Säkerhetschef/);
      const profileTitle = page.locator("[data-passport-profile-title]");
      await expect(profileTitle).toContainText(
        lang === "sv" ? "Säkerhetschef" : "Head of Security",
      );
      await expect(profileTitle).toContainText(lang === "sv" ? "egen uppgift" : "self-described");
      const [dBox, pBox] = [await derived.boundingBox(), await profileTitle.boundingBox()];
      expect(pBox!.y).toBeGreaterThan(dBox!.y);
      const sizes = await page.evaluate(() => {
        const px = (s: string) => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize);
        return {
          derived: px("[data-passport-derived-title]"),
          profile: px("[data-passport-profile-title]"),
        };
      });
      expect(sizes.profile).toBeLessThan(sizes.derived);
      await expect(page.getByText("OLD TITLE MUST NOT APPEAR")).toHaveCount(0);

      // Four tabs, one current.
      const tabs = page.locator("nav").filter({ has: page.locator('a[href$="#attention"]') });
      await expect(tabs.locator("a")).toHaveText(
        lang === "sv"
          ? ["Översikt", "Meriter", "Granskning", "Dela"]
          : ["Overview", "Credentials", "Verification", "Share"],
      );
      await expect(tabs.locator('a[aria-current="page"]')).toHaveCount(1);

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      // ── Names ────────────────────────────────────────────────────────
      for (const name of NAMES) {
        await mount(page, "/passport", lang, snapshotFor(name, [CPP]));
        await expect(page.locator("[data-passport-holder-name]")).toHaveText(name, {
          timeout: 30_000,
        });
        const layout = await nameLayout(page);
        expect(layout.brokenWords, `${name} @${width}`).toEqual([]);
        expect(layout.lines, `${name} @${width}`).toBeLessThanOrEqual(2);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        if (width !== 768) {
          await surface.screenshot({
            path: `${shots}/name-${name.split(" ")[0].toLowerCase()}-${width}-${lang}.png`,
          });
        }
      }

      // ── With a qualifying credential: the engine's title ─────────────
      await mount(page, "/passport", lang, snapshotFor("Mostafa Alshawi", [OV, CPP]));
      await expect(derived).toContainText(
        lang === "sv" ? "Ordningsvakt" : "Public Order Guard (Ordningsvakt)",
        { timeout: 30_000 },
      );
      // Everything in this phase is holder-reported, and the card says so.
      await expect(surface.getByTestId("sp-self-declared-marker")).toBeVisible();
      // No country twice, anywhere on the page.
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/(Sweden|Sverige)\s*·\s*(Sweden|Sverige)/);
      // The side column names what is expiring; the header only counts it.
      await expect(page.locator("[data-passport-expiring] li")).toHaveCount(1);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      if (width !== 768) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${shots}/passport-${width}-${lang}.png`, fullPage: true });
      }
    }

    // ── The absorbed routes keep exactly one current tab ───────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/passport/privacy", "/passport/share"]) {
      await mount(page, path, lang, snapshotFor("Mostafa Alshawi", [OV, CPP]));
      const sections = page.locator("[data-passport-share-sections]");
      await expect(sections).toBeVisible({ timeout: 30_000 });
      const tabs = page.locator("nav").filter({ has: page.locator('a[href$="#attention"]') });
      await expect(tabs.locator('a[aria-current="page"]')).toHaveText([
        lang === "sv" ? "Dela" : "Share",
      ]);
      await expect(sections.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(sections.locator("a")).toHaveCount(2);
    }
  });
}

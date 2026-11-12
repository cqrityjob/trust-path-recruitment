// Voluntary self-declarations on the Security Passport, in the browser.
//
// The server functions are stubbed, so this proves the SCREENS' contract; the
// database's is proved by supabase/tests/vsd_passport_disclosure_test.sql, and
// the two were walked together against a real local stack (synthetic
// authorizations) before this shipped.
//
//   HOLDER'S PASSPORT
//   * closed processing: one neutral line and a link, and NO shield
//   * a current statement: a self-declared shield -- subject, "Självdeklarerat"
//     -- that opens by keyboard to the exact statement, its date, jurisdiction,
//     scope and "not verified by CQrityjob"
//   * a reviewed document does not change the shield; it is described, to the
//     holder only, in the existing provenance words
//   * the credential wallet is the same with and without statements
//
//   SHARING
//   * closed disclosure: the share step shows nothing and attaches nothing
//   * enabled: every box unticked; creating a link without ticking attaches
//     nothing; ticking shows the server's preview through the recipient's own
//     component, and exactly that choice is attached to the new link
//   * a failed preview or a failed attach never claims the link carries it
//   * the holder can stop sharing one statement
//
//   RECIPIENT
//   * signed in: the shield, its subject, "Self-declared", the date and the
//     exact statement -- and nothing in the page's title or link preview
//   * not signed in: no call is made and nothing is shown, not even a hint
//
// Swedish and English; desktop and 375 px without horizontal overflow.
//
// Run: bunx playwright test e2e/self-declarations-passport.spec.ts --project=chromium --project=mobile-375
// Set VSD_SHOTS=<dir> to also write the review screenshots.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";
import { fromJSON } from "seroval";
import {
  BASE,
  USER_ID,
  exportOf,
  mount,
  ok,
  passportSnapshot,
  takeMountBookkeeping,
} from "./support/career-home-harness";
import { fixtureById } from "../src/lib/professional-identity/fixtures/career-home-fixtures";

const SHOT_DIR = process.env.VSD_SHOTS ?? "";

// ── Synthetic fixtures ────────────────────────────────────────────────────

const ENFORCEMENT = {
  kind: "enforcement_debt_none",
  jurisdiction: "SE",
  statementVersion: "se-enforcement-v1",
  asOfDate: "2026-11-11",
  declaredOn: "2026-11-11",
  statementPeriod: null,
};
const REMARKS = {
  ...ENFORCEMENT,
  kind: "payment_remarks_none",
  statementVersion: "se-remarks-v1",
  asOfDate: "2026-11-09",
};
const ID_ENFORCEMENT = "0d000000-0000-4000-8000-0000000000e1";
const ID_REMARKS = "0d000000-0000-4000-8000-0000000000e2";

const CLOSED = { state: "not_activated", declarations: [] };
/** Two current statements. The first has a REVIEWED supporting document. */
const declared = (shareable: boolean) => ({
  state: "declared",
  declarations: [
    {
      id: ID_ENFORCEMENT,
      revision: 2,
      statement: ENFORCEMENT,
      provenance: "document_reviewed",
      shareable,
    },
    { id: ID_REMARKS, revision: 1, statement: REMARKS, provenance: "self_declared", shareable },
  ],
});

const CREDENTIAL = {
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

function snapshot() {
  const snap = passportSnapshot(fixtureById("hub_active")!) as unknown as {
    profile: Record<string, unknown>;
    holder: { claims: unknown[]; id: string };
  };
  snap.profile.privacyMode = "full_name";
  snap.holder.id = USER_ID;
  snap.holder.claims = [CREDENTIAL];
  return snap;
}

function recipientPayload(locale: "sv" | "en") {
  return {
    status: "active",
    package: "selected_merits",
    focus: "passport",
    purpose: null,
    locale,
    expires_at: "2026-12-11T09:00:00Z",
    authorised_at: "2026-11-11T09:00:00Z",
    last_updated: "2026-11-11T09:00:00Z",
    holder: "Selma Delare (fiktiv)",
    privacy_mode: "full_name",
    profession_slug: null,
    jurisdiction: "SE",
    sub_jurisdiction: null,
    checked_at: "2026-11-11T10:00:00Z",
    schema_version: 2,
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
        scope_code: "national_regulated",
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
        scope_code: "national_regulated",
      },
    ],
    verified_experience: [],
    verified_experience_days: 0,
  };
}

type Overrides = NonNullable<NonNullable<Parameters<typeof mount>[2]>["overrides"]>;

const reply = (body: unknown) => (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });
const boom = (message: string) => (route: Route) =>
  route.fulfill({ status: 500, contentType: "text/plain", body: message });

function argsOf(route: Route): Record<string, unknown> {
  try {
    const revived = fromJSON(JSON.parse(route.request().postData() ?? "null") as never) as {
      data?: Record<string, unknown>;
    };
    return revived?.data ?? {};
  } catch {
    return {};
  }
}

const passportBase = (): Overrides => ({
  getMyPassport: ok(snapshot()),
  listMyVerificationRequests: ok({ requests: [], decisions: [] }),
  listMyEvidence: ok([]),
  listMyNotices: ok({ installed: false }),
  getReviewThread: ok({ installed: false }),
});

const shareBase = (): Overrides => ({
  ...passportBase(),
  listMyShares: ok([]),
  getMyPassportNumber: ok({ number: null, designation: null }),
  listMySocialShares: ok([]),
  previewCredentialShare: ok({
    ...recipientPayload("sv"),
    holder: null,
    privacy_mode: "anonymous",
  }),
});

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function shoot(page: Page, name: string, target?: string) {
  if (!SHOT_DIR) return;
  const dir = path.resolve(SHOT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const mobile = (page.viewportSize()?.width ?? 1280) < 600;
  const file = path.join(dir, `${name}-${mobile ? "375" : "desktop"}.png`);
  if (target) await page.locator(target).first().screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: true });
}

const SECTION = "[data-passport-self-declarations]";
const T = {
  sv: {
    enforcement: "Kronofogden · Självdeklarerat",
    remarks: "Betalningsanmärkningar · Självdeklarerat",
    statement:
      "Jag uppger att jag den 2026-11-11 inte har några skulder registrerade hos Kronofogden.",
    notVerified: "Uppgiften är lämnad av personen själv och har inte verifierats av CQrityjob.",
    notActivated: "Funktionen är inte aktiverad",
    jurisdiction: "Sverige",
    scope: "Vanliga lån, bolån och krediter",
    reviewed: "Dokument granskat",
    reviewedHint: "Det är inte en bedömning av dig",
    attached: "Självdeklarationen följer med den här länken",
    addressLost: "innehåller självdeklarationen, men svaret med länkens adress kom aldrig fram",
    unconfirmed: "vet därför inte om länken skapades eller om självdeklarationen delas",
    refusedChanged: "Uppgiften har ändrats sedan du såg förhandsvisningen. Ingen länk skapades",
    listStale: "Det ändrar inte vad som delas",
    previewFailed: "Ingen självdeklaration bifogas förrän du har kunnat se den",
    recipientHeading: "Personens egna uppgifter",
    promo: "Skapa ditt Security Passport",
    ended: "Delas inte längre",
  },
  en: {
    enforcement: "Swedish Enforcement Authority · Self-declared",
    remarks: "Payment remarks · Self-declared",
    statement:
      "I state that on 2026-11-11 I have no debts registered with Kronofogden (the Swedish Enforcement Authority).",
    notVerified:
      "This statement was made by the person themself and has not been verified by CQrityjob.",
    notActivated: "This feature is not activated",
    jurisdiction: "Sweden",
    scope: "Ordinary loans, mortgages and credit",
    reviewed: "Document reviewed",
    reviewedHint: "It is not an assessment of you",
    attached: "The self-declaration accompanies this link",
    addressLost:
      "carries the self-declaration, but the answer with the link's address never arrived",
    unconfirmed:
      "do not know whether the link was created or whether the self-declaration is shared",
    refusedChanged: "The statement has changed since you saw the preview. No link was created",
    listStale: "That does not change what is shared",
    previewFailed: "No self-declaration is attached until you have been able to see it",
    recipientHeading: "The person's own statements",
    promo: "Create your Security Passport",
    ended: "No longer shared",
  },
} as const;

test.describe.configure({ timeout: 90_000 });

test.afterEach(() => {
  const c = takeMountBookkeeping();
  if (!c) return;
  expect(c.unmatched, "every server function the page calls is stubbed").toEqual([]);
  expect(c.errors, "no console errors").toEqual([]);
});

// ══ The holder's Passport ═════════════════════════════════════════════════

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: Passport — closed processing shows no shield, only a neutral line and a link`, async ({
    page,
  }) => {
    await mount(page, "hub_active", {
      lang,
      path: "/passport",
      ready: SECTION,
      overrides: { ...passportBase(), getMyPassportSelfDeclarations: ok(CLOSED) },
    });
    const section = page.locator(SECTION);
    await expect(section).toHaveAttribute("data-passport-self-declarations", "not_activated");
    await expect(section).toContainText(T[lang].notActivated);
    await expect(section.locator("[data-vsd-shield]")).toHaveCount(0);
    await expect(section.locator("[data-shield-mark]")).toHaveCount(0);
    await expect(section.locator("button, input")).toHaveCount(0);
    await expect(section.getByRole("link")).toHaveAttribute(
      "href",
      "/my-career/profile#profile-self-declarations",
    );
    // Nothing adverse, and nothing about the holder.
    await expect(section).not.toContainText(/saknas|missing|skuld|debt|anmärkning|remark/i);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `passport-closed-${lang}`, SECTION);
  });

  test(`${lang}: Passport — a failed read is the closed state, and the Passport around it is intact`, async ({
    page,
  }) => {
    await mount(page, "hub_active", {
      lang,
      path: "/passport",
      ready: SECTION,
      overrides: {
        ...passportBase(),
        // The server function itself answers a refusal with the closed view.
        getMyPassportSelfDeclarations: ok(CLOSED),
      },
    });
    await expect(page.locator("[data-credential-wallet]")).toBeVisible();
    await expect(page.locator(`${SECTION} [data-vsd-shield]`)).toHaveCount(0);
  });

  test(`${lang}: Passport — a current statement is a self-declared shield that opens by keyboard`, async ({
    page,
  }) => {
    await mount(page, "hub_active", {
      lang,
      path: "/passport",
      ready: `${SECTION} [data-vsd-shield="enforcement_debt_none"]`,
      overrides: { ...passportBase(), getMyPassportSelfDeclarations: ok(declared(false)) },
    });
    const section = page.locator(SECTION);
    await expect(section.locator("[data-vsd-shield]")).toHaveCount(2);
    const shield = section.locator('[data-vsd-shield="enforcement_debt_none"]');
    await expect(shield.locator("[data-vsd-shield-label]")).toHaveText(T[lang].enforcement);
    await expect(
      section.locator('[data-vsd-shield="payment_remarks_none"] [data-vsd-shield-label]'),
    ).toHaveText(T[lang].remarks);

    // The outline treatment only -- even though this statement has a REVIEWED
    // document. No tick, no verified rim, anywhere in the section.
    await expect(section.locator('[data-shield-mark="self_declared"]')).toHaveCount(2);
    await expect(
      section.locator('[data-shield-mark]:not([data-shield-mark="self_declared"])'),
    ).toHaveCount(0);
    await expect(section).not.toContainText(
      /verifierad|verified ✓|godkänd|approved|skuldfri|debt-free/i,
    );

    // Keyboard and screen reader: a real button that says it is collapsed.
    const toggle = shield.getByRole("button");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAccessibleName(new RegExp(T[lang].enforcement.replace(/[·]/g, ".")));
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = page.getByRole("region", { name: T[lang].enforcement });
    await expect(detail).toBeVisible();
    expect(await toggle.getAttribute("aria-controls")).toBe(await detail.getAttribute("id"));
    await expect(detail.locator("[data-vsd-statement]")).toHaveText(T[lang].statement);
    await expect(detail.locator("[data-vsd-shield-date]")).toHaveText("2026-11-11");
    await expect(detail).toContainText(T[lang].jurisdiction);
    await expect(detail).toContainText(T[lang].scope);
    await expect(detail.locator("[data-vsd-shield-unverified]")).toHaveText(T[lang].notVerified);
    // The document is described precisely, to the holder, and upgrades nothing.
    await expect(detail.locator("[data-vsd-shield-support]")).toContainText(T[lang].reviewed);
    await expect(detail.locator("[data-vsd-shield-support]")).toContainText(T[lang].reviewedHint);
    await expect(shield.locator("[data-vsd-shield-label]")).toHaveText(T[lang].enforcement);

    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");

    // No raw document, path, hash or identifier anywhere in the section.
    const html = await section.innerHTML();
    expect(html).not.toMatch(/\.pdf|sha256|storage|[0-9a-f]{64}/i);
    expect(html).not.toContain(ID_ENFORCEMENT);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `passport-declared-${lang}`, SECTION);
  });
}

test("Passport — the wallet, its counts and the next step are the same with and without statements", async ({
  page,
}) => {
  const read = async (view: unknown) => {
    await mount(page, "hub_active", {
      lang: "sv",
      path: "/passport",
      ready: SECTION,
      overrides: { ...passportBase(), getMyPassportSelfDeclarations: ok(view) },
    });
    await expect(page.locator("[data-credential-wallet]")).toBeVisible();
    const text = await page.locator("[data-credential-wallet]").innerText();
    takeMountBookkeeping();
    return text;
  };
  const without = await read(CLOSED);
  const withStatements = await read(declared(true));
  expect(withStatements).toBe(without);
  expect(withStatements).not.toMatch(/Kronofogden|Självdeklarerat|Betalningsanmärkningar/);
});

// ══ Sharing ═══════════════════════════════════════════════════════════════

async function openShare(page: Page, lang: "sv" | "en", overrides: Overrides) {
  await mount(page, "hub_active", {
    lang,
    path: "/passport/share",
    ready: "[data-share-screen]",
    overrides: { ...shareBase(), ...overrides },
  });
  await page.locator('[data-share-choice="link"]').click();
  // One credential, so there is something to send.
  await page.locator("#sel-choose").scrollIntoViewIfNeeded();
  await page
    .locator('section[aria-labelledby="sel-choose"] input[type="checkbox"]')
    .first()
    .check();
}

/** Nothing on the screen may claim that a statement was NOT shared. */
const CLAIMS_NOT_SHARED =
  /ingen självdeklaration delades|länken innehåller den inte|ingen länk skapades|no self-declaration was shared|the link does not carry it|no link was created/i;
const LINK_ID = "5d000000-0000-4000-8000-000000000011";
const created = (declarations: number) => ({
  status: "created",
  token: "a".repeat(64),
  disclosureId: LINK_ID,
  expiresAt: "2026-12-11T09:00:00Z",
  declarations,
});
const alreadyCreated = (declarations: number) => ({
  status: "already_created",
  token: null,
  disclosureId: LINK_ID,
  expiresAt: "2026-12-11T09:00:00Z",
  declarations,
});
const lost = (route: Route) => route.abort("failed");
const refuse = (code: string) => (route: Route) =>
  route.fulfill({ status: 500, contentType: "text/plain", body: code });
/** A creation that must never be reached in a scenario. */
const never = (what: string, calls: string[]) => async (route: Route) => {
  calls.push(what);
  await refuse("UNCONFIRMED")(route);
};

async function tickAndPreview(page: Page, kind: string) {
  const step = page.locator("[data-share-self-declarations]");
  await step.locator(`[data-share-vsd-choice="${kind}"]`).check();
  await expect(step.locator('[data-share-vsd-preview="ready"]')).toBeVisible();
}

test("sharing — while disclosure is closed the step offers nothing and a new link is the Passport's own", async ({
  page,
}) => {
  const calls: string[] = [];
  await openShare(page, "sv", {
    // Statements exist, but none is shareable: no disclosure authorization.
    getMyPassportSelfDeclarations: ok(declared(false)),
    createCredentialShare: async (route) => {
      calls.push("create");
      await reply({
        status: "created",
        token: "a".repeat(64),
        disclosureId: ID_REMARKS,
        expiresAt: null,
      })(route);
    },
    previewSelfDeclarationDisclosure: never("preview", calls),
    createShareWithSelfDeclarations: never("bridge", calls),
    getShareOperation: never("committed", calls),
  });
  await expect(page.locator("[data-share-self-declarations]")).toHaveCount(0);
  await expect(page.locator("[data-share-vsd-choice]")).toHaveCount(0);
  await expect(page.locator("[data-share-screen]")).not.toContainText(/Självdeklaration/i);
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible();
  expect(calls).toEqual(["create"]);
  await expect(page.locator("[data-share-vsd-result]")).toHaveCount(0);
});

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: sharing — nothing is pre-selected, and an unticked choice is sealed as empty with the link`, async ({
    page,
  }) => {
    const calls: string[] = [];
    const sent: Record<string, unknown>[] = [];
    await openShare(page, lang, {
      getMyPassportSelfDeclarations: ok(declared(true)),
      createCredentialShare: never("plain", calls),
      previewSelfDeclarationDisclosure: never("preview", calls),
      createShareWithSelfDeclarations: async (route) => {
        calls.push("bridge");
        sent.push(argsOf(route));
        await reply(created(0))(route);
      },
    });
    const step = page.locator("[data-share-self-declarations]");
    await expect(step).toBeVisible();
    const boxes = step.locator("[data-share-vsd-choice]");
    await expect(boxes).toHaveCount(2);
    for (const box of await boxes.all()) await expect(box).not.toBeChecked();
    await expect(step.locator("[data-share-vsd-preview]")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    await page.locator("[data-share-cta]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible();
    // ONE call created the link and sealed the empty choice.
    expect(calls).toEqual(["bridge"]);
    expect(sent[0]!.choices).toEqual([]);
    await expect(page.locator("[data-share-vsd-result]")).toHaveCount(0);
  });

  test(`${lang}: sharing — the holder previews exactly what a recipient gets, and exactly that is created with the new link`, async ({
    page,
  }) => {
    const previewArgs: unknown[] = [];
    const sent: Record<string, unknown>[] = [];
    const calls: string[] = [];
    await openShare(page, lang, {
      getMyPassportSelfDeclarations: ok(declared(true)),
      previewSelfDeclarationDisclosure: async (route) => {
        previewArgs.push(argsOf(route).choices);
        await reply([ENFORCEMENT])(route);
      },
      // The link and the choice are ONE call; the Passport's own create and
      // the social share are told nothing.
      createCredentialShare: never("plain", calls),
      createSocialShare: never("social", calls),
      createShareWithSelfDeclarations: async (route) => {
        sent.push(argsOf(route));
        await reply(created(1))(route);
      },
      listMySharedSelfDeclarations: ok([]),
    });
    const step = page.locator("[data-share-self-declarations]");
    const box = step.locator('[data-share-vsd-choice="enforcement_debt_none"]');
    // Keyboard: the box is reachable and Space ticks it.
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();
    await expect(step.locator('[data-share-vsd-choice="payment_remarks_none"]')).not.toBeChecked();

    const preview = step.locator('[data-share-vsd-preview="ready"]');
    await expect(preview).toBeVisible();
    // The recipient's own component, open, with the exact statement.
    const shown = preview.locator("[data-recipient-self-declarations]");
    await expect(shown.locator("[data-vsd-shield]")).toHaveCount(1);
    await expect(shown.locator("[data-vsd-statement]")).toBeVisible();
    await expect(shown.locator("[data-vsd-shield-unverified]")).toBeVisible();
    await expect(shown.locator("[data-vsd-shield-support]")).toHaveCount(0);
    expect(previewArgs.at(-1)).toEqual([{ declarationId: ID_ENFORCEMENT, revision: 2 }]);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `share-choose-preview-${lang}`, "[data-share-self-declarations]");

    await page.locator("[data-share-cta]").click();
    const result = page.locator('[data-share-vsd-result="created"]');
    await expect(result).toContainText(T[lang].attached);
    await expect(result).toHaveAttribute("data-share-vsd-address", "shown");
    await expect(page.locator("[data-share-created]")).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.choices).toEqual([{ declarationId: ID_ENFORCEMENT, revision: 2 }]);
    expect(String(sent[0]!.requestKey)).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls).toEqual([]);
    await shoot(page, `share-created-${lang}`);
  });
}

test("sharing — a preview that fails creates no link with the statement: the holder must untick it", async ({
  page,
}) => {
  const sent: Record<string, unknown>[] = [];
  await openShare(page, "en", {
    getMyPassportSelfDeclarations: ok(declared(true)),
    previewSelfDeclarationDisclosure: refuse("VSD_DISCLOSURE_NOT_AUTHORIZED"),
    createShareWithSelfDeclarations: async (route) => {
      sent.push(argsOf(route));
      await reply(created(0))(route);
    },
  });
  const step = page.locator("[data-share-self-declarations]");
  const box = step.locator('[data-share-vsd-choice="enforcement_debt_none"]');
  await box.check();
  await expect(step.locator('[data-share-vsd-preview="failed"]').getByRole("alert")).toContainText(
    T.en.previewFailed,
  );
  // Ticked but never seen: the link cannot be created in this state.
  await expect(page.locator("[data-share-cta]")).toBeDisabled();
  expect(sent).toEqual([]);
  await box.uncheck();
  await expect(page.locator("[data-share-cta]")).toBeEnabled();
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.choices).toEqual([]);
  await expect(page.locator("[data-share-vsd-result]")).toHaveCount(0);
  // The stubbed 500 is this scenario's subject, not a console defect.
  takeMountBookkeeping();
});

// ── What is known after the call: created, refused, or unconfirmed ─────────

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: sharing — the database committed but the answer was lost: confirmed from the committed state, never "not shared"`, async ({
    page,
  }) => {
    const asked: unknown[] = [];
    let creates = 0;
    await openShare(page, lang, {
      getMyPassportSelfDeclarations: ok(declared(true)),
      previewSelfDeclarationDisclosure: ok([ENFORCEMENT]),
      // The commit happened; the response never arrived.
      createShareWithSelfDeclarations: async (route) => {
        creates += 1;
        await lost(route);
      },
      getShareOperation: async (route) => {
        asked.push(argsOf(route));
        await reply({ status: "sealed", disclosureId: LINK_ID, declarations: 1 })(route);
      },
      listMySharedSelfDeclarations: ok([]),
    });
    await tickAndPreview(page, "enforcement_debt_none");
    await page.locator("[data-share-cta]").click();
    const result = page.locator('[data-share-vsd-result="created"]');
    await expect(result).toHaveAttribute("data-share-vsd-address", "lost");
    await expect(result).toContainText(T[lang].addressLost);
    // The link exists; its address is not invented.
    await expect(page.locator("[data-share-already]")).toBeVisible();
    await expect(page.locator("[data-share-link]")).toHaveCount(0);
    await expect(page.locator("[data-share-screen]")).not.toContainText(CLAIMS_NOT_SHARED);
    expect(creates).toBe(1);
    expect(asked).toHaveLength(1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `share-address-lost-${lang}`, "[data-share-vsd-result]");
    takeMountBookkeeping();
  });

  test(`${lang}: sharing — nothing is known: unconfirmed, with a retry of the SAME operation, repeated until the database answers`, async ({
    page,
  }) => {
    const sent: Record<string, unknown>[] = [];
    let mode: "lost" | "answer" = "lost";
    const plain: string[] = [];
    await openShare(page, lang, {
      getMyPassportSelfDeclarations: ok(declared(true)),
      previewSelfDeclarationDisclosure: ok([ENFORCEMENT]),
      createCredentialShare: never("plain", plain),
      createShareWithSelfDeclarations: async (route) => {
        sent.push(argsOf(route));
        if (mode === "lost") return lost(route);
        // The first attempt DID commit: the repeat is answered from the seal.
        await reply(alreadyCreated(1))(route);
      },
      // The committed state cannot be read either.
      getShareOperation: lost,
      listMySharedSelfDeclarations: ok([]),
    });
    await tickAndPreview(page, "enforcement_debt_none");
    await page.locator("[data-share-cta]").click();

    const doubt = page.locator('[data-share-vsd-result="unconfirmed"]');
    await expect(doubt).toHaveAttribute("role", "alert");
    await expect(doubt).toContainText(T[lang].unconfirmed);
    await expect(page.locator("[data-share-screen]")).not.toContainText(CLAIMS_NOT_SHARED);
    // The steps are closed: nothing can be changed into a different operation.
    await expect(page.locator("[data-share-cta]")).toHaveCount(0);
    await expect(page.locator("[data-share-self-declarations]")).toHaveCount(0);
    await expect(page.locator("[data-share-created]")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `share-unconfirmed-${lang}`, "[data-share-vsd-result]");

    // Keyboard: the retry is a button; two more attempts are lost too.
    const retry = doubt.locator("[data-share-vsd-retry]");
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => sent.length).toBe(2);
    await expect(doubt).toBeVisible();
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect.poll(() => sent.length).toBe(3);
    await expect(retry).toBeEnabled();
    await expect(page.locator("[data-share-screen]")).not.toContainText(CLAIMS_NOT_SHARED);

    mode = "answer";
    await retry.click();
    const result = page.locator('[data-share-vsd-result="created"]');
    await expect(result).toHaveAttribute("data-share-vsd-address", "lost");
    await expect(page.locator("[data-share-already]")).toBeVisible();
    await expect(page.locator('[data-share-vsd-result="unconfirmed"]')).toHaveCount(0);

    // Four requests, ONE operation: the same key, link and choices each time.
    expect(sent).toHaveLength(4);
    for (const request of sent) expect(request).toEqual(sent[0]);
    expect(sent[0]!.choices).toEqual([{ declarationId: ID_ENFORCEMENT, revision: 2 }]);
    expect(plain).toEqual([]);
    takeMountBookkeeping();
  });
}

test("sharing — the request never arrived: the retry of the same operation creates the link, once, with its address", async ({
  page,
}) => {
  const sent: Record<string, unknown>[] = [];
  let mode: "lost" | "answer" = "lost";
  await openShare(page, "sv", {
    getMyPassportSelfDeclarations: ok(declared(true)),
    previewSelfDeclarationDisclosure: ok([REMARKS]),
    createShareWithSelfDeclarations: async (route) => {
      sent.push(argsOf(route));
      if (mode === "lost") return lost(route);
      await reply(created(1))(route);
    },
    // Nothing is committed -- which is not proof that nothing will be.
    getShareOperation: ok({ status: "none" }),
    listMySharedSelfDeclarations: ok([]),
  });
  await tickAndPreview(page, "payment_remarks_none");
  await page.locator("[data-share-cta]").click();
  const doubt = page.locator('[data-share-vsd-result="unconfirmed"]');
  await expect(doubt).toBeVisible();
  await expect(page.locator("[data-share-screen]")).not.toContainText(CLAIMS_NOT_SHARED);
  mode = "answer";
  await doubt.locator("[data-share-vsd-retry]").click();
  await expect(page.locator('[data-share-vsd-result="created"]')).toHaveAttribute(
    "data-share-vsd-address",
    "shown",
  );
  await expect(page.locator("[data-share-link]")).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  takeMountBookkeeping();
});

test("sharing — a genuine database refusal: no link, nothing shared, and no reconciliation or retry of it", async ({
  page,
}) => {
  const calls: string[] = [];
  await openShare(page, "sv", {
    getMyPassportSelfDeclarations: ok(declared(true)),
    previewSelfDeclarationDisclosure: ok([REMARKS]),
    createShareWithSelfDeclarations: async (route) => {
      calls.push("bridge");
      await refuse("VSD_STALE_REVISION")(route);
    },
    getShareOperation: never("committed", calls),
    createCredentialShare: never("plain", calls),
  });
  await tickAndPreview(page, "payment_remarks_none");
  await page.locator("[data-share-cta]").click();
  const result = page.locator('[data-share-vsd-result="refused"]');
  await expect(result).toHaveAttribute("role", "alert");
  await expect(result).toContainText(T.sv.refusedChanged);
  await expect(page.locator("[data-share-vsd-retry]")).toHaveCount(0);
  await expect(page.locator("[data-share-created]")).toHaveCount(0);
  await expect(page.locator("[data-share-already]")).toHaveCount(0);
  // The steps stay open: the holder can look at the preview again.
  await expect(page.locator("[data-share-cta]")).toBeVisible();
  expect(calls).toEqual(["bridge"]);
  await shoot(page, "share-refused-sv", "[data-share-vsd-result]");
  takeMountBookkeeping();
});

test("sharing — the statement IS shared but the list could not be re-read: said separately, and repaired without touching the link", async ({
  page,
}) => {
  const row = {
    id: "0e000000-0000-4000-8000-000000000001",
    disclosureId: LINK_ID,
    kind: "enforcement_debt_none",
    createdAt: "2026-11-11T09:00:00Z",
    disclosable: true,
    accessCount: 0,
  };
  let creates = 0;
  let listMode: "empty" | "lost" | "row" = "empty";
  await openShare(page, "sv", {
    getMyPassportSelfDeclarations: ok(declared(true)),
    previewSelfDeclarationDisclosure: ok([ENFORCEMENT]),
    createShareWithSelfDeclarations: async (route) => {
      creates += 1;
      listMode = "lost";
      await reply(created(1))(route);
    },
    listMySharedSelfDeclarations: async (route) => {
      if (listMode === "lost") return lost(route);
      await reply(listMode === "row" ? [row] : [])(route);
    },
  });
  await tickAndPreview(page, "enforcement_debt_none");
  await page.locator("[data-share-cta]").click();
  const result = page.locator('[data-share-vsd-result="created"]');
  // Persistence is confirmed; the refresh failing takes none of it back.
  await expect(result).toContainText(T.sv.attached);
  await expect(page.locator("[data-share-link]")).toBeVisible();
  const stale = result.locator("[data-share-vsd-list-stale]");
  await expect(stale).toContainText(T.sv.listStale);
  await expect(page.locator("[data-share-screen]")).not.toContainText(CLAIMS_NOT_SHARED);
  await expect(page.locator('[data-share-vsd-result="unconfirmed"]')).toHaveCount(0);
  await shoot(page, "share-list-stale-sv", "[data-share-vsd-result]");

  listMode = "row";
  await stale.locator("[data-share-vsd-refresh]").click();
  await expect(result.locator("[data-share-vsd-list-stale]")).toHaveCount(0);
  await expect(
    page.locator('[data-shared-self-declarations] [data-shared-vsd="active"]'),
  ).toContainText(T.sv.enforcement);
  // The refresh re-read the list. It did not create or repeat anything.
  expect(creates).toBe(1);
  takeMountBookkeeping();
});

test("sharing — the holder stops sharing one statement and the link itself is untouched", async ({
  page,
}) => {
  const row = {
    id: "0e000000-0000-4000-8000-000000000001",
    disclosureId: "5d000000-0000-4000-8000-000000000011",
    kind: "enforcement_debt_none",
    createdAt: "2026-11-11T09:00:00Z",
    disclosable: true,
    accessCount: 2,
  };
  const stopped: unknown[] = [];
  let revoked = 0;
  await mount(page, "hub_active", {
    lang: "sv",
    path: "/passport/share",
    ready: "[data-share-screen]",
    overrides: {
      ...shareBase(),
      listMySharedSelfDeclarations: ok([row]),
      stopSharingSelfDeclaration: async (route) => {
        stopped.push(argsOf(route));
        await reply([{ ...row, disclosable: false }])(route);
      },
      revokeShare: async (route) => {
        revoked += 1;
        await reply({ ok: true })(route);
      },
    },
  });
  await page.locator('[data-share-choice="link"]').click();
  const list = page.locator("[data-shared-self-declarations]");
  await expect(list.locator('[data-shared-vsd="active"]')).toContainText(T.sv.enforcement);
  await expect(list).toContainText("Öppnad 2 gånger");
  // How often, never by whom.
  await expect(list).not.toContainText(/@|example\.test/);
  await list.locator("[data-shared-vsd-stop]").click();
  await expect(list.locator('[data-shared-vsd="ended"]')).toContainText(T.sv.ended);
  await expect(list.locator("[data-shared-vsd-stop]")).toHaveCount(0);
  expect(stopped).toEqual([{ selectionId: row.id }]);
  expect(revoked).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await shoot(page, "share-list-stopped-sv", "[data-shared-self-declarations]");
});

// ══ The recipient ═════════════════════════════════════════════════════════

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: recipient — signed in, the shield shows the subject, "self-declared", the date and the exact statement`, async ({
    page,
  }) => {
    const asked: unknown[] = [];
    await mount(page, "hub_active", {
      // The READER's language is the other one: the share's own must win.
      lang: lang === "sv" ? "en" : "sv",
      path: "/p/abcdef0123456789",
      ready: "[data-recipient-view]",
      overrides: {
        getPublicDisclosureFromCookie: ok(recipientPayload(lang)),
        readSharedSelfDeclarations: async (route) => {
          asked.push(argsOf(route));
          // The request carries the navigation id and nothing secret.
          expect(route.request().postData() ?? "").not.toMatch(/[0-9a-f]{64}/);
          await reply([ENFORCEMENT])(route);
        },
      },
    });
    const section = page.locator("[data-recipient-self-declarations]");
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { level: 2 })).toHaveText(T[lang].recipientHeading);
    const shield = section.locator('[data-vsd-shield="enforcement_debt_none"]');
    await expect(shield.locator("[data-vsd-shield-label]")).toHaveText(T[lang].enforcement);
    await expect(shield.locator("[data-vsd-shield-date]")).toHaveText("2026-11-11");
    await expect(shield.locator("[data-vsd-statement]")).toHaveText(T[lang].statement);
    await expect(shield.locator("[data-vsd-shield-unverified]")).toHaveText(T[lang].notVerified);
    await expect(shield).toContainText(T[lang].scope);
    // Self-declared, in the outline treatment, with no provenance of any kind.
    await expect(section.locator('[data-shield-mark="self_declared"]')).toHaveCount(1);
    await expect(
      section.locator('[data-shield-mark]:not([data-shield-mark="self_declared"])'),
    ).toHaveCount(0);
    await expect(section.locator("[data-vsd-shield-support]")).toHaveCount(0);
    await expect(section).not.toContainText(/Dokument|Document|granskat|reviewed/i);
    expect(asked).toEqual([{ navigationId: "abcdef0123456789" }]);

    // Directly below the Passport card: before the details, and before the
    // block that invites a stranger to create a Passport of their own.
    const order = await page.evaluate(() => {
      const view = document.querySelector("[data-recipient-view]")!;
      const section = view.querySelector("[data-recipient-self-declarations]")!;
      const card = view.querySelector("[data-recipient-shields]")!.closest("section")!;
      const headings = [...view.querySelectorAll("h2")];
      const follows = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const after = headings.filter((h) => !section.contains(h) && follows(section, h));
      return {
        inside: view.contains(section),
        belowCard: follows(card, section),
        // The element right before the section's wrapper IS the card.
        directly: section.parentElement!.previousElementSibling === card,
        headingsAfter: after.length,
        top: section.getBoundingClientRect().top,
        cardBottom: card.getBoundingClientRect().bottom,
        nextTop: after[0]?.getBoundingClientRect().top ?? null,
      };
    });
    expect(order.inside).toBe(true);
    expect(order.belowCard).toBe(true);
    expect(order.directly).toBe(true);
    // The details heading and the promotional heading both come after it.
    expect(order.headingsAfter).toBeGreaterThanOrEqual(2);
    expect(order.top).toBeGreaterThanOrEqual(order.cardBottom);
    expect(order.nextTop).toBeGreaterThan(order.top);
    const promo = page.getByRole("heading", { name: T[lang].promo });
    await expect(promo).toBeVisible();
    expect(
      await promo.evaluate((h) =>
        Boolean(
          document.querySelector("[data-recipient-self-declarations]")!.compareDocumentPosition(h) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);

    // It is NOT among the credentials, and not in the page's title or preview.
    await expect(page.locator("[data-recipient-shields]")).not.toContainText(
      /Kronofogden|Enforcement Authority/,
    );
    expect(await page.title()).not.toMatch(/Kronofogden|Enforcement|deklar|declar/i);
    const meta = await page.evaluate(() =>
      [...document.head.querySelectorAll("meta")]
        .map((m) => m.getAttribute("content") ?? "")
        .join(" | "),
    );
    expect(meta).not.toMatch(/Kronofogden|Enforcement|deklar|declar|2026-11-11/i);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `recipient-signed-in-${lang}`);
  });

  test(`${lang}: recipient — a single-credential link shows the statement directly below the credential`, async ({
    page,
  }) => {
    const single = recipientPayload(lang);
    await mount(page, "hub_active", {
      lang,
      path: "/p/abcdef0123456789",
      ready: "[data-credential-share]",
      overrides: {
        getPublicDisclosureFromCookie: ok({
          ...single,
          focus: "credential",
          verified_claims: [single.verified_claims[0]],
        }),
        readSharedSelfDeclarations: ok([ENFORCEMENT]),
      },
    });
    const section = page.locator("[data-recipient-self-declarations]");
    await expect(section).toBeVisible();
    await expect(section.locator("[data-vsd-shield-label]")).toHaveText(T[lang].enforcement);
    await expect(section.locator("[data-vsd-shield-unverified]")).toHaveText(T[lang].notVerified);
    const order = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const section = main.querySelector("[data-recipient-self-declarations]")!;
      const credential = main.querySelector("[data-credential-share] article")!;
      return {
        inMain: main.contains(section),
        below: Boolean(
          credential.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        directly: section.parentElement!.previousElementSibling === credential,
        // Same column as the credential: no wider, no offset.
        left: Math.round(section.getBoundingClientRect().left),
        credentialLeft: Math.round(
          section.parentElement!.previousElementSibling!.getBoundingClientRect().left,
        ),
        last: section.parentElement!.nextElementSibling?.tagName ?? null,
      };
    });
    expect(order.inMain).toBe(true);
    expect(order.below).toBe(true);
    expect(order.directly).toBe(true);
    expect(order.left).toBe(order.credentialLeft);
    // The credential's own details follow it.
    expect(order.last).toBe("SECTION");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, `recipient-single-credential-${lang}`);
  });
}

test("recipient — signed in but given nothing: no section, no heading, no adverse wording", async ({
  page,
}) => {
  await mount(page, "hub_active", {
    lang: "sv",
    path: "/p/abcdef0123456789",
    ready: "[data-recipient-view]",
    overrides: {
      getPublicDisclosureFromCookie: ok(recipientPayload("sv")),
      readSharedSelfDeclarations: ok([]),
    },
  });
  await expect(page.locator("[data-recipient-view]")).toBeVisible();
  await expect(page.locator("[data-recipient-self-declarations]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(
    /självdeklaration|self-declaration|Kronofogden|Betalningsanmärkning/i,
  );
});

test("recipient — not signed in: no call is made and nothing is shown, not even a hint", async ({
  page,
}) => {
  const called: string[] = [];
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cqrityjob.lang", "sv");
    } catch {
      /* ignore */
    }
  });
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    called.push(name);
    if (name === "getPublicDisclosureFromCookie") return reply(recipientPayload("sv"))(route);
    // Anything else an anonymous page asks is answered empty; what matters is
    // that the statements were never asked for.
    return reply(null)(route);
  });
  await page.goto(`${BASE}/p/abcdef0123456789`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-recipient-view]")).toBeVisible({ timeout: 30_000 });
  // Long enough for the auth state to settle and any call to have been made.
  await page.waitForTimeout(1500);
  expect(called).toContain("getPublicDisclosureFromCookie");
  expect(called).not.toContain("readSharedSelfDeclarations");
  await expect(page.locator("[data-recipient-self-declarations]")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(
    /självdeklaration|self-declaration|Kronofogden|logga in för att se|sign in to see/i,
  );
  await shoot(page, "recipient-anonymous-sv");
});

/** HAYAT — the upload-to-form journey, in a real browser, with the REAL reader.
 *
 * pdf.js and Tesseract.js run for real here, served from this origin under
 * /hayat-ocr/. Server functions are stubbed (the harness refuses anything that
 * is not), so nothing reaches a database; the verification rule itself is
 * exercised with real signatures in `bun run passport-hayat:check`.
 *
 * Every document is synthetic and generated at run time (support/hayat-fixtures).
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { personaById } from "../src/lib/security-passport/fixtures/personas";
import {
  installBoundary,
  assertNoRefusals,
  observeSupabaseStorageKey,
  plantSession,
  horizontalOverflow,
  exportOf,
} from "./support/public-entry-harness";
import {
  AMBIGUOUS,
  ENGLISH_CPP,
  ENGLISH_PSP,
  SWEDISH_CPP,
  bakeCredential,
  createFixtures,
  passwordProtectedPdf,
  type Fixtures,
} from "./support/hayat-fixtures";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3119";
const CLAIM_ID = "f1900000-0000-4000-8000-0000000000aa";
const source = personaById("overlapping-employers");

const definition = (code: string, name: string) => ({
  code,
  name_sv: name,
  name_en: name,
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
});
const metadata = {
  definitions: [
    definition("INTL_ASIS_CPP", "Certified Protection Professional (CPP)"),
    definition("INTL_ASIS_PSP", "Physical Security Professional (PSP)"),
  ],
  details: [],
  verificationEvents: [],
  issuers: [],
  jurisdictions: [],
};
const unverifiable = {
  status: "cannot_verify_automatically",
  reasons: ["issuer_not_trusted"],
  bindingLevel: "none",
  scopeLimits: [],
  ruleVersion: "hayat-rules/1",
  adapter: "ob3-vc-jwt/1",
  checkedAt: "2026-09-18T10:00:00.000Z",
  checks: {},
};

let fixtures: Fixtures;
test.beforeAll(async ({ browser }) => {
  fixtures = await createFixtures(browser);
});
test.afterAll(async () => fixtures.close());
test.setTimeout(150_000);

async function mount(
  page: Page,
  lang: "sv" | "en",
  over: Record<string, unknown> = {},
  path = "/passport/credentials/new?code=INTL_ASIS_CPP",
) {
  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));
  const refusals = await installBoundary(page, {
    getMyPassport: {
      profileIdentity: { displayName: "Test Holder Synthetic", titleSv: "x", titleEn: "x" },
      profile: {
        displayName: "Test Holder Synthetic",
        headline: "x",
        privacyMode: "full_name",
        onboardingState: "completed",
        onboardingAnswers: {},
      },
      holder: { ...source, claims: [], periods: [] },
      eventCount: 0,
    },
    getInternationalPassportMetadata: metadata,
    listMyVerificationRequests: { requests: [], decisions: [] },
    listMyShares: [],
    countMyAcademyWork: { total: 0, actionable: 0 },
    countMyReviewQueue: 0,
    listMyEmployerWorkspaces: [],
    trackV31FunnelEvent: { recorded: false },
    listMyCredentialDrafts: [],
    listCredentialTypes: [],
    listPassportMarketOverview: { markets: [], current: null },
    saveInternationalCredential: { id: CLAIM_ID },
    uploadEvidence: { id: "fixture-evidence" },
    assessCredentialEvidence: { decision: unverifiable, recorded: false },
    // Production truth: no link-based source is enabled, so none is offered.
    getHayatAvailability: { linkSources: [] },
    // Nothing has been checked unless a test says otherwise.
    getSavedAssessment: null,
    assessSavedCredential: { decision: unverifiable, recorded: true },
    ...over,
    listMyEvidence: [],
    listClaimVersions: [],
    getCredentialPrivateFields: { credentialReference: null, holderNote: null },
  });
  const storageKey = await observeSupabaseStorageKey(page);
  await plantSession(page, storageKey);
  await page.evaluate((l) => localStorage.setItem("cqrityjob.lang", l), lang);
  await page.goto(`${base}${path}`);
  if (path.startsWith("/passport/credentials/new"))
    await expect(page.locator("[data-international-credential-form]")).toBeVisible();
  return { refusals, requests };
}

/** Evidence is a by-product of the assertions, and only when asked for. */
const shot = async (page: Page, name: string, target = "[data-international-credential-form]") => {
  const dir = process.env.HAYAT_EVIDENCE_DIR;
  if (!dir) return;
  await page.locator(target).screenshot({ path: `${dir}/${name}-${test.info().project.name}.png` });
};
const choose = (page: Page, name: string, mimeType: string, buffer: Buffer) =>
  page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
const panel = (page: Page, phase: string) =>
  page.locator(`[data-hayat-panel][data-hayat-phase="${phase}"]`);
const identifier = (page: Page) => page.locator('[data-field="identifier"]');
const dates = (page: Page) =>
  page.locator("[data-international-credential-form] input[inputmode='numeric']");

/** No document text ever leaves the browser: not to a server function, not anywhere. */
function assertNothingLeft(requests: readonly Request[], markers: readonly string[]) {
  for (const request of requests) {
    const body = request.postData() ?? "";
    for (const marker of markers) {
      expect(body.includes(marker), `${marker} in a request to ${request.url()}`).toBe(false);
      expect(request.url().includes(marker)).toBe(false);
    }
    const host = new URL(request.url()).hostname;
    expect(/jsdelivr|unpkg|cdnjs/.test(host), `third-party engine host ${host}`).toBe(false);
  }
}

test("text PDF (English): reads, fills the existing fields, and verifies nothing", async ({
  page,
}) => {
  const { refusals, requests } = await mount(page, "en");
  await choose(page, "certificate.pdf", "application/pdf", await fixtures.textPdf(ENGLISH_CPP));
  await expect(panel(page, "read")).toBeVisible({ timeout: 60_000 });
  await expect(panel(page, "read")).toContainText("Document read");
  await expect(identifier(page)).toHaveValue("7741-2291-86");
  await expect(dates(page).nth(0)).toHaveValue("2024-03-12");
  await expect(dates(page).nth(1)).toHaveValue("2027-03-31");
  await expect(page.locator("[data-hayat-badge]")).toHaveCount(3);
  await expect(page.locator("[data-hayat-badge]").first()).toHaveText("Read by HAYAT");
  await expect(page.locator('[data-hayat-selection="match"]')).toBeVisible();
  await expect(page.locator("[data-hayat-ocr]")).toHaveCount(0);

  // Read is not verified: a separate box, and an honest status.
  const verification = page.locator("[data-hayat-verification]");
  await expect(verification).toHaveAttribute("data-hayat-status", "cannot_verify_automatically");
  await expect(verification).toContainText("Cannot be verified automatically");
  await expect(verification.locator("[data-hayat-reason]")).toHaveAttribute(
    "data-hayat-reason",
    "no_verifiable_source",
  );
  await expect(page.locator("main")).not.toContainText("Verified by HAYAT");

  // The holder can correct a value, and the mark goes with the edit.
  await identifier(page).fill("7741-2291-87");
  await expect(page.locator("[data-hayat-badge]")).toHaveCount(2);

  // Saving is unchanged: claim first, document after, straight to the entry.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("[data-international-credential-form]")).toContainText(
    "An attached document is evidence, not verification.",
  );
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(CLAIM_ID));

  const names = requests.map((r) => exportOf(r.url())).filter(Boolean);
  expect(names.indexOf("saveInternationalCredential")).toBeGreaterThan(-1);
  expect(names.indexOf("uploadEvidence")).toBeGreaterThan(
    names.indexOf("saveInternationalCredential"),
  );
  // A plain document never asks the server to verify anything.
  expect(names).not.toContain("assessCredentialEvidence");
  const save = requests.find((r) => exportOf(r.url()) === "saveInternationalCredential");
  expect(save?.postData() ?? "").not.toMatch(/verified|assertion|hayat|confidence/i);
  // The only request that may carry the document is the existing private upload.
  assertNothingLeft(
    requests.filter((r) => exportOf(r.url()) !== "uploadEvidence"),
    [ENGLISH_CPP.marker, "This is to certify"],
  );
  assertNoRefusals(refusals);
});

test("scanned PDF (Swedish): OCR runs from this origin and says it was OCR", async ({ page }) => {
  const { refusals, requests } = await mount(page, "sv");
  await choose(page, "skannat.pdf", "application/pdf", await fixtures.scannedPdf(SWEDISH_CPP));
  await expect(panel(page, "reading")).toContainText("HAYAT läser dokumentet");
  await expect(panel(page, "read")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-hayat-ocr]")).toBeVisible();
  await expect(identifier(page)).toHaveValue("3318-9920-45");
  await expect(dates(page).nth(0)).toHaveValue("2025-04-03");
  await expect(dates(page).nth(1)).toHaveValue("2028-04-02");
  await expect(page.locator("[data-hayat-badge]").first()).toHaveText("Avläst av HAYAT");
  await expect(page.locator("[data-hayat-verification]")).toContainText(
    "Kan inte verifieras automatiskt",
  );
  expect(requests.some((r) => r.url().includes("/hayat-ocr/lang/swe.traineddata.gz"))).toBe(true);
  await shot(page, "scanned-pdf-sv");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  assertNothingLeft(requests, [SWEDISH_CPP.marker]);
  assertNoRefusals(refusals);
});

test("image (JPEG): typed values are kept and the conflict is shown", async ({ page }) => {
  const { refusals } = await mount(page, "en");
  await identifier(page).fill("MY-OWN-NUMBER-1");
  await dates(page).nth(0).fill("2024-03-12");
  await choose(page, "photo.jpg", "image/jpeg", await fixtures.jpeg(ENGLISH_CPP));
  await expect(panel(page, "read")).toBeVisible({ timeout: 120_000 });
  await expect(identifier(page)).toHaveValue("MY-OWN-NUMBER-1");
  const conflict = page.locator('[data-hayat-note="identifier"]');
  await expect(conflict).toHaveAttribute("data-hayat-note-kind", "conflict");
  await expect(conflict).toContainText("7741-2291-86");
  await expect(page.locator('[data-hayat-note="issued_on"]')).toHaveAttribute(
    "data-hayat-note-kind",
    "agrees",
  );
  await shot(page, "conflict-en");
  await conflict.getByRole("button", { name: "Use the document's value" }).click();
  await expect(identifier(page)).toHaveValue("7741-2291-86");
  assertNoRefusals(refusals);
});

for (const degrees of [90, 180] as const) {
  test(`a photo turned ${degrees} degrees is read the right way up`, async ({ page }) => {
    const { refusals } = await mount(page, "en");
    await choose(
      page,
      "sideways.jpg",
      "image/jpeg",
      await fixtures.turnedJpeg(ENGLISH_CPP, degrees),
    );
    await expect(panel(page, "read")).toBeVisible({ timeout: 140_000 });
    await expect(identifier(page)).toHaveValue("7741-2291-86");
    await expect(dates(page).nth(0)).toHaveValue("2024-03-12");
    await expect(dates(page).nth(1)).toHaveValue("2027-03-31");
    assertNoRefusals(refusals);
  });
}

test("an ambiguous date is a question, and a missing field stays empty", async ({ page }) => {
  const { refusals } = await mount(page, "en");
  await choose(page, "ambiguous.pdf", "application/pdf", await fixtures.textPdf(AMBIGUOUS));
  await expect(panel(page, "read")).toBeVisible({ timeout: 60_000 });
  await expect(dates(page).nth(0)).toHaveValue("");
  await expect(dates(page).nth(1)).toHaveValue("");
  const note = page.locator('[data-hayat-note="issued_on"]');
  await expect(note).toHaveAttribute("data-hayat-note-kind", "choose");
  await expect(page.locator('[data-hayat-note="valid_until"]')).toHaveAttribute(
    "data-hayat-note-kind",
    "not_found",
  );
  await note.getByRole("button", { name: "Use 2026-04-03" }).click();
  await expect(dates(page).nth(0)).toHaveValue("2026-04-03");
  assertNoRefusals(refusals);
});

test("a document for a different credential is flagged; the selection is not changed", async ({
  page,
}) => {
  const { refusals } = await mount(page, "en");
  await choose(page, "psp.pdf", "application/pdf", await fixtures.textPdf(ENGLISH_PSP));
  await expect(panel(page, "read")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-hayat-type="different"]')).toContainText(
    "Physical Security Professional",
  );
  await expect(page.locator("[data-credential-roles]")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(CLAIM_ID));
  assertNoRefusals(refusals);
});

test("replacing the file while HAYAT is reading: only the new file's result is used", async ({
  page,
}) => {
  const { refusals } = await mount(page, "en");
  // A = a scan (slow: OCR). B = a text PDF (fast). A must never land.
  await choose(page, "a.png", "image/png", await fixtures.png(ENGLISH_PSP));
  await expect(panel(page, "reading")).toBeVisible();
  await choose(page, "b.pdf", "application/pdf", await fixtures.textPdf(ENGLISH_CPP));
  await expect(panel(page, "read")).toBeVisible({ timeout: 60_000 });
  await expect(identifier(page)).toHaveValue("7741-2291-86");
  // Long enough for A's OCR to have finished, had it been allowed to.
  await page.waitForTimeout(20_000);
  await expect(identifier(page)).toHaveValue("7741-2291-86");
  await expect(page.locator('[data-hayat-type="different"]')).toHaveCount(0);
  await expect(page.locator("[data-evidence-file-name]")).toHaveText("b.pdf");

  // Removing the file takes back what HAYAT filled and the holder left alone.
  await dates(page).nth(1).fill("2027-04-30");
  await page.locator("[data-evidence-remove]").click();
  await expect(page.locator("[data-hayat-panel]")).toHaveCount(0);
  await expect(page.locator("[data-hayat-verification]")).toHaveCount(0);
  await expect(identifier(page)).toHaveValue("");
  await expect(dates(page).nth(0)).toHaveValue("");
  await expect(dates(page).nth(1)).toHaveValue("2027-04-30");
  assertNoRefusals(refusals);
});

test("oversized, unsupported, unreadable and password-protected files keep the form", async ({
  page,
}) => {
  const { refusals } = await mount(page, "en");
  await identifier(page).fill("KEEP-ME-1");

  await choose(page, "big.pdf", "application/pdf", Buffer.alloc(8 * 1024 * 1024 + 1, 0x20));
  await expect(page.getByRole("alert")).toContainText("up to 8 MB");
  await expect(page.locator("[data-hayat-panel]")).toHaveCount(0);

  await choose(page, "notes.txt", "text/plain", Buffer.from("hello"));
  await expect(page.getByRole("alert")).toContainText("Choose PDF, JPG, PNG or HEIC");
  await expect(page.locator("[data-hayat-panel]")).toHaveCount(0);

  await choose(page, "broken.pdf", "application/pdf", Buffer.from("%PDF-1.4\nnot really a pdf"));
  await expect(page.locator('[data-hayat-failure="unreadable"]')).toBeVisible({ timeout: 60_000 });

  await choose(page, "locked.pdf", "application/pdf", passwordProtectedPdf());
  await expect(page.locator('[data-hayat-failure="encrypted"]')).toBeVisible({ timeout: 60_000 });
  await expect(panel(page, "failed")).toContainText("password-protected");

  await choose(page, "phone.heic", "image/heic", Buffer.from("not decodable here"));
  await expect(page.locator('[data-hayat-failure="unsupported_format"]')).toBeVisible({
    timeout: 60_000,
  });
  await expect(panel(page, "failed")).toContainText("Everything you entered is still here.");

  // Through all of it: the typed value survived, and the form still saves.
  await expect(identifier(page)).toHaveValue("KEEP-ME-1");
  await expect(page.locator("[data-hayat-verification]")).toHaveAttribute(
    "data-hayat-status",
    "cannot_verify_automatically",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(CLAIM_ID));
  assertNoRefusals(refusals);
});

test("a PNG carrying a signed credential asks the SERVER, and shows its answer", async ({
  page,
}) => {
  const { refusals, requests } = await mount(page, "en");
  const credential = "eyJhbGciOiJFZERTQSJ9.eyJzeW50aGV0aWMiOnRydWV9.c2lnbmF0dXJl";
  await choose(
    page,
    "badge.png",
    "image/png",
    bakeCredential(await fixtures.png(ENGLISH_CPP), credential),
  );
  await expect(panel(page, "read")).toBeVisible({ timeout: 120_000 });
  const verification = page.locator("[data-hayat-verification]");
  await expect(verification.locator("[data-hayat-reason]")).toHaveAttribute(
    "data-hayat-reason",
    "issuer_not_trusted",
  );
  await expect(verification).toContainText("not connected to CQrityjob");
  await expect(verification).toHaveAttribute("data-hayat-recorded", "false");
  const call = requests.find((r) => exportOf(r.url()) === "assessCredentialEvidence");
  expect(call).toBeTruthy();
  const sent = call?.postData() ?? "";
  expect(sent).toContain(credential);
  expect(sent).toContain("INTL_ASIS_CPP");
  // The server is never told what the browser read, or what to conclude.
  expect(sent).not.toMatch(/verified|confidence|ocr|This is to certify/i);
  assertNoRefusals(refusals);
});

test("no link field is offered while no source is permitted", async ({ page }) => {
  const { refusals } = await mount(page, "sv");
  await expect(page.locator("[data-hayat-link]")).toHaveCount(0);
  assertNoRefusals(refusals);
});

test("with a permitted source, a link is checked by the server and its scope is shown", async ({
  page,
}) => {
  const verified = {
    ...unverifiable,
    status: "verified",
    reasons: ["ok"],
    bindingLevel: "email_control",
    adapter: "credly-ob2-hosted/1",
    scopeLimits: ["credential_number_not_published", "issue_date_not_compared"],
  };
  const { refusals, requests } = await mount(page, "sv", {
    getHayatAvailability: {
      linkSources: [{ id: "credly_ob2", name: "Credly", definitionCodes: ["INTL_ASIS_CPP"] }],
    },
    assessCredentialEvidence: { decision: verified, recorded: false },
  });
  const link = page.locator('[data-field="badge-link"]');
  await expect(link).toBeVisible();
  await link.fill("https://www.credly.com/badges/11111111-2222-4333-8444-555555555555");
  await page.getByRole("button", { name: "Kontrollera länken" }).click();
  const box = page.locator("[data-hayat-verification]");
  await expect(box).toHaveAttribute("data-hayat-status", "verified");
  await expect(box).toContainText("Kontrollerna godkändes");
  await expect(box.locator("[data-hayat-scope-limit]")).toHaveCount(2);
  await expect(box).toContainText("certifikatsnumret");
  await expect(box).toContainText("Det är inte en identitetskontroll");
  await expect(box).toHaveAttribute("data-hayat-recorded", "false");
  await expect(box).toContainText("sparas ännu inte");
  const call = requests.filter((r) => exportOf(r.url()) === "assessCredentialEvidence").pop();
  const sent = call?.postData() ?? "";
  expect(sent).toContain("credly.com/badges/11111111");
  expect(sent).not.toMatch(/verified|confidence/i);
  await shot(page, "link-verified-sv");
  assertNoRefusals(refusals);
});

// ── Save, reopen, re-check ────────────────────────────────────────────────
const savedClaim = {
  ...source.claims[0],
  id: CLAIM_ID,
  claimType: "certification",
  credentialCode: "INTL_ASIS_CPP",
  titleSv: "Certified Protection Professional (CPP)",
  titleEn: "Certified Protection Professional (CPP)",
  issuerName: "ASIS International",
  assertionLevel: "document_provided",
  lifecycleState: "active",
  issuedOn: "2024-03-12",
  validUntil: "2027-03-31",
  versionNo: 1,
};
const passportWith = (claims: unknown[]) => ({
  profileIdentity: { displayName: "Test Holder Synthetic", titleSv: "x", titleEn: "x" },
  profile: {
    displayName: "Test Holder Synthetic",
    headline: "x",
    privacyMode: "full_name",
    onboardingState: "completed",
    onboardingAnswers: {},
  },
  holder: { ...source, claims, periods: [] },
  eventCount: 0,
});
const savedCheck = (over: Record<string, unknown> = {}) => ({
  status: "cannot_verify_automatically",
  reasons: ["issuer_not_trusted"],
  bindingLevel: "none",
  scopeLimits: [],
  sourceKind: "signed_credential",
  ruleVersion: "hayat-rules/2",
  checkedAt: "2026-09-20T09:00:00.000Z",
  isCurrent: true,
  notCurrentReason: null,
  ...over,
});
const entry = `/passport/entry/claim/${CLAIM_ID}`;

test("save: a file with a signed credential is checked BY THE SERVER, and the reopened credential shows the saved check", async ({
  page,
}) => {
  const credential = "eyJhbGciOiJFZERTQSJ9.eyJzeW50aGV0aWMiOnRydWV9.c2lnbmF0dXJl";
  const { refusals, requests } = await mount(page, "en", {
    getMyPassport: passportWith([savedClaim]),
    getSavedAssessment: savedCheck(),
  });
  await choose(
    page,
    "badge.png",
    "image/png",
    bakeCredential(await fixtures.png(ENGLISH_CPP), credential),
  );
  await expect(panel(page, "read")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(CLAIM_ID));

  const names = requests.map((r) => exportOf(r.url())).filter(Boolean);
  const order = ["saveInternationalCredential", "uploadEvidence", "assessSavedCredential"].map(
    (n) => names.indexOf(n),
  );
  expect(order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2]).toBe(true);
  const sent =
    requests.find((r) => exportOf(r.url()) === "assessSavedCredential")?.postData() ?? "";
  expect(sent).toContain(CLAIM_ID);
  // The server reads the stored file itself: the browser does not tell it what the file holds.
  expect(sent).not.toContain(credential);
  expect(sent).not.toMatch(/verified|status|decision/i);

  const card = page.locator("[data-hayat-saved]");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-hayat-saved-status", "cannot_verify_automatically");
  await expect(card).toHaveAttribute("data-hayat-saved-current", "true");
  await expect(card).toContainText("Cannot be verified automatically");
  await expect(card).toContainText("Last checked 20 September 2026");
  await expect(card).toContainText("does not change the credential's status");
  await shot(page, "reopened-saved-check-en", "[data-hayat-saved]");
  assertNoRefusals(refusals);
});

test("save: a plain document asks the server to check nothing", async ({ page }) => {
  const { refusals, requests } = await mount(page, "en", {
    getMyPassport: passportWith([savedClaim]),
  });
  await choose(page, "certificate.pdf", "application/pdf", await fixtures.textPdf(ENGLISH_CPP));
  await expect(panel(page, "read")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(CLAIM_ID));
  expect(requests.map((r) => exportOf(r.url()))).not.toContain("assessSavedCredential");
  const card = page.locator("[data-hayat-saved]");
  await expect(card).toHaveAttribute("data-hayat-saved-status", "none");
  await expect(card).toContainText("No automatic check has been made");
  assertNoRefusals(refusals);
});

test("reopen: an earlier positive check is shown as HISTORY, with the reason, and can be re-run", async ({
  page,
}) => {
  const { refusals, requests } = await mount(
    page,
    "sv",
    {
      getMyPassport: passportWith([savedClaim]),
      getSavedAssessment: savedCheck({
        status: "verified",
        reasons: ["ok"],
        bindingLevel: "email_control",
        sourceKind: "hosted_open_badge",
        scopeLimits: ["credential_number_not_published"],
        isCurrent: false,
        notCurrentReason: "recheck_needed",
      }),
      assessSavedCredential: {
        decision: {
          ...unverifiable,
          status: "temporarily_unavailable",
          reasons: ["source_unavailable"],
        },
        recorded: false,
      },
    },
    entry,
  );
  const card = page.locator("[data-hayat-saved]");
  await expect(card).toHaveAttribute("data-hayat-saved-current", "false");
  await expect(card.locator("[data-hayat-saved-history]")).toHaveAttribute(
    "data-hayat-saved-history",
    "recheck_needed",
  );
  await expect(card).toContainText("Tidigare kontroll – gäller inte längre");
  await expect(card).toContainText("Den tidigare kontrollen är för gammal");
  await expect(card).toContainText("certifikatsnumret");
  await card.getByRole("button", { name: "Kontrollera igen" }).click();
  // The source is down: that is said, and the saved history is left as it was.
  await expect(card.locator("[data-hayat-saved-outage]")).toContainText(
    "säger ingenting om meriten",
  );
  await expect(card).toHaveAttribute("data-hayat-saved-current", "false");
  const sent =
    requests.find((r) => exportOf(r.url()) === "assessSavedCredential")?.postData() ?? "";
  expect(sent).toContain(CLAIM_ID);
  await shot(page, "reopened-history-sv", "[data-hayat-saved]");
  assertNoRefusals(refusals);
});

// ── The timeout path ──────────────────────────────────────────────────────
//
// Until this test existed, the reader's cancellation was only ever checked by
// reading its source (passport-hayat:check 9.18). Nothing PROVED that a reading
// which runs out of time actually gives up, keeps the holder's work, offers a
// way forward, and -- the part that matters -- cannot come back later and
// overwrite the file the holder has since chosen instead.
//
// The budget is held against the wall clock, so the test costs about 95 s. That
// is the price of proving it rather than asserting it.
test("a timed-out reading keeps the form, offers a retry, and its late result never lands", async ({
  page,
}) => {
  test.setTimeout(400_000);
  const { refusals } = await mount(page, "sv");

  // The holder's own value must survive all of this.
  await identifier(page).fill("MITT-EGNA-NUMMER");

  // Hold the OCR language data past the 60 s budget: a deterministic cold start
  // that runs out of time, exactly as a very slow first use would.
  let held = true;
  await page.route("**/hayat-ocr/lang/**", async (route) => {
    if (held) await new Promise((r) => setTimeout(r, 70_000));
    await route.continue();
  });

  await choose(page, "photo.jpg", "image/jpeg", await fixtures.jpeg(ENGLISH_CPP));
  await expect(panel(page, "failed")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("[data-hayat-failure]")).toHaveAttribute(
    "data-hayat-failure",
    "timeout",
  );
  await expect(panel(page, "failed")).toContainText("Dina ifyllda uppgifter är kvar.");
  await expect(
    panel(page, "failed").getByRole("button", { name: "Läs dokumentet igen" }),
  ).toBeVisible();
  await expect(identifier(page)).toHaveValue("MITT-EGNA-NUMMER");

  // A new file is chosen. The abandoned reading is now free to finish.
  held = false;
  await choose(page, "certificate.pdf", "application/pdf", await fixtures.textPdf(ENGLISH_CPP));
  await expect(panel(page, "read")).toBeVisible({ timeout: 120_000 });
  await expect(dates(page).nth(0)).toHaveValue("2024-03-12");

  // Ample time for the abandoned engine to load and try to write.
  await page.waitForTimeout(25_000);
  await expect(identifier(page)).toHaveValue("MITT-EGNA-NUMMER");
  await expect(dates(page).nth(0)).toHaveValue("2024-03-12");
  await expect(dates(page).nth(1)).toHaveValue("2027-03-31");
  await expect(page.locator("[data-hayat-ocr]")).toHaveCount(0);
  assertNoRefusals(refusals);
});

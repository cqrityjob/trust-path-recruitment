// Slutuppdrag 2026-10-15 — the whole chain in a real browser on the local
// stack: register → document → review (with a version-bound clarification and
// a stale review page) → choose visibility → a recruiter binds the job's
// requirements to the catalogue and finds people → contact → accept → apply
// with the person's own Passport choice → the recruiter continues in the
// existing application workflow → revocation and pause take effect on the
// next read. And the refusals: a plain colleague, another company, a private
// person behind a direct API call, anon.
//
// Stack: scripts/local-stack/up.sh (real PostgreSQL 16 with the full
// migration history, real PostgREST and RLS, the gateway's GoTrue and Storage
// substitutes, and its mail catcher), then
// scripts/fixtures/talent-discovery-fixture.sql. Loopback only.
//
// Run:
//   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
//   E2E_SUPABASE_URL=http://127.0.0.1:54321 E2E_DB_URL=postgresql://... \
//   E2E_SUPABASE_ANON_KEY=... bunx playwright test e2e/talent-discovery-local.spec.ts --project=chromium

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const DB = process.env.E2E_DB_URL ?? "";
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local walk.");
test.skip(
  !LOOPBACK.test(BASE) ||
    !LOOPBACK.test(API) ||
    !/@(127\.0\.0\.1|localhost)[:/]/.test(DB) ||
    ANON === "",
  "This spec signs synthetic people in and writes; it runs against loopback only.",
);
// Ordered (one worker) but NOT serial: an early failure must not leave the
// later scenarios skipped and unproven. State a later scenario needs is read
// from the database, never carried in a variable an earlier test set.
test.describe.configure({ mode: "default", timeout: 240_000 });

const PASSWORD = "LocalJourney!2026";
const SHOTS = path.resolve(process.env.TD_EVIDENCE_DIR ?? "test-results/talent-discovery");
const A = "td-cand-a@local.test";
const REVIEWER = "td-reviewer@local.test";
const OWNER = "td-owner@local.test";
const RECRUITER = "td-recruiter@local.test";
const COLLEAGUE = "td-colleague@local.test";
const OWNER2 = "td-owner2@local.test";
const C = "td-cand-c@local.test";
const OWNER_ID = "7d000000-0000-4000-8000-0000000000e1";
const JOB = "7d000000-2222-4000-8000-000000000001";
const JOB_PATH = `/employer/td-bevakning/jobs/${JOB}`;
const A_ID = "7d000000-0000-4000-8000-0000000000a1";
const B_ID = "7d000000-0000-4000-8000-0000000000b1";
const C_ID = "7d000000-0000-4000-8000-0000000000c1";

function sql(text: string): string {
  return execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
    encoding: "utf8",
  }).trim();
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function signIn(
  browser: Browser,
  email: string,
  redirect: string,
  viewport = { width: 1440, height: 1000 },
) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  // Decisions, revocations and withdrawals ask window.confirm first; the
  // person in these scenarios says yes. Playwright would otherwise dismiss.
  // A test that answers a dialog itself registers its own listener; then
  // this default steps aside.
  page.on("dialog", (d) => {
    if (page.listenerCount("dialog") === 1) void d.accept();
  });
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  return page;
}

/** A session's access token, for the direct API calls. */
async function tokenOf(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

async function rpc(fn: string, args: Record<string, unknown>, token: string | null) {
  const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.text() };
}

// TD_REAL_STACK=1: real GoTrue, Storage and PostgREST (the CLI stack in
// .github/workflows/talent-discovery-real-ci.yml). That stack runs no Edge
// runtime, so product mail cannot leave it: the proof there is the notice row
// and that its mail was never recorded as sent.
const REAL = process.env.TD_REAL_STACK === "1";

async function expectProductNotice(
  to: string,
  kind: string,
): Promise<{ subject?: string; text?: string } | null> {
  if (REAL) {
    const rows = () =>
      sql(
        `select coalesce(string_agg(n.email_status, ','), '') from user_notices n join auth.users u on u.id = n.recipient_user_id where lower(u.email) = lower('${to}') and n.kind = '${kind}'`,
      );
    await expect.poll(rows, { timeout: 30_000 }).not.toBe("");
    expect(rows().split(",")).not.toContain("sent");
    return null;
  }
  await expect
    .poll(async () => (await inbox(to)).filter((m) => m.type === "product:product_notice").length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  return (await inbox(to)).reverse().find((m) => m.type === "product:product_notice") ?? null;
}

async function inbox(to: string): Promise<{ type: string; subject?: string; text?: string }[]> {
  const res = await fetch(`${API}/__local/inbox?to=${encodeURIComponent(to)}`);
  return (await res.json()) as { type: string; subject?: string; text?: string }[];
}

/** No page may scroll sideways at this width. */
async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "horizontal overflow").toBeLessThanOrEqual(1);
}

/** Cecilia's current CPP entry (scenario 1 creates it). */
const cppClaim = () =>
  sql(
    `select id from sp_claims where holder_user_id='${A_ID}' and credential_code='INTL_ASIS_CPP' and lifecycle_state='active' order by created_at desc limit 1`,
  );
/** The version the reviewer's first page was loaded on, before the answer. */
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test("1 · A registers a credential, documents it and asks for review from the next step", async ({
  browser,
}) => {
  const page = await signIn(browser, A, "/passport/credentials/new?code=INTL_ASIS_CPP");
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel(/^(Giltig till|Valid until)$/, { exact: true }).fill("2028-05-31");
  // The unsaved-changes guard: leaving with typed input asks first.
  let asked = false;
  page.once("dialog", (d) => {
    asked = true;
    void d.dismiss();
  });
  await page.getByRole("link", { name: "Översikt", exact: true }).first().click();
  await expect.poll(() => asked).toBe(true);
  await expect(page).toHaveURL(/credentials\/new/);
  await page.getByRole("button", { name: /^(Fortsätt|Continue)$/, exact: true }).click();
  await page.getByRole("button", { name: /^(Spara merit|Save credential)$/, exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 60_000 });

  const next = page.locator("[data-entry-next-step]");
  await expect(next).toHaveAttribute("data-entry-next-step", "add_evidence", { timeout: 30_000 });
  // The panel accepts a file once the upload-recovery read has settled.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#sp-evidence-file")).toBeEnabled();
  await page
    .locator("#sp-evidence-file")
    .setInputFiles({ name: "cpp-intyg.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.locator("[data-evidence-saved-file]").first()).toBeVisible({ timeout: 60_000 });
  await expect(next).toHaveAttribute("data-entry-next-step", "request_review", { timeout: 60_000 });
  await shot(page, "after-next-step-request-review-sv-1440");
  // Not "share": the review is the recommended way forward after an upload.
  await expect(next.getByRole("button", { name: "Begär granskning" })).toBeVisible();
  await expect(next.getByRole("link", { name: /Dela/ })).toHaveCount(0);
  // Double click on the request: one request.
  await next.getByRole("button", { name: "Begär granskning" }).dblclick();
  await expect(next).toHaveAttribute("data-entry-next-step", "waiting", { timeout: 60_000 });
  expect(sql(`select count(*) from sp_verification_requests where claim_id='${cppClaim()}'`)).toBe(
    "1",
  );
  expect(
    sql(`select count(*) from product_metric_events where event_name='passport_review_requested'`),
  ).not.toBe("0");
  await page.context().close();
});

test("2 · the reviewer asks for more information; the holder is told in the app and by mail", async ({
  browser,
}) => {
  const reviewerPage = await signIn(browser, REVIEWER, "/passport-review");
  const item = reviewerPage
    .locator("li")
    .filter({ hasText: "Certified Protection Professional" })
    .first();
  await item.getByRole("button", { name: "Öppna ärendet" }).click();
  await reviewerPage.getByLabel(/Begär komplettering/).check();
  await reviewerPage
    .locator("#sp-holder-message")
    .fill("Vilket år avlade du examen? Intyget saknar datum.");
  await reviewerPage.getByRole("button", { name: "Ja, spara beslutet" }).click();
  await expect
    .poll(() => sql(`select status from sp_verification_requests where claim_id='${cppClaim()}'`), {
      timeout: 30_000,
    })
    .toBe("clarification_requested");
  await reviewerPage.context().close();
  const mail = await expectProductNotice(A, "passport_clarification_requested");
  if (mail) {
    expect(mail.subject).toContain("Komplettering");
    expect(mail.text).not.toContain("Vilket år");
  }
});

test("3 · the holder answers in text, bound to the version", async ({ browser }) => {
  const page = await signIn(browser, A, `/passport/entry/claim/${cppClaim()}`);
  const next = page.locator("[data-entry-next-step]");
  await expect(next).toHaveAttribute("data-entry-next-step", "clarification", { timeout: 60_000 });
  const reply = page.locator("[data-clarification-reply]");
  await reply
    .getByLabel("Ditt svar till granskaren")
    .fill("Examen avlades i maj 2022. Intyget utfärdades utan datum.");
  await shot(page, "after-clarification-reply-sv-1440");
  await reply.getByRole("button", { name: "Skicka svar" }).click();
  await expect(next).toHaveAttribute("data-entry-next-step", "waiting", { timeout: 60_000 });
  await expect(page.locator('[data-thread-event="reply"]')).toContainText("maj 2022");
  await page.context().close();
});

test("4 · the review page opened before the answer is refused; after reload the reviewer reads the answer and approves", async ({
  browser,
}) => {
  const fresh = await signIn(browser, REVIEWER, "/passport-review");
  const item = fresh.locator("li").filter({ hasText: "Certified Protection Professional" }).first();
  await item.getByRole("button", { name: "Öppna ärendet" }).click();
  await expect(fresh.locator("[data-review-case-thread]")).toContainText("maj 2022", {
    timeout: 30_000,
  });
  // Stale: the page loaded before the answer carries the old version.
  const stale = await rpc(
    "sp_verifier_decide_reviewed",
    {
      _request_id: sql(`select id from sp_verification_requests where claim_id='${cppClaim()}'`),
      // The version a review page opened before the answer carried: the one
      // the holder's reply answered.
      _reviewed_submitted_at: sql(
        `select p.answers_submitted_at from sp_verification_replies p join sp_verification_requests r on r.id=p.request_id where r.claim_id='${cppClaim()}' order by p.created_at desc limit 1`,
      ),
      _decision: "approved",
      _method: "document_review",
      _decision_note: null,
      _holder_message: null,
      _valid_from: null,
      _valid_until: null,
    },
    await tokenOf(REVIEWER),
  );
  expect(stale.body).toContain("SP_REVIEW_STALE");
  await shot(fresh, "after-reviewer-reads-reply-sv-1440");
  await fresh.getByLabel(/Godkänn dokumentgranskning/).check();
  await fresh.getByRole("button", { name: "Ja, spara beslutet" }).click();
  await expect
    .poll(() => sql(`select assertion_level from sp_claims where id='${cppClaim()}'`), {
      timeout: 30_000,
    })
    .toBe("verified");
  expect(
    sql(
      `select count(*) from sp_verification_decisions d join sp_verification_requests r on r.id=d.request_id where r.claim_id='${cppClaim()}'`,
    ),
  ).toBe("2");
  await fresh.context().close();
});

test("5 · A sees one current status and its history, then becomes discoverable for chosen items", async ({
  browser,
}) => {
  const page = await signIn(browser, A, `/passport/entry/claim/${cppClaim()}`);
  await expect(page.locator("[data-entry-next-step]")).toHaveAttribute(
    "data-entry-next-step",
    "done",
    { timeout: 60_000 },
  );
  await expect(page.locator('[data-review-current="approved"]')).toContainText(
    "inte en bekräftelse från utfärdaren",
  );
  await shot(page, "after-entry-reviewed-sv-1440");
  await page
    .locator("[data-entry-next-step]")
    .getByRole("link", { name: "Välj synlighet för arbetsgivare" })
    .click();
  await expect(page).toHaveURL(/\/passport\/discoverability/);
  await expect(page.locator("[data-current-visibility]")).toHaveAttribute(
    "data-current-visibility",
    "private",
    { timeout: 30_000 },
  );
  await shot(page, "before-discoverability-private-sv-1440");
  await page.getByLabel(/Öppen för relevanta möjligheter/).check();
  await page.getByLabel("Certified Protection Professional (CPP)").check();
  await page.getByLabel("Security Guard Training 1 (VU1)").check();
  await page.getByLabel(/^Väktare/).check();
  await page.getByLabel("Företagssäkerhet").check();
  await page.getByLabel("Länder du vill arbeta i").fill("SE");
  await page.getByLabel("Heltid").check();
  // Without consent nothing is saved.
  await page.locator("[data-save-discoverability]").click();
  await expect(page.getByRole("alert")).toContainText("samtycket");
  expect(sql(`select count(*) from sp_talent_profiles where holder_user_id='${A_ID}'`)).toBe("0");
  await page.getByLabel(/Jag samtycker/).check();
  await page.locator("[data-save-discoverability]").click();
  await expect(page.locator("[data-current-visibility]")).toHaveAttribute(
    "data-current-visibility",
    "open",
    { timeout: 30_000 },
  );
  const preview = page.locator("[data-discoverability-preview]");
  await expect(preview).toContainText("Certified Protection Professional (CPP)");
  await expect(preview).toContainText("Dokumentgranskad av CQrityjob");
  await expect(preview).not.toContainText("Fiktiv Nuvarande Arbetsgivare");
  await expect(preview).not.toContainText("Cecilia");
  await shot(page, "after-discoverability-open-sv-1440");
  expect(
    sql(`select count(*) from product_metric_events where event_name='talent_visibility_enabled'`),
  ).not.toBe("0");
  // Mobile and 200 % zoom (half the CSS width): no sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(page);
  await shot(page, "after-discoverability-open-sv-390");
  await page.setViewportSize({ width: 720, height: 500 });
  await noHorizontalOverflow(page);
  await page.context().close();
});

test("6 · the owner binds the confirmed requirements to the catalogue; a plain colleague and another company cannot search", async ({
  browser,
}) => {
  const page = await signIn(browser, OWNER, `${JOB_PATH}?step=requirements`);
  const panel = page.locator("[data-talent-criteria]");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await shot(page, "before-criteria-sv-1440");
  const bind = async (requirement: string, query: string, pick: RegExp) => {
    const row = panel.locator(`[data-criterion="${requirement}"]`);
    await row.getByLabel("Merit i katalogen").check();
    await row.getByPlaceholder("Sök i katalogen").fill(query);
    await row.getByRole("button", { name: pick }).first().click();
    return row;
  };
  const ov = await bind(
    "7d000000-3333-4000-8000-000000000001",
    "Ordningsvakt",
    /Ordningsvaktsförordnande|Public Order Guard/,
  );
  await ov.getByLabel(/^Land/).selectOption("SE");
  await bind("7d000000-3333-4000-8000-000000000002", "VU1", /VU1/);
  // A certification and an authorisation cannot satisfy one requirement.
  const cpp = await bind(
    "7d000000-3333-4000-8000-000000000003",
    "CPP",
    /Certified Protection Professional/,
  );
  await cpp.getByPlaceholder("Sök i katalogen").fill("OV");
  await cpp
    .getByRole("button", { name: /Ordningsvaktsförordnande \(OV\)/ })
    .first()
    .click();
  await expect(cpp.getByRole("alert")).toContainText("inte en reglerad behörighet");
  await cpp.getByRole("button", { name: /Ta bort: Ordningsvaktsförordnande/ }).click();
  await cpp.getByLabel("Lägsta nivå").selectOption("document_reviewed");
  const exp = panel.locator('[data-criterion="7d000000-3333-4000-8000-000000000004"]');
  await exp.getByLabel("Erfarenhet", { exact: true }).check();
  await exp.getByLabel("Minst antal månader").fill("24");
  await panel.locator("[data-confirm-criteria]").click();
  await expect(panel).toContainText("Matchningsvillkoren är bekräftade", { timeout: 30_000 });
  await shot(page, "after-criteria-sv-1440");
  await page.context().close();

  // A plain member of the same company: no button, and the page says why not without detail.
  const colleague = await signIn(browser, COLLEAGUE, `${JOB_PATH}/talent`);
  await expect(colleague.getByText(/Talangsökning är tillgänglig för ägare/)).toBeVisible({
    timeout: 60_000,
  });
  await colleague.goto(`${BASE}${JOB_PATH}?step=requirements`);
  await expect(colleague.locator("[data-find-candidates]")).toHaveCount(0);
  await colleague.context().close();
  // Another company's owner reaching this job's search directly.
  const other = await signIn(browser, OWNER2, "/employer/td-konkurrent");
  const res = await rpc("rec_talent_search", { _job_id: JOB, _filters: {} }, await tokenOf(OWNER2));
  expect(res.body).toContain("TALENT_SEARCH_NOT_AVAILABLE");
  await other.context().close();
});

test("7 · the recruiter finds the discoverable people and reads why; the private person is never shown or counted", async ({
  browser,
}) => {
  const page = await signIn(browser, RECRUITER, `${JOB_PATH}/talent`);
  await expect(page.locator("[data-talent-total]")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-talent-total]")).toHaveAttribute("data-talent-total", "2");
  const results = page.locator("[data-talent-result]");
  await expect(results).toHaveCount(2);
  // Bo (OV reviewed, VU1, CPP) is first; Cecilia second.
  await expect(results.nth(0)).toContainText("Ordningsvaktsförordnande (OV)");
  await expect(results.nth(0)).toContainText("Dokumentgranskad av CQrityjob");
  await expect(results.nth(1)).toContainText("Inte bland delade uppgifter");
  await expect(results.nth(1)).toContainText("Det betyder inte att personen saknar det.");
  await expect(results.nth(1)).toContainText("Certified Protection Professional (CPP)");
  await expect(page.getByText("Körkort B").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Petra");
  await expect(page.locator("main")).not.toContainText("Cecilia");
  await expect(page.locator("main")).not.toContainText(/\d+\s*(poäng|points|%)|\bscore\b/i);
  await shot(page, "after-talent-results-sv-1440");
  // Filter on the factual requirements.
  // Bo has both requirements a Passport can answer (OV, VU1); Cecilia has not
  // shared OV. "Körkort B" is settled in dialogue and never counts either way.
  await page.getByLabel("Alla obligatoriska krav har stöd").check();
  await expect(page.locator("[data-talent-total]")).toHaveAttribute("data-talent-total", "1", {
    timeout: 30_000,
  });
  await expect(results).toHaveCount(1);
  await expect(results.nth(0)).toContainText("Söker aktivt");
  await page.getByLabel("Alla obligatoriska krav har stöd").uncheck();
  await expect(page.locator("[data-talent-total]")).toHaveAttribute("data-talent-total", "2", {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(page);
  await shot(page, "after-talent-results-sv-390");
  await page.setViewportSize({ width: 1440, height: 1000 });

  // A private person, by direct API: same answer as an unknown reference.
  const token = await tokenOf(RECRUITER);
  const cRef = sql(`select gen_random_uuid()`);
  const privateRead = await rpc("rec_talent_profile", { _job_id: JOB, _ref: cRef }, token);
  expect(privateRead.body).toBe('{"status": "not_available"}');
  expect(sql(`select count(*) from sp_talent_profiles where holder_user_id='${C_ID}'`)).toBe("0");
  // Anon: nothing.
  const anon = await rpc("rec_talent_search", { _job_id: JOB, _filters: {} }, null);
  expect(anon.status).toBeGreaterThanOrEqual(400);
  // A direct table read is refused for a signed-in recruiter.
  const table = await fetch(`${API}/rest/v1/sp_talent_profiles?select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  expect(table.status === 200 ? await table.text() : "[]").toBe("[]");

  // Contact Cecilia, double click on send: one request.
  const second = results.nth(1);
  await second.locator("[data-contact-open]").click();
  await page
    .getByLabel("Meddelande")
    .fill("Hej! Vi söker en ordningsvakt i Stockholm och din profil berör flera av våra krav.");
  await shot(page, "after-contact-dialog-sv-1440");
  await page.locator("[data-contact-send]").dblclick();
  await expect(page.getByText("Förfrågan är skickad.")).toBeVisible({ timeout: 30_000 });
  expect(
    sql(`select count(*) from rec_talent_contact_requests where holder_user_id='${A_ID}'`),
  ).toBe("1");
  await page.context().close();
});

test("8 · Cecilia reads who, about what and what accepting means, accepts, and applies with her own Passport choice", async ({
  browser,
}) => {
  if (REAL) {
    await expectProductNotice(A, "talent_contact_received");
  } else {
    await expect
      .poll(
        async () => (await inbox(A)).filter((m) => m.subject?.includes("TD Bevakning AB")).length,
        { timeout: 30_000 },
      )
      .toBe(1);
  }
  const page = await signIn(browser, A, "/passport/discoverability");
  const request = page.locator('[data-contact-request="pending"]');
  await expect(request).toContainText("TD Bevakning AB", { timeout: 60_000 });
  await expect(request).toContainText("Ordningsvakt Stockholm");
  await expect(request).toContainText("din profil berör");
  await expect(request).toContainText("Ingen ansökan skapas");
  await shot(page, "after-contact-received-sv-1440");
  await request.getByRole("button", { name: "Acceptera", exact: true }).dblclick();
  const accepted = page.locator('[data-contact-request="accepted"]');
  await expect(accepted).toBeVisible({ timeout: 30_000 });
  expect(sql(`select count(*) from job_applications where applicant_user_id='${A_ID}'`)).toBe("0");
  await accepted.getByRole("link", { name: "Läs annonsen och sök tjänsten" }).click();
  await expect(page).toHaveURL(/\/jobs\/td-ordningsvakt-stockholm/);
  await page
    .getByRole("button", { name: /^(Sök jobbet|Apply)$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await page.setInputFiles("#apply-cv", {
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  // The Passport choice is hers: shown, and on.
  await expect(dialog.getByText("Ta med mitt verifierade Security Passport")).toBeVisible();
  await dialog
    .getByText("Jag samtycker till att min ansökan och mitt CV delas med arbetsgivaren.")
    .click();
  await shot(page, "after-apply-with-passport-choice-sv-1440");
  await dialog.getByRole("button", { name: "Skicka ansökan", exact: true }).click();
  await expect
    .poll(() => sql(`select count(*) from job_applications where applicant_user_id='${A_ID}'`), {
      timeout: 60_000,
    })
    .toBe("1");
  expect(
    sql(
      `select application_id is not null from rec_talent_contact_requests where holder_user_id='${A_ID}'`,
    ),
  ).toBe("t");
  await page.context().close();
});

test("9 · the recruiter continues in the existing application workflow", async ({ browser }) => {
  const page = await signIn(browser, RECRUITER, `${JOB_PATH}/talent?tab=contacts`);
  const contact = page.locator('[data-sent-contact="accepted"]');
  await expect(contact).toContainText("Cecilia Kandidat", { timeout: 60_000 });
  await shot(page, "after-contacts-accepted-sv-1440");
  await contact.getByRole("link", { name: "Öppna ansökan" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText("Cecilia Kandidat").first()).toBeVisible({ timeout: 60_000 });
  await shot(page, "after-application-workflow-sv-1440");
  await page.context().close();
});

test("10 · revocation and pause take effect on the next read; the dated snapshot stays separate", async ({
  browser,
}) => {
  const reviewer = await tokenOf(REVIEWER);
  const bOv = sql(
    `select id from sp_claims where holder_user_id='${B_ID}' and credential_code='OV' and lifecycle_state='active'`,
  );
  const revoked = await rpc(
    "sp_verifier_revoke",
    { _claim_id: bOv, _period_id: null, _reason: "Syntetisk återkallelse" },
    reviewer,
  );
  expect(revoked.status).toBeLessThan(300);
  const page = await signIn(browser, RECRUITER, `${JOB_PATH}/talent`);
  const first = page.locator("[data-talent-result]").first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main")).not.toContainText("Ordningsvaktsförordnande (OV)");

  // Cecilia pauses: her old reference stops at once, and she leaves the count.
  const aRef = sql(`select search_ref from sp_talent_profiles where holder_user_id='${A_ID}'`);
  const a = await signIn(browser, A, "/passport/discoverability");
  await a.locator("[data-pause-discoverability]").click();
  await expect(a.locator("[data-current-visibility]")).toHaveAttribute(
    "data-current-visibility",
    "private",
    { timeout: 30_000 },
  );
  await shot(a, "after-paused-sv-1440");
  await a.context().close();
  const old = await rpc(
    "rec_talent_profile",
    { _job_id: JOB, _ref: aRef },
    await tokenOf(RECRUITER),
  );
  expect(old.body).toBe('{"status": "not_available"}');
  await page.reload();
  await expect(page.locator("[data-talent-total]")).toHaveAttribute("data-talent-total", "1", {
    timeout: 60_000,
  });
  // The recruitment record keeps its dated snapshot, labelled as history.
  await page.goto(`${BASE}${JOB_PATH}/talent?tab=contacts`);
  await expect(page.locator('[data-sent-contact="accepted"]')).toContainText(
    "Inte sökbar just nu",
    { timeout: 60_000 },
  );
  await expect(page.getByText("Underlag när förfrågan skickades")).toBeVisible();
  await page.context().close();

  writeFileSync(
    path.join(SHOTS, "metrics.json"),
    sql(
      `select json_object_agg(event_name, n) from (select event_name, count(*) n from product_metric_events group by 1) x`,
    ),
  );
});

test("11 · a rejection reaches the holder in the reviewer's words; a removed permission stops search at once; English and keyboard", async ({
  browser,
}) => {
  const cOv = sql(
    `select id from sp_claims where holder_user_id='${C_ID}' and credential_code='OV' and lifecycle_state='active'`,
  );
  const reviewer = await signIn(browser, REVIEWER, "/passport-review");
  const item = reviewer.locator("li").filter({ hasText: "Petra Privat" }).first();
  await item.getByRole("button", { name: "Öppna ärendet" }).click();
  await reviewer.getByLabel(/^Avslå$/).check();
  await reviewer.getByLabel("Intern motivering").fill("INTERN-ANTECKNING-SKA-INTE-SYNAS");
  await reviewer
    .locator("#sp-holder-message")
    .fill("Dokumentet är oläsligt. Ladda upp en tydligare kopia.");
  await reviewer.getByRole("button", { name: "Ja, spara beslutet" }).click();
  await expect
    .poll(() => sql(`select status from sp_verification_requests where claim_id='${cOv}'`), {
      timeout: 30_000,
    })
    .toBe("rejected");
  expect(sql(`select assertion_level from sp_claims where id='${cOv}'`)).not.toBe("verified");
  await reviewer.context().close();

  // The holder reads the decision and its message; never the internal note.
  const c = await signIn(browser, C, `/passport/entry/claim/${cOv}`);
  await expect(c.locator("[data-entry-next-step]")).toContainText(
    "Granskningen kunde inte godkännas",
    { timeout: 60_000 },
  );
  await expect(
    c.getByText("Dokumentet är oläsligt. Ladda upp en tydligare kopia.").first(),
  ).toBeVisible();
  await expect(c.locator("body")).not.toContainText("INTERN-ANTECKNING");
  const thread = await rpc(
    "sp_review_thread",
    { _claim_id: cOv, _period_id: null },
    await tokenOf(C),
  );
  expect(thread.body).not.toContain("INTERN-ANTECKNING");
  await shot(c, "after-rejected-sv-1440");
  await expectProductNotice(C, "passport_decision_rejected");
  // A rejection changes nothing about discoverability: Petra stays private.
  expect(sql(`select count(*) from sp_talent_profiles where holder_user_id='${C_ID}'`)).toBe("0");
  await c.context().close();

  // The owner hands the recruitment to themself: the recruiter's search stops on the next call.
  sql(`update recruitment_settings set responsible_user_id='${OWNER_ID}' where job_id='${JOB}'`);
  const refused = await rpc(
    "rec_talent_search",
    { _job_id: JOB, _filters: {} },
    await tokenOf(RECRUITER),
  );
  expect(refused.body).toContain("TALENT_SEARCH_NOT_AVAILABLE");
  const contacts = await rpc("rec_talent_contacts", { _job_id: JOB }, await tokenOf(RECRUITER));
  expect(contacts.body).toContain("TALENT_SEARCH_NOT_AVAILABLE");
  const r = await signIn(browser, RECRUITER, `${JOB_PATH}/talent`);
  await expect(r.getByText(/Talangsökning är tillgänglig för ägare/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(r.locator("[data-talent-result]")).toHaveCount(0);
  await shot(r, "after-permission-removed-sv-1440");
  await r.context().close();

  // English, desktop and phone width (and 200 % zoom of a 780 px window).
  const owner = await signIn(browser, OWNER, `${JOB_PATH}/talent`);
  await owner.context().addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  await owner.reload();
  await expect(owner.getByRole("heading", { name: "Find candidates" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(owner.locator("[data-talent-total]")).toBeVisible({ timeout: 60_000 });
  await shot(owner, "after-talent-results-en-1440");
  await owner.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(owner);
  await shot(owner, "after-talent-results-en-390");
  await owner.context().close();

  // Keyboard: the visibility choice is reachable with Tab and changes with the arrow keys.
  const a = await signIn(browser, A, "/passport/discoverability");
  await expect(a.locator("[data-current-visibility]")).toBeVisible({ timeout: 60_000 });
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await a.keyboard.press("Tab");
    reached = await a.evaluate(
      () => (document.activeElement as HTMLInputElement | null)?.name === "visibility",
    );
  }
  expect(reached, "visibility reachable by Tab").toBe(true);
  const before = await a.evaluate(() => (document.activeElement as HTMLInputElement).value);
  await a.keyboard.press("ArrowDown");
  const after = await a.evaluate(
    () => (document.querySelector('input[name="visibility"]:checked') as HTMLInputElement).value,
  );
  expect(after).not.toBe(before);
  expect(await a.evaluate(() => document.activeElement?.matches(":focus-visible") ?? false)).toBe(
    true,
  );
  await a.setViewportSize({ width: 720, height: 900 });
  await noHorizontalOverflow(a);
  await shot(a, "after-discoverability-keyboard-sv-720");
  await a.context().close();
});

test("12 · a signed-out session reads nothing; a removed reviewer role ends inbox and thread access; an attestation note stays the employer's", async () => {
  const REVIEWER_ID = "7d000000-0000-4000-8000-0000000000f1";
  const logout = async (token: string) => {
    const res = await fetch(`${API}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBeLessThan(300);
  };
  const refused = (r: { status: number; body: string }) =>
    r.status >= 400 && r.body.includes("SP_SESSION_REVOKED");

  // The holder signs out; the access token is still unexpired, its session is gone.
  const holder = await tokenOf(A);
  const holderCalls: [string, Record<string, unknown>][] = [
    ["sp_talent_preview", {}],
    ["sp_talent_get_settings", {}],
    ["user_notices_inbox", { _limit: 30 }],
    ["sp_talent_my_contacts", {}],
    ["sp_review_thread", { _claim_id: cppClaim(), _period_id: null }],
  ];
  for (const [fn, args] of holderCalls) expect((await rpc(fn, args, holder)).status).toBe(200);
  await logout(holder);
  for (const [fn, args] of holderCalls)
    expect(refused(await rpc(fn, args, holder)), `${fn} after sign-out`).toBe(true);
  expect(
    refused(
      await rpc(
        "sp_talent_save_settings",
        {
          _expected_version: 0,
          _visibility: "private",
          _consent_text_version: null,
          _claim_ids: [],
          _experience_ids: [],
          _preferences: {},
        },
        holder,
      ),
    ),
  ).toBe(true);

  // The same on the employer side.
  const owner = await tokenOf(OWNER);
  expect((await rpc("rec_talent_search", { _job_id: JOB, _filters: {} }, owner)).status).toBe(200);
  await logout(owner);
  expect(refused(await rpc("rec_talent_search", { _job_id: JOB, _filters: {} }, owner))).toBe(true);
  expect(refused(await rpc("rec_talent_contacts", { _job_id: JOB }, owner))).toBe(true);
  // A fresh sign-in works again: the rule is the session, not the account.
  expect(
    (await rpc("rec_talent_search", { _job_id: JOB, _filters: {} }, await tokenOf(OWNER))).status,
  ).toBe(200);

  // An employer attestation with an internal note on Cecilia's employment.
  const period = "7d000000-5555-4000-8000-0000000000a1";
  sql(`insert into sp_verification_requests (holder_user_id, period_id, request_kind, target_employer_id, status, submitted_at, decided_at, decided_by, verification_method, decision_note, holder_message)
       select '${A_ID}', '${period}', 'employer_attestation', id, 'approved', now() - interval '1 hour', now(), '7d000000-0000-4000-8000-0000000000e1',
              'employer_confirmation', 'INTERN-ARBETSGIVARE-E2E', 'Bekräftad.' from employers where slug = 'td-bevakning'`);
  sql(`insert into sp_verification_decisions (request_id, holder_user_id, decided_by, decider_organisation, decision, verification_method, decision_note, holder_message)
       select id, holder_user_id, decided_by, 'TD Bevakning AB', 'approved', 'employer_confirmation', decision_note, holder_message
         from sp_verification_requests where period_id = '${period}' and request_kind = 'employer_attestation'`);
  const reviewer = await tokenOf(REVIEWER);
  const attestation = await rpc(
    "sp_review_thread",
    { _claim_id: null, _period_id: period },
    reviewer,
  );
  expect(attestation.body).not.toContain("INTERN-ARBETSGIVARE-E2E");
  expect(attestation.body).toContain("SP_TARGET_NOT_FOUND");
  // The holder sees the confirmation named as an employer's, and never the note.
  const own = await rpc("user_notices_inbox", { _limit: 50 }, await tokenOf(A));
  expect(own.body).toContain('"verificationMethod": "employer_confirmation"');
  const ownThread = await rpc(
    "sp_review_thread",
    { _claim_id: null, _period_id: period },
    await tokenOf(A),
  );
  expect(ownThread.body).not.toContain("INTERN-ARBETSGIVARE-E2E");

  // The reviewer role is removed: the inbox, the thread and the table all close at once.
  const before = await rpc("user_notices_inbox", { _limit: 50 }, reviewer);
  expect(before.body).toContain('"audience": "reviewer"');
  sql(`delete from user_roles where user_id = '${REVIEWER_ID}' and role = 'passport_verifier'`);
  try {
    const after = await rpc("user_notices_inbox", { _limit: 50 }, reviewer);
    expect(after.body).not.toContain('"audience": "reviewer"');
    expect(
      (await rpc("sp_review_thread", { _claim_id: cppClaim(), _period_id: null }, reviewer)).body,
    ).toContain("SP_TARGET_NOT_FOUND");
    const direct = await fetch(`${API}/rest/v1/user_notices?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${reviewer}` },
    });
    expect(direct.status).toBeGreaterThanOrEqual(400);
  } finally {
    sql(
      `insert into user_roles (user_id, role) values ('${REVIEWER_ID}', 'passport_verifier') on conflict do nothing`,
    );
  }

  // No session at all: the anon key reaches none of it.
  expect(
    (await rpc("rec_talent_search", { _job_id: JOB, _filters: {} }, null)).status,
  ).toBeGreaterThanOrEqual(400);
  expect((await rpc("sp_talent_preview", {}, null)).status).toBeGreaterThanOrEqual(400);
});

test("13 · a corrected credential and a corrected employment: the employer reads the current version, never the replaced one", async ({
  browser,
}) => {
  // Cecilia opens again after the pause in 10; her selection is kept.
  const a = await signIn(browser, A, "/passport/discoverability");
  await expect(a.locator("[data-current-visibility]")).toHaveAttribute(
    "data-current-visibility",
    "private",
    { timeout: 30_000 },
  );
  await a.getByLabel(/Öppen för relevanta möjligheter/).check();
  const consent = a.getByLabel(/Jag samtycker/);
  if (!(await consent.isChecked())) await consent.check();
  await a.locator("[data-save-discoverability]").click();
  await expect(a.locator("[data-current-visibility]")).toHaveAttribute(
    "data-current-visibility",
    "open",
    { timeout: 30_000 },
  );

  // She corrects the reviewed CPP through its entry page. A correction is a
  // new version, and nobody has reviewed it.
  const replaced = cppClaim();
  await a.goto(`${BASE}/passport/entry/claim/${replaced}`);
  await a.getByRole("button", { name: "Rätta uppgift", exact: true }).click({ timeout: 60_000 });
  await a.getByLabel("Certifikats- eller licensnummer (valfritt)").fill("CPP-RATTAD-2");
  await a.getByRole("button", { name: "Fortsätt", exact: true }).click();
  await a.getByRole("button", { name: "Spara merit", exact: true }).click();
  await expect.poll(() => cppClaim(), { timeout: 60_000 }).not.toBe(replaced);
  const current = cppClaim();
  await expect(a).toHaveURL(new RegExp(current), { timeout: 60_000 });
  expect(sql(`select assertion_level from sp_claims where id='${current}'`)).toBe("self_declared");
  // The searchable selection follows the correction (RF4): the new version,
  // never the replaced one.
  expect(sql(`select count(*) from sp_talent_items where claim_id='${current}'`)).toBe("1");
  expect(sql(`select count(*) from sp_talent_items where claim_id='${replaced}'`)).toBe("0");

  // She corrects her own employment on the CV page; it is read live.
  await a.goto(`${BASE}/my-career/cv`);
  const employment = a.locator("[aria-labelledby='cv-employment-heading']");
  await employment.getByRole("button", { name: "Ändra" }).first().click({ timeout: 60_000 });
  await employment.getByLabel("Roll").fill("Väktare och skyddsvakt");
  await employment.getByRole("button", { name: "Spara", exact: true }).click();
  await expect
    .poll(
      () =>
        sql(
          `select role_title from sp_experience_periods where holder_user_id='${A_ID}' and lifecycle_state='active'`,
        ),
      { timeout: 30_000 },
    )
    .toBe("Väktare och skyddsvakt");
  await a.context().close();

  // The employer reads the current versions, at what they now are: the
  // corrected CPP as her own statement, the employment under its new title,
  // and nothing of the replaced, reviewed version. (The owner searches: 11
  // removed the recruiter's permission.)
  const page = await signIn(browser, OWNER, `${JOB_PATH}/talent`);
  await expect(page.locator("[data-talent-total]")).toHaveAttribute("data-talent-total", "2", {
    timeout: 60_000,
  });
  // The results carry no names: Cecilia is the one open for opportunities
  // (she chose it above); Bo is actively looking.
  const cecilia = page.locator("[data-talent-result]").filter({ hasText: "Öppen för möjligheter" });
  await expect(cecilia).toHaveCount(1);
  // Why she is shown: the CPP is now her own statement, below the reviewed
  // level the job asks for. The reviewed level of the replaced version is gone.
  await expect(cecilia).toContainText(/Certified Protection Professional \(CPP\)\s*Egen uppgift/);
  await expect(cecilia).toContainText("Lägre granskningsnivå än ni angett");
  await expect(cecilia).not.toContainText("Dokumentgranskad");
  // Her shared profile: the corrected CPP and the employment under its new title.
  await cecilia.getByRole("button", { name: "Visa delad profil" }).click();
  const card = cecilia.locator("[data-talent-card]");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.locator('[data-talent-merit="INTL_ASIS_CPP"]')).toHaveCount(1);
  await expect(card.locator('[data-talent-merit="INTL_ASIS_CPP"] [data-level]')).toHaveAttribute(
    "data-level",
    "self_declared",
  );
  await expect(card).toContainText("Väktare och skyddsvakt");
  await expect(card).not.toContainText("Dokumentgranskad");
  await expect(page.locator("main")).not.toContainText("Cecilia");
  await shot(page, "after-talent-corrected-sv-1440");
  await page.context().close();
});

/**
 * The India entry journey, end to end, against a REAL isolated backend:
 * GoTrue with e-mail confirmation ON (the confirmation link is read from the
 * stack's own Mailpit and followed), PostgREST, Storage and the Edge share
 * gateway. No response is stubbed. Every person and document is synthetic.
 *
 *   landing → sign-up → confirmation e-mail → the right destination
 *   → empty Passport → four-step setup → an Indian qualification with HAYAT
 *   → reload → review, clarification, answer, approval by a passport_verifier
 *   → selective share + QR + recipient + revocation
 *   → another candidate reads and changes nothing.
 *
 * Opt-in and loopback only: INDIA_LIVE_LOCAL=1, E2E_BASE_URL=http://localhost:<port>,
 * INDIA_API_URL / INDIA_ANON_KEY / INDIA_SERVICE_KEY / INDIA_MAILPIT_URL /
 * INDIA_DB_URL for the disposable stack (docs/passport/india-market-entry.md).
 */
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { createFixtures, type CertificateText } from "./support/hayat-fixtures";

const env = (k: string) => process.env[k] ?? "";
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
test.skip(env("INDIA_LIVE_LOCAL") !== "1", "Explicit disposable local-stack opt-in required");
test.use({ actionTimeout: 20_000 });

const BASE = env("E2E_BASE_URL");
const API = env("INDIA_API_URL");
const MAILPIT = env("INDIA_MAILPIT_URL");
const DB = env("INDIA_DB_URL");

function refuseNonLocal() {
  for (const [name, url] of [
    ["E2E_BASE_URL", BASE],
    ["INDIA_API_URL", API],
    ["INDIA_MAILPIT_URL", MAILPIT],
  ] as const)
    if (!LOOPBACK.test(url)) throw new Error(`${name} must be a loopback URL, got ${url}`);
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(DB)) throw new Error("INDIA_DB_URL must be local");
}
const sql = (q: string) =>
  execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-At", "-c", q], { encoding: "utf8" }).trim();

const INDIAN_CERTIFICATE: CertificateText = {
  issuer: "Management &amp; Entrepreneurship and Professional Skills Council",
  title: "Security Guard",
  intro: "This is to certify that",
  holder: "Ms. Priya Ramaswamy Iyer",
  rows: [
    ["Qualification Pack:", "MEP/Q7101, NSQF Level 3"],
    ["Certificate No:", "MEPSC/SG/2023/004417"],
    ["Date of Issuance:", "03-Apr-2023"],
  ],
  marker: "SYNTHETIC-DOCUMENT-MARKER-INDIA",
};

/** The confirmation link GoTrue mailed to `email`, from the stack's Mailpit. */
async function confirmationLink(email: string): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const list = (await r.json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const m = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        HTML?: string;
        Text?: string;
      };
      const body = `${m.HTML ?? ""} ${m.Text ?? ""}`;
      const link = /https?:\/\/[^"'\s<>]+\/auth\/v1\/verify[^"'\s<>]+/.exec(body)?.[0];
      if (link) return link.replaceAll("&amp;", "&");
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no confirmation e-mail for ${email}`);
}

async function noHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

test("India: landing → confirmed account → setup → credential → review → share → revoke", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the full journey runs once, on desktop");
  test.setTimeout(420_000);
  refuseNonLocal();
  const shots = (name: string) =>
    page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const stamp = Date.now();
  const email = `priya.${stamp}@test.local`;
  const password = "IndiaJourney!2026";

  // Every request, so the OCR boundary and the document boundary are provable.
  const requests: { url: string; body: string | null }[] = [];
  page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() }));
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      external.push(host);
      return route.abort();
    }
    return route.continue();
  });

  // ── 1. The landing page ───────────────────────────────────────────────
  await page.goto(`${BASE}/security-passport/india`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your security qualifications, in one place",
  );
  await expect(page.locator("[data-india-example-label]")).toHaveText("Example");
  await expect(page.locator("[data-india-example] [data-scope-mark]").first()).toBeVisible();
  await expect(page.locator("main")).toContainText("Security Guard");
  await expect(page.locator("main")).toContainText("MEP/Q7101");
  await expect(page.locator("main")).toContainText("does not replace SIRA training or licensing");
  // Interactive: the arrival effect has run (it records the page view).
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("cqj:funnel:once:india_landing_viewed")))
    .toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("cqrityjob.lang"))).toBe("en");
  await page.getByRole("link", { name: "See an example" }).click();
  await expect(page).toHaveURL(/#example$/);
  await shots("01-landing-desktop");
  expect(
    requests.filter((r) => /hayat-ocr|tesseract|pdf\.worker|traineddata/.test(r.url)),
    "no OCR asset is fetched on the landing page",
  ).toHaveLength(0);

  // ── 2. Sign-up, carrying the intent, from a tap BEFORE hydration ─────
  // A first-time visitor on a slow phone: nothing chosen on this device and
  // the app's scripts still in flight when the link is tapped, so no click
  // handler runs. The language has to ride the link itself.
  await page.evaluate(() => localStorage.removeItem("cqrityjob.lang"));
  let heldScripts = 0;
  let scriptsReleased = false;
  await page.route("**/*", (route) => {
    if (scriptsReleased || route.request().resourceType() !== "script") return route.fallback();
    heldScripts += 1; // never answered: this document is navigated away from
  });
  await page.goto(`${BASE}/security-passport/india`, { waitUntil: "commit" });
  const cta = page.getByRole("link", { name: "Create my Security Passport" }).first();
  await expect(cta).toBeVisible();
  expect(heldScripts, "the tap lands before the app has hydrated").toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("cqrityjob.lang"))).toBeNull();
  scriptsReleased = true;
  await cta.click();
  await expect(page).toHaveURL(
    /\/signup\?redirect=%2Fpassport%2Fstart%3Fmarket%3DIN%26lang%3Den&lang=en$/,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(
    requests.filter((r) => /hayat-ocr|tesseract|pdf\.worker|traineddata/.test(r.url)),
    "no OCR asset is fetched during registration",
  ).toHaveLength(0);
  await page.getByLabel("Name (optional)").fill("Priya Ramaswamy Iyer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const signup = page.waitForRequest((r) => r.url().includes("/auth/v1/signup"));
  await page.getByRole("button", { name: "Create account" }).click();
  const redirectTo = new URL((await signup).url()).searchParams.get("redirect_to") ?? "";
  expect(redirectTo, "the confirmation link returns to the India setup").toBe(
    `${BASE}/login?redirect=${encodeURIComponent("/passport/start?market=IN&lang=en")}`,
  );
  await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible();

  // ── 3. The real confirmation e-mail ──────────────────────────────────
  // Opened with no language chosen -- as on another device -- so the
  // English setup below comes from the link alone.
  const link = await confirmationLink(email);
  await page.evaluate(() => localStorage.removeItem("cqrityjob.lang"));
  await page.goto(link);
  await expect(page).toHaveURL(/\/passport\/start\?market=IN/, { timeout: 60_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => localStorage.getItem("cqrityjob.lang"))).toBe("en");

  // ── 4. The setup: an EMPTY Passport exists, no CV/document/review ─────
  await expect(page.locator("[data-india-setup]")).toHaveAttribute("data-setup-step", "name");
  const userId = sql(`select id from auth.users where email='${email}'`);
  expect(
    sql(`select count(*) from public.sp_passport_profiles where holder_user_id='${userId}'`),
  ).toBe("1");
  expect(sql(`select count(*) from public.sp_claims where holder_user_id='${userId}'`)).toBe("0");
  expect(sql(`select count(*) from public.cv_documents where owner_user_id='${userId}'`)).toBe("0");
  await expect(page.getByLabel("Display name")).toHaveValue("Priya Ramaswamy Iyer");
  await page.getByLabel("Current occupation").selectOption("__other__");
  await page.locator('[data-field="occupation-other"]').fill("Security guard, residential site");
  await shots("02-setup-name");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.locator("[data-india-setup]")).toHaveAttribute("data-setup-step", "location");
  await expect(page.getByLabel("Country of residence")).toHaveValue("IN");
  await expect(page.locator("[data-prefilled]")).toBeVisible();
  await page.getByLabel("City or state (optional)").fill("पुणे");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.locator("[data-india-setup]")).toHaveAttribute(
    "data-setup-step",
    "destinations",
  );
  await page.locator('[data-destination-option="AE-DU"]').check();
  await page.getByLabel("Open to it").check();
  await shots("03-setup-destinations");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.locator("[data-india-setup]")).toHaveAttribute("data-setup-step", "first");

  // Choosing Dubai changed nothing about work country, market or credentials.
  expect(
    sql(
      `select coalesce(jurisdiction_code,'-')||'/'||coalesce(sub_jurisdiction_code,'-') from public.sp_passport_profiles where holder_user_id='${userId}'`,
    ),
  ).toBe("-/-");
  expect(
    sql(
      `select country_code||'|'||locality from public.candidate_current_location where user_id='${userId}'`,
    ),
  ).toBe("IN|पुणे");
  expect(
    sql(
      `select array_to_string(desired_destinations,',')||'|'||relocation_interest from public.candidate_job_preferences where user_id='${userId}'`,
    ),
  ).toBe("AE-DU|open");

  // Resumable: leaving and coming back lands on the first unanswered step.
  await page.goto(`${BASE}/passport/start`);
  await expect(page.locator("[data-india-setup]")).toHaveAttribute("data-setup-step", "first");

  // ── 5. The first credential: an Indian qualification, read by HAYAT ───
  await page.locator("[data-setup-add-credential]").click();
  await expect(page).toHaveURL(/\/passport\/credentials\/new\?country=IN/);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Approved credential").selectOption("IN_MEPSC_Q7101");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("[data-credential-awarding-body]")).toContainText("MEPSC");
  await expect(page.locator("[data-national-qualification-note]")).toBeVisible();
  const fixtures = await createFixtures(browser);
  const pdf = await fixtures.textPdf(INDIAN_CERTIFICATE);
  await fixtures.close();
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-mepsc-certificate.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.locator('[data-field="identifier"]')).toHaveValue("MEPSC/SG/2023/004417", {
    timeout: 60_000,
  });
  await page
    .locator('[data-field="issuer-name"]')
    .fill("Management & Entrepreneurship and Professional Skills Council");
  await page.locator('[data-field="definition-version"]').selectOption("qp-6.0");
  await expect(page.locator("main")).toContainText("cannot be verified automatically", {
    ignoreCase: true,
  });
  await shots("04-credential-hayat");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(/\/passport\/entry\/claim\//, { timeout: 60_000 });
  const claimId = new URL(page.url()).pathname.split("/").pop()!;

  // What reached the server: the private upload and nothing read from it.
  const leaked = requests.filter(
    (r) =>
      r.body?.includes("SYNTHETIC-DOCUMENT-MARKER-INDIA") &&
      !/\/_serverFn\//.test(r.url) &&
      !/\/storage\/v1\//.test(r.url),
  );
  expect(leaked, "no request carries text read from the document").toHaveLength(0);
  expect(external, "no third-party host was contacted").toEqual([]);

  // ── 6. Reload: everything survives, India stays India ────────────────
  await page.reload();
  await expect(page.locator("main")).toContainText("Security Guard (MEP/Q7101)");
  await expect(page.locator("[data-definition-version]")).toHaveAttribute(
    "data-definition-version",
    "qp-6.0",
  );
  await expect(page.locator("main")).toContainText("India");
  const claim = sql(
    `select jurisdiction_code||'|'||coalesce(sub_jurisdiction_code,'-')||'|'||credential_reference||'|'||issued_on||'|'||assertion_level||'|'||claimed_issuer_name from public.sp_claims where id='${claimId}'`,
  );
  expect(claim).toBe(
    "IN|-|MEPSC/SG/2023/004417|2023-04-03|document_provided|Management & Entrepreneurship and Professional Skills Council",
  );
  expect(
    sql(`select definition_version from public.sp_credential_details where claim_id='${claimId}'`),
  ).toBe("qp-6.0");
  // No expiry date was entered and the credential was not marked
  // non-expiring: that is a missing date, never "No expiry".
  expect(
    sql(
      `select coalesce(c.valid_until::text,'-')||'|'||coalesce(d.no_expiry::text,'-') from public.sp_claims c join public.sp_credential_details d on d.claim_id=c.id where c.id='${claimId}'`,
    ),
  ).toBe("-|-");
  await expect(page.locator("main")).toContainText("Expiry date not provided");
  await expect(page.locator("main")).not.toContainText("No expiry");
  expect(
    sql(`select count(*) from public.sp_hayat_assessments where claim_id='${claimId}'`),
    "no check was made, so no assessment and no reference exists",
  ).toBe("0");
  await shots("05-credential-saved");

  // The destination checklist now appears: recorded / needed / external.
  await page.goto(`${BASE}/passport/start`);
  await expect(page.locator("[data-setup-complete]")).toBeVisible();
  const checklist = page.locator('[data-destination="AE-DU"]');
  await expect(checklist.locator('[data-checklist-group="recorded"]')).toContainText(
    "Security Guard (MEP/Q7101)",
  );
  await expect(checklist.locator('[data-checklist-group="recorded"]')).toContainText("India");
  await expect(checklist.getByRole("link", { name: /SIRA Security Cadre Card/ })).toHaveAttribute(
    "href",
    "https://www.sira.gov.ae/en/services/security-cadre-card",
  );
  await expect(checklist).not.toContainText(/\d+\s*%|readiness|Dubai[- ]ready|you are ready/i);
  await shots("06-dubai-checklist");

  // ── 7. Review: request → clarification → answer → approval ──────────
  await page.goto(`${BASE}/passport/entry/claim/${claimId}`);
  await page.getByRole("button", { name: "Request verification" }).click();
  await expect(page.locator("main")).toContainText(/In review|submitted/i);
  const reviewerEmail = `reviewer.${stamp}@test.local`;
  const admin = createClient(API, env("INDIA_SERVICE_KEY"), { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email: reviewerEmail,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  sql(
    `insert into public.user_roles(user_id, role) values ('${created.data.user!.id}','passport_verifier')`,
  );
  const reviewerContext = await browser.newContext();
  // The reviewer works in English on this device (a stored preference, as
  // the language switcher would leave it).
  await reviewerContext.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  const reviewer = await reviewerContext.newPage();
  // The decision asks "are you sure?" through window.confirm; the reviewer says yes.
  reviewer.on("dialog", (d) => void d.accept());
  await reviewer.goto(`${BASE}/login?redirect=${encodeURIComponent("/passport-review")}`);
  await reviewer.getByLabel("Email").fill(reviewerEmail);
  await reviewer.getByLabel("Password").fill(password);
  await reviewer.getByRole("button", { name: "Sign in" }).click();
  await expect(reviewer).toHaveURL(/\/passport-review/, { timeout: 60_000 });
  // The queue is oldest first; this run's request is the newest.
  const request = reviewer.locator("li", { hasText: "Priya Ramaswamy Iyer" }).last();
  await request.getByRole("button", { name: "Open request" }).click();
  const facts = reviewer.locator("[data-review-definition-facts]");
  await expect(facts.locator("[data-review-stated-version]")).toContainText("MEP/Q7101");
  await expect(facts.locator("[data-review-stated-version]")).toContainText("v6.0");
  await expect(facts).toContainText("National Council for Vocational Education and Training");
  await expect(facts).toContainText("Stated on the certificate");
  await expect(request).toContainText("MEPSC/SG/2023/004417");
  await reviewer.screenshot({ path: testInfo.outputPath("07-reviewer.png"), fullPage: true });
  await reviewer.locator('input[name="sp-decision"][value="clarification_requested"]').check();
  await reviewer.locator("#sp-internal").fill("Page with the qualification pack code missing");
  await reviewer
    .locator("#sp-holder-message")
    .fill("Please add the page that shows the qualification pack code.");
  await reviewer.getByRole("button", { name: "Yes, record the decision" }).click();
  await expect(reviewer.locator("main")).toContainText("The decision has been recorded.");

  await page.reload();
  await expect(page.locator("main")).toContainText(
    "Please add the page that shows the qualification pack code.",
  );
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "synthetic-page-2.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.locator("main")).toContainText("synthetic-page-2.pdf", { timeout: 30_000 });

  await reviewer.goto(`${BASE}/passport-review`);
  // The default "Open" view holds pending AND clarification requests.
  await expect(reviewer.locator("li", { hasText: "Clarification requested" }).last()).toBeVisible();
  const answered = reviewer.locator("li", { hasText: "Priya Ramaswamy Iyer" }).last();
  await answered.getByRole("button", { name: "Open request" }).click();
  await expect(answered).toContainText("synthetic-page-2.pdf");
  await reviewer.locator('input[name="sp-decision"][value="approved"]').check();
  await reviewer.locator("#sp-internal").fill("Checked against the synthetic certificate");
  await reviewer.getByRole("button", { name: "Yes, record the decision" }).click();
  await expect(reviewer.locator("main")).toContainText("The decision has been recorded.");
  await reviewerContext.close();
  expect(sql(`select assertion_level from public.sp_claims where id='${claimId}'`)).toBe(
    "verified",
  );

  // ── 8. Selective share, QR, recipient, revocation ────────────────────
  // A second credential that is NOT selected must not appear anywhere.
  await page.goto(`${BASE}/passport/share`);
  await page.locator(`[data-merit-option="claim:${claimId}"] input[type="checkbox"]`).check();
  await page.locator('input[name="sel-expiry"][value="7"]').check();
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 30_000 });
  const shareLink = await page.locator("[data-share-link]").inputValue();
  expect(new URL(shareLink).origin).toBe(API);
  const qr = page.getByRole("img", { name: "QR code for your selected disclosure" });
  await expect(qr).toBeVisible();
  const expected = QRCode.create(shareLink, { errorCorrectionLevel: "M" }).modules;
  // Module by module (as passport-live-local.spec.ts): no margin is baked in.
  const drawn = await qr.evaluate(async (el, size) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const cell = img.naturalWidth / size;
    const out: number[] = [];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const px = ctx.getImageData(
          Math.floor(x * cell + cell / 2),
          Math.floor(y * cell + cell / 2),
          1,
          1,
        ).data;
        out.push(px[0]! + px[1]! + px[2]! < 384 ? 1 : 0);
      }
    return out;
  }, expected.size);
  expect(drawn, "the QR code encodes exactly the share link").toEqual(
    Array.from(expected.data, (v) => (v ? 1 : 0)),
  );
  // The token rides in the fragment only; nothing about the holder is in it.
  expect([...new URL(shareLink).searchParams.keys()]).toEqual([]);
  expect(shareLink).not.toContain(userId);
  expect(shareLink).not.toContain("MEPSC");
  await shots("08-share-created");

  const recipientContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await recipientContext.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  const recipient = await recipientContext.newPage();
  await recipient.goto(shareLink);
  await expect(recipient).toHaveURL(/\/p\//, { timeout: 60_000 });
  const view = recipient.locator("main");
  await expect(view).toContainText("Security Guard (MEP/Q7101)", { timeout: 30_000 });
  await expect(view).toContainText("India");
  await expect(view).not.toContainText("MEPSC/SG/2023/004417");
  await expect(view).not.toContainText("qp-6.0");
  await expect(view).not.toContainText("synthetic-mepsc-certificate");
  await expect(view).not.toContainText("Page with the qualification pack code missing");
  await expect(view).toContainText("Expiry date not provided");
  await expect(view).not.toContainText("No expiry");
  await recipient.screenshot({ path: testInfo.outputPath("09-recipient.png"), fullPage: true });

  const disclosureId = sql(
    `select id from public.sp_disclosures where holder_user_id='${userId}' and revoked_at is null order by created_at desc limit 1`,
  );
  const holderClient = createClient(API, env("INDIA_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const holderSession = await holderClient.auth.signInWithPassword({ email, password });
  expect(holderSession.error).toBeNull();
  const revoked = await holderClient.rpc(
    "sp_revoke_disclosure" as never,
    {
      _id: disclosureId,
    } as never,
  );
  expect(revoked.error).toBeNull();
  await recipient.reload();
  await expect(recipient.locator("main")).not.toContainText("Security Guard (MEP/Q7101)", {
    timeout: 30_000,
  });
  await recipientContext.close();

  // ── 9. Another candidate reads and changes nothing ──────────────────
  const otherEmail = `other.${stamp}@test.local`;
  const other = await admin.auth.admin.createUser({
    email: otherEmail,
    password,
    email_confirm: true,
  });
  expect(other.error).toBeNull();
  const otherClient = createClient(API, env("INDIA_ANON_KEY"), { auth: { persistSession: false } });
  expect(
    (await otherClient.auth.signInWithPassword({ email: otherEmail, password })).error,
  ).toBeNull();
  for (const table of ["sp_claims", "sp_credential_details", "sp_evidence"] as const) {
    const col = table === "sp_claims" ? "id" : "claim_id";
    const r = await otherClient
      .from(table as never)
      .select("*")
      .eq(col as never, claimId as never);
    expect(r.data ?? [], `another candidate reads no ${table}`).toHaveLength(0);
  }
  for (const table of ["candidate_current_location", "candidate_job_preferences"] as const) {
    const r = await otherClient
      .from(table as never)
      .select("*")
      .eq("user_id" as never, userId as never);
    expect(r.data ?? [], `another candidate reads no ${table}`).toHaveLength(0);
  }
  await otherClient.from("sp_claims").update({ credential_reference: "HIJACK" }).eq("id", claimId);
  expect(sql(`select credential_reference from public.sp_claims where id='${claimId}'`)).toBe(
    "MEPSC/SG/2023/004417",
  );
  const assess = await otherClient.rpc(
    "sp_hayat_current_assessment" as never,
    {
      _claim_id: claimId,
    } as never,
  );
  expect((assess.data as unknown[] | null) ?? []).toHaveLength(0);
  // A browser cannot write an assessment or promote a credential either.
  const forged = await holderClient.rpc("sp_hayat_record_assessment" as never, {} as never);
  expect(forged.error, "the assessment writer is not callable by a holder").not.toBeNull();
  const promote = await holderClient
    .from("sp_claims")
    .update({ assertion_level: "verified" })
    .eq("id", claimId);
  expect(promote.error).not.toBeNull();
  const anon = createClient(API, env("INDIA_ANON_KEY"), { auth: { persistSession: false } });
  const anonRead = await anon.from("sp_credential_definition_versions" as never).select("*");
  expect(anonRead.error, "an anonymous caller reads no catalogue version").not.toBeNull();
});

test("India on a phone: landing, keyboard, setup and form stay usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "chromium", "phone viewports only");
  test.setTimeout(240_000);
  refuseNonLocal();
  await page.goto(`${BASE}/security-passport/india`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noHorizontalScroll(page, "landing");
  await page.screenshot({ path: testInfo.outputPath("m1-landing.png"), fullPage: true });

  // Keyboard: the primary action is reachable and visibly focused.
  const cta = page.getByRole("link", { name: "Create my Security Passport" }).first();
  for (let i = 0; i < 40 && !(await cta.evaluate((el) => el === document.activeElement)); i += 1)
    await page.keyboard.press("Tab");
  await expect(cta).toBeFocused();

  // A returning English reader on this phone.
  await page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  // A confirmed synthetic holder, created through GoTrue's admin API.
  const admin = createClient(API, env("INDIA_SERVICE_KEY"), { auth: { persistSession: false } });
  const email = `mobile.${Date.now()}.${testInfo.project.name}@test.local`;
  const password = "IndiaJourney!2026";
  expect(
    (
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Arjun Rao" },
      })
    ).error,
  ).toBeNull();
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent("/passport/start?market=IN")}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/passport\/start\?market=IN/, { timeout: 60_000 });
  await expect(page.locator("[data-india-setup]")).toBeVisible({ timeout: 30_000 });
  await noHorizontalScroll(page, "setup");
  await page.screenshot({ path: testInfo.outputPath("m2-setup.png"), fullPage: true });

  // A save that fails keeps what was typed and says so.
  await page.route("**/_serverFn/**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await page.getByLabel("Current occupation").selectOption("__other__");
  await page.locator('[data-field="occupation-other"]').fill("CCTV operator");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("alert")).toContainText("What you entered is still here");
  await expect(page.locator('[data-field="occupation-other"]')).toHaveValue("CCTV operator");
  await page.unroute("**/_serverFn/**");

  await page.goto(`${BASE}/passport/credentials/new?country=IN`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Approved credential").selectOption("IN_MEPSC_Q7104");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await noHorizontalScroll(page, "credential form");
  // HAYAT failure: an unreadable file. The form keeps everything and saves by hand.
  await page.locator('[data-field="identifier"]').fill("CCTV-SUP-SYNTH-1");
  await page.locator('[data-field="issuer-name"]').fill("MEPSC");
  await page.locator('input[type="file"]').setInputFiles({
    name: "unreadable.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf at all"),
  });
  // The reading FAILS, says so, and takes nothing away from the form.
  await expect(page.locator('[data-hayat-panel][data-hayat-phase="failed"]')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("[data-hayat-failure]")).toHaveAttribute("data-hayat-failure", /.+/);
  await expect(page.locator('[data-field="identifier"]')).toHaveValue("CCTV-SUP-SYNTH-1");
  await expect(page.locator('[data-field="issuer-name"]')).toHaveValue("MEPSC");
  await page.screenshot({
    path: testInfo.outputPath("m3-form-reading-failed.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /remove file|ta bort fil/i })
    .click()
    .catch(() => undefined);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(/\/passport\/entry\/claim\//, { timeout: 60_000 });
  await noHorizontalScroll(page, "credential page");
  await page.screenshot({ path: testInfo.outputPath("m4-credential.png"), fullPage: true });
});

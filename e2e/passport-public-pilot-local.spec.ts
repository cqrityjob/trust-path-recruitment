// The public pilot, walked in the RUNNING application against a REAL local
// backend: GoTrue registers and signs the people in and sends the confirmation
// e-mail, PostgREST and row-level security store and return their rows, the
// claim rules decide what may be saved, Storage keeps the documents and the
// application exchanges a share link for a recipient session. No server
// response here is simulated. Two things the hosted platform does, and the
// local stack does not, are applied in front of it: hosted Supabase's HTML
// restriction (scripts/local-hosted-functions-proxy.ts) and the host's
// analytics script (scripts/local-tls-front.mjs).
//
// scripts/fixtures/passport-public-pilot-fixture.sql puts Great Britain,
// Northern Ireland and Dubai in the public-pilot state (20261220090000) -- "a
// fixture pack in the new state" -- and seeds synthetic people with NO pilot
// grant. Proof cases of the completion work order, per Playwright project
// (desktop, evidence at 1440, and a 390px phone), in Swedish and English:
//
//   A  a person registers at /signup, confirms from the e-mail, creates the
//      Passport and saves a Dubai credential -- no grant, no manual step; and
//      an ordinary holder saves from Dubai, Great Britain, Northern Ireland,
//      India, Sweden and the international catalogue, all on /passport after a
//      reload;
//   D  one form per field pattern: Dubai's required company, a British licence,
//      Northern Ireland's own licence, an Indian qualification's stated issuer
//      and version, a Swedish course's stated provider, a certification;
//   E  the occupation saved on the profile appears on the Passport card;
//   I  a work-country change, and the change back, keeps every credential;
//   F  document -> review request -> clarification -> the holder's answer ->
//      decision, by a reviewer with the passport_verifier role and no grant;
//   G  a selective share -> the QR code is exactly the link -> a logged-out
//      recipient sees the selection and nothing else, never a private
//      document -> the gateway form of the link opens it too, through hosted
//      Supabase's HTML restriction -> expiry, then revocation, end it;
//   S  the other choice: the Passport image itself, of the credentials the
//      holder picks, in the shared card's shields and truthful words --
//      previewed exactly as handed over: to a phone's share sheet as the PNG
//      files themselves, and to a platform as a download with the plain
//      instruction to add it, never as a pretend attachment; one credential,
//      three, and a Passport of fifteen as ONE image with nothing cut;
//      no link or QR code until the holder creates one and ticks it in, and
//      that link opens nothing once it is revoked;
//   H  another holder can read nothing of this Passport, change nothing, and
//      cannot raise their own trust, through the pages or the API;
//   B  a mixed-market holder adds all four Indian qualifications and reloads;
//   J  a Passport of fifteen, one expired, renders on the card and the wallet;
//   K  the administrator's availability answer is what the holders are offered.
//
// Runs only when E2E_LOCAL_STACK=1 and every URL is loopback. CI:
// .github/workflows/passport-public-pilot-evidence.yml, which refuses a report
// in which any of these was skipped, and uploads the screenshots.

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { test, expect, type Browser, type Download, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const DB = process.env.E2E_DB_URL ?? "";
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const MAIL = process.env.E2E_MAIL_URL ?? "";
/** "1" where Storage is served (CI's full stack). Without it the document is
 *  attached through the same RPC the upload calls, as its holder, and the
 *  test says so in its annotations; the CI verifier refuses that mode. */
const STORAGE = process.env.E2E_STORAGE === "1";
/** Hosted Supabase's HTML restriction in front of the local functions
 *  (scripts/local-hosted-functions-proxy.ts). Case G opens the gateway form of
 *  a link through it, because the local stack alone serves HTML that hosted
 *  Supabase shows as text. */
const HOSTED_FUNCTIONS = process.env.E2E_HOSTED_FUNCTIONS_URL ?? "";
/** "1" when the TLS front injects the host's analytics script into every page,
 *  as the published site's host does (scripts/local-tls-front.mjs). */
const HOST_ANALYTICS = process.env.E2E_HOST_ANALYTICS === "1";
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local walk.");
test.skip(
  !LOOPBACK.test(BASE) ||
    !LOOPBACK.test(API) ||
    !LOOPBACK.test(MAIL) ||
    !/@(127\.0\.0\.1|localhost)[:/]/.test(DB) ||
    ANON === "",
  "This spec registers and signs synthetic people in; it runs against loopback only, with the local stack's keys.",
);
test.use({ ignoreHTTPSErrors: true });
test.describe.configure({ mode: "serial", timeout: 300_000 });

const PASSWORD = "LocalJourney!2026";
const EVIDENCE = path.resolve("test-results/passport-public-pilot");
const REVIEWER = "pp-reviewer@local.test";
const ADMIN = "pp-admin@local.test";

const device = () => (test.info().project.name === "chromium" ? "desktop" : "mobile");
const who = (kind: "dubai" | "mixed" | "large") => `pp-${kind}-${device()}@local.test`;
const holderName = () => (device() === "desktop" ? "Nadia Fiktiv" : "Nadia Mobil");

function sql(text: string): string {
  return execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
    encoding: "utf8",
  }).trim();
}
const uidOf = (email: string) => sql(`select id from auth.users where email='${email}'`);
const grantsOf = (uid: string) =>
  sql(`select count(*) from public.sp_pilot_members where user_id='${uid}'`);
const activeClaim = (uid: string, code: string) =>
  sql(
    `select id from public.sp_claims where holder_user_id='${uid}' and credential_code='${code}' and lifecycle_state='active'`,
  );

/** Desktop evidence is taken at 1440; the phone project is 390 wide already. */
async function atEvidenceWidth(page: Page) {
  if (test.info().project.name === "chromium") {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
}

async function evidence(page: Page, name: string) {
  mkdirSync(EVIDENCE, { recursive: true });
  // Never a picture of a page that has not arrived: every screen this walk
  // records has a heading, and a blank one was once filed as evidence.
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
  const width = page.viewportSize()?.width ?? 0;
  // From the top, so the sticky header is drawn where a person sees it.
  await page.evaluate(() => window.scrollTo(0, 0));
  const file = `${test.info().project.name}-${width}-${name}`;
  await page.screenshot({ path: path.join(EVIDENCE, `${file}.png`), fullPage: true });
  // What a person sees first, legible at phone width.
  await page.screenshot({ path: path.join(EVIDENCE, `${file}-fold.png`) });
}

async function inLanguage(page: Page, lang: "sv" | "en") {
  await page.addInitScript((value) => localStorage.setItem("cqrityjob.lang", value), lang);
}

/** The public boundary's throttle: reads per client per five-minute window,
 *  as the application sets it. */
const PUBLIC_READS_PER_WINDOW = Number(
  /const THROTTLE_LIMIT = (\d+);/.exec(
    readFileSync("src/lib/security-passport/public-disclosure.server.ts", "utf8"),
  )?.[1],
);

/** No public read so far was refused by the throttle: a refused one is the
 *  window's read past the limit, and it would show the same "not available"
 *  page an expired or revoked link does. */
function expectNoThrottleRefusal(what: string) {
  expect(
    PUBLIC_READS_PER_WINDOW,
    "the throttle limit was read from the application",
  ).toBeGreaterThan(0);
  expect(
    Number(sql("select coalesce(max(attempts), 0) from public.sp_public_access_throttle")),
    `${what}: no public read was refused by the throttle`,
  ).toBeLessThanOrEqual(PUBLIC_READS_PER_WINDOW);
}

/** A second, independent person on the same machine: their own cookies and
 *  storage, the project's own viewport -- and their own throttle budget.
 *
 *  Someone else on their own device is a client of their own to the public
 *  throttle. Here everyone arrives from one loopback client with no
 *  X-Forwarded-For, so without this one person's reads would spend the next
 *  one's budget. A fast run then saw its last recipient refused (run
 *  36436368307: 390px case S, after both projects' G and S fell into one
 *  window). The throttle itself is unchanged, and every read before the reset
 *  is first proven to have been within it. */
async function anotherPerson(browser: Browser, lang: "sv" | "en") {
  expectNoThrottleRefusal("before another person arrives");
  sql("delete from public.sp_public_access_throttle");
  const use = test.info().project.use;
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  const page = await context.newPage();
  await inLanguage(page, lang);
  if (test.info().project.name === "chromium") {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  return { context, page };
}

/** The one door, filled in as a person fills it in. */
async function signIn(page: Page, email: string, redirect: string) {
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

const next = (page: Page) =>
  page.getByRole("button", { name: /^(Fortsätt|Continue)$/, exact: true }).click();

/** One credential through the wizard, deep-linked to its definition, as the
 *  market section links to it. Returns the saved claim's id. */
async function addCredential(
  page: Page,
  code: string,
  fill: (page: Page) => Promise<void>,
  shot?: string,
): Promise<string> {
  await page.goto(`${BASE}/passport/credentials/new?code=${code}`);
  await fillAndSave(page, fill, shot);
  return page.url().match(/claim\/([0-9a-f-]{36})/)![1];
}

async function fillAndSave(page: Page, fill: (page: Page) => Promise<void>, shot?: string) {
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-credential-territory]")).toBeVisible({ timeout: 30_000 });
  await fill(page);
  if (shot) await evidence(page, shot);
  await next(page);
  await page.getByRole("button", { name: /^(Spara merit|Save credential)$/, exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 60_000 });
}

const validUntil = (date: string) => async (page: Page) => {
  await page.getByLabel(/^(Giltig till|Valid until)$/, { exact: true }).fill(date);
};

const dubaiCard = async (p: Page) => {
  await expect(p.locator('[data-testid="market-public-pilot-status"]')).toBeVisible();
  await expect(p.getByText(/(Gäller i|Valid in): Dubai, UAE/)).toBeVisible();
  await p.locator('[data-field="authorisation-scope"]').fill("Fiktivt Security LLC");
  await validUntil("2028-01-31")(p);
};

/** The wallet's rows on /passport, once the Passport has loaded. */
async function walletRows(page: Page) {
  await expect(page.locator("[data-passport-workspace]")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/This page didn't load|Sidan kunde inte laddas/)).toHaveCount(0);
  return page.locator("[data-credential-wallet] [data-credential-row]");
}

/** The market section's offer on /passport/information, as codes. */
async function offeredCodes(page: Page, state: string) {
  await page.goto(`${BASE}/passport/information`);
  const section = page.locator('[data-testid="market-credential-section"]');
  await expect(section).toHaveAttribute("data-market-state", state, { timeout: 60_000 });
  await expect(section.locator("[data-credential-code]").first()).toBeVisible();
  const codes = await section
    .locator("[data-credential-code]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-credential-code") ?? ""));
  return [...new Set(codes)].sort();
}

/** The confirmation e-mail the stack actually sent, read from the local mail
 *  catcher (Mailpit's API; Inbucket's as a fallback for older stacks). */
async function confirmationLink(address: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const body = await readLatestMail(address);
    const link = body?.match(/https?:\/\/[^"'\s<>]+\/auth\/v1\/verify\?[^"'\s<>]+/)?.[0];
    if (link) return link.replace(/&amp;/g, "&");
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`no confirmation e-mail reached ${address}`);
}

async function readLatestMail(address: string): Promise<string | null> {
  const list = await fetch(`${MAIL}/api/v1/messages`);
  if (list.ok) {
    const { messages } = (await list.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const hit = messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === address));
    if (!hit) return null;
    const one = (await (await fetch(`${MAIL}/api/v1/message/${hit.ID}`)).json()) as {
      HTML?: string;
      Text?: string;
    };
    return `${one.HTML ?? ""}\n${one.Text ?? ""}`;
  }
  const box = address.split("@")[0];
  const legacy = await fetch(`${MAIL}/api/v1/mailbox/${box}`);
  if (!legacy.ok) return null;
  const items = (await legacy.json()) as { id: string }[];
  const last = items.at(-1);
  if (!last) return null;
  const one = (await (await fetch(`${MAIL}/api/v1/mailbox/${box}/${last.id}`)).json()) as {
    body?: { html?: string; text?: string };
  };
  return `${one.body?.html ?? ""}\n${one.body?.text ?? ""}`;
}

/** The signed-in person's own access token, as the browser holds it. */
async function accessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      if (/^sb-.*-auth-token$/.test(key)) {
        return (
          (JSON.parse(localStorage.getItem(key) ?? "{}") as { access_token?: string })
            .access_token ?? ""
        );
      }
    }
    return "";
  });
}

/** A small, real PDF. */
function pdf(label: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\n% ${label}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

/** A document on a credential: uploaded through the page where Storage is
 *  served, otherwise attached through sp_attach_evidence as its holder. */
async function attachDocument(page: Page, uid: string, claimId: string, name: string) {
  if (STORAGE) {
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name, mimeType: "application/pdf", buffer: pdf(name) });
    await expect(page.locator("[data-evidence-saved-file]")).toHaveText(name, {
      timeout: 60_000,
    });
  } else {
    const bytes = pdf(name);
    sql(`begin;
      select set_config('request.jwt.claim.sub', '${uid}', true);
      set local role authenticated;
      select public.sp_attach_evidence('${claimId}'::uuid, null, '${uid}/${randomUUID()}.pdf', '${name}', 'application/pdf', ${bytes.byteLength}, '${createHash("sha256").update(bytes).digest("hex")}');
      commit;`);
    await page.reload();
  }
  // In the holder's list of documents, after a reload too.
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 60_000 });
}

/** What a share sheet was handed: each file as a data URL, and the words. */
interface SharedRecord {
  readonly files: readonly { readonly name: string; readonly type: string; readonly png: string }[];
  readonly text: string | null;
  readonly url: string | null;
}

/** Platform pages are recorded, never followed: nothing may be posted, and
 *  the walk reaches no platform. `shareSheet` gives the page what a phone's
 *  browser has -- a share sheet that takes files -- and records the files it
 *  is handed, bytes and all. The desktop browser here has none. */
async function recordSharing(page: Page, shareSheet: boolean) {
  await page.addInitScript((sheet) => {
    const w = window as unknown as { __opened: string[]; __shared: SharedRecord[] };
    w.__opened = [];
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    }) as typeof window.open;
    if (!sheet) return;
    w.__shared = [];
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
  }, shareSheet);
}

/** Every download one action starts, once all `count` have arrived. */
async function downloadsDuring(page: Page, count: number, act: () => Promise<unknown>) {
  const got: Download[] = [];
  const onDownload = (d: Download) => got.push(d);
  page.on("download", onDownload);
  try {
    await act();
    await expect
      .poll(() => got.length, { timeout: 30_000, message: `${count} image(s) handed over` })
      .toBe(count);
  } finally {
    page.off("download", onDownload);
  }
  return got;
}

const pngOf = async (download: Download) =>
  `data:image/png;base64,${readFileSync((await download.path())!).toString("base64")}`;

/** How many pixels of a PNG differ from the image a preview shows: 0 when the
 *  file is the previewed image, -1 when it is not even its size. */
async function pixelsDiffering(
  page: Page,
  png: string,
  shown: string,
  width: number,
  height: number,
): Promise<number> {
  return page.evaluate(
    async ({ png, shown, width, height }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("image did not load"));
          img.src = src;
        });
      const [file, drawn] = await Promise.all([load(png), load(shown)]);
      if (file.naturalWidth !== width || file.naturalHeight !== height) return -1;
      const pixels = (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };
      const a = pixels(file);
      const b = pixels(drawn);
      let differing = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) differing += 1;
      }
      return differing;
    },
    { png, shown, width, height },
  );
}

test.describe("the public pilot, on a real backend", () => {
  test("A · a new person registers, confirms by e-mail and saves a Dubai credential, with no grant", async ({
    page,
  }) => {
    test.info().annotations.push({ type: "proof", description: "A (registration)" });
    const email = `pp-new-${device()}-${Date.now()}@local.test`;
    await inLanguage(page, "sv");
    await atEvidenceWidth(page);

    // Registration, with confirmation REQUIRED, as on the hosted project.
    await page.goto(`${BASE}/signup?redirect=${encodeURIComponent("/passport")}`);
    await page.getByLabel(/^Namn/).fill("Nora Ny");
    await page.getByLabel(/^E-post$/).fill(email);
    await page.getByLabel(/^Lösenord$/).fill(PASSWORD);
    await page.getByRole("button", { name: "Skapa konto", exact: true }).click();
    await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("auth-confirmation-email")).toContainText(email);
    await evidence(page, "sv-register-awaiting-confirmation");
    const uid = uidOf(email);
    expect(sql(`select email_confirmed_at is null from auth.users where id='${uid}'`)).toBe("t");

    // The link from the e-mail the stack sent, opened by the person.
    await page.goto(await confirmationLink(email));
    await page.waitForURL((url) => url.pathname.startsWith("/passport"), { timeout: 60_000 });
    expect(sql(`select email_confirmed_at is not null from auth.users where id='${uid}'`)).toBe(
      "t",
    );

    // The first run: the Passport is created by its holder, and the first
    // credential is chosen through every step of the wizard -- no deep link.
    await page.locator('[data-cta="create-passport"]').click();
    await expect(page.locator("[data-international-credential-form]")).toBeVisible({
      timeout: 60_000,
    });
    await evidence(page, "sv-register-passport-created");
    await page.getByRole("radio", { name: /^Nationellt eller regionalt/ }).check();
    await next(page);
    // Every market is offered to this new account, which holds no grant.
    const country = page.locator('select[data-filter="country"]');
    await expect(country.locator("option")).toHaveText([
      "Välj land",
      /^Sverige \(\d+\)$/,
      /^Storbritannien \(\d+\)$/,
      /^Förenade Arabemiraten \(\d+\)$/,
      /^Indien \(\d+\)$/,
    ]);
    await country.selectOption("AE");
    await page.locator('select[data-filter="region"]').selectOption("AE-DU");
    await evidence(page, "sv-register-market-choice");
    await next(page);
    await page
      .getByRole("combobox", { name: "Godkänd merit", exact: true })
      .selectOption("AE_DU_SIRA_CARD_GUARD");
    await next(page);
    await fillAndSave(page, dubaiCard, "sv-register-dubai-details");

    // Where they work, stated on the profile: Dubai's public pilot is then
    // their own market's catalogue.
    await page.goto(`${BASE}/my-career/profile`);
    const card = page.locator("[data-profile-work-country]");
    await card.locator("#sp-work-country").selectOption("AE-DU");
    await card.getByRole("button", { name: "Spara arbetsland", exact: true }).click();
    await expect(card.getByText("Dina profiluppgifter har sparats.")).toBeVisible({
      timeout: 30_000,
    });
    expect(await offeredCodes(page, "open_public_pilot")).toHaveLength(30);

    await page.goto(`${BASE}/passport`);
    const wallet = await walletRows(page);
    await expect(wallet).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator("[data-credential-wallet]")).toContainText("Dubai, UAE");
    await evidence(page, "sv-register-first-dubai-credential");

    expect(
      sql(
        `select string_agg(credential_code||':'||assertion_level, ' ') from public.sp_claims where holder_user_id='${uid}' and lifecycle_state='active'`,
      ),
    ).toBe("AE_DU_SIRA_CARD_GUARD:self_declared");
    expect(grantsOf(uid)).toBe("0");
  });

  test("A · D · E — an ordinary holder with no grant saves from every market, in Swedish", async ({
    page,
  }) => {
    test.info().annotations.push({ type: "proof", description: "A D E" });
    const email = who("dubai");
    const uid = uidOf(email);
    expect(grantsOf(uid)).toBe("0");
    expect(sql(`select count(*) from public.sp_claims where holder_user_id='${uid}'`)).toBe("0");
    await inLanguage(page, "sv");
    await atEvidenceWidth(page);
    await signIn(page, email, "/passport/information");

    // The market section: Dubai, in public pilot, three separate statements.
    await page.goto(`${BASE}/passport/information`);
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open_public_pilot", {
      timeout: 60_000,
    });
    await expect(section.locator("[data-credential-code]")).toHaveCount(30);
    const status = section.locator('[data-testid="market-public-pilot-status"]');
    await expect(status.locator("[data-public-pilot-statement]")).toHaveCount(3);
    await expect(status).toContainText("pågår");
    await expect(status).toContainText("rätt att arbeta");
    await evidence(page, "sv-information-dubai-public-pilot");

    // One form per field pattern.
    const ids: Record<string, string> = {};
    ids.du = await addCredential(
      page,
      "AE_DU_SIRA_CARD_GUARD",
      dubaiCard,
      "sv-picker-dubai-public-pilot",
    );
    ids.gb = await addCredential(page, "UK_SIA_LICENCE_DS", validUntil("2028-06-30"));
    ids.ni = await addCredential(page, "UK_SIA_LICENCE_VI", validUntil("2028-06-30"));
    ids.in = await addCredential(page, "IN_MEPSC_Q7101", async (p) => {
      await p.locator('[data-field="issuer-name"]').fill("Fiktivt Training Centre");
      const version = p.locator('[data-field="definition-version"]');
      if ((await version.count()) > 0) {
        const values = await version
          .locator("option")
          .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).filter(Boolean));
        if (values[0]) await version.selectOption(values[0]);
      }
    });
    ids.se = await addCredential(page, "VU1", async (p) => {
      await p.locator('[data-field="issuer-name"]').fill("Fiktiv Väktarskola AB");
    });
    ids.intl = await addCredential(page, "INTL_ASIS_CPP", validUntil("2029-05-01"));

    // What the database holds: six, self-declared, each under its own
    // territory, and still no grant.
    const rows = sql(
      `select string_agg(credential_code||':'||coalesce(jurisdiction_code,'-')||'/'||coalesce(sub_jurisdiction_code,'-')||':'||assertion_level, ' ' order by credential_code collate "C") from public.sp_claims where holder_user_id='${uid}' and lifecycle_state='active'`,
    );
    expect(rows).toBe(
      [
        "AE_DU_SIRA_CARD_GUARD:AE/AE-DU:self_declared",
        "INTL_ASIS_CPP:-/-:self_declared",
        "IN_MEPSC_Q7101:IN/-:self_declared",
        "UK_SIA_LICENCE_DS:GB/-:self_declared",
        "UK_SIA_LICENCE_VI:GB/GB-NI:self_declared",
        "VU1:SE/-:self_declared",
      ].join(" "),
    );
    expect(grantsOf(uid)).toBe("0");

    // E: the occupation, stated on the profile, reaches the Passport card.
    await page.goto(`${BASE}/my-career/profile`);
    await page.getByRole("button", { name: /^fyll i din profil$|^fill in your profile$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Arbetar inom säkerhetsbranschen" }).click();
    await dialog.locator("select").first().selectOption("vaktare");
    await dialog.getByRole("button", { name: /^spara$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // The Passport: six credentials, each labelled by its own market, after a
    // reload too.
    for (const pass of ["first load", "after reload"]) {
      await page.goto(`${BASE}/passport`);
      const wallet = await walletRows(page);
      await expect(wallet, pass).toHaveCount(6, { timeout: 60_000 });
      for (const id of Object.values(ids))
        await expect(
          page.locator(`[data-credential-wallet] a[href="/passport/entry/claim/${id}"]`),
          pass,
        ).toBeVisible();
      await expect(page.locator("[data-credential-wallet]")).toContainText("Dubai, UAE");
      await expect(page.locator("[data-credential-wallet]")).toContainText("Nordirland");
      await expect(page.locator("[data-credential-wallet]")).toContainText("Indien");
    }
    await expect(page.getByText("Väktare").first()).toBeVisible();
    await evidence(page, "sv-passport-four-markets");
  });

  test("A · the same holder reads it all back in English", async ({ page }) => {
    test.info().annotations.push({ type: "proof", description: "A (English)" });
    await inLanguage(page, "en");
    await atEvidenceWidth(page);
    await signIn(page, who("dubai"), "/passport");
    await page.goto(`${BASE}/passport`);
    const wallet = await walletRows(page);
    await expect(wallet).toHaveCount(6, { timeout: 60_000 });
    await expect(page.locator("[data-credential-wallet]")).toContainText("Dubai, UAE");
    await expect(page.locator("[data-credential-wallet]")).toContainText("Northern Ireland");
    await evidence(page, "en-passport-four-markets");

    await page.goto(`${BASE}/passport/information`);
    const section = page.locator('[data-testid="market-credential-section"]');
    await expect(section).toHaveAttribute("data-market-state", "open_public_pilot", {
      timeout: 60_000,
    });
    await expect(section.locator('[data-testid="market-public-pilot-status"]')).toContainText(
      "permission to work",
    );
    await evidence(page, "en-information-dubai-public-pilot");
  });

  test("I · a work-country change, and the change back, keeps every credential", async ({
    page,
  }) => {
    test.info().annotations.push({ type: "proof", description: "I" });
    const uid = uidOf(who("dubai"));
    const held = () =>
      sql(
        `select string_agg(id::text, ' ' order by id) from public.sp_claims where holder_user_id='${uid}' and lifecycle_state='active'`,
      );
    const location = () =>
      sql(
        `select jurisdiction_code||'/'||coalesce(sub_jurisdiction_code,'-') from public.sp_passport_profiles where holder_user_id='${uid}'`,
      );
    const before = held();
    expect(before.split(" ")).toHaveLength(6);
    await inLanguage(page, "sv");
    await atEvidenceWidth(page);
    await signIn(page, who("dubai"), "/my-career/profile");

    const setCountry = async (value: string) => {
      await page.goto(`${BASE}/my-career/profile`);
      const card = page.locator("[data-profile-work-country]");
      await card.locator("#sp-work-country").selectOption(value);
      await card.getByRole("button", { name: "Spara arbetsland", exact: true }).click();
      await expect(card.getByText("Dina profiluppgifter har sparats.")).toBeVisible({
        timeout: 30_000,
      });
    };

    await setCountry("SE");
    expect(location()).toBe("SE/-");
    expect(held()).toBe(before);
    await page.goto(`${BASE}/passport`);
    await expect(await walletRows(page)).toHaveCount(6, { timeout: 60_000 });
    await expect(page.locator("[data-credential-wallet]")).toContainText("Dubai, UAE");
    await expect(page.locator("[data-credential-wallet]")).toContainText("Nordirland");
    await evidence(page, "sv-passport-after-move-to-sweden");
    expect(await offeredCodes(page, "open")).toContain("VU1");

    await setCountry("AE-DU");
    expect(location()).toBe("AE/AE-DU");
    expect(held()).toBe(before);
    expect(await offeredCodes(page, "open_public_pilot")).toHaveLength(30);
  });

  test("F · document, review request, clarification, the holder's answer and the decision, by a reviewer with no grant", async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: "proof", description: "F" });
    test.info().annotations.push({
      type: "evidence-upload",
      description: STORAGE ? "storage" : "rpc-attached",
    });
    const uid = uidOf(who("dubai"));
    const reviewer = uidOf(REVIEWER);
    expect(
      sql(`select string_agg(role::text, ',') from public.user_roles where user_id='${reviewer}'`),
    ).toBe("passport_verifier");
    expect(grantsOf(reviewer)).toBe("0");
    const claim = activeClaim(uid, "AE_DU_SIRA_CARD_GUARD");

    await inLanguage(page, "sv");
    await atEvidenceWidth(page);
    await signIn(page, who("dubai"), `/passport/entry/claim/${claim}`);

    // The holder cannot open the review workspace.
    await page.goto(`${BASE}/passport-review`);
    await expect(
      page.getByRole("heading", { name: "Du har inte behörighet att granska pass" }),
    ).toBeVisible({ timeout: 60_000 });

    // A document, then the request.
    await page.goto(`${BASE}/passport/entry/claim/${claim}`);
    await attachDocument(page, uid, claim, "sira-kort-framsida.pdf");
    await page.getByRole("button", { name: "Begär verifiering", exact: true }).click();
    await expect(page.getByText("Under granskning").first()).toBeVisible({ timeout: 60_000 });
    await evidence(page, "sv-review-requested");

    // The reviewer, in a session of their own, asks for more.
    const { context, page: rp } = await anotherPerson(browser, "sv");
    try {
      await signIn(rp, REVIEWER, "/passport-review");
      const openItem = async () => {
        await rp.goto(`${BASE}/passport-review`);
        const li = rp
          .locator("li")
          .filter({ hasText: holderName() })
          .filter({ has: rp.getByRole("button", { name: "Öppna ärendet" }) });
        await expect(li).toHaveCount(1, { timeout: 60_000 });
        await li.getByRole("button", { name: "Öppna ärendet" }).click();
        await expect(li.locator('input[name="sp-decision"]').first()).toBeVisible({
          timeout: 60_000,
        });
        return li;
      };
      let li = await openItem();
      await expect(li).toContainText("SIRA Security Cadre Card");
      // The queue names the credential's own territory, not only its country.
      await expect(li).toContainText("Dubai, UAE");
      await li.locator('input[name="sp-decision"][value="clarification_requested"]').check();
      await li
        .locator("#sp-holder-message")
        .fill("Ladda upp kortets baksida, där giltighetstiden syns.");
      rp.once("dialog", (d) => void d.accept());
      await li.getByRole("button", { name: "Ja, spara beslutet", exact: true }).click();
      await expect(rp.getByText("Beslutet är sparat.")).toBeVisible({ timeout: 60_000 });

      // The holder reads what is needed, and answers with the document.
      await page.goto(`${BASE}/passport/entry/claim/${claim}`);
      await expect(
        page.getByText("Mer information behövs innan uppgiften kan verifieras"),
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        page.getByText("Ladda upp kortets baksida, där giltighetstiden syns."),
      ).toBeVisible();
      await attachDocument(page, uid, claim, "sira-kort-baksida.pdf");
      await evidence(page, "sv-review-clarification-answered");

      // The reviewer sees both documents and decides.
      li = await openItem();
      await expect(li).toContainText(/Underlag:\s*2/);
      await li.locator('input[name="sp-decision"][value="approved"]').check();
      await li.locator("#sp-valid-until").fill("2028-01-31");
      await evidence(rp, "sv-review-decision");
      rp.once("dialog", (d) => void d.accept());
      await li.getByRole("button", { name: "Ja, spara beslutet", exact: true }).click();
      await expect(rp.getByText("Beslutet är sparat.")).toBeVisible({ timeout: 60_000 });
    } finally {
      await context.close();
    }

    // The record: decided by the reviewer, approved, and no grant anywhere.
    expect(
      sql(
        `select status||':'||(decided_by='${reviewer}') from public.sp_verification_requests where holder_user_id='${uid}' order by submitted_at desc limit 1`,
      ),
    ).toBe("approved:true");
    expect(grantsOf(uid)).toBe("0");
    const now = activeClaim(uid, "AE_DU_SIRA_CARD_GUARD");
    expect(sql(`select assertion_level from public.sp_claims where id='${now}'`)).not.toBe(
      "self_declared",
    );
    await page.goto(`${BASE}/passport/entry/claim/${now}`);
    // The decision as the holder reads it, waited for first: on a page that
    // has not rendered, the absence below would hold for the wrong reason.
    await expect(page.getByText("Godkänd").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Mer information behövs")).toHaveCount(0);
    await evidence(page, "sv-review-approved");
  });

  test("G · a selective share opens from its QR code for a logged-out recipient; expiry and revocation end it", async ({
    page,
    browser,
    request,
  }) => {
    test.info().annotations.push({ type: "proof", description: "G" });
    // Both stand-ins for the hosted platform are required. Without them a
    // share can pass here and fail for every real recipient, as the gateway
    // page once did.
    expect(
      HOSTED_FUNCTIONS,
      "E2E_HOSTED_FUNCTIONS_URL: the gateway link is opened through scripts/local-hosted-functions-proxy.ts",
    ).toMatch(LOOPBACK);
    expect(
      HOST_ANALYTICS,
      "E2E_HOST_ANALYTICS=1: the TLS front emulates the host's analytics",
    ).toBe(true);
    test.info().annotations.push({
      type: "share-hosting",
      description: "hosted-html-restriction+host-analytics",
    });
    const uid = uidOf(who("dubai"));
    const du = activeClaim(uid, "AE_DU_SIRA_CARD_GUARD");
    const ind = activeClaim(uid, "IN_MEPSC_Q7101");
    const vu1 = activeClaim(uid, "VU1");
    // The holder's private documents, from case F: none may reach a recipient.
    const documents = sql(
      `select string_agg(file_name||'|'||storage_path, ',' order by file_name) from public.sp_evidence where holder_user_id='${uid}'`,
    )
      .split(",")
      .filter(Boolean)
      .map((row) => {
        const [name = "", storagePath = ""] = row.split("|");
        return { name, storagePath };
      });
    expect(documents.map((d) => d.name)).toEqual(
      expect.arrayContaining(["sira-kort-baksida.pdf", "sira-kort-framsida.pdf"]),
    );
    const unselected = ["Väktarutbildning 1", "Door Supervision", "Fiktivt Security LLC"];

    await inLanguage(page, "en");
    await atEvidenceWidth(page);
    await signIn(page, who("dubai"), "/passport/share");

    await page.goto(`${BASE}/passport/share`);
    await page.locator('[data-share-choice="link"]').click();
    await page.locator(`[data-merit-option="claim:${du}"] input[type="checkbox"]`).check();
    await page.locator(`[data-merit-option="claim:${ind}"] input[type="checkbox"]`).check();
    await expect(
      page.locator(`[data-merit-option="claim:${vu1}"] input[type="checkbox"]`),
    ).not.toBeChecked();
    await page.locator('input[name="sel-expiry"][value="7"]').check();
    await page.locator("[data-share-cta]").click();
    await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 60_000 });
    const link = await page.locator("[data-share-link]").inputValue();

    // The link: the application's own domain, with the token in the
    // fragment only.
    const url = new URL(link);
    const app = new URL(BASE).origin;
    expect(url.origin).toBe(app);
    expect(url.pathname).toBe("/p");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#[0-9a-f]{64}$/);
    expect(link).not.toContain(uid);
    const token = url.hash.slice(1);
    const openUrl = `${app}/p/open`;

    // What `GET /p` answers: the application's own entry page, served as a
    // document. Its policy lets only its own script run -- not the host's
    // analytics, which the front injected into it as the host does -- lets its
    // form post only here and connects nowhere. It is private, unindexed and
    // sends no Referer.
    const entry = await request.get(`${BASE}/p`, { maxRedirects: 0, ignoreHTTPSErrors: true });
    expect(entry.status()).toBe(200);
    const entryHeaders = entry.headers();
    expect(entryHeaders["content-type"]).toBe("text/html; charset=utf-8");
    const policy = Object.fromEntries(
      (entryHeaders["content-security-policy"] ?? "").split(";").map((directive) => {
        const [name = "", ...values] = directive.trim().split(/\s+/);
        return [name, values.join(" ")];
      }),
    );
    const nonce = /^'nonce-([0-9a-f]{32})'$/.exec(policy["script-src"] ?? "")?.[1] ?? "";
    expect(nonce, `script-src: ${policy["script-src"]}`).not.toBe("");
    expect(policy).toEqual({
      "default-src": "'none'",
      "script-src": `'nonce-${nonce}'`,
      "style-src": `'nonce-${nonce}'`,
      "form-action": "'self'",
      "base-uri": "'none'",
      "frame-ancestors": "'none'",
    });
    expect(entryHeaders["cache-control"]).toBe("private, no-store");
    expect(entryHeaders["referrer-policy"]).toBe("no-referrer");
    expect(entryHeaders["x-robots-tag"]).toContain("noindex");
    expect(entryHeaders["x-content-type-options"]).toBe("nosniff");
    const entryHtml = await entry.text();
    expect(entryHtml).toContain(`<script nonce="${nonce}">`);
    expect(entryHtml, "the host's analytics tag, injected as the host does").toContain(
      'src="/~flock.js"',
    );
    const again = await request.get(`${BASE}/p`, { maxRedirects: 0, ignoreHTTPSErrors: true });
    expect(again.headers()["content-security-policy"]).not.toContain(nonce);

    // The QR code is exactly this link, module for module.
    const qr = page.getByRole("img", { name: "QR code for your selected disclosure" });
    await expect(qr).toBeVisible();
    const expected = QRCode.create(link, { errorCorrectionLevel: "M" }).modules;
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
    expect(drawn).toEqual(Array.from(expected.data, (v) => (v ? 1 : 0)));
    await evidence(page, "en-share-created");

    // A recipient with no account opens what the QR code opens. Every request
    // their browser sends is recorded, with the document that sent it and
    // whether the browser refused it, and every server-function answer they
    // receive is kept.
    const { context, page: recipient } = await anotherPerson(browser, "en");
    const sent: {
      method: string;
      url: string;
      referer: string;
      body: string;
      type: string;
      /** The document that sent it: the latest navigation before it. A
       *  frame's URL can lag behind a navigation, so it is not used. */
      from: string;
      /** Why the browser did not send it, e.g. "csp". */
      failure: string | null;
    }[] = [];
    const recorded = new Map<unknown, (typeof sent)[number]>();
    let documentPath = "";
    recipient.on("request", (r) => {
      if (r.isNavigationRequest()) documentPath = new URL(r.url()).pathname;
      const entry = {
        method: r.method(),
        url: r.url(),
        referer: r.headers()["referer"] ?? "",
        body: r.postData() ?? "",
        type: r.resourceType(),
        from: documentPath,
        failure: null,
      };
      recorded.set(r, entry);
      sent.push(entry);
    });
    recipient.on("requestfailed", (r) => {
      const entry = recorded.get(r);
      if (entry) entry.failure = r.failure()?.errorText ?? "failed";
    });
    const answers: Promise<string>[] = [];
    recipient.on("response", (r) => {
      if (new URL(r.url()).pathname.startsWith("/_serverFn")) {
        answers.push(r.text().catch(() => ""));
      }
    });
    const pathOf = (address: string) =>
      address.includes("://") ? new URL(address).pathname : address;
    const analyticsHits = () =>
      sent.filter((r) => r.method === "POST" && pathOf(r.url) === "/~api/analytics");
    try {
      await recipient.goto(link);
      await expect(recipient).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 60_000 });
      const main = recipient.locator("main");
      await expect(main).toContainText("SIRA Security Cadre Card — Security Guard", {
        timeout: 60_000,
      });
      await expect(main).toContainText("Dubai, UAE");
      await expect(main).toContainText("Security Guard (MEP/Q7101)");
      for (const text of unselected) await expect(main).not.toContainText(text);
      for (const d of documents) await expect(main).not.toContainText(d.name);
      // A rendered page, not its source shown as text.
      expect(await recipient.evaluate(() => document.contentType)).toBe("text/html");
      await expect(recipient.locator("body")).not.toContainText("<!doctype");
      expect(new URL(recipient.url()).hash).toBe("");
      expect(
        await recipient.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await evidence(recipient, "en-share-recipient");

      // The host's analytics ran on the recipient's page and reported it.
      await expect.poll(() => analyticsHits().length, { timeout: 15_000 }).toBeGreaterThan(0);

      expect(
        sent.filter((r) => r.method === "GET" && r.url === `${app}/p`).length,
        "the recipient entered at the application's /p",
      ).toBe(1);
      expect(
        sent.filter((r) => r.body.includes(token)).map((r) => `${r.method} ${r.url}`),
        "the token left the browser once, in the body of the exchange",
      ).toEqual([`POST ${openUrl}`]);
      // The host's script was injected into the entry page -- and the entry
      // page's policy refused every script it tried to load, before anything
      // was fetched.
      const entryScripts = sent.filter((r) => r.type === "script" && r.from === "/p");
      expect(
        entryScripts.map((r) => r.url),
        "the host's analytics script was injected into /p, as the host injects it",
      ).toContain(`${app}/~flock.js`);
      expect(
        entryScripts.map((r) => `${r.url} ${r.failure}`),
        "and /p ran no script but its own: each was refused by its policy",
      ).toEqual(entryScripts.map((r) => `${r.url} csp`));
      for (const r of sent) {
        expect(r.url, `request URL ${r.method}`).not.toContain(token);
        expect(r.referer, `Referer of ${r.method} ${pathOf(r.url)}`).not.toContain(token);
      }
      for (const hit of analyticsHits()) expect(hit.body).not.toContain(token);

      // Selective disclosure in what the server sent, not only in what was drawn.
      const served = await Promise.all(answers);
      expect(served.length, "the recipient's page read the share").toBeGreaterThan(0);
      for (const body of served) {
        for (const text of unselected) expect(body).not.toContain(text);
        for (const d of documents) {
          expect(body).not.toContain(d.name);
          expect(body).not.toContain(d.storagePath);
        }
        expect(body).not.toContain(token);
      }
      // The documents themselves: out of reach without the holder's session.
      if (STORAGE) {
        for (const d of documents) {
          for (const at of ["", "public/", "authenticated/"]) {
            const r = await request.get(
              `${API}/storage/v1/object/${at}passport-evidence/${d.storagePath}`,
              { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
            );
            expect(r.status(), `anonymous ${at || "direct/"} read of a private document`).toBe(400);
          }
        }
      }

      // A link issued before this entry existed -- the gateway form, at the
      // Supabase functions address -- opened through hosted Supabase's HTML
      // restriction. The function answers with a redirect the restriction
      // leaves untouched, and the browser carries the fragment on to /p.
      const gateway = `${HOSTED_FUNCTIONS.replace(/\/+$/, "")}/functions/v1/passport-share`;
      const hop = await request.get(gateway, { maxRedirects: 0 });
      expect(hop.status()).toBe(302);
      expect(hop.headers()["location"]).toBe(`${app}/p`);
      expect(hop.headers()["content-type"] ?? "").not.toContain("html");
      expect((await hop.body()).byteLength).toBe(0);
      const earlier = await anotherPerson(browser, "sv");
      const earlierSent: string[] = [];
      earlier.page.on("request", (r) =>
        earlierSent.push(`${r.method()} ${r.url()} ${r.headers()["referer"] ?? ""}`),
      );
      try {
        await earlier.page.goto(`${gateway}#${token}`);
        await expect(earlier.page).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 60_000 });
        const theirs = earlier.page.locator("main");
        await expect(theirs).toContainText("SIRA Security Cadre Card — Security Guard", {
          timeout: 60_000,
        });
        for (const text of unselected) await expect(theirs).not.toContainText(text);
        expect(new URL(earlier.page.url()).hash).toBe("");
        await evidence(earlier.page, "sv-share-recipient-gateway-link");
        for (const line of earlierSent) expect(line).not.toContain(token);
      } finally {
        await earlier.context.close();
      }

      // Expiry. The share's end moved into the past: the open tab stops on its
      // next read, and the link opened afresh opens nothing.
      const share = sql(
        `select id from public.sp_disclosures where holder_user_id='${uid}' order by created_at desc limit 1`,
      );
      const ends = sql(`select expires_at from public.sp_disclosures where id='${share}'`);
      sql(
        `update public.sp_disclosures set expires_at = created_at + interval '1 second' where id='${share}'`,
      );
      try {
        await recipient.reload();
        await expect(recipient.locator("main")).toContainText("The link may have expired", {
          timeout: 60_000,
        });
        await expect(recipient.locator("main")).not.toContainText("SIRA Security Cadre Card");
        await evidence(recipient, "en-share-expired");
        const late = await anotherPerson(browser, "en");
        try {
          await late.page.goto(link);
          await expect(late.page).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 60_000 });
          await expect(late.page.locator("main")).toContainText("The link may have expired", {
            timeout: 60_000,
          });
          await expect(late.page.locator("main")).not.toContainText("SIRA Security Cadre Card");
        } finally {
          await late.context.close();
        }
      } finally {
        sql(`update public.sp_disclosures set expires_at = '${ends}' where id='${share}'`);
      }
      // The end restored, the same tab reads the share again: expiry, and
      // nothing else, is what closed it.
      await recipient.reload();
      await expect(recipient.locator("main")).toContainText(
        "SIRA Security Cadre Card — Security Guard",
        { timeout: 60_000 },
      );

      // Revocation, and the same recipient reloads.
      await page.goto(`${BASE}/passport/share`);
      await page.locator(`[data-share-revoke="${share}"]`).click();
      await expect(page.locator(`[data-share-row="${share}"]`)).toHaveAttribute(
        "data-share-state",
        "revoked",
        { timeout: 60_000 },
      );
      await recipient.reload();
      await expect(recipient.locator("main")).not.toContainText("SIRA Security Cadre Card", {
        timeout: 60_000,
      });
      await expect(recipient.locator("main")).toContainText("The link may have expired");
      await evidence(recipient, "en-share-revoked");
      // And the link itself, opened again from the start, opens nothing: the
      // exchange refuses it, and the recipient lands on the same "not
      // available" page as any other link that cannot be opened.
      await recipient.goto(link);
      await expect(recipient).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 60_000 });
      await expect(recipient.locator("main")).toContainText("The link may have expired", {
        timeout: 60_000,
      });
      await expect(recipient.locator("main")).not.toContainText("SIRA Security Cadre Card");
      expect(new URL(recipient.url()).hash).toBe("");
      for (const r of sent) {
        expect(r.url, `request URL ${r.method}`).not.toContain(token);
        expect(r.referer, `Referer of ${r.method} ${pathOf(r.url)}`).not.toContain(token);
        if (r.body.includes(token)) expect(`${r.method} ${r.url}`).toBe(`POST ${openUrl}`);
      }
      // Every "not available" above was the expiry or the revocation.
      expectNoThrottleRefusal("case G");
    } finally {
      await context.close();
    }
  });

  test("S · social sharing: the Passport image itself goes to the post, a selection of any size is shared, and a link only on purpose", async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: "proof", description: "S" });
    const phone = device() === "mobile";
    const uid = uidOf(who("dubai"));
    const du = activeClaim(uid, "AE_DU_SIRA_CARD_GUARD");
    const ind = activeClaim(uid, "IN_MEPSC_Q7101");
    const vu1 = activeClaim(uid, "VU1");
    const documents = sql(
      `select string_agg(file_name, ',') from public.sp_evidence where holder_user_id='${uid}'`,
    )
      .split(",")
      .filter(Boolean);
    const neverOnTheImage = [
      "Väktarutbildning",
      "Fiktivt Security LLC",
      "2028",
      uid,
      "/p#",
      ...documents,
    ];
    // Every link a holder has, so one made along the way would show.
    const linksOf = (holder: string) =>
      Number(sql(`select count(*) from public.sp_disclosures where holder_user_id='${holder}'`));
    const linksBefore = linksOf(uid);

    await recordSharing(page, phone);
    await inLanguage(page, "sv");
    await atEvidenceWidth(page);
    await signIn(page, who("dubai"), "/passport/share");
    await page.goto(`${BASE}/passport/share`);

    // The two choices, and the link flow is where it always was.
    await expect(page.locator("[data-share-choice]")).toHaveCount(2, { timeout: 60_000 });
    await expect(page.locator('[data-share-choice="link"]')).toContainText("Dela via länk");
    await expect(page.locator('[data-share-choice="social"]')).toContainText(
      "Dela på sociala medier",
    );
    await evidence(page, "sv-share-choices");
    await page.locator('[data-share-choice="social"]').click();
    const flow = page.locator("[data-social-flow]");
    await expect(flow).toBeVisible();

    // Credentials only -- an image never names an employer -- chosen by the
    // holder, nothing ticked for them.
    await expect(flow.locator('[data-merit-option^="experience:"]')).toHaveCount(0);
    await expect(flow.locator('input[type="checkbox"]:checked')).toHaveCount(0);

    const preview = (format: string) => flow.locator(`[data-social-preview="${format}"]`);
    const srcOf = async (format: string) => (await preview(format).getAttribute("src")) ?? "";
    const svgOf = async (format: string) =>
      decodeURIComponent((await srcOf(format)).replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
    const words = (svg: string) =>
      [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? "").join("\n");
    const shields = async (format: string) =>
      ((await svgOf(format)).match(/data-shield-mark=/g) ?? []).length;
    const opened = () =>
      page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
    const handedToSheet = () =>
      page.evaluate(() => (window as unknown as { __shared?: SharedRecord[] }).__shared ?? []);
    const ready = flow.locator('[data-social-notice="added_by_holder"]');
    const prepared = () =>
      expect(flow.locator("[data-social-download]")).toBeEnabled({ timeout: 60_000 });

    // ── One credential: one image, handed over as the PNG itself ─────────
    await flow.locator(`[data-merit-option="claim:${du}"] input`).check();
    await expect(preview("square")).toBeVisible({ timeout: 60_000 });
    await expect(flow.locator("[data-social-passport]")).toHaveCount(1);
    expect(await svgOf("square"), "one image claims no place in a set").not.toContain(
      "data-social-page",
    );
    await prepared();
    if (phone) {
      // A phone that can share files is offered its share sheet first, and the
      // sheet is given the PNG file itself -- the previewed image, pixel for
      // pixel -- with the post's sentence and no link.
      await flow.locator("[data-social-device]").click();
      await expect(flow.locator('[data-social-notice="attached"]')).toHaveText(
        "Bilden finns nu i appen du valde. Slutför inlägget där.",
      );
      const sheets = await handedToSheet();
      expect(sheets).toHaveLength(1);
      expect(sheets[0]!.files.map((f) => `${f.name} ${f.type}`)).toEqual([
        "cqrityjob-passport-square.png image/png",
      ]);
      expect(sheets[0]!.text).toBe("Mitt Security Passport från CQrityjob.");
      expect(sheets[0]!.url, "no link unless the holder chose one").toBeNull();
      expect(
        await pixelsDiffering(page, sheets[0]!.files[0]!.png, await srcOf("square"), 1080, 1080),
        "the share sheet was handed the previewed image",
      ).toBe(0);
    } else {
      // A browser with no share sheet for files is not offered one.
      await expect(flow.locator("[data-social-device]")).toHaveCount(0);
    }
    await evidence(page, "sv-social-one");

    // ── What the image draws, in the shared card's vocabulary ────────────
    await flow.locator(`[data-merit-option="claim:${ind}"] input`).check();
    await expect(flow.locator(`[data-merit-option="claim:${vu1}"] input`)).not.toBeChecked();
    await expect.poll(() => shields("square"), { timeout: 60_000 }).toBe(2);
    await expect(preview("square")).toHaveAttribute("data-social-link", "none");
    await expect(flow.locator('[data-social-link-state="none"]')).toBeVisible();
    let svg = await svgOf("square");
    expect(svg).toContain('data-shield-mark="documented"');
    expect(svg).toContain('data-flag="AE"');
    let text = words(svg);
    expect(text).toContain("SIRA");
    // The place is the GROUP heading now, once per scope: a Dubai cadre card
    // sits under Dubai, never flattened into the UAE, and the Indian
    // qualification under its own heading.
    expect(text).toContain("DUBAI, UAE");
    expect(text).toContain("INDIEN");
    // Each shield is drawn inside its own scope's group. The shield carries the
    // payload's presentation key, never the claim id, so the group is matched
    // by scope alone.
    expect(svg).toMatch(/data-passport-shield="[^"]+" data-passport-group="jurisdiction:AE-DU"/);
    expect(svg).toMatch(/data-passport-shield="[^"]+" data-passport-group="jurisdiction:IN"/);
    expect(text).toContain("DOKUMENTERAD");
    expect(text, "nothing is called verified that is not").not.toMatch(/KÄLLBEKRÄFTAD|VERIFIERAD/);
    expect(text).toContain("En ögonblicksbild.");
    for (const absent of neverOnTheImage) expect(svg).not.toContain(absent);
    expect(svg, "no QR code without a link").not.toContain("<image");
    await evidence(page, "sv-social-preview");

    // The download is the preview: the same SVG, rasterised, pixel for pixel.
    const downloadMatches = async (format: string, width: number, height: number) => {
      await prepared();
      const [file] = await downloadsDuring(page, 1, () =>
        flow.locator("[data-social-download]").click(),
      );
      expect(file!.suggestedFilename()).toBe(`cqrityjob-passport-${format}.png`);
      expect(
        await pixelsDiffering(page, await pngOf(file!), await srcOf(format), width, height),
        `${format}: the downloaded PNG is the previewed image`,
      ).toBe(0);
    };
    await downloadMatches("square", 1080, 1080);

    await flow.locator('[data-social-format="og"]').click();
    await expect(preview("og")).toBeVisible();
    await downloadMatches("og", 1200, 630);

    // Instagram has no web publishing: its button switches the preview to the
    // Story image, hands exactly that over, opens nothing, and says where it
    // goes.
    const openedBeforeStory = (await opened()).length;
    const [story] = await downloadsDuring(page, 1, () =>
      flow.locator('[data-social-channel="instagram"]').click(),
    );
    await expect(preview("story")).toBeVisible();
    expect(story!.suggestedFilename()).toBe("cqrityjob-passport-story.png");
    expect(
      await pixelsDiffering(page, await pngOf(story!), await srcOf("story"), 1080, 1920),
      "the Story image handed over is the previewed one",
    ).toBe(0);
    await expect(ready).toHaveText(
      "Din Security Passport-bild är klar i Story-format. Lägg upp den från Instagram-appen.",
    );
    expect(await opened()).toHaveLength(openedBeforeStory);
    await evidence(page, "sv-social-story");

    // ── Three: still one image, and each platform is handed it ───────────
    await flow.locator('[data-social-format="square"]').click();
    await flow.locator(`[data-merit-option="claim:${vu1}"] input`).check();
    await expect.poll(() => shields("square"), { timeout: 60_000 }).toBe(3);
    await expect(flow.locator("[data-social-passport]")).toHaveCount(1);
    const platforms = [
      ["linkedin", /^https:\/\/www\.linkedin\.com\/feed\/$/],
      ["x", /^https:\/\/twitter\.com\/intent\/tweet\?text=[^&]+$/],
      ["whatsapp", /^https:\/\/wa\.me\/\?text=[^&]+$/],
    ] as const;
    for (const [channel, address] of platforms) {
      await prepared();
      const before = (await opened()).length;
      const [file] = await downloadsDuring(page, 1, () =>
        flow.locator(`[data-social-channel="${channel}"]`).click(),
      );
      expect(file!.suggestedFilename()).toBe("cqrityjob-passport-square.png");
      expect(
        await pixelsDiffering(page, await pngOf(file!), await srcOf("square"), 1080, 1080),
        `${channel}: the image handed over is the previewed one`,
      ).toBe(0);
      const urls = await opened();
      expect(urls).toHaveLength(before + 1);
      expect(urls.at(-1)).toMatch(address);
      // What reaches the platform is its own page: no web address can carry
      // a file, and the holder is told to add the image, not that it went.
      await expect(ready).toHaveText(
        "Din Security Passport-bild är klar. Lägg till bilden i ditt inlägg.",
      );
    }
    await expect(flow.locator('[data-social-channel="copy_link"]')).toHaveCount(0);
    for (const url of await opened()) expect(url).not.toMatch(/url=|%2Fp%23|\/p#|data:|\.png/);
    await evidence(page, "sv-social-three-ready");

    // No link was made along the way: not by a preview, a share sheet, a
    // download or a platform button.
    expect(linksOf(uid), "sharing the image created no link").toBe(linksBefore);
    for (const sheet of await handedToSheet()) expect(sheet.url).toBeNull();

    // ── A link only on purpose ────────────────────────────────────────────
    // For exactly the two credentials the recipient is checked against below:
    // created for this selection, not drawn until the holder ticks it, and
    // then drawn in the preview before anything is handed over.
    await flow.locator(`[data-merit-option="claim:${vu1}"] input`).uncheck();
    await expect.poll(() => shields("square"), { timeout: 60_000 }).toBe(2);
    await flow.locator("[data-social-more] > summary").click();
    await flow.locator("[data-social-link-create]").click();
    const linkField = flow.locator("[data-social-link-field]");
    await expect(linkField).toBeVisible({ timeout: 60_000 });
    const link = await linkField.inputValue();
    expect(new URL(link).pathname).toBe("/p");
    expect(new URL(link).hash).toMatch(/^#[0-9a-f]{64}$/);
    expect(linksOf(uid), "one link: the one the holder created").toBe(linksBefore + 1);
    await expect(preview("square")).toHaveAttribute("data-social-link", "none");
    expect(await svgOf("square")).not.toContain(link.slice(-64));
    await flow.locator("[data-social-link-include]").check();
    await expect(preview("square")).toHaveAttribute("data-social-link", "included", {
      timeout: 30_000,
    });
    await expect(flow.locator('[data-social-link-state="included"]')).toBeVisible();
    // The QR code is drawn once it has been generated; the download waits
    // for it too.
    await expect
      .poll(async () => (await svgOf("square")).includes("<image"), {
        timeout: 30_000,
      })
      .toBe(true);
    svg = await svgOf("square");
    text = words(svg);
    expect(text.replace(/\n/g, "")).toContain(link);
    expect(text).toContain("Kontrollera aktuell status hos CQrityjob");
    // The QR code drawn into the image is exactly the link, module for module.
    const qrHref = /<image\b[^>]*href="(data:image\/png;base64,[^"]+)"/.exec(svg)?.[1] ?? "";
    expect(qrHref).not.toBe("");
    const expected = QRCode.create(link, { errorCorrectionLevel: "M" }).modules;
    const drawn = await page.evaluate(
      async ({ href, size }) => {
        const img = new Image();
        img.src = href;
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
      },
      { href: qrHref, size: expected.size },
    );
    expect(drawn).toEqual(Array.from(expected.data, (v) => (v ? 1 : 0)));
    await downloadMatches("square", 1080, 1080);
    await downloadsDuring(page, 1, () => flow.locator('[data-social-channel="x"]').click());
    expect((await opened()).at(-1)).toContain(`url=${encodeURIComponent(link)}`);
    if (phone) {
      await flow.locator("[data-social-device]").click();
      await expect.poll(async () => (await handedToSheet()).length).toBe(2);
      expect((await handedToSheet())[1]!.url, "the chosen link goes with the image").toBe(link);
    }
    await evidence(page, "sv-social-link-included");

    // The link opens exactly what the image shows, for anyone who scans it.
    const { context, page: recipient } = await anotherPerson(browser, "en");
    try {
      await recipient.goto(link);
      await expect(recipient).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 60_000 });
      const main = recipient.locator("main");
      await expect(main).toContainText("SIRA Security Cadre Card — Security Guard", {
        timeout: 60_000,
      });
      await expect(main).toContainText("Security Guard (MEP/Q7101)");
      await expect(main).not.toContainText("Väktarutbildning 1");
      for (const d of documents) await expect(main).not.toContainText(d);
      expectNoThrottleRefusal("case S");
    } finally {
      await context.close();
    }

    // Revocable where every link is -- and then it opens nothing.
    const share = sql(
      `select id from public.sp_disclosures where holder_user_id='${uid}' order by created_at desc limit 1`,
    );
    await page.locator(`[data-share-revoke="${share}"]`).click();
    await expect(page.locator(`[data-share-row="${share}"]`)).toHaveAttribute(
      "data-share-state",
      "revoked",
      { timeout: 60_000 },
    );
    const late = await anotherPerson(browser, "en");
    try {
      await late.page.goto(link);
      await expect(late.page.locator("main")).toContainText("The link may have expired", {
        timeout: 60_000,
      });
      await expect(late.page.locator("main")).not.toContainText("SIRA Security Cadre Card");
    } finally {
      await late.context.close();
    }

    // ── More than three: a Passport of fifteen, shared as ONE image ───────
    // Nothing is blocked and nothing selected is dropped: every credential
    // valid today is on the one image, grouped by where it applies, and that
    // one image is handed over as previewed. No set, no "1 / 2".
    const large = await anotherPerson(browser, "en");
    try {
      const lp = large.page;
      const largeUid = uidOf(who("large"));
      const largeLinks = linksOf(largeUid);
      await recordSharing(lp, phone);
      await signIn(lp, who("large"), "/passport/share");
      await lp.goto(`${BASE}/passport/share`);
      await lp.locator('[data-share-choice="social"]').click({ timeout: 60_000 });
      const one = lp.locator("[data-social-flow]");
      const boxes = one.locator('[data-merit-option^="claim:"] input');
      await expect(boxes).toHaveCount(15, { timeout: 60_000 });
      for (const box of await boxes.all()) await box.check();
      await expect(one.locator('[data-merit-option^="claim:"] input:checked')).toHaveCount(15);
      await expect(one.locator('[data-merit-option^="claim:"] input:disabled')).toHaveCount(0);
      const current = Number(
        sql(
          `select count(*) from public.sp_claims where holder_user_id='${largeUid}' and lifecycle_state='active' and (valid_until is null or valid_until >= current_date)`,
        ),
      );
      expect(current, "more than three current credentials").toBeGreaterThan(3);
      await expect(one.locator("[data-social-passport]")).toHaveCount(1, { timeout: 60_000 });
      await expect(one.locator("[data-passport-one]")).toHaveText(
        `All ${current} selected credentials are shown in one Security Passport, grouped by area.`,
      );
      await expect(one.locator("[data-social-download]")).toBeEnabled({ timeout: 60_000 });
      const shown = async () =>
        (await one.locator('[data-social-preview="square"]').getAttribute("src")) ?? "";
      const image = decodeURIComponent(
        (await shown()).replace(/^data:image\/svg\+xml;charset=utf-8,/, ""),
      );
      expect(
        (image.match(/data-passport-shield=/g) ?? []).length,
        "every credential valid today is on the one image, exactly once",
      ).toBe(current);
      expect(image).toContain(`data-passport-credentials="${current}"`);
      expect(image).toContain('data-passport-fits="true"');
      expect(image).not.toContain("data-social-page");
      expect(words(image)).not.toMatch(/SECURITY PASSPORT · \d+ \/ \d+/);
      // Grouped: more than one heading, and every shield inside a group.
      expect(Number(/data-passport-groups="(\d+)"/.exec(image)?.[1])).toBeGreaterThan(1);
      await expect(one.locator("[data-passport-group-list] [data-passport-group]")).not.toHaveCount(
        0,
      );
      // As legible as a small Passport: nothing drawn under the floor on 1080.
      expect(
        Math.min(...[...image.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]))),
        "every text at least 14px",
      ).toBeGreaterThanOrEqual(14);
      for (const absent of [
        "Fiktiv Väktarskola AB",
        "Fiktivt Training Centre",
        "Fiktivt Utbildningscenter LLC",
        largeUid,
        "/p#",
      ])
        expect(image, "nothing private").not.toContain(absent);
      await evidence(lp, "en-social-one-passport");

      const [downloaded] = await downloadsDuring(lp, 1, () =>
        one.locator("[data-social-download]").click(),
      );
      expect(downloaded!.suggestedFilename()).toBe("cqrityjob-passport-square.png");
      expect(
        await pixelsDiffering(lp, await pngOf(downloaded!), await shown(), 1080, 1080),
        "the download is the preview",
      ).toBe(0);
      if (phone) {
        await one.locator("[data-social-device]").click();
        await expect(one.locator('[data-social-notice="attached"]')).toHaveText(
          "The image is now in the app you chose. Finish the post there.",
        );
        const [sheet] = await lp.evaluate(
          () => (window as unknown as { __shared: SharedRecord[] }).__shared,
        );
        expect(
          sheet!.files.map((f) => f.name),
          "ONE file to the share sheet",
        ).toEqual(["cqrityjob-passport-square.png"]);
        expect(
          await pixelsDiffering(lp, sheet!.files[0]!.png, await shown(), 1080, 1080),
          "the share sheet was handed the previewed image",
        ).toBe(0);
      }
      const posted = await downloadsDuring(lp, 1, () =>
        one.locator('[data-social-channel="linkedin"]').click(),
      );
      expect(posted.map((f) => f.suggestedFilename())).toEqual(["cqrityjob-passport-square.png"]);
      await expect(one.locator('[data-social-notice="added_by_holder"]')).toHaveText(
        "Your Security Passport image is ready. Add the image to your post.",
      );
      expect(
        (await lp.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).at(-1),
      ).toBe("https://www.linkedin.com/feed/");
      expect(
        await lp.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await evidence(lp, "en-social-one-passport-ready");
      expect(linksOf(largeUid), "sharing the Passport created no link").toBe(largeLinks);
    } finally {
      await large.context.close();
    }

    // In English, and still inside the page's width.
    await inLanguage(page, "en");
    await page.goto(`${BASE}/passport/share`);
    await page.locator('[data-share-choice="social"]').click();
    await expect(page.locator('[data-share-choice="social"]')).toContainText(
      "Share on social media",
    );
    const en = page.locator("[data-social-flow]");
    await en.locator(`[data-merit-option="claim:${du}"] input`).check();
    await expect(en.locator('[data-social-preview="square"]')).toBeVisible({ timeout: 60_000 });
    const enText = words(
      decodeURIComponent(
        ((await en.locator('[data-social-preview="square"]').getAttribute("src")) ?? "").replace(
          /^data:image\/svg\+xml;charset=utf-8,/,
          "",
        ),
      ),
    );
    expect(enText).toContain("DOCUMENTED");
    expect(enText).toContain("A snapshot.");
    expect(enText).not.toMatch(/SOURCE-CONFIRMED|VERIFIED/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await evidence(page, "en-social-preview");
  });

  test("H · another holder can read or change nothing of this Passport, and cannot raise their own trust", async ({
    page,
    request,
  }) => {
    test.info().annotations.push({ type: "proof", description: "H" });
    const owner = uidOf(who("dubai"));
    const other = uidOf(who("mixed"));
    const theirs = activeClaim(owner, "AE_DU_SIRA_CARD_GUARD");
    const mine = activeClaim(other, "VU1");
    const fingerprint = () =>
      sql(
        `select md5(string_agg(to_jsonb(c)::text, '' order by c.id)) from public.sp_claims c where c.holder_user_id in ('${owner}','${other}')`,
      );
    const before = fingerprint();

    await inLanguage(page, "en");
    await atEvidenceWidth(page);
    await signIn(page, who("mixed"), "/passport");

    // Through the page: somebody else's credential is simply not there.
    await page.goto(`${BASE}/passport/entry/claim/${theirs}`);
    await expect(page.locator("main")).not.toContainText("SIRA Security Cadre Card", {
      timeout: 30_000,
    });
    await expect(page.locator("main")).not.toContainText("Fiktivt Security LLC");

    // Through the API, with this holder's own session.
    const token = await accessToken(page);
    expect(token).not.toBe("");
    const headers = {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    for (const read of [
      `sp_claims?id=eq.${theirs}&select=id`,
      `sp_claims?holder_user_id=eq.${owner}&select=id`,
      `sp_credential_details?claim_id=eq.${theirs}&select=claim_id`,
      `sp_evidence?holder_user_id=eq.${owner}&select=id`,
      `sp_verification_requests?holder_user_id=eq.${owner}&select=id`,
      `sp_disclosures?holder_user_id=eq.${owner}&select=id`,
    ]) {
      const r = await request.get(`${API}/rest/v1/${read}`, { headers });
      expect(r.status(), read).toBeLessThan(500);
      expect(r.ok() ? await r.json() : [], read).toEqual([]);
    }
    const changeTheirs = await request.patch(`${API}/rest/v1/sp_claims?id=eq.${theirs}`, {
      headers,
      data: { title: "Changed by somebody else" },
    });
    expect(changeTheirs.ok() ? await changeTheirs.json() : []).toEqual([]);
    const raiseMine = await request.patch(`${API}/rest/v1/sp_claims?id=eq.${mine}`, {
      headers,
      data: { assertion_level: "source_verified" },
    });
    expect(raiseMine.ok(), "a holder raising their own trust level").toBe(false);
    const decide = await request.post(`${API}/rest/v1/rpc/sp_verifier_decide`, {
      headers,
      data: {
        _request_id: randomUUID(),
        _decision: "approved",
        _method: "document_review",
        _decision_note: null,
        _holder_message: null,
        _valid_from: null,
        _valid_until: null,
      },
    });
    expect(decide.ok(), "a holder deciding a review").toBe(false);
    const grant = await request.post(`${API}/rest/v1/rpc/sp_grant_pilot_member`, {
      headers,
      data: { _user_id: other, _market_pack_code: "AE-DU", _note: "self" },
    });
    expect(grant.ok(), "a holder granting themselves a pilot").toBe(false);

    expect(fingerprint()).toBe(before);
    expect(grantsOf(other)).toBe("0");
  });

  test("B · a mixed-market holder adds all four Indian qualifications and reloads", async ({
    page,
  }) => {
    test.info().annotations.push({ type: "proof", description: "B" });
    const email = who("mixed");
    const uid = uidOf(email);
    const before = Number(
      sql(`select count(*) from public.sp_claims where holder_user_id='${uid}'`),
    );
    await inLanguage(page, "en");
    await atEvidenceWidth(page);
    await signIn(page, email, "/passport");
    for (const code of ["IN_MEPSC_Q7101", "IN_MEPSC_Q7201", "IN_MEPSC_Q7104", "IN_MEPSC_Q7204"]) {
      await addCredential(page, code, async (p) => {
        await p.locator('[data-field="issuer-name"]').fill("Fiktivt Training Centre");
      });
    }
    for (const pass of ["first load", "after reload"]) {
      await page.goto(`${BASE}/passport`);
      const wallet = await walletRows(page);
      await expect(wallet, pass).toHaveCount(before + 4, { timeout: 60_000 });
      await expect(page.locator("[data-credential-wallet]")).toContainText("India");
    }
    expect(grantsOf(uid)).toBe("0");
    await evidence(page, "en-passport-mixed-with-india");
  });

  test("J · a Passport of fifteen, one expired, renders on the card and in the wallet", async ({
    page,
  }) => {
    test.info().annotations.push({ type: "proof", description: "J" });
    await inLanguage(page, "sv");
    await atEvidenceWidth(page);
    await signIn(page, who("large"), "/passport");
    await page.goto(`${BASE}/passport`);
    const wallet = await walletRows(page);
    await expect(wallet).toHaveCount(15, { timeout: 60_000 });
    // Four shields at most, and the rest counted -- never dropped.
    await expect(page.locator("[data-credential-shield]").first()).toBeVisible();
    await expect(page.locator("[data-credential-wallet]")).toContainText("Dubai, UAE");
    await expect(page.locator("[data-credential-wallet]")).toContainText(
      /Utgången|Utgått|Expired/i,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    await evidence(page, "sv-passport-large");
  });

  test("K · the administrator's availability answer is exactly what the holders are offered", async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({ type: "proof", description: "K" });
    await inLanguage(page, "en");
    await atEvidenceWidth(page);
    await signIn(page, ADMIN, "/admin/passport-catalogue");
    await page.goto(`${BASE}/admin/passport-catalogue`);
    await expect(page.locator("[data-catalogue-row]").first()).toBeVisible({ timeout: 60_000 });
    const count = async (a: string) =>
      Number(await page.locator(`[data-count="${a}"]`).textContent());
    const rows = await page
      .locator("[data-catalogue-row]")
      .evaluateAll((els) =>
        els.map((e) => [
          e.getAttribute("data-catalogue-row") ?? "",
          e.querySelector("[data-availability]")?.getAttribute("data-availability") ?? "",
        ]),
      );
    const publicPilot = rows.filter(([, a]) => a === "selectable_public_pilot").map(([c]) => c);
    expect(publicPilot).toHaveLength(await count("selectable_public_pilot"));
    expect(await count("selectable_pilot_members")).toBe(0);
    expect(publicPilot.length).toBeGreaterThan(0);
    await evidence(page, "en-admin-catalogue");

    // Dubai, as an ordinary Dubai holder is offered it.
    const dubai = await anotherPerson(browser, "sv");
    try {
      await signIn(dubai.page, who("dubai"), "/passport/information");
      expect(await offeredCodes(dubai.page, "open_public_pilot")).toEqual(
        publicPilot.filter((c) => c.startsWith("AE_DU_")).sort(),
      );
    } finally {
      await dubai.context.close();
    }
    // Great Britain, as an ordinary GB holder is offered it. Northern
    // Ireland's licence is its own market and is not in this list.
    const gb = await anotherPerson(browser, "sv");
    try {
      await signIn(gb.page, who("large"), "/passport/information");
      expect(await offeredCodes(gb.page, "open_public_pilot")).toEqual(
        publicPilot.filter((c) => c.startsWith("UK_") && c !== "UK_SIA_LICENCE_VI").sort(),
      );
    } finally {
      await gb.context.close();
    }
  });
});

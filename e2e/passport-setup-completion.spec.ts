/**
 * Completing the Security Passport setup (BUG-04), end to end, against a REAL
 * isolated backend: GoTrue with e-mail confirmation ON (the link is read from
 * the stack's own Mailpit and followed), PostgREST, and a database with
 * 20270323090000 installed. No response is stubbed. Every person is synthetic.
 *
 *   new account → the setup → a current merit → the holder's own declaration
 *   → a completed Passport → one number, the same after reloads and repeated
 *   clicks — in Swedish and English, on desktop and on a phone;
 *   an empty Passport, drafts only or CV entries only cannot be completed;
 *   a signed-out caller and another holder are refused at the database;
 *   a holder stuck in the old flow completes through the same declaration;
 *   a Passport numbered earlier keeps its number.
 *
 * Opt-in and loopback only: SETUP_COMPLETION_LIVE_LOCAL=1,
 * E2E_BASE_URL=http://localhost:<port>, and SETUP_API_URL / SETUP_ANON_KEY /
 * SETUP_SERVICE_KEY / SETUP_MAILPIT_URL / SETUP_DB_URL for the disposable stack.
 */
import { execFileSync } from "node:child_process";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chooseCredential } from "./support/credential-picker";

const env = (k: string) => process.env[k] ?? "";
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
test.skip(
  env("SETUP_COMPLETION_LIVE_LOCAL") !== "1",
  "Explicit disposable local-stack opt-in required",
);
test.use({ actionTimeout: 20_000 });

const BASE = env("E2E_BASE_URL");
const API = env("SETUP_API_URL");
const ANON = env("SETUP_ANON_KEY");
const SERVICE = env("SETUP_SERVICE_KEY");
const MAILPIT = env("SETUP_MAILPIT_URL");
const DB = env("SETUP_DB_URL");
const PASSWORD = "SetupCompletion!2026";

function refuseNonLocal() {
  for (const [name, url] of [
    ["E2E_BASE_URL", BASE],
    ["SETUP_API_URL", API],
    ["SETUP_MAILPIT_URL", MAILPIT],
  ] as const)
    if (!LOOPBACK.test(url)) throw new Error(`${name} must be a loopback URL, got ${url}`);
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(DB)) throw new Error("SETUP_DB_URL must be local");
}
const sql = (q: string) =>
  execFileSync("psql", [DB, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", q], {
    encoding: "utf8",
  }).trim();

/** A governed catalogue credential, written as the catalogue form writes it. */
const CFE = {
  claim_type: "certification",
  title: "Certified Fraud Examiner (CFE)",
  credential_code: "INTL_ACFE_CFE",
  claimed_issuer_name: "Association of Certified Fraud Examiners (ACFE)",
} as const;

type Lang = "sv" | "en";
const L = (lang: Lang, sv: string, en: string) => (lang === "sv" ? sv : en);

interface Holder {
  readonly id: string;
  readonly email: string;
  /** The holder's OWN session (PostgREST as `authenticated`, RLS applies). */
  readonly db: SupabaseClient;
}

/** A confirmed synthetic account with an (empty) Passport. */
async function holder(tag: string): Promise<Holder> {
  const email = `setup.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@test.local`;
  const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const db = createClient(API, ANON, { auth: { persistSession: false } });
  const signed = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw signed.error;
  const ensured = await db.rpc("sp_passport_ensure");
  if (ensured.error) throw ensured.error;
  return { id: created.data.user!.id, email, db };
}

/** Steps 1-3 answered, as the setup itself would have saved them. */
function answerSetup(h: Holder, name: string) {
  sql(
    `update public.sp_passport_profiles set display_name='${name}' where holder_user_id='${h.id}'`,
  );
  sql(
    `insert into public.security_career_profiles(user_id,current_profession_other) values ('${h.id}','Väktare') on conflict (user_id) do update set current_profession_other=excluded.current_profession_other`,
  );
  sql(
    `insert into public.candidate_current_location(user_id,country_code,locality) values ('${h.id}','SE','Göteborg') on conflict (user_id) do nothing`,
  );
  sql(
    `insert into public.candidate_job_preferences(user_id,desired_destinations,relocation_interest) values ('${h.id}','{}',null) on conflict (user_id) do nothing`,
  );
}

async function addCredential(h: Holder, lifecycle: "active" | "draft") {
  const r = await h.db
    .from("sp_claims")
    .insert({ holder_user_id: h.id, ...CFE, lifecycle_state: lifecycle })
    .select("id");
  if (r.error) throw r.error;
}

const completion = (id: string) =>
  sql(
    `select onboarding_state||'|'||(declared_accurate_at is not null)::text from public.sp_passport_profiles where holder_user_id='${id}'`,
  );
/** Not completed and not declared: the draft autosave may have moved it to in_progress. */
const NOT_COMPLETED = /^(not_started|in_progress)\|false$/;
const numberOf = (id: string) =>
  sql(
    `select coalesce(max(passport_number)::text,'-') from public.sp_passport_numbers where holder_user_id='${id}'`,
  );
const events = (id: string) =>
  sql(
    `select count(*) filter (where event_type='onboarding_completed')||'|'||count(*) filter (where event_type='declaration_recorded' and detail->>'source'='setup') from public.sp_passport_events where holder_user_id='${id}'`,
  );

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
      const link = /https?:\/\/[^"'\s<>]+\/auth\/v1\/verify[^"'\s<>]+/.exec(
        `${m.HTML ?? ""} ${m.Text ?? ""}`,
      )?.[0];
      if (link) return link.replaceAll("&amp;", "&");
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no confirmation e-mail for ${email}`);
}

async function useLanguage(page: Page, lang: Lang) {
  await page.addInitScript((l) => {
    if (!localStorage.getItem("cqrityjob.lang")) localStorage.setItem("cqrityjob.lang", l);
  }, lang);
}

async function signIn(page: Page, email: string, destination: string) {
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(destination)}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === destination, { timeout: 60_000 });
}

async function noHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

const shot = (page: Page, info: TestInfo, name: string) =>
  page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });

/** The declaration, the refusal without it, and a double click on Complete. */
async function declareAndComplete(page: Page, info: TestInfo, lang: Lang, h: Holder, tag: string) {
  const finish = page.locator("[data-setup-finish]");
  await expect(finish).toHaveAttribute("data-setup-finish", "confirm");
  const box = page.locator("[data-setup-declaration]");
  await expect(box, "the declaration is never ticked for the holder").not.toBeChecked();
  await expect(page.locator(`label[for="setup-declaration"]`)).toHaveText(
    L(
      lang,
      "Jag intygar att uppgifterna är riktiga så vitt jag vet.",
      "I declare that this information is accurate to the best of my knowledge.",
    ),
  );
  await shot(page, info, `${tag}-confirm`);

  // Complete without the declaration: refused on the screen, nothing written.
  const button = page.locator("[data-setup-complete-button]");
  await button.click();
  await expect(page.locator('[data-setup-problem="declaration"]')).toBeVisible();
  await expect(box).toBeFocused();
  expect(completion(h.id)).toMatch(NOT_COMPLETED);

  // Declared, then Complete twice in quick succession.
  await box.check();
  // The completion is the one server-function POST that carries the
  // declaration (the URL names a hashed function id, not the export).
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/_serverFn/")) posts.push(r.postData() ?? "");
  });
  await button.dblclick();
  await expect(page.locator("[data-setup-completed]")).toBeVisible({ timeout: 30_000 });
  const shown = page.locator("[data-passport-number]");
  await expect(shown).toBeVisible();
  const number = Number(await shown.getAttribute("data-passport-number"));
  expect(number).toBeGreaterThan(1);
  await expect(shown).toHaveText(`Security Passport #${number}`);
  expect(
    posts.filter((body) => body.includes("declared")).length,
    "one completion request for a double click",
  ).toBe(1);
  expect(completion(h.id)).toBe("completed|true");
  expect(numberOf(h.id)).toBe(String(number));
  expect(events(h.id), "one completion and one declaration, recorded together").toBe("1|1");
  await expect(page.locator("#setup-finish-done")).toBeFocused();
  await shot(page, info, `${tag}-completed`);

  // Reload: the same number, read back; nothing new is written.
  await page.reload();
  await expect(page.locator("[data-setup-completed]")).toBeVisible();
  await expect(page.locator("[data-passport-number]")).toHaveAttribute(
    "data-passport-number",
    String(number),
  );
  // The RPC itself, again, from the holder's session: still idempotent.
  expect((await h.db.rpc("sp_passport_complete_setup", { _declared: true })).error).toBeNull();
  expect(numberOf(h.id)).toBe(String(number));
  expect(events(h.id)).toBe("1|1");

  await page.locator("[data-setup-open-passport]").click();
  await page.waitForURL((u) => u.pathname === "/passport");
  await expect(page.locator('[data-cta="complete-setup"]')).toHaveCount(0);
  return number;
}

let existing: { id: string; number: string; declaredAt: string };

test.beforeAll(async () => {
  refuseNonLocal();
  // A Passport numbered BEFORE any of the journeys below. It must not move.
  const h = await holder("existing");
  answerSetup(h, "Existing Holder");
  await addCredential(h, "active");
  const done = await h.db.rpc("sp_passport_complete_setup", { _declared: true });
  if (done.error) throw done.error;
  existing = {
    id: h.id,
    number: numberOf(h.id),
    declaredAt: sql(
      `select declared_accurate_at::text from public.sp_passport_profiles where holder_user_id='${h.id}'`,
    ),
  };
  expect(existing.number).not.toBe("-");
});

test.afterAll(() => {
  expect(numberOf(existing.id), "a Passport numbered earlier keeps its number").toBe(
    existing.number,
  );
  expect(
    sql(
      `select declared_accurate_at::text from public.sp_passport_profiles where holder_user_id='${existing.id}'`,
    ),
    "and its declaration",
  ).toBe(existing.declaredAt);
  expect(
    sql("select (count(*)=count(distinct passport_number))::text from public.sp_passport_numbers"),
    "every Passport number is unique",
  ).toBe("true");
});

for (const lang of ["sv", "en"] as const) {
  test(`${lang}: new account → setup → current merit → own declaration → one number`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const tag = `${lang}-${info.project.name}`;
    const email = `setup.new.${tag}.${Date.now()}@test.local`;
    await useLanguage(page, lang);

    // A new account through the real sign-up and its confirmation e-mail.
    await page.goto(`${BASE}/signup?redirect=${encodeURIComponent("/passport/start")}`);
    await page.locator('input[name="name"]').fill(L(lang, "Sara Lindqvist", "Sam Carter"));
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByTestId("signup-terms").check();
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible();
    await page.goto(await confirmationLink(email));
    await page.waitForURL((u) => u.pathname === "/passport/start", { timeout: 60_000 });
    const id = sql(`select id from auth.users where email='${email}'`);
    const db = createClient(API, ANON, { auth: { persistSession: false } });
    const signed = await db.auth.signInWithPassword({ email, password: PASSWORD });
    if (signed.error) throw signed.error;
    const h: Holder = { id, email, db };

    // Steps 1-3.
    const setup = page.locator("[data-india-setup]");
    await expect(setup).toHaveAttribute("data-setup-step", "name");
    await page.locator('[data-field="occupation"]').selectOption("__other__");
    await page
      .locator('[data-field="occupation-other"]')
      .fill(L(lang, "Väktare", "Security officer"));
    await page
      .getByRole("button", { name: L(lang, "Spara och fortsätt", "Save and continue") })
      .click();
    await expect(setup).toHaveAttribute("data-setup-step", "location");
    await page.getByLabel(L(lang, "Bosättningsland", "Country of residence")).selectOption("SE");
    await page
      .getByRole("button", { name: L(lang, "Spara och fortsätt", "Save and continue") })
      .click();
    await expect(setup).toHaveAttribute("data-setup-step", "destinations");
    await page.getByRole("button", { name: L(lang, "Hoppa över", "Skip for now") }).click();
    await expect(setup).toHaveAttribute("data-setup-step", "first");

    // An empty Passport: no Complete button, a way to add a merit instead.
    await expect(page.locator("[data-setup-finish]")).toHaveAttribute("data-setup-finish", "add");
    await expect(page.locator("[data-setup-complete-button]")).toHaveCount(0);
    await expect(page.locator("[data-setup-no-merit]")).toContainText(
      L(lang, "Lägg till en aktuell merit", "Add a current merit"),
    );
    if (info.project.name !== "chromium") await noHorizontalScroll(page, `${tag} add`);
    await shot(page, info, `${tag}-add`);
    expect(completion(id)).toMatch(NOT_COMPLETED);

    // A current merit through the catalogue form, as the holder adds one.
    await page.locator("[data-setup-add-credential]").click();
    await page.waitForURL((u) => u.pathname === "/passport/credentials/new");
    await chooseCredential(page, "INTL_ACFE_CFE", { search: "CFE", lang });
    await page.getByRole("button", { name: L(lang, "Fortsätt", "Continue"), exact: true }).click();
    await page
      .getByRole("button", { name: L(lang, "Spara merit", "Save credential"), exact: true })
      .click();
    await page.waitForURL(/\/passport\/entry\/claim\//, { timeout: 60_000 });

    await page.goto(`${BASE}/passport/start`);
    await expect(page.locator("[data-summary-credentials]")).toContainText(
      "Certified Fraud Examiner (CFE)",
    );
    await expect(page.locator("[data-setup-summary]")).toContainText(
      L(lang, "Sara Lindqvist", "Sam Carter"),
    );
    if (info.project.name !== "chromium") await noHorizontalScroll(page, `${tag} confirm`);
    const number = await declareAndComplete(page, info, lang, h, tag);
    expect(String(number)).not.toBe(existing.number);

    // Back to the setup later: still the completion, still that number.
    await page.goto(`${BASE}/passport/start`);
    await expect(page.locator("[data-india-setup]")).toHaveAttribute("data-setup-step", "done");
    await expect(page.locator("[data-passport-number]")).toHaveAttribute(
      "data-passport-number",
      String(number),
    );
    if (info.project.name !== "chromium") await noHorizontalScroll(page, `${tag} completed`);
  });
}

test("an employment completes a Passport stuck in the old flow, from the Passport itself", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "once, on desktop");
  test.setTimeout(120_000);
  const lang: Lang = "en";
  await useLanguage(page, lang);
  const h = await holder("stuck");
  answerSetup(h, "Robin Stuck");
  // The old flow saved an employment and never completed anything.
  const period = await h.db
    .from("sp_experience_periods")
    .insert({
      holder_user_id: h.id,
      employer_name: "Nordvakt AB",
      role_title: "Security officer",
      started_on: "2021-03-01",
      jurisdiction_code: "SE",
    })
    .select("id");
  if (period.error) throw period.error;
  expect(completion(h.id)).toMatch(NOT_COMPLETED);

  await signIn(page, h.email, "/passport");
  const cta = page.locator('[data-cta="complete-setup"]');
  await expect(cta).toBeVisible();
  await expect(page.locator('[data-passport-next-step="complete"]')).toContainText(
    "Complete your Passport",
  );
  await shot(page, info, "stuck-passport-next-step");
  await cta.click();
  await page.waitForURL((u) => u.pathname === "/passport/start");
  await expect(page.locator("[data-summary-employments]")).toContainText(
    "Security officer, Nordvakt AB",
  );
  await declareAndComplete(page, info, lang, h, "stuck-en-desktop");
});

test("drafts only, CV entries only, signed out and another holder's Passport are refused", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium", "once, on desktop");
  test.setTimeout(150_000);
  const lang: Lang = "sv";
  await useLanguage(page, lang);

  // Drafts only.
  const draft = await holder("draft");
  answerSetup(draft, "Dana Draft");
  await addCredential(draft, "draft");
  await signIn(page, draft.email, "/passport/start");
  await expect(page.locator("[data-setup-finish]")).toHaveAttribute("data-setup-finish", "add");
  await expect(page.locator("[data-setup-drafts]")).toBeVisible();
  await expect(page.locator("[data-setup-complete-button]")).toHaveCount(0);
  await shot(page, info, "refused-drafts-only");
  expect(
    (await draft.db.rpc("sp_passport_complete_setup", { _declared: true })).error?.message,
  ).toBe("SP_NO_CURRENT_MERIT");

  // CV entries only.
  const cv = await holder("cv");
  answerSetup(cv, "Cleo Cv");
  const edu = await cv.db
    .from("sp_claims")
    .insert({ holder_user_id: cv.id, claim_type: "education", title: "Gymnasieexamen" })
    .select("id");
  if (edu.error) throw edu.error;
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await useLanguage(page, lang);
  await signIn(page, cv.email, "/passport/start");
  await expect(page.locator("[data-setup-finish]")).toHaveAttribute("data-setup-finish", "add");
  await expect(page.locator("[data-setup-cv-only]")).toBeVisible();
  await shot(page, info, "refused-cv-only");
  expect((await cv.db.rpc("sp_passport_complete_setup", { _declared: true })).error?.message).toBe(
    "SP_NO_CURRENT_MERIT",
  );

  // An empty Passport, at the database, and without a declaration.
  const empty = await holder("empty");
  expect(
    (await empty.db.rpc("sp_passport_complete_setup", { _declared: true })).error?.message,
  ).toBe("SP_NO_CURRENT_MERIT");
  expect(
    (await draft.db.rpc("sp_passport_complete_setup", { _declared: false })).error?.message,
  ).toBe("SP_DECLARATION_REQUIRED");

  // Signed out: the page sends to sign-in, and the database refuses the call.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/passport/start`);
  await page.waitForURL((u) => u.pathname === "/login", { timeout: 30_000 });
  const anon = createClient(API, ANON, { auth: { persistSession: false } });
  const signedOut = await anon.rpc("sp_passport_complete_setup", { _declared: true });
  expect(signedOut.error, "a signed-out caller cannot complete anything").not.toBeNull();
  // A token whose session was ended: refused before anything is read.
  const revoked = await holder("revoked");
  await addCredential(revoked, "active");
  const token = (await revoked.db.auth.getSession()).data.session!.access_token;
  await revoked.db.auth.signOut({ scope: "global" });
  const stale = await fetch(`${API}/rest/v1/rpc/sp_passport_complete_setup`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ _declared: true }),
  });
  expect(await stale.text()).toContain("SP_SESSION_REVOKED");
  expect(completion(revoked.id)).toMatch(NOT_COMPLETED);
  expect(numberOf(revoked.id)).toBe("-");

  // Another holder's Passport: not reachable, and the table takes no
  // client-written completion, even of one's own row.
  const other = await draft.db
    .from("sp_passport_profiles")
    .update({ onboarding_state: "completed", declared_accurate_at: new Date().toISOString() })
    .eq("holder_user_id", cv.id)
    .select("holder_user_id");
  expect(other.data ?? [], "another holder's row is invisible to the update").toEqual([]);
  expect(completion(cv.id)).toMatch(NOT_COMPLETED);
  const own = await draft.db
    .from("sp_passport_profiles")
    .update({ onboarding_state: "completed", declared_accurate_at: new Date().toISOString() })
    .eq("holder_user_id", draft.id)
    .select("holder_user_id");
  expect(own.error?.message).toBe("SP_COMPLETION_RPC_ONLY");
  const forged = await draft.db
    .from("sp_passport_numbers")
    .insert({ holder_user_id: draft.id, passport_number: 999999 });
  expect(forged.error, "nobody writes a number from a client").not.toBeNull();
  for (const h of [draft, cv, empty]) expect(numberOf(h.id)).toBe("-");
});

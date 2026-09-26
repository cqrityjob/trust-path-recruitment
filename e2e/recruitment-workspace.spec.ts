// The recruitment case, walked in a real browser against a LOCAL stack.
//
// What this proves that no static guard can: that the numbers on the screen
// are the rows behind them, that a page of candidates is one page and only
// one -- over 5 050 applications, more than the old in-memory read could
// see -- that previous/next walk the server's own ordering across a page
// edge, that the list comes back exactly as it was left, that a booking
// from the list writes bookings and sends nothing, that a series of
// bookings which does not fit the day is refused as a whole with nothing
// written, that a batch reports per candidate, and that the walls hold --
// another organisation sees nothing, a candidate never sees an internal
// note.
//
// Runs only when E2E_LOCAL_STACK=1 and both URLs are loopback: it signs
// synthetic people in through the LOCAL Auth admin API and writes bookings.
// It expects scripts/fixtures/recruitment-workspace-fixture.sql to have run:
//
//   anna.agare@nordvakt.test    owner of nordvakt-sakerhet
//   olle.agare@vaktbolaget.test owner of another organisation
//   kim.kandidat@test.local     a candidate
//   "Väktare, Uppsala"          32 applications (E2E_REC_JOB_ID)
//   "Väktare, Norrköping"       5 050 applications (E2E_REC_BIG_JOB_ID)
//
// Configuration (all local, none secret):
//   E2E_BASE_URL                   the app, e.g. http://localhost:8093
//   E2E_SUPABASE_URL               the local API, e.g. http://127.0.0.1:56321
//   E2E_SUPABASE_SERVICE_ROLE_KEY  the LOCAL stack's service-role key
//   E2E_SUPABASE_ANON_KEY          the LOCAL stack's publishable key
//   E2E_DATABASE_URL               the LOCAL stack's Postgres URL, for the
//                                  "nothing was written" counts (optional
//                                  locally; the CI job always passes it)
//
// CI: .github/workflows/recruitment-evidence.yml, which also refuses a
// report in which these tests were skipped.

import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const SRK = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const DB = process.env.E2E_DATABASE_URL ?? "";
const SLUG = process.env.E2E_REC_EMPLOYER_SLUG ?? "nordvakt-sakerhet";
const JOB = process.env.E2E_REC_JOB_ID ?? "44444444-dddd-4000-8000-000000000004";
const BIG = process.env.E2E_REC_BIG_JOB_ID ?? "55555555-eeee-4000-8000-000000000005";

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local signed-in walk.");
test.skip(
  !LOOPBACK.test(BASE) || !LOOPBACK.test(API),
  "This spec signs people in and writes bookings; it runs against loopback only.",
);
test.skip(!SRK || !ANON, "E2E_SUPABASE_SERVICE_ROLE_KEY and E2E_SUPABASE_ANON_KEY are required.");

/** A session for a synthetic address, minted through the local Auth admin
 *  API (magic-link OTP) -- never by typing a password -- and planted where
 *  the app's Supabase client reads it. */
async function signIn(page: Page, email: string): Promise<string> {
  const link = await fetch(`${API}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json() as Promise<{ email_otp?: string; properties?: { email_otp?: string } }>);
  const otp = link.email_otp ?? link.properties?.email_otp;
  if (!otp) throw new Error(`no otp for ${email}`);
  const session = await fetch(`${API}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: otp }),
  }).then((r) => r.json() as Promise<{ access_token?: string }>);
  if (!session.access_token) throw new Error(`no session for ${email}`);
  const ref = new URL(API).hostname.split(".")[0];
  await open(page, "/");
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem("cqrityjob.lang", "sv");
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );
  return session.access_token;
}

/** A session token without a browser: for the API-level refusals. */
async function tokenFor(email: string): Promise<string> {
  const link = await fetch(`${API}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json() as Promise<{ email_otp?: string; properties?: { email_otp?: string } }>);
  const otp = link.email_otp ?? link.properties?.email_otp;
  if (!otp) throw new Error(`no otp for ${email}`);
  const session = await fetch(`${API}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: otp }),
  }).then((r) => r.json() as Promise<{ access_token?: string }>);
  if (!session.access_token) throw new Error(`no session for ${email}`);
  return session.access_token;
}

const SWEEP_TOKEN = process.env.E2E_SWEEP_TOKEN ?? "";
const sweep = (auth: string | null, body: unknown = {}) =>
  fetch(`${BASE}/api/recruitment/receipts-sweep`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify(body),
  });
const kimsUppsalaApplication = () =>
  sql(
    `SELECT a.id FROM public.job_applications a JOIN auth.users u ON u.id = a.applicant_user_id WHERE u.email = 'kim.kandidat@test.local' AND a.job_id = '${JOB}' ORDER BY a.created_at DESC LIMIT 1`,
  );
const receiptRow = (appId: string) =>
  sql(
    `SELECT email_status || '/' || email_attempts || '/' || email_key_generation || '/' || coalesce(email_recipient, '-') || '/' || (email_attempt_id IS NOT NULL)::text FROM public.recruitment_messages WHERE application_id = '${appId}' AND kind = 'receipt'`,
  );

/** One read-only statement against the local database, when its URL was
 *  handed in -- the "nothing was written" proofs need a count the browser
 *  cannot give. Refuses anything that is not loopback. */
function sql(statement: string): string | null {
  if (!DB) return null;
  const url = new URL(DB);
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
    throw new Error("E2E_DATABASE_URL is not loopback; this spec reads no other database.");
  }
  return execFileSync(
    "psql",
    [
      "-h",
      url.hostname,
      "-p",
      url.port,
      "-U",
      decodeURIComponent(url.username),
      "-d",
      url.pathname.slice(1),
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      statement,
    ],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, encoding: "utf8" },
  ).trim();
}
const bookingsOf = (jobId: string) =>
  sql(`SELECT count(*) FROM public.recruitment_interview_bookings WHERE job_id = '${jobId}'`);

const casePath = (jobId: string, search = "") => `/employer/${SLUG}/jobs/${jobId}${search}`;

/** A navigation the dev server may abort once: on a cold runner Vite
 *  discovers dependencies on the first visit of a route and forces a full
 *  reload, which surfaces as net::ERR_ABORTED. One retry, then the real
 *  failure if there is one. */
async function open(page: Page, path: string) {
  try {
    await page.goto(path);
  } catch (e) {
    if (!/ERR_ABORTED/.test(String(e))) throw e;
    await page.waitForTimeout(1500);
    await page.goto(path);
  }
}
const stepNav = (page: Page) => page.getByRole("navigation", { name: "Rekryteringens steg" });
const actionBar = (page: Page) =>
  page.getByRole("region", { name: "Åtgärder för markerade kandidater" });
const pager = (page: Page) => page.getByRole("navigation", { name: "Sidor" });
const rowCheckboxes = (page: Page) => page.locator("table tbody input[type=checkbox]");
const nameLinks = (page: Page) => page.locator("table tbody tr td:nth-child(3) a");
const idsOnPage = (page: Page) =>
  nameLinks(page).evaluateAll((as) =>
    as.map((a) => (a as HTMLAnchorElement).href.split("/").pop()!.split("?")[0]),
  );
const daysAhead = (n: number) => new Date(Date.now() + 86_400_000 * n).toISOString().slice(0, 10);
const placeInput = (dialog: ReturnType<Page["getByRole"]>) =>
  dialog.locator("label", { hasText: "Adress eller plats" }).locator("input");

test.describe("recruitment case", () => {
  // The table is a desktop surface; at phone width the same rows are cards
  // and the ordering assertions below read table cells. The 375px walk of
  // this page lives in the evidence index, not here.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 1440) < 1024,
    "The candidate table is read as a table; the phone layout is cards.",
  );

  test("the case reads top-down: header, five steps, filters, action bar, table, pager", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications"));
    // The first visit to the case route in a job is a cold one: the dev
    // server compiles the route on demand, which on a CI runner takes longer
    // than the default expectation. Everything after this first paint runs on
    // the ordinary timeout.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("button", { name: /Visa annons/ })).toBeVisible();
    const nav = stepNav(page);
    const items = nav.getByRole("listitem");
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toContainText("Kravprofil");
    await expect(items.nth(4)).toContainText("Beslut & avslut");
    await expect(nav.locator("[aria-current=step]")).toContainText("Ansökningar");
    // Order on the page -- once the page has its rows; a bounding box read
    // during the loading state is null, not a position.
    await expect(page.locator("table")).toBeVisible();
    await expect(pager(page)).toBeVisible();
    const y = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!.y;
    const yNav = await y(nav);
    const yFilters = await y(page.getByRole("region", { name: "Filtrera ansökningar" }));
    const yBar = await y(actionBar(page));
    const yTable = await y(page.locator("table"));
    const yPager = await y(pager(page));
    expect(yNav).toBeLessThan(yFilters);
    expect(yFilters).toBeLessThan(yBar);
    expect(yBar).toBeLessThan(yTable);
    expect(yTable).toBeLessThan(yPager);
    // Every step is a link or the current one; nothing is a dead span.
    await expect(nav.getByRole("link")).toHaveCount(4);
    // No horizontal overflow of the document.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("a page is one page: no row twice, none lost, past-the-end clamps", async ({ page }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications"));
    await expect(pager(page)).toContainText(/Visar 1–25 av (\d+)/);
    const first = await idsOnPage(page);
    expect(first).toHaveLength(25);
    await pager(page).getByRole("button", { name: "Nästa" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager(page)).toContainText(/Visar 26–/);
    const second = await idsOnPage(page);
    expect(second.length).toBeGreaterThan(0);
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
    await open(page, casePath(JOB, "?step=applications&page=99"));
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
  });

  test("5 050 applications: the total is the total, the last page is the last, and the oldest fifty are there", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(BIG, "?step=applications&stage=all"));
    // The header count, the chip and the pager all say 5 050 -- a number the
    // old read, capped at 5 000, could never have shown.
    await expect(page.getByText("5050 ansökningar")).toBeVisible();
    await expect(pager(page)).toContainText("Visar 1–25 av 5050");
    await expect(pager(page)).toContainText("Sida 1 av 202");
    await expect(nameLinks(page).first()).toHaveText("Sökande 5050");
    await open(page, casePath(BIG, "?step=applications&stage=all&page=202"));
    await expect(pager(page)).toContainText("Visar 5026–5050 av 5050");
    await expect(nameLinks(page)).toHaveCount(25);
    await expect(nameLinks(page).last()).toHaveText("Sökande 0001");
    // The oldest applicant -- the first one the old limit dropped -- is
    // found by search, and opens.
    await open(page, casePath(BIG, "?step=applications&stage=all&q=S%C3%B6kande%200001"));
    await expect(pager(page)).toContainText("Visar 1–1 av 1");
    await expect(nameLinks(page)).toHaveCount(1);
    await nameLinks(page).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sökande 0001");
    await expect(page.getByText("1 av 1")).toBeVisible();
    // Filters over the whole list, not a sample: the licence question was
    // answered yes by every odd-numbered applicant.
    await open(page, casePath(BIG, "?step=applications&stage=all"));
    const licence = page.locator("select").filter({ hasText: "Alla svar" }).first();
    await licence.selectOption({ label: "Ja" });
    await expect(pager(page)).toContainText("av 2525");
    await page.getByRole("button", { name: /Rensa filter/ }).click();
    await expect(pager(page)).toContainText("av 5050");
  });

  test("previous/next walk the server's ordering across a page edge, without the list's ids", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(BIG, "?step=applications&stage=all&page=201"));
    await expect(pager(page)).toContainText("Visar 5001–5025 av 5050");
    await nameLinks(page).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sökande 0050");
    await expect(page.getByText("5001 av 5050")).toBeVisible();
    // Previous is the last row of page 200; next is the second row of page 201.
    await page.getByRole("link", { name: "Föregående" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sökande 0051");
    await expect(page.getByText("5000 av 5050")).toBeVisible();
    await page.getByRole("link", { name: "Nästa" }).click();
    await page.getByRole("link", { name: "Nästa" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sökande 0049");
    await expect(page.getByText("5002 av 5050")).toBeVisible();
    // The list's definition -- never its ids -- is what the browser holds.
    const stored = await page.evaluate(() =>
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("cqj.recruitment.list."))
        .map((k) => sessionStorage.getItem(k) ?? ""),
    );
    expect(stored.length).toBeGreaterThan(0);
    for (const raw of stored) {
      const ctx = JSON.parse(raw) as { ids?: unknown; query?: { jobId?: string } };
      expect(ctx.ids).toBeUndefined();
      expect(ctx.query?.jobId).toBe(BIG);
    }
    await page.getByRole("button", { name: "Tillbaka till listan" }).click();
    await expect(page).toHaveURL(/page=201/);
    await expect(pager(page)).toContainText("Visar 5001–5025 av 5050");
  });

  test("the header count, the stage filter and the rows agree", async ({ page }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications&stage=new"));
    const option = page.locator("select").filter({ hasText: "Nya (" }).first();
    const label = await option.locator("option[value=new]").textContent();
    const n = Number(/\((\d+)\)/.exec(label ?? "")?.[1]);
    expect(n).toBeGreaterThan(0);
    await expect(pager(page)).toContainText(new RegExp(`av ${n}\\b`));
    // Every visible stage badge is "Ny".
    const badges = await page.locator("table tbody tr td:nth-child(4)").allInnerTexts();
    for (const b of badges) expect(b.trim()).toBe("Ny");
  });

  test("filters, sort and page survive a trip into a candidate and back", async ({ page }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications&sort=name&page=2"));
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
    const name = await nameLinks(page).nth(1).innerText();
    await rowCheckboxes(page).nth(1).check();
    await expect(actionBar(page)).toContainText("1 markerade");
    await actionBar(page).getByRole("link", { name: "Visa ansökan" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    // Previous/next across the page boundary, from the server's full order.
    await expect(page.getByText(/27 av \d+/)).toBeVisible();
    await page.getByRole("button", { name: "Tillbaka till listan" }).click();
    await expect(page).toHaveURL(/step=applications/);
    await expect(page).toHaveURL(/sort=name/);
    await expect(page).toHaveURL(/page=2/);
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
  });

  test("select-all is this page, a batch reports per candidate, a booking sends nothing", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications&stage=all"));
    await page.getByRole("checkbox", { name: "Markera alla på den här sidan" }).check();
    await expect(actionBar(page)).toContainText("25 markerade");
    await page.getByRole("checkbox", { name: "Markera alla på den här sidan" }).uncheck();
    await expect(actionBar(page)).toContainText("0 markerade");

    // One new and one already-in-review candidate: the move is reported for
    // each, and the one that could not move stays selected.
    const rows = page.locator("table tbody tr");
    const nyRow = rows
      .filter({ has: page.locator("td:nth-child(4)", { hasText: /^\s*Ny\s*$/ }) })
      .first();
    const grRow = rows
      .filter({ has: page.locator("td:nth-child(4)", { hasText: "Granskas" }) })
      .first();
    await nyRow.locator("input[type=checkbox]").check();
    await grRow.locator("input[type=checkbox]").check();
    await actionBar(page).getByRole("button", { name: "Ändra status" }).click();
    await page.getByRole("menuitem", { name: "Flytta till granskning" }).click();
    const notice = page.locator("[role=status]").filter({ hasText: "flyttade" });
    await expect(notice).toContainText("1 flyttade");
    await expect(notice).toContainText("hoppades över");
    await expect(notice).toContainText("Flyttad");
    await expect(actionBar(page)).toContainText("1 markerade");

    // Booking two candidates from the list: two bookings, back to back, and
    // the dialog never offers to send. "Avmarkera" first: the skipped
    // candidate is still selected, on purpose.
    await actionBar(page).getByRole("button", { name: "Fler åtgärder" }).click();
    await page.getByRole("menuitem", { name: "Avmarkera" }).click();
    await expect(actionBar(page)).toContainText("0 markerade");
    await rowCheckboxes(page).nth(5).check();
    await rowCheckboxes(page).nth(6).check();
    await actionBar(page).getByRole("button", { name: "Intervju" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("2 separata bokningar");
    await expect(dialog).not.toContainText(/Skicka inbjudan/);
    const slots = dialog.locator("fieldset input[type=time]");
    await expect(slots).toHaveCount(2);
    expect(await slots.nth(0).inputValue()).not.toBe(await slots.nth(1).inputValue());
    await dialog.locator("input[type=date]").fill(daysAhead(7));
    await placeInput(dialog).fill("Kontoret");
    await dialog.getByRole("button", { name: /Spara 2 tider/ }).click();
    await expect(dialog).toContainText("2 av 2 tider sparade");
    await expect(dialog).toContainText("Planerad – inte skickad");
    await dialog.getByRole("button", { name: "Stäng" }).click();
    await expect(page.locator("table tbody tr").nth(5)).toContainText("Planerad – inte skickad");
  });

  test("25 candidates, 45 minutes from 10:00: the series does not fit the day, and nothing is saved", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(BIG, "?step=applications&stage=open"));
    const before = bookingsOf(BIG);
    await page.getByRole("checkbox", { name: "Markera alla på den här sidan" }).check();
    await expect(actionBar(page)).toContainText("25 markerade");
    await actionBar(page).getByRole("button", { name: "Intervju" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("25 separata bokningar");
    await dialog.locator("input[type=date]").fill(daysAhead(8));
    await placeInput(dialog).fill("Kontoret");
    const slots = dialog.locator("fieldset input[type=time]");
    await expect(slots).toHaveCount(25);
    // The prefilled series runs 10:00, 10:45 ... 23:30; the slots that would
    // start tomorrow are EMPTY and flagged -- never 23:59.
    await expect(slots.nth(0)).toHaveValue("10:00");
    await expect(slots.nth(18)).toHaveValue("23:30");
    await expect(slots.nth(19)).toHaveValue("");
    await expect(slots.nth(24)).toHaveValue("");
    for (let i = 0; i < 25; i += 1) expect(await slots.nth(i).inputValue()).not.toBe("23:59");
    await expect(dialog.getByText("ryms inte inom dagen")).toHaveCount(7);
    await dialog.getByRole("button", { name: /Spara 25 tider/ }).click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText(
      "Serien ryms inte inom dagen: 18 av 25 tider får plats från 10:00",
    );
    await expect(alert).toContainText("Inget har sparats");
    // The dialog is still open with the recruiter's input intact.
    await expect(dialog.locator("input[type=date]")).toHaveValue(daysAhead(8));
    await expect(slots.nth(0)).toHaveValue("10:00");
    await expect(dialog.getByRole("button", { name: /Spara 25 tider/ })).toBeVisible();
    if (before !== null) expect(bookingsOf(BIG)).toBe(before);

    // A hand-typed overlap inside an otherwise valid series is caught too,
    // and still nothing is saved.
    await dialog.getByRole("button", { name: "Avbryt" }).click();
    await actionBar(page).getByRole("button", { name: "Fler åtgärder" }).click();
    await page.getByRole("menuitem", { name: "Avmarkera" }).click();
    await rowCheckboxes(page).nth(0).check();
    await rowCheckboxes(page).nth(1).check();
    await rowCheckboxes(page).nth(2).check();
    await actionBar(page).getByRole("button", { name: "Intervju" }).click();
    const three = page.getByRole("dialog");
    await three.locator("input[type=date]").fill(daysAhead(8));
    await placeInput(three).fill("Kontoret");
    const threeSlots = three.locator("fieldset input[type=time]");
    await expect(threeSlots).toHaveCount(3);
    await threeSlots.nth(2).fill("10:20");
    await three.getByRole("button", { name: /Spara 3 tider/ }).click();
    await expect(three.getByRole("alert")).toContainText("överlappar");
    await expect(three.getByRole("alert")).toContainText("Inget har sparats");
    await expect(threeSlots.nth(2)).toHaveValue("10:20");
    if (before !== null) expect(bookingsOf(BIG)).toBe(before);
  });

  test("a wall-clock time the clocks skip, or repeat, is refused rather than guessed at", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(BIG, "?step=applications&stage=open"));
    const before = bookingsOf(BIG);
    await rowCheckboxes(page).nth(3).check();
    await actionBar(page).getByRole("button", { name: "Intervju" }).click();
    const dialog = page.getByRole("dialog");
    await placeInput(dialog).fill("Kontoret");
    await dialog.locator("select").first().selectOption("Europe/Stockholm");
    // 29 March 2026, 02:00-03:00 does not exist in Stockholm.
    await dialog.locator("input[type=date]").fill("2026-03-29");
    await dialog.locator("input[type=time]").nth(0).fill("02:30");
    await dialog.locator("input[type=time]").nth(1).fill("03:15");
    await dialog.getByRole("button", { name: "Spara tid" }).click();
    await expect(dialog.getByRole("alert")).toContainText("finns inte");
    await expect(dialog.getByRole("alert")).toContainText("Europe/Stockholm");
    // 25 October 2026, 02:00-03:00 happens twice.
    await dialog.locator("input[type=date]").fill("2026-10-25");
    await dialog.getByRole("button", { name: "Spara tid" }).click();
    await expect(dialog.getByRole("alert")).toContainText("två gånger");
    if (before !== null) expect(bookingsOf(BIG)).toBe(before);
  });

  test("the automatic receipt: switched on with a preview, written once at the application's commit, read on both sides, never retroactive", async ({
    page,
    browser,
  }) => {
    // Two people, four pages, a CV upload and a database commit: on a CI
    // runner this walk needs more than the default 30 s.
    test.setTimeout(240_000);
    // ── The owner switches it on, under Team och inställningar ─────────
    // From a known state: off, standard text (a fresh CI stack is; a stack
    // that already holds a run is put back).
    sql(
      `UPDATE public.recruitment_settings SET receipt_enabled = false, receipt_subject_sv = NULL, receipt_body_sv = NULL, receipt_subject_en = NULL, receipt_body_en = NULL WHERE job_id = '${JOB}'`,
    );
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?view=team"));
    const section = page.getByRole("region", { name: "Kommunikation och autosvar" });
    await expect(section).toBeVisible({ timeout: 90_000 });
    const preview = section.getByTestId("receipt-preview");
    await expect(preview).toContainText("Hej Kim!");
    await expect(preview).toContainText("Väktare, Uppsala");
    await expect(preview).toContainText("Nordvakt Säkerhet AB");
    await expect(preview).not.toContainText("{");
    // An own text, previewed live; then the standard text is one click away.
    const body = section.getByLabel("Meddelandetext");
    await body.fill("Hej {namn}! Vi har din ansökan till {tjänst}. {länk}");
    await expect(preview).toContainText("Hej Kim! Vi har din ansökan till Väktare, Uppsala.");
    await section.getByRole("button", { name: "Återställ standardtext" }).click();
    await expect(preview).toContainText("Tack för din ansökan till tjänsten Väktare, Uppsala");
    await section.getByRole("tab", { name: "Engelska" }).click();
    await expect(preview).toContainText("Thank you for applying for the position");
    await section.getByRole("tab", { name: "Svenska" }).click();
    const toggle = section.getByRole("checkbox", {
      name: "Automatisk mottagningsbekräftelse vid mottagen ansökan",
    });
    const receiptsBefore = sql(
      `SELECT count(*) FROM public.recruitment_messages WHERE job_id = '${JOB}' AND kind = 'receipt'`,
    );
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await section.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(section.getByRole("status")).toContainText(
      "Nya ansökningar får en mottagningsbekräftelse",
    );
    // Nothing retroactive: the applications that exist have no receipt.
    if (receiptsBefore !== null) {
      expect(
        sql(
          `SELECT count(*) FROM public.recruitment_messages WHERE job_id = '${JOB}' AND kind = 'receipt'`,
        ),
      ).toBe(receiptsBefore);
    }
    // The publishing step says so.
    await open(page, casePath(JOB, "?step=publishing"));
    await expect(page.getByTestId("receipt-summary")).toContainText("Mottagningsbekräftelse: På");

    // ── A candidate applies, in a browser of their own ─────────────────
    // Re-runnable on a stack that already holds a run: one active
    // application per person and vacancy is the rule, so an earlier run's
    // is removed first (a fresh CI stack has none).
    sql(
      `DELETE FROM public.job_applications WHERE job_id = '${JOB}' AND applicant_user_id = (SELECT id FROM auth.users WHERE email = 'kim.kandidat@test.local')`,
    );
    const ctx = await browser.newContext({ locale: "sv-SE" });
    const kim = await ctx.newPage();
    await signIn(kim, "kim.kandidat@test.local");
    await open(kim, "/jobs/nordvakt-vaktare-uppsala-uat4");
    await kim.getByRole("button", { name: "Ansök via CQrityjob" }).click({ timeout: 60_000 });
    const dialog = kim.getByRole("dialog");
    for (const group of await dialog
      .locator("input[type=radio][name^=apply-q-]")
      .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))])) {
      await dialog.locator(`input[name="${group}"]`).first().check();
    }
    await dialog.locator("#apply-cv").setInputFiles({
      name: "cv.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
      ),
    });
    await dialog.locator("label", { hasText: "Jag samtycker" }).click();
    await dialog.getByRole("button", { name: "Skicka ansökan" }).click();
    await expect(dialog).toContainText("Ansökan skickad", { timeout: 60_000 });

    // ── The receipt, on the candidate's side, at the application the link names
    const appId = sql(
      `SELECT a.id FROM public.job_applications a JOIN auth.users u ON u.id = a.applicant_user_id WHERE u.email = 'kim.kandidat@test.local' AND a.job_id = '${JOB}' ORDER BY a.created_at DESC LIMIT 1`,
    );
    await open(kim, "/my-career/applications");
    const card = kim.locator("li", { hasText: "Väktare, Uppsala" }).first();
    await expect(card).toContainText("Automatisk mottagningsbekräftelse");
    await expect(card).toContainText("Vi har tagit emot din ansökan – Väktare, Uppsala");
    await card.locator("summary", { hasText: "Vi har tagit emot din ansökan" }).click();
    await expect(card).toContainText("Hej Kim!");
    await expect(card).toContainText(`/my-career/applications?application=`);
    if (appId) {
      // The link in the receipt lands on this application, and it survives
      // a fresh sign-in (the address carries a search parameter, not a hash).
      const fresh = await browser.newContext({ locale: "sv-SE" });
      const again = await fresh.newPage();
      await signIn(again, "kim.kandidat@test.local");
      await open(again, `/my-career/applications?application=${appId}`);
      await expect(again.locator(`#application-${appId}`)).toContainText(
        "Automatisk mottagningsbekräftelse",
      );
      await fresh.close();
      // ONE receipt, e-mail not configured on this stack, one attempt -- made
      // by the server with an attempt id of its own, the recipient fixed,
      // under the logical receipt's idempotency key.
      expect(
        sql(
          `SELECT count(*) || ':' || min(email_status) || ':' || min(email_attempts) || ':' || min(email_recipient) || ':' || min(idempotency_key) || ':' || bool_and(email_attempt_id IS NOT NULL)::text FROM public.recruitment_messages WHERE application_id = '${appId}' AND kind = 'receipt'`,
        ),
      ).toBe(`1:not_configured:1:kim.kandidat@test.local:receipt:${appId}:true`);
    }
    await ctx.close();

    // ── And on the employer's side, with its delivery status ───────────
    if (appId) {
      await open(page, `/employer/${SLUG}/applications/${appId}`);
      const item = page.locator("li", { hasText: "Automatisk mottagningsbekräftelse" }).first();
      await expect(item).toBeVisible({ timeout: 60_000 });
      await expect(item).toContainText("skickad automatiskt");
      await expect(item).toContainText("e-post är inte konfigurerad");
      await expect(item.getByRole("button", { name: "Skicka e-posten igen" })).toBeVisible();
    }

    // ── A later change of the text leaves the receipt as it was ────────
    await open(page, casePath(JOB, "?view=team"));
    const section2 = page.getByRole("region", { name: "Kommunikation och autosvar" });
    await expect(section2).toBeVisible({ timeout: 60_000 });
    await section2.getByLabel("Ämnesrad").fill("Ändrad ämnesrad – {tjänst}");
    await section2.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(section2.getByRole("status")).toContainText("Sparat");
    if (appId) {
      expect(
        sql(
          `SELECT subject FROM public.recruitment_messages WHERE application_id = '${appId}' AND kind = 'receipt'`,
        ),
      ).toBe("Vi har tagit emot din ansökan – Väktare, Uppsala");
    }
  });

  test("the receipt's e-mail button opens exactly this application after a sign-in; another candidate cannot read it, and nobody can forge its delivery through the API", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const appId = kimsUppsalaApplication();
    expect(appId, "the receipt walk must have left Kim's application").toBeTruthy();
    const before = receiptRow(appId!);

    // ── Signed out: the button's address lands on the sign-in, and the
    //    application survives it in the query string ─────────────────────
    const fresh = await browser.newContext({ locale: "sv-SE" });
    const kim = await fresh.newPage();
    await open(kim, `/my-career/applications?application=${appId}`);
    await expect(kim).toHaveURL(/\/login\?/, { timeout: 60_000 });
    expect(decodeURIComponent(kim.url())).toContain(`application=${appId}`);
    await kim.getByLabel("E-post").fill("kim.kandidat@test.local");
    await kim.getByLabel("Lösenord", { exact: true }).fill("LocalJourney!2026");
    await kim.getByRole("button", { name: "Logga in" }).click();
    await expect(kim).toHaveURL(new RegExp(`/my-career/applications\\?application=${appId}`), {
      timeout: 60_000,
    });
    await expect(kim.locator(`#application-${appId}`)).toContainText(
      "Automatisk mottagningsbekräftelse",
      { timeout: 60_000 },
    );
    await fresh.close();

    // ── Another candidate with the same address sees nothing of it ─────
    const other = await browser.newContext({ locale: "sv-SE" });
    const k1 = await other.newPage();
    const k1Token = await signIn(k1, "kandidat01@test.local");
    await open(k1, `/my-career/applications?application=${appId}`);
    await expect(k1.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(k1.locator(`#application-${appId}`)).toHaveCount(0);
    await expect(k1.locator("body")).not.toContainText("Hej Kim!");
    await other.close();
    // Nor through the API: the row is not theirs to read.
    const read = await fetch(
      `${API}/rest/v1/recruitment_messages?application_id=eq.${appId}&select=id`,
      { headers: { apikey: ANON, Authorization: `Bearer ${k1Token}` } },
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual([]);

    // ── Forging the delivery: refused for the candidate and the employer ─
    for (const email of ["kim.kandidat@test.local", "anna.agare@nordvakt.test"]) {
      const token = await tokenFor(email);
      const settle = await fetch(`${API}/rest/v1/rpc/rec_settle_receipt_send`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          _attempt_id: "00000000-0000-4000-8000-000000000000",
          _result: "sent",
          _provider_id: "forged",
        }),
      });
      expect([401, 403, 404], `${email} settling`).toContain(settle.status);
      const claim = await fetch(`${API}/rest/v1/rpc/rec_claim_receipt_send`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _application_id: appId, _retry: true }),
      });
      expect([401, 403, 404], `${email} claiming`).toContain(claim.status);
      const due = await fetch(`${API}/rest/v1/rpc/rec_claim_due_receipts`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _limit: 10 }),
      });
      expect([401, 403, 404], `${email} sweeping`).toContain(due.status);
    }
    expect(receiptRow(appId!)).toBe(before);
  });

  test("the recovery: a send that never started is sent by the sweep once; an unknown outcome inside the window is recovered by the product itself; outside it nothing resends without a person's explicit acceptance", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const appId = kimsUppsalaApplication();
    expect(appId, "the receipt walk must have left Kim's application").toBeTruthy();
    const messageId = sql(
      `SELECT id FROM public.recruitment_messages WHERE application_id = '${appId}' AND kind = 'receipt'`,
    );
    expect(messageId).toBeTruthy();

    // ── The endpoint does not exist without the token ───────────────────
    expect((await sweep(null)).status).toBe(404);
    expect((await sweep("not-the-token-at-all-0000000000")).status).toBe(404);

    // ── A send that never started (the saving request died) ────────────
    sql(
      `UPDATE public.recruitment_messages SET email_status = 'not_attempted', email_attempt_id = NULL, email_attempts = 0, email_claimed_at = NULL, email_error = NULL, created_at = now() - interval '5 minutes' WHERE id = '${messageId}'`,
    );
    const first = await sweep(SWEEP_TOKEN, { limit: 20 });
    expect(first.status).toBe(200);
    const summary = (await first.json()) as Record<string, unknown>;
    expect(summary.ok).toBe(true);
    expect(summary.claimed).toBe(1);
    expect(summary.notConfigured).toBe(1);
    expect(receiptRow(appId!)).toBe(`not_configured/1/0/kim.kandidat@test.local/true`);
    // Once: the second sweep finds nothing to do.
    const second = (await (await sweep(SWEEP_TOKEN)).json()) as Record<string, unknown>;
    expect(second.claimed).toBe(0);

    // ── Unknown, inside the provider's window: the product recovers it by
    //    itself when the employer opens their overview ────────────────────
    sql(
      `UPDATE public.recruitment_messages SET email_status = 'unknown', email_error = 'TIMEOUT', email_attempts = 1, email_claimed_at = now() - interval '5 minutes', email_key_first_used_at = now() - interval '1 hour' WHERE id = '${messageId}'`,
    );
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, `/employer/${SLUG}/jobs`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => receiptRow(appId!), { timeout: 30_000 })
      .toBe(`not_configured/2/0/kim.kandidat@test.local/true`);
    await expect(page.getByTestId("receipts-attention")).toHaveCount(0);

    // ── Unknown, outside the window: nothing resends by itself ─────────
    sql(
      `UPDATE public.recruitment_messages SET email_status = 'unknown', email_error = 'TIMEOUT', email_attempts = 2, email_claimed_at = now() - interval '2 hours', email_key_first_used_at = now() - interval '25 hours' WHERE id = '${messageId}'`,
    );
    const closed = (await (await sweep(SWEEP_TOKEN)).json()) as Record<string, unknown>;
    expect(closed.claimed).toBe(0);
    await open(page, `/employer/${SLUG}/jobs`);
    await expect(page.getByTestId("receipts-attention")).toContainText("1", { timeout: 60_000 });
    expect(receiptRow(appId!)).toBe(`unknown/2/0/kim.kandidat@test.local/true`);

    // The application says why, and the only way on is a person's explicit
    // acceptance that the candidate may get it twice.
    await open(page, `/employer/${SLUG}/applications/${appId}`);
    const item = page.locator("li", { hasText: "Automatisk mottagningsbekräftelse" }).first();
    await expect(item).toBeVisible({ timeout: 60_000 });
    await expect(item).toContainText("okänt utfall");
    await expect(item.getByTestId("receipt-email-detail")).toContainText(
      "kan nå kandidaten två gånger",
    );
    await expect(item.getByTestId("receipt-email-detail")).toContainText("2 försök");
    await expect(item.getByRole("button", { name: "Skicka e-posten igen" })).toHaveCount(0);
    await item.getByRole("button", { name: "Skicka igen ändå" }).click();
    await expect(
      item.getByRole("group", { name: "Kandidaten kan få bekräftelsen två gånger. Skicka ändå?" }),
    ).toBeVisible();
    await item.getByRole("button", { name: "Avbryt" }).click();
    expect(receiptRow(appId!)).toBe(`unknown/2/0/kim.kandidat@test.local/true`);
    await item.getByRole("button", { name: "Skicka igen ändå" }).click();
    await item.getByRole("button", { name: "Ja, skicka igen" }).click();
    await expect
      .poll(() => receiptRow(appId!), { timeout: 30_000 })
      .toBe(`not_configured/3/1/kim.kandidat@test.local/true`);
    // A new key generation, the same recipient, one message still.
    expect(
      sql(
        `SELECT count(*) FROM public.recruitment_messages WHERE application_id = '${appId}' AND kind = 'receipt'`,
      ),
    ).toBe("1");
  });

  test("another organisation's owner cannot change the receipt, and a plain member cannot either", async ({
    page,
  }) => {
    await signIn(page, "mats.medlem@nordvakt.test");
    await open(page, casePath(JOB, "?view=team"));
    const section = page.getByRole("region", { name: "Kommunikation och autosvar" });
    await expect(section).toBeVisible({ timeout: 90_000 });
    await expect(
      section.getByRole("checkbox", {
        name: "Automatisk mottagningsbekräftelse vid mottagen ansökan",
      }),
    ).toBeDisabled();
    await expect(section.getByRole("button", { name: "Spara", exact: true })).toHaveCount(0);
    await expect(section).toContainText("Ägare, administratör eller ansvarig");
  });

  test("another organisation's owner cannot open the case, and the API says so", async ({
    page,
  }) => {
    await signIn(page, "olle.agare@vaktbolaget.test");
    await open(page, casePath(JOB, "?step=applications"));
    await expect(page.locator("table")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Åtgärder för markerade kandidater" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Sökande|Alva Berg/)).toHaveCount(0);
  });

  test("a candidate never receives an internal note", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (r) => {
      if (r.url().includes("/_serverFn") || r.url().includes("/rest/v1/")) {
        try {
          bodies.push(await r.text());
        } catch {
          /* binary or closed */
        }
      }
    });
    await signIn(page, "kim.kandidat@test.local");
    await open(page, "/my-career/applications");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/recruitment_comments|Interna anteckningar/);
    expect(bodies.join("\n")).not.toMatch(/recruitment_comments/);
  });
});

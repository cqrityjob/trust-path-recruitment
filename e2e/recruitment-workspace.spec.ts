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
async function signIn(page: Page, email: string) {
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
  await page.goto("/");
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem("cqrityjob.lang", "sv");
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)] as const,
  );
}

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
    await page.goto(casePath(JOB, "?step=applications"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
    await page.goto(casePath(JOB, "?step=applications"));
    await expect(pager(page)).toContainText(/Visar 1–25 av (\d+)/);
    const first = await idsOnPage(page);
    expect(first).toHaveLength(25);
    await pager(page).getByRole("button", { name: "Nästa" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager(page)).toContainText(/Visar 26–/);
    const second = await idsOnPage(page);
    expect(second.length).toBeGreaterThan(0);
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
    await page.goto(casePath(JOB, "?step=applications&page=99"));
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
  });

  test("5 050 applications: the total is the total, the last page is the last, and the oldest fifty are there", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await page.goto(casePath(BIG, "?step=applications&stage=all"));
    // The header count, the chip and the pager all say 5 050 -- a number the
    // old read, capped at 5 000, could never have shown.
    await expect(page.getByText("5050 ansökningar")).toBeVisible();
    await expect(pager(page)).toContainText("Visar 1–25 av 5050");
    await expect(pager(page)).toContainText("Sida 1 av 202");
    await expect(nameLinks(page).first()).toHaveText("Sökande 5050");
    await page.goto(casePath(BIG, "?step=applications&stage=all&page=202"));
    await expect(pager(page)).toContainText("Visar 5026–5050 av 5050");
    await expect(nameLinks(page)).toHaveCount(25);
    await expect(nameLinks(page).last()).toHaveText("Sökande 0001");
    // The oldest applicant -- the first one the old limit dropped -- is
    // found by search, and opens.
    await page.goto(casePath(BIG, "?step=applications&stage=all&q=S%C3%B6kande%200001"));
    await expect(pager(page)).toContainText("Visar 1–1 av 1");
    await expect(nameLinks(page)).toHaveCount(1);
    await nameLinks(page).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sökande 0001");
    await expect(page.getByText("1 av 1")).toBeVisible();
    // Filters over the whole list, not a sample: the licence question was
    // answered yes by every odd-numbered applicant.
    await page.goto(casePath(BIG, "?step=applications&stage=all"));
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
    await page.goto(casePath(BIG, "?step=applications&stage=all&page=201"));
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
    await page.goto(casePath(JOB, "?step=applications&stage=new"));
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
    await page.goto(casePath(JOB, "?step=applications&sort=name&page=2"));
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
    await page.goto(casePath(JOB, "?step=applications&stage=all"));
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
    await page.goto(casePath(BIG, "?step=applications&stage=open"));
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
    await page.goto(casePath(BIG, "?step=applications&stage=open"));
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

  test("another organisation's owner cannot open the case, and the API says so", async ({
    page,
  }) => {
    await signIn(page, "olle.agare@vaktbolaget.test");
    await page.goto(casePath(JOB, "?step=applications"));
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
    await page.goto("/my-career/applications");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/recruitment_comments|Interna anteckningar/);
    expect(bodies.join("\n")).not.toMatch(/recruitment_comments/);
  });
});

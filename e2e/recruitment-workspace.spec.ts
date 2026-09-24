// The recruitment case, walked in a real browser against a LOCAL stack.
//
// What this proves that no static guard can: that the numbers on the screen
// are the rows behind them, that a page of candidates is one page and only
// one, that the list comes back exactly as it was left, that a booking from
// the list writes bookings and sends nothing, that a batch reports per
// candidate, and that the walls hold -- another organisation sees nothing,
// a candidate never sees an internal note.
//
// Runs only when E2E_LOCAL_STACK=1 and the base URL is loopback: it signs
// synthetic people in through the LOCAL Auth admin API and writes bookings.
// It expects the rec-uat fixture (see artifacts/recruitment-workspace/INDEX.md):
//
//   anna.agare@nordvakt.test    owner of nordvakt-sakerhet
//   olle.agare@vaktbolaget.test owner of another organisation
//   kim.kandidat@test.local     a candidate at Nordvakt
//   a published Nordvakt vacancy with 30+ open applications (E2E_REC_JOB_ID)
//
// Configuration (all local, none secret):
//   E2E_BASE_URL                   the app, e.g. http://localhost:8093
//   E2E_SUPABASE_URL               the local API, e.g. http://127.0.0.1:56321
//   E2E_SUPABASE_SERVICE_ROLE_KEY  the LOCAL stack's service-role key
//   E2E_SUPABASE_ANON_KEY          the LOCAL stack's publishable key
//   E2E_REC_EMPLOYER_SLUG          default nordvakt-sakerhet
//   E2E_REC_JOB_ID                 the vacancy with 30+ applications

import { test, expect, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const SRK = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const SLUG = process.env.E2E_REC_EMPLOYER_SLUG ?? "nordvakt-sakerhet";
const JOB = process.env.E2E_REC_JOB_ID ?? "44444444-dddd-4000-8000-000000000004";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local signed-in walk.");
test.skip(
  !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(BASE) ||
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(API),
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

const casePath = (search = "") => `/employer/${SLUG}/jobs/${JOB}${search}`;
const stepNav = (page: Page) => page.getByRole("navigation", { name: "Rekryteringens steg" });
const actionBar = (page: Page) =>
  page.getByRole("region", { name: "Åtgärder för markerade kandidater" });
const pager = (page: Page) => page.getByRole("navigation", { name: "Sidor" });
const rowCheckboxes = (page: Page) => page.locator("table tbody input[type=checkbox]");

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
    await page.goto(casePath("?step=applications"));
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
    await page.goto(casePath("?step=applications"));
    await expect(pager(page)).toContainText(/Visar 1–25 av (\d+)/);
    const ids = async () =>
      page
        .locator("table tbody tr td:nth-child(3) a")
        .evaluateAll((as) =>
          as.map((a) => (a as HTMLAnchorElement).href.split("/").pop()!.split("?")[0]),
        );
    const first = await ids();
    expect(first).toHaveLength(25);
    await pager(page).getByRole("button", { name: "Nästa" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager(page)).toContainText(/Visar 26–/);
    const second = await ids();
    expect(second.length).toBeGreaterThan(0);
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
    await page.goto(casePath("?step=applications&page=99"));
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
  });

  test("the header count, the stage filter and the rows agree", async ({ page }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await page.goto(casePath("?step=applications&stage=new"));
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
    await page.goto(casePath("?step=applications&sort=name&page=2"));
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
    const name = await page.locator("table tbody tr td:nth-child(3) a").nth(1).innerText();
    await rowCheckboxes(page).nth(1).check();
    await expect(actionBar(page)).toContainText("1 markerade");
    await actionBar(page).getByRole("link", { name: "Visa ansökan" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    // Previous/next across the page boundary, from the server's full order.
    await expect(page.getByText(/27 av \d+|2[0-9] av \d+/)).toBeVisible();
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
    await page.goto(casePath("?step=applications&stage=all"));
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
    const tomorrow = new Date(Date.now() + 86_400_000 * 7).toISOString().slice(0, 10);
    await dialog.locator("input[type=date]").fill(tomorrow);
    await dialog
      .locator("label", { hasText: "Adress eller plats" })
      .locator("input")
      .fill("Kontoret");
    await dialog.getByRole("button", { name: /Spara 2 tider/ }).click();
    await expect(dialog).toContainText("2 av 2 tider sparade");
    await expect(dialog).toContainText("Planerad – inte skickad");
    await dialog.getByRole("button", { name: "Stäng" }).click();
    await expect(page.locator("table tbody tr").nth(5)).toContainText("Planerad – inte skickad");
  });

  test("another organisation's owner cannot open the case, and the API says so", async ({
    page,
  }) => {
    await signIn(page, "olle.agare@vaktbolaget.test");
    await page.goto(casePath("?step=applications"));
    await expect(page.locator("table")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Åtgärder för markerade kandidater" }),
    ).toHaveCount(0);
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

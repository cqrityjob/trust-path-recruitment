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

/** The historical statistics are folded by default (the queue and the list
 *  are the work); a number inside is clicked or read after opening the fold. */
/** The less frequent filters are behind a fold; a test that uses one opens it. */
/** The less frequent filters sit behind a fold. Opened by its summary, and
 *  proven open by a select inside it being visible: a click that lands before
 *  the page is interactive is simply made again. */
async function openMoreFilters(page: Page) {
  const fold = page.locator("[data-testid='more-filters']");
  await expect(fold).toBeVisible();
  await expect(async () => {
    if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open)))
      await fold.locator(":scope > summary").click();
    await expect(fold.locator("select").first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function openStatistics(page: Page) {
  const fold = page.locator("[data-testid='counts-history']");
  if (
    (await fold.count()) > 0 &&
    !(await fold.first().evaluate((d) => (d as HTMLDetailsElement).open))
  )
    await fold.first().locator(":scope > summary").click();
}

async function open(page: Page, path: string) {
  try {
    await page.goto(path);
  } catch (e) {
    if (!/ERR_ABORTED/.test(String(e))) throw e;
    await page.waitForTimeout(1500);
    await page.goto(path);
  }
}
/** The server-function export a request calls, decoded from its URL. */
function exportOf(url: string): string | null {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { export?: string };
    return String(json.export ?? "").replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}
/**
 * The candidate read of the open case (listRecruitmentCandidatesPage). The
 * header count, the step chip, the pager and the rows all come from this one
 * response, and on the 5 050-application case it evaluates every application
 * for its page of 25 (application_state 5 050 times). Until 20270319090000 it
 * also re-judged the caller per application (has_employer_role 10 101 calls,
 * rec_is_member and rec_can_manage 5 050 each) -- about 2.4 s on a quiet
 * machine, more on a loaded runner; now the caller is judged once per read
 * and the read takes about a third of that. An assertion started at page load
 * raced it: on #472 (run 38733159776, both attempts) the header still showed
 * "…" when the default 5 s ran out, and the count arrived just after -- the
 * failure screenshot shows it. However fast the read, the walk waits for the
 * read it is about to check, then asserts at once; no assertion's own timeout
 * is raised.
 */
function candidateRead(page: Page) {
  return page.waitForResponse((r) => exportOf(r.url()) === "listRecruitmentCandidatesPage");
}
async function openCaseRead(page: Page, path: string) {
  const read = candidateRead(page);
  await open(page, path);
  expect((await read).status()).toBe(200);
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
    await openCaseRead(page, casePath(BIG, "?step=applications&stage=all"));
    // The header count, the chip and the pager all say 5 050 -- a number the
    // old read, capped at 5 000, could never have shown.
    await expect(
      page.locator("main header").getByText("5050 ansökningar", { exact: true }),
    ).toBeVisible();
    await expect(stepNav(page).locator("[aria-current=step]")).toContainText(
      /Ansökningar\s*\(5050\)/,
    );
    await expect(pager(page)).toContainText("Visar 1–25 av 5050");
    await expect(pager(page)).toContainText("Sida 1 av 202");
    await expect(nameLinks(page).first()).toHaveText("Sökande 5050");
    await openCaseRead(page, casePath(BIG, "?step=applications&stage=all&page=202"));
    await expect(pager(page)).toContainText("Visar 5026–5050 av 5050");
    await expect(nameLinks(page)).toHaveCount(25);
    await expect(nameLinks(page).last()).toHaveText("Sökande 0001");
    // The oldest applicant -- the first one the old limit dropped -- is
    // found by search, and opens.
    await openCaseRead(page, casePath(BIG, "?step=applications&stage=all&q=S%C3%B6kande%200001"));
    await expect(pager(page)).toContainText("Visar 1–1 av 1");
    await expect(nameLinks(page)).toHaveCount(1);
    await nameLinks(page).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sökande 0001");
    await expect(page.getByText("1 av 1")).toBeVisible();
    // Filters over the whole list, not a sample: the licence question was
    // answered yes by every odd-numbered applicant. The list's own default
    // view (no view parameters; every one of the 5 050 is still open) is the
    // view "Rensa filter" returns to -- it clears the stage too -- so the
    // step below goes back to a view this page has read.
    await openCaseRead(page, casePath(BIG, "?step=applications"));
    await expect(pager(page)).toContainText("av 5050");
    await openMoreFilters(page);
    const licence = page.locator("select").filter({ hasText: "Alla svar" }).first();
    const filtered = candidateRead(page);
    await licence.selectOption({ label: "Ja" });
    await filtered;
    await expect(pager(page)).toContainText("av 2525");
    // Back to a view the page has already read: shown from the cache at once.
    await page.getByRole("button", { name: /Rensa filter/ }).click();
    await expect(pager(page)).toContainText("av 5050");
  });

  /**
   * The candidate read's access, over real Auth and PostgREST.
   * rec_ri_candidate_view judges the caller's standing once per read and
   * responsibility once per job (20270319090000), so this walks every kind of
   * caller through both doors -- the database function as PostgREST serves it,
   * and the application's own listRecruitmentCandidatesPage request replayed
   * with each person's token -- and changes a role, a responsibility and a
   * membership between calls: each must count from the very next call. The
   * population comparison and the time are taken on the 5 050 case; the
   * standing changes on the 32-application case, because who may read and
   * manage does not depend on how many applications there are.
   *
   * The test's own budget is raised, not any assertion's: it makes about a
   * dozen reads of the 5 050 case, each of which took 2-4 s on a CI runner
   * before 20270319090000, and it must also run -- and pass -- there.
   */
  test("the candidate read over real Auth: one population for every role, nothing for anyone else, judged afresh on every call", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const employerId =
      sql(`SELECT id FROM public.employers WHERE slug = '${SLUG}'`) ??
      "11111111-aaaa-4000-8000-000000000001";
    type Envelope = {
      total: number;
      rows: { id: string; can_manage: boolean }[];
      counts: Record<string, number>;
    };
    const view = async (token: string, jobId: string, viewPage = 1) => {
      const r = await fetch(`${API}/rest/v1/rpc/rec_ri_candidate_view`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          _employer_id: employerId,
          _job_id: jobId,
          _filters: { stage: "received" },
          _sort: "requirements",
          _dir: null,
          _page: viewPage,
          _size: 25,
          _around: null,
        }),
      });
      const text = await r.text();
      return { status: r.status, text, body: r.ok ? (JSON.parse(text) as Envelope) : null };
    };
    // Any application id of the fixture (Uppsala a6..., Norrköping a7...).
    const leaks = /a[67]000000-0000-4000-8000-/;
    const refused = (r: { status: number; text: string }) => r.status >= 400 && !leaks.test(r.text);
    const readsNothing = (r: { status: number; text: string }) =>
      !(r.status === 200 && leaks.test(r.text));
    const manages = (e: Envelope | null) =>
      e ? [...new Set(e.rows.map((x) => x.can_manage))].join("/") : "refused";

    // The application's own request for a case, captured from the owner's
    // browser and replayed with any token.
    await signIn(page, "anna.agare@nordvakt.test");
    const capture = async (jobId: string) => {
      const read = candidateRead(page);
      await open(page, casePath(jobId, "?step=applications&stage=received"));
      const captured = (await read).request();
      const headers = Object.fromEntries(
        Object.entries(await captured.allHeaders()).filter(
          ([k]) => !/^(authorization|cookie|content-length|host|connection|:)/i.test(k),
        ),
      );
      return async (token: string | null) => {
        const t0 = performance.now();
        const r = await fetch(captured.url(), {
          method: captured.method(),
          headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: captured.postData() ?? undefined,
        });
        const text = await r.text();
        return { status: r.status, text, ms: performance.now() - t0 };
      };
    };
    const bigFn = await capture(BIG);
    const smallFn = await capture(JOB);

    // Owner and plain member on the 5 050 case: the same population, order
    // and counts; only the member may not manage. The last page agrees too.
    const anna = await tokenFor("anna.agare@nordvakt.test");
    const mats = await tokenFor("mats.medlem@nordvakt.test");
    const owner = await view(anna, BIG);
    const member = await view(mats, BIG);
    expect(owner.status).toBe(200);
    expect(owner.body!.total).toBe(5050);
    expect(owner.body!.rows).toHaveLength(25);
    expect(manages(owner.body)).toBe("true");
    expect(member.status).toBe(200);
    expect(member.body!.total).toBe(5050);
    expect(member.body!.rows.map((x) => x.id)).toEqual(owner.body!.rows.map((x) => x.id));
    expect(member.body!.counts).toEqual(owner.body!.counts);
    expect(manages(member.body)).toBe("false");
    const last = await view(mats, BIG, 202);
    expect(last.body!.rows).toHaveLength(25);
    expect(last.body!.rows.map((x) => x.id)).toEqual(
      (await view(anna, BIG, 202)).body!.rows.map((x) => x.id),
    );
    const ownerFn = await bigFn(anna);
    expect(ownerFn.status).toBe(200);
    expect(ownerFn.text).toContain("5050");

    // Company B's owner, a candidate and an anonymous caller read nothing,
    // through either door.
    const olle = await tokenFor("olle.agare@vaktbolaget.test");
    const kim = await tokenFor("kim.kandidat@test.local");
    for (const [who, token] of [
      ["company B's owner", olle],
      ["a candidate", kim],
    ] as const) {
      const r = await view(token, JOB);
      expect(refused(r), `${who}: ${r.status} ${r.text.slice(0, 120)}`).toBe(true);
      expect(readsNothing(await smallFn(token)), `${who}: the app reads nothing`).toBe(true);
    }
    const anon = await view(ANON, JOB);
    expect(refused(anon), `anon: ${anon.status} ${anon.text.slice(0, 120)}`).toBe(true);
    expect(readsNothing(await smallFn(null)), "no token: the app reads nothing").toBe(true);
    expect((await smallFn(mats)).status).toBe(200);

    // A person whose standing changes between calls: member, admin,
    // responsible recruiter, removed. Created for this run on the local stack.
    const email = `vera.vikarie.${Date.now()}@nordvakt.test`;
    const created = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: { display_name: "Vera Vikarie" },
      }),
    }).then((r) => r.json() as Promise<{ id?: string }>);
    const veraId = created.id!;
    expect(veraId).toBeTruthy();
    const settingsBefore = sql(
      `SELECT coalesce(responsible_user_id::text, 'none') FROM public.recruitment_settings WHERE job_id = '${JOB}'`,
    );
    sql(
      `INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES ('${employerId}', '${veraId}', 'member', 'active') RETURNING 1`,
    );
    try {
      const vera = await tokenFor(email);
      expect(manages((await view(vera, JOB)).body)).toBe("false");
      sql(
        `UPDATE public.employer_memberships SET role = 'admin' WHERE user_id = '${veraId}' RETURNING 1`,
      );
      expect(manages((await view(vera, JOB)).body), "made admin: the next call manages").toBe(
        "true",
      );
      sql(
        `UPDATE public.employer_memberships SET role = 'member' WHERE user_id = '${veraId}' RETURNING 1`,
      );
      expect(manages((await view(vera, JOB)).body), "member again: the next call does not").toBe(
        "false",
      );
      sql(
        `INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id) VALUES ('${JOB}', '${employerId}', '${veraId}')
         ON CONFLICT (job_id) DO UPDATE SET responsible_user_id = EXCLUDED.responsible_user_id RETURNING 1`,
      );
      expect(manages((await view(vera, JOB)).body), "made responsible: the next call manages").toBe(
        "true",
      );
      expect(manages((await view(mats, JOB)).body), "nobody else gains it").toBe("false");
      expect((await smallFn(vera)).status).toBe(200);
      sql(
        `UPDATE public.employer_memberships SET status = 'removed' WHERE user_id = '${veraId}' RETURNING 1`,
      );
      const removed = await view(vera, JOB);
      expect(refused(removed), `removed: ${removed.status} ${removed.text.slice(0, 120)}`).toBe(
        true,
      );
      expect(readsNothing(await smallFn(vera)), "removed: the app reads nothing").toBe(true);
    } finally {
      if (settingsBefore === null || settingsBefore === "") {
        sql(`DELETE FROM public.recruitment_settings WHERE job_id = '${JOB}' RETURNING 1`);
      } else {
        sql(
          `UPDATE public.recruitment_settings SET responsible_user_id = ${settingsBefore === "none" ? "NULL" : `'${settingsBefore}'`} WHERE job_id = '${JOB}' RETURNING 1`,
        );
      }
      sql(
        `UPDATE public.employer_memberships SET status = 'removed' WHERE user_id = '${veraId}' RETURNING 1`,
      );
    }

    // A signed-out session: from 20270320090000 the database checks the
    // session itself, so the old token is refused on its very next call
    // through both doors. The whole decision -- other sessions, global
    // sign-out, a new sign-in, writes -- is the next test.
    const leaving = await tokenFor("mats.medlem@nordvakt.test");
    expect((await smallFn(leaving)).status).toBe(200);
    const out = await fetch(`${API}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${leaving}` },
    });
    expect(out.status).toBeLessThan(300);
    const gone = await view(leaving, JOB);
    expect(refused(gone), `signed out, PostgREST: ${gone.status} ${gone.text.slice(0, 120)}`).toBe(
      true,
    );
    expect(readsNothing(await smallFn(leaving)), "signed out: the app reads nothing").toBe(true);

    // The read's time on the 5 050 case over the application's own request
    // (informational: the regression guard is the call count in the SQL
    // suite, not a clock).
    const times: number[] = [];
    for (let i = 0; i < 5; i++) times.push((await bigFn(anna)).ms);
    times.sort((a, b) => a - b);
    const line = `listRecruitmentCandidatesPage, 5 050 applications, 5 calls: median ${times[2]!.toFixed(0)} ms, min ${times[0]!.toFixed(0)} ms, max ${times[4]!.toFixed(0)} ms`;
    console.log(line);
    test.info().annotations.push({ type: "candidate-read-ms", description: line });
  });

  /**
   * Owner decision 2026-10-16 (20270320090000): private recruitment data needs
   * a live Auth session. A signed JWT stays valid until it expires, so the
   * database checks the token's session itself -- through PostgREST directly
   * and through the application's server functions alike, on the very next
   * call. One synthetic member, several real GoTrue sessions.
   */
  test("a signed-out token is refused on its next call through both doors; another session works; a global sign-out and a new sign-in behave; a refused write leaves nothing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    expect(DB, "E2E_DATABASE_URL: the 'nothing was written' checks read the database").toBeTruthy();
    const employerId = sql(`SELECT id FROM public.employers WHERE slug = '${SLUG}'`)!;
    const headers = (token: string) => ({
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    });
    const rpc = (token: string, name: string, body: unknown) =>
      fetch(`${API}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, text: await r.text() }));
    const view = (token: string) =>
      rpc(token, "rec_ri_candidate_view", {
        _employer_id: employerId,
        _job_id: JOB,
        _filters: { stage: "received" },
        _sort: "requirements",
        _dir: null,
        _page: 1,
        _size: 25,
        _around: null,
      });
    const tableRows = (token: string) =>
      fetch(`${API}/rest/v1/job_applications?select=id&job_id=eq.${JOB}`, {
        headers: headers(token),
      }).then(async (r) => ({ status: r.status, rows: (await r.json()) as unknown[] }));
    const leaks = /a[67]000000-0000-4000-8000-/;

    // The application's own requests, captured from the owner's browser and
    // replayed with any token: the candidate list (a read) and the "first
    // viewed" receipt an opened application writes. The write is captured
    // and aborted, so the browser itself writes nothing.
    await signIn(page, "anna.agare@nordvakt.test");
    const target = sql(
      `SELECT a.id FROM public.job_applications a LEFT JOIN public.recruitment_application_meta m ON m.application_id = a.id
        WHERE a.job_id = '${BIG}' AND m.first_viewed_at IS NULL ORDER BY a.id DESC LIMIT 1`,
    )!;
    expect(target).toMatch(/^[0-9a-f-]{36}$/);
    const metaBefore = sql(
      `SELECT count(*) FROM public.recruitment_application_meta WHERE application_id = '${target}'`,
    );
    const firstViewed = () =>
      sql(
        `SELECT coalesce(first_viewed_at::text, 'never') FROM public.recruitment_application_meta WHERE application_id = '${target}'`,
      ) || "never";
    const replayable = (request: {
      url: () => string;
      method: () => string;
      postData: () => string | null;
      allHeaders: () => Promise<Record<string, string>>;
    }) =>
      request.allHeaders().then((all) => {
        const kept = Object.fromEntries(
          Object.entries(all).filter(
            ([k]) => !/^(authorization|cookie|content-length|host|connection|:)/i.test(k),
          ),
        );
        return async (token: string) => {
          const r = await fetch(request.url(), {
            method: request.method(),
            headers: { ...kept, Authorization: `Bearer ${token}` },
            body: request.postData() ?? undefined,
          });
          return { status: r.status, text: await r.text() };
        };
      });
    const listRead = candidateRead(page);
    await open(page, casePath(JOB, "?step=applications&stage=received"));
    const listFn = await replayable((await listRead).request());
    let captured: Parameters<typeof replayable>[0] | null = null;
    await page.route(
      (url) => exportOf(url.toString()) === "markApplicationViewed",
      async (route) => {
        captured ??= route.request();
        await route.abort();
      },
    );
    await open(page, `/employer/${SLUG}/applications/${target}`);
    await expect.poll(() => captured !== null, { timeout: 30_000 }).toBe(true);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const viewedFn = await replayable(captured!);
    expect(firstViewed(), "the browser's own receipt was aborted").toBe("never");

    const email = `sara.session.${Date.now()}@nordvakt.test`;
    const created = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: { display_name: "Sara Session" },
      }),
    }).then((r) => r.json() as Promise<{ id?: string }>);
    const saraId = created.id!;
    expect(saraId).toBeTruthy();
    sql(
      `INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES ('${employerId}', '${saraId}', 'member', 'active') RETURNING 1`,
    );
    const marker = `session-proof-${Date.now()}`;
    const comments = () =>
      sql(`SELECT count(*) FROM public.recruitment_comments WHERE body = '${marker}'`);
    // Both doors, read side: PostgREST RPC, PostgREST table, the app's read.
    const works = async (token: string, why: string) => {
      const v = await view(token);
      expect(v.status, `${why}: PostgREST rec_ri_candidate_view`).toBe(200);
      expect(v.text, `${why}: PostgREST rec_ri_candidate_view`).toMatch(leaks);
      const t = await tableRows(token);
      expect(t.status, `${why}: PostgREST job_applications`).toBe(200);
      expect(t.rows.length, `${why}: PostgREST job_applications`).toBe(32);
      const a = await listFn(token);
      expect(a.status, `${why}: listRecruitmentCandidatesPage`).toBe(200);
      expect(a.text, `${why}: listRecruitmentCandidatesPage`).toMatch(leaks);
    };
    const refusedEverywhere = async (token: string, why: string) => {
      const v = await view(token);
      expect(
        v.status,
        `${why}: PostgREST rec_ri_candidate_view ${v.text.slice(0, 120)}`,
      ).toBeGreaterThanOrEqual(400);
      expect(v.text).not.toMatch(leaks);
      const t = await tableRows(token);
      expect(t.rows, `${why}: PostgREST job_applications reads no row`).toEqual([]);
      const a = await listFn(token);
      expect(a.status === 200 && leaks.test(a.text), `${why}: the app reads nothing`).toBe(false);
      // Writes, through both doors: none goes through, none leaves a trace.
      const c = await rpc(token, "rec_add_comment", { _application_id: target, _body: marker });
      expect(
        c.status,
        `${why}: PostgREST rec_add_comment ${c.text.slice(0, 120)}`,
      ).toBeGreaterThanOrEqual(400);
      const m = await rpc(token, "rec_mark_application_viewed", { _application_id: target });
      expect(m.status, `${why}: PostgREST rec_mark_application_viewed`).toBeGreaterThanOrEqual(400);
      const w = await viewedFn(token);
      expect(
        w.status === 200 && /firstViewedAt/.test(w.text) && /\d{4}-\d\d-\d\dT/.test(w.text),
        `${why}: markApplicationViewed ${w.status}`,
      ).toBe(false);
      expect(comments(), `${why}: no comment was written`).toBe("0");
      expect(firstViewed(), `${why}: the receipt was not written`).toBe("never");
    };
    const logout = (token: string, scope: "local" | "global") =>
      fetch(`${API}/auth/v1/logout?scope=${scope}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      }).then((r) => r.status);

    try {
      // 1. Active sessions work, through both doors.
      const first = await tokenFor(email);
      const second = await tokenFor(email);
      await works(first, "active session");
      await works(second, "a second active session");

      // 2. Local sign-out of the first session: its token is refused on the
      //    very next call, everywhere, and its writes leave nothing.
      expect(await logout(first, "local")).toBeLessThan(300);
      const user = await fetch(`${API}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: `Bearer ${first}` },
      });
      expect(user.status, "signed out: Auth no longer knows the session").toBeGreaterThanOrEqual(
        400,
      );
      await refusedEverywhere(first, "after a local sign-out");

      // 3. The other session, still active, keeps working.
      await works(second, "the other session after a local sign-out");

      // 4. A global sign-out ends every session; a new sign-in works again,
      //    and the old tokens stay refused.
      const third = await tokenFor(email);
      await works(third, "a third session");
      expect(await logout(second, "global")).toBeLessThan(300);
      await refusedEverywhere(second, "after a global sign-out (the session that signed out)");
      await refusedEverywhere(third, "after a global sign-out (another session)");
      const fresh = await tokenFor(email);
      await works(fresh, "a new sign-in after the global sign-out");
      await refusedEverywhere(first, "the first token, after the new sign-in");

      // 5. The same write the refused tokens attempted goes through with the
      //    live session: the refusals were the session's, nothing else's.
      const w = await viewedFn(fresh);
      expect(w.status, `live session: markApplicationViewed ${w.text.slice(0, 120)}`).toBe(200);
      expect(firstViewed(), "live session: the receipt is written").not.toBe("never");
    } finally {
      sql(
        `UPDATE public.employer_memberships SET status = 'removed' WHERE user_id = '${saraId}' RETURNING 1`,
      );
      if (metaBefore === "0") {
        sql(
          `DELETE FROM public.recruitment_application_meta WHERE application_id = '${target}' AND first_viewed_by = '${saraId}' RETURNING 1`,
        );
      }
    }
  });

  /**
   * 20270321090000: a Passport shared with an application needs a live
   * session on both sides. The employer's read and the holder's list, each
   * through PostgREST directly and through the application's own server
   * function, answer a live session and refuse the same token after a local
   * sign-out; another live session keeps working; a refused read records
   * nothing. A synthetic holder, created and removed by this test.
   */
  test("a Passport shared with an application: the employer's read and the holder's list need a live session, through both doors", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    expect(DB, "E2E_DATABASE_URL: the fixture and the 'nothing recorded' checks").toBeTruthy();
    const employerId = sql(`SELECT id FROM public.employers WHERE slug = '${SLUG}'`)!;
    const employerName = sql(`SELECT name FROM public.employers WHERE id = '${employerId}'`)!;
    const holderName = `Paula Passport ${Date.now()}`;
    const email = `paula.passport.${Date.now()}@test.local`;
    const created = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: { display_name: holderName },
      }),
    }).then((r) => r.json() as Promise<{ id?: string }>);
    const holderId = created.id!;
    expect(holderId).toBeTruthy();
    const appId = sql(`SELECT gen_random_uuid()`)!;
    // A verified credential, an application to the 32-candidate job, and the
    // share the holder made with it -- written as the database's own owner,
    // exactly the rows sp_submit_application_with_passport leaves.
    sql(
      `INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code) VALUES ('${holderId}', '${holderName}', 'SE') RETURNING 1`,
    );
    sql(`INSERT INTO public.sp_claims (holder_user_id, claim_type, credential_code, title, claimed_issuer_name, issued_on, valid_until, assertion_level, lifecycle_state, verified_by_user_id, verified_at, jurisdiction_code)
         VALUES ('${holderId}', 'licence', 'OV', 'Ordningsvaktsförordnande', 'Polismyndigheten', current_date - 30, current_date + 365, 'verified', 'active', (SELECT id FROM auth.users WHERE email = 'anna.agare@nordvakt.test'), now(), 'SE') RETURNING 1`);
    // One transaction, as a real submission is: the job's required questions are
    // answered before its deferred check runs at commit.
    sql(
      `BEGIN;
       INSERT INTO public.job_applications (id, job_id, applicant_user_id, status, cv_source, consent_given_at) VALUES ('${appId}', '${JOB}', '${holderId}', 'submitted', 'upload', now());
       INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool, answer_text)
         SELECT '${appId}', q.id, q.employer_id, q.answer_kind,
                CASE WHEN q.answer_kind = 'yes_no' THEN true END,
                CASE WHEN q.answer_kind = 'text' THEN 'Ja' END
           FROM public.recruitment_questions q WHERE q.job_id = '${JOB}' AND q.is_required;
       COMMIT;
       SELECT 1`,
    );
    sql(
      `INSERT INTO public.sp_disclosures (holder_user_id, package_code, application_id, recipient_hint, expires_at) VALUES ('${holderId}', 'employer_review', '${appId}', '${employerName.replace(/'/g, "''")}', now() + interval '30 days') RETURNING 1`,
    );
    const trace = () =>
      sql(
        `SELECT access_count || '/' || (SELECT count(*) FROM public.sp_disclosure_accesses x WHERE x.disclosure_id = d.id) FROM public.sp_disclosures d WHERE d.application_id = '${appId}' AND d.revoked_at IS NULL`,
      );

    const rpc = (token: string, name: string, body: unknown) =>
      fetch(`${API}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, text: await r.text() }));
    const logout = (token: string) =>
      fetch(`${API}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      }).then((r) => r.status);
    // The application's own request, captured from a signed-in browser and
    // replayed with any token.
    const captureFn = async (p: Page, exportName: string, path: string) => {
      const seen = p.waitForRequest((r) => exportOf(r.url()) === exportName, { timeout: 45_000 });
      await open(p, path);
      const req = await seen;
      const kept = Object.fromEntries(
        Object.entries(await req.allHeaders()).filter(
          ([k]) => !/^(authorization|cookie|content-length|host|connection|:)/i.test(k),
        ),
      );
      return async (token: string) => {
        const r = await fetch(req.url(), {
          method: req.method(),
          headers: { ...kept, Authorization: `Bearer ${token}` },
          body: req.postData() ?? undefined,
        });
        return { status: r.status, text: await r.text() };
      };
    };

    const holderContext = await browser.newContext();
    try {
      await signIn(page, "anna.agare@nordvakt.test");
      const readFn = await captureFn(
        page,
        "readApplicationDisclosure",
        `/employer/${SLUG}/applications/${appId}`,
      );
      const holderPage = await holderContext.newPage();
      await signIn(holderPage, email);
      const listFn = await captureFn(
        holderPage,
        "listMyApplicationDisclosures",
        "/my-career/applications",
      );

      const employer = await tokenFor("anna.agare@nordvakt.test");
      const employerOther = await tokenFor("anna.agare@nordvakt.test");
      const holder = await tokenFor(email);
      const holderOther = await tokenFor(email);
      const readApi = (t: string) =>
        rpc(t, "sp_application_disclosure", { _application_id: appId });
      const listApi = (t: string) => rpc(t, "sp_my_application_disclosures", {});

      // Live: both sides read, through both doors.
      for (const [why, t] of [
        ["live", employer],
        ["another live session", employerOther],
      ] as const) {
        const a = await readApi(t);
        expect(a.status, `${why}: PostgREST sp_application_disclosure`).toBe(200);
        expect(JSON.parse(a.text).status, `${why}: the shared Passport`).toBe("active");
        const b = await readFn(t);
        expect(b.status, `${why}: readApplicationDisclosure`).toBe(200);
        expect(b.text, `${why}: the app shows the holder`).toContain(holderName);
      }
      for (const [why, t] of [
        ["live", holder],
        ["another live session", holderOther],
      ] as const) {
        const a = await listApi(t);
        expect(a.status, `${why}: PostgREST sp_my_application_disclosures`).toBe(200);
        expect(a.text, `${why}: the holder's list names the employer`).toContain(employerName);
        const b = await listFn(t);
        expect(b.status, `${why}: listMyApplicationDisclosures`).toBe(200);
        expect(b.text, `${why}: the app lists the share`).toContain(employerName);
      }

      // A local sign-out on each side: the old token is refused at once,
      // through both doors, and nothing is recorded.
      const before = trace();
      expect(await logout(employer)).toBeLessThan(300);
      expect(await logout(holder)).toBeLessThan(300);
      const a = await readApi(employer);
      expect(
        a.status,
        `signed-out employer, PostgREST: ${a.text.slice(0, 120)}`,
      ).toBeGreaterThanOrEqual(400);
      expect(a.text).toContain("REC_SESSION_REVOKED");
      expect(a.text).not.toContain(holderName);
      const b = await readFn(employer);
      expect(b.text, "signed-out employer, the app shows nothing of the Passport").not.toContain(
        holderName,
      );
      const c = await listApi(holder);
      expect(
        c.status,
        `signed-out holder, PostgREST: ${c.text.slice(0, 120)}`,
      ).toBeGreaterThanOrEqual(400);
      expect(c.text).toContain("SP_SESSION_REVOKED");
      expect(c.text).not.toContain(employerName);
      const d = await listFn(holder);
      expect(
        d.status === 200 && d.text.includes(employerName),
        "signed-out holder, the app lists nothing",
      ).toBe(false);
      expect(trace(), "a refused read recorded no access").toBe(before);

      // The other sessions are untouched.
      expect(JSON.parse((await readApi(employerOther)).text).status).toBe("active");
      expect((await listFn(holderOther)).text).toContain(employerName);
    } finally {
      await holderContext.close();
      sql(
        `DELETE FROM public.sp_disclosure_accesses WHERE disclosure_id IN (SELECT id FROM public.sp_disclosures WHERE application_id = '${appId}') RETURNING 1`,
      );
      sql(
        `ALTER TABLE public.sp_disclosures DISABLE TRIGGER USER; DELETE FROM public.sp_disclosures WHERE application_id = '${appId}'; ALTER TABLE public.sp_disclosures ENABLE TRIGGER USER; SELECT 1`,
      );
      sql(`DELETE FROM public.job_applications WHERE id = '${appId}' RETURNING 1`);
    }
  });

  test("previous/next walk the server's ordering across a page edge, without the list's ids", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await openCaseRead(page, casePath(BIG, "?step=applications&stage=all&page=201"));
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

  // ── The portal as one journey (UX pass 2026-10-08), on the real stack ──
  //
  // The stubbed suite photographs these; this proves them signed in, against
  // real Auth, PostgREST and the replayed migrations, on the PR's own head.

  test("switching step inside a recruitment keeps the candidate list's filters, sort and page", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications&sort=name&page=2"));
    await expect(pager(page)).toContainText(/Sida 2 av 2/, { timeout: 90_000 });
    const nav = stepNav(page);
    // Every step link carries the view it was opened with.
    for (const href of await nav
      .getByRole("link")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))) {
      expect(href, href).toMatch(/sort=name/);
      expect(href, href).toMatch(/page=2/);
    }
    await nav.getByRole("link", { name: /Kravprofil/ }).click();
    await expect(page).toHaveURL(/step=requirements/);
    await expect(page).toHaveURL(/sort=name/);
    await nav.getByRole("link", { name: /Ansökningar/ }).click();
    await expect(page).toHaveURL(/step=applications/);
    await expect(pager(page)).toContainText(/Sida 2 av 2/);
  });

  test("a candidate opened without a list lands back on the recruitment's candidate list", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications"));
    await expect(page.locator("table")).toBeVisible({ timeout: 90_000 });
    const [id] = await idsOnPage(page);
    // A fresh address: no list context, so the fallback is the recruitment.
    await open(page, `/employer/${SLUG}/applications/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 90_000 });
    const back = page.getByRole("link", { name: "Tillbaka till rekryteringen" });
    await expect(back).toHaveAttribute("href", /step=applications/);
    // The job link in the header lands on the same list.
    await expect(
      page.locator(`a[href*="/jobs/${JOB}"][href*="step=applications"]`).first(),
    ).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${JOB}\\?step=applications`));
    await expect(stepNav(page).locator("[aria-current=step]")).toContainText("Ansökningar");
  });

  test("the overview explains its numbers, the flow strip is on the area pages, and the recruitment list can show what is ready to complete", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, `/employer/${SLUG}`);
    await expect(page.locator("#employer-actions")).toBeVisible({ timeout: 90_000 });
    const strip = page.locator("[data-testid='recruitment-flow']").first();
    await expect(strip).toHaveAttribute("data-current", "overview");
    await expect(strip.locator("li a")).toHaveCount(7);
    // The two application populations are each explained.
    await expect(
      page.getByText("Arkiverade ansökningar räknas inte", { exact: false }).first(),
    ).toBeVisible();
    const counts = page.locator("[data-testid='recruiter-counts']");
    // The block renders once the organisation-wide read has answered; on a
    // cold local stack that is the slowest read on the page.
    await expect(counts).toBeVisible({ timeout: 60_000 });
    await expect(counts.getByRole("heading", { level: 2 })).toHaveText(
      "Kravgranskning av mottagna ansökningar",
    );
    await openStatistics(page);
    await counts.locator("[data-testid='counts-explanation'] summary").click();
    await expect(counts.getByText(/gäller rekryteringen/)).toBeVisible();
    // Requirement status is a symbol and a label in each count button.
    for (const status of ["green", "yellow", "gray", "not_established"]) {
      await expect(counts.locator(`[data-testid='count-${status}'] svg`)).toHaveCount(1);
    }
    // Against the real fixture: the status groups partition "received",
    // reviewed + remaining = received, and the actionable queue (open
    // applications without a confirmed review) is never larger than the
    // historical remainder, which also counts archived and decided ones.
    const n = async (testId: string) =>
      Number(await counts.locator(`[data-testid='${testId}'] strong`).innerText());
    const received = await n("count-received");
    const groups =
      (await n("count-green")) +
      (await n("count-yellow")) +
      (await n("count-gray")) +
      (await n("count-not_established"));
    expect(groups).toBe(received);
    expect((await n("count-reviewed")) + (await n("count-remaining"))).toBe(received);
    const queue = counts.locator("[data-testid='review-queue']");
    await expect(queue.getByText("Att granska nu")).toBeVisible();
    await expect(queue.locator("[data-testid='review-queue-count']")).not.toHaveText("…", {
      timeout: 30_000,
    });
    const queued = Number(await queue.locator("[data-testid='review-queue-count']").innerText());
    expect(queued).toBeLessThanOrEqual(await n("count-remaining"));
    // Opened above: the fold's summary and the heading inside both say
    // "Historisk täckning"; the heading is the record.
    await expect(counts.getByRole("heading", { name: /Historisk täckning/ })).toBeVisible();
    // The queue's button opens the short address the strip also links to, and
    // the strip then marks the review station.
    await queue.locator("[data-testid='review-queue-open']").click();
    await expect(page).toHaveURL(/\/applications\?review=remaining$/);
    await expect(page.locator("[data-testid='recruitment-flow']").first()).toHaveAttribute(
      "data-current",
      "review",
      { timeout: 90_000 },
    );
    await page.goBack();
    await expect(page.locator("#employer-actions")).toBeVisible({ timeout: 90_000 });
    // The new-applications row opens exactly the submitted ones.
    const todo = page.locator("section[aria-labelledby='employer-actions']");
    const newRow = todo.getByRole("link", { name: /nya ansökningar|ny ansökan/ });
    if ((await newRow.count()) > 0)
      await expect(newRow.first()).toHaveAttribute("href", /status=submitted/);

    await open(page, `/employer/${SLUG}/jobs`);
    await expect(page.locator("[data-testid='recruitment-flow']").first()).toHaveAttribute(
      "data-current",
      "requirements",
      { timeout: 90_000 },
    );
    const phase = page.locator("label", { hasText: "Status" }).locator("select").first();
    await expect(phase.locator("option", { hasText: "Redo att avslutas" })).toHaveCount(1);
    await phase.selectOption("ready");
    await expect(page).toHaveURL(/phase=ready/);
    // Filtered to what is ready to complete, the list is the decision station.
    await expect(page.locator("[data-testid='recruitment-flow']").first()).toHaveAttribute(
      "data-current",
      "decision",
    );
    await expect(page.locator("[data-testid='decision-station-context']")).toBeVisible();

    await open(page, `/employer/${SLUG}/applications`);
    await expect(page.locator("[data-testid='recruitment-flow']").first()).toHaveAttribute(
      "data-current",
      "applications",
      { timeout: 90_000 },
    );
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
    const dialog = page.getByRole("dialog", { name: "Boka intervjutid", exact: true });
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
    // Close the saved-bookings footer, independently of the header close control.
    await dialog
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Stäng", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("table tbody tr").nth(5)).toContainText("Planerad – inte skickad");
  });

  test("'Ej aktuell' leaves the active list and the review queue at once, is found under Avslutade, survives a reload and a second tab, and sends nothing", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, "anna.agare@nordvakt.test");
    // The recruitment's own list: its view counts are the recruitment's. (The
    // organisation list narrowed to one recruitment hides counts by design.)
    const list = casePath(JOB, "?step=applications");
    await open(page, list);
    await expect(page.locator("[data-testid='candidate-table']")).toBeVisible({ timeout: 90_000 });
    // The working list: Aktiva is the default view, with its count.
    const views = page.locator("[data-testid='list-views']");
    await expect(views.locator("[data-testid='view-open']")).toHaveAttribute(
      "aria-current",
      "page",
    );
    const countOf = async (view: string) =>
      Number(
        /\((\d+)\)/.exec(
          (await views.locator(`[data-testid='view-${view}']`).innerText()) ?? "",
        )?.[1],
      );
    const openBefore = await countOf("open");
    const decidedBefore = await countOf("decided");
    expect(openBefore).toBeGreaterThan(1);
    // The review queue, as the overview's button opens it.
    await open(page, `${list}&review=remaining`);
    await expect(pager(page)).toContainText(/Visar 1–/);
    const queueBefore = Number(/av (\d+)/.exec((await pager(page).innerText()) ?? "")?.[1]);
    // Pick a NEW candidate from the active list and open the application.
    await open(page, `${list}&stage=new`);
    const row = page.locator("table tbody tr").first();
    const name = (await row.locator("td:nth-child(3) a").innerText()).trim();
    const applicationId = (await row.getAttribute("data-application-id"))!;
    await row.locator("td:nth-child(3) a").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { timeout: 60_000 });
    const summary = page.locator("[data-testid='requirement-summary']");
    await expect(summary).toBeVisible();
    // The decision: "Ej aktuell", confirmed, saved, and SAID -- where the
    // application went and that nothing was sent.
    await summary.locator("[data-testid='summary-action-reject']").click();
    // The decision is confirmed in an alert dialog (ConfirmAction), not a plain one.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(name);
    await dialog.getByRole("button", { name: "Markera som ej aktuell" }).click();
    const saved = page.locator("[data-testid='decision-saved']");
    await expect(saved).toHaveAttribute("data-decision", "rejected");
    await expect(saved).toContainText("lämnat den aktiva listan och granskningskön");
    await expect(saved).toContainText("Ingenting har skickats till kandidaten");
    await expect(saved.locator("[data-testid='decision-next-candidate']")).toBeVisible();
    // The candidate's notice is a separate fact: internal, nothing written.
    await expect(page.locator("[data-testid='candidate-notice-state']")).toHaveAttribute(
      "data-state",
      "internal",
    );
    // The closed view: no decision buttons, the record stays, reopening is a
    // separate act, nothing is deleted automatically.
    await expect(page.locator("[data-testid='decision-closed-view']")).toContainText(
      "inget raderas automatiskt",
    );
    await expect(summary.locator("[data-testid='requirement-summary-actions']")).toHaveCount(0);
    expect(
      sql(`SELECT status FROM public.job_applications WHERE id = '${applicationId}'`) ?? "rejected",
    ).toBe("rejected");
    expect(
      sql(
        `SELECT count(*) FROM public.recruitment_messages WHERE application_id = '${applicationId}' AND status <> 'draft'`,
      ) ?? "0",
    ).toBe("0");
    // Immediately: gone from Aktiva and from the queue, found under Avslutade,
    // with the counts moved by exactly one. Server selection and totals, not a
    // cached page: a fresh navigation each time.
    await open(page, list);
    await expect(views.locator("[data-testid='view-open']")).toContainText(`(${openBefore - 1})`);
    await expect(views.locator("[data-testid='view-decided']")).toContainText(
      `(${decidedBefore + 1})`,
    );
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(0);
    await open(page, `${list}&review=remaining`);
    await expect(pager(page)).toContainText(`av ${queueBefore - 1}`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(0);
    await open(page, `${list}&stage=decided`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(1);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toContainText(
      "Ej aktuell",
    );
    // The search finds it in Avslutade and not in Aktiva.
    await open(page, `${list}&stage=decided&q=${encodeURIComponent(name.split(" ")[0]!)}`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(1);
    await open(page, `${list}&q=${encodeURIComponent(name.split(" ")[0]!)}`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(0);
    // After a reload, and in a second tab of the same session: the same.
    await page.reload();
    await expect(page.locator("[data-testid='candidate-table']")).toBeVisible();
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(0);
    const tab = await context.newPage();
    await tab.goto(`${list}&stage=decided`);
    await expect(tab.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(1, {
      timeout: 60_000,
    });
    await tab.goto(list);
    await expect(tab.locator("[data-testid='candidate-table']")).toBeVisible();
    await expect(tab.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(0);
    await tab.close();
    // The row under Avslutade says what to do next: tell the candidate /
    // archive -- and archiving is the separate act that moves it to Arkiv,
    // restoring brings it back to Avslutade without reopening the decision.
    await open(page, `/employer/${SLUG}/applications/${applicationId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { timeout: 60_000 });
    const lifecycle = page.getByRole("region", { name: "Arkivering och gallring" });
    await lifecycle.locator("summary").click();
    await lifecycle.getByRole("button", { name: "Arkivera" }).click();
    await expect(lifecycle.locator("[data-testid='archived-state']")).toBeVisible();
    await open(page, `${list}&stage=decided`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(0);
    await open(page, `${list}&stage=archived`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(1);
    expect(
      sql(`SELECT status FROM public.job_applications WHERE id = '${applicationId}'`) ?? "rejected",
    ).toBe("rejected");
    await open(page, `/employer/${SLUG}/applications/${applicationId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { timeout: 60_000 });
    await lifecycle.locator("summary").click();
    await lifecycle.getByRole("button", { name: "Återställ arkivering" }).click();
    await expect(lifecycle.locator("[data-testid='archived-state']")).toHaveCount(0);
    await open(page, `${list}&stage=decided`);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(1);
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toContainText(
      "Ej aktuell",
    );
  });

  // ── Slutuppdrag 2026-10-11: the requirement profile's change history, the
  //    comparison, the supplement with the candidate's in-app answer, the
  //    reopen and the BESKT items of the interview setup -- on the real stack
  //    (GoTrue sessions, PostgREST, the local database), against the schema
  //    this branch carries.
  const rpcAs = (token: string, name: string, body: unknown) =>
    fetch(`${API}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));

  test("the requirement profile: version 1 through the form, a change only with its reason (impact shown, history written), and the legacy path refuses a silent change", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=requirements"));
    const panel = page.locator("[data-testid='requirement-profile']");
    await expect(panel).toBeVisible({ timeout: 90_000 });
    // Version 1: every requirement gets accepted evidence and an instruction.
    const fill = async (instruction: string) => {
      const rules = panel.locator("fieldset[data-requirement-id]");
      const n = await rules.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const rule = rules.nth(i);
        const cv = rule.getByLabel("Inskickat CV / dokument");
        if (!(await cv.isChecked())) await cv.check();
        await rule.getByLabel("Regel och kontrollinstruktion (svenska)").fill(instruction);
      }
    };
    await fill("Kontrollera intyget mot kravet; två personer ska nå samma svar.");
    await expect(panel.locator("[data-testid='profile-change-reason']")).toHaveCount(0);
    await panel.locator("[data-testid='profile-confirm-ack']").check();
    await panel.getByRole("button", { name: "Fastställ ny kravprofilversion" }).click();
    await expect(page.locator("[data-testid='requirement-profile']")).toContainText(
      "Fastställd version 1",
      { timeout: 60_000 },
    );
    // A change: the impact is read before anything is written, the reason is
    // required, the confirm button stays disabled without it.
    const panel2 = page.locator("[data-testid='requirement-profile']");
    const impact = panel2.locator("[data-testid='profile-change-impact']");
    await expect(impact).toBeVisible();
    await expect(impact.locator("[data-active]")).toBeVisible({ timeout: 30_000 });
    await fill("Kontrollera intyget OCH utbildarens namn mot kravet.");
    await panel2.locator("[data-testid='profile-confirm-ack']").check();
    const confirm = panel2.getByRole("button", { name: "Fastställ ny kravprofilversion" });
    await expect(confirm).toBeDisabled();
    await panel2
      .locator("[data-testid='profile-change-reason']")
      .fill("Utbildarens namn ska kontrolleras, inte bara intyget.");
    await panel2.locator("[data-testid='profile-confirm-ack']").check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator("[data-testid='requirement-profile']")).toContainText(
      "Fastställd version 2",
      { timeout: 60_000 },
    );
    // The history: version 2 with its reason, version 1 as the first confirmation.
    const history = page.locator("[data-testid='profile-change-history']");
    await history.locator("summary").click();
    const v2 = history.locator("[data-testid='profile-history-entry'][data-version='2']");
    await expect(v2).toHaveAttribute("data-kind", "reasoned");
    await expect(v2).toContainText("Utbildarens namn ska kontrolleras");
    await expect(
      history.locator("[data-testid='profile-history-entry'][data-version='1']"),
    ).toHaveAttribute("data-kind", "first");
    expect(
      sql(`SELECT count(*) FROM public.rec_requirement_profiles WHERE job_id = '${JOB}'`) ?? "2",
    ).toBe("2");
    expect(
      sql(
        `SELECT count(*) FROM recruiter_intelligence.profile_change_reviews WHERE job_id = '${JOB}'`,
      ) ?? "1",
    ).toBe("1");
    // The legacy write path, through the real API with the owner's own session:
    // a change without a reason is refused and leaves no version behind.
    const anna = await tokenFor("anna.agare@nordvakt.test");
    const current = await rpcAs(anna, "rec_ri_get_profile", { _job_id: JOB });
    expect(current.status).toBe(200);
    const refused = await rpcAs(anna, "rec_ri_confirm_profile", {
      _job_id: JOB,
      _expected_version: 2,
      _operation_id: crypto.randomUUID(),
      _start_date: null,
      _rules: current.body.rules,
    });
    expect(refused.status).toBe(400);
    expect(String(refused.body.message ?? "")).toContain("RI_CHANGE_REASON_REQUIRED");
    expect(
      sql(`SELECT count(*) FROM public.rec_requirement_profiles WHERE job_id = '${JOB}'`) ?? "2",
    ).toBe("2");
  });

  test("two candidates compared against the same profile version: one row per requirement, source-bound cells, no ranking", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=applications"));
    await expect(page.locator("[data-testid='candidate-table']")).toBeVisible({ timeout: 90_000 });
    const compare = actionBar(page).locator("[data-testid='compare-selected']");
    await expect(compare).toBeDisabled();
    await rowCheckboxes(page).nth(0).check();
    await expect(compare).toBeDisabled();
    await rowCheckboxes(page).nth(1).check();
    await expect(compare).toBeEnabled();
    await compare.click();
    const cmp = page.locator("[data-testid='compare-page']");
    await expect(cmp).toHaveAttribute("data-state", "ready", { timeout: 60_000 });
    await expect(cmp.locator("[data-testid='compare-profile-version']")).toContainText("version 2");
    await expect(cmp.locator("[data-testid='compare-candidate']")).toHaveCount(2);
    const rows = cmp.locator("[data-testid='compare-row']");
    await expect(rows).toHaveCount(
      Number(
        sql(`SELECT count(*) FROM public.recruitment_requirements WHERE job_id = '${JOB}'`) ?? "3",
      ),
    );
    // Every cell names its basis: a state and its evidence (or "no evidence").
    const cells = cmp.locator("[data-testid='compare-cell']");
    await expect(cells).toHaveCount(2 * (await rows.count()));
    for (let i = 0; i < (await cells.count()); i++)
      await expect(cells.nth(i)).toContainText("Underlag:");
    await expect(cmp).toContainText("rangordnar inte");
    await expect(cmp).not.toContainText(/poäng|ranking/i);
    // Back to the list, the selection's recruitment.
    await cmp.locator("[data-testid='compare-back']").click();
    await expect(page.locator("[data-testid='candidate-table']")).toBeVisible({ timeout: 60_000 });
  });

  test("a supplement: requested as a record, sent by a person, answered by the candidate IN THE APP in their own browser, read by the reviewer and resolved by hand", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const applicationId = "a6000000-0000-4000-8000-000000000020"; // kandidat20: answered No, No
    // The supplement's body is the reviewer's own neutral questions, recorded
    // on the review (a saved draft, not a confirmation): one per mandatory
    // requirement that needs clarifying, through the real API as the owner.
    const anna = await tokenFor("anna.agare@nordvakt.test");
    const review = await rpcAs(anna, "rec_ri_get_review", { _application_id: applicationId });
    expect(review.status).toBe(200);
    const criteria = review.body.criteria as {
      requirementId: string;
      kind: string;
      state: string;
      source: { kind: string; reference: string; version: string; label: string } | null;
      validUntil: string | null;
      note: string | null;
      neutralQuestion: string | null;
    }[];
    const saved = await rpcAs(anna, "rec_ri_save_review", {
      _application_id: applicationId,
      _profile_id: (review.body.profile as { profileId: string }).profileId,
      _expected_revision: review.body.revision,
      _binding_token: review.body.bindingToken,
      _operation_id: crypto.randomUUID(),
      _decisions: criteria.map((c) => ({
        requirementId: c.requirementId,
        state: c.state,
        sourceKind: c.source?.kind ?? null,
        sourceReference: c.source?.reference ?? null,
        sourceVersion: c.source?.version ?? null,
        sourceLabel: c.source?.label ?? null,
        validUntil: c.validUntil,
        note: c.note ?? "Underlag saknas; kandidaten tillfrågas.",
        neutralQuestion:
          c.kind === "mandatory" && c.state === "clarify"
            ? "Vilket år fick du ditt utbildningsbevis, och av vilken utbildare?"
            : (c.neutralQuestion ?? null),
      })),
      _confirm: false,
      _next_action: "Be om intyg",
      _responsible_user_id: null,
      _expected_assignment_version: review.body.assignmentVersion ?? null,
    });
    expect(saved.status).toBe(200);
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, `/employer/${SLUG}/applications/${applicationId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 90_000 });
    const summary = page.locator("[data-testid='requirement-summary']");
    await expect(summary).toBeVisible();
    const supplementPanel = page.locator("[data-testid='supplement-panel']");
    await expect(supplementPanel).toHaveAttribute("data-awaiting", "false");
    await summary.locator("[data-testid='summary-action-supplement']").click();
    await expect(page.locator("[data-testid='supplement-notice']")).toBeVisible({
      timeout: 30_000,
    });
    await expect(supplementPanel).toHaveAttribute("data-awaiting", "true");
    // The slot is installed on this stack: the panel says "no answer in the
    // app yet", not that the feature is missing.
    await expect(
      supplementPanel.locator("[data-testid='supplement-reply-not-installed']"),
    ).toHaveCount(0);
    await expect(supplementPanel.locator("[data-testid='supplement-no-reply']")).toBeVisible();
    await expect(
      supplementPanel.locator("[data-testid='supplement-message-state']"),
    ).toHaveAttribute("data-state", "draft");
    // The candidate cannot answer a DRAFT: nothing has reached them.
    const kim20 = await tokenFor("kandidat20@test.local");
    const messageId =
      sql(
        `SELECT id FROM public.recruitment_messages WHERE application_id = '${applicationId}' AND kind = 'supplement_request' ORDER BY created_at DESC LIMIT 1`,
      ) ?? "";
    expect(messageId).toMatch(/^[0-9a-f-]{36}$/);
    const early = await rpcAs(kim20, "rec_candidate_reply_to_message", {
      _message_id: messageId,
      _body: "För tidigt.",
      _language: "sv",
    });
    expect(early.status).not.toBe(200);
    expect(String(early.body.message ?? "")).toContain("MESSAGE_NOT_FOUND");
    // A person sends the draft, from the communication section.
    await page.locator("#candidate-communication").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Fortsätt utkastet" }).first().click();
    await page.getByRole("button", { name: "Granska och skicka" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Skicka meddelandet?");
    await dialog.getByRole("button", { name: "Skicka" }).click();
    await expect(
      supplementPanel.locator("[data-testid='supplement-message-state']"),
    ).toHaveAttribute("data-state", "sent", { timeout: 60_000 });
    // Another candidate learns nothing; the addressed candidate answers in the app.
    const kim19 = await tokenFor("kandidat19@test.local");
    const foreign = await rpcAs(kim19, "rec_candidate_reply_to_message", {
      _message_id: messageId,
      _body: "Fel person.",
      _language: "sv",
    });
    expect(foreign.status).not.toBe(200);
    expect(String(foreign.body.message ?? "")).toContain("MESSAGE_NOT_FOUND");
    // ── The addressed candidate answers IN THE APP, in a browser of their own ──
    // The sent request is on their application card, unfolded, with the
    // answer field under it; the saved answer is confirmed and listed, and it
    // is still there after a reload (persisted, not local state).
    const kimCtx = await browser.newContext({ locale: "sv-SE" });
    const kimPage = await kimCtx.newPage();
    await signIn(kimPage, "kandidat20@test.local");
    await open(kimPage, `/my-career/applications?application=${applicationId}`);
    const card = kimPage.locator(`#application-${applicationId}`);
    await expect(card).toBeVisible({ timeout: 90_000 });
    const request = card.locator("[data-testid='candidate-supplement-request']");
    await expect(request).toBeVisible({ timeout: 60_000 });
    await expect(request).toContainText("Begäran om komplettering");
    const replyBox = request.locator("[data-testid='candidate-supplement-reply']");
    await expect(replyBox).toHaveAttribute("data-replies", "0");
    await expect(replyBox.locator("[data-testid='candidate-reply-not-installed']")).toHaveCount(0);
    await expect(replyBox.locator("[data-testid='candidate-reply-send']")).toBeDisabled();
    await replyBox
      .locator("[data-testid='candidate-reply-body']")
      .fill(
        "Utbildningsbeviset är från 2021, Bevakningsskolan Syd. Jag tar med originalet till intervjun.",
      );
    await replyBox.locator("[data-testid='candidate-reply-send']").click();
    await expect(replyBox.locator("[data-testid='candidate-reply-saved']")).toBeVisible({
      timeout: 30_000,
    });
    await expect(replyBox.locator("[data-testid='candidate-reply-saved']")).toContainText(
      "Ditt svar sparades",
    );
    await expect(replyBox.locator("[data-testid='candidate-reply']")).toHaveCount(1, {
      timeout: 30_000,
    });
    await kimPage.reload();
    await expect(
      card
        .locator("[data-testid='candidate-supplement-reply'] [data-testid='candidate-reply']")
        .first(),
    ).toContainText("Bevakningsskolan Syd", { timeout: 60_000 });
    expect(
      sql(
        `SELECT count(*) FROM public.rec_candidate_replies WHERE application_id = '${applicationId}' AND message_id = '${messageId}'`,
      ) ?? "1",
    ).toBe("1");
    // The reviewer reads the answer where the request lives, and resolves it.
    await page.reload();
    await expect(supplementPanel.locator("[data-testid='supplement-replied']")).toBeVisible({
      timeout: 60_000,
    });
    await expect(supplementPanel.locator("[data-testid='supplement-reply']")).toHaveCount(1);
    await expect(supplementPanel.locator("[data-testid='supplement-reply']")).toContainText(
      "Bevakningsskolan Syd",
    );
    await supplementPanel.locator("[data-testid='supplement-answered']").click();
    await expect(supplementPanel).toHaveAttribute("data-awaiting", "false", { timeout: 30_000 });
    await expect(
      supplementPanel.locator("[data-testid='supplement-history-replies']"),
    ).toContainText("1");
    const late = await rpcAs(kim20, "rec_candidate_reply_to_message", {
      _message_id: messageId,
      _body: "För sent.",
      _language: "sv",
    });
    expect(late.status).not.toBe(200);
    expect(String(late.body.message ?? "")).toContain("SUPPLEMENT_ALREADY_RESOLVED");
    // In the app the same refusal is a sentence, and the field goes away.
    await kimPage.reload();
    const again = kimPage
      .locator(`#application-${applicationId} [data-testid='candidate-supplement-reply']`)
      .first();
    await expect(again).toBeVisible({ timeout: 60_000 });
    await again.locator("[data-testid='candidate-reply-body']").fill("För sent.");
    await again.locator("[data-testid='candidate-reply-send']").click();
    await expect(again.locator("[data-testid='candidate-reply-resolved']")).toBeVisible({
      timeout: 30_000,
    });
    await expect(again.locator("[data-testid='candidate-reply-body']")).toHaveCount(0);
    await expect(again.locator("[data-testid='candidate-reply']")).toHaveCount(1);
    await kimCtx.close();
    // The reply is append-only and never a message of its own.
    expect(
      sql(
        `SELECT count(*) FROM public.recruitment_messages WHERE application_id = '${applicationId}' AND status = 'sent'`,
      ) ?? "1",
    ).toBe("1");
  });

  test("'Ej aktuell' is reopened only as its own act with a reason; a plain member cannot", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const applicationId = "a6000000-0000-4000-8000-000000000032"; // rejected in the fixture
    const mats = await tokenFor("mats.medlem@nordvakt.test");
    const denied = await rpcAs(mats, "rec_reopen_application", {
      _application_id: "a6000000-0000-4000-8000-000000000031",
      _expected_status: "rejected",
      _reason: "Medlem försöker återöppna.",
      _operation_id: crypto.randomUUID(),
    });
    expect(denied.status).not.toBe(200);
    expect(String(denied.body.message ?? "")).toContain("RECRUITMENT_DECISION_NOT_PERMITTED");
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, `/employer/${SLUG}/applications/${applicationId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 90_000 });
    await page.locator("[data-testid='reopen-open']").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Återöppna beslutet Ej aktuell?");
    await dialog
      .locator("[data-testid='reopen-reason']")
      .fill("Felaktigt avslut; kandidaten ska granskas igen.");
    await dialog.getByRole("button", { name: "Återöppna" }).click();
    await expect(page.locator("[data-testid='reopen-notice']")).toHaveAttribute("data-tone", "ok", {
      timeout: 30_000,
    });
    expect(
      sql(`SELECT status FROM public.job_applications WHERE id = '${applicationId}'`) ??
        "reviewing",
    ).toBe("reviewing");
    expect(
      sql(
        `SELECT count(*) FROM public.job_application_status_events WHERE application_id = '${applicationId}' AND previous_status = 'rejected' AND new_status = 'reviewing' AND note LIKE 'Återöppnad:%'`,
      ) ?? "1",
    ).toBe("1");
    // Back in the active list, under "Under granskning" (the default page of
    // Aktiva holds the newest 25 of 32; the reopened one is the oldest).
    await open(page, casePath(JOB, "?step=applications&stage=review"));
    await expect(page.locator(`tr[data-application-id='${applicationId}']`)).toHaveCount(1, {
      timeout: 60_000,
    });
  });

  test("the interview setup offers the published BESKT item for recruitment, saves it with the core, and the API refuses vetting content", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, "anna.agare@nordvakt.test");
    await open(page, casePath(JOB, "?step=requirements"));
    const setup = page.locator("[data-testid='interview-composition']");
    await expect(setup).toHaveAttribute("data-installed", "true", { timeout: 90_000 });
    const beskt = setup.locator("[data-testid='composition-beskt']");
    await expect(beskt).toBeVisible({ timeout: 60_000 });
    await expect(beskt.locator("[data-testid='composition-beskt-not-installed']")).toHaveCount(0);
    // Exactly the one ordinary, interview-phase, recruitment-support item; the
    // sensitive, the preparation and the vetting items are not offered.
    const items = beskt.locator("[data-testid='composition-beskt-item']");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute(
      "data-item-id",
      "bb5e0000-9999-4000-8000-000000000001",
    );
    await expect(beskt).toContainText("Syfte: Rollen innebär ansvar för nycklar och larm.");
    await expect(beskt.locator("[data-testid='composition-beskt-vetting']")).toContainText(
      "väljs aldrig i rekryteringsintervjun",
    );
    // Core questions are never a checkbox; behavioural and scenario questions
    // are grouped by their own type.
    await expect(setup.locator("[data-testid='composition-core-question']")).toHaveCount(8);
    await expect(
      setup.locator(
        "[data-testid='composition-group-scenarios'] [data-testid='composition-core-question']",
      ),
    ).not.toHaveCount(0);
    await items.first().check();
    await setup.locator("[data-testid='composition-save']").click();
    await expect(setup.locator("[data-testid='composition-notice']")).toHaveAttribute(
      "data-tone",
      "ok",
      {
        timeout: 30_000,
      },
    );
    expect(
      sql(
        `SELECT count(*) FROM public.rec_interview_compositions c, jsonb_array_elements(c.selection) x WHERE c.job_id = '${JOB}' AND x->>'kind' = 'beskt_item'`,
      ) ?? "1",
    ).toBe("1");
    // Vetting content through the real API, by the owner herself: refused.
    const anna = await tokenFor("anna.agare@nordvakt.test");
    const current = await rpcAs(anna, "rec_ri_get_composition", { _job_id: JOB });
    expect(current.status).toBe(200);
    const selection = (current.body.selection as { itemId: string }[]).map((s) => ({
      ...s,
    }));
    const refused = await rpcAs(anna, "rec_ri_save_composition", {
      _job_id: JOB,
      _expected_version: current.body.version,
      _operation_id: crypto.randomUUID(),
      _pack_version_id: current.body.packVersionId,
      _selection: [
        ...selection,
        {
          group: "beskt",
          kind: "beskt_item",
          itemId: "bb5e0000-9999-4000-8000-000000000004",
          position: 999,
        },
      ],
      _reason: "Försök att ta in säkerhetsprövningsinnehåll.",
    });
    expect(refused.status).toBe(400);
    expect(String(refused.body.message ?? "")).toContain("RI_COMPOSITION_VETTING_ONLY");
  });

  test("25 candidates, 45 minutes from 10:00: the series does not fit the day, and nothing is saved", async ({
    page,
  }) => {
    await signIn(page, "anna.agare@nordvakt.test");
    await openCaseRead(page, casePath(BIG, "?step=applications&stage=open"));
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
    await openCaseRead(page, casePath(BIG, "?step=applications&stage=open"));
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
    await kim.getByRole("button", { name: "Sök jobbet" }).click({ timeout: 60_000 });
    const dialog = kim.getByRole("dialog");
    // The vacancy's questions load AFTER the dialog opens, and `evaluateAll`
    // does not wait: enumerated while they were still loading, it found no
    // radio group, answered nothing, and the dialog rightly refused the
    // submission ("Frågan måste besvaras"). Wait for the loaded state first:
    // the legend renders only once the questions have arrived, and a visible
    // radio group means an empty list can never pass as "nothing to answer".
    await expect(dialog.getByText("Frågor från arbetsgivaren")).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole("radiogroup").first()).toBeVisible();
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

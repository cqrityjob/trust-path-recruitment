/**
 * BESKT PR 5B — the ROUTED walk of the interview tool inside Interview
 * Intelligence.
 *
 * Not exported components and not a rendered fragment: the real application,
 * on its real routes, signed in as real fixture accounts, writing real rows
 * through the governed PR 5A RPCs against a real PostgREST enforcing real RLS.
 *
 * Twenty named journeys, in order, because the order is the contract:
 *
 *    1 the case overview carries the BESKT module, gated by the server
 *    2 the module opens inside the case, and states what it is bound to
 *    3 the bound digests are disclosed rather than asserted
 *    4 the submitted preparation is shown whole, and neutrally
 *    5 nothing on the interviewer's surface can edit the candidate's words
 *    6 the session opens, and an empty position cannot be locked
 *    7 the themes are the database's, with their exact identity on screen
 *    8 one theme is documented in eight separate fields
 *    9 the save is reported only after the server has confirmed it
 *   10 a correction needs a reason and creates a new version
 *   11 the history keeps every version, with who wrote it and when
 *   12 a verification is requested, then updated, and the history is kept
 *   13 an open verification need is never rendered as a conclusion
 *   14 locking is confirmed through a described dialog
 *   15 the locked position is read-only and shows its own facts
 *   16 the SECOND assessor sees nothing of the first — not even over the wire
 *   17 the second assessor documents and locks their own position
 *   18 afterwards the two are shown side by side, factually, with no total
 *   19 reopening needs a reason, and nothing is lost by it
 *   20 the panel reveals, records a disagreement, and refuses an outsider
 *
 * Journey 16 is the one this whole structure exists for, and it is asserted
 * at the NETWORK: every response body the second assessor's page receives
 * before they lock is searched for the first assessor's exact words. "Not
 * rendered" would not be enough — a withheld position that arrives in a
 * payload and is merely hidden by CSS has already been disclosed.
 *
 * ── WHY IT SKIPS BY DEFAULT ────────────────────────────────────────────
 *
 * It writes rows, so it runs only against a disposable local stack, never a
 * shared or hosted backend. `scripts/local-stack/up.sh` builds that stack and
 * writes the .env.local it needs; the spec additionally refuses any base URL
 * that is not loopback.
 *
 * Reproduce:
 *   scripts/local-stack/up.sh
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *     bunx playwright test e2e/beskt-interview-tool.spec.ts \
 *       --project=chromium --project=mobile-375 --workers=1
 */

import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the routed walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The routed walk runs only against loopback — never a shared or hosted backend.",
);

// The walk signs in four times, opens a session, documents, corrects,
// verifies, locks, joins as a second person, reveals a panel and records a
// resolution. Playwright's 30 s default caps everything inside one test.
test.describe.configure({ mode: "serial", timeout: 300_000 });

const OUT = process.env.BCP_TOOL_EVIDENCE_DIR ?? "artifacts/beskt-interview-tool/live";
const PASSWORD = "LocalJourney!2026";
const INTERVIEWER = "beskt-interviewer@local.test";
const ASSESSOR = "beskt-assessor@local.test";
const OUTSIDER = "beskt-outsider@local.test";
const EMPLOYER_SLUG = process.env.E2E_TOOL_EMPLOYER_SLUG ?? "beskt-journey-ab";
const CASE_ID = process.env.E2E_TOOL_CASE_ID ?? "b5000000-0000-4000-8000-00000000cc05";
const BESKT_PATH = `/employer/${EMPLOYER_SLUG}/interview-intelligence/${CASE_ID}/beskt`;
const INTERVIEWEE = "beskt-interviewee@local.test";
const UNRELATED = "beskt-candidate2@local.test";

// The direct-call proofs talk to the same gateway the browser does, with the
// signed-in person's own token read from their own page. Nothing here holds a
// service key, and nothing is written to disk: the token lives only in memory.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const DATABASE_URL = process.env.BCP_DATABASE_URL ?? "";
const LOOPBACK = /^[a-z]+:\/\/([^@/]*@)?(localhost|127\.0\.0\.1)(:|\/|$)/;

/** The case's conduct session id, read from the disposable database itself. */
function sessionIdForCase(): string {
  if (!LOOPBACK.test(DATABASE_URL)) throw new Error("BCP_DATABASE_URL must be a loopback database");
  return execFileSync(
    "psql",
    [
      DATABASE_URL,
      "-Atc",
      `SELECT s.id FROM public.bcp_conduct_sessions s WHERE s.case_id = '${CASE_ID}' ORDER BY s.created_at DESC LIMIT 1`,
    ],
    { encoding: "utf8" },
  ).trim();
}

interface RpcAnswer {
  readonly status: number;
  readonly body: string;
}

/**
 * Call an RPC exactly as a crafted request would: straight at PostgREST,
 * skipping every screen, as whoever is signed in on `page` -- or as nobody.
 */
async function rpcAs(
  page: Page,
  fn: string,
  args: Record<string, unknown>,
  { anonymous = false }: { anonymous?: boolean } = {},
): Promise<RpcAnswer> {
  if (!LOOPBACK.test(SUPABASE_URL)) throw new Error("E2E_SUPABASE_URL must be loopback");
  let token = SUPABASE_ANON_KEY;
  if (!anonymous) {
    const stored = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i += 1) {
        const name = localStorage.key(i) ?? "";
        if (/^sb-.*-auth-token$/.test(name)) return localStorage.getItem(name);
      }
      return null;
    });
    const parsed = stored ? JSON.parse(stored) : {};
    token = parsed.access_token ?? parsed.currentSession?.access_token ?? "";
    if (!token) throw new Error("no signed-in session on this page");
  }
  // Sent from the test runner rather than the page: the local gateway answers
  // the application's own origin only, exactly like a CORS-restricted API.
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await response.text() };
}

/** A refusal: an error status, a named reason, and none of the case's words. */
function expectRefused(answer: RpcAnswer, reason: RegExp, who: string): void {
  expect(
    answer.status,
    `${who} was answered ${answer.status}: ${answer.body.slice(0, 200)}`,
  ).toBeGreaterThanOrEqual(400);
  expect(answer.body, `${who}'s refusal names its reason`).toMatch(reason);
  expect(answer.body, `${who}'s refusal carries no recorded words`).not.toMatch(/SYNTETISKT-/);
}

mkdirSync(OUT, { recursive: true });

/** The two assessors' words, unique enough to find anywhere they leak. */
const A1_FACT = "SYNTETISKT-A1-FAKTUM kandidaten beskrev nattpasset utan ledning";
const A1_FACT_CORRECTED = "SYNTETISKT-A1-RATTAT kandidaten beskrev nattpasset med bakjour";
const A2_FACT = "SYNTETISKT-A2-FAKTUM kandidaten beskrev samma pass som bemannat";
const A2_INTERPRETATION = "SYNTETISKT-A2-TOLKNING jag laser det som en annan minnesbild";
const DIVERGENT = "SYNTETISKT-AVVIKANDE de tva bedomarna minns bemanningen olika";

const TIMINGS = `${OUT}/timings.jsonl`;
async function step<T>(phase: string, name: string, body: () => Promise<T>): Promise<T> {
  return test.step(`${phase} · ${name}`, async () => {
    const started = Date.now();
    try {
      return await body();
    } finally {
      appendFileSync(
        TIMINGS,
        `${JSON.stringify({
          phase,
          step: name,
          ms: Date.now() - started,
          project: test.info().project.name,
          at: new Date().toISOString(),
        })}\n`,
      );
    }
  });
}

/** Sign in through the one door the product has, and land on `destination`. */
async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  // The sign-in form is client-rendered, and against a dev server that has
  // just restarted the first render compiles the route. Waiting for the FIELD
  // is waiting for an observable state, not for a duration — but it needs more
  // than the 5 s default, or a cold start reads as a missing form.
  const emailField = page.getByLabel(/^e-?post$|^email$/i);
  await emailField.waitFor({ state: "visible", timeout: 120_000 });
  await emailField.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  // No sleep: the URL leaving /login IS the signal that the session exists.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function useEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "en", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^en/, { timeout: 15_000 });
}

async function useSwedish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "sv", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^sv/, { timeout: 15_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${OUT}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}

/**
 * Nothing on this surface may scroll sideways. At 375 that is not a polish
 * question: an interviewer panning across a form mid-conversation will not use
 * it, and a structured record nobody fills in is worse than no record.
 */
async function expectFitsViewport(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    `the page scrolls sideways at ${innerWidth}px (scrollWidth ${scrollWidth})`,
  ).toBeLessThanOrEqual(innerWidth + 1);
}

/**
 * The vocabulary this method does not produce, allowed on screen only inside a
 * sentence that denies it. The product's own promise — "no score, no ranking,
 * no recommendation" — has to be sayable, so the check is per sentence.
 */
const SCORING =
  /\b(scores?|scored|scoring|ranks?|ranked|ranking|grades?|graded|suitability|recommendation|poäng|poängsätt\w*|betyg\w*|rangordn\w*|lämplighet\w*|rekommendation\w*)\b/i;
const DENIES_OR_DISTINGUISHES =
  /\b(no|not|never|without|neither|nor|doesn'?t|distinct|separate|unlike|rather than|instead of|different from|inte|ingen|inget|inga|aldrig|utan|varken|skil[dt]|eget|åtskil\w*|till skillnad)\b/i;

async function expectNoScoringClaim(page: Page, testId: string): Promise<void> {
  const text = (await page.getByTestId(testId).innerText()).replace(/\s+/g, " ");
  const offenders = text
    .split(/(?<=[.!?·])\s+|\n+/)
    .filter((sentence) => SCORING.test(sentence) && !DENIES_OR_DISTINGUISHES.test(sentence));
  expect(offenders, `scoring vocabulary outside a denial in ${testId}`).toEqual([]);
}

/** Fill one labelled field of the structured record, in either language. */
async function fillField(page: Page, label: RegExp, value: string): Promise<void> {
  await page.getByLabel(label).first().fill(value);
}

const L = {
  observableFact: /^Observerbart faktum$|^Observable fact$/i,
  candidateExplanation: /egen förklaring|own explanation/i,
  interpretation: /Din tolkning som intervjuare|Your interpretation as interviewer/i,
  alternative: /^Alternativ förklaring$|^Alternative explanation$/i,
  protective: /^Skyddande faktor$|^Protective factor$/i,
  verificationNeed: /^Verifieringsbehov$|^Verification need$/i,
  sensitivity: /^Känslighetsklass$|^Sensitivity class$/i,
  correctionReason: /Skäl till rättelsen|Reason for the correction/i,
  reopenReason: /Skäl till att öppna igen|Reason for reopening/i,
};

const B = {
  document: /Dokumentera temat|Document this theme/i,
  save: /Spara dokumentation|Save documentation/i,
  correct: /Rätta dokumentationen|Correct the documentation/i,
  saveCorrection: /Spara rättelse|Save correction/i,
  history: /Visa historik|Show history/i,
  verify: /^Verifiering$|^Verification$/i,
  recordVerification: /Registrera verifiering|Record verification/i,
  lock: /Lås min ståndpunkt|Lock my position/i,
  confirmLock: /Ja, lås min ståndpunkt|Yes, lock my position/i,
  reopen: /Öppna min ståndpunkt igen|Reopen my position/i,
  confirmReopen: /^Öppna igen$|^Reopen$/i,
  startSession: /Öppna samtalsstödet|Open the conversation support/i,
  join: /Ta min ståndpunkt|Take my position/i,
  openPanel: /Öppna panelen|Open the panel/i,
  reveal: /Ta fram låsta ståndpunkter|Reveal locked positions/i,
  recordResolution: /Registrera hantering|Record outcome/i,
};

/** The first derived theme's element, whichever item key the fixture produced. */
function firstTheme(page: Page) {
  return page.locator('[data-testid^="beskt-theme-"]').first();
}
function secondTheme(page: Page) {
  return page.locator('[data-testid^="beskt-theme-"]').nth(1);
}

test.describe("BESKT interview tool — the routed journey", () => {
  /* ---------------------------------------------------------------- 1 */
  test("1 · the case overview carries the BESKT module, gated by the server", async ({ page }) => {
    await step("overview", "sign in and open the interview case", () =>
      signIn(page, INTERVIEWER, `/employer/${EMPLOYER_SLUG}/interview-intelligence/${CASE_ID}`),
    );

    const card = page.getByTestId("beskt-module-card");
    await step("overview", "the module is present, and says what it does not produce", async () => {
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText(/BESKT-metodstöd/i);
      await expect(card).toContainText(/ingen poäng|ingen rangordning/i);
      await expectNoScoringClaim(page, "beskt-module-card");
      await expectFitsViewport(page);
      await shot(page, "01-overview-module-sv");
    });

    await step("overview", "the same module in English", async () => {
      await useEnglish(page);
      await expect(card).toContainText(/BESKT method support/i);
      await expect(card).toContainText(/no score|no ranking/i);
      await expectNoScoringClaim(page, "beskt-module-card");
      await shot(page, "01-overview-module-en");
      await useSwedish(page);
    });
  });

  /* ---------------------------------------------------------------- 2 */
  test("2 · the module opens inside the case and names what it is bound to", async ({ page }) => {
    await step("open", "sign in straight to the BESKT route", () =>
      signIn(page, INTERVIEWER, BESKT_PATH),
    );

    await step("open", "the tool says what BESKT is and is not, before anything else", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/BESKT-metodstöd/i, {
        timeout: 30_000,
      });
      await expect(page.locator("body")).toContainText(/inget automatiskt test/i);
      await expect(page.locator("body")).toContainText(/ingen poängsättning|ingen rangordning/i);
      await expectFitsViewport(page);
      await shot(page, "02-tool-landing-sv");
    });

    await step("open", "the method and its version are named", async () => {
      const header = page.getByTestId("beskt-method-header");
      await expect(header).toBeVisible();
      await expect(header).toContainText(/Syntetisk|SYNTETISK/i);
      await expectNoScoringClaim(page, "beskt-method-header");
    });

    await step("open", "the same landing in English", async () => {
      await useEnglish(page);
      await expect(page.locator("body")).toContainText(/not an automatic test/i);
      await shot(page, "02-tool-landing-en");
      await useSwedish(page);
    });
  });

  /* ---------------------------------------------------------------- 3 */
  test("3 · the bound digests are disclosed rather than asserted", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const header = page.getByTestId("beskt-method-header");

    await step("binding", "the digests are behind a disclosure, not on the surface", async () => {
      await expect(header).toBeVisible({ timeout: 30_000 });
      const summary = header.locator("summary");
      await expect(summary).toBeVisible();
      await summary.click();
      // A 64-character lowercase hex digest, twice: the method content and the
      // candidate's answers. An abbreviated hash is not a hash.
      const body = await header.innerText();
      const digests = body.match(/\b[0-9a-f]{64}\b/g) ?? [];
      expect(digests.length, "the bound content and answer digests").toBeGreaterThanOrEqual(2);
      await shot(page, "03-binding-disclosed-sv");
    });
  });

  /* ---------------------------------------------------------------- 4 */
  test("4 · the submitted preparation is shown whole, and neutrally", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const snap = page.getByTestId("beskt-snapshot");

    await step("snapshot", "all three candidate states are on screen, in words", async () => {
      await expect(snap).toBeVisible({ timeout: 30_000 });
      await expect(snap).toContainText(/Besvarad/);
      await expect(snap).toContainText(/Överhoppad/);
      await expect(snap).toContainText(/Tas muntligt/);
      await expect(snap).toContainText(/betyder ingenting utöver det/i);
      await expectNoScoringClaim(page, "beskt-snapshot");
      await shot(page, "04-snapshot-sv");
    });

    await step("snapshot", "a skipped answer is not dressed as a warning", async () => {
      // Colour is never the carrier here, so the assertion is over the classes
      // that WOULD carry it: no destructive or amber family anywhere in the
      // immutable snapshot.
      const classes = await snap.evaluate((el) =>
        [...el.querySelectorAll("*")].map((n) => n.className.toString()).join(" "),
      );
      expect(classes).not.toMatch(/destructive|amber|text-red|bg-red/);
    });

    await step("snapshot", "the same snapshot in English", async () => {
      await useEnglish(page);
      await expect(snap).toContainText(/Skipped/);
      await expect(snap).toContainText(/To discuss orally/);
      await shot(page, "04-snapshot-en");
      await useSwedish(page);
    });
  });

  /* ---------------------------------------------------------------- 5 */
  test("5 · nothing on the interviewer's surface can edit the candidate's words", async ({
    page,
  }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const snap = page.getByTestId("beskt-snapshot");
    await expect(snap).toBeVisible({ timeout: 30_000 });

    await step("snapshot", "the submitted answers carry no control of any kind", async () => {
      expect(await snap.locator("input, textarea, select, button").count()).toBe(0);
      await expect(snap).toContainText(/kan inte ändras härifrån/i);
      await shot(page, "05-snapshot-readonly-sv");
    });
  });

  /* ---------------------------------------------------------------- 6 */
  test("6 · the session opens, and an empty position cannot be locked", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);

    await step("session", "opening the conversation support", async () => {
      const start = page.getByRole("button", { name: B.startSession });
      await expect(start).toBeVisible({ timeout: 30_000 });
      await start.click();
      // The themes section only exists once the session does: waiting for it is
      // waiting for the server's answer, not for a duration.
      await expect(page.getByTestId("beskt-themes")).toBeVisible({ timeout: 60_000 });
      await shot(page, "06-session-open-sv");
    });

    await step("session", "an empty position names its blocker and offers no lock", async () => {
      await page.goto(`${BESKT_PATH}?view=position`);
      const position = page.getByTestId("beskt-position");
      await expect(position).toBeVisible({ timeout: 30_000 });
      await expect(position).toContainText(/Ingen dokumentation är sparad ännu/);
      await expect(page.getByRole("button", { name: B.lock })).toBeDisabled();
      await shot(page, "06-position-blocked-sv");
    });
  });

  /* ---------------------------------------------------------------- 7 */
  test("7 · the themes are the database's, with their exact identity on screen", async ({
    page,
  }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const themes = page.getByTestId("beskt-themes");

    await step("themes", "both derived themes are present with their reason", async () => {
      await expect(themes).toBeVisible({ timeout: 30_000 });
      expect(await page.locator('[data-testid^="beskt-theme-"]').count()).toBe(2);
      await expect(themes).toContainText(/Kandidaten hoppade över frågan/);
      await expect(themes).toContainText(/Kandidaten valde att ta frågan muntligt/);
      await expectNoScoringClaim(page, "beskt-themes");
    });

    await step("themes", "each theme names the exact item key and method version", async () => {
      const text = await themes.innerText();
      expect(text).toMatch(/most_recent_training|shift_patterns_worked/);
      // A UUID: the method version this session is bound to, printed in full.
      expect(text).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      await expectFitsViewport(page);
      await shot(page, "07-themes-sv");
    });

    await step("themes", "the same themes in English", async () => {
      await useEnglish(page);
      await expect(themes).toContainText(/The candidate skipped the question/);
      await shot(page, "07-themes-en");
      await useSwedish(page);
    });
  });

  /* ---------------------------------------------------------------- 8 */
  test("8 · one theme is documented in eight separate fields", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const theme = firstTheme(page);
    await expect(theme).toBeVisible({ timeout: 30_000 });

    await step("document", "the form has a field per kind of claim", async () => {
      await theme.getByRole("button", { name: B.document }).click();
      const form = theme.locator("form");
      await expect(form).toBeVisible();
      // Six free-text fields plus two governed selects. A merged note box
      // would show as one.
      expect(await form.locator("textarea").count()).toBeGreaterThanOrEqual(6);
      expect(await form.locator("select").count()).toBe(2);
      await expect(form).toContainText(/Observation och tolkning hålls isär/);
      await expectFitsViewport(page);
      await shot(page, "08-entry-form-sv");
    });

    await step("document", "each kind of claim goes in its own field", async () => {
      await fillField(page, L.observableFact, A1_FACT);
      await fillField(page, L.candidateExplanation, "SYNTETISKT kandidaten sade att bakjour fanns");
      await fillField(page, L.interpretation, "SYNTETISKT jag laser det som ensamarbete");
      await fillField(page, L.alternative, "SYNTETISKT det kan ha varit ett enstaka pass");
      await fillField(page, L.protective, "SYNTETISKT larmrutin fanns dokumenterad");
      await fillField(page, L.verificationNeed, "SYNTETISKT kontrollera schemat med arbetsgivaren");
      await page.getByLabel(L.sensitivity).selectOption("ordinary");
    });

    await step("document", "saving goes through the governed server function", async () => {
      await theme.getByRole("button", { name: B.save }).click();
      // The FORM CLOSING is the server's confirmation, and it is what this
      // asserts. Looking for the text alone would have passed against a form
      // that never closed, because the textarea still held what was typed —
      // which is exactly the defect this walk found.
      await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
      await expect(theme).toContainText(A1_FACT);
      await expect(theme).toContainText(/Dokumenterat/);
      await expect(theme).toContainText(/Version 1/);
      await shot(page, "08-entry-saved-sv");
    });
  });

  /* ---------------------------------------------------------------- 9 */
  test("9 · the save is reported only after the server has confirmed it", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const theme = secondTheme(page);
    await expect(theme).toBeVisible({ timeout: 30_000 });

    await step("confirm", "an empty record is refused before it reaches the server", async () => {
      await theme.getByRole("button", { name: B.document }).click();
      await theme.getByRole("button", { name: B.save }).click();
      await expect(theme.getByRole("alert")).toContainText(/Fyll i minst ett fält/);
      await shot(page, "09-entry-refused-sv");
    });

    await step("confirm", "and accepted, and confirmed, once it says something", async () => {
      await fillField(
        page,
        L.observableFact,
        "SYNTETISKT-A1-TEMA2 kandidaten ville ta detta muntligt",
      );
      await theme.getByRole("button", { name: B.save }).click();
      await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
      await expect(theme).toContainText(/SYNTETISKT-A1-TEMA2/);
      // The page never left the route while the save was in flight.
      expect(new URL(page.url()).pathname).toBe(BESKT_PATH);
      await shot(page, "09-entry-confirmed-sv");
    });
  });

  /* --------------------------------------------------------------- 10 */
  test("10 · a correction needs a reason and creates a new version", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const theme = firstTheme(page);
    await expect(theme).toContainText(A1_FACT, { timeout: 30_000 });

    await step("correct", "a correction without a reason is refused", async () => {
      await theme.getByRole("button", { name: B.correct }).click();
      await expect(theme.locator("form")).toContainText(/Ingen tidigare version skrivs över/);
      await fillField(page, L.observableFact, A1_FACT_CORRECTED);
      await theme.getByRole("button", { name: B.saveCorrection }).click();
      await expect(theme.getByRole("alert")).toContainText(/minst tre tecken/);
      await shot(page, "10-correction-refused-sv");
    });

    await step("correct", "with a reason it is accepted and becomes version 2", async () => {
      await fillField(page, L.correctionReason, "SYNTETISKT kandidaten förtydligade efteråt");
      await theme.getByRole("button", { name: B.saveCorrection }).click();
      await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
      await expect(theme).toContainText(A1_FACT_CORRECTED);
      await expect(theme).toContainText(/Version 2/);
      await shot(page, "10-correction-saved-sv");
    });
  });

  /* --------------------------------------------------------------- 11 */
  test("11 · the history keeps every version, with who wrote it and when", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const theme = firstTheme(page);
    await expect(theme).toBeVisible({ timeout: 30_000 });

    await step("history", "both versions are there, and which is current is said", async () => {
      await theme.getByRole("button", { name: B.history }).click();
      await expect(theme).toContainText(/Aktuell version/, { timeout: 60_000 });
      await expect(theme).toContainText(/Tidigare version/);
      // Nothing is lost: the superseded words are still readable.
      await expect(theme).toContainText(A1_FACT);
      await expect(theme).toContainText(A1_FACT_CORRECTED);
      await expect(theme).toContainText(/SYNTETISKT kandidaten förtydligade efteråt/);
      await expectFitsViewport(page);
      await shot(page, "11-history-sv");
    });
  });

  /* --------------------------------------------------------------- 12 */
  test("12 · a verification is requested, then updated, and the history is kept", async ({
    page,
  }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const theme = firstTheme(page);
    await expect(theme).toBeVisible({ timeout: 30_000 });

    await step("verify", "a settled state is refused without a source", async () => {
      await theme.getByRole("button", { name: B.verify }).click();
      const form = theme.locator("form").last();
      await form.getByLabel(/^Nytt läge$|^New state$/i).selectOption("verified");
      await form.getByLabel(/^Källa$|^Source$/i).fill("");
      await form.getByRole("button", { name: B.recordVerification }).click();
      await expect(form.getByRole("alert")).toContainText(/Ange källan/);
      await shot(page, "12-verification-refused-sv");
    });

    await step("verify", "with a source it is recorded and appears in the history", async () => {
      const form = theme.locator("form").last();
      await form.getByLabel(/^Källa$|^Source$/i).fill("SYNTETISK källa: schemautdrag");
      await form
        .getByLabel(/^Anteckning$|^Note$/i)
        .fill("SYNTETISKT arbetsgivaren bekräftade schemat");
      await form.getByRole("button", { name: B.recordVerification }).click();
      // The form closing is the confirmation; while it is open, every state in
      // the vocabulary is on screen as a select option and asserting on the
      // word would prove nothing.
      await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
      await expect(theme).toContainText(/Verifierad/);
      await theme.getByRole("button", { name: B.history }).click();
      await expect(theme).toContainText(/Verifieringshistorik/, { timeout: 60_000 });
      await expect(theme).toContainText(/SYNTETISK källa: schemautdrag/);
      await shot(page, "12-verification-history-sv");
    });
  });

  /* --------------------------------------------------------------- 13 */
  test("13 · an open verification need is never rendered as a conclusion", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);
    const theme = secondTheme(page);
    await expect(theme).toBeVisible({ timeout: 30_000 });

    await step("neutral", "moving to 'not verified' says what it does not mean", async () => {
      await theme.getByRole("button", { name: B.verify }).click();
      const form = theme.locator("form").last();
      await form.getByLabel(/^Nytt läge$|^New state$/i).selectOption("not_verified");
      await form.getByLabel(/^Källa$|^Source$/i).fill("SYNTETISK källa: kontakten svarade inte");
      await form.getByRole("button", { name: B.recordVerification }).click();
      await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
      await expect(theme).toContainText(/Inte verifierad/);
      await expect(theme).toContainText(/betyder inte att uppgiften är osann/i);
      await expectNoScoringClaim(page, "beskt-themes");
      await shot(page, "13-not-verified-neutral-sv");
    });

    await step("neutral", "and the same in English", async () => {
      await useEnglish(page);
      await expect(theme).toContainText(/does not mean the information is untrue/i);
      await shot(page, "13-not-verified-neutral-en");
      await useSwedish(page);
    });
  });

  /* --------------------------------------------------------------- 14 */
  test("14 · locking is confirmed through a described dialog", async ({ page }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=position`);
    const position = page.getByTestId("beskt-position");
    await expect(position).toBeVisible({ timeout: 30_000 });

    await step("lock", "nothing of anyone else is on the page before the lock", async () => {
      await expect(page.getByTestId("beskt-others")).toContainText(
        /visas inte ännu|hämtas den inte heller/i,
      );
      await shot(page, "14-before-lock-sv");
    });

    await step("lock", "the confirmation says what locking changes", async () => {
      await page.getByRole("button", { name: B.lock }).click();
      const dialog = page.getByTestId("beskt-lock-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog).toContainText(/blir din dokumentation skrivskyddad/i);
      await shot(page, "14-lock-dialog-sv");
    });

    await step("lock", "cancelling changes nothing, confirming locks", async () => {
      await page.getByRole("button", { name: /^Avbryt$|^Cancel$/ }).click();
      await expect(page.getByTestId("beskt-lock-dialog")).toHaveCount(0);
      await expect(position).toContainText(/Öppen/);

      await page.getByRole("button", { name: B.lock }).click();
      await page.getByRole("button", { name: B.confirmLock }).click();
      await expect(position).toContainText(/Din ståndpunkt är låst/, { timeout: 60_000 });
      await shot(page, "14-locked-sv");
    });
  });

  /* --------------------------------------------------------------- 15 */
  test("15 · the locked position is read-only and shows its own facts", async ({ page }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=position`);
    const position = page.getByTestId("beskt-position");
    await expect(position).toBeVisible({ timeout: 30_000 });

    await step("locked", "state, revision and time are on screen; the lock is gone", async () => {
      await expect(position).toContainText(/Låst/);
      await expect(position).toContainText(/Revision/);
      expect(await page.getByRole("button", { name: B.lock }).count()).toBe(0);
      await expectFitsViewport(page);
      await shot(page, "15-locked-readonly-sv");
    });

    await step("locked", "the documentation itself is no longer editable", async () => {
      await page.goto(BESKT_PATH);
      const theme = firstTheme(page);
      await expect(theme).toBeVisible({ timeout: 30_000 });
      expect(await theme.getByRole("button", { name: B.correct }).count()).toBe(0);
      await shot(page, "15-entries-readonly-sv");
    });

    await step("locked", "and the same, in English", async () => {
      await page.goto(`${BESKT_PATH}?view=position`);
      await expect(position).toBeVisible({ timeout: 30_000 });
      await useEnglish(page);
      await expect(position).toContainText(/Your position is locked/i);
      await shot(page, "15-locked-readonly-en");
      await useSwedish(page);
    });
  });

  /* --------------------------------------------------------------- 16 */
  test("16 · the second assessor sees nothing of the first — not even over the wire", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Every byte the second assessor's browser receives, searched for the
    // first assessor's exact words. "Not rendered" would not be enough: a
    // withheld position that arrives in a payload and is merely hidden has
    // already been disclosed.
    const leaks: string[] = [];
    page.on("response", (response) => {
      void response
        .text()
        .then((body) => {
          if (body.includes("SYNTETISKT-A1-")) leaks.push(response.url());
        })
        .catch(() => {
          /* a body that cannot be read cannot leak one */
        });
    });

    try {
      await step("independence", "the second assessor signs in and joins", async () => {
        await signIn(page, ASSESSOR, BESKT_PATH);
        const join = page.getByRole("button", { name: B.join });
        await expect(join).toBeVisible({ timeout: 30_000 });
        await join.click();
        await expect(page.getByTestId("beskt-themes")).toBeVisible({ timeout: 60_000 });
        await shot(page, "16-second-assessor-joined-sv");
      });

      await step("independence", "the first assessor's record is nowhere on screen", async () => {
        await page.goto(`${BESKT_PATH}?view=position`);
        const others = page.getByTestId("beskt-others");
        await expect(others).toBeVisible({ timeout: 30_000 });
        await expect(others).toContainText(/visas inte ännu/i);
        await expect(others).toContainText(/hämtas den inte heller till den här sidan/i);
        await expect(page.locator("body")).not.toContainText(/SYNTETISKT-A1-/);
        await shot(page, "16-withheld-sv");
      });

      await step("independence", "and it never arrived in any response either", async () => {
        // Give any in-flight body a chance to resolve by waiting for an
        // observable state rather than a duration: the page is idle once the
        // workspace query has settled and the withheld panel is on screen.
        await expect(page.getByTestId("beskt-others")).toContainText(/visas inte ännu/i);
        expect(leaks, "responses carrying the first assessor's words").toEqual([]);
      });

      await step("independence", "and the same in English", async () => {
        await useEnglish(page);
        await expect(page.getByTestId("beskt-others")).toContainText(
          /Other positions are not shown yet/i,
        );
        await expect(page.locator("body")).not.toContainText(/SYNTETISKT-A1-/);
        await shot(page, "16-withheld-en");
      });

      await step(
        "independence",
        "the report is withheld on screen while their position is open",
        async () => {
          await useSwedish(page);
          await page.goto(`${BESKT_PATH}?view=report`);
          await expect(page.locator("body")).toContainText(
            /Rapporten öppnas när alla underlag är låsta/,
            {
              timeout: 30_000,
            },
          );
          await expect(page.locator("body")).not.toContainText(/SYNTETISKT-A1-/);
          await expect(page.getByTestId("beskt-report-document")).toHaveCount(0);
          await shot(page, "16-report-withheld-sv");
        },
      );

      await step(
        "independence",
        "and the database refuses the report to a direct call",
        async () => {
          // The screen above fetches nothing. This is the request a crafted
          // client would send instead -- and the database, not the screen, must
          // be what refuses it (20261127090000).
          const sessionId = sessionIdForCase();
          const preview = await rpcAs(page, "bcp_conduct_preview_report", {
            _session_id: sessionId,
          });
          expectRefused(
            preview,
            /BCP_CONDUCT_NOT_VISIBLE_YET/,
            "an assessor with an open position",
          );
          // The blocker reader stays open to a participant: it says what is
          // missing without disclosing anybody's record.
          const blockers = await rpcAs(page, "bcp_conduct_report_blockers", {
            _session_id: sessionId,
          });
          expect(blockers.status, blockers.body.slice(0, 200)).toBe(200);
          expect(blockers.body).not.toMatch(/SYNTETISKT-/);
          expect(leaks, "responses carrying the first assessor's words").toEqual([]);
        },
      );
    } finally {
      await context.close();
    }
  });

  /* --------------------------------------------------------------- 17 */
  test("17 · the second assessor documents and locks their own position", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await signIn(page, ASSESSOR, BESKT_PATH);
      const theme = firstTheme(page);
      await expect(theme).toBeVisible({ timeout: 30_000 });

      await step("second", "a record of their own, in their own words", async () => {
        await theme.getByRole("button", { name: B.document }).click();
        await fillField(page, L.observableFact, A2_FACT);
        await fillField(page, L.interpretation, A2_INTERPRETATION);
        await theme.getByRole("button", { name: B.save }).click();
        await expect(theme.locator("form")).toHaveCount(0, { timeout: 60_000 });
        await expect(theme).toContainText(A2_FACT);
        await shot(page, "17-second-documented-sv");
      });

      await step("second", "locked, through the same described confirmation", async () => {
        await page.goto(`${BESKT_PATH}?view=position`);
        await page.getByRole("button", { name: B.lock }).click();
        await page.getByRole("button", { name: B.confirmLock }).click();
        await expect(page.getByTestId("beskt-position")).toContainText(/Din ståndpunkt är låst/, {
          timeout: 60_000,
        });
        await shot(page, "17-second-locked-sv");
      });

      await step("second", "and only NOW does the first assessor's record appear", async () => {
        const others = page.getByTestId("beskt-others");
        await expect(others).toContainText(A1_FACT_CORRECTED, { timeout: 60_000 });
        await expect(others).toContainText(/vägs inte samman/i);
        await expectNoScoringClaim(page, "beskt-position");
        await expectFitsViewport(page);
        await shot(page, "17-revealed-sv");
      });
    } finally {
      await context.close();
    }
  });

  /* --------------------------------------------------------------- 18 */
  test("18 · the two positions are shown side by side, factually, with no total", async ({
    page,
  }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=position`);
    const others = page.getByTestId("beskt-others");
    await expect(others).toBeVisible({ timeout: 30_000 });

    await step("compare", "the other assessor's own words, in full", async () => {
      await expect(others).toContainText(A2_FACT, { timeout: 60_000 });
      await expect(others).toContainText(A2_INTERPRETATION);
      await expect(others).toContainText(/vägs inte samman|jämkas inte|summeras inte/);
      await shot(page, "18-side-by-side-sv");
    });

    await step("compare", "and no figure is derived from the pair", async () => {
      await expectNoScoringClaim(page, "beskt-position");
      const text = await page.getByTestId("beskt-position").innerText();
      expect(text).not.toMatch(/\b\d{1,3}\s*%/);
      expect(text).not.toMatch(/\b(totalt|summa|medel|snitt|enighetsgrad)\b/i);
    });

    await step("compare", "and the same in English", async () => {
      await useEnglish(page);
      await expect(others).toContainText(/not weighed together|not totalled/i);
      await shot(page, "18-side-by-side-en");
      await useSwedish(page);
    });
  });

  /* --------------------------------------------------------------- 19 */
  test("19 · reopening needs a reason, and nothing is lost by it", async ({ page }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=position`);
    const position = page.getByTestId("beskt-position");
    await expect(position).toBeVisible({ timeout: 30_000 });

    await step("reopen", "a reopening without a reason is refused", async () => {
      await position.getByRole("button", { name: B.reopen }).click();
      await position.getByRole("button", { name: B.confirmReopen }).click();
      await expect(position.getByRole("alert")).toContainText(/Ange ett skäl/i);
      await shot(page, "19-reopen-refused-sv");
    });

    await step("reopen", "with a reason it reopens, and the record survives", async () => {
      await fillField(page, L.reopenReason, "SYNTETISKT nytt underlag kom in efter samtalet");
      await position.getByRole("button", { name: B.confirmReopen }).click();
      await expect(position).toContainText(/Öppen/, { timeout: 60_000 });
      await expect(position).toContainText(/Antal återöppningar/);

      await page.goto(BESKT_PATH);
      await expect(firstTheme(page)).toContainText(A1_FACT_CORRECTED, { timeout: 60_000 });
      await expect(firstTheme(page)).toContainText(/Version 2/);
      await shot(page, "19-reopened-sv");
    });

    await step("reopen", "and it is locked again, so the panel can be revealed", async () => {
      await page.goto(`${BESKT_PATH}?view=position`);
      await page.getByRole("button", { name: B.lock }).click();
      await page.getByRole("button", { name: B.confirmLock }).click();
      await expect(position).toContainText(/Din ståndpunkt är låst/, { timeout: 60_000 });
      await shot(page, "19-relocked-sv");
    });
  });

  /* --------------------------------------------------------------- 20 */
  test("20 · the panel reveals, records a disagreement, and refuses an outsider", async ({
    page,
    browser,
  }: {
    page: Page;
    browser: Browser;
  }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=panel`);
    const panel = page.getByTestId("beskt-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });

    await step("panel", "the panel is opened, then revealed", async () => {
      await expect(panel).toContainText(/ingen poäng, ingen rangordning/i);
      await panel.getByRole("button", { name: B.openPanel }).click();
      const reveal = panel.getByRole("button", { name: B.reveal });
      await expect(reveal).toBeVisible({ timeout: 60_000 });
      await reveal.click();
      await expect(panel).toContainText(/Ståndpunkter framtagna/, { timeout: 60_000 });
      await shot(page, "20-panel-revealed-sv");
    });

    await step("panel", "common points and differences are both shown", async () => {
      await expect(panel).toContainText(/Gemensamma punkter/);
      await expect(panel).toContainText(/Skillnader/);
      await expect(panel).toContainText(/ändrar aldrig bedömarnas egna ståndpunkter/i);
      await expectNoScoringClaim(page, "beskt-panel");
    });

    await step("panel", "a disagreement is refused without its divergent position", async () => {
      await panel
        .getByLabel(/Hur panelen hanterade temat|How the panel handled it/i)
        .selectOption("disagreed");
      await panel
        .getByLabel(/^Motivering$|^Rationale$/i)
        .fill("SYNTETISKT panelen kunde inte enas om bemanningen");
      await panel.getByRole("button", { name: B.recordResolution }).click();
      await expect(panel.getByRole("alert")).toContainText(
        /avvikande ståndpunkten skriven i klartext/i,
      );
      await shot(page, "20-panel-refused-sv");
    });

    await step("panel", "and recorded, word for word, once it carries one", async () => {
      await panel.getByLabel(/^Avvikande ståndpunkt$|^Divergent position$/i).fill(DIVERGENT);
      await panel.getByRole("button", { name: B.recordResolution }).click();
      await expect(panel).toContainText(DIVERGENT, { timeout: 60_000 });
      await expect(panel).toContainText(/Kvarstående skillnad/);
      await expectFitsViewport(page);
      await shot(page, "20-panel-resolution-sv");
    });

    await step("panel", "and the assessors' own positions are untouched", async () => {
      // The interviewer's own record lives in the conversation view, where
      // they wrote it. The panel wrote a resolution beside it, not into it.
      await page.goto(BESKT_PATH);
      await expect(firstTheme(page)).toContainText(A1_FACT_CORRECTED, { timeout: 60_000 });
      await expect(firstTheme(page)).toContainText(/Version 2/);
      await shot(page, "20-positions-untouched-sv");
    });

    await step("panel", "and the same panel in English", async () => {
      await page.goto(`${BESKT_PATH}?view=panel`);
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await useEnglish(page);
      await expect(panel).toContainText(/Remaining difference/i);
      await expect(panel).toContainText(DIVERGENT);
      await shot(page, "20-panel-resolution-en");
      await useSwedish(page);
    });

    await step("refusal", "a member of another employer cannot reach this case", async () => {
      // A FRESH context, not a cleared one. The session lives in localStorage,
      // so clearing cookies leaves the previous person signed in and the walk
      // would be asserting the wrong refusal — or, worse, none.
      const context = await browser.newContext();
      const outsiderPage = await context.newPage();
      try {
        await signIn(outsiderPage, OUTSIDER, "/employer");
        await outsiderPage.goto(BESKT_PATH);
        // Whatever the product answers, it must not be this case's content.
        await expect(outsiderPage.locator("body")).not.toContainText(/SYNTETISKT-A1-/, {
          timeout: 30_000,
        });
        await expect(outsiderPage.locator("body")).not.toContainText(/SYNTETISKT-A2-/);
        await expect(outsiderPage.locator("body")).not.toContainText(DIVERGENT);
        await shot(outsiderPage, "20-outsider-refused-sv");
      } finally {
        await context.close();
      }
    });
  });

  /* --------------------------------------------------------------- 21 */
  test("21 · the method's governed wordings are there for the interviewer", async ({ page }) => {
    await signIn(page, INTERVIEWER, BESKT_PATH);

    await step("prompts", "the conversation plan, stage by stage", async () => {
      const stages = page.getByTestId("beskt-stage-prompts");
      await expect(stages).toBeVisible({ timeout: 60_000 });
      await expect(stages).toContainText(/Metodens upplägg för samtalet/);
      await expect(stages).toContainText(/Planering/);
      await expect(stages).toContainText(/Möt och förklara/);
      await expect(stages).toContainText(/Beslut fattas av arbetsgivaren, inte av systemet\./);
      await expectNoScoringClaim(page, "beskt-stage-prompts");
      await shot(page, "21-stage-prompts-sv");
    });

    await step("prompts", "and the wordings for a question, inside its own theme", async () => {
      // The fixture carries an item-level wording for shift_patterns_worked,
      // which this case derives as a theme; the other theme carries none and
      // must not borrow it.
      const theme = page.getByTestId("beskt-theme-shift_patterns_worked");
      await expect(theme).toContainText(/Metodens formuleringar för den här frågan/, {
        timeout: 30_000,
      });
      await expect(theme.getByTestId("beskt-prompt-p1_shift_probe")).toContainText(
        "SYNTETISK FORMULERING Hur såg ett nattpass ut för dig?",
      );
      await expect(page.getByTestId("beskt-theme-most_recent_training")).not.toContainText(
        /Metodens formuleringar för den här frågan/,
      );
      await expectFitsViewport(page);
      await theme.scrollIntoViewIfNeeded();
      await shot(page, "21-theme-prompts-sv");
    });

    await step("prompts", "and the same in English", async () => {
      await useEnglish(page);
      await expect(page.getByTestId("beskt-stage-prompts")).toContainText(/Planning/i);
      await shot(page, "21-stage-prompts-en");
      await useSwedish(page);
    });
  });

  /* --------------------------------------------------------------- 22 */
  test("22 · the report opens once everyone is locked, whole and without a verdict", async ({
    page,
  }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=report`);
    const reportDoc = page.getByTestId("beskt-report-document");

    await step("report", "the preview carries both assessors and the panel", async () => {
      await expect(reportDoc).toBeVisible({ timeout: 60_000 });
      await expect(reportDoc).toContainText(/BESKT-rapport/);
      await expect(reportDoc).toContainText(/Förhandsvisning — inte signerad/);
      await expect(reportDoc).toContainText(A1_FACT_CORRECTED);
      await expect(reportDoc).toContainText(A2_FACT);
      await expect(reportDoc).toContainText(DIVERGENT);
      await shot(page, "22-report-preview-sv");
    });

    await step("report", "what is not known comes before the evidence", async () => {
      const limits = page.getByTestId("beskt-report-limitations");
      await expect(limits).toBeVisible();
      const order = await page.evaluate(() => {
        const l = document.querySelector('[data-testid="beskt-report-limitations"]');
        const d = document.querySelector('[data-testid="beskt-report-document"]');
        const firstPosition = d?.textContent?.indexOf("SYNTETISKT-") ?? -1;
        const limitsAt = l && d ? (d.textContent ?? "").indexOf(l.textContent ?? "") : -1;
        return { limitsAt, firstPosition };
      });
      expect(order.limitsAt).toBeGreaterThanOrEqual(0);
      expect(order.limitsAt).toBeLessThan(order.firstPosition);
    });

    await step("report", "and no figure, verdict or recommendation is derived", async () => {
      await expectNoScoringClaim(page, "beskt-report-document");
      const text = await reportDoc.innerText();
      expect(text).not.toMatch(/\b\d{1,3}\s*%/);
      await expectFitsViewport(page);
    });

    await step("report", "and the same in English", async () => {
      await useEnglish(page);
      await expect(reportDoc).toContainText(/Preview — not signed/i);
      await shot(page, "22-report-preview-en");
      await useSwedish(page);
    });
  });

  /* --------------------------------------------------------------- 23 */
  test("23 · signing writes version 1, and the history keeps it", async ({ page }) => {
    await signIn(page, INTERVIEWER, `${BESKT_PATH}?view=report`);
    const finalise = page.getByTestId("beskt-report-finalise");

    await step(
      "sign",
      "the report names what is still missing, and offers no signature",
      async () => {
        // Both assessors documented BOTH themes, and step 20 recorded the
        // panel's handling of one. The database's own blocker names the other.
        const blockers = page.getByTestId("beskt-report-blockers");
        await expect(blockers).toContainText(/saknar en noterad panelutgång/, { timeout: 60_000 });
        await expect(finalise).toHaveCount(0);
        await shot(page, "23-blocked-sv");
      },
    );

    await step("sign", "the panel records its handling of the remaining theme", async () => {
      await page.goto(`${BESKT_PATH}?view=panel`);
      const panel = page.getByTestId("beskt-panel");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      const themeSelect = panel.getByLabel(/^Tema$|^Theme$/i);
      const values = await themeSelect
        .locator("option")
        .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
      expect(values.length).toBeGreaterThanOrEqual(2);
      await themeSelect.selectOption(values[1]);
      await panel
        .getByLabel(/Hur panelen hanterade temat|How the panel handled it/i)
        .selectOption("agreed");
      await panel
        .getByLabel(/^Gemensam formulering$|^Shared statement$/i)
        .fill("SYNTETISKT panelen är överens om att utbildningen var nyligen genomförd");
      await panel
        .getByLabel(/^Motivering$|^Rationale$/i)
        .fill("SYNTETISKT båda bedömarna beskrev samma utbildning");
      await panel.getByRole("button", { name: B.recordResolution }).click();
      await expect(panel).toContainText(/SYNTETISKT panelen är överens/, { timeout: 60_000 });
      await shot(page, "23-panel-agreed-sv");
      await page.goto(`${BESKT_PATH}?view=report`);
    });

    await step("sign", "nothing blocks the report now, so it can be signed", async () => {
      await expect(finalise).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("beskt-report-blockers")).toHaveCount(0);
      await expect(finalise).toHaveText(/Signera och skriv rapporten/);
      await shot(page, "23-before-signing-sv");
    });

    await step("sign", "signed once, against the basis that was read", async () => {
      await finalise.click();
      const versions = page.getByTestId("beskt-report-versions");
      await expect(versions).toContainText(/Version 1/, { timeout: 60_000 });
      await expect(versions).toContainText(/Gällande/);
      await expect(page.getByTestId("beskt-report-document")).toContainText(/Signerad version/);
      await expect(finalise).toHaveText(/Skriv en ny version/);
      await expectFitsViewport(page);
      await shot(page, "23-signed-sv");
    });

    await step("sign", "and the same in English", async () => {
      await useEnglish(page);
      await expect(page.getByTestId("beskt-report-document")).toContainText(/Signed version/i);
      await shot(page, "23-signed-en");
      await useSwedish(page);
    });
  });

  /* --------------------------------------------------------------- 24 */
  test("24 · nobody outside the case reads it, even by calling the database directly", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const sessionId = sessionIdForCase();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    for (const [who, email] of [
      ["a member of another employer", OUTSIDER],
      ["the candidate", INTERVIEWEE],
      ["an unrelated signed-in user", UNRELATED],
    ] as const) {
      await step("refusal", `${who} is refused both report readers`, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await signIn(page, email, "/");
          for (const fn of [
            "bcp_conduct_preview_report",
            "bcp_conduct_report_blockers",
            "bcp_conduct_final_report",
          ]) {
            const answer = await rpcAs(page, fn, { _session_id: sessionId });
            expectRefused(answer, /BCP_CONDUCT_NOT_PERMITTED|BCP_[A-Z_]+/, `${who} calling ${fn}`);
          }
          const helper = await rpcAs(page, "bcp_conduct_build_report_basis", {
            _session_id: sessionId,
          });
          expectRefused(helper, /permission denied|42501/, `${who} calling the internal helper`);
          await page.goto(`${BESKT_PATH}?view=report`);
          await expect(page.locator("body")).not.toContainText(/SYNTETISKT-/, { timeout: 30_000 });
        } finally {
          await context.close();
        }
      });
    }

    await step("refusal", "and so is a caller with no session at all", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto("/");
        for (const fn of ["bcp_conduct_preview_report", "bcp_conduct_report_blockers"]) {
          const answer = await rpcAs(page, fn, { _session_id: sessionId }, { anonymous: true });
          expectRefused(
            answer,
            /permission denied|42501|BCP_NOT_AUTHENTICATED/,
            `anon calling ${fn}`,
          );
        }
      } finally {
        await context.close();
      }
    });
  });
});

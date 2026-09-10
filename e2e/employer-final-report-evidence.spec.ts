/**
 * E4 browser evidence — the employer final report, and nothing that is not
 * evidence.
 *
 * Thirteen captures from the real routed application, signed in as real
 * fixture accounts against the LOCAL Supabase stack. Each is a state the
 * source review named and a reviewer would otherwise have to take on trust:
 * both assessors on the page with their disagreement stated; the released
 * assessment result bound beside the interview evidence; unresolved material;
 * a Passport disclosure classified as what it is; the exact preview; the
 * server refusing a stale preview; one explicit human finalisation; the
 * immutable report rendered from the readback with its finaliser named; an
 * earlier version opened; a member not offered the act; a candidate denied;
 * Swedish and English; 1440 and 375; a keyboard-reached control; no
 * horizontal overflow.
 *
 * The captures SUPPORT the assertions in employer-final-report-check.tsx and
 * the SQL suite scp_iv_report_basis_integrity_test.sql; they do not replace
 * them. What is asserted here is only what a capture needs to be true to be
 * the capture it claims to be.
 *
 * Everything shown is synthetic and local. No real candidate, name, address,
 * CV or Passport appears in any capture, and no filename contains a person's
 * name.
 *
 * Two changes to the basis are made from outside the browser, through psql
 * against the local database, because the walk needs the basis to MOVE
 * between two of the owner's actions and the browser has no button for
 * "somebody else changed the case meanwhile":
 *
 *   - after the first preview, one more open finding is written, so the
 *     server refuses the finalisation with SCP_IV_STALE_PREVIEW;
 *   - after version 1, the owner authors more evidence and re-assesses the
 *     question through the governed RPCs, then previews and finalises again
 *     through the same RPCs, so version 2 exists and version 1 can be opened
 *     as history. The screen offers no correction control once a report is
 *     final; correction is a governed act the page then reads back.
 *
 * Reproduce (see artifacts/employer-final-report-e4/INDEX.md). The database
 * URL comes from the running stack, and is never typed out here -- see the
 * note above E4_DATABASE_URL for why:
 *   DB_URL=$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')
 *   psql "$DB_URL" -f scripts/fixtures/interview-journey-fixture.sql
 *   psql "$DB_URL" -f scripts/fixtures/employer-final-report-fixture.sql
 *   bun run dev -- --port 3117 --strictPort
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://localhost:3117 E4_DATABASE_URL="$DB_URL" \
 *     bunx playwright test e2e/employer-final-report-evidence.spec.ts --project=chromium
 */

import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dictionaries } from "../src/i18n/dictionaries";
import { mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to capture evidence against the local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE),
  "Evidence is captured only against localhost.",
);

// ── A BUDGET THE WALK CAN ACTUALLY FIT IN ──────────────────────────────
//
// Playwright's default test timeout is 30 s, and it caps everything inside
// the test. The Swedish walk allows 45 s for the sign-in redirect alone and
// 45 s for the finalisation readback, so those waits could never be honoured:
// the test deadline fired first and reported "element(s) not found" for a
// <main> that was simply still rendering. An assertion timeout larger than
// the test's own budget is not a longer wait, it is a false one.
//
// Set here rather than in playwright.config.ts, so no other suite's timing
// changes. This walk signs in, previews, is refused for a stale preview,
// previews again, finalises, reloads and reads back a corrected version.
test.describe.configure({ timeout: 240_000 });

const OUT = "artifacts/employer-final-report-e4";
const PASSWORD = "LocalJourney!2026";
const OWNER = "journey@local.test";
const MEMBER = "interviewer@local.test";
const CANDIDATE = "kandidat@local.test";
const OWNER_ID = "9e000000-0000-4000-8000-000000000001";
const SLUG = "journey-ab";
const TITLE_SV = "E4 evidens · Väktare Väst";
const TITLE_EN = "E4 evidence · Guard East";

/* ---- The local database, and only the local database ------------------ */
//
// ── ONE SOURCE OF TRUTH, AND WHY ───────────────────────────────────────
//
// This block used to read E4_PGHOST, E4_PGPORT and E4_PGPASSWORD with
// "127.0.0.1", "54322" and "postgres" as DEFAULTS. That was a second
// description of the stack, written from memory, sitting beside the one the
// workflow derives from `supabase status` and then proves is loopback.
//
// Two descriptions of a database can disagree, and the way that failure
// presents is writing to the wrong database. A default is worse than a
// missing value for exactly this reason: a missing value stops, a wrong
// default proceeds. The port in particular was a guess that happened to be
// right, and the password was a literal in a file anyone can read.
//
// So there is one input: E4_DATABASE_URL, handed in already validated, with
// no default and no fallback to the checked-in .env -- which points at the
// owner project. Every field psql needs is parsed from it here, once, and
// the parse refuses anything that is not a loopback Postgres URL.

// Playwright traces retain this spec's source. Keep the production identifier
// out of that trace: the workflow supplies the exact forbidden value at
// runtime, while this spec fails closed if it is missing.
const OWNER_PROJECT_REF = process.env.E4_FORBIDDEN_PROJECT_REF;

interface LocalDatabase {
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly db: string;
  readonly password: string;
}

let parsed: LocalDatabase | null = null;

/** The local stack's database, parsed from the one URL that was validated
 *  upstream. Throws rather than guessing: see the note above. */
function localDatabase(): LocalDatabase {
  if (parsed) return parsed;

  const raw = process.env.E4_DATABASE_URL;
  if (!raw) {
    throw new Error(
      "E4 evidence needs E4_DATABASE_URL — the local stack's own database URL. " +
        "There is deliberately no default: a guessed host, port or password is a " +
        "second source of truth about which database this writes to.",
    );
  }
  if (!OWNER_PROJECT_REF) {
    throw new Error(
      "E4 evidence needs E4_FORBIDDEN_PROJECT_REF so the owner production project is refused by name.",
    );
  }
  if (raw.includes(OWNER_PROJECT_REF)) {
    throw new Error("E4 evidence refuses a database URL naming the owner production project.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("E4_DATABASE_URL is not a URL.");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error(`E4_DATABASE_URL is not a Postgres URL: ${url.protocol}`);
  }
  if (!/^(127\.0\.0\.1|localhost)$/.test(url.hostname)) {
    throw new Error(`E4 evidence writes only to the local stack, not ${url.hostname}`);
  }
  if (!url.port) {
    throw new Error("E4_DATABASE_URL names no port, and nothing here may guess one.");
  }
  if (!url.username || !url.password) {
    throw new Error("E4_DATABASE_URL carries no credentials, and none is written down here.");
  }
  const db = url.pathname.replace(/^\//, "");
  if (!db) {
    throw new Error("E4_DATABASE_URL names no database.");
  }

  parsed = {
    host: url.hostname,
    port: url.port,
    user: decodeURIComponent(url.username),
    db,
    password: decodeURIComponent(url.password),
  };
  return parsed;
}

/** Run one statement against the local stack's Postgres. */
function sql(statement: string): string {
  const pg = localDatabase();
  return execFileSync(
    "psql",
    [
      "-h",
      pg.host,
      "-p",
      pg.port,
      "-U",
      pg.user,
      "-d",
      pg.db,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      statement,
    ],
    {
      env: { ...process.env, PGPASSWORD: pg.password },
      encoding: "utf8",
    },
  ).trim();
}

const caseIdFor = (title: string) =>
  sql(
    `SELECT id FROM public.scp_interview_cases WHERE employer_id = '9e000000-0000-4000-8000-00000000000a' AND title = '${title}' ORDER BY created_at DESC LIMIT 1`,
  );

/** Statements run AS THE OWNER through the governed RPCs: the same person,
 *  the same functions, the same rules the page goes through. */
const asOwner = (body: string) =>
  sql(`DO $e4$
DECLARE _case uuid; _q1 uuid;
BEGIN
  SELECT id INTO _case FROM public.scp_interview_cases
   WHERE employer_id = '9e000000-0000-4000-8000-00000000000a' AND title = '${TITLE_SV}'
   ORDER BY created_at DESC LIMIT 1;
  SELECT q.id INTO _q1 FROM public.scp_interview_core_questions q
    JOIN public.scp_interview_cases c ON c.pack_version_id = q.pack_version_id
   WHERE c.id = _case AND q.code = 'Q1';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '${OWNER_ID}', 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '${OWNER_ID}', true);
  SET LOCAL ROLE authenticated;
  ${body}
  RESET ROLE;
END $e4$;`);

/** One more OPEN finding on the Swedish case, so the basis moves after the
 *  preview. Superuser plumbing, as in the fixture: findings are written by
 *  scp_iv_record_findings from an AI run, and the run is not what is being
 *  captured; the server's refusal of the stale identity is. */
const moveTheBasis = () =>
  sql(`INSERT INTO public.scp_interview_findings
  (case_id, finding_kind, statement, rationale, question_id, claim_class, resolution_state, human_state, human_actor_id, human_actor_at)
SELECT c.id, 'verification', 'Certifikatets giltighetstid behöver kontrolleras.', 'Utanför intervjun.', q.id,
       'ai_inference', 'needs_verification', 'confirmed', '${OWNER_ID}', now()
  FROM public.scp_interview_cases c
  JOIN public.scp_interview_core_questions q ON q.pack_version_id = c.pack_version_id AND q.code = 'Q1'
 WHERE c.employer_id = '9e000000-0000-4000-8000-00000000000a' AND c.title = '${TITLE_SV}'
 ORDER BY c.created_at DESC LIMIT 1`);

/** After version 1: the owner authors more evidence, re-assesses the
 *  question, previews and finalises again -- every step through the governed
 *  RPCs, so version 2 is one scp_iv_finalise_previewed_report produced. */
const correctToVersionTwo = () =>
  asOwner(`
  PERFORM public.scp_iv_author_evidence(_case, _q1, 'Kompletterande underlag efter färdigställande.', NULL, NULL, NULL);
  PERFORM public.scp_iv_record_assessment(_case, _q1, 3, 'Bekräftat efter komplettering.', NULL, 'Komplettering.');
  PERFORM public.scp_iv_finalise_previewed_report(_case, (SELECT basis_hash FROM public.scp_iv_preview_report(_case)), NULL);`);

/* ---- The browser -------------------------------------------------------- */

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
  // The token this browser was just issued, by digest. Recorded here rather
  // than only at the end, so a token that rotates mid-walk is still known.
  await recordIssuedTokens(page);
}

/**
 * A sentence the application actually ships, in the language asked for.
 *
 * ── WHY THIS IS NOT TYPED OUT ──────────────────────────────────────────
 *
 * Twice now a run has failed on a hand-written translation rather than on a
 * defect: once waiting for a Swedish status word that does not exist, and
 * once for "Verified: the digest was recomputed" when the product says
 * "Checked: the digest was recomputed from the stored basis and matches."
 * Both cost a full pipeline run and neither told anybody anything true.
 *
 * The walk's job is to prove the sentence IS RENDERED on this screen, in this
 * language, at this width. What the sentence says is a separate claim, and it
 * has its own home: `employer-final-report:check` section 10 asserts the
 * wording, that both languages are complete, and that they differ. Splitting
 * it this way means a copy edit updates one place and breaks neither.
 */
const copy = (lang: "sv" | "en", key: string): string => {
  const value = (dictionaries[lang] as Record<string, string>)[key];
  if (!value) throw new Error(`E4 evidence: no ${lang} copy for ${key}`);
  return value;
};

const main = (page: Page) => page.locator("main").first();
const doc = (page: Page, mode: "preview" | "final" | "history") =>
  page.locator(`article[data-report-mode="${mode}"]`);
const reportUrl = (id: string) => `/employer/${SLUG}/interview-intelligence/${id}/report`;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

/* ---- The tokens this run actually produced ---------------------------- */
//
// ── WHY THE WALK RECORDS THEM ──────────────────────────────────────────
//
// Every request the browser makes carries the stack's anon key and the
// signed-in user's access token, and a Playwright trace records the network.
// The leak scan publishes a JWT only when that exact token was observed in
// this run, so the walk has to say which tokens those were.
//
// DIGESTS ONLY. The allowlist never holds a token, so it leaks nothing even
// if it were published — and it lives outside the artifact directory and is
// destroyed before the upload anyway.

const ALLOWLIST = process.env.E4_TOKEN_ALLOWLIST ?? null;

async function recordIssuedTokens(page: Page): Promise<number> {
  if (ALLOWLIST === null) return 0;
  const tokens = await page.evaluate(() => {
    const found: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === null) continue;
      const value = window.localStorage.getItem(key);
      if (value === null) continue;
      const matches = value.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g);
      if (matches !== null) found.push(...matches);
    }
    return found;
  });
  for (const token of tokens) {
    appendFileSync(ALLOWLIST, `${createHash("sha256").update(token, "utf8").digest("hex")}\n`, {
      mode: 0o600,
    });
  }
  return tokens.length;
}

/* ---- How long each phase took ----------------------------------------- */
//
// A 240 s budget is only honest if a hang is still visible inside it. Every
// phase is timed and written beside the captures, so "the walk passed" can be
// read as "and nothing sat waiting for three minutes".

interface Timing {
  test: string;
  step: string;
  ms: number;
}
const timings: Timing[] = [];

/**
 * Punctuate a walk that reads better as a sequence than as nested closures.
 *
 * `phase` wraps a step; `mark` records the one that just finished. They write
 * the same record, and the long Swedish walk uses `mark` because wrapping its
 * seven numbered steps would have buried the thing being read.
 */
// ── ONE KEY PER TEST ──────────────────────────────────────────────────
//
// The step records used a short label and the whole-test record used the
// Playwright title, so nothing joined them: the verifier saw six tests that
// had recorded a total and no steps, and refused the artifact. It was right
// to. Both now take the name from `test.info()`, so there is one key and no
// way for the two halves to drift apart again.
const marks = new Map<string, number>();

function mark(step: string): void {
  const testName = test.info().title;
  const now = Date.now();
  const previous = marks.get(testName) ?? now;
  timings.push({ test: testName, step, ms: now - previous });
  marks.set(testName, now);
}

async function phase<T>(step: string, body: () => Promise<T>): Promise<T> {
  const testName = test.info().title;
  const started = Date.now();
  try {
    return await body();
  } finally {
    timings.push({ test: testName, step, ms: Date.now() - started });
    marks.set(testName, Date.now());
  }
}

// The clock starts before the first step, so the first duration is real.
test.beforeEach(() => {
  marks.set(test.info().title, Date.now());
});

test.afterEach(async ({ page }, info) => {
  await recordIssuedTokens(page).catch(() => 0);
  timings.push({ test: info.title, step: "· whole test", ms: info.duration });
  writeFileSync(`${OUT}/timings.json`, `${JSON.stringify(timings, null, 2)}\n`, "utf8");
});

/** No horizontal overflow: the document must never scroll sideways, at any
 *  width. Asserted, because a capture cannot show what is off-screen. */
async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Reach a control BY KEYBOARD, not by locator.focus(): Chromium applies
 *  :focus-visible only to keyboard focus, so a capture after .focus() would
 *  show a focused control with no ring and prove the opposite of what it
 *  claims. Tabbing also shows the control is reachable in the focus order. */
async function tabTo(page: Page, target: ReturnType<Page["locator"]>) {
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let i = 0; i < 120 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await target.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  await expect(target).toBeFocused();
}

test("01-07 · SWEDISH DESKTOP 1440 · preview, stale preview, finalise, history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const caseSv = caseIdFor(TITLE_SV);
  expect(caseSv).toMatch(/^[0-9a-f-]{36}$/);
  await signIn(page, OWNER);
  mark("sign in as the owner");

  // 01. Before a preview: the act is offered only as "preview first".
  await page.goto(reportUrl(caseSv));
  const previewBtn = main(page).getByRole("button", { name: /^Förhandsgranska rapporten$/ });
  const finaliseBtn = main(page).getByRole("button", { name: /^Slutför rapporten$/ });
  await expect(previewBtn).toBeVisible({ timeout: 30_000 });
  await expect(finaliseBtn).toBeDisabled();
  await expectNoOverflow(page);
  await shot(page, "01-sv-1440-preview-first");
  mark("01 · before a preview, the act is not offered");

  // 02. THE EXACT PREVIEW: the server's own basis, rendered by the document
  //     component. Both assessors, their disagreement, the bound assessment
  //     result with its findings, the unresolved difference, and the
  //     Passport disclosure classified as a disclosure.
  await previewBtn.click();
  const preview = doc(page, "preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('[data-testid="fr-disagree"]')).toBeVisible();
  await expect(preview).toContainText(/Konkret handlande i rätt ordning/);
  await expect(preview).toContainText(/Handlade rätt men tvekade/);
  await expect(preview).toContainText(/Fördröjd eskalering i scenario 2/);
  await expect(preview).toContainText(/Anställningsåret för den senaste tjänsten/);
  await expect(preview.locator('[data-testid="fr-cls-passport_disclosure"]').first()).toBeVisible();
  await expect(finaliseBtn).toBeEnabled();
  await shot(page, "02-sv-1440-exact-preview-two-assessors");
  mark("02 · the exact preview, both assessors");

  // 03. THE BASIS MOVES, and the server refuses the stale identity. Nothing
  //     is written; the finalise control is withdrawn until a fresh preview.
  moveTheBasis();
  await finaliseBtn.click();
  const stale = main(page).locator('[role="alert"]', { hasText: /Underlaget har ändrats/ });
  await expect(stale).toBeVisible({ timeout: 30_000 });
  await expect(finaliseBtn).toBeDisabled();
  await expect(doc(page, "final")).toHaveCount(0);
  await shot(page, "03-sv-1440-stale-preview-refused");
  mark("03 · the basis moved, the server refused");

  // 04. A fresh preview, then ONE explicit human finalisation.
  await previewBtn.click();
  await expect(preview).toContainText(/Certifikatets giltighetstid/, { timeout: 30_000 });
  await expect(finaliseBtn).toBeEnabled();
  await tabTo(page, finaliseBtn);
  await page.screenshot({ path: `${OUT}/04-sv-1440-finalise-focused.png` });
  mark("04 · the act reached by keyboard");
  await page.keyboard.press("Enter");

  // 05. THE IMMUTABLE REPORT, rendered from the governed readback: verified
  //     digest, version 1, the finalising person named and dated.
  const final = doc(page, "final");
  await expect(final).toBeVisible({ timeout: 45_000 });
  await expect(final.locator('[data-testid="fr-actor"]')).toContainText(/Journey Testare/);
  await expect(main(page)).toContainText(copy("sv", "iir.readback.verified"));
  await expect(main(page)).toContainText(/Version 1/);
  await expect(previewBtn).toHaveCount(0);
  await expectNoOverflow(page);
  await shot(page, "05-sv-1440-immutable-final-v1");
  mark("05 · finalised, and read back verified");

  // 06. A correction is a NEW version; the previous one is kept and can be
  //     opened. Version 2 is produced through the governed RPCs (see the
  //     header); the page reads it back.
  correctToVersionTwo();
  await page.reload();
  await expect(main(page)).toContainText(/Version 2/, { timeout: 30_000 });
  const openV1 = main(page).getByRole("button", { name: /^Öppna version 1$/ });
  await expect(openV1).toBeVisible();
  await shot(page, "06-sv-1440-two-versions");
  mark("06 · a correction made version 2");

  // 07. Version 1 opened as history: the earlier immutable document, marked
  //     superseded, with the finaliser it had.
  await openV1.click();
  const history = doc(page, "history");
  await expect(history).toBeVisible({ timeout: 30_000 });
  await expect(history).toContainText(/Tidigare version — ersatt/);
  await expect(history.locator('[data-testid="fr-actor"]')).toContainText(/Journey Testare/);
  await expect(main(page)).toContainText(/Visar version 1/);
  await shot(page, "07-sv-1440-historical-version-opened");
  mark("07 · version 1 still readable");
});

test("08 · a member: the whole report, and not the act", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const caseEn = caseIdFor(TITLE_EN);
  await phase("sign in as a member", () => signIn(page, MEMBER));
  await phase("the act is not offered", async () => {
    await page.goto(reportUrl(caseEn));
    await expect(main(page)).toContainText(/Görs av ägare eller administratör/, {
      timeout: 30_000,
    });
    await expect(main(page).getByRole("button", { name: /^Slutför rapporten$/ })).toHaveCount(0);
    await shot(page, "08-sv-1440-member-not-offered-finalisation");
  });
});

test("09 · the candidate is denied, and is not told a report exists", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const caseSv = caseIdFor(TITLE_SV);
  await phase("sign in as the candidate", () => signIn(page, CANDIDATE));
  await page.goto(reportUrl(caseSv));
  // Whatever the shell does with a slug this person holds no seat for, the
  // report itself must not be on the page: no document in any mode, no
  // finalise control, and no candidate-facing sharing of any kind.
  await phase("no report is on the page", async () => {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("article[data-report-mode]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Slutför rapporten|Complete the report/ }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/Journey Testare/);
    await expect(page.locator("body")).not.toContainText(/Konkret handlande i rätt ordning/);
    await shot(page, "09-sv-1440-candidate-denied");
  });
});

test("10-13 · ENGLISH MOBILE 375 · preview, keyboard finalise, immutable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const caseEn = caseIdFor(TITLE_EN);
  await signIn(page, OWNER);
  mark("sign in as the owner");
  await page.goto(reportUrl(caseEn));
  await expect(main(page)).toContainText(/Förhandsgranska|Preview/, { timeout: 30_000 });
  // Scoped to the visible language group: at 375 there is a second copy inside
  // the navigation drawer, and a name-based lookup opens the drawer instead.
  await page
    .getByRole("group", { name: /Språk|Language/i })
    .locator("visible=true")
    .first()
    .getByRole("button", { name: /^en$/i })
    .click();
  const previewBtn = main(page).getByRole("button", { name: /^Preview the report$/ });
  const finaliseBtn = main(page).getByRole("button", { name: /^Complete the report$/ });
  await expect(previewBtn).toBeVisible({ timeout: 15_000 });
  await expect(finaliseBtn).toBeDisabled();
  await expectNoOverflow(page);
  await shot(page, "10-en-375-preview-first");
  mark("10 · before a preview, in English");

  // 11. The exact preview in English, on a phone: both assessors, the
  //     disagreement stated, the disclosure marked "not verified here".
  await previewBtn.click();
  const preview = doc(page, "preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview).toContainText(/The assessors do not agree/);
  await expect(preview).toContainText(/Passport disclosure \(not verified here\)/);
  await expect(preview).toContainText(/Guard East/);
  await expectNoOverflow(page);
  await shot(page, "11-en-375-exact-preview");
  mark("11 · the exact preview, in English");

  // 12. The finalise control reached by keyboard, ring visible.
  await tabTo(page, finaliseBtn);
  await page.screenshot({ path: `${OUT}/12-en-375-finalise-focused.png` });
  mark("12 · the act reached by keyboard");

  // 13. Finalised, on a phone, in English: the immutable report with the
  //     finaliser named, and no sideways scroll anywhere on the page.
  await page.keyboard.press("Enter");
  const final = doc(page, "final");
  await expect(final).toBeVisible({ timeout: 45_000 });
  await expect(final).toContainText(/Finalised and immutable/);
  await expect(final.locator('[data-testid="fr-actor"]')).toContainText(/Journey Testare/);
  await expectNoOverflow(page);
  await shot(page, "13-en-375-immutable-final");
  mark("13 · finalised, on a phone, in English");
});

/* ══════════════════════════════════════════════════════════════════════ */
/* The two combinations the first matrix left out                        */
/* ══════════════════════════════════════════════════════════════════════ */
//
// The manifest declares two locales and two viewports, which is a claim about
// FOUR combinations. The walk covered Swedish at 1440 and English at 375, so
// half the claim rested on nothing. These two close it.
//
// Both read a report that is ALREADY final — the Swedish case at version 2
// from 01-07, the English case at version 1 from 10-13 — because a second
// finalisation of the same case is refused, correctly, by the server. Reading
// back is what these combinations exist to show: that the immutable document
// renders completely in both languages at both widths.

test("14-15 · ENGLISH DESKTOP 1440 · the immutable report, read in English", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const caseEn = caseIdFor(TITLE_EN);
  await phase("sign in as the owner", () => signIn(page, OWNER));
  await phase("open the report", async () => {
    await page.goto(reportUrl(caseEn));
    await expect(doc(page, "final")).toBeVisible({ timeout: 60_000 });
  });

  await phase("switch to English", async () => {
    await page
      .getByRole("group", { name: /Språk|Language/i })
      .locator("visible=true")
      .first()
      .getByRole("button", { name: /^en$/i })
      .click();
    await expect(main(page)).toContainText(/Finalised and immutable/, { timeout: 30_000 });
  });

  // 14. The immutable document in English at desktop width: the digest
  //     recomputed and matching, the version, the finaliser named and dated.
  await phase("read the immutable document", async () => {
    const final = doc(page, "final");
    await expect(final).toBeVisible({ timeout: 30_000 });
    await expect(final).toContainText(/Finalised and immutable/);
    await expect(final.locator('[data-testid="fr-actor"]')).toContainText(/Journey Testare/);
    await expect(main(page)).toContainText(/Version 1/);
    await expect(main(page)).toContainText(copy("en", "iir.readback.verified"));
    await expect(main(page).getByRole("button", { name: /^Preview the report$/ })).toHaveCount(0);
    await expectNoOverflow(page);
    await shot(page, "14-en-1440-immutable-final");
  });

  // 15. Both assessors and their disagreement, in English, at 1440 — the
  //     state the whole report exists to carry, in the other language.
  await phase("both assessors and the disagreement", async () => {
    const final = doc(page, "final");
    const disagreement = final.locator('[data-testid="fr-disagree"]');
    await expect(disagreement).toBeVisible();
    await expect(final).toContainText(/The assessors do not agree/);
    await expect(final).toContainText(/Passport disclosure \(not verified here\)/);
    await expectNoOverflow(page);
    // CLIPPED TO THE THING IT IS EVIDENCE OF, not another full page.
    //
    // It was a full-page capture, and the verifier's digest listing showed it
    // byte-for-byte identical to capture 14: two captures claiming to show
    // different things were the same image. Clipping it to the disagreement
    // BADGE was the other mistake -- 2 051 bytes of a one-line span, which
    // the verifier then refused as too small to be a screenshot, correctly.
    //
    // Section 4 is the thing this capture claims: every assessor for every
    // requirement, with the disagreement stated among them.
    await page
      .locator("#fr-assessments")
      .screenshot({ path: `${OUT}/15-en-1440-two-assessors-disagreement.png` });
  });
});

test("16-17 · SWEDISH MOBILE 375 · version 2 and the history it kept", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const caseSv = caseIdFor(TITLE_SV);
  await phase("sign in as the owner", () => signIn(page, OWNER));
  await phase("open the corrected report", async () => {
    await page.goto(reportUrl(caseSv));
    await expect(main(page)).toContainText(/Version 2/, { timeout: 60_000 });
  });

  // 16. The corrected report on a phone, in Swedish: version 2, the finaliser
  //     named, the digest verified, and nothing scrolling sideways.
  await phase("read version 2", async () => {
    const final = doc(page, "final");
    await expect(final).toBeVisible({ timeout: 30_000 });
    await expect(final.locator('[data-testid="fr-actor"]')).toContainText(/Journey Testare/);
    await expect(main(page)).toContainText(copy("sv", "iir.readback.verified"));
    await expectNoOverflow(page);
    await shot(page, "16-sv-375-version-two");
  });

  // 17. THE PREVIOUS VERSION IS STILL READABLE. A correction added a version;
  //     it did not replace one. Opened on a phone, in Swedish.
  await phase("open version 1 from the history", async () => {
    const openV1 = main(page).getByRole("button", { name: /^Öppna version 1$/ });
    await expect(openV1).toBeVisible({ timeout: 30_000 });
    await openV1.click();
    const history = doc(page, "history");
    await expect(history).toBeVisible({ timeout: 30_000 });
    await expect(history).toContainText(/Tidigare version — ersatt/);
    await expectNoOverflow(page);
    await shot(page, "17-sv-375-history-version-one");
  });
});

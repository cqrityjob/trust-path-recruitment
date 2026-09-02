/**
 * Interview evidence reliability — the signed-in walks against the LOCAL
 * stack (PR20).
 *
 * The source guard (scripts/interview-evidence-reliability-check.tsx) proves
 * the shape and the database suite proves the boundaries; this walks them in
 * a browser, the way a recruiter meets them:
 *
 *   A  normal interview: every item captured reaches the report once
 *   B  refresh mid-interview: nothing is lost
 *   C  double-click on save, confirm, assess and finalise: nothing doubles
 *   D  material confirmed after assessment: named, blocks, resolved by a
 *      documented re-assessment
 *   E  the same candidate in two interviews: material stays in its own
 *   F  another employer opens the case URL: refused
 *   G  the locked report is identical after the live records change
 *   V  375 / 768 / 1440 with long material: no sideways scroll
 *
 * Runs only when E2E_LOCAL_STACK=1 against a localhost base URL, and needs the
 * two local fixtures (scripts/fixtures/interview-journey-fixture.sql and
 * interview-context-bridge-fixture.sql) plus psql on the path for scenario G,
 * which changes live records behind the product's back.
 */

import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local signed-in walk.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE),
  "This walk signs in with a fixture password and runs only against localhost.",
);

const PASSWORD = "LocalJourney!2026";
const JOURNEY = { email: "journey@local.test", slug: "journey-ab" };
const OUTSIDER = { email: "outsider@local.test", slug: "konkurrenten-ab" };
const PG = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: process.env.PGPORT ?? "54322",
  user: process.env.PGUSER ?? "postgres",
  db: process.env.PGDATABASE ?? "postgres",
};

const psql = (sql: string) =>
  execFileSync(
    "psql",
    [
      "-h",
      PG.host,
      "-p",
      PG.port,
      "-U",
      PG.user,
      "-d",
      PG.db,
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" }, encoding: "utf8" },
  ).trim();

const LONG = (
  "Kandidaten beskrev en lång händelsekedja med flera steg och tydliga beslut; " as string
).repeat(22);

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

const caseIdFromUrl = (page: Page) =>
  page.url().match(/interview-intelligence\/([0-9a-f-]{36})/)![1];

async function noOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where}: horizontal overflow`).toBeLessThanOrEqual(1);
}

/** Plan a fresh standalone interview and walk it to the live interview. */
async function planToInterview(page: Page, ref: string): Promise<string> {
  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/new`);
  await page.locator("#ii-title").fill(`PR20 · ${ref}`);
  await page.locator("#ii-candidate").fill(ref);
  await expect(page.locator("#ii-pack option")).not.toHaveCount(1, { timeout: 30_000 });
  await page.locator("#ii-pack").selectOption({ index: 1 });
  await page.getByRole("button", { name: /Planera intervjun|Plan the interview/i }).click();
  await page.waitForURL(/interview-intelligence\/[0-9a-f-]{36}\/prepare/, { timeout: 60_000 });
  const caseId = caseIdFromUrl(page);
  await page.locator("#src-label").fill("Annons");
  await page
    .locator("#src-text")
    .fill("Väktare till bevakningsuppdrag. Krav: giltig väktarutbildning.");
  await page.getByRole("button", { name: /^Lägg till$|^Add$/ }).click();
  await expect(page.locator("#mp-open")).toBeVisible({ timeout: 30_000 });
  await page.locator("#mp-time").fill("45 minuter");
  await page.locator("#mp-open").fill("Hälsa välkommen.");
  await page.locator("#mp-close").fill("Berätta om nästa steg.");
  await page
    .getByRole("button", { name: /Spara och godkänn planen|Save and approve the plan/ })
    .click();
  const start = page.getByRole("button", { name: /^Starta intervju$|^Start interview$/ });
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.click();
  await page.waitForURL(/\/interview$/, { timeout: 60_000 });
  return caseId;
}

/** Answer Q1–Q8 with the given note text per question and end the interview. */
async function conductInterview(page: Page, noteFor: (i: number) => string) {
  for (let i = 1; i <= 8; i += 1) {
    await expect(page.locator("main")).toContainText(new RegExp(`(Fråga|Question) ${i} (av|of) 8`));
    await page.locator("#note").fill(noteFor(i));
    await page.getByRole("button", { name: /Markera som genomgången|Mark as covered/ }).click();
    await expect(page.locator("main")).toContainText(/Besvarad|Answered/, { timeout: 30_000 });
    if (i < 8) await page.getByRole("button", { name: /^Nästa$|^Next$/ }).click();
  }
  await page.getByRole("button", { name: /Avsluta intervjun|End the interview/ }).click();
  await expect(page.locator("main")).toContainText(
    /Intervjun är genomförd|The interview is completed/,
    {
      timeout: 30_000,
    },
  );
}

async function openQuestion(page: Page, index: number) {
  const buttons = page
    .getByRole("navigation", { name: /^Frågor$|^Questions$/ })
    .first()
    .locator("button");
  await expect(buttons).toHaveCount(8);
  await buttons.nth(index).click();
}

const noteButton = (page: Page) =>
  page.getByRole("button", { name: /Använd som bedömningsunderlag|Use as assessment material/ });

/** The confirmed material shown for the open question. */
const confirmedItems = (page: Page) =>
  page.locator('main article[aria-label*="Bekräftat"], main article[aria-label*="Confirmed"] li');

/* ==================================================================== */
/* A + B + C + D + G + V on one fresh case                                */
/* ==================================================================== */

let walkedCase: string | null = null;

/** The case the first scenario walked -- or, when a scenario is run on its
 *  own, the most recent case a previous run of this file created. */
function caseUnderTest(): string | null {
  if (walkedCase) return walkedCase;
  try {
    const id = psql(
      "SELECT id FROM public.scp_interview_cases WHERE title LIKE 'PR20 ·%' AND status = 'reported' ORDER BY created_at DESC LIMIT 1",
    );
    return /^[0-9a-f-]{36}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

test("A–D,G · capture, refresh, double actions, later material, locked report", async ({
  page,
}) => {
  test.setTimeout(420_000);
  await signIn(page, JOURNEY.email);
  const ref = `Reliab ${Date.now().toString(36)}`;
  walkedCase = await planToInterview(page, ref);
  const caseId = walkedCase;

  // ---- B · a note survives a refresh --------------------------------
  const q1Note = `Q1: kandidaten kontrollerade dörren innan larm. ${ref}`;
  await page.locator("#note").fill(q1Note);
  await expect(page.getByRole("status")).toContainText(/Sparat|Saved/, { timeout: 15_000 });
  await page.reload();
  await expect(page.locator("#note")).toHaveValue(q1Note, { timeout: 30_000 });
  // Typed, then left before the debounce: the guarded Next flushes first.
  await page.locator("#note").fill(q1Note + " Tillägg efter omladdning.");
  await page.getByRole("button", { name: /Markera som genomgången|Mark as covered/ }).click();
  await expect(page.locator("main")).toContainText(/Besvarad|Answered/, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Nästa$|^Next$/ }).click();
  await page.getByRole("button", { name: /^Föregående$|^Previous$/ }).click();
  await expect(page.locator("#note")).toHaveValue(q1Note + " Tillägg efter omladdning.", {
    timeout: 30_000,
  });
  const stored = psql(
    `SELECT count(*) FROM public.scp_interview_session_notes n JOIN public.scp_interview_sessions s ON s.id = n.session_id WHERE s.case_id = '${caseId}' AND n.question_id = (SELECT question_id FROM public.scp_interview_session_questions sq WHERE sq.session_id = s.id AND sq.display_order = 1)`,
  );
  expect(stored, "exactly one stored note for Q1 after autosave, flush and refresh").toBe("1");

  // Back on Q1: the walk re-covers it with the same text (one note, still)
  // and carries on to Q8.
  await conductInterview(page, (i) =>
    i === 1
      ? q1Note + " Tillägg efter omladdning."
      : i === 2
        ? LONG
        : `Svar på fråga ${i}: kandidaten beskrev en konkret situation. ${ref}`,
  );
  await page
    .getByRole("link", { name: /Gå till bedömning|Go to assessment/ })
    .first()
    .click();
  await page.waitForURL(/\/evidence$/, { timeout: 60_000 });

  // ---- C · double-click "use as material" is one item ---------------
  await openQuestion(page, 0);
  const use = noteButton(page).first();
  await expect(use).toBeVisible({ timeout: 30_000 });
  await use.dblclick();
  await expect(page.locator("main")).toContainText(/Bekräftat underlag|Confirmed material/, {
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  await page.reload();
  await openQuestion(page, 0);
  await expect(page.locator("main")).toContainText(/Bekräftat underlag|Confirmed material/, {
    timeout: 30_000,
  });
  const q1Evidence = psql(
    `SELECT count(*) FROM public.scp_interview_evidence ev JOIN public.scp_interview_core_questions q ON q.id = ev.question_id WHERE ev.case_id = '${caseId}' AND q.code = 'Q1'`,
  );
  expect(q1Evidence, "a double-click confirmed Q1's note once").toBe("1");
  // A retry of the same action, later, is still the same item.
  await noteButton(page).first().click();
  await page.waitForTimeout(1500);
  expect(
    psql(
      `SELECT count(*) FROM public.scp_interview_evidence ev JOIN public.scp_interview_core_questions q ON q.id = ev.question_id WHERE ev.case_id = '${caseId}' AND q.code = 'Q1'`,
    ),
    "a later retry of the same confirmation is still one item",
  ).toBe("1");
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);

  for (let i = 1; i < 8; i += 1) {
    await openQuestion(page, i);
    const btn = noteButton(page).first();
    await expect(btn).toBeVisible({ timeout: 30_000 });
    await btn.click();
    await expect(page.locator("main")).toContainText(/Bekräftat underlag|Confirmed material/, {
      timeout: 30_000,
    });
  }
  await page
    .getByRole("link", { name: /Gör din bedömning|Make your assessment/ })
    .first()
    .click();
  await page.waitForURL(/\/assessment$/, { timeout: 60_000 });

  // ---- C · double-click "save assessment" is one judgement ----------
  for (let i = 0; i < 8; i += 1) {
    const form = page.locator("main form").first();
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByText(/^Tydligt visat$|^Clearly demonstrated$/).click();
    await form
      .locator("textarea[id^='rat-']")
      .fill("Konkret exempel med eget handlande och resultat.");
    const save = form.getByRole("button", { name: /Spara bedömning|Save assessment/ });
    if (i === 0) await save.dblclick();
    else await save.click();
    await expect(page.locator("main")).toContainText(new RegExp(`${i + 1} / 8`), {
      timeout: 30_000,
    });
  }
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  expect(
    psql(`SELECT count(*) FROM public.scp_interview_assessments WHERE case_id = '${caseId}'`),
    "eight judgements, none doubled",
  ).toBe("8");

  // ---- D · material confirmed after the judgement --------------------
  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${caseId}/evidence?q=Q1`);
  await expect(page.locator("#ev-x")).toBeVisible({ timeout: 30_000 });
  await page.locator("#ev-x").fill(`Efter bedömningen: kandidaten rapporterade skriftligt. ${ref}`);
  await page.getByRole("button", { name: /Lägg till som underlag|Add as material/ }).click();
  await expect(page.locator("main")).toContainText(/rapporterade skriftligt/, { timeout: 30_000 });

  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${caseId}/assessment?q=Q1`);
  await expect(page.locator("main")).toContainText(
    /Nytt underlag efter bedömningen|New material after assessment/,
    { timeout: 30_000 },
  );
  await expect(page.locator("main")).toContainText(/Bedömningen står kvar|The assessment stands/);
  // The judgement itself is untouched.
  await expect(page.locator("#q-Q1")).toContainText(
    "Konkret exempel med eget handlande och resultat.",
  );

  // Finishing is allowed; locking is not, and the report says why.
  const done = page.getByRole("button", { name: /Klar med bedömningen|Finished assessing/ });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await done.dblclick();
  await page.waitForURL(/\/report$/, { timeout: 60_000 });
  await expect(page.locator("main")).toContainText(
    /Q1 har fått nytt bekräftat underlag|Q1 has new confirmed material/,
    { timeout: 30_000 },
  );
  await expect(
    page.getByRole("button", { name: /Slutför rapporten|Complete the report/ }),
  ).toHaveCount(0);

  // A documented re-assessment resolves it.
  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${caseId}/assessment?q=Q1`);
  const q1 = page.locator("#q-Q1");
  await q1.getByRole("button", { name: /Ändra bedömningen|Change this assessment/ }).click();
  await q1.locator("textarea[id^='rat-']").fill("Konkret exempel, och skriftlig rapport efteråt.");
  await q1.locator("textarea[id^='why-']").fill("Nytt bekräftat underlag har tillkommit.");
  await q1.getByRole("button", { name: /Spara ändringen|Save the change/ }).click();
  await expect(q1).toContainText("skriftlig rapport efteråt", { timeout: 30_000 });
  await expect(q1).not.toContainText(
    /Nytt underlag efter bedömningen|New material after assessment/,
  );
  expect(
    psql(
      `SELECT count(*) FROM public.scp_interview_assessments a JOIN public.scp_interview_core_questions q ON q.id = a.question_id WHERE a.case_id = '${caseId}' AND q.code = 'Q1' AND a.superseded_by IS NOT NULL AND a.supersede_reason IS NOT NULL`,
    ),
    "the earlier judgement is kept, superseded with its reason",
  ).toBe("1");

  // ---- A + C · one report, once, with every item once ----------------
  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${caseId}/report`);
  const finalise = page.getByRole("button", { name: /Slutför rapporten|Complete the report/ });
  await expect(finalise).toBeVisible({ timeout: 30_000 });
  await finalise.dblclick();
  await expect(page.locator("main")).toContainText(/Rapport klar|Report complete/, {
    timeout: 45_000,
  });
  await expect(page.locator("main")).toContainText(/Slutlig och oföränderlig|Final and immutable/);
  expect(
    psql(`SELECT count(*) FROM public.scp_interview_reports WHERE case_id = '${caseId}'`),
    "one report version after a double-click",
  ).toBe("1");
  const docBefore = await page.locator("main article").first().innerText();
  expect(docBefore).toContain("Efter bedömningen: kandidaten rapporterade skriftligt.");
  const occurrences = docBefore.split("kontrollerade dörren innan larm").length - 1;
  expect(occurrences, "Q1's note reaches the report exactly once").toBe(1);
  // No ranking, suitability or hiring verdict is ASSERTED. The report's own
  // AI disclosure denies them, and a denial is allowed to name them.
  const sentences = docBefore.toLowerCase().split(/(?<=[.!?])\s+|\n+/);
  const NEGATIONS = ["inte", "aldrig", "ingen", "inga", "utan", " not ", "never", " no "];
  for (const re of [
    /rangordn/i,
    /\blämplig/i,
    /rekommenderar anställning/i,
    /\branking/i,
    /\bsuitab/i,
  ]) {
    const offending = sentences.filter((x) => re.test(x) && !NEGATIONS.some((n) => x.includes(n)));
    expect(offending, `${re} asserted rather than denied in the report`).toHaveLength(0);
  }

  // ---- G · the locked report is historical ---------------------------
  const hashBefore = psql(
    `SELECT content_hash FROM public.scp_interview_reports WHERE case_id = '${caseId}' AND status = 'final'`,
  );
  psql(
    `UPDATE public.scp_interview_session_notes SET body = body || ' [ändrad efter låsning]' WHERE session_id IN (SELECT id FROM public.scp_interview_sessions WHERE case_id = '${caseId}')`,
  );
  psql(`UPDATE public.scp_interview_cases SET title = title || ' (ändrad)' WHERE id = '${caseId}'`);
  await page.reload();
  await expect(page.locator("main")).toContainText(/Rapport klar|Report complete/, {
    timeout: 45_000,
  });
  const docAfter = await page.locator("main article").first().innerText();
  expect(docAfter).toBe(docBefore);
  expect(
    psql(
      `SELECT content_hash FROM public.scp_interview_reports WHERE case_id = '${caseId}' AND status = 'final'`,
    ),
  ).toBe(hashBefore);
  expect(docAfter).not.toContain("ändrad efter låsning");
});

/* ==================================================================== */
/* E · the same candidate, two interviews                               */
/* ==================================================================== */

test("E · the same candidate in a second interview starts with nothing from the first", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const first = caseUnderTest();
  test.skip(!first, "needs a walked case");
  await signIn(page, JOURNEY.email);
  const ref = psql(
    `SELECT candidate_display_name FROM public.scp_interview_cases WHERE id = '${first}'`,
  );
  const second = await planToInterview(page, ref);
  expect(second).not.toBe(first);
  await conductInterview(page, (i) => `Andra intervjun, fråga ${i}. ${ref}`);
  await page
    .getByRole("link", { name: /Gå till bedömning|Go to assessment/ })
    .first()
    .click();
  await page.waitForURL(/\/evidence$/, { timeout: 60_000 });
  await openQuestion(page, 0);
  const text = await page.locator("main").innerText();
  expect(text).not.toContain("kontrollerade dörren innan larm");
  expect(text).not.toContain("rapporterade skriftligt");
  expect(text).toContain("Andra intervjun, fråga 1");
  expect(
    psql(`SELECT count(*) FROM public.scp_interview_evidence WHERE case_id = '${second}'`),
    "the second case begins with no evidence of its own",
  ).toBe("0");
  // And the database refuses the first case's note as provenance in the second.
  const foreignNote = psql(
    `SELECT n.id FROM public.scp_interview_session_notes n JOIN public.scp_interview_sessions s ON s.id = n.session_id WHERE s.case_id = '${first}' LIMIT 1`,
  );
  const q1 = psql(
    `SELECT q.id FROM public.scp_interview_core_questions q JOIN public.scp_interview_cases c ON c.pack_version_id = q.pack_version_id WHERE c.id = '${second}' AND q.code = 'Q1'`,
  );
  const owner = psql(`SELECT created_by FROM public.scp_interview_cases WHERE id = '${second}'`);
  let refused = "";
  try {
    psql(
      `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',true); SELECT public.scp_iv_author_evidence('${second}','${q1}','Lånad text',NULL,NULL,'${foreignNote}'); ROLLBACK;`,
    );
  } catch (e) {
    refused = String((e as { stderr?: string }).stderr ?? e);
  }
  expect(refused).toContain("SCP_IV_EVIDENCE_ORIGIN_MISMATCH");
});

/* ==================================================================== */
/* F · another employer                                                 */
/* ==================================================================== */

test("F · another employer opening the case URL is refused, and sees none of the material", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const target = caseUnderTest();
  test.skip(!target, "needs a walked case");
  await signIn(page, OUTSIDER.email);
  for (const seg of ["evidence", "assessment", "report"]) {
    // Through the victim's workspace URL: refused at the workspace door.
    await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${target}/${seg}`);
    await expect(page.locator("body")).toContainText(
      /Åtkomst ej tillgänglig|Åtkomst saknas|No access|not have access|inte åtkomst/i,
      { timeout: 30_000 },
    );
    let text = await page.locator("body").innerText();
    expect(text).not.toContain("kontrollerade dörren innan larm");
    expect(text).not.toMatch(/Bekräftat underlag|Confirmed material/);
    // Through the outsider's OWN workspace with the victim's case id: the
    // shell opens, the case does not -- and "not yours" reads exactly like
    // "does not exist".
    await page.goto(`/employer/${OUTSIDER.slug}/interview-intelligence/${target}/${seg}`);
    await expect(page.locator("main")).toContainText(/Åtkomst saknas|No access/, {
      timeout: 30_000,
    });
    text = await page.locator("body").innerText();
    expect(text).not.toContain("kontrollerade dörren innan larm");
    expect(text).not.toMatch(/Bekräftat underlag|Confirmed material|Rapport klar|Report complete/);
  }
});

/* ==================================================================== */
/* V · viewports, with long material                                    */
/* ==================================================================== */

for (const [label, width, height] of [
  ["375", 375, 812],
  ["768", 768, 1024],
  ["1440", 1440, 900],
] as const) {
  test(`V · ${label}px · long material, editing, assessment and the report never scroll sideways`, async ({
    page,
  }) => {
    const target = caseUnderTest();
    test.skip(!target, "needs a walked case");
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await signIn(page, JOURNEY.email);
    for (const seg of ["evidence?q=Q2", "assessment?q=Q2", "report"]) {
      await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${target}/${seg}`);
      await expect(page.locator("main h1")).toBeVisible({ timeout: 45_000 });
      await expect(page.locator("main")).toContainText(/lång händelsekedja/, { timeout: 30_000 });
      await noOverflow(page, `${seg} at ${label}px`);
      // State is said in words, never by colour alone.
      if (seg.startsWith("evidence")) {
        await expect(page.locator("main")).toContainText(/Bekräftat underlag|Confirmed material/);
      }
      if (seg.startsWith("assessment")) {
        await expect(page.locator("main")).toContainText(/Registrerad|Recorded/);
      }
      if (seg === "report") {
        await expect(page.locator("main")).toContainText(
          /Slutlig och oföränderlig|Final and immutable/,
        );
      }
    }
  });
}

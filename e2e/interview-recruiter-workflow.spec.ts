/**
 * Recruiter workflow — the signed-in walk against the LOCAL stack.
 *
 * PR19 simplified the interview into four visible stages -- Förbered,
 * Intervjua, Bedöm, Rapport -- with one obvious next action per stage and
 * no engine vocabulary on a recruiter's screen. A source guard proves the
 * shape (scripts/interview-recruiter-workflow-check.tsx); this walks it.
 *
 * Runs only when E2E_LOCAL_STACK=1, and only against a localhost base URL:
 * it signs in with a fixture password and creates real interview records.
 * Without the flag the whole file skips rather than fails.
 *
 * Prerequisites (both idempotent, both local-only):
 *   psql ... -f scripts/fixtures/interview-journey-fixture.sql
 *   psql ... -f scripts/fixtures/interview-context-bridge-fixture.sql
 *
 * The full lifecycle (plan → prepare → interview Q1–Q8 → choose material →
 * assess → report → finalise) is walked on a case this file CREATES, under a
 * unique candidate reference, so it can be run again without finding its own
 * finished report in the way. The member scenario uses the journey fixture's
 * ready case, which nothing here finalises.
 */

import { test, expect, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the local signed-in walk.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE),
  "This walk signs in with a fixture password and runs only against localhost.",
);

const PASSWORD = "LocalJourney!2026";

const UI = {
  email: "uiowner@local.test",
  slug: "ui-vakt",
  /** Has a RELEASED assessment whose brief carries a governed interview guide. */
  appWithAssessment: "aa113333-0000-0000-0000-000000000002",
};

const JOURNEY = { email: "journey@local.test", slug: "journey-ab" };
const INTERVIEWER = "interviewer@local.test";
/** A journey case walked to report-ready (zero blockers, not yet locked). */
const READY_CASE = "047ce788-ea6a-4fe2-9fb1-c08c920926db";

/** Words that belong to the engine, the method's navigation, or the old
 *  product name. None may appear in the visible text of a recruiter screen.
 *  Content inside a closed <details> is not visible and is not in innerText,
 *  which is exactly the boundary: method support is one click away, never
 *  in the way. */
const ENGINE_WORDS = [
  /Interview Intelligence/,
  /\bTRUST\b/,
  /Rollpaket/i,
  /role pack/i,
  /\bprep_approved\b|\bevidence_review\b|\bsources_ready\b|\binterview_in_progress\b|\bprep_generated\b/,
  /\bpack_version\b|\bvalidation_label\b|\btask_key\b|\bprovider_mode\b/,
  /\bSCP_IV_[A-Z_]+/,
  /Copilot/,
];

/** Wording that would mean the product had started deciding. Word-anchored:
 *  the guide's own requirement "tillämplig väktarutbildning" (applicable
 *  training) contains "lämplig" and is not a suitability claim. */
const JUDGEMENT = [
  /\blämplig/i,
  /\bsuitab/i,
  /rangordn/i,
  /\branking/i,
  /rekommenderar anställning/i,
];
const NEGATIONS = ["inte", "aldrig", "ingen", "inga", "utan", " not ", "never", " no "];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

async function visibleText(page: Page): Promise<string> {
  return page.locator("main").innerText();
}

/** The properties every recruiter screen must have, asserted wherever the
 *  walk stops. */
async function expectRecruiterScreen(page: Page, where: string) {
  const text = await visibleText(page);
  for (const re of ENGINE_WORDS) {
    expect(text, `${where}: engine vocabulary visible (${re})`).not.toMatch(re);
  }
  const sentences = text.toLowerCase().split(/(?<=[.!?])\s+|\n+/);
  for (const re of JUDGEMENT) {
    const offending = sentences.filter((s) => re.test(s) && !NEGATIONS.some((n) => s.includes(n)));
    expect(offending, `${where}: ${re} asserted rather than denied`).toHaveLength(0);
  }
  // No horizontal overflow, at whatever viewport the test set.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where}: horizontal overflow`).toBeLessThanOrEqual(1);
  // Exactly one h1, and it is the candidate (the case header) or the page.
  await expect(page.locator("main h1")).toHaveCount(1);
}

/** The four-stage journey, and which stage is current. */
async function expectJourney(page: Page, current: "Förbered" | "Intervjua" | "Bedöm" | "Rapport") {
  const nav = page.getByRole("navigation", { name: /Intervjuns fyra steg|four stages/i });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  const items = nav.locator("ol").first().locator("li");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText(/Förbered|Prepare/);
  await expect(items.nth(1)).toContainText(/Intervjua|Interview/);
  await expect(items.nth(2)).toContainText(/Bedöm|Assess/);
  await expect(items.nth(3)).toContainText(/Rapport|Report/);
  await expect(nav.locator('[aria-current="step"]').first()).toContainText(current);
}

/** How many primary-styled actions are on screen. One per stage is the
 *  contract; the header's action and the stage's own form must not compete. */
async function primaryCount(page: Page): Promise<number> {
  return page.locator("main .bg-primary").count();
}

const caseIdFromUrl = (page: Page) =>
  page.url().match(/interview-intelligence\/([0-9a-f-]{36})/)![1];

/* ==================================================================== */
/* SCENARIO A — from the application                                    */
/* ==================================================================== */

test("A · from the application: plan, context visible, four stages, one action", async ({
  page,
}) => {
  await signIn(page, UI.email);
  await page.goto(`/employer/${UI.slug}/applications/${UI.appWithAssessment}`);
  const section = page.locator("section[aria-labelledby='candidate-structured-interview']");
  await expect(section).toBeVisible({ timeout: 45_000 });
  // The hub speaks the locked terminology.
  await expect(section).toContainText(/Kompetensbaserad intervju|Competency-based interview/);
  await expect(section).not.toContainText(/Interview Intelligence|Pilothypotes|Pilot hypothesis/);

  const plan = section.getByRole("link", { name: /Planera intervju|Plan an interview/i });
  const open = section.getByRole("link", { name: /Öppna intervjun|Öppna rapporten|Open/i });
  if ((await plan.count()) > 0) {
    await plan.first().click();
    await page.waitForURL(/interview-intelligence\/new/, { timeout: 45_000 });
    await expect(page.locator("main h1")).toContainText(/Planera intervju|Plan an interview/);
    await expectRecruiterScreen(page, "plan screen");
    await expect(page.locator("#ii-candidate")).not.toHaveValue("", { timeout: 30_000 });
    await expect(page.locator("#ii-pack option")).not.toHaveCount(1, { timeout: 30_000 });
    await page.locator("#ii-pack").selectOption({ index: 1 });
    await page.getByRole("button", { name: /Planera intervjun|Plan the interview/i }).click();
  } else {
    await open.first().click();
  }
  await page.waitForURL(/interview-intelligence\/[0-9a-f-]{36}\/(prepare|report)/, {
    timeout: 60_000,
  });

  if (/\/prepare$/.test(page.url())) {
    // PR18's context, on the Prepare screen, above the setup work.
    const briefing = page.locator("section[aria-labelledby='ii-context']");
    await expect(briefing).toBeVisible({ timeout: 30_000 });
    await expect(briefing).toContainText(/Intervjuunderlag|Interview briefing/);
    await expect(briefing).toContainText(/Väktare/i);
    await expectJourney(page, "Förbered");
    await expectRecruiterScreen(page, "prepare (from application)");
    // The guide is called what the brief says it is called.
    await expect(page.locator("main")).toContainText(
      /Intervjuguide för rollen|Interview guide for the role/,
    );
  }
});

/* ==================================================================== */
/* SCENARIOS B–D — the whole lifecycle on a fresh case                   */
/* ==================================================================== */

let walkedCase: string | null = null;

test("B–D · a fresh interview walks Förbered → Intervjua → Bedöm → Rapport with one action each", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page, JOURNEY.email);

  // ---- Förbered: plan a standalone interview --------------------------
  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence`);
  await expect(page.locator("main h1")).toContainText(/Intervjuer|Interviews/, {
    timeout: 45_000,
  });
  await expectRecruiterScreen(page, "interview list");
  await page
    .getByRole("link", { name: /Planera intervju|Plan an interview/i })
    .first()
    .click();
  await page.waitForURL(/interview-intelligence\/new/, { timeout: 45_000 });

  const ref = `Walk ${Date.now().toString(36)}`;
  await page.locator("#ii-title").fill(`PR19 · ${ref}`);
  await page.locator("#ii-candidate").fill(ref);
  await expect(page.locator("#ii-pack option")).not.toHaveCount(1, { timeout: 30_000 });
  await page.locator("#ii-pack").selectOption({ index: 1 });
  await page.getByRole("button", { name: /Planera intervjun|Plan the interview/i }).click();
  await page.waitForURL(/interview-intelligence\/[0-9a-f-]{36}\/prepare/, { timeout: 60_000 });
  walkedCase = caseIdFromUrl(page);

  await expectJourney(page, "Förbered");
  await expect(page.locator("main h1")).toContainText(ref);
  await expect(page.locator("main")).toContainText(/Förbereds|Being prepared/);
  await expectRecruiterScreen(page, "prepare (fresh)");

  // Add the material the plan will rest on.
  await page.locator("#src-label").fill("Annons");
  await page
    .locator("#src-text")
    .fill(
      "Väktare till bevakningsuppdrag. Krav: giltig väktarutbildning, god samarbetsförmåga och vana att hantera incidenter.",
    );
  await page.getByRole("button", { name: /^Lägg till$|^Add$/ }).click();
  // The plan form appears as soon as there is material; no "mark ready" step.
  await expect(page.locator("#mp-open")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: /Markera underlaget som klart|Mark the material as ready/ }),
  ).toHaveCount(0);
  await page.locator("#mp-time").fill("45 minuter");
  await page.locator("#mp-open").fill("Hälsa välkommen, förklara upplägget.");
  await page.locator("#mp-close").fill("Fråga om egna frågor, berätta om nästa steg.");
  await page
    .getByRole("button", { name: /Spara och godkänn planen|Save and approve the plan/ })
    .click();

  // Saved AND approved in one action: the case is ready, and the one action
  // is to start.
  await expect(page.locator("main")).toContainText(/Redo för intervju|Ready for interview/, {
    timeout: 30_000,
  });
  const start = page.getByRole("button", { name: /^Starta intervju$|^Start interview$/ });
  await expect(start).toBeVisible();
  expect(await primaryCount(page), "prepare: one primary action").toBe(1);
  await expectRecruiterScreen(page, "prepare (ready)");
  await start.click();
  await page.waitForURL(/\/interview$/, { timeout: 60_000 });

  // ---- Intervjua: Q1–Q8 ---------------------------------------------
  await expectJourney(page, "Intervjua");
  await expect(page.locator("main")).toContainText(/Intervju pågår|Interview in progress/);
  await expectRecruiterScreen(page, "live interview Q1");
  // The support column is called support, and the follow-ups sit in it.
  await expect(page.getByRole("heading", { name: /Intervjustöd|Interview support/ })).toBeVisible();
  await expect(page.locator("main")).toContainText(/Fördjupningsfrågor|Follow-up questions/);

  for (let i = 1; i <= 8; i += 1) {
    await expect(page.locator("main")).toContainText(new RegExp(`(Fråga|Question) ${i} (av|of) 8`));
    // The question dominates: the only h2 in the conversation column is the
    // governed prompt.
    const prompt = page.locator("main h2").first();
    await expect(prompt).toBeVisible();
    const promptBox = await prompt.boundingBox();
    expect(promptBox?.height ?? 0, "the question is set large").toBeGreaterThan(20);
    await page
      .locator("#note")
      .fill(`Svar på fråga ${i}: kandidaten beskrev en konkret situation.`);
    await page.getByRole("button", { name: /Markera som genomgången|Mark as covered/ }).click();
    await expect(page.locator("main")).toContainText(/Besvarad|Answered/, { timeout: 30_000 });
    if (i < 8) {
      await page.getByRole("button", { name: /^Nästa$|^Next$/ }).click();
    }
  }
  // Every question covered: ending the interview is now the ONE primary action.
  await expect(page.locator("main")).toContainText(
    /Alla frågor är markerade som genomgångna|Every question is marked as covered/,
  );
  const finish = page.getByRole("button", { name: /Avsluta intervjun|End the interview/ });
  await expect(finish).toHaveClass(/bg-primary/);
  await finish.click();
  await expect(page.locator("main")).toContainText(
    /Intervjun är genomförd|The interview is completed/,
    {
      timeout: 30_000,
    },
  );
  const toAssess = page.getByRole("link", { name: /Gå till bedömning|Go to assessment/ });
  await expect(toAssess.first()).toBeVisible();
  expect(await primaryCount(page), "interview complete: one primary action").toBe(1);
  await expectRecruiterScreen(page, "live interview (completed)");
  await toAssess.first().click();
  await page.waitForURL(/\/evidence$/, { timeout: 60_000 });

  // ---- Bedöm 1/2: choose the material ---------------------------------
  await expectJourney(page, "Bedöm");
  await expect(page.locator("main")).toContainText(/Underlag granskas|Material under review/);
  await expect(
    page.getByRole("heading", { name: /Välj underlag|Choose the material/ }).first(),
  ).toBeVisible();
  await expectRecruiterScreen(page, "choose material Q1");
  const questionButtons = page
    .getByRole("navigation", { name: /^Frågor$|^Questions$/ })
    .first()
    .locator("button");
  await expect(questionButtons).toHaveCount(8);
  for (let i = 0; i < 8; i += 1) {
    await questionButtons.nth(i).click();
    const use = page.getByRole("button", {
      name: /Använd som bedömningsunderlag|Use as assessment material/,
    });
    await expect(use.first()).toBeVisible({ timeout: 30_000 });
    await use.first().click();
    await expect(page.locator("main")).toContainText(/Bekräftat underlag|Confirmed material/, {
      timeout: 30_000,
    });
  }
  await page
    .getByRole("link", { name: /Gör din bedömning|Make your assessment/ })
    .first()
    .click();
  await page.waitForURL(/\/assessment$/, { timeout: 60_000 });

  // ---- Bedöm 2/2: assess against the requirements ---------------------
  await expectJourney(page, "Bedöm");
  await expectRecruiterScreen(page, "assess");
  // Human judgement only: a recruiter picks a described level and writes why.
  await expect(page.locator("main")).toContainText(
    /Hur tydligt visar svaret|How clearly does the response/,
  );
  for (let i = 0; i < 8; i += 1) {
    const form = page.locator("main form").first();
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByText(/^Tydligt visat$|^Clearly demonstrated$/).click();
    await form
      .locator("textarea[id^='rat-']")
      .fill("Konkret exempel med eget handlande och resultat.");
    await form.getByRole("button", { name: /Spara bedömning|Save assessment/ }).click();
    await expect(page.locator("main")).toContainText(new RegExp(`${i + 1} / 8`), {
      timeout: 30_000,
    });
  }
  const done = page.getByRole("button", { name: /Klar med bedömningen|Finished assessing/ });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await done.click();
  await page.waitForURL(/\/report$/, { timeout: 60_000 });

  // ---- Rapport: the material, then the one irreversible action --------
  await expectJourney(page, "Rapport");
  await expect(page.locator("main")).toContainText(/Rapport redo|Report ready/);
  await expect(
    page.getByRole("heading", { name: /Rapportunderlag|Report material/ }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    /Underlag och bedömning per krav|Material and assessment by requirement/,
  );
  await expect(page.locator("main")).toContainText(
    /Underlaget är komplett|The material is complete/,
  );
  await expectRecruiterScreen(page, "report (ready, owner)");
  const finalise = page.getByRole("button", { name: /Slutför rapporten|Complete the report/ });
  await expect(finalise).toBeVisible();
  await expect(finalise).toBeEnabled();
  // Still confirmed as irreversible, in words, beside the button.
  await expect(page.locator("main")).toContainText(/oföränderlig|immutable/);
  expect(await primaryCount(page), "report ready: one primary action").toBe(1);
  await finalise.click();
  await expect(page.locator("main")).toContainText(/Rapport klar|Report complete/, {
    timeout: 45_000,
  });
  await expect(page.locator("main")).toContainText(/Slutlig och oföränderlig|Final and immutable/);
  await expectRecruiterScreen(page, "report (final)");
});

/* ==================================================================== */
/* SCENARIO E — the member sees the truth about finalisation            */
/* ==================================================================== */

test("E · a member sees the ready state, no finalise button, and a way back to the candidate", async ({
  page,
}) => {
  await signIn(page, INTERVIEWER);
  await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${READY_CASE}/report`);
  const main = page.locator("main");
  await expect(main).toContainText(/Underlaget är komplett|The material is complete/, {
    timeout: 45_000,
  });
  await expect(main).toContainText(/redo för slutgodkännande|ready for final approval/i);
  await expect(main).toContainText(/ägare eller administratör|owner or administrator/);
  await expect(
    page.getByRole("button", { name: /Slutför rapporten|Complete the report/ }),
  ).toHaveCount(0);
  await expect(main.locator('[role="alert"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Tillbaka till kandidaten|Back to the candidate/ }),
  ).toBeVisible();
  expect(await primaryCount(page), "member report: no primary action to take").toBe(0);
  await expectJourney(page, "Rapport");
  await expectRecruiterScreen(page, "report (member)");
});

/* ==================================================================== */
/* SCENARIO F — the key path at 375, 768 and 1440                        */
/* ==================================================================== */

for (const [label, width, height] of [
  ["375", 375, 812],
  ["768", 768, 1024],
  ["1440", 1440, 900],
] as const) {
  test(`F · viewport ${label} · every stage screen stays usable and never scrolls sideways`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signIn(page, JOURNEY.email);
    const caseId = walkedCase ?? READY_CASE;
    for (const seg of ["prepare", "interview", "evidence", "assessment", "report"]) {
      await page.goto(`/employer/${JOURNEY.slug}/interview-intelligence/${caseId}/${seg}`);
      await expect(page.locator("main h1")).toBeVisible({ timeout: 45_000 });
      await expect(
        page.getByRole("navigation", { name: /Intervjuns fyra steg|four stages/i }),
      ).toBeVisible();
      await expectRecruiterScreen(page, `${seg} at ${label}px`);
      // Every interactive control meets the touch target on a phone.
      if (width < 768) {
        const small = await page.evaluate(
          () =>
            Array.from(document.querySelectorAll("main a[href], main button"))
              .filter((el) => (el as HTMLElement).offsetParent !== null)
              .map((el) => el.getBoundingClientRect())
              .filter((r) => r.height > 0 && r.height < 24).length,
        );
        expect(small, `${seg} at ${label}px: controls under 24px tall`).toBe(0);
      }
    }
  });
}

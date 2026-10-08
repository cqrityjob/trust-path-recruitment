/**
 * Recruiter Intelligence v0.3 P0: real routed, AI-off synthetic interviews.
 * Loopback only. Seed journey + regression prerequisites + P0 fixture first.
 * GoTrue/storage substitution is described in scripts/local-stack/README.md;
 * PostgreSQL, RLS, RPCs and the application's server functions are real.
 * Screenshots contain only synthetic candidates. Traces are not deliverables.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "";
test.skip(process.env.E2E_LOCAL_STACK !== "1", "Requires the disposable synthetic local stack.");
test.skip(
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE),
  "Loopback origin required.",
);
test.use({ actionTimeout: 30_000 });

const OWNER = "journey@local.test";
const PASSWORD = "LocalJourney!2026";
const SLUG = "journey-ab";
const scenarios = [
  { role: "guard", label: /Väktare/, start: "standalone", lang: "sv", app: null },
  {
    role: "manager",
    label: /Säkerhetschef/,
    start: "application",
    lang: "sv",
    app: "e4000000-0000-4000-8000-00000000aa03",
  },
  { role: "manager", label: /Säkerhetschef/, start: "standalone", lang: "en", app: null },
  {
    role: "guard",
    label: /Väktare/,
    start: "application",
    lang: "en",
    app: "e4000000-0000-4000-8000-00000000aa04",
  },
] as const;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
}

async function screenshot(page: Page, name: string, project: string) {
  const dir = process.env.E2E_P0_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${project}-${name}.png`), fullPage: true });
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

function isProcessWrite(url: string) {
  try {
    const name = new URL(url).pathname.split("/").at(-1)!;
    return Buffer.from(name, "base64")
      .toString()
      .includes("saveSessionProcess_createServerFn_handler");
  } catch {
    return false;
  }
}

async function localSession(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
    if (!key) throw new Error("Synthetic session missing");
    const session = JSON.parse(localStorage.getItem(key)!);
    const issuer = new URL(JSON.parse(atob(session.access_token.split(".")[1])).iss).origin;
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(issuer))
      throw new Error("Non-local backend refused");
    return { issuer, token: session.access_token as string };
  });
}

async function completionDrainsNewerText(page: Page, caseId: string) {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held!: () => void;
  const requested = new Promise<void>((resolve) => {
    held = resolve;
  });
  let writes = 0;
  const routeHandler = async (route: import("@playwright/test").Route) => {
    if (isProcessWrite(route.request().url()) && ++writes === 1) {
      held();
      await hold;
    }
    await route.continue();
  };
  await page.route("**/_serverFn/**", routeHandler);
  const a = "P0 completion snapshot A held on network";
  const b = "P0 completion snapshot B typed while A is pending must be stored";
  const deviations = "P0 completion deviation B must drain before completion";
  const noteB =
    "P0 mixed save note B typed during process save: responsibility, action and result.";
  await page.locator("#reflect").fill(a);
  // Do not await a navigation/action result: this click starts the guarded
  // flush, then the human keeps typing while its first RPC is held.
  await page.getByRole("button", { name: /Avsluta intervjun|End the interview/ }).click();
  await requested;
  await expect(page.locator("#reflect")).toBeEnabled();
  await page.locator("#reflect").fill(b);
  await page.locator("#protocol-deviations").fill(deviations);
  // The first note flush has already finished when process A is sent. A new
  // note typed now must still drain before the session becomes completed.
  await page.locator("#note").fill(noteB);
  release();
  await expect(page.locator("main")).toContainText(
    /Intervjun är genomförd|The interview is completed/,
    { timeout: 30_000 },
  );
  await page.unroute("**/_serverFn/**", routeHandler);
  expect(writes, "one completion guard drains the newer draft too").toBeGreaterThanOrEqual(2);
  const api = await localSession(page);
  const stored = await page.request.get(
    `${api.issuer}/rest/v1/scp_interview_sessions?case_id=eq.${caseId}&select=id,status,process_reflection,protocol_deviations`,
    {
      headers: { Authorization: `Bearer ${api.token}` },
    },
  );
  expect(stored.status()).toBe(200);
  const sessions = await stored.json();
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({
    status: "completed",
    process_reflection: b,
    protocol_deviations: deviations,
  });
  const notes = await page.request.get(
    `${api.issuer}/rest/v1/scp_interview_session_notes?session_id=eq.${sessions[0].id}&select=body`,
    { headers: { Authorization: `Bearer ${api.token}` } },
  );
  expect(notes.status()).toBe(200);
  expect((await notes.json()).map((n: { body: string }) => n.body)).toContain(noteB);
  await page.reload();
  await expect(page.locator("main")).toContainText(
    /Intervjun är genomförd|The interview is completed/,
    { timeout: 30_000 },
  );
  return noteB;
}

async function questionChangeDrainsNewerText(page: Page) {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held!: () => void;
  const requested = new Promise<void>((resolve) => {
    held = resolve;
  });
  let writes = 0;
  const routeHandler = async (route: import("@playwright/test").Route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (
      Buffer.from(name, "base64").toString().includes("saveInterviewNote_createServerFn_handler") &&
      ++writes === 1
    ) {
      held();
      await hold;
    }
    await route.continue();
  };
  await page.route("**/_serverFn/**", routeHandler);
  await page.locator("#note").fill("P0 Q1 snapshot A held before changing question");
  await page.getByRole("button", { name: /^Nästa$|^Next$/ }).click();
  await requested;
  const b =
    "P0 Q1 snapshot B typed while A is pending; concrete responsibility, action and result.";
  await page.locator("#note").fill(b);
  release();
  await expect(page.locator("main")).toContainText(/(Fråga|Question) 2 (av|of) 8/, {
    timeout: 30_000,
  });
  await page.unroute("**/_serverFn/**", routeHandler);
  expect(writes, "one Next guard drains the newer note too").toBeGreaterThanOrEqual(2);
  await expect(page.locator("#note")).toHaveValue("");
  await page.getByRole("button", { name: /^Föregående$|^Previous$/ }).click();
  await expect(page.locator("main")).toContainText(/(Fråga|Question) 1 (av|of) 8/);
  await expect(page.locator("#note")).toHaveValue(b, { timeout: 30_000 });
  await page.reload();
  await expect(page.locator("#note")).toHaveValue(b, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Nästa$|^Next$/ }).click();
}

async function processFailureAndConflict(page: Page, caseId: string) {
  const failedDraft = "P0 network failure draft retained for explicit retry";
  const failureRoute = async (route: import("@playwright/test").Route) => {
    if (isProcessWrite(route.request().url())) await route.abort("failed");
    else await route.continue();
  };
  await page.route("**/_serverFn/**", failureRoute);
  await page.locator("#reflect").fill(failedDraft);
  await page.getByRole("button", { name: /^Pausa$|^Pause$/ }).click();
  await expect(page.locator('[role="alert"]')).toContainText(
    /Reflektion och avvikelser kunde inte sparas|Reflection and changes could not be saved/,
    { timeout: 30_000 },
  );
  await expect(page.locator("#reflect")).toHaveValue(failedDraft);
  await page.unroute("**/_serverFn/**", failureRoute);
  await page.getByRole("button", { name: /Försök spara igen|Try saving again/ }).click();
  await expect(page.locator('[role="alert"]')).toHaveCount(0, { timeout: 30_000 });

  // A second tab has a genuine stale version. Hold only that tab's outgoing
  // process-save request until the first tab's write commits, then let the
  // real RPC reject it. We do not fabricate a stale response or alter RLS.
  const other = await page.context().newPage();
  await other.goto(`/employer/${SLUG}/interview-intelligence/${caseId}/interview`);
  await expect(other.locator("#reflect")).toHaveValue(failedDraft, { timeout: 30_000 });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held!: () => void;
  const requested = new Promise<void>((resolve) => {
    held = resolve;
  });
  await other.route("**/_serverFn/**", async (route) => {
    if (isProcessWrite(route.request().url())) {
      held();
      await hold;
    }
    await route.continue();
  });
  const otherDraft = "P0 second tab unsaved text must survive conflict";
  await other.locator("#reflect").fill(otherDraft);
  await requested;
  const firstStored = "P0 first tab saved version wins through CAS";
  await page.locator("#reflect").fill(firstStored);
  await page.getByRole("button", { name: /^Pausa$|^Pause$/ }).click();
  await expect(page.locator("main")).toContainText(/Intervjun är pausad|interview is paused/i, {
    timeout: 30_000,
  });
  release();
  await expect(other.locator('[role="alert"]')).toContainText(/annan flik|another tab/, {
    timeout: 30_000,
  });
  await expect(other.locator("#reflect")).toHaveValue(otherDraft);
  await other.getByRole("button", { name: /Läs in sparad version|Load the saved version/ }).click();
  await expect(other.locator("#reflect")).toHaveValue(firstStored, { timeout: 30_000 });
  await other.close();
  await page.getByRole("button", { name: /Återuppta|Resume/ }).click();
  await expect(page.locator("main")).toContainText(/Intervju pågår|Interview in progress/);
  await expect(page.getByRole("button", { name: /^Återuppta$|^Resume$/ })).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function addManualCheckpoint(page: Page, ref: string) {
  const section = page.getByTestId("manual-control-points").first();
  await expect(section).toBeVisible({ timeout: 30_000 });
  await section
    .locator("summary")
    .filter({ hasText: /Lägg till kontrollpunkt|Add checkpoint/ })
    .click();
  const form = section.getByTestId("manual-control-form");
  const statement = `P0 follow-up ${ref}: rollkravets verifieringsväg behöver preciseras.`;
  await form.locator("#control-kind").selectOption("verification");
  await form.locator("#control-statement").fill(statement);
  await form
    .locator("#control-neutral-question")
    .fill("Vilket underlag visar du för detta rollkrav?");
  await form.locator("#control-question").selectOption({ label: "Q1" });
  await form.locator("#control-source-passage").selectOption({ index: 1 });
  await expect(form.locator("blockquote")).not.toBeEmpty();
  await form.locator("#control-responsible").fill("Synthetic recruiter QA");
  await form
    .locator("#control-next-action")
    .fill("Begär det relevanta underlaget efter mänsklig granskning.");
  await form.locator("#control-due").fill("2026-10-15");
  await form.getByRole("button", { name: /Lägg till kontrollpunkt|Add checkpoint/ }).click();
  const item = section.getByTestId("manual-control-item").filter({ hasText: statement });
  await expect(item).toHaveCount(1, { timeout: 30_000 });
  await item.locator("summary").click();
  await expect(item).toContainText("Vilket underlag visar du för detta rollkrav?");
  const review = item.getByTestId("manual-control-review");
  await review.locator('select[id$="-state"]').selectOption("needs_verification");
  await review
    .locator('textarea[id$="-note"]')
    .fill("Mänskligt dokumenterad uppföljning: kontrollen återstår.");
  await review.getByRole("button", { name: /Spara uppföljning|Save follow-up/ }).click();
  await expect(review).toContainText(/Uppföljningen är sparad|Follow-up is saved/, {
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByTestId("manual-control-item").filter({ hasText: statement })).toHaveCount(
    1,
    { timeout: 30_000 },
  );
  return statement;
}

for (const scenario of scenarios) {
  test(`${scenario.role} ${scenario.start} ${scenario.lang}: AI-off pause, refresh, evidence and immutable report`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(300_000);
    await signIn(page, OWNER);
    // This is the same persisted locale used by the language picker. A fresh
    // navigation must render the actual English UI while the Swedish governed
    // role questions retain their approved wording and explicit limitation.
    await page.evaluate((lang) => localStorage.setItem("cqrityjob.lang", lang), scenario.lang);
    const ref = `P0 ${scenario.role} ${scenario.start} ${Date.now()}`;
    const cohort = (
      { chromium: "0", "mobile-375": "1", "mobile-390": "2" } as Record<string, string>
    )[info.project.name];
    expect(cohort, "A separate synthetic application is seeded per viewport").toBeDefined();
    const applicationId = scenario.app ? scenario.app.replace(/0([34])$/, `${cohort}$1`) : null;
    const url = `/employer/${SLUG}/interview-intelligence/new${applicationId ? `?applicationId=${applicationId}` : ""}`;
    await page.goto(url);
    await expect(page.locator("#ii-pack")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#ii-pack")).toContainText(scenario.label, { timeout: 30_000 });
    const labels = await page.locator("#ii-pack option").allTextContents();
    const packLabel = labels.find((x) => scenario.label.test(x));
    expect(packLabel).toBeTruthy();
    await page.locator("#ii-title").fill(ref);
    if (!scenario.app) await page.locator("#ii-candidate").fill(ref);
    else await expect(page.locator("#ii-candidate")).not.toHaveValue("", { timeout: 30_000 });
    await page.locator("#ii-pack").selectOption({ label: packLabel! });
    await page.getByRole("button", { name: /Planera intervjun|Plan the interview/ }).click();
    await page.waitForURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, { timeout: 60_000 });
    await expect(page.locator("#mp-open")).toBeVisible({ timeout: 45_000 });
    const caseId = page.url().match(/interview-intelligence\/([0-9a-f-]{36})/)![1];
    await expect(page.locator("html")).toHaveAttribute("lang", scenario.lang);
    const stages = page
      .getByRole("navigation", { name: /Intervjuns fyra steg|four stages/i })
      .locator("ol")
      .first()
      .locator("li");
    await expect(stages).toHaveCount(4);
    if (scenario.app) {
      await expect(page.locator("section[aria-labelledby='ii-context']")).toBeVisible();
      await expect(page.locator('section[aria-labelledby="s-background"]')).toContainText(
        /ansökan|application/i,
      );
    } else {
      await expect(page.locator('section[aria-labelledby="s-background"]')).toContainText(
        /fristående|standalone/i,
      );
    }
    const checkpoint = await addManualCheckpoint(page, ref);
    await noOverflow(page);
    await screenshot(
      page,
      `${scenario.role}-${scenario.start}-${scenario.lang}-prepare`,
      info.project.name,
    );
    await page.locator("#mp-time").fill("45 minuter (syntetiskt QA)");
    await page
      .locator("#mp-open")
      .fill("Förklara syfte, upplägg och att bedömningen görs av människor.");
    await page
      .locator("#mp-close")
      .fill("Sammanfatta sakligt, erbjud rättelse och beskriv nästa kontakt.");
    await page
      .getByRole("button", { name: /Spara och godkänn planen|Save and approve the plan/ })
      .click();
    const start = page.getByRole("button", { name: /^Starta intervju$|^Start interview$/ });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await start.click();
    await page.waitForURL(/\/interview$/, { timeout: 60_000 });
    await expect(page.locator("#note")).toBeVisible({ timeout: 30_000 });
    if (scenario.role === "guard" && scenario.start === "standalone")
      await processFailureAndConflict(page, caseId);
    if (scenario.lang === "en")
      await expect(page.locator("main")).toContainText(/guide's own language.*never translated/i);
    const prompts = new Set<string>();
    for (let i = 1; i <= 8; i++) {
      await expect(page.locator("main")).toContainText(
        new RegExp(`(Fråga|Question) ${i} (av|of) 8`),
      );
      prompts.add(await page.locator("main h2").first().innerText());
      await page
        .locator("#note")
        .fill(
          `Syntetiskt svar Q${i}: eget ansvar, konkret handling och ${i <= 6 ? "beskrivet resultat" : "hypotetiskt resonemang; inte faktisk erfarenhet"}.`,
        );
      await page.getByRole("button", { name: /Markera som genomgången|Mark as covered/ }).click();
      await expect(page.locator("main")).toContainText(/Besvarad|Answered/, { timeout: 30_000 });
      if (i === 1 && scenario.role === "guard" && scenario.start === "standalone") {
        await questionChangeDrainsNewerText(page);
      } else if (i < 8) {
        await page.getByRole("button", { name: /^Nästa$|^Next$/ }).click();
      }
    }
    expect(prompts.size, "eight distinct governed core questions").toBe(8);
    const reflection = `P0 reflection ${ref}: informationsmålen följs upp utan personomdöme.`;
    const deviation = `P0 deviation ${ref}: kort paus; följdfråga återstår.`;
    await page.locator("#reflect").fill(reflection);
    await page.locator("#protocol-deviations").fill(deviation);
    // Immediate pause deliberately happens before the debounce interval:
    // the lifecycle action must flush both drafts rather than lose them.
    await page.getByRole("button", { name: /^Pausa$|^Pause$/ }).click();
    await expect(page.locator("main")).toContainText(/Intervjun är pausad|interview is paused/i);
    await page.reload();
    await expect(page.locator("main")).toContainText(/(Fråga|Question) 8 (av|of) 8/);
    await expect(page.locator("#note")).toHaveValue(
      "Syntetiskt svar Q8: eget ansvar, konkret handling och hypotetiskt resonemang; inte faktisk erfarenhet.",
      { timeout: 30_000 },
    );
    await expect(page.locator("#reflect")).toHaveValue(reflection, { timeout: 30_000 });
    await expect(page.locator("#protocol-deviations")).toHaveValue(deviation);
    await page.getByRole("button", { name: /Återuppta|Resume/ }).click();
    await expect(page.locator("main")).toContainText(/Intervju pågår|Interview in progress/);
    await expect(page.getByRole("button", { name: /^Återuppta$|^Resume$/ })).toHaveCount(0, {
      timeout: 30_000,
    });
    await noOverflow(page);
    await screenshot(
      page,
      `${scenario.role}-${scenario.start}-${scenario.lang}-resumed`,
      info.project.name,
    );
    let mixedNote: string | null = null;
    if (scenario.role === "guard" && scenario.start === "standalone") {
      mixedNote = await completionDrainsNewerText(page, caseId);
    } else {
      await page.getByRole("button", { name: /Avsluta intervjun|End the interview/ }).click();
    }
    await expect(page.locator("main")).toContainText(
      /Intervjun är genomförd|The interview is completed/,
      { timeout: 30_000 },
    );
    await page
      .getByRole("link", { name: /Gå till bedömning|Go to assessment/ })
      .first()
      .click();
    await page.waitForURL(/\/evidence$/, { timeout: 60_000 });
    const questionButtons = page
      .getByRole("navigation", { name: /^Frågor$|^Questions$/ })
      .first()
      .locator("button");
    await expect(questionButtons).toHaveCount(8, { timeout: 30_000 });
    for (let i = 0; i < 8; i++) {
      await questionButtons.nth(i).click();
      const use = page
        .getByRole("button", { name: /Använd som bedömningsunderlag|Use as assessment material/ })
        .first();
      await expect(use).toBeVisible({ timeout: 30_000 });
      await use.click();
      await expect(page.locator("main")).toContainText(/Bekräftat underlag|Confirmed material/, {
        timeout: 30_000,
      });
    }
    await page
      .getByRole("link", { name: /Gör din bedömning|Make your assessment/ })
      .first()
      .click();
    await page.waitForURL(/\/assessment$/, { timeout: 60_000 });
    for (let i = 0; i < 8; i++) {
      const form = page.locator("main form").first();
      await expect(form).toBeVisible({ timeout: 30_000 });
      await form.getByText(/^Tydligt visat$|^Clearly demonstrated$/).click();
      await form
        .locator("textarea[id^='rat-']")
        .fill(`Mänsklig QA-bedömning Q${i + 1}, endast mot frågans rollkrav.`);
      await form.getByRole("button", { name: /Spara bedömning|Save assessment/ }).click();
      await expect(page.locator("main")).toContainText(new RegExp(`${i + 1} / 8`), {
        timeout: 30_000,
      });
    }
    await page.getByRole("button", { name: /Klar med bedömningen|Finished assessing/ }).click();
    await page.waitForURL(/\/report$/, { timeout: 60_000 });
    const finalise = page.getByRole("button", { name: /Slutför rapporten|Complete the report/ });
    await expect(finalise).toBeVisible({ timeout: 30_000 });
    await expect(finalise).toBeDisabled();
    await page
      .getByRole("button", { name: /Förhandsgranska rapporten|Preview the report/ })
      .click();
    await expect(finalise).toBeEnabled({ timeout: 30_000 });
    await finalise.click();
    await expect(page.locator("main")).toContainText(/Rapport fastställd|Report finalised/, {
      timeout: 45_000,
    });
    await expect(page.locator("main")).toContainText(
      /Slutlig och oföränderlig|Final and immutable/,
    );
    await expect(page.locator("main")).toContainText(checkpoint);
    if (mixedNote) await expect(page.locator("main")).toContainText(mixedNote);
    await page.reload();
    await expect(page.locator("main")).toContainText(/Rapport fastställd|Report finalised/, {
      timeout: 30_000,
    });
    await noOverflow(page);
    await screenshot(
      page,
      `${scenario.role}-${scenario.start}-${scenario.lang}-report`,
      info.project.name,
    );

    // A separate identity sees the immutable report via its existing reviewer
    // grant, while direct finalisation remains owner/admin only. Membership
    // does not become a new generic report permission.
    const memberContext = await browser.newContext({ baseURL: BASE });
    const member = await memberContext.newPage();
    await signIn(member, "interviewer@local.test");
    await member.goto(`/employer/${SLUG}/interview-intelligence/${caseId}/report`);
    await expect(member.locator("main")).toContainText(/Rapport fastställd|Report finalised/, {
      timeout: 30_000,
    });
    await expect(
      member.getByRole("button", { name: /Slutför rapporten|Complete the report/ }),
    ).toHaveCount(0);
    const api = await localSession(member);
    const denied = await member.request.post(
      `${api.issuer}/rest/v1/rpc/scp_iv_finalise_previewed_report`,
      {
        headers: { Authorization: `Bearer ${api.token}` },
        data: {
          _case_id: caseId,
          _expected_basis_hash: "not-an-owner-preview",
          _draft_run_id: null,
        },
      },
    );
    expect(denied.status()).toBe(403);
    expect(await denied.text()).toMatch(/owner|admin|FINAL|42501|PERMITTED|FORBIDDEN/i);
    await memberContext.close();
  });
}

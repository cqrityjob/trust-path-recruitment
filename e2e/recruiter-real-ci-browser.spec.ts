/**
 * Recruiter Intelligence v0.3 P0: real routed, AI-off synthetic interviews.
 * Loopback only. Seed journey + regression prerequisites + P0 fixture first.
 * Actual local GoTrue/Storage and real password UI-login are required.
 * No substitute Auth/Storage or credential arguments are accepted.
 * Screenshots contain only synthetic candidates. Traces are not deliverables.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_SHA, readCIContext } from "../scripts/recruiter-real-ci-contract.mjs";
import { requireNativeNoteReadback } from "../scripts/recruiter-real-ci-browser-diagnostic.mjs";

const BASE = process.env.E2E_BASE_URL ?? "";
test.skip(process.env.E2E_LOCAL_STACK !== "1", "Requires the disposable synthetic local stack.");
test.skip(
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE),
  "Loopback origin required.",
);
test.use({ actionTimeout: 30_000 });

const { stackRoot: STACK } = readCIContext();
if (process.env.RI_OPS_STACK_ROOT !== STACK || BASE !== "http://127.0.0.1:3140")
  throw Error("REAL_BROWSER_TARGET_REQUIRED");
const temp = join(STACK, "supabase/.temp");
for (const name of ["ri-local-status.json", "ri-real-synthetic-users.json"])
  if ((statSync(join(temp, name)).mode & 0o077) !== 0)
    throw Error("REAL_BROWSER_PRIVATE_INPUT_REQUIRED");
const status = JSON.parse(readFileSync(join(temp, "ri-local-status.json"), "utf8"));
const users = JSON.parse(readFileSync(join(temp, "ri-real-synthetic-users.json"), "utf8"));
if (status.API_URL !== "http://127.0.0.1:55690") throw Error("REAL_BROWSER_API_REQUIRED");
const OWNER = users.employer.email;
const SLUG = "ri-real-20261008";
function record(value: Record<string, unknown>) {
  const file = join(temp, "ri-real-browser", "journeys.json");
  let measurements: Record<string, unknown>[] = [];
  try {
    measurements = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // A fresh evidence run has no prior recorder file.
  }
  measurements.push(value);
  mkdirSync(join(temp, "ri-real-browser"), { recursive: true });
  writeFileSync(
    join(temp, "ri-real-browser", "journeys.json"),
    JSON.stringify(measurements, null, 2),
    { mode: 0o600 },
  );
}
const browserNetwork = new WeakMap<Page, Record<string, unknown>[]>();
function instrument(page: Page) {
  const events: Record<string, unknown>[] = [];
  browserNetwork.set(page, events);
  const name = (url: string) => {
    const u = new URL(url);
    let path = u.pathname;
    if (path.includes("/_serverFn/")) {
      const decoded = Buffer.from(path.split("/").at(-1)!, "base64").toString();
      path = decoded.match(/[A-Za-z_]+_createServerFn_handler/)?.[0] ?? "server-function";
    }
    return `${u.origin}${path}`;
  };
  page.on("request", (request) => {
    if (/\/_serverFn\/|\/rest\/|\/auth\//.test(request.url()))
      events.push({
        at: new Date().toISOString(),
        event: "request",
        name: name(request.url()),
        method: request.method(),
      });
  });
  page.on("response", (response) => {
    if (/\/_serverFn\/|\/rest\/|\/auth\//.test(response.url()))
      events.push({
        at: new Date().toISOString(),
        event: "response",
        name: name(response.url()),
        status: response.status(),
      });
  });
  page.on("requestfailed", (request) =>
    events.push({
      at: new Date().toISOString(),
      event: "failed",
      name: name(request.url()),
      error: request.failure()?.errorText,
    }),
  );
}
test.beforeEach(async ({ page }) => instrument(page));
test.afterEach(async ({ page }, info) => {
  const dir = join(temp, "ri-real-browser", "observations");
  mkdirSync(dir, { recursive: true });
  const tag = `${info.project.name}-${info.title.split(":")[0].replaceAll(" ", "-")}-${Date.now()}`;
  writeFileSync(
    join(dir, `${tag}.json`),
    JSON.stringify(
      {
        status: info.status,
        sourceSha: APP_SHA,
        at: new Date().toISOString(),
        path: new URL(page.url()).pathname,
        network: browserNetwork.get(page),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  if (info.status !== "passed") {
    await page.screenshot({ path: join(dir, `${tag}.png`), fullPage: true });
    writeFileSync(join(dir, `${tag}.txt`), await page.locator("body").innerText(), { mode: 0o600 });
  }
});

const scenarios = [
  { role: "guard", label: /Väktare/, start: "standalone", lang: "sv", app: null },
  {
    role: "manager",
    label: /Säkerhetschef/,
    start: "application",
    lang: "sv",
    app: "manager-sv",
  },
  { role: "manager", label: /Säkerhetschef/, start: "standalone", lang: "en", app: null },
  {
    role: "guard",
    label: /Väktare/,
    start: "application",
    lang: "en",
    app: "guard-en",
  },
] as const;

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  const actor = Object.values(users as Record<string, { email: string; password: string }>).find(
    (u) => u.email === email,
  ) as { password: string } | undefined;
  if (!actor) throw Error("REAL_BROWSER_UNKNOWN_ACTOR");
  await page.locator('input[type="password"]').first().fill(actor.password);
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

async function sessionReadback(page: Page, caseId: string) {
  const api = await localSession(page);
  const response = await page.request.get(
    `${api.issuer}/rest/v1/scp_interview_sessions?case_id=eq.${caseId}&select=id,status,updated_at,process_reflection,protocol_deviations`,
    {
      headers: {
        apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
        Authorization: `Bearer ${api.token}`,
      },
    },
  );
  return { status: response.status(), rows: await response.json() };
}

async function frozenContent(page: Page, caseId: string) {
  const api = await localSession(page);
  const response = await page.request.post(`${api.issuer}/rest/v1/rpc/scp_iv_case_frozen_content`, {
    headers: {
      apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
      Authorization: `Bearer ${api.token}`,
    },
    data: { _case_id: caseId },
  });
  expect(response.status()).toBe(200);
  const snapshot = await response.json();
  expect(snapshot.provenance).toBe("case_created");
  expect(snapshot.requires_acknowledgement).toBe(false);
  expect(snapshot.manifest.observation).toBe("frozen_case_content");
  expect(snapshot.manifest.pack_content_status).toBe("draft");
  expect(snapshot.manifest.method_approval_state).toBe("draft");
  expect(snapshot.manifest.content.questions).toHaveLength(8);
  expect(snapshot.manifest.content.competencies).toHaveLength(6);
  expect(snapshot.manifest.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(snapshot.manifest.content.client_copy_version).toBe("ri-interview-copy-v1");
  return snapshot.manifest;
}

const questionDrainMarker =
  "P0 Q1 snapshot B typed while A is pending; concrete responsibility, action and result.";
const completionDrainMarker =
  "P0 mixed save note B typed during process save: responsibility, action and result.";

async function readOwnQuestionNotes(
  page: Page,
  caseId: string,
  questions: { id: string; code: string }[],
  markers: Record<string, string>,
  phase: "paused" | "completed" | "evidence",
) {
  const api = await localSession(page);
  const headers = {
    apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    Authorization: `Bearer ${api.token}`,
  };
  const read = async (path: string) => {
    const response = await page.request.get(`${api.issuer}/rest/v1/${path}`, { headers });
    if (response.status() !== 200) throw Error(`REAL_CI_NOTE_READBACK_${phase.toUpperCase()}_HTTP`);
    return response.json();
  };
  const sessions = await read(`scp_interview_sessions?case_id=eq.${caseId}&select=id,status`);
  const cases = await read(`scp_interview_cases?id=eq.${caseId}&select=status`);
  if (!Array.isArray(sessions) || sessions.length !== 1)
    throw Error(`REAL_CI_NOTE_READBACK_${phase.toUpperCase()}_SESSION_COUNT`);
  const notes = await read(
    `scp_interview_session_notes?session_id=eq.${sessions[0].id}&select=question_id,body`,
  );
  const result = requireNativeNoteReadback({ phase, sessions, cases, questions, notes, markers });
  // Only fixed success labels/counts enter the private journey recorder;
  // neither original note bodies nor source/case/question IDs are exported.
  record({ kind: "actual_own_auth_question_note_readback", ...result });
}

async function evidenceProbe(
  question: number,
  reason: "SELECTION" | "NOTE_VISIBLE" | "USE_VISIBLE" | "CONFIRMED_EXCERPT",
  assertion: () => Promise<void>,
) {
  try {
    await assertion();
  } catch {
    // Keep every assertion/time bound, but expose only a fixed question/stage
    // code instead of locator details or material from the private UI error.
    throw Error(`REAL_CI_EVIDENCE_Q${question}_${reason}`);
  }
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
  const noteB = completionDrainMarker;
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
      headers: {
        apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
        Authorization: `Bearer ${api.token}`,
      },
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
    {
      headers: {
        apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
        Authorization: `Bearer ${api.token}`,
      },
    },
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
  const b = questionDrainMarker;
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
  instrument(other);
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
  const firstCommitted = await sessionReadback(page, caseId);
  release();
  try {
    await expect(other.locator('[role="alert"]')).toContainText(/annan flik|another tab/, {
      timeout: 30_000,
    });
  } finally {
    const dir = join(temp, "ri-real-browser", "observations");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `two-tab-${Date.now()}.json`),
      JSON.stringify(
        {
          firstCommitted,
          afterWait: await sessionReadback(page, caseId),
          otherNetwork: browserNetwork.get(other),
          otherBody: await other.locator("body").innerText(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
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

test("two-tab process CAS on real Auth", async ({ page }, info) => {
  test.skip(
    process.env.RI_REAL_CAS_ONLY !== "1",
    "Separate targeted follow-up after twelve primary journeys",
  );
  test.setTimeout(180_000);
  await signIn(page, OWNER);
  await page.evaluate(() => localStorage.setItem("cqrityjob.lang", "sv"));
  await page.goto(`/employer/${SLUG}/interview-intelligence/new`);
  await expect(page.locator("#ii-pack")).toBeVisible({ timeout: 30_000 });
  const labels = await page.locator("#ii-pack option").allTextContents();
  const guard = labels.find((label) => /Väktare/.test(label));
  expect(guard).toBeTruthy();
  await page.locator("#ii-title").fill(`Synthetic real CI CAS ${info.project.name}`);
  await page.locator("#ii-candidate").fill(`Synthetic real CI CAS ${info.project.name}`);
  await page.locator("#ii-pack").selectOption({ label: guard! });
  await page.getByRole("button", { name: /Planera intervjun|Plan the interview/ }).click();
  await page.waitForURL(/\/interview-intelligence\/[0-9a-f-]{36}\/prepare$/, { timeout: 60_000 });
  const caseId = page.url().match(/interview-intelligence\/([0-9a-f-]{36})/)![1];
  await frozenContent(page, caseId);
  await page.locator("#mp-time").fill("45 minuter syntetiskt CI");
  await page.locator("#mp-open").fill("Beskriv syfte och mänsklig bedömning.");
  await page.locator("#mp-close").fill("Sammanfatta sakligt och erbjud rättelse.");
  await page
    .getByRole("button", { name: /Spara och godkänn planen|Save and approve the plan/ })
    .click();
  await page.getByRole("button", { name: /^Starta intervju$|^Start interview$/ }).click();
  await page.waitForURL(/\/interview$/, { timeout: 60_000 });
  await expect(page.locator("#reflect")).toBeVisible({ timeout: 30_000 });
  await processFailureAndConflict(page, caseId);
  record({
    scenario: "two-tab-cas",
    project: info.project.name,
    caseId,
    status: "PASS",
    sourceSha: APP_SHA,
    transport: "real GoTrue",
    at: new Date().toISOString(),
  });
});

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
    const ref = `Real P0 ${scenario.role} ${scenario.start} ${Date.now()}`;
    const cohort = (
      { chromium: "0", "mobile-375": "1", "mobile-390": "2" } as Record<string, string>
    )[info.project.name];
    expect(cohort, "A separate synthetic application is seeded per viewport").toBeDefined();
    const ordinal = Number(cohort) * 4 + (scenario.app === "manager-sv" ? 1 : 4);
    const applicationId = scenario.app
      ? `e8050000-3333-4000-8000-${String(ordinal).padStart(12, "0")}`
      : null;
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
    const manifest = await frozenContent(page, caseId);
    await expect(page.locator("aside[role=status]")).toContainText("draft");
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
    if (
      process.env.RI_REAL_STRESS === "1" &&
      scenario.role === "guard" &&
      scenario.start === "standalone"
    )
      await processFailureAndConflict(page, caseId);
    if (scenario.lang === "en")
      await expect(page.locator("main")).toContainText(/guide's own language.*never translated/i);
    const prompts = new Set<string>();
    const markers: Record<string, string> = {};
    for (let i = 1; i <= 8; i++) {
      await expect(page.locator("main")).toContainText(
        new RegExp(`(Fråga|Question) ${i} (av|of) 8`),
      );
      prompts.add(await page.locator("main h2").first().innerText());
      const answer = `Syntetiskt svar Q${i}: eget ansvar, konkret handling och ${i <= 6 ? "beskrivet resultat" : "hypotetiskt resonemang; inte faktisk erfarenhet"}.`;
      markers[`Q${i}`] = `Syntetiskt svar Q${i}:`;
      await page.locator("#note").fill(answer);
      await page.getByRole("button", { name: /Markera som genomgången|Mark as covered/ }).click();
      await expect(page.locator("main")).toContainText(/Besvarad|Answered/, { timeout: 30_000 });
      // Covered is optimistic question state, not a note-save receipt.
      // Check the draft now; actual persisted Q-ID/marker checks follow Pause.
      await expect(page.locator("#note")).toHaveValue(answer);
      if (
        process.env.RI_REAL_STRESS === "1" &&
        i === 1 &&
        scenario.role === "guard" &&
        scenario.start === "standalone"
      ) {
        await questionChangeDrainsNewerText(page);
        markers.Q1 = questionDrainMarker;
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
    await expect(page.locator("#reflect")).toHaveValue(reflection, { timeout: 30_000 });
    await expect(page.locator("#protocol-deviations")).toHaveValue(deviation);
    await readOwnQuestionNotes(page, caseId, manifest.content.questions, markers, "paused");
    expect(await frozenContent(page, caseId)).toEqual(manifest);
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
    if (
      process.env.RI_REAL_STRESS === "1" &&
      scenario.role === "guard" &&
      scenario.start === "standalone"
    ) {
      mixedNote = await completionDrainsNewerText(page, caseId);
      markers.Q8 = completionDrainMarker;
    } else {
      await page.getByRole("button", { name: /Avsluta intervjun|End the interview/ }).click();
    }
    await expect(page.locator("main")).toContainText(
      /Intervjun är genomförd|The interview is completed/,
      { timeout: 30_000 },
    );
    await readOwnQuestionNotes(page, caseId, manifest.content.questions, markers, "completed");
    await page
      .getByRole("link", { name: /Gå till bedömning|Go to assessment/ })
      .first()
      .click();
    await page.waitForURL(/\/evidence$/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: /Välj underlag|Choose the material/ }),
    ).toBeVisible({ timeout: 30_000 });
    const questionButtons = page
      .getByRole("navigation", { name: /^Frågor$|^Questions$/ })
      .first()
      .locator("button");
    await expect(questionButtons).toHaveCount(8, { timeout: 30_000 });
    for (let i = 0; i < 8; i++) {
      await questionButtons.nth(i).click();
      await evidenceProbe(i + 1, "SELECTION", () =>
        expect(questionButtons.nth(i)).toHaveAttribute("aria-current", "true"),
      );
      await evidenceProbe(i + 1, "NOTE_VISIBLE", () =>
        expect(
          page.getByRole("article", { name: /^Dina intervjuanteckningar$|^Your interview notes$/ }),
        ).toContainText(markers[`Q${i + 1}`]),
      );
      const use = page
        .getByRole("button", { name: /Använd som bedömningsunderlag|Use as assessment material/ })
        .first();
      await evidenceProbe(i + 1, "USE_VISIBLE", () => expect(use).toBeVisible({ timeout: 30_000 }));
      await use.click();
      await evidenceProbe(i + 1, "CONFIRMED_EXCERPT", () =>
        expect(
          page.getByRole("article", { name: /^Bekräftat underlag$|^Confirmed material$/ }),
        ).toContainText(markers[`Q${i + 1}`], { timeout: 30_000 }),
      );
    }
    await readOwnQuestionNotes(page, caseId, manifest.content.questions, markers, "evidence");
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

    expect(await frozenContent(page, caseId)).toEqual(manifest);
    const ownerApi = await localSession(page);
    const reports = await page.request.get(
      `${ownerApi.issuer}/rest/v1/scp_interview_reports?case_id=eq.${caseId}&status=eq.final&select=payload,content_hash`,
      {
        headers: {
          apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
          Authorization: `Bearer ${ownerApi.token}`,
        },
      },
    );
    expect(reports.status()).toBe(200);
    const reportRows = await reports.json();
    expect(reportRows).toHaveLength(1);
    expect(reportRows[0].payload.content_manifest).toEqual(manifest);

    // A separate identity sees the immutable report via its existing reviewer
    // grant, while direct finalisation remains owner/admin only. Membership
    // does not become a new generic report permission.
    const memberContext = await browser.newContext({ baseURL: BASE });
    const member = await memberContext.newPage();
    await signIn(member, users.reviewer.email);
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
        headers: {
          apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
          Authorization: `Bearer ${api.token}`,
        },
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
    record({
      scenario: `${scenario.role}-${scenario.start}-${scenario.lang}`,
      project: info.project.name,
      caseId,
      applicationId,
      status: "PASS",
      manifestHash: manifest.manifest_hash,
      frozenProvenance: manifest.freeze_provenance,
      packContentStatus: manifest.pack_content_status,
      methodApprovalState: manifest.method_approval_state,
      reportContentHash: reportRows[0].content_hash,
      extraStressProbes: process.env.RI_REAL_STRESS === "1",
      at: new Date().toISOString(),
      uiPasswordLogin: "real GoTrue",
      physicalPhone: false,
    });
  });
}

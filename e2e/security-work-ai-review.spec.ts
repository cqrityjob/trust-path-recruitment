/**
 * Real browser/auth/RLS/RPC journey with explicitly SYNTHETIC completed AI jobs.
 * psql seeds only new, isolated test actors and signed synthetic receipts. No AI
 * provider is called: the app must run with SW_AI_ENABLED=false and no AI key.
 * This verifies human review/application, not model quality or live integration.
 * Run against an owned stack with its run.env and an already running local app:
 * bunx playwright test e2e/security-work-ai-review.spec.ts --workers=1
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import {
  analysisOutputSchema,
  REPORT_SECTIONS,
} from "../src/lib/security-work/processing/contracts";

test.skip(process.env.E2E_LOCAL_STACK !== "1", "Owned disposable Supabase stack required");
test.describe.configure({ mode: "serial", timeout: 150_000 });
test.use({ actionTimeout: 20_000 });

const evidence = "Synthetic service dependency is interrupted. Recovery duration is unknown.";
const proposal = "Synthetic AI proposal: verify an alternative dependency before deciding.";
const question = "Synthetic AI follow-up: who can verify the recovery duration?";
const conclusion = "Synthetic human conclusion, preserved through AI application.";
const riskTitle = "Synthetic AI risk: dependency interruption";
const actionTitle = "Synthetic AI action: inspect the alternative dependency";
const assumption = "Synthetic assumption: no verified fallback has been supplied.";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

function assertOwnedLocalStack() {
  expect(process.env.E2E_LOCAL_STACK).toBe("1");
  expect(process.env.SW_AI_ENABLED).toBe("false");
  expect(process.env.SW_ANTHROPIC_API_KEY).toBeFalsy();
  expect(existsSync(`${process.env.SW_BROWSER_STATE_DIR}/owned-stack`)).toBe(true);
  for (const value of [
    process.env.E2E_BASE_URL,
    process.env.SW_API_URL,
    process.env.SW_DATABASE_URL,
  ])
    expect(["127.0.0.1", "localhost"]).toContain(new URL(value!).hostname);
}

function fixture(locale: "sv" | "en") {
  assertOwnedLocalStack();
  const user = randomUUID();
  const item = randomUUID();
  const activation = randomUUID();
  const email = `sw-ai-review-${user}@example.test`;
  const analyses = { fresh: randomUUID(), stale: randomUUID(), unknown: randomUUID() };
  const jobs = { fresh: randomUUID(), stale: randomUUID(), unknown: randomUUID() };
  const citation = { segmentId: item, sourceItemId: item, quote: evidence };
  const narrative = (kind: "ai_proposal" | "assumption", statement: string) => ({
    kind,
    statement,
    citations: [],
    userInputIds: [],
    uncertainty: "Synthetic, unverified proposal.",
  });
  const fact = {
    kind: "source_fact" as const,
    statement: "Synthetic source fact: the dependency is interrupted.",
    citations: [citation],
    userInputIds: [],
    uncertainty: "Recovery duration is unknown.",
  };
  const output = analysisOutputSchema.parse({
    schemaVersion: "sw-analysis-output-1.0.0",
    facts: [fact],
    userInterpretations: [],
    assumptions: [narrative("assumption", assumption)],
    proposals: [narrative("ai_proposal", proposal)],
    uncertainty: "Synthetic AI uncertainty: recovery is unknown.",
    risks: [
      {
        title: riskTitle,
        description: fact,
        likelihood: null,
        consequence: null,
        calibrationId: null,
        rationale: narrative("ai_proposal", "Investigate before rating this synthetic risk."),
        currentControls: null,
        proposedActions: [narrative("ai_proposal", actionTitle)],
      },
    ],
    followups: [narrative("ai_proposal", question)],
    contradictions: [],
    report: {
      kind: "rsa",
      sections: REPORT_SECTIONS.rsa.map((key) => ({
        key,
        content: [fact, narrative("ai_proposal", proposal)],
        missingInformation: "Recovery duration remains unknown.",
      })),
    },
  });
  const success = JSON.stringify({
    status: "succeeded",
    provider: "synthetic-no-provider",
    model: "synthetic-fixture-only",
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    output,
  });
  const unknown = JSON.stringify({
    status: "outcome_unknown",
    errorCode: "synthetic_ambiguous_outcome",
  });
  const jobSql = Object.entries(analyses)
    .map(
      ([kind, analysis]) => `
    INSERT INTO sw_assessments(id,workspace_id,title,analysis_type,method_version_id,purpose,scope,horizon,professional_conclusion)
      VALUES(${literal(analysis)},:'workspace','Synthetic AI review ${kind}','rsa','rsa-v1','Verify human review','Synthetic service','Synthetic period',${literal(conclusion)});
    INSERT INTO sw_analysis_inputs(workspace_id,assessment_id,source_item_id,review_status)
      VALUES(:'workspace',${literal(analysis)},${literal(item)},'accepted');
    SELECT (sw_reserve_processing(:'workspace',${literal(jobs[kind as keyof typeof jobs])},'ai',${literal(analysis)},NULL,1,${literal(activation)})).id AS reserved_job \\gset
    SELECT sw_dispatch_processing(:'workspace',:'reserved_job')->'job'->>'fence' AS fence \\gset
    RESET ROLE;
    SELECT sw_private.receipt_mac('ai'||E'\\n'||:'reserved_job'||E'\\n'||:'fence'||E'\\n'||sw_private.hash_text(${literal(kind === "unknown" ? unknown : success)}),repeat('synthetic-ai-review-only-',3)) AS signature \\gset
    SET LOCAL ROLE authenticated;
    SELECT (sw_complete_processing(:'workspace',:'reserved_job',:'fence',${literal(`fixture-${user}`)},${literal(kind === "unknown" ? unknown : success)},:'signature')).status AS completed_status \\gset
  `,
    )
    .join("\n");
  const sql = `
    BEGIN;
    SET LOCAL search_path=public,extensions;
    INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
    VALUES('00000000-0000-0000-0000-000000000000',${literal(user)},'authenticated','authenticated',${literal(email)},crypt('LocalJourney!2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Synthetic AI Review"}',now(),now(),'','','','','','','','');
    INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    VALUES(${literal(user)},${literal(user)},jsonb_build_object('sub',${literal(user)},'email',${literal(email)},'email_verified',true),'email',now(),now(),now());
    INSERT INTO sw_private.worker_keys(key_id,secret) VALUES(${literal(`fixture-${user}`)},repeat('synthetic-ai-review-only-',3));
    SELECT set_config('request.jwt.claim.sub',${literal(user)},true) AS claim_sub \\gset
    SELECT set_config('request.jwt.claims',jsonb_build_object('sub',${literal(user)},'role','authenticated','is_anonymous',false)::text,true) AS claims \\gset
    SET LOCAL ROLE authenticated;
    SELECT sw_create_personal_workspace('Synthetic AI Review ${locale}') AS workspace \\gset
    UPDATE sw_workspaces SET language=${literal(locale)} WHERE id=:'workspace';
    INSERT INTO sw_sources(workspace_id,name) VALUES(:'workspace','Synthetic AI review source') RETURNING id AS source \\gset
    INSERT INTO sw_source_items(id,workspace_id,source_id,deduplication_key,original_title,factual_extract)
      VALUES(${literal(item)},:'workspace',:'source','synthetic-ai-review','Synthetic source',${literal(evidence)});
    RESET ROLE;
    INSERT INTO sw_ai_activations(id,workspace_id,environment,provider,model,task_version,prompt_version,policy_version,output_schema_version,data_processing_approval,approved_by,valid_until,max_cost_micros,daily_budget_micros,max_output_tokens,timeout_ms)
      VALUES(${literal(activation)},:'workspace','internal_qa','synthetic-no-provider','synthetic-fixture-only','sw-analysis-1.0.0','sw-analysis-prompt-1.0.0','sw-analysis-policy-1.0.0','sw-analysis-output-1.0.0','Synthetic fixture only; no provider or external processing',${literal(user)},now()+interval '1 hour',100,1000,8192,1000);
    SET LOCAL ROLE authenticated;
    ${jobSql}
    COMMIT;
    SELECT jsonb_build_object('workspace',:'workspace');
  `;
  const result = execFileSync(
    process.env.SW_PSQL_BIN ?? "psql",
    [process.env.SW_DATABASE_URL!, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      input: sql,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  return { ...JSON.parse(result.trim()), email, user, item, activation, analyses, jobs } as {
    workspace: string;
    email: string;
    user: string;
    item: string;
    activation: string;
    analyses: typeof analyses;
    jobs: typeof jobs;
  };
}

async function login(page: Page, email: string, path: string, locale: "sv" | "en") {
  await page.goto(`/login?redirect=${encodeURIComponent(path)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill("LocalJourney!2026");
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  await page.getByRole("button", { name: locale, exact: true }).first().click();
}
async function caller(page: Page) {
  const token = await page.evaluate(
    () =>
      Object.entries(localStorage)
        .filter(([key]) => /^sb-.*-auth-token$/.test(key))
        .map(([, value]) => JSON.parse(value).access_token)[0],
  );
  return createClient(process.env.SW_API_URL!, process.env.SW_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
function applyRequest(page: Page, job: string) {
  return page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).origin === new URL(process.env.E2E_BASE_URL!).origin &&
      Boolean(request.postData()?.includes(job)),
  );
}
async function replay(page: Page, request: Request, body = request.postData()!) {
  const headers = { ...request.headers() };
  delete headers["content-length"];
  delete headers.host;
  const response = await page.request.post(request.url(), { headers, data: body });
  expect(response.ok()).toBe(true);
  return response.text();
}

async function shot(page: Page, locale: string, stage: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const directory = process.env.SW_AI_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    path: `${directory}/${test.info().project.name}-${locale}-${stage}.png`,
    fullPage: true,
    scale: "css",
  });
}

for (const locale of ["sv", "en"] as const) {
  test(`[${locale}] synthetic AI proposal requires human application, rejects stale state and never replays unknown outcome`, async ({
    page,
  }) => {
    const f = fixture(locale);
    const l = (sv: string, en: string) => (locale === "sv" ? sv : en);
    const path = (analysis: string) => `/security-work/${f.workspace}/analyses/${analysis}`;
    const assessmentStep = () =>
      page.getByRole("button", { name: `4. ${l("Bedömning", "Assessment")}`, exact: true }).click();
    await login(page, f.email, path(f.analyses.fresh), locale);
    await assessmentStep();
    const db = await caller(page);
    const readEffects = async (analysis: string) => {
      const result = await Promise.all(
        [
          "sw_risks",
          "sw_actions",
          "sw_analysis_questions",
          "sw_reports",
          "sw_ai_draft_applications",
        ].map(async (table) => {
          const value = await db
            .from(table)
            .select("*", { count: "exact" })
            .eq("assessment_id", analysis);
          expect(value.error).toBeNull();
          return { table, rows: value.data, count: value.count };
        }),
      );
      return result;
    };
    const ai = page.getByTestId("sw-ai-proposal");
    await expect(ai).toBeVisible();
    await expect(ai.getByText(proposal, { exact: true }).first()).toBeVisible();
    await expect(ai.getByText(actionTitle, { exact: true })).toBeVisible();
    await expect(ai.getByText(question, { exact: true })).toBeVisible();
    await expect(
      ai.getByText(l("Okänt — inget verifierat underlag.", "Unknown — no verified evidence."), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      ai.getByText(l("AI-förslag", "AI proposal"), { exact: true }).first(),
    ).toBeVisible();
    await expect(
      ai.getByText(l("Källuppgift", "Source fact"), { exact: true }).first(),
    ).toBeVisible();
    await ai
      .getByText(l("Visa stödjande utdrag", "Show supporting extract"), { exact: true })
      .first()
      .click();
    await expect(ai.getByText(evidence, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(
        l("AI är inte aktiverat för arbetsytan.", "AI is not activated for this workspace."),
        { exact: false },
      ),
    ).toBeVisible();
    const apply = page.getByRole("button", {
      name: l("För in i analysutkast", "Apply to analysis draft"),
      exact: true,
    });
    await expect(apply).toBeDisabled();
    expect((await readEffects(f.analyses.fresh)).every((entry) => entry.count === 0)).toBe(true);
    await shot(page, locale, "ai-review");
    await ai.getByRole("checkbox").check();
    const sent = applyRequest(page, f.jobs.fresh);
    await apply.click();
    const request = await sent;
    await expect(
      page.getByText(
        l(
          "Analysen har ändrats sedan detta AI-utkast skapades.",
          "The analysis has changed since this AI draft was created.",
        ),
        { exact: false },
      ),
    ).toBeVisible();
    const effects = await readEffects(f.analyses.fresh);
    expect(effects.map(({ count }) => count)).toEqual([1, 1, 1, 1, 1]);
    const receipt = effects[4].rows![0];
    expect(receipt).toMatchObject({
      job_id: f.jobs.fresh,
      applied_by: f.user,
      assessment_version_before: 1,
    });
    const risk = effects[0].rows![0];
    expect(risk).toMatchObject({
      title: riskTitle,
      likelihood: null,
      consequence: null,
      status: "proposed",
    });
    expect(risk.description).toContain(l("[Källuppgift]", "[Source fact]"));
    expect(effects[1].rows![0]).toMatchObject({ title: actionTitle, status: "open" });
    expect(effects[2].rows![0]).toMatchObject({
      question,
      answer: "",
      evidence_kind: "user_input",
    });
    const report = effects[3].rows![0];
    expect(report).toMatchObject({
      status: "draft",
      approved_by: null,
      template_version_id: "rsa-report-v1",
    });
    expect(report.sections.introduction).toContain(l("[AI-förslag]", "[AI proposal]"));
    expect(report.sections.introduction).toContain(l("[Källuppgift]", "[Source fact]"));
    const assessment = await db
      .from("sw_assessments")
      .select("*")
      .eq("id", f.analyses.fresh)
      .single();
    expect(assessment.error).toBeNull();
    expect(assessment.data).toMatchObject({
      status: "draft",
      approved_by: null,
      professional_conclusion: conclusion,
      version: 2,
    });
    expect(assessment.data!.assumptions).toContain(assumption);
    const citations = await db.from("sw_citations").select("*").eq("workspace_id", f.workspace);
    expect(citations.error).toBeNull();
    expect(citations.data!.length).toBeGreaterThanOrEqual(3);
    expect(
      citations.data!.every(
        (row) =>
          row.source_item_id === f.item &&
          row.excerpt === evidence &&
          row.locator === "Manual source",
      ),
    ).toBe(true);

    // Actual authenticated server-function retries, including a new request ID.
    expect(await replay(page, request)).toContain(receipt.id);
    const newBody = request.postData()!.replace(receipt.id, randomUUID());
    expect(newBody).not.toBe(request.postData());
    expect(await replay(page, request, newBody)).toContain(receipt.id);
    expect(await readEffects(f.analyses.fresh)).toEqual(effects);
    await page.reload();
    await assessmentStep();
    await expect(ai).toBeVisible();
    await expect(apply).toHaveCount(0);
    await expect(
      page.getByLabel(l("Professionell slutsats", "Professional conclusion")),
    ).toHaveValue(conclusion);
    await shot(page, locale, "ai-applied");
    await page
      .getByRole("button", { name: `3. ${l("Komplettera", "Follow-ups")}`, exact: true })
      .click();
    await expect(
      page.getByLabel(l("Kompletteringsfråga", "Follow-up question"), { exact: true }),
    ).toHaveValue(question);
    await page.goto(`/security-work/${f.workspace}/reports/${report.id}`);
    await expect(page.getByLabel(l("Inledning", "Introduction"), { exact: true })).toHaveValue(
      report.sections.introduction,
    );

    // Real concurrent caller write after rendering version 1, before applying.
    await page.goto(path(f.analyses.stale));
    await assessmentStep();
    await expect(ai).toBeVisible();
    await ai.getByRole("checkbox").check();
    const changed = await db
      .from("sw_assessments")
      .update({ uncertainty: "Concurrent synthetic human edit" })
      .eq("id", f.analyses.stale)
      .eq("version", 1)
      .select("version")
      .single();
    expect(changed.error).toBeNull();
    expect(changed.data?.version).toBe(2);
    const staleSent = applyRequest(page, f.jobs.stale);
    const staleResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        Boolean(response.request().postData()?.includes(f.jobs.stale)),
      { timeout: 10_000 },
    );
    const conflictStarted = Date.now();
    await apply.click();
    await staleSent;
    expect(await (await staleResponse).text()).toContain("CONFLICT");
    expect(Date.now() - conflictStarted).toBeLessThan(10_000);
    await expect(page.getByRole("alert")).toBeVisible();
    expect((await readEffects(f.analyses.stale)).every((entry) => entry.count === 0)).toBe(true);
    await page.reload();
    await assessmentStep();
    await expect(ai).toBeVisible();
    await expect(apply).toHaveCount(0);
    await expect(
      page.getByLabel(
        l("Osäkerhet, luckor och motsägelser", "Uncertainty, gaps and contradictions"),
      ),
    ).toHaveValue("Concurrent synthetic human edit");
    await shot(page, locale, "ai-stale");

    await page.goto(path(f.analyses.unknown));
    await assessmentStep();
    await expect(
      page.getByText(
        l(
          "Körningen har skickats, men resultatet är inte bekräftat.",
          "The request was dispatched, but its outcome is not confirmed.",
        ),
        { exact: false },
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Skapa AI-utkast|Create AI draft/ })).toHaveCount(
      0,
    );
    await expect(ai).toHaveCount(0);
    const original = await db
      .from("sw_processing_jobs")
      .select("*")
      .eq("id", f.jobs.unknown)
      .single();
    expect(original.error).toBeNull();
    expect(original.data).toMatchObject({
      status: "outcome_unknown",
      reserved_cost_micros: 100,
      actual_cost_micros: null,
    });
    const dedup = await db.rpc("sw_reserve_processing", {
      _workspace_id: f.workspace,
      _request_id: randomUUID(),
      _kind: "ai",
      _assessment_id: f.analyses.unknown,
      _expected_version: 1,
      _activation_id: f.activation,
    });
    expect(dedup.error).toBeNull();
    expect(dedup.data.id).toBe(f.jobs.unknown);
    const noDispatch = await db.rpc("sw_dispatch_processing", {
      _workspace_id: f.workspace,
      _job_id: dedup.data.id,
    });
    expect(noDispatch.error).toBeNull();
    expect(noDispatch.data).toMatchObject({ dispatch: false, job: original.data });
    await page.reload();
    await assessmentStep();
    await expect(
      page.getByText(
        l(
          "Körningen har skickats, men resultatet är inte bekräftat.",
          "The request was dispatched, but its outcome is not confirmed.",
        ),
        { exact: false },
      ),
    ).toBeVisible();
    expect((await readEffects(f.analyses.unknown)).every((entry) => entry.count === 0)).toBe(true);
    const count = await db
      .from("sw_processing_jobs")
      .select("id", { count: "exact" })
      .eq("workspace_id", f.workspace);
    expect(count.error).toBeNull();
    expect(count.count).toBe(3);
    await shot(page, locale, "ai-unknown");
  });
}

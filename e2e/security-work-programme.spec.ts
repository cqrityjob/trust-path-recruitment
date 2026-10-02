/**
 * Security Work programme: routed journeys without a backend.
 *
 * The real application shell, router, pages, Swedish/English copy and the
 * deterministic programme rules run in the browser; every server function is
 * answered from an in-memory workspace fixture here, so the proof covers the
 * routes, layouts (desktop and 375/390 mobile), language parity, the AI
 * panel's no-AI path and the end-to-end flow a new organisation walks
 * (mandate → assets → baseline → gaps → risks & actions → report). RLS, the
 * assistant's provider path and persistence are proven elsewhere
 * (supabase/tests/security_work_programme_test.sql, the browser stack suite).
 *
 * Nothing hosted is reached: Supabase hosts are blocked at the network layer.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fromJSON, toCrossJSON } from "seroval";
import { buildManagementReportData } from "../src/lib/security-work/programme/management-report";
import type { ProgrammeFacts } from "../src/lib/security-work/programme/types";

test.describe.configure({ mode: "serial", timeout: 240_000 });
// The dev server compiles the application on first visit; later steps are fast.
const slow = expect.configure({ timeout: 90_000 });
const out = process.env.SW_PROGRAMME_EVIDENCE_DIR ?? "/tmp/security-work-programme-evidence";
const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const now = () => new Date().toISOString();
const stamp = () => ({ created_at: now(), created_by: USER, updated_at: now(), version: 1 });

function supabaseRef() {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = /VITE_SUPABASE_URL="?https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env);
  if (!match) throw new Error("VITE_SUPABASE_URL is needed to name the auth storage key");
  return match[1];
}

/** The in-memory workspace a test walks through. Mutated by the save handlers. */
function freshState() {
  const state = {
    workspace: {
      id: WORKSPACE,
      owner_user_id: USER,
      kind: "personal",
      name: "Nordic Logistics AB",
      language: "sv",
      ...stamp(),
    },
    membership: {
      workspace_id: WORKSPACE,
      user_id: USER,
      role: "owner",
      active: true,
      can_approve: true,
      created_at: now(),
      updated_at: now(),
    },
    programme: {
      today: new Date().toISOString().slice(0, 10),
      mandate: null,
      assets: [],
      riskAssets: [],
      risks: [],
      actions: [],
      gaps: [],
      baseline: { assessment: null, answers: [] },
      monitoring: { profileExists: false, requirements: 0, pendingItems: 0 },
      analyses: [],
      analysisReports: [],
      managementReports: [],
      plan: null,
      evidenceLinks: [],
      suggestions: [],
      members: [{ user_id: USER, role: "owner" }],
    } as ProgrammeFacts & {
      evidenceLinks: unknown[];
      suggestions: unknown[];
      members: { user_id: string; role: string }[];
    },
  };
  return state;
}
type State = ReturnType<typeof freshState>;
type Row = Record<string, unknown>;
const ok = (data: unknown) => ({ ok: true, data });

function upsert<T extends { id: string; version: number }>(list: T[], row: T) {
  const index = list.findIndex((candidate) => candidate.id === row.id);
  if (index === -1) list.push(row);
  else list[index] = { ...row, version: list[index].version + 1 };
  return index === -1 ? row : list[index];
}

/** Answers each server function from the fixture, as the real handler would. */
function handle(state: State, name: string, data: Row): unknown {
  const p = state.programme;
  switch (name) {
    case "getSecurityWorkEntry":
      return ok({ workspaces: [state.workspace] });
    case "getSecurityWorkspace":
      return ok({
        workspace: state.workspace,
        membership: state.membership,
        profile: null,
        requirements: [],
        sources: [],
        counts: { pending: 0, totalItems: 0 },
      });
    case "getWorkPortfolio":
      return ok({ analyses: [], risks: p.risks, actions: p.actions, reports: [], documents: [] });
    case "getWorkAiStatus":
      return ok({ enabled: false, reason: "AI_NOT_ENABLED" });
    case "getWorkProcessingStatus":
      return ok({ enabled: false, reason: "PROCESSING_NOT_CONFIGURED" });
    case "listMyEmployerWorkspaces":
      return [];
    case "countMyReviewQueue":
      return 0;
    case "getSecurityProgramme":
      return ok(p);
    case "saveSecurityMandate": {
      const { workspaceId: _w, version, ...fields } = data as Row & { version: number | null };
      const row = {
        id: p.mandate?.id ?? randomUUID(),
        workspace_id: WORKSPACE,
        mandate_document: p.mandate?.mandate_document ?? "",
        document_provenance: {},
        ...stamp(),
        ...fields,
        version: (version ?? 0) + 1,
      };
      p.mandate = row as never;
      return ok(row);
    }
    case "saveSecurityMandateDocument": {
      p.mandate = {
        ...p.mandate!,
        mandate_document: String(data.mandate_document),
        document_provenance: { origin: "user" },
        version: p.mandate!.version + 1,
      };
      return ok(p.mandate);
    }
    case "saveSecurityAsset": {
      const { workspaceId: _w, version, ...fields } = data as Row & { version: number | null };
      return ok(
        upsert(
          p.assets as never[],
          { workspace_id: WORKSPACE, ...stamp(), ...fields, version: version ?? 1 } as never,
        ),
      );
    }
    case "saveSecurityProgrammeRisk": {
      const {
        workspaceId: _w,
        version,
        assetIds,
        ...fields
      } = data as Row & { version: number | null; assetIds: string[]; id: string };
      const row = upsert(
        p.risks as never[],
        {
          workspace_id: WORKSPACE,
          assessment_id: null,
          affected_assets: "",
          status: "proposed",
          accepted_by: null,
          accepted_at: null,
          source_kind: "programme",
          ...stamp(),
          ...fields,
          version: version ?? 1,
        } as never,
      ) as Row;
      p.riskAssets = p.riskAssets.filter((link) => link.risk_id !== row.id);
      for (const assetId of assetIds)
        p.riskAssets.push({
          id: randomUUID(),
          workspace_id: WORKSPACE,
          risk_id: row.id as string,
          asset_id: assetId,
          created_at: now(),
          created_by: USER,
        });
      return ok(row);
    }
    case "decideSecurityRisk": {
      const risk = p.risks.find((row) => row.id === data.id)!;
      Object.assign(risk, {
        status: data.status,
        decision_rationale: data.decision_rationale,
        accepted_by: USER,
        accepted_at: now(),
        version: risk.version + 1,
      });
      return ok(risk);
    }
    case "startSecurityBaseline": {
      if (!p.baseline.assessment)
        p.baseline.assessment = {
          id: randomUUID(),
          workspace_id: WORKSPACE,
          content_version: "baseline-v1",
          market: String(data.market),
          mode: String(data.mode),
          assessment_date: p.today,
          status: "open",
          completed_at: null,
          ...stamp(),
        };
      else
        p.baseline.assessment = {
          ...p.baseline.assessment,
          mode: String(data.mode),
          version: p.baseline.assessment.version + 1,
        };
      return ok(p.baseline.assessment);
    }
    case "answerSecurityBaseline": {
      const existing = p.baseline.answers.find((row) => row.question_id === data.questionId);
      if (existing)
        Object.assign(existing, {
          answer: data.answer,
          note: data.note,
          version: existing.version + 1,
        });
      else
        p.baseline.answers.push({
          id: randomUUID(),
          workspace_id: WORKSPACE,
          baseline_id: String(data.baselineId),
          question_id: String(data.questionId),
          answer: String(data.answer),
          note: String(data.note),
          ...stamp(),
        });
      return ok(existing ?? p.baseline.answers.at(-1));
    }
    case "completeSecurityBaseline": {
      p.baseline.assessment = {
        ...p.baseline.assessment!,
        status: "completed",
        completed_at: now(),
        version: p.baseline.assessment!.version + 1,
      };
      return ok(p.baseline.assessment);
    }
    case "saveSecurityGap": {
      const {
        workspaceId: _w,
        version,
        baselineId,
        baselineQuestionId,
        ...fields
      } = data as Row & { version: number | null };
      return ok(
        upsert(
          p.gaps as never[],
          {
            workspace_id: WORKSPACE,
            baseline_id: baselineId,
            baseline_question_id: baselineQuestionId,
            ...stamp(),
            ...fields,
            version: version ?? 1,
          } as never,
        ),
      );
    }
    case "saveSecurityProgrammeAction": {
      const {
        workspaceId: _w,
        version,
        assessmentId,
        riskId,
        gapId,
        assetId,
        assigneeUserId,
        dueDate,
        rationale,
        completionEvidence,
        ...fields
      } = data as Row & { version: number | null };
      return ok(
        upsert(
          p.actions as never[],
          {
            workspace_id: WORKSPACE,
            assessment_id: assessmentId,
            risk_id: riskId,
            gap_id: gapId,
            asset_id: assetId,
            assignee_user_id: assigneeUserId,
            due_date: dueDate,
            decision_rationale: rationale,
            completion_evidence: completionEvidence,
            closed_by: null,
            closed_at: null,
            ...stamp(),
            ...fields,
            version: version ?? 1,
          } as never,
        ),
      );
    }
    case "linkSecurityEvidence":
      return ok([]);
    case "saveSecurityPlan": {
      p.plan = {
        id: p.plan?.id ?? randomUUID(),
        workspace_id: WORKSPACE,
        checklist_version: "plan-90-v1",
        started_on: p.plan?.started_on ?? p.today,
        status: String(data.status),
        completed_task_ids: data.completedTaskIds as string[],
        ...stamp(),
        version: (p.plan?.version ?? 0) + 1,
      };
      return ok(p.plan);
    }
    case "createSecurityManagementReport": {
      const built = buildManagementReportData(p, null);
      const row = {
        id: String(data.id),
        workspace_id: WORKSPACE,
        title: String(data.title),
        language: String(data.language),
        content_version: "management-report-v1",
        period_start: null,
        period_end: null,
        facts: built.facts,
        computed: built.computed,
        narrative: {},
        decisions_required: [],
        status: "draft",
        approved_by: null,
        approved_at: null,
        ...stamp(),
      };
      p.managementReports.unshift(row as never);
      return ok(row);
    }
    case "saveSecurityManagementReport": {
      const report = p.managementReports.find((row) => row.id === data.id)!;
      Object.assign(report, {
        title: data.title,
        narrative: data.narrative,
        decisions_required: data.decisions_required,
        version: report.version + 1,
      });
      return ok(report);
    }
    case "decideSecurityManagementReport": {
      const report = p.managementReports.find((row) => row.id === data.id)!;
      Object.assign(report, {
        status: data.status,
        approved_by: USER,
        approved_at: now(),
        version: report.version + 1,
      });
      return ok(report);
    }
    case "requestSecuritySuggestion":
      return { ok: false, code: "AI_NOT_ENABLED" };
    default:
      return { ok: false, code: "SAVE_FAILED" };
  }
}

async function install(page: Page, state: State) {
  const ref = supabaseRef();
  const session = {
    access_token: "local-harness",
    token_type: "bearer",
    expires_in: 31_536_000,
    expires_at: Math.floor(Date.now() / 1000) + 31_536_000,
    refresh_token: "local-harness",
    user: {
      id: USER,
      aud: "authenticated",
      role: "authenticated",
      email: "head-of-security@example.test",
      user_metadata: { display_name: "Head of Security" },
      app_metadata: {},
      created_at: now(),
    },
  };
  await page.context().addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
      if (!window.localStorage.getItem("cqrityjob.lang"))
        window.localStorage.setItem("cqrityjob.lang", "sv");
    },
    { key: `sb-${ref}-auth-token`, value: JSON.stringify(session) },
  );
  await page
    .context()
    .route(/https:\/\/[^/]+\.(?:supabase\.co|lovable(?:project)?\.(?:app|dev))\//, (route) =>
      route.abort("blockedbyclient"),
    );
  await page.context().route(/\/_serverFn\//, async (route: Route) => {
    const id = decodeURIComponent(
      new URL(route.request().url()).pathname.split("/_serverFn/")[1] ?? "",
    );
    let name = id;
    try {
      name = String(
        (JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as { export: string }).export,
      ).replace(/_createServerFn_handler$/, "");
    } catch {
      /* production ids are opaque; this harness targets the dev server */
    }
    let data: Row = {};
    const body = route.request().postData();
    if (body) {
      try {
        data = ((fromJSON(JSON.parse(body)) as { data?: Row }).data ?? {}) as Row;
      } catch {
        data = {};
      }
    }
    // The client unwraps a seroval-encoded { result } envelope, as the real
    // server-function handler produces.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-type": "application/json", "x-tss-serialized": "true" },
      body: JSON.stringify(toCrossJSON({ result: handle(state, name, data) }, { refs: new Map() })),
    });
  });
}
async function fit(page: Page) {
  const size = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(size.actual, "No horizontal scrolling on this viewport").toBeLessThanOrEqual(
    size.viewport + 1,
  );
}
async function shot(page: Page, name: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await fit(page);
  await page.screenshot({
    path: `${out}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}
const go = (page: Page, segment = "") => page.goto(`/security-work/${WORKSPACE}${segment}`);

test("a new organisation walks the programme end to end, in Swedish, without AI", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const state = freshState();
  await install(page, state);
  const mobile = test.info().project.name !== "chromium";

  await test.step("Overview: command center on an empty workspace", async () => {
    await go(page);
    await slow(page.getByTestId("sw-programme-status")).toBeVisible();
    for (const area of ["mandate", "assets", "risks", "baseline", "actions", "reporting"])
      await expect(page.getByTestId(`sw-area-${area}`)).toHaveAttribute(
        "data-status",
        "not_started",
      );
    await expect(page.getByTestId("sw-next-action")).toHaveAttribute("data-next", "create_mandate");
    await expect(page.getByTestId("sw-next-action")).toContainText("Skapa ert säkerhetsuppdrag");
    await expect(page.getByTestId("sw-plan-cta")).toContainText("Ny i rollen?");
    await expect(page.getByTestId("sw-services")).toContainText("Arbeta direkt");
    await shot(page, "01-overview-empty");
  });

  await test.step("Navigation is grouped and every existing URL still resolves", async () => {
    if (mobile) {
      await page.getByRole("button", { name: /öppna arbetsytans meny/i }).click();
      await expect(page.locator("#security-work-navigation")).toBeVisible();
      await shot(page, "01b-mobile-menu");
      await page.getByRole("button", { name: /stäng menyn/i }).click();
    } else {
      const nav = page.getByRole("navigation", { name: /navigering/i });
      for (const label of ["Programme", "Löpande arbete", "Rapportering"])
        await expect(nav).toContainText(label);
    }
    for (const [segment, text] of [
      ["/monitoring", "Bevakning"],
      ["/analyses", "Analyser"],
      ["/risks", "Risker & åtgärder"],
      ["/reports", "Rapporter"],
      ["/sources", "Underlag"],
      ["/settings", "Bevakningsprofil"],
    ] as const) {
      await go(page, segment);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(text);
      await fit(page);
    }
  });

  await test.step("Mandate: essentials only, then the summary", async () => {
    await go(page, "/mandate");
    await page
      .getByLabel("Verksamheten")
      .fill("Logistikföretag med 400 anställda, tre terminaler i Sverige.");
    await page.getByLabel("Säkerhetsuppdraget").fill("Skydda personal, gods och leveransförmåga.");
    await page.getByLabel("Rapporteringsväg").fill("VD");
    await page.getByLabel("Riskacceptans").fill("VD efter föredragning av säkerhetschef");
    await page.getByRole("button", { name: "Spara", exact: true }).click();
    await expect(page.getByTestId("sw-mandate-summary")).toContainText("Ert säkerhetsuppdrag");
    await shot(page, "02-mandate");
    await go(page);
    await expect(page.getByTestId("sw-area-mandate")).toHaveAttribute("data-status", "complete");
    await expect(page.getByTestId("sw-next-action")).toHaveAttribute("data-next", "add_assets");
  });

  await test.step("Protected assets: owner and consequence are the user's call", async () => {
    await go(page, "/assets");
    await page.getByTestId("sw-add-asset").first().click();
    await page.getByLabel("Namn", { exact: true }).fill("Terminal Göteborg");
    await page.getByLabel("Kategori").selectOption("facilities");
    await page.getByLabel(/Ägare utanför arbetsytan/).fill("Terminalchef");
    await page.getByLabel(/Konsekvens om det inte fungerar/).selectOption("4");
    await page.getByRole("button", { name: "Spara skyddsvärde" }).click();
    await expect(page.getByTestId("sw-asset-row")).toContainText("Terminal Göteborg");
    await shot(page, "03-assets");
  });

  await test.step("Quick baseline: answers only; maturity and potential gaps are computed", async () => {
    await go(page, "/baseline");
    await page.getByTestId("sw-baseline-start").click();
    await expect(page.getByTestId("sw-baseline-summary")).toBeVisible();
    const governance = page.getByTestId("sw-domain-governance");
    const questions = governance.getByTestId("sw-question");
    await expect(questions.first()).toBeVisible();
    const count = await questions.count();
    for (let index = 0; index < count; index += 1) {
      const question = questions.nth(index);
      const answer = index === 1 ? "Nej" : "Ja";
      await question.getByRole("button", { name: answer, exact: true }).click();
      await expect(question).toHaveAttribute("data-answer", index === 1 ? "no" : "yes");
    }
    await expect(page.getByTestId("sw-baseline-summary")).toContainText("möjliga gap");
    await shot(page, "04-baseline");
  });

  await test.step("Gaps: a No answer is a potential gap until the user records it", async () => {
    await go(page, "/gaps");
    await expect(page.getByTestId("sw-potential-gap").first()).toBeVisible();
    await page
      .getByTestId("sw-potential-gap")
      .first()
      .getByRole("button", { name: "Registrera gap" })
      .click();
    await page.getByRole("button", { name: "Spara gap" }).click();
    await expect(page.getByTestId("sw-gap-row")).toHaveCount(1);
    await expect(page.getByTestId("sw-gap-row")).toContainText("Ingen åtgärd");
    await shot(page, "05-gaps");
  });

  await test.step("Risks & actions: asset → threat → risk → owner, then an action from the gap", async () => {
    await go(page, "/risks");
    await page.getByTestId("sw-add-risk").click();
    await page.getByText("Terminal Göteborg", { exact: true }).click();
    await page.getByLabel(/Risk \(vad kan hända\?\)/).fill("Intrång på terminalen nattetid");
    await page.getByLabel("Riskägare").selectOption(USER);
    await page.getByLabel(/Sannolikhet/).selectOption("3");
    await page.getByLabel(/Konsekvens \(1–5\)/).selectOption("4");
    await page.getByRole("button", { name: "Spara risk" }).click();
    await expect(page.getByTestId("sw-risk-row")).toContainText("Intrång på terminalen nattetid");
    await page.getByTestId("sw-add-action").click();
    await page.getByLabel("Åtgärd", { exact: true }).fill("Inför rondering nattetid");
    await page.getByLabel("Ansvarig").selectOption(USER);
    await page.getByLabel("Förfallodatum").fill("2020-01-01");
    await page.getByLabel("Prioritet").selectOption("high");
    await page.getByRole("button", { name: "Spara åtgärd" }).click();
    await expect(page.getByTestId("sw-action-row")).toContainText("Försenad");
    await shot(page, "06-risks-actions");
  });

  await test.step("Overview: attention cards and the next action follow the facts", async () => {
    await go(page);
    await expect(page.getByTestId("sw-attention-overdue_actions")).toContainText(
      "1 åtgärder är försenade",
    );
    await expect(page.getByTestId("sw-attention-high_impact_gaps")).toBeVisible();
    await expect(page.getByTestId("sw-next-action")).toHaveAttribute("data-next", "clear_overdue");
    await expect(page.getByTestId("sw-area-actions")).toHaveAttribute(
      "data-status",
      "needs_attention",
    );
    await shot(page, "07-overview-live");
  });

  await test.step("Management report: facts, system-calculated values and narrative stay apart; approval is human", async () => {
    await go(page, "/reports");
    await page.getByTestId("sw-new-management-report").click();
    await page.getByLabel("Titel").fill("Säkerhetsläget Q4");
    await page.getByRole("button", { name: "Skapa utkast" }).click();
    await expect(page.getByTestId("sw-management-report")).toBeVisible();
    await expect(page.getByTestId("sw-report-computed")).toContainText("försenade: 1");
    await expect(page.getByTestId("sw-report-facts")).toContainText(
      "Intrång på terminalen nattetid",
    );
    await page
      .getByLabel(/Säkerhetsläget i korthet/)
      .fill("Läget är stabilt. En försenad åtgärd kräver beslut om bevakning.");
    await page.getByRole("button", { name: "Spara utkast" }).click();
    await page.getByTestId("sw-report-approve").click();
    await expect(page.locator("main")).toContainText("Godkänd");
    await shot(page, "08-management-report");
  });

  await test.step("Security AI: one assistant, unavailable here, with deterministic help instead", async () => {
    await go(page, "/mandate");
    await page.getByTestId("sw-ai-open").filter({ visible: true }).first().click();
    await expect(page.getByTestId("sw-ai-panel")).toContainText("CQrityjob Security AI");
    await expect(page.getByTestId("sw-ai-unavailable")).toBeVisible();
    await page.getByTestId("sw-ai-mandate_draft").click();
    await expect(page.getByTestId("sw-ai-fallback")).toContainText("Skriv uppdraget själv");
    await shot(page, "09-security-ai-fallback");
  });

  await test.step("90-day plan is optional and dismissable", async () => {
    await go(page, "/plan");
    await page.getByTestId("sw-plan-start").click();
    await expect(page.getByTestId("sw-plan-summary")).toContainText("Dag 1");
    await page.getByTestId("sw-plan-d30").getByRole("checkbox").first().click();
    await expect(page.getByTestId("sw-plan-summary")).toContainText("1/");
    await shot(page, "10-plan");
    await page.getByTestId("sw-plan-dismiss").click();
    await expect(page.getByTestId("sw-plan-start")).toBeVisible();
  });

  await test.step("English: the same screens read in English", async () => {
    await page.evaluate(() => window.localStorage.setItem("cqrityjob.lang", "en"));
    await go(page);
    await expect(page.locator("html")).toHaveAttribute("lang", /^en/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Security Work");
    await expect(page.getByTestId("sw-next-action")).toContainText("Deal with overdue actions");
    await expect(page.getByTestId("sw-attention-overdue_actions")).toContainText(
      "1 actions are overdue",
    );
    await shot(page, "11-overview-en");
    await go(page, "/baseline");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Security Baseline");
    await go(page, "/gaps");
    await expect(page.getByTestId("sw-gap-row")).toContainText("No action");
  });
});

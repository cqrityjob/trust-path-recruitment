/**
 * Security AI assistant: what a person sees and sends when an answer is lost.
 *
 * The real shell, assistant panel and copy run in the browser; server
 * functions are answered from an in-memory fixture that behaves like the
 * service (a recorded operation id replays its recorded outcome; the provider
 * is never reached). The fixture records every request id it is sent, so the
 * test proves that "check again" reuses the operation and only the explicit
 * "new request" button starts a second, separately billed one. The database
 * and PostgREST behaviour is proven in
 * scripts/security-work-assistant-postgrest-check.ts.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { fromJSON, toCrossJSON } from "seroval";

test.describe.configure({ mode: "serial", timeout: 240_000 });
const slow = expect.configure({ timeout: 90_000 });
const out = process.env.SW_ASSISTANT_EVIDENCE_DIR ?? "/tmp/security-work-assistant-evidence";
const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const MANDATE = "77777777-7777-4777-8777-777777777777";
const now = () => new Date().toISOString();
type Row = Record<string, unknown>;
const ok = (data: unknown) => ({ ok: true, data });

function supabaseRef() {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = /VITE_SUPABASE_URL="?https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env);
  if (!match) throw new Error("VITE_SUPABASE_URL is needed to name the auth storage key");
  return match[1];
}

function freshState() {
  return {
    sent: [] as string[],
    // operation id -> recorded outcome, as the processing ledger holds it
    operations: new Map<string, "outcome_unknown" | "succeeded">(),
    // what the next NEW operation will end as
    nextOutcome: "outcome_unknown" as "outcome_unknown" | "succeeded",
    suggestions: [] as Row[],
  };
}
type State = ReturnType<typeof freshState>;

const mandate = {
  id: MANDATE,
  workspace_id: WORKSPACE,
  organisation_description: "Logistikföretag med tre terminaler.",
  security_mission: "Skydda personal, gods och leveransförmåga.",
  reporting_line: "VD",
  key_stakeholders: "",
  decision_authority: "",
  risk_acceptance_authority: "VD",
  geographic_scope: "Sverige",
  key_requirements: "",
  review_date: null,
  mandate_document: "",
  document_provenance: {},
  status: "draft",
  created_by: USER,
  created_at: now(),
  updated_at: now(),
  version: 1,
};

function handle(state: State, name: string, data: Row): unknown {
  switch (name) {
    case "getSecurityWorkEntry":
      return ok({ workspaces: [] });
    case "getSecurityWorkspace":
      return ok({
        workspace: {
          id: WORKSPACE,
          owner_user_id: USER,
          kind: "organisation",
          name: "Nordic Logistics AB",
          language: "sv",
          created_at: now(),
          created_by: USER,
          updated_at: now(),
          version: 1,
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
        profile: null,
        requirements: [],
        sources: [],
        counts: { pending: 0, totalItems: 0 },
      });
    case "getWorkAiStatus":
      return ok({ enabled: true, reason: null });
    case "getWorkProcessingStatus":
      return ok({ enabled: false, reason: "PROCESSING_NOT_CONFIGURED" });
    case "getWorkPortfolio":
      return ok({ analyses: [], risks: [], actions: [], reports: [], documents: [] });
    case "listMyEmployerWorkspaces":
      return [];
    case "countMyReviewQueue":
      return 0;
    case "listSecurityMissions":
      return ok([]);
    case "getSecurityProgramme":
      return ok({
        today: now().slice(0, 10),
        mandate,
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
        suggestions: state.suggestions,
        members: [{ user_id: USER, role: "owner" }],
      });
    case "requestSecuritySuggestion": {
      const id = String(data.requestId);
      state.sent.push(id);
      // A recorded operation replays its outcome; a new one runs once.
      const outcome = state.operations.get(id) ?? state.nextOutcome;
      state.operations.set(id, outcome);
      if (outcome === "outcome_unknown") return { ok: false, code: "AI_OUTCOME_UNKNOWN" };
      const suggestion = {
        id,
        job_id: id,
        workspace_id: WORKSPACE,
        kind: "mandate_draft",
        context_kind: "mandate",
        context_id: MANDATE,
        request_text: "",
        content: { text: "Syntetiskt utkast till säkerhetsuppdrag.", caveats: [] },
        source_records: [],
        provider: "anthropic",
        model: "claude-synthetic",
        prompt_version: "sw-assistant-prompt-1.0.0",
        decision_required: true,
        status: "proposed",
        decided_by: null,
        decided_at: null,
        decision_note: "",
        applied_target: {},
        created_by: USER,
        created_at: now(),
        updated_at: now(),
        version: 1,
      };
      if (!state.suggestions.some((row) => row.id === id)) state.suggestions.push(suggestion);
      return ok(suggestion);
    }
    default:
      return { ok: false, code: "SAVE_FAILED" };
  }
}

async function install(page: Page, state: State, lang: "sv" | "en") {
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
      user_metadata: {},
      app_metadata: {},
      created_at: now(),
    },
  };
  await page.context().addInitScript(
    ({ key, value, lang }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem("cqrityjob.lang", lang);
    },
    { key: `sb-${ref}-auth-token`, value: JSON.stringify(session), lang },
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-type": "application/json", "x-tss-serialized": "true" },
      body: JSON.stringify(toCrossJSON({ result: handle(state, name, data) }, { refs: new Map() })),
    });
  });
}

async function shot(page: Page, name: string) {
  const size = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(size.actual, "No horizontal scrolling on this viewport").toBeLessThanOrEqual(
    size.viewport + 1,
  );
  await page.screenshot({
    path: `${out}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}

for (const lang of ["sv", "en"] as const) {
  test(`an unknown outcome keeps its operation; a new paid attempt is explicit (${lang})`, async ({
    page,
  }) => {
    mkdirSync(out, { recursive: true });
    const state = freshState();
    await install(page, state, lang);
    await page.goto(`/security-work/${WORKSPACE}/mandate`);
    // On a phone one of these sits inside the closed menu; use a visible one.
    const open = page.locator('[data-testid="sw-ai-open"]:visible').first();
    await slow(open).toBeVisible();
    await open.click();
    const panel = page.getByTestId("sw-ai-panel");
    await slow(panel).toBeVisible();

    // 1. The answer is lost.
    await panel.getByTestId("sw-ai-mandate_draft").click();
    const alert = panel.getByRole("alert");
    await expect(alert).toContainText(
      lang === "sv"
        ? "Vi vet inte om Security AI hann svara"
        : "We do not know whether Security AI finished answering",
    );
    await expect(alert).toContainText(
      lang === "sv" ? "räknas mot dagens AI-budget" : "counts against today's AI budget",
    );
    await expect(alert).toContainText(lang === "sv" ? "kostar igen" : "costs again");
    await shot(page, `${lang}-01-unknown`);
    expect(state.sent).toHaveLength(1);

    // 2. A repeated click and "check again" reuse the same operation id.
    await panel.getByTestId("sw-ai-check-again").click();
    await expect(panel.getByTestId("sw-ai-unknown-actions")).toBeVisible();
    await panel.getByTestId("sw-ai-mandate_draft").click();
    await expect(panel.getByTestId("sw-ai-unknown-actions")).toBeVisible();
    expect(state.sent).toHaveLength(3);
    expect(new Set(state.sent).size, "every retry carried the same operation id").toBe(1);

    // 3. Only the explicit button starts a new, separately billed operation.
    state.nextOutcome = "succeeded";
    await panel.getByTestId("sw-ai-new-request").click();
    await slow(panel.getByTestId("sw-ai-suggestion")).toBeVisible();
    expect(state.sent).toHaveLength(4);
    expect(state.sent[3]).not.toBe(state.sent[0]);
    expect(state.operations.get(state.sent[0])).toBe("outcome_unknown");
    await expect(panel.getByTestId("sw-ai-unknown-actions")).toHaveCount(0);
    await shot(page, `${lang}-02-new-request`);
  });
}

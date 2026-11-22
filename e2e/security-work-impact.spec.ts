/**
 * Security Work Release B: permitted source -> customer-specific impact
 * assessment -> human review -> risk and actions -> follow-up and export,
 * routed in the real application shell without a backend.
 *
 * Every server function is answered from an in-memory fixture that runs the
 * real pure modules: the feed is parsed by the production parser, relevance
 * and coverage come from the production functions, and the export is the
 * production Markdown. The fixture enforces what the database enforces (an
 * approved host, approver-only approval, frozen content after submission,
 * apply once per brief, supersede on an approved revision). Those rules are
 * proven for real in supabase/tests/security_work_monitoring_impact_test.sql
 * and scripts/security-work-release-b-postgrest-check.ts; this suite proves
 * the journey, its states and copy in both languages and phone layouts.
 * Hosted Supabase is blocked at the network layer and no feed is fetched.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fromJSON, toCrossJSON } from "seroval";
import { parseFeed } from "../src/lib/security-work/connectors/feed";
import { coverage } from "../src/lib/security-work/knowledge/coverage";
import { assessRelevance } from "../src/lib/security-work/knowledge/relevance";
import { emptyProfile } from "../src/lib/security-work/operating-context/schema";

test.describe.configure({ mode: "serial", timeout: 240_000 });
const slow = expect.configure({ timeout: 90_000 });
const out = process.env.SW_IMPACT_EVIDENCE_DIR ?? "/tmp/security-work-impact-evidence";
const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const UNKNOWN = "44444444-4444-4444-8444-444444444444";
const HOST = "feeds.example.test";
const now = () => new Date().toISOString();

function supabaseRef() {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = /VITE_SUPABASE_URL="?https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env);
  if (!match) throw new Error("VITE_SUPABASE_URL is needed to name the auth storage key");
  return match[1];
}

type Row = Record<string, unknown>;
const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string) => ({ ok: false, code });

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Trafikläget</title>${items}</channel></rss>`;
const rssItem = (guid: string, title: string, text: string) =>
  `<item><guid>${guid}</guid><title>${title}</title><link>https://${HOST}/${guid}</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><description>${text}</description></item>`;
const FIRST = rss(
  rssItem(
    "g1",
    "E6 avstängd vid Terminal Göteborg",
    "E6 är avstängd norrut vid terminalen efter en olycka.",
  ) + rssItem("g2", "Fotboll: helgens matcher", "Trafikomläggningar kring arenan."),
);
const UPDATE = rss(
  rssItem("g3", "E6 avstängd vid Terminal Göteborg – uppdatering", "Väntas öppna i morgon kväll."),
);

function freshState(role: "owner" | "editor") {
  const profile = {
    ...emptyProfile(),
    criticalServices: ["Terminal Göteborg"],
    countries: ["SE"],
    monitoring: {
      topics: ["avstängd"],
      places: ["E6"],
      exclusions: ["fotboll"],
      coverageExpectation: "",
    },
  };
  return {
    role,
    profile,
    sources: [] as Row[],
    items: [] as Row[],
    clusterOf: new Map<string, string>(),
    briefs: [] as Row[],
    flags: [] as Row[],
    applications: [] as Row[],
    risks: [] as Row[],
    actions: [] as Row[],
    nextFeed: FIRST,
  };
}
type State = ReturnType<typeof freshState>;

function developments(state: State) {
  return state.items.map((item) => ({
    itemId: item.id,
    sourceId: item.source_id,
    sourceName: "Trafikverket (syntetisk)",
    title: item.title,
    publisher: "Syntetisk trafikmyndighet",
    url: item.url,
    publishedAt: item.publishedAt,
    observedAt: null,
    retrievedAt: item.retrievedAt,
    excerpt: item.text,
    clusterId: state.clusterOf.get(String(item.id)) ?? null,
    independentSources: 1,
    hasCopies: false,
    relevance: assessRelevance(
      { title: String(item.title), text: String(item.text) },
      { profile: state.profile, assets: [] },
    ),
  }));
}

function evidenceFor(state: State, ids: string[]) {
  return state.items
    .filter((item) => ids.includes(String(item.id)))
    .map((item) => ({
      sourceItemId: item.id,
      title: item.title,
      publisher: "Syntetisk trafikmyndighet",
      url: item.url,
      publishedAt: item.publishedAt,
      retrievedAt: item.retrievedAt,
      retrievalStatus: "fetched",
    }));
}

function detail(state: State, brief: Row) {
  const application = state.applications.find((a) => a.brief_id === brief.id) ?? null;
  return {
    brief,
    application,
    followUp: application
      ? {
          risk: state.risks.find((r) => r.id === application.risk_id) ?? null,
          actions: state.actions.filter((a) =>
            (application.action_ids as string[]).includes(String(a.id)),
          ),
        }
      : { risk: null, actions: [] },
    flags: state.flags.filter((f) => f.brief_id === brief.id),
    revisions: state.briefs
      .filter((b) => b.supersedes_id === brief.id)
      .map((b) => ({ id: b.id, status: b.status, title: b.title })),
  };
}

function handle(state: State, name: string, data: Row): unknown {
  const approver = state.role === "owner";
  const brief = (id: unknown) => state.briefs.find((b) => b.id === id);
  switch (name) {
    case "getSecurityWorkEntry":
      return ok({ workspaces: [{ id: WORKSPACE, name: "Nordic Logistics AB" }] });
    case "getSecurityWorkspace":
      return ok({
        workspace: {
          id: WORKSPACE,
          owner_user_id: USER,
          kind: "organisation",
          name: "Nordic Logistics AB",
          language: "sv",
          version: 1,
        },
        membership: {
          workspace_id: WORKSPACE,
          user_id: USER,
          role: state.role,
          active: true,
          can_approve: approver,
        },
        profile: null,
        requirements: [],
        sources: state.sources,
        counts: { pending: 0, totalItems: state.items.length },
      });
    case "getWorkPortfolio":
      return ok({ analyses: [], risks: [], actions: [], reports: [], documents: [] });
    case "getWorkAiStatus":
      return ok({ enabled: false, reason: "AI_NOT_ENABLED" });
    case "getWorkProcessingStatus":
      return ok({ enabled: false, reason: "PROCESSING_NOT_CONFIGURED" });
    case "listMyEmployerWorkspaces":
      return [];
    case "countMyReviewQueue":
      return 0;
    case "listSecurityMissions":
      return ok([]);
    case "getSecurityImpact":
      return ok({
        coverage: coverage(state.sources as never, new Date()),
        approvedHosts: [
          {
            host: HOST,
            publisher: "Syntetisk trafikmyndighet",
            terms_reference: "Syntetisk licens",
          },
        ],
        developments: developments(state),
        briefs: [...state.briefs].reverse(),
        openFlags: state.flags.filter((f) => f.status === "open"),
        profileVersion: 1,
      });
    case "createSecurityFeedSource": {
      if (new URL(String(data.feedUrl)).hostname !== HOST) return fail("FEED_HOST_NOT_APPROVED");
      const source = {
        id: randomUUID(),
        workspace_id: WORKSPACE,
        name: data.name,
        source_type: "official_feed",
        active: true,
        poll_target_minutes: data.pollTargetMinutes,
        last_checked_at: null,
        last_success_at: null,
        last_failure_at: null,
        last_failure: null,
      };
      state.sources.push(source);
      return ok({ id: source.id, name: source.name });
    }
    case "fetchSecurityFeedNow": {
      const source = state.sources.find((s) => s.id === data.sourceId)!;
      let parsed: ReturnType<typeof parseFeed>;
      try {
        parsed = parseFeed(state.nextFeed);
      } catch (error) {
        // As the server does: a feed that cannot be read is a failed run,
        // recorded as coverage, never "nothing new".
        const code = (error as { code: string }).code;
        source.last_checked_at = source.last_failure_at = now();
        source.last_failure = code;
        return ok({ id: randomUUID(), status: "failed", error_code: code, items_new: 0 });
      }
      let fresh = 0;
      for (const entry of parsed) {
        if (state.items.some((i) => i.guid === entry.guid)) continue;
        const id = randomUUID();
        state.items.unshift({
          id,
          guid: entry.guid,
          source_id: source.id,
          title: entry.title,
          text: entry.text,
          url: entry.url,
          publishedAt: entry.publishedAt,
          retrievedAt: now(),
        });
        // Same story key rule as the database: the first five headline words.
        const key = entry.title.toLowerCase().split(/\s+/).slice(0, 5).join(" ");
        const sibling = state.items.find(
          (i) =>
            i.id !== id && String(i.title).toLowerCase().split(/\s+/).slice(0, 5).join(" ") === key,
        );
        const cluster = sibling ? state.clusterOf.get(String(sibling.id))! : randomUUID();
        state.clusterOf.set(id, cluster);
        for (const b of state.briefs)
          if (b.cluster_id === cluster && b.status === "approved")
            state.flags.push({
              id: randomUUID(),
              brief_id: b.id,
              source_item_id: id,
              status: "open",
              reason: "new_item_in_story",
            });
        fresh += 1;
      }
      source.last_checked_at = source.last_success_at = now();
      return ok({
        id: randomUUID(),
        status: fresh ? "succeeded" : "not_modified",
        items_new: fresh,
      });
    }
    case "createSecurityBrief": {
      const row = {
        id: randomUUID(),
        workspace_id: WORKSPACE,
        mission_id: data.missionId,
        cluster_id: data.clusterId,
        title: data.title,
        what_changed: data.whatChanged,
        known: data.known,
        why_it_matters: data.whyItMatters,
        uncertain: data.uncertain,
        proposed_actions: data.proposedActions,
        evidence_item_ids: data.evidenceItemIds,
        evidence: evidenceFor(state, data.evidenceItemIds as string[]),
        relevance: data.relevance,
        operating_profile_version: 1,
        status: "draft",
        version: 1,
        supersedes_id: null,
        approved_at: null,
        approved_by: null,
        decision_note: "",
        created_at: now(),
        updated_at: now(),
      };
      state.briefs.push(row);
      return ok(row);
    }
    case "getSecurityBrief": {
      const row = brief(data.briefId);
      return row ? ok(detail(state, row)) : fail("ACCESS_DENIED");
    }
    case "updateSecurityBrief": {
      const row = brief(data.briefId)!;
      if (row.version !== data.version || row.status !== "draft") return fail("CONFLICT");
      Object.assign(row, {
        title: data.title,
        what_changed: data.whatChanged,
        known: data.known,
        why_it_matters: data.whyItMatters,
        uncertain: data.uncertain,
        proposed_actions: data.proposedActions,
        version: Number(row.version) + 1,
        updated_at: now(),
      });
      return ok(row);
    }
    case "transitionSecurityBrief": {
      const row = brief(data.briefId)!;
      if (row.version !== data.version) return fail("CONFLICT");
      if ((data.status === "approved" || data.status === "rejected") && !approver)
        return fail("ACCESS_DENIED");
      row.status = data.status;
      row.version = Number(row.version) + 1;
      row.decision_note = data.decisionNote;
      if (data.status === "approved") {
        row.approved_at = now();
        row.approved_by = USER;
        const previous = brief(row.supersedes_id);
        if (previous) {
          previous.status = "superseded";
          for (const flag of state.flags)
            if (flag.brief_id === previous.id) flag.status = "resolved";
        }
      }
      return ok(row);
    }
    case "applySecurityBrief": {
      const row = brief(data.briefId)!;
      const existing = state.applications.find((a) => a.brief_id === row.id);
      if (existing) return existing.request_id === data.requestId ? ok(existing) : fail("CONFLICT");
      if (row.status !== "approved") return fail("CONFLICT");
      const risk = data.risk as Row | null;
      const riskId = risk ? randomUUID() : null;
      if (risk) state.risks.push({ id: riskId, title: risk.title, status: "proposed" });
      const actionIds = (data.actions as Row[]).map((action) => {
        const id = randomUUID();
        state.actions.push({
          id,
          title: action.title,
          status: "open",
          due_date: action.dueDate,
          priority: action.priority,
        });
        return id;
      });
      const application = {
        id: randomUUID(),
        brief_id: row.id,
        request_id: data.requestId,
        risk_id: riskId,
        action_ids: actionIds,
        applied_at: now(),
      };
      state.applications.push(application);
      return ok(application);
    }
    case "reviseSecurityBrief": {
      const row = brief(data.briefId)!;
      const flagged = state.flags
        .filter((f) => f.brief_id === row.id && f.status === "open")
        .map((f) => String(f.source_item_id));
      const ids = [...new Set([...(row.evidence_item_ids as string[]), ...flagged])];
      const next = {
        ...row,
        id: randomUUID(),
        status: "draft",
        version: 1,
        supersedes_id: row.id,
        evidence_item_ids: ids,
        evidence: evidenceFor(state, ids),
        approved_at: null,
        approved_by: null,
        decision_note: "",
      };
      state.briefs.push(next);
      return ok(next);
    }
    case "resolveSecurityFlag": {
      const flag = state.flags.find((f) => f.id === data.flagId)!;
      flag.status = "resolved";
      return ok(flag);
    }
    case "requestSecuritySuggestion":
      return fail("AI_NOT_ENABLED");
    default:
      return fail("SAVE_FAILED");
  }
}

async function install(page: Page, state: State, lang: "sv" | "en" = "sv") {
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
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
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
const go = (page: Page, segment = "") => page.goto(`/security-work/${WORKSPACE}${segment}`);

test("an official feed to a reviewed risk and actions, with follow-up, export and revision, in Swedish", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const state = freshState("owner");
  await install(page, state);

  await test.step("Overview says no official source is connected – never 'nothing happened'", async () => {
    await go(page);
    await slow(page.getByTestId("sw-changes")).toHaveAttribute(
      "data-coverage",
      "no_connected_source",
    );
    await expect(page.getByTestId("sw-changes")).toContainText(
      "Vi kan därför inte säga att inget har hänt",
    );
    await shot(page, "01-overview-no-source");
  });

  await test.step("Only an approved publisher can be connected; the new feed is 'never checked'", async () => {
    await page.getByRole("link", { name: "Till förändringarna" }).click();
    await slow(page.getByTestId("sw-impact")).toBeVisible();
    await page.getByTestId("sw-add-feed").click();
    const form = page.getByTestId("sw-add-feed-form");
    await expect(form).toContainText("Syntetisk trafikmyndighet (feeds.example.test)");
    await form.getByLabel("Namn").fill("Trafikverket (syntetisk)");
    await form.getByLabel(/Flödesadress/).fill("https://evil.example.test/rss");
    await form.getByRole("button", { name: "Anslut" }).click();
    await expect(form.getByRole("alert")).toContainText("inte till en godkänd officiell källa");
    await form.getByLabel(/Flödesadress/).fill(`https://${HOST}/rss`);
    await form.getByRole("button", { name: "Anslut" }).click();
    await expect(page.getByTestId("sw-coverage")).toHaveAttribute("data-coverage", "never_checked");
    await expect(page.getByTestId("sw-feed")).toHaveAttribute("data-state", "never_checked");
  });

  await test.step("A feed that cannot be read is a failed check with a next step, then a retry succeeds", async () => {
    const good = state.nextFeed;
    state.nextFeed = `<rss>${"<item>".repeat(5000)}</rss>`;
    await page.getByTestId("sw-fetch-now").click();
    const failed = page.getByTestId("sw-fetch-result");
    await expect(failed).toHaveAttribute("data-status", "failed");
    await expect(failed).toContainText("kunde inte läsas som ett RSS- eller Atom-flöde");
    await expect(failed).toContainText("Kontrollera att adressen pekar på själva flödet");
    await expect(failed).not.toContainText("feed_");
    await expect(page.getByTestId("sw-coverage")).toHaveAttribute("data-coverage", "failing");
    await expect(page.getByTestId("sw-coverage")).toContainText("kan vara ofullständigt");
    await shot(page, "02a-fetch-failed-clear-next-step");
    state.nextFeed = good;
  });

  await test.step("Fetch now: coverage becomes current and relevance is explained term by term", async () => {
    await page.getByTestId("sw-fetch-now").click();
    await expect(page.getByTestId("sw-fetch-result")).toContainText("2 nya poster hämtade");
    await expect(page.getByTestId("sw-coverage")).toHaveAttribute("data-coverage", "current");
    const road = page.getByTestId("sw-development").filter({ hasText: "E6 avstängd" });
    await expect(road.getByTestId("sw-relevance")).toContainText(
      "kritisk verksamhet ”Terminal Göteborg” (+3)",
    );
    await expect(road.getByTestId("sw-relevance")).toContainText("plats ”E6” (+2)");
    await expect(road).toContainText("En källa – inte bekräftad av någon annan");
    // The excluded item is filtered out, and shown with its reason on request.
    await expect(page.getByTestId("sw-development").filter({ hasText: "Fotboll" })).toHaveCount(0);
    await page.getByRole("button", { name: "Visa alla" }).click();
    await expect(page.getByTestId("sw-development").filter({ hasText: "Fotboll" })).toContainText(
      "Utesluten av er bevakning: ”fotboll”",
    );
    await page.getByRole("button", { name: "Visa bara relevanta" }).click();
    // Raising the threshold above the score hides it; the count says so.
    // Every point is named: 3 + 2 + 1 (topic) = 6. A threshold above it hides it.
    await expect(road).toHaveAttribute("data-relevance", "6");
    await page.getByTestId("sw-materiality").selectOption("8");
    await expect(
      page.getByText("0 av 2 de senaste 30 dagarna når er relevansgräns."),
    ).toBeVisible();
    await expect(page.getByTestId("sw-development")).toHaveCount(0);
    await page.getByTestId("sw-materiality").selectOption("2");
    await expect(
      page.getByText("1 av 2 de senaste 30 dagarna når er relevansgräns."),
    ).toBeVisible();
    await shot(page, "02-impact-developments");
  });

  await test.step("A person drafts the impact brief, edits it and submits it for review", async () => {
    await page
      .getByTestId("sw-development")
      .filter({ hasText: "E6 avstängd" })
      .getByTestId("sw-assess-impact")
      .click();
    const draft = page.getByTestId("sw-draft-brief");
    await draft
      .getByLabel("Varför spelar det roll för er?")
      .fill("Alla avgångar norrut går via E6.");
    await draft.getByTestId("sw-create-brief").click();
    await slow(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "draft");
    await expect(page.getByTestId("sw-brief-evidence")).toContainText("Syntetisk trafikmyndighet");
    const edit = page.getByTestId("sw-brief-edit");
    await edit.getByLabel("Vad vet vi").fill("Avstängningen är bekräftad av trafikmyndigheten.");
    await edit.getByLabel("Vad är osäkert").fill("Hur länge vägen är avstängd.");
    await edit
      .getByLabel(/Föreslagna åtgärder/)
      .fill("Lägg om avgångar via väg 40\nInformera kunder");
    await edit.getByTestId("sw-brief-save").click();
    await page.getByTestId("sw-brief-submit").click();
    await expect(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "in_review");
    await expect(page.getByTestId("sw-brief-edit")).toHaveCount(0);
    await shot(page, "03-brief-in-review");
  });

  await test.step("The approver approves; the brief becomes a risk and actions, recorded once", async () => {
    await page.getByLabel("Beslutsanteckning").fill("Granskad mot verksamhetsprofil v1");
    await page.getByTestId("sw-brief-approve").click();
    await expect(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "approved");
    const apply = page.getByTestId("sw-brief-apply");
    await expect(apply.getByLabel("Riskens rubrik")).toHaveValue(
      "E6 avstängd vid Terminal Göteborg",
    );
    await apply.getByLabel("Senast").first().fill("2026-12-01");
    await apply.getByTestId("sw-brief-apply-submit").click();
    const follow = page.getByTestId("sw-brief-followup");
    await expect(follow).toContainText("Risk: E6 avstängd vid Terminal Göteborg (föreslagen)");
    await expect(page.getByTestId("sw-followup-action")).toHaveCount(2);
    await expect(page.getByTestId("sw-brief-apply")).toHaveCount(0);
    expect(state.risks).toHaveLength(1);
    await shot(page, "04-brief-approved-followup");
  });

  await test.step("Export carries the approval, follow-up and the cited source", async () => {
    const download = page.waitForEvent("download");
    await page.getByTestId("sw-brief-export").click();
    const file = await download;
    const text = readFileSync((await file.path())!, "utf8");
    expect(file.suggestedFilename()).toMatch(/^E6-avst.*-v\d+\.md$/);
    expect(text).toContain("Status: Godkänt");
    expect(text).toContain("Risk: E6 avstängd vid Terminal Göteborg (föreslagen)");
    expect(text).toContain("Åtgärd: Lägg om avgångar via väg 40 (öppen, senast 2026-12-01)");
    expect(text).toContain(
      "1. Syntetisk trafikmyndighet: E6 avstängd vid Terminal Göteborg <https://feeds.example.test/g1>",
    );
    expect(text).toContain("Den täcker bara de källor som var anslutna.");
  });

  await test.step("New evidence in the same story flags the brief; the revision supersedes it", async () => {
    state.nextFeed = UPDATE;
    await go(page, "/impact");
    await page.getByTestId("sw-fetch-now").click();
    await expect(page.getByTestId("sw-fetch-result")).toContainText("1 nya poster hämtade");
    await expect(page.getByTestId("sw-brief-list").first()).toContainText(
      "ny information väntar på granskning",
    );
    await page.getByRole("link", { name: "E6 avstängd vid Terminal Göteborg" }).first().click();
    await expect(page.getByTestId("sw-brief-flags")).toContainText("1 ny post i samma händelse");
    await shot(page, "05-brief-flagged");
    await page.getByTestId("sw-brief-revise").click();
    await expect(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "draft");
    await expect(page.getByTestId("sw-brief-evidence").locator("li")).toHaveCount(2);
    await page.getByTestId("sw-brief-submit").click();
    await page.getByTestId("sw-brief-approve").click();
    await expect(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "approved");
    await page.getByRole("link", { name: "Föregående version" }).click();
    await expect(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "superseded");
    await expect(page.getByTestId("sw-brief-flags")).toHaveCount(0);
    // The earlier record of risk and actions stays.
    await expect(page.getByTestId("sw-brief-followup")).toBeVisible();
  });

  await test.step("The overview now reports the live coverage", async () => {
    await go(page);
    await slow(page.getByTestId("sw-changes")).toHaveAttribute("data-coverage", "current");
    await expect(page.getByTestId("sw-changes-live")).toContainText(
      "relevanta händelser de senaste 30 dagarna",
    );
    await shot(page, "06-overview-current");
  });
});

test("an editor cannot approve; the approver completes the journey, in English", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const state = freshState("editor");
  await install(page, state, "en");
  await go(page, "/impact");
  await slow(page.getByTestId("sw-impact")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Changes that affect you", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("sw-coverage")).toContainText(
    "we cannot say that nothing has happened",
  );
  await page.getByTestId("sw-add-feed").click();
  await page.getByLabel("Name").fill("Road authority (synthetic)");
  await page.getByLabel(/Feed address/).fill(`https://${HOST}/rss`);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByTestId("sw-fetch-now").click();
  await expect(page.getByTestId("sw-fetch-result")).toContainText("2 new items fetched");
  await page
    .getByTestId("sw-development")
    .filter({ hasText: "E6" })
    .getByTestId("sw-assess-impact")
    .click();
  await page.getByTestId("sw-create-brief").click();
  await slow(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "draft");
  await page.getByTestId("sw-brief-submit").click();
  await expect(page.getByTestId("sw-brief-awaiting-approver")).toContainText(
    "Waiting for a person who may approve",
  );
  await expect(page.getByTestId("sw-brief-approve")).toHaveCount(0);
  await shot(page, "07-editor-awaits-approver-en");

  // The workspace's approver (the same fixture, now answering as the owner)
  // completes the journey in English: approve, record, follow up, export.
  state.role = "owner";
  await page.reload();
  await slow(page.getByTestId("sw-brief-review")).toBeVisible();
  await page.getByLabel("Decision note").fill("Reviewed against operating profile v1");
  await page.getByTestId("sw-brief-approve").click();
  await expect(page.getByTestId("sw-brief")).toHaveAttribute("data-status", "approved");
  const apply = page.getByTestId("sw-brief-apply");
  await apply.getByRole("button", { name: "Add action" }).click();
  await apply.getByLabel("Action").last().fill("Re-route northbound departures");
  await apply.getByLabel("Due").last().fill("2026-12-01");
  await apply.getByTestId("sw-brief-apply-submit").click();
  await expect(page.getByTestId("sw-brief-followup")).toContainText("Risk:");
  await expect(page.getByTestId("sw-brief-followup")).toContainText("(proposed)");
  await expect(page.getByTestId("sw-followup-action")).toContainText(
    "Re-route northbound departures · open · due",
  );
  const download = page.waitForEvent("download");
  await page.getByTestId("sw-brief-export").click();
  const text = readFileSync((await (await download).path())!, "utf8");
  expect(text).toContain("Status: Approved");
  expect(text).toContain("Action: Re-route northbound departures (open, due 2026-12-01)");
  expect(text).toContain("It covers only the sources that were connected.");
  await shot(page, "08-approved-followup-en");
});

test("a brief that does not exist or is out of reach answers the same way", async ({ page }) => {
  const state = freshState("owner");
  await install(page, state);
  await go(page, `/impact/${UNKNOWN}`);
  await slow(page.getByRole("alert")).toContainText(
    "Bedömningen finns inte eller så har du inte tillgång till den",
  );
  await expect(page.getByRole("link", { name: /Förändringar som berör er/ })).toBeVisible();
});

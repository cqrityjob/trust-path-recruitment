/**
 * Security Work Release A: missions, operating profile and team, routed in the
 * real application shell without a backend.
 *
 * Every server function is answered from an in-memory fixture. The fixture
 * enforces the same rules as the database by importing the real pure modules
 * (mission state machine, missing-input rule, confirm-to-keep prefill) and
 * answers a stale version with CONFLICT and a restricted mission with
 * ACCESS_DENIED, exactly as the services do. RLS, need-to-know, the code hash
 * and the last-owner rule are proven in SQL
 * (supabase/tests/security_work_context_missions_test.sql); this suite proves
 * the journeys, states, copy in both languages, keyboard use and phone
 * layouts. Hosted Supabase is blocked at the network layer.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fromJSON, toCrossJSON } from "seroval";
import {
  canTransition,
  missingInputs,
  parseBrief,
  type MissionKind,
} from "../src/lib/security-work/missions/model";
import {
  confirmedOnly,
  operatingProfileSchema,
  prefillFrom,
} from "../src/lib/security-work/operating-context/schema";

test.describe.configure({ mode: "serial", timeout: 240_000 });
const slow = expect.configure({ timeout: 90_000 });
const out = process.env.SW_MISSIONS_EVIDENCE_DIR ?? "/tmp/security-work-missions-evidence";
const USER = "11111111-1111-4111-8111-111111111111";
const COLLEAGUE = "33333333-3333-4333-8333-333333333333";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const HIDDEN = "44444444-4444-4444-8444-444444444444";
const SOURCE = "55555555-5555-4555-8555-555555555555";
const ASSET = "66666666-6666-4666-8666-666666666666";
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

function freshState() {
  return {
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
    sources: [
      { id: SOURCE, workspace_id: WORKSPACE, name: "Polisens händelser (manuell)", active: true },
    ],
    mandate: {
      organisation_description: "Logistikföretag med tre terminaler i Sverige.",
      geographic_scope: "Sverige",
    },
    assets: [{ id: ASSET, name: "Terminal Göteborg", category: "operations", status: "active" }],
    missions: [] as Row[],
    links: [] as Row[],
    events: [] as Row[],
    profiles: [] as { version: number; profile: Row; provenance: Row; createdAt: string }[],
    roleFocus: "combined",
    members: [
      {
        user_id: USER,
        email: "head-of-security@example.test",
        role: "owner",
        active: true,
        can_approve: true,
      },
      {
        user_id: COLLEAGUE,
        email: "analyst@example.test",
        role: "editor",
        active: true,
        can_approve: false,
      },
    ],
    invitations: [] as Row[],
    accepted: false,
  };
}
type State = ReturnType<typeof freshState>;

function programme(state: State) {
  return {
    today: now().slice(0, 10),
    mandate: null,
    assets: state.assets.map((asset) => ({
      ...asset,
      workspace_id: WORKSPACE,
      description: "",
      owner_id: null,
      owner_label: "",
      business_importance: "high",
      consequence_level: null,
      consequence_description: "",
      review_date: null,
      created_at: now(),
      created_by: USER,
      updated_at: now(),
      version: 1,
    })),
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
    members: state.members.map((member) => ({ user_id: member.user_id, role: member.role })),
  };
}

function event(
  state: State,
  missionId: string,
  kind: string,
  from: string | null,
  to: string | null,
) {
  state.events.unshift({
    id: state.events.length + 1,
    workspace_id: WORKSPACE,
    mission_id: missionId,
    actor_user_id: USER,
    event: kind,
    from_value: from,
    to_value: to,
    record_version: null,
    created_at: now(),
  });
}

function summary(state: State, mission: Row) {
  const own = state.links.filter((link) => link.mission_id === mission.id);
  return {
    ...mission,
    linkCount: own.length,
    evidenceCount: own.filter((link) =>
      ["source", "source_item", "requirement"].includes(String(link.target_kind)),
    ).length,
  };
}

function handle(state: State, name: string, data: Row): unknown {
  switch (name) {
    case "getSecurityWorkEntry":
      return ok({ workspaces: [state.workspace] });
    case "getSecurityWorkspace":
      return ok({
        workspace: state.workspace,
        membership: state.membership,
        profile: null,
        requirements: [],
        sources: state.sources,
        counts: { pending: 0, totalItems: 0 },
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
    case "getSecurityProgramme":
      return ok(programme(state));
    case "listSecurityMissions":
      return ok(state.missions.map((mission) => summary(state, mission)));
    case "createSecurityMission": {
      const kind = data.kind as MissionKind;
      const mission = {
        id: randomUUID(),
        workspace_id: WORKSPACE,
        kind,
        title: data.title,
        brief: parseBrief(kind, data.brief),
        execution_state: "created",
        review_state: "not_started",
        restricted: Boolean(data.restricted),
        owner_id: USER,
        next_action: "",
        due_date: null,
        operating_profile_version: state.profiles.at(-1)?.version ?? null,
        created_by: USER,
        created_at: now(),
        updated_at: now(),
        version: 1,
      };
      state.missions.unshift(mission);
      event(state, mission.id, "created", null, "created");
      return ok(mission);
    }
    case "getSecurityMission": {
      if (data.missionId === HIDDEN) return fail("ACCESS_DENIED");
      const mission = state.missions.find((row) => row.id === data.missionId);
      if (!mission) return fail("ACCESS_DENIED");
      const titles: Record<string, string> = {
        [SOURCE]: state.sources[0].name,
        [ASSET]: state.assets[0].name,
      };
      return ok({
        mission,
        members: [{ user_id: USER, email: "head-of-security@example.test" }],
        links: state.links
          .filter((link) => link.mission_id === mission.id)
          .map((link) => ({ link, title: titles[String(link.target_id)] ?? null, status: null })),
        events: state.events.filter((row) => row.mission_id === mission.id),
      });
    }
    case "updateSecurityMission": {
      const mission = state.missions.find((row) => row.id === data.missionId)!;
      if (mission.version !== data.version) return fail("CONFLICT");
      if (data.brief) mission.brief = parseBrief(mission.kind as MissionKind, data.brief);
      if (typeof data.nextAction === "string") mission.next_action = data.nextAction;
      mission.version = Number(mission.version) + 1;
      mission.updated_at = now();
      event(state, String(mission.id), "brief_changed", null, null);
      return ok(mission);
    }
    case "transitionSecurityMission": {
      const mission = state.missions.find((row) => row.id === data.missionId)!;
      if (mission.version !== data.version) return fail("CONFLICT");
      const review = (data.reviewState as string) ?? String(mission.review_state);
      if (data.executionState) {
        if (
          !canTransition(
            { execution_state: String(mission.execution_state), review_state: review },
            data.executionState as never,
          ) ||
          (data.executionState === "ready" &&
            missingInputs(mission.kind as MissionKind, mission.brief as Row).length)
        )
          return fail("INVALID_INPUT");
        event(
          state,
          String(mission.id),
          "state_changed",
          String(mission.execution_state),
          String(data.executionState),
        );
        mission.execution_state = data.executionState;
      }
      if (data.reviewState) {
        // As the database (20270329090000): accepting is an approval, stamped.
        if (data.reviewState === "accepted" && !state.membership.can_approve)
          return fail("APPROVER_REQUIRED");
        mission.review_accepted_by = data.reviewState === "accepted" ? USER : null;
        event(
          state,
          String(mission.id),
          "review_changed",
          String(mission.review_state),
          String(data.reviewState),
        );
        mission.review_state = data.reviewState;
      }
      mission.version = Number(mission.version) + 1;
      return ok(mission);
    }
    case "addSecurityMissionLink": {
      const link = {
        id: randomUUID(),
        workspace_id: WORKSPACE,
        mission_id: data.missionId,
        target_kind: data.targetKind,
        target_id: data.targetId,
        note: "",
        created_by: USER,
        created_at: now(),
      };
      state.links.push(link);
      event(state, String(data.missionId), "link_added", null, String(data.targetKind));
      return ok(link);
    }
    case "removeSecurityMissionLink":
      state.links = state.links.filter((link) => link.id !== data.linkId);
      return ok({ removed: true });
    case "setSecurityMissionMember":
      return ok({ member: data.member });
    case "getOperatingContext": {
      const current = state.profiles.at(-1);
      return ok({
        current: current
          ? {
              version: current.version,
              profile: current.profile,
              provenance: current.provenance,
              createdAt: current.createdAt,
              createdBy: USER,
            }
          : null,
        unreadable: false,
        history: [...state.profiles].reverse().map((entry) => ({
          version: entry.version,
          createdAt: entry.createdAt,
          createdBy: USER,
          changeNote: "",
        })),
        prefill: prefillFrom({ mandate: state.mandate, assets: state.assets, monitoring: null }),
        roleFocus: state.roleFocus,
      });
    }
    case "saveOperatingProfile": {
      const latest = state.profiles.at(-1)?.version ?? 0;
      if (data.expectedVersion !== latest) return fail("CONFLICT");
      // The real service keeps confirmed values only; so does the fixture.
      const kept = confirmedOnly(
        operatingProfileSchema.parse(data.profile),
        data.provenance as never,
      );
      state.profiles.push({
        version: latest + 1,
        profile: kept.profile,
        provenance: kept.provenance,
        createdAt: now(),
      });
      return ok({ version: latest + 1 });
    }
    case "saveRoleFocus":
      state.roleFocus = String(data.roleFocus);
      return ok({ roleFocus: state.roleFocus });
    case "getSecurityTeam":
      return ok({ members: state.members, invitations: state.invitations, canManage: true });
    case "createSecurityInvitation": {
      const invitation = {
        id: data.requestId,
        email: data.email,
        role: data.role,
        can_approve: false,
        created_at: now(),
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        accepted_at: null,
        revoked_at: null,
      };
      state.invitations.unshift(invitation);
      return ok({ id: invitation.id, code: "a".repeat(64), expiresAt: invitation.expires_at });
    }
    case "revokeSecurityInvitation":
      state.invitations = state.invitations.map((row) =>
        row.id === data.invitationId ? { ...row, revoked_at: now() } : row,
      );
      return ok({ revoked: true });
    case "setSecurityMemberRole":
      state.members = state.members.map((member) =>
        member.user_id === data.userId ? { ...member, active: Boolean(data.active) } : member,
      );
      return ok({ userId: data.userId });
    case "acceptSecurityInvitation":
      if (data.code !== "b".repeat(64)) return fail("ACCESS_DENIED");
      state.accepted = true;
      return ok({ workspaceId: WORKSPACE });
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

test("a risk assessment mission from the overview to a completed review, in Swedish", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const state = freshState();
  await install(page, state);

  await test.step("Overview: task entrance, honest coverage, empty decisions", async () => {
    await go(page);
    await slow(page.getByTestId("sw-work-entrance")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vad behöver du få gjort?" })).toBeVisible();
    // A connected source with no described requirement is not "nothing happened".
    await expect(page.getByTestId("sw-changes")).toHaveAttribute(
      "data-coverage",
      "no_requirements",
    );
    await expect(page.getByTestId("sw-changes")).toContainText("inget kan bedömas som relevant");
    await expect(page.getByTestId("sw-decisions")).toContainText("Inget väntar på beslut");
    // Event security is not offered until its planning works.
    await expect(page.getByTestId("sw-start-event_security")).toHaveCount(0);
    await shot(page, "01-overview");
  });

  await test.step("Start a restricted risk assessment; the brief waits for what is missing", async () => {
    await page.getByTestId("sw-start-risk_assessment").click();
    const form = page.getByTestId("sw-mission-create");
    await slow(form).toBeVisible();
    await expect(page.getByLabel("Typ av uppdrag")).toHaveValue("risk_assessment");
    await page.getByLabel("Rubrik").fill("Risk inför ny terminal i Göteborg");
    await expect(page.getByTestId("sw-mission-missing")).toContainText("beslut som ska stödjas");
    await page.getByRole("checkbox", { name: /Begränsat uppdrag/ }).check();
    await shot(page, "02-create");
    await page.getByRole("button", { name: "Skapa uppdrag" }).click();
    await slow(page.getByTestId("sw-mission-detail")).toBeVisible();
    await expect(page.getByTestId("sw-mission-missing-inputs")).toContainText("Tidshorisont");
    await expect(page.getByText("Begränsat till uppdragets medlemmar")).toBeVisible();
    // "Ready" is not offered while the brief is incomplete.
    await expect(page.getByTestId("sw-mission-to-ready")).toHaveCount(0);
  });

  await test.step("Complete the brief; a stale save is a visible conflict", async () => {
    const brief = page.getByTestId("sw-mission-brief");
    await brief.getByLabel("Beslut som ska stödjas").fill("Godkänna skyddsbudget för terminalen");
    await brief.getByLabel("Omfattning").fill("Terminalområdet och angränsande parkering");
    await brief.getByLabel("Tidshorisont").fill("12 månader");
    // Someone else saved meanwhile.
    state.missions[0].version = Number(state.missions[0].version) + 1;
    await brief.getByRole("button", { name: "Spara briefen" }).click();
    await expect(page.getByTestId("sw-mission-detail").getByRole("alert")).toBeVisible();
    // The page reloaded the current version; saving again succeeds.
    const fresh = page.getByTestId("sw-mission-brief");
    await fresh.getByLabel("Beslut som ska stödjas").fill("Godkänna skyddsbudget för terminalen");
    await fresh.getByLabel("Omfattning").fill("Terminalområdet och angränsande parkering");
    await fresh.getByLabel("Tidshorisont").fill("12 månader");
    await fresh.getByRole("button", { name: "Spara briefen" }).click();
    await expect(page.getByTestId("sw-mission-side")).toContainText("Briefen har det som krävs");
  });

  await test.step("Link evidence and a protected asset with the keyboard", async () => {
    const evidenceTab = page.getByRole("tab", { name: "Underlag" });
    await evidenceTab.focus();
    await page.keyboard.press("Enter");
    await expect(evidenceTab).toHaveAttribute("aria-selected", "true");
    await page
      .getByLabel("Koppla en post")
      .selectOption({ label: "Källa: Polisens händelser (manuell)" });
    await page.getByRole("button", { name: "Koppla", exact: true }).click();
    await expect(page.getByTestId("sw-mission-links")).toContainText("Polisens händelser");
    await page.getByRole("tab", { name: "Beslut och åtgärder" }).click();
    await page
      .getByLabel("Koppla en post")
      .selectOption({ label: "Skyddsvärd tillgång: Terminal Göteborg" });
    await page.getByRole("button", { name: "Koppla", exact: true }).click();
    await expect(page.getByTestId("sw-mission-links")).toContainText("Terminal Göteborg");
    await expect(page.getByTestId("sw-mission-side")).toContainText("Kopplat underlag: 1");
    await shot(page, "03-mission-linked");
  });

  await test.step("Ready → review → accepted → completed; history records each step", async () => {
    await page.getByTestId("sw-mission-to-ready").click();
    await expect(page.locator('[data-mission-state="ready"]').first()).toBeVisible();
    await page.getByTestId("sw-mission-to-needs_review").click();
    // Completion is not offered before an accepted review.
    await expect(page.getByTestId("sw-mission-to-completed")).toHaveCount(0);
    await page.getByTestId("sw-mission-review-in_review").click();
    await page.getByTestId("sw-mission-review-accepted").click();
    await expect(page.getByTestId("sw-mission-review")).toHaveText("Granskat och godtaget");
    await page.getByTestId("sw-mission-to-completed").click();
    await expect(page.locator('[data-mission-state="completed"]').first()).toBeVisible();
    await page.getByRole("tab", { name: "Historik" }).click();
    await expect(page.getByTestId("sw-mission-history")).toContainText("Behöver granskas → Klart");
    await expect(page.getByTestId("sw-mission-history")).toContainText(
      "Under granskning → Granskat och godtaget",
    );
    await shot(page, "04-mission-history");
  });

  await test.step("A restricted mission someone else owns is simply not available", async () => {
    await go(page, `/missions/${HIDDEN}`);
    await slow(page.getByTestId("sw-mission-unavailable")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Uppdraget är inte tillgängligt",
    );
  });

  await test.step("Missions list and the overview show the closed mission", async () => {
    await go(page, "/missions");
    await slow(page.getByTestId("sw-missions")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Avslutade" })).toBeVisible();
    await shot(page, "05-missions");
  });
});

test("operating profile: prefilled values are kept only once confirmed; team invitations", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const state = freshState();
  await install(page, state);

  await test.step("Prefill from the mandate and asset register waits for confirmation", async () => {
    await go(page, "/organisation");
    await slow(page.getByTestId("sw-operating-profile")).toBeVisible();
    await expect(page.getByTestId("sw-profile-version")).toHaveText("Inte sparad ännu");
    await expect(page.getByTestId("sw-prefill-organisationDescription")).toContainText(
      "Hämtat från mandatet",
    );
    await expect(page.getByTestId("sw-prefill-organisationDescription")).toContainText(
      "bekräfta för att spara",
    );
    await expect(page.getByTestId("sw-prefill-criticalServices")).toContainText(
      "tillgångsregistret",
    );
    await shot(page, "06-profile-prefill");
  });

  await test.step("Saving without confirming keeps nothing that was only prefilled", async () => {
    await page.getByTestId("sw-profile-save").click();
    await expect(page.getByTestId("sw-profile-version")).toContainText("Version 1");
    expect(state.profiles[0].profile.organisationDescription).toBe("");
    expect(state.profiles[0].profile.criticalServices).toEqual([]);
  });

  await test.step("Confirmed and typed values are kept as the next version", async () => {
    await page
      .getByLabel("Beskrivning av verksamheten")
      .fill("Logistikföretag med tre terminaler i Sverige.");
    await page.getByLabel("Länder (ISO-kod, t.ex. SE)").fill("SE, NO");
    await page.getByLabel("Vem som får acceptera risker").fill("VD");
    await page.getByTestId("sw-profile-save").click();
    await expect(page.getByTestId("sw-profile-version")).toContainText("Version 2");
    expect(state.profiles[1].profile.organisationDescription).toContain("tre terminaler");
    expect(state.profiles[1].profile.countries).toEqual(["SE", "NO"]);
  });

  await test.step("Role focus is personal and says it grants nothing", async () => {
    await expect(page.getByTestId("sw-role-focus")).toContainText("Det ger inga behörigheter");
    await page.getByLabel("Rollfokus").selectOption("ciso");
    await expect.poll(() => state.roleFocus).toBe("ciso");
  });

  await test.step("An owner invites a colleague; the code is shown once and nothing is sent", async () => {
    await page.getByLabel("E-postadress").fill("new.colleague@example.test");
    await page.getByRole("button", { name: "Skapa inbjudan" }).click();
    await expect(page.getByTestId("sw-invite-code")).toContainText("visas bara nu");
    await expect(page.getByTestId("sw-invite-code")).toContainText("Inget skickas från tjänsten");
    await expect(page.getByTestId("sw-team")).toContainText("new.colleague@example.test");
    await shot(page, "07-team");
  });
});

test("an invitee enters a code on the entry page and joins", async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const state = freshState();
  await install(page, state);
  await page.goto("/security-work?choose=true");
  const form = page.getByTestId("sw-accept-invitation");
  await slow(form).toBeVisible();
  await form.getByLabel("Inbjudningskod").fill("c".repeat(64));
  await form.getByRole("button", { name: "Gå med i arbetsytan" }).click();
  await expect(form.getByRole("alert")).toContainText("Koden kunde inte användas");
  await form.getByLabel("Inbjudningskod").fill("b".repeat(64));
  await form.getByRole("button", { name: "Gå med i arbetsytan" }).click();
  await slow(page.getByTestId("sw-work-entrance")).toBeVisible();
  expect(state.accepted).toBe(true);
});

test("English: the same journey surfaces read in English", async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const state = freshState();
  await install(page, state, "en");
  await go(page);
  await slow(page.getByRole("heading", { name: "What do you need to get done?" })).toBeVisible();
  await expect(page.getByTestId("sw-changes")).toContainText("Changes that affect you");
  // On a phone the navigation sits behind the menu button; its content is the same.
  await expect(page.locator("#security-work-navigation")).toContainText("Your organisation");
  await go(page, "/missions?new=monitoring_impact");
  await slow(page.getByTestId("sw-mission-create")).toBeVisible();
  await expect(page.getByLabel("Mission type")).toHaveValue("monitoring_impact");
  await shot(page, "08-english-create");
});

test("an editor without approval rights cannot accept a mission review", async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const state = freshState();
  state.membership = { ...state.membership, role: "editor", can_approve: false };
  const id = randomUUID();
  state.missions.push({
    id,
    workspace_id: WORKSPACE,
    kind: "risk_assessment",
    title: "Terminalrisk under granskning",
    brief: { decision: "Budget", scope: "Terminal", horizon: "12 månader" },
    execution_state: "needs_review",
    review_state: "in_review",
    review_accepted_by: null,
    restricted: false,
    owner_id: USER,
    next_action: "",
    due_date: null,
    operating_profile_version: null,
    created_by: USER,
    created_at: now(),
    updated_at: now(),
    version: 3,
  });
  await install(page, state);
  await go(page, `/missions/${id}`);
  await slow(page.getByTestId("sw-mission-detail")).toBeVisible();
  await expect(page.getByTestId("sw-mission-awaits-approver")).toContainText(
    "väntar på en person som får godkänna",
  );
  await expect(page.getByTestId("sw-mission-review-accepted")).toHaveCount(0);
  await expect(page.getByTestId("sw-mission-to-completed")).toHaveCount(0);
  await expect(page.getByTestId("sw-mission-review-changes_requested")).toBeVisible();
  await shot(page, "09-editor-awaits-approver");
});

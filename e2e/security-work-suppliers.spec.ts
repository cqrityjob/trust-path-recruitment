/**
 * Security Work supplier cycle: observation -> decision -> supplier request ->
 * approved external version -> recorded dispatch -> insufficient answer ->
 * revision -> objection and scope decision -> new answer -> verification ->
 * follow-up, routed in the real application shell without a backend.
 *
 * Server functions are answered from an in-memory fixture that applies the
 * database's rules (the sharing right, approver-only verification and
 * decisions, the state machine, the minimised external version). Those rules
 * are proven for real in supabase/tests/security_work_supplier_cycle_test.sql
 * and scripts/security-work-supplier-postgrest-check.ts; this suite proves the
 * journey, its states and copy in both languages and phone layouts.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fromJSON, toCrossJSON } from "seroval";
import {
  sortQueue,
  supplierOverdue,
  type QueueItem,
} from "../src/lib/security-work/suppliers/model";

test.describe.configure({ mode: "serial", timeout: 240_000 });
const slow = expect.configure({ timeout: 90_000 });
const out = process.env.SW_SUPPLIER_EVIDENCE_DIR ?? "/tmp/security-work-supplier-evidence";
const USER = "11111111-1111-4111-8111-111111111111";
const CISO = "33333333-3333-4333-8333-333333333333";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const UNKNOWN = "44444444-4444-4444-8444-444444444444";
const now = () => new Date().toISOString();
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function supabaseRef() {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = /VITE_SUPABASE_URL="?https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env);
  if (!match) throw new Error("VITE_SUPABASE_URL is needed to name the auth storage key");
  return match[1];
}
type Row = Record<string, unknown>;
const ok = (data: unknown) => ({ ok: true, data });
const fail = (code: string) => ({ ok: false, code });

function freshState(role: "owner" | "editor") {
  const acs = randomUUID();
  return {
    role,
    approver: role === "owner",
    share: role === "owner",
    assets: [
      { id: acs, name: "Passersystem", category: "systems", status: "active" },
      { id: randomUUID(), name: "Kontor Stockholm", category: "facilities", status: "active" },
    ] as Row[],
    profiles: [] as Row[],
    dependencies: [] as Row[],
    contracts: [] as Row[],
    obligations: [] as Row[],
    actions: [
      { id: randomUUID(), title: "Säkra passersystemet", status: "open", asset_id: acs },
    ] as Row[],
    requests: [] as Row[],
    events: [] as Row[],
    shares: [] as Row[],
    responses: [] as Row[],
    verifications: [] as Row[],
    decisions: [] as Row[],
    reviews: [] as Row[],
  };
}
type State = ReturnType<typeof freshState>;
const members = [
  {
    user_id: USER,
    role: "owner",
    can_approve: true,
    can_share_external: true,
    label: "head-of-security@example.test",
  },
  {
    user_id: CISO,
    role: "editor",
    can_approve: true,
    can_share_external: false,
    label: "ciso@example.test",
  },
];

function event(state: State, r: Row, name: string, from: string | null, details: Row = {}) {
  state.events.push({
    id: randomUUID(),
    request_id: r.id,
    cycle: r.cycle,
    event: name,
    from_status: from,
    to_status: r.status,
    details,
    created_at: now(),
    actor_user_id: USER,
  });
}
function shareContent(state: State, r: Row) {
  const o = state.obligations.find((x) => x.id === r.obligation_id);
  const c = o ? state.contracts.find((x) => x.id === o.contract_id) : null;
  return {
    reference: r.reference,
    title: r.title,
    task: r.task,
    expectedResult: r.expected_result,
    responseInstruction: r.response_instruction,
    requestedDue: r.requested_due,
    basisKind: r.basis_kind,
    contract: c ? { title: c.title, version: c.contract_version, clause: o!.clause } : null,
    supplier: state.assets.find((a) => a.id === r.supplier_asset_id)?.name ?? null,
  };
}
function supplierDetail(state: State, assetId: string) {
  const asset = state.assets.find((a) => a.id === assetId && a.category === "suppliers");
  if (!asset) return fail("ACCESS_DENIED");
  const requests = state.requests.filter((r) => r.supplier_asset_id === assetId);
  const ids = requests.map((r) => r.id);
  return ok({
    asset,
    profile: state.profiles.find((p) => p.asset_id === assetId) ?? null,
    assets: state.assets,
    dependencies: state.dependencies.filter(
      (d) => d.to_asset_id === assetId || d.from_asset_id === assetId,
    ),
    contracts: state.contracts.filter((c) => c.supplier_asset_id === assetId),
    obligations: state.obligations.filter((o) => o.supplier_asset_id === assetId),
    requests,
    events: state.events.filter((e) => ids.includes(e.request_id)),
    responses: state.responses.filter((e) => ids.includes(e.request_id)),
    verifications: state.verifications.filter((e) => ids.includes(e.request_id)),
    decisions: state.decisions.filter((d) => ids.includes(d.subject_id)),
    reviews: state.reviews.filter((r) => r.supplier_asset_id === assetId),
    members,
    openActions: state.actions.filter((a) => a.status === "open"),
  });
}

function handle(state: State, name: string, data: Row): unknown {
  const req = (id: unknown) => state.requests.find((r) => r.id === id);
  const bump = (r: Row) => {
    r.version = Number(r.version) + 1;
    r.updated_at = now();
  };
  const command = (data: Row) => {
    const r = req(data.requestId);
    if (!r) return { error: fail("ACCESS_DENIED") };
    if (r.version !== data.version) return { error: fail("CONFLICT") };
    return { r };
  };
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
          role: state.role === "owner" ? "owner" : "editor",
          active: true,
          can_approve: state.approver,
          can_share_external: state.share,
        },
        profile: null,
        requirements: [],
        sources: [],
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
    case "listSecurityMissions":
      return ok([]);
    case "getSecurityWorkQueue": {
      const items: QueueItem[] = [];
      for (const r of state.requests) {
        if (supplierOverdue(r as never, day(0)))
          items.push({
            kind: "supplier_response_missing",
            id: String(r.id),
            title: `${r.reference} · ${r.title}`,
            to: `/supplier-requests/${r.id}`,
            due: String(r.requested_due),
            owner: String(r.internal_owner_id),
            categories: ["suppliers"],
          });
        if (r.status === "awaiting_verification")
          items.push({
            kind: "needs_verification",
            id: String(r.id),
            title: `${r.reference} · ${r.title}`,
            to: `/supplier-requests/${r.id}`,
            due: String(r.requested_due),
            owner: String(r.internal_owner_id),
            categories: ["suppliers"],
          });
      }
      items.push({
        kind: "overdue_action",
        id: "a1",
        title: "Uppdatera reservrutin för entréer",
        to: "/risks",
        due: day(-2),
        owner: USER,
        categories: ["facilities"],
      });
      items.push({
        kind: "coverage_gap",
        id: "no-source",
        title: "",
        to: "/impact",
        due: null,
        owner: null,
        categories: [],
      });
      return ok({ items: sortQueue(items), generatedAt: now() });
    }
    case "getSecuritySuppliers":
      return ok({
        suppliers: state.assets
          .filter((a) => a.category === "suppliers")
          .map((asset) => {
            const mine = state.requests.filter((r) => r.supplier_asset_id === asset.id);
            return {
              asset,
              profile: state.profiles.find((p) => p.asset_id === asset.id) ?? null,
              open: mine.filter((r) => !["accepted", "withdrawn"].includes(String(r.status)))
                .length,
              overdue: mine.filter((r) => supplierOverdue(r as never, day(0))).length,
              awaitingVerification: mine.filter((r) => r.status === "awaiting_verification").length,
              objections: state.events.filter(
                (e) => e.event === "objection_recorded" && mine.some((r) => r.id === e.request_id),
              ).length,
            };
          }),
        members,
        openActions: state.actions.filter((a) => a.status === "open"),
        requests: state.requests,
      });
    case "saveSecuritySupplierProfile": {
      let assetId = data.assetId as string | null;
      if (!assetId) {
        assetId = randomUUID();
        state.assets.push({
          id: assetId,
          name: data.name,
          category: "suppliers",
          status: "active",
        });
      }
      const existing = state.profiles.find((p) => p.asset_id === assetId);
      const row = {
        asset_id: assetId,
        workspace_id: WORKSPACE,
        internal_owner_id: data.internalOwnerId,
        contact_route: data.contactRoute,
        services: data.services,
        status: data.status,
      };
      if (existing) Object.assign(existing, row);
      else state.profiles.push(row);
      return ok(row);
    }
    case "getSecuritySupplier":
      return supplierDetail(state, String(data.assetId));
    case "addSecurityDependency": {
      const row = {
        id: randomUUID(),
        from_asset_id: data.fromAssetId,
        to_asset_id: data.toAssetId,
        relation: data.relation,
        confirmed: data.confirmed,
        confirmed_by: data.confirmed ? USER : null,
        last_verified_at: data.confirmed ? now() : null,
      };
      state.dependencies.push(row);
      return ok(row);
    }
    case "addSecuritySupplierContract": {
      const version = state.contracts.filter((c) => c.contract_key === data.contractKey).length + 1;
      const row = {
        id: randomUUID(),
        supplier_asset_id: data.supplierAssetId,
        contract_key: data.contractKey,
        contract_version: version,
        title: data.title,
        document_ref: data.documentRef,
        verified: false,
      };
      state.contracts.push(row);
      return ok(row);
    }
    case "verifySecuritySupplierContract": {
      if (!state.approver) return fail("APPROVER_REQUIRED");
      const c = state.contracts.find((x) => x.id === data.contractId)!;
      c.verified = true;
      return ok(c);
    }
    case "addSecuritySupplierObligation": {
      const row = {
        id: randomUUID(),
        supplier_asset_id: data.supplierAssetId,
        contract_id: data.contractId,
        clause: data.clause,
        basis_note: data.basisNote,
        scope: data.scope,
        expected_result: data.expectedResult,
        verification_method: data.verificationMethod,
        time_rule: data.timeRule,
        response_days: data.responseDays,
        status: "active",
        confirmed: false,
      };
      state.obligations.push(row);
      return ok(row);
    }
    case "changeSecuritySupplierObligation": {
      const o = state.obligations.find((x) => x.id === data.obligationId)!;
      if (data.change === "confirm") {
        if (!state.approver) return fail("APPROVER_REQUIRED");
        o.confirmed = true;
      } else o.status = "retired";
      return ok(o);
    }
    case "createSecuritySupplierRequest": {
      const r: Row = {
        id: randomUUID(),
        workspace_id: WORKSPACE,
        reference: `LB-2026-${String(state.requests.length + 1).padStart(4, "0")}`,
        action_id: data.actionId,
        supplier_asset_id: data.supplierAssetId,
        basis_kind: data.basisKind,
        obligation_id: data.obligationId,
        basis_note: data.basisNote,
        change_decision_id: data.changeDecisionId,
        internal_owner_id: data.internalOwnerId,
        title: data.title,
        task: data.task,
        expected_result: data.expectedResult,
        response_instruction: data.responseInstruction,
        verification_criteria: data.verificationCriteria,
        requested_due: data.requestedDue,
        supplier_proposed_due: null,
        agreed_due: null,
        requires_separate_verifier: data.requiresSeparateVerifier,
        status: "draft",
        cycle: 1,
        share_version: null,
        share_stale: false,
        created_by: USER,
        created_at: now(),
        updated_at: now(),
        version: 1,
      };
      state.requests.push(r);
      event(state, r, "created", null, { reference: r.reference });
      return ok(r);
    }
    case "getSecuritySupplierRequest": {
      const r = req(data.requestId);
      if (!r) return fail("NOT_FOUND");
      const action = state.actions.find((a) => a.id === r.action_id)!;
      const o = state.obligations.find((x) => x.id === r.obligation_id);
      return ok({
        request: r,
        supplier: {
          id: r.supplier_asset_id,
          name: state.assets.find((a) => a.id === r.supplier_asset_id)?.name,
        },
        action: {
          id: action.id,
          title: action.title,
          status: action.status,
          risk: { id: "risk", title: "Sårbarhet i passersystem" },
        },
        impacts: [
          {
            id: "impact",
            asset: "Passersystem",
            category: "systems",
            impact_status: "unconfirmed",
            impact_note: "",
          },
        ],
        obligation: o
          ? { ...o, contract: state.contracts.find((c) => c.id === o.contract_id) ?? null }
          : null,
        shares: state.shares.filter((s) => s.request_id === r.id),
        events: state.events.filter((e) => e.request_id === r.id),
        responses: state.responses.filter((e) => e.request_id === r.id),
        verifications: state.verifications.filter((e) => e.request_id === r.id),
        decisions: state.decisions.filter(
          (d) => d.subject_id === r.id || d.subject_id === r.action_id,
        ),
        sources: [{ id: "src-1", name: "Leverantörens rapport LB-2026-0001" }],
        members,
        siblings: state.requests
          .filter((x) => x.action_id === r.action_id && x.id !== r.id)
          .map((x) => ({ id: x.id, reference: x.reference, status: x.status, title: x.title })),
      });
    }
    case "approveSecuritySupplierShare": {
      const { r, error } = command(data);
      if (error) return error;
      if (!state.share) return fail("SHARE_RIGHT_REQUIRED");
      const from = String(r.status);
      r.share_version = Number(r.share_version ?? 0) + 1;
      r.share_stale = false;
      if (r.status === "draft") r.status = "ready_to_send";
      state.shares.push({
        id: randomUUID(),
        request_id: r.id,
        share_version: r.share_version,
        content: shareContent(state, r),
        recipient: data.recipient,
        purpose: data.purpose,
        approved_by: USER,
        approved_at: now(),
      });
      bump(r);
      event(state, r, "share_approved", from, { shareVersion: r.share_version });
      return ok(r);
    }
    case "recordSecuritySupplierDispatch": {
      const { r, error } = command(data);
      if (error) return error;
      if (!r.share_version || r.share_stale) return fail("APPROVED_SHARE_REQUIRED");
      const from = String(r.status);
      r.status = "awaiting_response";
      bump(r);
      event(state, r, "dispatched", from, {
        channel: data.channel,
        recipient: data.recipient,
        sentAt: data.sentAt,
        shareVersion: r.share_version,
      });
      return ok(r);
    }
    case "recordSecuritySupplierResponse": {
      const { r, error } = command(data);
      if (error) return error;
      const from = String(r.status);
      const resp = {
        id: randomUUID(),
        request_id: r.id,
        cycle: r.cycle,
        seq: state.responses.filter((x) => x.request_id === r.id).length + 1,
        kind: data.kind,
        author_name: data.authorName,
        origin: data.origin,
        body: data.body,
        claimed_done_at: data.claimedDoneAt,
        received_at: data.receivedAt,
        proposed_due: data.proposedDue,
        evidence_source_ids: data.evidenceSourceIds,
        recorded_by: USER,
        recorded_at: now(),
      };
      state.responses.push(resp);
      if (data.kind === "done") r.status = "awaiting_verification";
      else if (data.kind !== "objection" && ["awaiting_response", "needs_revision"].includes(from))
        r.status = "in_progress";
      if (data.proposedDue) r.supplier_proposed_due = data.proposedDue;
      bump(r);
      event(
        state,
        r,
        data.kind === "objection" ? "objection_recorded" : "response_recorded",
        from,
        { kind: data.kind },
      );
      return ok(r);
    }
    case "verifySecuritySupplierResponse": {
      const { r, error } = command(data);
      if (error) return error;
      if (!state.approver) return fail("APPROVER_REQUIRED");
      const from = String(r.status);
      state.verifications.push({
        id: randomUUID(),
        request_id: r.id,
        response_id: data.responseId,
        cycle: r.cycle,
        outcome: data.outcome,
        criteria_checked: data.criteriaChecked,
        checked_evidence: data.checkedEvidence,
        remaining_deviation: data.remainingDeviation,
        verified_by: USER,
        verified_at: now(),
      });
      r.status = data.outcome === "accepted" ? "accepted" : "needs_revision";
      bump(r);
      event(state, r, data.outcome === "accepted" ? "verified" : "needs_revision", from);
      return ok(r);
    }
    case "changeSecuritySupplierDue": {
      const { r, error } = command(data);
      if (error) return error;
      const key = data.which === "agreed" ? "agreed_due" : "requested_due";
      const from = r[key];
      r[key] = data.due;
      bump(r);
      event(state, r, "due_changed", String(r.status), {
        which: data.which,
        from,
        to: data.due,
        reason: data.reason,
      });
      return ok(r);
    }
    case "recordSecurityDecision": {
      if (
        ["accept_risk", "scope_cost", "close_with_deviation"].includes(String(data.decision)) &&
        !state.approver
      )
        return fail("APPROVER_REQUIRED");
      const row = {
        id: randomUUID(),
        subject_kind: data.subjectKind,
        subject_id: data.subjectId,
        decision: data.decision,
        rationale: data.rationale,
        review_at: data.reviewAt,
        amount: data.amount,
        currency: data.currency,
        cost_scope: data.costScope,
        mandate: data.mandate,
        decided_by: USER,
        decided_at: now(),
      };
      state.decisions.push(row);
      return ok(row);
    }
    case "saveSecuritySupplierReview": {
      if (data.reviewId) {
        const r = state.reviews.find((x) => x.id === data.reviewId)!;
        if (data.approve) {
          if (!state.approver) return fail("APPROVER_REQUIRED");
          r.status = "approved";
        }
        return ok(r);
      }
      const row = {
        id: randomUUID(),
        supplier_asset_id: data.supplierAssetId,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        findings: data.findings,
        decisions_text: data.decisionsText,
        requirement_changes: data.requirementChanges,
        next_review_at: data.nextReviewAt,
        status: "draft",
      };
      state.reviews.push(row);
      return ok(row);
    }
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

test("the supplier cycle from a warning to a verified action and a review, in Swedish", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const state = freshState("owner");
  await install(page, state);

  await test.step("The overview shows what needs someone now, filtered by professional view", async () => {
    await go(page);
    const queue = page.getByTestId("sw-work-queue");
    await slow(queue).toBeVisible();
    await expect(queue).toContainText("Försenade åtgärder");
    await expect(queue).toContainText("Bevakningsluckor");
    await queue.getByTestId("sw-view-cyber").click();
    await expect(queue).not.toContainText("Uppdatera reservrutin för entréer");
    await queue.getByTestId("sw-view-security").click();
    await expect(queue).toContainText("Uppdatera reservrutin för entréer");
    await shot(page, "01-overview-queue");
  });

  await test.step("An empty supplier list explains the next step; a supplier is added", async () => {
    await page.getByRole("link", { name: "Leverantörer" }).first().click();
    await slow(page.getByTestId("sw-suppliers")).toBeVisible();
    await expect(page.getByTestId("sw-suppliers")).toContainText(
      "Ingen leverantör registrerad ännu",
    );
    await page
      .getByTestId("sw-add-supplier")
      .getByLabel("Leverantörens namn")
      .fill("Passage Systems AB");
    await page.getByTestId("sw-add-supplier").getByRole("button", { name: "Lägg till" }).click();
    await slow(page.getByTestId("sw-supplier-detail")).toBeVisible();
  });

  await test.step("Relation, contract and requirement: binding only once confirmed", async () => {
    const relation = page.getByTestId("sw-add-relation");
    await relation
      .getByLabel("Skyddsvärde som levereras av denna leverantör")
      .selectOption({ label: "Passersystem" });
    await relation.getByLabel("Jag har bekräftat relationen").check();
    await relation.getByRole("button", { name: "Lägg till relation" }).click();
    await expect(page.getByTestId("sw-relation")).toContainText(
      "Passersystem levereras av Passage Systems AB",
    );
    await page
      .getByTestId("sw-supplier-contracts")
      .locator("summary", { hasText: "Registrera avtal eller ny version" })
      .click();
    const contract = page.getByTestId("sw-add-contract");
    await contract.getByLabel("Avtalsbeteckning").fill("PS-2024-01");
    await contract.getByLabel("Titel").fill("Serviceavtal passersystem");
    await contract.getByRole("button", { name: "Registrera" }).click();
    await page.getByTestId("sw-contract").getByRole("button", { name: "Verifiera" }).click();
    await expect(page.getByTestId("sw-contract")).toHaveAttribute("data-verified", "true");
    await page
      .getByTestId("sw-supplier-obligations")
      .locator("summary", { hasText: "Registrera krav" })
      .click();
    const obligation = page.getByTestId("sw-add-obligation");
    await obligation.getByLabel("Avtal").selectOption({ index: 1 });
    await obligation.getByLabel("Klausul").fill("7.2");
    await obligation.getByLabel("Omfattning").fill("Sårbarheter i levererad firmware");
    await obligation.getByLabel("Förväntat resultat").fill("Påverkansbesked och åtgärdsplan");
    await obligation
      .getByLabel("Hur det verifieras")
      .fill("Skriftligt besked med berörda versioner");
    await obligation.getByLabel("Svarstid (kalenderdagar)").fill("5");
    await obligation.getByRole("button", { name: "Registrera krav" }).click();
    await expect(page.getByTestId("sw-obligation")).toHaveAttribute("data-confirmed", "false");
    await page.getByTestId("sw-obligation").getByRole("button", { name: "Bekräfta krav" }).click();
    await expect(page.getByTestId("sw-obligation")).toHaveAttribute("data-confirmed", "true");
    await shot(page, "02-supplier-contract-requirement");
  });

  await test.step("A request on the existing action, with the contract as basis", async () => {
    await page.getByTestId("sw-new-request-open").click();
    const form = page.getByTestId("sw-new-request");
    await form.getByLabel("Åtgärd").selectOption({ label: "Säkra passersystemet" });
    await form.getByLabel("Kravgrund").selectOption("contract_obligation");
    await form.getByLabel("Bekräftat krav").selectOption({ index: 1 });
    await form.getByLabel("Rubrik (delas)").fill("Påverkan av firmwarevarning");
    await form
      .getByLabel("Uppgift (delas)")
      .fill("Bekräfta om version 4.2 på våra kontor berörs och lämna en åtgärdsplan.");
    await form.getByLabel("Förväntat resultat (delas)").fill("Påverkansbesked och daterad plan");
    await form
      .getByLabel("Verifieringskriterier (internt)")
      .fill("INTERNT: versioner listade; plan daterad");
    await form.getByRole("button", { name: "Skapa utkast" }).click();
    await slow(page.getByTestId("sw-supplier-request")).toHaveAttribute("data-status", "draft");
    await expect(page.getByTestId("sw-request-now")).toHaveAttribute("data-step", "approve_share");
    expect(state.actions).toHaveLength(1);
  });

  await test.step("The approved external version is exact and minimised; then the dispatch is recorded", async () => {
    const approve = page.getByTestId("sw-approve-share");
    await approve.getByLabel("Mottagare").fill("Passage Systems support");
    await approve.getByLabel("Ändamål").fill("Påverkansbesked");
    await approve.getByRole("button", { name: "Godkänn extern version" }).click();
    await expect(page.getByTestId("sw-supplier-request")).toHaveAttribute(
      "data-status",
      "ready_to_send",
    );
    const preview = page.getByTestId("sw-share-preview");
    await expect(preview).toContainText("Referens: LB-2026-0001");
    await expect(preview).toContainText("punkt 7.2");
    await expect(preview).not.toContainText("INTERNT");
    await shot(page, "03-approved-external-version");
    const dispatch = page.getByTestId("sw-record-dispatch");
    await dispatch.getByLabel("Skickat till").fill("support@passage.example.test");
    await dispatch.getByRole("button", { name: "Registrera utskick" }).click();
    await expect(page.getByTestId("sw-supplier-request")).toHaveAttribute(
      "data-status",
      "awaiting_response",
    );
  });

  await test.step("An insufficient answer is not accepted: a revision is requested", async () => {
    const response = page.getByTestId("sw-record-response");
    await response.getByLabel("Typ av svar").selectOption("done");
    await response.getByLabel("Avsändare enligt svaret").fill("J. Berg, Passage Systems");
    await response.getByLabel("Vad leverantören svarade").fill("Vi har uppgraderat.");
    await expect(response).toContainText("”Klart” avslutar ingenting");
    await response.getByRole("button", { name: "Registrera svar" }).click();
    await expect(page.getByTestId("sw-supplier-request")).toHaveAttribute(
      "data-status",
      "awaiting_verification",
    );
    const verify = page.getByTestId("sw-verify");
    await verify
      .getByLabel("Vad du kontrollerade mot kriterierna")
      .fill("Inga versioner, ingen daterad plan");
    await verify.getByTestId("sw-verify-revise").click();
    await expect(page.getByTestId("sw-supplier-request")).toHaveAttribute(
      "data-status",
      "needs_revision",
    );
    await expect(page.getByTestId("sw-verification")).toHaveAttribute(
      "data-outcome",
      "needs_revision",
    );
  });

  await test.step("An objection on contract scope leads to a documented scope and cost decision", async () => {
    const response = page.getByTestId("sw-record-response");
    await response.getByLabel("Typ av svar").selectOption("objection");
    await response.getByLabel("Avsändare enligt svaret").fill("J. Berg, Passage Systems");
    await response
      .getByLabel("Vad leverantören svarade")
      .fill("Uppgradering till 4.3 ingår inte i avtalet.");
    await response.getByLabel("Leverantörens föreslagna datum").fill(day(20));
    await response.getByRole("button", { name: "Registrera svar" }).click();
    await expect(page.getByTestId("sw-response").last()).toHaveAttribute("data-kind", "objection");
    await expect(page.getByTestId("sw-request-dates")).toContainText(day(20));
    const decision = page.getByTestId("sw-decision-form");
    await decision.getByLabel("Beslut").selectOption("scope_cost");
    await decision
      .getByLabel("Motivering")
      .fill("Uppgraderingen ligger utanför avtalet; beställs separat");
    await decision.getByLabel("Belopp").fill("48000");
    await decision.getByLabel("Omfattning").fill("Uppgradering 4.3, båda kontoren");
    await decision.getByLabel("Mandat").fill("CFO-mandat 2026-11");
    await decision.getByRole("button", { name: "Dokumentera beslut" }).click();
    await expect(page.getByTestId("sw-decision")).toHaveAttribute("data-decision", "scope_cost");
    await decision.getByLabel("Beslut").selectOption("temporary_protection");
    await decision.getByLabel("Motivering").fill("Vakt vid entréerna tills verifierat");
    await decision.getByRole("button", { name: "Dokumentera beslut" }).click();
    await expect(page.getByTestId("sw-decision")).toHaveCount(2);
    await page
      .getByTestId("sw-request-dates")
      .locator("summary", { hasText: "Ändra datum" })
      .click();
    const changeDue = page.getByTestId("sw-change-due");
    await changeDue.getByLabel("Motivering").fill("Överenskommet per telefon");
    await changeDue.getByRole("button", { name: "Spara datum" }).click();
    await expect(page.getByTestId("sw-request-dates")).not.toContainText("inte överenskommet");
    await expect(page.getByTestId("sw-request-history")).toContainText("Datum ändrat");
    await shot(page, "04-objection-and-decisions");
  });

  await test.step("A new answer with evidence is verified and accepted", async () => {
    const response = page.getByTestId("sw-record-response");
    await response.getByLabel("Typ av svar").selectOption("done");
    await response.getByLabel("Avsändare enligt svaret").fill("J. Berg, Passage Systems");
    await response
      .getByLabel("Vad leverantören svarade")
      .fill("4.2 berörs på båda kontoren; patch 4.2.7 installerad; rapport bifogad.");
    await response.getByLabel("Bifogat underlag").selectOption("src-1");
    await response.getByRole("button", { name: "Registrera svar" }).click();
    const verify = page.getByTestId("sw-verify");
    await verify
      .getByLabel("Vad du kontrollerade mot kriterierna")
      .fill("Versioner listade; patch kontrollerad på plats");
    await verify.getByTestId("sw-verify-accept").click();
    await expect(page.getByTestId("sw-supplier-request")).toHaveAttribute(
      "data-status",
      "accepted",
    );
    await expect(page.getByTestId("sw-request-now")).toHaveAttribute("data-step", "done");
    await expect(page.getByTestId("sw-request-times")).toContainText("Er verifiering");
    await shot(page, "05-verified");
  });

  await test.step("The supplier page shows follow-up with denominators and a review", async () => {
    await page.getByRole("link", { name: "← Passage Systems AB" }).click();
    const figures = page.getByTestId("sw-supplier-figures").first();
    await slow(figures).toBeVisible();
    await expect(figures).toContainText("Godkänt vid första verifieringen");
    await expect(figures).toContainText("0/1");
    await page
      .getByTestId("sw-supplier-reviews")
      .locator("summary", { hasText: "Ny avstämning" })
      .click();
    const review = page.getByTestId("sw-add-review");
    await review
      .getByLabel("Iakttagelser och återkommande brister")
      .fill("Första svaret saknade underlag; omfattningsfråga om uppgraderingar");
    await review.getByRole("button", { name: "Spara avstämning" }).click();
    await expect(page.getByTestId("sw-review")).toHaveAttribute("data-status", "draft");
    await page.getByTestId("sw-review").getByRole("button", { name: "Godkänn avstämning" }).click();
    await expect(page.getByTestId("sw-review")).toHaveAttribute("data-status", "approved");
    await shot(page, "06-supplier-follow-up");
  });
});

test("an editor without sharing or approval rights is told who must act, in English", async ({
  page,
}) => {
  const state = freshState("editor");
  const supplier = randomUUID();
  state.assets.push({
    id: supplier,
    name: "Passage Systems AB",
    category: "suppliers",
    status: "active",
  });
  state.profiles.push({
    asset_id: supplier,
    internal_owner_id: USER,
    contact_route: "",
    services: "",
    status: "active",
  });
  const request = handle(state, "createSecuritySupplierRequest", {
    actionId: state.actions[0].id,
    supplierAssetId: supplier,
    basisKind: "information",
    obligationId: null,
    basisNote: "",
    changeDecisionId: null,
    internalOwnerId: USER,
    title: "Spare readers",
    task: "Confirm stock",
    expectedResult: "Stock figure",
    responseInstruction: "",
    verificationCriteria: "Figure given",
    requestedDue: day(5),
    requiresSeparateVerifier: false,
  }) as { data: Row };
  await install(page, state, "en");
  await go(page, `/supplier-requests/${request.data.id}`);
  await slow(page.getByTestId("sw-supplier-request")).toBeVisible();
  await expect(page.getByTestId("sw-share-right-missing")).toContainText(
    "Only someone with the external sharing right",
  );
  await expect(page.getByTestId("sw-approve-share")).toHaveCount(0);
  // Approved by someone with the right, then sent and answered: verification needs an approver.
  state.share = true;
  handle(state, "approveSecuritySupplierShare", {
    requestId: request.data.id,
    version: 1,
    recipient: "x",
    purpose: "y",
  });
  state.share = false;
  handle(state, "recordSecuritySupplierDispatch", {
    requestId: request.data.id,
    version: 2,
    channel: "email",
    recipient: "x",
    sentAt: now(),
  });
  handle(state, "recordSecuritySupplierResponse", {
    requestId: request.data.id,
    version: 3,
    kind: "done",
    authorName: "Supplier",
    origin: "email",
    body: "Four in stock.",
    receivedAt: now(),
    claimedDoneAt: null,
    proposedDue: null,
    evidenceSourceIds: [],
  });
  await page.reload();
  await slow(page.getByTestId("sw-supplier-request")).toHaveAttribute(
    "data-status",
    "awaiting_verification",
  );
  await expect(page.getByTestId("sw-verifier-missing")).toContainText(
    "Verification needs the approval right",
  );
  await expect(page.getByTestId("sw-verify")).toHaveCount(0);
  await shot(page, "07-editor-told-who-acts-en");
});

test("a request that does not exist or is out of reach answers the same way", async ({ page }) => {
  await install(page, freshState("owner"));
  await go(page, `/supplier-requests/${UNKNOWN}`);
  await slow(page.getByTestId("sw-request-missing")).toBeVisible();
  await expect(page.getByTestId("sw-request-missing")).toContainText(
    "finns inte eller är inte tillgänglig",
  );
});

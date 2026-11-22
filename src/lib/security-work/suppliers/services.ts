/**
 * The supplier cycle over the caller's own client: everything read is what
 * row-level security lets this person see, and every lifecycle change is one
 * database command (20270330090000) that checks the right, the version, the
 * state and the basis. Nothing here can widen access or skip a step.
 */
import type { Database, Json } from "@/integrations/supabase/types";
import { AnalysisFailure, checked } from "../analysis-services";
import { coverage } from "../knowledge/coverage";
import { requireWorkspace, type SecurityWorkCaller } from "../services";
import type * as inputs from "./inputs";
import { dueDate, isOpen, sortQueue, supplierOverdue, type QueueItem } from "./model";

type Tables = Database["public"]["Tables"];
export type SupplierProfile = Tables["sw_supplier_profiles"]["Row"];
export type SupplierRequest = Tables["sw_supplier_requests"]["Row"];
export type SupplierEvent = Tables["sw_supplier_request_events"]["Row"];
export type SupplierShare = Tables["sw_supplier_request_shares"]["Row"];
export type SupplierResponse = Tables["sw_supplier_responses"]["Row"];
export type SupplierVerification = Tables["sw_supplier_verifications"]["Row"];
export type SupplierContract = Tables["sw_supplier_contracts"]["Row"];
export type SupplierObligation = Tables["sw_supplier_obligations"]["Row"];
export type SupplierReview = Tables["sw_supplier_reviews"]["Row"];
export type Decision = Tables["sw_decisions"]["Row"];
export type Dependency = Tables["sw_asset_dependencies"]["Row"];
type Asset = Pick<Tables["sw_protected_assets"]["Row"], "id" | "name" | "category" | "status">;
export interface Member {
  user_id: string;
  role: string;
  can_approve: boolean;
  can_share_external: boolean;
  label: string;
}

const LIMIT = 500;
const all = <T>(rows: T[] | null) => rows ?? [];

async function access(caller: SecurityWorkCaller, workspaceId: string, edit = false) {
  try {
    return await requireWorkspace(caller, workspaceId, edit);
  } catch (error) {
    throw new AnalysisFailure(
      error instanceof Error && "code" in error && error.code === "ACCESS_DENIED"
        ? "ACCESS_DENIED"
        : "SAVE_FAILED",
    );
  }
}

async function members(caller: SecurityWorkCaller, workspaceId: string): Promise<Member[]> {
  const rows = all(
    checked(
      await caller.supabase.rpc("sw_list_members", { _workspace_id: workspaceId }).limit(LIMIT),
    ) as unknown as
      | {
          user_id: string;
          role: string;
          can_approve: boolean;
          active: boolean;
          email: string;
        }[]
      | null,
  );
  const rights = new Map(
    all(
      checked(
        await caller.supabase
          .from("sw_workspace_memberships")
          .select("user_id,can_share_external")
          .eq("workspace_id", workspaceId)
          .eq("active", true)
          .limit(LIMIT),
      ),
    ).map((m) => [m.user_id, m.can_share_external]),
  );
  return rows
    .filter((m) => m.active)
    .map((m) => ({
      user_id: m.user_id,
      role: m.role,
      can_approve: m.can_approve,
      can_share_external: rights.get(m.user_id) ?? false,
      label: m.email || m.user_id.slice(0, 8),
    }));
}

async function assets(caller: SecurityWorkCaller, workspaceId: string): Promise<Asset[]> {
  return all(
    checked(
      await caller.supabase
        .from("sw_protected_assets")
        .select("id,name,category,status")
        .eq("workspace_id", workspaceId)
        .order("name")
        .limit(LIMIT),
    ),
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
export interface SupplierSummary {
  asset: Asset;
  profile: SupplierProfile | null;
  open: number;
  overdue: number;
  awaitingVerification: number;
  objections: number;
}
export interface SuppliersOverview {
  suppliers: SupplierSummary[];
  members: Member[];
  openActions: { id: string; title: string; status: string; asset_id: string | null }[];
  requests: SupplierRequest[];
}

export async function readSuppliers(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<SuppliersOverview> {
  await access(caller, workspaceId);
  const db = caller.supabase;
  const [assetRows, profiles, requests, events, people, actions] = await Promise.all([
    assets(caller, workspaceId),
    db.from("sw_supplier_profiles").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db.from("sw_supplier_requests").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
    db
      .from("sw_supplier_request_events")
      .select("request_id,event,created_at")
      .eq("workspace_id", workspaceId)
      .eq("event", "objection_recorded")
      .limit(LIMIT),
    members(caller, workspaceId),
    db
      .from("sw_actions")
      .select("id,title,status,asset_id")
      .eq("workspace_id", workspaceId)
      .in("status", ["open", "in_progress", "blocked"])
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);
  const profileRows = all(checked(profiles));
  const requestRows = all(checked(requests));
  const objections = all(checked(events));
  const today = new Date().toISOString().slice(0, 10);
  return {
    suppliers: assetRows
      .filter((a) => a.category === "suppliers")
      .map((asset) => {
        const mine = requestRows.filter((r) => r.supplier_asset_id === asset.id);
        return {
          asset,
          profile: profileRows.find((p) => p.asset_id === asset.id) ?? null,
          open: mine.filter((r) => isOpen(r.status)).length,
          overdue: mine.filter((r) => supplierOverdue(r, today)).length,
          awaitingVerification: mine.filter((r) => r.status === "awaiting_verification").length,
          objections: objections.filter((o) => mine.some((r) => r.id === o.request_id)).length,
        };
      }),
    members: people,
    openActions: all(checked(actions)),
    requests: requestRows,
  };
}

// ── One supplier ────────────────────────────────────────────────────────────
export interface SupplierDetail {
  asset: Asset;
  profile: SupplierProfile | null;
  assets: Asset[];
  dependencies: Dependency[];
  contracts: SupplierContract[];
  obligations: SupplierObligation[];
  requests: SupplierRequest[];
  events: SupplierEvent[];
  responses: SupplierResponse[];
  verifications: SupplierVerification[];
  reviews: SupplierReview[];
  members: Member[];
  openActions: { id: string; title: string; status: string; asset_id: string | null }[];
  decisions: Decision[];
}

export async function getSupplier(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; assetId: string },
): Promise<SupplierDetail> {
  await access(caller, data.workspaceId);
  const db = caller.supabase;
  const ws = data.workspaceId;
  const assetRows = await assets(caller, ws);
  const asset = assetRows.find((a) => a.id === data.assetId && a.category === "suppliers");
  if (!asset) throw new AnalysisFailure("ACCESS_DENIED");
  const [profile, deps, contracts, obligations, requests, reviews, people, actions] =
    await Promise.all([
      db
        .from("sw_supplier_profiles")
        .select("*")
        .eq("workspace_id", ws)
        .eq("asset_id", asset.id)
        .maybeSingle(),
      db
        .from("sw_asset_dependencies")
        .select("*")
        .eq("workspace_id", ws)
        .or(`from_asset_id.eq.${asset.id},to_asset_id.eq.${asset.id}`)
        .limit(LIMIT),
      db
        .from("sw_supplier_contracts")
        .select("*")
        .eq("workspace_id", ws)
        .eq("supplier_asset_id", asset.id)
        .order("contract_key")
        .order("contract_version", { ascending: false })
        .limit(LIMIT),
      db
        .from("sw_supplier_obligations")
        .select("*")
        .eq("workspace_id", ws)
        .eq("supplier_asset_id", asset.id)
        .order("created_at")
        .limit(LIMIT),
      db
        .from("sw_supplier_requests")
        .select("*")
        .eq("workspace_id", ws)
        .eq("supplier_asset_id", asset.id)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      db
        .from("sw_supplier_reviews")
        .select("*")
        .eq("workspace_id", ws)
        .eq("supplier_asset_id", asset.id)
        .order("period_end", { ascending: false })
        .limit(LIMIT),
      members(caller, ws),
      db
        .from("sw_actions")
        .select("id,title,status,asset_id")
        .eq("workspace_id", ws)
        .in("status", ["open", "in_progress", "blocked"])
        .order("created_at", { ascending: false })
        .limit(LIMIT),
    ]);
  const requestRows = all(checked(requests));
  const ids = requestRows.map((r) => r.id);
  const history = ids.length
    ? await Promise.all([
        db
          .from("sw_supplier_request_events")
          .select("*")
          .eq("workspace_id", ws)
          .in("request_id", ids)
          .limit(LIMIT * 4),
        db
          .from("sw_supplier_responses")
          .select("*")
          .eq("workspace_id", ws)
          .in("request_id", ids)
          .limit(LIMIT * 2),
        db
          .from("sw_supplier_verifications")
          .select("*")
          .eq("workspace_id", ws)
          .in("request_id", ids)
          .limit(LIMIT * 2),
        db
          .from("sw_decisions")
          .select("*")
          .eq("workspace_id", ws)
          .eq("subject_kind", "supplier_request")
          .in("subject_id", ids)
          .order("decided_at")
          .limit(LIMIT),
      ])
    : null;
  return {
    asset,
    profile: checked(profile),
    assets: assetRows,
    dependencies: all(checked(deps)),
    contracts: all(checked(contracts)),
    obligations: all(checked(obligations)),
    requests: requestRows,
    events: history ? all(checked(history[0])) : [],
    responses: history ? all(checked(history[1])) : [],
    verifications: history ? all(checked(history[2])) : [],
    decisions: history ? all(checked(history[3])) : [],
    reviews: all(checked(reviews)),
    members: people,
    openActions: all(checked(actions)),
  };
}

export async function saveProfile(
  caller: SecurityWorkCaller,
  data: inputs.SaveProfileInput,
): Promise<SupplierProfile> {
  await access(caller, data.workspaceId, true);
  const db = caller.supabase;
  let assetId = data.assetId;
  if (!assetId) {
    const created = checked(
      await db
        .from("sw_protected_assets")
        .insert({
          workspace_id: data.workspaceId,
          name: data.name,
          category: "suppliers",
          created_by: caller.userId,
        })
        .select("id")
        .single(),
    );
    if (!created) throw new AnalysisFailure("SAVE_FAILED");
    assetId = created.id;
  }
  const existing = checked(
    await db
      .from("sw_supplier_profiles")
      .select("asset_id")
      .eq("workspace_id", data.workspaceId)
      .eq("asset_id", assetId)
      .maybeSingle(),
  );
  const fields = {
    internal_owner_id: data.internalOwnerId,
    contact_route: data.contactRoute,
    services: data.services,
    status: data.status,
  };
  const saved = existing
    ? checked(
        await db
          .from("sw_supplier_profiles")
          .update(fields)
          .eq("workspace_id", data.workspaceId)
          .eq("asset_id", assetId)
          .select("*")
          .single(),
      )
    : checked(
        await db
          .from("sw_supplier_profiles")
          .insert({
            workspace_id: data.workspaceId,
            asset_id: assetId,
            created_by: caller.userId,
            ...fields,
          })
          .select("*")
          .single(),
      );
  if (!saved) throw new AnalysisFailure("SAVE_FAILED");
  return saved;
}

export async function addDependency(caller: SecurityWorkCaller, data: inputs.DependencyInput) {
  await access(caller, data.workspaceId, true);
  return checked(
    await caller.supabase
      .from("sw_asset_dependencies")
      .insert({
        workspace_id: data.workspaceId,
        from_asset_id: data.fromAssetId,
        to_asset_id: data.toAssetId,
        relation: data.relation,
        source_note: data.sourceNote,
        confirmed: data.confirmed,
        created_by: caller.userId,
      })
      .select("*")
      .single(),
  );
}
export async function changeDependency(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; dependencyId: string; confirmed?: boolean },
) {
  await access(caller, data.workspaceId, true);
  const db = caller.supabase;
  if (data.confirmed === undefined) {
    checked(
      await db
        .from("sw_asset_dependencies")
        .delete()
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.dependencyId),
    );
    return null;
  }
  // Confirming again re-verifies it today; the database stamps who and when.
  return checked(
    await db
      .from("sw_asset_dependencies")
      .update({ confirmed: data.confirmed, last_verified_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.dependencyId)
      .select("*")
      .single(),
  );
}

export async function addContract(caller: SecurityWorkCaller, data: inputs.ContractInput) {
  await access(caller, data.workspaceId, true);
  return checked(
    await caller.supabase
      .from("sw_supplier_contracts")
      .insert({
        workspace_id: data.workspaceId,
        supplier_asset_id: data.supplierAssetId,
        contract_key: data.contractKey,
        title: data.title,
        valid_from: data.validFrom,
        valid_to: data.validTo,
        document_ref: data.documentRef,
        summary: data.summary,
        created_by: caller.userId,
      } as Tables["sw_supplier_contracts"]["Insert"])
      .select("*")
      .single(),
  );
}
export async function verifyContract(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; contractId: string },
) {
  // The update policy filters silently; say plainly who may verify.
  const membership = await access(caller, data.workspaceId, true);
  if (!membership.can_approve) throw new AnalysisFailure("APPROVER_REQUIRED");
  return checked(
    await caller.supabase
      .from("sw_supplier_contracts")
      .update({ verified: true })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.contractId)
      .select("*")
      .single(),
  );
}

export async function addObligation(caller: SecurityWorkCaller, data: inputs.ObligationInput) {
  await access(caller, data.workspaceId, true);
  return checked(
    await caller.supabase
      .from("sw_supplier_obligations")
      .insert({
        workspace_id: data.workspaceId,
        supplier_asset_id: data.supplierAssetId,
        contract_id: data.contractId,
        clause: data.clause,
        basis_note: data.basisNote,
        scope: data.scope,
        expected_result: data.expectedResult,
        verification_method: data.verificationMethod,
        time_rule: data.timeRule,
        response_days: data.responseDays,
        completion_days: data.completionDays,
        created_by: caller.userId,
      })
      .select("*")
      .single(),
  );
}
export async function changeObligation(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; obligationId: string; change: "confirm" | "retire" },
) {
  await access(caller, data.workspaceId, true);
  return checked(
    await caller.supabase
      .from("sw_supplier_obligations")
      .update(data.change === "confirm" ? { confirmed: true } : { status: "retired" })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.obligationId)
      .select("*")
      .single(),
  );
}

// ── One request ─────────────────────────────────────────────────────────────
export interface RequestDetail {
  request: SupplierRequest;
  supplier: { id: string; name: string } | null;
  action: {
    id: string;
    title: string;
    status: string;
    risk: { id: string; title: string } | null;
  } | null;
  impacts: {
    id: string;
    asset: string;
    category: string | null;
    impact_status: string;
    impact_note: string;
  }[];
  obligation: (SupplierObligation & { contract: SupplierContract | null }) | null;
  shares: SupplierShare[];
  events: SupplierEvent[];
  responses: SupplierResponse[];
  verifications: SupplierVerification[];
  decisions: Decision[];
  sources: { id: string; name: string }[];
  members: Member[];
  siblings: { id: string; reference: string; status: string; title: string }[];
}

/** A request out of reach answers exactly like one that does not exist. */
export async function getRequest(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; requestId: string },
): Promise<RequestDetail> {
  await access(caller, data.workspaceId);
  const db = caller.supabase;
  const ws = data.workspaceId;
  const request = checked(
    await db
      .from("sw_supplier_requests")
      .select("*")
      .eq("workspace_id", ws)
      .eq("id", data.requestId)
      .maybeSingle(),
  );
  if (!request) throw new AnalysisFailure("NOT_FOUND");
  const [
    supplier,
    action,
    shares,
    events,
    responses,
    verifications,
    decisions,
    sources,
    people,
    siblings,
  ] = await Promise.all([
    db
      .from("sw_protected_assets")
      .select("id,name")
      .eq("workspace_id", ws)
      .eq("id", request.supplier_asset_id)
      .maybeSingle(),
    db
      .from("sw_actions")
      .select("id,title,status,risk_id")
      .eq("workspace_id", ws)
      .eq("id", request.action_id)
      .maybeSingle(),
    db
      .from("sw_supplier_request_shares")
      .select("*")
      .eq("workspace_id", ws)
      .eq("request_id", request.id)
      .order("share_version"),
    db
      .from("sw_supplier_request_events")
      .select("*")
      .eq("workspace_id", ws)
      .eq("request_id", request.id)
      .order("created_at"),
    db
      .from("sw_supplier_responses")
      .select("*")
      .eq("workspace_id", ws)
      .eq("request_id", request.id)
      .order("seq"),
    db
      .from("sw_supplier_verifications")
      .select("*")
      .eq("workspace_id", ws)
      .eq("request_id", request.id)
      .order("verified_at"),
    db
      .from("sw_decisions")
      .select("*")
      .eq("workspace_id", ws)
      .or(
        `and(subject_kind.eq.supplier_request,subject_id.eq.${request.id}),and(subject_kind.eq.action,subject_id.eq.${request.action_id})`,
      )
      .order("decided_at"),
    db
      .from("sw_sources")
      .select("id,name")
      .eq("workspace_id", ws)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(100),
    members(caller, ws),
    db
      .from("sw_supplier_requests")
      .select("id,reference,status,title")
      .eq("workspace_id", ws)
      .eq("action_id", request.action_id)
      .neq("id", request.id),
  ]);
  const actionRow = checked(action);
  const risk = actionRow?.risk_id
    ? checked(
        await db
          .from("sw_risks")
          .select("id,title")
          .eq("workspace_id", ws)
          .eq("id", actionRow.risk_id)
          .maybeSingle(),
      )
    : null;
  const impactRows = actionRow?.risk_id
    ? all(
        checked(
          await db
            .from("sw_risk_assets")
            .select("id,asset_id,impact_status,impact_note")
            .eq("workspace_id", ws)
            .eq("risk_id", actionRow.risk_id),
        ),
      )
    : [];
  const assetRows = impactRows.length ? await assets(caller, ws) : [];
  const obligation = request.obligation_id
    ? checked(
        await db
          .from("sw_supplier_obligations")
          .select("*")
          .eq("workspace_id", ws)
          .eq("id", request.obligation_id)
          .maybeSingle(),
      )
    : null;
  const contract = obligation?.contract_id
    ? checked(
        await db
          .from("sw_supplier_contracts")
          .select("*")
          .eq("workspace_id", ws)
          .eq("id", obligation.contract_id)
          .maybeSingle(),
      )
    : null;
  return {
    request,
    supplier: checked(supplier),
    action: actionRow
      ? { id: actionRow.id, title: actionRow.title, status: actionRow.status, risk }
      : null,
    impacts: impactRows.map((i) => {
      const a = assetRows.find((x) => x.id === i.asset_id);
      return {
        id: i.id,
        asset: a?.name ?? "",
        category: a?.category ?? null,
        impact_status: i.impact_status,
        impact_note: i.impact_note,
      };
    }),
    obligation: obligation ? { ...obligation, contract } : null,
    shares: all(checked(shares)),
    events: all(checked(events)),
    responses: all(checked(responses)),
    verifications: all(checked(verifications)),
    decisions: all(checked(decisions)),
    sources: all(checked(sources)),
    members: people,
    siblings: all(checked(siblings)),
  };
}

// ── Commands: one database command each ─────────────────────────────────────
type CommandResult = Promise<SupplierRequest>;
const one = (row: SupplierRequest | null) => {
  if (!row) throw new AnalysisFailure("SAVE_FAILED");
  return row;
};

export async function createRequest(
  caller: SecurityWorkCaller,
  data: inputs.CreateRequestInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  const fields = {
    actionId: data.actionId,
    supplierAssetId: data.supplierAssetId,
    basisKind: data.basisKind,
    obligationId: data.obligationId,
    basisNote: data.basisNote,
    changeDecisionId: data.changeDecisionId,
    internalOwnerId: data.internalOwnerId,
    title: data.title,
    task: data.task,
    expectedResult: data.expectedResult,
    responseInstruction: data.responseInstruction,
    verificationCriteria: data.verificationCriteria,
    requestedDue: data.requestedDue,
    requiresSeparateVerifier: data.requiresSeparateVerifier,
  };
  return one(
    checked(
      await caller.supabase.rpc("sw_save_supplier_request", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: null as unknown as string,
        _expected_version: null as unknown as number,
        _fields: fields as unknown as Json,
      }),
    ),
  );
}
export async function updateRequest(
  caller: SecurityWorkCaller,
  data: inputs.UpdateRequestInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_save_supplier_request", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _fields: {
          title: data.title,
          task: data.task,
          expectedResult: data.expectedResult,
          responseInstruction: data.responseInstruction,
          verificationCriteria: data.verificationCriteria,
          internalOwnerId: data.internalOwnerId,
          requiresSeparateVerifier: data.requiresSeparateVerifier,
        } as unknown as Json,
      }),
    ),
  );
}
export async function approveShare(
  caller: SecurityWorkCaller,
  data: inputs.ApproveShareInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_approve_supplier_share", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _recipient: data.recipient,
        _purpose: data.purpose,
      }),
    ),
  );
}
export async function recordDispatch(
  caller: SecurityWorkCaller,
  data: inputs.DispatchInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_record_supplier_dispatch", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _channel: data.channel,
        _recipient: data.recipient,
        _sent_at: data.sentAt,
      }),
    ),
  );
}
export async function recordResponse(
  caller: SecurityWorkCaller,
  data: inputs.ResponseInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_record_supplier_response", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _response: {
          kind: data.kind,
          authorName: data.authorName,
          origin: data.origin,
          body: data.body,
          claimedDoneAt: data.claimedDoneAt,
          receivedAt: data.receivedAt,
          proposedDue: data.proposedDue,
          evidenceSourceIds: data.evidenceSourceIds,
        } as unknown as Json,
      }),
    ),
  );
}
export async function verifyResponse(
  caller: SecurityWorkCaller,
  data: inputs.VerifyInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_verify_supplier_response", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _response_id: data.responseId,
        _outcome: data.outcome,
        _criteria_checked: data.criteriaChecked,
        _checked_evidence: data.checkedEvidence,
        _remaining_deviation: data.remainingDeviation,
      }),
    ),
  );
}
export async function reopenRequest(
  caller: SecurityWorkCaller,
  data: inputs.ReasonInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_reopen_supplier_request", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _reason: data.reason,
      }),
    ),
  );
}
export async function withdrawRequest(
  caller: SecurityWorkCaller,
  data: inputs.ReasonInput,
): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_withdraw_supplier_request", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _reason: data.reason,
      }),
    ),
  );
}
export async function changeDue(caller: SecurityWorkCaller, data: inputs.DueInput): CommandResult {
  await access(caller, data.workspaceId, true);
  return one(
    checked(
      await caller.supabase.rpc("sw_change_supplier_due", {
        _workspace_id: data.workspaceId,
        _operation_id: data.operationId,
        _request_id: data.requestId,
        _expected_version: data.version,
        _which: data.which,
        _due: data.due as string,
        _reason: data.reason,
      }),
    ),
  );
}

export async function recordDecision(
  caller: SecurityWorkCaller,
  data: inputs.DecisionInput,
): Promise<Decision> {
  await access(caller, data.workspaceId, true);
  const saved = checked(
    await caller.supabase
      .from("sw_decisions")
      .insert({
        workspace_id: data.workspaceId,
        subject_kind: data.subjectKind,
        subject_id: data.subjectId,
        decision: data.decision,
        rationale: data.rationale,
        review_at: data.reviewAt,
        amount: data.amount,
        currency: data.currency,
        cost_scope: data.costScope,
        mandate: data.mandate,
      } as Tables["sw_decisions"]["Insert"])
      .select("*")
      .single(),
  );
  if (!saved) throw new AnalysisFailure("SAVE_FAILED");
  return saved;
}
export async function listDecisions(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; subjectKind: string; subjectId: string },
): Promise<Decision[]> {
  await access(caller, data.workspaceId);
  return all(
    checked(
      await caller.supabase
        .from("sw_decisions")
        .select("*")
        .eq("workspace_id", data.workspaceId)
        .eq("subject_kind", data.subjectKind)
        .eq("subject_id", data.subjectId)
        .order("decided_at"),
    ),
  );
}

export async function setImpact(caller: SecurityWorkCaller, data: inputs.ImpactInput) {
  await access(caller, data.workspaceId, true);
  return checked(
    await caller.supabase.rpc("sw_set_asset_impact", {
      _workspace_id: data.workspaceId,
      _link_id: data.linkId,
      _status: data.status,
      _note: data.note,
    }),
  );
}

export async function setSharing(
  caller: SecurityWorkCaller,
  data: { workspaceId: string; userId: string; allowed: boolean },
) {
  await access(caller, data.workspaceId, true);
  return checked(
    await caller.supabase.rpc("sw_set_member_sharing", {
      _workspace_id: data.workspaceId,
      _user_id: data.userId,
      _allowed: data.allowed,
    }),
  );
}

export async function saveReview(
  caller: SecurityWorkCaller,
  data: inputs.ReviewInput,
): Promise<SupplierReview> {
  await access(caller, data.workspaceId, true);
  const db = caller.supabase;
  const fields = {
    findings: data.findings,
    decisions_text: data.decisionsText,
    requirement_changes: data.requirementChanges,
    next_review_at: data.nextReviewAt,
  };
  let row: SupplierReview | null;
  if (data.reviewId) {
    row = checked(
      await db
        .from("sw_supplier_reviews")
        .update({ ...fields, ...(data.approve ? { status: "approved" } : {}) })
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.reviewId)
        .select("*")
        .maybeSingle(),
    );
  } else {
    row = checked(
      await db
        .from("sw_supplier_reviews")
        .insert({
          workspace_id: data.workspaceId,
          supplier_asset_id: data.supplierAssetId,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          created_by: caller.userId,
          ...fields,
        })
        .select("*")
        .single(),
    );
  }
  if (!row) throw new AnalysisFailure("CONFLICT");
  return row;
}

// ── The overview's work queue ───────────────────────────────────────────────
/**
 * What needs someone now, in the plan's order. Built only from rows this
 * person may read, so a count never reveals a record they cannot see.
 */
export async function readWorkQueue(
  caller: SecurityWorkCaller,
  workspaceId: string,
): Promise<{ items: QueueItem[]; generatedAt: string }> {
  const membership = await access(caller, workspaceId);
  const db = caller.supabase;
  const today = new Date().toISOString().slice(0, 10);
  const [items, briefs, requests, actions, sources, assetRows, objections, decisions] =
    await Promise.all([
      db
        .from("sw_intelligence_items")
        .select("id,title,created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .limit(100),
      db
        .from("sw_change_briefs")
        .select("id,title,status")
        .eq("workspace_id", workspaceId)
        .eq("status", "in_review")
        .limit(100),
      db.from("sw_supplier_requests").select("*").eq("workspace_id", workspaceId).limit(LIMIT),
      db
        .from("sw_actions")
        .select("id,title,status,due_date,assignee_user_id,asset_id")
        .eq("workspace_id", workspaceId)
        .in("status", ["open", "in_progress", "blocked"])
        .lt("due_date", today)
        .limit(LIMIT),
      db
        .from("sw_sources")
        .select(
          "id,name,source_type,active,poll_target_minutes,last_checked_at,last_success_at,last_failure_at,last_failure",
        )
        .eq("workspace_id", workspaceId)
        .limit(LIMIT),
      assets(caller, workspaceId),
      db
        .from("sw_supplier_request_events")
        .select("request_id,created_at")
        .eq("workspace_id", workspaceId)
        .eq("event", "objection_recorded")
        .limit(LIMIT),
      db
        .from("sw_decisions")
        .select("subject_id,decided_at")
        .eq("workspace_id", workspaceId)
        .eq("subject_kind", "supplier_request")
        .limit(LIMIT),
    ]);
  const category = (id: string | null) => assetRows.find((a) => a.id === id)?.category ?? null;
  const requestRows = all(checked(requests));
  const out: QueueItem[] = [];
  for (const i of all(checked(items)))
    out.push({
      kind: "needs_assessment",
      id: i.id,
      title: i.title,
      to: `/monitoring`,
      due: null,
      owner: null,
      categories: [],
    });
  for (const b of all(checked(briefs)))
    out.push({
      kind: "awaiting_decision",
      id: b.id,
      title: b.title,
      to: `/impact/${b.id}`,
      due: null,
      owner: null,
      categories: [],
    });
  // An objection with no decision recorded after it waits for a decision.
  const decided = all(checked(decisions));
  for (const o of all(checked(objections))) {
    const r = requestRows.find((x) => x.id === o.request_id);
    if (!r || !isOpen(r.status)) continue;
    if (decided.some((d) => d.subject_id === r.id && d.decided_at > o.created_at)) continue;
    if (out.some((x) => x.id === r.id && x.kind === "awaiting_decision")) continue;
    out.push({
      kind: "awaiting_decision",
      id: r.id,
      title: `${r.reference} · ${r.title}`,
      to: `/supplier-requests/${r.id}`,
      due: dueDate(r),
      owner: r.internal_owner_id,
      categories: [category(r.supplier_asset_id)],
    });
  }
  for (const r of requestRows) {
    if (supplierOverdue(r, today))
      out.push({
        kind: "supplier_response_missing",
        id: r.id,
        title: `${r.reference} · ${r.title}`,
        to: `/supplier-requests/${r.id}`,
        due: dueDate(r),
        owner: r.internal_owner_id,
        categories: [category(r.supplier_asset_id)],
      });
    if (r.status === "awaiting_verification" || r.status === "draft" || r.share_stale)
      out.push({
        kind: r.status === "awaiting_verification" ? "needs_verification" : "awaiting_decision",
        id: r.id,
        title: `${r.reference} · ${r.title}`,
        to: `/supplier-requests/${r.id}`,
        due: dueDate(r),
        owner: r.internal_owner_id,
        categories: [category(r.supplier_asset_id)],
      });
  }
  for (const a of all(checked(actions)))
    out.push({
      kind: "overdue_action",
      id: a.id,
      title: a.title,
      to: `/risks`,
      due: a.due_date,
      owner: a.assignee_user_id,
      categories: [category(a.asset_id)],
    });
  const cov = coverage(all(checked(sources)) as never, new Date());
  for (const s of cov.sources.filter((x) => x.state !== "current"))
    out.push({
      kind: "coverage_gap",
      id: s.sourceId,
      title: s.name,
      to: `/impact`,
      due: null,
      owner: null,
      categories: [],
    });
  if (cov.state === "no_connected_source")
    out.push({
      kind: "coverage_gap",
      id: "no-source",
      title: "",
      to: `/impact`,
      due: null,
      owner: null,
      categories: [],
    });
  void membership;
  return { items: sortQueue(out), generatedAt: new Date().toISOString() };
}
